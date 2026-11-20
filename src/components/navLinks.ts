import { LayoutDashboard, User, Map, Activity, Users, ShoppingCart, Calendar, Settings, ChartPie, Apple, CookingPot } from 'lucide-react'

export const navGroups = [
  {
    title: null,
    links: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Planung',
    links: [
      { href: '/meal-plan', label: 'Ernährungsplan', icon: Map },
      { href: '/shopping', label: 'Einkaufsliste', icon: ShoppingCart },
      { href: '/recipes', label: 'Entdecken', icon: CookingPot },
      { href: '/food-items', label: 'Lebensmittel', icon: Apple },
    ],
  },
  {
    title: 'Fortschritt',
    links: [
      { href: '/checkin', label: 'Wochen-Check-In', icon: Calendar },
      { href: '/tracking', label: 'Tracking', icon: Activity },
      { href: '/profile/analysis', label: 'Analyse', icon: ChartPie },
    ],
  },
  {
    title: 'Konto',
    links: [
      { href: '/profile', label: 'Mein Profil', icon: User },
      { href: '/household', label: 'Haushalt & WG', icon: Users },
      { href: '/settings', label: 'Einstellungen', icon: Settings },
    ],
  },
]

// Active link = longest matching href, so /profile doesn't light up on /profile/analysis
export function isLinkActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  if (!(pathname === href || pathname.startsWith(href + '/'))) return false
  return !navGroups.some(g => g.links.some(l => l.href !== href && l.href.startsWith(href + '/') && (pathname === l.href || pathname.startsWith(l.href + '/'))))
}
