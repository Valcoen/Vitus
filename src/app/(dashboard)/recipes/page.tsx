import Link from 'next/link'
import { Plus, Upload, Download } from 'lucide-react'
import { getActor } from '@/lib/actor'
import { can } from '@/lib/permissions'
import { loadRecipes } from '@/lib/recipe/server'
import ExploreGrid, { type RecipeCard } from '@/components/recipe/ExploreGrid'
import { loadTaxonomy } from '@/lib/food/server'

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ tag?: string; q?: string; drafts?: string; art?: string; kueche?: string }> }) {
  const { tag, q, drafts, art, kueche } = await searchParams
  const { actor, supabase } = await getActor()
  const [recipes, tax] = await Promise.all([loadRecipes(supabase), loadTaxonomy(supabase)])
  const courseLabel = Object.fromEntries(tax.courses.map(c => [c.slug, c.label]))
  const cuisineLabel = Object.fromEntries(tax.cuisines.map(c => [c.slug, c.label]))
  const cards: RecipeCard[] = recipes.map(r => ({
    id: r.id,
    title: r.title,
    imageUrl: r.imageSmallUrl,
    totalTime: r.totalTime,
    kcal: r.nutrition.kcal,
    protein: r.nutrition.protein,
    tags: r.tags,
    status: r.status,
    rating: r.rating,
    course: r.course,
    cuisine: r.cuisine,
    diet: r.diet,
    haystack: [r.title, ...r.tags, ...r.ingredients.map(i => i.name), r.course ? courseLabel[r.course] : '', r.cuisine ? cuisineLabel[r.cuisine] : ''].join(' ').toLowerCase(),
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
      <ExploreGrid recipes={cards} initialTag={tag} initialQuery={q} initialDrafts={drafts === '1'}
        initialCourse={art} initialCuisine={kueche}
        courses={tax.courses.map(c => ({ slug: c.slug, label: c.label, is_treat: c.is_treat }))}
        cuisines={tax.cuisines.map(c => ({ slug: c.slug, label: c.label }))} />
    </div>
  )
}
