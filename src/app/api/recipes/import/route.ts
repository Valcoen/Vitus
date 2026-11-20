import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getActor } from '@/lib/actor'
import { can } from '@/lib/permissions'
import { applyImport, planImport, summarize, MAX_FILES, MAX_MD_BYTES, type ImportFile, type ImportImage } from '@/lib/recipe/importer'
import { MAX_UPLOAD_BYTES } from '@/lib/images'

export const runtime = 'nodejs'

const MAX_TOTAL_BYTES = 80 * 1024 * 1024

/**
 * POST multipart/form-data
 *   files:     .md files (and optional images referenced by `image:`)
 *   mode:      "preview" (default, writes nothing) | "apply"
 *   overwrite: slugs of conflicting recipes the user confirmed (repeatable)
 */
export async function POST(request: Request) {
  const { actor, supabase } = await getActor()
  if (!actor || !can(actor, 'recipe.import')) {
    return NextResponse.json({ error: 'Keine Berechtigung für den Import.' }, { status: actor ? 403 : 401 })
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: 'Upload zu groß (max. 80 MB auf einmal).' }, { status: 413 })
  }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Upload konnte nicht gelesen werden.' }, { status: 400 })
  }
  const mode = form.get('mode') === 'apply' ? 'apply' : 'preview'
  const overwrite = new Set(form.getAll('overwrite').map(String))

  const mdFiles: ImportFile[] = []
  const images: ImportImage[] = []
  const rejected: { file: string; reason: string }[] = []
  for (const entry of form.getAll('files')) {
    if (!(entry instanceof File)) continue
    const name = entry.name.replace(/^.*[\\/]/, '').slice(0, 200)
    if (/\.(md|markdown)$/i.test(name)) {
      if (entry.size > MAX_MD_BYTES) rejected.push({ file: name, reason: 'größer als 1 MB' })
      else mdFiles.push({ name, text: await entry.text() })
    } else if (/\.(jpe?g|png|webp|gif)$/i.test(name)) {
      if (entry.size > MAX_UPLOAD_BYTES) rejected.push({ file: name, reason: 'Bild größer als 15 MB' })
      else if (mode === 'apply') images.push({ name, data: Buffer.from(await entry.arrayBuffer()) })
    } else {
      rejected.push({ file: name, reason: 'kein .md oder Bild' })
    }
  }
  if (mdFiles.length === 0) return NextResponse.json({ error: 'Keine .md-Dateien gefunden.', rejected }, { status: 400 })
  if (mdFiles.length > MAX_FILES) return NextResponse.json({ error: `Maximal ${MAX_FILES} Dateien auf einmal.` }, { status: 400 })

  const items = mode === 'apply'
    ? await applyImport(supabase, actor.userId, mdFiles, images, overwrite)
    : await planImport(supabase, mdFiles)
  if (mode === 'apply') revalidatePath('/recipes')
  return NextResponse.json({ mode, items, summary: summarize(items), rejected })
}
