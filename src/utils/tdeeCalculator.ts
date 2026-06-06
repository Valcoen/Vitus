/**
 * TDEE Calculator — Mifflin-St Jeor Equation
 * 
 * Calculates Total Daily Energy Expenditure based on biometrics,
 * activity level, and fitness goal. Used by the meal plan engine
 * and the personalized analysis page.
 */

export type Gender = 'Männlich' | 'Weiblich' | 'Divers'
export type Goal = 'Fettabbau' | 'Muskelaufbau' | 'Halten'
export type ActivityFrequency = 'Gar nicht' | '1-2 mal pro Woche' | '3-4 mal pro Woche' | '5+ mal pro Woche'

export interface TDEEInput {
  weight: number           // kg
  height: number           // cm
  age: number              // years
  gender: Gender
  activityFrequency: ActivityFrequency
  goal: Goal
}

export interface MacroTargets {
  calories: number   // kcal
  protein: number    // grams
  carbs: number      // grams
  fat: number        // grams
}

/**
 * Calculates age in years from a birthday string (YYYY-MM-DD)
 */
export function calculateAge(birthday: string): number {
  const bd = new Date(birthday)
  const today = new Date()
  let age = today.getFullYear() - bd.getFullYear()
  const monthDiff = today.getMonth() - bd.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < bd.getDate())) {
    age--
  }
  return Math.max(0, age)
}

/**
 * Activity multiplier mapping based on exercise frequency.
 * Uses standard PAL (Physical Activity Level) values.
 */
function getActivityMultiplier(frequency: ActivityFrequency): number {
  switch (frequency) {
    case 'Gar nicht':             return 1.2    // Sedentary
    case '1-2 mal pro Woche':    return 1.375  // Lightly active
    case '3-4 mal pro Woche':    return 1.55   // Moderately active
    case '5+ mal pro Woche':     return 1.725  // Very active
    default:                     return 1.375  // Default to lightly active
  }
}

/**
 * Calculates Basal Metabolic Rate (BMR) using Mifflin-St Jeor equation.
 * This is the number of calories burned at complete rest.
 * 
 * Men:   BMR = (10 × weight_kg) + (6.25 × height_cm) - (5 × age) + 5
 * Women: BMR = (10 × weight_kg) + (6.25 × height_cm) - (5 × age) - 161
 */
export function calculateBMR(weight: number, height: number, age: number, gender: Gender): number {
  const base = (10 * weight) + (6.25 * height) - (5 * age)
  
  switch (gender) {
    case 'Männlich': return Math.round(base + 5)
    case 'Weiblich': return Math.round(base - 161)
    case 'Divers':   return Math.round(base - 78) // Average of male/female offset
    default:         return Math.round(base - 78)
  }
}

/**
 * Calculates TDEE = BMR × Activity Multiplier
 */
export function calculateTDEE(input: TDEEInput): number {
  const bmr = calculateBMR(input.weight, input.height, input.age, input.gender)
  const multiplier = getActivityMultiplier(input.activityFrequency)
  return Math.round(bmr * multiplier)
}

/**
 * Adjusts TDEE based on fitness goal.
 * - Fettabbau: -20% calorie deficit
 * - Muskelaufbau: +10% calorie surplus
 * - Halten: maintenance (no change)
 */
export function adjustForGoal(tdee: number, goal: Goal): number {
  switch (goal) {
    case 'Fettabbau':      return Math.round(tdee * 0.80)  // 20% deficit
    case 'Muskelaufbau':   return Math.round(tdee * 1.10)  // 10% surplus
    case 'Halten':         return tdee                      // Maintenance
    default:               return tdee
  }
}

/**
 * Splits calorie target into macro grams.
 * - Protein: 4 kcal/g
 * - Carbs: 4 kcal/g
 * - Fat: 9 kcal/g
 */
export function calculateMacroSplit(calories: number, goal: Goal): MacroTargets {
  let proteinPct: number, carbsPct: number, fatPct: number

  switch (goal) {
    case 'Fettabbau':
      proteinPct = 0.40; carbsPct = 0.30; fatPct = 0.30
      break
    case 'Muskelaufbau':
      proteinPct = 0.30; carbsPct = 0.45; fatPct = 0.25
      break
    case 'Halten':
    default:
      proteinPct = 0.30; carbsPct = 0.40; fatPct = 0.30
      break
  }

  return {
    calories,
    protein: Math.round((calories * proteinPct) / 4),
    carbs: Math.round((calories * carbsPct) / 4),
    fat: Math.round((calories * fatPct) / 9),
  }
}

/**
 * Full pipeline: biometrics → TDEE → goal-adjusted → macro split
 */
export function getFullMacroTargets(input: TDEEInput): MacroTargets {
  const tdee = calculateTDEE(input)
  const adjustedCalories = adjustForGoal(tdee, input.goal)
  return calculateMacroSplit(adjustedCalories, input.goal)
}

/**
 * Convenience function to compute per-meal calorie targets
 * by distributing daily calories across meal slots.
 * 
 * Default distribution:
 * - Frühstück: 25%
 * - Mittagessen: 35%
 * - Abendessen: 30%
 * - Snacks: 10%
 */
export function getMealCalorieDistribution(
  dailyCalories: number,
  mealSlots: string[]
): Record<string, number> {
  const defaultWeights: Record<string, number> = {
    'Frühstück': 0.25,
    'Mittagessen': 0.35,
    'Abendessen': 0.30,
    'Snacks': 0.10,
  }

  // Calculate total weight for the selected slots
  const activeWeights: Record<string, number> = {}
  let totalWeight = 0
  for (const slot of mealSlots) {
    const w = defaultWeights[slot] ?? 0.25
    activeWeights[slot] = w
    totalWeight += w
  }

  // Normalize so the active slots sum to 100%
  const result: Record<string, number> = {}
  for (const [slot, w] of Object.entries(activeWeights)) {
    result[slot] = Math.round(dailyCalories * (w / totalWeight))
  }

  return result
}
