import type { RecipeView } from './types'
import type { RecipeDoc } from './markdown'
import type { FrontmatterValue } from './frontmatter'
import { slugify } from './markdown'

/**
 * RecipeView → RecipeDoc for Markdown export.
 * kcal/protein: the entered values; if none, the computed ones (so the
 * Obsidian note shows them). Photos are exported as their public URL;
 * a re-import ignores URLs and keeps the photo stored in Vitus.
 */
export function viewToDoc(r: RecipeView): RecipeDoc {
  const created = r.createdAt ? r.createdAt.slice(0, 10) : null
  return {
    slug: r.slug ?? slugify(r.title),
    title: r.title,
    status: r.status,
    rating: r.rating,
    course: r.course,
    cuisine: r.cuisine,
    description: r.description,
    image: r.imageUrl,
    servings: r.servings,
    prep_time: r.prepTime,
    cook_time: r.cookTime,
    kcal: r.manualKcal ?? r.nutrition.kcal,
    protein: r.manualProtein ?? r.nutrition.protein,
    fridge_days: r.fridgeDays,
    freezable: r.freezable,
    tags: r.tags,
    created,
    ingredients: r.ingredients.map(({ kcal100: _k, food_item_id: _f, category: _c, ...ing }) => ing),
    steps: r.steps,
    notes: r.notes,
    extra_frontmatter: (r.extraFrontmatter ?? {}) as Record<string, FrontmatterValue>,
    extra_sections: r.extraSections ?? [],
  }
}

export const markdownFilename = (r: RecipeView) => `${r.slug ?? slugify(r.title)}.md`
