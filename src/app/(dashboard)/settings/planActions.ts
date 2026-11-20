'use server'

/**
 * Shared plan ("Haushalt") management, used from the account settings.
 * Every membership change goes through a database function (migration 005):
 * users can't move themselves into a plan by editing their own row.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getActor } from '@/lib/actor'
import { can } from '@/lib/permissions'
import { cleanText } from '@/lib/recipe/validate'

const back = (kind: 'success' | 'error', msg: string): never =>
  redirect(`/settings?${kind}=${encodeURIComponent(msg)}#plan`)

function done(msg: string): never {
  revalidatePath('/', 'layout')
  return back('success', msg)
}

export async function createPlanAction(formData: FormData) {
  const { actor, supabase } = await getActor()
  if (!actor) return back('error', 'Bitte melde dich erneut an.')
  const name = cleanText(formData.get('name'), 80)
  const { error } = await supabase.rpc('create_household', { p_name: name })
  if (error) return back('error', 'Plan konnte nicht erstellt werden.')
  done('Gemeinsamer Plan erstellt – jetzt Leute einladen.')
}

export async function joinPlanAction(formData: FormData) {
  const { actor, supabase } = await getActor()
  if (!actor) return back('error', 'Bitte melde dich erneut an.')
  const code = cleanText(formData.get('code'), 32).replace(/^.*\/join\//, '')
  const { data } = code ? await supabase.rpc('join_household', { p_code: code }) : { data: null }
  if (!data) return back('error', 'Ungültiger oder abgelaufener Einladungscode.')
  done('Du bist dem gemeinsamen Plan beigetreten.')
}

export async function leavePlanAction() {
  const { actor, supabase } = await getActor()
  if (!actor) return back('error', 'Bitte melde dich erneut an.')
  const { error } = await supabase.rpc('leave_household')
  if (error) return back('error', 'Verlassen fehlgeschlagen.')
  done('Du hast den gemeinsamen Plan verlassen.')
}

export async function removeMemberAction(memberId: string) {
  const { actor, supabase } = await getActor()
  if (!can(actor, 'plan.members')) return back('error', 'Keine Berechtigung.')
  const { data } = await supabase.rpc('remove_household_member', { p_user: memberId })
  if (!data) return back('error', 'Nur der Planer kann Personen entfernen.')
  done('Person aus dem Plan entfernt.')
}

export async function makePlannerAction(memberId: string) {
  const { actor, supabase } = await getActor()
  if (!actor?.householdId || !can(actor, 'plan.members')) return back('error', 'Keine Berechtigung.')
  const { data } = await supabase.from('households').update({ planner_user_id: memberId })
    .eq('id', actor.householdId).eq('planner_user_id', actor.userId).select('id')
  if (!data?.length) return back('error', 'Nur der Planer kann das ändern.')
  done('Planer-Rolle übergeben.')
}

export async function newInviteCodeAction() {
  const { actor, supabase } = await getActor()
  if (!can(actor, 'plan.members')) return back('error', 'Keine Berechtigung.')
  const { data } = await supabase.rpc('regenerate_invite_code')
  if (!data) return back('error', 'Nur der Planer kann den Einladungslink erneuern.')
  done('Neuer Einladungslink – der alte funktioniert nicht mehr.')
}

export async function savePlanSettingsAction(formData: FormData) {
  const { actor, supabase } = await getActor()
  if (!actor?.householdId || !can(actor, 'plan.members')) return back('error', 'Keine Berechtigung.')
  const name = cleanText(formData.get('name'), 80)
  const meals = formData.getAll('shared_meals').map(String).filter(m => ['breakfast', 'lunch', 'dinner'].includes(m))
  const batchDays = Math.min(7, Math.max(1, parseInt(String(formData.get('batch_days') ?? '1'), 10) || 1))
  const { data } = await supabase.from('households').update({
    ...(name ? { name } : {}),
    shared_meal_frequency: meals.join(','),
    batch_defaults: { lunch_batch_days: batchDays },
  }).eq('id', actor.householdId).eq('planner_user_id', actor.userId).select('id')
  if (!data?.length) return back('error', 'Nur der Planer kann die Einstellungen ändern.')
  done('Plan-Einstellungen gespeichert.')
}
