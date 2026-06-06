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

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mein Profil</h1>
        <p className="text-[hsl(var(--text-muted))] mt-1 text-lg font-medium">Verwalte deine Biometrie und Ernährungspräferenzen.</p>
      </div>
      
      <div className="card-apple">
         <div className="flex justify-between items-center mb-6">
           <h2 className="text-xl font-bold">Biometrie</h2>
           {userData?.weight && userData?.height && (
             (() => {
               const heightM = userData.height / 100;
               const bmi = userData.weight / (heightM * heightM);
               const bmiRounded = Math.round(bmi * 10) / 10;
               let scaleText = "";
               let bgColorClass = "";
               let textColorClass = "";

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
                 <div className={`px-3 py-1.5 rounded-xl border border-[hsl(var(--border))] flex items-center gap-2 shadow-sm ${bgColorClass}`}>
                   <span className="text-sm font-semibold opacity-80">BMI:</span>
                   <span className="font-bold">{bmiRounded}</span>
                   <span className={`text-xs ml-1 font-semibold ${textColorClass}`}>{scaleText}</span>
                 </div>
               );
             })()
           )}
         </div>
         <form action={saveBiometrics} className="space-y-6">
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Gewicht (kg)</label>
                    <input name="weight" className="input-apple bg-[hsl(var(--background))]" type="number" defaultValue={userData?.weight} step="0.1" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Größe (cm)</label>
                    <input name="height" className="input-apple bg-[hsl(var(--background))]" type="number" defaultValue={userData?.height} />
                  </div>
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                 <div>
                    <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Ziel</label>
                    <select name="goal" className="input-apple bg-[hsl(var(--background))] appearance-none" defaultValue={userData?.goal || 'Fettabbau'}>
                        <option value="Fettabbau">Fettabbau</option>
                        <option value="Muskelaufbau">Muskelaufbau</option>
                        <option value="Halten">Halten</option>
                    </select>
                 </div>
                 <div>
                    <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Aktivitätslevel</label>
                    <select name="activity_frequency" className="input-apple bg-[hsl(var(--background))] appearance-none" defaultValue={userData?.activity_frequency || '1-2 mal pro Woche'}>
                        <option value="Gar nicht">Gar nicht</option>
                        <option value="1-2 mal pro Woche">1-2 mal pro Woche</option>
                        <option value="3-4 mal pro Woche">3-4 mal pro Woche</option>
                        <option value="5+ mal pro Woche">5+ mal pro Woche</option>
                    </select>
                 </div>
             </div>

             <div className="pt-4 border-t border-[hsl(var(--border))]">
                 <button type="submit" className="btn-primary w-full sm:w-auto px-8">Biometrie & Ziele Speichern</button>
             </div>
         </form>
      </div>

      <div className="card-apple">
         <h2 className="text-xl font-bold mb-6">🍽️ Ernährungs-Präferenzen</h2>
         <form action={savePreferences} className="space-y-6">
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                 <div>
                    <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Ernährungstyp</label>
                    <select name="diet_type" className="input-apple bg-[hsl(var(--background))] appearance-none" defaultValue={userData?.food_preferences?.diet_type || 'omnivore'}>
                        <option value="omnivore">Omnivore (alles)</option>
                        <option value="vegetarian">Vegetarisch</option>
                        <option value="vegan">Vegan</option>
                        <option value="pescetarian">Pescetarisch</option>
                    </select>
                 </div>
                 <div>
                    <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Lebensmittel-Budget</label>
                    <select name="budget" className="input-apple bg-[hsl(var(--background))] appearance-none" defaultValue={userData?.food_preferences?.budget || 'Medium Budget'}>
                        <option value="Low Budget">Low Budget</option>
                        <option value="Medium Budget">Medium Budget</option>
                        <option value="High Budget">High Budget</option>
                    </select>
                 </div>
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Allergien / Unverträglichkeiten</label>
                    <input name="allergies" className="input-apple bg-[hsl(var(--background))]" type="text" defaultValue={(userData?.food_preferences?.allergies || []).join(', ')} placeholder="z.B. Erdnüsse, Laktose" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Mag ich nicht</label>
                    <input name="dislikes" className="input-apple bg-[hsl(var(--background))]" type="text" defaultValue={(userData?.food_preferences?.dislikes || []).join(', ')} placeholder="z.B. Brokkoli" />
                  </div>
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Bevorzugte Küchen</label>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-4 border border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--background))]">
                        {["Deutsch", "Italienisch", "Asiatisch", "Mexikanisch", "Indisch", "Mediterran", "Amerikanisch", "Türkisch", "Japanisch", "Griechisch"].map(c => (
                            <label key={c} className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                                <input type="checkbox" name="preferred_cuisines" value={c} defaultChecked={(userData?.food_preferences?.preferred_cuisines || []).includes(c)} className="w-4 h-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]" />
                                {c}
                            </label>
                        ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Möchte ich vermeiden</label>
                    <div className="flex flex-col gap-3 max-h-48 overflow-y-auto p-4 border border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--background))]">
                        {["Stark verarbeitet", "Frittiert", "Sehr scharf", "Rohes Fleisch", "Innereien"].map(c => (
                            <label key={c} className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                                <input type="checkbox" name="avoidances" value={c} defaultChecked={(userData?.food_preferences?.avoidances || []).includes(c)} className="w-4 h-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]" />
                                {c}
                            </label>
                        ))}
                    </div>
                  </div>
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Fleisch/Fisch-Konsum</label>
                    <select name="meat_frequency" className="input-apple bg-[hsl(var(--background))] appearance-none" defaultValue={userData?.food_preferences?.meat_frequency || 'Mehrmals pro Woche'}>
                        <option value="Täglich">Täglich</option>
                        <option value="Mehrmals pro Woche">Mehrmals pro Woche</option>
                        <option value="Selten">Selten</option>
                        <option value="Nie">Nie</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Bevorzugte Proteinquellen</label>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-4 border border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--background))]">
                        {["Geflügel", "Rind", "Schwein", "Lamm", "Fisch", "Meeresfrüchte"].map(c => (
                            <label key={c} className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                                <input type="checkbox" name="meat_types" value={c} defaultChecked={(userData?.food_preferences?.meat_types || []).includes(c)} className="w-4 h-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]" />
                                {c}
                            </label>
                        ))}
                    </div>
                  </div>
             </div>

             <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Mahlzeiten-Rhythmus (Welche Mahlzeiten isst du in der Regel?)</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 border border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--background))]">
                        {["Frühstück", "Mittagessen", "Abendessen", "Snacks"].map(m => {
                            const selected = userData?.food_preferences?.meal_schedule 
                              ? userData.food_preferences.meal_schedule.includes(m) 
                              : true; // Standardmäßig alle aktiviert
                            return (
                                <label key={m} className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                                    <input type="checkbox" name="meal_schedule" value={m} defaultChecked={selected} className="w-4 h-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]" />
                                    {m}
                                </label>
                            )
                        })}
                    </div>
                  </div>
             </div>

             <div className="pt-4 border-t border-[hsl(var(--border))]">
                 <button type="submit" className="btn-primary w-full sm:w-auto px-8">Präferenzen Speichern</button>
             </div>
         </form>
      </div>
    </div>
  )
}
