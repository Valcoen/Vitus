import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export default async function ShoppingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userData } = await supabase
    .from('users')
    .select('id, household_id, weight, height, goal, food_preferences')
    .eq('auth_id', user.id)
    .single()

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

  // ─── Fetch meals with recipes for this household ───
  const { data: meals } = await supabase
    .from('meals')
    .select('id, name, meal_type, recipe_id, is_shared, recipes(id, title, ingredients, standard_servings)')
    .eq('household_id', userData.household_id)
    .order('day_index', { ascending: true })

  // ─── Fetch meal_portions for this user ───
  const mealIds = (meals || []).map((m: any) => m.id)
  let userPortions: Record<string, { target_kcal: number }> = {}
  if (mealIds.length > 0) {
    const { data: portions } = await supabase
      .from('meal_portions')
      .select('meal_id, target_kcal')
      .in('meal_id', mealIds)
      .eq('user_id', userData.id)

    for (const p of (portions || [])) {
      userPortions[p.meal_id] = { target_kcal: p.target_kcal }
    }
  }

  // ─── Collect all food item IDs from recipe ingredients ───
  const allFoodItemIds = new Set<string>()
  for (const meal of (meals || []) as any[]) {
    const recipe = meal.recipes
    if (!recipe?.ingredients) continue
    if (Array.isArray(recipe.ingredients)) {
      for (const ing of recipe.ingredients) {
        if (ing.food_item_id) allFoodItemIds.add(ing.food_item_id)
      }
    }
  }

  // ─── Fetch food items (with kategorie) ───
  let foodItemsById: Record<string, { id: string; name: string; kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number; kategorie: string }> = {}
  if (allFoodItemIds.size > 0) {
    const { data: foodItems } = await supabase
      .from('food_items')
      .select('id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, kategorie')
      .in('id', Array.from(allFoodItemIds))

    for (const fi of (foodItems || [])) {
      foodItemsById[fi.id] = { ...fi, kategorie: fi.kategorie || 'Sonstiges' }
    }
  }

  // ─── Compute individual shopping list from recipes + portions ───
  // For each meal the user has a portion for, scale the recipe ingredients
  // to that user's target_kcal, then sum all ingredients across all meals.
  interface ShoppingIngredient {
    name: string
    totalGrams: number
    kategorie: string
    recipes: Set<string>
    isPiece: boolean
    pieceCount: number
  }

  const shoppingMap: Record<string, ShoppingIngredient> = {}

  for (const meal of (meals || []) as any[]) {
    const recipe = meal.recipes
    if (!recipe?.ingredients || !Array.isArray(recipe.ingredients)) continue

    const portion = userPortions[meal.id]
    if (!portion) continue // User has no portion for this meal

    // Calculate base recipe kcal
    const servings = recipe.standard_servings || 1
    let baseRecipeKcal = 0
    for (const ing of recipe.ingredients) {
      const food = foodItemsById[ing.food_item_id]
      if (!food) continue
      baseRecipeKcal += (food.kcal_100g * ing.amount) / 100
    }
    const basePerServing = baseRecipeKcal / servings

    if (basePerServing <= 0) continue

    // Scale factor: how much of one serving does this user need?
    const scaleFactor = portion.target_kcal / basePerServing

    // Add scaled ingredients to shopping list
    for (const ing of recipe.ingredients) {
      const food = foodItemsById[ing.food_item_id]
      if (!food) continue

      const key = food.id
      const lowerName = food.name.toLowerCase()
      const isPiece = (lowerName === 'ei' || lowerName === 'eier') && ing.amount <= 20

      // For one serving, each ingredient is: ing.amount / servings
      // Scaled: (ing.amount / servings) * scaleFactor
      const scaledAmount = (ing.amount / servings) * scaleFactor
      const effectiveGrams = isPiece ? scaledAmount * 55 : scaledAmount

      if (!shoppingMap[key]) {
        shoppingMap[key] = {
          name: food.name,
          totalGrams: 0,
          kategorie: food.kategorie,
          recipes: new Set(),
          isPiece,
          pieceCount: 0,
        }
      }
      shoppingMap[key].totalGrams += effectiveGrams
      if (isPiece) {
        shoppingMap[key].pieceCount += scaledAmount
      }
      shoppingMap[key].recipes.add(recipe.title || meal.name || 'Unbekannt')
    }
  }

  // ─── Also read manually toggled checked-state from shopping_lists table ───
  const { data: existingChecks } = await supabase
    .from('shopping_lists')
    .select('name, checked')
    .eq('household_id', userData.household_id)

  const checkedMap: Record<string, boolean> = {}
  for (const item of (existingChecks || [])) {
    checkedMap[item.name] = !!item.checked
  }

  // ─── Build final shopping list ───
  interface ShoppingItem {
    id: string
    name: string
    amount: string
    kategorie: string
    recipes: string[]
    checked: boolean
  }

  const shoppingItems: ShoppingItem[] = Object.entries(shoppingMap).map(([foodId, data]) => {
    const amount = data.isPiece && data.pieceCount > 0
      ? `${Math.round(data.pieceCount * 10) / 10} Stk.`
      : `${Math.round(data.totalGrams)}g`

    return {
      id: foodId,
      name: data.name,
      amount,
      kategorie: data.kategorie,
      recipes: Array.from(data.recipes),
      checked: checkedMap[data.name] || false,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  // ─── Group by category ───
  const groupedItems: Record<string, ShoppingItem[]> = {}
  for (const item of shoppingItems) {
    const cat = item.kategorie || 'Sonstiges'
    if (!groupedItems[cat]) groupedItems[cat] = []
    groupedItems[cat].push(item)
  }

  const sortedCategories = Object.keys(groupedItems).sort((a, b) => {
    if (a === 'Sonstiges') return 1
    if (b === 'Sonstiges') return -1
    return a.localeCompare(b)
  })

  // ─── Stats ───
  const totalItems = shoppingItems.length
  const checkedItems = shoppingItems.filter(i => i.checked).length
  const uncheckedItems = totalItems - checkedItems
  const progressPercent = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0

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
    'öle & fette': '🫒',
    'backwaren': '🍞',
    'getränke': '🥤',
    'süßwaren': '🍫',
    'tiefkühl': '🧊',
    'konserven': '🥫',
    'saucen': '🫙',
    'sonstiges': '📦',
  }

  // ─── Server Actions ───
  async function toggleItem(itemName: string, currentState: boolean) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: u } = await supabase.from('users').select('household_id').eq('auth_id', user!.id).single()
    if (!u?.household_id) return

    // Check if row exists
    const { data: existing } = await supabase
      .from('shopping_lists')
      .select('id')
      .eq('household_id', u.household_id)
      .eq('name', itemName)
      .maybeSingle()

    if (existing) {
      await supabase.from('shopping_lists').update({ checked: !currentState }).eq('id', existing.id)
    } else {
      // Create a row so we can track checked state
      await supabase.from('shopping_lists').insert({
        household_id: u.household_id,
        name: itemName,
        amount: '',
        checked: !currentState,
      })
    }
    revalidatePath('/shopping')
  }

  async function uncheckAll() {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: u } = await supabase.from('users').select('household_id').eq('auth_id', user!.id).single()
    if (u?.household_id) {
      await supabase.from('shopping_lists').update({ checked: false }).eq('household_id', u.household_id)
      revalidatePath('/shopping')
    }
  }

  async function checkAll() {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: u } = await supabase.from('users').select('household_id').eq('auth_id', user!.id).single()
    if (u?.household_id) {
      // Mark all current items as checked
      await supabase.from('shopping_lists').update({ checked: true }).eq('household_id', u.household_id)
      revalidatePath('/shopping')
    }
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
          Deine individuellen Mengen basierend auf deinem Ernährungsplan.
        </p>
      </div>

      {totalItems === 0 ? (
        /* Empty State */
        <div className="card-apple text-center py-16 border-dashed">
          <span className="text-5xl mb-4 block">🛒</span>
          <p className="text-lg font-bold text-[hsl(var(--text-muted))] mb-2">Keine Zutaten gefunden</p>
          <p className="text-sm font-medium text-[hsl(var(--text-muted))] mb-6 max-w-sm mx-auto">
            Generiere einen Ernährungsplan, um automatisch deine individuelle Einkaufsliste zu berechnen.
          </p>
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
                  <p className="text-lg font-black">
                    {checkedItems} <span className="text-sm font-semibold text-[hsl(var(--text-muted))]">von {totalItems} erledigt</span>
                  </p>
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
                Noch {uncheckedItems} Artikel offen
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
                        <form action={toggleItem.bind(null, item.name, item.checked)} className="shrink-0 mt-0.5">
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
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className={`font-semibold text-sm ${item.checked ? 'line-through text-[hsl(var(--text-muted))]' : ''}`}>
                              {item.name}
                            </span>
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                              item.checked
                                ? 'bg-[hsl(var(--input-bg))] text-[hsl(var(--text-muted))]'
                                : 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                            }`}>
                              {item.amount}
                            </span>
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
            {checkedItems > 0 && checkedItems < totalItems && (
              <form action={uncheckAll}>
                <button type="submit" className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--text-muted))] border border-[hsl(var(--border))] hover:bg-[hsl(var(--input-bg))] px-5 py-2.5 rounded-xl transition-colors w-full sm:w-auto justify-center">
                  ↩️ Alle zurücksetzen
                </button>
              </form>
            )}
            {uncheckedItems > 0 && (
              <form action={checkAll}>
                <button type="submit" className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 px-5 py-2.5 rounded-xl transition-colors w-full sm:w-auto justify-center">
                  ✓ Alle abhaken
                </button>
              </form>
            )}
          </div>

          {/* Info box */}
          <div className="card-apple bg-[hsl(var(--input-bg))] border-none">
            <p className="text-xs font-semibold text-[hsl(var(--text-muted))] flex items-start gap-2">
              <span className="text-sm">💡</span>
              Die Mengen werden individuell für dich berechnet, basierend auf deinem Kalorienziel und den Rezepten in deinem Ernährungsplan.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
