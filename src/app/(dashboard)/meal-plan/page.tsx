import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Sparkles, Info } from 'lucide-react'
import { scaleRecipeToTarget, computeTotalCookingAmounts } from '@/utils/macroScaler'
import type { FoodItem, ScaledResult } from '@/utils/macroScaler'
import { generateMealPlan } from '@/utils/mealPlanEngine'
import type { HouseholdMember, MealPlanOptions } from '@/utils/mealPlanEngine'
import MealPlanCalendar from '@/components/MealPlanCalendar'
import type { CalendarDay, CalendarMeal, PersonPortion, CookingTotal } from '@/components/MealPlanCalendar'

export default async function MealPlanPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: userData } = await supabase.from('users').select('id, household_id, auth_id').eq('auth_id', user.id).single()
    let household = null;
    if (userData?.household_id) {
        const { data } = await supabase.from('households').select('*').eq('id', userData.household_id).single()
        household = data;
    }
    const isPlanner = household?.planner_user_id === userData?.id

    // Fetch all household members
    let householdMembers: { id: string; name: string }[] = []
    if (userData?.household_id) {
        const { data: members } = await supabase
            .from('users')
            .select('id, name')
            .eq('household_id', userData.household_id)
        householdMembers = members || []
    }
    const membersMap = Object.fromEntries(householdMembers.map(m => [m.id, m]))

    // Fetch meals with recipes AND meal_portions
    const { data: meals } = userData?.household_id ? await supabase.from('meals')
        .select(`*, recipes(title, id, ingredients)`)
        .eq('household_id', userData.household_id)
        .order('day_index', { ascending: true }) : { data: [] }

    // Fetch all meal_portions for these meals
    const mealIds = (meals || []).map((m: any) => m.id)
    let portionsMap: Record<string, { user_id: string; target_kcal: number }[]> = {}
    if (mealIds.length > 0) {
        const { data: portions } = await supabase
            .from('meal_portions')
            .select('meal_id, user_id, target_kcal, target_protein, target_carbs, target_fat')
            .in('meal_id', mealIds)

        for (const p of (portions || [])) {
            if (!portionsMap[p.meal_id]) portionsMap[p.meal_id] = []
            portionsMap[p.meal_id].push(p)
        }
    }

    async function generatePlan(formData: FormData) {
        'use server'
        const days = parseInt(formData.get('days') as string) || 7
        const mealSlots = formData.getAll('meal_slots') as string[]
        const activeMealSlots = mealSlots.length > 0 ? mealSlots : ['Frühstück', 'Mittagessen', 'Abendessen']

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const { data: u } = await supabase.from('users').select('id, auth_id, household_id').eq('auth_id', user!.id).single()

        if (u?.household_id) {
            // Fetch household for batch settings
            const { data: hData } = await supabase.from('households').select('*').eq('id', u.household_id).single()
            const batchDays = hData?.batch_defaults?.lunch_batch_days || 1

            // Fetch all members with full data
            const { data: membersData } = await supabase.from('users')
                .select('id, name, weight, height, goal, food_preferences, kfa, birthday, gender, activity_frequency, activity_type')
                .eq('household_id', u.household_id)

            const members: HouseholdMember[] = (membersData || []).map(m => ({
                id: m.id,
                name: m.name,
                weight: m.weight,
                height: m.height,
                birthday: m.birthday,
                gender: m.gender,
                goal: m.goal,
                activity_frequency: m.activity_frequency,
                activity_type: m.activity_type,
                food_preferences: m.food_preferences || null,
            }))

            const options: MealPlanOptions = {
                days,
                mealSlots: activeMealSlots,
                batchLunchDays: batchDays,
            }

            const result = await generateMealPlan(supabase, u.household_id, members, options)

            if (result.success) {
                revalidatePath('/meal-plan')
                redirect(`/meal-plan?success=${encodeURIComponent(`Wochenplan erstellt: ${result.mealsCreated} Mahlzeiten, ${result.shoppingItems} Einkaufsartikel.`)}`)
            } else {
                redirect(`/meal-plan?error=${encodeURIComponent(result.error)}`)
            }
        }
    }

    async function clearMeals() {
        'use server'
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const { data: u } = await supabase.from('users').select('household_id').eq('auth_id', user!.id).single()
        if (u?.household_id) {
            // Also clear portions for these meals
            const { data: mealIds } = await supabase.from('meals').select('id').eq('household_id', u.household_id)
            if (mealIds && mealIds.length > 0) {
                await supabase.from('meal_portions').delete().in('meal_id', mealIds.map(m => m.id))
            }
            await supabase.from('meals').delete().eq('household_id', u.household_id)
            // Clear shopping list too
            await supabase.from('shopping_lists').delete().eq('household_id', u.household_id)
            revalidatePath('/meal-plan')
            redirect(`/meal-plan?success=${encodeURIComponent('Ernährungsplan und Einkaufsliste wurden geleert.')}`)
        }
    }

    async function refreshPlan() {
        'use server'
        revalidatePath('/meal-plan')
        redirect('/meal-plan')
    }

    // Fetch food items for macro calculation
    // Ingredients can be in two formats:
    //   Object format: { "Honig": 40, "Haferflocken": 100 } (name → grams)
    //   Array format:  [{ food_item_id: "uuid", amount: 100 }]
    const allIngredientNames = new Set<string>()
    const allFoodItemIds = new Set<string>()
    ;(meals || []).forEach((meal: any) => {
        if (!meal.recipes?.ingredients) return
        if (Array.isArray(meal.recipes.ingredients)) {
            for (const ing of meal.recipes.ingredients) {
                if (ing.food_item_id) allFoodItemIds.add(ing.food_item_id)
            }
        } else if (typeof meal.recipes.ingredients === 'object') {
            Object.keys(meal.recipes.ingredients).forEach(name => allIngredientNames.add(name))
        }
    })

    let foodItemsMap: Record<string, FoodItem> = {}
    let foodItemsById: Record<string, FoodItem> = {}

    if (allIngredientNames.size > 0) {
        const { data: foodItems } = await supabase
            .from('food_items')
            .select('id, name, kcal_100g, protein_100g, carbs_100g, fat_100g')
            .in('name', Array.from(allIngredientNames))
        
        for (const fi of (foodItems || [])) {
            foodItemsMap[fi.name] = fi
            foodItemsById[fi.id] = fi
        }
    }

    if (allFoodItemIds.size > 0) {
        const { data: foodItems } = await supabase
            .from('food_items')
            .select('id, name, kcal_100g, protein_100g, carbs_100g, fat_100g')
            .in('id', Array.from(allFoodItemIds))
        
        for (const fi of (foodItems || [])) {
            foodItemsMap[fi.name] = fi
            foodItemsById[fi.id] = fi
        }
    }

    // ─── Build Calendar Data ──────────────────────────────────────────
    // Compute real dates from week_start + day_index
    const dayNamesLong = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
    const dayNamesShort = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
    const todayStr = new Date().toISOString().split('T')[0]

    // Find the week_start from any meal (all meals in a plan share the same week_start)
    const weekStart = (meals && meals.length > 0) ? (meals[0] as any).week_start : null

    // Determine which day indices exist
    const allDayIndices = new Set<number>()
    ;(meals || []).forEach((meal: any) => {
        if (meal.day_index !== null && meal.day_index !== undefined) {
            allDayIndices.add(meal.day_index)
        }
    })

    // Collect unique meal slots from data
    const detectedMealSlots = new Set<string>()
    ;(meals || []).forEach((meal: any) => {
        if (meal.meal_type) detectedMealSlots.add(meal.meal_type)
    })
    const orderedMealSlots = ['Frühstück', 'Mittagessen', 'Abendessen', 'Snacks'].filter(s => detectedMealSlots.has(s))

    // Group meals by day_index
    const mealsByDayIndex: Record<number, any[]> = {}
    ;(meals || []).forEach((meal: any) => {
        const idx = meal.day_index ?? -1
        if (!mealsByDayIndex[idx]) mealsByDayIndex[idx] = []
        mealsByDayIndex[idx].push(meal)
    })

    // Build CalendarDay array
    const calendarDays: CalendarDay[] = []
    const sortedDayIndices = Array.from(allDayIndices).sort((a, b) => a - b)

    for (const dayIdx of sortedDayIndices) {
        // Compute the actual date
        let dateObj: Date
        if (weekStart) {
            dateObj = new Date(weekStart)
            dateObj.setDate(dateObj.getDate() + dayIdx)
        } else {
            dateObj = new Date()
            dateObj.setDate(dateObj.getDate() + dayIdx)
        }

        const isoDate = dateObj.toISOString().split('T')[0]
        const dayOfWeek = dateObj.getDay()
        const dd = String(dateObj.getDate()).padStart(2, '0')
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0')

        // Build CalendarMeal objects for this day
        const dayMeals = mealsByDayIndex[dayIdx] || []
        const calendarMeals: CalendarMeal[] = dayMeals.map((meal: any) => {
            // Build Record<name, grams> for macroScaler - handle both ingredient formats
            let recipeIngredients: Record<string, number> = {}
            if (meal.recipes?.ingredients) {
                if (Array.isArray(meal.recipes.ingredients)) {
                    // Array format: [{food_item_id, amount}] → convert to {name: grams}
                    for (const ing of meal.recipes.ingredients) {
                        const food = foodItemsById[ing.food_item_id]
                        if (food && typeof ing.amount === 'number') {
                            recipeIngredients[food.name] = (recipeIngredients[food.name] || 0) + ing.amount
                        }
                    }
                } else if (typeof meal.recipes.ingredients === 'object') {
                    // Object format: already {name: grams}
                    recipeIngredients = meal.recipes.ingredients as Record<string, number>
                }
            }

            const portions = portionsMap[meal.id] || []

            // Compute scaled results per person
            const personScaled: { userId: string; name: string; result: ScaledResult; targetKcal: number; isCurrentUser: boolean }[] = []
            for (const p of portions) {
                const member = membersMap[p.user_id]
                if (!member) continue
                const result = scaleRecipeToTarget(recipeIngredients, foodItemsMap, p.target_kcal)
                personScaled.push({
                    userId: p.user_id,
                    name: member.name,
                    result,
                    targetKcal: p.target_kcal,
                    isCurrentUser: p.user_id === userData?.id,
                })
            }

            // Sort: current user first
            personScaled.sort((a, b) => {
                if (a.isCurrentUser && !b.isCurrentUser) return -1
                if (!a.isCurrentUser && b.isCurrentUser) return 1
                return a.name.localeCompare(b.name)
            })

            // Compute cooking totals for shared meals
            const cookingTotals = meal.is_shared
                ? computeTotalCookingAmounts(personScaled.map(p => p.result))
                : []
            const cookingTotalKcal = personScaled.reduce((sum, p) => sum + p.result.totalKcal, 0)

            let kcalQuery = ''
            if (meal.is_shared && cookingTotalKcal > 0) {
                kcalQuery = `?kcal=${cookingTotalKcal}`
            } else if (!meal.is_shared && personScaled.length > 0 && personScaled[0].isCurrentUser) {
                kcalQuery = `?kcal=${personScaled[0].targetKcal}`
            }

            // Serialize person portions
            const persons: PersonPortion[] = personScaled.map(p => ({
                userId: p.userId,
                name: p.name,
                isCurrentUser: p.isCurrentUser,
                targetKcal: p.targetKcal,
                totalGrams: p.result.totalGrams,
                totalKcal: p.result.totalKcal,
                totalProtein: p.result.totalProtein,
                totalCarbs: p.result.totalCarbs,
                totalFat: p.result.totalFat,
                ingredients: p.result.ingredients.map(ing => ({
                    name: ing.name,
                    displayAmount: ing.displayAmount,
                    displayUnit: ing.displayUnit,
                })),
            }))

            // Serialize cooking totals
            const serializedCookingTotals: CookingTotal[] = cookingTotals.map(ct => ({
                name: ct.name,
                totalGrams: ct.totalGrams,
                displayUnit: ct.displayUnit,
            }))

            return {
                id: meal.id,
                name: meal.name || 'Unbekanntes Rezept',
                mealType: meal.meal_type || 'Custom',
                recipeId: meal.recipe_id || null,
                recipeTitle: meal.recipes?.title || null,
                isShared: meal.is_shared || false,
                batchGroupId: meal.batch_group_id || null,
                calories: meal.calories || null,
                persons,
                cookingTotals: serializedCookingTotals,
                cookingTotalKcal,
                kcalQuery,
            } satisfies CalendarMeal
        })

        calendarDays.push({
            date: isoDate,
            dayName: dayNamesLong[dayOfWeek],
            dayShort: dayNamesShort[dayOfWeek],
            dateFormatted: `${dd}.${mm}.`,
            isToday: isoDate === todayStr,
            meals: calendarMeals,
        })
    }

    // Get user's meal schedule from preferences for default checkboxes
    let userMealSchedule = ['Frühstück', 'Mittagessen', 'Abendessen']
    if (userData?.id) {
        const { data: fullUser } = await supabase.from('users').select('food_preferences').eq('id', userData.id).single()
        if (fullUser?.food_preferences?.meal_schedule) {
            userMealSchedule = fullUser.food_preferences.meal_schedule
        }
    }

    return (
        <div className="space-y-8 max-w-6xl">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">🥗 Ernährungsplan</h1>
                <p className="text-[hsl(var(--text-muted))] mt-1 text-lg font-medium">Dein automatisch erstellter Wochenplan basierend auf den Profilen deines Haushalts.</p>
            </div>

            {!household ? (
                <div className="card-apple">
                    <p className="text-[hsl(var(--text-muted))] font-medium">Bitte trete zuerst einem Haushalt bei (unter Haushalt &amp; WG).</p>
                </div>
            ) : (
                <>
                    {isPlanner ? (
                        <div className="card-apple bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--input-bg))]">
                            <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><Sparkles className="text-[hsl(var(--primary))]" size={22} /> Wochenplan generieren</h2>
                            <p className="text-[hsl(var(--text-muted))] font-medium mb-6">Erstellt automatisch Essenspläne für alle Haushaltsmitglieder basierend auf deren Biometrie, Zielen und Präferenzen.</p>
                            <form action={generatePlan} className="space-y-4">
                                <div className="flex flex-col sm:flex-row gap-4">
                                    <select name="days" className="input-apple bg-[hsl(var(--background))] sm:w-48 appearance-none" defaultValue="7">
                                        <option value="1">1 Tag</option>
                                        <option value="2">2 Tage</option>
                                        <option value="3">3 Tage</option>
                                        <option value="4">4 Tage</option>
                                        <option value="5">5 Tage</option>
                                        <option value="6">6 Tage</option>
                                        <option value="7">7 Tage</option>
                                    </select>
                                    <button type="submit" className="btn-primary whitespace-nowrap shadow-md hover:scale-[1.02] transition-transform sm:w-auto px-8">Wochenplan generieren</button>
                                </div>
                                <div className="pt-2">
                                    <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Mahlzeiten-Slots für diesen Plan</label>
                                    <div className="flex flex-wrap gap-2">
                                        {["Frühstück", "Mittagessen", "Abendessen", "Snacks"].map(slot => (
                                            <label key={slot} className="flex items-center gap-1.5 cursor-pointer text-sm font-medium bg-[hsl(var(--background))] px-3 py-1.5 rounded-lg border border-[hsl(var(--border))]">
                                                <input
                                                    type="checkbox"
                                                    name="meal_slots"
                                                    value={slot}
                                                    defaultChecked={userMealSchedule.includes(slot)}
                                                    className="w-4 h-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]"
                                                />
                                                {slot}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </form>
                            
                            <div className="flex flex-col sm:flex-row gap-3 mt-6 pt-5 border-t border-[hsl(var(--border))]/50">
                                <form action={refreshPlan}>
                                    <button type="submit" className="text-sm font-semibold bg-[hsl(var(--background))] border border-[hsl(var(--border))] hover:bg-[hsl(var(--input-bg))] px-4 py-2 rounded-xl transition-colors shadow-sm">
                                        🔄 Seite neu laden
                                    </button>
                                </form>
                                <form action={clearMeals}>
                                    <button type="submit" className="text-sm font-semibold text-red-500 border border-red-500/20 hover:bg-red-500/10 px-4 py-2 rounded-xl transition-colors shadow-sm">
                                        🗑️ Aktuellen Plan löschen
                                    </button>
                                </form>
                            </div>
                            
                            <p className="text-xs font-semibold text-[hsl(var(--text-muted))] mt-4 flex items-center gap-1.5"><Info size={14} /> Plan wird automatisch aus deinen Rezepten und Haushaltsprofilen erstellt.</p>
                        </div>
                    ) : (
                        <div className="card-apple bg-[hsl(var(--input-bg))] border-none flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                            <p className="font-semibold text-[hsl(var(--text-muted))]">💡 Nur der Planner deines Haushalts kann den gesamten Wochenplan generieren oder löschen.</p>
                            <form action={refreshPlan}>
                                <button type="submit" className="text-sm font-semibold bg-[hsl(var(--background))] border border-[hsl(var(--border))] hover:bg-[hsl(var(--input-bg))] px-4 py-2 rounded-xl transition-colors shadow-sm">
                                    🔄 Seite neu laden
                                </button>
                            </form>
                        </div>
                    )}

                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold">📆 Wochenübersicht</h2>
                        </div>

                        {calendarDays.length === 0 ? (
                            <div className="card-apple text-center p-12 py-20 border-dashed">
                                <p className="text-lg font-bold text-[hsl(var(--text-muted))] mb-2">Noch keine Mahlzeiten geplant</p>
                                {isPlanner && <p className="font-medium text-[hsl(var(--text-muted))]">Klicke oben auf &quot;Wochenplan generieren&quot;, um anzufangen.</p>}
                            </div>
                        ) : (
                            <MealPlanCalendar
                                days={calendarDays}
                                mealSlots={orderedMealSlots}
                                householdMemberCount={householdMembers.length}
                            />
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
