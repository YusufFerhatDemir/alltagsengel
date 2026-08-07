'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isValidUUID, logError } from '@/lib/safe-query'
import { NotFoundState, ErrorState, LoadingState } from '@/components/UIStates'
import { IconWingsGold, IconStarFilled, IconCard, IconShield, IconMedical, IconLock, IconInfo } from '@/components/Icons'
import Icon3D from '@/components/Icon3D'
import { trackBooking } from '@/lib/tracking'
import { normalizePlz, resolvePlz } from '@/lib/expansion/plz-bundesland'
import { useBundeslandLage } from '@/lib/expansion/client'
import BundeslandHinweis from '@/components/kunde/BundeslandHinweis'
import {
  istVerfuegbar,
  isoWochentag,
  fensterProTag,
  fensterText,
  WOCHENTAGE,
  type Zeitfenster,
} from '@/lib/availability'

export default function BuchenPage() {
  const router = useRouter()
  const params = useParams()
  const angelId = params.id as string
  const [payMethod, setPayMethod] = useState('kasse')
  const [kkType, setKkType] = useState('gesetzlich')
  const [selectedKK, setSelectedKK] = useState('AOK')
  const [angel, setAngel] = useState<any>(null)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState(2)
  const [service, setService] = useState('Alltagsbegleitung')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [pageStatus, setPageStatus] = useState<'loading' | 'ok' | 'not_found' | 'error'>('loading')
  // Angehörigen-Auswahl
  const [careRecipients, setCareRecipients] = useState<any[]>([])
  const [selectedCareRecipient, setSelectedCareRecipient] = useState<string>('')
  // Kassenabrechnung: PLZ des Kunden (bzw. des Angehörigen, für den gebucht
  // wird) bestimmt das Bundesland; dessen Freischaltung in state_settings
  // entscheidet über die erlaubten Zahlungsarten (lib/expansion).
  const [customerPlz, setCustomerPlz] = useState<string | null>(null)
  const [plzLoaded, setPlzLoaded] = useState(false)
  const [plzInput, setPlzInput] = useState('')
  const [savingPlz, setSavingPlz] = useState(false)
  // Verfügbarkeits-Zeitfenster des Engels
  const [slots, setSlots] = useState<Zeitfenster[]>([])

  const loadAngel = async () => {
    setError('')
    setPageStatus('loading')
    try {
      if (!isValidUUID(angelId)) {
        setPageStatus('not_found')
        return
      }
      const supabase = createClient()
      const { data, error: fetchErr } = await supabase
        .from('angels')
        .select('*, profiles(first_name, last_name)')
        .eq('id', angelId)
        .maybeSingle()
      if (fetchErr) {
        logError('BuchenPage:loadAngel', fetchErr.message)
        setPageStatus('error')
        setError('Engel konnte nicht geladen werden')
        return
      }
      if (!data) {
        setPageStatus('not_found')
        return
      }
      setAngel(data)
      // Zeitfenster des Engels — Grundlage für die Verfügbarkeitsprüfung
      // unten. Fehler hier dürfen die Buchungsseite nicht blockieren:
      // ohne Zeitfenster greift der Fallback in lib/availability.
      const { data: slotRows } = await supabase
        .from('angel_availability')
        .select('weekday, start_time, end_time')
        .eq('angel_id', angelId)
      setSlots((slotRows || []) as Zeitfenster[])
      setPageStatus('ok')
    } catch (err) {
      logError('BuchenPage:loadAngel', err)
      setPageStatus('error')
      setError('Ein unerwarteter Fehler ist aufgetreten')
    }
  }

  useEffect(() => {
    loadAngel()
    // Angehörige + eigene PLZ laden
    const loadCareRecipients = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data }, { data: me }] = await Promise.all([
        supabase
          .from('care_recipients')
          .select('id, first_name, last_name, relationship, pflegegrad, postal_code')
          .eq('profile_id', user.id),
        supabase
          .from('profiles')
          .select('postal_code, location')
          .eq('id', user.id)
          .single(),
      ])
      setCustomerPlz(resolvePlz(me?.postal_code, me?.location))
      setPlzLoaded(true)
      if (data && data.length > 0) {
        setCareRecipients(data)
        setSelectedCareRecipient(data[0].id) // Standardmäßig den ersten Angehörigen auswählen
      }
    }
    loadCareRecipients()
  }, [angelId])

  // Maßgebliche PLZ: die des ausgewählten Angehörigen (dort findet der
  // Einsatz statt), sonst die eigene Profil-PLZ.
  const selectedCr = careRecipients.find(cr => cr.id === selectedCareRecipient)
  const effectivePlz = normalizePlz(selectedCr?.postal_code) || customerPlz

  // Kassenabrechnung nur, wenn das Bundesland des Einsatzortes freigeschaltet ist.
  const { lage, laedt: lageLaedt } = useBundeslandLage(effectivePlz)
  const kasseAllowed = lage.kassenabrechnung

  // Ohne Freischaltung (oder ohne PLZ) ist nur Privatzahlung zulässig —
  // eine evtl. gewählte Kassen-Option wird zurückgesetzt.
  useEffect(() => {
    if (plzLoaded && !kasseAllowed && payMethod !== 'privat') {
      setPayMethod('privat')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plzLoaded, kasseAllowed])

  // Passt der Wunschtermin in ein Zeitfenster des Engels? Engel ohne
  // gepflegten Kalender fallen auf ihre Wochentags-Angabe zurück
  // (siehe lib/availability.ts) — dann bleibt terminPasst true.
  const terminPasst = istVerfuegbar(slots, angel?.availability, date, time, duration)
  const gewaehlterWochentag = isoWochentag(date)
  const fensterAmTag = gewaehlterWochentag ? fensterProTag(slots, gewaehlterWochentag) : []
  const wochentagName = WOCHENTAGE.find(t => t.nr === gewaehlterWochentag)?.lang || ''

  // PLZ nachtragen (Kunde ohne hinterlegte PLZ): speichert ins Profil
  const handleSavePlz = async () => {
    const plz = normalizePlz(plzInput)
    if (!plz) return
    setSavingPlz(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').update({ postal_code: plz }).eq('id', user.id)
        setCustomerPlz(plz)
      }
    } finally {
      setSavingPlz(false)
    }
  }

  if (pageStatus === 'loading') return <LoadingState />
  if (pageStatus === 'not_found') return <NotFoundState homeHref="/kunde/home" />
  if (pageStatus === 'error') return (
    <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 24px',textAlign:'center'}}>
      <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
      <p style={{color:'var(--ink3)',fontSize:14,marginBottom:16}}>{error || 'Ein Fehler beim Laden des Engels ist aufgetreten'}</p>
      <button onClick={()=>{loadAngel()}} style={{padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold2))',color:'var(--coal)',fontSize:13,fontWeight:600,cursor:'pointer'}}>Erneut versuchen</button>
    </div>
  )

  const rate = 32 // Kundenpreis immer 32€/h
  const subtotal = rate * duration
  const platformFee = Math.round(subtotal * 0.085 * 100) / 100
  const total = subtotal + platformFee
  const angelName = angel?.profiles ? `${angel.profiles.first_name} ${angel.profiles.last_name?.[0]}.` : 'Engel'

  const handleSubmit = async () => {
    // Zu einer Zeit buchen, die der Engel geblockt hat, führt fast immer
    // zur Absage — deshalb hier abfangen statt hinterher enttäuschen.
    if (!terminPasst) {
      setError('Zu diesem Zeitpunkt ist der Engel nicht verfügbar. Bitte wählen Sie eine andere Uhrzeit.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Nicht eingeloggt'); setSubmitting(false); return }

      // Fail-safe: Kassenabrechnung nur mit hessischer PLZ — selbst wenn
      // im UI-State noch 'kasse' stehen sollte, wird privat gebucht.
      const finalPayMethod = kasseAllowed ? payMethod : 'privat'
      const withKasse = finalPayMethod === 'kasse' || finalPayMethod === 'kombi'

      const { data: booking, error: bookErr } = await supabase
        .from('bookings')
        .insert({
          customer_id: user.id,
          angel_id: angelId,
          service,
          date,
          time,
          duration_hours: duration,
          status: 'pending',
          payment_method: finalPayMethod,
          insurance_type: withKasse ? kkType : null,
          insurance_provider: withKasse ? selectedKK : null,
          total_amount: total,
          platform_fee: platformFee,
          notes: notes || null,
          care_recipient_id: selectedCareRecipient || null,
        })
        .select()
        .single()

      if (bookErr) {
        logError('BuchenPage:submit', bookErr.message)
        setError('Buchung konnte nicht erstellt werden. Bitte versuchen Sie es erneut.')
        setSubmitting(false)
        return
      }

      // Conversion-Tracking für Google Ads
      trackBooking({ service, duration, isFlexible: false, totalPrice: total })

      // Engel benachrichtigen (in-app + email) — fire and forget
      fetch('/api/bookings/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, event: 'created' }),
      }).catch(() => {})

      router.push(`/kunde/warten/${booking.id}`)
    } catch (err) {
      logError('BuchenPage:submit', err)
      setError('Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.')
      setSubmitting(false)
    }
  }

  return (
    <div className="screen" id="bform">
      <div className="topbar">
        <button className="back-btn" onClick={() => router.back()} type="button">‹</button>
        <div className="topbar-title">Buchung</div>
      </div>

      <div className="form-body">
        <div className="form-card">
          <div className="form-engel">
            <div className="form-engel-av" style={{ overflow: 'visible' }}><Icon3D size={62} /></div>
            <div>
              <div className="form-engel-name">{angelName}</div>
              <div className="form-engel-sub"><IconStarFilled size={12} /> {angel?.rating || '5.0'} · Zertifiziert</div>
            </div>
            <div className="form-engel-price">{rate}€<span>/h</span></div>
          </div>
        </div>

        {careRecipients.length > 0 && (
          <div className="form-card">
            <div className="form-card-h">Für wen buchen Sie?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                className={`pay-opt${!selectedCareRecipient ? ' on' : ''}`}
                onClick={() => setSelectedCareRecipient('')}
                style={{ padding: '10px 14px', cursor: 'pointer' }}
              >
                <div className="pay-lbl">Für mich selbst</div>
              </div>
              {careRecipients.map(cr => (
                <div
                  key={cr.id}
                  className={`pay-opt${selectedCareRecipient === cr.id ? ' on' : ''}`}
                  onClick={() => setSelectedCareRecipient(cr.id)}
                  style={{ padding: '10px 14px', cursor: 'pointer' }}
                >
                  <div className="pay-lbl">{cr.first_name} {cr.last_name}</div>
                  <div className="pay-sub">
                    {cr.relationship}{cr.pflegegrad ? ` · Pflegegrad ${cr.pflegegrad}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="form-card">
          <div className="form-card-h">Termin</div>
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <div className="input-row2">
            <input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} />
            <select className="input" value={duration} onChange={e => setDuration(Number(e.target.value))}>
              <option value={2}>2 Stunden</option><option value={3}>3 Stunden</option><option value={4}>4 Stunden</option><option value={8}>Ganzer Tag</option>
            </select>
          </div>

          {/* Verfügbarkeit nur anzeigen, wenn der Engel Zeitfenster
              gepflegt hat — sonst wäre die Aussage nicht belastbar. */}
          {slots.length > 0 && (
            <div style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
              background: terminPasst ? 'rgba(80,190,120,.09)' : 'rgba(201,150,60,.09)',
              border: `1px solid ${terminPasst ? 'rgba(80,190,120,.28)' : 'rgba(201,150,60,.28)'}`,
              color: 'var(--ink4)',
            }}>
              {terminPasst ? (
                <>✓ Der Engel ist zu diesem Termin verfügbar.</>
              ) : fensterAmTag.length > 0 ? (
                <>
                  Zu dieser Uhrzeit ist der Engel nicht verfügbar.
                  Am {wochentagName} hat er Zeit von: {fensterAmTag.map(fensterText).join(', ')}.
                </>
              ) : (
                <>Am {wochentagName} bietet dieser Engel keine Einsätze an. Bitte wählen Sie einen anderen Tag.</>
              )}
            </div>
          )}
        </div>

        <div className="form-card">
          <div className="form-card-h">Leistung</div>
          <select className="input" value={service} onChange={e => setService(e.target.value)}>
            <option>Alltagsbegleitung</option><option>Arztbesuch-Begleitung</option><option>Einkaufsbegleitung</option><option>Haushaltshilfe</option><option>Freizeitbegleitung</option><option>Krankenfahrdienst</option><option>Hygienebox</option>
          </select>
          <textarea className="input" rows={3} placeholder="Besondere Wünsche oder Hinweise..." value={notes} onChange={e => setNotes(e.target.value)}></textarea>
        </div>

        <div className="form-card">
          <div className="form-card-h">Zahlungsart</div>
          <div className="pay-row">
            {(kasseAllowed
              ? [{key:'kasse',label:'§45b Kasse',sub:'Direkte Abrechnung'},{key:'privat',label:'Privat',sub:'Selbstzahler'},{key:'kombi',label:'Kombi',sub:'Kasse + Privat'}]
              : [{key:'privat',label:'Privat',sub:'Selbstzahler'}]
            ).map(p => (
              <div key={p.key} className={`pay-opt${payMethod===p.key?' on':''}`} onClick={() => setPayMethod(p.key)}>
                <div className="pay-ic"><IconCard size={16} /></div>
                <div className="pay-lbl">{p.label}</div>
                <div className="pay-sub">{p.sub}</div>
              </div>
            ))}
          </div>

          {plzLoaded && !lageLaedt && !kasseAllowed && effectivePlz && (
            <BundeslandHinweis lage={lage} quelle="buchung" />
          )}

          {plzLoaded && !effectivePlz && (
            <div style={{
              background: 'rgba(201,150,60,0.08)', border: '1px solid rgba(201,150,60,0.2)',
              borderRadius: 10, padding: '10px 14px', marginTop: 10,
              fontSize: 13, color: 'var(--ink3)', lineHeight: 1.5,
            }}>
              <div style={{ marginBottom: 8 }}>
                Für eine Abrechnung über die Pflegekasse benötigen wir Ihre Postleitzahl —
                sie bestimmt Ihr Bundesland und damit, ob die Kassenabrechnung dort bereits
                freigeschaltet ist.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  style={{ flex: 1, margin: 0 }}
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="Ihre PLZ, z.B. 60311"
                  value={plzInput}
                  onChange={e => setPlzInput(e.target.value.replace(/\D/g, '').slice(0, 5))}
                />
                <button
                  type="button"
                  onClick={handleSavePlz}
                  disabled={savingPlz || plzInput.length !== 5}
                  style={{
                    padding: '0 18px', borderRadius: 10, border: 'none',
                    background: plzInput.length === 5 ? 'var(--gold)' : 'var(--cream3)',
                    color: plzInput.length === 5 ? '#fff' : 'var(--ink4)',
                    fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  {savingPlz ? '…' : 'Speichern'}
                </button>
              </div>
            </div>
          )}

          {kasseAllowed && (payMethod === 'kasse' || payMethod === 'kombi') && (
            <div className="kk-panel show">
              <div className="kk-type-row">
                {['gesetzlich','privat'].map(t => (
                  <div key={t} className={`kk-type${kkType===t?' on':''}`} onClick={() => setKkType(t)}>
                    <div className="kk-type-main">{t === 'gesetzlich' ? 'Gesetzlich' : 'Privat'}</div>
                    <div className="kk-type-sub">{t === 'gesetzlich' ? 'GKV' : 'PKV'}</div>
                  </div>
                ))}
              </div>
              <div className="kk-label">Krankenkasse wählen</div>
              <div className="kk-grid">
                {['AOK','TK','Barmer','DAK','IKK','KKH'].map(kk => (
                  <div key={kk} className={`kk-item${selectedKK===kk?' on':''}`} onClick={() => setSelectedKK(kk)}>
                    <div className="kk-dot"></div>
                    <div className="kk-name">{kk}</div>
                  </div>
                ))}
              </div>
              <input className="kk-other" placeholder="Andere Kasse eingeben..." />
              <div className="kk-result"><IconInfo size={14} /> Ihr <strong>§45b Budget:</strong> 131€/Monat verfügbar. Restbudget dieses Monat: <strong>131,00€</strong></div>
            </div>
          )}
        </div>

        <div className="protect-list">
          <div className="protect-item"><div className="protect-ic"><IconShield size={16} /></div><div className="protect-text"><strong>Haftpflichtversicherung</strong> — Bis zu 5 Mio. € Deckung bei Schäden</div></div>
          <div className="protect-item"><div className="protect-ic"><IconMedical size={16} /></div><div className="protect-text"><strong>Unfallversicherung</strong> — Voller Schutz während des Einsatzes</div></div>
          <div className="protect-item"><div className="protect-ic"><IconLock size={16} /></div><div className="protect-text"><strong>Datenschutz</strong> — DSGVO-konform, Ende-zu-Ende-Verschlüsselung</div></div>
        </div>

        <div className="total-card">
          <div className="total-row"><div className="total-lbl">{duration} Stunden × {rate}€</div><div className="total-val">{subtotal.toFixed(2)}€</div></div>
          <div className="total-row"><div className="total-lbl">Versicherung</div><div className="total-val" style={{ color: 'var(--green)' }}>Inklusive</div></div>
          <div className="total-row"><div className="total-lbl">Plattformgebühr</div><div className="total-val">{platformFee.toFixed(2)}€</div></div>
          <div className="total-row"><div className="total-sum-lbl">Gesamtbetrag</div><div className="total-sum">{total.toFixed(2)}€</div></div>
        </div>

        {error && <div className="ui-inline-error">{error}</div>}

        <div style={{ height: 80 }}></div>
      </div>

      <div className="submit-bar">
        <button className="btn-submit" onClick={handleSubmit} disabled={submitting || !terminPasst}>
          {submitting ? 'Wird gebucht...' : !terminPasst ? 'ZEITPUNKT NICHT VERFÜGBAR' : 'VERBINDLICH BUCHEN'}
        </button>
      </div>
    </div>
  )
}
