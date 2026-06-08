import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Flame, Drumstick, Wheat, Droplets, User } from 'lucide-react'

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

type Recipe = {
  id: string
  title: string
  instructions: string | null
  ingredients: Ingredient[] | null
  is_favorite: boolean | null
  rating: number | null
  public_ratings: number | null
  standard_servings: number
  created_by: string | null
  creator_name?: string | null
}

function calculateNutrition(ingredients: Ingredient[], foodItemsMap: Map<string, FoodItem>) {
  let kcal = 0, protein = 0, carbs = 0, fat = 0
  for (const ing of ingredients) {
    const food = foodItemsMap.get(ing.food_item_id)
    if (food) {
      const factor = ing.amount / 100
      kcal += food.kcal_100g * factor
      protein += food.protein_100g * factor
      carbs += food.carbs_100g * factor
      fat += food.fat_100g * factor
    }
  }
  return { kcal: Math.round(kcal), protein: Math.round(protein * 10) / 10, carbs: Math.round(carbs * 10) / 10, fat: Math.round(fat * 10) / 10 }
}

export default async function RecipesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase.from('users').select('id, household_id').eq('auth_id', user.id).single()

  let isPlanner = false
  if (userData?.household_id) {
    const { data: h } = await supabase.from('households').select('planner_user_id').eq('id', userData.household_id).single()
    isPlanner = h?.planner_user_id === userData?.id
  }

  const { data: recipes } = await supabase
    .from('recipes')
    .select('*')
    .order('title', { ascending: true })

  // Fetch creator names for recipes that have a created_by
  const creatorIds = [...new Set((recipes || []).map((r: any) => r.created_by).filter(Boolean))]
  let creatorsMap = new Map<string, string>()
  if (creatorIds.length > 0) {
    const { data: creators } = await supabase
      .from('users')
      .select('id, name')
      .in('id', creatorIds)
    for (const c of (creators || [])) {
      creatorsMap.set(c.id, c.name)
    }
  }

  // Collect all food_item_ids from all recipe ingredients
  const allFoodItemIds = new Set<string>()
  for (const recipe of (recipes || []) as Recipe[]) {
    if (Array.isArray(recipe.ingredients)) {
      for (const ing of recipe.ingredients) {
        if (ing.food_item_id) allFoodItemIds.add(ing.food_item_id)
      }
    }
  }

  // Bulk-fetch food items
  let foodItemsMap = new Map<string, FoodItem>()
  if (allFoodItemIds.size > 0) {
    const { data: foodItems } = await supabase
      .from('food_items')
      .select('id, name, kcal_100g, protein_100g, carbs_100g, fat_100g')
      .in('id', Array.from(allFoodItemIds))

    for (const fi of (foodItems || [])) {
      foodItemsMap.set(fi.id, fi)
    }
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🍲 Rezepte</h1>
          <p className="text-[hsl(var(--text-muted))] mt-1 text-lg font-medium">
            Alle Rezepte mit dynamisch berechneten Nährwerten.
          </p>
        </div>
        {isPlanner && (
          <Link href="/recipes/new" className="btn-primary flex items-center gap-2 whitespace-nowrap shadow-md hover:scale-[1.02] transition-transform">
            <Plus size={18} /> Neues Rezept
          </Link>
        )}
      </div>

      {!isPlanner && userData?.household_id && (
        <div className="card-apple bg-[hsl(var(--input-bg))] border-none">
          <p className="font-semibold text-[hsl(var(--text-muted))]">💡 Nur der Planner deines Haushalts kann neue Rezepte erstellen.</p>
        </div>
      )}

      {(!recipes || recipes.length === 0) ? (
        <div className="card-apple text-center p-12 py-20 border-dashed">
          <p className="text-lg font-bold text-[hsl(var(--text-muted))] mb-2">Noch keine Rezepte vorhanden</p>
          {isPlanner && (
            <Link href="/recipes/new" className="text-[hsl(var(--primary))] font-semibold underline underline-offset-4 hover:text-[hsl(var(--primary))]/80">
              Erstelle dein erstes Rezept →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(recipes as Recipe[]).map(recipe => {
            const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
            const nutrition = calculateNutrition(ingredients, foodItemsMap)
            const servings = recipe.standard_servings || 1
            const perServing = {
              kcal: Math.round(nutrition.kcal / servings),
              protein: Math.round((nutrition.protein / servings) * 10) / 10,
              carbs: Math.round((nutrition.carbs / servings) * 10) / 10,
              fat: Math.round((nutrition.fat / servings) * 10) / 10,
            }

            return (
              <Link key={recipe.id} href={`/recipes/${recipe.id}`} className="card-apple hover:shadow-lg hover:scale-[1.01] transition-all cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-xl font-bold group-hover:text-[hsl(var(--primary))] transition-colors leading-tight">{recipe.title}</h3>
                  {recipe.rating && (
                    <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded-lg shrink-0 ml-2">
                      {'⭐'.repeat(recipe.rating)}
                    </span>
                  )}
                </div>

                {/* Author badge */}
                {creatorsMap.get(recipe.created_by || '') && (
                  <div className="flex items-center gap-1.5 mb-3">
                    <User size={12} className="text-[hsl(var(--text-muted))]" />
                    <span className="text-xs font-semibold text-[hsl(var(--text-muted))]">
                      {creatorsMap.get(recipe.created_by || '')}
                    </span>
                  </div>
                )}

                {ingredients.length > 0 && (
                  <p className="text-sm text-[hsl(var(--text-muted))] font-medium mb-4">
                    {ingredients.length} Zutat{ingredients.length !== 1 ? 'en' : ''} · {servings} {servings === 1 ? 'Portion' : 'Portionen'}
                  </p>
                )}

                {nutrition.kcal > 0 && (
                  <div className="grid grid-cols-4 gap-2 pt-3 border-t border-[hsl(var(--border))]/60">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Flame size={14} className="text-[hsl(var(--primary))]" />
                      </div>
                      <p className="text-lg font-extrabold">{perServing.kcal}</p>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--text-muted))]">kcal</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Drumstick size={14} className="text-blue-500" />
                      </div>
                      <p className="text-lg font-extrabold">{perServing.protein}g</p>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--text-muted))]">Protein</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Wheat size={14} className="text-amber-500" />
                      </div>
                      <p className="text-lg font-extrabold">{perServing.carbs}g</p>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--text-muted))]">Carbs</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Droplets size={14} className="text-rose-500" />
                      </div>
                      <p className="text-lg font-extrabold">{perServing.fat}g</p>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--text-muted))]">Fett</p>
                    </div>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
