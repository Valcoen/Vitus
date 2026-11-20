/**
 * Food database access for server code. All foods (≈1,300) are loaded at once
 * and kept for a few minutes: they change rarely and every logged-in user
 * may read all of them, so one shared copy per server process is fine.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { indexFoods, type FoodIndex, type FoodItemLite } from '../recipe/nutrition'

export const FOOD_COLUMNS =
  'id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, category, kategorie, food_category, aliases, ' +
  'sugar_100g, fiber_100g, sat_fat_100g, salt_100g, density, unit_grams, kind, is_vegetarian, is_vegan, is_hidden, source'

const TTL_MS = 10 * 60 * 1000
let cache: { at: number; foods: FoodItemLite[]; index: FoodIndex } | null = null

/** Drop the cached copy (after a food was added or changed). */
export function invalidateFoods() {
  cache = null
}

export async function loadAllFoods(supabase: SupabaseClient): Promise<FoodItemLite[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.foods
  const foods: FoodItemLite[] = []
  // PostgREST returns at most 1,000 rows per request
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.from('food_items').select(FOOD_COLUMNS).order('name').range(from, from + 999)
    if (error) {
      // Before migration 006 the extra columns don't exist: fall back to the basics
      const basic = await supabase.from('food_items').select('id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, category, kategorie')
      return (basic.data ?? []) as FoodItemLite[]
    }
    foods.push(...((data ?? []) as unknown as FoodItemLite[]))
    if (!data || data.length < 1000) break
  }
  cache = { at: Date.now(), foods, index: indexFoods(foods) }
  return foods
}

export async function loadFoodIndex(supabase: SupabaseClient): Promise<FoodIndex> {
  const foods = await loadAllFoods(supabase)
  return cache?.foods === foods ? cache.index : indexFoods(foods)
}

export type Lookup = { slug: string; label: string; sort: number }
export type CourseLookup = Lookup & { plan_slots: string[]; is_treat: boolean }

export type Taxonomy = {
  courses: CourseLookup[]
  cuisines: Lookup[]
  foodCategories: Lookup[]
}

let taxCache: { at: number; tax: Taxonomy } | null = null

/** Recipe courses ("Art"), cuisines and shopping aisles. */
export async function loadTaxonomy(supabase: SupabaseClient): Promise<Taxonomy> {
  if (taxCache && Date.now() - taxCache.at < TTL_MS) return taxCache.tax
  const [c, k, f] = await Promise.all([
    supabase.from('recipe_courses').select('slug, label, sort, plan_slots, is_treat').order('sort'),
    supabase.from('cuisines').select('slug, label, sort').order('sort'),
    supabase.from('food_categories').select('slug, label, sort').order('sort'),
  ])
  const tax = { courses: (c.data ?? []) as CourseLookup[], cuisines: (k.data ?? []) as Lookup[], foodCategories: (f.data ?? []) as Lookup[] }
  if (!c.error) taxCache = { at: Date.now(), tax }
  return tax
}
