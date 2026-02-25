'use client'
import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function BuchenPage() {
  const router = useRouter()
  const params = useParams()
  const [payMethod, setPayMethod] = useState('kasse')
  const [kkType, setKkType] = useState('gesetzlich')
  const [selectedKK, setSelectedKK] = useState('AOK')

  const handleSubmit = () => {
    router.push(`/kunde/warten/${params.id}`)
  }

  return (
    <div className="screen" id="bform">
      <div className="topbar">
        <Link href={`/kunde/engel/${params.id}`} className="back-btn">‹</Link>
        <div className="topbar-title">Buchung</div>
      </div>

      <div className="form-body">
        <div className="form-card">
          <div className="form-engel">
            <div className="form-engel-av">👼</div>
            <div>
              <div className="form-engel-name">Anna Müller</div>
              <div className="form-engel-sub">★ 4.9 · Zertifiziert</div>
            </div>
            <div className="form-engel-price">32€<span>/h</span></div>
          </div>
        </div>

        <div className="form-card">
          <div className="form-card-h">Termin</div>
          <input className="input" type="date" defaultValue="2026-03-01" />
          <div className="input-row2">
            <input className="input" type="time" defaultValue="10:00" />
            <select className="input">
              <option>2 Stunden</option><option>3 Stunden</option><option>4 Stunden</option><option>Ganzer Tag</option>
            </select>
          </div>
        </div>

        <div className="form-card">
          <div className="form-card-h">Leistung</div>
          <select className="input">
            <option>Alltagsbegleitung</option><option>Arztbesuch-Begleitung</option><option>Einkaufsbegleitung</option><option>Haushaltshilfe</option><option>Freizeitbegleitung</option>
          </select>
          <textarea className="input" rows={3} placeholder="Besondere Wünsche oder Hinweise..."></textarea>
        </div>

        <div className="form-card">
          <div className="form-card-h">Zahlungsart</div>
          <div className="pay-row">
            {[{key:'kasse',icon:'💳',label:'§45b Kasse',sub:'Direkte Abrechnung'},{key:'privat',icon:'💳',label:'Privat',sub:'Selbstzahler'},{key:'kombi',icon:'💳',label:'Kombi',sub:'Kasse + Privat'}].map(p => (
              <div key={p.key} className={`pay-opt${payMethod===p.key?' on':''}`} onClick={() => setPayMethod(p.key)}>
                <div className="pay-ic">{p.icon}</div>
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
              <div className="kk-result">ℹ️ Ihr <strong>§45b Budget:</strong> 125€/Monat verfügbar. Restbudget dieses Monat: <strong>125,00€</strong></div>
            </div>
          )}
        </div>

        <div className="protect-list">
          <div className="protect-item"><div className="protect-ic">🛡️</div><div className="protect-text"><strong>Haftpflichtversicherung</strong> — Bis zu 5 Mio. € Deckung bei Schäden</div></div>
          <div className="protect-item"><div className="protect-ic">🏥</div><div className="protect-text"><strong>Unfallversicherung</strong> — Voller Schutz während des Einsatzes</div></div>
          <div className="protect-item"><div className="protect-ic">🔒</div><div className="protect-text"><strong>Datenschutz</strong> — DSGVO-konform, Ende-zu-Ende-Verschlüsselung</div></div>
        </div>

        <div className="total-card">
          <div className="total-row"><div className="total-lbl">2 Stunden × 32€</div><div className="total-val">64,00€</div></div>
          <div className="total-row"><div className="total-lbl">Versicherung</div><div className="total-val" style={{ color: 'var(--green)' }}>Inklusive</div></div>
          <div className="total-row"><div className="total-lbl">Plattformgebühr</div><div className="total-val">5,90€</div></div>
          <div className="total-row"><div className="total-sum-lbl">Gesamtbetrag</div><div className="total-sum">69,90€</div></div>
        </div>

        <div style={{ height: 80 }}></div>
      </div>

      <div className="submit-bar">
        <button className="btn-submit" onClick={handleSubmit}>VERBINDLICH BUCHEN</button>
      </div>
    </div>
  )
}
