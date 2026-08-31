'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isValidUUID, logError } from '@/lib/safe-query'
import { NotFoundState, ErrorState, LoadingState } from '@/components/UIStates'
import { IconCheck, IconWingsGold, IconChat, IconShield, IconCalendar, IconClock, IconHome as IconHouse, IconCard, IconMoney, IconPhone } from '@/components/Icons'
import Icon3D from '@/components/Icon3D'

export default function BestaetigtPage() {
  const params = useParams()
  const id = params.id as string
  const [booking, setBooking] = useState<any>(null)
  const [pageStatus, setPageStatus] = useState<'loading' | 'ok' | 'not_found' | 'error'>('loading')
  const [error, setError] = useState('')
  // BEFUND 31.08.2026: Der Storno-Weg wurde am selben Tag gebaut
  // (/api/bookings/cancel) und in /kunde/warten angeschlossen — also dort,
  // wo eine Anfrage noch OFFEN ist. Sobald der Engel angenommen hatte,
  // fuehrte die Buchungsliste hierher, und hier gab es Chat, Anrufen,
  // Bewerten und Home, aber keinen Storno.
  //
  // Genau dieser Uebergang ist der, auf den es ankommt: der Uebergangs-
  // Trigger `enforce_booking_status_transition` gestattet dem Kunden
  // ausdruecklich accepted → cancelled, die Route setzt die ganze Kette
  // um (Nachweis → Einsatz → Buchung) — und der Kunde, dessen Termin
  // morgen ansteht, kam nicht daran. Er konnte eine ANFRAGE zuruecknehmen,
  // aber keinen bestaetigten TERMIN absagen.
  const [storniere, setStorniere] = useState(false)
  const [stornoFehler, setStornoFehler] = useState('')
  const [stornoFrage, setStornoFrage] = useState(false)

  const loadBooking = async () => {
    setError('')
    setPageStatus('loading')
    try {
      if (!isValidUUID(id)) { setPageStatus('not_found'); return }
      const supabase = createClient()
      const { data, error: queryErr } = await supabase
        .from('bookings')
        .select('*, angel:angels!bookings_angel_id_fkey(profiles(first_name, last_name, avatar_color))')
        .eq('id', id)
        .maybeSingle()

      if (queryErr) {
        logError('BestaetigtPage:load', queryErr.message)
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
      logError('BestaetigtPage', err)
      setPageStatus('error')
      setError('Ein unerwarteter Fehler ist aufgetreten')
    }
  }

  useEffect(() => {
    loadBooking()
  }, [id])

  async function stornieren() {
    setStorniere(true)
    setStornoFehler('')
    try {
      const res = await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: id }),
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
      await loadBooking()
    } catch {
      setStornoFehler('Keine Verbindung. Bitte versuchen Sie es erneut.')
    } finally {
      setStorniere(false)
    }
  }

  if (pageStatus === 'loading') return <div className="screen"><LoadingState /></div>
  if (pageStatus === 'not_found') return <NotFoundState title="Buchung nicht gefunden" subtitle="Diese Buchung existiert nicht oder wurde bereits storniert." homeHref="/kunde/home" />
  if (pageStatus === 'error') return (
    <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 24px',textAlign:'center'}}>
      <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
      <p style={{color:'var(--ink3)',fontSize:14,marginBottom:16}}>{error || 'Ein Fehler beim Laden der Buchung ist aufgetreten'}</p>
      <button onClick={()=>{loadBooking()}} style={{padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold2))',color:'var(--coal)',fontSize:13,fontWeight:600,cursor:'pointer'}}>Erneut versuchen</button>
    </div>
  )
  if (!booking) return <div className="screen"><ErrorState homeHref="/kunde/home" /></div>

  const angelName = booking.angel?.profiles ? `${booking.angel.profiles.first_name} ${booking.angel.profiles.last_name?.[0]}.` : 'Engel'
  const dateStr = booking.date ? new Date(booking.date).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: 'long', year: 'numeric' }) : '—'
  const timeEnd = booking.time && booking.duration_hours
    ? `${booking.time?.slice(0,5)} – ${String(Number(booking.time?.slice(0,2)) + booking.duration_hours).padStart(2,'0')}:${booking.time?.slice(3,5)} Uhr`
    : '—'
  const payLabel = booking.payment_method === 'kasse' ? `§45b · ${booking.insurance_provider || ''}` : booking.payment_method === 'kombi' ? `Kombi · ${booking.insurance_provider || ''}` : 'Privat'

  return (
    <div className="screen" id="bbestaetigt">
      <div className="confirm-header">
        <div className="confirm-check green"><IconCheck size={28} /></div>
        <div className="confirm-title">Buchung bestätigt!</div>
        <div className="confirm-sub">{angelName} hat Ihre Anfrage angenommen</div>
      </div>

      <div className="confirm-body">
        <div className="person-row">
          <div className="person-av" style={{ overflow: 'visible' }}><Icon3D size={62} /></div>
          <div>
            <div className="person-name">{angelName}</div>
            <div className="person-sub"><IconCheck size={12} /> Bestätigt · Unterwegs</div>
          </div>
          <div className="person-chat"><IconChat size={18} /></div>
        </div>

        <div className="insurance">
          <div className="ins-header">
            <div className="ins-icon"><IconShield size={20} /></div>
            <div>
              <div className="ins-title">Versicherungsschutz aktiv</div>
              <div className="ins-subtitle">Automatisch für diesen Einsatz</div>
            </div>
          </div>
          <div className="ins-features">
            <div className="ins-feat"><div className="ins-check"><IconCheck size={14} /></div><div className="ins-text"><strong>Haftpflicht</strong> — Bis zu 5 Mio. € Deckung</div></div>
            <div className="ins-feat"><div className="ins-check"><IconCheck size={14} /></div><div className="ins-text"><strong>Unfallversicherung</strong> — Während des gesamten Einsatzes</div></div>
            <div className="ins-feat"><div className="ins-check"><IconCheck size={14} /></div><div className="ins-text"><strong>Sachschäden</strong> — Bis zu 50.000€ abgesichert</div></div>
          </div>
          <div className="ins-footer">Versicherungsnr.: <strong>AE-2026-00847</strong></div>
        </div>

        <div className="detail-card">
          <div className="detail-card-h">Buchungsdetails</div>
          <div className="detail-row"><div className="detail-ic"><IconCalendar size={15} /></div><div><div className="detail-lbl">Datum</div><div className="detail-val">{dateStr}</div></div></div>
          <div className="detail-row"><div className="detail-ic"><IconClock size={15} /></div><div><div className="detail-lbl">Uhrzeit</div><div className="detail-val">{timeEnd}</div></div></div>
          <div className="detail-row"><div className="detail-ic"><IconHouse size={15} /></div><div><div className="detail-lbl">Leistung</div><div className="detail-val">{booking.service || 'Alltagsbegleitung'}</div></div></div>
          <div className="detail-row"><div className="detail-ic"><IconCard size={15} /></div><div><div className="detail-lbl">Zahlung</div><div className="detail-val">{payLabel}</div></div></div>
          <div className="detail-row"><div className="detail-ic"><IconMoney size={15} /></div><div><div className="detail-lbl">Gesamtbetrag</div><div className="detail-val">{booking.total_amount ? `${Number(booking.total_amount).toFixed(2)}€` : '—'}</div></div></div>
        </div>

        <div className="action-grid">
          <Link href={`/kunde/chat/${booking.id}`}><button className="action-btn"><IconChat size={15} /> Chat</button></Link>
          <a href={`tel:${booking.angel_phone || ''}`}><button className="action-btn"><IconPhone size={15} /> Anrufen</button></a>
          <Link href={`/kunde/bewertung/${booking.id}`}><button className="action-btn">⭐ Bewerten</button></Link>
          <Link href="/kunde/home"><button className="action-btn primary"><IconHouse size={15} /> Home</button></Link>
        </div>

        {/* Stornieren — nur solange die Buchung ueberhaupt stornierbar ist.
            Welche Zustaende das sind, entscheidet die Route (und vor ihr der
            DB-Trigger); hier steht nur, wann der Knopf ueberhaupt einen Sinn
            ergibt. Ein bereits stornierter oder abgeschlossener Termin
            zeigt ihn nicht. */}
        {['pending', 'accepted'].includes(booking.status) && (
          <div style={{ padding: '0 20px 24px' }}>
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
                Termin stornieren
              </button>
            ) : (
              <div style={{ background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
                  Termin wirklich stornieren?
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink4)', marginBottom: 14, lineHeight: 1.5 }}>
                  {angelName} wird benachrichtigt und der Einsatz wird abgesagt. Das lässt sich nicht rückgängig machen.
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
      </div>
    </div>
  )
}
