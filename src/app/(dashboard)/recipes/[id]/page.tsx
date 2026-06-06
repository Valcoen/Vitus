import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import RecipeDetailClient from './RecipeDetailClient'

type FoodItem = {
  id: string
  name: string
  kcal_100g: number
  protein_100g: number
  carbs_100g: number
  fat_100g: number
}

type Ingredient = {
  food_item_id: string
  amount: number
  unit: string
}

export default async function RecipeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kcal?: string }> }) {
  const { id } = await params
  const { kcal } = await searchParams
  const targetKcal = kcal ? parseInt(kcal) : undefined
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !recipe) notFound()

  // Fetch food items for ingredients (ingredients are stored as { "Name": grams })
  const rawIngredients = typeof recipe.ingredients === 'object' && recipe.ingredients !== null && !Array.isArray(recipe.ingredients) 
    ? recipe.ingredients as Record<string, number> 
    : {}

  const ingredientNames = Object.keys(rawIngredients)

  let foodItemsMap: Record<string, FoodItem> = {}
  let ingredients: Ingredient[] = []

  if (ingredientNames.length > 0) {
    const { data: foodItems } = await supabase
      .from('food_items')
      .select('id, name, kcal_100g, protein_100g, carbs_100g, fat_100g')
      .in('name', ingredientNames)

    const fetchedDbItems = foodItems || []

    for (const name of ingredientNames) {
      const amount = rawIngredients[name]
      let fi = fetchedDbItems.find(f => f.name === name)
      
      if (!fi) {
        // Create a fallback item so the ingredient is still listed even if not in DB
        fi = {
          id: `missing-${name}`,
          name: name,
          kcal_100g: 0,
          protein_100g: 0,
          carbs_100g: 0,
          fat_100g: 0
        }
      }
      
      foodItemsMap[fi.id] = fi
      ingredients.push({
        food_item_id: fi.id,
        amount: amount,
        unit: 'g'
      })
    }
  }

  return (
    <RecipeDetailClient
      recipe={{
        ...recipe,
        ingredients,
      }}
      foodItemsMap={foodItemsMap}
      targetKcal={targetKcal}
    />
  )
}
