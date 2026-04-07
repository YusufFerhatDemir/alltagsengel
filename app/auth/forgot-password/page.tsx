'use client'
import { useState } from 'react'
import Link from 'next/link'
import Icon3D from '@/components/Icon3D'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Use custom endpoint that sends reset email via Resend
      const res = await fetch('/api/auth/send-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Fehler beim Senden der E-Mail')
        setLoading(false)
        return
      }

      setSent(true)
    } catch (err) {
      setError('Netzwerkfehler. Bitte prüfen Sie Ihre Internetverbindung.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen auth-screen">
      <div className="auth-card">
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <Icon3D size={56} />
        </div>
        <div className="auth-title">Passwort vergessen?</div>
        <div className="auth-sub">
          {sent
            ? 'Wir haben Ihnen eine E-Mail gesendet.'
            : 'Geben Sie Ihre E-Mail-Adresse ein'}
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 16, color: 'var(--gold)' }}>&#9993;</div>
            <p style={{ color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: 20 }}>
              Bitte prüfen Sie Ihr Postfach und klicken Sie auf den Link, um Ihr Passwort zurückzusetzen.
            </p>
            <Link href="/auth/login" className="btn-gold" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              ZURÜCK ZUM LOGIN
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              className="auth-input"
              type="email"
              placeholder="E-Mail-Adresse"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            {error && <div className="auth-error">{error}</div>}
            <button className="btn-gold" type="submit" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
              {loading ? 'Wird gesendet...' : 'LINK SENDEN'}
            </button>
          </form>
        )}

        <div className="auth-link">
          <Link href="/auth/login">Zurück zum Login</Link>
        </div>
      </div>
    </div>
  )
}
