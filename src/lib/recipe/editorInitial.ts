import type { RecipeView } from './types'
import type { EditorInitial } from '@/components/recipe/RecipeEditor'
import { ingredientsToLines } from './validate'

const s = (v: number | null | undefined) => (v == null ? '' : String(v))

/** Food ids aligned with ingredientsToLines (group headings get null). */
function foodIdsForLines(ingredients: RecipeView['ingredients']): (string | null)[] {
  const out: (string | null)[] = []
  let group: string | null = null
  for (const ing of ingredients) {
    if ((ing.group ?? null) !== group) {
      group = ing.group ?? null
      if (group) out.push(null)
    }
    out.push(ing.food_item_id ?? null)
  }
  return out
}

export function emptyEditor(): EditorInitial {
  return {
    id: null, updatedAt: null, title: '', description: '', servings: 4, prepTime: '', cookTime: '',
    kcal: '', protein: '', fridgeDays: '', freezable: null, notes: '', mealType: '', tags: [],
    ingredientLines: [], ingredientFoodIds: [], course: '', cuisine: '', steps: [], imageUrl: null, status: 'draft', rating: '', sections: [],
  }
}

export function editorFromRecipe(r: RecipeView): EditorInitial {
  return {
    id: r.id,
    updatedAt: r.updatedAt,
    title: r.title,
    description: r.description ?? '',
    servings: r.servings,
    prepTime: s(r.prepTime),
    cookTime: s(r.cookTime),
    kcal: s(r.manualKcal),
    protein: s(r.manualProtein),
    fridgeDays: s(r.fridgeDays),
    freezable: r.freezable,
    notes: r.notes ?? '',
    mealType: r.mealType ?? '',
    tags: r.tags,
    ingredientLines: ingredientsToLines(r.ingredients),
    ingredientFoodIds: foodIdsForLines(r.ingredients),
    course: r.course ?? '',
    cuisine: r.cuisine ?? '',
    steps: r.steps.map(st => ({ text: st.text, timerMinutes: st.timer_seconds ? String(Math.round(st.timer_seconds / 6) / 10) : '', section: st.section ?? null })),
    imageUrl: r.imageUrl,
    status: r.status,
    rating: s(r.rating),
    sections: r.extraSections,
  }
}
