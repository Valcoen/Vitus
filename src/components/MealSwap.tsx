'use client'

import { createContext, useContext, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Shuffle, ListChecks, Search, X, Flame } from 'lucide-react'
import { swapMealAction } from '@/app/(dashboard)/meal-plan/actions'

export type SwapRecipe = { id: string; title: string; mealType: string | null; course: string | null; kcal: number | null; image: string | null }

const SwapContext = createContext<SwapRecipe[]>([])
export const SwapProvider = SwapContext.Provider

const fits = (slot: string, mealType: string | null) => {
  const s = slot.toLowerCase()
  const t = (mealType ?? '').toLowerCase()
  if (s.includes('frühstück')) return t === 'breakfast'
  if (s.includes('mittag') || s.includes('abend')) return t === 'lunch' || t === 'dinner'
  if (s.includes('snack')) return t === 'snack'
  return true
}

/** "Anderes Rezept": random or chosen. Replaces the whole batch. */
export default function MealSwap({ mealId, slot, currentRecipeId, isBatch }: { mealId: string; slot: string; currentRecipeId: string | null; isBatch: boolean }) {
  const recipes = useContext(SwapContext)
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const swap = (recipeId: string | null) => start(async () => {
    setMsg(null)
    const res = await swapMealAction(mealId, recipeId)
    if (res.ok) {
      setOpen(false)
      setMsg(`Getauscht: ${res.title}`)
      router.refresh()
    } else setMsg(res.error)
  })

  const list = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return recipes
      .filter(r => r.id !== currentRecipeId && words.every(w => r.title.toLowerCase().includes(w)))
      .sort((a, b) => Number(fits(slot, b.mealType)) - Number(fits(slot, a.mealType)) || a.title.localeCompare(b.title))
  }, [recipes, query, slot, currentRecipeId])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => swap(null)} className="btn-secondary h-11 px-4 gap-2 text-sm disabled:opacity-50">
          <Shuffle size={16} /> Zufällig tauschen
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(true)} className="btn-secondary h-11 px-4 gap-2 text-sm disabled:opacity-50">
          <ListChecks size={16} /> Selbst wählen
        </button>
      </div>
      {isBatch && <p className="text-xs font-semibold text-[hsl(var(--text-muted))]">Gilt für alle Tage dieses Meal-Preps.</p>}
      {msg && <p role="status" className="text-sm font-semibold">{msg}</p>}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Rezept wählen" onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[hsl(var(--card))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="flex-1 text-xl font-bold">Rezept für {slot}</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Schließen" className="w-11 h-11 rounded-xl flex items-center justify-center bg-[hsl(var(--input-bg))]"><X size={22} /></button>
            </div>
            <div className="relative mb-3">
              <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
              <input autoFocus type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Rezept suchen"
                className="input-apple h-12 pl-11 text-lg bg-[hsl(var(--background))]" />
            </div>
            <ul className="overflow-y-auto -mx-1 px-1 space-y-1.5">
              {list.length === 0 && <li className="p-4 text-center text-[hsl(var(--text-muted))]">Nichts gefunden.</li>}
              {list.map(r => (
                <li key={r.id}>
                  <button type="button" disabled={pending} onClick={() => swap(r.id)}
                    className="w-full min-h-14 flex items-center gap-3 rounded-2xl px-3 py-2 text-left bg-[hsl(var(--input-bg))] active:scale-[0.99] disabled:opacity-50">
                    {r.image
                      ? <img src={r.image} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                      : <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-200 to-amber-300 shrink-0" />}
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold truncate">{r.title}</span>
                      <span className="block text-sm text-[hsl(var(--text-muted))]">
                        {[r.course, fits(slot, r.mealType) ? null : 'passt eher nicht zu ' + slot].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {r.kcal != null && <span className="text-sm font-bold flex items-center gap-1 shrink-0"><Flame size={14} />{r.kcal}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
