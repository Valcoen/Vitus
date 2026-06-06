/**
 * Dynamic Macro Scaler
 * 
 * Scales a recipe's ingredients to match a specific calorie target.
 * Used for per-person meal portions in multi-person households.
 */

export type FoodItem = {
  id: string
  name: string
  kcal_100g: number
  protein_100g: number
  carbs_100g: number
  fat_100g: number
}

export type ScaledIngredient = {
  name: string
  baseGrams: number
  scaledGrams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  isPiece: boolean
  displayAmount: string
  displayUnit: string
}

export type ScaledResult = {
  scaleFactor: number
  totalGrams: number
  totalKcal: number
  totalProtein: number
  totalCarbs: number
  totalFat: number
  ingredients: ScaledIngredient[]
}

/**
 * Resolves the effective grams for an ingredient, handling piece-based items (e.g., Eier).
 */
function resolveEffectiveGrams(name: string, amount: number): { effectiveGrams: number; isPiece: boolean } {
  const lowerName = name.toLowerCase()
  if ((lowerName === 'ei' || lowerName === 'eier') && amount <= 20) {
    return { effectiveGrams: amount * 55, isPiece: true }
  }
  return { effectiveGrams: amount, isPiece: false }
}

/**
 * Computes the base total macros for a recipe from its raw ingredient JSON.
 */
export function computeRecipeBaseMacros(
  recipeIngredients: Record<string, number>,
  foodItemsMap: Record<string, FoodItem>
): { baseKcal: number; baseProtein: number; baseCarbs: number; baseFat: number; baseGrams: number } {
  let baseKcal = 0, baseProtein = 0, baseCarbs = 0, baseFat = 0, baseGrams = 0

  for (const [name, amount] of Object.entries(recipeIngredients)) {
    const fi = foodItemsMap[name]
    if (!fi || typeof amount !== 'number') continue

    const { effectiveGrams } = resolveEffectiveGrams(name, amount)
    const factor = effectiveGrams / 100
    baseKcal += fi.kcal_100g * factor
    baseProtein += fi.protein_100g * factor
    baseCarbs += fi.carbs_100g * factor
    baseFat += fi.fat_100g * factor
    baseGrams += effectiveGrams
  }

  return { baseKcal, baseProtein, baseCarbs, baseFat, baseGrams }
}

/**
 * Scales a recipe's ingredients to a specific calorie target.
 * 
 * @param recipeIngredients - The recipe's ingredients as { name: grams }
 * @param foodItemsMap - Lookup map of food items keyed by name
 * @param targetKcal - The target calories for this person's portion
 * @returns Scaled result with per-ingredient breakdown and totals
 */
export function scaleRecipeToTarget(
  recipeIngredients: Record<string, number>,
  foodItemsMap: Record<string, FoodItem>,
  targetKcal: number
): ScaledResult {
  const base = computeRecipeBaseMacros(recipeIngredients, foodItemsMap)

  if (base.baseKcal <= 0 || targetKcal <= 0) {
    return {
      scaleFactor: 0,
      totalGrams: 0,
      totalKcal: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      ingredients: [],
    }
  }

  const scaleFactor = targetKcal / base.baseKcal

  const ingredients: ScaledIngredient[] = []
  let totalGrams = 0, totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0

  for (const [name, amount] of Object.entries(recipeIngredients)) {
    const fi = foodItemsMap[name]
    if (!fi || typeof amount !== 'number') continue

    const { effectiveGrams, isPiece } = resolveEffectiveGrams(name, amount)
    const scaledEffectiveGrams = effectiveGrams * scaleFactor
    const factor = scaledEffectiveGrams / 100

    const ingKcal = fi.kcal_100g * factor
    const ingProtein = fi.protein_100g * factor
    const ingCarbs = fi.carbs_100g * factor
    const ingFat = fi.fat_100g * factor

    // Display: for piece items, show the scaled piece count
    const scaledRawAmount = amount * scaleFactor
    const displayAmount = isPiece
      ? `${Math.round(scaledRawAmount * 10) / 10}`
      : `${Math.round(scaledEffectiveGrams)}`
    const displayUnit = isPiece ? 'Stk.' : 'g'

    ingredients.push({
      name,
      baseGrams: effectiveGrams,
      scaledGrams: Math.round(scaledEffectiveGrams),
      kcal: Math.round(ingKcal),
      protein: Math.round(ingProtein * 10) / 10,
      carbs: Math.round(ingCarbs * 10) / 10,
      fat: Math.round(ingFat * 10) / 10,
      isPiece,
      displayAmount,
      displayUnit,
    })

    totalGrams += scaledEffectiveGrams
    totalKcal += ingKcal
    totalProtein += ingProtein
    totalCarbs += ingCarbs
    totalFat += ingFat
  }

  return {
    scaleFactor,
    totalGrams: Math.round(totalGrams),
    totalKcal: Math.round(totalKcal),
    totalProtein: Math.round(totalProtein * 10) / 10,
    totalCarbs: Math.round(totalCarbs * 10) / 10,
    totalFat: Math.round(totalFat * 10) / 10,
    ingredients,
  }
}

/**
 * Computes the total cooking amounts for a shared meal across multiple persons.
 * Each person's scaled ingredients are summed to get total amounts needed.
 */
export function computeTotalCookingAmounts(
  personResults: ScaledResult[]
): { name: string; totalGrams: number; displayUnit: string }[] {
  const totals: Record<string, { totalGrams: number; displayUnit: string }> = {}

  for (const result of personResults) {
    for (const ing of result.ingredients) {
      if (!totals[ing.name]) {
        totals[ing.name] = { totalGrams: 0, displayUnit: ing.displayUnit }
      }
      totals[ing.name].totalGrams += ing.scaledGrams
    }
  }

  return Object.entries(totals).map(([name, data]) => ({
    name,
    totalGrams: Math.round(data.totalGrams),
    displayUnit: data.displayUnit,
  }))
}
