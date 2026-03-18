'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { IconCalendar, IconClock, IconWings, IconCheck, IconMoney, IconTruck } from '@/components/Icons'

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ausstehend', color: 'var(--gold2)' },
  accepted: { label: 'Bestätigt', color: 'var(--green)' },
  confirmed: { label: 'Bestätigt', color: 'var(--green)' },
  in_progress: { label: 'Unterwegs', color: '#2196F3' },
  declined: { label: 'Abgelehnt', color: 'var(--red-w)' },
  completed: { label: 'Abgeschlossen', color: 'var(--ink3)' },
  cancelled: { label: 'Storniert', color: 'var(--ink4)' },
}

export default function KundeBuchungenPage() {
  const [bookings, setBookings] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set())

  const load = async () => {
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Nicht angemeldet')
        setLoading(false)
        return
      }

      // Normale Buchungen
      const { data: normalBookings, error: bookingsErr } = await supabase
        .from('bookings')
        .select('*, angels:angel_id(profiles(first_name, last_name))')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })

      if (bookingsErr) throw new Error('Buchungen konnte nicht geladen werden')

      // Krankenfahrten
      const { data: rides, error: ridesErr } = await supabase
        .from('krankenfahrten')
        .select('*')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })

      if (ridesErr) throw new Error('Krankenfahrten konnte nicht geladen werden')

      // Krankenfahrten als Buchungen formatieren
      const rideBookings = (rides || []).map((r: any) => ({
        id: r.id,
        service: 'Krankenfahrt',
        date: r.datum,
        time: r.uhrzeit,
        duration_hours: null,
        total_amount: r.total_amount,
        status: r.status,
        created_at: r.created_at,
        _type: 'krankenfahrt',
        _ride: r,
        angels: null,
      }))

      // Zusammenführen und nach Datum sortieren
      const all = [...(normalBookings || []).map((b: any) => ({ ...b, _type: 'booking' })), ...rideBookings]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      setBookings(all)

      // Check which bookings have been reviewed
      const bookingIds = (normalBookings || []).map((b: any) => b.id)
      if (bookingIds.length > 0) {
        const { data: reviewed } = await supabase
          .from('angel_reviews')
          .select('booking_id')
          .in('booking_id', bookingIds)
        if (reviewed) setReviewedIds(new Set(reviewed.map(r => r.booking_id)))
      }
    } catch (err: any) {
      setError(err?.message || 'Ein Fehler beim Laden der Buchungen ist aufgetreten')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)

  if (error && !loading) return (
    <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 24px',textAlign:'center'}}>
      <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
      <p style={{color:'var(--ink3)',fontSize:14,marginBottom:16}}>{error}</p>
      <button onClick={()=>{setError('');load()}} style={{padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold2))',color:'var(--coal)',fontSize:13,fontWeight:600,cursor:'pointer'}}>Erneut versuchen</button>
    </div>
  )

  return (
    <div className="screen" id="buchungen">
      <div className="topbar" style={{ paddingTop: 14 }}>
        <div className="topbar-title">Meine Buchungen</div>
      </div>

      <div className="buch-body">
        <>
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
            const isRide = b._type === 'krankenfahrt'
            const angel = b.angels as any
            const name = isRide
              ? (b._ride?.abholadresse ? `${b._ride.abholadresse.substring(0, 25)}...` : 'Krankenfahrt')
              : (angel?.profiles ? `${angel.profiles.first_name} ${angel.profiles.last_name?.[0]}.` : 'Engel')
            const st = statusLabels[b.status] || statusLabels.pending
            const linkHref = isRide ? '/kunde/krankenfahrt/fahrten' : `/kunde/bestaetigt/${b.id}`
            return (
              <Link key={b.id} href={linkHref} style={{ textDecoration: 'none' }}>
                <div className="buch-card">
                  <div className="buch-top">
                    <div className="buch-avatar">{isRide ? <IconTruck size={18} /> : <IconWings size={18} />}</div>
                    <div className="buch-info">
                      <div className="buch-name">{name}</div>
                      <div className="buch-service">{b.service}</div>
                    </div>
                    <div className="buch-status" style={{ color: st.color }}>{st.label}</div>
                  </div>
                  <div className="buch-details">
                    <div className="buch-detail"><IconCalendar size={13} /> {b.date ? new Date(b.date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
                    <div className="buch-detail"><IconClock size={13} /> {b.time?.slice(0,5)}{b.duration_hours ? ` · ${b.duration_hours}h` : ''}</div>
                    <div className="buch-detail"><IconMoney size={13} /> {b.total_amount ? `${Number(b.total_amount).toFixed(2)}€` : '—'}</div>
                  </div>
                  {/* Bewertung button — only for past bookings without review */}
                  {!isRide && b.date && new Date(b.date) < new Date() && !reviewedIds.has(b.id) && ['accepted', 'confirmed', 'completed'].includes(b.status) && (
                    <Link href={`/kunde/bewertung/${b.id}`} onClick={e => e.stopPropagation()} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      marginTop: 10, padding: '9px 0', borderRadius: 10,
                      background: 'var(--gold-pale)', border: '1px solid rgba(201,150,60,.2)',
                      color: 'var(--gold)', fontSize: 13, fontWeight: 600, textDecoration: 'none',
                    }}>⭐ Bewerten</Link>
                  )}
                  {!isRide && reviewedIds.has(b.id) && (
                    <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: 'var(--ink4)' }}>✓ Bewertet</div>
                  )}
                </div>
              </Link>
            )
          })
            )}
            <div style={{ height: 90 }}></div>
        </>
      </div>
    </div>
  )
}
