'use client'
import { useState } from 'react'
import Link from 'next/link'
import { trackContactRequest } from '@/lib/tracking'

// ═══════════════════════════════════════════════════════════
// PFLEGEBOX-KONFIGURATOR — öffentlicher Bestell-Funnel ohne Login
// ═══════════════════════════════════════════════════════════
// 3 sichtbare Schritte auf einer Seite (Box zusammenstellen →
// Pflegegrad → Kontakt). Sendet an /api/lead-inquiry (service
// 'Pflege-Box'), Produktauswahl + Pflegegrad landen im message-Feld.
// Design: dark theme, gold accent — konsistent mit LeadForm.
// ═══════════════════════════════════════════════════════════

interface Produkt {
  id: string
  name: string
  menge: string
  hinweis: string
  checked: boolean
}

const START_PRODUKTE: Produkt[] = [
  { id: 'handschuhe', name: 'Einmalhandschuhe', menge: '100 Stk.', hinweis: 'Nitril, latexfrei — Größe wählbar', checked: true },
  { id: 'haende-desinfektion', name: 'Händedesinfektion', menge: '500 ml', hinweis: 'Für vor und nach jeder Pflegetätigkeit', checked: true },
  { id: 'flaechen-desinfektion', name: 'Flächendesinfektion', menge: '500 ml', hinweis: 'Pflegebett, Nachttisch, Griffe', checked: true },
  { id: 'bettschutz', name: 'Bettschutzeinlagen', menge: '25 Stk.', hinweis: 'Saugstark, Einmalgebrauch', checked: true },
  { id: 'mundschutz', name: 'Mundschutz / FFP2', menge: '50 Stk.', hinweis: 'Schutz in Erkältungszeiten', checked: false },
  { id: 'schuerzen', name: 'Schutzschürzen', menge: '100 Stk.', hinweis: 'Einweg, für die Körperpflege', checked: false },
]

const GOLD = '#C9963C'
const INK = '#F5F0E8'
const INK3 = '#B8B0A4'
const INK4 = '#8A8279'
const GREEN = '#5CB882'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)',
  color: INK,
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box',
}

function SchrittLabel({ nr, text }: { nr: number; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%', background: GOLD, color: '#1A1612',
        fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{nr}</div>
      <div style={{ color: INK, fontSize: 16, fontWeight: 700 }}>{text}</div>
    </div>
  )
}

export default function PflegeboxKonfigurator({ source = 'pflegebox-konfigurator' }: { source?: string }) {
  const [produkte, setProdukte] = useState<Produkt[]>(START_PRODUKTE)
  const [pflegegrad, setPflegegrad] = useState<string>('')
  const [form, setForm] = useState({ name: '', phone: '', plz: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [honeypot, setHoneypot] = useState('')

  const anzahl = produkte.filter(p => p.checked).length

  function toggle(id: string) {
    setProdukte(prev => prev.map(p => (p.id === id ? { ...p, checked: !p.checked } : p)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (anzahl === 0) {
      setErrorMsg('Bitte wählen Sie mindestens ein Produkt für Ihre Box.')
      setStatus('error')
      return
    }
    setStatus('sending')
    setErrorMsg('')

    const auswahl = produkte.filter(p => p.checked).map(p => `${p.name} (${p.menge})`).join(', ')
    const message = `Pflegebox-Bestellung — Wunsch-Zusammenstellung: ${auswahl}. Pflegegrad: ${pflegegrad || 'nicht angegeben'}.`

    try {
      const res = await fetch('/api/lead-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          message,
          website: honeypot,
          service: 'Pflege-Box',
          source,
        }),
      })
      if (res.ok) {
        setStatus('sent')
        trackContactRequest(source)
      } else {
        const data = await res.json().catch(() => null)
        setErrorMsg(data?.error || '')
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div style={{
        background: 'rgba(45, 106, 79, 0.1)', borderRadius: 18, padding: 32,
        border: '1px solid rgba(45, 106, 79, 0.25)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>&#10003;</div>
        <h3 style={{ color: INK, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          Ihre Pflegebox ist reserviert!
        </h3>
        <p style={{ color: INK3, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          Wir melden uns innerhalb von 24 Stunden, bestätigen Ihre Zusammenstellung
          und übernehmen den kompletten Antrag bei Ihrer Pflegekasse.
          Sie zahlen: <strong style={{ color: GREEN }}>0&nbsp;€</strong>.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'rgba(255,255,255,0.04)', borderRadius: 18,
      padding: 'clamp(20px, 3vw, 28px)',
      border: '1px solid rgba(255,255,255,0.06)',
      maxWidth: 560, margin: '0 auto',
    }}>
      {/* Honeypot — für Menschen unsichtbar, Bots füllen es aus */}
      <input
        type="text" name="website" value={honeypot} onChange={e => setHoneypot(e.target.value)}
        tabIndex={-1} autoComplete="off" aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }}
      />

      {/* Schritt 1: Box zusammenstellen */}
      <SchrittLabel nr={1} text="Stellen Sie Ihre Box zusammen" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
        {produkte.map(p => (
          <div
            key={p.id}
            onClick={() => toggle(p.id)}
            role="checkbox"
            aria-checked={p.checked}
            tabIndex={0}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(p.id) } }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12,
              border: `1.5px solid ${p.checked ? GOLD : 'rgba(255,255,255,0.1)'}`,
              background: p.checked ? 'rgba(201,150,60,.08)' : 'transparent',
              cursor: 'pointer', transition: 'all 150ms',
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 6, flexShrink: 0,
              border: `1.5px solid ${p.checked ? GOLD : 'rgba(255,255,255,0.2)'}`,
              background: p.checked ? GOLD : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#1A1612', fontSize: 13, fontWeight: 900,
            }}>{p.checked ? '✓' : ''}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: INK, fontSize: 14, fontWeight: 600 }}>
                {p.name} <span style={{ color: INK4, fontWeight: 400 }}>· {p.menge}</span>
              </div>
              <div style={{ color: INK4, fontSize: 12, marginTop: 2 }}>{p.hinweis}</div>
            </div>
          </div>
        ))}
      </div>
      <p style={{ color: INK4, fontSize: 12, margin: '0 0 22px' }}>
        Mengen und Größen stimmen wir im Bestätigungsanruf mit Ihnen ab — die
        Zusammenstellung können Sie später jeden Monat ändern.
      </p>

      {/* Schritt 2: Pflegegrad */}
      <SchrittLabel nr={2} text="Ihr Pflegegrad" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 8 }}>
        {['1', '2', '3', '4', '5', 'offen'].map(g => (
          <button
            key={g}
            type="button"
            onClick={() => setPflegegrad(g)}
            style={{
              padding: '12px 4px', borderRadius: 10,
              border: `1.5px solid ${pflegegrad === g ? GOLD : 'rgba(255,255,255,0.1)'}`,
              background: pflegegrad === g ? GOLD : 'transparent',
              color: pflegegrad === g ? '#1A1612' : INK3,
              fontSize: g === 'offen' ? 11 : 14, fontWeight: 700, cursor: 'pointer', transition: 'all 150ms',
            }}
          >
            {g === 'offen' ? 'beantragt' : g}
          </button>
        ))}
      </div>
      <p style={{ color: INK4, fontSize: 12, margin: '0 0 22px' }}>
        Schon Pflegegrad 1 genügt. Noch keiner beantragt? Machen Sie zuerst den{' '}
        <Link href="/pflegegrad-check" style={{ color: GOLD }}>kostenlosen Pflegegrad-Check</Link>.
      </p>

      {/* Schritt 3: Kontakt */}
      <SchrittLabel nr={3} text="Wohin dürfen wir liefern?" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="text" required placeholder="Ihr Name *" aria-label="Ihr Name"
          value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
          style={inputStyle}
        />
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            type="tel" required placeholder="Telefonnummer *" aria-label="Telefonnummer"
            value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
            pattern="[0-9+\s()\/-]{6,}"
            title="Bitte eine gültige Telefonnummer eingeben (mindestens 6 Ziffern)"
            style={{ ...inputStyle, flex: 2 }}
          />
          <input
            type="text" required placeholder="PLZ *" aria-label="Postleitzahl"
            value={form.plz} onChange={e => setForm({ ...form, plz: e.target.value })}
            pattern="[0-9]{5}" maxLength={5}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
      </div>

      {/* Kostenübersicht */}
      <div style={{
        marginTop: 18, padding: '14px 16px', borderRadius: 12,
        background: 'rgba(92,184,130,.07)', border: '1px solid rgba(92,184,130,.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: INK3, marginBottom: 4 }}>
          <span>Ihre Box ({anzahl} {anzahl === 1 ? 'Produkt' : 'Produkte'})</span>
          <span>bis 42&nbsp;€/Monat</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: INK3, marginBottom: 4 }}>
          <span>Übernimmt die Pflegekasse (§40 SGB XI)</span>
          <span style={{ color: GREEN }}>− bis 42&nbsp;€</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: INK3, marginBottom: 8 }}>
          <span>Versand</span>
          <span>0&nbsp;€</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: INK, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 8 }}>
          <span>Ihr Eigenanteil</span>
          <span style={{ color: GREEN }}>0,00&nbsp;€</span>
        </div>
      </div>

      {status === 'error' && (
        <p style={{ color: '#E74C3C', fontSize: 13, marginTop: 10 }}>
          {errorMsg || 'Fehler beim Senden. Bitte versuchen Sie es erneut.'}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        style={{
          width: '100%', marginTop: 16, padding: '16px', borderRadius: 12, border: 'none',
          background: status === 'sending' ? '#8A7A5A' : GOLD,
          color: '#1A1612', fontSize: 16, fontWeight: 800, letterSpacing: '.02em',
          cursor: status === 'sending' ? 'wait' : 'pointer', transition: 'background 0.2s',
        }}
      >
        {status === 'sending' ? 'Wird gesendet …' : 'Pflegebox kostenlos bestellen'}
      </button>

      <p style={{ color: INK4, fontSize: 11, textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
        Unverbindlich · keine Vertragsbindung · jederzeit kündbar. Den Antrag bei
        Ihrer Pflegekasse übernehmen wir. Ihre Daten werden nur zur Bearbeitung
        Ihrer Bestellung verwendet.
      </p>
    </form>
  )
}
