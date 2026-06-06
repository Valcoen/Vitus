'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, LayoutDashboard, User, Map, Activity, Users, ShoppingCart, Calendar, Settings, ChartPie, Apple, CookingPot } from 'lucide-react'
import LogoutButton from './LogoutButton'

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
  { href: '/settings', label: 'Einstellungen', icon: Settings },
]

interface MobileSidebarProps {
  userName?: string
}

export default function MobileSidebar({ userName }: MobileSidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Close sidebar on navigation
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  // Close sidebar on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  return (
    <>
      {/* Mobile Header Bar */}
      <div className="md:hidden flex items-center justify-between p-4 bg-[hsl(var(--sidebar-bg))] border-b border-[hsl(var(--border))] sticky top-0 z-50">
        <button
          onClick={() => setIsOpen(true)}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[hsl(var(--input-bg))] transition-colors active:scale-90"
          aria-label="Menü öffnen"
        >
          <Menu size={24} strokeWidth={2.5} />
        </button>
        <h2 className="text-lg font-bold">Vitus Nutrition</h2>
        <div className="w-10" /> {/* Spacer for centering */}
      </div>

      {/* Backdrop Overlay */}
      <div
        className={`fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsOpen(false)}
      />

      {/* Slide-in Sidebar */}
      <div
        ref={sidebarRef}
        className={`fixed top-0 left-0 bottom-0 z-[110] w-[280px] bg-[hsl(var(--sidebar-bg))] border-r border-[hsl(var(--border))] flex flex-col transition-transform duration-300 ease-out md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-6 pb-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Vitus Nutrition</h2>
            {userName && (
              <p className="text-sm font-medium text-[hsl(var(--text-muted))] mt-0.5">Hallo {userName}</p>
            )}
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[hsl(var(--input-bg))] transition-colors active:scale-90"
            aria-label="Menü schließen"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {navLinks.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl font-semibold transition-all active:scale-[0.97] ${
                  isActive
                    ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                    : 'text-[hsl(var(--text))] hover:bg-[hsl(var(--input-bg))]'
                }`}
              >
                <item.icon size={20} strokeWidth={2.5} className={isActive ? '' : 'opacity-70'} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-[hsl(var(--border))]">
          <LogoutButton />
        </div>
      </div>
    </>
  )
}
