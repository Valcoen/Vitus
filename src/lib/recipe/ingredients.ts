/**
 * Unified ingredient model.
 *
 * Every ingredient line is kept with its original text (`raw`). Structured
 * fields are filled in when the line could be parsed; when it could not, the
 * line is still kept and shown as plain text — never dropped.
 */

export type Ingredient = {
  /** Original line as written (without the leading "- "). */
  raw: string
  /** Numeric amount, or null if none ("Salz und Pfeffer"). */
  qty: number | null
  /** Upper bound for ranges like "2-3 Zehen". */
  qtyMax?: number | null
  /** Normalised unit ("g", "EL", ...) or null for pieces/no unit. */
  unit: string | null
  /** Ingredient name without amount/unit. */
  name: string
  /** Optional sub-heading inside the ingredient list ("Sauce"). */
  group?: string | null
  /** Link into food_items for nutrition, when known. */
  food_item_id?: string | null
  /** Shopping-list category, when known. */
  category?: string | null
}

/** Known units → canonical spelling. Matching is case-insensitive. */
const UNIT_ALIASES: Record<string, string> = {
  g: 'g', gr: 'g', gramm: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilo: 'kg',
  mg: 'mg',
  ml: 'ml', cl: 'cl', dl: 'dl', l: 'l', liter: 'l', litre: 'l',
  el: 'EL', tbsp: 'EL', esslöffel: 'EL',
  tl: 'TL', tsp: 'TL', teelöffel: 'TL',
  prise: 'Prise', prisen: 'Prise', pinch: 'Prise',
  dose: 'Dose', dosen: 'Dose', can: 'Dose', cans: 'Dose',
  bund: 'Bund', bunch: 'Bund',
  zehe: 'Zehe', zehen: 'Zehe', clove: 'Zehe', cloves: 'Zehe',
  stück: 'Stück', stk: 'Stück', 'stk.': 'Stück', pcs: 'Stück', piece: 'Stück', pieces: 'Stück',
  pck: 'Pck', 'pck.': 'Pck', packung: 'Pck', päckchen: 'Pck', pack: 'Pck',
  scheibe: 'Scheibe', scheiben: 'Scheibe', slice: 'Scheibe', slices: 'Scheibe',
  becher: 'Becher', glas: 'Glas', tasse: 'Tasse', cup: 'Tasse', cups: 'Tasse',
  handvoll: 'Handvoll', handful: 'Handvoll',
  msp: 'Msp', 'msp.': 'Msp',
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125,
}

/** Parses "1", "1,5", "1.5", "1/2", "1 1/2", "½", "1½". Returns null if not a number. */
export function parseNumber(token: string): number | null {
  const t = token.trim()
  if (!t) return null
  // mixed unicode: "1½"
  const uni = t.match(/^(\d+)?\s*([½⅓⅔¼¾⅛])$/)
  if (uni) return (uni[1] ? parseInt(uni[1], 10) : 0) + UNICODE_FRACTIONS[uni[2]]
  // mixed fraction: "1 1/2"
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10)
  const frac = t.match(/^(\d+)\/(\d+)$/)
  if (frac) return parseInt(frac[2], 10) === 0 ? null : parseInt(frac[1], 10) / parseInt(frac[2], 10)
  const dec = t.match(/^\d+(?:[.,]\d+)?$/)
  if (dec) return parseFloat(t.replace(',', '.'))
  return null
}

const NUM = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d*[½⅓⅔¼¾⅛]|\d+(?:[.,]\d+)?`
// amount, optional range, optional unit (glued or spaced), rest
const LINE_RE = new RegExp(
  String.raw`^(${NUM})(?:\s*[-–]\s*(${NUM}))?\s*([A-Za-zÄÖÜäöüß]+\.?)?(?:\s+|$)(.*)$`,
)

/** Parses one ingredient line. Never throws; unparseable lines keep qty=null. */
export function parseIngredientLine(line: string, group: string | null = null): Ingredient {
  const raw = line.replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/, '').trim()
  const base: Ingredient = { raw, qty: null, unit: null, name: raw, group }
  const m = raw.match(LINE_RE)
  if (!m) return base

  const qty = parseNumber(m[1])
  if (qty === null) return base
  const qtyMax = m[2] ? parseNumber(m[2]) : null
  let unitToken = m[3] ?? ''
  let rest = (m[4] ?? '').trim()

  let unit: string | null = null
  if (unitToken) {
    const canonical = UNIT_ALIASES[unitToken.toLowerCase()] ?? UNIT_ALIASES[unitToken.toLowerCase().replace(/\.$/, '')]
    if (canonical) {
      unit = canonical
    } else {
      // Not a unit: it's the start of the name ("1 onion", "2 Eier")
      rest = (unitToken + (rest ? ' ' + rest : '')).trim()
    }
  }
  if (!rest) return base // "400 g" with no name → keep as text

  return { raw, qty, qtyMax: qtyMax ?? null, unit, name: rest, group }
}

/** Approximate weight in grams for nutrition, or null if unknown. */
export function toGrams(ing: Pick<Ingredient, 'qty' | 'unit'>): number | null {
  if (ing.qty === null) return null
  switch (ing.unit) {
    case 'g': return ing.qty
    case 'kg': return ing.qty * 1000
    case 'mg': return ing.qty / 1000
    case 'ml': return ing.qty // ≈ water density, good enough for nutrition estimates
    case 'cl': return ing.qty * 10
    case 'dl': return ing.qty * 100
    case 'l': return ing.qty * 1000
    default: return null
  }
}

/**
 * Converts any stored ingredient format into the unified model.
 *  - legacy object  { "Mango": 400 }                    (name → grams)
 *  - legacy array   [{ food_item_id, amount, unit }]   (needs name lookup)
 *  - unified array  [{ raw, qty, unit, name, ... }]
 */
export function normalizeIngredients(
  stored: unknown,
  foodNameById: Record<string, string> = {},
): Ingredient[] {
  if (!stored) return []
  if (Array.isArray(stored)) {
    return stored.flatMap((item): Ingredient[] => {
      if (typeof item === 'string') return [parseIngredientLine(item)]
      if (!item || typeof item !== 'object') return []
      const o = item as Record<string, unknown>
      if (typeof o.raw === 'string') {
        return [{
          raw: o.raw,
          qty: typeof o.qty === 'number' ? o.qty : null,
          qtyMax: typeof o.qtyMax === 'number' ? o.qtyMax : null,
          unit: typeof o.unit === 'string' ? o.unit : null,
          name: typeof o.name === 'string' && o.name ? o.name : o.raw,
          group: typeof o.group === 'string' ? o.group : null,
          food_item_id: typeof o.food_item_id === 'string' ? o.food_item_id : null,
          category: typeof o.category === 'string' ? o.category : null,
        }]
      }
      if (typeof o.food_item_id === 'string') {
        const name = foodNameById[o.food_item_id] ?? 'Unbekannte Zutat'
        return [fromLegacyGrams(name, Number(o.amount) || 0, o.food_item_id)]
      }
      return []
    })
  }
  if (typeof stored === 'object') {
    return Object.entries(stored as Record<string, unknown>).map(([name, amount]) =>
      fromLegacyGrams(name, Number(amount) || 0, null),
    )
  }
  return []
}

/** Legacy rule: "Ei"/"Eier" with amount ≤ 20 meant pieces, not grams. */
function fromLegacyGrams(name: string, amount: number, foodItemId: string | null): Ingredient {
  const lower = name.toLowerCase()
  const isPiece = (lower === 'ei' || lower === 'eier') && amount <= 20
  const unit = isPiece ? null : 'g'
  return {
    raw: `${formatQuantity(amount)}${unit ? ' ' + unit : ''} ${name}`,
    qty: amount,
    qtyMax: null,
    unit,
    name,
    group: null,
    food_item_id: foodItemId,
    category: null,
  }
}

/** Rounds a scaled amount to something a person can measure. */
export function roundForUnit(value: number, unit: string | null): number {
  if (value <= 0) return 0
  if (unit === 'g' || unit === 'ml') {
    if (value >= 100) return Math.round(value / 5) * 5
    if (value >= 10) return Math.round(value)
    return Math.round(value * 10) / 10
  }
  if (unit === 'kg' || unit === 'l') return Math.round(value * 100) / 100
  // pieces, spoons, cans…: nearest quarter, but never round a non-zero amount to 0
  const q = Math.round(value * 4) / 4
  return q === 0 ? 0.25 : q
}

const FRACTION_DISPLAY: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' }

/** Human-readable quantity: 1.5 → "1½", 0.25 → "¼", 12.5 → "12,5" (de) / "12.5". */
export function formatQuantity(value: number, locale: 'de' | 'en' = 'en'): string {
  const whole = Math.floor(value)
  const frac = Math.round((value - whole) * 100) / 100
  const sym = FRACTION_DISPLAY[String(frac)]
  if (sym) return whole > 0 ? `${whole}${sym}` : sym
  const rounded = Math.round(value * 100) / 100
  const s = String(rounded)
  return locale === 'de' ? s.replace('.', ',') : s
}

/** Returns a scaled copy. Lines without a quantity are returned unchanged. */
export function scaleIngredient(ing: Ingredient, factor: number): Ingredient {
  if (ing.qty === null || factor === 1) return ing
  return {
    ...ing,
    qty: roundForUnit(ing.qty * factor, ing.unit),
    qtyMax: ing.qtyMax != null ? roundForUnit(ing.qtyMax * factor, ing.unit) : ing.qtyMax,
  }
}

/** "400 g Kidneybohnen", "1–2 Zwiebeln"; falls back to raw text when unparsed. */
export function formatIngredient(ing: Ingredient, locale: 'de' | 'en' = 'de'): string {
  if (ing.qty === null) return ing.raw
  return `${formatAmount(ing, locale)} ${ing.name}`
}

/** Just the amount part: "400 g", "1–2", "½ TL". Empty string if none. */
export function formatAmount(ing: Ingredient, locale: 'de' | 'en' = 'de'): string {
  if (ing.qty === null) return ''
  const q = formatQuantity(ing.qty, locale)
  const range = ing.qtyMax != null ? `–${formatQuantity(ing.qtyMax, locale)}` : ''
  return `${q}${range}${ing.unit ? ' ' + ing.unit : ''}`
}

/**
 * Line for Markdown export. If the structured fields still match what the raw
 * text parses to, the original wording is kept so Obsidian files round-trip.
 */
export function ingredientToMarkdownLine(ing: Ingredient): string {
  const reparsed = parseIngredientLine(ing.raw)
  const unchanged =
    reparsed.qty === ing.qty &&
    (reparsed.qtyMax ?? null) === (ing.qtyMax ?? null) &&
    reparsed.unit === ing.unit &&
    reparsed.name === ing.name
  if (unchanged || ing.qty === null) return ing.raw
  return formatIngredient(ing, 'en')
}
