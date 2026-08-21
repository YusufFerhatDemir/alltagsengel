'use client'
import { useState, useEffect } from 'react'
import { trackContactRequest } from '@/lib/tracking'

// ═══════════════════════════════════════════════════════════
// ENGEL BEWERBUNG FORM — Schnell-Bewerbung ohne Auth
// ═══════════════════════════════════════════════════════════
// Für die engel-werden Landingpage. Speichert in lead_inquiries
// mit source='engel-bewerbung'. Kein Login erforderlich.
// ═══════════════════════════════════════════════════════════

export default function EngelBewerbungForm() {
  const [form, setForm] = useState({ name: '', phone: '', plz: '', qualification: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [utmSource, setUtmSource] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    setUtmSource(params.get('utm_source') || params.get('source') || '')
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')

    try {
      const res = await fetch('/api/lead-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          plz: form.plz,
          website: honeypot,
          service: form.qualification ? `Engel-Bewerbung (${form.qualification})` : 'Engel-Bewerbung',
          message: form.message,
          source: 'engel-bewerbung',
          utm_source: utmSource,
        }),
      })
      if (res.ok) {
        setStatus('sent')
        setForm({ name: '', phone: '', plz: '', qualification: '', message: '' })
        trackContactRequest('engel-bewerbung')
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
      <div style={{
        background: 'rgba(45, 106, 79, 0.1)', borderRadius: 18, padding: 32,
        border: '1px solid rgba(45, 106, 79, 0.2)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>&#10003;</div>
        <h3 style={{ color: '#F5F0E8', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          Bewerbung erhalten!
        </h3>
        <p style={{ color: '#B8B0A4', fontSize: 14, lineHeight: 1.6 }}>
          Wir melden uns innerhalb von 24 Stunden bei dir.
          Du kannst dich auch direkt in der App registrieren.
        </p>
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#F5F0E8',
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'rgba(255,255,255,0.04)', borderRadius: 18,
      padding: 'clamp(20px, 3vw, 28px)',
      border: '1px solid rgba(255,255,255,0.06)',
      maxWidth: 520, margin: '0 auto',
    }}>
      <h3 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
        Schnell-Bewerbung
      </h3>
      <p style={{ color: '#8A8279', fontSize: 13, marginBottom: 20 }}>
        Hinterlasse deine Daten — wir melden uns bei dir.
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
        <input aria-label="Dein Name *"
          type="text"
          required
          placeholder="Dein Name *"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          style={inputStyle}
        />
        <div style={{ display: 'flex', gap: 12 }}>
          <input aria-label="Telefonnummer *"
            type="tel"
            required
            placeholder="Telefonnummer *"
            value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })}
            pattern="[0-9+\s\(\)\/\-]{6,}"
            title="Bitte gib eine gültige Telefonnummer an (mindestens 6 Ziffern)"
            style={{ ...inputStyle, flex: 2 }}
          />
          <input aria-label="PLZ *"
            type="text"
            required
            placeholder="PLZ *"
            value={form.plz}
            onChange={e => setForm({ ...form, plz: e.target.value })}
            pattern="[0-9]{5}"
            maxLength={5}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
        <select
          aria-label="Erfahrung (optional)"
          value={form.qualification}
          onChange={e => setForm({ ...form, qualification: e.target.value })}
          style={{ ...inputStyle, appearance: 'auto', color: form.qualification ? '#F5F0E8' : '#8A8279' }}
        >
          <option value="">Erfahrung (optional)</option>
          <option value="Keine Erfahrung">Keine Erfahrung — ich möchte einsteigen</option>
          <option value="Pflegehelfer/in">Pflegehelfer/in</option>
          <option value="Alltagsbegleiter/in (§45b)">Alltagsbegleiter/in (§45b)</option>
          <option value="Betreuungskraft (§53b)">Betreuungskraft (§53b)</option>
          <option value="Altenpfleger/in">Altenpfleger/in</option>
          <option value="Sonstige">Sonstige Erfahrung</option>
        </select>
        <textarea aria-label="Kurze Nachricht (optional)"
          placeholder="Kurze Nachricht (optional)"
          value={form.message}
          onChange={e => setForm({ ...form, message: e.target.value })}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
        />
      </div>

      {status === 'error' && (
        <p style={{ color: '#E74C3C', fontSize: 13, marginTop: 8 }}>
          {errorMsg || 'Fehler beim Senden. Bitte versuche es erneut.'}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        style={{
          width: '100%', marginTop: 16, padding: '14px', borderRadius: 12, border: 'none',
          background: status === 'sending' ? '#8A7A5A' : '#C9963C',
          color: '#1A1612', fontSize: 16, fontWeight: 700,
          cursor: status === 'sending' ? 'wait' : 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {status === 'sending' ? 'Wird gesendet...' : 'Jetzt bewerben — unverbindlich'}
      </button>

      <p style={{ color: '#6A6259', fontSize: 11, textAlign: 'center', marginTop: 12 }}>
        Deine Daten werden nur zur Kontaktaufnahme verwendet. Kein Login nötig.
      </p>
    </form>
  )
}
