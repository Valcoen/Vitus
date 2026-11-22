# Rezepte nachladen

Rezepte liegen als Markdown in `recipes-import/` (ein Ordner pro Bereich, `00-bestand` = die ersten 9 Rezepte).
Format wie ein Obsidian-Rezept: Kopfteil mit `title`, `status: ready`, `servings`, `prep_time`, `cook_time`,
`fridge_days`, `freezable`, `course`, `cuisine`, `description`, `source`, dann `## Zutaten`, `## Zubereitung`, `## Notizen`.

Regeln, damit die Nährwerte stimmen:
- Jede Zutat mit Menge (g, ml, EL, TL, Stück, Zehe, Bund …), Salz und Pfeffer mit Richtwert.
- Zutatennamen so schreiben, wie sie in der Lebensmittelliste (oder als Synonym) stehen:
  `Kichererbsen (Dose)`, `Rote Linsen`, `gehackte Tomaten (Dose)`, `Tofu natur`, `TK-Erbsen` …
- Wasser, das aufgenommen wird (Reis, Suppe), steht in der Zutatenliste; Koch- und Blanchierwasser nicht.
- `course` und `cuisine` nur aus den vorhandenen Werten (Liste in Migration 006/008).

## 1. Prüfen (schreibt nichts)

```bash
cd /root/local-files/Vitus-Nutrition/next-app && npm run validate:recipes -- recipes-import --foods <foods.json> --verbose
```

Ohne `--foods` werden die Lebensmittel aus Supabase geladen (braucht den Service-Key). Das Batch-Skript unten lädt sie selbst.

## 2. Importieren

```bash
cd /root/local-files/Vitus-Nutrition/next-app && scripts/import-recipe-batches.sh recipes-import walterdavid263@gmail.com
```

- macht zuerst ein Backup (`/root/backups/vitus`), prüft alle Dateien, importiert in Batches à 10 und zeigt nach jedem Batch, was angekommen ist
- braucht nur `/root/.config/vitus/db.env` (kein Supabase-Service-Key)
- neue Rezepte werden angelegt, schon importierte aktualisiert – aber nur, wenn sie seitdem nicht in Vitus bearbeitet wurden.
  Sonst: `KONFLIKT`, das Rezept bleibt unverändert. Bewusst überschreiben mit 4. Argument: `… 10 slug-a,slug-b`
- ohne `status: ready` landen Rezepte als Entwurf
