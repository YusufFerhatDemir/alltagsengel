'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { IconHome, IconSearch, IconCalendar, IconUser, IconClipboard } from '@/components/Icons'

const engelItems = [
  { href: '/engel/home', icon: <IconHome size={20} />, label: 'Home' },
  { href: '#', icon: <IconClipboard size={20} />, label: 'Aufträge' },
  { href: '#', icon: <IconCalendar size={20} />, label: 'Kalender' },
  { href: '/engel/profil', icon: <IconUser size={20} />, label: 'Profil' },
]

export default function BottomNav({ role }: { role: 'kunde' | 'engel' }) {
  const pathname = usePathname()
  const router = useRouter()

  if (role === 'engel') {
    return (
      <div className="bottom-nav">
        {engelItems.map(item => {
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

  const kundeItems = [
    { key: 'home', href: '/kunde/home', icon: <IconHome size={20} />, label: 'Home' },
    { key: 'suche', href: '/kunde/home', icon: <IconSearch size={20} />, label: 'Suche' },
    { key: 'buchungen', href: '#', icon: <IconCalendar size={20} />, label: 'Buchungen' },
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
    <div className="bottom-nav">
      {kundeItems.map(item => {
        const isActive = item.key === 'home'
          ? pathname === '/kunde/home'
          : pathname.startsWith(item.href) && item.href !== '#' && item.key !== 'suche'
        if (item.key === 'suche') {
          return (
            <a key={item.label} href="#" className="bnav-item" onClick={handleSearchClick}>
              <div className="bnav-ic">{item.icon}</div>
              <div className="bnav-lbl">{item.label}</div>
            </a>
          )
        }
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
