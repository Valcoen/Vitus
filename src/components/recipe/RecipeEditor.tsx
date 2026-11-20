'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowUp, ArrowDown, Plus, Trash2, Camera, ImageIcon, Save, Timer, X, Check, AlertTriangle, Heading, FilePen, CheckCircle2, Database, Link2 } from 'lucide-react'
import { parseIngredientLine, formatAmount } from '@/lib/recipe/ingredients'
import { plainName, indexFoods, matchFood, gramsFor, computeMacros, perServing, type FoodItemLite } from '@/lib/recipe/nutrition'
import type { CourseLookup, Lookup } from '@/lib/food/server'
import FoodPicker from './FoodPicker'
import { detectTimers, formatDuration } from '@/lib/recipe/timers'
import { uploadRecipeImage } from '@/lib/client/resizeImage'
import { saveRecipeAction, deleteRecipeAction } from '@/app/(dashboard)/recipes/actions'
import { RecipeImage } from './parts'

export type EditorInitial = {
  id: string | null
  updatedAt: string | null
  title: string
  description: string
  servings: number
  prepTime: string
  cookTime: string
  kcal: string
  protein: string
  fridgeDays: string
  freezable: boolean | null
  notes: string
  mealType: string
  tags: string[]
  ingredientLines: string[]
  /** linked food per line (same index) */
  ingredientFoodIds: (string | null)[]
  course: string
  cuisine: string
  steps: { text: string; timerMinutes: string; section?: string | null }[]
  imageUrl: string | null
  status: 'draft' | 'ready'
  rating: string
  sections: { heading: string; body: string }[]
}

type StepRow = { key: string; kind: 'step' | 'section'; text: string; timerMinutes: string }

/** Steps with a `section` → rows with a heading row wherever the section changes. */
function toRows(steps: EditorInitial['steps']): StepRow[] {
  const rows: StepRow[] = []
  let section: string | null = null
  for (const s of steps) {
    if ((s.section ?? null) !== section) {
      section = s.section ?? null
      if (section) rows.push({ key: newKey(), kind: 'section', text: section, timerMinutes: '' })
    }
    rows.push({ key: newKey(), kind: 'step', text: s.text, timerMinutes: s.timerMinutes })
  }
  return rows.length ? rows : [{ key: newKey(), kind: 'step', text: '', timerMinutes: '' }]
}

function fromRows(rows: StepRow[]) {
  let section: string | null = null
  const out: { text: string; timer_minutes: string; section: string | null }[] = []
  for (const r of rows) {
    if (r.kind === 'section') section = r.text.trim() || null
    else out.push({ text: r.text, timer_minutes: r.timerMinutes, section })
  }
  return out
}


let keySeq = 0
const newKey = () => `k${++keySeq}`

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr
  const copy = arr.slice()
  const [x] = copy.splice(from, 1)
  copy.splice(to, 0, x)
  return copy
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-bold mb-1.5 pl-1">{label}</span>
      {children}
      {hint && <span className="block text-sm text-[hsl(var(--text-muted))] mt-1 pl-1">{hint}</span>}
    </label>
  )
}

const input = 'input-apple bg-[hsl(var(--background))] text-lg min-h-12'
const iconBtn = 'w-11 h-11 shrink-0 rounded-xl flex items-center justify-center bg-[hsl(var(--input-bg))] active:scale-95 disabled:opacity-30'

export default function RecipeEditor({ initial, foods, courses, cuisines }: {
  initial: EditorInitial
  foods: FoodItemLite[]
  courses: CourseLookup[]
  cuisines: Lookup[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<string[]>([])
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [servings, setServings] = useState(String(initial.servings || 4))
  const [prepTime, setPrepTime] = useState(initial.prepTime)
  const [cookTime, setCookTime] = useState(initial.cookTime)
  const [kcal, setKcal] = useState(initial.kcal)
  const [protein, setProtein] = useState(initial.protein)
  const [fridgeDays, setFridgeDays] = useState(initial.fridgeDays)
  const [freezable, setFreezable] = useState<boolean | null>(initial.freezable)
  const [notes, setNotes] = useState(initial.notes)
  const [course, setCourse] = useState(initial.course)
  const [cuisine, setCuisine] = useState(initial.cuisine)
  const [picker, setPicker] = useState<{ mode: 'link' | 'add'; row?: number; query?: string } | null>(null)
  const [tags, setTags] = useState(initial.tags.join(', '))
  const [ings, setIngs] = useState<{ key: string; text: string; foodId: string | null }[]>(() =>
    (initial.ingredientLines.length ? initial.ingredientLines : ['']).map((text, i) => ({ key: newKey(), text, foodId: initial.ingredientFoodIds[i] ?? null })))
  const [steps, setSteps] = useState<StepRow[]>(() => toRows(initial.steps))
  const [status, setStatus] = useState<'draft' | 'ready'>(initial.status)
  const [rating, setRating] = useState(initial.rating)
  const [sections, setSections] = useState(() => initial.sections.map(x => ({ key: newKey(), ...x })))
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(initial.imageUrl)
  const [removeImage, setRemoveImage] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const foodIndex = useMemo(() => indexFoods(foods), [foods])

  // Every row parsed and matched once per render
  const rows = useMemo(() => ings.map(ing => {
    const text = ing.text.trim()
    const isGroup = /^#/.test(text)
    const parsed = text && !isGroup ? { ...parseIngredientLine(text.replace(/\s+\*+$/, '')), food_item_id: ing.foodId } : null
    const food = parsed ? matchFood(parsed, foodIndex) : null
    const grams = parsed && food ? gramsFor(parsed, food) : null
    return { isGroup, parsed, food, grams }
  }), [ings, foodIndex])

  // Live nutrition per serving, like the recipe page will show it
  const live = useMemo(() => {
    const list = rows.flatMap(r => (r.parsed ? [r.parsed] : []))
    const n = Math.max(1, parseInt(servings, 10) || 1)
    return perServing(computeMacros(list, foodIndex), n, { kcal: null, protein: null })
  }, [rows, servings, foodIndex])

  const onPicked = (food: FoodItemLite, line?: string) => {
    if (!picker) return
    if (picker.mode === 'link' && picker.row !== undefined) {
      const row = picker.row
      setIngs(p => p.map((x, i) => (i === row ? { ...x, foodId: food.id } : x)))
    } else if (line) {
      setIngs(p => {
        const last = p[p.length - 1]
        const entry = { key: newKey(), text: line, foodId: food.id }
        return last && !last.text.trim() ? [...p.slice(0, -1), entry] : [...p, entry]
      })
    }
    setPicker(null)
  }

  const pickImage = (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/') && f.type !== '') {
      setErrors(['Bitte ein Bild auswählen.'])
      return
    }
    setImageFile(f)
    setRemoveImage(false)
    setImagePreview(URL.createObjectURL(f))
  }

  // Pasting several lines into one ingredient field splits them into rows
  const onIngPaste = (idx: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\n')) return
    e.preventDefault()
    const lines = text.split(/\r?\n/).map(l => l.replace(/^\s*[-*•]\s+/, '').trim()).filter(Boolean)
    setIngs(prev => {
      const copy = prev.slice()
      copy.splice(idx, 1, ...lines.map(t => ({ key: newKey(), text: t, foodId: null })))
      return copy
    })
  }

  const submit = () => {
    setErrors([])
    startTransition(async () => {
      const res = await saveRecipeAction(initial.id, {
        title, description, servings, prep_time: prepTime, cook_time: cookTime,
        kcal_per_serving: kcal, protein_per_serving: protein, fridge_days: fridgeDays,
        freezable, notes, tags, status, rating, course: course || null, cuisine: cuisine || null,
        ingredientLines: ings.map(i => i.text),
        ingredientFoodIds: ings.map(i => i.foodId),
        steps: fromRows(steps),
        sections: sections.map(({ heading, body }) => ({ heading, body })),
      }, initial.updatedAt)
      if (!res.ok) {
        setErrors(res.errors)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      if (imageFile) {
        const up = await uploadRecipeImage(res.id, imageFile)
        if ('error' in up) {
          // Recipe is saved; tell the user the photo didn't make it
          router.push(`/recipes/${res.id}?error=${encodeURIComponent('Rezept gespeichert, aber Foto fehlgeschlagen: ' + up.error)}`)
          return
        }
      } else if (removeImage && initial.id) {
        await fetch(`/api/recipes/${initial.id}/image`, { method: 'DELETE' }).catch(() => {})
      }
      router.push(`/recipes/${res.id}?success=${encodeURIComponent('Rezept gespeichert')}`)
      router.refresh()
    })
  }

  const onDelete = () => {
    if (!initial.id) return
    if (!window.confirm(`„${initial.title}“ wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return
    startTransition(async () => {
      const res = await deleteRecipeAction(initial.id!)
      if (!res.ok) {
        setErrors([res.error])
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      router.push(`/recipes?success=${encodeURIComponent('Rezept gelöscht')}`)
      router.refresh()
    })
  }

  return (
    <form className="max-w-3xl mx-auto space-y-6 pb-32" onSubmit={e => { e.preventDefault(); submit() }}>
      <Link href={initial.id ? `/recipes/${initial.id}` : '/recipes'} className="inline-flex items-center gap-2 h-11 font-semibold text-[hsl(var(--text-muted))]">
        <ArrowLeft size={20} /> Zurück
      </Link>
      <h1 className="text-3xl font-extrabold">{initial.id ? 'Rezept bearbeiten' : 'Neues Rezept'}</h1>

      {errors.length > 0 && (
        <div role="alert" className="rounded-2xl border-2 border-red-500 bg-red-50 dark:bg-red-950/40 p-4 space-y-1">
          {errors.map((e, i) => <p key={i} className="font-semibold text-red-800 dark:text-red-200 flex gap-2"><AlertTriangle size={20} className="shrink-0" />{e}</p>)}
        </div>
      )}

      {/* Status */}
      <section className="card-apple !p-4 space-y-2">
        <h2 className="text-xl font-bold">Status</h2>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Status">
          {([['draft', 'Entwurf', FilePen], ['ready', 'Fertig (ready)', CheckCircle2]] as const).map(([v, label, Icon]) => (
            <button key={v} type="button" role="radio" aria-checked={status === v} onClick={() => setStatus(v)}
              className={`h-14 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 border-2 ${status === v
                ? (v === 'ready' ? 'bg-green-600 border-green-600 text-white' : 'bg-amber-400 border-amber-400 text-black')
                : 'border-[hsl(var(--border))] bg-[hsl(var(--background))]'}`}>
              <Icon size={20} /> {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-[hsl(var(--text-muted))]">Entwürfe stehen nur unter „Entwürfe“ und kommen nicht in den Wochenplan.</p>
      </section>

      {/* Photo */}
      <section className="card-apple !p-4 space-y-3">
        <h2 className="text-xl font-bold">Foto</h2>
        <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-[hsl(var(--input-bg))]">
          <RecipeImage url={removeImage ? null : imagePreview} title={title || 'Rezept'} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => cameraRef.current?.click()} className="btn-secondary h-12 gap-2"><Camera size={20} /> Foto aufnehmen</button>
          <button type="button" onClick={() => galleryRef.current?.click()} className="btn-secondary h-12 gap-2"><ImageIcon size={20} /> Aus Galerie</button>
          {(imagePreview && !removeImage) && (
            <button type="button" onClick={() => { setImageFile(null); setRemoveImage(true) }} className="h-12 px-4 rounded-2xl font-semibold text-red-600 flex items-center gap-2"><X size={20} /> Entfernen</button>
          )}
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => pickImage(e.target.files?.[0])} />
        <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif" className="hidden" onChange={e => pickImage(e.target.files?.[0])} />
        <p className="text-sm text-[hsl(var(--text-muted))]">JPEG, PNG, WebP oder iPhone-Foto · wird automatisch verkleinert.</p>
      </section>

      {/* Basics */}
      <section className="card-apple !p-4 space-y-4">
        <h2 className="text-xl font-bold">Grundlagen</h2>
        <Field label="Titel *"><input className={input} value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} placeholder="z. B. Chili sin Carne" /></Field>
        <Field label="Kurzbeschreibung"><textarea className={`${input} min-h-20`} value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} rows={3} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Portionen *"><input className={input} type="number" inputMode="numeric" min={1} max={50} value={servings} onChange={e => setServings(e.target.value)} required /></Field>
          <Field label="Art">
            <select className={input} value={course} onChange={e => setCourse(e.target.value)}>
              <option value="">–</option>
              {courses.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Küche">
            <select className={input} value={cuisine} onChange={e => setCuisine(e.target.value)}>
              <option value="">–</option>
              {cuisines.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Vorbereitung (Min.)"><input className={input} type="number" inputMode="numeric" min={0} value={prepTime} onChange={e => setPrepTime(e.target.value)} /></Field>
          <Field label="Kochzeit (Min.)"><input className={input} type="number" inputMode="numeric" min={0} value={cookTime} onChange={e => setCookTime(e.target.value)} /></Field>
          <Field label="kcal pro Portion"><input className={input} type="number" inputMode="numeric" min={0} value={kcal} onChange={e => setKcal(e.target.value)} placeholder={live.kcal != null ? `auto: ${live.kcal}` : 'auto'} /></Field>
          <Field label="Protein pro Portion (g)"><input className={input} type="text" inputMode="decimal" value={protein} onChange={e => setProtein(e.target.value)} placeholder={live.protein != null ? `auto: ${String(live.protein).replace('.', ',')}` : 'auto'} /></Field>
          <Field label="Bewertung (0–10)"><input className={input} type="number" inputMode="numeric" min={0} max={10} value={rating} onChange={e => setRating(e.target.value)} placeholder="–" /></Field>
        </div>
        <p className="text-sm text-[hsl(var(--text-muted))]">Leer lassen = aus den Zutaten berechnen (Zutaten mit Nährwerten aus der Lebensmittel-Datenbank). „Art“ bestimmt, ob und wofür der Wochenplan das Rezept nimmt – Kuchen, Kekse und Desserts als Snack.</p>
        <Field label="Tags" hint="Mit Komma trennen, z. B. mealprep, high-protein, vegetarisch">
          <input className={input} value={tags} onChange={e => setTags(e.target.value)} />
        </Field>
      </section>

      {/* Ingredients */}
      <section className="card-apple !p-4 space-y-3">
        <h2 className="text-xl font-bold">Zutaten</h2>
        <p className="text-sm text-[hsl(var(--text-muted))]">Eine Zutat pro Zeile, z. B. „400 g Kidneybohnen“ oder „2 EL Olivenöl“. „### Sauce“ beginnt eine Gruppe, „ *“ am Ende ist eine Fußnote. Mehrere Zeilen einfügen geht auch.</p>
        <ol className="space-y-2">
          {ings.map((ing, idx) => {
            const { isGroup, parsed, food, grams } = rows[idx]
            return (
              <li key={ing.key} className="rounded-2xl bg-[hsl(var(--input-bg))]/50 p-2">
                <div className="flex items-center gap-1.5">
                  <input className={`${input} flex-1 min-w-0 ${isGroup ? 'font-bold' : ''}`} value={ing.text}
                    onChange={e => setIngs(p => p.map((x, i) => (i === idx ? { ...x, text: e.target.value } : x)))}
                    onPaste={e => onIngPaste(idx, e)} placeholder="400 g Kidneybohnen" aria-label={`Zutat ${idx + 1}`} />
                  <button type="button" className={iconBtn} onClick={() => setIngs(p => move(p, idx, idx - 1))} disabled={idx === 0} aria-label="Nach oben"><ArrowUp size={20} /></button>
                  <button type="button" className={iconBtn} onClick={() => setIngs(p => move(p, idx, idx + 1))} disabled={idx === ings.length - 1} aria-label="Nach unten"><ArrowDown size={20} /></button>
                  <button type="button" className={`${iconBtn} text-red-600`} onClick={() => setIngs(p => (p.length > 1 ? p.filter((_, i) => i !== idx) : [{ key: newKey(), text: '', foodId: null }]))} aria-label="Entfernen"><Trash2 size={20} /></button>
                </div>
                {parsed && (
                  <div className="text-sm pl-2 pt-1 text-[hsl(var(--text-muted))] flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    {parsed.qty !== null
                      ? <><span className="font-bold text-[hsl(var(--text))]">{formatAmount(parsed)}</span> · {parsed.name}</>
                      : <span>wird als Text übernommen</span>}
                    {food ? (
                      <button type="button" onClick={() => setPicker({ mode: 'link', row: idx, query: plainName(parsed.name) })}
                        className="min-h-9 inline-flex items-center gap-1 rounded-lg px-2 text-green-800 dark:text-green-300 bg-green-100/70 dark:bg-green-950/40 font-semibold text-left">
                        <Check size={14} className="shrink-0" /> {food.name}
                        {parsed.qty !== null && (grams != null ? ` · ${Math.round(food.kcal_100g * grams / 100)} kcal` : ' · Gewicht unbekannt, in g angeben')}
                      </button>
                    ) : parsed.qty !== null && (
                      <button type="button" onClick={() => setPicker({ mode: 'link', row: idx, query: plainName(parsed.name) })}
                        className="min-h-9 inline-flex items-center gap-1 rounded-lg px-2 text-amber-800 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/40 font-semibold">
                        <Link2 size={14} /> Nährwerte verknüpfen
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPicker({ mode: 'add' })} className="btn-primary h-12 gap-2"><Database size={20} /> Aus Datenbank</button>
          <button type="button" onClick={() => setIngs(p => [...p, { key: newKey(), text: '', foodId: null }])} className="btn-secondary h-12 gap-2"><Plus size={20} /> Als Text</button>
        </div>
        <div className="rounded-2xl bg-[hsl(var(--input-bg))] p-3" aria-live="polite">
          <p className="text-sm font-bold mb-1">Pro Portion (aus den Zutaten)</p>
          {live.kcal != null ? (
            <p className="text-lg font-extrabold">
              {live.kcal} kcal · {String(live.protein).replace('.', ',')} g Protein
              <span className="text-sm font-semibold text-[hsl(var(--text-muted))]"> · {String(live.carbs).replace('.', ',')} g KH · {String(live.fat).replace('.', ',')} g Fett</span>
            </p>
          ) : <p className="font-semibold text-[hsl(var(--text-muted))]">Noch nichts berechenbar.</p>}
          <p className="text-xs text-[hsl(var(--text-muted))] mt-1">{live.matched} von {rows.filter(r => r.parsed?.qty != null).length} Zutaten mit Menge haben Nährwerte.</p>
        </div>
        {picker && (
          <FoodPicker foods={foods} mode={picker.mode} initialQuery={picker.query} onPick={onPicked} onClose={() => setPicker(null)} />
        )}
      </section>

      {/* Steps */}
      <section className="card-apple !p-4 space-y-3">
        <h2 className="text-xl font-bold">Schritte</h2>
        <ol className="space-y-3">
          {steps.map((s, idx) => {
            const update = (patch: Partial<StepRow>) => setSteps(p => p.map((x, i) => (i === idx ? { ...x, ...patch } : x)))
            const controls = (
              <div className={`flex ${s.kind === 'step' ? 'flex-col' : ''} gap-1.5`}>
                <button type="button" className={iconBtn} onClick={() => setSteps(p => move(p, idx, idx - 1))} disabled={idx === 0} aria-label="Nach oben"><ArrowUp size={20} /></button>
                <button type="button" className={iconBtn} onClick={() => setSteps(p => move(p, idx, idx + 1))} disabled={idx === steps.length - 1} aria-label="Nach unten"><ArrowDown size={20} /></button>
                <button type="button" className={`${iconBtn} text-red-600`} onClick={() => setSteps(p => (p.length > 1 ? p.filter((_, i) => i !== idx) : [{ key: newKey(), kind: 'step', text: '', timerMinutes: '' }]))} aria-label="Entfernen"><Trash2 size={20} /></button>
              </div>
            )
            if (s.kind === 'section') {
              return (
                <li key={s.key} className="rounded-2xl border-2 border-dashed border-[hsl(var(--border))] p-2 flex items-center gap-1.5">
                  <Heading size={20} className="shrink-0 ml-1 text-[hsl(var(--primary))]" />
                  <input className={`${input} flex-1 min-w-0 font-bold`} value={s.text} onChange={e => update({ text: e.target.value })}
                    placeholder="Abschnitt, z. B. Soße ansetzen" aria-label="Abschnitt" maxLength={120} />
                  {controls}
                </li>
              )
            }
            const number = steps.slice(0, idx + 1).filter(x => x.kind === 'step').length
            const detected = s.text ? detectTimers(s.text) : []
            return (
              <li key={s.key} className="rounded-2xl bg-[hsl(var(--input-bg))]/50 p-2 space-y-2">
                <div className="flex items-start gap-1.5">
                  <span className="w-8 h-11 shrink-0 flex items-center justify-center font-extrabold text-[hsl(var(--primary))]">{number}</span>
                  <textarea className={`${input} flex-1 min-w-0 min-h-24`} value={s.text} rows={3}
                    onChange={e => update({ text: e.target.value })}
                    placeholder="z. B. 25 Min. köcheln lassen." aria-label={`Schritt ${number}`} />
                  {controls}
                </div>
                <div className="flex items-center gap-2 pl-9 text-sm">
                  <Timer size={16} className="shrink-0" />
                  <span className="text-[hsl(var(--text-muted))]">
                    {detected.length ? `Erkannt: ${detected.map(d => formatDuration(d.seconds)).join(', ')}` : 'Kein Timer erkannt'}
                  </span>
                  <label className="ml-auto flex items-center gap-1.5 font-semibold">
                    Eigener Timer
                    <input className="input-apple bg-[hsl(var(--background))] w-20 py-1.5 px-2 text-right" type="text" inputMode="decimal" placeholder="Min."
                      value={s.timerMinutes} onChange={e => update({ timerMinutes: e.target.value })} />
                  </label>
                </div>
              </li>
            )
          })}
        </ol>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setSteps(p => [...p, { key: newKey(), kind: 'step', text: '', timerMinutes: '' }])} className="btn-secondary h-12 gap-2"><Plus size={20} /> Schritt</button>
          <button type="button" onClick={() => setSteps(p => [...p, { key: newKey(), kind: 'section', text: '', timerMinutes: '' }])} className="btn-secondary h-12 gap-2"><Heading size={20} /> Abschnitt</button>
        </div>
      </section>

      {/* Storage */}
      <section className="card-apple !p-4 space-y-4">
        <h2 className="text-xl font-bold">Lagerung & Aufwärmen</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tage im Kühlschrank"><input className={input} type="number" inputMode="numeric" min={0} max={60} value={fridgeDays} onChange={e => setFridgeDays(e.target.value)} /></Field>
          <Field label="Einfrierbar">
            <select className={input} value={freezable === null ? '' : freezable ? 'yes' : 'no'} onChange={e => setFreezable(e.target.value === '' ? null : e.target.value === 'yes')}>
              <option value="">–</option><option value="yes">Ja</option><option value="no">Nein</option>
            </select>
          </Field>
        </div>
        <Field label="Hinweise zum Aufwärmen / Lagern"><textarea className={`${input} min-h-24`} value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Abgedeckt aufwärmen, einen Schuss Wasser dazu." /></Field>
      </section>

      {/* Free sections ("Regeln", "Tipps", …) */}
      <section className="card-apple !p-4 space-y-3">
        <h2 className="text-xl font-bold">Weitere Abschnitte</h2>
        <p className="text-sm text-[hsl(var(--text-muted))]">Z. B. „Regeln“ oder „Tipps“. „- “ am Zeilenanfang wird zur Liste, **fett** wird fett.</p>
        {sections.map((x, idx) => (
          <div key={x.key} className="rounded-2xl bg-[hsl(var(--input-bg))]/50 p-2 space-y-2">
            <div className="flex items-center gap-1.5">
              <input className={`${input} flex-1 min-w-0 font-bold`} value={x.heading} maxLength={120} placeholder="Überschrift"
                onChange={e => setSections(p => p.map((y, i) => (i === idx ? { ...y, heading: e.target.value } : y)))} aria-label="Überschrift" />
              <button type="button" className={`${iconBtn} text-red-600`} onClick={() => setSections(p => p.filter((_, i) => i !== idx))} aria-label="Abschnitt entfernen"><Trash2 size={20} /></button>
            </div>
            <textarea className={`${input} w-full min-h-32`} value={x.body} rows={5} maxLength={8000}
              onChange={e => setSections(p => p.map((y, i) => (i === idx ? { ...y, body: e.target.value } : y)))} aria-label={`Text ${x.heading}`} />
          </div>
        ))}
        <button type="button" onClick={() => setSections(p => [...p, { key: newKey(), heading: '', body: '' }])} className="btn-secondary h-12 gap-2 w-full"><Plus size={20} /> Abschnitt hinzufügen</button>
      </section>

      {initial.id && (
        <button type="button" onClick={onDelete} disabled={pending} className="w-full h-12 rounded-2xl border-2 border-red-500/40 text-red-600 font-bold flex items-center justify-center gap-2">
          <Trash2 size={20} /> Rezept löschen
        </button>
      )}

      {/* Sticky save */}
      <div className="fixed inset-x-0 bottom-0 z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[hsl(var(--card))] border-t border-[hsl(var(--border))] md:static md:p-0 md:bg-transparent md:border-0">
        <button type="submit" disabled={pending || !title.trim()} className="btn-primary w-full h-14 text-lg gap-2 disabled:opacity-50">
          <Save size={22} /> {pending ? 'Speichert…' : 'Speichern'}
        </button>
      </div>
    </form>
  )
}
