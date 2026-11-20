import { headers } from 'next/headers'
import { Users, Crown, UserMinus, LogOut, RefreshCw, Link2 } from 'lucide-react'
import ConfirmSubmit from '@/components/ConfirmSubmit'
import InviteLink from '@/components/InviteLink'
import {
  createPlanAction, joinPlanAction, leavePlanAction, removeMemberAction,
  makePlannerAction, newInviteCodeAction, savePlanSettingsAction,
} from '@/app/(dashboard)/settings/planActions'
import type { createClient } from '@/utils/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>

const MEALS: [string, string][] = [['breakfast', 'Frühstück'], ['lunch', 'Mittagessen'], ['dinner', 'Abendessen']]

/** "Gemeinsamer Plan" card in the account settings (replaces the old Haushalt page). */
export default async function SharedPlanSettings({ supabase, me }: { supabase: Supabase; me: { id: string; household_id: string | null } }) {
  const household = me.household_id
    ? (await supabase.from('households').select('*').eq('id', me.household_id).maybeSingle()).data
    : null

  if (!household) {
    return (
      <section id="plan" className="card-apple scroll-mt-24 space-y-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Users size={22} className="text-[hsl(var(--primary))]" /> Gemeinsamer Plan</h2>
          <p className="text-[hsl(var(--text-muted))] font-medium mt-1">
            Plant zusammen: ein Wochenplan und eine Einkaufsliste für alle, jeder mit seinen eigenen Portionen.
          </p>
        </div>
        <form action={createPlanAction} className="space-y-3">
          <input type="text" name="name" maxLength={80} placeholder="Name, z. B. WG Küche" className="input-apple min-h-12 text-lg" />
          <button type="submit" className="btn-primary w-full h-12">Plan erstellen und Leute einladen</button>
        </form>
        <form action={joinPlanAction} className="space-y-3 pt-4 border-t border-[hsl(var(--border))]">
          <p className="font-semibold">Eingeladen worden? Link öffnen oder Code eingeben:</p>
          <input type="text" name="code" required maxLength={200} placeholder="Einladungscode" autoCapitalize="none" autoCorrect="off" className="input-apple min-h-12 text-lg font-mono" />
          <button type="submit" className="btn-secondary w-full h-12">Beitreten</button>
        </form>
      </section>
    )
  }

  const { data: members } = await supabase.from('users').select('id, name, surname, email').eq('household_id', household.id).order('name')
  const isPlanner = household.planner_user_id === me.id
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'vitus.davidshermitage.com'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  const inviteUrl = `${proto}://${host}/join/${encodeURIComponent(household.invite_code ?? '')}`
  const planner = members?.find(m => m.id === household.planner_user_id)

  return (
    <section id="plan" className="card-apple scroll-mt-24 space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Users size={22} className="text-[hsl(var(--primary))]" /> Gemeinsamer Plan</h2>
        <p className="text-2xl font-extrabold mt-2">{household.name}</p>
        <p className="text-sm font-medium text-[hsl(var(--text-muted))]">
          {members?.length ?? 1} {members?.length === 1 ? 'Person' : 'Personen'} · Planer: {planner?.name ?? '–'}
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="font-bold">Personen</h3>
        <ul className="space-y-2">
          {members?.map(m => (
            <li key={m.id} className="flex items-center gap-3 p-3 bg-[hsl(var(--input-bg))] rounded-2xl">
              <div className="w-11 h-11 shrink-0 bg-[hsl(var(--card))] rounded-full flex items-center justify-center font-bold text-lg border border-[hsl(var(--border))]">
                {m.name ? m.name[0].toUpperCase() : '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{[m.name, m.surname].filter(Boolean).join(' ') || m.email}{m.id === me.id ? ' (du)' : ''}</p>
                <p className="text-xs text-[hsl(var(--text-muted))] truncate">{m.email}</p>
              </div>
              {m.id === household.planner_user_id ? (
                <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-500/10 px-2.5 py-1.5 rounded-lg"><Crown size={14} /> Planer</span>
              ) : isPlanner && (
                <div className="flex gap-1.5">
                  <form action={makePlannerAction.bind(null, m.id)}>
                    <ConfirmSubmit message={`${m.name ?? 'Diese Person'} zum Planer machen? Du kannst dann keine Personen mehr entfernen.`}
                      className="h-11 px-3 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-sm font-semibold flex items-center gap-1">
                      <Crown size={16} /><span className="hidden sm:inline">Planer</span>
                    </ConfirmSubmit>
                  </form>
                  <form action={removeMemberAction.bind(null, m.id)}>
                    <ConfirmSubmit message={`${m.name ?? 'Diese Person'} aus dem Plan entfernen?`}
                      className="h-11 px-3 rounded-xl border-2 border-red-500/40 text-red-600 text-sm font-semibold flex items-center gap-1">
                      <UserMinus size={16} /> Entfernen
                    </ConfirmSubmit>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3 pt-4 border-t border-[hsl(var(--border))]">
        <h3 className="font-bold flex items-center gap-2"><Link2 size={18} /> Jemanden einladen</h3>
        <p className="text-sm text-[hsl(var(--text-muted))]">Link schicken. Wer ihn öffnet und sich anmeldet (oder registriert), kann beitreten.</p>
        <InviteLink url={inviteUrl} code={household.invite_code ?? ''} planName={household.name} />
        {isPlanner && (
          <form action={newInviteCodeAction}>
            <ConfirmSubmit message="Neuen Link erzeugen? Der alte Link funktioniert dann nicht mehr." className="h-11 px-1 text-sm font-semibold text-[hsl(var(--text-muted))] flex items-center gap-2">
              <RefreshCw size={16} /> Neuen Link erzeugen (alten ungültig machen)
            </ConfirmSubmit>
          </form>
        )}
      </div>

      {isPlanner && (
        <form action={savePlanSettingsAction} className="space-y-4 pt-4 border-t border-[hsl(var(--border))]">
          <h3 className="font-bold">Plan-Einstellungen</h3>
          <label className="block">
            <span className="block text-sm font-semibold mb-1.5">Name</span>
            <input type="text" name="name" defaultValue={household.name} maxLength={80} className="input-apple min-h-12" />
          </label>
          <fieldset>
            <legend className="text-sm font-semibold mb-2">Gemeinsam gekocht</legend>
            <div className="grid sm:grid-cols-3 gap-2">
              {MEALS.map(([v, label]) => (
                <label key={v} className="flex items-center gap-3 min-h-12 px-3 rounded-xl bg-[hsl(var(--input-bg))] cursor-pointer font-medium">
                  <input type="checkbox" name="shared_meals" value={v} defaultChecked={household.shared_meal_frequency?.includes(v)} className="w-5 h-5" /> {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="block text-sm font-semibold mb-1.5">Meal-Prep: Mittagessen für wie viele Tage auf einmal?</span>
            <input type="number" name="batch_days" min={1} max={7} defaultValue={household.batch_defaults?.lunch_batch_days || 1} className="input-apple min-h-12 w-28" />
          </label>
          <button type="submit" className="btn-primary h-12">Speichern</button>
        </form>
      )}

      <form action={leavePlanAction} className="pt-4 border-t border-[hsl(var(--border))]">
        <ConfirmSubmit
          message={isPlanner && (members?.length ?? 0) > 1
            ? 'Plan verlassen? Die Planer-Rolle geht an eine andere Person im Plan.'
            : 'Plan verlassen? Wochenplan und Einkaufsliste siehst du dann nicht mehr.'}
          className="h-12 px-4 rounded-xl text-red-600 font-semibold flex items-center gap-2 border-2 border-red-500/30">
          <LogOut size={18} /> Plan verlassen
        </ConfirmSubmit>
      </form>
    </section>
  )
}
