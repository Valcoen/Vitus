import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planImport, applyImport, summarize } from '../importer'

/** Tiny in-memory stand-in for the parts of supabase-js the importer uses. */
function fakeDb(initial: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = { recipes: [], food_items: [], ...initial }
  let seq = 0
  let clock = Date.now()
  // always later than real time, like the database's now() after an import
  const tick = () => new Date((clock = Math.max(clock, Date.now()) + 60_000)).toISOString()

  function query(table: string) {
    let rows = () => tables[table]
    const filters: ((r: any) => boolean)[] = []
    let op: 'select' | 'insert' | 'update' = 'select'
    let payload: any = null
    const q: any = {
      select: () => q,
      in: (col: string, vals: any[]) => { filters.push(r => vals.includes(r[col])); return q },
      eq: (col: string, val: any) => { filters.push(r => r[col] === val); return q },
      like: (col: string, pat: string) => { const p = pat.replace('%', ''); filters.push(r => String(r[col] ?? '').startsWith(p)); return q },
      insert: (p: any) => { op = 'insert'; payload = p; return q },
      update: (p: any) => { op = 'update'; payload = p; return q },
      run: () => {
        if (op === 'insert') {
          const now = tick()
          const row = { id: `id-${++seq}`, updated_at: now, ...payload }
          tables[table].push(row)
          return [row]
        }
        const matched = rows().filter(r => filters.every(f => f(r)))
        if (op === 'update') {
          for (const r of matched) {
            const importStamp = payload.last_imported_at && payload.last_imported_at !== r.last_imported_at
            Object.assign(r, payload, { updated_at: importStamp ? payload.last_imported_at : tick() })
          }
        }
        return matched
      },
      single: async () => ({ data: q.run()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: q.run()[0] ?? null, error: null }),
      then: (res: any) => res({ data: q.run(), error: null }),
    }
    return q
  }
  return { client: { from: query } as any, tables, appEdit: (slug: string) => {
    const r = tables.recipes.find(x => x.slug === slug)
    r.updated_at = tick()
    r.title = r.title + ' (geändert)'
  } }
}

const md = (title: string, status = 'ready', extra = '') => `---
title: ${title}
status: ${status}
servings: 2
kcal: 400
---
## Ingredients
- 200 g Reis
- Salz
## Steps
1. Kochen 10 min.
${extra}`

test('classifies new, draft and duplicate files', async () => {
  const db = fakeDb()
  const plan = await planImport(db.client, [
    { name: 'Reis Bowl.md', text: md('Reis Bowl') },
    { name: 'Idee.md', text: md('Idee', 'draft') },
    { name: 'reis-bowl.md', text: md('Reis Bowl 2') },
  ])
  assert.deepEqual(plan.map(p => p.action), ['create', 'create', 'error'])
  assert.deepEqual(plan.map(p => p.draft), [false, true, undefined])
  assert.ok(plan[0].warnings.some(w => w.includes('Salz')))
})

test('apply → unchanged on identical re-import → update after Obsidian edit', async () => {
  const db = fakeDb()
  const file = { name: 'Reis Bowl.md', text: md('Reis Bowl') }
  const first = await applyImport(db.client, 'user-1', [file], [], new Set())
  assert.equal(first[0].action, 'create')
  assert.equal(db.tables.recipes.length, 1)
  const row = db.tables.recipes[0]
  assert.equal(row.slug, 'reis-bowl')
  assert.equal(row.created_by, 'user-1')
  assert.equal(row.kcal_per_serving, 400)
  assert.equal(row.ingredients.length, 2) // "Salz" kept as text

  const again = await planImport(db.client, [file])
  assert.equal(again[0].action, 'unchanged')

  const edited = { name: 'Reis Bowl.md', text: md('Reis Bowl', 'ready', '2. Servieren.') }
  const upd = await applyImport(db.client, 'user-1', [edited], [], new Set())
  assert.equal(upd[0].action, 'update')
  assert.equal(db.tables.recipes[0].steps.length, 2)
  assert.equal(db.tables.recipes.length, 1)
})

test('changed in the app since import → conflict, only overwritten when confirmed', async () => {
  const db = fakeDb()
  await applyImport(db.client, 'u', [{ name: 'a.md', text: md('Alpha') }], [], new Set())
  db.appEdit('a')
  const newer = { name: 'a.md', text: md('Alpha', 'ready', '2. Neu.') }

  const plan = await planImport(db.client, [newer])
  assert.equal(plan[0].action, 'conflict')
  assert.match(plan[0].reason!, /In der App geändert/)

  const notConfirmed = await applyImport(db.client, 'u', [newer], [], new Set())
  assert.equal(notConfirmed[0].applied, undefined)
  assert.match(db.tables.recipes[0].title, /geändert/)

  const confirmed = await applyImport(db.client, 'u', [newer], [], new Set(['a']))
  assert.equal(confirmed[0].overwritten, true)
  assert.equal(db.tables.recipes[0].title, 'Alpha')
})

test('recipe created in the app with the same slug is a conflict', async () => {
  const db = fakeDb({ recipes: [{ id: 'x', slug: 'alpha', title: 'Alpha', updated_at: '2026-11-19T00:00:00Z', last_imported_at: null }] })
  const plan = await planImport(db.client, [{ name: 'Alpha.md', text: md('Alpha') }])
  assert.equal(plan[0].action, 'conflict')
  assert.match(plan[0].reason!, /nie importiert/)
})

test('missing image file is a warning, not an error', async () => {
  const db = fakeDb()
  const text = md('Bild').replace('kcal: 400', 'kcal: 400\nimage: bild.jpg')
  const res = await applyImport(db.client, 'u', [{ name: 'Bild.md', text }], [], new Set())
  assert.equal(res[0].action, 'create')
  assert.ok(res[0].warnings.some(w => w.includes('bild.jpg')))
  assert.deepEqual(summarize(res), { created: 1, updated: 0, unchanged: 0, conflicts: 0, drafts: 0, errors: 0, warnings: 2 })
})

test('notes without status: ready land as drafts; a re-import never unpublishes', async () => {
  const db = fakeDb()
  const res = await applyImport(db.client, 'u', [{ name: 'Idee.md', text: md('Idee', 'draft') }], [], new Set())
  assert.equal(res[0].draft, true)
  assert.equal(db.tables.recipes[0].status, 'draft')
  assert.deepEqual(summarize(res).drafts, 1)

  // published in the app, then the (still status-less) note is edited and re-imported
  db.tables.recipes[0].status = 'ready'
  db.tables.recipes[0].updated_at = db.tables.recipes[0].last_imported_at
  const again = await applyImport(db.client, 'u', [{ name: 'Idee.md', text: md('Idee', 'draft', '2. Mehr.') }], [], new Set())
  assert.equal(again[0].action, 'update')
  assert.equal(db.tables.recipes[0].status, 'ready')
  assert.equal(db.tables.recipes[0].steps.length, 2)
})

test('rating, step sections and extra sections are stored', async () => {
  const db = fakeDb()
  const text = md('Ragu').replace('kcal: 400', 'kcal: 400\nrating: 8').replace('## Steps\n', '## Steps\n### 1. Anbraten\n') + '\n## Regeln\nKein Knoblauch.\n'
  await applyImport(db.client, 'u', [{ name: 'Ragu.md', text }], [], new Set())
  const row = db.tables.recipes[0]
  assert.equal(row.rating, 8)
  assert.equal(row.status, 'ready')
  assert.equal(row.steps[0].section, 'Anbraten')
  assert.deepEqual(row.extra_sections, [{ heading: 'Regeln', body: 'Kein Knoblauch.' }])
})
