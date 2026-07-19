'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isValidUUID, logError } from '@/lib/safe-query'
import { NotFoundState, ErrorState, LoadingState } from '@/components/UIStates'
import Link from 'next/link'
import { IconCheck } from '@/components/Icons'
import Icon3D from '@/components/Icon3D'

export default function WartenPage() {
  const router = useRouter()
  const params = useParams()
  const bookingId = params.id as string
  const [booking, setBooking] = useState<any>(null)
  const [pageStatus, setPageStatus] = useState<'loading' | 'ok' | 'not_found' | 'error'>('loading')
  const [error, setError] = useState('')

  const loadBooking = async (silent = false) => {
    if (!silent) { setError(''); setPageStatus('loading') }
    try {
      if (!isValidUUID(bookingId)) { setPageStatus('not_found'); return }
      const supabase = createClient()
      const { data, error: queryErr } = await supabase
        .from('bookings')
        .select('*, angel:angels!bookings_angel_id_fkey(profiles(first_name, last_name))')
        .eq('id', bookingId)
        .maybeSingle()
      if (queryErr) {
        if (silent) return
        logError('WartenPage:load', queryErr.message)
        setPageStatus('error')
        setError('Anfrage konnte nicht geladen werden')
        return
      }
      if (!data) {
        if (silent) return
        setPageStatus('not_found')
        return
      }
      setBooking(data)
      setPageStatus('ok')
    } catch (err) {
      if (silent) return
      logError('WartenPage:load', err)
      setPageStatus('error')
      setError('Ein unerwarteter Fehler ist aufgetreten')
    }
  }

  useEffect(() => {
    loadBooking()
  }, [bookingId])

  // Auf die Antwort des Engels warten: solange die Anfrage offen ist, alle
  // 5 Sekunden nachsehen, ob angenommen oder abgelehnt wurde. Der Status wird
  // ausschließlich vom Engel über /api/bookings/respond gesetzt.
  useEffect(() => {
    if (pageStatus !== 'ok') return
    if (booking?.status !== 'pending') return
    const interval = setInterval(() => { loadBooking(true) }, 5000)
    return () => clearInterval(interval)
  }, [bookingId, pageStatus, booking?.status])

  if (pageStatus === 'loading') return <LoadingState />
  if (pageStatus === 'not_found') return <NotFoundState title="Anfrage nicht gefunden" subtitle="Diese Anfrage existiert nicht oder wurde bereits storniert." homeHref="/kunde/home" />
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

  const accepted = booking?.status === 'accepted'
  const declined = booking?.status === 'declined'
  const cancelled = booking?.status === 'cancelled'

  const title = accepted
    ? 'Anfrage angenommen!'
    : declined
      ? 'Anfrage abgelehnt'
      : cancelled
        ? 'Anfrage storniert'
        : 'Anfrage gesendet'

  const subtitle = accepted
    ? `${angelName} hat Ihre Anfrage angenommen. Ihr Termin steht fest.`
    : declined
      ? `${angelName} kann Ihre Anfrage leider nicht annehmen. Kein Problem — es stehen weitere Engel in Ihrer Nähe zur Verfügung.`
      : cancelled
        ? 'Diese Anfrage wurde storniert.'
        : `${angelName} wurde benachrichtigt und antwortet in der Regel innerhalb weniger Stunden. Sie erhalten sofort eine Benachrichtigung, sobald die Anfrage beantwortet wurde.`

  return (
    <div className="screen" id="bwarten">
      <div className="wait-body">
        <div className="wait-pulse">
          {!accepted && !declined && !cancelled && <><div className="wait-ring"></div><div className="wait-ring"></div></>}
          <div className="wait-core" style={{ overflow: 'visible' }}><Icon3D size={80} /></div>
        </div>
        <div className="wait-title">{title}</div>
        <div className="wait-sub">{subtitle}</div>

        <div className="wait-card">
          <div className="wait-row"><div className="wait-lbl">Engel</div><div className="wait-val">{angelName}</div></div>
          <div className="wait-row"><div className="wait-lbl">Datum</div><div className="wait-val">{dateStr}</div></div>
          <div className="wait-row"><div className="wait-lbl">Uhrzeit</div><div className="wait-val">{timeStr}</div></div>
          <div className="wait-row"><div className="wait-lbl">Dauer</div><div className="wait-val">{booking?.duration_hours || '...'} Stunden</div></div>
          <div className="wait-row"><div className="wait-lbl">Betrag</div><div className="wait-val">{booking?.total_amount?.toFixed(2) || '...'}€</div></div>
          <div className="wait-row">
            <div className="wait-lbl">Status</div>
            <div className="wait-val" style={{ color: accepted ? 'var(--green)' : declined || cancelled ? 'var(--red-w)' : 'var(--gold2)' }}>
              {accepted ? 'Angenommen' : declined ? 'Abgelehnt' : cancelled ? 'Storniert' : 'Warten auf Bestätigung'}
            </div>
          </div>
        </div>

        {!accepted && !declined && !cancelled && <div className="wait-bar"><div className="wait-fill"></div></div>}

        {accepted && (
          <button className="btn-done" onClick={() => router.push(`/kunde/bestaetigt/${bookingId}`)} style={{ animation: 'screenIn .28s cubic-bezier(.4,0,.2,1) both' }}>
            BUCHUNG BESTÄTIGT <IconCheck size={16} />
          </button>
        )}

        {declined && (
          <button className="btn-done" onClick={() => router.push('/kunde/home')} style={{ animation: 'screenIn .28s cubic-bezier(.4,0,.2,1) both' }}>
            ANDEREN ENGEL FINDEN
          </button>
        )}

        <Link href={accepted || declined ? '/kunde/buchungen' : '/kunde/home'} className="btn-cancel">
          {accepted || declined ? 'Zu meinen Buchungen' : 'Später ansehen'}
        </Link>
      </div>
    </div>
  )
}
