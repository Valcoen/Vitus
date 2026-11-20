import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ingredientsInStep } from '../stepIngredients'

const ings = [
  { name: 'Zwiebeln' },
  { name: 'kidney beans' },
  { name: 'Öl' },
  { name: 'Hähnchenbrust' },
  { name: 'Knoblauch (frisch)' },
  { name: 'Salz' },
]

test('matches plural/singular German forms', () => {
  assert.deepEqual(ingredientsInStep('Die Zwiebel fein würfeln.', ings), [0])
})

test('matches English words and multiple ingredients', () => {
  assert.deepEqual(ingredientsInStep('Add the beans and garlic, salt to taste', ings), [1])
  assert.deepEqual(ingredientsInStep('Knoblauch und Zwiebeln anschwitzen, salzen', ings), [0, 4, 5])
})

test('short names only match as whole words', () => {
  assert.deepEqual(ingredientsInStep('Öl in der Pfanne erhitzen', ings), [2])
  assert.deepEqual(ingredientsInStep('Ölig wird es nicht', ings), [])
})

test('compound start matches', () => {
  assert.deepEqual(ingredientsInStep('Hähnchenbrust in Streifen schneiden', ings), [3])
})

test('no match → empty', () => {
  assert.deepEqual(ingredientsInStep('Alles servieren.', ings), [])
})
