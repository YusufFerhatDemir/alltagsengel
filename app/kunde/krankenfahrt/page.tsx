'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { IconTruck, IconCard, IconShield, IconInfo } from '@/components/Icons'
import { logError } from '@/lib/safe-query'

export default function KrankenfahrtPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    abholadresse: '',
    zieladresse: '',
    datum: '',
    uhrzeit: '',
    rueckfahrt: false,
    rollstuhl: false,
    tragestuhl: false,
    hinweise: '',
  })
  
  const [payMethod, setPayMethod] = useState('kasse')
  const [kkType, setKkType] = useState('gesetzlich')
  const [selectedKK, setSelectedKK] = useState('AOK')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }
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
    }
    checkAuth()
  }, [router])

  // Kalkulationen
  const grundgebuehr = 8.50
  const kosten_pro_km = 0.35
  const rollstuhl_zuschlag = formData.rollstuhl ? 15 : 0
  const tragestuhl_zuschlag = formData.tragestuhl ? 15 : 0
  
  // Vereinfachte Kalkulation: durchschnittlich 10 km pro Fahrt
  const km_estimate = 10
  const km_kosten = km_estimate * kosten_pro_km
  
  const subtotal_einfach = grundgebuehr + km_kosten + rollstuhl_zuschlag + tragestuhl_zuschlag
  const subtotal = formData.rueckfahrt ? subtotal_einfach * 2 : subtotal_einfach
  const total = subtotal

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')

    // Validierung
    if (!formData.abholadresse.trim()) {
      setError('Bitte geben Sie eine Abholadresse ein')
      setSubmitting(false)
      return
    }
    if (!formData.zieladresse.trim()) {
      setError('Bitte geben Sie eine Zieladresse ein')
      setSubmitting(false)
      return
    }
    if (!formData.datum) {
      setError('Bitte wählen Sie ein Datum')
      setSubmitting(false)
      return
    }
    if (!formData.uhrzeit) {
      setError('Bitte wählen Sie eine Uhrzeit')
      setSubmitting(false)
      return
    }

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Sie sind nicht eingeloggt')
        setSubmitting(false)
        return
      }

      const { data: booking, error: bookErr } = await supabase
        .from('krankenfahrten')
        .insert({
          customer_id: user.id,
          abholadresse: formData.abholadresse,
          zieladresse: formData.zieladresse,
          datum: formData.datum,
          uhrzeit: formData.uhrzeit,
          rueckfahrt: formData.rueckfahrt,
          rollstuhl_benoetig: formData.rollstuhl,
          tragestuhl_benoetig: formData.tragestuhl,
          hinweise: formData.hinweise || null,
          payment_method: payMethod,
          insurance_type: (payMethod === 'kasse' || payMethod === 'kombi') ? kkType : null,
          insurance_provider: (payMethod === 'kasse' || payMethod === 'kombi') ? selectedKK : null,
          total_amount: total,
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

      router.push('/kunde/home')
    } catch (err) {
      logError('KrankenfahrtPage:submit', err)
      setError('Ein unerwarteter Fehler ist aufgetreten')
      setSubmitting(false)
    }
  }

  return (
    <div className="screen" id="krankenfahrt-form">
      <div className="topbar">
        <button className="back-btn" onClick={() => router.back()} type="button">‹</button>
        <div className="topbar-title">Krankenfahrt buchen</div>
      </div>

      <div className="form-body">
        {/* Fahrtdaten */}
        <div className="form-card">
          <div className="form-card-h">Fahrtdaten</div>
          <input
            className="input"
            type="text"
            placeholder="Abholadresse"
            value={formData.abholadresse}
            onChange={(e) => handleInputChange('abholadresse', e.target.value)}
          />
          <input
            className="input"
            type="text"
            placeholder="Zieladresse"
            value={formData.zieladresse}
            onChange={(e) => handleInputChange('zieladresse', e.target.value)}
          />
          <div className="input-row2">
            <input
              className="input"
              type="date"
              value={formData.datum}
              onChange={(e) => handleInputChange('datum', e.target.value)}
            />
            <input
              className="input"
              type="time"
              value={formData.uhrzeit}
              onChange={(e) => handleInputChange('uhrzeit', e.target.value)}
            />
          </div>
        </div>

        {/* Fahrttyp */}
        <div className="form-card">
          <div className="form-card-h">Fahrttyp</div>
          <div className="pay-row">
            <div
              className={`pay-opt${!formData.rueckfahrt ? ' on' : ''}`}
              onClick={() => handleInputChange('rueckfahrt', false)}
            >
              <div className="pay-ic"><IconTruck size={16} /></div>
              <div className="pay-lbl">Hinfahrt</div>
              <div className="pay-sub">Einfache Fahrt</div>
            </div>
            <div
              className={`pay-opt${formData.rueckfahrt ? ' on' : ''}`}
              onClick={() => handleInputChange('rueckfahrt', true)}
            >
              <div className="pay-ic"><IconTruck size={16} /></div>
              <div className="pay-lbl">Hin- und Rückfahrt</div>
              <div className="pay-sub">2× Grundgebühr</div>
            </div>
          </div>
        </div>

        {/* Zusatzausstattung */}
        <div className="form-card">
          <div className="form-card-h">Zusatzausstattung</div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <input
              type="checkbox"
              id="rollstuhl"
              checked={formData.rollstuhl}
              onChange={(e) => handleInputChange('rollstuhl', e.target.checked)}
              style={{ width: '20px', height: '20px', cursor: 'pointer', marginRight: '12px' }}
            />
            <label htmlFor="rollstuhl" style={{ cursor: 'pointer', flex: 1 }}>
              <div style={{ fontWeight: 500 }}>Rollstuhl benötigt</div>
              <div style={{ fontSize: '13px', color: 'var(--gray)' }}>+15€</div>
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0' }}>
            <input
              type="checkbox"
              id="tragestuhl"
              checked={formData.tragestuhl}
              onChange={(e) => handleInputChange('tragestuhl', e.target.checked)}
              style={{ width: '20px', height: '20px', cursor: 'pointer', marginRight: '12px' }}
            />
            <label htmlFor="tragestuhl" style={{ cursor: 'pointer', flex: 1 }}>
              <div style={{ fontWeight: 500 }}>Tragestuhl benötigt</div>
              <div style={{ fontSize: '13px', color: 'var(--gray)' }}>+15€</div>
            </label>
          </div>
        </div>

        {/* Spezielle Hinweise */}
        <div className="form-card">
          <div className="form-card-h">Spezielle Hinweise</div>
          <textarea
            className="input"
            rows={3}
            placeholder="z.B. Treppen, Gehbehinderung, spezielle Anforderungen..."
            value={formData.hinweise}
            onChange={(e) => handleInputChange('hinweise', e.target.value)}
          />
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
              <div
                key={p.key}
                className={`pay-opt${payMethod === p.key ? ' on' : ''}`}
                onClick={() => setPayMethod(p.key)}
              >
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
                  <div
                    key={t}
                    className={`kk-type${kkType === t ? ' on' : ''}`}
                    onClick={() => setKkType(t)}
                  >
                    <div className="kk-type-main">{t === 'gesetzlich' ? 'Gesetzlich' : 'Privat'}</div>
                    <div className="kk-type-sub">{t === 'gesetzlich' ? 'GKV' : 'PKV'}</div>
                  </div>
                ))}
              </div>
              <div className="kk-label">Krankenkasse wählen</div>
              <div className="kk-grid">
                {['AOK', 'TK', 'Barmer', 'DAK', 'IKK', 'KKH'].map((kk) => (
                  <div
                    key={kk}
                    className={`kk-item${selectedKK === kk ? ' on' : ''}`}
                    onClick={() => setSelectedKK(kk)}
                  >
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
            <div className="protect-text">
              <strong>Haftpflichtversicherung</strong> — Bis zu 5 Mio. € Deckung bei Schäden
            </div>
          </div>
          <div className="protect-item">
            <div className="protect-ic"><IconShield size={16} /></div>
            <div className="protect-text">
              <strong>Unfallversicherung</strong> — Voller Schutz während der Fahrt
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div style={{
          backgroundColor: 'rgba(76, 175, 80, 0.08)',
          border: '1px solid rgba(76, 175, 80, 0.2)',
          borderRadius: '8px',
          padding: '12px 14px',
          marginBottom: '20px',
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-start',
        }}>
          <span style={{ color: '#4CAF50', marginTop: '2px', flexShrink: 0 }}><IconInfo size={18} /></span>
          <div style={{ fontSize: '14px', lineHeight: '1.4', color: 'var(--text)' }}>
            <strong>Kostenübernahme möglich</strong> — Mit einer Verordnung vom Arzt kann die Krankenkasse die Kosten übernehmen
          </div>
        </div>

        {/* Preisberechnung */}
        <div className="total-card">
          <div className="total-row">
            <div className="total-lbl">Grundgebühr</div>
            <div className="total-val">{grundgebuehr.toFixed(2)}€</div>
          </div>
          <div className="total-row">
            <div className="total-lbl">Kilometerkosten ({km_estimate} km)</div>
            <div className="total-val">{km_kosten.toFixed(2)}€</div>
          </div>
          {formData.rollstuhl && (
            <div className="total-row">
              <div className="total-lbl">Rollstuhl</div>
              <div className="total-val">{rollstuhl_zuschlag.toFixed(2)}€</div>
            </div>
          )}
          {formData.tragestuhl && (
            <div className="total-row">
              <div className="total-lbl">Tragestuhl</div>
              <div className="total-val">{tragestuhl_zuschlag.toFixed(2)}€</div>
            </div>
          )}
          {formData.rueckfahrt && (
            <div className="total-row">
              <div className="total-lbl">Rückfahrt (2× Grundgebühr)</div>
              <div className="total-val">{grundgebuehr.toFixed(2)}€</div>
            </div>
          )}
          <div className="total-row">
            <div className="total-lbl">Versicherung</div>
            <div className="total-val" style={{ color: 'var(--green)' }}>Inklusive</div>
          </div>
          <div className="total-row">
            <div className="total-sum-lbl">Geschätzter Preis</div>
            <div className="total-sum">{total.toFixed(2)}€</div>
          </div>
        </div>

        {error && (
          <div style={{
            backgroundColor: 'rgba(244, 67, 54, 0.1)',
            border: '1px solid rgba(244, 67, 54, 0.3)',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '20px',
            color: '#C62828',
            fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        <div style={{ height: 80 }}></div>
      </div>

      <div className="submit-bar">
        <button
          className="btn-submit"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Wird gebucht...' : 'FAHRT BUCHEN'}
        </button>
      </div>
    </div>
  )
}
