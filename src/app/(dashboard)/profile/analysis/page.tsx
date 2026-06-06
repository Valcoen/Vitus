import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { calculateAge, calculateBMR, calculateTDEE, adjustForGoal, calculateMacroSplit, getMealCalorieDistribution, type TDEEInput, type Goal, type ActivityFrequency } from '@/utils/tdeeCalculator'

export default async function AnalysisPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', user.id)
        .single()

    const canCalculate = userData?.weight && userData?.height && userData?.birthday && userData?.gender

    let bmr = 0, tdee = 0, adjustedCalories = 0, macros = { calories: 0, protein: 0, carbs: 0, fat: 0 }, mealDistribution: Record<string, number> = {}

    if (canCalculate) {
        const age = calculateAge(userData.birthday!)
        const tdeeInput: TDEEInput = {
            weight: userData.weight!,
            height: userData.height!,
            age,
            gender: userData.gender as TDEEInput['gender'],
            activityFrequency: (userData.activity_frequency as ActivityFrequency) || '1-2 mal pro Woche',
            goal: (userData.goal as Goal) || 'Halten',
        }

        bmr = calculateBMR(tdeeInput.weight, tdeeInput.height, age, tdeeInput.gender)
        tdee = calculateTDEE(tdeeInput)
        adjustedCalories = adjustForGoal(tdee, tdeeInput.goal)
        macros = calculateMacroSplit(adjustedCalories, tdeeInput.goal)

        const mealSchedule = userData.food_preferences?.meal_schedule || ['Frühstück', 'Mittagessen', 'Abendessen']
        mealDistribution = getMealCalorieDistribution(adjustedCalories, mealSchedule)
    }

    const goal = userData?.goal || 'Halten'
    const goalLabel: Record<string, string> = {
        'Fettabbau': '20% Kaloriendefizit',
        'Muskelaufbau': '10% Kalorienüberschuss',
        'Halten': 'Maintenance (kein Defizit/Überschuss)',
    }

    return (
        <div className="space-y-8 max-w-4xl">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">🧠 Personalisierte Analyse</h1>
                <p className="text-[hsl(var(--text-muted))] mt-1 text-lg font-medium">
                    Deine berechneten Nährwerte basierend auf deinem Profil.
                </p>
            </div>

            {!canCalculate ? (
                <div className="card-apple">
                    <p className="text-[hsl(var(--text-muted))] font-medium">
                        Bitte fülle zuerst dein Profil aus (Gewicht, Größe, Geburtstag, Geschlecht), um deine personalisierte Analyse zu sehen.
                    </p>
                    <a href="/profile" className="btn-primary inline-block mt-4">Zum Profil</a>
                </div>
            ) : (
                <>
                    {/* Headline Metrics */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="card-apple text-center">
                            <p className="text-xs uppercase font-bold text-[hsl(var(--text-muted))] tracking-widest mb-1">BMR</p>
                            <p className="text-3xl font-extrabold">{bmr}</p>
                            <p className="text-xs text-[hsl(var(--text-muted))] font-medium mt-1">kcal/Tag (Ruhe)</p>
                        </div>
                        <div className="card-apple text-center">
                            <p className="text-xs uppercase font-bold text-[hsl(var(--text-muted))] tracking-widest mb-1">TDEE</p>
                            <p className="text-3xl font-extrabold">{tdee}</p>
                            <p className="text-xs text-[hsl(var(--text-muted))] font-medium mt-1">kcal/Tag (mit Aktivität)</p>
                        </div>
                        <div className="card-apple text-center bg-gradient-to-br from-[hsl(var(--primary))]/5 to-transparent">
                            <p className="text-xs uppercase font-bold text-[hsl(var(--primary))] tracking-widest mb-1">Dein Tagesziel</p>
                            <p className="text-3xl font-extrabold text-[hsl(var(--primary))]">{adjustedCalories}</p>
                            <p className="text-xs text-[hsl(var(--text-muted))] font-medium mt-1">kcal/Tag ({goal})</p>
                        </div>
                        <div className="card-apple text-center">
                            <p className="text-xs uppercase font-bold text-[hsl(var(--text-muted))] tracking-widest mb-1">Ziel-Anpassung</p>
                            <p className="text-lg font-bold mt-2">{goalLabel[goal] || goal}</p>
                        </div>
                    </div>

                    {/* Macro Breakdown */}
                    <div className="card-apple">
                        <h2 className="text-xl font-bold mb-6">📊 Tägliche Makronährstoffe</h2>
                        <div className="grid grid-cols-3 gap-6">
                            <div className="text-center p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
                                <p className="text-xs uppercase font-bold text-blue-500 tracking-widest mb-2">Protein</p>
                                <p className="text-3xl font-extrabold text-blue-500">{macros.protein}g</p>
                                <p className="text-xs text-[hsl(var(--text-muted))] mt-1">{Math.round(macros.protein * 4)} kcal</p>
                            </div>
                            <div className="text-center p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                                <p className="text-xs uppercase font-bold text-amber-500 tracking-widest mb-2">Kohlenhydrate</p>
                                <p className="text-3xl font-extrabold text-amber-500">{macros.carbs}g</p>
                                <p className="text-xs text-[hsl(var(--text-muted))] mt-1">{Math.round(macros.carbs * 4)} kcal</p>
                            </div>
                            <div className="text-center p-4 rounded-xl bg-rose-500/5 border border-rose-500/10">
                                <p className="text-xs uppercase font-bold text-rose-500 tracking-widest mb-2">Fett</p>
                                <p className="text-3xl font-extrabold text-rose-500">{macros.fat}g</p>
                                <p className="text-xs text-[hsl(var(--text-muted))] mt-1">{Math.round(macros.fat * 9)} kcal</p>
                            </div>
                        </div>
                    </div>

                    {/* Per-meal distribution */}
                    {Object.keys(mealDistribution).length > 0 && (
                        <div className="card-apple">
                            <h2 className="text-xl font-bold mb-6">🍽️ Kalorien pro Mahlzeit</h2>
                            <div className="space-y-3">
                                {Object.entries(mealDistribution).map(([slot, kcal]) => {
                                    const percentage = Math.round((kcal / adjustedCalories) * 100)
                                    return (
                                        <div key={slot} className="flex items-center gap-4">
                                            <span className="text-sm font-semibold w-28 shrink-0">{slot}</span>
                                            <div className="flex-1 h-3 bg-[hsl(var(--input-bg))] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-[hsl(var(--primary))] rounded-full transition-all"
                                                    style={{ width: `${percentage}%` }}
                                                />
                                            </div>
                                            <span className="text-sm font-bold w-24 text-right">{kcal} kcal ({percentage}%)</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Context Info */}
                    <div className="card-apple bg-[hsl(var(--input-bg))] border-none">
                        <p className="text-sm text-[hsl(var(--text-muted))] font-medium">
                            <strong>Berechnungsmethode:</strong> Mifflin-St Jeor Gleichung × Aktivitätsmultiplikator.
                            Werte sind Richtwerte und können je nach individueller Situation variieren.
                            Änderungen an deinem Profil (Gewicht, Ziel, Aktivität) aktualisieren diese Werte automatisch.
                        </p>
                    </div>
                </>
            )}
        </div>
    )
}
