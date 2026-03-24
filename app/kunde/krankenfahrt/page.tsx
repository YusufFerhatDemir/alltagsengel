'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { IconTruck, IconCard, IconShield, IconInfo } from '@/components/Icons'
import { logError } from '@/lib/safe-query'
import { useUserLocation } from '@/hooks/useUserLocation'
import type { PricingTier, PricingSurcharge, PricingBreakdown } from '@/lib/types/pricing'

export default function KrankenfahrtPage() {
  const router = useRouter()
  const supabase = createClient()

  // Form state
  const [formData, setFormData] = useState({
    abholadresse: '',
    zieladresse: '',
    datum: '',
    uhrzeit: '',
    rueckfahrt: false,
    hinweise: '',
  })
  const [selectedTier, setSelectedTier] = useState('sitzend')
  const [extraSurcharges, setExtraSurcharges] = useState<string[]>([])
  const [payMethod, setPayMethod] = useState('kasse')
  const [kkType, setKkType] = useState('gesetzlich')
  const [selectedKK, setSelectedKK] = useState('AOK')

  // Pricing data from API
  const [tiers, setTiers] = useState<PricingTier[]>([])
  const [surcharges, setSurcharges] = useState<PricingSurcharge[]>([])
  const [breakdown, setBreakdown] = useState<PricingBreakdown | null>(null)
  const [priceLoading, setPriceLoading] = useState(false)

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(true)

  // Automatische Standorterkennung (GPS → IP → Fallback)
  const userLocation = useUserLocation()

  // Load auth + pricing data on mount
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserId(user.id)

      // Load default address from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('location')
        .eq('id', user.id)
        .single()
      if (profile?.location) {
        setFormData(prev => ({ ...prev, abholadresse: profile.location }))
      }
      // Falls kein Profil-Standort → GPS/IP wird per useEffect unten gesetzt

      // Load tiers + surcharges from API
      try {
        const res = await fetch('/api/pricing/calculate')
        if (res.ok) {
          const data = await res.json()
          setTiers(data.tiers || [])
          setSurcharges(data.surcharges || [])
        }
      } catch (err) {
        logError('KrankenfahrtPage:loadPricing', err)
      }
      setDataLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // GPS/IP-Standort als Fallback für Abholadresse
  useEffect(() => {
    if (!userLocation.loading && userLocation.source !== 'fallback') {
      setFormData(prev => {
        if (!prev.abholadresse || prev.abholadresse.trim() === '') {
          return { ...prev, abholadresse: userLocation.address }
        }
        return prev
      })
    }
  }, [userLocation.loading, userLocation.address, userLocation.source])

  // Detect night hours
  function isNightTime(time: string): boolean {
    if (!time) return false
    const hour = parseInt(time.split(':')[0], 10)
    return hour >= 20 || hour < 6
  }

  // Recalculate price when inputs change
  const recalculate = useCallback(async () => {
    if (!selectedTier) return
    setPriceLoading(true)
    try {
      const res = await fetch('/api/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier_slug: selectedTier,
          estimated_km: 10, // Default estimate
          estimated_wait_minutes: 15,
          is_return_trip: formData.rueckfahrt,
          is_night: isNightTime(formData.uhrzeit),
          is_holiday: false,
          extra_surcharges: extraSurcharges,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setBreakdown(data)
      }
    } catch (err) {
      logError('KrankenfahrtPage:recalculate', err)
    }
    setPriceLoading(false)
  }, [selectedTier, formData.rueckfahrt, formData.uhrzeit, extraSurcharges])

  useEffect(() => {
    if (!dataLoading) {
      const timer = setTimeout(recalculate, 300) // Debounce
      return () => clearTimeout(timer)
    }
  }, [recalculate, dataLoading])

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const toggleSurcharge = (slug: string) => {
    setExtraSurcharges(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    )
  }

  // Selectable surcharges (exclude auto-applied ones like night/holiday)
  const selectableSurcharges = surcharges.filter(s =>
    !['night_premium', 'holiday_premium'].includes(s.slug)
  )

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')

    if (!formData.abholadresse.trim()) { setError('Bitte geben Sie eine Abholadresse ein'); setSubmitting(false); return }
    if (!formData.zieladresse.trim()) { setError('Bitte geben Sie eine Zieladresse ein'); setSubmitting(false); return }
    if (!formData.datum) { setError('Bitte wählen Sie ein Datum'); setSubmitting(false); return }
    if (!formData.uhrzeit) { setError('Bitte wählen Sie eine Uhrzeit'); setSubmitting(false); return }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Sie sind nicht eingeloggt'); setSubmitting(false); return }

      const { data: booking, error: bookErr } = await supabase
        .from('krankenfahrten')
        .insert({
          customer_id: user.id,
          abholadresse: formData.abholadresse,
          zieladresse: formData.zieladresse,
          datum: formData.datum,
          uhrzeit: formData.uhrzeit,
          rueckfahrt: formData.rueckfahrt,
          rollstuhl_benoetig: selectedTier === 'rollstuhl',
          tragestuhl_benoetig: selectedTier === 'tragestuhl',
          hinweise: formData.hinweise || null,
          payment_method: payMethod,
          insurance_type: (payMethod === 'kasse' || payMethod === 'kombi') ? kkType : null,
          insurance_provider: (payMethod === 'kasse' || payMethod === 'kombi') ? selectedKK : null,
          total_amount: breakdown?.total || 0,
          pricing_snapshot: breakdown || null,
          status: 'pending',
        })
        .select()
        .single()

      if (bookErr) {
        logError('KrankenfahrtPage:submit', bookErr.message)
        setError('Die Buchung konnte nicht erstellt werden. Bitte versuchen Sie es erneut.')
        setSubmitting(false)
        return
      }

      // Erfolgs-Meldung statt sofort-Redirect
      setSubmitting(false)
      setShowSuccess(true)
    } catch (err) {
      logError('KrankenfahrtPage:submit', err)
      setError('Ein unerwarteter Fehler ist aufgetreten')
      setSubmitting(false)
    }
  }

  const currentTier = tiers.find(t => t.slug === selectedTier)

  return (
    <div className="screen" id="krankenfahrt-form">
      {/* Erfolgs-Overlay */}
      {showSuccess && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(13,10,8,0.95)', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--gold2)', marginBottom: 8 }}>
            Fahrt erfolgreich angefragt!
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink4)', lineHeight: 1.6, marginBottom: 24, maxWidth: 340 }}>
            Wir suchen jetzt einen Fahrer in Ihrer Nähe. Sollte in Ihrem Gebiet noch kein
            Krankenfahrer verfügbar sein, bitten wir um etwas Geduld — wir bauen unser
            Netzwerk täglich aus und melden uns bei Ihnen!
          </div>
          <div style={{
            background: 'rgba(201,150,60,0.1)', border: '1px solid rgba(201,150,60,0.25)',
            borderRadius: 12, padding: '14px 20px', marginBottom: 24, maxWidth: 340,
          }}>
            <div style={{ fontSize: 13, color: 'var(--gold2)', lineHeight: 1.5 }}>
              🙏 Wir bitten vielmals um Entschuldigung, falls es in Ihrer Region noch etwas
              dauert. Neue Fahrer kommen laufend dazu!
            </div>
          </div>
          <button
            onClick={() => router.push('/kunde/krankenfahrt/fahrten')}
            style={{
              padding: '14px 32px', borderRadius: 12, border: 'none',
              background: 'var(--gold)', color: '#0D0A08', fontWeight: 700,
              fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Meine Fahrten ansehen →
          </button>
        </div>
      )}

      <div className="topbar">
        <button className="back-btn" onClick={() => router.back()} type="button">‹</button>
        <div className="topbar-title">Krankenfahrt buchen</div>
      </div>

      <div className="form-body">
        {/* Info-Banner */}
        <div style={{
          background: 'rgba(201,150,60,0.06)', border: '1px solid rgba(201,150,60,0.15)',
          borderRadius: 12, padding: '12px 16px', marginBottom: 16,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>ℹ️</span>
          <div style={{ fontSize: 12, color: 'var(--ink4)', lineHeight: 1.5 }}>
            Wir expandieren gerade in neue Regionen. Sollte noch kein Fahrer in Ihrer
            Nähe verfügbar sein, wird Ihre Anfrage vorgemerkt und wir melden uns,
            sobald ein Fahrer bereitsteht.
          </div>
        </div>
        {/* Fahrtdaten */}
        <div className="form-card">
          <div className="form-card-h">Fahrtdaten</div>
          <input className="input" type="text" placeholder="Abholadresse" value={formData.abholadresse} onChange={(e) => handleInputChange('abholadresse', e.target.value)} />
          <input className="input" type="text" placeholder="Zieladresse" value={formData.zieladresse} onChange={(e) => handleInputChange('zieladresse', e.target.value)} />
          <div className="input-row2">
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--ink4)', marginBottom: '4px' }}>Datum</label>
              <input className="input" type="date" value={formData.datum} onChange={(e) => handleInputChange('datum', e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--ink4)', marginBottom: '4px' }}>Uhrzeit</label>
              <input className="input" type="time" value={formData.uhrzeit} onChange={(e) => handleInputChange('uhrzeit', e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>
        </div>

        {/* Transportart (Tier Selection) */}
        <div className="form-card">
          <div className="form-card-h">Transportart</div>
          {dataLoading ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--ink4)', fontSize: '13px' }}>Preise werden geladen...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {tiers.map(tier => (
                <div
                  key={tier.slug}
                  className={`pay-opt${selectedTier === tier.slug ? ' on' : ''}`}
                  onClick={() => setSelectedTier(tier.slug)}
                  style={{ textAlign: 'center', padding: '14px 8px', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '4px' }}>{tier.icon || '🚐'}</div>
                  <div className="pay-lbl">{tier.name}</div>
                  <div className="pay-sub">ab {Number(tier.min_price).toFixed(0)}€</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fahrttyp */}
        <div className="form-card">
          <div className="form-card-h">Fahrttyp</div>
          <div className="pay-row">
            <div className={`pay-opt${!formData.rueckfahrt ? ' on' : ''}`} onClick={() => handleInputChange('rueckfahrt', false)}>
              <div className="pay-ic"><IconTruck size={16} /></div>
              <div className="pay-lbl">Hinfahrt</div>
              <div className="pay-sub">Einfache Fahrt</div>
            </div>
            <div className={`pay-opt${formData.rueckfahrt ? ' on' : ''}`} onClick={() => handleInputChange('rueckfahrt', true)}>
              <div className="pay-ic"><IconTruck size={16} /></div>
              <div className="pay-lbl">Hin- und Rückfahrt</div>
              <div className="pay-sub">2× Grundgebühr</div>
            </div>
          </div>
        </div>

        {/* Zusatzleistungen (Dynamic Surcharges) */}
        {selectableSurcharges.length > 0 && (
          <div className="form-card">
            <div className="form-card-h">Zusatzleistungen</div>
            {selectableSurcharges.map(sc => (
              <div key={sc.slug} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <input
                  type="checkbox"
                  id={sc.slug}
                  checked={extraSurcharges.includes(sc.slug)}
                  onChange={() => toggleSurcharge(sc.slug)}
                  style={{ width: '20px', height: '20px', cursor: 'pointer', marginRight: '12px' }}
                />
                <label htmlFor={sc.slug} style={{ cursor: 'pointer', flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{sc.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--gray)' }}>
                    {sc.surcharge_type === 'fixed' ? `+${Number(sc.value).toFixed(0)}€` : `+${Number(sc.value).toFixed(0)}%`}
                    {sc.description && ` — ${sc.description}`}
                  </div>
                </label>
              </div>
            ))}
          </div>
        )}

        {/* Spezielle Hinweise */}
        <div className="form-card">
          <div className="form-card-h">Spezielle Hinweise</div>
          <textarea className="input" rows={3} placeholder="z.B. Treppen, Gehbehinderung, spezielle Anforderungen..." value={formData.hinweise} onChange={(e) => handleInputChange('hinweise', e.target.value)} />
        </div>

        {/* Zahlungsart */}
        <div className="form-card">
          <div className="form-card-h">Zahlungsart</div>
          <div className="pay-row">
            {[
              { key: 'kasse', label: '§45b Kasse', sub: 'Direkte Abrechnung' },
              { key: 'privat', label: 'Privat', sub: 'Selbstzahler' },
              { key: 'kombi', label: 'Kombi', sub: 'Kasse + Privat' },
            ].map((p) => (
              <div key={p.key} className={`pay-opt${payMethod === p.key ? ' on' : ''}`} onClick={() => setPayMethod(p.key)}>
                <div className="pay-ic"><IconCard size={16} /></div>
                <div className="pay-lbl">{p.label}</div>
                <div className="pay-sub">{p.sub}</div>
              </div>
            ))}
          </div>

          {(payMethod === 'kasse' || payMethod === 'kombi') && (
            <div className="kk-panel show">
              <div className="kk-type-row">
                {['gesetzlich', 'privat'].map((t) => (
                  <div key={t} className={`kk-type${kkType === t ? ' on' : ''}`} onClick={() => setKkType(t)}>
                    <div className="kk-type-main">{t === 'gesetzlich' ? 'Gesetzlich' : 'Privat'}</div>
                    <div className="kk-type-sub">{t === 'gesetzlich' ? 'GKV' : 'PKV'}</div>
                  </div>
                ))}
              </div>
              <div className="kk-label">Krankenkasse wählen</div>
              <div className="kk-grid">
                {['AOK', 'TK', 'Barmer', 'DAK', 'IKK', 'KKH'].map((kk) => (
                  <div key={kk} className={`kk-item${selectedKK === kk ? ' on' : ''}`} onClick={() => setSelectedKK(kk)}>
                    <div className="kk-dot"></div>
                    <div className="kk-name">{kk}</div>
                  </div>
                ))}
              </div>
              <input className="kk-other" placeholder="Andere Kasse eingeben..." />
              <div className="kk-result">
                <IconInfo size={14} /> Mit einer <strong>Verordnung vom Arzt</strong> kann die Krankenkasse die Kosten übernehmen
              </div>
            </div>
          )}
        </div>

        {/* Versicherung Info */}
        <div className="protect-list">
          <div className="protect-item">
            <div className="protect-ic"><IconShield size={16} /></div>
            <div className="protect-text"><strong>Haftpflichtversicherung</strong> — Bis zu 5 Mio. € Deckung bei Schäden</div>
          </div>
          <div className="protect-item">
            <div className="protect-ic"><IconShield size={16} /></div>
            <div className="protect-text"><strong>Unfallversicherung</strong> — Voller Schutz während der Fahrt</div>
          </div>
        </div>

        {/* Info Banner */}
        <div style={{
          backgroundColor: 'rgba(76, 175, 80, 0.08)', border: '1px solid rgba(76, 175, 80, 0.2)',
          borderRadius: '8px', padding: '12px 14px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'flex-start',
        }}>
          <span style={{ color: '#4CAF50', marginTop: '2px', flexShrink: 0 }}><IconInfo size={18} /></span>
          <div style={{ fontSize: '14px', lineHeight: '1.4', color: 'var(--text)' }}>
            <strong>Kostenübernahme möglich</strong> — Mit einer Verordnung vom Arzt kann die Krankenkasse die Kosten übernehmen
          </div>
        </div>

        {/* Dynamic Preisberechnung */}
        <div className="total-card">
          {priceLoading || !breakdown ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--ink4)', fontSize: '13px' }}>
              {dataLoading ? 'Preise werden geladen...' : 'Preis wird berechnet...'}
            </div>
          ) : (
            <>
              <div className="total-row">
                <div className="total-lbl">Grundpreis ({breakdown.tier.name})</div>
                <div className="total-val">{breakdown.base_price.toFixed(2)}€</div>
              </div>
              <div className="total-row">
                <div className="total-lbl">Strecke (ca. 10 km)</div>
                <div className="total-val">{breakdown.distance_cost.toFixed(2)}€</div>
              </div>
              {breakdown.wait_cost > 0 && (
                <div className="total-row">
                  <div className="total-lbl">Wartezeit</div>
                  <div className="total-val">{breakdown.wait_cost.toFixed(2)}€</div>
                </div>
              )}
              {breakdown.tier_surcharge > 0 && (
                <div className="total-row">
                  <div className="total-lbl">Transportzuschlag</div>
                  <div className="total-val">{breakdown.tier_surcharge.toFixed(2)}€</div>
                </div>
              )}
              {breakdown.surcharges.map(sc => (
                <div key={sc.slug} className="total-row">
                  <div className="total-lbl">{sc.name}{sc.type === 'percentage' ? ` (${sc.value}%)` : ''}</div>
                  <div className="total-val">{sc.amount.toFixed(2)}€</div>
                </div>
              ))}
              {breakdown.is_min_price_applied && (
                <div className="total-row">
                  <div className="total-lbl" style={{ fontSize: '12px', color: 'var(--ink4)' }}>Mindestpreis angewendet</div>
                  <div className="total-val" style={{ fontSize: '12px', color: 'var(--ink4)' }}>{breakdown.min_price.toFixed(2)}€</div>
                </div>
              )}
              {formData.rueckfahrt && (
                <div className="total-row">
                  <div className="total-lbl">Hin- und Rückfahrt</div>
                  <div className="total-val">×2</div>
                </div>
              )}
              <div className="total-row">
                <div className="total-lbl">Versicherung</div>
                <div className="total-val" style={{ color: 'var(--green)' }}>Inklusive</div>
              </div>
              <div className="total-row">
                <div className="total-sum-lbl">Geschätzter Preis</div>
                <div className="total-sum">{breakdown.total.toFixed(2)}€</div>
              </div>
            </>
          )}
        </div>

        {error && (
          <div style={{
            backgroundColor: 'rgba(244, 67, 54, 0.1)', border: '1px solid rgba(244, 67, 54, 0.3)',
            borderRadius: '8px', padding: '12px 14px', marginBottom: '20px', color: '#C62828', fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        <div style={{ height: 80 }}></div>
      </div>

      <div className="submit-bar">
        <button className="btn-submit" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Wird gebucht...' : 'FAHRT BUCHEN'}
        </button>
      </div>
    </div>
  )
}
