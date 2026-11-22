/**
 * Checks a folder of recipe Markdown files before an import, with the same
 * parser and food matching the app uses. Writes nothing.
 *
 *   npm run validate:recipes -- <folder> [--foods foods.json] [--existing recipes.json] [--updates] [--strict]
 *
 * Foods come from --foods (JSON array of food_items rows) or, without it, from
 * Supabase (needs SUPABASE_SERVICE_ROLE_KEY like import:recipes).
 * --existing is a JSON array of { slug, title } for the duplicate check
 * (loaded from Supabase when a service key is available).
 * Exit code 1 when a recipe has errors (with --strict also on hints).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { parseRecipeMarkdown, slugify } from '../src/lib/recipe/markdown'
import { indexFoods, matchFood, gramsFor, computeMacros, deriveDiet, plainName, baseName, type FoodItemLite } from '../src/lib/recipe/nutrition'

// Same values as migration 006 (lookup tables are read-only for the app)
const COURSES = ['fruehstueck', 'hauptgericht', 'suppe', 'salat', 'beilage', 'snack', 'dessert', 'kuchen', 'gebaeck', 'brot', 'sosse', 'getraenk']
const CUISINES = ['deutsch', 'oesterreichisch', 'schweizerisch', 'italienisch', 'franzoesisch', 'spanisch', 'griechisch', 'orientalisch',
  'tuerkisch', 'indisch', 'thailaendisch', 'vietnamesisch', 'chinesisch', 'japanisch', 'koreanisch', 'mexikanisch', 'lateinamerikanisch', 'amerikanisch', 'international']
const VAGUE = /\b(etwas|nach belieben|n\. ?b\.|nach geschmack|ein paar|einige)\b/i
// Ingredients that need no mention in the steps check
const STEP_CHECK_SKIP = /^(salz|pfeffer)/i
// Preparation words that must also appear in the matched food
const VARIANT = /\b(gekocht|getrocknet|trocken|roh|gerauchert|konserve|tiefgekuhlt|gefroren)\b/g

function loadEnv(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : undefined
}
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    if (name.startsWith('.')) return []
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.(md|markdown)$/i.test(name) ? [p] : []
  })
}
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
/** Word stems of an ingredient name, for the "used in the steps" check. */
function stems(name: string): string[] {
  return norm(plainName(baseName(name))).split(/[\s\-/]+/).filter(w => w.length >= 4).map(w => w.replace(/(en|n|e|s)$/, '').slice(0, 7))
}
function titleWords(t: string): Set<string> {
  return new Set(norm(t).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !['with', 'und', 'nach', 'style', 'frischem', 'frischen'].includes(w)))
}

async function main() {
  loadEnv(join(process.cwd(), '.env.local'))
  loadEnv('/root/.config/vitus/service.env')
  const folder = process.argv[2]
  if (!folder || folder.startsWith('--')) {
    console.error('Nutzung: npm run validate:recipes -- <ordner> [--foods foods.json] [--existing recipes.json] [--strict]')
    process.exit(2)
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null

  let foods: FoodItemLite[]
  const foodsFile = arg('--foods')
  if (foodsFile) foods = JSON.parse(readFileSync(foodsFile, 'utf8'))
  else if (supabase) {
    foods = []
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await supabase.from('food_items').select('*').order('name').range(from, from + 999)
      if (error) throw error
      foods.push(...(data as FoodItemLite[]))
      if (data.length < 1000) break
    }
  } else {
    console.error('Keine Lebensmittel: --foods <datei> angeben oder SUPABASE_SERVICE_ROLE_KEY setzen.')
    process.exit(2)
  }
  const index = indexFoods(foods)

  let existing: { slug: string | null; title: string }[] = []
  const existingFile = arg('--existing')
  if (existingFile) existing = JSON.parse(readFileSync(existingFile, 'utf8'))
  else if (supabase) existing = ((await supabase.from('recipes').select('slug, title')).data ?? []) as typeof existing

  const files = walk(folder).sort()
  const seen = new Map<string, string>()
  const unmatchedAll = new Map<string, string[]>()
  let errorCount = 0
  let hintCount = 0

  for (const file of files) {
    const name = relative(folder, file)
    const { doc, warnings } = parseRecipeMarkdown(readFileSync(file, 'utf8'), name)
    const errors: string[] = [...warnings]
    const hints: string[] = []

    if (!doc.title) errors.push('Titel fehlt')
    if (!doc.servings || doc.servings < 1) errors.push('servings fehlt')
    if (!doc.course || !COURSES.includes(doc.course)) errors.push(`Art unbekannt: ${doc.course}`)
    if (!doc.cuisine || !CUISINES.includes(doc.cuisine)) errors.push(`Küche unbekannt: ${doc.cuisine}`)
    if (doc.prep_time == null || doc.cook_time == null) errors.push('prep_time/cook_time fehlt')
    if (doc.fridge_days == null || doc.freezable == null) errors.push('fridge_days/freezable fehlt')
    if (!doc.description) errors.push('description fehlt')
    if (!doc.extra_frontmatter.source) hints.push('keine Quelle (source)')
    if (doc.steps.length < 3) errors.push(`nur ${doc.steps.length} Schritte`)
    if (doc.ingredients.length < 2) errors.push(`nur ${doc.ingredients.length} Zutaten`)

    const slug = slugify(doc.title)
    if (seen.has(slug)) errors.push(`Slug doppelt mit ${seen.get(slug)}`)
    seen.set(slug, name)
    const ex = existing.find(e => e.slug === slug)
    // with --updates an existing slug is an update of that recipe, not a duplicate
    if (ex && !process.argv.includes('--updates')) errors.push(`existiert schon in Vitus: ${ex.title}`)
    const tw = titleWords(doc.title)
    for (const e of existing) {
      const ew = titleWords(e.title)
      const common = [...tw].filter(w => ew.has(w)).length
      if (e.slug !== slug && common >= 2 && common >= Math.min(tw.size, ew.size) - 1) hints.push(`ähnlich wie bestehendes Rezept: ${e.title}`)
    }

    const stepText = norm(doc.steps.map(s => s.text).join(' '))
    for (const ing of doc.ingredients) {
      if (ing.qty === null) errors.push(`ohne Menge: "${ing.raw}"`)
      if (VAGUE.test(ing.raw)) errors.push(`vage Angabe: "${ing.raw}"`)
      const food = matchFood(ing, index)
      if (!food) {
        hints.push(`nicht in der Lebensmitteldatenbank: "${ing.name}"`)
        unmatchedAll.set(ing.name, [...(unmatchedAll.get(ing.name) ?? []), doc.title])
      } else if (gramsFor(ing, food) === null) hints.push(`Gewicht unbekannt: "${ing.raw}" → ${food.name}`)
      // "Kichererbse, gekocht" can land on "Kichererbse, getrocknet": the matcher only looks at the base name
      if (food) {
        const want = norm(ing.name).match(VARIANT) ?? []
        const have = norm(`${food.name} ${(food.aliases ?? []).join(' ')}`)
        for (const w of want) if (!have.includes(w)) hints.push(`falsche Variante? "${ing.name}" → ${food.name}`)
      }
      if (!STEP_CHECK_SKIP.test(ing.name) && !stems(ing.name).some(s => stepText.includes(s))) hints.push(`nicht in den Schritten: "${ing.name}"`)
    }
    for (const s of doc.steps) if (VAGUE.test(s.text)) hints.push(`vage im Schritt: "${s.text.slice(0, 60)}…"`)

    const m = computeMacros(doc.ingredients, index)
    const sv = Math.max(1, doc.servings)
    const diet = deriveDiet(doc.ingredients, index)
    const status = errors.length ? 'FEHLER ' : hints.length ? 'Hinweis' : 'ok     '
    errorCount += errors.length ? 1 : 0
    hintCount += hints.length ? 1 : 0
    console.log(`${status}  ${name}  | ${doc.course}/${doc.cuisine} | ${Math.round(m.kcal / sv)} kcal, ${Math.round(m.protein / sv)} g P / Portion | ${m.matched}/${m.total} zugeordnet | ${diet.join(',') || '–'}`)
    for (const e of errors) console.log(`           x ${e}`)
    for (const h of hints) console.log(`           ↳ ${h}`)
    if (process.argv.includes('--verbose')) {
      for (const ing of doc.ingredients) {
        const food = matchFood(ing, index)
        const g = gramsFor(ing, food)
        const kcal = food && g != null && food.kcal_100g != null ? Math.round((food.kcal_100g * g) / 100) : null
        console.log(`             · ${ing.raw.padEnd(40)} → ${food ? food.name : '—'}${g != null ? `  ${Math.round(g)} g` : ''}${kcal != null ? `  ${kcal} kcal` : ''}`)
      }
    }
  }

  if (unmatchedAll.size) {
    console.log('\nNicht zugeordnete Zutaten (Kandidaten für neue Lebensmittel):')
    for (const [n, ts] of [...unmatchedAll].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${n}  (${ts.length}×)`)
  }
  console.log(`\n${files.length} Rezepte: ${errorCount} mit Fehlern, ${hintCount} mit Hinweisen`)
  if (errorCount || (process.argv.includes('--strict') && hintCount)) process.exitCode = 1
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
