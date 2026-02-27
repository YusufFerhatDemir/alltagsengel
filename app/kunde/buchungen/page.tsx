'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { IconCalendar, IconClock, IconWings, IconCheck, IconMoney } from '@/components/Icons'

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ausstehend', color: 'var(--gold2)' },
  accepted: { label: 'Bestätigt', color: 'var(--green)' },
  declined: { label: 'Abgelehnt', color: 'var(--red-w)' },
  completed: { label: 'Abgeschlossen', color: 'var(--ink3)' },
  cancelled: { label: 'Storniert', color: 'var(--ink4)' },
}

export default function KundeBuchungenPage() {
  const [bookings, setBookings] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('bookings')
        .select('*, angels:angel_id(profiles(first_name, last_name))')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })

      setBookings(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)

  return (
    <div className="screen" id="buchungen">
      <div className="topbar" style={{ paddingTop: 14 }}>
        <div className="topbar-title">Meine Buchungen</div>
      </div>

      <div className="buch-body">
        <div className="buch-filters">
          {[
            { key: 'all', label: 'Alle' },
            { key: 'pending', label: 'Offen' },
            { key: 'accepted', label: 'Bestätigt' },
            { key: 'completed', label: 'Fertig' },
          ].map(f => (
            <button
              key={f.key}
              className={`buch-filter${filter === f.key ? ' on' : ''}`}
              onClick={() => setFilter(f.key)}
            >{f.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="chat-empty">Laden...</div>
        ) : filtered.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon"><IconCalendar size={40} /></div>
            <div className="chat-empty-title">Keine Buchungen</div>
            <div className="chat-empty-sub">Buche deinen ersten Engel auf der Startseite</div>
          </div>
        ) : (
          filtered.map(b => {
            const angel = b.angels as any
            const name = angel?.profiles ? `${angel.profiles.first_name} ${angel.profiles.last_name}` : 'Engel'
            const st = statusLabels[b.status] || statusLabels.pending
            return (
              <Link key={b.id} href={`/kunde/bestaetigt/${b.id}`} style={{ textDecoration: 'none' }}>
                <div className="buch-card">
                  <div className="buch-top">
                    <div className="buch-avatar"><IconWings size={18} /></div>
                    <div className="buch-info">
                      <div className="buch-name">{name}</div>
                      <div className="buch-service">{b.service}</div>
                    </div>
                    <div className="buch-status" style={{ color: st.color }}>{st.label}</div>
                  </div>
                  <div className="buch-details">
                    <div className="buch-detail"><IconCalendar size={13} /> {new Date(b.date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                    <div className="buch-detail"><IconClock size={13} /> {b.time?.slice(0,5)} · {b.duration_hours}h</div>
                    <div className="buch-detail"><IconMoney size={13} /> {b.total_amount?.toFixed(2)}€</div>
                  </div>
                </div>
              </Link>
            )
          })
        )}
        <div style={{ height: 90 }}></div>
      </div>
    </div>
  )
}
