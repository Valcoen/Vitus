import { redirect } from 'next/navigation'
import { getActor } from '@/lib/actor'
import { can } from '@/lib/permissions'
import { loadFoodNames } from '@/lib/recipe/server'
import { emptyEditor } from '@/lib/recipe/editorInitial'
import RecipeEditor from '@/components/recipe/RecipeEditor'

export default async function NewRecipePage() {
  const { actor, supabase } = await getActor()
  if (!actor) redirect('/login')
  if (!can(actor, 'recipe.create')) redirect('/recipes?error=' + encodeURIComponent('Keine Berechtigung, Rezepte anzulegen.'))
  const foodNames = await loadFoodNames(supabase)
  return <RecipeEditor initial={emptyEditor()} foodNames={foodNames} />
}
