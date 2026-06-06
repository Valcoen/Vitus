"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Dumbbell, AlertCircle, CheckCircle2 } from 'lucide-react'

function translateError(msg: string): string {
  const map: Record<string, string> = {
    'Invalid login credentials': 'Ungültige Anmeldedaten. Bitte überprüfe E-Mail und Passwort.',
    'Email not confirmed': 'Bitte bestätige zuerst deine E-Mail-Adresse.',
    'User already registered': 'Diese E-Mail-Adresse ist bereits registriert.',
    'Password should be at least 6 characters': 'Das Passwort muss mindestens 6 Zeichen lang sein.',
    'Signup requires a valid password': 'Bitte gib ein gültiges Passwort ein.',
    'Unable to validate email address: invalid format': 'Bitte gib eine gültige E-Mail-Adresse ein.',
    'Anonymous sign-ins are disabled': 'Anonyme Anmeldungen sind deaktiviert.',
  }
  return map[msg] || msg || 'Ein unbekannter Fehler ist aufgetreten.'
}

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'error' | 'success' | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // If "Remember Me" is not checked, sign out when the browser/tab closes
  useEffect(() => {
    if (!rememberMe) return

    // Nothing to do when remember me is checked — session persists naturally
  }, [rememberMe])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setMessageType(null)

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error

        // If "Remember Me" is NOT checked, register a listener to sign out on browser close
        if (!rememberMe) {
          const handleUnload = () => {
            // Use navigator.sendBeacon for reliable signout on close
            const url = '/auth/signout-beacon'
            navigator.sendBeacon(url)
          }
          window.addEventListener('beforeunload', handleUnload)
        }

        router.push('/')
        router.refresh()
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error

        if (data.user) {
          // Add into public.users with name + surname, everything else stays null
          const { error: insertError } = await supabase.from('users').insert({
            auth_id: data.user.id,
            email: email,
            name: name,
            surname: surname || null,
          })
          if (insertError) throw insertError
        }

        setMessage('Registrierung erfolgreich! Du kannst dich jetzt einloggen.')
        setMessageType('success')
        setIsLogin(true)
        // Clear registration fields
        setName('')
        setSurname('')
        setPassword('')
      }
    } catch (err: any) {
      setMessage(translateError(err.message))
      setMessageType('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card-apple w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[hsl(var(--primary))] text-white rounded-full flex items-center justify-center mb-4 shadow-lg shadow-[hsl(var(--primary))]/25">
            <Dumbbell size={32} />
          </div>
          <h1 className="text-2xl font-bold">Vitus Nutrition</h1>
          <p className="text-sm text-[hsl(var(--text-muted))] mt-1 font-medium">Dein persönlicher Ernährungsplaner</p>
        </div>

        <div className="flex w-full mb-6 relative">
          <button
            className={`flex-1 pb-3 font-semibold transition-colors ${isLogin ? 'text-[hsl(var(--text))] border-b-2 border-[hsl(var(--primary))]' : 'text-[hsl(var(--text-muted))] border-b border-[hsl(var(--border))]'}`}
            onClick={() => { setIsLogin(true); setMessage(null); setMessageType(null); }}
            type="button"
          >
            Login
          </button>
          <button
            className={`flex-1 pb-3 font-semibold transition-colors ${!isLogin ? 'text-[hsl(var(--text))] border-b-2 border-[hsl(var(--primary))]' : 'text-[hsl(var(--text-muted))] border-b border-[hsl(var(--border))]'}`}
            onClick={() => { setIsLogin(false); setMessage(null); setMessageType(null); }}
            type="button"
          >
            Registrierung
          </button>
        </div>

        {/* Message display — error or success */}
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Registration fields: Name + Surname side by side */}
          {!isLogin && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1 pl-1">Vorname</label>
                <input
                  type="text"
                  required
                  className="input-apple"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Max"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 pl-1">Nachname</label>
                <input
                  type="text"
                  className="input-apple"
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  placeholder="Mustermann"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1 pl-1">Email</label>
            <input
              type="email"
              required
              className="input-apple"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="deine@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 pl-1">Passwort</label>
            <input
              type="password"
              required
              className="input-apple"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mindestens 6 Zeichen"
            />
          </div>

          {/* Remember Me — only on Login */}
          {isLogin && (
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                role="checkbox"
                aria-checked={rememberMe}
                onClick={() => setRememberMe(!rememberMe)}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${
                  rememberMe
                    ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))]'
                    : 'border-[hsl(var(--text-muted))]/40 bg-transparent hover:border-[hsl(var(--primary))]/60'
                }`}
              >
                {rememberMe && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-white">
                    <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
              <label
                className="text-sm font-medium text-[hsl(var(--text-muted))] cursor-pointer select-none"
                onClick={() => setRememberMe(!rememberMe)}
              >
                Angemeldet bleiben
              </label>
            </div>
          )}

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
                Wird geladen...
              </span>
            ) : (isLogin ? 'Einloggen' : 'Registrieren')}
          </button>
        </form>
      </div>
    </div>
  )
}
