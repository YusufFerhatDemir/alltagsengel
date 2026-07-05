'use client'
import { useMemo, useState } from 'react'
import { trackContactRequest } from '@/lib/tracking'

// ═══════════════════════════════════════════════════════════
// ONLINE-TERMINBUCHUNG — 3 Schritte, ohne Registrierung
// ═══════════════════════════════════════════════════════════
// Leistung → Wunschtag + Zeitfenster → Kontaktdaten.
// Speichert über /api/lead-inquiry (Terminwunsch in message),
// das Team ruft zur Bestätigung zurück.
// ═══════════════════════════════════════════════════════════

const LEISTUNGEN = [
  { id: 'Beratungsgespräch', icon: '📞', name: 'Kostenlose Beratung', detail: 'Telefonisch — Entlastungsbetrag, Pflegegrad & Leistungen' },
  { id: 'Alltagsbegleitung', icon: '💛', name: 'Alltagsbegleitung starten', detail: 'Kennenlern-Termin mit Ihrem Engel bei Ihnen zu Hause' },
  { id: 'Pflege-Box', icon: '📦', name: 'Pflege-Box einrichten', detail: 'Beratung zu kostenlosen Pflegehilfsmitteln (§40)' },
  { id: 'Krankenfahrt', icon: '🚗', name: 'Krankenfahrt planen', detail: 'Fahrt zu Arzt, Klinik, Dialyse oder Therapie' },
]

const ZEITFENSTER = [
  { id: 'Vormittag', label: 'Vormittag', zeit: '9–12 Uhr' },
  { id: 'Mittag', label: 'Mittag', zeit: '12–15 Uhr' },
  { id: 'Nachmittag', label: 'Nachmittag', zeit: '15–18 Uhr' },
]

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

function naechsteTage(anzahl: number): Date[] {
  const tage: Date[] = []
  const d = new Date()
  d.setDate(d.getDate() + 1) // ab morgen
  while (tage.length < anzahl) {
    if (d.getDay() !== 0) tage.push(new Date(d)) // Sonntage überspringen
    d.setDate(d.getDate() + 1)
  }
  return tage
}

export default function TerminBuchung() {
  const [schritt, setSchritt] = useState(1)
  const [leistung, setLeistung] = useState('')
  const [tag, setTag] = useState<Date | null>(null)
  const [fenster, setFenster] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', plz: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [honeypot, setHoneypot] = useState('')

  const tage = useMemo(() => naechsteTage(12), [])

  const card: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 'clamp(18px, 3vw, 28px)' }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)', color: '#F5F0E8', fontSize: 15, outline: 'none', boxSizing: 'border-box',
  }

  async function absenden(e: React.FormEvent) {
    e.preventDefault()
    if (!tag) return
    setStatus('sending')
    const datum = `${WOCHENTAGE[tag.getDay()]}, ${tag.getDate()}. ${MONATE_KURZ[tag.getMonth()]} ${tag.getFullYear()}`
    try {
      const res = await fetch('/api/lead-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          website: honeypot,
          service: leistung,
          source: 'terminbuchung',
          message: `ONLINE-TERMINWUNSCH: ${leistung} — ${datum}, ${fenster} (${ZEITFENSTER.find(z => z.id === fenster)?.zeit}). Bitte zur Bestätigung zurückrufen.`,
        }),
      })
      if (res.ok) {
        setStatus('sent')
        trackContactRequest('terminbuchung')
      } else {
        // Server-Fehlermeldung anzeigen (z. B. "Ungültige Telefonnummer")
        const data = await res.json().catch(() => null)
        setErrorMsg(data?.error || '')
        setStatus('error')
      }
    } catch {
      setErrorMsg('')
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
        <h3 style={{ color: '#F5F0E8', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Terminwunsch eingegangen!</h3>
        <p style={{ color: '#B8B0A4', fontSize: 14, lineHeight: 1.6 }}>
          {tag && <>Ihr Wunschtermin: <strong style={{ color: '#E8C87E' }}>{WOCHENTAGE[tag.getDay()]}, {tag.getDate()}. {MONATE_KURZ[tag.getMonth()]}, {ZEITFENSTER.find(z => z.id === fenster)?.zeit}</strong>.<br /></>}
          Wir rufen Sie kurz zur Bestätigung an — kostenlos und unverbindlich.<br />
          Herzliche Grüße, Ihr Team von Alltagsengel
        </p>
      </div>
    )
  }

  return (
    <div style={card}>
      {/* Fortschritt */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18 }} aria-hidden="true">
        {[1, 2, 3].map(s => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s < schritt ? '#C9963C' : s === schritt ? 'rgba(201,150,60,0.5)' : 'rgba(255,255,255,0.08)' }} />
        ))}
      </div>

      {/* Schritt 1: Leistung */}
      {schritt === 1 && (
        <>
          <h3 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 700, marginBottom: 14 }}>Wobei dürfen wir helfen?</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {LEISTUNGEN.map(l => (
              <button
                key={l.id}
                onClick={() => { setLeistung(l.id); setSchritt(2) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '14px 16px',
                  borderRadius: 14, cursor: 'pointer',
                  border: leistung === l.id ? '1px solid #C9963C' : '1px solid rgba(255,255,255,0.1)',
                  background: leistung === l.id ? 'rgba(201,150,60,0.15)' : 'rgba(255,255,255,0.03)',
                }}
              >
                <span style={{ fontSize: 24 }} aria-hidden="true">{l.icon}</span>
                <span>
                  <span style={{ display: 'block', color: '#F5F0E8', fontSize: 15, fontWeight: 700 }}>{l.name}</span>
                  <span style={{ display: 'block', color: '#8A8279', fontSize: 12.5, marginTop: 2 }}>{l.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Schritt 2: Tag + Zeitfenster */}
      {schritt === 2 && (
        <>
          <h3 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 700, marginBottom: 14 }}>Wann passt es Ihnen?</h3>
          <div style={{ color: '#8A8279', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Wunschtag</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 18 }}>
            {tage.map(t => {
              const aktiv = tag?.toDateString() === t.toDateString()
              return (
                <button
                  key={t.toISOString()}
                  onClick={() => setTag(t)}
                  aria-pressed={aktiv}
                  style={{
                    padding: '10px 4px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                    border: aktiv ? '1px solid #C9963C' : '1px solid rgba(255,255,255,0.1)',
                    background: aktiv ? 'rgba(201,150,60,0.18)' : 'rgba(255,255,255,0.03)',
                  }}
                >
                  <span style={{ display: 'block', color: aktiv ? '#E8C87E' : '#8A8279', fontSize: 11, fontWeight: 700 }}>{WOCHENTAGE[t.getDay()]}</span>
                  <span style={{ display: 'block', color: aktiv ? '#E8C87E' : '#F5F0E8', fontSize: 16, fontWeight: 800, marginTop: 2 }}>{t.getDate()}.</span>
                  <span style={{ display: 'block', color: '#6A6259', fontSize: 10 }}>{MONATE_KURZ[t.getMonth()]}</span>
                </button>
              )
            })}
          </div>
          <div style={{ color: '#8A8279', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Zeitfenster</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {ZEITFENSTER.map(z => {
              const aktiv = fenster === z.id
              return (
                <button
                  key={z.id}
                  onClick={() => setFenster(z.id)}
                  aria-pressed={aktiv}
                  style={{
                    padding: '12px 6px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                    border: aktiv ? '1px solid #C9963C' : '1px solid rgba(255,255,255,0.1)',
                    background: aktiv ? 'rgba(201,150,60,0.18)' : 'rgba(255,255,255,0.03)',
                  }}
                >
                  <span style={{ display: 'block', color: aktiv ? '#E8C87E' : '#F5F0E8', fontSize: 14, fontWeight: 700 }}>{z.label}</span>
                  <span style={{ display: 'block', color: '#8A8279', fontSize: 11, marginTop: 2 }}>{z.zeit}</span>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={() => setSchritt(1)} style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#B8B0A4', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Zurück</button>
            <button
              onClick={() => tag && fenster && setSchritt(3)}
              disabled={!tag || !fenster}
              style={{ flex: 2, padding: '13px', borderRadius: 12, border: 'none', background: tag && fenster ? '#C9963C' : 'rgba(255,255,255,0.06)', color: tag && fenster ? '#1A1612' : '#6A6259', fontSize: 15, fontWeight: 700, cursor: tag && fenster ? 'pointer' : 'not-allowed' }}
            >
              Weiter
            </button>
          </div>
        </>
      )}

      {/* Schritt 3: Kontaktdaten */}
      {schritt === 3 && (
        <form onSubmit={absenden}>
          <h3 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Fast geschafft!</h3>
          <p style={{ color: '#8A8279', fontSize: 13, marginBottom: 16 }}>
            {leistung} — {tag && <>{WOCHENTAGE[tag.getDay()]}, {tag.getDate()}. {MONATE_KURZ[tag.getMonth()]}</>}, {ZEITFENSTER.find(z => z.id === fenster)?.zeit}. Wir rufen zur Bestätigung an.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Honeypot — für Menschen unsichtbar, Bots füllen es aus */}
            <input
              type="text"
              name="website"
              value={honeypot}
              onChange={e => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }}
            />
            <input type="text" required placeholder="Ihr Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input type="tel" required placeholder="Telefonnummer *" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} pattern="[0-9+\s\(\)\/\-]{6,}" title="Bitte geben Sie eine gültige Telefonnummer an (mindestens 6 Ziffern)" style={inputStyle} />
            <input type="text" required placeholder="PLZ *" value={form.plz} onChange={e => setForm({ ...form, plz: e.target.value })} pattern="[0-9]{5}" maxLength={5} style={inputStyle} />
          </div>
          {status === 'error' && (
            <p style={{ color: '#E74C3C', fontSize: 13, marginTop: 8 }}>{errorMsg || 'Fehler beim Senden. Bitte versuchen Sie es erneut.'}</p>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" onClick={() => setSchritt(2)} style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#B8B0A4', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Zurück</button>
            <button
              type="submit"
              disabled={status === 'sending'}
              style={{ flex: 2, padding: '13px', borderRadius: 12, border: 'none', background: status === 'sending' ? '#8A7A5A' : '#C9963C', color: '#1A1612', fontSize: 15, fontWeight: 700, cursor: status === 'sending' ? 'wait' : 'pointer' }}
            >
              {status === 'sending' ? 'Wird gesendet…' : 'Termin verbindlich anfragen'}
            </button>
          </div>
          <p style={{ color: '#6A6259', fontSize: 11, textAlign: 'center', marginTop: 12 }}>
            Kostenlos und unverbindlich. Ihre Daten werden nur zur Terminvereinbarung verwendet.
          </p>
        </form>
      )}
    </div>
  )
}
