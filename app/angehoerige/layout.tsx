'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconHome, IconClipboard, IconCalendar, IconChat, IconDocument } from '@/components/Icons'

const navItems = [
  { href: '/angehoerige', icon: <IconHome size={20} />, label: 'Start' },
  { href: '/angehoerige/pflegebericht', icon: <IconClipboard size={20} />, label: 'Berichte' },
  { href: '/angehoerige/termine', icon: <IconCalendar size={20} />, label: 'Termine' },
  { href: '/angehoerige/kommunikation', icon: <IconChat size={20} />, label: 'Nachrichten' },
  { href: '/angehoerige/dokumente', icon: <IconDocument size={20} />, label: 'Dokumente' },
]

export default function AngehoerigenLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <>
      {children}
      <nav className="bottom-nav" role="navigation" aria-label="Angehörigenportal Navigation">
        {navItems.map(item => {
          const isActive = item.href === '/angehoerige'
            ? pathname === '/angehoerige'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`bnav-item${isActive ? ' on' : ''}`}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="bnav-ic">{item.icon}</div>
              <div className="bnav-lbl">{item.label}</div>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
