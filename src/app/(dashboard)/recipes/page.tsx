import Link from 'next/link'
import { Plus, Upload, Download } from 'lucide-react'
import { getActor } from '@/lib/actor'
import { can } from '@/lib/permissions'
import { loadRecipes } from '@/lib/recipe/server'
import ExploreGrid, { type RecipeCard } from '@/components/recipe/ExploreGrid'

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ tag?: string; q?: string }> }) {
  const { tag, q } = await searchParams
  const { actor, supabase } = await getActor()
  const recipes = await loadRecipes(supabase)
  const cards: RecipeCard[] = recipes.map(r => ({
    id: r.id,
    title: r.title,
    imageUrl: r.imageSmallUrl,
    totalTime: r.totalTime,
    kcal: r.nutrition.kcal,
    protein: r.nutrition.protein,
    tags: r.tags,
    haystack: [r.title, ...r.tags, ...r.ingredients.map(i => i.name)].join(' ').toLowerCase(),
  }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-3xl font-extrabold tracking-tight">Entdecken</h1>
        <div className="flex gap-2">
          {can(actor, 'recipe.import') && (
            <Link href="/recipes/import" className="h-11 px-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] font-semibold flex items-center gap-2">
              <Upload size={18} /> <span className="hidden sm:inline">Import</span>
            </Link>
          )}
          {can(actor, 'recipe.export') && recipes.length > 0 && (
            <a href="/api/recipes/export" className="h-11 px-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] font-semibold flex items-center gap-2" title="Alle Rezepte als .zip exportieren">
              <Download size={18} /> <span className="hidden sm:inline">Export</span>
            </a>
          )}
          {can(actor, 'recipe.create') && (
            <Link href="/recipes/new" className="btn-primary h-11 gap-2"><Plus size={20} /> Neu</Link>
          )}
        </div>
      </div>
      <ExploreGrid recipes={cards} initialTag={tag} initialQuery={q} />
    </div>
  )
}
