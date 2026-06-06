import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { CheckSquare, Square } from 'lucide-react'

export default async function ShoppingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userData } = await supabase.from('users').select('household_id').eq('auth_id', user.id).single()
  
  if (!userData?.household_id) {
    return (
      <div className="space-y-8 max-w-4xl">
        <h1 className="text-3xl font-bold tracking-tight">🛒 Einkaufsliste</h1>
        <div className="card-apple">
          <p className="text-[hsl(var(--text-muted))]">Bitte trete zuerst einem Haushalt bei, um eine Einkaufsliste zu sehen.</p>
        </div>
      </div>
    )
  }

  const { data: items } = await supabase.from('shopping_lists').select('*').eq('household_id', userData.household_id).order('created_at', { ascending: false })

  async function toggleItem(id: string, currentState: boolean) {
    'use server'
    const supabase = await createClient()
    await supabase.from('shopping_lists').update({ checked: !currentState }).eq('id', id)
    revalidatePath('/shopping')
  }

  async function clearCheckedItems() {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: u } = await supabase.from('users').select('household_id').eq('auth_id', user!.id).single()
    if (u?.household_id) {
        await supabase.from('shopping_lists').delete().eq('household_id', u.household_id).eq('checked', true)
        revalidatePath('/shopping')
    }
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">🛒 Einkaufsliste</h1>
        <p className="text-[hsl(var(--text-muted))] mt-1 text-lg font-medium">Behalte den Überblick über deinen Einkauf.</p>
      </div>

      <div className="card-apple">
         <h2 className="text-xl font-bold mb-6">Artikel</h2>
         {items && items.length > 0 ? (
           <ul className="space-y-3">
             {items.map(item => (
                <li key={item.id} className="flex items-center gap-3 p-3 bg-[hsl(var(--input-bg))] rounded-xl">
                  <form action={toggleItem.bind(null, item.id, !!item.checked)}>
                    <button type="submit" className="text-[hsl(var(--primary))] flex items-center justify-center">
                      {item.checked ? <CheckSquare size={24} /> : <Square size={24} />}
                    </button>
                  </form>
                  <span className={`font-medium ${item.checked ? 'line-through text-[hsl(var(--text-muted))]' : 'text-[hsl(var(--text))]'}`}>
                    {item.amount && `${item.amount} `}{item.name}
                  </span>
                </li>
             ))}
           </ul>
         ) : (
           <p className="text-[hsl(var(--text-muted))]">Die Einkaufsliste ist leer.</p>
         )}

         {items && items.filter(i => i.checked).length > 0 && (
             <div className="pt-4 mt-6 border-t border-[hsl(var(--border))]">
                 <form action={clearCheckedItems}>
                    <button type="submit" className="text-red-500 font-semibold px-4 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 rounded-xl transition-colors">
                        Erledigte Artikel löschen
                    </button>
                 </form>
             </div>
         )}
      </div>
    </div>
  )
}
