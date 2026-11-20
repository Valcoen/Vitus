import { notFound } from 'next/navigation'
import { getActor } from '@/lib/actor'
import { can } from '@/lib/permissions'
import { loadRecipe } from '@/lib/recipe/server'
import RecipeDetail from '@/components/recipe/RecipeDetail'
import { loadTaxonomy } from '@/lib/food/server'

export default async function RecipePage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ kcal?: string }> }) {
  const { id } = await params
  const { kcal } = await searchParams
  const { actor, supabase } = await getActor()
  const [recipe, tax] = await Promise.all([loadRecipe(supabase, decodeURIComponent(id)), loadTaxonomy(supabase)])
  if (!recipe) notFound()
  const labels = {
    course: tax.courses.find(c => c.slug === recipe.course)?.label ?? null,
    cuisine: tax.cuisines.find(c => c.slug === recipe.cuisine)?.label ?? null,
  }
  const targetKcal = kcal && /^\d+$/.test(kcal) ? parseInt(kcal, 10) : undefined
  return <RecipeDetail recipe={recipe} targetKcal={targetKcal} canEdit={can(actor, 'recipe.edit')} labels={labels} />
}
