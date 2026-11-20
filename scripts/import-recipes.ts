/**
 * Server-side recipe import, same parser and update rules as the in-app import.
 *
 *   npm run import:recipes -- <folder> --as <email> [--apply] [--overwrite slug1,slug2 | --overwrite-all]
 *
 * Without --apply it only prints the report (dry run).
 * Needs SUPABASE_SERVICE_ROLE_KEY in /root/.config/vitus/service.env
 * (or the environment), and NEXT_PUBLIC_SUPABASE_URL from .env.local.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { planImport, applyImport, summarize, type ImportFile, type ImportImage, type ImportItem } from '../src/lib/recipe/importer'

function loadEnv(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    if (name.startsWith('.')) return []
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : undefined
}

const ICON: Record<ImportItem['action'], string> = {
  create: '+ neu        ', update: '~ update     ', unchanged: '= unverändert', conflict: '! KONFLIKT   ',
  skipped_draft: '- Entwurf    ', error: 'x FEHLER     ',
}

async function main() {
  loadEnv(join(process.cwd(), '.env.local'))
  loadEnv('/root/.config/vitus/service.env')
  const folder = process.argv[2]
  const email = arg('--as')
  const apply = process.argv.includes('--apply')
  if (!folder || folder.startsWith('--') || !email) {
    console.error('Nutzung: npm run import:recipes -- <ordner> --as <email> [--apply] [--overwrite a,b | --overwrite-all]')
    process.exit(2)
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt (siehe /root/.config/vitus/service.env).')
    process.exit(2)
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data: user } = await supabase.from('users').select('id, name').eq('email', email).maybeSingle()
  if (!user) {
    console.error(`Kein Vitus-Benutzer mit E-Mail ${email}`)
    process.exit(2)
  }

  const paths = walk(folder)
  const files: ImportFile[] = paths.filter(p => /\.(md|markdown)$/i.test(p)).map(p => ({ name: basename(p), text: readFileSync(p, 'utf8') }))
  const images: ImportImage[] = paths.filter(p => /\.(jpe?g|png|webp|gif)$/i.test(extname(p))).map(p => ({ name: basename(p), data: readFileSync(p) }))

  const plan = await planImport(supabase, files)
  const conflicts = plan.filter(i => i.action === 'conflict').map(i => i.slug!).filter(Boolean)
  const overwrite = new Set(process.argv.includes('--overwrite-all') ? conflicts : (arg('--overwrite') ?? '').split(',').filter(Boolean))
  const items = apply ? await applyImport(supabase, user.id, files, images, overwrite) : plan

  for (const i of items) {
    const tag = i.applied && i.overwritten ? '! überschrieben' : ICON[i.action]
    console.log(`${tag}  ${i.file}${i.reason ? `  (${i.reason})` : ''}`)
    for (const w of i.warnings) console.log(`                 ↳ ${w}`)
  }
  const s = summarize(items)
  console.log(`\n${apply ? 'Importiert' : 'Probelauf (nichts gespeichert)'}: ${s.created} neu, ${s.updated} aktualisiert, ${s.unchanged} unverändert, ${s.conflicts} Konflikte, ${s.drafts} Entwürfe, ${s.errors} Fehler, ${s.warnings} Hinweise`)
  if (!apply) console.log('Mit --apply wirklich importieren. Konflikte nur mit --overwrite <slug,…> oder --overwrite-all.')
  if (s.errors) process.exitCode = 1
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
