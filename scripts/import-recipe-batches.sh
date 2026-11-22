#!/usr/bin/env bash
# Imports a folder of recipe Markdown files into Vitus in batches – with a DB
# backup first, a validation run, and a check after every batch.
# Recipes without `status: ready` land as drafts ("Entwürfe").
# Existing recipes are updated only if they came from an earlier import and
# were not changed in the app since (same rule as the in-app import);
# otherwise they are reported as conflicts and left alone.
#
#   scripts/import-recipe-batches.sh <folder> <vitus-email> [batch-size] [overwrite-slug,…]
#   RELINK=1 scripts/import-recipe-batches.sh …   # after food changes: re-link unchanged files too
#
# Only needs DATABASE_URL in /root/.config/vitus/db.env (same as the backup);
# rows are built with the app's own parser and food matching
# (scripts/import-recipes-db.ts). Stops at the first error.
set -euo pipefail
cd "$(dirname "$0")/.."

FOLDER="$(realpath "${1:?Ordner fehlt}")"
EMAIL="${2:?Vitus-E-Mail fehlt (Rezepte werden diesem Benutzer zugeordnet)}"
SIZE="${3:-10}"
OVERWRITE="${4:-}"
ENV_FILE=/root/.config/vitus/db.env
[ -f "$ENV_FILE" ] || { echo "Datenbankzugang fehlt: $ENV_FILE"; exit 2; }
[[ "$EMAIL" =~ ^[^\'\ ]+@[^\'\ ]+$ ]] || { echo "Ungültige E-Mail"; exit 2; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
psql_run() { # $1 = sql file in $WORK
  docker run --rm -i --env-file "$ENV_FILE" -v "$WORK":/w postgres:17-alpine \
    sh -c "psql \"\$DATABASE_URL\" -X -q -v ON_ERROR_STOP=1 -f /w/$1"
}

echo "== 1. Backup"
scripts/backup-db.sh

echo "== 2. Lebensmittel, Kategorien und vorhandene Rezepte laden"
cat > "$WORK/foods.sql" <<'SQL'
set default_transaction_read_only = on;
\t on
\pset format unaligned
select coalesce(json_agg(f order by name), '[]') from (select id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, category, kategorie,
  food_category, aliases, sugar_100g, fiber_100g, sat_fat_100g, salt_100g, density, unit_grams, kind, is_vegetarian, is_vegan, is_hidden, source
  from food_items) f;
SQL
psql_run foods.sql > "$WORK/foods.json"

meta() {
  cat > "$WORK/meta.sql" <<SQL
set default_transaction_read_only = on;
\t on
\pset format unaligned
select json_build_object(
  'user', (select json_agg(json_build_object('id', id)) from users where lower(email) = lower('$EMAIL')),
  'courses', (select json_agg(json_build_object('slug', slug, 'label', label, 'plan_slots', plan_slots)) from recipe_courses),
  'cuisines', (select json_agg(json_build_object('slug', slug, 'label', label)) from cuisines),
  'recipes', (select coalesce(json_agg(json_build_object('id', id, 'slug', slug, 'title', title, 'status', status,
     'updated_at', updated_at, 'last_imported_at', last_imported_at, 'import_hash', import_hash)), '[]') from recipes));
SQL
  psql_run meta.sql > "$WORK/meta.json"
}
meta
grep -q '"user" : \[' "$WORK/meta.json" || { echo "Kein Vitus-Benutzer mit E-Mail $EMAIL"; exit 2; }

echo "== 3. Prüfen"
rm -rf .cli-build && npx tsc -p tsconfig.cli.json
python3 -c "import json,sys; json.dump(json.load(open(sys.argv[1]))['recipes'], open(sys.argv[2],'w'))" "$WORK/meta.json" "$WORK/existing.json"
# same slug = update of that recipe; similar titles are only reported
node .cli-build/scripts/validate-recipes.js "$FOLDER" --foods "$WORK/foods.json" --existing "$WORK/existing.json" --updates | tail -1

echo "== 4. Import in Batches à $SIZE"
i=0
while IFS= read -r f; do
  b=$(( i / SIZE + 1 )); mkdir -p "$WORK/batch/$b"
  ln -s "$f" "$WORK/batch/$b/$(basename "$f")"
  i=$(( i + 1 ))
done < <(find "$FOLDER" -name '*.md' | sort)

for dir in $(ls "$WORK/batch" | sort -n); do
  echo; echo "--- Batch $dir ($(ls "$WORK/batch/$dir" | wc -l) Dateien)"
  meta   # fresh slug list, so a re-run skips what is already there
  node .cli-build/scripts/import-recipes-db.js "$WORK/batch/$dir" --meta "$WORK/meta.json" --foods "$WORK/foods.json" --out "$WORK/batch-$dir.sql" ${OVERWRITE:+--overwrite "$OVERWRITE"} ${RELINK:+--relink}
  psql_run "batch-$dir.sql"
  cat > "$WORK/check.sql" <<'SQL'
set default_transaction_read_only = on;
select title, status, standard_servings as port, jsonb_array_length(steps) as schritte,
       jsonb_array_length(ingredients) as zutaten,
       (select count(*) from jsonb_array_elements(ingredients) e where e->>'food_item_id' is not null) as verkn,
       course, cuisine, meal_type
from recipes where last_imported_at > now() - interval '2 minutes' order by last_imported_at desc, title;
SQL
  psql_run check.sql
done
echo; echo "Fertig. Rezepte ohne 'status: ready' liegen in Vitus unter Rezepte → Entwürfe."
