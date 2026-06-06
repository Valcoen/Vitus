import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Users, Crown, Key, User } from 'lucide-react'

export default async function HouseholdPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userData } = await supabase.from('users').select('*').eq('auth_id', user.id).single()
  
  let household = null;
  if (userData?.household_id) {
      const { data } = await supabase.from('households').select('*').eq('id', userData.household_id).single()
      household = data;
  }

  const { data: members } = userData?.household_id ? await supabase.from('users').select('id, name, email').eq('household_id', userData.household_id) : { data: [] }
  const isPlanner = household?.planner_user_id === userData?.id

  async function createHousehold(formData: FormData) {
    'use server'
    const name = formData.get('name') as string
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: u } = await supabase.from('users').select('id, name').eq('auth_id', user!.id).single()
    const finalName = name || `Haushalt ${u?.name}`
    const { data: h, error } = await supabase.from('households').insert({ name: finalName, planner_user_id: u?.id }).select().single()
    if (error) redirect(`/household?error=${encodeURIComponent('Fehler beim Gründen des Haushalts')}`)
    await supabase.from('users').update({ household_id: h.id }).eq('id', u?.id)
    redirect(`/household?success=${encodeURIComponent('Dein Zuhause wurde erfolgreich gegründet!')}`)
  }

  async function joinHousehold(formData: FormData) {
    'use server'
    const code = formData.get('code') as string
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: h } = await supabase.from('households').select('id').eq('invite_code', code).single()
    if (h) {
        const { data: u } = await supabase.from('users').select('id').eq('auth_id', user!.id).single()
        await supabase.from('users').update({ household_id: h.id }).eq('id', u!.id)
        redirect(`/household?success=${encodeURIComponent('Du bist dem Haushalt erfolgreich beigetreten!')}`)
    } else {
        redirect(`/household?error=${encodeURIComponent('Ungültiger Invite-Code')}`)
    }
  }

  async function leaveHousehold() {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: u } = await supabase.from('users').select('id').eq('auth_id', user!.id).single()
    await supabase.from('users').update({ household_id: null }).eq('id', u!.id)
    redirect(`/household?success=${encodeURIComponent('Du hast den Haushalt verlassen.')}`)
  }

  async function makePlanner(memberId: string) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: u } = await supabase.from('users').select('id, household_id').eq('auth_id', user!.id).single()
    if (u?.household_id) {
        // Ensure the person promoting is the current planner
        const { data: h } = await supabase.from('households').select('planner_user_id').eq('id', u.household_id).single()
        if (h?.planner_user_id === u.id) {
            await supabase.from('households').update({ planner_user_id: memberId }).eq('id', u.household_id)
            revalidatePath('/') // Revalidate dashboard
            redirect(`/household?success=${encodeURIComponent('Mitglied wurde zum Planner befördert!')}`)
        }
    }
  }

  async function saveSharedSettings(formData: FormData) {
    'use server'
    const meals = formData.getAll('shared_meals') as string[]
    const batchDays = formData.get('batch_days') as string

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: u } = await supabase.from('users').select('household_id').eq('auth_id', user!.id).single()
    if (u?.household_id) {
        const { error } = await supabase.from('households').update({
            shared_meal_frequency: meals.join(','),
            batch_defaults: { lunch_batch_days: parseInt(batchDays) || 1 }
        }).eq('id', u.household_id)
        if (error) redirect(`/household?error=${encodeURIComponent('Fehler beim Speichern der Einstellungen')}`)
        redirect(`/household?success=${encodeURIComponent('Haushaltseinstellungen erfolgreich gespeichert!')}`)
    }
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">🏠 Dein Haushalt</h1>
        <p className="text-[hsl(var(--text-muted))] mt-1 text-lg font-medium">Verwalte Mitbewohner und gemeinsame Essensgewohnheiten.</p>
      </div>

      {!household ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card-apple">
                <h2 className="text-xl font-bold mb-2">Neuen Haushalt gründen</h2>
                <p className="text-sm font-medium text-[hsl(var(--text-muted))] mb-4">Werde Planner und lade andere in deinen Plan ein.</p>
                <form action={createHousehold} className="space-y-4">
                    <input type="text" name="name" placeholder="Name des Haushalts (optional)" className="input-apple" />
                    <button type="submit" className="btn-primary w-full">Gründen</button>
                </form>
            </div>
            <div className="card-apple">
                <h2 className="text-xl font-bold mb-2">Bestehendem Haushalt beitreten</h2>
                <p className="text-sm font-medium text-[hsl(var(--text-muted))] mb-4">Ein Planner muss dir seinen Invite-Code schicken.</p>
                <form action={joinHousehold} className="space-y-4">
                    <input type="text" name="code" placeholder="Invite-Code z.B. 4fa1b" className="input-apple" required />
                    <button type="submit" className="btn-secondary w-full border-[hsl(var(--primary))] text-[hsl(var(--primary))]">Beitreten</button>
                </form>
            </div>
        </div>
      ) : (
        <div className="space-y-6">
            <div className="card-apple bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--input-bg))]">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-sm font-semibold text-[hsl(var(--primary))] uppercase tracking-widest mb-1">Aktiver Haushalt</p>
                        <h2 className="text-3xl font-extrabold mb-1">{household.name}</h2>
                        <div className="flex items-center gap-2 text-[hsl(var(--text-muted))] font-medium mt-3">
                           <Key size={18} />
                           Invite-Code: <span className="text-[hsl(var(--text))] bg-[hsl(var(--background))] px-2 py-0.5 rounded-lg select-all">{household.invite_code}</span>
                        </div>
                    </div>
                    <form action={leaveHousehold}>
                        <button type="submit" className="text-red-500 font-semibold px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-colors">Haushalt verlassen</button>
                    </form>
                </div>
            </div>

            <div className="card-apple">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><Users size={22} className="text-[hsl(var(--primary))]" /> Mitglieder</h3>
                <ul className="space-y-3">
                    {members?.map(m => (
                        <li key={m.id} className="flex items-center justify-between p-3 bg-[hsl(var(--input-bg))] rounded-2xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-[hsl(var(--card))] rounded-full flex items-center justify-center font-bold text-lg border border-[hsl(var(--border))]">
                                    {m.name ? m.name[0].toUpperCase() : '?'}
                                </div>
                                <div>
                                    <p className="font-semibold">{m.name}</p>
                                    <p className="text-xs text-[hsl(var(--text-muted))] font-medium">{m.email}</p>
                                </div>
                            </div>
                            {m.id === household.planner_user_id ? (
                                <span className="flex items-center gap-1.5 text-xs font-bold text-amber-500 bg-amber-500/10 px-2.5 py-1.5 rounded-lg">
                                    <Crown size={14} strokeWidth={3} /> PLANNER
                                </span>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1.5 text-xs font-bold text-[hsl(var(--text-muted))] bg-[hsl(var(--border))] px-2.5 py-1.5 rounded-lg">
                                        <User size={14} strokeWidth={3} /> MITGLIED
                                    </span>
                                    {isPlanner && (
                                        <form action={makePlanner.bind(null, m.id)}>
                                            <button type="submit" className="text-[10px] uppercase font-bold px-2 py-1 bg-[hsl(var(--primary))] text-white rounded-md hover:scale-95 transition-transform">
                                                Zum Planner machen
                                            </button>
                                        </form>
                                    )}
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
            
            {isPlanner && (
               <div className="card-apple">
                   <h3 className="text-xl font-bold mb-4">🍽️ Gemeinsame Mahlzeiten (Einstellungen)</h3>
                   <p className="text-[hsl(var(--text-muted))] font-medium mb-4">Wähle aus, welche Mahlzeiten ihr gemeinsam kocht und wie viele Tage ihr preppen wollt.</p>
                   
                   <form action={saveSharedSettings} className="space-y-6">
                       <div>
                           <label className="block text-sm font-semibold mb-3 pl-1">Gemeinsame Mahlzeiten-Typen</label>
                           <div className="space-y-3 bg-[hsl(var(--background))] p-4 rounded-xl border border-[hsl(var(--border))]">
                               <label className="flex items-center gap-3 cursor-pointer">
                                   <input type="checkbox" name="shared_meals" value="breakfast" defaultChecked={household.shared_meal_frequency?.includes('breakfast')} className="w-5 h-5 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]" />
                                   <span className="font-medium text-sm">Frühstück</span>
                               </label>
                               <label className="flex items-center gap-3 cursor-pointer">
                                   <input type="checkbox" name="shared_meals" value="lunch" defaultChecked={household.shared_meal_frequency?.includes('lunch')} className="w-5 h-5 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]" />
                                   <span className="font-medium text-sm">Mittagessen</span>
                               </label>
                               <label className="flex items-center gap-3 cursor-pointer">
                                   <input type="checkbox" name="shared_meals" value="dinner" defaultChecked={household.shared_meal_frequency?.includes('dinner')} className="w-5 h-5 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]" />
                                   <span className="font-medium text-sm">Abendessen</span>
                               </label>
                           </div>
                       </div>
                       
                       <div>
                           <label className="block text-sm font-semibold mb-2 pl-1">Batch-Kochen (Tage)</label>
                           <input type="number" name="batch_days" min="1" max="7" defaultValue={household.batch_defaults?.lunch_batch_days || 1} className="input-apple bg-[hsl(var(--background))]" />
                       </div>
                       
                       <button type="submit" className="btn-primary">Einstellungen Speichern</button>
                   </form>
               </div>
            )}
        </div>
      )}
    </div>
  )
}
