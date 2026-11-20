/**
 * Nutrition from ingredients + bridge to the existing planner code.
 *
 * Every ingredient is weighed with what its food knows (piece, spoon and
 * density data from the food database) and matched to a food by its link,
 * name or synonyms. The meal-plan engine, shopping list and macro scaler work
 * on `Record<foodName, grams>`; `toPlannerIngredients()` converts to that.
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
  /** Shopping aisle (food_categories.slug) */
  food_category?: string | null
  /** Search synonyms ("Eier", "Poulet, Brust, roh", …) */
  aliases?: string[] | null
  sugar_100g?: number | null
  fiber_100g?: number | null
  sat_fat_100g?: number | null
  salt_100g?: number | null
  /** g per ml */
  density?: number | null
  /** grams per unit: { "Stück": 150, "EL": 10, "Zehe": 4 } */
  unit_grams?: Record<string, number> | null
  kind?: string | null
  is_vegetarian?: boolean | null
  is_vegan?: boolean | null
  /** duplicate kept for old references, not offered in the picker */
  is_hidden?: boolean | null
  source?: string | null
}

export type Macros = { kcal: number; protein: number; carbs: number; fat: number }

/** Spoon weights when a food doesn't say otherwise (water-like: 15 ml / 5 ml). */
const DEFAULT_UNIT_GRAMS: Record<string, number> = { EL: 15, TL: 5, Msp: 0.5, Prise: 0.5 }
const VOLUME_ML: Record<string, number> = { ml: 1, cl: 10, dl: 100, l: 1000 }

const isEgg = (name: string) => /^(ei|eier|egg|eggs)$/i.test(name.trim())

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
  return baseName(name).replace(/^(große?[nrs]?|kleine?[nrs]?|mittelgroße?[nrs]?|frische?[nrs]?|reife?[nrs]?)\s+/i, '') || name
}

/**
 * Weight in grams of one ingredient line, using what the food knows about
 * itself. Order: real weight → volume × density → a weight written in the
 * line "(ca. 200 g)" → the food's weight per unit / piece → standard spoon
 * weights → eggs (55 g). Null when it can't be estimated.
 */
export function gramsFor(ing: Ingredient, food?: FoodItemLite | null): number | null {
  if (ing.qty === null) return null
  const unit = ing.unit
  if (unit === 'g' || unit === 'kg' || unit === 'mg') return toGrams(ing)
  if (unit && VOLUME_ML[unit]) return ing.qty * VOLUME_ML[unit] * (food?.density ?? 1)
  const hint = weightHint(ing.name)
  if (hint !== null) return hint
  const units = food?.unit_grams ?? {}
  if (unit) {
    if (units[unit]) return ing.qty * units[unit]
    if (unit === 'Stück' && isEgg(plainName(ing.name))) return ing.qty * 55
    if (DEFAULT_UNIT_GRAMS[unit]) {
      const liquid = unit === 'EL' || unit === 'TL' ? food?.density ?? 1 : 1
      return ing.qty * DEFAULT_UNIT_GRAMS[unit] * liquid
    }
    return null
  }
  if (units['Stück']) return ing.qty * units['Stück']
  if (isEgg(plainName(ing.name))) return ing.qty * 55
  return null
}

/**
 * Amount to pass to the legacy planner code. Eggs counted in pieces are
 * passed as a piece count (the legacy "Ei ≤ 20 = pieces" rule); everything
 * else as grams. Returns null when the amount can't be estimated.
 */
export function plannerAmount(ing: Ingredient, food?: FoodItemLite | null): number | null {
  if (ing.qty === null) return null
  if (ing.unit === null && isEgg(ing.name)) return ing.qty
  return gramsFor(ing, food)
}

/** Grams for nutrition maths. */
export function nutritionGrams(ing: Ingredient, food?: FoodItemLite | null): number | null {
  return gramsFor(ing, food)
}

/**
 * Converts stored ingredients to `{ name: amount }` for the planner modules.
 * With a food index, linked ingredients are keyed by the food's name (so the
 * planner finds its nutrition) and weighed with its unit data.
 * Legacy formats are passed through untouched (those modules already handle them).
 */
export function toPlannerIngredients(stored: unknown, foods?: FoodIndex): unknown {
  if (!Array.isArray(stored) || !stored.some(x => x && typeof x === 'object' && 'raw' in x)) return stored
  const map: Record<string, number> = {}
  for (const ing of normalizeIngredients(stored)) {
    const food = foods ? matchFood(ing, foods) : null
    const amount = plannerAmount(ing, food)
    if (amount === null) continue
    const key = food?.name ?? plainName(ing.name)
    map[key] = (map[key] ?? 0) + amount
  }
  return map
}

// ── matching ──────────────────────────────────────────────────────────────

export type FoodIndex = {
  byId: Record<string, FoodItemLite>
  byLowerName: Record<string, FoodItemLite>
  /** normalized name / synonym / base name → best food */
  byKey: Map<string, FoodItemLite>
}

export const normKey = (s: string) =>
  s.toLowerCase().replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim()

const COOKED = /gekocht|gedämpft|gedünstet|gebraten|gebacken|geröstet|zubereitet|konserve|getrocknet|eingelegt|paniert|frittiert|tiefgekühlt|aufgewärmt|gefroren/i

/** Lower is better: visible, plain ingredients, raw, the user's own list, short names. */
function rank(f: FoodItemLite): number {
  let r = 0
  if (f.is_hidden) r += 100
  if (f.kind && f.kind !== 'ingredient') r += 30
  if (COOKED.test(f.name)) r += 10
  if (/\broh\b/.test(f.name)) r -= 3
  if (f.source === 'vitus') r -= 4
  return r + f.name.length / 100
}

export function indexFoods(foods: FoodItemLite[]): FoodIndex {
  const byId: Record<string, FoodItemLite> = {}
  const byLowerName: Record<string, FoodItemLite> = {}
  const byKey = new Map<string, FoodItemLite>()
  const put = (key: string, f: FoodItemLite) => {
    const k = normKey(key)
    if (!k) return
    const cur = byKey.get(k)
    if (!cur || rank(f) < rank(cur)) byKey.set(k, f)
  }
  for (const f of foods) {
    byId[f.id] = f
    byLowerName[f.name.trim().toLowerCase()] = f
    put(f.name, f)
    put(baseName(f.name), f)
    put(plainName(f.name), f)
    for (const a of f.aliases ?? []) {
      put(a, f)
      put(baseName(a), f)
    }
  }
  return { byId, byLowerName, byKey }
}

/** German plural → singular guesses: Zwiebeln → Zwiebel, Tomaten → Tomate, Äpfel stays. */
function singulars(word: string): string[] {
  const out: string[] = []
  if (/en$/.test(word)) out.push(word.slice(0, -1), word.slice(0, -2))
  else if (/n$/.test(word)) out.push(word.slice(0, -1))
  if (/e$/.test(word)) out.push(word.slice(0, -1))
  if (/s$/.test(word)) out.push(word.slice(0, -1))
  return out
}

/** Food for an ingredient: explicit link, exact name, then name / synonym / base name / singular. */
export function matchFood(ing: Ingredient, foods: FoodIndex): FoodItemLite | null {
  if (ing.food_item_id && foods.byId[ing.food_item_id]) return foods.byId[ing.food_item_id]
  const exact = foods.byLowerName[ing.name.trim().toLowerCase()]
  if (exact) return exact
  for (const candidate of [ing.name, baseName(ing.name), plainName(ing.name)]) {
    const f = foods.byKey.get(normKey(candidate))
    if (f) return f
  }
  const plain = normKey(plainName(ing.name))
  for (const s of singulars(plain)) {
    const f = foods.byKey.get(s)
    if (f) return f
  }
  return null
}

export type MacrosDetail = Macros & {
  sugar: number
  fiber: number
  salt: number
  matched: number
  total: number
}

/** Sums nutrition of all ingredients that could be matched and weighed. */
export function computeMacros(ingredients: Ingredient[], foods: FoodIndex): MacrosDetail {
  const m = { kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0, salt: 0, matched: 0, total: ingredients.length }
  for (const ing of ingredients) {
    const food = matchFood(ing, foods)
    const g = food ? gramsFor(ing, food) : null
    if (!food || g === null) continue
    const f = g / 100
    m.kcal += food.kcal_100g * f
    m.protein += food.protein_100g * f
    m.carbs += food.carbs_100g * f
    m.fat += food.fat_100g * f
    m.sugar += (food.sugar_100g ?? 0) * f
    m.fiber += (food.fiber_100g ?? 0) * f
    m.salt += (food.salt_100g ?? 0) * f
    m.matched++
  }
  return m
}

export type Diet = 'vegetarian' | 'vegan'

/**
 * Vegetarian / vegan, only when it's certain: every ingredient with an amount
 * must be matched to a food whose flag is known. Lines without an amount
 * ("Salz, Pfeffer") are ignored unless they match a food that isn't
 * vegetarian / vegan ("Parmesan nach Belieben").
 */
export function deriveDiet(ingredients: Ingredient[], foods: FoodIndex): Diet[] {
  if (ingredients.length === 0) return []
  let vegetarian = true
  let vegan = true
  for (const ing of ingredients) {
    const food = matchFood(ing, foods)
    if (!food) {
      if (ing.qty !== null) return []
      continue
    }
    if (food.is_vegetarian !== true) vegetarian = vegetarian && (ing.qty === null && food.is_vegetarian == null)
    if (food.is_vegan !== true) vegan = vegan && (ing.qty === null && food.is_vegan == null)
  }
  if (!vegetarian) return []
  return vegan ? ['vegetarian', 'vegan'] : ['vegetarian']
}

export type PerServing = {
  kcal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  /** Only from ingredients (null when nothing could be computed) */
  sugar?: number | null
  fiber?: number | null
  salt?: number | null
  /** 'manual' = entered/imported value, 'computed' = from ingredients */
  source: 'manual' | 'computed' | 'none'
  /** How many ingredients were matched to the food database (computed values). */
  matched: number
  total: number
}

const r1 = (n: number) => Math.round(n * 10) / 10

function extras(c: Partial<MacrosDetail>, s: number, ok: boolean) {
  if (!ok || c.sugar === undefined) return {}
  return { sugar: r1((c.sugar ?? 0) / s), fiber: r1((c.fiber ?? 0) / s), salt: Math.round(((c.salt ?? 0) / s) * 100) / 100 }
}

/**
 * Per-serving nutrition. Entered values (kcal_per_serving / protein_per_serving)
 * win, because imported recipes often use ingredient names that aren't in the
 * food database; otherwise the values are computed from ingredients.
 */
export function perServing(
  computed: Macros & { matched: number; total: number } & Partial<MacrosDetail>,
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
      ...extras(computed, s, hasComputed),
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
    ...extras(computed, s, true),
    source: 'computed',
    matched: computed.matched,
    total: computed.total,
  }
}
