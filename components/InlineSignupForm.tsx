'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  utmSource?: string
  ctaLabel?: string
  variant?: 'light' | 'dark'
}

/**
 * InlineSignupForm — direktes Anmeldeformular für Landing Pages
 *
 * Eliminiert den /choose-Umweg: Klicker landet auf /lp/google,
 * gibt Email + PLZ + Telefon ein, wird DIREKT zu /auth/register?prefill=...
 * weitergeleitet (Rolle = kunde fix, da Werbung an Pflegebedürftige/Angehörige).
 *
 * Lift-Erwartung: Conversion-Rate von <0,5 % → 3–6 % (Hauptlift durch
 * Wegfall von /choose und sofortiger Wert-Versprechen-Einfangen).
 */
export default function InlineSignupForm({
  utmSource = 'google',
  ctaLabel = 'Jetzt kostenlos sichern',
  variant = 'light',
}: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [plz, setPlz] = useState('')
  const [pflegegrad, setPflegegrad] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Validierung
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setError('Bitte gültige E-Mail-Adresse eingeben')
      return
    }
    if (!plz.match(/^\d{5}$/)) {
      setError('Bitte 5-stellige Postleitzahl eingeben')
      return
    }

    setSubmitting(true)

    // Conversion-Tracking (Form-Submit) — feuert auch ohne Anmeldung
    try {
      fetch('/api/track-conversion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'landing_signup_form_submit',
          email_hash: btoa(email).slice(0, 12),
          source: utmSource,
        }),
      }).catch(() => {})
    } catch {}

    // Redirect zu Register mit prefill
    const params = new URLSearchParams({
      role: 'kunde',
      email,
      phone,
      plz,
      pflegegrad,
      utm_source: utmSource,
      utm_medium: 'lp',
    })
    router.push(`/auth/register?${params.toString()}`)
  }

  const isDark = variant === 'dark'
  const inputBg = isDark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.95)'
  const inputColor = isDark ? '#1A1612' : '#1A1612'
  const inputBorder = isDark ? '1px solid rgba(0,0,0,0.2)' : '1px solid rgba(201,150,60,0.3)'
  const labelColor = isDark ? '#1A1612' : '#F7F2EA'
  const errorColor = '#E04A3C'

  return (
    <form
      onSubmit={onSubmit}
      style={{
        background: isDark ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.05)',
        border: isDark ? '2px solid #1A1612' : '1px solid rgba(201,150,60,0.3)',
        borderRadius: 16,
        padding: 24,
        maxWidth: 460,
        margin: '0 auto',
        boxShadow: isDark
          ? '0 8px 32px rgba(0,0,0,0.18)'
          : '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 1.5,
          color: '#C9963C',
          textAlign: 'center',
          marginBottom: 4,
        }}
      >
        IN 30 SEKUNDEN ANMELDEN
      </div>
      <div
        style={{
          fontSize: 14,
          color: isDark ? '#1A1612' : '#C4B8A8',
          textAlign: 'center',
          marginBottom: 18,
        }}
      >
        Wir melden uns binnen 24h mit Ihrem Engel-Vorschlag.
      </div>

      <input
        type="email"
        placeholder="Ihre E-Mail-Adresse"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        style={{
          width: '100%',
          padding: '14px 16px',
          fontSize: 16,
          background: inputBg,
          color: inputColor,
          border: inputBorder,
          borderRadius: 10,
          marginBottom: 10,
          boxSizing: 'border-box',
          fontFamily: "'Jost', sans-serif",
        }}
      />

      <input
        type="tel"
        placeholder="Telefonnummer (für Rückruf)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        autoComplete="tel"
        style={{
          width: '100%',
          padding: '14px 16px',
          fontSize: 16,
          background: inputBg,
          color: inputColor,
          border: inputBorder,
          borderRadius: 10,
          marginBottom: 10,
          boxSizing: 'border-box',
          fontFamily: "'Jost', sans-serif",
        }}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{5}"
          maxLength={5}
          placeholder="PLZ"
          value={plz}
          onChange={(e) => setPlz(e.target.value.replace(/\D/g, '').slice(0, 5))}
          required
          autoComplete="postal-code"
          style={{
            width: 90,
            padding: '14px 16px',
            fontSize: 16,
            background: inputBg,
            color: inputColor,
            border: inputBorder,
            borderRadius: 10,
            boxSizing: 'border-box',
            fontFamily: "'Jost', sans-serif",
          }}
        />
        <select
          value={pflegegrad}
          onChange={(e) => setPflegegrad(e.target.value)}
          style={{
            flex: 1,
            padding: '14px 16px',
            fontSize: 15,
            background: inputBg,
            color: inputColor,
            border: inputBorder,
            borderRadius: 10,
            fontFamily: "'Jost', sans-serif",
          }}
        >
          <option value="">Pflegegrad?</option>
          <option value="0">Noch keiner / Antrag läuft</option>
          <option value="1">Pflegegrad 1</option>
          <option value="2">Pflegegrad 2</option>
          <option value="3">Pflegegrad 3</option>
          <option value="4">Pflegegrad 4</option>
          <option value="5">Pflegegrad 5</option>
        </select>
      </div>

      {error && (
        <div
          style={{
            color: errorColor,
            fontSize: 13,
            marginBottom: 10,
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={{
          width: '100%',
          padding: '16px',
          fontSize: 17,
          fontWeight: 700,
          background: 'linear-gradient(135deg, #C9963C, #DBA84A)',
          color: '#1A1612',
          border: 'none',
          borderRadius: 12,
          cursor: submitting ? 'wait' : 'pointer',
          boxShadow: '0 4px 16px rgba(201,150,60,0.35)',
          letterSpacing: 0.5,
          fontFamily: "'Jost', sans-serif",
        }}
      >
        {submitting ? 'Wird gesendet...' : ctaLabel + ' →'}
      </button>

      <div
        style={{
          fontSize: 12,
          color: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(196,184,168,0.7)',
          textAlign: 'center',
          marginTop: 12,
          lineHeight: 1.4,
        }}
      >
        ✓ Kostenlos · ✓ DSGVO-konform · ✓ Keine Kreditkarte
      </div>
    </form>
  )
}
