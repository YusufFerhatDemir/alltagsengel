'use client'
import { useState, useRef, useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'

export default function TopBar({ title, backHref, dark = false, menuItems }: {
  title: string
  backHref: string
  dark?: boolean
  menuItems?: { label: string; href: string }[]
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="topbar">
      <button className={`back-btn${dark ? ' dark' : ''}`} onClick={() => router.back()} type="button">&lsaquo;</button>
      <div className={`topbar-title${dark ? ' light' : ''}`} style={{ flex: 1 }}>{title}</div>
      {menuItems && menuItems.length > 0 && (
        <div className="topbar-menu" ref={menuRef}>
          <button className={`topbar-dots${dark ? ' dark' : ''}`} onClick={() => setMenuOpen(!menuOpen)} type="button">⋮</button>
          {menuOpen && (
            <div className="topbar-dropdown">
              {menuItems.map(item => (
                <button key={item.href} onClick={() => { setMenuOpen(false); router.push(item.href) }}>{item.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
