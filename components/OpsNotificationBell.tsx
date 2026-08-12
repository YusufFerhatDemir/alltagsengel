'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { IconBell } from '@/components/Icons'

export default function OpsNotificationBell() {
  const router = useRouter()
  const pathname = usePathname()
  const [count, setCount] = useState(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ops/benachrichtigungen/zaehler')
      if (!res.ok) return
      const data = await res.json()
      // zaehler view returns { empfaenger_id, ungelesen_gesamt, ... } or null
      if (data && typeof data.ungelesen_gesamt === 'number') {
        setCount(data.ungelesen_gesamt)
      } else if (Array.isArray(data) && data.length > 0) {
        setCount(data[0].ungelesen_gesamt || 0)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load])

  const target = pathname.startsWith('/admin')
    ? '/admin/benachrichtigungen'
    : '/engel/benachrichtigungen'

  return (
    <button
      onClick={() => router.push(target)}
      aria-label="Benachrichtigungen"
      style={{
        position: 'relative',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--ink)',
        padding: 8,
      }}
    >
      <IconBell size={20} />
      {count > 0 && (
        <span style={{
          position: 'absolute',
          top: 2,
          right: 2,
          background: '#D04B3B',
          color: '#fff',
          fontSize: 10,
          fontWeight: 700,
          borderRadius: '50%',
          minWidth: 16,
          height: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 4px',
          lineHeight: 1,
        }}>
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}
