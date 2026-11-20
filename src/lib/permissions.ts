/**
 * Central permission check. Every write action (recipe create/edit/delete,
 * import, export, image upload, plan changes, tracking) must call
 * `assertCan()` before touching the database.
 *
 * Today it ALWAYS ALLOWS (roles are a later phase). To switch roles on,
 * set ENFORCE_ROLES = true once `users.role` exists. The matrix below is
 * the planned behaviour, so enabling it later is a one-line change here
 * plus the matching RLS policies in Supabase.
 */

export type Role = 'dev' | 'admin' | 'user'

export type Action =
  | 'recipe.create'
  | 'recipe.edit'
  | 'recipe.delete'
  | 'recipe.import'
  | 'recipe.export'
  | 'recipe.image.upload'
  | 'plan.edit'
  /** Invite / remove people, rename the shared plan (the DB also checks: planner only) */
  | 'plan.members'
  | 'shopping.edit'
  | 'food_item.edit'
  | 'tracking.write_own'

export type Actor = {
  /** public.users.id */
  userId: string
  householdId: string | null
  /** null until users.role exists */
  role: Role | null
}

const ENFORCE_ROLES = false

/** Planned matrix (not enforced yet). */
export const PLANNED_PERMISSIONS: Record<Role, ReadonlySet<Action> | 'all'> = {
  dev: 'all',
  admin: new Set<Action>([
    'recipe.create', 'recipe.edit', 'recipe.delete', 'recipe.import', 'recipe.export',
    'recipe.image.upload', 'plan.edit', 'plan.members', 'shopping.edit', 'food_item.edit', 'tracking.write_own',
  ]),
  // view everything, track own food; ticking the shared shopping list stays allowed
  user: new Set<Action>(['tracking.write_own', 'shopping.edit']),
}

export function can(actor: Actor | null, action: Action): boolean {
  if (!actor) return false // must be logged in
  if (!ENFORCE_ROLES) return true
  const perms = PLANNED_PERMISSIONS[actor.role ?? 'user']
  return perms === 'all' || perms.has(action)
}

export class PermissionError extends Error {
  constructor(public action: Action) {
    super(`Keine Berechtigung für diese Aktion (${action}).`)
  }
}

export function assertCan(actor: Actor | null, action: Action): asserts actor is Actor {
  if (!can(actor, action)) throw new PermissionError(action)
}
