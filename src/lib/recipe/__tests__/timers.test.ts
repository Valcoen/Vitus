import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectTimers, formatDuration, startTimer, pauseTimer, remainingMs, isFinished, type RunningTimer } from '../timers'

const secs = (text: string) => detectTimers(text).map(t => t.seconds)

test('English minutes', () => {
  assert.deepEqual(secs('Simmer for 25 min.'), [1500])
  assert.deepEqual(secs('Bake 40 minutes until golden'), [2400])
  assert.deepEqual(secs('Rest 5 mins'), [300])
})

test('German minutes, hours, seconds', () => {
  assert.deepEqual(secs('25 Minuten köcheln lassen'), [1500])
  assert.deepEqual(secs('Ca. 10 Min. anbraten'), [600])
  assert.deepEqual(secs('1,5 Stunden schmoren'), [5400])
  assert.deepEqual(secs('30 Sek. pürieren'), [30])
  assert.deepEqual(secs('2 Std. im Ofen'), [7200])
})

test('combined hours and minutes', () => {
  assert.deepEqual(secs('1 h 30 min garen'), [5400])
  assert.deepEqual(secs('1 Std. und 20 Min. ziehen lassen'), [4800])
})

test('ranges default to the lower bound and keep the upper', () => {
  const [t] = detectTimers('10-15 Minuten backen')
  assert.equal(t.seconds, 600)
  assert.equal(t.maxSeconds, 900)
  assert.equal(detectTimers('bake 20–25 min')[0].maxSeconds, 1500)
  assert.equal(detectTimers('8 bis 10 Minuten')[0].seconds, 480)
})

test('word amounts', () => {
  assert.deepEqual(secs('eine halbe Stunde ruhen lassen'), [1800])
  assert.deepEqual(secs('Let it rest for an hour'), [3600])
  assert.deepEqual(secs('eine Viertelstunde ziehen lassen'), [900])
})

test('multiple timers in one step, in order', () => {
  assert.deepEqual(secs('Fry 5 min, then simmer 20 min.'), [300, 1200])
})

test('no false positives on temperatures, weights and plain numbers', () => {
  assert.deepEqual(secs('Ofen auf 180 °C vorheizen'), [])
  assert.deepEqual(secs('400 g Bohnen dazugeben'), [])
  assert.deepEqual(secs('Chop onion and garlic.'), [])
  assert.deepEqual(secs('2 Minzblätter'), [])
  assert.deepEqual(secs('In 4 Portionen teilen'), [])
})

test('label text is the matched phrase', () => {
  assert.equal(detectTimers('Simmer for 25 min')[0].text, '25 min')
})

test('formatDuration', () => {
  assert.equal(formatDuration(65), '1:05')
  assert.equal(formatDuration(3725), '1:02:05')
  assert.equal(formatDuration(-3), '0:00')
  assert.equal(formatDuration(0.2), '0:01')
})

test('timestamp-based timer survives background time', () => {
  const t0 = 1_000_000
  let t: RunningTimer = { id: 'a', label: 'Step 2', endsAt: null, pausedRemainingMs: null, durationMs: 60_000 }
  t = startTimer(t, t0)
  // tab was frozen for 45 s; nothing ticked, but remaining is still correct
  assert.equal(remainingMs(t, t0 + 45_000), 15_000)
  t = pauseTimer(t, t0 + 45_000)
  assert.equal(remainingMs(t, t0 + 999_999), 15_000)
  t = startTimer(t, t0 + 100_000)
  assert.equal(isFinished(t, t0 + 114_999), false)
  assert.equal(isFinished(t, t0 + 115_000), true)
})
