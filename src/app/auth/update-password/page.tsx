'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Dumbbell, AlertCircle, CheckCircle2, Lock } from 'lucide-react'

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'error' | 'success' | null>(null)
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Supabase sendet den Auth-Token als URL-Fragment (#access_token=...)
  // Der Client-SDK verarbeitet dies automatisch beim Laden
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true)
      } else {
        setMessage('Ungültiger oder abgelaufener Reset-Link. Bitte fordere einen neuen an.')
        setMessageType('error')
      }
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setMessage('Die Passwörter stimmen nicht überein.')
      setMessageType('error')
      return
    }
    if (password.length < 6) {
      setMessage('Das Passwort muss mindestens 6 Zeichen lang sein.')
      setMessageType('error')
      return
    }

    setLoading(true)
    setMessage(null)
    setMessageType(null)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setMessage(error.message || 'Fehler beim Aktualisieren des Passworts.')
      setMessageType('error')
    } else {
      setMessage('Passwort erfolgreich geändert! Du wirst zum Login weitergeleitet...')
      setMessageType('success')
      setTimeout(() => router.push('/login'), 2500)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card-apple w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[hsl(var(--primary))] text-white rounded-full flex items-center justify-center mb-4 shadow-lg shadow-[hsl(var(--primary))]/25">
            <Lock size={28} />
          </div>
          <h1 className="text-2xl font-bold">Vitus Nutrition</h1>
          <p className="text-sm text-[hsl(var(--text-muted))] mt-1 font-medium">Neues Passwort festlegen</p>
        </div>

        {message && messageType && (
          <div
            className={`mb-4 p-3 rounded-xl text-sm font-medium flex items-start gap-2.5 ${
              messageType === 'error'
                ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800/40'
                : 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 border border-green-200 dark:border-green-800/40'
            }`}
          >
            {messageType === 'error' ? (
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            )}
            <span>{message}</span>
          </div>
        )}

        {sessionReady && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 pl-1">Neues Passwort</label>
              <input
                type="password"
                required
                className="input-apple"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mindestens 6 Zeichen"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 pl-1">Passwort bestätigen</label>
              <input
                type="password"
                required
                className="input-apple"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Passwort wiederholen"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-6"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Wird gespeichert...
                </span>
              ) : 'Passwort speichern'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
