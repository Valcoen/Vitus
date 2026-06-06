import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export default async function ShoppingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userData } = await supabase.from('users').select('household_id').eq('auth_id', user.id).single()
  
  if (!userData?.household_id) {
    return (
      <div className="space-y-8 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <span className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center text-white text-lg shadow-lg shadow-emerald-500/20">🛒</span>
            Einkaufsliste
          </h1>
          <p className="text-[hsl(var(--text-muted))] mt-2 text-base font-medium">Alle Zutaten aus deinem Ernährungsplan auf einen Blick.</p>
        </div>
        <div className="card-apple text-center py-12">
          <span className="text-4xl mb-3 block">🏠</span>
          <p className="text-[hsl(var(--text-muted))] font-semibold">Bitte trete zuerst einem Haushalt bei, um eine Einkaufsliste zu sehen.</p>
          <a href="/household" className="btn-primary mt-4 inline-flex px-6">Zum Haushalt →</a>
        </div>
      </div>
    )
  }

  // Fetch shopping items
  const { data: items } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('household_id', userData.household_id)
    .order('name', { ascending: true })

  // Fetch food items to get categories for each shopping item
  const itemNames = (items || []).map(i => i.name)
  let foodItemsMap: Record<string, { kategorie: string }> = {}
  if (itemNames.length > 0) {
    const { data: foodItems } = await supabase
      .from('food_items')
      .select('name, kategorie')
      .in('name', itemNames)
    
    for (const fi of (foodItems || [])) {
      foodItemsMap[fi.name] = { kategorie: fi.kategorie || '' }
    }
  }

  // Fetch current meal plan recipes to show which recipes need which items
  const { data: meals } = await supabase
    .from('meals')
    .select('name, recipe_id, recipes(title, ingredients)')
    .eq('household_id', userData.household_id)

  // Build a map: ingredient name -> list of recipe names that use it
  const ingredientRecipeMap: Record<string, Set<string>> = {}
  for (const meal of (meals || [])) {
    const recipe = (meal as any).recipes
    if (!recipe?.ingredients) continue
    const recipeName = recipe.title || meal.name || 'Unbekannt'
    
    if (Array.isArray(recipe.ingredients)) {
      // Array format: [{food_item_id, amount, unit}]
      // We need food_item names for these IDs
      const foodItemIds = recipe.ingredients.map((ing: any) => ing.food_item_id).filter(Boolean)
      if (foodItemIds.length > 0) {
        const { data: foodNames } = await supabase
          .from('food_items')
          .select('id, name')
          .in('id', foodItemIds)
        
        for (const fn of (foodNames || [])) {
          if (!ingredientRecipeMap[fn.name]) ingredientRecipeMap[fn.name] = new Set()
          ingredientRecipeMap[fn.name].add(recipeName)
        }
      }
    } else if (typeof recipe.ingredients === 'object') {
      // Object format: {name: amount}
      for (const name of Object.keys(recipe.ingredients)) {
        if (!ingredientRecipeMap[name]) ingredientRecipeMap[name] = new Set()
        ingredientRecipeMap[name].add(recipeName)
      }
    }
  }

  // Serialize recipe map (Set -> string[])
  const ingredientRecipes: Record<string, string[]> = {}
  for (const [name, recipes] of Object.entries(ingredientRecipeMap)) {
    ingredientRecipes[name] = Array.from(recipes)
  }

  // Category emoji mapping
  const categoryEmojis: Record<string, string> = {
    'obst': '🍎',
    'gemüse': '🥦',
    'fleisch': '🥩',
    'fisch': '🐟',
    'milchprodukte': '🧀',
    'getreide': '🌾',
    'hülsenfrüchte': '🫘',
    'nüsse': '🥜',
    'gewürze': '🧂',
    'öle': '🫒',
    'backwaren': '🍞',
    'getränke': '🥤',
    'süßwaren': '🍫',
    'tiefkühl': '🧊',
    'konserven': '🥫',
    'sonstiges': '📦',
  }

  // Group items by category
  interface ShoppingItemWithMeta {
    id: string
    name: string
    amount: string | null
    checked: boolean
    kategorie: string
    recipes: string[]
  }

  const enrichedItems: ShoppingItemWithMeta[] = (items || []).map(item => ({
    id: item.id,
    name: item.name,
    amount: item.amount,
    checked: !!item.checked,
    kategorie: foodItemsMap[item.name]?.kategorie || 'Sonstiges',
    recipes: ingredientRecipes[item.name] || [],
  }))

  // Group by category
  const groupedItems: Record<string, ShoppingItemWithMeta[]> = {}
  for (const item of enrichedItems) {
    const cat = item.kategorie || 'Sonstiges'
    if (!groupedItems[cat]) groupedItems[cat] = []
    groupedItems[cat].push(item)
  }

  // Sort categories alphabetically, but put "Sonstiges" last
  const sortedCategories = Object.keys(groupedItems).sort((a, b) => {
    if (a === 'Sonstiges') return 1
    if (b === 'Sonstiges') return -1
    return a.localeCompare(b)
  })

  // Stats
  const totalItems = enrichedItems.length
  const checkedItems = enrichedItems.filter(i => i.checked).length
  const uncheckedItems = totalItems - checkedItems
  const progressPercent = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0

  // Server actions
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

  async function clearAllItems() {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: u } = await supabase.from('users').select('household_id').eq('auth_id', user!.id).single()
    if (u?.household_id) {
      await supabase.from('shopping_lists').delete().eq('household_id', u.household_id)
      revalidatePath('/shopping')
    }
  }

  async function regenerateFromMealPlan() {
    'use server'
    // Redirect to meal plan to regenerate
    redirect('/meal-plan')
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <span className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center text-white text-lg shadow-lg shadow-emerald-500/20">🛒</span>
          Einkaufsliste
        </h1>
        <p className="text-[hsl(var(--text-muted))] mt-2 text-base font-medium">
          Alle Zutaten aus deinem Ernährungsplan, gruppiert nach Kategorie.
        </p>
      </div>

      {totalItems === 0 ? (
        /* Empty State */
        <div className="card-apple text-center py-16 border-dashed">
          <span className="text-5xl mb-4 block">🛒</span>
          <p className="text-lg font-bold text-[hsl(var(--text-muted))] mb-2">Deine Einkaufsliste ist leer</p>
          <p className="text-sm font-medium text-[hsl(var(--text-muted))] mb-6">Generiere einen Ernährungsplan, um automatisch eine Einkaufsliste zu erstellen.</p>
          <a href="/meal-plan" className="btn-primary inline-flex px-8 gap-2">
            🥗 Zum Ernährungsplan
          </a>
        </div>
      ) : (
        <>
          {/* Progress Card */}
          <div className="card-apple">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📊</span>
                <div>
                  <p className="text-sm font-bold text-[hsl(var(--text-muted))]">Fortschritt</p>
                  <p className="text-lg font-black">{checkedItems} <span className="text-sm font-semibold text-[hsl(var(--text-muted))]">von {totalItems} erledigt</span></p>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-2xl font-black ${progressPercent === 100 ? 'text-emerald-500' : 'text-[hsl(var(--primary))]'}`}>
                  {progressPercent}%
                </span>
              </div>
            </div>
            {/* Progress Bar */}
            <div className="w-full h-2.5 bg-[hsl(var(--input-bg))] rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${progressPercent === 100 ? 'bg-emerald-500' : 'bg-[hsl(var(--primary))]'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {uncheckedItems > 0 && (
              <p className="text-xs font-medium text-[hsl(var(--text-muted))] mt-2">
                Noch {uncheckedItems} {uncheckedItems === 1 ? 'Artikel' : 'Artikel'} offen
              </p>
            )}
          </div>

          {/* Category Groups */}
          <div className="space-y-4">
            {sortedCategories.map(category => {
              const categoryItems = groupedItems[category]
              const catLower = category.toLowerCase()
              const emoji = categoryEmojis[catLower] || '📦'
              const checkedInCategory = categoryItems.filter(i => i.checked).length
              const allChecked = checkedInCategory === categoryItems.length

              return (
                <div key={category} className={`card-apple transition-opacity ${allChecked ? 'opacity-60' : ''}`}>
                  {/* Category Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{emoji}</span>
                      <h3 className="font-bold text-base">{category}</h3>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[hsl(var(--input-bg))] text-[hsl(var(--text-muted))]">
                        {categoryItems.length}
                      </span>
                    </div>
                    {allChecked && (
                      <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                        ✓ Alles erledigt
                      </span>
                    )}
                  </div>

                  {/* Items */}
                  <ul className="space-y-2">
                    {categoryItems.map(item => (
                      <li key={item.id} className={`group flex items-start gap-3 p-3 rounded-xl transition-all ${
                        item.checked 
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/10' 
                          : 'bg-[hsl(var(--background))] hover:bg-[hsl(var(--input-bg))]'
                      }`}>
                        {/* Checkbox */}
                        <form action={toggleItem.bind(null, item.id, item.checked)} className="shrink-0 mt-0.5">
                          <button type="submit" className="block">
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                              item.checked
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'border-[hsl(var(--text-muted))]/30 hover:border-[hsl(var(--primary))]'
                            }`}>
                              {item.checked && (
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                          </button>
                        </form>

                        {/* Item Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className={`font-semibold text-sm ${item.checked ? 'line-through text-[hsl(var(--text-muted))]' : ''}`}>
                              {item.name}
                            </span>
                            {item.amount && (
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                                item.checked 
                                  ? 'bg-[hsl(var(--input-bg))] text-[hsl(var(--text-muted))]' 
                                  : 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                              }`}>
                                {item.amount}
                              </span>
                            )}
                          </div>
                          {/* Recipe tags */}
                          {item.recipes.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {item.recipes.slice(0, 3).map((recipe, idx) => (
                                <span key={idx} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[hsl(var(--input-bg))] text-[hsl(var(--text-muted))]">
                                  🍽️ {recipe}
                                </span>
                              ))}
                              {item.recipes.length > 3 && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[hsl(var(--input-bg))] text-[hsl(var(--text-muted))]">
                                  +{item.recipes.length - 3} mehr
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            {checkedItems > 0 && (
              <form action={clearCheckedItems}>
                <button type="submit" className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 px-5 py-2.5 rounded-xl transition-colors w-full sm:w-auto justify-center">
                  ✓ Erledigte löschen ({checkedItems})
                </button>
              </form>
            )}
            <form action={clearAllItems}>
              <button type="submit" className="flex items-center gap-2 text-sm font-semibold text-red-500 border border-red-200 dark:border-red-800/40 hover:bg-red-50 dark:hover:bg-red-950/20 px-5 py-2.5 rounded-xl transition-colors w-full sm:w-auto justify-center">
                🗑️ Gesamte Liste leeren
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
