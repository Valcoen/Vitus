/**
 * Markdown import, shared by the in-app upload and the server CLI.
 * Vitus is the source of truth: a re-import only overwrites a recipe that
 * was changed in the app since its last import when explicitly confirmed.
 *
 * Relative imports only, so scripts/import-recipes can compile this file.
 */

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseRecipeMarkdown, type RecipeDoc } from './markdown'
import { validateRecipe, ingredientsToLines, type RecipeInput } from './validate'
import { insertRecipe, updateRecipe } from './save'
import { storeRecipeImage } from '../imageStore'

export type ImportFile = { name: string; text: string }
export type ImportImage = { name: string; data: Buffer }

export type ImportAction =
  | 'create'        // new recipe
  | 'update'        // existing, unchanged in app since last import
  | 'unchanged'     // identical file was imported before
  | 'conflict'      // changed in the app since (or never imported) → needs confirmation
  | 'error'

export type ImportItem = {
  file: string
  slug: string | null
  title: string | null
  action: ImportAction
  reason?: string
  warnings: string[]
  recipeId?: string
  /** Lands (or stays) as a draft: the file has no `status: ready` */
  draft?: boolean
  /** Uploaded image that will be used (preview with image names only) */
  image?: string | null
  /** Status the recipe has in Vitus today (existing recipes only) */
  currentStatus?: string | null
  /** set by applyImport */
  applied?: boolean
  overwritten?: boolean
}

export const MAX_MD_BYTES = 1024 * 1024
export const MAX_FILES = 300

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/**
 * `status: ready` in the file publishes the recipe. Without it the recipe is
 * a draft — but a re-import never takes back a recipe already published in Vitus.
 */
export function importStatus(doc: RecipeDoc, currentStatus?: string | null): 'ready' | 'draft' {
  return doc.status === 'ready' || currentStatus === 'ready' ? 'ready' : 'draft'
}

export function docToInput(doc: RecipeDoc, currentStatus?: string | null): RecipeInput {
  return {
    title: doc.title,
    status: importStatus(doc, currentStatus),
    rating: doc.rating,
    sections: doc.extra_sections,
    description: doc.description,
    servings: doc.servings,
    prep_time: doc.prep_time,
    cook_time: doc.cook_time,
    kcal_per_serving: doc.kcal,
    protein_per_serving: doc.protein,
    fridge_days: doc.fridge_days,
    freezable: doc.freezable,
    notes: doc.notes,
    tags: doc.tags,
    ingredientLines: ingredientsToLines(doc.ingredients),
    steps: doc.steps.map(s => ({ text: s.text, timer_minutes: s.timer_seconds ? s.timer_seconds / 60 : null, section: s.section ?? null })),
  }
}

type Parsed = { item: ImportItem; doc?: RecipeDoc; hash?: string }

function parseAll(files: ImportFile[]): Parsed[] {
  const seen = new Map<string, string>()
  return files.slice(0, MAX_FILES).map(f => {
    const base: ImportItem = { file: f.name, slug: null, title: null, action: 'error', warnings: [] }
    if (Buffer.byteLength(f.text, 'utf8') > MAX_MD_BYTES) return { item: { ...base, reason: 'Datei größer als 1 MB' } }
    const { doc, warnings } = parseRecipeMarkdown(f.text, f.name)
    const item: ImportItem = { ...base, slug: doc.slug, title: doc.title, warnings }
    const dup = seen.get(doc.slug)
    if (dup) return { item: { ...item, reason: `Gleicher Slug wie „${dup}“` } }
    seen.set(doc.slug, f.name)
    const v = validateRecipe(docToInput(doc))
    if (!v.ok) return { item: { ...item, reason: v.errors.join('; ') } }
    return { item, doc, hash: sha256(f.text) }
  })
}

/** Dry run: classifies every file without writing anything. */
export async function planImport(supabase: SupabaseClient, files: ImportFile[], images?: ImportImage[]): Promise<ImportItem[]> {
  const items = await classify(supabase, files)
  if (!images) return items
  const docs = new Map(parseAll(files).filter(p => p.doc).map(p => [p.item.file, p.doc!]))
  return items.map(item => {
    const ref = docs.get(item.file)?.image
    if (!ref || /^https?:\/\//.test(ref) || item.action === 'error' || item.action === 'unchanged') return item
    const found = findImage(ref, item.file, images, files.length)
    return found.image ? { ...item, image: found.image.name } : { ...item, warnings: [...item.warnings, found.reason] }
  })
}

async function classify(supabase: SupabaseClient, files: ImportFile[]): Promise<ImportItem[]> {
  const parsed = parseAll(files)
  const slugs = parsed.filter(p => p.doc).map(p => p.doc!.slug)
  const { data: existing } = slugs.length
    ? await supabase.from('recipes').select('id, slug, status, updated_at, last_imported_at, import_hash').in('slug', slugs)
    : { data: [] as any[] }
  const bySlug = new Map((existing ?? []).map(r => [r.slug as string, r]))

  return parsed.map(({ item, doc, hash }) => {
    if (!doc) return item
    const ex = bySlug.get(doc.slug)
    if (!ex) return { ...item, action: 'create' as const, draft: importStatus(doc) === 'draft' }
    const withId = { ...item, recipeId: ex.id as string, currentStatus: ex.status ?? null, draft: importStatus(doc, ex.status) === 'draft' }
    if (ex.import_hash && ex.import_hash === hash) return { ...withId, action: 'unchanged' as const, reason: 'Identisch mit dem letzten Import' }
    if (!ex.last_imported_at) {
      return { ...withId, action: 'conflict' as const, reason: 'Existiert schon in Vitus (in der App angelegt, nie importiert)' }
    }
    const changedInApp = new Date(ex.updated_at).getTime() > new Date(ex.last_imported_at).getTime() + 2000
    if (changedInApp) {
      const when = new Date(ex.updated_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })
      return { ...withId, action: 'conflict' as const, reason: `In der App geändert am ${when}, nach dem letzten Import` }
    }
    return { ...withId, action: 'update' as const }
  })
}

/**
 * Writes the import. Conflicts are only overwritten when their slug is in
 * `overwrite`. Images referenced by `image:` are taken from `images` when a
 * file with that name was uploaded alongside.
 */
export async function applyImport(
  supabase: SupabaseClient,
  createdBy: string,
  files: ImportFile[],
  images: ImportImage[],
  overwrite: Set<string>,
): Promise<ImportItem[]> {
  const plan = await classify(supabase, files)
  const parsed = new Map(parseAll(files).filter(p => p.doc).map(p => [p.item.file, p]))
  const mdCount = files.length
  const results: ImportItem[] = []

  for (const item of plan) {
    const p = parsed.get(item.file)
    const doConflict = item.action === 'conflict' && item.slug !== null && overwrite.has(item.slug)
    if (!p || !(item.action === 'create' || item.action === 'update' || doConflict)) {
      results.push(item)
      continue
    }
    const doc = p.doc!
    const v = validateRecipe(docToInput(doc, item.currentStatus))
    if (!v.ok) {
      results.push({ ...item, action: 'error', reason: v.errors.join('; ') })
      continue
    }
    const stamp = new Date().toISOString()
    const extra: Record<string, unknown> = {
      slug: doc.slug,
      last_imported_at: stamp,
      import_hash: p.hash,
      extra_frontmatter: doc.extra_frontmatter,
    }
    const res = item.action === 'create'
      ? await insertRecipe(supabase, v.recipe, createdBy, {
          ...extra,
          updated_at: stamp,
          ...(doc.created && /^\d{4}-\d{2}-\d{2}/.test(doc.created) ? { created_at: doc.created } : {}),
        })
      : await updateRecipe(supabase, item.recipeId!, v.recipe, null, extra)
    if (!res.ok) {
      results.push({ ...item, action: 'error', reason: res.errors.join('; ') })
      continue
    }
    const warnings = [...item.warnings]
    if (doc.image && !/^https?:\/\//.test(doc.image)) {
      const found = findImage(doc.image, item.file, images, mdCount)
      if (found.image) {
        const stored = await storeRecipeImage(supabase, res.id, found.image.data)
        if (!stored.ok) warnings.push(`Bild „${doc.image}“: ${stored.error}`)
      } else {
        warnings.push(found.reason)
      }
    }
    results.push({
      ...item,
      action: item.action === 'conflict' ? 'update' : item.action,
      recipeId: res.id,
      applied: true,
      overwritten: doConflict,
      warnings,
    })
  }
  return results
}

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '')
const baseOf = (p: string) => p.replace(/^.*[\\/]/, '').toLowerCase()

/**
 * Finds the uploaded image a note refers to. Obsidian attachments often share
 * names ("image.jpg" in many notes), so with a folder upload the copy closest
 * to the note wins: same folder, then a sub-folder of it, then the only file
 * with that name. A single note uploaded with a single image always pairs up.
 */
export function findImage(
  ref: string,
  mdPath: string,
  images: ImportImage[],
  mdCount: number,
): { image: ImportImage; reason?: undefined } | { image: null; reason: string } {
  const name = baseOf(ref)
  const candidates = images.filter(i => baseOf(i.name) === name)
  if (candidates.length === 1) return { image: candidates[0] }
  if (candidates.length > 1) {
    const dir = dirOf(mdPath.replace(/\\/g, '/'))
    const path = (i: ImportImage) => i.name.replace(/\\/g, '/')
    const same = candidates.filter(i => dirOf(path(i)) === dir)
    if (same.length === 1) return { image: same[0] }
    const below = candidates.filter(i => path(i).startsWith(dir))
      .sort((a, b) => path(a).split('/').length - path(b).split('/').length)
    if (below.length && (below.length === 1 || path(below[0]).split('/').length < path(below[1]).split('/').length)) {
      return { image: below[0] }
    }
    return { image: null, reason: `Bild „${ref}“ gibt es mehrfach – bitte das Bild einzeln mit diesem Rezept importieren oder im Editor hochladen` }
  }
  if (mdCount === 1 && images.length === 1) return { image: images[0] }
  return { image: null, reason: `Bild „${ref}“ nicht mitgeliefert – vorhandenes Foto bleibt` }
}

export function summarize(items: ImportItem[]) {
  const count = (a: ImportAction) => items.filter(i => i.action === a).length
  return {
    created: count('create'),
    updated: count('update'),
    unchanged: count('unchanged'),
    conflicts: count('conflict'),
    drafts: items.filter(i => i.draft && (i.action === 'create' || i.action === 'update')).length,
    errors: count('error'),
    warnings: items.reduce((n, i) => n + i.warnings.length, 0),
  }
}
