import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRecipeMarkdown, recipeToMarkdown } from '../markdown'
import { findImage } from '../importer'
import { detectTimers } from '../timers'
import { nutritionGrams, plainName } from '../nutrition'

// Real note from the Obsidian vault (no status, no title, no servings).
// Tests are compiled to .test-build, the fixture stays in the source tree.
const RAGU = readFileSync(join(process.cwd(), 'src/lib/recipe/__tests__/fixtures/Ragu__Bolognese.md'), 'utf8')

test('Obsidian note: title from filename, draft, rating, image embed', () => {
  const { doc, ready } = parseRecipeMarkdown(RAGU, 'Ragu__Bolognese.md')
  assert.equal(ready, false)
  assert.equal(doc.title, 'Ragu Bolognese')
  assert.equal(doc.slug, 'ragu-bolognese')
  assert.equal(doc.rating, 8)
  assert.equal(doc.image, 'image.jpg')
  assert.equal(doc.servings, 4)
  assert.equal(doc.cook_time, 120) // "Köchelzeit: 2–2,5 Std."
  assert.deepEqual(doc.extra_frontmatter.categories, ['[[Rezepte]]'])
  assert.match(doc.description!, /^\*\*Topf:\*\* groß/)
  assert.doesNotMatch(doc.description!, /---|!\[\[/)
})

test('Obsidian note: bold ingredient groups and footnote marks', () => {
  const { doc } = parseRecipeMarkdown(RAGU, 'Ragu__Bolognese.md')
  assert.equal(doc.ingredients.length, 15)
  assert.deepEqual([...new Set(doc.ingredients.map(i => i.group))], ['Fleisch', 'Soffritto', 'Sauce', 'Zum Servieren'])
  const pasta = doc.ingredients.find(i => i.name === 'Tagliatelle')!
  assert.deepEqual([pasta.qty, pasta.unit, pasta.mark], [500, 'g', '*'])
  const onion = doc.ingredients.find(i => i.name.includes('Zwiebel'))!
  assert.equal(onion.mark, '*')
  assert.equal(nutritionGrams(onion), 200) // "(ca. 200 g)"
  assert.equal(plainName(onion.name), 'Zwiebel')
  assert.equal(doc.ingredients.find(i => i.raw.startsWith('Salz'))!.qty, null)
})

test('Obsidian note: steps keep their ### sections, rules section kept', () => {
  const { doc } = parseRecipeMarkdown(RAGU, 'Ragu__Bolognese.md')
  assert.equal(doc.steps.length, 35)
  assert.equal(doc.steps[0].section, 'Gemüse schneiden')
  assert.equal(doc.steps[2].section, 'Pancetta auslassen (optional)')
  assert.equal(new Set(doc.steps.map(s => s.section)).size, 12)
  assert.deepEqual(doc.extra_sections.map(s => s.heading), ['Regeln'])
  assert.match(doc.extra_sections[0].body, /Kein Knoblauch/)
  // timers in the long simmer steps
  const simmer = doc.steps.find(s => s.text.startsWith('1 Std. köcheln'))!
  assert.equal(detectTimers(simmer.text)[0].seconds, 3600)
  const total = doc.steps.find(s => s.text.startsWith('Gesamt'))!
  assert.deepEqual([detectTimers(total.text)[0].seconds, detectTimers(total.text)[0].maxSeconds], [7200, 9000])
})

test('Obsidian note: export → import keeps everything', () => {
  const first = parseRecipeMarkdown(RAGU, 'Ragu__Bolognese.md').doc
  const md = recipeToMarkdown(first)
  assert.match(md, /status: draft/)
  assert.match(md, /rating: 8/)
  assert.match(md, /### Pancetta auslassen \(optional\)/)
  assert.match(md, /- 500 g Tagliatelle \\\*/)
  const again = parseRecipeMarkdown(md, 'ragu-bolognese.md').doc
  assert.equal(again.title, first.title)
  assert.deepEqual(again.ingredients, first.ingredients)
  assert.deepEqual(again.steps, first.steps)
  assert.deepEqual(again.extra_sections, first.extra_sections)
  assert.equal(again.rating, 8)
  assert.equal(again.description, first.description)
  // published recipes export as ready
  assert.match(recipeToMarkdown({ ...first, status: 'ready' }), /status: ready/)
})

test('image lookup prefers the copy next to the note', () => {
  const img = (name: string) => ({ name, data: Buffer.from(name) })
  const images = [img('Pasta/image.jpg'), img('Curry/image.jpg'), img('Curry/Bilder/curry.png')]
  assert.equal(findImage('image.jpg', 'Pasta/Ragu.md', images, 2).image?.name, 'Pasta/image.jpg')
  assert.equal(findImage('curry.png', 'Curry/Curry.md', images, 2).image?.name, 'Curry/Bilder/curry.png')
  assert.match(findImage('image.jpg', 'Ragu.md', [img('a/image.jpg'), img('b/image.jpg')], 2).reason!, /mehrfach/)
  assert.match(findImage('foto.jpg', 'Ragu.md', images, 2).reason!, /nicht mitgeliefert/)
  // one note + one image always pair up, whatever the image is called
  assert.equal(findImage('image.jpg', 'Ragu.md', [img('IMG_2041.jpeg')], 1).image?.name, 'IMG_2041.jpeg')
})
