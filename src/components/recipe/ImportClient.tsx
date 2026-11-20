'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Upload, FileText, CheckCircle2, AlertTriangle, XCircle, MinusCircle, PencilLine, RefreshCw } from 'lucide-react'
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
  skipped_draft: 'Entwurf – übersprungen',
  error: 'Fehler',
}

function Icon({ a }: { a: ImportItem['action'] }) {
  if (a === 'create' || a === 'update') return <CheckCircle2 className="text-green-600 shrink-0" size={22} />
  if (a === 'conflict') return <AlertTriangle className="text-amber-500 shrink-0" size={22} />
  if (a === 'error') return <XCircle className="text-red-600 shrink-0" size={22} />
  if (a === 'skipped_draft') return <PencilLine className="text-[hsl(var(--text-muted))] shrink-0" size={22} />
  return <MinusCircle className="text-[hsl(var(--text-muted))] shrink-0" size={22} />
}

export default function ImportClient() {
  const [files, setFiles] = useState<File[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [overwrite, setOverwrite] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const incoming = Array.from(list).filter(f => /\.(md|markdown|jpe?g|png|webp|gif)$/i.test(f.name))
    setFiles(prev => {
      const byName = new Map(prev.map(f => [f.name, f]))
      incoming.forEach(f => byName.set(f.name, f))
      return [...byName.values()]
    })
    setResult(null)
    setError(null)
  }

  const send = async (mode: 'preview' | 'apply') => {
    setBusy(true)
    setError(null)
    const form = new FormData()
    form.append('mode', mode)
    files.forEach(f => form.append('files', f, f.name))
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

  const mdCount = files.filter(f => /\.(md|markdown)$/i.test(f.name)).length
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
          Obsidian-Rezepte als <code>.md</code>. Nur Dateien mit <code>status: ready</code> werden importiert, Entwürfe werden übersprungen.
          Bilder, die per <code>image:</code> verlinkt sind, einfach mit auswählen.
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
        <button type="button" onClick={() => inputRef.current?.click()} className="btn-primary h-14 px-6 text-lg mx-auto gap-2">
          <FileText size={22} /> Dateien auswählen
        </button>
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
                      {item.reason ? ` · ${item.reason}` : ''}
                    </p>
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
