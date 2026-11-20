'use client'

import { Fragment, type ReactNode } from 'react'
import { Minus, Plus, CookingPot, Check, Star } from 'lucide-react'
import { formatAmount, scaleIngredient, type Ingredient } from '@/lib/recipe/ingredients'

/** Big, wet-hands-friendly +/- control. */
export function ServingsStepper({
  value, onChange, compact = false,
}: { value: number; onChange: (v: number) => void; compact?: boolean }) {
  const size = compact ? 'w-11 h-11' : 'w-14 h-14'
  const label = value === 1 ? 'Portion' : 'Portionen'
  const dec = () => onChange(value > 1 ? Math.max(1, Math.ceil(value) - 1) : Math.max(0.5, value - 0.5))
  const inc = () => onChange(value < 1 ? 1 : Math.floor(value) + 1)
  return (
    <div className="flex items-center gap-3" role="group" aria-label="Portionen">
      <button type="button" onClick={dec} aria-label="Weniger Portionen"
        className={`${size} rounded-2xl bg-[hsl(var(--input-bg))] flex items-center justify-center active:scale-95 transition-transform`}>
        <Minus size={compact ? 20 : 24} />
      </button>
      <div className="text-center min-w-[4.5rem]" aria-live="polite">
        <div className={`${compact ? 'text-2xl' : 'text-3xl'} font-extrabold leading-none`}>{String(value).replace('.', ',')}</div>
        <div className="text-xs font-semibold uppercase tracking-wide opacity-70 mt-1">{label}</div>
      </div>
      <button type="button" onClick={inc} aria-label="Mehr Portionen"
        className={`${size} rounded-2xl bg-[hsl(var(--primary))] text-white flex items-center justify-center active:scale-95 transition-transform`}>
        <Plus size={compact ? 20 : 24} />
      </button>
    </div>
  )
}

export function RecipeImage({ url, title, className = '' }: { url: string | null; title: string; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={title} loading="lazy" className={`object-cover w-full h-full ${className}`} />
  }
  return (
    <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-100 to-amber-50 dark:from-orange-950/40 dark:to-neutral-900 ${className}`}
      aria-label="Kein Bild">
      <CookingPot className="text-[hsl(var(--primary))] opacity-60" size={48} strokeWidth={1.5} />
    </div>
  )
}

/** Scaled, checkable ingredient list grouped by sub-heading. */
export function IngredientChecklist({
  ingredients, factor, checked, onToggle, large = false,
}: {
  ingredients: Ingredient[]
  factor: number
  checked: Set<number>
  onToggle: (idx: number) => void
  large?: boolean
}) {
  let lastGroup: string | null = null
  return (
    <ul className="space-y-1">
      {ingredients.map((ing, idx) => {
        const scaled = scaleIngredient(ing, factor)
        const amount = formatAmount(scaled, 'de')
        const isChecked = checked.has(idx)
        const header = (ing.group ?? null) !== lastGroup && ing.group ? ing.group : null
        lastGroup = ing.group ?? null
        return (
          <li key={idx}>
            {header && <p className="text-sm font-bold uppercase tracking-wide opacity-70 pt-3 pb-1">{header}</p>}
            <button
              type="button"
              onClick={() => onToggle(idx)}
              aria-pressed={isChecked}
              className={`w-full flex items-center gap-4 text-left rounded-2xl px-3 ${large ? 'py-4' : 'py-3'} active:bg-[hsl(var(--input-bg))] transition-colors`}
            >
              <span className={`shrink-0 ${large ? 'w-9 h-9' : 'w-7 h-7'} rounded-full border-2 flex items-center justify-center ${isChecked ? 'bg-green-600 border-green-600 text-white' : 'border-current opacity-50'}`}>
                {isChecked && <Check size={large ? 22 : 18} strokeWidth={3} />}
              </span>
              <span className={`flex-1 ${large ? 'text-2xl' : 'text-lg'} ${isChecked ? 'line-through opacity-50' : ''}`}>
                {amount && <span className="font-extrabold mr-2 tabular-nums">{amount}</span>}
                <span className="font-medium">{ing.qty === null ? ing.raw : ing.name}</span>
                {ing.mark && <sup className="ml-0.5 font-bold opacity-70">{ing.mark}</sup>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function formatMinutes(min: number | null): string | null {
  if (min == null || min <= 0) return null
  if (min < 60) return `${min} Min.`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`
}

/** **bold** inside a line → <strong>. Everything stays React text (escaped). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={i} className="font-bold text-[hsl(var(--text))]">{part.slice(2, -2)}</strong>
      : <Fragment key={i}>{part.replace(/\\([*_#])/g, '$1')}</Fragment>,
  )
}

/**
 * Tiny Markdown subset for Obsidian text: paragraphs, "- " lists, **bold**.
 * No HTML is ever interpreted.
 */
export function RichText({ text, className = '' }: { text: string; className?: string }) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  let para: string[] = []
  const flushList = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="list-disc pl-6 space-y-1.5">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>)
    list = []
  }
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{para.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l)}</Fragment>)}</p>)
    para = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const item = line.match(/^[-*+]\s+(.*)$/)
    if (item) { flushPara(); list.push(item[1]) }
    else if (!line) { flushPara(); flushList() }
    else { flushList(); para.push(line.replace(/^#{1,6}\s+/, '')) }
  }
  flushPara()
  flushList()
  return <div className={`space-y-3 ${className}`}>{blocks}</div>
}

/** "★ 8/10" */
export function RatingChip({ rating, className = '' }: { rating: number | null; className?: string }) {
  if (rating == null) return null
  return (
    <span className={`inline-flex items-center gap-1 font-bold text-amber-700 dark:text-amber-300 ${className}`} aria-label={`Bewertung ${rating} von 10`}>
      <Star size={16} className="fill-current" /> {rating}/10
    </span>
  )
}
