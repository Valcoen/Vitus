'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function submitCheckIn(formData: FormData) {
  const weight = formData.get('weight') as string
  const mood = formData.get('mood') as string
  const physical = formData.get('physical_satisfaction') as string
  const mental = formData.get('mental_satisfaction') as string
  const note = formData.get('note') as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { data: u } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  if (!u) return { error: 'Benutzer nicht gefunden' }

  if (weight) {
    await supabase.from('users').update({ weight: parseFloat(weight) }).eq('id', u.id)
  }

  const { error } = await supabase.from('checkins').insert({
      user_id: u.id,
      weight: weight ? parseFloat(weight) : null,
      mood: mood ? parseInt(mood) : null,
      physical_satisfaction: physical ? parseInt(physical) : null,
      mental_satisfaction: mental ? parseInt(mental) : null,
      note: note || null
  })

  if (error) return { error: error.message }

  revalidatePath('/checkin')
  return { success: true }
}
