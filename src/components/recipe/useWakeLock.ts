'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Sentinel = { release: () => Promise<void>; addEventListener: (t: 'release', cb: () => void) => void }

/**
 * Keeps the screen on while cooking. The browser drops the lock whenever
 * the tab is hidden, so it is re-acquired when the tab becomes visible.
 * Needs HTTPS (secure context).
 */
export function useWakeLock(initiallyOn = true) {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator && typeof window !== 'undefined' && window.isSecureContext
  const [enabled, setEnabled] = useState(initiallyOn)
  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sentinel = useRef<Sentinel | null>(null)

  const acquire = useCallback(async () => {
    if (!supported || document.visibilityState !== 'visible') return
    try {
      const s = (await (navigator as any).wakeLock.request('screen')) as Sentinel
      sentinel.current = s
      setActive(true)
      setError(null)
      s.addEventListener('release', () => setActive(false))
    } catch (e: any) {
      setActive(false)
      setError(e?.message || 'Bildschirm konnte nicht wach gehalten werden')
    }
  }, [supported])

  const release = useCallback(async () => {
    try {
      await sentinel.current?.release()
    } catch {
      /* already released */
    }
    sentinel.current = null
    setActive(false)
  }, [])

  useEffect(() => {
    if (enabled) acquire()
    else release()
  }, [enabled, acquire, release])

  useEffect(() => {
    const onVis = () => {
      if (enabled && document.visibilityState === 'visible') acquire()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [enabled, acquire])

  useEffect(() => () => { sentinel.current?.release().catch(() => {}) }, [])

  return { supported, enabled, active, error, setEnabled }
}
