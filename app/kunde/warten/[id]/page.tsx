'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isValidUUID, logError } from '@/lib/safe-query'
import { NotFoundState, LoadingState } from '@/components/UIStates'
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
  // Stornieren war bis 31.08.2026 nirgends aufrufbar: der Uebergang steht
  // im DB-Trigger, die Beschriftung „Storniert" stand hier — nur der Weg
  // dorthin fehlte. Wer eine Anfrage gestellt hatte, konnte sie nicht
  // zuruecknehmen.
  const [storniere, setStorniere] = useState(false)
  const [stornoFehler, setStornoFehler] = useState('')
  const [stornoFrage, setStornoFrage] = useState(false)

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

  async function stornieren() {
    setStorniere(true)
    setStornoFehler('')
    try {
      const res = await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Der Server nennt den Grund im Klartext (Einsatz laeuft schon,
        // Nachweis haengt an einer Rechnung) — den zeigen wir, statt ihn
        // durch ein allgemeines „Fehler" zu ersetzen.
        setStornoFehler(json?.error || 'Die Stornierung ist fehlgeschlagen.')
        return
      }
      setStornoFrage(false)
      await loadBooking(true)
    } catch {
      setStornoFehler('Keine Verbindung. Bitte versuchen Sie es erneut.')
    } finally {
      setStorniere(false)
    }
  }

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
  const dateStr = booking?.date ? new Date(booking.date).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '...'
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

        {/* Stornieren: erlaubt aus 'pending' und 'accepted' — genau die
            beiden Uebergaenge, die der DB-Trigger dem Kunden zugesteht. */}
        {(accepted || (!declined && !cancelled)) && (
          <div style={{ width: '100%', marginTop: 8 }}>
            {stornoFehler && (
              <div role="alert" style={{ background: 'rgba(208,75,59,.1)', border: '1px solid rgba(208,75,59,.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 10, fontSize: 13, color: 'var(--red-w)' }}>
                {stornoFehler}
              </div>
            )}
            {!stornoFrage ? (
              <button
                type="button"
                onClick={() => { setStornoFehler(''); setStornoFrage(true) }}
                style={{ width: '100%', minHeight: 44, padding: '12px 20px', borderRadius: 10, background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--ink3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Jost',sans-serif" }}
              >
                {accepted ? 'Termin stornieren' : 'Anfrage zurückziehen'}
              </button>
            ) : (
              <div style={{ background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
                  {accepted ? 'Termin wirklich stornieren?' : 'Anfrage wirklich zurückziehen?'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink4)', marginBottom: 14, lineHeight: 1.5 }}>
                  {accepted
                    ? `${angelName} wird benachrichtigt und der Einsatz wird abgesagt. Das lässt sich nicht rückgängig machen.`
                    : 'Die Anfrage wird zurückgezogen. Sie können jederzeit eine neue stellen.'}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={stornieren}
                    disabled={storniere}
                    style={{ flex: 1, minHeight: 44, padding: '12px 16px', borderRadius: 10, border: 'none', background: 'var(--red-w)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: storniere ? 'wait' : 'pointer', opacity: storniere ? 0.7 : 1, fontFamily: "'Jost',sans-serif" }}
                  >
                    {storniere ? 'Wird storniert …' : 'Ja, stornieren'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStornoFrage(false)}
                    disabled={storniere}
                    style={{ flex: 1, minHeight: 44, padding: '12px 16px', borderRadius: 10, background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--ink3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Jost',sans-serif" }}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <Link href={accepted || declined ? '/kunde/buchungen' : '/kunde/home'} className="btn-cancel">
          {accepted || declined ? 'Zu meinen Buchungen' : 'Später ansehen'}
        </Link>
      </div>
    </div>
  )
}
