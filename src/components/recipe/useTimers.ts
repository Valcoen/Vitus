'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isFinished, pauseTimer, remainingMs, startTimer, formatDuration, type RunningTimer } from '@/lib/recipe/timers'

export type CookTimer = RunningTimer & {
  stepIndex: number
  /** true once the alarm went off; cleared when the user dismisses it */
  ringing: boolean
  /** true once the alarm was handled, so it doesn't ring again */
  done: boolean
}

const storageKey = (recipeId: string) => `vitus.timers.${recipeId}`

function load(recipeId: string): CookTimer[] {
  try {
    const raw = localStorage.getItem(storageKey(recipeId))
    return raw ? (JSON.parse(raw) as CookTimer[]) : []
  } catch {
    return []
  }
}

function save(recipeId: string, timers: CookTimer[]) {
  try {
    localStorage.setItem(storageKey(recipeId), JSON.stringify(timers))
  } catch {
    /* private mode etc. – timers still work in memory */
  }
}

/** Short beep with the Web Audio API (no sound file needed). */
function beep(ctx: AudioContext) {
  const t = ctx.currentTime
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, t + i * 0.3)
    gain.gain.exponentialRampToValueAtTime(0.4, t + i * 0.3 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.3 + 0.2)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t + i * 0.3)
    osc.stop(t + i * 0.3 + 0.22)
  }
}

async function notify(title: string, body: string, tag: string) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    // Android Chrome only allows notifications through a service worker
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg) {
      await reg.showNotification(title, { body, tag, requireInteraction: true, icon: '/favicon.ico' } as NotificationOptions)
    } else {
      new Notification(title, { body, tag })
    }
  } catch {
    /* notifications are a bonus; sound + vibration still fire */
  }
}

/**
 * Multiple concurrent, labeled timers. They are stored as absolute end
 * times (and in localStorage), so they stay correct when the tab is in the
 * background, the screen turns off, or the page is reloaded.
 */
export function useTimers(recipeId: string) {
  const [timers, setTimers] = useState<CookTimer[]>([])
  const [now, setNow] = useState(() => Date.now())
  const audioRef = useRef<AudioContext | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    setTimers(load(recipeId))
    loaded.current = true
  }, [recipeId])

  useEffect(() => {
    if (loaded.current) save(recipeId, timers)
  }, [recipeId, timers])

  // Tick; also recompute immediately when the tab becomes visible again
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    const onVis = () => setNow(Date.now())
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // Detect finished timers
  useEffect(() => {
    const finished = timers.filter(t => !t.done && !t.ringing && isFinished(t, now))
    if (finished.length === 0) return
    setTimers(ts => ts.map(t => (finished.some(f => f.id === t.id) ? { ...t, ringing: true } : t)))
    for (const t of finished) notify('⏰ Timer fertig', t.label, t.id)
  }, [now, timers])

  // Alarm loop while anything is ringing
  const anyRinging = timers.some(t => t.ringing)
  useEffect(() => {
    if (!anyRinging) return
    const ring = () => {
      if (audioRef.current) {
        audioRef.current.resume().catch(() => {})
        beep(audioRef.current)
      }
      if ('vibrate' in navigator) navigator.vibrate?.([400, 200, 400, 200, 400])
    }
    ring()
    const id = setInterval(ring, 2000)
    return () => clearInterval(id)
  }, [anyRinging])

  /** Must be called from a user gesture (tap) so audio and notifications are allowed. */
  const unlockAlerts = useCallback((askNotificationPermission = false) => {
    try {
      if (!audioRef.current) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext
        if (Ctx) audioRef.current = new Ctx()
      }
      audioRef.current?.resume().catch(() => {})
    } catch {
      /* no audio */
    }
    if (askNotificationPermission && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  const add = useCallback((stepIndex: number, label: string, seconds: number) => {
    unlockAlerts(true)
    const base: CookTimer = {
      id: `${stepIndex}-${Date.now()}`,
      label,
      stepIndex,
      endsAt: null,
      pausedRemainingMs: null,
      durationMs: seconds * 1000,
      ringing: false,
      done: false,
    }
    setTimers(ts => [...ts, { ...base, ...startTimer(base, Date.now()) }])
  }, [unlockAlerts])

  const toggle = useCallback((id: string) => {
    unlockAlerts()
    const n = Date.now()
    setTimers(ts => ts.map(t => {
      if (t.id !== id || t.ringing) return t
      return { ...t, ...(t.endsAt !== null ? pauseTimer(t, n) : startTimer(t, n)) }
    }))
  }, [unlockAlerts])

  const addMinute = useCallback((id: string) => {
    setTimers(ts => ts.map(t => {
      if (t.id !== id) return t
      if (t.ringing || t.done) {
        const restarted: CookTimer = { ...t, ringing: false, done: false, pausedRemainingMs: 60_000 }
        return { ...restarted, ...startTimer(restarted, Date.now()) }
      }
      if (t.endsAt !== null) return { ...t, endsAt: t.endsAt + 60_000, durationMs: t.durationMs + 60_000 }
      return { ...t, pausedRemainingMs: (t.pausedRemainingMs ?? t.durationMs) + 60_000, durationMs: t.durationMs + 60_000 }
    }))
  }, [])

  const dismiss = useCallback((id: string) => {
    setTimers(ts => ts.map(t => (t.id === id ? { ...t, ringing: false, done: true } : t)))
  }, [])

  const remove = useCallback((id: string) => setTimers(ts => ts.filter(t => t.id !== id)), [])

  const view = timers.map(t => {
    const ms = t.ringing || t.done ? 0 : remainingMs(t, now)
    return { ...t, remaining: ms, display: formatDuration(ms / 1000), running: t.endsAt !== null && !t.ringing && !t.done }
  })

  return { timers: view, add, toggle, addMinute, dismiss, remove, unlockAlerts }
}
