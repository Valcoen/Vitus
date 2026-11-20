/**
 * Finds which ingredients a step mentions, so cook mode can show the
 * (scaled) amounts right inside the step: "Zwiebeln würfeln" → "1 Zwiebel".
 * Heuristic and deliberately conservative: stems of ≥ 4 letters, matched at
 * the start of a word; very short names (Öl, Ei) only as whole words.
 */

import type { Ingredient } from './ingredients'

const words = (s: string) => s.toLowerCase().match(/[a-zäöüß]+/g) ?? []

function stem(w: string): string {
  const s = w.replace(/(en|n|e|s)$/, '')
  return s.length >= 4 ? s : w
}

const STOP = new Set(['und', 'oder', 'mit', 'von', 'frisch', 'frische', 'frischer', 'gehackt', 'fein', 'grob', 'große', 'kleine', 'fresh', 'chopped', 'large', 'small', 'optional', 'etwas'])

/** Search keys for one ingredient name. */
export function ingredientKeys(name: string): { prefixes: string[]; exact: string[] } {
  const ws = words(name.replace(/\(.*?\)/g, '')).filter(w => !STOP.has(w))
  const prefixes: string[] = []
  const exact: string[] = []
  for (const w of ws) {
    if (w.length >= 4) prefixes.push(stem(w))
    else if (ws.length === 1) exact.push(w)
  }
  return { prefixes, exact }
}

/** Indices of ingredients mentioned in the step text, in ingredient-list order. */
export function ingredientsInStep(stepText: string, ingredients: Pick<Ingredient, 'name'>[]): number[] {
  const stepWords = words(stepText)
  const hits: number[] = []
  ingredients.forEach((ing, idx) => {
    const { prefixes, exact } = ingredientKeys(ing.name)
    const hit =
      stepWords.some(w => prefixes.some(p => w.startsWith(p))) ||
      stepWords.some(w => exact.includes(w))
    if (hit) hits.push(idx)
  })
  return hits
}
