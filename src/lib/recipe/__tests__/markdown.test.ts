import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRecipeMarkdown, recipeToMarkdown, slugify } from '../markdown'
import { parseFrontmatter } from '../frontmatter'

// The exact example format from the Obsidian vault.
const CHILI = `---
categories:
  - "[[Recipes]]"
title: Chili sin Carne
status: ready
image: chili-sin-carne.jpg   # optional; images are normally uploaded in the app
servings: 4
prep_time: 15
cook_time: 40
kcal: 520
protein: 28
fridge_days: 4
freezable: true
tags: [mealprep, high-protein]
created: 2026-11-20
---
## Ingredients
- 400 g kidney beans
- 1 onion
## Steps
1. Chop onion and garlic.
2. Simmer for 25 min.
## Notes
Reheat covered, add a splash of water.
`

test('parses the reference recipe', () => {
  const { doc, ready, warnings } = parseRecipeMarkdown(CHILI, 'Chili sin Carne.md')
  assert.equal(ready, true)
  assert.equal(doc.title, 'Chili sin Carne')
  assert.equal(doc.slug, 'chili-sin-carne')
  assert.equal(doc.image, 'chili-sin-carne.jpg') // trailing comment stripped
  assert.deepEqual(
    [doc.servings, doc.prep_time, doc.cook_time, doc.kcal, doc.protein, doc.fridge_days, doc.freezable],
    [4, 15, 40, 520, 28, 4, true],
  )
  assert.deepEqual(doc.tags, ['mealprep', 'high-protein'])
  assert.equal(doc.created, '2026-11-20')
  assert.equal(doc.ingredients.length, 2)
  assert.deepEqual([doc.ingredients[0].qty, doc.ingredients[0].unit, doc.ingredients[0].name], [400, 'g', 'kidney beans'])
  assert.deepEqual(doc.steps.map(s => s.text), ['Chop onion and garlic.', 'Simmer for 25 min.'])
  assert.equal(doc.notes, 'Reheat covered, add a splash of water.')
  assert.deepEqual(doc.extra_frontmatter.categories, ['[[Recipes]]'])
  assert.deepEqual(warnings, [])
})

test('drafts and files without status are not ready', () => {
  assert.equal(parseRecipeMarkdown(CHILI.replace('status: ready', 'status: draft')).ready, false)
  assert.equal(parseRecipeMarkdown(CHILI.replace('status: ready\n', '')).ready, false)
  const noFm = parseRecipeMarkdown('## Ingredients\n- 1 Ei\n', 'Ei.md')
  assert.equal(noFm.ready, false)
  assert.equal(noFm.doc.title, 'Ei')
})

test('status is case-insensitive', () => {
  assert.equal(parseRecipeMarkdown(CHILI.replace('status: ready', 'status: Ready')).ready, true)
})

test('unparseable ingredient lines are kept and reported', () => {
  const md = CHILI.replace('- 1 onion', '- 1 onion\n- Salz und Pfeffer nach Geschmack')
  const { doc, warnings } = parseRecipeMarkdown(md, 'x.md')
  assert.equal(doc.ingredients.length, 3)
  assert.equal(doc.ingredients[2].raw, 'Salz und Pfeffer nach Geschmack')
  assert.ok(warnings.some(w => w.includes('Salz und Pfeffer')))
})

test('German headings, ingredient groups, multi-line steps', () => {
  const md = `---
title: Bowl
status: ready
servings: 2
---
## Zutaten
### Bowl
- 150 g Reis
### Sauce
- 2 EL Sojasauce
## Zubereitung
1. Reis kochen.
   Danach abkühlen lassen.
2) Sauce anrühren.
## Notizen
Hält 3 Tage.
`
  const { doc } = parseRecipeMarkdown(md)
  assert.deepEqual(doc.ingredients.map(i => i.group), ['Bowl', 'Sauce'])
  assert.equal(doc.steps.length, 2)
  assert.equal(doc.steps[0].text, 'Reis kochen.\nDanach abkühlen lassen.')
  assert.equal(doc.notes, 'Hält 3 Tage.')
})

test('paragraph-style steps without numbers', () => {
  const { doc } = parseRecipeMarkdown('---\nstatus: ready\n---\n## Steps\nFirst do this.\n\nThen that.\n')
  assert.deepEqual(doc.steps.map(s => s.text), ['First do this.', 'Then that.'])
})

test('tolerates odd values with warnings instead of failing', () => {
  const md = CHILI.replace('kcal: 520', 'kcal: 520 kcal').replace('servings: 4', 'servings: viele')
  const { doc, warnings } = parseRecipeMarkdown(md)
  assert.equal(doc.kcal, 520)
  assert.equal(doc.servings, 1)
  assert.ok(warnings.length >= 2)
})

test('CRLF line endings and BOM', () => {
  const { doc, ready } = parseRecipeMarkdown('\uFEFF' + CHILI.replace(/\n/g, '\r\n'))
  assert.equal(ready, true)
  assert.equal(doc.ingredients.length, 2)
})

test('round trip: export then re-import yields the same recipe', () => {
  const first = parseRecipeMarkdown(CHILI, 'Chili sin Carne.md').doc
  const md = recipeToMarkdown(first)
  assert.match(md, /^---\ncategories:\n  - "\[\[Recipes\]\]"\ntitle: Chili sin Carne\n/)
  assert.match(md, /\nstatus: ready\n/)
  assert.match(md, /\n- 400 g kidney beans\n- 1 onion\n/)
  assert.match(md, /\n1\. Chop onion and garlic\.\n2\. Simmer for 25 min\.\n/)
  const second = parseRecipeMarkdown(md, 'renamed-in-obsidian.md')
  assert.equal(second.ready, true)
  assert.equal(second.doc.slug, 'chili-sin-carne') // slug survives a file rename
  assert.deepEqual({ ...second.doc, extra_sections: [] }, { ...first, extra_sections: [] })
})

test('export preserves unknown front matter and sections', () => {
  const md = CHILI.replace('created:', 'source: Oma\ncreated:') + '## Variationen\nMit Mais.\n'
  const doc = parseRecipeMarkdown(md).doc
  const out = recipeToMarkdown(doc)
  assert.match(out, /\nsource: Oma\n/)
  assert.match(out, /\n## Variationen\nMit Mais\.\n/)
})

test('export quotes values that would otherwise break YAML', () => {
  const doc = parseRecipeMarkdown(CHILI).doc
  doc.title = 'Bowl: Lachs & Reis'
  const back = parseRecipeMarkdown(recipeToMarkdown(doc)).doc
  assert.equal(back.title, 'Bowl: Lachs & Reis')
})

test('slugify', () => {
  assert.equal(slugify('Hähnchen-Brokkoli-Wok mit Reis'), 'haehnchen-brokkoli-wok-mit-reis')
  assert.equal(slugify('Crème brûlée.md'), 'creme-brulee')
  assert.equal(slugify('!!!'), 'rezept')
})

test('front matter: block lists, inline lists, quotes, booleans', () => {
  const { data } = parseFrontmatter('a:\n  - x\n  - "y z"\nb: [1, "two, three"]\nc: yes\nd: \'it\'\'s\'\ne:')
  assert.deepEqual(data, { a: ['x', 'y z'], b: [1, 'two, three'], c: true, d: "it's", e: null })
})
