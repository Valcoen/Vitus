import type { Ingredient } from './ingredients'
import type { PerServing, Diet } from './nutrition'
import type { RecipeStep } from './markdown'

/** A recipe as the UI sees it, whatever format it is stored in. */
export type RecipeView = {
  id: string
  slug: string | null
  title: string
  /** 'ready' = published, 'draft' = only visible under "Entwürfe", not planned */
  status: 'draft' | 'ready'
  /** 0–10 */
  rating: number | null
  description: string | null
  imageUrl: string | null
  /** 640px variant for cards */
  imageSmallUrl: string | null
  imagePath: string | null
  servings: number
  prepTime: number | null
  cookTime: number | null
  totalTime: number | null
  tags: string[]
  mealType: string | null
  /** recipe_courses.slug ("Art") */
  course: string | null
  /** cuisines.slug ("Küche") */
  cuisine: string | null
  /** derived from the linked foods */
  diet: Diet[]
  ingredients: (Ingredient & { kcal100?: number | null; foodName?: string | null })[]
  steps: RecipeStep[]
  notes: string | null
  fridgeDays: number | null
  freezable: boolean | null
  nutrition: PerServing
  manualKcal: number | null
  manualProtein: number | null
  createdBy: string | null
  creatorName: string | null
  updatedAt: string | null
  lastImportedAt: string | null
  extraFrontmatter: Record<string, unknown>
  extraSections: { heading: string; body: string }[]
  createdAt: string | null
}

export const HIGH_PROTEIN_GRAMS = 30
