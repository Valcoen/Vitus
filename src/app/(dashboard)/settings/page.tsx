import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userData } = await supabase.from('users').select('id, theme').eq('auth_id', user.id).single()

  async function updateTheme(formData: FormData) {
    'use server'
    const newTheme = formData.get('theme') as string
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('users').update({ theme: newTheme }).eq('auth_id', user!.id)
    revalidatePath('/', 'layout') // Revalidate global layout
  }

  async function deleteAccount() {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 1. Lösche den Benutzer aus der public.users Tabelle
    await supabase.from('users').delete().eq('auth_id', user.id)
    
    // 2. Lösche den Benutzer aus der auth.users Tabelle über RPC
    await supabase.rpc('delete_user')
    
    // 3. Melde den Benutzer ab, um Session/Cookies zu löschen
    await supabase.auth.signOut()
    
    // 4. Weiterleitung zum Login
    redirect('/login')
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">⚙️ Einstellungen</h1>
        <p className="text-[hsl(var(--text-muted))] mt-1 text-lg font-medium">Passe das Erscheinungsbild der App an.</p>
      </div>

      <div className="card-apple">
         <h2 className="text-xl font-bold mb-4">Erscheinungsbild</h2>
         <form action={updateTheme} className="space-y-4">
             <div className="flex gap-4">
                 <label className="flex items-center gap-2 font-medium cursor-pointer">
                    <input type="radio" name="theme" value="Hell" defaultChecked={userData?.theme === 'Hell' || !userData?.theme} className="w-4 h-4 text-[hsl(var(--primary))]" /> Hell
                 </label>
                 <label className="flex items-center gap-2 font-medium cursor-pointer">
                    <input type="radio" name="theme" value="Dunkel" defaultChecked={userData?.theme === 'Dunkel'} className="w-4 h-4 text-[hsl(var(--primary))]" /> Dunkel
                 </label>
             </div>
             <button type="submit" className="btn-secondary mt-4">Design Speichern</button>
         </form>
      </div>

      <div className="card-apple border-red-500/20 bg-red-50/50 dark:bg-red-950/10">
         <h2 className="text-xl font-bold mb-4 text-red-600 dark:text-red-400">🗑️ Account löschen</h2>
         <p className="text-sm font-medium mb-4 text-red-600/80 dark:text-red-400/80">Wenn du deinen Account löschst, werden alle deine Daten unwiderruflich entfernt.</p>
         <form action={deleteAccount}>
             <button type="submit" className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl">Account endgültig löschen</button>
         </form>
      </div>
    </div>
  )
}
