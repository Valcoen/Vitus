import { redirect } from 'next/navigation'
import { getActor } from '@/lib/actor'
import { can } from '@/lib/permissions'
import { emptyEditor } from '@/lib/recipe/editorInitial'
import { loadFoodsForClient, loadTaxonomy } from '@/lib/food/server'
import RecipeEditor from '@/components/recipe/RecipeEditor'

export default async function NewRecipePage() {
  const { actor, supabase } = await getActor()
  if (!actor) redirect('/login')
  if (!can(actor, 'recipe.create')) redirect('/recipes?error=' + encodeURIComponent('Keine Berechtigung, Rezepte anzulegen.'))
  const [foods, tax] = await Promise.all([loadFoodsForClient(supabase), loadTaxonomy(supabase)])
  return <RecipeEditor initial={emptyEditor()} foods={foods} courses={tax.courses} cuisines={tax.cuisines} />
}
