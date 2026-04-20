'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// ═══════════════════════════════════════════════════════════
// ONBOARDING FLOW — Willkommen für neue Kunden
// ═══════════════════════════════════════════════════════════
// Wird EINMAL angezeigt nach der ersten Registrierung.
// 4 Schritte: Willkommen → Profil → Entlastungsbetrag → Fertig
// Speichert onboarding_completed = true im Profil.
// ═══════════════════════════════════════════════════════════

interface OnboardingStep {
  title: string
  subtitle: string
  content: React.ReactNode
  cta: string
}

export default function OnboardingFlow() {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pflegegrad, setPflegegrad] = useState('')
  const [plz, setPlz] = useState('')
  const router = useRouter()

  useEffect(() => {
    checkOnboarding()
  }, [])

  // Modal-Event: andere UI-Elemente (z.B. WhatsApp-FAB) koennen sich ausblenden
  // solange das Onboarding offen ist.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('app:modal-change', { detail: { open: show } }))
    return () => {
      window.dispatchEvent(new CustomEvent('app:modal-change', { detail: { open: false } }))
    }
  }, [show])

  async function checkOnboarding() {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed, role')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'kunde' && !profile?.onboarding_completed) {
        setShow(true)
      }
    } catch (e) {
      console.error('[Onboarding] Error:', e)
    }
    setLoading(false)
  }

  async function completeOnboarding() {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const updates: Record<string, any> = { onboarding_completed: true }
      if (pflegegrad) updates.pflegegrad = parseInt(pflegegrad)
      if (plz) updates.postal_code = plz

      await supabase.from('profiles').update(updates).eq('id', user.id)
    } catch (e) {
      console.error('[Onboarding] Save error:', e)
    }
    setShow(false)
  }

  function nextStep() {
    if (step < steps.length - 1) {
      setStep(step + 1)
    } else {
      completeOnboarding()
    }
  }

  const steps: OnboardingStep[] = [
    {
      title: 'Willkommen bei AlltagsEngel',
      subtitle: 'Schön, dass Sie da sind!',
      content: (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{
            width: 112, height: 112, borderRadius: '50%',
            overflow: 'hidden',
            margin: '0 auto 24px',
            boxShadow: '0 0 48px rgba(201, 150, 60, 0.35), 0 8px 32px rgba(0,0,0,0.4)',
            border: '2px solid rgba(201, 150, 60, 0.5)',
            background: '#1A1612',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon-512x512.png"
              alt="AlltagsEngel"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
          <p style={{ color: '#B8B0A4', fontSize: 15, lineHeight: 1.7, maxWidth: 320, margin: '0 auto' }}>
            Wir verbinden Sie mit zertifizierten Alltagsbegleitern in Ihrer Nähe.
            <strong style={{ color: '#C9963C' }}> 131€/Monat</strong> übernimmt die Pflegekasse — Sie zahlen nichts.
          </p>
        </div>
      ),
      cta: 'Los geht\'s',
    },
    {
      title: 'Haben Sie einen Pflegegrad?',
      subtitle: 'Um den Entlastungsbetrag zu nutzen',
      content: (
        <div style={{ padding: '16px 0' }}>
          <p style={{ color: '#B8B0A4', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
            Mit einem Pflegegrad (1-5) stehen Ihnen <strong style={{ color: '#C9963C' }}>131€ monatlich</strong> für
            Alltagsbegleitung zu. Keine Sorge — auch ohne Pflegegrad können Sie AlltagsEngel nutzen.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {['1', '2', '3', '4', '5', '0'].map(g => (
              <button
                key={g}
                onClick={() => setPflegegrad(g)}
                style={{
                  padding: '14px 0',
                  borderRadius: 12,
                  border: pflegegrad === g ? '2px solid #C9963C' : '2px solid rgba(255,255,255,0.1)',
                  background: pflegegrad === g ? 'rgba(201, 150, 60, 0.15)' : 'rgba(255,255,255,0.04)',
                  color: pflegegrad === g ? '#C9963C' : '#B8B0A4',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {g === '0' ? 'Keinen' : `Grad ${g}`}
              </button>
            ))}
          </div>
        </div>
      ),
      cta: 'Weiter',
    },
    {
      title: 'Ihre Postleitzahl',
      subtitle: 'Wir finden Engel in Ihrer Nähe',
      content: (
        <div style={{ padding: '16px 0' }}>
          <p style={{ color: '#B8B0A4', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
            Geben Sie Ihre PLZ ein, damit wir Ihnen passende Alltagsbegleiter in Ihrer Umgebung anzeigen können.
          </p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="z.B. 60311"
            value={plz}
            onChange={(e) => setPlz(e.target.value.replace(/\D/g, '').slice(0, 5))}
            style={{
              width: '100%',
              padding: '16px 20px',
              borderRadius: 14,
              border: '2px solid rgba(201, 150, 60, 0.3)',
              background: 'rgba(255,255,255,0.04)',
              color: '#F5F0E8',
              fontSize: 20,
              fontWeight: 600,
              textAlign: 'center',
              letterSpacing: 4,
              outline: 'none',
            }}
          />
          <div style={{
            marginTop: 20,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
          }}>
            <div style={{
              background: 'rgba(201, 150, 60, 0.08)',
              borderRadius: 12,
              padding: 14,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>🛒</div>
              <div style={{ color: '#B8B0A4', fontSize: 12 }}>Einkauf</div>
            </div>
            <div style={{
              background: 'rgba(201, 150, 60, 0.08)',
              borderRadius: 12,
              padding: 14,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>🏥</div>
              <div style={{ color: '#B8B0A4', fontSize: 12 }}>Arztbesuch</div>
            </div>
            <div style={{
              background: 'rgba(201, 150, 60, 0.08)',
              borderRadius: 12,
              padding: 14,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>🏠</div>
              <div style={{ color: '#B8B0A4', fontSize: 12 }}>Haushalt</div>
            </div>
            <div style={{
              background: 'rgba(201, 150, 60, 0.08)',
              borderRadius: 12,
              padding: 14,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>☕</div>
              <div style={{ color: '#B8B0A4', fontSize: 12 }}>Gesellschaft</div>
            </div>
          </div>
        </div>
      ),
      cta: 'Weiter',
    },
    {
      title: 'Alles bereit!',
      subtitle: 'Ihr AlltagsEngel wartet',
      content: (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{
            position: 'relative',
            width: 112, height: 112,
            margin: '0 auto 24px',
          }}>
            <div style={{
              width: '100%', height: '100%', borderRadius: '50%',
              overflow: 'hidden',
              boxShadow: '0 0 48px rgba(45, 106, 79, 0.4), 0 8px 32px rgba(0,0,0,0.4)',
              border: '2px solid rgba(201, 150, 60, 0.5)',
              background: '#1A1612',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icon-512x512.png"
                alt="AlltagsEngel"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
            {/* Success-Badge unten rechts */}
            <div style={{
              position: 'absolute',
              bottom: -4,
              right: -4,
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #2D6A4F 0%, #40916C 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff',
              fontSize: 18,
              fontWeight: 700,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              border: '3px solid #1E1A16',
            }}>
              ✓
            </div>
          </div>
          <div style={{
            background: 'rgba(201, 150, 60, 0.08)',
            borderRadius: 16,
            padding: 20,
            marginBottom: 16,
          }}>
            <p style={{ color: '#C9963C', fontWeight: 700, fontSize: 22, margin: '0 0 4px' }}>131€/Monat</p>
            <p style={{ color: '#B8B0A4', fontSize: 13, margin: 0 }}>von der Pflegekasse — 0€ Eigenanteil</p>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Engel finden', 'Termin buchen', 'Abrechnung läuft'].map((t, i) => (
              <span key={t} style={{
                background: 'rgba(255,255,255,0.06)',
                color: '#B8B0A4',
                fontSize: 12,
                padding: '6px 12px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <span style={{ color: '#C9963C', fontWeight: 700 }}>{i + 1}</span> {t}
              </span>
            ))}
          </div>
        </div>
      ),
      cta: 'Engel finden',
    },
  ]

  if (loading || !show) return null

  const currentStep = steps[step]

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'radial-gradient(ellipse at center top, rgba(201,150,60,0.08) 0%, rgba(26,22,18,0.95) 50%, rgba(0,0,0,0.95) 100%)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      padding: '0 0 env(safe-area-inset-bottom, 0px)',
    }}>
      {/* Dezente Brand-Silhouette im Hintergrund — damit der obere Bereich nicht leer wirkt */}
      <div style={{
        position: 'absolute',
        top: '12vh',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 220,
        height: 220,
        opacity: 0.08,
        pointerEvents: 'none',
        zIndex: 0,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-512x512.png"
          alt=""
          aria-hidden="true"
          style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'blur(0.5px)' }}
        />
      </div>
      {/* Brand-Schriftzug dezent ueber dem Logo */}
      <div style={{
        position: 'absolute',
        top: '8vh',
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 14,
        letterSpacing: 4,
        color: 'rgba(201, 150, 60, 0.35)',
        fontWeight: 600,
        pointerEvents: 'none',
        zIndex: 1,
      }}>
        ALLTAGSENGEL
      </div>
      <div style={{
        background: 'linear-gradient(180deg, #2A2420 0%, #1E1A16 100%)',
        borderRadius: '28px 28px 0 0',
        padding: 'clamp(24px, 5vw, 36px)',
        width: '100%',
        maxWidth: 420,
        maxHeight: '85vh',
        overflow: 'auto',
        animation: 'slideUp 0.4s ease-out',
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 8,
              height: 8,
              borderRadius: 4,
              background: i <= step ? '#C9963C' : 'rgba(255,255,255,0.1)',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>

        {/* Title */}
        <h2 style={{
          color: '#F5F0E8',
          fontSize: 'clamp(22px, 5vw, 26px)',
          fontWeight: 700,
          textAlign: 'center',
          marginBottom: 4,
          lineHeight: 1.2,
        }}>
          {currentStep.title}
        </h2>
        <p style={{
          color: '#8A8279',
          fontSize: 14,
          textAlign: 'center',
          marginBottom: 20,
        }}>
          {currentStep.subtitle}
        </p>

        {/* Content */}
        {currentStep.content}

        {/* CTA Button */}
        <button
          onClick={nextStep}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: 14,
            border: 'none',
            background: 'linear-gradient(135deg, #C9963C 0%, #DDB660 100%)',
            color: '#1A1612',
            fontSize: 17,
            fontWeight: 700,
            cursor: 'pointer',
            marginTop: 20,
            transition: 'transform 0.2s',
          }}
        >
          {currentStep.cta}
        </button>

        {/* Skip button */}
        {step < steps.length - 1 && (
          <button
            onClick={completeOnboarding}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 12,
              border: 'none',
              background: 'transparent',
              color: '#666',
              fontSize: 14,
              cursor: 'pointer',
              marginTop: 8,
            }}
          >
            Überspringen
          </button>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}} />
    </div>
  )
}
