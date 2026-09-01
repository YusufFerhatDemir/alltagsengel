'use client'

// ═══════════════════════════════════════════════════════════════
// Admin — MFA-Verifizierung (TOTP-Code eingeben)
//
// Wird angezeigt, wenn ein Admin-Konto einen zweiten Faktor hat,
// die Sitzung aber nur auf AAL1 steht (z.B. nach Passwort-Reset
// oder einem Edge-Case beim Session-Refresh).
//
// Diese Seite ist eine Ausnahme vom MFA-Gate im Layout.
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const cardStyle: React.CSSProperties = {
  background: 'var(--card-bg, rgba(28,24,20,0.6))',
  border: '1px solid var(--border, rgba(201,150,60,0.15))',
  borderRadius: 16,
  padding: 24,
  marginBottom: 24,
  maxWidth: 460,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 220,
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--border, rgba(201,150,60,0.2))',
  background: 'rgba(13,10,8,0.5)',
  color: 'var(--ink, #e8e0d4)',
  fontSize: 20,
  fontFamily: 'monospace',
  letterSpacing: '0.2em',
  textAlign: 'center' as const,
}

const btnStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(135deg, #C9963C, #DBA84A)',
  color: '#0D0A08',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

export default function AdminMfaPruefen() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()

      // Faktor laden
      const { data: faktoren, error: listenFehler } = await supabase.auth.mfa.listFactors()
      const faktor = faktoren?.totp?.[0]
      if (listenFehler || !faktor) {
        setError('Ihr zweiter Faktor konnte nicht geladen werden. Bitte laden Sie die Seite neu.')
        return
      }

      // Challenge starten
      const { data: challenge, error: challengeFehler } = await supabase.auth.mfa.challenge({
        factorId: faktor.id,
      })
      if (challengeFehler || !challenge) {
        setError('Die Prüfung konnte nicht gestartet werden. Bitte versuchen Sie es erneut.')
        return
      }

      // Code prüfen → hebt die Sitzung auf AAL2
      const { error: pruefFehler } = await supabase.auth.mfa.verify({
        factorId: faktor.id,
        challengeId: challenge.id,
        code: code.replace(/\s/g, ''),
      })
      if (pruefFehler) {
        setError('Der Code stimmt nicht. Bitte geben Sie den aktuell angezeigten sechsstelligen Code ein — er wechselt alle 30 Sekunden.')
        return
      }

      // Erfolg → weiter zum Dashboard
      router.push('/admin/dashboard')
    } catch {
      setError('Netzwerkfehler. Bitte versuchen Sie es erneut.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAbmelden() {
    try { await createClient().auth.signOut() } catch {}
    router.push('/auth/login')
  }

  const msgStyle: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 13,
    background: 'rgba(180,50,50,0.15)',
    color: '#ff8080',
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
      <div style={cardStyle}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
          Zweiter Faktor erforderlich
        </h1>
        <p style={{ color: 'var(--dim)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
          Bitte geben Sie den sechsstelligen Code aus Ihrer Authenticator-App ein,
          um den Zugriff auf den Admin-Bereich freizuschalten.
        </p>

        {error && <div style={msgStyle}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label htmlFor="mfa-pruefen-code-aus-der-app" style={{ display: 'block', color: 'var(--ink)', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
            Code aus der App
          </label>
          <input
            id="mfa-pruefen-code-aus-der-app"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            required
            autoFocus
            value={code}
            onChange={e => setCode(e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
            <button
              type="submit"
              disabled={loading || code.replace(/\s/g, '').length < 6}
              style={{ ...btnStyle, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Wird geprüft...' : 'Bestätigen'}
            </button>
            <button
              type="button"
              onClick={handleAbmelden}
              style={{ background: 'none', border: 'none', color: 'var(--gold2, #DBA84A)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline', padding: 0, fontFamily: 'inherit' }}
            >
              Abmelden
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
