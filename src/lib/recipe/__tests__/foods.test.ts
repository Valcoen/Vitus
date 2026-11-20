import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseIngredientLine } from '../ingredients'
import { indexFoods, matchFood, gramsFor, deriveDiet, computeMacros, toPlannerIngredients, type FoodItemLite } from '../nutrition'
import { resolveCategories } from '../importer'
import { parseRecipeMarkdown, recipeToMarkdown } from '../markdown'
import { mealTypeForSlots, validateRecipe } from '../validate'

const f = (id: string, name: string, extra: Partial<FoodItemLite> = {}): FoodItemLite => ({
  id, name, kcal_100g: 100, protein_100g: 10, carbs_100g: 10, fat_100g: 1, kind: 'ingredient', source: 'swiss_fcdb', ...extra,
})
const FOODS = [
  f('zr', 'Zwiebel, roh', { unit_grams: { Stück: 150 }, aliases: ['Zwiebeln'], is_vegetarian: true, is_vegan: true, kcal_100g: 39 }),
  f('zg', 'Zwiebel, gedünstet (ohne Zugabe von Fett und Salz)', { is_vegetarian: true, is_vegan: true }),
  f('zk', 'Zwiebelkuchen, gebacken', { kind: 'dish' }),
  f('ei', 'Ei, ganz, roh', { unit_grams: { Stück: 55 }, aliases: ['Ei', 'Eier'], is_vegetarian: true, is_vegan: false, kcal_100g: 140 }),
  f('oel', 'Olivenöl', { density: 0.91, is_vegetarian: true, is_vegan: true, kcal_100g: 900, source: 'vitus' }),
  f('hon', 'Honig (Blütenhonig)', { unit_grams: { EL: 20 }, is_vegetarian: true, is_vegan: false }),
  f('hack', 'Hackfleisch (Durchschnitt aus Rind, Kalb, Schwein, Hähnchen), roh', { aliases: ['Hackfleisch gemischt'], is_vegetarian: false, is_vegan: false }),
  f('sell', 'Stangensellerie, roh', { unit_grams: { Stange: 40, Stück: 40 }, aliases: ['Staudensellerie'], is_vegetarian: true, is_vegan: true }),
  f('tom', 'Tomate, roh', { unit_grams: { Stück: 120 }, is_vegetarian: true, is_vegan: true }),
  f('old', 'Tomate', { is_hidden: true, source: 'vitus' }),
  f('parm', 'Parmesan', { is_vegetarian: true, is_vegan: false }),
  f('salz', 'Salz, Meersalz', { is_vegetarian: true, is_vegan: true }),
]
const idx = indexFoods(FOODS)
const line = (s: string) => parseIngredientLine(s)

test('matching prefers raw ingredients over cooked foods and dishes', () => {
  assert.equal(matchFood(line('1 Zwiebel'), idx)?.id, 'zr')
  assert.equal(matchFood(line('2 Zwiebeln'), idx)?.id, 'zr') // synonym / plural
  assert.equal(matchFood(line('1 große Zwiebel (ca. 200 g)'), idx)?.id, 'zr')
  assert.equal(matchFood(line('3 Eier'), idx)?.id, 'ei')
  assert.equal(matchFood(line('4 Stangen Staudensellerie'), idx)?.id, 'sell')
  assert.equal(matchFood(line('1 kg Hackfleisch: 600 g Rind + 400 g Schwein'), idx)?.id, 'hack')
  assert.equal(matchFood(line('2 Tomaten'), idx)?.id, 'tom') // hidden duplicate loses against the visible one
  assert.equal(matchFood({ ...line('2 Tomaten'), food_item_id: 'old' }, idx)?.id, 'old') // explicit link wins
  assert.equal(matchFood(line('200 g Einhornstaub'), idx), null)
})

test('grams from units, pieces, spoons and density', () => {
  const g = (s: string) => gramsFor(line(s), matchFood(line(s), idx))
  assert.equal(g('2 Zwiebeln'), 300)
  assert.equal(g('1 große Zwiebel (ca. 200 g)'), 200) // written weight wins
  assert.equal(g('3 Eier'), 165)
  assert.equal(g('4 Stangen Staudensellerie'), 160)
  assert.equal(g('2 EL Honig'), 40) // food-specific spoon
  assert.equal(Math.round(g('2 EL Olivenöl')!), 27) // 30 ml × 0.91
  assert.equal(Math.round(g('100 ml Olivenöl')!), 91)
  assert.equal(g('1 kg Hackfleisch'), 1000)
  assert.equal(g('1 Bund Petersilie'), null) // unknown food, unknown unit
})

test('macros use the food unit data', () => {
  const m = computeMacros(['2 Zwiebeln', '3 Eier', 'Salz'].map(line), idx)
  assert.equal(m.matched, 2)
  assert.equal(Math.round(m.kcal), Math.round(300 * 0.39 + 165 * 1.4))
})

test('diet is only claimed when every weighed ingredient is known', () => {
  assert.deepEqual(deriveDiet(['2 Zwiebeln', '2 EL Olivenöl', 'Salz'].map(line), idx), ['vegetarian', 'vegan'])
  assert.deepEqual(deriveDiet(['2 Zwiebeln', '3 Eier'].map(line), idx), ['vegetarian'])
  assert.deepEqual(deriveDiet(['2 Zwiebeln', '500 g Hackfleisch'].map(line), idx), [])
  assert.deepEqual(deriveDiet(['2 Zwiebeln', '200 g Einhornstaub'].map(line), idx), []) // unknown → no claim
  assert.deepEqual(deriveDiet(['2 Zwiebeln', 'Parmesan, gerieben (nach Belieben)'].map(line), idx), ['vegetarian']) // no amount, but known
  assert.deepEqual(deriveDiet([], idx), [])
})

test('planner amounts are keyed by the linked food name', () => {
  const stored = ['2 Zwiebeln', '3 Eier', '2 EL Honig'].map(line)
  assert.deepEqual(toPlannerIngredients(stored, idx), { 'Zwiebel, roh': 300, 'Ei, ganz, roh': 3, 'Honig (Blütenhonig)': 40 })
})

const TAX = {
  courses: [
    { slug: 'hauptgericht', label: 'Hauptgericht', sort: 20, plan_slots: ['lunch', 'dinner'], is_treat: false },
    { slug: 'kuchen', label: 'Kuchen & Torten', sort: 80, plan_slots: ['snack'], is_treat: true },
  ],
  cuisines: [{ slug: 'italienisch', label: 'Italienisch', sort: 20 }],
  foodCategories: [],
}

test('course and cuisine from front matter: slug, label or start of label', () => {
  const md = (fm: string) => parseRecipeMarkdown(`---\ntitle: X\n${fm}\n---\n## Zutaten\n- 1 Ei\n`, 'x.md').doc
  assert.deepEqual(resolveCategories(md('art: Kuchen & Torten\nküche: italienisch'), TAX), { course: 'kuchen', cuisine: 'italienisch', warnings: [] })
  assert.equal(resolveCategories(md('course: kuchen'), TAX).course, 'kuchen')
  assert.equal(resolveCategories(md('gang: Kuchen'), TAX).course, 'kuchen')
  const unknown = resolveCategories(md('cuisine: Marsianisch'), TAX)
  assert.equal(unknown.cuisine, null)
  assert.match(unknown.warnings[0], /Marsianisch/)
  // export writes them back
  const doc = { ...md(''), course: 'kuchen', cuisine: 'italienisch' }
  assert.match(recipeToMarkdown(doc), /course: kuchen\ncuisine: italienisch/)
})

test('meal type for the planner follows the course', () => {
  assert.equal(mealTypeForSlots(['lunch', 'dinner']), 'lunch')
  assert.equal(mealTypeForSlots(['snack']), 'snack')
  assert.equal(mealTypeForSlots(['breakfast']), 'breakfast')
  assert.equal(mealTypeForSlots([]), null)
})

test('editor food links survive validation, bad ids are dropped', () => {
  const id = '0b8f2f4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
  const v = validateRecipe({ title: 'T', servings: 2, ingredientLines: ['### Teig', '200 g Mehl', '1 Ei'], ingredientFoodIds: [null, id, 'drop table'], steps: [], course: 'kuchen', cuisine: 'Bad Slug!' })
  assert.ok(v.ok)
  if (!v.ok) return
  assert.equal(v.recipe.ingredients[0].food_item_id, id)
  assert.equal(v.recipe.ingredients[1].food_item_id ?? null, null)
  assert.equal(v.recipe.course, 'kuchen')
  assert.equal(v.recipe.cuisine, null)
})
