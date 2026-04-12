'use client'
import { useState } from 'react'

export default function KontaktForm() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', type: 'kunde' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')

    try {
      const res = await fetch('/api/kontakt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setStatus('sent')
        setForm({ name: '', email: '', phone: '', message: '', type: 'kunde' })
      } else {
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
        border: '1px solid rgba(45, 106, 79, 0.2)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
        <h3 style={{ color: '#F5F0E8', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Nachricht gesendet!</h3>
        <p style={{ color: '#B8B0A4', fontSize: 14 }}>Wir melden uns innerhalb von 24 Stunden bei Ihnen.</p>
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
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'rgba(255,255,255,0.04)', borderRadius: 18, padding: 'clamp(20px, 3vw, 28px)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <h3 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Nachricht senden</h3>
      <p style={{ color: '#8A8279', fontSize: 13, marginBottom: 20 }}>Wir antworten innerhalb von 24 Stunden.</p>

      {/* Type */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { value: 'kunde', label: 'Ich suche Hilfe' },
          { value: 'engel', label: 'Ich möchte helfen' },
        ].map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setForm({ ...form, type: opt.value })}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: form.type === opt.value ? '2px solid #C9963C' : '2px solid rgba(255,255,255,0.08)',
              background: form.type === opt.value ? 'rgba(201, 150, 60, 0.12)' : 'transparent',
              color: form.type === opt.value ? '#C9963C' : '#8A8279',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="text" required placeholder="Ihr Name" value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          style={inputStyle}
        />
        <input
          type="email" required placeholder="E-Mail Adresse" value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
          style={inputStyle}
        />
        <input
          type="tel" placeholder="Telefonnummer (optional)" value={form.phone}
          onChange={e => setForm({ ...form, phone: e.target.value })}
          style={inputStyle}
        />
        <textarea
          required placeholder="Ihre Nachricht..." value={form.message}
          onChange={e => setForm({ ...form, message: e.target.value })}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }}
        />
      </div>

      {status === 'error' && (
        <p style={{ color: '#E74C3C', fontSize: 13, marginTop: 8 }}>
          Fehler beim Senden. Bitte versuchen Sie es erneut.
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        style={{
          width: '100%', marginTop: 16, padding: '14px', borderRadius: 12, border: 'none',
          background: status === 'sending' ? '#8A7A5A' : '#C9963C',
          color: '#1A1612', fontSize: 16, fontWeight: 700, cursor: status === 'sending' ? 'wait' : 'pointer',
        }}
      >
        {status === 'sending' ? 'Wird gesendet...' : 'Nachricht senden'}
      </button>
    </form>
  )
}
