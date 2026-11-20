import type { SupabaseClient } from '@supabase/supabase-js'
import type { CleanRecipe } from './validate'
import type { Ingredient } from './ingredients'
import { slugify } from './markdown'
import { matchFood, deriveDiet } from './nutrition'
import { mealTypeForSlots } from './validate'
import { loadFoodIndex, loadTaxonomy } from '../food/server'

/** Returns `base`, or `base-2`, `base-3`… if taken by another recipe. */
export async function uniqueSlug(supabase: SupabaseClient, title: string, excludeId?: string): Promise<string> {
  const base = slugify(title)
  const { data } = await supabase.from('recipes').select('id, slug').like('slug', `${base}%`)
  const taken = new Set((data ?? []).filter(r => r.id !== excludeId).map(r => r.slug))
  if (!taken.has(base)) return base
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
  return `${base}-${Date.now()}`
}

/**
 * Links ingredients to food items: a food picked in the editor stays linked,
 * the rest is matched by name / synonym. Also returns the derived diet.
 */
export async function linkFoodItems(supabase: SupabaseClient, ingredients: Ingredient[]): Promise<{ ingredients: Ingredient[]; diet: string[] }> {
  const index = await loadFoodIndex(supabase)
  const linked = ingredients.map(ing => {
    const picked = ing.food_item_id ? index.byId[ing.food_item_id] : null
    const f = picked ?? matchFood({ ...ing, food_item_id: null }, index)
    return f
      ? { ...ing, food_item_id: f.id, category: f.food_category ?? f.category ?? f.kategorie ?? null }
      : { ...ing, food_item_id: null }
  })
  return { ingredients: linked, diet: deriveDiet(linked, index) }
}

function toRow(r: CleanRecipe, ingredients: Ingredient[], diet: string[], mealType: string | null) {
  return {
    course: r.course,
    cuisine: r.cuisine,
    diet,
    title: r.title,
    description: r.description,
    standard_servings: r.standard_servings,
    prep_time: r.prep_time,
    cook_time: r.cook_time,
    kcal_per_serving: r.kcal_per_serving,
    protein_per_serving: r.protein_per_serving,
    fridge_days: r.fridge_days,
    freezable: r.freezable,
    notes: r.notes,
    meal_type: mealType ?? r.meal_type,
    tags: r.tags,
    status: r.status,
    rating: r.rating,
    ingredients,
    steps: r.steps,
    extra_sections: r.extra_sections,
    instructions: r.instructions,
  }
}

/** meal_type for the week planner, from the course ("Kuchen & Torten" → snack). */
async function courseMealType(supabase: SupabaseClient, course: string | null): Promise<string | null> {
  if (!course) return null
  const tax = await loadTaxonomy(supabase)
  const c = tax.courses.find(x => x.slug === course)
  return c ? mealTypeForSlots(c.plan_slots) ?? 'none' : null
}

export type SaveResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; errors: string[]; conflict?: boolean }

export async function insertRecipe(
  supabase: SupabaseClient,
  r: CleanRecipe,
  createdBy: string,
  extra: Record<string, unknown> = {},
): Promise<SaveResult> {
  const slug = typeof extra.slug === 'string' ? extra.slug : await uniqueSlug(supabase, r.title)
  const { ingredients, diet } = await linkFoodItems(supabase, r.ingredients)
  const mealType = await courseMealType(supabase, r.course)
  const { data, error } = await supabase
    .from('recipes')
    .insert({ ...toRow(r, ingredients, diet, mealType), created_by: createdBy, ...extra, slug })
    .select('id, slug')
    .single()
  if (error || !data) return { ok: false, errors: [`Speichern fehlgeschlagen: ${error?.message ?? 'unbekannt'}`] }
  return { ok: true, id: data.id, slug: data.slug }
}

/**
 * Updates a recipe. If `expectedUpdatedAt` is given and someone else saved
 * in the meantime, nothing is written and `conflict: true` is returned.
 */
export async function updateRecipe(
  supabase: SupabaseClient,
  id: string,
  r: CleanRecipe,
  expectedUpdatedAt: string | null,
  extra: Record<string, unknown> = {},
): Promise<SaveResult> {
  const { ingredients, diet } = await linkFoodItems(supabase, r.ingredients)
  const mealType = await courseMealType(supabase, r.course)
  let q = supabase.from('recipes').update({ ...toRow(r, ingredients, diet, mealType), ...extra }).eq('id', id)
  if (expectedUpdatedAt) q = q.eq('updated_at', expectedUpdatedAt)
  const { data, error } = await q.select('id, slug')
  if (error) return { ok: false, errors: [`Speichern fehlgeschlagen: ${error.message}`] }
  if (!data || data.length === 0) {
    const { data: exists } = await supabase.from('recipes').select('id').eq('id', id).maybeSingle()
    if (!exists) return { ok: false, errors: ['Rezept nicht gefunden'] }
    return {
      ok: false,
      conflict: true,
      errors: ['Jemand anderes hat dieses Rezept inzwischen geändert. Lade die Seite neu, um die aktuelle Fassung zu sehen (deine Eingaben bitte vorher kopieren).'],
    }
  }
  let slug = data[0].slug as string | null
  if (!slug) {
    slug = await uniqueSlug(supabase, r.title, id)
    await supabase.from('recipes').update({ slug }).eq('id', id)
  }
  return { ok: true, id, slug }
}
