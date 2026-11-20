import { NextResponse } from 'next/server'
import { getActor } from '@/lib/actor'
import { assertCan, PermissionError } from '@/lib/permissions'
import { MAX_UPLOAD_BYTES, smallVariant } from '@/lib/images'
import { publicImageUrl } from '@/lib/recipe/server'
import { RECIPE_IMAGE_BUCKET, storeRecipeImage } from '@/lib/imageStore'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f-]{36}$/i

/** Upload (or replace) a recipe photo. multipart/form-data with field "file". */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Ungültige Rezept-ID' }, { status: 400 })

  const { actor, supabase } = await getActor()
  try {
    assertCan(actor, 'recipe.image.upload')
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: actor ? 403 : 401 })
    throw e
  }

  const len = Number(request.headers.get('content-length') || 0)
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return NextResponse.json({ error: 'Bild ist zu groß (max. 15 MB).' }, { status: 413 })

  let file: File | null = null
  try {
    const form = await request.formData()
    const f = form.get('file')
    file = f instanceof File ? f : null
  } catch {
    return NextResponse.json({ error: 'Upload konnte nicht gelesen werden.' }, { status: 400 })
  }
  if (!file || file.size === 0) return NextResponse.json({ error: 'Keine Datei erhalten.' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'Bild ist zu groß (max. 15 MB).' }, { status: 413 })

  const buf = Buffer.from(await file.arrayBuffer())
  const res = await storeRecipeImage(supabase, id, buf)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
  const path = res.path
  return NextResponse.json({ imagePath: path, imageUrl: publicImageUrl(path) })
}

/** Remove the recipe photo. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Ungültige Rezept-ID' }, { status: 400 })
  const { actor, supabase } = await getActor()
  try {
    assertCan(actor, 'recipe.image.upload')
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: actor ? 403 : 401 })
    throw e
  }
  const { data: recipe } = await supabase.from('recipes').select('image_path').eq('id', id).maybeSingle()
  if (!recipe) return NextResponse.json({ error: 'Rezept nicht gefunden' }, { status: 404 })
  const { error } = await supabase.from('recipes').update({ image_path: null }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const old = recipe.image_path as string | null
  if (old && old.startsWith(`${id}/`)) await supabase.storage.from(RECIPE_IMAGE_BUCKET).remove([old, smallVariant(old)])
  return NextResponse.json({ ok: true })
}
