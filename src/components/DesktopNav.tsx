'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navGroups, isLinkActive } from './navLinks'

export default function DesktopNav() {
  const pathname = usePathname()
  return (
    <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
      {navGroups.map((group, gi) => (
        <div key={gi} className={gi > 0 ? 'pt-4' : ''}>
          {group.title && (
            <p className="px-4 pb-1 text-xs font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]">{group.title}</p>
          )}
          {group.links.map((item) => {
            const isActive = isLinkActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3.5 px-4 py-2.5 rounded-2xl transition-colors font-semibold ${
                  isActive
                    ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                    : 'text-[hsl(var(--text))] hover:bg-[hsl(var(--input-bg))]'
                }`}
              >
                <item.icon size={20} strokeWidth={2.5} className={isActive ? '' : 'opacity-80'} />
                {item.label}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
