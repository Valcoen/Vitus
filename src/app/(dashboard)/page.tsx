import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'

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
               <a href="/meal-plan" className="btn-primary shadow-sm hover:scale-[1.02] transition-transform">Ernährungsplan prüfen</a>
               <a href="/checkin" className="btn-secondary shadow-sm hover:scale-[1.02] transition-transform">Wochen-Check-In</a>
          </div>
      </div>
    </div>
  )
}
