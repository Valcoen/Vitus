import { notFound, redirect } from 'next/navigation'
import { getActor } from '@/lib/actor'
import { can } from '@/lib/permissions'
import { loadRecipe } from '@/lib/recipe/server'
import { editorFromRecipe } from '@/lib/recipe/editorInitial'
import { loadFoodsForClient, loadTaxonomy } from '@/lib/food/server'
import RecipeEditor from '@/components/recipe/RecipeEditor'

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { actor, supabase } = await getActor()
  if (!actor) redirect('/login')
  if (!can(actor, 'recipe.edit')) redirect(`/recipes/${id}?error=` + encodeURIComponent('Keine Berechtigung, Rezepte zu ändern.'))
  const [recipe, foods, tax] = await Promise.all([loadRecipe(supabase, decodeURIComponent(id)), loadFoodsForClient(supabase), loadTaxonomy(supabase)])
  if (!recipe) notFound()
  return <RecipeEditor initial={editorFromRecipe(recipe)} foods={foods} courses={tax.courses} cuisines={tax.cuisines} />
}
