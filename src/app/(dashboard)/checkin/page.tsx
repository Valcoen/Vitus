import { createClient } from '@/utils/supabase/server'
import CheckinChart from '@/components/CheckinChart'
import CheckinForm from './CheckinForm'

export default async function CheckinPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userData } = await supabase.from('users').select('id, weight').eq('auth_id', user.id).single()

  // Fetch recent checkins
  const { data: recentCheckins } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userData!.id)
    .order('created_at', { ascending: false })
    .limit(30)

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">📅 Check-In</h1>
        <p className="text-[hsl(var(--text-muted))] mt-1 text-lg font-medium">Erfasse täglich oder wöchentlich deine Stimmung, dein Gewicht und deine Zufriedenheit.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Formular */}
        <div className="lg:col-span-1">
          <CheckinForm defaultWeight={userData?.weight} />
        </div>

        {/* Charts */}
        <div className="lg:col-span-2">
          <CheckinChart data={recentCheckins || []} />
        </div>

      </div>
    </div>
  )
}
