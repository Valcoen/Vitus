import { notFound } from 'next/navigation'
import { getActor } from '@/lib/actor'
import { can } from '@/lib/permissions'
import { loadRecipe } from '@/lib/recipe/server'
import RecipeDetail from '@/components/recipe/RecipeDetail'

export default async function RecipePage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ kcal?: string }> }) {
  const { id } = await params
  const { kcal } = await searchParams
  const { actor, supabase } = await getActor()
  const recipe = await loadRecipe(supabase, decodeURIComponent(id))
  if (!recipe) notFound()
  const targetKcal = kcal && /^\d+$/.test(kcal) ? parseInt(kcal, 10) : undefined
  return <RecipeDetail recipe={recipe} targetKcal={targetKcal} canEdit={can(actor, 'recipe.edit')} />
}
