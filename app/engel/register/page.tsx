'use client'
import { useState, useEffect, useRef, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { geocodePLZ, extractPLZ } from '@/lib/geocoding'
import Icon3D from '@/components/Icon3D'
import { IconHandshake, IconMedical, IconBag, IconHome as IconHouse, IconCoffee, IconTarget, IconCheck } from '@/components/Icons'

const serviceOptions: { icon: ReactNode; label: string }[] = [
  { icon: <IconHandshake size={16} />, label: 'Begleitung' },
  { icon: <IconMedical size={16} />, label: 'Arztbesuch' },
  { icon: <IconBag size={16} />, label: 'Einkauf' },
  { icon: <IconHouse size={16} />, label: 'Haushalt' },
  { icon: <IconCoffee size={16} />, label: 'Freizeit' },
  { icon: <IconTarget size={16} />, label: 'Aktivitäten' },
]

const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export default function EngelRegisterPage() {
  const router = useRouter()
  const [services, setServices] = useState<string[]>(['Begleitung', 'Haushalt'])
  const [availability, setAvailability] = useState<string[]>(['Mo', 'Di', 'Mi', 'Fr'])
  const [phone, setPhone] = useState('')
  const [plz, setPlz] = useState('')
  const [stadt, setStadt] = useState('')
  const [location, setLocation] = useState('')
  const [qualification, setQualification] = useState('')
  const hourlyRate = 32 // Kundenpreis – Engel-Vergütung (20€) wird intern geregelt
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('profiles').select('first_name, last_name, email').eq('id', user.id).single()
        if (data) {
          setFirstName(data.first_name || '')
          setLastName(data.last_name || '')
          setEmail(data.email || '')
        }
      }
    }
    loadProfile()
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
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

    const profileUpdate: Record<string, any> = {}
    if (firstName) profileUpdate.first_name = firstName
    if (lastName) profileUpdate.last_name = lastName
    if (email) profileUpdate.email = email
    if (phone) profileUpdate.phone = phone
    if (plz || stadt) {
      profileUpdate.location = [plz, stadt].filter(Boolean).join(' ')
      if (plz && plz.length === 5) {
        profileUpdate.postal_code = plz
        const coords = await geocodePLZ(plz)
        if (coords) {
          profileUpdate.latitude = coords.lat
          profileUpdate.longitude = coords.lng
        }
      }
    }
    if (Object.keys(profileUpdate).length > 0) {
      await supabase.from('profiles').update(profileUpdate).eq('id', user.id)
    }

    router.push('/engel/home')
  }

  return (
    <div className="screen" id="eregister">
      <div className="topbar">
        <button className="back-btn dark" onClick={() => router.back()} type="button">‹</button>
        <div className="topbar-title light" style={{ flex: 1 }}>Engel werden</div>
        <div className="topbar-menu" ref={menuRef}>
          <button className="topbar-dots dark" onClick={() => setMenuOpen(!menuOpen)} type="button">⋮</button>
          {menuOpen && (
            <div className="topbar-dropdown">
              <button onClick={() => { setMenuOpen(false); router.push('/choose') }}>Rollenwahl</button>
              <button onClick={() => { setMenuOpen(false); router.push('/auth/login') }}>Abmelden</button>
            </div>
          )}
        </div>
      </div>

      <div className="ereg-hero">
        <div style={{ marginBottom: 16 }}><Icon3D size={72} /></div>
        <div className="ereg-title">Werden Sie ein Alltagsengel</div>
        <div className="ereg-sub">Helfen Sie Menschen in Ihrer Nähe.<br/>Versichert. Zertifiziert. Flexibel.</div>
      </div>

      <form className="ereg-form" onSubmit={e => { e.preventDefault(); handleSubmit() }}>
        <div className="ereg-steps">
          <div className="ereg-step on"></div>
          <div className="ereg-step"></div>
          <div className="ereg-step"></div>
        </div>

        <div className="form-card">
          <div className="form-card-h">Persönliche Daten</div>
          <div className="input-row2">
            <input className="input" type="text" placeholder="Vorname" value={firstName} onChange={e => setFirstName(e.target.value)} />
            <input className="input" type="text" placeholder="Nachname" value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>
          <input className="input" type="email" placeholder="E-Mail-Adresse" value={email} onChange={e => setEmail(e.target.value)} />
          <input className="input" type="tel" placeholder="Telefonnummer" value={phone} onChange={e => setPhone(e.target.value)} />
          <div className="input-row2">
            <input className="input" type="text" placeholder="PLZ" value={plz} onChange={e => setPlz(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" maxLength={5} minLength={5} required style={{ maxWidth: 100 }} />
            <input className="input" type="text" placeholder="Stadt" value={stadt} onChange={e => setStadt(e.target.value)} required />
          </div>
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
            <div className="input" style={{ display: 'flex', alignItems: 'center', color: 'var(--gold2)', fontWeight: 700, fontSize: 18 }}>20</div>
            <span className="ereg-rate-unit">€ / Stunde</span>
          </div>
          <div className="ereg-hint">Der Stundensatz wird zentral von Alltagsengel festgelegt.</div>
        </div>

        {error && <div style={{ color: 'var(--red-w)', padding: '8px 16px', fontSize: 13 }}>{error}</div>}

        <div className="ereg-agree">
          <div className="ereg-agree-row">
            <div className="ereg-checkbox"><IconCheck size={14} /></div>
            <div className="ereg-agree-text">Ich akzeptiere die <strong>AGB</strong>, <strong>Datenschutzerklärung</strong> und bestätige meine Qualifikation. Versicherungsschutz wird bei Aufträgen automatisch aktiviert.</div>
          </div>
        </div>

        <div className="submit-bar">
          <button className="btn-submit" type="submit" disabled={submitting}>
            {submitting ? 'Wird gespeichert...' : 'REGISTRIERUNG ABSCHLIESSEN'}
          </button>
        </div>
      </form>
    </div>
  )
}
