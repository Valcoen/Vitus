import type { SupabaseClient } from '@supabase/supabase-js'
import { processRecipeImage, smallVariant, sniffImageType } from './images'

export const RECIPE_IMAGE_BUCKET = 'recipe-images'

/**
 * Validates, re-encodes and stores a recipe photo, points the recipe at it
 * and removes the previous one. Shared by the upload API and the importer.
 */
export async function storeRecipeImage(
  supabase: SupabaseClient,
  recipeId: string,
  buf: Buffer,
): Promise<{ ok: true; path: string } | { ok: false; status: number; error: string }> {
  if (!sniffImageType(buf)) return { ok: false, status: 415, error: 'Nur JPEG, PNG, WebP oder GIF sind erlaubt.' }
  let processed: { large: Buffer; small: Buffer }
  try {
    processed = await processRecipeImage(buf)
  } catch {
    return { ok: false, status: 422, error: 'Bild konnte nicht verarbeitet werden.' }
  }
  const { data: recipe } = await supabase.from('recipes').select('image_path').eq('id', recipeId).maybeSingle()
  if (!recipe) return { ok: false, status: 404, error: 'Rezept nicht gefunden' }

  const path = `${recipeId}/${Date.now()}.webp`
  const storage = supabase.storage.from(RECIPE_IMAGE_BUCKET)
  const up1 = await storage.upload(path, processed.large, { contentType: 'image/webp', cacheControl: '31536000', upsert: false })
  if (up1.error) return { ok: false, status: 500, error: `Speichern fehlgeschlagen: ${up1.error.message}` }
  const up2 = await storage.upload(smallVariant(path), processed.small, { contentType: 'image/webp', cacheControl: '31536000', upsert: false })
  if (up2.error) {
    await storage.remove([path])
    return { ok: false, status: 500, error: `Speichern fehlgeschlagen: ${up2.error.message}` }
  }
  const { error } = await supabase.from('recipes').update({ image_path: path }).eq('id', recipeId)
  if (error) {
    await storage.remove([path, smallVariant(path)])
    return { ok: false, status: 500, error: `Speichern fehlgeschlagen: ${error.message}` }
  }
  const old = recipe.image_path as string | null
  if (old && old.startsWith(`${recipeId}/`)) await storage.remove([old, smallVariant(old)])
  return { ok: true, path }
}
