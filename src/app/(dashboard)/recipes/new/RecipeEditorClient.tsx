'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, Plus, X, Flame, Drumstick, Wheat, Droplets, ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'

type FoodItem = {
  id: string
  name: string
  category: string
  kcal_100g: number
  protein_100g: number
  carbs_100g: number
  fat_100g: number
}

type SelectedIngredient = {
  food_item: FoodItem
  amount: number
}

const CATEGORY_EMOJIS: Record<string, string> = {
  'Obst': '🍎',
  'Gemüse': '🥦',
  'Fleisch': '🥩',
  'Milchprodukte': '🧀',
  'Getreide': '🌾',
  'Sonstiges': '🫒',
}

export default function RecipeEditorClient({
  allFoodItems,
  saveRecipeAction,
}: {
  allFoodItems: FoodItem[]
  saveRecipeAction: (formData: FormData) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [servings, setServings] = useState(1)
  const [ingredients, setIngredients] = useState<SelectedIngredient[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Filter food items by search query
  const filteredFoodItems = searchQuery.length > 0
    ? allFoodItems.filter(fi =>
        fi.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !ingredients.some(ing => ing.food_item.id === fi.id)
      ).slice(0, 8)
    : []

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Calculate total nutrition
  let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0
  for (const ing of ingredients) {
    const factor = ing.amount / 100
    totalKcal += ing.food_item.kcal_100g * factor
    totalProtein += ing.food_item.protein_100g * factor
    totalCarbs += ing.food_item.carbs_100g * factor
    totalFat += ing.food_item.fat_100g * factor
  }

  const addIngredient = (foodItem: FoodItem) => {
    setIngredients([...ingredients, { food_item: foodItem, amount: 100 }])
    setSearchQuery('')
    setShowDropdown(false)
  }

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index))
  }

  const updateAmount = (index: number, amount: number) => {
    const updated = [...ingredients]
    updated[index].amount = amount
    setIngredients(updated)
  }

  const handleSubmit = () => {
    const formData = new FormData()
    formData.append('title', title)
    formData.append('instructions', instructions)
    formData.append('standard_servings', servings.toString())
    formData.append('ingredients', JSON.stringify(
      ingredients.map(ing => ({
        food_item_id: ing.food_item.id,
        amount: ing.amount,
        unit: 'g'
      }))
    ))
    saveRecipeAction(formData)
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <Link href="/recipes" className="inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--text-muted))] hover:text-[hsl(var(--primary))] transition-colors">
        <ArrowLeft size={16} /> Zurück zu Rezepte
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">🍳 Neues Rezept erstellen</h1>
        <p className="text-[hsl(var(--text-muted))] mt-1 text-lg font-medium">
          Wähle Zutaten aus der Lebensmittel-Datenbank und sieh die Nährwerte live.
        </p>
      </div>

      {/* Recipe basics */}
      <div className="card-apple">
        <h2 className="text-xl font-bold mb-6">Grundlagen</h2>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Rezeptname *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="input-apple bg-[hsl(var(--background))]"
              type="text"
              placeholder="z.B. Hähnchen-Bowl mit Reis"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Für wie viele Personen? *</label>
              <input
                value={servings}
                onChange={e => setServings(Math.max(1, parseInt(e.target.value) || 1))}
                className="input-apple bg-[hsl(var(--background))]"
                type="number"
                min="1"
                max="20"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2 pl-1 text-[hsl(var(--text-muted))]">Zubereitung</label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              className="input-apple bg-[hsl(var(--background))] min-h-[120px] resize-y"
              placeholder="Schritt-für-Schritt Anleitung..."
              rows={5}
            />
          </div>
        </div>
      </div>

      {/* Ingredient search */}
      <div className="card-apple">
        <h2 className="text-xl font-bold mb-6">🧾 Zutaten</h2>

        <div ref={searchRef} className="relative mb-6">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
            <input
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value)
                setShowDropdown(true)
              }}
              onFocus={() => setShowDropdown(true)}
              className="input-apple bg-[hsl(var(--background))] pl-11"
              type="text"
              placeholder="Lebensmittel suchen..."
            />
          </div>

          {/* Dropdown */}
          {showDropdown && filteredFoodItems.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-xl overflow-hidden max-h-72 overflow-y-auto">
              {filteredFoodItems.map(fi => (
                <button
                  key={fi.id}
                  onClick={() => addIngredient(fi)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-[hsl(var(--input-bg))] transition-colors text-left border-b border-[hsl(var(--border))]/50 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{CATEGORY_EMOJIS[fi.category] || '🍽️'}</span>
                    <div>
                      <p className="font-semibold text-sm">{fi.name}</p>
                      <p className="text-xs text-[hsl(var(--text-muted))] font-medium">{fi.category}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 px-2 py-1 rounded-md">
                    {fi.kcal_100g} kcal
                  </span>
                </button>
              ))}
            </div>
          )}

          {showDropdown && searchQuery.length > 0 && filteredFoodItems.length === 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-xl p-4 text-center">
              <p className="text-sm text-[hsl(var(--text-muted))] font-medium">Kein Lebensmittel gefunden. Erstelle es zuerst unter „Lebensmittel".</p>
            </div>
          )}
        </div>

        {/* Selected ingredients */}
        {ingredients.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-[hsl(var(--border))] rounded-2xl">
            <p className="text-[hsl(var(--text-muted))] font-medium">Nutze die Suchleiste, um Zutaten hinzuzufügen.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-[hsl(var(--input-bg))] rounded-2xl">
                <span className="text-lg shrink-0">{CATEGORY_EMOJIS[ing.food_item.category] || '🍽️'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{ing.food_item.name}</p>
                  <p className="text-xs text-[hsl(var(--text-muted))] font-medium">
                    {Math.round(ing.food_item.kcal_100g * ing.amount / 100)} kcal · {Math.round(ing.food_item.protein_100g * ing.amount / 100 * 10) / 10}g P
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={ing.amount}
                    onChange={e => updateAmount(idx, Math.max(1, parseFloat(e.target.value) || 0))}
                    className="w-20 text-right input-apple bg-[hsl(var(--background))] text-sm py-1.5 px-2"
                    min="1"
                    step="10"
                  />
                  <span className="text-xs font-semibold text-[hsl(var(--text-muted))]">g</span>
                </div>
                <button
                  onClick={() => removeIngredient(idx)}
                  className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live nutrition preview */}
      {ingredients.length > 0 && (
        <div className="card-apple bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--input-bg))]">
          <h2 className="text-lg font-bold mb-1">📊 Nährwert-Vorschau (Gesamt)</h2>
          <p className="text-sm text-[hsl(var(--text-muted))] font-medium mb-4">
            Für {servings} {servings === 1 ? 'Person' : 'Personen'} · Pro Portion: {Math.round(totalKcal / servings)} kcal
          </p>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-3 bg-[hsl(var(--background))] rounded-xl">
              <Flame size={18} className="text-[hsl(var(--primary))] mx-auto mb-1.5" />
              <p className="text-xl font-extrabold">{Math.round(totalKcal)}</p>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--text-muted))]">kcal</p>
            </div>
            <div className="text-center p-3 bg-[hsl(var(--background))] rounded-xl">
              <Drumstick size={18} className="text-blue-500 mx-auto mb-1.5" />
              <p className="text-xl font-extrabold">{Math.round(totalProtein * 10) / 10}g</p>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--text-muted))]">Protein</p>
            </div>
            <div className="text-center p-3 bg-[hsl(var(--background))] rounded-xl">
              <Wheat size={18} className="text-amber-500 mx-auto mb-1.5" />
              <p className="text-xl font-extrabold">{Math.round(totalCarbs * 10) / 10}g</p>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--text-muted))]">Carbs</p>
            </div>
            <div className="text-center p-3 bg-[hsl(var(--background))] rounded-xl">
              <Droplets size={18} className="text-rose-500 mx-auto mb-1.5" />
              <p className="text-xl font-extrabold">{Math.round(totalFat * 10) / 10}g</p>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--text-muted))]">Fett</p>
            </div>
          </div>
        </div>
      )}

      {/* Save button */}
      <div className="flex gap-4">
        <button
          onClick={handleSubmit}
          disabled={!title || ingredients.length === 0}
          className="btn-primary flex items-center gap-2 px-8 shadow-md hover:scale-[1.02] transition-transform disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <Save size={18} /> Rezept Speichern
        </button>
        <Link href="/recipes" className="btn-secondary px-6">
          Abbrechen
        </Link>
      </div>
    </div>
  )
}
