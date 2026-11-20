/**
 * Nutrition from ingredients + bridge to the existing planner code.
 *
 * The meal-plan engine, shopping list and macro scaler work on
 * `Record<foodName, grams>`. `toPlannerIngredients()` converts any stored
 * format into that shape, so those modules keep working unchanged.
 */

import { normalizeIngredients, toGrams, type Ingredient } from './ingredients'

export type FoodItemLite = {
  id: string
  name: string
  kcal_100g: number
  protein_100g: number
  carbs_100g: number
  fat_100g: number
  category?: string | null
  kategorie?: string | null
}

export type Macros = { kcal: number; protein: number; carbs: number; fat: number }

/** Rough spoon weights so "2 EL Öl" still counts toward nutrition. */
const SPOON_GRAMS: Record<string, number> = { EL: 15, TL: 5, Msp: 0.5, Prise: 0.5 }

const isEgg = (name: string) => /^(ei|eier|egg|eggs)$/i.test(name.trim())

/**
 * Amount to pass to the legacy planner code. Eggs counted in pieces are
 * passed as a piece count (the legacy "Ei ≤ 20 = pieces" rule); everything
 * else as grams. Returns null when the amount can't be estimated.
 */
export function plannerAmount(ing: Ingredient): number | null {
  if (ing.qty === null) return null
  if (ing.unit === null && isEgg(ing.name)) return ing.qty
  const g = toGrams(ing)
  if (g !== null) return g
  const hint = weightHint(ing.name)
  if (hint !== null) return hint
  if (ing.unit && SPOON_GRAMS[ing.unit]) return ing.qty * SPOON_GRAMS[ing.unit]
  return null
}

/** "große Zwiebel (ca. 200 g)" → 200: a weight written in brackets, for the whole line. */
export function weightHint(name: string): number | null {
  const m = name.match(/\(\s*(?:ca\.?|circa|etwa|~|≈)?\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/i)
  if (!m) return null
  const n = parseFloat(m[1].replace(',', '.'))
  return /^(kg|l)$/i.test(m[2]) ? n * 1000 : n
}

/** Name for food matching: "große Zwiebel (ca. 200 g)" → "große Zwiebel", "Hackfleisch: 600 g Rind…" → "Hackfleisch". */
export function baseName(name: string): string {
  return name.replace(/\([^)]*\)/g, '').split(/[:,]/)[0].trim()
}

/** baseName without size words: "große Zwiebel (ca. 200 g)" → "Zwiebel". */
export function plainName(name: string): string {
  return baseName(name).replace(/^(große?[nrs]?|kleine?[nrs]?|mittelgroße?[nrs]?|frische?[nrs]?)\s+/i, '') || name
}

/** Grams for nutrition maths (eggs ≈ 55 g each). */
export function nutritionGrams(ing: Ingredient): number | null {
  if (ing.qty !== null && ing.unit === null && isEgg(ing.name)) return ing.qty * 55
  const a = plannerAmount(ing)
  return a
}

/**
 * Converts stored ingredients to `{ name: amount }` for the planner modules.
 * Legacy formats are passed through untouched (those modules already handle them).
 */
export function toPlannerIngredients(stored: unknown): unknown {
  if (!Array.isArray(stored) || !stored.some(x => x && typeof x === 'object' && 'raw' in x)) return stored
  const map: Record<string, number> = {}
  for (const ing of normalizeIngredients(stored)) {
    const amount = plannerAmount(ing)
    if (amount === null) continue
    const key = plainName(ing.name)
    map[key] = (map[key] ?? 0) + amount
  }
  return map
}

/** Finds the food item for an ingredient: explicit link first, then case-insensitive name. */
export function matchFood(
  ing: Ingredient,
  byId: Record<string, FoodItemLite>,
  byLowerName: Record<string, FoodItemLite>,
): FoodItemLite | null {
  if (ing.food_item_id && byId[ing.food_item_id]) return byId[ing.food_item_id]
  const exact = byLowerName[ing.name.trim().toLowerCase()]
  if (exact) return exact
  const base = baseName(ing.name).toLowerCase()
  return byLowerName[base] ?? byLowerName[plainName(ing.name).toLowerCase()] ?? null
}

export function indexFoods(foods: FoodItemLite[]) {
  const byId: Record<string, FoodItemLite> = {}
  const byLowerName: Record<string, FoodItemLite> = {}
  for (const f of foods) {
    byId[f.id] = f
    byLowerName[f.name.trim().toLowerCase()] = f
  }
  return { byId, byLowerName }
}

/** Sums macros of all ingredients that could be matched and weighed. */
export function computeMacros(
  ingredients: Ingredient[],
  foods: ReturnType<typeof indexFoods>,
): Macros & { matched: number; total: number } {
  const m = { kcal: 0, protein: 0, carbs: 0, fat: 0, matched: 0, total: ingredients.length }
  for (const ing of ingredients) {
    const food = matchFood(ing, foods.byId, foods.byLowerName)
    const g = nutritionGrams(ing)
    if (!food || g === null) continue
    const f = g / 100
    m.kcal += food.kcal_100g * f
    m.protein += food.protein_100g * f
    m.carbs += food.carbs_100g * f
    m.fat += food.fat_100g * f
    m.matched++
  }
  return m
}

export type PerServing = {
  kcal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  /** 'manual' = entered/imported value, 'computed' = from ingredients */
  source: 'manual' | 'computed' | 'none'
  /** How many ingredients were matched to the food database (computed values). */
  matched: number
  total: number
}

const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * Per-serving nutrition. Entered values (kcal_per_serving / protein_per_serving)
 * win, because imported recipes often use ingredient names that aren't in the
 * food database; otherwise the values are computed from ingredients.
 */
export function perServing(
  computed: ReturnType<typeof computeMacros>,
  servings: number,
  manual: { kcal: number | null; protein: number | null },
): PerServing {
  const s = Math.max(1, servings || 1)
  const hasComputed = computed.matched > 0 && computed.kcal > 0
  if (manual.kcal != null || manual.protein != null) {
    return {
      kcal: manual.kcal != null ? Math.round(manual.kcal) : hasComputed ? Math.round(computed.kcal / s) : null,
      protein: manual.protein != null ? r1(manual.protein) : hasComputed ? r1(computed.protein / s) : null,
      carbs: hasComputed ? r1(computed.carbs / s) : null,
      fat: hasComputed ? r1(computed.fat / s) : null,
      source: 'manual',
      matched: computed.matched,
      total: computed.total,
    }
  }
  if (!hasComputed) {
    return { kcal: null, protein: null, carbs: null, fat: null, source: 'none', matched: computed.matched, total: computed.total }
  }
  return {
    kcal: Math.round(computed.kcal / s),
    protein: r1(computed.protein / s),
    carbs: r1(computed.carbs / s),
    fat: r1(computed.fat / s),
    source: 'computed',
    matched: computed.matched,
    total: computed.total,
  }
}
