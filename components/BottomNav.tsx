'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const kundeItems = [
  { href: '/kunde/home', icon: '🏠', label: 'Home' },
  { href: '#', icon: '🔍', label: 'Suche' },
  { href: '#', icon: '📅', label: 'Buchungen' },
  { href: '#', icon: '👤', label: 'Profil' },
]

const engelItems = [
  { href: '/engel/home', icon: '🏠', label: 'Home' },
  { href: '#', icon: '📋', label: 'Aufträge' },
  { href: '#', icon: '📅', label: 'Kalender' },
  { href: '/engel/profil', icon: '👤', label: 'Profil' },
]

export default function BottomNav({ role }: { role: 'kunde' | 'engel' }) {
  const pathname = usePathname()
  const items = role === 'kunde' ? kundeItems : engelItems

  return (
    <div className="bottom-nav">
      {items.map(item => {
        const isActive = pathname.startsWith(item.href) && item.href !== '#'
        return (
          <Link key={item.label} href={item.href} className={`bnav-item${isActive ? ' on' : ''}`}>
            <div className="bnav-ic">{item.icon}</div>
            <div className="bnav-lbl">{item.label}</div>
          </Link>
        )
      })}
    </div>
  )
}
