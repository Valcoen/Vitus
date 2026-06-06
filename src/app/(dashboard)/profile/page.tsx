import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', user.id)
    .single()

  async function saveBiometrics(formData: FormData) {
    'use server'
    const weight = formData.get('weight') as string
    const height = formData.get('height') as string
    const goal = formData.get('goal') as string
    const activity_frequency = formData.get('activity_frequency') as string

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    const { error } = await supabase.from('users').update({
        weight: weight ? parseFloat(weight) : null,
        height: height ? parseInt(height) : null,
        goal,
        activity_frequency
    }).eq('auth_id', user!.id)

    if (error) {
        redirect(`/profile?error=${encodeURIComponent('Fehler beim Speichern der Biometrie')}`)
    }

    revalidatePath('/') // update root dashboard
    redirect(`/profile?success=${encodeURIComponent('Biometrie und Ziele erfolgreich gespeichert!')}`)
  }

  async function savePreferences(formData: FormData) {
    'use server'
    const diet_type = formData.get('diet_type') as string || ''
    const budget = formData.get('budget') as string || ''
    const allergies = (formData.get('allergies') as string || '').split(',').map(s => s.trim()).filter(Boolean)
    const dislikes = (formData.get('dislikes') as string || '').split(',').map(s => s.trim()).filter(Boolean)
    const preferred_cuisines = formData.getAll('preferred_cuisines') as string[]
    const avoidances = formData.getAll('avoidances') as string[]
    const meat_frequency = formData.get('meat_frequency') as string || ''
    const meat_types = formData.getAll('meat_types') as string[]
    
    // Default to all meals if user selects none by accident
    const meal_schedule_raw = formData.getAll('meal_schedule') as string[]
    const meal_schedule = meal_schedule_raw.length > 0 ? meal_schedule_raw : ['Frühstück', 'Mittagessen', 'Abendessen', 'Snacks']

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    const { error } = await supabase.from('users').update({
        food_preferences: { diet_type, budget, allergies, dislikes, preferred_cuisines, avoidances, meat_frequency, meat_types, meal_schedule }
    }).eq('auth_id', user!.id)

    if (error) {
        redirect(`/profile?error=${encodeURIComponent('Fehler beim Speichern der Präferenzen')}`)
    }

    redirect(`/profile?success=${encodeURIComponent('Ernährungspräferenzen erfolgreich gespeichert!')}`)
  }

  // Compute BMI
  const hasBmi = userData?.weight && userData?.height
  let bmiValue = 0
  let bmiLabel = ''
  let bmiColor = ''
  let bmiGradient = ''
  if (hasBmi) {
    const heightM = userData.height / 100
    bmiValue = Math.round((userData.weight / (heightM * heightM)) * 10) / 10
    if (bmiValue < 18.5) {
      bmiLabel = 'Untergewicht'
      bmiColor = 'text-blue-500'
      bmiGradient = 'from-blue-500/10 to-blue-500/5'
    } else if (bmiValue < 25) {
      bmiLabel = 'Normalgewicht'
      bmiColor = 'text-emerald-500'
      bmiGradient = 'from-emerald-500/10 to-emerald-500/5'
    } else if (bmiValue < 30) {
      bmiLabel = 'Übergewicht'
      bmiColor = 'text-amber-500'
      bmiGradient = 'from-amber-500/10 to-amber-500/5'
    } else {
      bmiLabel = 'Adipositas'
      bmiColor = 'text-red-500'
      bmiGradient = 'from-red-500/10 to-red-500/5'
    }
  }

  // Current values for display
  const goalMap: Record<string, string> = {
    'Fettabbau': '🔥',
    'Muskelaufbau': '💪',
    'Halten': '⚖️',
  }
  const activityMap: Record<string, string> = {
    'Gar nicht': '🛋️',
    '1-2 mal pro Woche': '🚶',
    '3-4 mal pro Woche': '🏃',
    '5+ mal pro Woche': '🏋️',
  }

  const cuisineFlags: Record<string, string> = {
    'Deutsch': '🇩🇪',
    'Italienisch': '🇮🇹',
    'Asiatisch': '🌏',
    'Mexikanisch': '🇲🇽',
    'Indisch': '🇮🇳',
    'Mediterran': '🫒',
    'Amerikanisch': '🇺🇸',
    'Türkisch': '🇹🇷',
    'Japanisch': '🇯🇵',
    'Griechisch': '🇬🇷',
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <span className="w-10 h-10 bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary))]/80 rounded-2xl flex items-center justify-center text-white text-lg shadow-lg shadow-[hsl(var(--primary))]/20">
              👤
            </span>
            Mein Profil
          </h1>
          <p className="text-[hsl(var(--text-muted))] mt-2 text-base font-medium">
            Verwalte deine persönlichen Daten und Ernährungspräferenzen
          </p>
        </div>
      </div>

      {/* Quick Stats Row */}
      {(hasBmi || userData?.goal || userData?.activity_frequency) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* BMI Card */}
          {hasBmi && (
            <div className={`card-apple bg-gradient-to-br ${bmiGradient} flex flex-col items-center justify-center py-5`}>
              <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--text-muted))] mb-1">BMI</span>
              <span className={`text-3xl font-black ${bmiColor}`}>{bmiValue}</span>
              <span className={`text-sm font-semibold mt-0.5 ${bmiColor}`}>{bmiLabel}</span>
            </div>
          )}
          {/* Goal Card */}
          {userData?.goal && (
            <div className="card-apple flex flex-col items-center justify-center py-5 bg-gradient-to-br from-[hsl(var(--primary))]/5 to-transparent">
              <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--text-muted))] mb-1">Ziel</span>
              <span className="text-2xl mb-0.5">{goalMap[userData.goal] || '🎯'}</span>
              <span className="text-sm font-bold">{userData.goal}</span>
            </div>
          )}
          {/* Activity Card */}
          {userData?.activity_frequency && (
            <div className="card-apple flex flex-col items-center justify-center py-5 bg-gradient-to-br from-violet-500/5 to-transparent">
              <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--text-muted))] mb-1">Aktivität</span>
              <span className="text-2xl mb-0.5">{activityMap[userData.activity_frequency] || '🏃'}</span>
              <span className="text-sm font-bold">{userData.activity_frequency}</span>
            </div>
          )}
        </div>
      )}

      {/* ─── BIOMETRIE SECTION ─── */}
      <div className="card-apple">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-base shadow-md shadow-blue-500/20">
            📏
          </div>
          <div>
            <h2 className="text-xl font-bold">Biometrie & Ziele</h2>
            <p className="text-xs font-medium text-[hsl(var(--text-muted))]">Gewicht, Größe und persönliches Ziel</p>
          </div>
        </div>
        
        <form action={saveBiometrics} className="space-y-6">
          {/* Body Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--text-muted))]">
                <span className="text-base">⚖️</span> Gewicht
              </label>
              <div className="relative">
                <input name="weight" className="input-apple bg-[hsl(var(--background))] pr-12" type="number" defaultValue={userData?.weight} step="0.1" placeholder="z.B. 75" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[hsl(var(--text-muted))]">kg</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--text-muted))]">
                <span className="text-base">📐</span> Größe
              </label>
              <div className="relative">
                <input name="height" className="input-apple bg-[hsl(var(--background))] pr-12" type="number" defaultValue={userData?.height} placeholder="z.B. 180" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[hsl(var(--text-muted))]">cm</span>
              </div>
            </div>
          </div>

          {/* Goal & Activity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--text-muted))]">
                <span className="text-base">🎯</span> Ziel
              </label>
              <select name="goal" className="input-apple bg-[hsl(var(--background))] appearance-none" defaultValue={userData?.goal || 'Fettabbau'}>
                <option value="Fettabbau">🔥 Fettabbau</option>
                <option value="Muskelaufbau">💪 Muskelaufbau</option>
                <option value="Halten">⚖️ Halten</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--text-muted))]">
                <span className="text-base">🏃</span> Aktivitätslevel
              </label>
              <select name="activity_frequency" className="input-apple bg-[hsl(var(--background))] appearance-none" defaultValue={userData?.activity_frequency || '1-2 mal pro Woche'}>
                <option value="Gar nicht">🛋️ Gar nicht</option>
                <option value="1-2 mal pro Woche">🚶 1-2 mal pro Woche</option>
                <option value="3-4 mal pro Woche">🏃 3-4 mal pro Woche</option>
                <option value="5+ mal pro Woche">🏋️ 5+ mal pro Woche</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-[hsl(var(--border))]">
            <button type="submit" className="btn-primary w-full sm:w-auto px-8 gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Biometrie & Ziele speichern
            </button>
          </div>
        </form>
      </div>

      {/* ─── ERNÄHRUNGS-PRÄFERENZEN SECTION ─── */}
      <div className="card-apple">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-orange-600 flex items-center justify-center text-white text-base shadow-md shadow-[hsl(var(--primary))]/20">
            🍽️
          </div>
          <div>
            <h2 className="text-xl font-bold">Ernährungs-Präferenzen</h2>
            <p className="text-xs font-medium text-[hsl(var(--text-muted))]">Ernährungstyp, Budget, Allergien und mehr</p>
          </div>
        </div>

        <form action={savePreferences} className="space-y-8">
          {/* ── Diet Type & Budget ── */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--text-muted))] mb-4 flex items-center gap-2">
              <span className="w-5 h-0.5 bg-[hsl(var(--primary))] rounded-full"></span>
              Grundlagen
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--text-muted))]">
                  <span className="text-base">🥗</span> Ernährungstyp
                </label>
                <select name="diet_type" className="input-apple bg-[hsl(var(--background))] appearance-none" defaultValue={userData?.food_preferences?.diet_type || 'omnivore'}>
                  <option value="omnivore">🍖 Omnivore (alles)</option>
                  <option value="vegetarian">🥬 Vegetarisch</option>
                  <option value="vegan">🌱 Vegan</option>
                  <option value="pescetarian">🐟 Pescetarisch</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--text-muted))]">
                  <span className="text-base">💰</span> Budget
                </label>
                <select name="budget" className="input-apple bg-[hsl(var(--background))] appearance-none" defaultValue={userData?.food_preferences?.budget || 'Medium Budget'}>
                  <option value="Low Budget">💵 Low Budget</option>
                  <option value="Medium Budget">💰 Medium Budget</option>
                  <option value="High Budget">💎 High Budget</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* ── Allergies & Dislikes ── */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--text-muted))] mb-4 flex items-center gap-2">
              <span className="w-5 h-0.5 bg-red-500 rounded-full"></span>
              Einschränkungen
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--text-muted))]">
                  <span className="text-base">⚠️</span> Allergien & Unverträglichkeiten
                </label>
                <input name="allergies" className="input-apple bg-[hsl(var(--background))]" type="text" defaultValue={(userData?.food_preferences?.allergies || []).join(', ')} placeholder="z.B. Erdnüsse, Laktose, Gluten" />
                <p className="text-xs text-[hsl(var(--text-muted))] pl-1">Kommagetrennt eingeben</p>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--text-muted))]">
                  <span className="text-base">👎</span> Mag ich nicht
                </label>
                <input name="dislikes" className="input-apple bg-[hsl(var(--background))]" type="text" defaultValue={(userData?.food_preferences?.dislikes || []).join(', ')} placeholder="z.B. Brokkoli, Rosenkohl" />
                <p className="text-xs text-[hsl(var(--text-muted))] pl-1">Kommagetrennt eingeben</p>
              </div>
            </div>
          </div>

          {/* ── Preferred Cuisines ── */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--text-muted))] mb-4 flex items-center gap-2">
              <span className="w-5 h-0.5 bg-emerald-500 rounded-full"></span>
              Lieblingsküchen
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {["Deutsch", "Italienisch", "Asiatisch", "Mexikanisch", "Indisch", "Mediterran", "Amerikanisch", "Türkisch", "Japanisch", "Griechisch"].map(c => {
                const isSelected = (userData?.food_preferences?.preferred_cuisines || []).includes(c)
                return (
                  <label key={c} className={`group relative flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-95
                    ${isSelected
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 shadow-sm'
                      : 'border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:border-[hsl(var(--primary))]/40'
                    }`}>
                    <input type="checkbox" name="preferred_cuisines" value={c} defaultChecked={isSelected} className="sr-only peer" />
                    <span className="text-2xl">{cuisineFlags[c]}</span>
                    <span className="text-xs font-semibold text-center">{c}</span>
                    {/* Checkmark indicator */}
                    <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-all
                      ${isSelected
                        ? 'bg-[hsl(var(--primary))] scale-100'
                        : 'bg-[hsl(var(--border))] scale-75 opacity-0 group-hover:opacity-40'
                      }`}>
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* ── Avoidances ── */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--text-muted))] mb-4 flex items-center gap-2">
              <span className="w-5 h-0.5 bg-amber-500 rounded-full"></span>
              Möchte ich vermeiden
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { value: "Stark verarbeitet", icon: "🏭" },
                { value: "Frittiert", icon: "🍟" },
                { value: "Sehr scharf", icon: "🌶️" },
                { value: "Rohes Fleisch", icon: "🥩" },
                { value: "Innereien", icon: "🫀" },
              ].map(item => {
                const isSelected = (userData?.food_preferences?.avoidances || []).includes(item.value)
                return (
                  <label key={item.value} className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.98]
                    ${isSelected
                      ? 'border-red-400/60 bg-red-50 dark:bg-red-950/20'
                      : 'border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:border-red-300/40'
                    }`}>
                    <input type="checkbox" name="avoidances" value={item.value} defaultChecked={isSelected} className="sr-only" />
                    <span className="text-xl">{item.icon}</span>
                    <span className="text-sm font-semibold flex-1">{item.value}</span>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0
                      ${isSelected
                        ? 'bg-red-500 border-red-500'
                        : 'border-[hsl(var(--text-muted))]/30'
                      }`}>
                      {isSelected && (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* ── Meat & Protein ── */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--text-muted))] mb-4 flex items-center gap-2">
              <span className="w-5 h-0.5 bg-violet-500 rounded-full"></span>
              Fleisch & Protein
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--text-muted))]">
                  <span className="text-base">🥩</span> Fleisch/Fisch-Konsum
                </label>
                <select name="meat_frequency" className="input-apple bg-[hsl(var(--background))] appearance-none" defaultValue={userData?.food_preferences?.meat_frequency || 'Mehrmals pro Woche'}>
                  <option value="Täglich">Täglich</option>
                  <option value="Mehrmals pro Woche">Mehrmals pro Woche</option>
                  <option value="Selten">Selten</option>
                  <option value="Nie">Nie</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--text-muted))]">
                  <span className="text-base">🍗</span> Bevorzugte Proteinquellen
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "Geflügel", icon: "🍗" },
                    { value: "Rind", icon: "🥩" },
                    { value: "Schwein", icon: "🐷" },
                    { value: "Lamm", icon: "🐑" },
                    { value: "Fisch", icon: "🐟" },
                    { value: "Meeresfrüchte", icon: "🦐" },
                  ].map(item => {
                    const isSelected = (userData?.food_preferences?.meat_types || []).includes(item.value)
                    return (
                      <label key={item.value} className={`flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.98]
                        ${isSelected
                          ? 'border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/5'
                          : 'border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:border-[hsl(var(--primary))]/30'
                        }`}>
                        <input type="checkbox" name="meat_types" value={item.value} defaultChecked={isSelected} className="sr-only" />
                        <span className="text-lg">{item.icon}</span>
                        <span className="text-xs font-semibold flex-1">{item.value}</span>
                        <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all shrink-0
                          ${isSelected
                            ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))]'
                            : 'border-[hsl(var(--text-muted))]/30'
                          }`}>
                          {isSelected && (
                            <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── Meal Schedule ── */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--text-muted))] mb-4 flex items-center gap-2">
              <span className="w-5 h-0.5 bg-sky-500 rounded-full"></span>
              Mahlzeiten-Rhythmus
            </h3>
            <p className="text-xs text-[hsl(var(--text-muted))] mb-3">Welche Mahlzeiten isst du in der Regel?</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { value: "Frühstück", icon: "🌅", desc: "Morgens" },
                { value: "Mittagessen", icon: "☀️", desc: "Mittags" },
                { value: "Abendessen", icon: "🌙", desc: "Abends" },
                { value: "Snacks", icon: "🍿", desc: "Zwischendurch" },
              ].map(item => {
                const isSelected = userData?.food_preferences?.meal_schedule 
                  ? userData.food_preferences.meal_schedule.includes(item.value) 
                  : true
                return (
                  <label key={item.value} className={`group flex flex-col items-center gap-1.5 p-4 rounded-2xl border-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-95
                    ${isSelected
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 shadow-sm'
                      : 'border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:border-[hsl(var(--primary))]/40'
                    }`}>
                    <input type="checkbox" name="meal_schedule" value={item.value} defaultChecked={isSelected} className="sr-only" />
                    <span className="text-2xl">{item.icon}</span>
                    <span className="text-sm font-bold">{item.value}</span>
                    <span className="text-[10px] font-medium text-[hsl(var(--text-muted))]">{item.desc}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-[hsl(var(--border))]">
            <button type="submit" className="btn-primary w-full sm:w-auto px-8 gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Präferenzen speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
