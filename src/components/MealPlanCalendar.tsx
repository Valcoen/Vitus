'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Utensils, User, ChefHat, ExternalLink, UtensilsCrossed } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────

export interface CalendarMeal {
  id: string
  name: string
  mealType: string
  recipeId: string | null
  recipeTitle: string | null
  isShared: boolean
  batchGroupId: string | null
  calories: number | null
  persons: PersonPortion[]
  cookingTotals: CookingTotal[]
  cookingTotalKcal: number
  kcalQuery: string
}

export interface PersonPortion {
  userId: string
  name: string
  isCurrentUser: boolean
  targetKcal: number
  totalGrams: number
  totalKcal: number
  totalProtein: number
  totalCarbs: number
  totalFat: number
  ingredients: { name: string; displayAmount: string; displayUnit: string }[]
}

export interface CookingTotal {
  name: string
  totalGrams: number
  displayUnit: string
}

export interface CalendarDay {
  date: string       // ISO YYYY-MM-DD
  dayName: string    // "Donnerstag"
  dayShort: string   // "Do"
  dateFormatted: string // "05.06."
  isToday: boolean
  meals: CalendarMeal[]
}

interface MealPlanCalendarProps {
  days: CalendarDay[]
  mealSlots: string[]
  householdMemberCount: number
}

// ─── Meal Type Color Coding ───────────────────────────────────────────

function getMealTypeStyle(mealType: string): { bg: string; border: string; text: string; icon: string } {
  const type = mealType.toLowerCase()
  if (type.includes('frühstück')) {
    return {
      bg: 'rgba(255, 149, 0, 0.08)',
      border: 'rgba(255, 149, 0, 0.25)',
      text: 'rgb(255, 149, 0)',
      icon: '🌅',
    }
  }
  if (type.includes('mittag')) {
    return {
      bg: 'rgba(52, 199, 89, 0.08)',
      border: 'rgba(52, 199, 89, 0.25)',
      text: 'rgb(52, 199, 89)',
      icon: '☀️',
    }
  }
  if (type.includes('abend')) {
    return {
      bg: 'rgba(88, 86, 214, 0.08)',
      border: 'rgba(88, 86, 214, 0.25)',
      text: 'rgb(88, 86, 214)',
      icon: '🌙',
    }
  }
  if (type.includes('snack')) {
    return {
      bg: 'rgba(255, 45, 85, 0.08)',
      border: 'rgba(255, 45, 85, 0.25)',
      text: 'rgb(255, 45, 85)',
      icon: '🍎',
    }
  }
  return {
    bg: 'rgba(142, 142, 147, 0.08)',
    border: 'rgba(142, 142, 147, 0.25)',
    text: 'rgb(142, 142, 147)',
    icon: '🍽️',
  }
}

// ─── Main Component ───────────────────────────────────────────────────

export default function MealPlanCalendar({ days, mealSlots, householdMemberCount }: MealPlanCalendarProps) {
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null)
  const [activeMobileDay, setActiveMobileDay] = useState<number>(() => {
    const todayIdx = days.findIndex(d => d.isToday)
    return todayIdx >= 0 ? todayIdx : 0
  })

  const toggleMeal = (mealId: string) => {
    setExpandedMealId(prev => (prev === mealId ? null : mealId))
  }

  if (days.length === 0) {
    return (
      <div className="card-apple text-center p-12 py-20 border-dashed">
        <p className="text-lg font-bold text-[hsl(var(--text-muted))] mb-2">Noch keine Mahlzeiten für diese Woche</p>
      </div>
    )
  }

  return (
    <div>
      {/* ═══ DESKTOP: Full Week Grid ═══ */}
      <div className="hidden lg:block">
        <DesktopGrid
          days={days}
          mealSlots={mealSlots}
          expandedMealId={expandedMealId}
          onToggleMeal={toggleMeal}
          householdMemberCount={householdMemberCount}
        />
      </div>

      {/* ═══ MOBILE/TABLET: Tab-based Day View ═══ */}
      <div className="lg:hidden">
        <MobileTabs
          days={days}
          mealSlots={mealSlots}
          activeDayIndex={activeMobileDay}
          onDayChange={setActiveMobileDay}
          expandedMealId={expandedMealId}
          onToggleMeal={toggleMeal}
          householdMemberCount={householdMemberCount}
        />
      </div>
    </div>
  )
}

// ─── Desktop Grid ─────────────────────────────────────────────────────

function DesktopGrid({
  days,
  mealSlots,
  expandedMealId,
  onToggleMeal,
  householdMemberCount,
}: {
  days: CalendarDay[]
  mealSlots: string[]
  expandedMealId: string | null
  onToggleMeal: (id: string) => void
  householdMemberCount: number
}) {
  return (
    <div className="space-y-3">
      {/* ── Day Header Row ── */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}
      >
        {/* Empty corner cell */}
        <div />
        {days.map((day) => (
          <div
            key={day.date}
            className={`text-center rounded-2xl py-3 px-2 transition-all ${
              day.isToday
                ? 'bg-[hsl(var(--primary))]/10 ring-2 ring-[hsl(var(--primary))]/30'
                : 'bg-[hsl(var(--card))] border border-[hsl(var(--border))]'
            }`}
          >
            <p className={`text-xs font-bold uppercase tracking-wider ${
              day.isToday ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--text-muted))]'
            }`}>
              {day.dayShort}
            </p>
            <p className={`text-lg font-extrabold mt-0.5 ${
              day.isToday ? 'text-[hsl(var(--primary))]' : ''
            }`}>
              {day.dateFormatted}
            </p>
            {day.isToday && (
              <span className="inline-block text-[10px] font-bold text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/15 px-2 py-0.5 rounded-full mt-1">
                Heute
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ── Meal Slot Rows ── */}
      {mealSlots.map((slot) => {
        const style = getMealTypeStyle(slot)
        return (
          <div key={slot}>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}
            >
              {/* Slot label */}
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <span className="text-lg">{style.icon}</span>
                  <p className="text-[11px] font-bold uppercase tracking-wider mt-1" style={{ color: style.text }}>
                    {slot.replace('essen', '')}
                  </p>
                </div>
              </div>

              {/* Meal cells for this slot */}
              {days.map((day) => {
                const meal = day.meals.find((m) => m.mealType === slot)
                if (!meal) {
                  return (
                    <div
                      key={`${day.date}-${slot}`}
                      className="rounded-xl border border-dashed border-[hsl(var(--border))]/50 p-3 flex items-center justify-center min-h-[80px]"
                    >
                      <span className="text-xs text-[hsl(var(--text-muted))]/50 font-medium">—</span>
                    </div>
                  )
                }

                const isExpanded = expandedMealId === meal.id
                return (
                  <MealCell
                    key={meal.id}
                    meal={meal}
                    isExpanded={isExpanded}
                    isToday={day.isToday}
                    onToggle={() => onToggleMeal(meal.id)}
                    style={style}
                  />
                )
              })}
            </div>

            {/* ── Expanded Detail Row ── */}
            {mealSlots.length > 0 && days.map((day) => {
              const meal = day.meals.find((m) => m.mealType === slot)
              if (!meal || expandedMealId !== meal.id) return null
              return (
                <div key={`detail-${meal.id}`} className="mt-2 mb-1">
                  <MealDetailPanel meal={meal} householdMemberCount={householdMemberCount} />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ─── Mobile Tabs ──────────────────────────────────────────────────────

function MobileTabs({
  days,
  mealSlots,
  activeDayIndex,
  onDayChange,
  expandedMealId,
  onToggleMeal,
  householdMemberCount,
}: {
  days: CalendarDay[]
  mealSlots: string[]
  activeDayIndex: number
  onDayChange: (idx: number) => void
  expandedMealId: string | null
  onToggleMeal: (id: string) => void
  householdMemberCount: number
}) {
  const activeDay = days[activeDayIndex]
  if (!activeDay) return null

  return (
    <div className="space-y-4">
      {/* ── Day Tabs ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
        {days.map((day, idx) => (
          <button
            key={day.date}
            onClick={() => onDayChange(idx)}
            className={`flex-shrink-0 flex flex-col items-center py-2.5 px-3.5 rounded-2xl transition-all min-w-[56px] ${
              idx === activeDayIndex
                ? day.isToday
                  ? 'bg-[hsl(var(--primary))] text-white shadow-lg shadow-[hsl(var(--primary))]/25'
                  : 'bg-[hsl(var(--card))] ring-2 ring-[hsl(var(--primary))]/40 shadow-md'
                : day.isToday
                  ? 'bg-[hsl(var(--primary))]/10 ring-1 ring-[hsl(var(--primary))]/20'
                  : 'bg-[hsl(var(--card))] border border-[hsl(var(--border))]'
            }`}
          >
            <span className={`text-[10px] font-bold uppercase tracking-wider ${
              idx === activeDayIndex
                ? day.isToday ? 'text-white/80' : 'text-[hsl(var(--primary))]'
                : day.isToday ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--text-muted))]'
            }`}>
              {day.dayShort}
            </span>
            <span className={`text-sm font-extrabold mt-0.5 ${
              idx === activeDayIndex
                ? day.isToday ? 'text-white' : ''
                : day.isToday ? 'text-[hsl(var(--primary))]' : ''
            }`}>
              {day.dateFormatted}
            </span>
          </button>
        ))}
      </div>

      {/* ── Active Day Header ── */}
      <div className={`text-center py-2 ${activeDay.isToday ? 'text-[hsl(var(--primary))]' : ''}`}>
        <h3 className="text-lg font-bold">
          {activeDay.dayName}, {activeDay.dateFormatted}
          {activeDay.isToday && <span className="ml-2 text-sm font-semibold opacity-70">· Heute</span>}
        </h3>
      </div>

      {/* ── Meal Cards for Active Day ── */}
      <div className="space-y-3">
        {mealSlots.map((slot) => {
          const meal = activeDay.meals.find((m) => m.mealType === slot)
          const style = getMealTypeStyle(slot)

          if (!meal) {
            return (
              <div
                key={`${activeDay.date}-${slot}`}
                className="rounded-2xl border border-dashed border-[hsl(var(--border))]/50 p-5 flex items-center gap-3"
              >
                <span className="text-lg">{style.icon}</span>
                <div>
                  <p className="text-sm font-bold" style={{ color: style.text }}>{slot}</p>
                  <p className="text-xs text-[hsl(var(--text-muted))] font-medium mt-0.5">Keine Mahlzeit geplant</p>
                </div>
              </div>
            )
          }

          const isExpanded = expandedMealId === meal.id

          return (
            <div key={meal.id} className="space-y-2">
              <button
                onClick={() => onToggleMeal(meal.id)}
                className="w-full text-left"
              >
                <div
                  className={`rounded-2xl p-4 transition-all active:scale-[0.99] ${
                    isExpanded
                      ? 'ring-2 shadow-lg'
                      : 'shadow-[var(--shadow-soft)] hover:shadow-md'
                  }`}
                  style={{
                    background: isExpanded ? style.bg : 'hsl(var(--card))',
                    borderColor: style.border,
                    border: `1px solid ${isExpanded ? style.border : 'hsl(var(--border))'}`,
                    ...(isExpanded ? { boxShadow: `0 4px 20px ${style.border}` } : {}),
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{style.icon}</span>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: style.text }}>
                          {slot}
                        </p>
                        <p className="font-bold text-base mt-0.5 leading-snug break-words">
                          {meal.recipeTitle || meal.name}
                        </p>
                        {meal.persons.length > 0 && meal.persons[0] && (
                          <p className="text-xs font-semibold text-[hsl(var(--text-muted))] mt-1">
                            {meal.persons[0].totalKcal} kcal
                            {meal.isShared && ` · ${householdMemberCount} Pers.`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-[hsl(var(--text-muted))]">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <MealDetailPanel meal={meal} householdMemberCount={householdMemberCount} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Meal Cell (Desktop Grid) ─────────────────────────────────────────

function MealCell({
  meal,
  isExpanded,
  isToday,
  onToggle,
  style,
}: {
  meal: CalendarMeal
  isExpanded: boolean
  isToday: boolean
  onToggle: () => void
  style: ReturnType<typeof getMealTypeStyle>
}) {
  const displayName = meal.recipeTitle || meal.name
  const firstPerson = meal.persons[0]

  return (
    <button
      onClick={onToggle}
      className={`text-left rounded-xl p-3 min-h-[80px] transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
        isExpanded
          ? 'ring-2 shadow-lg'
          : isToday
            ? 'shadow-md'
            : 'shadow-[var(--shadow-soft)] hover:shadow-md'
      }`}
      style={{
        background: isExpanded ? style.bg : 'hsl(var(--card))',
        border: `1px solid ${isExpanded ? style.border : isToday ? 'hsl(var(--primary) / 0.2)' : 'hsl(var(--border))'}`,
        ...(isExpanded ? {
          ringColor: style.border,
          boxShadow: `0 4px 16px ${style.border}`,
        } : {}),
      }}
    >
      <p className="font-bold text-sm leading-snug break-words">
        {displayName}
      </p>
      {firstPerson && (
        <p className="text-[11px] font-semibold text-[hsl(var(--text-muted))] mt-1.5">
          {firstPerson.totalKcal} kcal
        </p>
      )}
      {meal.batchGroupId && (
        <span className="inline-block text-[9px] font-bold uppercase tracking-wider mt-1.5 px-1.5 py-0.5 rounded-md"
          style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}
        >
          Batch
        </span>
      )}
      <div className="flex justify-end mt-1">
        {isExpanded ? (
          <ChevronUp size={14} className="text-[hsl(var(--text-muted))]" />
        ) : (
          <ChevronDown size={14} className="text-[hsl(var(--text-muted))]/50" />
        )}
      </div>
    </button>
  )
}

// ─── Meal Detail Panel ────────────────────────────────────────────────

function MealDetailPanel({
  meal,
  householdMemberCount,
}: {
  meal: CalendarMeal
  householdMemberCount: number
}) {
  const style = getMealTypeStyle(meal.mealType)

  return (
    <div
      className="rounded-2xl p-5 space-y-4 animate-in slide-in-from-top-2 duration-200"
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UtensilsCrossed size={18} style={{ color: style.text }} />
          <div>
            <p className="font-bold text-lg">{meal.recipeTitle || meal.name}</p>
            {meal.isShared ? (
              <p className="text-xs font-semibold text-[hsl(var(--text-muted))] flex items-center gap-1.5 mt-0.5">
                <Utensils size={12} /> Geteiltes Haushaltsessen · {householdMemberCount} Personen
              </p>
            ) : (
              <p className="text-xs font-semibold text-[hsl(var(--text-muted))] flex items-center gap-1.5 mt-0.5">
                <User size={12} /> Individuell
              </p>
            )}
          </div>
        </div>
        {meal.recipeId && (
          <a
            href={`/recipes/${meal.recipeId}${meal.kcalQuery}`}
            className="btn-primary py-2 px-4 shadow-sm text-sm whitespace-nowrap gap-2"
          >
            <ExternalLink size={14} />
            Rezept
          </a>
        )}
      </div>

      {/* Per-person portions */}
      {meal.persons.length > 0 && (
        <div className="space-y-2.5">
          {meal.persons.map((person) => (
            <div
              key={person.userId}
              className={`rounded-xl p-4 ${
                person.isCurrentUser
                  ? 'bg-[hsl(var(--primary))]/[0.07] ring-1 ring-[hsl(var(--primary))]/20'
                  : 'bg-[hsl(var(--background))]/60'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <p className={`text-xs uppercase font-extrabold tracking-wider flex items-center gap-1.5 ${
                  person.isCurrentUser ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--text-muted))]'
                }`}>
                  <User size={12} />
                  {person.name}{person.isCurrentUser ? ' (Du)' : ''}
                  <span className="text-[10px] font-bold opacity-60 ml-1">
                    {person.totalGrams}g gesamt
                  </span>
                </p>
              </div>

              {/* Ingredient chips */}
              {person.ingredients.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {person.ingredients.map((ing, idx) => (
                    <span key={idx} className="text-[11px] font-semibold bg-[hsl(var(--background))] px-2 py-1 rounded-lg">
                      {ing.name}: {ing.displayAmount}{ing.displayUnit}
                    </span>
                  ))}
                </div>
              )}

              {/* Macro bar */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-x-6 gap-y-2">
                <MacroItem label="Kalorien" value={`${person.totalKcal} kcal`} />
                <MacroItem label="Protein" value={`${person.totalProtein}g`} color="text-blue-500" />
                <MacroItem label="Kohlenhydrate" value={`${person.totalCarbs}g`} color="text-amber-500" />
                <MacroItem label="Fett" value={`${person.totalFat}g`} color="text-rose-500" />
              </div>
            </div>
          ))}

          {/* Cooking totals for shared meals */}
          {meal.isShared && meal.cookingTotals.length > 0 && (
            <div className="rounded-xl p-4 bg-gradient-to-r from-[hsl(var(--background))]/60 to-[hsl(var(--card))]/60 border border-dashed border-[hsl(var(--border))]">
              <p className="text-xs uppercase font-extrabold text-[hsl(var(--text-muted))] tracking-wider flex items-center gap-1.5 mb-2">
                <ChefHat size={13} />
                Gesamt zum Kochen · {meal.cookingTotalKcal} kcal
              </p>
              <div className="flex flex-wrap gap-1.5">
                {meal.cookingTotals.map((item, idx) => (
                  <span key={idx} className="text-[11px] font-bold bg-[hsl(var(--background))] px-2.5 py-1 rounded-lg text-[hsl(var(--primary))]">
                    {item.name}: {item.totalGrams}{item.displayUnit}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fallback if no portions data */}
      {meal.persons.length === 0 && meal.calories && (
        <div className="bg-[hsl(var(--background))]/60 rounded-xl p-4">
          <p className="text-xs uppercase font-extrabold text-[hsl(var(--text-muted))] mb-2 tracking-wider">
            Kalorienziel: {meal.calories} kcal
          </p>
          <p className="text-xs text-[hsl(var(--text-muted))] font-medium">
            Keine personalisierten Portionen verfügbar. Generiere den Plan neu für detaillierte Aufschlüsselung.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Shared UI Components ─────────────────────────────────────────────

function MacroItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase font-bold text-[hsl(var(--text-muted))] tracking-widest">{label}</span>
      <span className={`font-extrabold text-sm ${color || ''}`}>{value}</span>
    </div>
  )
}
