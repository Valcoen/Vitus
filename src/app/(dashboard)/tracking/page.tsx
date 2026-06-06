import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { Activity, Flame, Scale } from 'lucide-react'

export default async function TrackingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userData } = await supabase.from('users').select('id, weight').eq('auth_id', user.id).single()
  const uid = userData?.id

  const { data: logs } = await supabase.from('user_logs').select('*').eq('user_id', uid).order('logged_at', { ascending: false }).limit(20)

  async function addLog(formData: FormData) {
    'use server'
    const weight = formData.get('weight') as string
    const calories = formData.get('calories') as string
    const energy = formData.get('energy') as string
    const note = formData.get('note') as string

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: u } = await supabase.from('users').select('id').eq('auth_id', user!.id).single()

    if (weight) await supabase.from('users').update({ weight: parseFloat(weight) }).eq('id', u!.id)

    await supabase.from('user_logs').insert({
        user_id: u!.id,
        log_type: 'daily_tracking',
        weight: weight ? parseFloat(weight) : null,
        calories_intake: calories ? parseInt(calories) : null,
        energy_level: energy ? parseInt(energy) : null,
        note: note || null
    })

    revalidatePath('/tracking')
    revalidatePath('/') // update root dashboard weight
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">📈 Tracking</h1>
        <p className="text-[hsl(var(--text-muted))] mt-1 text-lg font-medium">Dokumentiere täglich dein Gewicht, Kalorien und Befinden.</p>
      </div>

      <div className="card-apple">
         <h2 className="text-xl font-bold mb-6">📝 Neuer Eintrag</h2>
         <form action={addLog} className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label className="block text-sm font-semibold mb-2 pl-1">Gewicht (kg)</label>
                    <input type="number" name="weight" step="0.1" defaultValue={userData?.weight} className="input-apple bg-[hsl(var(--background))]" />
                 </div>
                 <div>
                    <label className="block text-sm font-semibold mb-2 pl-1">Kalorien (kcal)</label>
                    <input type="number" name="calories" step="50" min="0" placeholder="Optional" className="input-apple bg-[hsl(var(--background))]" />
                 </div>
                 <div>
                    <label className="block text-sm font-semibold mb-2 pl-1">Energielevel (1-10)</label>
                    <input type="range" name="energy" min="1" max="10" defaultValue="5" className="w-full accent-[hsl(var(--primary))] h-2 rounded-lg appearance-none bg-[hsl(var(--background))]" />
                    <div className="flex justify-between text-xs text-[hsl(var(--text-muted))] mt-2 font-medium px-1"><span>Müde (1)</span><span>Voller Energie (10)</span></div>
                 </div>
                 <div>
                    <label className="block text-sm font-semibold mb-2 pl-1">Notiz</label>
                    <input type="text" name="note" placeholder="z.B. Cheat Day, gutes Training..." className="input-apple bg-[hsl(var(--background))]" />
                 </div>
             </div>
             <button type="submit" className="btn-primary">Eintrag Speichern</button>
         </form>
      </div>

      <div>
          <h2 className="text-2xl font-bold mb-6">Letzte Einträge</h2>
          <div className="space-y-3">
              {logs?.map(log => (
                  <div key={log.id} className="p-4 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                          <p className="text-sm font-semibold text-[hsl(var(--text-muted))] mb-1">
                              {new Date(log.logged_at).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                          </p>
                          <p className="font-medium text-lg">{log.note || 'Tägliches Tracking'}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                          {log.weight && <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(var(--input-bg))] rounded-xl text-sm font-semibold"><Scale size={16} className="text-emerald-500" /> {log.weight} kg</span>}
                          {log.calories_intake && <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(var(--input-bg))] rounded-xl text-sm font-semibold"><Flame size={16} className="text-orange-500" /> {log.calories_intake} kcal</span>}
                          {log.energy_level && <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(var(--input-bg))] rounded-xl text-sm font-semibold"><Activity size={16} className="text-blue-500" /> lvl {log.energy_level}</span>}
                      </div>
                  </div>
              ))}
              {(!logs || logs.length === 0) && <p className="text-[hsl(var(--text-muted))]">Noch keine Einträge vorhanden.</p>}
          </div>
      </div>
    </div>
  )
}
