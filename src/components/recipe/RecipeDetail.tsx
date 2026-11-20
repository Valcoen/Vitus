'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChefHat, Clock, Flame, Drumstick, Pencil, Download, Snowflake, Refrigerator, Scale, RotateCcw } from 'lucide-react'
import type { RecipeView } from '@/lib/recipe/types'
import { HIGH_PROTEIN_GRAMS } from '@/lib/recipe/types'
import CookMode from './CookMode'
import { IngredientChecklist, RecipeImage, ServingsStepper, formatMinutes } from './parts'

const checkKey = (id: string) => `vitus.check.${id}`

export default function RecipeDetail({ recipe, targetKcal, canEdit }: { recipe: RecipeView; targetKcal?: number; canEdit: boolean }) {
  const perServingKcal = recipe.nutrition.kcal
  // From the meal plan: ?kcal=… → scale to that calorie target
  const initialServings = targetKcal && perServingKcal
    ? Math.max(0.5, Math.round((targetKcal / perServingKcal) * 2) / 2)
    : recipe.servings
  const [servings, setServings] = useState(initialServings)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [cooking, setCooking] = useState(false)
  const factor = servings / (recipe.servings || 1)

  // Persist ticked ingredients per recipe on this device
  useEffect(() => {
    try {
      const raw = localStorage.getItem(checkKey(recipe.id))
      if (raw) setChecked(new Set(JSON.parse(raw)))
    } catch { /* ignore */ }
  }, [recipe.id])
  const toggleChecked = useCallback((idx: number) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      try { localStorage.setItem(checkKey(recipe.id), JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }, [recipe.id])
  const resetChecked = () => {
    setChecked(new Set())
    try { localStorage.removeItem(checkKey(recipe.id)) } catch { /* ignore */ }
  }

  // Cook mode is an overlay tied to browser history, so Android "back" closes it
  const openCook = useCallback(() => {
    window.history.pushState({ cook: true }, '', '#kochen')
    setCooking(true)
  }, [])
  const closeCook = useCallback(() => {
    if (window.history.state?.cook) window.history.back()
    else setCooking(false)
  }, [])
  useEffect(() => {
    const onPop = () => setCooking(window.location.hash === '#kochen')
    window.addEventListener('popstate', onPop)
    if (window.location.hash === '#kochen') setCooking(true)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const times = [
    recipe.prepTime ? `Vorbereitung ${formatMinutes(recipe.prepTime)}` : null,
    recipe.cookTime ? `Kochen ${formatMinutes(recipe.cookTime)}` : null,
  ].filter(Boolean)
  const n = recipe.nutrition
  const hasStorage = recipe.fridgeDays != null || recipe.freezable != null || recipe.notes

  return (
    <article className="max-w-3xl mx-auto pb-28 md:pb-8 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link href="/recipes" className="inline-flex items-center gap-2 h-11 text-base font-semibold text-[hsl(var(--text-muted))]">
          <ArrowLeft size={20} /> Rezepte
        </Link>
        <div className="flex gap-2">
          <a href={`/api/recipes/${recipe.id}/export`} className="h-11 px-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] font-semibold flex items-center gap-2" title="Als Markdown exportieren">
            <Download size={18} /> <span className="hidden sm:inline">.md</span>
          </a>
          {canEdit && (
            <Link href={`/recipes/${recipe.id}/edit`} className="h-11 px-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] font-semibold flex items-center gap-2">
              <Pencil size={18} /> Bearbeiten
            </Link>
          )}
        </div>
      </div>

      {/* 1. Hero */}
      <div className="-mx-4 md:mx-0 aspect-[4/3] md:aspect-[16/9] md:rounded-3xl overflow-hidden bg-[hsl(var(--input-bg))]">
        <RecipeImage url={recipe.imageUrl} title={recipe.title} />
      </div>

      {/* 2. Title / time / servings */}
      <header className="space-y-3">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">{recipe.title}</h1>
        {recipe.description && <p className="text-lg text-[hsl(var(--text-muted))]">{recipe.description}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-base font-semibold text-[hsl(var(--text-muted))]">
          {recipe.totalTime ? <span className="flex items-center gap-1.5"><Clock size={18} /> {formatMinutes(recipe.totalTime)}</span> : null}
          {times.length > 0 && <span>{times.join(' · ')}</span>}
          <span>Rezept für {recipe.servings} {recipe.servings === 1 ? 'Portion' : 'Portionen'}</span>
        </div>
        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {recipe.tags.map(t => (
              <Link key={t} href={`/recipes?tag=${encodeURIComponent(t)}`} className="px-3 py-1 rounded-full bg-[hsl(var(--input-bg))] text-sm font-semibold">#{t}</Link>
            ))}
          </div>
        )}
      </header>

      {/* 3. kcal + protein chips only */}
      {(n.kcal != null || n.protein != null) && (
        <div className="flex flex-wrap gap-3">
          {n.kcal != null && (
            <span className="flex items-center gap-2 rounded-2xl bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-100 px-4 py-2 text-lg font-bold">
              <Flame size={20} /> {n.kcal} kcal
            </span>
          )}
          {n.protein != null && (
            <span className="flex items-center gap-2 rounded-2xl bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100 px-4 py-2 text-lg font-bold">
              <Drumstick size={20} /> {String(n.protein).replace('.', ',')} g Protein
              {n.protein >= HIGH_PROTEIN_GRAMS && <span className="text-xs uppercase tracking-wide opacity-80">· High Protein</span>}
            </span>
          )}
          <span className="self-center text-sm font-semibold text-[hsl(var(--text-muted))]">pro Portion</span>
        </div>
      )}

      {targetKcal && (
        <div className="rounded-2xl p-4 bg-[hsl(var(--primary))]/10 flex items-center gap-3">
          <Scale size={22} className="text-[hsl(var(--primary))] shrink-0" />
          <p className="font-semibold">Mengen auf dein Ziel von {targetKcal} kcal angepasst ({String(servings).replace('.', ',')} Portionen).</p>
        </div>
      )}

      {/* 4. Ingredients */}
      <section className="card-apple !p-4 md:!p-6" aria-labelledby="zutaten">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 id="zutaten" className="text-2xl font-bold">Zutaten</h2>
          <ServingsStepper value={servings} onChange={setServings} />
        </div>
        {recipe.ingredients.length === 0 ? (
          <p className="text-[hsl(var(--text-muted))]">Keine Zutaten hinterlegt.</p>
        ) : (
          <>
            <IngredientChecklist ingredients={recipe.ingredients} factor={factor} checked={checked} onToggle={toggleChecked} />
            {checked.size > 0 && (
              <button type="button" onClick={resetChecked} className="mt-3 h-11 px-3 text-sm font-semibold text-[hsl(var(--text-muted))] flex items-center gap-2">
                <RotateCcw size={16} /> Häkchen zurücksetzen
              </button>
            )}
          </>
        )}
      </section>

      {/* 5. Steps + Start cooking */}
      <section className="card-apple !p-4 md:!p-6" aria-labelledby="schritte">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 id="schritte" className="text-2xl font-bold">Zubereitung</h2>
          <button type="button" onClick={openCook} className="hidden md:flex btn-primary gap-2 h-12 px-5">
            <ChefHat size={20} /> Kochen starten
          </button>
        </div>
        {recipe.steps.length === 0 ? (
          <p className="text-[hsl(var(--text-muted))]">Keine Schritte hinterlegt.</p>
        ) : (
          <ol className="space-y-5">
            {recipe.steps.map((s, i) => (
              <li key={i} className="flex gap-4">
                <span className="shrink-0 w-9 h-9 rounded-full bg-[hsl(var(--primary))] text-white font-bold flex items-center justify-center">{i + 1}</span>
                <p className="text-lg leading-relaxed whitespace-pre-line pt-1">{s.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 6. Storage */}
      {hasStorage && (
        <section className="card-apple !p-4 md:!p-6 space-y-3" aria-labelledby="lagerung">
          <h2 id="lagerung" className="text-2xl font-bold">Lagerung & Aufwärmen</h2>
          <div className="flex flex-wrap gap-3">
            {recipe.fridgeDays != null && (
              <span className="flex items-center gap-2 rounded-2xl bg-[hsl(var(--input-bg))] px-4 py-2 font-semibold">
                <Refrigerator size={20} /> {recipe.fridgeDays} {recipe.fridgeDays === 1 ? 'Tag' : 'Tage'} im Kühlschrank
              </span>
            )}
            {recipe.freezable != null && (
              <span className="flex items-center gap-2 rounded-2xl bg-[hsl(var(--input-bg))] px-4 py-2 font-semibold">
                <Snowflake size={20} /> {recipe.freezable ? 'Einfrierbar' : 'Nicht einfrieren'}
              </span>
            )}
          </div>
          {recipe.notes && <p className="text-lg leading-relaxed whitespace-pre-line">{recipe.notes}</p>}
        </section>
      )}

      {/* 7. Nutrition details (collapsed) */}
      <details className="card-apple !p-4 md:!p-6 group">
        <summary className="text-xl font-bold cursor-pointer list-none flex items-center justify-between min-h-11">
          Nährwertdetails <span className="text-sm font-semibold text-[hsl(var(--text-muted))] group-open:hidden">anzeigen</span>
        </summary>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          {[
            ['Kalorien', n.kcal, 'kcal'],
            ['Protein', n.protein, 'g'],
            ['Kohlenhydrate', n.carbs, 'g'],
            ['Fett', n.fat, 'g'],
          ].map(([label, val, unit]) => (
            <div key={label as string} className="rounded-xl bg-[hsl(var(--input-bg))] p-3">
              <dt className="text-sm font-semibold text-[hsl(var(--text-muted))]">{label}</dt>
              <dd className="text-xl font-bold">{val != null ? `${String(val).replace('.', ',')} ${unit}` : '–'}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-[hsl(var(--text-muted))]">
          Pro Portion.{' '}
          {n.source === 'manual' && 'Kalorien/Protein wie im Rezept eingetragen; übrige Werte aus der Lebensmittel-Datenbank, soweit vorhanden.'}
          {n.source === 'computed' && `Berechnet aus ${n.matched} von ${n.total} Zutaten (Lebensmittel-Datenbank).`}
          {n.source === 'none' && 'Keine Nährwerte hinterlegt und keine Zutat in der Lebensmittel-Datenbank gefunden.'}
        </p>
      </details>

      {/* Sticky cook button on phones */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[hsl(var(--background))] via-[hsl(var(--background))] to-transparent">
        <button type="button" onClick={openCook} className="btn-primary w-full h-16 text-xl gap-3 shadow-lg">
          <ChefHat size={26} /> Kochen starten
        </button>
      </div>

      {cooking && (
        <CookMode recipe={recipe} servings={servings} setServings={setServings}
          checked={checked} toggleChecked={toggleChecked} onClose={closeCook} />
      )}
    </article>
  )
}
