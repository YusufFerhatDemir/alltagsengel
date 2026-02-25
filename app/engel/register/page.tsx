'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon3D from '@/components/Icon3D'
import Link from 'next/link'

const serviceOptions = [
  { icon: '🤝', label: 'Begleitung' },
  { icon: '🏥', label: 'Arztbesuch' },
  { icon: '🛒', label: 'Einkauf' },
  { icon: '🏠', label: 'Haushalt' },
  { icon: '☕', label: 'Freizeit' },
  { icon: '🧠', label: 'Gedächtnis' },
]

const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export default function EngelRegisterPage() {
  const router = useRouter()
  const [services, setServices] = useState<string[]>(['Begleitung', 'Haushalt'])
  const [availability, setAvailability] = useState<string[]>(['Mo', 'Di', 'Mi', 'Fr'])

  const toggleService = (s: string) => {
    setServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }
  const toggleDay = (d: string) => {
    setAvailability(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  return (
    <div className="screen" id="eregister">
      <div className="topbar">
        <Link href="/choose" className="back-btn dark">‹</Link>
        <div className="topbar-title light">Engel werden</div>
      </div>

      <div className="ereg-hero">
        <div style={{ marginBottom: 16 }}><Icon3D size={72} /></div>
        <div className="ereg-title">Werden Sie ein Alltagsengel</div>
        <div className="ereg-sub">Helfen Sie Menschen in Ihrer Nähe.<br/>Versichert. Zertifiziert. Flexibel.</div>
      </div>

      <div className="ereg-form">
        <div className="ereg-steps">
          <div className="ereg-step on"></div>
          <div className="ereg-step"></div>
          <div className="ereg-step"></div>
        </div>

        <div className="form-card">
          <div className="form-card-h">Persönliche Daten</div>
          <div className="input-row2">
            <input className="input" type="text" placeholder="Vorname" />
            <input className="input" type="text" placeholder="Nachname" />
          </div>
          <input className="input" type="email" placeholder="E-Mail-Adresse" />
          <input className="input" type="tel" placeholder="Telefonnummer" />
          <input className="input" type="text" placeholder="PLZ & Stadt" />
        </div>

        <div className="form-card">
          <div className="form-card-h">Qualifikationen</div>
          <select className="input">
            <option value="" disabled selected>Erfahrung wählen...</option>
            <option>Pflegehelfer/in</option>
            <option>Altenpfleger/in</option>
            <option>Krankenpfleger/in</option>
            <option>Alltagsbegleiter/in (§45b)</option>
            <option>Betreuungskraft (§53b)</option>
            <option>Sonstige Qualifikation</option>
          </select>
          <div className="ereg-hint">Haben Sie eine Zertifizierung nach §45b SGB XI? Diese wird für die Abrechnung mit Pflegekassen benötigt.</div>
        </div>

        <div className="form-card">
          <div className="form-card-h">Angebotene Leistungen</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {serviceOptions.map(s => (
              <label key={s.label} className={`ereg-tag${services.includes(s.label) ? ' on' : ''}`} onClick={() => toggleService(s.label)}>
                {s.icon} {s.label}
              </label>
            ))}
          </div>
        </div>

        <div className="form-card">
          <div className="form-card-h">Verfügbarkeit</div>
          <div className="avail-row">
            {days.map(d => (
              <div key={d} className={`avail-day${availability.includes(d) ? ' on' : ''}`} onClick={() => toggleDay(d)}>
                <div className="day-name">{d}</div>
                <div className="day-dot"></div>
              </div>
            ))}
          </div>
        </div>

        <div className="form-card">
          <div className="form-card-h">Stundensatz</div>
          <div className="ereg-rate">
            <input className="input" type="number" placeholder="30" min={15} max={60} />
            <span className="ereg-rate-unit">€ / Stunde</span>
          </div>
          <div className="ereg-hint">Empfohlen: 25–40€/Std. je nach Region und Qualifikation.</div>
        </div>

        <div className="ereg-agree">
          <div className="ereg-agree-row">
            <div className="ereg-checkbox">✓</div>
            <div className="ereg-agree-text">Ich akzeptiere die <strong>AGB</strong>, <strong>Datenschutzerklärung</strong> und bestätige meine Qualifikation. Versicherungsschutz wird bei Aufträgen automatisch aktiviert.</div>
          </div>
        </div>
      </div>

      <div className="submit-bar">
        <button className="btn-submit" onClick={() => router.push('/engel/home')}>REGISTRIERUNG ABSCHLIESSEN</button>
      </div>
    </div>
  )
}
