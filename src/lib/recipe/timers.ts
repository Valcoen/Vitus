/**
 * Detects cooking durations in step text ("Simmer for 25 min",
 * "1 Std. 30 Min. schmoren", "10–15 Minuten backen", "eine halbe Stunde").
 * Pure functions so they can be unit-tested and used on server and client.
 */

export type DetectedTimer = {
  /** Default timer length in seconds. For ranges this is the lower bound. */
  seconds: number
  /** Upper bound for ranges ("10–15 min"), otherwise null. */
  maxSeconds: number | null
  /** The matched text, used as a label ("25 min"). */
  text: string
}

const NUM = String.raw`\d+(?:[.,]\d+)?|½|¼|¾`
const H = String.raw`h|hrs?|hours?|std\.?|stunden?|stdn?\.?`
const M = String.raw`min\.?|mins?|minuten?|minutes?`
const S = String.raw`s|sek\.?|sekunden?|secs?|seconds?`

const WORD_AMOUNTS: [RegExp, number][] = [
  [/\b(?:eine[rn]?\s+halben?|einer?\s+halbe|half\s+an?)\s+(?:stunde|hour)\b/i, 1800],
  [/\b(?:eine[rn]?|an|one)\s+(?:stunde|hour)\b/i, 3600],
  [/\b(?:eine[rn]?\s+viertel\s*stunde|a\s+quarter\s+of\s+an\s+hour|quarter\s+hour)\b/i, 900],
]

function num(s: string): number {
  if (s === '½') return 0.5
  if (s === '¼') return 0.25
  if (s === '¾') return 0.75
  return parseFloat(s.replace(',', '.'))
}

function unitSeconds(unit: string): number {
  const u = unit.toLowerCase()
  if (new RegExp(`^(?:${H})$`, 'i').test(u)) return 3600
  if (new RegExp(`^(?:${M})$`, 'i').test(u)) return 60
  return 1
}

// "1 h 30 min" / "1 Std. 20 Min."
const COMBINED_RE = new RegExp(
  String.raw`(?<![\w.,])(${NUM})\s*(?:${H})\s*(?:und|and|,)?\s*(${NUM})\s*(?:${M})(?![\wäöü])`,
  'gi',
)
// "25 min", "10-15 Minuten", "1,5 Stunden", "30 Sek."
const SINGLE_RE = new RegExp(
  String.raw`(?<![\w.,])(${NUM})(?:\s*(?:-|–|bis|to)\s*(${NUM}))?\s*(${H}|${M}|${S})(?![\wäöü])`,
  'gi',
)

/** Returns all durations found in a step, in order of appearance, de-duplicated by position. */
export function detectTimers(text: string): DetectedTimer[] {
  const found: (DetectedTimer & { index: number; end: number })[] = []
  const overlaps = (start: number, end: number) => found.some(f => start < f.end && end > f.index)

  for (const m of text.matchAll(COMBINED_RE)) {
    const seconds = Math.round(num(m[1]) * 3600 + num(m[2]) * 60)
    found.push({ seconds, maxSeconds: null, text: m[0].trim(), index: m.index!, end: m.index! + m[0].length })
  }
  for (const m of text.matchAll(SINGLE_RE)) {
    const start = m.index!
    const end = start + m[0].length
    if (overlaps(start, end)) continue
    const mult = unitSeconds(m[3])
    // A bare "s" is too ambiguous unless it's clearly seconds after a number ≤ 600
    if (mult === 1 && /^s$/i.test(m[3]) && num(m[1]) > 600) continue
    const seconds = Math.round(num(m[1]) * mult)
    const maxSeconds = m[2] ? Math.round(num(m[2]) * mult) : null
    if (seconds <= 0) continue
    found.push({ seconds, maxSeconds, text: m[0].trim(), index: start, end })
  }
  for (const [re, seconds] of WORD_AMOUNTS) {
    const m = text.match(re)
    if (m && !overlaps(m.index!, m.index! + m[0].length)) {
      found.push({ seconds, maxSeconds: null, text: m[0].trim(), index: m.index!, end: m.index! + m[0].length })
    }
  }
  return found
    .sort((a, b) => a.index - b.index)
    .map(({ seconds, maxSeconds, text }) => ({ seconds, maxSeconds, text }))
}

/** 65 → "1:05", 3725 → "1:02:05". Negative values are shown as 0:00. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/**
 * Timers are stored as an absolute end timestamp, so they stay correct when
 * the tab is backgrounded or the phone sleeps: remaining = endsAt - now.
 */
export type RunningTimer = {
  id: string
  label: string
  /** Epoch ms when the timer finishes (while running). */
  endsAt: number | null
  /** Remaining ms while paused. */
  pausedRemainingMs: number | null
  durationMs: number
}

export function remainingMs(t: RunningTimer, now: number): number {
  if (t.pausedRemainingMs !== null) return t.pausedRemainingMs
  if (t.endsAt === null) return t.durationMs
  return t.endsAt - now
}

export function startTimer(t: RunningTimer, now: number): RunningTimer {
  const rem = t.pausedRemainingMs ?? t.durationMs
  return { ...t, endsAt: now + rem, pausedRemainingMs: null }
}

export function pauseTimer(t: RunningTimer, now: number): RunningTimer {
  if (t.endsAt === null) return t
  return { ...t, pausedRemainingMs: Math.max(0, t.endsAt - now), endsAt: null }
}

export function isFinished(t: RunningTimer, now: number): boolean {
  return t.pausedRemainingMs === null && t.endsAt !== null && t.endsAt <= now
}
