import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import RecipeEditorClient from './RecipeEditorClient'

export default async function NewRecipePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase.from('users').select('id, household_id, name').eq('auth_id', user.id).single()

  // Check planner status
  let isPlanner = false
  if (userData?.household_id) {
    const { data: h } = await supabase.from('households').select('planner_user_id').eq('id', userData.household_id).single()
    isPlanner = h?.planner_user_id === userData?.id
  }

  if (!isPlanner) {
    redirect('/recipes?error=' + encodeURIComponent('Nur der Planner kann Rezepte erstellen.'))
  }

  // Fetch all food items for the search
  const { data: foodItems } = await supabase
    .from('food_items')
    .select('id, name, category, kcal_100g, protein_100g, carbs_100g, fat_100g')
    .order('name', { ascending: true })

  const creatorUserId = userData?.id

  async function saveRecipe(formData: FormData) {
    'use server'
    const title = formData.get('title') as string
    const instructions = formData.get('instructions') as string
    const standard_servings = parseInt(formData.get('standard_servings') as string) || 1
    const ingredientsJson = formData.get('ingredients') as string

    if (!title) {
      redirect(`/recipes/new?error=${encodeURIComponent('Rezeptname ist ein Pflichtfeld.')}`)
    }

    let ingredients = []
    try {
      ingredients = JSON.parse(ingredientsJson || '[]')
    } catch {
      ingredients = []
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: creator } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single()

    const { error } = await supabase.from('recipes').insert({
      title,
      instructions: instructions || null,
      standard_servings,
      ingredients,
      created_by: creator?.id || null,
    })

    if (error) {
      redirect(`/recipes/new?error=${encodeURIComponent('Fehler beim Speichern: ' + error.message)}`)
    }

    revalidatePath('/recipes')
    redirect(`/recipes?success=${encodeURIComponent(`Rezept "${title}" wurde erfolgreich erstellt!`)}`)
  }

  return <RecipeEditorClient allFoodItems={foodItems || []} saveRecipeAction={saveRecipe} />
}
