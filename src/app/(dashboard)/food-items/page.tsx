import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Plus } from 'lucide-react'
import { getActor } from '@/lib/actor'
import { can } from '@/lib/permissions'
import { cleanText } from '@/lib/recipe/validate'
import { loadAllFoods, loadTaxonomy, invalidateFoods } from '@/lib/food/server'
import FoodBrowser from '@/components/FoodBrowser'

// legacy column `category` only allows these values
const LEGACY: Record<string, string> = {
  gemuese: 'Gemüse', kartoffeln: 'Gemüse', huelsenfruechte: 'Gemüse', obst: 'Obst', fleisch: 'Fleisch', wurst: 'Fleisch',
  fisch: 'Fleisch', milch: 'Milchprodukte', kaese: 'Milchprodukte', eier: 'Milchprodukte', brot: 'Getreide',
  getreide: 'Getreide', mehl: 'Getreide',
}

const num = (v: FormDataEntryValue | null, max: number) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null
}

export default async function FoodItemsPage() {
  const { actor, supabase } = await getActor()
  if (!actor) redirect('/login')
  const [foods, tax] = await Promise.all([loadAllFoods(supabase), loadTaxonomy(supabase)])
  const { data: household } = actor.householdId
    ? await supabase.from('households').select('planner_user_id').eq('id', actor.householdId).maybeSingle()
    : { data: null }
  const isPlanner = household?.planner_user_id === actor.userId

  async function addFoodItem(formData: FormData) {
    'use server'
    const { actor, supabase } = await getActor()
    if (!can(actor, 'food_item.edit')) redirect(`/food-items?error=${encodeURIComponent('Keine Berechtigung.')}`)
    const name = cleanText(formData.get('name'), 120)
    const aisle = String(formData.get('food_category') ?? '')
    if (!name || !/^[a-z-]{2,40}$/.test(aisle)) redirect(`/food-items?error=${encodeURIComponent('Name und Kategorie sind Pflichtfelder.')}`)
    const piece = num(formData.get('piece_grams'), 5000)
    const diet = String(formData.get('diet') ?? '')
    const { error } = await supabase.from('food_items').insert({
      name,
      category: LEGACY[aisle] ?? 'Sonstiges',
      food_category: aisle,
      kcal_100g: Math.round(num(formData.get('kcal_100g'), 900) ?? 0),
      protein_100g: num(formData.get('protein_100g'), 100) ?? 0,
      carbs_100g: num(formData.get('carbs_100g'), 100) ?? 0,
      fat_100g: num(formData.get('fat_100g'), 100) ?? 0,
      sugar_100g: num(formData.get('sugar_100g'), 100),
      unit_grams: piece ? { Stück: piece } : {},
      is_vegetarian: diet === 'vegan' || diet === 'vegetarian' ? true : diet === 'meat' ? false : null,
      is_vegan: diet === 'vegan' ? true : diet === 'vegetarian' || diet === 'meat' ? false : null,
      source: 'vitus',
      created_by: actor!.userId,
    })
    if (error) {
      const msg = error.code === '23505' ? `„${name}“ gibt es schon.` : 'Speichern fehlgeschlagen (nur der Planer darf Lebensmittel anlegen).'
      redirect(`/food-items?error=${encodeURIComponent(msg)}`)
    }
    invalidateFoods()
    revalidatePath('/food-items')
    redirect(`/food-items?success=${encodeURIComponent(`„${name}“ hinzugefügt`)}`)
  }

  const input = 'input-apple bg-[hsl(var(--background))] min-h-12'
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Lebensmittel</h1>
        <p className="text-[hsl(var(--text-muted))] mt-1 text-lg font-medium">
          {foods.filter(f => !f.is_hidden).length.toLocaleString('de-DE')} Lebensmittel mit Nährwerten pro 100 g – die Grundlage für Rezepte und Einkaufsliste.
        </p>
      </div>

      <FoodBrowser foods={foods.map(f => ({ ...f, aliases: f.aliases ?? undefined }))} aisles={tax.foodCategories.map(c => ({ slug: c.slug, label: c.label }))} />

      {isPlanner ? (
        <details className="card-apple">
          <summary className="text-xl font-bold cursor-pointer min-h-11 flex items-center gap-2"><Plus className="text-[hsl(var(--primary))]" size={22} /> Fehlt etwas? Eigenes Lebensmittel anlegen</summary>
          <form action={addFoodItem} className="space-y-4 mt-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block"><span className="block text-sm font-semibold mb-1.5">Name *</span>
                <input name="name" className={input} required maxLength={120} placeholder="z. B. Gochujang" /></label>
              <label className="block"><span className="block text-sm font-semibold mb-1.5">Kategorie *</span>
                <select name="food_category" className={input} required defaultValue="">
                  <option value="" disabled>wählen</option>
                  {tax.foodCategories.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
                </select></label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[['kcal_100g', 'kcal'], ['protein_100g', 'Protein g'], ['carbs_100g', 'Kohlenh. g'], ['fat_100g', 'Fett g'], ['sugar_100g', 'Zucker g']].map(([n, l]) => (
                <label key={n} className="block"><span className="block text-sm font-semibold mb-1.5">{l} / 100 g</span>
                  <input name={n} className={input} inputMode="decimal" placeholder="0" /></label>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block"><span className="block text-sm font-semibold mb-1.5">Gewicht pro Stück (g, optional)</span>
                <input name="piece_grams" className={input} inputMode="decimal" placeholder="z. B. 150" /></label>
              <label className="block"><span className="block text-sm font-semibold mb-1.5">Ernährung</span>
                <select name="diet" className={input} defaultValue="">
                  <option value="">unbekannt</option><option value="vegan">vegan</option>
                  <option value="vegetarian">vegetarisch</option><option value="meat">mit Fleisch/Fisch</option>
                </select></label>
            </div>
            <button type="submit" className="btn-primary h-12 px-8">Speichern</button>
          </form>
        </details>
      ) : (
        <p className="text-sm font-semibold text-[hsl(var(--text-muted))]">Neue Lebensmittel kann der Planer eures gemeinsamen Plans anlegen.</p>
      )}
    </div>
  )
}
