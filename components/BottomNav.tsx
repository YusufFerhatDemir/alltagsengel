'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { IconHome, IconSearch, IconCalendar, IconUser, IconClipboard, IconChat } from '@/components/Icons'

const engelItems = [
  { href: '/engel/home', icon: <IconHome size={20} />, label: 'Home' },
  { href: '/engel/buchungen', icon: <IconClipboard size={20} />, label: 'Aufträge' },
  { href: '/engel/chat', icon: <IconChat size={20} />, label: 'Chat' },
  { href: '/engel/kalender', icon: <IconCalendar size={20} />, label: 'Kalender' },
  { href: '/engel/profil', icon: <IconUser size={20} />, label: 'Profil' },
]

export default function BottomNav({ role }: { role: 'kunde' | 'engel' | 'fahrer' }) {
  const pathname = usePathname()
  const router = useRouter()

  // Hide BottomNav on pages with submit bars - it covers the submit button
  const hideOnPages = [
    '/engel/register',
    '/kunde/register',
    '/kunde/krankenfahrt',
    '/kunde/hygienebox',
    '/fahrer/register',
  ]
  if (hideOnPages.includes(pathname) || pathname.startsWith('/kunde/buchen/')) return null

  if (role === 'fahrer') {
    const fahrerItems = [
      { href: '/fahrer/home', icon: <IconHome size={20} />, label: 'Home' },
      { href: '/fahrer/auftraege', icon: <IconClipboard size={20} />, label: 'Aufträge' },
      { href: '/fahrer/chat', icon: <IconChat size={20} />, label: 'Chat' },
      { href: '/fahrer/fahrzeuge', icon: <IconCalendar size={20} />, label: 'Fahrzeuge' },
      { href: '/fahrer/profil', icon: <IconUser size={20} />, label: 'Profil' },
    ]
    return (
      <nav className="bottom-nav" role="navigation" aria-label="Hauptnavigation">
        {fahrerItems.map(item => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link key={item.label} href={item.href} className={`bnav-item${isActive ? ' on' : ''}`} aria-label={item.label} aria-current={isActive ? 'page' : undefined}>
              <div className="bnav-ic">{item.icon}</div>
              <div className="bnav-lbl">{item.label}</div>
            </Link>
          )
        })}
      </nav>
    )
  }

  if (role === 'engel') {
    return (
      <nav className="bottom-nav" role="navigation" aria-label="Hauptnavigation">
        {engelItems.map(item => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link key={item.label} href={item.href} className={`bnav-item${isActive ? ' on' : ''}`} aria-label={item.label} aria-current={isActive ? 'page' : undefined}>
              <div className="bnav-ic">{item.icon}</div>
              <div className="bnav-lbl">{item.label}</div>
            </Link>
          )
        })}
      </nav>
    )
  }

  const kundeItems = [
    { key: 'home', href: '/kunde/home', icon: <IconHome size={20} />, label: 'Home' },
    { key: 'suche', href: '/kunde/home', icon: <IconSearch size={20} />, label: 'Suche' },
    { key: 'chat', href: '/kunde/chat', icon: <IconChat size={20} />, label: 'Chat' },
    { key: 'buchungen', href: '/kunde/buchungen', icon: <IconCalendar size={20} />, label: 'Buchungen' },
    { key: 'profil', href: '/kunde/profil', icon: <IconUser size={20} />, label: 'Profil' },
  ]

  function handleSearchClick(e: React.MouseEvent) {
    e.preventDefault()
    if (pathname === '/kunde/home') {
      const el = document.getElementById('search-bar')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const input = el.querySelector('input')
        if (input) setTimeout(() => input.focus(), 300)
      }
    } else {
      router.push('/kunde/home')
      setTimeout(() => {
        const el = document.getElementById('search-bar')
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          const input = el.querySelector('input')
          if (input) input.focus()
        }
      }, 500)
    }
  }

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Hauptnavigation">
      {kundeItems.map(item => {
        const isActive = item.key === 'home'
          ? pathname === '/kunde/home'
          : item.key !== 'suche' && pathname.startsWith(item.href)
        if (item.key === 'suche') {
          return (
            <a key={item.label} href="#" className="bnav-item" onClick={handleSearchClick} aria-label="Engel suchen">
              <div className="bnav-ic">{item.icon}</div>
              <div className="bnav-lbl">{item.label}</div>
            </a>
          )
        }
        return (
          <Link key={item.label} href={item.href} className={`bnav-item${isActive ? ' on' : ''}`} aria-label={item.label} aria-current={isActive ? 'page' : undefined}>
            <div className="bnav-ic">{item.icon}</div>
            <div className="bnav-lbl">{item.label}</div>
          </Link>
        )
      })}
    </nav>
  )
}
