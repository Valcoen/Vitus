import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeIngredients } from './ingredients'
import { computeMacros, indexFoods, perServing, matchFood, type FoodItemLite } from './nutrition'
import type { RecipeStep } from './markdown'
import type { RecipeView } from './types'
import { smallVariant } from '../images'

import { RECIPE_IMAGE_BUCKET } from '../imageStore'
export { RECIPE_IMAGE_BUCKET }

export function publicImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  // Absolute URLs (e.g. from an import) are used as-is
  if (/^https?:\/\//.test(path)) return path
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${RECIPE_IMAGE_BUCKET}/${path}`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Row = Record<string, any>

async function loadFoods(supabase: SupabaseClient, rows: Row[]) {
  // Collect names and ids referenced by any format
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const r of rows) {
    const s = r.ingredients
    if (Array.isArray(s)) {
      for (const i of s) {
        if (i?.food_item_id) ids.add(i.food_item_id)
        if (typeof i?.name === 'string') names.add(i.name)
      }
    } else if (s && typeof s === 'object') {
      Object.keys(s).forEach(n => names.add(n))
    }
  }
  const foods: FoodItemLite[] = []
  const cols = 'id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, category, kategorie'
  if (ids.size) {
    const { data } = await supabase.from('food_items').select(cols).in('id', [...ids])
    foods.push(...(data ?? []))
  }
  if (names.size) {
    // Case-insensitive matching happens in JS; fetch all food items (small table)
    const { data } = await supabase.from('food_items').select(cols)
    foods.push(...(data ?? []))
  }
  return indexFoods(foods)
}

function toView(r: Row, foods: ReturnType<typeof indexFoods>, creatorName: string | null): RecipeView {
  const foodNameById = Object.fromEntries(Object.values(foods.byId).map(f => [f.id, f.name]))
  const ingredients = normalizeIngredients(r.ingredients, foodNameById).map(ing => {
    const food = matchFood(ing, foods.byId, foods.byLowerName)
    return {
      ...ing,
      food_item_id: ing.food_item_id ?? food?.id ?? null,
      category: ing.category ?? food?.category ?? food?.kategorie ?? null,
      kcal100: food?.kcal_100g ?? null,
    }
  })
  const servings = r.standard_servings || 1
  const computed = computeMacros(ingredients, foods)
  const steps: RecipeStep[] = Array.isArray(r.steps)
    ? r.steps.filter((s: any) => s && typeof s.text === 'string')
    : (r.instructions ?? '').split(/\n\s*\n/).map((t: string) => t.trim()).filter(Boolean)
        .map((t: string) => ({ text: t.replace(/^\d+[.)]\s*/, '') }))
  const prep = r.prep_time ?? null
  const cook = r.cook_time ?? null
  return {
    id: r.id,
    slug: r.slug ?? null,
    status: r.status === 'draft' ? 'draft' : 'ready',
    rating: typeof r.rating === 'number' ? r.rating : null,
    title: r.title,
    description: r.description ?? null,
    imagePath: r.image_path ?? null,
    imageUrl: publicImageUrl(r.image_path),
    imageSmallUrl: publicImageUrl(r.image_path && /^[0-9a-f-]{36}\/\d+\.webp$/.test(r.image_path) ? smallVariant(r.image_path) : r.image_path),
    servings,
    prepTime: prep,
    cookTime: cook,
    totalTime: prep != null || cook != null ? (prep ?? 0) + (cook ?? 0) : null,
    tags: Array.isArray(r.tags) ? r.tags : [],
    mealType: r.meal_type ?? null,
    ingredients,
    steps,
    notes: r.notes ?? null,
    fridgeDays: r.fridge_days ?? null,
    freezable: r.freezable ?? null,
    nutrition: perServing(computed, servings, {
      kcal: r.kcal_per_serving != null ? Number(r.kcal_per_serving) : null,
      protein: r.protein_per_serving != null ? Number(r.protein_per_serving) : null,
    }),
    manualKcal: r.kcal_per_serving != null ? Number(r.kcal_per_serving) : null,
    manualProtein: r.protein_per_serving != null ? Number(r.protein_per_serving) : null,
    createdBy: r.created_by ?? null,
    creatorName,
    updatedAt: r.updated_at ?? null,
    lastImportedAt: r.last_imported_at ?? null,
    extraFrontmatter: r.extra_frontmatter ?? {},
    extraSections: Array.isArray(r.extra_sections) ? r.extra_sections : [],
    createdAt: r.created_at ?? null,
  }
}

async function creatorNames(supabase: SupabaseClient, rows: Row[]) {
  const ids = [...new Set(rows.map(r => r.created_by).filter(Boolean))]
  if (!ids.length) return {} as Record<string, string>
  const { data } = await supabase.from('users').select('id, name').in('id', ids)
  return Object.fromEntries((data ?? []).map(u => [u.id, u.name])) as Record<string, string>
}

/** Loads one recipe by id or slug. Returns null if not found / not visible. */
export async function loadRecipe(supabase: SupabaseClient, idOrSlug: string): Promise<RecipeView | null> {
  const q = supabase.from('recipes').select('*')
  const { data } = UUID_RE.test(idOrSlug)
    ? await q.eq('id', idOrSlug).maybeSingle()
    : await q.eq('slug', idOrSlug).maybeSingle()
  if (!data) return null
  const [foods, names] = await Promise.all([loadFoods(supabase, [data]), creatorNames(supabase, [data])])
  return toView(data, foods, names[data.created_by] ?? null)
}

export async function loadRecipes(supabase: SupabaseClient): Promise<RecipeView[]> {
  const { data } = await supabase.from('recipes').select('*').order('title')
  const rows = data ?? []
  const [foods, names] = await Promise.all([loadFoods(supabase, rows), creatorNames(supabase, rows)])
  return rows.map(r => toView(r, foods, names[r.created_by] ?? null))
}

/** Food item names for autocomplete in the editor. */
export async function loadFoodNames(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from('food_items').select('name').order('name')
  return (data ?? []).map(f => f.name)
}
