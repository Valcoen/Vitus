/**
 * Validation + cleanup for recipe input from the editor (and the importer).
 * All text is rendered by React (escaped), never as HTML; here we only
 * bound sizes, strip control characters and normalize values.
 */

import { parseIngredientLine, type Ingredient } from './ingredients'
import type { RecipeStep } from './markdown'

export type RecipeInput = {
  title: string
  description?: string | null
  servings: number | string
  prep_time?: number | string | null
  cook_time?: number | string | null
  kcal_per_serving?: number | string | null
  protein_per_serving?: number | string | null
  fridge_days?: number | string | null
  freezable?: boolean | null
  notes?: string | null
  meal_type?: string | null
  tags?: string[] | string
  /** 'ready' = published; anything else is a draft */
  status?: string | null
  /** 0–10 */
  rating?: number | string | null
  /** recipe_courses.slug / cuisines.slug */
  course?: string | null
  cuisine?: string | null
  /** One ingredient per line; "### Gruppe" starts a group, a trailing " *" is a footnote mark */
  ingredientLines: string[]
  /** Food picked from the database for each line (same index as ingredientLines) */
  ingredientFoodIds?: (string | null)[]
  steps: { text: string; timer_minutes?: number | string | null; section?: string | null }[]
  /** Free sections like "Regeln" */
  sections?: { heading: string; body: string }[]
}

export type CleanRecipe = {
  title: string
  description: string | null
  standard_servings: number
  prep_time: number | null
  cook_time: number | null
  kcal_per_serving: number | null
  protein_per_serving: number | null
  fridge_days: number | null
  freezable: boolean | null
  notes: string | null
  meal_type: string | null
  tags: string[]
  status: 'draft' | 'ready'
  rating: number | null
  course: string | null
  cuisine: string | null
  ingredients: Ingredient[]
  steps: RecipeStep[]
  extra_sections: { heading: string; body: string }[]
  /** Legacy column kept in sync so older code and rollbacks still work */
  instructions: string | null
}

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const slugOrNull = (v: unknown) => (typeof v === 'string' && /^[a-z0-9-]{2,40}$/.test(v) ? v : null)

/**
 * Legacy `meal_type` (used by the week planner) from the course's planner
 * slots: breakfast → breakfast, lunch/dinner → lunch (the planner treats
 * lunch and dinner as interchangeable), snack → snack.
 */
export function mealTypeForSlots(slots: string[] | null | undefined): string | null {
  if (!slots?.length) return null
  if (slots.includes('lunch') || slots.includes('dinner')) return 'lunch'
  return slots[0]
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

export function cleanText(v: unknown, max: number, multiline = false): string {
  let s = typeof v === 'string' ? v : v == null ? '' : String(v)
  s = s.replace(CONTROL, '').replace(/\r\n?/g, '\n')
  if (!multiline) s = s.replace(/\s+/g, ' ')
  return s.trim().slice(0, max)
}

function num(v: unknown, field: string, min: number, max: number, errors: string[], integer = true): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n)) {
    errors.push(`${field}: keine gültige Zahl`)
    return null
  }
  if (n < min || n > max) {
    errors.push(`${field}: muss zwischen ${min} und ${max} liegen`)
    return null
  }
  return integer ? Math.round(n) : Math.round(n * 10) / 10
}

export function normalizeTag(t: string): string {
  return cleanText(t, 40).toLowerCase().replace(/^#/, '').replace(/\s+/g, '-').replace(/[^a-z0-9äöüß\-]/g, '')
}

export function validateRecipe(input: RecipeInput): { ok: true; recipe: CleanRecipe } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const title = cleanText(input.title, 200)
  if (!title) errors.push('Titel fehlt')

  const servings = num(input.servings, 'Portionen', 1, 50, errors) ?? 1

  const rawTags = Array.isArray(input.tags) ? input.tags : String(input.tags ?? '').split(/[,\n]/)
  const tags = [...new Set(rawTags.map(normalizeTag).filter(Boolean))].slice(0, 20)

  const foodIds = input.ingredientFoodIds ?? []
  const lines = (input.ingredientLines ?? [])
    .map((l, i) => ({ text: cleanText(l, 300), foodId: typeof foodIds[i] === 'string' && UUID.test(foodIds[i]!) ? foodIds[i] : null }))
    .filter(l => l.text)
  if (lines.length > 100) errors.push('Maximal 100 Zutaten')
  const ingredients: Ingredient[] = []
  let group: string | null = null
  for (const { text: line, foodId } of lines.slice(0, 100)) {
    const heading = line.match(/^#{1,6}\s*(.+)$/)
    if (heading) {
      group = heading[1].trim().slice(0, 80)
      continue
    }
    const mark = line.match(/\s+(\*+)$/)
    const ing = parseIngredientLine(mark ? line.slice(0, mark.index) : line, group)
    if (mark) ing.mark = mark[1]
    if (foodId) ing.food_item_id = foodId
    ingredients.push(ing)
  }

  const steps: RecipeStep[] = []
  for (const s of (input.steps ?? []).slice(0, 60)) {
    const text = cleanText(s.text, 4000, true)
    if (!text) continue
    const minutes = num(s.timer_minutes, 'Timer', 0, 1440, errors, false)
    const section = cleanText(s.section, 120) || null
    steps.push({ text, timer_seconds: minutes ? Math.round(minutes * 60) : null, ...(section ? { section } : {}) })
  }
  if ((input.steps ?? []).length > 60) errors.push('Maximal 60 Schritte')

  const mealType = input.meal_type && (MEAL_TYPES as readonly string[]).includes(input.meal_type) ? input.meal_type : null

  const recipe: CleanRecipe = {
    title,
    description: cleanText(input.description, 2000, true) || null,
    standard_servings: servings,
    prep_time: num(input.prep_time, 'Vorbereitungszeit', 0, 1440, errors),
    cook_time: num(input.cook_time, 'Kochzeit', 0, 1440, errors),
    kcal_per_serving: num(input.kcal_per_serving, 'kcal pro Portion', 0, 5000, errors),
    protein_per_serving: num(input.protein_per_serving, 'Protein pro Portion', 0, 500, errors, false),
    fridge_days: num(input.fridge_days, 'Tage im Kühlschrank', 0, 60, errors),
    freezable: typeof input.freezable === 'boolean' ? input.freezable : null,
    notes: cleanText(input.notes, 4000, true) || null,
    meal_type: mealType,
    tags,
    status: input.status === 'ready' ? 'ready' : 'draft',
    course: slugOrNull(input.course),
    cuisine: slugOrNull(input.cuisine),
    rating: num(input.rating, 'Bewertung', 0, 10, errors),
    ingredients,
    steps,
    extra_sections: (input.sections ?? []).slice(0, 20)
      .map(x => ({ heading: cleanText(x?.heading, 120), body: cleanText(x?.body, 8000, true) }))
      .filter(x => x.heading || x.body)
      .map(x => ({ heading: x.heading || 'Notizen', body: x.body })),
    instructions: steps.length ? steps.map((s, i) => `${i + 1}. ${s.text}`).join('\n\n') : null,
  }
  return errors.length ? { ok: false, errors } : { ok: true, recipe }
}

/** Ingredient → editor line (inverse of the parsing above). */
export function ingredientsToLines(ingredients: Ingredient[]): string[] {
  const out: string[] = []
  let group: string | null = null
  for (const ing of ingredients) {
    if ((ing.group ?? null) !== group) {
      group = ing.group ?? null
      if (group) out.push(`### ${group}`)
    }
    out.push(ing.mark ? `${ing.raw} ${ing.mark}` : ing.raw)
  }
  return out
}
