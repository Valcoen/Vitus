import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    return NextResponse.redirect(new URL('/login?error=Could+not+authenticate', request.url))
  }

  return NextResponse.redirect(new URL('/login', request.url))
}
