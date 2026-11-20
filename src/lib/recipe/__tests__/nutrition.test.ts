import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseIngredientLine } from '../ingredients'
import { toPlannerIngredients, computeMacros, indexFoods, perServing, plannerAmount } from '../nutrition'

const foods = indexFoods([
  { id: 'r', name: 'Reis', kcal_100g: 350, protein_100g: 7, carbs_100g: 78, fat_100g: 1 },
  { id: 'o', name: 'Olivenöl', kcal_100g: 880, protein_100g: 0, carbs_100g: 0, fat_100g: 100 },
  { id: 'e', name: 'Eier', kcal_100g: 150, protein_100g: 13, carbs_100g: 1, fat_100g: 10 },
])

test('legacy formats pass through to the planner untouched', () => {
  const legacy = { Mango: 400 }
  assert.equal(toPlannerIngredients(legacy), legacy)
  const legacyArr = [{ food_item_id: 'x', amount: 1, unit: 'g' }]
  assert.equal(toPlannerIngredients(legacyArr), legacyArr)
})

test('unified format becomes name → amount, unweighable lines skipped', () => {
  const stored = ['200 g Reis', '1 EL Olivenöl', '3 Eier', '1 onion', 'Salz'].map(l => parseIngredientLine(l))
  assert.deepEqual(toPlannerIngredients(stored), { Reis: 200, 'Olivenöl': 15, Eier: 3 })
})

test('planner amount for kg and ml', () => {
  assert.equal(plannerAmount(parseIngredientLine('1,5 kg Reis')), 1500)
  assert.equal(plannerAmount(parseIngredientLine('250 ml Milch')), 250)
})

test('computes macros with case-insensitive name matching and egg pieces', () => {
  const ings = ['200 g reis', '2 Eier', 'Salz'].map(l => parseIngredientLine(l))
  const m = computeMacros(ings, foods)
  assert.equal(m.matched, 2)
  assert.equal(m.total, 3)
  assert.equal(Math.round(m.kcal), 700 + 165) // 2 eggs × 55 g × 1.5 kcal/g
})

test('per serving: manual values win, computed as fallback', () => {
  const m = computeMacros([parseIngredientLine('400 g Reis')], foods)
  const computed = perServing(m, 2, { kcal: null, protein: null })
  assert.deepEqual([computed.kcal, computed.protein, computed.source], [700, 14, 'computed'])
  const manual = perServing(m, 2, { kcal: 520, protein: null })
  assert.deepEqual([manual.kcal, manual.protein, manual.source], [520, 14, 'manual'])
  const none = perServing(computeMacros([parseIngredientLine('1 onion')], foods), 2, { kcal: null, protein: null })
  assert.equal(none.source, 'none')
})
