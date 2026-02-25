'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconHome, IconSearch, IconCalendar, IconUser, IconClipboard } from '@/components/Icons'

const kundeItems = [
  { href: '/kunde/home', icon: <IconHome size={20} />, label: 'Home' },
  { href: '#', icon: <IconSearch size={20} />, label: 'Suche' },
  { href: '#', icon: <IconCalendar size={20} />, label: 'Buchungen' },
  { href: '/kunde/profil', icon: <IconUser size={20} />, label: 'Profil' },
]

const engelItems = [
  { href: '/engel/home', icon: <IconHome size={20} />, label: 'Home' },
  { href: '#', icon: <IconClipboard size={20} />, label: 'Aufträge' },
  { href: '#', icon: <IconCalendar size={20} />, label: 'Kalender' },
  { href: '/engel/profil', icon: <IconUser size={20} />, label: 'Profil' },
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
