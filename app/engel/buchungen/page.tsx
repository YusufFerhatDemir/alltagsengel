'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { IconCalendar, IconClock, IconUser, IconCheck, IconMoney } from '@/components/Icons'
import type { Profile } from '@/lib/types'
import { logger } from '@/lib/logger'
const log = logger.child('engel:buchungen')

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'Neue Anfrage', color: 'var(--gold2)' },
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
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [respondError, setRespondError] = useState('')

  async function respond(bookingId: string, action: 'accept' | 'decline') {
    if (respondingId) return
    setRespondingId(bookingId)
    setRespondError('')
    try {
      const res = await fetch('/api/bookings/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, action }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // 409 mit `code` kommt aus der Einsatz-Kette (z. B. DOPPELBELEGUNG),
        // nicht aus einem Doppel-Klick — dann den echten Grund zeigen.
        setRespondError(res.status === 409 && !body?.code
          ? 'Diese Anfrage wurde bereits beantwortet.'
          : (body?.error || 'Anfrage konnte nicht beantwortet werden.'))
        await load()
        return
      }
      // Status lokal übernehmen, damit die Karte sofort umspringt
      setBookings(prev => prev.map(b =>
        b.id === bookingId ? { ...b, status: action === 'accept' ? 'accepted' : 'declined' } : b
      ))
    } catch {
      setRespondError('Netzwerkfehler — bitte erneut versuchen.')
    } finally {
      setRespondingId(null)
    }
  }

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data, error: err } = await supabase
        .from('bookings')
        .select('*, profiles:customer_id(first_name, last_name), care_recipients:care_recipient_id(first_name, last_name, relationship)')
        .eq('angel_id', user.id)
        .order('created_at', { ascending: false })

      if (err) throw err
      setBookings(data || [])
    } catch (err) {
      log.errorWithException('Engel buchungen load error', err)
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
            { key: 'pending', label: 'Anfragen' },
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

        {respondError && (
          <div style={{ margin: '0 0 10px', padding: '10px 14px', borderRadius: 10, background: 'rgba(200,60,60,.08)', color: 'var(--red-w)', fontSize: 13 }}>
            {respondError}
          </div>
        )}

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
            const customer = b.profiles as Profile | null
            const careRecipient = b.care_recipients as { first_name?: string; last_name?: string } | null
            const name = customer ? `${customer.first_name} ${customer.last_name?.[0] || ''}.` : 'Ehem. Kunde'
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
                    <div className="buch-detail"><IconCalendar size={13} /> {new Date(b.date).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: 'short', year: 'numeric' })}</div>
                    <div className="buch-detail"><IconClock size={13} /> {b.time?.slice(0,5)} · {b.duration_hours}h</div>
                    <div className="buch-detail"><IconMoney size={13} /> {b.total_amount?.toFixed(2)}€</div>
                  </div>
                  {b.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        disabled={respondingId !== null}
                        onClick={e => { e.preventDefault(); e.stopPropagation(); respond(b.id, 'decline') }}
                        style={{
                          flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
                          background: 'transparent', border: '1px solid rgba(0,0,0,.12)',
                          color: 'var(--ink3)', fontSize: 13, fontWeight: 600,
                          opacity: respondingId !== null ? .5 : 1,
                        }}
                      >{respondingId === b.id ? '...' : 'Ablehnen'}</button>
                      <button
                        disabled={respondingId !== null}
                        onClick={e => { e.preventDefault(); e.stopPropagation(); respond(b.id, 'accept') }}
                        style={{
                          flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', border: 'none',
                          background: 'linear-gradient(135deg,var(--gold),var(--gold2))',
                          color: 'var(--coal)', fontSize: 13, fontWeight: 600,
                          opacity: respondingId !== null ? .5 : 1,
                        }}
                      >{respondingId === b.id ? '...' : 'Annehmen'}</button>
                    </div>
                  )}
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
