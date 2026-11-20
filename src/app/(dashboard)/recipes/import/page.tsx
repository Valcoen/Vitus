import { redirect } from 'next/navigation'
import { getActor } from '@/lib/actor'
import { can } from '@/lib/permissions'
import ImportClient from '@/components/recipe/ImportClient'

export default async function ImportPage() {
  const { actor } = await getActor()
  if (!actor) redirect('/login')
  if (!can(actor, 'recipe.import')) redirect('/recipes?error=' + encodeURIComponent('Keine Berechtigung für den Import.'))
  return <ImportClient />
}
