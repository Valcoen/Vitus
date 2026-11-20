'use server'

import { revalidatePath } from 'next/cache'
import { getActor } from '@/lib/actor'
import { can } from '@/lib/permissions'
import { loadRecipe } from '@/lib/recipe/server'

/** Planner slot of a meal ("Mittagessen", "Snacks", …) → recipes.meal_type values that fit. */
function fittingMealTypes(slot: string): string[] | null {
  const s = slot.toLowerCase()
  if (s.includes('frühstück')) return ['breakfast']
  if (s.includes('mittag') || s.includes('abend')) return ['lunch', 'dinner']
  if (s.includes('snack')) return ['snack']
  return null
}

/**
 * Replaces the recipe of one planned meal (and the other days of its batch).
 * `recipeId` null = a random recipe that fits the slot. Portions per person
 * keep their calorie targets; the shopping list follows automatically.
 */
export async function swapMealAction(mealId: string, recipeId: string | null): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  const { actor, supabase } = await getActor()
  if (!actor?.householdId || !can(actor, 'plan.edit')) return { ok: false, error: 'Nicht erlaubt.' }
  const { data: meal } = await supabase.from('meals')
    .select('id, meal_type, recipe_id, batch_group_id, household_id').eq('id', mealId).maybeSingle()
  if (!meal || meal.household_id !== actor.householdId) return { ok: false, error: 'Mahlzeit nicht gefunden.' }

  let targetId = recipeId
  if (!targetId) {
    const { data: pool } = await supabase.from('recipes').select('id, meal_type').eq('status', 'ready')
    const usable = (pool ?? []).filter(r => r.id !== meal.recipe_id && r.meal_type !== 'none')
    const types = fittingMealTypes(meal.meal_type ?? '')
    const fitting = types ? usable.filter(r => types.includes(String(r.meal_type ?? '').toLowerCase())) : usable
    const candidates = fitting.length ? fitting : usable
    if (!candidates.length) return { ok: false, error: 'Kein anderes passendes Rezept vorhanden.' }
    targetId = candidates[Math.floor(Math.random() * candidates.length)].id
  }
  const recipe = await loadRecipe(supabase, targetId!)
  if (!recipe || recipe.status !== 'ready') return { ok: false, error: 'Rezept nicht gefunden oder noch Entwurf.' }

  let q = supabase.from('meals').update({ recipe_id: recipe.id, name: recipe.title, calories: recipe.nutrition.kcal ?? null })
  q = meal.batch_group_id ? q.eq('batch_group_id', meal.batch_group_id).eq('household_id', actor.householdId) : q.eq('id', meal.id)
  const { data, error } = await q.select('id')
  if (error || !data?.length) return { ok: false, error: 'Tauschen fehlgeschlagen.' }
  revalidatePath('/meal-plan')
  revalidatePath('/shopping')
  revalidatePath('/')
  return { ok: true, title: recipe.title }
}
