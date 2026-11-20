/**
 * Obsidian recipe Markdown ⇄ RecipeDoc.
 *
 * Format (kcal and protein are per serving):
 *   ---
 *   title: Chili sin Carne
 *   status: ready            # drafts are skipped on import
 *   servings: 4
 *   prep_time: 15
 *   cook_time: 40
 *   kcal: 520
 *   protein: 28
 *   fridge_days: 4
 *   freezable: true
 *   tags: [mealprep, high-protein]
 *   ---
 *   ## Ingredients
 *   - 400 g kidney beans
 *   ## Steps
 *   1. Chop onion and garlic.
 *   ## Notes
 *   Reheat covered, add a splash of water.
 *
 * Unknown front-matter keys and unknown "## Sections" are preserved so a
 * round trip through Vitus doesn't strip anything from the Obsidian note.
 */

import { parseIngredientLine, ingredientToMarkdownLine, type Ingredient } from './ingredients'
import { splitFrontmatter, parseFrontmatter, stringifyFrontmatter, type Frontmatter, type FrontmatterValue } from './frontmatter'

export type RecipeStep = { text: string; timer_seconds?: number | null }

export type RecipeDoc = {
  slug: string
  title: string
  status: string | null
  description: string | null
  image: string | null
  servings: number
  prep_time: number | null
  cook_time: number | null
  kcal: number | null
  protein: number | null
  fridge_days: number | null
  freezable: boolean | null
  tags: string[]
  created: string | null
  ingredients: Ingredient[]
  steps: RecipeStep[]
  notes: string | null
  /** Unknown front-matter keys, preserved for export (e.g. Obsidian `categories`). */
  extra_frontmatter: Frontmatter
  /** Unknown "## Heading" sections, preserved for export. */
  extra_sections: { heading: string; body: string }[]
}

export type ParseResult = {
  doc: RecipeDoc
  warnings: string[]
  /** True only for `status: ready`. Everything else is skipped on import. */
  ready: boolean
}

const KNOWN_KEYS = new Set([
  'slug', 'title', 'status', 'image', 'servings', 'prep_time', 'cook_time',
  'kcal', 'protein', 'fridge_days', 'freezable', 'tags', 'created', 'description',
])

const SECTION_ALIASES: Record<string, 'ingredients' | 'steps' | 'notes'> = {
  ingredients: 'ingredients', zutaten: 'ingredients',
  steps: 'steps', zubereitung: 'steps', schritte: 'steps', instructions: 'steps',
  anleitung: 'steps', method: 'steps', directions: 'steps',
  notes: 'notes', notizen: 'notes', hinweise: 'notes', tipps: 'notes', tips: 'notes',
}

/** "Chili sin Carne!" → "chili-sin-carne"; German umlauts are transliterated. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\.md$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'rezept'
}

function toNumber(v: FrontmatterValue | undefined, key: string, warnings: string[]): number | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const m = v.replace(',', '.').match(/-?\d+(\.\d+)?/)
    if (m) {
      warnings.push(`"${key}: ${v}" read as ${m[0]}`)
      return Number(m[0])
    }
  }
  warnings.push(`"${key}" is not a number and was ignored`)
  return null
}

function toStringList(v: FrontmatterValue | undefined): string[] {
  if (v === undefined || v === null) return []
  const arr = Array.isArray(v) ? v : String(v).split(',')
  return arr.map(x => String(x ?? '').trim().replace(/^#/, '')).filter(Boolean)
}

function parseIngredientsSection(body: string, warnings: string[]): Ingredient[] {
  const out: Ingredient[] = []
  let group: string | null = null
  for (const line of body.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const heading = t.match(/^#{3,6}\s+(.*)$/)
    if (heading) {
      group = heading[1].trim()
      continue
    }
    const ing = parseIngredientLine(t, group)
    if (ing.qty === null) warnings.push(`Ingredient kept as text (no amount recognized): "${ing.raw}"`)
    out.push(ing)
  }
  return out
}

function parseStepsSection(body: string): RecipeStep[] {
  const lines = body.split('\n')
  const itemRe = /^\s*(?:\d+[.)]|[-*+])\s+(.*)$/
  const hasList = lines.some(l => itemRe.test(l))
  const steps: string[] = []
  if (hasList) {
    for (const line of lines) {
      const m = line.match(itemRe)
      if (m) steps.push(m[1].trim())
      else if (line.trim() && steps.length > 0) steps[steps.length - 1] += '\n' + line.trim()
      else if (line.trim()) steps.push(line.trim())
    }
  } else {
    for (const para of body.split(/\n\s*\n/)) if (para.trim()) steps.push(para.trim())
  }
  return steps.map(text => ({ text }))
}

export function parseRecipeMarkdown(text: string, filename?: string): ParseResult {
  const warnings: string[] = []
  const { yaml, body } = splitFrontmatter(text)
  let fm: Frontmatter = {}
  if (yaml === null) {
    warnings.push('No front matter found (needs a --- block with status: ready)')
  } else {
    const parsed = parseFrontmatter(yaml)
    fm = parsed.data
    warnings.push(...parsed.warnings)
  }

  // Sections
  let intro = ''
  const sections: { heading: string; body: string }[] = []
  let current: { heading: string; body: string } | null = null
  for (const line of body.split('\n')) {
    const h = line.match(/^##\s+(.*?)\s*#*\s*$/)
    if (h && !line.startsWith('###')) {
      current = { heading: h[1], body: '' }
      sections.push(current)
    } else if (current) {
      current.body += line + '\n'
    } else {
      intro += line + '\n'
    }
  }

  let ingredients: Ingredient[] = []
  let steps: RecipeStep[] = []
  let notes: string | null = null
  const extraSections: { heading: string; body: string }[] = []
  for (const s of sections) {
    const kind = SECTION_ALIASES[s.heading.toLowerCase().replace(/[^a-zäöü]/g, '')]
    if (kind === 'ingredients') ingredients = ingredients.concat(parseIngredientsSection(s.body, warnings))
    else if (kind === 'steps') steps = steps.concat(parseStepsSection(s.body))
    else if (kind === 'notes') notes = [notes, s.body.trim()].filter(Boolean).join('\n\n') || null
    else extraSections.push({ heading: s.heading, body: s.body.trim() })
  }

  // Title: front matter → first "# H1" in intro → filename
  const h1 = intro.match(/^#\s+(.+)$/m)
  const fileBase = filename?.replace(/^.*[\\/]/, '').replace(/\.md$/i, '')
  const title = (typeof fm.title === 'string' && fm.title.trim()) || h1?.[1].trim() || fileBase || 'Unbenanntes Rezept'
  if (!fm.title) warnings.push(`No title in front matter, using "${title}"`)
  const description = intro.replace(/^#\s+.+$/m, '').trim() || (typeof fm.description === 'string' ? fm.description : null)

  const slugSource = (typeof fm.slug === 'string' && fm.slug) || fileBase || title
  const servingsRaw = toNumber(fm.servings, 'servings', warnings)
  let servings = servingsRaw && servingsRaw > 0 ? Math.round(servingsRaw) : 1
  if (!servingsRaw) warnings.push('No servings given, assuming 1')
  if (servings > 50) {
    warnings.push(`servings ${servings} looks wrong, capped at 50`)
    servings = 50
  }

  if (ingredients.length === 0) warnings.push('No ingredients found (expects a "## Ingredients" section)')
  if (steps.length === 0) warnings.push('No steps found (expects a "## Steps" section)')

  const status = fm.status == null ? null : String(fm.status).trim().toLowerCase()
  const extra: Frontmatter = {}
  for (const [k, v] of Object.entries(fm)) if (!KNOWN_KEYS.has(k)) extra[k] = v

  const doc: RecipeDoc = {
    slug: slugify(slugSource),
    title,
    status,
    description,
    image: typeof fm.image === 'string' ? fm.image : null,
    servings,
    prep_time: toNumber(fm.prep_time, 'prep_time', warnings),
    cook_time: toNumber(fm.cook_time, 'cook_time', warnings),
    kcal: toNumber(fm.kcal, 'kcal', warnings),
    protein: toNumber(fm.protein, 'protein', warnings),
    fridge_days: toNumber(fm.fridge_days, 'fridge_days', warnings),
    freezable: typeof fm.freezable === 'boolean' ? fm.freezable : null,
    tags: toStringList(fm.tags),
    created: fm.created == null ? null : String(fm.created),
    ingredients,
    steps,
    notes,
    extra_frontmatter: extra,
    extra_sections: extraSections,
  }
  return { doc, warnings, ready: status === 'ready' }
}

/** Serializes a recipe back to the Obsidian format. Always writes `status: ready`. */
export function recipeToMarkdown(doc: RecipeDoc): string {
  const { categories, ...otherExtra } = doc.extra_frontmatter
  const entries: [string, FrontmatterValue | undefined][] = [
    ['categories', categories ?? ['[[Recipes]]']],
    ['title', doc.title],
    ['slug', doc.slug],
    ['status', 'ready'],
    ['image', doc.image ?? undefined],
    ['servings', doc.servings],
    ['prep_time', doc.prep_time ?? undefined],
    ['cook_time', doc.cook_time ?? undefined],
    ['kcal', doc.kcal ?? undefined],
    ['protein', doc.protein ?? undefined],
    ['fridge_days', doc.fridge_days ?? undefined],
    ['freezable', doc.freezable ?? undefined],
    ['tags', doc.tags],
    ['created', doc.created ?? undefined],
    ...Object.entries(otherExtra),
  ]

  const parts: string[] = [stringifyFrontmatter(entries)]
  if (doc.description) parts.push(doc.description)

  const ingLines: string[] = []
  let group: string | null = null
  for (const ing of doc.ingredients) {
    if ((ing.group ?? null) !== group) {
      group = ing.group ?? null
      if (group) ingLines.push(`### ${group}`)
    }
    ingLines.push(`- ${ingredientToMarkdownLine(ing)}`)
  }
  parts.push(['## Ingredients', ...ingLines].join('\n'))
  parts.push(['## Steps', ...doc.steps.map((s, i) => `${i + 1}. ${s.text.replace(/\n/g, '\n   ')}`)].join('\n'))
  if (doc.notes) parts.push(`## Notes\n${doc.notes}`)
  for (const s of doc.extra_sections) parts.push(`## ${s.heading}\n${s.body}`)
  return parts.join('\n') + '\n'
}
