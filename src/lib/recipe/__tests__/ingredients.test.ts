import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseIngredientLine, parseNumber, normalizeIngredients, scaleIngredient,
  formatIngredient, ingredientToMarkdownLine, toGrams, roundForUnit,
} from '../ingredients'

test('parseNumber handles decimals, commas and fractions', () => {
  assert.equal(parseNumber('2'), 2)
  assert.equal(parseNumber('1,5'), 1.5)
  assert.equal(parseNumber('1.5'), 1.5)
  assert.equal(parseNumber('1/2'), 0.5)
  assert.equal(parseNumber('1 1/2'), 1.5)
  assert.equal(parseNumber('½'), 0.5)
  assert.equal(parseNumber('1½'), 1.5)
  assert.equal(parseNumber('1/0'), null)
  assert.equal(parseNumber('abc'), null)
})

test('parses amount + unit + name', () => {
  const i = parseIngredientLine('- 400 g kidney beans')
  assert.equal(i.qty, 400)
  assert.equal(i.unit, 'g')
  assert.equal(i.name, 'kidney beans')
  assert.equal(i.raw, '400 g kidney beans')
})

test('unit glued to number and German units', () => {
  assert.deepEqual(
    [parseIngredientLine('200g Reis').unit, parseIngredientLine('200g Reis').name],
    ['g', 'Reis'],
  )
  const el = parseIngredientLine('2 EL Olivenöl')
  assert.equal(el.unit, 'EL')
  assert.equal(el.name, 'Olivenöl')
  assert.equal(parseIngredientLine('1 tsp cumin').unit, 'TL')
  assert.equal(parseIngredientLine('1,5 kg Kartoffeln').qty, 1.5)
})

test('pieces: number followed by a non-unit word', () => {
  const i = parseIngredientLine('1 onion')
  assert.equal(i.qty, 1)
  assert.equal(i.unit, null)
  assert.equal(i.name, 'onion')
})

test('ranges', () => {
  const i = parseIngredientLine('2-3 Zehen Knoblauch')
  assert.equal(i.qty, 2)
  assert.equal(i.qtyMax, 3)
  assert.equal(i.unit, 'Zehe')
  assert.equal(i.name, 'Knoblauch')
})

test('unparseable lines are kept as plain text, never dropped', () => {
  for (const line of ['Salz und Pfeffer', 'etwas Petersilie zum Garnieren', '400 g', '']) {
    const i = parseIngredientLine(line)
    assert.equal(i.qty, null)
    assert.equal(i.raw, line)
    assert.equal(i.name, line)
  }
})

test('checkbox list items from Obsidian are accepted', () => {
  assert.equal(parseIngredientLine('- [ ] 1 Dose Tomaten').unit, 'Dose')
  assert.equal(parseIngredientLine('- [x] 1 Dose Tomaten').name, 'Tomaten')
})

test('normalizes legacy object format, incl. the egg-as-pieces rule', () => {
  const list = normalizeIngredients({ Mango: 400, Eier: 4 })
  assert.equal(list.length, 2)
  assert.deepEqual([list[0].qty, list[0].unit, list[0].name], [400, 'g', 'Mango'])
  assert.deepEqual([list[1].qty, list[1].unit, list[1].name], [4, null, 'Eier'])
})

test('normalizes legacy food_item_id array format', () => {
  const list = normalizeIngredients([{ food_item_id: 'abc', amount: 150, unit: 'g' }], { abc: 'Reis' })
  assert.deepEqual([list[0].qty, list[0].unit, list[0].name, list[0].food_item_id], [150, 'g', 'Reis', 'abc'])
})

test('normalize passes unified format through and tolerates junk', () => {
  const u = { raw: '1 onion', qty: 1, unit: null, name: 'onion' }
  assert.equal(normalizeIngredients([u])[0].name, 'onion')
  assert.deepEqual(normalizeIngredients(null), [])
  assert.deepEqual(normalizeIngredients([null, 5]), [])
})

test('scaling multiplies amounts and leaves unquantified lines alone', () => {
  assert.equal(scaleIngredient(parseIngredientLine('400 g Bohnen'), 1.5).qty, 600)
  assert.equal(scaleIngredient(parseIngredientLine('1 onion'), 0.5).qty, 0.5)
  const salt = parseIngredientLine('Salz')
  assert.equal(scaleIngredient(salt, 3), salt)
  const range = scaleIngredient(parseIngredientLine('2-3 Zehen Knoblauch'), 2)
  assert.deepEqual([range.qty, range.qtyMax], [4, 6])
})

test('rounding is sensible per unit', () => {
  assert.equal(roundForUnit(633.3, 'g'), 635)
  assert.equal(roundForUnit(33.3, 'g'), 33)
  assert.equal(roundForUnit(0.33, 'TL'), 0.25)
  assert.equal(roundForUnit(0.05, null), 0.25) // never rounds a real amount to zero
})

test('formatting', () => {
  assert.equal(formatIngredient(parseIngredientLine('1,5 kg Kartoffeln')), '1½ kg Kartoffeln')
  assert.equal(formatIngredient(scaleIngredient(parseIngredientLine('1 TL Salz'), 0.5)), '½ TL Salz')
  assert.equal(formatIngredient(parseIngredientLine('Salz und Pfeffer')), 'Salz und Pfeffer')
})

test('markdown export keeps original wording when unchanged', () => {
  const i = parseIngredientLine('1/2 tsp cumin')
  assert.equal(ingredientToMarkdownLine(i), '1/2 tsp cumin')
  const edited = { ...i, qty: 1 }
  assert.equal(ingredientToMarkdownLine(edited), '1 TL cumin')
})

test('toGrams', () => {
  assert.equal(toGrams({ qty: 1.5, unit: 'kg' }), 1500)
  assert.equal(toGrams({ qty: 2, unit: 'EL' }), null)
  assert.equal(toGrams({ qty: null, unit: 'g' }), null)
})
