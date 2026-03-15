'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Icon3D from '@/components/Icon3D'
import { IconUser, IconCard } from '@/components/Icons'

export default function EngelHomePage() {
  const router = useRouter()
  const [isOnline, setIsOnline] = useState(true)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [angel, setAngel] = useState<any>(null)
  const [pendingBookings, setPendingBookings] = useState<any[]>([])
  const [upcomingBookings, setUpcomingBookings] = useState<any[]>([])
  const [monthEarnings, setMonthEarnings] = useState(0)

  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }

        const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        const { data: a } = await supabase.from('angels').select('*').eq('id', user.id).single()

        // If no angel profile exists, redirect to registration
        if (!a) {
          router.replace('/engel/register')
          return
        }

        setProfile(p)
        setAngel(a)
        if (a) setIsOnline(a.is_online)

        const { data: pending } = await supabase
          .from('bookings')
          .select('*, customer:profiles!bookings_customer_id_fkey(first_name, last_name)')
          .eq('angel_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
        setPendingBookings(pending || [])

        const { data: upcoming } = await supabase
          .from('bookings')
          .select('*, customer:profiles!bookings_customer_id_fkey(first_name, last_name)')
          .eq('angel_id', user.id)
          .eq('status', 'accepted')
          .order('date', { ascending: true })
        setUpcomingBookings(upcoming || [])

        const now = new Date()
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        const { data: completed } = await supabase
          .from('bookings')
          .select('total_amount')
          .eq('angel_id', user.id)
          .eq('status', 'completed')
          .gte('date', monthStart)
        setMonthEarnings((completed || []).reduce((sum, b) => sum + (b.total_amount || 0), 0))
      } catch (err) {
        console.error('Engel home load error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  async function toggleOnline() {
    const next = !isOnline
    setIsOnline(next)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('angels').update({ is_online: next }).eq('id', user.id)
    }
  }

  async function handleBooking(bookingId: string, action: 'accepted' | 'declined') {
    const supabase = createClient()
    await supabase.from('bookings').update({ status: action }).eq('id', bookingId)
    setPendingBookings(prev => prev.filter(b => b.id !== bookingId))
    if (action === 'accepted') {
      router.push(`/engel/bestaetigt/${bookingId}`)
    }
  }

  const name = profile ? `${profile.first_name} ${profile.last_name}` : '...'

  if (loading) return <div className="screen" id="ehome"><div className="ed-header"><div className="ed-greet">Laden...</div></div></div>

  return (
    <div className="screen" id="ehome">
      <div className="ed-header">
        <div className="ed-toprow">
          <div className="ed-logo">
            <Icon3D size={28} />
            <div className="ed-wordmark">ENGEL</div>
          </div>
          <div className="online-toggle" onClick={toggleOnline}>
            <div className={`online-indicator${isOnline ? '' : ' off'}`}></div>
            <div className="online-label">{isOnline ? 'Online' : 'Offline'}</div>
          </div>
        </div>
        <div className="ed-greet">Willkommen zurück</div>
        <div className="ed-name">{name}</div>
        <div className="ed-stats">
          <div className="ed-stat"><div className="stat-val">{monthEarnings.toFixed(0)}€</div><div className="stat-lbl">Diesen Monat</div></div>
          <div className="ed-stat"><div className="stat-val">{angel?.total_jobs || 0}</div><div className="stat-lbl">Einsätze</div></div>
          <div className="ed-stat"><div className="stat-val">{angel?.rating?.toFixed(1) || '5.0'}</div><div className="stat-lbl">Bewertung</div></div>
        </div>
      </div>

      <div className="ed-body">
        <div className="section-label">Neue Anfragen</div>
        {pendingBookings.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--ink4)', fontSize: 14 }}>
            Keine neuen Anfragen
          </div>
        ) : pendingBookings.map(b => (
          <div key={b.id} className="req-card new">
            <div className="req-badge">NEU</div>
            <div className="req-top">
              <div className="req-av"><IconUser size={18} /></div>
              <div>
                <div className="req-name">{b.customer?.first_name} {b.customer?.last_name?.[0]}.</div>
                <div className="req-type">{b.service}</div>
              </div>
            </div>
            <div className="req-grid">
              <div className="req-info"><div className="req-info-lbl">Datum</div><div className="req-info-val">{new Date(b.date).toLocaleDateString('de-DE')}</div></div>
              <div className="req-info"><div className="req-info-lbl">Uhrzeit</div><div className="req-info-val">{b.time?.slice(0,5)}</div></div>
              <div className="req-info"><div className="req-info-lbl">Dauer</div><div className="req-info-val">{b.duration_hours} Std.</div></div>
              <div className="req-info"><div className="req-info-lbl">Vergütung</div><div className="req-info-val">{b.total_amount?.toFixed(2)}€</div></div>
            </div>
            {b.payment_method === 'kasse' && (
              <div className="req-note"><IconCard size={13} /> <strong>§45b-Buchung</strong> — Abrechnung direkt über Pflegekasse{b.insurance_provider ? ` (${b.insurance_provider})` : ''}.</div>
            )}
            <div className="req-btns">
              <div className="req-btn decline" onClick={() => handleBooking(b.id, 'declined')}>Ablehnen</div>
              <div className="req-btn accept" onClick={() => handleBooking(b.id, 'accepted')}>Annehmen</div>
            </div>
          </div>
        ))}

        <div className="section-label" style={{ marginTop: 22 }}>Kommende Einsätze</div>
        <div className="upcoming-list">
          {upcomingBookings.length === 0 ? (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--ink4)', fontSize: 14 }}>
              Keine kommenden Einsätze
            </div>
          ) : upcomingBookings.map(b => (
            <div key={b.id} className="upcoming-item">
              <div className="upcoming-av" style={{ background: 'var(--gold-pale)' }}><IconUser size={18} /></div>
              <div>
                <div className="upcoming-name">{b.customer?.first_name} {b.customer?.last_name?.[0]}.</div>
                <div className="upcoming-sub">{b.service} · {new Date(b.date).toLocaleDateString('de-DE')}, {b.time?.slice(0,5)}</div>
              </div>
              <div className="upcoming-end">
                <div className="upcoming-price">{b.total_amount?.toFixed(2)}€</div>
                <div className="upcoming-status" style={{ color: 'var(--green)' }}>Bestätigt</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
