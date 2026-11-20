'use client'

import { useMemo, useState } from 'react'
import { Search, X, ArrowLeft, Check } from 'lucide-react'
import { gramsFor, normKey, baseName, type FoodItemLite } from '@/lib/recipe/nutrition'
import { formatQuantity, parseNumber } from '@/lib/recipe/ingredients'

const COOKED = /gekocht|gedämpft|gedünstet|gebraten|gebacken|geröstet|zubereitet|konserve|getrocknet|eingelegt|paniert|frittiert|aufgewärmt/i

/** Search score: lower is better, null = no match. */
function score(f: FoodItemLite, words: string[]): number | null {
  const name = normKey(f.name)
  const hay = [name, ...(f.aliases ?? []).map(normKey)]
  let s = 0
  for (const w of words) {
    let best: number | null = null
    for (const h of hay) {
      const i = h.indexOf(w)
      if (i < 0) continue
      const atWord = i === 0 ? 0 : /[\s,(-]/.test(h[i - 1]) ? 1 : 3
      const v = atWord + (h === name ? 0 : 0.5)
      if (best === null || v < best) best = v
    }
    if (best === null) return null
    s += best
  }
  if (f.kind && f.kind !== 'ingredient') s += 4
  if (COOKED.test(f.name)) s += 2
  if (/\broh\b/.test(f.name)) s -= 0.5
  if (f.source === 'vitus') s -= 0.5
  return s + f.name.length / 200
}

export function searchFoods(foods: FoodItemLite[], query: string, limit = 60): FoodItemLite[] {
  const words = normKey(query).split(' ').filter(Boolean)
  if (!words.length) return []
  const hits: [number, FoodItemLite][] = []
  for (const f of foods) {
    if (f.is_hidden) continue
    const s = score(f, words)
    if (s !== null) hits.push([s, f])
  }
  return hits.sort((a, b) => a[0] - b[0]).slice(0, limit).map(h => h[1])
}

/** "Zwiebel, roh" → "Zwiebel" for the ingredient line; keeps names without a state. */
export function displayName(food: FoodItemLite): string {
  return /,\s*(roh|nature)\b/.test(food.name) ? baseName(food.name) : food.name
}

/** Units that make sense for a food (always g; ml for liquids; its own units). */
export function unitsFor(food: FoodItemLite): string[] {
  const own = Object.keys(food.unit_grams ?? {})
  const units = ['g', ...own.filter(u => u !== 'EL' && u !== 'TL')]
  if (food.density || food.kind === 'drink' || /öl|milch|sahne|saft|brühe|wein|essig|sauce|soße|sirup/i.test(food.name)) units.push('ml')
  units.push('EL', 'TL')
  return [...new Set(units)]
}

type Props = {
  foods: FoodItemLite[]
  /** Linking an existing row: only choose a food. Adding: choose food + amount. */
  mode: 'link' | 'add'
  initialQuery?: string
  onPick: (food: FoodItemLite, line?: string) => void
  onClose: () => void
}

export default function FoodPicker({ foods, mode, initialQuery = '', onPick, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [chosen, setChosen] = useState<FoodItemLite | null>(null)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('g')
  const results = useMemo(() => searchFoods(foods, query), [foods, query])

  const choose = (f: FoodItemLite) => {
    if (mode === 'link') return onPick(f)
    setChosen(f)
    const own = Object.keys(f.unit_grams ?? {}).find(u => u !== 'EL' && u !== 'TL')
    setUnit(own ?? 'g')
    setAmount(own ? '1' : '')
  }

  const qty = parseNumber(amount.replace(',', '.'))
  const grams = chosen && qty ? gramsFor({ raw: '', qty, unit: unit === 'Stück' ? null : unit, name: chosen.name }, chosen) : null
  const add = () => {
    if (!chosen || !qty) return
    const name = displayName(chosen)
    const unitText = unit === 'Stück' ? '' : ` ${unit}`
    onPick(chosen, `${formatQuantity(qty, 'de')}${unitText} ${name}`)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-label="Lebensmittel wählen" onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-lg h-[85vh] sm:h-auto sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[hsl(var(--card))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 mb-3">
          {chosen && (
            <button type="button" onClick={() => setChosen(null)} aria-label="Zurück" className="w-11 h-11 rounded-xl flex items-center justify-center bg-[hsl(var(--input-bg))]"><ArrowLeft size={22} /></button>
          )}
          <h3 className="flex-1 text-xl font-bold">{chosen ? 'Menge' : mode === 'link' ? 'Nährwerte verknüpfen' : 'Zutat aus der Datenbank'}</h3>
          <button type="button" onClick={onClose} aria-label="Schließen" className="w-11 h-11 rounded-xl flex items-center justify-center bg-[hsl(var(--input-bg))]"><X size={22} /></button>
        </div>

        {!chosen ? (
          <>
            <div className="relative mb-3">
              <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
              <input autoFocus type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="z. B. Zwiebel, Mehl, Hähnchen"
                className="input-apple h-12 pl-11 text-lg bg-[hsl(var(--background))]" aria-label="Lebensmittel suchen" />
            </div>
            <ul className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1.5">
              {query && results.length === 0 && <li className="p-4 text-center text-[hsl(var(--text-muted))]">Nichts gefunden – anders schreiben oder als Text lassen.</li>}
              {!query && <li className="p-4 text-center text-[hsl(var(--text-muted))]">Über 1.200 Lebensmittel. Tippe los.</li>}
              {results.map(f => (
                <li key={f.id}>
                  <button type="button" onClick={() => choose(f)}
                    className="w-full min-h-14 flex items-center gap-3 rounded-2xl px-3 py-2 text-left bg-[hsl(var(--input-bg))] active:scale-[0.99]">
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold leading-snug">{f.name}</span>
                      <span className="block text-xs text-[hsl(var(--text-muted))]">
                        {Math.round(f.kcal_100g)} kcal · {String(Math.round(f.protein_100g * 10) / 10).replace('.', ',')} g Protein / 100 g
                        {f.kind === 'dish' ? ' · Gericht' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-lg font-bold">{chosen.name}</p>
            <div className="flex gap-2">
              <input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Menge"
                className="input-apple h-14 text-2xl font-bold w-32 bg-[hsl(var(--background))]" aria-label="Menge"
                onKeyDown={e => { if (e.key === 'Enter') add() }} />
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Einheit">
                {unitsFor(chosen).map(u => (
                  <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => setUnit(u)}
                    className={`h-14 min-w-14 px-3 rounded-2xl font-bold border-2 ${unit === u ? 'bg-[hsl(var(--primary))] text-white border-transparent' : 'border-[hsl(var(--border))]'}`}>
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-sm text-[hsl(var(--text-muted))] min-h-5">
              {grams != null
                ? `≈ ${Math.round(grams)} g · ${Math.round(chosen.kcal_100g * grams / 100)} kcal`
                : qty ? 'Für diese Einheit kennt Vitus kein Gewicht – zählt nicht zu den Nährwerten.' : ''}
            </p>
            <button type="button" disabled={!qty} onClick={add} className="btn-primary w-full h-14 text-lg gap-2 disabled:opacity-50">
              <Check size={22} /> Hinzufügen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
