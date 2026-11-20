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
  | 'skipped_draft' // status is not "ready"
  | 'error'

export type ImportItem = {
  file: string
  slug: string | null
  title: string | null
  action: ImportAction
  reason?: string
  warnings: string[]
  recipeId?: string
  /** set by applyImport */
  applied?: boolean
  overwritten?: boolean
}

export const MAX_MD_BYTES = 1024 * 1024
export const MAX_FILES = 300

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

export function docToInput(doc: RecipeDoc): RecipeInput {
  return {
    title: doc.title,
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
    steps: doc.steps.map(s => ({ text: s.text, timer_minutes: s.timer_seconds ? s.timer_seconds / 60 : null })),
  }
}

type Parsed = { item: ImportItem; doc?: RecipeDoc; hash?: string }

function parseAll(files: ImportFile[]): Parsed[] {
  const seen = new Map<string, string>()
  return files.slice(0, MAX_FILES).map(f => {
    const base: ImportItem = { file: f.name, slug: null, title: null, action: 'error', warnings: [] }
    if (Buffer.byteLength(f.text, 'utf8') > MAX_MD_BYTES) return { item: { ...base, reason: 'Datei größer als 1 MB' } }
    const { doc, warnings, ready } = parseRecipeMarkdown(f.text, f.name)
    const item: ImportItem = { ...base, slug: doc.slug, title: doc.title, warnings }
    if (!ready) {
      return { item: { ...item, action: 'skipped_draft', reason: doc.status ? `status: ${doc.status}` : 'kein status: ready' } }
    }
    const dup = seen.get(doc.slug)
    if (dup) return { item: { ...item, reason: `Gleicher Slug wie „${dup}“` } }
    seen.set(doc.slug, f.name)
    const v = validateRecipe(docToInput(doc))
    if (!v.ok) return { item: { ...item, reason: v.errors.join('; ') } }
    return { item, doc, hash: sha256(f.text) }
  })
}

/** Dry run: classifies every file without writing anything. */
export async function planImport(supabase: SupabaseClient, files: ImportFile[]): Promise<ImportItem[]> {
  const parsed = parseAll(files)
  const slugs = parsed.filter(p => p.doc).map(p => p.doc!.slug)
  const { data: existing } = slugs.length
    ? await supabase.from('recipes').select('id, slug, updated_at, last_imported_at, import_hash').in('slug', slugs)
    : { data: [] as any[] }
  const bySlug = new Map((existing ?? []).map(r => [r.slug as string, r]))

  return parsed.map(({ item, doc, hash }) => {
    if (!doc) return item
    const ex = bySlug.get(doc.slug)
    if (!ex) return { ...item, action: 'create' as const }
    const withId = { ...item, recipeId: ex.id as string }
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
  const plan = await planImport(supabase, files)
  const parsed = new Map(parseAll(files).filter(p => p.doc).map(p => [p.item.file, p]))
  const imagesByName = new Map(images.map(i => [i.name.replace(/^.*[\\/]/, '').toLowerCase(), i]))
  const results: ImportItem[] = []

  for (const item of plan) {
    const p = parsed.get(item.file)
    const doConflict = item.action === 'conflict' && item.slug !== null && overwrite.has(item.slug)
    if (!p || !(item.action === 'create' || item.action === 'update' || doConflict)) {
      results.push(item)
      continue
    }
    const doc = p.doc!
    const v = validateRecipe(docToInput(doc))
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
      extra_sections: doc.extra_sections,
      status: 'ready',
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
      const img = imagesByName.get(doc.image.replace(/^.*[\\/]/, '').toLowerCase())
      if (img) {
        const stored = await storeRecipeImage(supabase, res.id, img.data)
        if (!stored.ok) warnings.push(`Bild „${doc.image}“: ${stored.error}`)
      } else {
        warnings.push(`Bild „${doc.image}“ nicht mitgeliefert – vorhandenes Foto bleibt`)
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

export function summarize(items: ImportItem[]) {
  const count = (a: ImportAction) => items.filter(i => i.action === a).length
  return {
    created: count('create'),
    updated: count('update'),
    unchanged: count('unchanged'),
    conflicts: count('conflict'),
    drafts: count('skipped_draft'),
    errors: count('error'),
    warnings: items.reduce((n, i) => n + i.warnings.length, 0),
  }
}
