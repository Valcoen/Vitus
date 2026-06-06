/**
 * Meal Plan Engine — Standalone meal plan generator
 * 
 * A fully internal algorithm that:
 * 1. Calculates TDEE + macros for each household member
 * 2. Fetches and filters recipes from the database
 * 3. Assigns recipes to days + meal slots with variety
 * 4. Supports batch cooking (same recipe over consecutive days)
 * 5. Writes meals, portions, and shopping list to Supabase
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  calculateAge,
  adjustForGoal,
  calculateTDEE,
  calculateMacroSplit,
  getMealCalorieDistribution,
  type TDEEInput,
  type MacroTargets,
  type Goal,
  type ActivityFrequency,
} from './tdeeCalculator'

// ─── Types ────────────────────────────────────────────────────────────

export interface HouseholdMember {
  id: string
  name: string
  weight: number | null
  height: number | null
  birthday: string | null
  gender: string | null
  goal: string | null
  activity_frequency: string | null
  activity_type: string | null
  food_preferences: FoodPreferences | null
}

export interface FoodPreferences {
  diet_type?: string
  budget?: string
  allergies?: string[]
  dislikes?: string[]
  preferred_cuisines?: string[]
  avoidances?: string[]
  meat_frequency?: string
  meat_types?: string[]
  meal_schedule?: string[]
}

export interface RecipeRow {
  id: string
  title: string
  instructions: string | null
  ingredients: RecipeIngredient[] | null
  meal_type: string | null
  is_favorite: boolean | null
  rating: number | null
  standard_servings: number | null
}

export interface RecipeIngredient {
  food_item_id: string
  amount: number
  unit: string
}

export interface FoodItemRow {
  id: string
  name: string
  kcal_100g: number
  protein_100g: number
  carbs_100g: number
  fat_100g: number
  kategorie?: string
}

export interface MealPlanOptions {
  days: number
  mealSlots: string[]
  batchLunchDays: number
}

interface MemberPlan {
  member: HouseholdMember
  dailyMacros: MacroTargets
  mealDistribution: Record<string, number>
}

interface PlannedMeal {
  dayIndex: number
  mealType: string
  recipeId: string
  recipeName: string
  isShared: boolean
  batchGroupId: string | null
}

// ─── Recipe Filtering ─────────────────────────────────────────────────

/**
 * Merges all household members' food preferences into a combined filter set.
 * Takes the union of allergies/dislikes (if ANY member has it, exclude it)
 * and the intersection of diet types (strictest diet wins).
 */
function mergePreferences(members: HouseholdMember[]): {
  excludedFoodItemIds: Set<string>
  dietType: string
  allergies: Set<string>
  dislikes: Set<string>
} {
  const allergies = new Set<string>()
  const dislikes = new Set<string>()
  const dietTypes: string[] = []

  for (const m of members) {
    const prefs = m.food_preferences
    if (!prefs) continue
    for (const a of prefs.allergies ?? []) allergies.add(a.toLowerCase())
    for (const d of prefs.dislikes ?? []) dislikes.add(d.toLowerCase())
    if (prefs.diet_type) dietTypes.push(prefs.diet_type)
  }

  // Strictest diet wins: vegan > vegetarian > pescetarian > omnivore
  const dietHierarchy = ['vegan', 'vegetarian', 'pescetarian', 'omnivore']
  let strictestDiet = 'omnivore'
  for (const dt of dietTypes) {
    if (dietHierarchy.indexOf(dt) < dietHierarchy.indexOf(strictestDiet)) {
      strictestDiet = dt
    }
  }

  return {
    excludedFoodItemIds: new Set(), // populated later after food item lookup
    dietType: strictestDiet,
    allergies,
    dislikes,
  }
}

/**
 * Calculates the total kcal of a recipe based on its ingredients.
 */
function getRecipeKcal(recipe: RecipeRow, foodItemsMap: Map<string, FoodItemRow>): number {
  if (!Array.isArray(recipe.ingredients)) return 0
  let total = 0
  for (const ing of recipe.ingredients) {
    const food = foodItemsMap.get(ing.food_item_id)
    if (food) {
      total += (food.kcal_100g * ing.amount) / 100
    }
  }
  return Math.round(total / (recipe.standard_servings || 1))
}

/**
 * Checks if a recipe contains any food item that matches a set of names (case-insensitive).
 */
function recipeContainsAny(
  recipe: RecipeRow,
  names: Set<string>,
  foodItemsMap: Map<string, FoodItemRow>
): boolean {
  if (!Array.isArray(recipe.ingredients) || names.size === 0) return false
  for (const ing of recipe.ingredients) {
    const food = foodItemsMap.get(ing.food_item_id)
    if (food && names.has(food.name.toLowerCase())) return true
  }
  return false
}

/**
 * Filters recipes based on merged household preferences.
 */
function filterRecipes(
  recipes: RecipeRow[],
  merged: ReturnType<typeof mergePreferences>,
  foodItemsMap: Map<string, FoodItemRow>,
): RecipeRow[] {
  return recipes.filter(recipe => {
    // Exclude recipes containing allergens
    if (recipeContainsAny(recipe, merged.allergies, foodItemsMap)) return false
    // Exclude recipes containing disliked ingredients
    if (recipeContainsAny(recipe, merged.dislikes, foodItemsMap)) return false

    // Diet filtering: check if recipe contains animal products
    if (merged.dietType === 'vegan' || merged.dietType === 'vegetarian') {
      if (!Array.isArray(recipe.ingredients)) return true
      for (const ing of recipe.ingredients) {
        const food = foodItemsMap.get(ing.food_item_id)
        if (!food) continue
        const cat = (food.kategorie || '').toLowerCase()
        const name = food.name.toLowerCase()
        
        if (merged.dietType === 'vegan') {
          // Exclude meat, fish, dairy, eggs
          if (['fleisch', 'fisch', 'milchprodukte'].includes(cat)) return false
          if (name.includes('ei') && !name.includes('erdnuss') && !name.includes('reis')) return false
        } else if (merged.dietType === 'vegetarian') {
          // Exclude meat and fish, allow dairy and eggs
          if (['fleisch', 'fisch'].includes(cat)) return false
        }
      }
    } else if (merged.dietType === 'pescetarian') {
      if (!Array.isArray(recipe.ingredients)) return true
      for (const ing of recipe.ingredients) {
        const food = foodItemsMap.get(ing.food_item_id)
        if (!food) continue
        const cat = (food.kategorie || '').toLowerCase()
        // Exclude meat but allow fish
        if (cat === 'fleisch') {
          const name = food.name.toLowerCase()
          if (!name.includes('lachs') && !name.includes('fisch') && !name.includes('meeresfrüchte')) {
            return false
          }
        }
      }
    }

    return true
  })
}

// ─── Recipe Assignment ────────────────────────────────────────────────

/**
 * Deterministically assigns recipes to days and meal slots.
 * Uses a shuffled recipe pool and respects batch cooking configuration.
 */
function assignRecipesToDays(
  filteredRecipes: RecipeRow[],
  options: MealPlanOptions,
  foodItemsMap: Map<string, FoodItemRow>,
  avgTargetKcal: number,
): PlannedMeal[] {
  const { days, mealSlots, batchLunchDays } = options
  const planned: PlannedMeal[] = []

  if (filteredRecipes.length === 0) return planned

  // Sort recipes by how close they are to target kcal (best matches first)
  const scoredRecipes = filteredRecipes.map(r => ({
    recipe: r,
    kcal: getRecipeKcal(r, foodItemsMap),
  })).sort((a, b) => {
    const diffA = Math.abs(a.kcal - avgTargetKcal)
    const diffB = Math.abs(b.kcal - avgTargetKcal)
    return diffA - diffB
  })

  // Track used recipe IDs to maximize variety
  const usedRecipeIds = new Set<string>()
  let recipePool = [...scoredRecipes]

  function pickRecipe(mealType: string): typeof scoredRecipes[0] | null {
    const lowerType = mealType.toLowerCase()
    let targetTag: string | null = null
    if (lowerType.includes('frühstück')) targetTag = 'breakfast'
    else if (lowerType.includes('mittag')) targetTag = 'lunch'
    else if (lowerType.includes('abend')) targetTag = 'dinner'
    else if (lowerType.includes('snack')) targetTag = 'snack'

    const matchesTag = (r: typeof scoredRecipes[0]) => {
      if (!targetTag) return true
      const dbMealType = r.recipe.meal_type?.toLowerCase() || ''
      
      // Wenn das Rezept keinen meal_type hat, passt es nicht zu strengen Kategorien
      if (!dbMealType) return false
      
      const validTags = [targetTag]
      if (targetTag === 'breakfast') validTags.push('frühstück')
      if (targetTag === 'lunch') {
          validTags.push('mittagessen')
          validTags.push('dinner', 'abendessen') // Dinner is lunch-compatible
      }
      if (targetTag === 'dinner') {
          validTags.push('abendessen')
          validTags.push('lunch', 'mittagessen') // Lunch is dinner-compatible
      }
      
      return validTags.some(v => dbMealType.includes(v))
    }

    // 1. Prefer unused recipes that match the tag
    let candidates = recipePool.filter(r => !usedRecipeIds.has(r.recipe.id) && matchesTag(r))
    if (candidates.length > 0) {
      const pick = candidates[0]
      usedRecipeIds.add(pick.recipe.id)
      return pick
    }

    // 2. Prefer repeats that match the tag (strict meal type enforcement!)
    candidates = recipePool.filter(r => matchesTag(r))
    if (candidates.length > 0) {
      usedRecipeIds.clear() // Reset tracking as we have to reuse recipes
      const pick = candidates[0]
      usedRecipeIds.add(pick.recipe.id)
      return pick
    }

    // 3. Fallback: unused recipes regardless of tag (only if absolutely no matching recipes exist)
    candidates = recipePool.filter(r => !usedRecipeIds.has(r.recipe.id))
    if (candidates.length > 0) {
      const pick = candidates[0]
      usedRecipeIds.add(pick.recipe.id)
      return pick
    }

    // 4. Absolute fallback: anything
    if (recipePool.length > 0) {
      usedRecipeIds.clear()
      const pick = recipePool[0]
      usedRecipeIds.add(pick.recipe.id)
      return pick
    }
    return null
  }

  // Cycle through recipes to avoid giving the same recipe to every slot
  function rotatePool() {
    if (recipePool.length > 1) {
      recipePool.push(recipePool.shift()!)
    }
  }

  for (const mealType of mealSlots) {
    const isBatchable = mealType === 'Mittagessen' && batchLunchDays > 1
    let dayIdx = 0

    while (dayIdx < days) {
      const picked = pickRecipe(mealType)
      if (!picked) break

      if (isBatchable) {
        // Batch cooking: same recipe for N consecutive days
        const batchId = crypto.randomUUID()
        const batchEnd = Math.min(dayIdx + batchLunchDays, days)
        for (let d = dayIdx; d < batchEnd; d++) {
          planned.push({
            dayIndex: d,
            mealType,
            recipeId: picked.recipe.id,
            recipeName: picked.recipe.title,
            isShared: true, // Batch meals are always shared
            batchGroupId: batchId,
          })
        }
        dayIdx = batchEnd
      } else {
        planned.push({
          dayIndex: dayIdx,
          mealType,
          recipeId: picked.recipe.id,
          recipeName: picked.recipe.title,
          isShared: true,
          batchGroupId: null,
        })
        dayIdx++
      }
      rotatePool()
    }
  }

  return planned
}

// ─── Shopping List Generator ──────────────────────────────────────────

interface ShoppingItem {
  name: string
  amount: string
}

/**
 * Aggregates all ingredients from a meal plan into a shopping list.
 * Sums up quantities by ingredient and scales for the number of household members.
 */
function generateShoppingList(
  plannedMeals: PlannedMeal[],
  recipes: Map<string, RecipeRow>,
  foodItemsMap: Map<string, FoodItemRow>,
  memberCount: number,
): ShoppingItem[] {
  const totals: Record<string, { grams: number; name: string }> = {}

  for (const meal of plannedMeals) {
    const recipe = recipes.get(meal.recipeId)
    if (!recipe || !Array.isArray(recipe.ingredients)) continue

    const servings = recipe.standard_servings || 1
    const portionScale = memberCount / servings

    for (const ing of recipe.ingredients) {
      const food = foodItemsMap.get(ing.food_item_id)
      if (!food) continue
      const key = food.id
      if (!totals[key]) totals[key] = { grams: 0, name: food.name }
      totals[key].grams += ing.amount * portionScale
    }
  }

  return Object.values(totals).map(t => ({
    name: t.name,
    amount: `${Math.round(t.grams)}g`,
  }))
}

// ─── Main Orchestrator ────────────────────────────────────────────────

/**
 * Generates a complete meal plan for a household.
 * This is the main entry point called from the meal-plan page server action.
 * 
 * @returns Object with counts of created meals and shopping list items, or an error message.
 */
export async function generateMealPlan(
  supabase: SupabaseClient,
  householdId: string,
  members: HouseholdMember[],
  options: MealPlanOptions,
): Promise<{ success: true; mealsCreated: number; shoppingItems: number } | { success: false; error: string }> {
  try {
    // ── Step 1: Calculate per-member TDEE + macros ──
    const memberPlans: MemberPlan[] = []
    
    for (const member of members) {
      if (!member.weight || !member.height || !member.birthday) {
        // Skip members without complete biometrics, use defaults
        continue
      }

      const age = calculateAge(member.birthday)
      const tdeeInput: TDEEInput = {
        weight: member.weight,
        height: member.height,
        age,
        gender: (member.gender as TDEEInput['gender']) || 'Divers',
        activityFrequency: (member.activity_frequency as ActivityFrequency) || '1-2 mal pro Woche',
        goal: (member.goal as Goal) || 'Halten',
      }

      const tdee = calculateTDEE(tdeeInput)
      const adjustedCalories = adjustForGoal(tdee, tdeeInput.goal)
      const dailyMacros = calculateMacroSplit(adjustedCalories, tdeeInput.goal)
      const mealDistribution = getMealCalorieDistribution(dailyMacros.calories, options.mealSlots)

      memberPlans.push({ member, dailyMacros, mealDistribution })
    }

    if (memberPlans.length === 0) {
      return { success: false, error: 'Keine Haushaltsmitglieder mit vollständigen Biometrie-Daten gefunden. Bitte füllt eure Profile aus.' }
    }

    // ── Step 2: Fetch recipes from DB ──
    const { data: recipesData, error: recipesError } = await supabase
      .from('recipes')
      .select('*')
      .order('title')

    if (recipesError) {
      return { success: false, error: `Fehler beim Laden der Rezepte: ${recipesError.message}` }
    }

    const allRecipes = (recipesData || []) as RecipeRow[]

    if (allRecipes.length === 0) {
      return { success: false, error: 'Es sind noch keine Rezepte vorhanden. Bitte erstelle zuerst Rezepte unter "Rezepte".' }
    }

    // ── Step 3: Fetch food items for macro calculation + filtering ──
    const allFoodItemIds = new Set<string>()
    for (const recipe of allRecipes) {
      if (Array.isArray(recipe.ingredients)) {
        for (const ing of recipe.ingredients) {
          if (ing.food_item_id) allFoodItemIds.add(ing.food_item_id)
        }
      }
    }

    const foodItemsMap = new Map<string, FoodItemRow>()
    if (allFoodItemIds.size > 0) {
      const { data: foodItems } = await supabase
        .from('food_items')
        .select('id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, kategorie')
        .in('id', Array.from(allFoodItemIds))

      for (const fi of (foodItems || [])) {
        foodItemsMap.set(fi.id, fi)
      }
    }

    // ── Step 4: Filter recipes by household preferences ──
    const merged = mergePreferences(members)
    const filtered = filterRecipes(allRecipes, merged, foodItemsMap)

    if (filtered.length === 0) {
      return { success: false, error: 'Keine passenden Rezepte nach Filtern (Allergien, Ernährungstyp, etc.) gefunden. Bitte passe deine Präferenzen an oder erstelle mehr Rezepte.' }
    }

    // ── Step 5: Assign recipes to days ──
    // Average target kcal across members for recipe matching
    const avgDailyKcal = memberPlans.reduce((sum, mp) => sum + mp.dailyMacros.calories, 0) / memberPlans.length
    const avgMealKcal = avgDailyKcal / options.mealSlots.length

    const plannedMeals = assignRecipesToDays(filtered, options, foodItemsMap, avgMealKcal)

    if (plannedMeals.length === 0) {
      return { success: false, error: 'Konnte keinen Plan erstellen. Bitte versuche es erneut.' }
    }

    // ── Step 6: Clear old meals + portions for this household ──
    const existingMealIds = await supabase
      .from('meals')
      .select('id')
      .eq('household_id', householdId)
    
    if (existingMealIds.data && existingMealIds.data.length > 0) {
      const ids = existingMealIds.data.map((m: { id: string }) => m.id)
      await supabase.from('meal_portions').delete().in('meal_id', ids)
    }
    await supabase.from('meals').delete().eq('household_id', householdId)

    // ── Step 7: Write meals to Supabase ──
    const weekStart = getStartDate()
    
    const mealsToInsert = plannedMeals.map(meal => ({
      household_id: householdId,
      name: meal.recipeName,
      meal_type: meal.mealType,
      recipe_id: meal.recipeId,
      day_index: meal.dayIndex,
      is_shared: meal.isShared,
      batch_group_id: meal.batchGroupId,
      week_start: weekStart,
      calories: getRecipeKcal(
        allRecipes.find(r => r.id === meal.recipeId)!,
        foodItemsMap
      ),
    }))

    const { data: insertedMeals, error: mealsError } = await supabase
      .from('meals')
      .insert(mealsToInsert)
      .select('id, day_index, meal_type, recipe_id')

    if (mealsError) {
      return { success: false, error: `Fehler beim Erstellen der Mahlzeiten: ${mealsError.message}` }
    }

    // ── Step 8: Write per-member portions ──
    const portionsToInsert: {
      meal_id: string
      user_id: string
      target_kcal: number
      target_protein: number
      target_carbs: number
      target_fat: number
    }[] = []

    for (const meal of (insertedMeals || [])) {
      for (const mp of memberPlans) {
        const mealKcal = mp.mealDistribution[meal.meal_type] || Math.round(mp.dailyMacros.calories / options.mealSlots.length)
        const mealMacros = calculateMacroSplit(mealKcal, (mp.member.goal as Goal) || 'Halten')
        portionsToInsert.push({
          meal_id: meal.id,
          user_id: mp.member.id,
          target_kcal: mealMacros.calories,
          target_protein: mealMacros.protein,
          target_carbs: mealMacros.carbs,
          target_fat: mealMacros.fat,
        })
      }
    }

    if (portionsToInsert.length > 0) {
      await supabase.from('meal_portions').insert(portionsToInsert)
    }

    // ── Step 9: Generate shopping list ──
    const recipesMap = new Map(allRecipes.map(r => [r.id, r]))
    const shoppingItems = generateShoppingList(
      plannedMeals,
      recipesMap,
      foodItemsMap,
      memberPlans.length,
    )

    // Clear existing shopping list
    await supabase.from('shopping_lists').delete().eq('household_id', householdId)

    // Insert new shopping list
    if (shoppingItems.length > 0) {
      await supabase.from('shopping_lists').insert(
        shoppingItems.map(item => ({
          household_id: householdId,
          name: item.name,
          amount: item.amount,
          checked: false,
        }))
      )
    }

    return {
      success: true,
      mealsCreated: insertedMeals?.length || 0,
      shoppingItems: shoppingItems.length,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
    return { success: false, error: message }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Returns today's date as the plan start date (YYYY-MM-DD).
 * The plan always starts from the day it's generated.
 */
function getStartDate(): string {
  const today = new Date()
  return today.toISOString().split('T')[0]
}
