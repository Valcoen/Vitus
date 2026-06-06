import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  // Build redirect URL dynamically from the request headers
  // so it works on any host (localhost, staging, production)
  const headersList = await headers()
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || ''
  const protocol = headersList.get('x-forwarded-proto') || 'https'
  const origin = `${protocol}://${host}`

  return NextResponse.redirect(new URL('/login', origin))
}
