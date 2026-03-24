'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Icon3D from '@/components/Icon3D'

export default function FahrerRegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    companyName: '',
    licenseNumber: '',
    taxId: '',
    address: '',
    plz: '',
    city: '',
    phone: '',
  })
  
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const supabase = createClient()

      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            role: 'fahrer',
          },
        },
      })

      if (authError) {
        if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
          setError('Diese E-Mail ist bereits registriert. Bitte melden Sie sich an.')
        } else if (authError.message.includes('valid email')) {
          setError('Bitte geben Sie eine gültige E-Mail-Adresse ein.')
        } else if (authError.message.includes('at least')) {
          setError('Das Passwort muss mindestens 6 Zeichen lang sein.')
        } else if (authError.message.includes('rate limit') || authError.message.includes('too many')) {
          setError('Zu viele Versuche. Bitte warten Sie einen Moment.')
        } else {
          setError(`Fehler: ${authError.message}`)
        }
        setSubmitting(false)
        return
      }

      if (!authData.user) {
        setError('Registrierung fehlgeschlagen. Bitte versuchen Sie es später erneut.')
        setSubmitting(false)
        return
      }

      const userId = authData.user.id

      // 2. Update profile with role='fahrer'
      const { error: profileError } = await supabase.from('profiles').update({
        role: 'fahrer',
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone: formData.phone,
        location: [formData.plz, formData.city].filter(Boolean).join(' '),
        postal_code: formData.plz && formData.plz.length === 5 ? formData.plz : null,
      }).eq('id', userId)

      if (profileError) {
        setError(`Fehler beim Speichern des Profils: ${profileError.message}`)
        setSubmitting(false)
        return
      }

      // 3. Insert into krankenfahrt_providers
      const { error: providerError } = await supabase.from('krankenfahrt_providers').insert({
        user_id: userId,
        company_name: formData.companyName,
        license_number: formData.licenseNumber,
        tax_id: formData.taxId,
        address: formData.address,
        city: formData.city,
        phone: formData.phone,
        email: formData.email,
        status: 'pending',
        is_verified: false,
      })

      if (providerError) {
        setError(`Fehler beim Speichern der Anbieter-Daten: ${providerError.message}`)
        setSubmitting(false)
        return
      }

      // Notify admins about new registration
      if (authData.user) {
        fetch('/api/notify-admin-registration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: authData.user.id,
            role: 'fahrer',
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            phone: formData.phone,
          }),
        }).catch(() => {})
      }

      // Redirect to home if session exists
      if (authData.session) {
        router.push('/fahrer/home')
        router.refresh()
      } else {
        router.push('/auth/login?registered=true')
      }
    } catch (err: any) {
      setError(err?.message || 'Netzwerkfehler. Bitte prüfen Sie Ihre Internetverbindung.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="phone">
      <div className="screen" style={{ backgroundColor: '#1A1612' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 20px 8px',
        }}>
          <button
            className="back-btn dark"
            onClick={() => router.back()}
            type="button"
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: '#252118',
              border: '1.5px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 20,
              color: '#C4B8A8',
            }}
          >
            ‹
          </button>
          <div style={{
            flex: 1,
            fontSize: 16,
            fontWeight: 600,
            color: '#F5F0E8',
          }}>
            Fahrer registrieren
          </div>
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              className="topbar-dots dark"
              onClick={() => setMenuOpen(!menuOpen)}
              type="button"
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: '#252118',
                border: '1.5px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 20,
                color: '#C4B8A8',
              }}
            >
              ⋮
            </button>
            {menuOpen && (
              <div style={{
                position: 'absolute',
                top: 45,
                right: 0,
                background: '#252118',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 12,
                minWidth: 180,
                zIndex: 100,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              }}>
                <button
                  onClick={() => { setMenuOpen(false); router.push('/choose') }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: 'transparent',
                    color: '#F5F0E8',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 14,
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  Rollenwahl
                </button>
                <button
                  onClick={() => { setMenuOpen(false); router.push('/auth/login') }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: 'transparent',
                    color: '#F5F0E8',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 14,
                  }}
                >
                  Abmelden
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 20px 100px',
        }}>
          {/* Hero Section */}
          <div style={{
            textAlign: 'center',
            marginBottom: 32,
            paddingTop: 20,
          }}>
            <div style={{ marginBottom: 16 }}><Icon3D size={64} /></div>
            <div style={{
              fontSize: 26,
              fontWeight: 700,
              color: '#F5F0E8',
              marginBottom: 8,
            }}>
              Krankenfahrt-Dienstleister
            </div>
            <div style={{
              fontSize: 14,
              color: 'rgba(245, 240, 232, 0.4)',
              lineHeight: 1.6,
            }}>
              Registrieren Sie Ihren Transportdienst.<br/>Professionell und zuverlässig.
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Personal Data */}
            <div style={{
              background: '#252118',
              border: '1px solid rgba(201, 150, 60, 0.15)',
              borderRadius: 16,
              padding: 16,
            }}>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#C9963C',
                marginBottom: 12,
              }}>
                Persönliche Daten
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginBottom: 10,
              }}>
                <input
                  type="text"
                  placeholder="Vorname"
                  value={formData.firstName}
                  onChange={e => handleInputChange('firstName', e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: '#1A1612',
                    color: '#F5F0E8',
                    fontSize: 14,
                    fontFamily: 'Jost, sans-serif',
                  }}
                />
                <input
                  type="text"
                  placeholder="Nachname"
                  value={formData.lastName}
                  onChange={e => handleInputChange('lastName', e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: '#1A1612',
                    color: '#F5F0E8',
                    fontSize: 14,
                    fontFamily: 'Jost, sans-serif',
                  }}
                />
              </div>
              <input
                type="email"
                placeholder="E-Mail-Adresse"
                value={formData.email}
                onChange={e => handleInputChange('email', e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: '#1A1612',
                  color: '#F5F0E8',
                  fontSize: 14,
                  fontFamily: 'Jost, sans-serif',
                  marginBottom: 10,
                }}
              />
              <input
                type="password"
                placeholder="Passwort (min. 6 Zeichen)"
                value={formData.password}
                onChange={e => handleInputChange('password', e.target.value)}
                required
                minLength={6}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: '#1A1612',
                  color: '#F5F0E8',
                  fontSize: 14,
                  fontFamily: 'Jost, sans-serif',
                }}
              />
            </div>

            {/* Company Data */}
            <div style={{
              background: '#252118',
              border: '1px solid rgba(201, 150, 60, 0.15)',
              borderRadius: 16,
              padding: 16,
            }}>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#C9963C',
                marginBottom: 12,
              }}>
                Unternehmensdaten
              </div>
              <input
                type="text"
                placeholder="Firmenname"
                value={formData.companyName}
                onChange={e => handleInputChange('companyName', e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: '#1A1612',
                  color: '#F5F0E8',
                  fontSize: 14,
                  fontFamily: 'Jost, sans-serif',
                  marginBottom: 10,
                }}
              />
              <input
                type="text"
                placeholder="Lizenz-Nr."
                value={formData.licenseNumber}
                onChange={e => handleInputChange('licenseNumber', e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: '#1A1612',
                  color: '#F5F0E8',
                  fontSize: 14,
                  fontFamily: 'Jost, sans-serif',
                  marginBottom: 10,
                }}
              />
              <input
                type="text"
                placeholder="Steuernummer"
                value={formData.taxId}
                onChange={e => handleInputChange('taxId', e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: '#1A1612',
                  color: '#F5F0E8',
                  fontSize: 14,
                  fontFamily: 'Jost, sans-serif',
                  marginBottom: 10,
                }}
              />
            </div>

            {/* Contact & Address */}
            <div style={{
              background: '#252118',
              border: '1px solid rgba(201, 150, 60, 0.15)',
              borderRadius: 16,
              padding: 16,
            }}>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#C9963C',
                marginBottom: 12,
              }}>
                Kontakt & Adresse
              </div>
              <input
                type="text"
                placeholder="Adresse"
                value={formData.address}
                onChange={e => handleInputChange('address', e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: '#1A1612',
                  color: '#F5F0E8',
                  fontSize: 14,
                  fontFamily: 'Jost, sans-serif',
                  marginBottom: 10,
                }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10, marginBottom: 10 }}>
                <input
                  type="text"
                  placeholder="PLZ"
                  value={formData.plz}
                  onChange={e => handleInputChange('plz', e.target.value.replace(/\D/g, '').slice(0, 5))}
                  inputMode="numeric"
                  maxLength={5}
                  minLength={5}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: '#1A1612',
                    color: '#F5F0E8',
                    fontSize: 14,
                    fontFamily: 'Jost, sans-serif',
                  }}
                />
                <input
                  type="text"
                  placeholder="Stadt"
                  value={formData.city}
                  onChange={e => handleInputChange('city', e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: '#1A1612',
                    color: '#F5F0E8',
                    fontSize: 14,
                    fontFamily: 'Jost, sans-serif',
                  }}
                />
              </div>
              <input
                type="tel"
                placeholder="Telefonnummer"
                value={formData.phone}
                onChange={e => handleInputChange('phone', e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: '#1A1612',
                  color: '#F5F0E8',
                  fontSize: 14,
                  fontFamily: 'Jost, sans-serif',
                }}
              />
            </div>

            {/* Terms & Agreement */}
            <div style={{
              background: 'rgba(201, 150, 60, 0.08)',
              border: '1px solid rgba(201, 150, 60, 0.15)',
              borderRadius: 12,
              padding: 12,
              marginBottom: 8,
            }}>
              <div style={{
                fontSize: 12,
                color: 'rgba(245, 240, 232, 0.6)',
                lineHeight: 1.6,
              }}>
                Ich akzeptiere die <strong>AGB</strong>, <strong>Datenschutzerklärung</strong> und bestätige die Richtigkeit meiner Angaben.
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div style={{
                color: '#D04B3B',
                padding: '8px 12px',
                fontSize: 13,
                borderRadius: 8,
                background: 'rgba(208, 75, 59, 0.1)',
                border: '1px solid rgba(208, 75, 59, 0.2)',
              }}>
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%',
                height: 54,
                borderRadius: 14,
                background: submitting
                  ? 'rgba(201, 150, 60, 0.4)'
                  : 'linear-gradient(135deg, #DBA84A 0%, #C9963C 55%, #9A7020 100%)',
                border: 'none',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'Jost, sans-serif',
                fontSize: 14,
                fontWeight: 700,
                color: '#1A1612',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                boxShadow: '0 4px 28px rgba(201, 150, 60, 0.35), 0 0 0 1px rgba(201, 150, 60, 0.18)',
                marginTop: 8,
                transition: 'all 0.2s',
              }}
            >
              {submitting ? 'Wird registriert...' : 'Als Fahrer registrieren'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
