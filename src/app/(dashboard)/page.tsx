import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, UtensilsCrossed } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Fetch user data
  const { data: userData } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', user.id)
    .single()

  // Fetch household explicitly to avoid deep join RLS issues temporarily
  let householdName = "Kein Haushalt"
  if (userData?.household_id) {
     const { data: h } = await supabase.from('households').select('name').eq('id', userData.household_id).single()
     if (h?.name) householdName = h.name
  }

  // Today's meals: day_index is the offset from week_start
  const SLOT_ORDER = ['Frühstück', 'Mittagessen', 'Abendessen', 'Snacks']
  type TodayPortion = { userId: string; name: string; isMe: boolean; kcal: number; protein: number; carbs: number; fat: number }
  type TodayMeal = { id: string; slot: string; title: string; shared: boolean; portions: TodayPortion[] }
  let todayMeals: TodayMeal[] = []
  let hasPlan = false
  if (userData?.household_id) {
    const { data: meals } = await supabase
      .from('meals')
      .select('id, name, meal_type, is_shared, day_index, week_start, recipes(title)')
      .eq('household_id', userData.household_id)
    hasPlan = (meals?.length ?? 0) > 0
    const weekStart = meals?.[0]?.week_start
    if (weekStart) {
      const todayIdx = Math.round((Date.parse(new Date().toISOString().split('T')[0]) - Date.parse(weekStart)) / 86400000)
      const todays = (meals || []).filter((m: any) => m.day_index === todayIdx)
      const ids = todays.map((m: any) => m.id)
      const { data: portions } = ids.length
        ? await supabase.from('meal_portions').select('meal_id, user_id, target_kcal, target_protein, target_carbs, target_fat').in('meal_id', ids)
        : { data: [] }
      const { data: members } = await supabase.from('users').select('id, name').eq('household_id', userData.household_id)
      const nameOf = Object.fromEntries((members || []).map((u: any) => [u.id, u.name]))
      todayMeals = todays
        .map((m: any) => ({
          id: m.id,
          slot: m.meal_type,
          title: (Array.isArray(m.recipes) ? m.recipes[0]?.title : m.recipes?.title) || m.name,
          shared: !!m.is_shared,
          portions: (portions || [])
            .filter((p: any) => p.meal_id === m.id)
            .map((p: any) => ({
              userId: p.user_id,
              name: nameOf[p.user_id] || 'Person',
              isMe: p.user_id === userData.id,
              kcal: Math.round(p.target_kcal),
              protein: Math.round(p.target_protein),
              carbs: Math.round(p.target_carbs),
              fat: Math.round(p.target_fat),
            }))
            .sort((a: TodayPortion, b: TodayPortion) => Number(b.isMe) - Number(a.isMe)),
        }))
        .sort((a: TodayMeal, b: TodayMeal) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
    }
  }

  // Check if profile is incomplete (missing essential biometric data)
  const profileIncomplete = !userData?.weight || !userData?.height || !userData?.goal

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">👋 Willkommen zurück, {userData?.name || 'Nutzer'}!</h1>
        <p className="text-[hsl(var(--text-muted))] mt-2 text-lg font-medium">Hier ist dein täglicher Überblick.</p>
      </div>

      {/* Profile Setup Banner — shown when essential data is missing */}
      {profileIncomplete && (
        <Link
          href="/profile"
          className="group block relative overflow-hidden rounded-2xl border border-orange-200 dark:border-orange-800/40 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-yellow-950/20 p-5 shadow-sm hover:shadow-md transition-all hover:scale-[1.005]"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-amber-500 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
              <AlertTriangle size={24} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-[hsl(var(--text))] text-lg">Profil vervollständigen</h3>
              <p className="text-sm font-medium text-[hsl(var(--text-muted))] mt-0.5">
                Fülle deine Biometrie und Ernährungspräferenzen aus, um die App optimal nutzen zu können.
              </p>
            </div>
            <div className="shrink-0 w-10 h-10 rounded-full bg-[hsl(var(--primary))]/10 flex items-center justify-center group-hover:bg-[hsl(var(--primary))]/20 transition-colors">
              <ArrowRight size={20} className="text-[hsl(var(--primary))] group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
          {/* Decorative gradient bar at top */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[hsl(var(--primary))] via-amber-400 to-yellow-400" />
        </Link>
      )}

      {/* Today's meals */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Heute auf dem Tisch</h2>
          <Link href="/meal-plan" className="text-sm font-semibold text-[hsl(var(--primary))] flex items-center gap-1">
            Ganzer Plan <ArrowRight size={16} />
          </Link>
        </div>
        {todayMeals.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {todayMeals.map((meal) => (
              <div key={meal.id} className="card-apple space-y-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
                    {meal.slot}{meal.shared ? ' · gemeinsam' : ''}
                  </p>
                  <p className="font-bold text-lg leading-snug break-words">{meal.title}</p>
                </div>
                <div className="space-y-2">
                  {meal.portions.map((p) => (
                    <div
                      key={p.userId}
                      className={`rounded-xl px-3 py-2.5 ${p.isMe ? 'bg-[hsl(var(--primary))]/[0.08] ring-1 ring-[hsl(var(--primary))]/20' : 'bg-[hsl(var(--input-bg))]'}`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-bold text-sm">{p.isMe ? `${p.name} (Du)` : p.name}</span>
                        <span className="font-extrabold">{p.kcal} kcal</span>
                      </div>
                      <p className="text-xs font-semibold text-[hsl(var(--text-muted))] mt-0.5">
                        <span className="text-blue-500">P {p.protein}g</span> · <span className="text-amber-500">KH {p.carbs}g</span> · <span className="text-rose-500">F {p.fat}g</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card-apple border-dashed flex items-center gap-4">
            <UtensilsCrossed size={28} className="text-[hsl(var(--text-muted))] shrink-0" />
            <p className="font-medium text-[hsl(var(--text-muted))]">
              {hasPlan ? 'Für heute ist keine Mahlzeit geplant.' : 'Noch kein Ernährungsplan vorhanden.'}{' '}
              <Link href="/meal-plan" className="font-bold text-[hsl(var(--primary))]">
                {hasPlan ? 'Plan ansehen' : 'Plan erstellen'}
              </Link>
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card-apple flex flex-col justify-center">
          <p className="text-sm font-semibold text-[hsl(var(--text-muted))] mb-2 uppercase tracking-wide">Dein Ziel</p>
          <p className="text-3xl font-bold">{userData?.goal || "Nicht gesetzt"}</p>
        </div>

        <div className="card-apple flex flex-col justify-center">
          <p className="text-sm font-semibold text-[hsl(var(--text-muted))] mb-2 uppercase tracking-wide">Haushalt</p>
          <p className="text-3xl font-bold">{householdName}</p>
        </div>

        <div className="card-apple flex flex-col justify-center">
          <p className="text-sm font-semibold text-[hsl(var(--text-muted))] mb-2 uppercase tracking-wide">Aktuelles Gewicht</p>
          <p className="text-3xl font-bold">{userData?.weight ? `${userData.weight} kg` : "-"}</p>
        </div>

        {/* BMI Card */}
        <div className="card-apple flex flex-col justify-center relative overflow-hidden">
          <p className="text-sm font-semibold text-[hsl(var(--text-muted))] mb-2 uppercase tracking-wide relative z-10">Dein BMI</p>
          {userData?.weight && userData?.height ? (
            (() => {
              const heightM = userData.height / 100;
              const bmi = userData.weight / (heightM * heightM);
              const bmiRounded = Math.round(bmi * 10) / 10;
              let scaleText = "";
              let bgColorClass = "bg-[hsl(var(--card))]";
              let textColorClass = "text-[hsl(var(--text))]";

              if (bmi < 18.5) {
                scaleText = "Untergewicht";
                bgColorClass = "bg-blue-100 dark:bg-blue-900/40";
                textColorClass = "text-blue-700 dark:text-blue-300";
              } else if (bmi < 25) {
                scaleText = "Normalgewicht";
                bgColorClass = "bg-green-100 dark:bg-green-900/40";
                textColorClass = "text-green-700 dark:text-green-300";
              } else if (bmi < 30) {
                scaleText = "Übergewicht";
                bgColorClass = "bg-orange-100 dark:bg-orange-900/40";
                textColorClass = "text-orange-700 dark:text-orange-300";
              } else {
                scaleText = "Adipositas";
                bgColorClass = "bg-red-100 dark:bg-red-900/40";
                textColorClass = "text-red-700 dark:text-red-300";
              }

              return (
                <div className="relative z-10">
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold">{bmiRounded}</p>
                    <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${bgColorClass} ${textColorClass}`}>
                      {scaleText}
                    </span>
                  </div>
                </div>
              );
            })()
          ) : (
            <p className="text-3xl font-bold">-</p>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-[hsl(var(--border))]">
          <h2 className="text-2xl font-bold mb-6">🚀 Schnellstart</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
               <Link href="/meal-plan" className="btn-primary shadow-sm hover:scale-[1.02] transition-transform">Ernährungsplan prüfen</Link>
               <Link href="/checkin" className="btn-secondary shadow-sm hover:scale-[1.02] transition-transform">Wochen-Check-In</Link>
          </div>
      </div>
    </div>
  )
}
