/**
 * Minimal YAML front-matter reader/writer for Obsidian recipe notes.
 * Supports what Obsidian properties produce: scalars, quoted strings,
 * inline lists `[a, b]`, block lists (`- item`), and trailing `# comments`.
 * Deliberately small to avoid a YAML dependency.
 */

export type FrontmatterValue = string | number | boolean | null | FrontmatterValue[]
export type Frontmatter = Record<string, FrontmatterValue>

/** Splits a document into front matter text and body. */
export function splitFrontmatter(text: string): { yaml: string | null; body: string } {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const m = normalized.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/)
  if (!m) return { yaml: null, body: normalized }
  return { yaml: m[1], body: normalized.slice(m[0].length) }
}

function stripComment(value: string): string {
  let quote: string | null = null
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if (quote) {
      if (c === quote) quote = null
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === '#' && (i === 0 || /\s/.test(value[i - 1]))) {
      return value.slice(0, i).trimEnd()
    }
  }
  return value
}

function splitInlineList(inner: string): string[] {
  const items: string[] = []
  let cur = ''
  let quote: string | null = null
  let depth = 0
  for (const c of inner) {
    if (quote) {
      cur += c
      if (c === quote) quote = null
    } else if (c === '"' || c === "'") {
      quote = c
      cur += c
    } else if (c === '[') {
      depth++
      cur += c
    } else if (c === ']') {
      depth--
      cur += c
    } else if (c === ',' && depth === 0) {
      items.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  if (cur.trim()) items.push(cur.trim())
  return items
}

export function parseScalar(raw: string): FrontmatterValue {
  const v = raw.trim()
  if (v === '' || v === '~' || v === 'null') return null
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1).replace(/''/g, "'")
  // inline list, but not an Obsidian wikilink [[...]]
  if (v.startsWith('[') && v.endsWith(']') && !v.startsWith('[[')) {
    return splitInlineList(v.slice(1, -1)).map(parseScalar)
  }
  if (/^(true|yes|ja)$/i.test(v)) return true
  if (/^(false|no|nein)$/i.test(v)) return false
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  return v
}

export function parseFrontmatter(yaml: string): { data: Frontmatter; warnings: string[] } {
  const data: Frontmatter = {}
  const warnings: string[] = []
  let currentListKey: string | null = null

  for (const rawLine of yaml.split('\n')) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue
    const listItem = rawLine.match(/^\s*-\s+(.*)$/)
    if (listItem && currentListKey) {
      const arr = data[currentListKey]
      const value = parseScalar(stripComment(listItem[1]))
      if (Array.isArray(arr)) arr.push(value)
      continue
    }
    const kv = rawLine.match(/^([A-Za-z0-9_\-äöüÄÖÜß ]+?)\s*:\s*(.*)$/)
    if (!kv) {
      warnings.push(`Front matter line not understood and ignored: "${rawLine.trim()}"`)
      currentListKey = null
      continue
    }
    const key = kv[1].trim()
    const rest = stripComment(kv[2])
    if (rest === '') {
      data[key] = []
      currentListKey = key
    } else {
      data[key] = parseScalar(rest)
      currentListKey = null
    }
  }
  // empty block lists that never got items are really empty values
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v) && v.length === 0) data[k] = null
  }
  return { data, warnings }
}

function needsQuotes(s: string): boolean {
  return (
    s === '' ||
    /^[\s]|[\s]$/.test(s) ||
    /[:#\[\]{},&*!|>'"%@`]/.test(s) ||
    /^(true|false|yes|no|ja|nein|null|~)$/i.test(s) ||
    /^-?\d+(\.\d+)?$/.test(s) ||
    s.startsWith('- ')
  )
}

export function formatScalar(v: FrontmatterValue): string {
  if (v === null) return ''
  if (typeof v === 'boolean' || typeof v === 'number') return String(v)
  if (Array.isArray(v)) return `[${v.map(formatScalar).join(', ')}]`
  return needsQuotes(v) ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : v
}

/** Writes front matter. Lists of wikilinks use block style, like Obsidian does. */
export function stringifyFrontmatter(entries: [string, FrontmatterValue | undefined][]): string {
  const lines: string[] = ['---']
  for (const [key, value] of entries) {
    if (value === undefined) continue
    if (Array.isArray(value) && value.some(x => typeof x === 'string' && x.startsWith('[['))) {
      lines.push(`${key}:`)
      for (const item of value) lines.push(`  - ${formatScalar(item)}`)
    } else {
      lines.push(value === null ? `${key}:` : `${key}: ${formatScalar(value)}`)
    }
  }
  lines.push('---')
  return lines.join('\n')
}
