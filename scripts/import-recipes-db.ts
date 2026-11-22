/**
 * Builds the SQL for a recipe import straight into Postgres, for when no
 * Supabase service-role key is at hand (only DATABASE_URL). Uses the same
 * parser, validation, food linking and diet rules as the in-app import, so the
 * rows look exactly like an import through Vitus. Same update rules as the
 * app: a recipe is only updated when it was imported before and not changed
 * in the app since; everything else is a conflict and stays untouched unless
 * its slug is listed in --overwrite.
 *
 *   node .cli-build/scripts/import-recipes-db.js <folder> --meta meta.json --foods foods.json --out import.sql [--overwrite a,b] [--relink]
 *
 * meta.json: { user: [{ id }], courses: [{ slug, plan_slots }], cuisines: [{ slug, label }],
 *              recipes: [{ id, slug, status, updated_at, last_imported_at, import_hash }] }
 * Normally called by scripts/import-recipe-batches.sh, which fetches these files.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { parseRecipeMarkdown } from '../src/lib/recipe/markdown'
import { docToInput } from '../src/lib/recipe/importer'
import { validateRecipe, mealTypeForSlots } from '../src/lib/recipe/validate'
import { indexFoods, matchFood, deriveDiet, type FoodItemLite } from '../src/lib/recipe/nutrition'

function arg(name: string, optional = false): string {
  const i = process.argv.indexOf(name)
  if (optional && i < 0) return ''
  if (i < 0 || !process.argv[i + 1]) {
    console.error(`${name} fehlt`)
    process.exit(2)
  }
  return process.argv[i + 1]
}
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    if (name.startsWith('.')) return []
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.(md|markdown)$/i.test(name) ? [p] : []
  })
}
/** Dollar-quoted literal that can't be broken by the content. */
function lit(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  let tag = 'v'
  while (s.includes(`$${tag}$`)) tag += 'x'
  return `$${tag}$${s}$${tag}$`
}

const folder = process.argv[2]
const meta = JSON.parse(readFileSync(arg('--meta'), 'utf8'))
const foods: FoodItemLite[] = JSON.parse(readFileSync(arg('--foods'), 'utf8'))
const out = arg('--out')
const userId: string | undefined = meta.user?.[0]?.id
if (!userId) {
  console.error('Vitus-Benutzer nicht gefunden')
  process.exit(2)
}
const index = indexFoods(foods)
const tax = { courses: meta.courses, cuisines: meta.cuisines, foodCategories: [] }
type Existing = { id: string; slug: string | null; status: string | null; updated_at: string; last_imported_at: string | null; import_hash: string | null }
const existing = new Map<string, Existing>((meta.recipes ?? []).filter((r: Existing) => r.slug).map((r: Existing) => [r.slug!, r]))
const overwrite = new Set(arg('--overwrite', true).split(',').filter(Boolean))

const statements: string[] = []
let created = 0
let updated = 0
let skipped = 0
let conflicts = 0
let errors = 0
for (const file of walk(folder).sort()) {
  const name = relative(folder, file)
  const text = readFileSync(file, 'utf8')
  const { doc } = parseRecipeMarkdown(text, name)
  const hash = createHash('sha256').update(text, 'utf8').digest('hex')
  const ex = existing.get(doc.slug)
  // --relink: same file, but foods changed – link ingredients and derive the diet again
  if (ex && ex.import_hash === hash && !process.argv.includes('--relink')) {
    console.log(`= unverändert  ${name}`)
    skipped++
    continue
  }
  // same rule as classify() in src/lib/recipe/importer.ts
  const changedInApp = ex && (!ex.last_imported_at || new Date(ex.updated_at).getTime() > new Date(ex.last_imported_at).getTime() + 2000)
  if (ex && changedInApp && !overwrite.has(doc.slug)) {
    console.log(`! KONFLIKT  ${name}  (${ex.last_imported_at ? 'in Vitus geändert' : 'nicht per Import angelegt'} – mit --overwrite ${doc.slug} überschreiben)`)
    conflicts++
    continue
  }
  const v = validateRecipe(docToInput(doc, ex?.status ?? null, tax as never))
  if (!v.ok) {
    console.log(`x FEHLER  ${name}  (${v.errors.join('; ')})`)
    errors++
    continue
  }
  const r = v.recipe
  // same as linkFoodItems() in src/lib/recipe/save.ts
  const ingredients = r.ingredients.map(ing => {
    const f = matchFood({ ...ing, food_item_id: null }, index)
    return f
      ? { ...ing, food_item_id: f.id, category: f.food_category ?? f.category ?? f.kategorie ?? null }
      : { ...ing, food_item_id: null }
  })
  const diet = deriveDiet(ingredients, index)
  const course = meta.courses.find((c: { slug: string }) => c.slug === r.course)
  const mealType = course ? mealTypeForSlots(course.plan_slots) ?? 'none' : r.meal_type
  const row: Record<string, unknown> = {
    course: r.course, cuisine: r.cuisine, diet, title: r.title, description: r.description,
    standard_servings: r.standard_servings, prep_time: r.prep_time, cook_time: r.cook_time,
    kcal_per_serving: r.kcal_per_serving, protein_per_serving: r.protein_per_serving,
    fridge_days: r.fridge_days, freezable: r.freezable, notes: r.notes, meal_type: mealType,
    tags: r.tags, status: r.status, rating: r.rating, ingredients, steps: r.steps,
    extra_sections: r.extra_sections, instructions: r.instructions,
    import_hash: hash, extra_frontmatter: doc.extra_frontmatter,
  }
  if (!ex) Object.assign(row, { created_by: userId, slug: doc.slug })
  const jsonCols = new Set(['ingredients', 'steps', 'extra_sections', 'extra_frontmatter'])
  const arrayCols = new Set(['diet', 'tags'])
  const cols = Object.keys(row)
  const vals = cols.map(c => {
    const val = row[c]
    if (val === null || val === undefined) return 'null'
    if (jsonCols.has(c)) return `${lit(val)}::jsonb`
    if (arrayCols.has(c)) return `${lit(val)}::jsonb`
    if (typeof val === 'number' || typeof val === 'boolean') return String(val)
    return lit(val)
  })
  // text[] columns come in as JSON and are converted in SQL
  const select = cols.map((c, i) => (arrayCols.has(c) ? `array(select jsonb_array_elements_text(${vals[i]}))` : vals[i]))
  const linked = `${ingredients.filter(i => i.food_item_id).length}/${ingredients.length} Zutaten verknüpft`
  if (!ex) {
    statements.push(
      `insert into public.recipes (${cols.join(', ')}, last_imported_at, updated_at)\n` +
      `select ${select.join(', ')}, now(), now()\n` +
      `where not exists (select 1 from public.recipes where slug = ${lit(doc.slug)});`,
    )
    console.log(`+ neu  ${name}  [${r.status}]  ${linked}`)
    created++
  } else {
    // updated_at is checked again, so an edit made in the app meanwhile is never lost
    statements.push(
      `update public.recipes set ${cols.map((c, i) => `${c} = ${select[i]}`).join(', ')}, last_imported_at = now()\n` +
      `where id = ${lit(ex.id)} and updated_at = ${lit(ex.updated_at)}::timestamptz;`,
    )
    console.log(`${overwrite.has(doc.slug) ? '! überschrieben' : '~ update'}  ${name}  [${r.status}]  ${linked}`)
    updated++
  }
}

writeFileSync(out, `begin;\n${statements.join('\n')}\ncommit;\n`)
console.log(`\n${created} neu, ${updated} aktualisiert, ${skipped} unverändert, ${conflicts} Konflikte, ${errors} Fehler → ${out}`)
if (errors) process.exitCode = 1
