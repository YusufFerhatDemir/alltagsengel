'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isValidUUID, logError } from '@/lib/safe-query'
import { NotFoundState, ErrorState, LoadingState } from '@/components/UIStates'
import { IconWingsGold, IconStarFilled, IconCard, IconShield, IconMedical, IconLock, IconInfo } from '@/components/Icons'
import Icon3D from '@/components/Icon3D'

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
      setPageStatus('ok')
    } catch (err) {
      logError('BuchenPage:loadAngel', err)
      setPageStatus('error')
      setError('Ein unerwarteter Fehler ist aufgetreten')
    }
  }

  useEffect(() => {
    loadAngel()
  }, [angelId])

  if (pageStatus === 'loading') return <LoadingState />
  if (pageStatus === 'not_found') return <NotFoundState homeHref="/kunde/home" />
  if (pageStatus === 'error') return (
    <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 24px',textAlign:'center'}}>
      <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
      <p style={{color:'var(--ink3)',fontSize:14,marginBottom:16}}>{error || 'Ein Fehler beim Laden des Engels ist aufgetreten'}</p>
      <button onClick={()=>{loadAngel()}} style={{padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold2))',color:'var(--coal)',fontSize:13,fontWeight:600,cursor:'pointer'}}>Erneut versuchen</button>
    </div>
  )

  const rate = angel?.hourly_rate || 32
  const subtotal = rate * duration
  const platformFee = Math.round(subtotal * 0.085 * 100) / 100
  const total = subtotal + platformFee
  const angelName = angel?.profiles ? `${angel.profiles.first_name} ${angel.profiles.last_name?.[0]}.` : 'Engel'

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Nicht eingeloggt'); setSubmitting(false); return }

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
          payment_method: payMethod,
          insurance_type: (payMethod === 'kasse' || payMethod === 'kombi') ? kkType : null,
          insurance_provider: (payMethod === 'kasse' || payMethod === 'kombi') ? selectedKK : null,
          total_amount: total,
          platform_fee: platformFee,
          notes: notes || null,
        })
        .select()
        .single()

      if (bookErr) {
        logError('BuchenPage:submit', bookErr.message)
        setError('Buchung konnte nicht erstellt werden. Bitte versuchen Sie es erneut.')
        setSubmitting(false)
        return
      }

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

        <div className="form-card">
          <div className="form-card-h">Termin</div>
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <div className="input-row2">
            <input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} />
            <select className="input" value={duration} onChange={e => setDuration(Number(e.target.value))}>
              <option value={2}>2 Stunden</option><option value={3}>3 Stunden</option><option value={4}>4 Stunden</option><option value={8}>Ganzer Tag</option>
            </select>
          </div>
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
            {[{key:'kasse',label:'§45b Kasse',sub:'Direkte Abrechnung'},{key:'privat',label:'Privat',sub:'Selbstzahler'},{key:'kombi',label:'Kombi',sub:'Kasse + Privat'}].map(p => (
              <div key={p.key} className={`pay-opt${payMethod===p.key?' on':''}`} onClick={() => setPayMethod(p.key)}>
                <div className="pay-ic"><IconCard size={16} /></div>
                <div className="pay-lbl">{p.label}</div>
                <div className="pay-sub">{p.sub}</div>
              </div>
            ))}
          </div>

          {(payMethod === 'kasse' || payMethod === 'kombi') && (
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
        <button className="btn-submit" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Wird gebucht...' : 'VERBINDLICH BUCHEN'}
        </button>
      </div>
    </div>
  )
}
