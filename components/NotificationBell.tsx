'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { IconBell, IconCheck } from '@/components/Icons'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  is_read: boolean
  created_at: string
}

export default function NotificationBell() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Benachrichtigungen laden
  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20)

        if (data) {
          setNotifications(data)
          setUnreadCount(data.filter(n => !n.is_read).length)
        }
      } catch (err) {
        console.error('NotificationBell load error:', err)
      }
    }
    load()

    // Alle 30 Sekunden aktualisieren
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  // Außerhalb klicken → schließen
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function markAsRead(id: string) {
    const supabase = createClient()
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  async function markAllRead() {
    const supabase = createClient()
    const unread = notifications.filter(n => !n.is_read)
    if (unread.length === 0) return
    await supabase.from('notifications').update({ is_read: true }).in('id', unread.map(n => n.id))
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  function handleNotificationClick(n: Notification) {
    if (!n.is_read) markAsRead(n.id)
    if (n.link) router.push(n.link)
    setOpen(false)
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Jetzt'
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}T`
  }

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button className="notif-bell-btn" onClick={() => setOpen(!open)} aria-label="Benachrichtigungen">
        <IconBell size={20} />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-head">
            <span className="notif-panel-title">Benachrichtigungen</span>
            {unreadCount > 0 && (
              <button className="notif-mark-all" onClick={markAllRead}>
                <IconCheck size={12} /> Alle gelesen
              </button>
            )}
          </div>
          <div className="notif-panel-body">
            {notifications.length === 0 ? (
              <div className="notif-empty">Keine Benachrichtigungen</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`notif-item${n.is_read ? '' : ' unread'}`}
                  onClick={() => handleNotificationClick(n)}
                >
                  <div className="notif-dot-col">
                    {!n.is_read && <span className="notif-dot"></span>}
                  </div>
                  <div className="notif-content">
                    <div className="notif-item-title">{n.title}</div>
                    <div className="notif-item-body">{n.body}</div>
                    <div className="notif-item-time">{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
