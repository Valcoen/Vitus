import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, User, Map, Activity, Users, ShoppingCart, Calendar, Settings, ChartPie, Apple, CookingPot } from 'lucide-react'
import Toaster from '@/components/Toaster'
import LogoutButton from '@/components/LogoutButton'
import MobileSidebar from '@/components/MobileSidebar'
import { Suspense } from 'react'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')

  const { data: userData } = await supabase.from('users').select('name, theme').eq('auth_id', user.id).single()

  const navLinks = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/profile', label: 'Mein Profil', icon: User },
    { href: '/profile/analysis', label: 'Personalisierte Analyse', icon: ChartPie },
    { href: '/tracking', label: 'Tracking', icon: Activity },
    { href: '/household', label: 'Haushalt & WG', icon: Users },
    { href: '/meal-plan', label: 'Ernährungsplan', icon: Map },
    { href: '/recipes', label: 'Rezepte', icon: CookingPot },
    { href: '/food-items', label: 'Lebensmittel', icon: Apple },
    { href: '/shopping', label: 'Einkaufsliste', icon: ShoppingCart },
    { href: '/checkin', label: 'Check-In', icon: Calendar },
    { href: '/settings', label: 'Einstellungen', icon: Settings }
  ]

  return (
    <div className={`flex h-screen w-full bg-[hsl(var(--background))] text-[hsl(var(--text))] overflow-hidden ${userData?.theme === 'Dunkel' ? 'dark' : ''}`}>
      <Suspense fallback={null}>
        <Toaster />
      </Suspense>

      {/* Desktop Sidebar */}
      <aside className="w-72 bg-[hsl(var(--sidebar-bg))] border-r border-[hsl(var(--border))] hidden md:flex flex-col z-10 transition-colors">
        <div className="p-8 pb-4">
          <h2 className="text-2xl font-bold tracking-tight">Vitus Nutrition</h2>
          {userData?.name && <p className="text-[15px] font-medium text-[hsl(var(--text-muted))] mt-1">Hallo {userData.name}</p>}
        </div>
        <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
          {navLinks.map((item) => (
            <Link 
              key={item.href} 
              href={item.href} 
              className="flex items-center gap-3.5 px-4 py-2.5 rounded-2xl hover:bg-[hsl(var(--input-bg))] transition-colors text-[hsl(var(--text))] font-semibold"
            >
              <item.icon size={20} strokeWidth={2.5} className="opacity-80" /> 
              {item.label}
            </Link>
          ))}
        </nav>
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
