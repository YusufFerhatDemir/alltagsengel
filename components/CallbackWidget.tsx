'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { trackContactRequest } from '@/lib/tracking'
import { useFokusFalle } from '@/lib/a11y'

// ═══════════════════════════════════════════════════════════
// RÜCKRUFSERVICE-WIDGET — "Wir rufen Sie zurück!"
// ═══════════════════════════════════════════════════════════
// Schwebender Button (rechts, oberhalb des WhatsApp-Buttons) auf allen
// öffentlichen Seiten. Öffnet ein kleines Modal mit nur drei Feldern:
//   Name · Telefon · bevorzugte Zeit (Vormittags/Nachmittags/Abends)
// Niedrigschwelliger als das Kontaktformular. Speichert über
// /api/lead-inquiry (source='rueckruf') — PLZ ist dort optional.
// Wird NICHT in Portal-/App-Bereichen angezeigt.
// ═══════════════════════════════════════════════════════════

const PORTAL_ROOTS = new Set(['kunde', 'engel', 'fahrer', 'auth', 'choose', 'notfall'])
const ZEITEN = ['Vormittags', 'Nachmittags', 'Abends'] as const

export default function CallbackWidget() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', zeit: 'Vormittags' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  // Nach 3s einblenden (analog WhatsApp-Button), nicht sofort.
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 3000)
    return () => clearTimeout(t)
  }, [])

  // Fokus-Management des Modals (WCAG 2.1.2, 2.4.3): Fokus hinein, Tab-Zyklus
  // innerhalb, ESC schließt, Fokus zurück zum Rückruf-Button.
  const dialogRef = useFokusFalle<HTMLDivElement>(() => setOpen(false), { aktiv: open })

  const firstSegment = (pathname?.split('/')[1]) || ''
  const isPortal = PORTAL_ROOTS.has(firstSegment)
  if (isPortal || !visible) return null

  // Seiten mit Sticky-CTA-Bar am unteren Rand → Button über die Bar heben.
  // 218px = WhatsApp-Button (150px) + 56px Kreis + 12px Luft — gleicher Abstand
  // wie das Paar auf Seiten ohne Sticky-Bar (24/92) hat.
  const hasStickyBar = pathname === '/' || ['/jobs', '/engel-werden'].includes(pathname || '')
  const buttonBottom = hasStickyBar
    ? 'calc(218px + env(safe-area-inset-bottom))'
    : 'calc(92px + env(safe-area-inset-bottom))'

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
          message: `Rückruf gewünscht — bevorzugte Zeit: ${form.zeit}`,
          service: 'Rückrufservice',
          source: 'rueckruf',
        }),
      })
      if (res.ok) {
        setStatus('sent')
        trackContactRequest('rueckruf')
        setForm({ name: '', phone: '', zeit: 'Vormittags' })
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '13px 15px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)',
    color: '#F5F0E8',
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <>
      {/* Schwebender Button */}
      <button
        type="button"
        onClick={() => { setOpen(true); setStatus('idle') }}
        aria-label="Rückruf anfordern"
        style={{
          position: 'fixed',
          bottom: buttonBottom,
          right: 20,
          zIndex: 9997,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '11px 16px',
          borderRadius: 999,
          border: 'none',
          background: 'linear-gradient(135deg, #E8C87E 0%, #C9963C 100%)',
          color: '#1A1612',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(201,150,60,0.45)',
          animation: 'fadeInUp 0.4s ease-out',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#1A1612" aria-hidden="true">
          <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
        </svg>
        Rückruf
      </button>

      {/* Modal */}
      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Rückrufservice"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(10,8,6,0.72)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              background: '#1F1B16',
              borderRadius: 20,
              border: '1px solid rgba(201,150,60,0.25)',
              padding: 24,
              boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
              marginBottom: 'env(safe-area-inset-bottom)',
              animation: 'fadeInUp 0.3s ease-out',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <h3 style={{ color: '#F5F0E8', fontSize: 20, fontWeight: 700, margin: 0 }}>
                Wir rufen Sie zurück!
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Schließen"
                style={{ background: 'none', border: 'none', color: '#8A8279', fontSize: 26, lineHeight: 1, cursor: 'pointer', padding: 0 }}
              >
                &times;
              </button>
            </div>

            {status === 'sent' ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 44, marginBottom: 8 }}>&#10003;</div>
                <p style={{ color: '#F5F0E8', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                  Vielen Dank!
                </p>
                <p style={{ color: '#B8B0A4', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                  Wir melden uns zu Ihrer Wunschzeit bei Ihnen — kostenlos und unverbindlich.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{ marginTop: 18, padding: '12px 26px', borderRadius: 12, border: '1px solid rgba(201,150,60,0.4)', background: 'transparent', color: '#C9963C', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >
                  Schließen
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <p style={{ color: '#8A8279', fontSize: 13, marginTop: 4, marginBottom: 18 }}>
                  Name und Telefonnummer genügen — der Rest ist optional.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input
                    type="text"
                    required
                    placeholder="Ihr Name *"
                    aria-label="Ihr Name"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    style={inputStyle}
                  />
                  <input
                    type="tel"
                    required
                    placeholder="Telefonnummer *"
                    aria-label="Telefonnummer"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    pattern="[0-9+\s()\/-]{6,}"
                    title="Bitte eine gültige Telefonnummer eingeben (mindestens 6 Ziffern)"
                    style={inputStyle}
                  />
                  <div>
                    <div style={{ color: '#B8B0A4', fontSize: 13, marginBottom: 8 }}>Wann passt es Ihnen am besten?</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {ZEITEN.map(z => {
                        const active = form.zeit === z
                        return (
                          <button
                            key={z}
                            type="button"
                            onClick={() => setForm({ ...form, zeit: z })}
                            aria-pressed={active}
                            style={{
                              flex: 1,
                              padding: '11px 6px',
                              borderRadius: 10,
                              border: active ? '1px solid #C9963C' : '1px solid rgba(255,255,255,0.12)',
                              background: active ? 'rgba(201,150,60,0.15)' : 'rgba(255,255,255,0.03)',
                              color: active ? '#E8C87E' : '#B8B0A4',
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {z}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {status === 'error' && (
                  <p style={{ color: '#E74C3C', fontSize: 13, marginTop: 10 }}>
                    Es gab ein Problem. Bitte versuchen Sie es erneut oder rufen Sie uns an.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === 'sending'}
                  style={{
                    width: '100%',
                    marginTop: 18,
                    padding: 14,
                    borderRadius: 12,
                    border: 'none',
                    background: status === 'sending' ? '#8A7A5A' : '#C9963C',
                    color: '#1A1612',
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: status === 'sending' ? 'wait' : 'pointer',
                  }}
                >
                  {status === 'sending' ? 'Wird gesendet…' : 'Rückruf anfordern'}
                </button>
                <p style={{ color: '#6A6259', fontSize: 11, textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
                  Ihre Daten werden nur zur Kontaktaufnahme verwendet.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
