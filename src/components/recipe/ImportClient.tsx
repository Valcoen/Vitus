'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Upload, FileText, FolderOpen, CheckCircle2, AlertTriangle, XCircle, MinusCircle, RefreshCw, ImageIcon } from 'lucide-react'
import type { ImportItem } from '@/lib/recipe/importer'

type Result = {
  mode: 'preview' | 'apply'
  items: ImportItem[]
  summary: Record<string, number>
  rejected: { file: string; reason: string }[]
}

const LABEL: Record<ImportItem['action'], string> = {
  create: 'Neu',
  update: 'Aktualisieren',
  unchanged: 'Unverändert',
  conflict: 'In der App geändert',
  error: 'Fehler',
}

function Icon({ a }: { a: ImportItem['action'] }) {
  if (a === 'create' || a === 'update') return <CheckCircle2 className="text-green-600 shrink-0" size={22} />
  if (a === 'conflict') return <AlertTriangle className="text-amber-500 shrink-0" size={22} />
  if (a === 'error') return <XCircle className="text-red-600 shrink-0" size={22} />
  return <MinusCircle className="text-[hsl(var(--text-muted))] shrink-0" size={22} />
}

const isMd = (f: File) => /\.(md|markdown)$/i.test(f.name)
/** Relative path for folder picks ("Rezepte/Bilder/image.jpg"), else the name */
const pathOf = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name

/** Image file names a note embeds: ![[x.jpg]], ![](x.jpg), image: x.jpg */
function imageRefs(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/!\[\[([^\]|#]+?)(?:[|#][^\]]*)?\]\]|!\[[^\]]*\]\(<?([^)>\s]+)>?/g)) out.push(m[1] ?? m[2])
  const fm = text.match(/^image:\s*["']?([^"'#\n]+)/m)
  if (fm) out.push(fm[1].replace(/^\[\[|\]\]$/g, ''))
  const decode = (r: string) => { try { return decodeURIComponent(r) } catch { return r } }
  return out.map(r => decode(r.trim()).replace(/^.*[\\/]/, '').toLowerCase())
}

export default function ImportClient() {
  const [files, setFiles] = useState<File[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [overwrite, setOverwrite] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  const addFiles = async (list: FileList | File[] | null) => {
    if (!list) return
    const incoming = Array.from(list).filter(f => /\.(md|markdown|jpe?g|png|webp|gif)$/i.test(f.name))
    // From a whole vault folder only keep the images the notes actually embed
    const md = incoming.filter(isMd)
    const refs = new Set<string>()
    for (const f of md) for (const r of imageRefs(await f.text())) refs.add(r)
    const fromFolder = incoming.some(f => pathOf(f).includes('/'))
    const keep = incoming.filter(f => isMd(f) || !fromFolder || refs.has(f.name.toLowerCase()))
    setFiles(prev => {
      const byPath = new Map(prev.map(f => [pathOf(f), f]))
      keep.forEach(f => byPath.set(pathOf(f), f))
      return [...byPath.values()]
    })
    setResult(null)
    setError(null)
  }

  const send = async (mode: 'preview' | 'apply') => {
    setBusy(true)
    setError(null)
    const form = new FormData()
    form.append('mode', mode)
    // Preview: only the image names (fast); apply: the images themselves
    files.forEach(f => {
      if (isMd(f) || mode === 'apply') form.append('files', f, pathOf(f))
      else form.append('imageName', pathOf(f))
    })
    overwrite.forEach(s => form.append('overwrite', s))
    try {
      const res = await fetch('/api/recipes/import', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) setError(json.error || `Fehler ${res.status}`)
      else {
        setResult(json)
        if (mode === 'apply') setOverwrite(new Set())
      }
    } catch {
      setError('Keine Verbindung zum Server.')
    } finally {
      setBusy(false)
    }
  }

  const mdCount = files.filter(isMd).length
  const imgCount = files.length - mdCount
  const willWrite = result?.mode === 'preview'
    ? result.items.filter(i => i.action === 'create' || i.action === 'update' || (i.action === 'conflict' && i.slug && overwrite.has(i.slug))).length
    : 0

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-24">
      <Link href="/recipes" className="inline-flex items-center gap-2 h-11 font-semibold text-[hsl(var(--text-muted))]"><ArrowLeft size={20} /> Entdecken</Link>
      <div>
        <h1 className="text-3xl font-extrabold">Rezepte importieren</h1>
        <p className="text-[hsl(var(--text-muted))] mt-1">
          Obsidian-Rezepte als <code>.md</code>. Ohne <code>status: ready</code> kommen sie als <b>Entwurf</b> rein – in Vitus prüfen und auf „Fertig“ setzen.
          Bilder (<code>![[bild.jpg]]</code> oder <code>image:</code>) einfach mit auswählen – oder gleich den ganzen Rezepte-Ordner samt Anhängen.
        </p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
        className={`rounded-3xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}
      >
        <Upload className="mx-auto mb-3 text-[hsl(var(--primary))]" size={36} />
        <p className="font-semibold mb-4 hidden md:block">Dateien hierher ziehen oder</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button type="button" onClick={() => inputRef.current?.click()} className="btn-primary h-14 px-6 text-lg gap-2">
            <FileText size={22} /> Dateien auswählen
          </button>
          <button type="button" onClick={() => folderRef.current?.click()} className="btn-secondary h-14 px-6 text-lg gap-2">
            <FolderOpen size={22} /> Ordner auswählen
          </button>
        </div>
        <input ref={folderRef} type="file" multiple className="hidden"
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
        <input ref={inputRef} type="file" multiple accept=".md,.markdown,text/markdown,text/plain,image/jpeg,image/png,image/webp,image/gif" className="hidden"
          onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
        {files.length > 0 && (
          <p className="mt-4 font-semibold">
            {mdCount} Rezept-Datei{mdCount === 1 ? '' : 'en'}{imgCount ? ` · ${imgCount} Bild${imgCount === 1 ? '' : 'er'}` : ''}
            <button type="button" onClick={() => { setFiles([]); setResult(null) }} className="ml-3 text-[hsl(var(--text-muted))] underline">leeren</button>
          </p>
        )}
      </div>

      {error && <p role="alert" className="rounded-2xl border-2 border-red-500 bg-red-50 dark:bg-red-950/40 p-4 font-semibold text-red-800 dark:text-red-200">{error}</p>}

      {files.length > 0 && (!result || result.mode === 'apply') && (
        <button type="button" disabled={busy || mdCount === 0} onClick={() => send('preview')} className="btn-primary w-full h-14 text-lg gap-2 disabled:opacity-50">
          {busy ? <RefreshCw className="animate-spin" size={20} /> : null} Prüfen (noch nichts speichern)
        </button>
      )}

      {result && (
        <section className="card-apple !p-4 space-y-4" aria-live="polite">
          <h2 className="text-xl font-bold">{result.mode === 'preview' ? 'Vorschau' : 'Import-Bericht'}</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            {[
              ['Neu', result.summary.created],
              ['Aktualisiert', result.summary.updated],
              ['Unverändert', result.summary.unchanged],
              ['Konflikte', result.summary.conflicts],
              ['Entwürfe', result.summary.drafts],
              ['Fehler', result.summary.errors],
            ].map(([l, n]) => (
              <div key={l as string} className="rounded-xl bg-[hsl(var(--input-bg))] p-2">
                <div className="text-2xl font-extrabold">{n}</div>
                <div className="text-xs font-semibold">{l}</div>
              </div>
            ))}
          </div>

          <ul className="divide-y divide-[hsl(var(--border))]">
            {result.items.map(item => (
              <li key={item.file} className="py-3 space-y-1">
                <div className="flex items-start gap-3">
                  <Icon a={item.action} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate">{item.title ?? item.file}</p>
                    <p className="text-sm text-[hsl(var(--text-muted))] truncate">{item.file}</p>
                    <p className="text-sm font-semibold">
                      {item.applied && item.overwritten ? 'Überschrieben' : LABEL[item.action]}
                      {item.draft && (item.action === 'create' || item.action === 'update' || item.action === 'conflict') ? ' · als Entwurf' : ''}
                      {item.reason ? ` · ${item.reason}` : ''}
                    </p>
                    {item.image && <p className="text-sm text-[hsl(var(--text-muted))] flex items-center gap-1"><ImageIcon size={14} /> {item.image}</p>}
                  </div>
                  {item.applied && item.recipeId && <Link href={`/recipes/${item.recipeId}`} className="text-sm font-semibold text-[hsl(var(--primary))] h-11 flex items-center">Öffnen</Link>}
                </div>
                {item.action === 'conflict' && result.mode === 'preview' && item.slug && (
                  <label className="ml-9 flex items-center gap-3 min-h-11 font-semibold text-amber-700 dark:text-amber-300">
                    <input type="checkbox" className="w-6 h-6" checked={overwrite.has(item.slug)}
                      onChange={e => setOverwrite(prev => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(item.slug!)
                        else next.delete(item.slug!)
                        return next
                      })} />
                    Trotzdem mit der Datei überschreiben
                  </label>
                )}
                {item.warnings.length > 0 && (
                  <details className="ml-9 text-sm">
                    <summary className="cursor-pointer font-semibold text-[hsl(var(--text-muted))] min-h-9 flex items-center">{item.warnings.length} Hinweis{item.warnings.length === 1 ? '' : 'e'}</summary>
                    <ul className="list-disc pl-5 space-y-0.5 text-[hsl(var(--text-muted))]">{item.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                  </details>
                )}
              </li>
            ))}
            {result.rejected.map(r => (
              <li key={r.file} className="py-3 flex gap-3"><XCircle className="text-red-600 shrink-0" size={22} /><span><b>{r.file}</b> – {r.reason}</span></li>
            ))}
          </ul>

          {result.mode === 'preview' && (
            <button type="button" disabled={busy || willWrite === 0} onClick={() => send('apply')} className="btn-primary w-full h-14 text-lg gap-2 disabled:opacity-50">
              {busy ? <RefreshCw className="animate-spin" size={20} /> : null}
              {willWrite === 0 ? 'Nichts zu importieren' : `${willWrite} Rezept${willWrite === 1 ? '' : 'e'} importieren`}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
