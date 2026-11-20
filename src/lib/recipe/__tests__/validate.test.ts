import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateRecipe, ingredientsToLines, cleanText, normalizeTag } from '../validate'

const base = { title: 'Chili', servings: '4', ingredientLines: ['400 g Bohnen'], steps: [{ text: 'Kochen.' }] }

test('valid input is cleaned and parsed', () => {
  const r = validateRecipe({
    ...base,
    title: '  Chili \n sin Carne ',
    tags: '#MealPrep, high protein, mealprep',
    kcal_per_serving: '520',
    protein_per_serving: '27,5',
    ingredientLines: ['### Basis', '400 g Bohnen', '', 'Salz', '### Topping', '1 Avocado'],
    steps: [{ text: 'Zwiebeln hacken.' }, { text: '  ' }, { text: 'Köcheln', timer_minutes: '25' }],
    meal_type: 'dinner',
  })
  assert.ok(r.ok)
  if (!r.ok) return
  const x = r.recipe
  assert.equal(x.title, 'Chili sin Carne')
  assert.equal(x.standard_servings, 4)
  assert.deepEqual(x.tags, ['mealprep', 'high-protein'])
  assert.equal(x.protein_per_serving, 27.5)
  assert.deepEqual(x.ingredients.map(i => [i.name, i.group]), [['Bohnen', 'Basis'], ['Salz', 'Basis'], ['Avocado', 'Topping']])
  assert.equal(x.steps.length, 2)
  assert.equal(x.steps[1].timer_seconds, 1500)
  assert.equal(x.instructions, '1. Zwiebeln hacken.\n\n2. Köcheln')
  assert.equal(x.meal_type, 'dinner')
})

test('rejects missing title and out-of-range numbers', () => {
  const r = validateRecipe({ ...base, title: ' ', servings: 0, kcal_per_serving: 'abc', fridge_days: 400 })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.errors.length, 4)
})

test('strips control characters and bounds length', () => {
  assert.equal(cleanText('a\u0000b\u0007c', 10), 'abc')
  assert.equal(cleanText('x'.repeat(500), 200).length, 200)
  assert.equal(cleanText('line1\r\nline2', 50, true), 'line1\nline2')
})

test('HTML is kept as plain text (React escapes it on render)', () => {
  const r = validateRecipe({ ...base, title: '<img src=x onerror=alert(1)>' })
  assert.ok(r.ok && r.recipe.title === '<img src=x onerror=alert(1)>')
})

test('unknown meal type is dropped, empty optional fields become null', () => {
  const r = validateRecipe({ ...base, meal_type: 'brunch', prep_time: '', notes: '   ' })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.recipe.meal_type, null)
  assert.equal(r.recipe.prep_time, null)
  assert.equal(r.recipe.notes, null)
})

test('ingredient lines round-trip with groups', () => {
  const r = validateRecipe({ ...base, ingredientLines: ['### A', '1 Ei', 'Salz', '### B', '2 EL Öl'] })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.deepEqual(ingredientsToLines(r.recipe.ingredients), ['### A', '1 Ei', 'Salz', '### B', '2 EL Öl'])
})

test('normalizeTag', () => {
  assert.equal(normalizeTag(' #High Protein! '), 'high-protein')
})
