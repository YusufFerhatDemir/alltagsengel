'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { IconCalendar, IconClock, IconUser, IconCheck, IconMoney } from '@/components/Icons'

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ausstehend', color: 'var(--gold2)' },
  accepted: { label: 'Angenommen', color: 'var(--green)' },
  declined: { label: 'Abgelehnt', color: 'var(--red-w)' },
  completed: { label: 'Abgeschlossen', color: 'var(--ink3)' },
  cancelled: { label: 'Storniert', color: 'var(--ink4)' },
}

export default function EngelBuchungenPage() {
  const [bookings, setBookings] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data, error: err } = await supabase
        .from('bookings')
        .select('*, profiles:customer_id(first_name, last_name), care_recipients:care_recipient_id(first_name, last_name, relationship, pflegegrad)')
        .eq('angel_id', user.id)
        .order('created_at', { ascending: false })

      if (err) throw err
      setBookings(data || [])
    } catch (err) {
      console.error('Engel buchungen load error:', err)
      setError('Fehler beim Laden der Aufträge. Bitte versuche es später erneut.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)

  if (error) return (
    <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 24px',textAlign:'center'}}>
      <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
      <p style={{color:'var(--ink3)',fontSize:14,marginBottom:16}}>{error}</p>
      <button onClick={load} style={{padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold2))',color:'var(--coal)',fontSize:13,fontWeight:600,cursor:'pointer'}}>Erneut versuchen</button>
    </div>
  )

  return (
    <div className="screen" id="buchungen">
      <div className="topbar" style={{ paddingTop: 14 }}>
        <div className="topbar-title">Meine Aufträge</div>
      </div>

      <div className="buch-body">
        <div className="buch-filters">
          {[
            { key: 'all', label: 'Alle' },
            { key: 'pending', label: 'Neu' },
            { key: 'accepted', label: 'Aktiv' },
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
            <div className="chat-empty-title">Keine Aufträge</div>
            <div className="chat-empty-sub">Neue Anfragen erscheinen hier</div>
          </div>
        ) : (
          filtered.map(b => {
            const customer = b.profiles as any
            const careRecipient = b.care_recipients as any
            const name = customer ? `${customer.first_name} ${customer.last_name?.[0] || ''}.` : 'Kunde'
            const crName = careRecipient ? `${careRecipient.first_name} ${careRecipient.last_name?.[0] || ''}.` : null
            const st = statusLabels[b.status] || statusLabels.pending
            return (
              <Link key={b.id} href={`/engel/bestaetigt/${b.id}`} style={{ textDecoration: 'none' }}>
                <div className="buch-card">
                  <div className="buch-top">
                    <div className="buch-avatar" style={{ background: 'var(--green-pale)' }}><IconUser size={18} /></div>
                    <div className="buch-info">
                      <div className="buch-name">{crName || name}</div>
                      <div className="buch-service">{b.service}{crName ? ` · via ${name}` : ''}</div>
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
