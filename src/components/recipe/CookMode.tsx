'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Sun, SunDim, Timer, Pause, Play, Plus, Minus, BellOff, Trash2 } from 'lucide-react'
import type { RecipeView } from '@/lib/recipe/types'
import { detectTimers, formatDuration } from '@/lib/recipe/timers'
import { formatAmount, scaleIngredient } from '@/lib/recipe/ingredients'
import { ingredientsInStep } from '@/lib/recipe/stepIngredients'
import { useTimers } from './useTimers'
import { useWakeLock } from './useWakeLock'
import { IngredientChecklist, ServingsStepper } from './parts'

type Props = {
  recipe: RecipeView
  servings: number
  setServings: (v: number) => void
  checked: Set<number>
  toggleChecked: (idx: number) => void
  onClose: () => void
}

/** One suggested timer on a step: editable length, then start. */
function TimerSuggestion({ seconds, label, onStart }: { seconds: number; label: string; onStart: (s: number) => void }) {
  const [s, setS] = useState(seconds)
  useEffect(() => setS(seconds), [seconds])
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-[hsl(var(--input-bg))] p-2">
      <Timer className="ml-2 shrink-0" size={26} />
      <button type="button" aria-label="Eine Minute weniger" onClick={() => setS(v => Math.max(60, v - 60))}
        className="w-12 h-12 rounded-xl bg-[hsl(var(--card))] flex items-center justify-center active:scale-95"><Minus size={22} /></button>
      <span className="text-2xl font-extrabold tabular-nums min-w-[5.5rem] text-center">{formatDuration(s)}</span>
      <button type="button" aria-label="Eine Minute mehr" onClick={() => setS(v => v + 60)}
        className="w-12 h-12 rounded-xl bg-[hsl(var(--card))] flex items-center justify-center active:scale-95"><Plus size={22} /></button>
      <button type="button" onClick={() => onStart(s)}
        className="ml-auto h-12 px-5 rounded-xl bg-[hsl(var(--primary))] text-white text-lg font-bold flex items-center gap-2 active:scale-95">
        <Play size={20} fill="currentColor" /> Start
      </button>
      <span className="sr-only">{label}</span>
    </div>
  )
}

export default function CookMode({ recipe, servings, setServings, checked, toggleChecked, onClose }: Props) {
  const steps = recipe.steps
  // page 0 = mise en place (ingredients), pages 1..n = steps
  const pageCount = steps.length + 1
  const [page, setPage] = useState(0)
  const factor = servings / (recipe.servings || 1)
  const wake = useWakeLock(true)
  const { timers, add, toggle, addMinute, dismiss, remove, unlockAlerts } = useTimers(recipe.id)
  const touch = useRef<{ x: number; y: number } | null>(null)

  // Register the service worker (for notifications on Android)
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  // Keyboard navigation (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setPage(p => Math.min(pageCount - 1, p + 1))
      if (e.key === 'ArrowLeft') setPage(p => Math.max(0, p - 1))
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pageCount, onClose])

  // Lock page scroll behind the overlay
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const step = page > 0 ? steps[page - 1] : null
  const stepTimers = useMemo(() => {
    if (!step) return []
    if (step.timer_seconds) return [{ seconds: step.timer_seconds, maxSeconds: null, text: formatDuration(step.timer_seconds) }]
    return detectTimers(step.text)
  }, [step])
  const stepIngredients = useMemo(
    () => (step ? ingredientsInStep(step.text, recipe.ingredients) : []),
    [step, recipe.ingredients],
  )

  const next = () => (page < pageCount - 1 ? setPage(page + 1) : onClose())
  const prev = () => setPage(Math.max(0, page - 1))

  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && page < pageCount - 1) setPage(page + 1)
      if (dx > 0) prev()
    }
  }

  const ringing = timers.filter(t => t.ringing)
  const visibleTimers = timers.filter(t => !t.done || t.ringing)

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[hsl(var(--background))] text-[hsl(var(--text))]"
      role="dialog" aria-modal="true" aria-label={`Kochmodus: ${recipe.title}`} onClick={() => unlockAlerts(false)}>
      {/* Header */}
      <header className="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <button type="button" onClick={onClose} aria-label="Kochmodus schließen"
          className="w-12 h-12 rounded-2xl flex items-center justify-center active:bg-[hsl(var(--input-bg))]"><X size={28} /></button>
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate">{recipe.title}</p>
          <p className="text-sm font-semibold opacity-70">{page === 0 ? 'Vorbereitung' : `Schritt ${page} von ${steps.length}`}</p>
        </div>
        <button type="button" onClick={() => wake.setEnabled(!wake.enabled)} aria-pressed={wake.enabled}
          aria-label={wake.enabled ? 'Bildschirm-Wachhalten ausschalten' : 'Bildschirm wach halten'}
          className={`h-12 px-3 rounded-2xl flex items-center gap-1.5 text-sm font-bold ${wake.active ? 'bg-amber-400 text-black' : 'bg-[hsl(var(--input-bg))]'}`}>
          {wake.active ? <Sun size={22} /> : <SunDim size={22} />}
          <span className="hidden sm:inline">{wake.active ? 'Display an' : 'Display aus'}</span>
        </button>
      </header>

      {!wake.supported && wake.enabled && (
        <p className="px-4 py-2 text-sm font-semibold bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          Dein Browser kann den Bildschirm nicht wach halten. Stell die automatische Sperre in den Handy-Einstellungen vorübergehend länger.
        </p>
      )}
      {wake.supported && wake.enabled && wake.error && (
        <p className="px-4 py-2 text-sm font-semibold bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          Bildschirm-Wachhalten nicht aktiv: {wake.error}
        </p>
      )}

      {/* Progress */}
      <div className="flex gap-1 px-3 py-2" aria-hidden>
        {Array.from({ length: pageCount }).map((_, i) => (
          <button key={i} type="button" tabIndex={-1} onClick={() => setPage(i)}
            className={`h-2 flex-1 rounded-full ${i <= page ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--input-bg))]'}`} />
        ))}
      </div>

      {/* Body (swipe area) */}
      <main className="flex-1 overflow-y-auto px-5 py-4" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {page === 0 ? (
          <section>
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <h2 className="text-3xl font-extrabold">Zutaten bereitstellen</h2>
              <ServingsStepper value={servings} onChange={setServings} compact />
            </div>
            {recipe.ingredients.length === 0
              ? <p className="text-xl opacity-70">Keine Zutaten hinterlegt.</p>
              : <IngredientChecklist ingredients={recipe.ingredients} factor={factor} checked={checked} onToggle={toggleChecked} large />}
            {steps.length === 0 && <p className="mt-6 text-xl opacity-70">Für dieses Rezept sind keine Schritte hinterlegt.</p>}
          </section>
        ) : step && (
          <section className="space-y-6">
            <p className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--primary))]">Schritt {page}</p>
            <p className="text-[1.75rem] leading-snug font-semibold whitespace-pre-line">{step.text}</p>

            {stepIngredients.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Zutaten in diesem Schritt">
                {stepIngredients.map(i => {
                  const ing = scaleIngredient(recipe.ingredients[i], factor)
                  return (
                    <li key={i} className="rounded-2xl bg-[hsl(var(--input-bg))] px-4 py-2 text-xl">
                      {ing.qty !== null && <span className="font-extrabold mr-1.5 tabular-nums">{formatAmount(ing, 'de')}</span>}
                      <span className="font-medium">{ing.qty === null ? ing.raw : ing.name}</span>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="space-y-3">
              {stepTimers.map((t, i) => (
                <TimerSuggestion key={`${page}-${i}`} seconds={t.seconds}
                  label={`Schritt ${page}: ${t.text}${t.maxSeconds ? ` (bis ${formatDuration(t.maxSeconds)})` : ''}`}
                  onStart={s => add(page, `Schritt ${page} · ${formatDuration(s)}`, s)} />
              ))}
              {stepTimers.length === 0 && (
                <button type="button" onClick={() => add(page, `Schritt ${page} · 5:00`, 300)}
                  className="h-12 px-4 rounded-2xl bg-[hsl(var(--input-bg))] font-bold flex items-center gap-2 active:scale-95">
                  <Timer size={22} /> Timer (5 Min.) starten
                </button>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Timers tray */}
      {visibleTimers.length > 0 && (
        <section aria-label="Laufende Timer" className="border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 space-y-2 max-h-[40vh] overflow-y-auto">
          {visibleTimers.map(t => (
            <div key={t.id}
              className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${t.ringing ? 'bg-red-600 text-white animate-pulse' : 'bg-[hsl(var(--input-bg))]'}`}>
              <button type="button" onClick={() => setPage(t.stepIndex)} className="flex-1 min-w-0 text-left">
                <span className="block text-sm font-semibold truncate opacity-90">{t.label}</span>
                <span className="block text-3xl font-extrabold tabular-nums leading-tight">{t.ringing ? 'Fertig!' : t.display}</span>
              </button>
              {t.ringing ? (
                <button type="button" onClick={() => dismiss(t.id)}
                  className="h-14 px-5 rounded-2xl bg-white text-red-700 text-lg font-extrabold flex items-center gap-2 active:scale-95">
                  <BellOff size={22} /> Stopp
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => addMinute(t.id)} aria-label="Eine Minute dazu"
                    className="h-12 px-3 rounded-xl bg-[hsl(var(--card))] font-bold active:scale-95">+1</button>
                  <button type="button" onClick={() => toggle(t.id)} aria-label={t.running ? 'Pausieren' : 'Fortsetzen'}
                    className="w-12 h-12 rounded-xl bg-[hsl(var(--card))] flex items-center justify-center active:scale-95">
                    {t.running ? <Pause size={22} /> : <Play size={22} />}
                  </button>
                  <button type="button" onClick={() => remove(t.id)} aria-label="Timer löschen"
                    className="w-12 h-12 rounded-xl flex items-center justify-center opacity-70 active:scale-95"><Trash2 size={20} /></button>
                </>
              )}
            </div>
          ))}
          {ringing.length === 0 && timers.some(t => t.done) && (
            <button type="button" onClick={() => timers.filter(t => t.done).forEach(t => remove(t.id))}
              className="text-sm font-semibold opacity-70 px-2">Abgelaufene Timer entfernen</button>
          )}
        </section>
      )}

      {/* Footer nav (thumb zone) */}
      <footer className="grid grid-cols-[1fr_2fr] gap-3 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <button type="button" onClick={prev} disabled={page === 0}
          className="h-16 rounded-2xl bg-[hsl(var(--input-bg))] text-xl font-bold flex items-center justify-center gap-1 disabled:opacity-30 active:scale-95">
          <ChevronLeft size={28} /> Zurück
        </button>
        <button type="button" onClick={next}
          className="h-16 rounded-2xl bg-[hsl(var(--primary))] text-white text-xl font-extrabold flex items-center justify-center gap-1 active:scale-95">
          {page === 0 ? 'Los geht’s' : page === pageCount - 1 ? 'Fertig' : 'Weiter'} {page < pageCount - 1 && <ChevronRight size={28} />}
        </button>
      </footer>
    </div>
  )
}
