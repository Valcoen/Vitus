'use client'

import { useState } from 'react'
import { Flame, Drumstick, Wheat, Droplets, Users, Minus, Plus, ArrowLeft, Scale, User } from 'lucide-react'
import Link from 'next/link'

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
  ingredients: Ingredient[]
  standard_servings: number
  rating: number | null
  is_favorite: boolean | null
  created_by?: string | null
  creator_name?: string | null
}

export default function RecipeDetailClient({
  recipe,
  foodItemsMap,
  targetKcal,
}: {
  recipe: Recipe
  foodItemsMap: Record<string, FoodItem>
  targetKcal?: number
}) {
  // Compute base kcal for the full recipe to determine target-based scale
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
  let baseRecipeKcal = 0
  for (const ing of ingredients) {
    const food = foodItemsMap[ing.food_item_id]
    if (food) {
      const lowerName = food.name.toLowerCase()
      const isPiece = (lowerName === 'ei' || lowerName === 'eier') && ing.amount <= 20
      const effectiveAmount = isPiece ? ing.amount * 55 : ing.amount
      baseRecipeKcal += food.kcal_100g * (effectiveAmount / 100)
    }
  }

  const baseServings = recipe.standard_servings || 1
  // If targetKcal is provided, compute the initial servings equivalent
  const basePerServing = baseRecipeKcal / baseServings
  const initialServings = targetKcal && basePerServing > 0
    ? Math.round((targetKcal / basePerServing) * 10) / 10
    : baseServings

  const [servings, setServings] = useState(initialServings)
  const [isPersonalMode] = useState(!!targetKcal)
  const scaleFactor = servings / baseServings

  // ingredients already computed above

  // Calculate total nutrition
  let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0
  for (const ing of ingredients) {
    const food = foodItemsMap[ing.food_item_id]
    if (food) {
      let isPiece = false;
      const lowerName = food.name.toLowerCase();
      if ((lowerName === 'ei' || lowerName === 'eier') && ing.amount <= 20) {
        isPiece = true;
      }
      
      const effectiveAmountForMacros = isPiece ? (ing.amount * 55) : ing.amount;
      const factor = (effectiveAmountForMacros * scaleFactor) / 100
      totalKcal += food.kcal_100g * factor
      totalProtein += food.protein_100g * factor
      totalCarbs += food.carbs_100g * factor
      totalFat += food.fat_100g * factor
    }
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <Link href="/recipes" className="inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--text-muted))] hover:text-[hsl(var(--primary))] transition-colors">
        <ArrowLeft size={16} /> Zurück zu Rezepte
      </Link>

      {isPersonalMode && targetKcal && (
        <div className="rounded-2xl p-4 bg-[hsl(var(--primary))]/[0.08] ring-1 ring-[hsl(var(--primary))]/20 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[hsl(var(--primary))]/20 flex items-center justify-center">
            <Scale size={20} className="text-[hsl(var(--primary))]" />
          </div>
          <div>
            <p className="font-bold text-sm">Kalorienziel: <span className="text-[hsl(var(--primary))]">{targetKcal} kcal</span></p>
            <p className="text-xs text-[hsl(var(--text-muted))] font-medium">Mengenangaben wurden automatisch angepasst.</p>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">{recipe.title}</h1>
          {recipe.rating && (
            <span className="text-sm font-bold text-amber-500 bg-amber-500/10 px-3 py-1.5 rounded-lg shrink-0">
              {'⭐'.repeat(recipe.rating)}
            </span>
          )}
        </div>
        {recipe.creator_name && (
          <div className="flex items-center gap-1.5 mt-2">
            <User size={13} className="text-[hsl(var(--text-muted))]" />
            <span className="text-sm font-semibold text-[hsl(var(--text-muted))]">Erstellt von {recipe.creator_name}</span>
          </div>
        )}
      </div>

      {/* Portion selector */}
      <div className="card-apple bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--input-bg))]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scale size={22} className="text-[hsl(var(--primary))]" />
            <div>
              <p className="font-bold text-lg">Portionsrechner</p>
              <p className="text-sm text-[hsl(var(--text-muted))] font-medium">
                Originalrezept für {baseServings} {baseServings === 1 ? 'Person' : 'Personen'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setServings(Math.max(1, servings - 1))}
              className="w-10 h-10 rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] flex items-center justify-center hover:bg-[hsl(var(--input-bg))] transition-colors"
            >
              <Minus size={18} />
            </button>
            <div className="text-center min-w-[60px]">
              <p className="text-3xl font-extrabold">{servings}</p>
              <p className="text-xs font-semibold text-[hsl(var(--text-muted))] uppercase tracking-wide">
                {servings === 1 ? 'Person' : 'Personen'}
              </p>
            </div>
            <button
              onClick={() => setServings(servings + 1)}
              className="w-10 h-10 rounded-xl bg-[hsl(var(--primary))] text-white flex items-center justify-center hover:opacity-90 transition-opacity"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Nutrition summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card-apple text-center py-5">
          <Flame size={20} className="text-[hsl(var(--primary))] mx-auto mb-2" />
          <p className="text-2xl font-extrabold">{Math.round(totalKcal)}</p>
          <p className="text-xs uppercase tracking-wider font-semibold text-[hsl(var(--text-muted))] mt-1">kcal</p>
        </div>
        <div className="card-apple text-center py-5">
          <Drumstick size={20} className="text-blue-500 mx-auto mb-2" />
          <p className="text-2xl font-extrabold">{Math.round(totalProtein * 10) / 10}g</p>
          <p className="text-xs uppercase tracking-wider font-semibold text-[hsl(var(--text-muted))] mt-1">Protein</p>
        </div>
        <div className="card-apple text-center py-5">
          <Wheat size={20} className="text-amber-500 mx-auto mb-2" />
          <p className="text-2xl font-extrabold">{Math.round(totalCarbs * 10) / 10}g</p>
          <p className="text-xs uppercase tracking-wider font-semibold text-[hsl(var(--text-muted))] mt-1">Carbs</p>
        </div>
        <div className="card-apple text-center py-5">
          <Droplets size={20} className="text-rose-500 mx-auto mb-2" />
          <p className="text-2xl font-extrabold">{Math.round(totalFat * 10) / 10}g</p>
          <p className="text-xs uppercase tracking-wider font-semibold text-[hsl(var(--text-muted))] mt-1">Fett</p>
        </div>
      </div>

      {/* Ingredients table */}
      {ingredients.length > 0 && (
        <div className="card-apple">
          <h2 className="text-xl font-bold mb-4">🧾 Zutaten</h2>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[hsl(var(--text-muted))] font-semibold border-b border-[hsl(var(--border))]">
                  <th className="pb-3 pl-2">Zutat</th>
                  <th className="pb-3 text-right pr-3">Menge</th>
                  <th className="pb-3 text-right pr-3">kcal</th>
                  <th className="pb-3 text-right pr-3">Protein</th>
                  <th className="pb-3 text-right pr-3">Carbs</th>
                  <th className="pb-3 text-right pr-2">Fett</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ing, idx) => {
                  const food = foodItemsMap[ing.food_item_id]
                  if (!food) return null
                  const scaledAmountRaw = ing.amount * scaleFactor
                  
                  let isPiece = false;
                  const lowerName = food.name.toLowerCase();
                  if ((lowerName === 'ei' || lowerName === 'eier') && ing.amount <= 20) {
                    isPiece = true;
                  }
                  
                  const displayAmount = isPiece ? Math.round(scaledAmountRaw * 10) / 10 : Math.round(scaledAmountRaw);
                  const displayUnit = isPiece ? ' Stk.' : 'g';
                  
                  const effectiveAmountForMacros = isPiece ? (scaledAmountRaw * 55) : scaledAmountRaw;
                  const factor = effectiveAmountForMacros / 100

                  return (
                    <tr key={idx} className="border-b border-[hsl(var(--border))]/50 last:border-0">
                      <td className="py-3 pl-2 font-semibold">{food.name}</td>
                      <td className="py-3 text-right pr-3 font-medium">{displayAmount}{displayUnit}</td>
                      <td className="py-3 text-right pr-3">
                        <span className="inline-block bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] font-bold px-2 py-0.5 rounded-md text-xs">
                          {Math.round(food.kcal_100g * factor)}
                        </span>
                      </td>
                      <td className="py-3 text-right pr-3 font-medium text-blue-500">{Math.round(food.protein_100g * factor * 10) / 10}g</td>
                      <td className="py-3 text-right pr-3 font-medium text-amber-500">{Math.round(food.carbs_100g * factor * 10) / 10}g</td>
                      <td className="py-3 text-right pr-2 font-medium text-rose-500">{Math.round(food.fat_100g * factor * 10) / 10}g</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Instructions */}
      {recipe.instructions && (
        <div className="card-apple">
          <h2 className="text-xl font-bold mb-4">📝 Zubereitung</h2>
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-medium leading-relaxed text-[hsl(var(--text))]">
            {recipe.instructions}
          </div>
        </div>
      )}
    </div>
  )
}
