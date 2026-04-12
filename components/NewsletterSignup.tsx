'use client'
import { useState } from 'react'

// ═══════════════════════════════════════════════════════════
// NEWSLETTER SIGNUP — E-Mail Sammlung für Marketing
// ═══════════════════════════════════════════════════════════
// Einbettbar auf Blog, FAQ, Landing Pages.
// Speichert in Supabase + sendet Willkommens-Mail.
// ═══════════════════════════════════════════════════════════

interface Props {
  variant?: 'inline' | 'banner'
  title?: string
  subtitle?: string
}

export default function NewsletterSignup({
  variant = 'banner',
  title = 'Pflege-Tipps direkt ins Postfach',
  subtitle = 'Kostenlose Ratgeber, Neuigkeiten und exklusive Angebote — kein Spam, versprochen.',
}: Props) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'exists'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setStatus('loading')

    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus('success')
        setEmail('')
      } else if (data.code === 'already_subscribed') {
        setStatus('exists')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div style={{
        background: variant === 'banner' ? 'linear-gradient(135deg, rgba(45, 106, 79, 0.12) 0%, rgba(45, 106, 79, 0.06) 100%)' : 'transparent',
        borderRadius: variant === 'banner' ? 18 : 0,
        padding: variant === 'banner' ? 'clamp(20px, 3vw, 32px)' : '12px 0',
        textAlign: 'center',
        border: variant === 'banner' ? '1px solid rgba(45, 106, 79, 0.2)' : 'none',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
        <p style={{ color: '#4CAF50', fontWeight: 600, fontSize: 15 }}>Willkommen an Bord!</p>
        <p style={{ color: '#8A8279', fontSize: 13 }}>Bestätigen Sie Ihre E-Mail — wir haben Ihnen eine Nachricht geschickt.</p>
      </div>
    )
  }

  return (
    <div style={{
      background: variant === 'banner' ? 'linear-gradient(135deg, rgba(201, 150, 60, 0.08) 0%, rgba(201, 150, 60, 0.03) 100%)' : 'transparent',
      borderRadius: variant === 'banner' ? 18 : 0,
      padding: variant === 'banner' ? 'clamp(20px, 3vw, 32px)' : '12px 0',
      border: variant === 'banner' ? '1px solid rgba(201, 150, 60, 0.15)' : 'none',
    }}>
      <h3 style={{ color: '#F5F0E8', fontSize: variant === 'banner' ? 20 : 16, fontWeight: 700, marginBottom: 4, textAlign: variant === 'banner' ? 'center' : 'left' }}>
        {title}
      </h3>
      <p style={{ color: '#8A8279', fontSize: 13, marginBottom: 16, textAlign: variant === 'banner' ? 'center' : 'left' }}>
        {subtitle}
      </p>

      <form onSubmit={handleSubmit} style={{
        display: 'flex',
        gap: 8,
        maxWidth: variant === 'banner' ? 420 : '100%',
        margin: variant === 'banner' ? '0 auto' : 0,
        flexWrap: 'wrap',
      }}>
        <input
          type="email"
          required
          placeholder="Ihre E-Mail Adresse"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: '12px 16px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)',
            color: '#F5F0E8',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          style={{
            padding: '12px 24px',
            borderRadius: 10,
            border: 'none',
            background: '#C9963C',
            color: '#1A1612',
            fontSize: 14,
            fontWeight: 700,
            cursor: status === 'loading' ? 'wait' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {status === 'loading' ? '...' : 'Anmelden'}
        </button>
      </form>

      {status === 'error' && (
        <p style={{ color: '#E74C3C', fontSize: 12, marginTop: 8, textAlign: 'center' }}>Fehler — bitte erneut versuchen.</p>
      )}
      {status === 'exists' && (
        <p style={{ color: '#C9963C', fontSize: 12, marginTop: 8, textAlign: 'center' }}>Sie sind bereits angemeldet!</p>
      )}

      <p style={{ color: '#555', fontSize: 11, marginTop: 10, textAlign: 'center' }}>
        Kein Spam. Abmeldung jederzeit möglich. <a href="/datenschutz" style={{ color: '#C9963C' }}>Datenschutz</a>
      </p>
    </div>
  )
}
