import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Toaster from '@/components/Toaster'
import LogoutButton from '@/components/LogoutButton'
import MobileSidebar from '@/components/MobileSidebar'
import DesktopNav from '@/components/DesktopNav'
import { Suspense } from 'react'
import SessionGuard from '@/components/SessionGuard'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')

  const { data: userData } = await supabase.from('users').select('name, theme').eq('auth_id', user.id).single()

  return (
    <div className={`flex h-screen w-full bg-[hsl(var(--background))] text-[hsl(var(--text))] overflow-hidden ${userData?.theme === 'Dunkel' ? 'dark' : ''}`}>
      <SessionGuard />
      <Suspense fallback={null}>
        <Toaster />
      </Suspense>

      {/* Desktop Sidebar */}
      <aside className="w-72 bg-[hsl(var(--sidebar-bg))] border-r border-[hsl(var(--border))] hidden md:flex flex-col z-10 transition-colors">
        <div className="p-8 pb-4">
          <h2 className="text-2xl font-bold tracking-tight">Vitus Nutrition</h2>
          {userData?.name && <p className="text-[15px] font-medium text-[hsl(var(--text-muted))] mt-1">Hallo {userData.name}</p>}
        </div>
        <DesktopNav />
        <div className="p-6 border-t border-[hsl(var(--border))]">
          <LogoutButton />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto w-full relative z-0 transition-colors">
        {/* Mobile Sidebar (client component with burger button) */}
        <MobileSidebar userName={userData?.name || undefined} />
        
        <div className="p-4 md:p-8 lg:p-10 max-w-6xl mx-auto space-y-8">
          {children}
        </div>
      </main>
    </div>
  )
}
