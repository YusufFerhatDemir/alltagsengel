'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [qualification, setQualification] = useState('')
  const [hourlyRate, setHourlyRate] = useState(30)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState<{ first_name: string; last_name: string; email: string } | null>(null)

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('profiles').select('first_name, last_name, email').eq('id', user.id).single()
        if (data) setProfile(data)
      }
    }
    loadProfile()
  }, [])

  const toggleService = (s: string) => {
    setServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }
  const toggleDay = (d: string) => {
    setAvailability(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Nicht eingeloggt'); setSubmitting(false); return }

    const { error: angelError } = await supabase.from('angels').upsert({
      id: user.id,
      hourly_rate: hourlyRate,
      services,
      availability,
      bio: null,
      qualification: qualification || null,
      is_certified: qualification.includes('45b') || qualification.includes('53b'),
      is_45b_capable: qualification.includes('45b'),
      is_online: true,
      total_jobs: 0,
      rating: 5.0,
      satisfaction_pct: 100,
    })

    if (angelError) { setError(angelError.message); setSubmitting(false); return }

    if (phone || location) {
      await supabase.from('profiles').update({
        ...(phone ? { phone } : {}),
        ...(location ? { location } : {}),
      }).eq('id', user.id)
    }

    router.push('/engel/home')
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
            <input className="input" type="text" placeholder="Vorname" defaultValue={profile?.first_name || ''} readOnly style={{ opacity: .7 }} />
            <input className="input" type="text" placeholder="Nachname" defaultValue={profile?.last_name || ''} readOnly style={{ opacity: .7 }} />
          </div>
          <input className="input" type="email" placeholder="E-Mail-Adresse" defaultValue={profile?.email || ''} readOnly style={{ opacity: .7 }} />
          <input className="input" type="tel" placeholder="Telefonnummer" value={phone} onChange={e => setPhone(e.target.value)} />
          <input className="input" type="text" placeholder="PLZ & Stadt" value={location} onChange={e => setLocation(e.target.value)} />
        </div>

        <div className="form-card">
          <div className="form-card-h">Qualifikationen</div>
          <select className="input" value={qualification} onChange={e => setQualification(e.target.value)}>
            <option value="">Erfahrung wählen...</option>
            <option value="Pflegehelfer/in">Pflegehelfer/in</option>
            <option value="Altenpfleger/in">Altenpfleger/in</option>
            <option value="Krankenpfleger/in">Krankenpfleger/in</option>
            <option value="Alltagsbegleiter/in (§45b)">Alltagsbegleiter/in (§45b)</option>
            <option value="Betreuungskraft (§53b)">Betreuungskraft (§53b)</option>
            <option value="Sonstige Qualifikation">Sonstige Qualifikation</option>
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
            <input className="input" type="number" placeholder="30" min={15} max={60} value={hourlyRate} onChange={e => setHourlyRate(Number(e.target.value))} />
            <span className="ereg-rate-unit">€ / Stunde</span>
          </div>
          <div className="ereg-hint">Empfohlen: 25–40€/Std. je nach Region und Qualifikation.</div>
        </div>

        {error && <div style={{ color: 'var(--red-w)', padding: '8px 16px', fontSize: 13 }}>{error}</div>}

        <div className="ereg-agree">
          <div className="ereg-agree-row">
            <div className="ereg-checkbox">✓</div>
            <div className="ereg-agree-text">Ich akzeptiere die <strong>AGB</strong>, <strong>Datenschutzerklärung</strong> und bestätige meine Qualifikation. Versicherungsschutz wird bei Aufträgen automatisch aktiviert.</div>
          </div>
        </div>
      </div>

      <div className="submit-bar">
        <button className="btn-submit" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Wird gespeichert...' : 'REGISTRIERUNG ABSCHLIESSEN'}
        </button>
      </div>
    </div>
  )
}
