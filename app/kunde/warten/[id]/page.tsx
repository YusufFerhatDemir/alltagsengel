'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isValidUUID, logError } from '@/lib/safe-query'
import { NotFoundState, ErrorState, LoadingState } from '@/components/UIStates'
import Link from 'next/link'
import { IconWingsGold, IconCheck } from '@/components/Icons'

export default function WartenPage() {
  const router = useRouter()
  const params = useParams()
  const bookingId = params.id as string
  const [confirmed, setConfirmed] = useState(false)
  const [booking, setBooking] = useState<any>(null)
  const [pageStatus, setPageStatus] = useState<'loading' | 'ok' | 'not_found' | 'error'>('loading')
  const [error, setError] = useState('')

  const loadBooking = async () => {
    setError('')
    try {
      if (!isValidUUID(bookingId)) { setPageStatus('not_found'); return }
      const supabase = createClient()
      const { data, error: queryErr } = await supabase
        .from('bookings')
        .select('*, angel:angels!bookings_angel_id_fkey(profiles(first_name, last_name))')
        .eq('id', bookingId)
        .maybeSingle()
      if (queryErr) {
        logError('WartenPage:load', queryErr.message)
        setPageStatus('error')
        setError('Buchung konnte nicht geladen werden')
        return
      }
      if (!data) {
        setPageStatus('not_found')
        return
      }
      setBooking(data)
      setPageStatus('ok')
    } catch (err) {
      logError('WartenPage:load', err)
      setPageStatus('error')
      setError('Ein unerwarteter Fehler ist aufgetreten')
    }
  }

  useEffect(() => {
    loadBooking()
  }, [bookingId])

  useEffect(() => {
    if (pageStatus !== 'ok') return
    const timer = setTimeout(async () => {
      try {
        const supabase = createClient()
        const { error: updateErr } = await supabase.from('bookings').update({ status: 'accepted' }).eq('id', bookingId)
        if (updateErr) throw updateErr
        setConfirmed(true)

        // Kunde benachrichtigen: Buchung bestätigt (in-app + email)
        fetch('/api/bookings/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId, event: 'accepted' }),
        }).catch(() => {})
      } catch (err) {
        logError('WartenPage:confirm', err)
        setError('Buchung konnte nicht bestätigt werden')
      }
    }, 4000)
    return () => clearTimeout(timer)
  }, [bookingId, pageStatus])

  if (pageStatus === 'loading') return <LoadingState />
  if (pageStatus === 'not_found') return <NotFoundState title="Buchung nicht gefunden" subtitle="Diese Buchung existiert nicht oder wurde bereits storniert." homeHref="/kunde/home" />
  if (pageStatus === 'error') return (
    <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 24px',textAlign:'center'}}>
      <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
      <p style={{color:'var(--ink3)',fontSize:14,marginBottom:16}}>{error || 'Ein Fehler beim Laden der Buchung ist aufgetreten'}</p>
      <button onClick={()=>{loadBooking()}} style={{padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold2))',color:'var(--coal)',fontSize:13,fontWeight:600,cursor:'pointer'}}>Erneut versuchen</button>
    </div>
  )

  const angelName = booking?.angel?.profiles ? `${booking.angel.profiles.first_name} ${booking.angel.profiles.last_name?.[0]}.` : 'Engel'
  const dateStr = booking?.date ? new Date(booking.date).toLocaleDateString('de-DE') : '...'
  const timeStr = booking?.time ? `${booking.time.slice(0,5)} Uhr` : '...'

  return (
    <div className="screen" id="bwarten">
      <div className="wait-body">
        <div className="wait-pulse">
          <div className="wait-ring"></div>
          <div className="wait-ring"></div>
          <div className="wait-core"><IconWingsGold size={34} /></div>
        </div>
        <div className="wait-title">{confirmed ? 'Buchung bestätigt!' : 'Anfrage wird gesendet...'}</div>
        <div className="wait-sub">
          {confirmed
            ? `${angelName} hat Ihre Anfrage angenommen. Sie können jetzt die Details einsehen.`
            : `Wir verbinden Sie mit ${angelName}. Dies dauert in der Regel nur wenige Augenblicke.`
          }
        </div>

        <div className="wait-card">
          <div className="wait-row"><div className="wait-lbl">Engel</div><div className="wait-val">{angelName}</div></div>
          <div className="wait-row"><div className="wait-lbl">Datum</div><div className="wait-val">{dateStr}</div></div>
          <div className="wait-row"><div className="wait-lbl">Uhrzeit</div><div className="wait-val">{timeStr}</div></div>
          <div className="wait-row"><div className="wait-lbl">Dauer</div><div className="wait-val">{booking?.duration_hours || '...'} Stunden</div></div>
          <div className="wait-row"><div className="wait-lbl">Betrag</div><div className="wait-val">{booking?.total_amount?.toFixed(2) || '...'}€</div></div>
        </div>

        <div className="wait-bar"><div className="wait-fill"></div></div>

        {confirmed && (
          <button className="btn-done" onClick={() => router.push(`/kunde/bestaetigt/${bookingId}`)} style={{ animation: 'screenIn .28s cubic-bezier(.4,0,.2,1) both' }}>
            BUCHUNG BESTÄTIGT <IconCheck size={16} />
          </button>
        )}
        <Link href="/kunde/home" className="btn-cancel">Abbrechen</Link>
      </div>
    </div>
  )
}
