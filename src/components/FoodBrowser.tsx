'use client'

import { useMemo, useState } from 'react'
import { Search, Leaf, Sprout } from 'lucide-react'
import type { FoodItemLite } from '@/lib/recipe/nutrition'
import { searchFoods } from '@/components/recipe/FoodPicker'

type Aisle = { slug: string; label: string }

/** pseudo aisle for the "Gewürze" chip (spices sit in the "kraeuter" aisle with fresh herbs) */
const SPICES = '__spices'

const fmt = (n: number | null | undefined) => (n == null ? '–' : String(Math.round(n * 10) / 10).replace('.', ','))

/** Searchable food list (≈1,300 entries) with aisle filter. */
export default function FoodBrowser({ foods, aisles }: { foods: FoodItemLite[]; aisles: Aisle[] }) {
  const [query, setQuery] = useState('')
  const [aisle, setAisle] = useState('')
  const [showDishes, setShowDishes] = useState(false)
  const label = useMemo(() => Object.fromEntries(aisles.map(a => [a.slug, a.label])), [aisles])

  const list = useMemo(() => {
    const base = query.trim() ? searchFoods(foods, query, 300) : foods.filter(f => !f.is_hidden)
    return base
      .filter(f => !aisle || (aisle === SPICES ? f.is_spice : f.food_category === aisle))
      .filter(f => showDishes || query.trim() || !f.kind || f.kind === 'ingredient')
      .slice(0, 150)
  }, [foods, query, aisle, showDishes])

  const chip = (active: boolean) =>
    `h-11 px-4 rounded-full font-semibold whitespace-nowrap border ${active ? 'bg-[hsl(var(--primary))] text-white border-transparent' : 'bg-[hsl(var(--card))] border-[hsl(var(--border))]'}`

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[hsl(var(--text-muted))]" size={22} />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Lebensmittel suchen, z. B. Paprika, Feta, Hähnchen"
          className="input-apple bg-[hsl(var(--card))] h-14 pl-12 text-lg" aria-label="Lebensmittel suchen" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap" role="group" aria-label="Kategorie">
        <button type="button" className={chip(!aisle)} onClick={() => setAisle('')}>Alle</button>
        <button type="button" className={chip(aisle === SPICES)} aria-pressed={aisle === SPICES} onClick={() => setAisle(aisle === SPICES ? '' : SPICES)}>Gewürze</button>
        {aisles.map(a => (
          <button key={a.slug} type="button" className={chip(aisle === a.slug)} aria-pressed={aisle === a.slug} onClick={() => setAisle(aisle === a.slug ? '' : a.slug)}>{a.label}</button>
        ))}
      </div>
      <label className="flex items-center gap-3 min-h-11 font-semibold">
        <input type="checkbox" className="w-5 h-5" checked={showDishes} onChange={e => setShowDishes(e.target.checked)} /> Auch Gerichte und Getränke zeigen
      </label>

      <p className="font-semibold text-[hsl(var(--text-muted))]">{list.length === 150 ? 'Die ersten 150 – Suche verfeinern' : `${list.length} Lebensmittel`}</p>
      <ul className="divide-y divide-[hsl(var(--border))] card-apple !p-0 overflow-hidden">
        {list.map(f => (
          <li key={f.id} className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold leading-snug">{f.name}</p>
              <p className="text-xs text-[hsl(var(--text-muted))]">
                {f.food_category ? label[f.food_category] : 'Ohne Kategorie'}
                {f.unit_grams && Object.keys(f.unit_grams).filter(u => u !== 'EL' && u !== 'TL').length > 0 &&
                  ' · ' + Object.entries(f.unit_grams).filter(([u]) => u !== 'EL' && u !== 'TL').map(([u, g]) => `1 ${u} ≈ ${g} g`).join(', ')}
                {f.source === 'vitus' ? ' · eigener Eintrag' : f.source === 'manual' && !f.is_spice ? ' · Richtwert' : ''}
              </p>
              {f.health_note && <p className="text-sm mt-1 leading-snug">{f.health_note}</p>}
              {f.source_note && <p className="text-xs mt-1 text-[hsl(var(--text-muted))]">{f.source_note}</p>}
            </div>
            {f.is_vegan ? <Sprout size={18} className="text-green-600 shrink-0" aria-label="vegan" />
              : f.is_vegetarian ? <Leaf size={18} className="text-green-600 shrink-0" aria-label="vegetarisch" /> : null}
            <div className="text-right shrink-0 tabular-nums self-start">
              {f.is_spice && f.kcal_100g === 0 ? (
                <p className="font-bold">Gewürz</p>
              ) : (
                <>
                  <p className="font-bold">{Math.round(f.kcal_100g)} kcal</p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">P {fmt(f.protein_100g)} · K {fmt(f.carbs_100g)} · F {fmt(f.fat_100g)}</p>
                </>
              )}
              {f.is_spice && f.kcal_100g > 0 && <p className="text-xs font-semibold text-[hsl(var(--text-muted))]">Gewürz</p>}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-[hsl(var(--text-muted))]">
        Werte pro 100 g. Quelle: Schweizer Nährwertdatenbank, Bundesamt für Lebensmittelsicherheit und Veterinärwesen BLV (naehrwertdaten.ch),
        ergänzt um eigene Einträge und Richtwerte. Gewürze zählen wegen der kleinen Mengen mit 0 kcal.
        Die Hinweise zu Gewürzen beschreiben traditionelle Verwendung und Studienlage – sie sind kein medizinischer Rat.
      </p>
    </div>
  )
}
