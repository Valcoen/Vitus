'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Clock, Flame, Drumstick, X, SlidersHorizontal, FilePen, Star } from 'lucide-react'
import { RecipeImage, formatMinutes, RatingChip } from './parts'
import { HIGH_PROTEIN_GRAMS } from '@/lib/recipe/types'

export type RecipeCard = {
  id: string
  title: string
  imageUrl: string | null
  totalTime: number | null
  kcal: number | null
  protein: number | null
  tags: string[]
  status: 'draft' | 'ready'
  rating: number | null
  /** lower-cased text for search: title, tags, ingredient names */
  haystack: string
}

const TIME_OPTIONS = [20, 30, 45, 60]

export default function ExploreGrid({ recipes, initialTag, initialQuery, initialDrafts }: { recipes: RecipeCard[]; initialTag?: string; initialQuery?: string; initialDrafts?: boolean }) {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [drafts, setDrafts] = useState(!!initialDrafts)
  const [byRating, setByRating] = useState(false)
  const draftCount = recipes.filter(r => r.status === 'draft').length
  const [tags, setTags] = useState<string[]>(initialTag ? [initialTag] : [])
  const [maxTime, setMaxTime] = useState<number | null>(null)
  const [highProtein, setHighProtein] = useState(false)
  const [showAllTags, setShowAllTags] = useState(false)

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    recipes.forEach(r => r.tags.forEach(t => counts.set(t, (counts.get(t) ?? 0) + 1)))
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
  }, [recipes])

  // Keep filters in the URL so a filtered view can be shared/bookmarked
  useEffect(() => {
    const p = new URLSearchParams()
    if (query) p.set('q', query)
    if (tags.length === 1) p.set('tag', tags[0])
    if (drafts) p.set('drafts', '1')
    const qs = p.toString()
    window.history.replaceState(window.history.state, '', qs ? `?${qs}` : window.location.pathname)
  }, [query, tags, drafts])

  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const filtered = recipes.filter(r =>
    (drafts ? r.status === 'draft' : r.status !== 'draft') &&
    words.every(w => r.haystack.includes(w)) &&
    tags.every(t => r.tags.includes(t)) &&
    (maxTime === null || (r.totalTime !== null && r.totalTime <= maxTime)) &&
    (!highProtein || (r.protein ?? 0) >= HIGH_PROTEIN_GRAMS),
  )
  if (byRating) filtered.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.title.localeCompare(b.title))
  const activeFilters = tags.length + (maxTime ? 1 : 0) + (highProtein ? 1 : 0) + (query ? 1 : 0) + (drafts ? 1 : 0)
  const reset = () => { setQuery(''); setTags([]); setMaxTime(null); setHighProtein(false); setDrafts(false) }
  const toggleTag = (t: string) => setTags(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]))
  const chip = (active: boolean) =>
    `h-11 px-4 rounded-full text-base font-semibold whitespace-nowrap border transition-colors ${active ? 'bg-[hsl(var(--primary))] text-white border-transparent' : 'bg-[hsl(var(--card))] border-[hsl(var(--border))]'}`
  const visibleTags = showAllTags ? allTags : allTags.slice(0, 8)

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[hsl(var(--text-muted))]" size={22} />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Rezept, Zutat oder Tag suchen"
          className="input-apple bg-[hsl(var(--card))] h-14 pl-12 text-lg" aria-label="Rezepte suchen" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap" role="group" aria-label="Filter">
        {draftCount > 0 && (
          <button type="button" className={chip(drafts)} aria-pressed={drafts} onClick={() => setDrafts(v => !v)}>
            <FilePen size={16} className="inline -mt-0.5 mr-1" />Entwürfe ({draftCount})
          </button>
        )}
        <button type="button" className={chip(byRating)} aria-pressed={byRating} onClick={() => setByRating(v => !v)}>
          <Star size={16} className="inline -mt-0.5 mr-1" />Beste zuerst
        </button>
        <button type="button" className={chip(highProtein)} aria-pressed={highProtein} onClick={() => setHighProtein(v => !v)}>
          <Drumstick size={16} className="inline -mt-0.5 mr-1" />High Protein
        </button>
        {TIME_OPTIONS.map(t => (
          <button key={t} type="button" className={chip(maxTime === t)} aria-pressed={maxTime === t} onClick={() => setMaxTime(maxTime === t ? null : t)}>
            <Clock size={16} className="inline -mt-0.5 mr-1" />≤ {t} Min.
          </button>
        ))}
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Tags">
          {visibleTags.map(t => (
            <button key={t} type="button" className={chip(tags.includes(t))} aria-pressed={tags.includes(t)} onClick={() => toggleTag(t)}>#{t}</button>
          ))}
          {allTags.length > 8 && (
            <button type="button" className="h-11 px-3 font-semibold text-[hsl(var(--text-muted))]" onClick={() => setShowAllTags(v => !v)}>
              <SlidersHorizontal size={16} className="inline -mt-0.5 mr-1" />{showAllTags ? 'Weniger' : `+${allTags.length - 8} Tags`}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between min-h-11">
        <p className="font-semibold text-[hsl(var(--text-muted))]">{filtered.length} {filtered.length === 1 ? 'Rezept' : 'Rezepte'}</p>
        {activeFilters > 0 && (
          <button type="button" onClick={reset} className="h-11 px-3 font-semibold flex items-center gap-1 text-[hsl(var(--primary))]"><X size={18} /> Filter zurücksetzen</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card-apple text-center py-14">
          <p className="text-lg font-bold mb-2">{recipes.length === 0 ? 'Noch keine Rezepte' : 'Nichts gefunden'}</p>
          <p className="text-[hsl(var(--text-muted))]">{recipes.length === 0 ? 'Leg das erste Rezept an oder importiere deine Obsidian-Rezepte.' : 'Versuch es mit weniger Filtern.'}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 min-[440px]:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(r => (
            <li key={r.id}>
              <Link href={`/recipes/${r.id}`} className="block rounded-3xl overflow-hidden bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-[var(--shadow-soft)] active:scale-[0.99] transition-transform">
                <div className="relative aspect-[4/3] bg-[hsl(var(--input-bg))]">
                  <RecipeImage url={r.imageUrl} title={r.title} />
                  {r.status === 'draft' && <span className="absolute top-3 left-3 rounded-full bg-amber-400 text-black px-3 py-1 text-sm font-bold">Entwurf</span>}
                </div>
                <div className="p-4 space-y-2">
                  <h3 className="text-lg font-bold leading-snug line-clamp-2">{r.title}</h3>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-[hsl(var(--text-muted))]">
                    <RatingChip rating={r.rating} />
                    {r.totalTime ? <span className="flex items-center gap-1"><Clock size={15} />{formatMinutes(r.totalTime)}</span> : null}
                    {r.kcal != null && <span className="flex items-center gap-1"><Flame size={15} />{r.kcal} kcal</span>}
                    {r.protein != null && (
                      <span className={`flex items-center gap-1 ${r.protein >= HIGH_PROTEIN_GRAMS ? 'text-blue-700 dark:text-blue-300' : ''}`}>
                        <Drumstick size={15} />{String(r.protein).replace('.', ',')} g
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
