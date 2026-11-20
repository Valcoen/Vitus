'use server'

import { revalidatePath } from 'next/cache'
import { getActor } from '@/lib/actor'
import { can, PermissionError, assertCan } from '@/lib/permissions'
import { validateRecipe, type RecipeInput } from '@/lib/recipe/validate'
import { insertRecipe, updateRecipe, type SaveResult } from '@/lib/recipe/save'
import { RECIPE_IMAGE_BUCKET } from '@/lib/recipe/server'
import { smallVariant } from '@/lib/images'

export async function saveRecipeAction(
  id: string | null,
  input: RecipeInput,
  expectedUpdatedAt: string | null,
): Promise<SaveResult> {
  const { actor, supabase } = await getActor()
  if (!actor) return { ok: false, errors: ['Bitte melde dich erneut an.'] }
  if (!can(actor, id ? 'recipe.edit' : 'recipe.create')) {
    return { ok: false, errors: ['Keine Berechtigung, Rezepte zu ändern.'] }
  }
  const v = validateRecipe(input)
  if (!v.ok) return { ok: false, errors: v.errors }
  const res = id
    ? await updateRecipe(supabase, id, v.recipe, expectedUpdatedAt)
    : await insertRecipe(supabase, v.recipe, actor.userId)
  if (res.ok) {
    revalidatePath('/recipes')
    revalidatePath(`/recipes/${res.id}`)
  }
  return res
}

export async function deleteRecipeAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { actor, supabase } = await getActor()
  try {
    assertCan(actor, 'recipe.delete')
  } catch (e) {
    return { ok: false, error: e instanceof PermissionError ? e.message : 'Nicht erlaubt' }
  }
  const { count } = await supabase.from('meals').select('id', { count: 'exact', head: true }).eq('recipe_id', id)
  if (count && count > 0) {
    return { ok: false, error: `Das Rezept ist im aktuellen Essensplan (${count}×) eingeplant. Erstelle zuerst einen neuen Plan oder leere ihn.` }
  }
  const { data: recipe } = await supabase.from('recipes').select('image_path').eq('id', id).maybeSingle()
  const { data: deleted, error } = await supabase.from('recipes').delete().eq('id', id).select('id')
  if (error) return { ok: false, error: `Löschen fehlgeschlagen: ${error.message}` }
  // RLS without a delete policy silently deletes nothing
  if (!deleted || deleted.length === 0) return { ok: false, error: 'Löschen nicht erlaubt (Datenbank-Regel fehlt, siehe Migration 004).' }
  const img = recipe?.image_path as string | null | undefined
  if (img && img.startsWith(`${id}/`)) await supabase.storage.from(RECIPE_IMAGE_BUCKET).remove([img, smallVariant(img)])
  revalidatePath('/recipes')
  return { ok: true }
}
