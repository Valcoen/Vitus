'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Clock, Flame, Drumstick, X, FilePen, Star, Cake, Leaf, Sprout } from 'lucide-react'
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
  course: string | null
  cuisine: string | null
  diet: string[]
  /** lower-cased text for search: title, tags, ingredient names */
  haystack: string
}

const TIME_OPTIONS = [20, 30, 45, 60]

export type Option = { slug: string; label: string; is_treat?: boolean }

export default function ExploreGrid({ recipes, initialTag, initialQuery, initialDrafts, initialCourse, initialCuisine, courses, cuisines }: {
  recipes: RecipeCard[]; initialTag?: string; initialQuery?: string; initialDrafts?: boolean
  initialCourse?: string; initialCuisine?: string; courses: Option[]; cuisines: Option[]
}) {
  // course filter: a slug, or "treats" for everything sweet ("Gönnen")
  const [course, setCourse] = useState<string | null>(initialCourse ?? null)
  const [cuisine, setCuisine] = useState<string>(initialCuisine ?? '')
  const [diet, setDiet] = useState<'vegetarian' | 'vegan' | null>(null)
  const treatSlugs = useMemo(() => new Set(courses.filter(c => c.is_treat).map(c => c.slug)), [courses])
  const courseLabel = useMemo(() => Object.fromEntries(courses.map(c => [c.slug, c.label])), [courses])
  const cuisineLabel = useMemo(() => Object.fromEntries(cuisines.map(c => [c.slug, c.label])), [cuisines])
  // only offer what is used
  const usedCourses = courses.filter(c => recipes.some(r => r.course === c.slug))
  const usedCuisines = cuisines.filter(c => recipes.some(r => r.cuisine === c.slug))
  const [query, setQuery] = useState(initialQuery ?? '')
  const [drafts, setDrafts] = useState(!!initialDrafts)
  const [byRating, setByRating] = useState(false)
  const draftCount = recipes.filter(r => r.status === 'draft').length
  const [tags, setTags] = useState<string[]>(initialTag ? [initialTag] : [])
  const [maxTime, setMaxTime] = useState<number | null>(null)
  const [highProtein, setHighProtein] = useState(false)

  // Keep filters in the URL so a filtered view can be shared/bookmarked
  useEffect(() => {
    const p = new URLSearchParams()
    if (query) p.set('q', query)
    if (tags.length === 1) p.set('tag', tags[0])
    if (drafts) p.set('drafts', '1')
    if (course) p.set('art', course)
    if (cuisine) p.set('kueche', cuisine)
    const qs = p.toString()
    window.history.replaceState(window.history.state, '', qs ? `?${qs}` : window.location.pathname)
  }, [query, tags, drafts, course, cuisine])

  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const filtered = recipes.filter(r =>
    (drafts ? r.status === 'draft' : r.status !== 'draft') &&
    words.every(w => r.haystack.includes(w)) &&
    tags.every(t => r.tags.includes(t)) &&
    (!course || (course === 'treats' ? !!r.course && treatSlugs.has(r.course) : r.course === course)) &&
    (!cuisine || r.cuisine === cuisine) &&
    (!diet || r.diet.includes(diet)) &&
    (maxTime === null || (r.totalTime !== null && r.totalTime <= maxTime)) &&
    (!highProtein || (r.protein ?? 0) >= HIGH_PROTEIN_GRAMS),
  )
  if (byRating) filtered.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.title.localeCompare(b.title))
  const activeFilters = tags.length + (maxTime ? 1 : 0) + (highProtein ? 1 : 0) + (query ? 1 : 0) + (drafts ? 1 : 0) + (course ? 1 : 0) + (cuisine ? 1 : 0) + (diet ? 1 : 0)
  const reset = () => { setQuery(''); setTags([]); setMaxTime(null); setHighProtein(false); setDrafts(false); setCourse(null); setCuisine(''); setDiet(null) }
  const chip = (active: boolean) =>
    `h-11 px-4 rounded-full text-base font-semibold whitespace-nowrap border transition-colors ${active ? 'bg-[hsl(var(--primary))] text-white border-transparent' : 'bg-[hsl(var(--card))] border-[hsl(var(--border))]'}`

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

      {/* Art ("course") – with "Gönnen" for everything sweet */}
      {(usedCourses.length > 0 || usedCuisines.length > 0) && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap" role="group" aria-label="Art">
          {usedCourses.some(c => treatSlugs.has(c.slug)) && (
            <button type="button" className={chip(course === 'treats')} aria-pressed={course === 'treats'} onClick={() => setCourse(course === 'treats' ? null : 'treats')}>
              <Cake size={16} className="inline -mt-0.5 mr-1" />Gönnen
            </button>
          )}
          {usedCourses.map(c => (
            <button key={c.slug} type="button" className={chip(course === c.slug)} aria-pressed={course === c.slug} onClick={() => setCourse(course === c.slug ? null : c.slug)}>{c.label}</button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        {usedCuisines.length > 0 && (
          <select value={cuisine} onChange={e => setCuisine(e.target.value)} aria-label="Küche"
            className={`h-11 px-4 rounded-full text-base font-semibold border ${cuisine ? 'bg-[hsl(var(--primary))] text-white border-transparent' : 'bg-[hsl(var(--card))] border-[hsl(var(--border))]'}`}>
            <option value="">Alle Küchen</option>
            {usedCuisines.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
          </select>
        )}
        <button type="button" className={chip(diet === 'vegetarian')} aria-pressed={diet === 'vegetarian'} onClick={() => setDiet(diet === 'vegetarian' ? null : 'vegetarian')}>
          <Leaf size={16} className="inline -mt-0.5 mr-1" />Vegetarisch
        </button>
        <button type="button" className={chip(diet === 'vegan')} aria-pressed={diet === 'vegan'} onClick={() => setDiet(diet === 'vegan' ? null : 'vegan')}>
          <Sprout size={16} className="inline -mt-0.5 mr-1" />Vegan
        </button>
        {tags.length > 0 && tags.map(t => (
          <button key={t} type="button" className={chip(true)} onClick={() => setTags(tags.filter(x => x !== t))}>#{t} <X size={14} className="inline" /></button>
        ))}
      </div>

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
                  {(r.course || r.cuisine) && (
                    <p className="text-sm font-semibold text-[hsl(var(--primary))]">
                      {[r.course ? courseLabel[r.course] : null, r.cuisine ? cuisineLabel[r.cuisine] : null].filter(Boolean).join(' · ')}
                    </p>
                  )}
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
