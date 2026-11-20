import { notFound, redirect } from 'next/navigation'
import { getActor } from '@/lib/actor'
import { can } from '@/lib/permissions'
import { loadFoodNames, loadRecipe } from '@/lib/recipe/server'
import { editorFromRecipe } from '@/lib/recipe/editorInitial'
import RecipeEditor from '@/components/recipe/RecipeEditor'

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { actor, supabase } = await getActor()
  if (!actor) redirect('/login')
  if (!can(actor, 'recipe.edit')) redirect(`/recipes/${id}?error=` + encodeURIComponent('Keine Berechtigung, Rezepte zu ändern.'))
  const [recipe, foodNames] = await Promise.all([loadRecipe(supabase, decodeURIComponent(id)), loadFoodNames(supabase)])
  if (!recipe) notFound()
  return <RecipeEditor initial={editorFromRecipe(recipe)} foodNames={foodNames} />
}
