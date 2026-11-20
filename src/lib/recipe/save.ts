import type { SupabaseClient } from '@supabase/supabase-js'
import type { CleanRecipe } from './validate'
import type { Ingredient } from './ingredients'
import { slugify } from './markdown'

/** Returns `base`, or `base-2`, `base-3`… if taken by another recipe. */
export async function uniqueSlug(supabase: SupabaseClient, title: string, excludeId?: string): Promise<string> {
  const base = slugify(title)
  const { data } = await supabase.from('recipes').select('id, slug').like('slug', `${base}%`)
  const taken = new Set((data ?? []).filter(r => r.id !== excludeId).map(r => r.slug))
  if (!taken.has(base)) return base
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
  return `${base}-${Date.now()}`
}

/** Links ingredients to food_items by case-insensitive name (for nutrition + shopping categories). */
export async function linkFoodItems(supabase: SupabaseClient, ingredients: Ingredient[]): Promise<Ingredient[]> {
  const { data } = await supabase.from('food_items').select('id, name, category, kategorie')
  const byName = new Map((data ?? []).map(f => [f.name.trim().toLowerCase(), f]))
  return ingredients.map(ing => {
    const f = byName.get(ing.name.trim().toLowerCase())
    return f ? { ...ing, food_item_id: f.id, category: f.category || f.kategorie || null } : { ...ing, food_item_id: null }
  })
}

function toRow(r: CleanRecipe, ingredients: Ingredient[]) {
  return {
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
    meal_type: r.meal_type,
    tags: r.tags,
    ingredients,
    steps: r.steps,
    instructions: r.instructions,
  }
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
  const ingredients = await linkFoodItems(supabase, r.ingredients)
  const { data, error } = await supabase
    .from('recipes')
    .insert({ ...toRow(r, ingredients), status: 'ready', created_by: createdBy, ...extra, slug })
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
  const ingredients = await linkFoodItems(supabase, r.ingredients)
  let q = supabase.from('recipes').update({ ...toRow(r, ingredients), ...extra }).eq('id', id)
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
