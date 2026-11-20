'use client'

import { useEffect } from 'react'

/**
 * If the user logged in without "Angemeldet bleiben", sign out once the
 * browser session ended (sessionStorage is empty in a new session, but
 * survives reloads – unlike the old beforeunload approach, which logged
 * people out on every reload).
 */
export default function SessionGuard() {
  useEffect(() => {
    try {
      if (localStorage.getItem('vitus.ephemeral') === '1' && !sessionStorage.getItem('vitus.session')) {
        localStorage.removeItem('vitus.ephemeral')
        fetch('/auth/signout-beacon', { method: 'POST' }).finally(() => window.location.assign('/login'))
      }
    } catch { /* storage blocked */ }
  }, [])
  return null
}
