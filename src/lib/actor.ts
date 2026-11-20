import { createClient } from '@/utils/supabase/server'
import type { Actor } from './permissions'

/**
 * Loads the logged-in user as an Actor for permission checks.
 * Returns null when not logged in or the profile row is missing.
 */
export async function getActor(): Promise<{ actor: Actor | null; supabase: Awaited<ReturnType<typeof createClient>> }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { actor: null, supabase }
  const { data: u } = await supabase.from('users').select('id, household_id').eq('auth_id', user.id).single()
  if (!u) return { actor: null, supabase }
  // users.role doesn't exist yet (roles are a later phase)
  return { actor: { userId: u.id, householdId: u.household_id ?? null, role: null }, supabase }
}
