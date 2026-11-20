import Link from 'next/link'
import { Users } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { joinPlanAction } from '@/app/(dashboard)/settings/planActions'

/**
 * Invite link target. Joining needs a tap (link previews in chat apps must
 * not join anyone), and shows what happens to the current plan.
 */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const clean = decodeURIComponent(code).replace(/[^\w-]/g, '').slice(0, 64)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: me } = user ? await supabase.from('users').select('household_id').eq('auth_id', user.id).maybeSingle() : { data: null }
  const current = me?.household_id
    ? (await supabase.from('households').select('name, invite_code').eq('id', me.household_id).maybeSingle()).data
    : null
  const alreadyIn = current?.invite_code?.toLowerCase() === clean.toLowerCase()

  return (
    <div className="max-w-md mx-auto card-apple space-y-5 text-center">
      <div className="w-16 h-16 mx-auto rounded-full bg-[hsl(var(--primary))]/10 flex items-center justify-center">
        <Users size={30} className="text-[hsl(var(--primary))]" />
      </div>
      <h1 className="text-2xl font-extrabold">Einladung zum gemeinsamen Plan</h1>
      {alreadyIn ? (
        <>
          <p className="text-[hsl(var(--text-muted))] font-medium">Du bist schon in „{current?.name}“.</p>
          <Link href="/settings#plan" className="btn-primary w-full h-14 text-lg">Zum Plan</Link>
        </>
      ) : (
        <form action={joinPlanAction} className="space-y-4">
          <input type="hidden" name="code" value={clean} />
          <p className="text-[hsl(var(--text-muted))] font-medium">
            Ihr bekommt einen gemeinsamen Wochenplan und eine Einkaufsliste – jede Person mit eigenen Portionen.
          </p>
          {current && (
            <p className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-500 p-3 font-semibold text-amber-900 dark:text-amber-100">
              Du verlässt dabei deinen aktuellen Plan „{current.name}“.
            </p>
          )}
          <button type="submit" className="btn-primary w-full h-14 text-lg">Beitreten</button>
          <Link href="/" className="block h-11 leading-[2.75rem] font-semibold text-[hsl(var(--text-muted))]">Nicht jetzt</Link>
        </form>
      )}
    </div>
  )
}
