import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Apple, Plus, Search } from 'lucide-react'

type FoodItem = {
  id: string
  name: string
  category: string
  kcal_100g: number
  protein_100g: number
  carbs_100g: number
  fat_100g: number
  created_by: string | null
}

const CATEGORIES = ['Obst', 'Gemüse', 'Fleisch', 'Milchprodukte', 'Getreide', 'Sonstiges'] as const
const CATEGORY_EMOJIS: Record<string, string> = {
  'Obst': '🍎',
  'Gemüse': '🥦',
  'Fleisch': '🥩',
  'Milchprodukte': '🧀',
  'Getreide': '🌾',
  'Sonstiges': '🫒',
}

export default async function FoodItemsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase.from('users').select('id, household_id').eq('auth_id', user.id).single()

  let household = null
  let isPlanner = false
  if (userData?.household_id) {
    const { data } = await supabase.from('households').select('planner_user_id').eq('id', userData.household_id).single()
    household = data
    isPlanner = household?.planner_user_id === userData?.id
  }

  const { data: foodItems } = await supabase
    .from('food_items')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  // Group by category
  const grouped = (foodItems || []).reduce((acc: Record<string, FoodItem[]>, item: FoodItem) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  async function addFoodItem(formData: FormData) {
    'use server'
    const name = formData.get('name') as string
    const category = formData.get('category') as string
    const kcal_100g = parseInt(formData.get('kcal_100g') as string) || 0
    const protein_100g = parseFloat(formData.get('protein_100g') as string) || 0
    const carbs_100g = parseFloat(formData.get('carbs_100g') as string) || 0
    const fat_100g = parseFloat(formData.get('fat_100g') as string) || 0

    if (!name || !category) {
      redirect(`/food-items?error=${encodeURIComponent('Name und Kategorie sind Pflichtfelder.')}`)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: u } = await supabase.from('users').select('id').eq('auth_id', user!.id).single()

    const { error } = await supabase.from('food_items').insert({
      name,
      category,
      kcal_100g,
      protein_100g,
      carbs_100g,
      fat_100g,
      created_by: u?.id
    })

    if (error) {
      redirect(`/food-items?error=${encodeURIComponent('Fehler beim Speichern: ' + error.message)}`)
    }

    revalidatePath('/food-items')
    redirect(`/food-items?success=${encodeURIComponent(`"${name}" wurde erfolgreich hinzugefügt!`)}`)
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">🍎 Lebensmittel-Datenbank</h1>
        <p className="text-[hsl(var(--text-muted))] mt-1 text-lg font-medium">
          Alle verfügbaren Lebensmittel mit Nährwerten pro 100g.
        </p>
      </div>

      {/* Add food item form (planner only) */}
      {isPlanner && (
        <div className="card-apple bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--input-bg))]">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
            <Plus className="text-[hsl(var(--primary))]" size={22} /> Neues Lebensmittel hinzufügen
          </h2>
          <p className="text-[hsl(var(--text-muted))] font-medium mb-6">
            Nur der Planner des Haushalts kann neue Lebensmittel anlegen.
          </p>
          <form action={addFoodItem} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Name *</label>
                <input name="name" className="input-apple bg-[hsl(var(--background))]" type="text" placeholder="z.B. Hähnchenbrust" required />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Kategorie *</label>
                <select name="category" className="input-apple bg-[hsl(var(--background))] appearance-none" required>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{CATEGORY_EMOJIS[c]} {c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">kcal / 100g</label>
                <input name="kcal_100g" className="input-apple bg-[hsl(var(--background))]" type="number" min="0" placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Protein / 100g</label>
                <input name="protein_100g" className="input-apple bg-[hsl(var(--background))]" type="number" min="0" step="0.1" placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Carbs / 100g</label>
                <input name="carbs_100g" className="input-apple bg-[hsl(var(--background))]" type="number" min="0" step="0.1" placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Fett / 100g</label>
                <input name="fat_100g" className="input-apple bg-[hsl(var(--background))]" type="number" min="0" step="0.1" placeholder="0" />
              </div>
            </div>

            <div className="pt-4 border-t border-[hsl(var(--border))]">
              <button type="submit" className="btn-primary px-8">Lebensmittel Speichern</button>
            </div>
          </form>
        </div>
      )}

      {!isPlanner && userData?.household_id && (
        <div className="card-apple bg-[hsl(var(--input-bg))] border-none">
          <p className="font-semibold text-[hsl(var(--text-muted))]">💡 Nur der Planner deines Haushalts kann neue Lebensmittel hinzufügen.</p>
        </div>
      )}

      {!userData?.household_id && (
        <div className="card-apple bg-[hsl(var(--input-bg))] border-none">
          <p className="font-semibold text-[hsl(var(--text-muted))]">💡 Trete einem Haushalt bei, um Lebensmittel hinzufügen zu können.</p>
        </div>
      )}

      {/* Food items grouped by category */}
      <div className="space-y-6">
        {CATEGORIES.map(cat => {
          const items = grouped[cat]
          if (!items || items.length === 0) return null

          return (
            <div key={cat} className="card-apple">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">{CATEGORY_EMOJIS[cat]}</span> {cat}
                <span className="text-xs font-bold text-[hsl(var(--text-muted))] bg-[hsl(var(--input-bg))] px-2.5 py-1 rounded-lg ml-2">
                  {items.length}
                </span>
              </h3>
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[hsl(var(--text-muted))] font-semibold border-b border-[hsl(var(--border))]">
                      <th className="pb-3 pl-2">Name</th>
                      <th className="pb-3 text-right pr-3">kcal</th>
                      <th className="pb-3 text-right pr-3">Protein</th>
                      <th className="pb-3 text-right pr-3">Carbs</th>
                      <th className="pb-3 text-right pr-2">Fett</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: FoodItem) => (
                      <tr key={item.id} className="border-b border-[hsl(var(--border))]/50 last:border-0 hover:bg-[hsl(var(--input-bg))] transition-colors">
                        <td className="py-3 pl-2 font-semibold">{item.name}</td>
                        <td className="py-3 text-right pr-3">
                          <span className="inline-block bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] font-bold px-2 py-0.5 rounded-md text-xs">
                            {item.kcal_100g}
                          </span>
                        </td>
                        <td className="py-3 text-right pr-3 font-medium text-blue-500">{item.protein_100g}g</td>
                        <td className="py-3 text-right pr-3 font-medium text-amber-500">{item.carbs_100g}g</td>
                        <td className="py-3 text-right pr-2 font-medium text-rose-500">{item.fat_100g}g</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>

      {(!foodItems || foodItems.length === 0) && (
        <div className="card-apple text-center p-12 py-20 border-dashed">
          <p className="text-lg font-bold text-[hsl(var(--text-muted))] mb-2">Noch keine Lebensmittel vorhanden</p>
          <p className="font-medium text-[hsl(var(--text-muted))]">Der Planner kann neue Lebensmittel hinzufügen.</p>
        </div>
      )}
    </div>
  )
}
