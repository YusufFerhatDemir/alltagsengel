'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { geocodePLZ } from '@/lib/geocoding'
import Link from 'next/link'
import Icon3D from '@/components/Icon3D'

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const role = searchParams.get('role') || 'kunde'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [plz, setPlz] = useState('')
  const [stadt, setStadt] = useState('')
  const [pflegegrad, setPflegegrad] = useState<number>(0)
  const [homeCare, setHomeCare] = useState(true)
  const [pflegehilfsmittel, setPflegehilfsmittel] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()

      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            first_name: firstName,
            last_name: lastName,
            role: role,
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
        } else if (authError.message.includes('signups not allowed') || authError.message.includes('Signups not allowed')) {
          setError('Registrierung ist derzeit deaktiviert. Bitte kontaktieren Sie den Support.')
        } else if (authError.message.includes('Database error')) {
          setError('Datenbankfehler. Bitte stellen Sie sicher, dass die Datenbank korrekt eingerichtet ist.')
        } else {
          setError(`Fehler: ${authError.message}`)
        }
        setLoading(false)
        return
      }

      // User already exists (Supabase returns user with empty identities for security)
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError('Ein Konto mit dieser E-Mail existiert bereits. Bitte melden Sie sich an.')
        setLoading(false)
        return
      }

      // User created successfully
      if (data.user) {
        // Try to create/update profile (may already exist via auth trigger)
        if (data.session) {
          const profileData: Record<string, string> = {
            id: data.user.id,
            role,
            first_name: firstName,
            last_name: lastName,
            email,
          }
          if (plz || stadt) {
            profileData.location = [plz, stadt].filter(Boolean).join(' ')
          }
          if (plz && plz.length === 5) {
            const coords = await geocodePLZ(plz)
            if (coords) {
              ;(profileData as any).latitude = coords.lat
              ;(profileData as any).longitude = coords.lng
            }
          }
          await supabase.from('profiles').upsert(profileData).then(() => {})

          // Pflegegrad speichern (nur für Kunden)
          if (role === 'kunde') {
            await supabase.from('care_eligibility').upsert({
              user_id: data.user.id,
              pflegegrad,
              home_care: homeCare,
              insurance_type: 'unknown',
              pflegehilfsmittel_interest: pflegehilfsmittel,
            }).then(() => {})
          }
        }

        // If session exists, redirect directly to home
        if (data.session) {
          if (role === 'engel') {
            router.push('/engel/register')
          } else {
            router.push('/kunde/home')
          }
          router.refresh()
          return
        }

        // No session (email confirmation required) — redirect to login with success
        router.push('/auth/login?registered=true')
        return
      }

      setError('Unbekannter Fehler. Bitte versuchen Sie es erneut.')
    } catch (err: any) {
      setError(err?.message || 'Netzwerkfehler. Bitte prüfen Sie Ihre Internetverbindung.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen auth-screen">
      <div className="auth-card">
        <div style={{ marginBottom: 14, textAlign: 'center' }}>
          <Icon3D size={44} />
        </div>
        <div className="auth-title">Konto erstellen</div>
        <div className="auth-sub">
          {role === 'kunde' ? 'Als Kunde registrieren' : 'Als Engel registrieren'}
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input className="auth-input" type="text" placeholder="Vorname" value={firstName} onChange={e => setFirstName(e.target.value)} required />
            <input className="auth-input" type="text" placeholder="Nachname" value={lastName} onChange={e => setLastName(e.target.value)} required />
          </div>
          <input className="auth-input" type="email" placeholder="E-Mail-Adresse" value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="auth-input" type="password" placeholder="Passwort (min. 6 Zeichen)" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          {role === 'kunde' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10 }}>
                <input className="auth-input" type="text" placeholder="PLZ" value={plz} onChange={e => setPlz(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" maxLength={5} required />
                <input className="auth-input" type="text" placeholder="Stadt" value={stadt} onChange={e => setStadt(e.target.value)} required />
              </div>

              {/* Pflegegrad Toggle-Buttons */}
              <div className="reg-section">
                <div className="reg-section-title">Pflegegrad</div>
                <div className="reg-toggle-row">
                  {[0, 1, 2, 3, 4, 5].map(g => (
                    <button
                      key={g}
                      type="button"
                      className={`reg-toggle-btn${pflegegrad === g ? ' active' : ''}`}
                      onClick={() => setPflegegrad(g)}
                    >
                      {g === 0 ? 'Kein' : `${g}`}
                    </button>
                  ))}
                </div>
                {pflegegrad > 0 && (
                  <div className="reg-hint">Pflegegrad {pflegegrad} — Sie haben Anspruch auf Entlastungsleistungen</div>
                )}
              </div>

              {/* Häusliche Pflege Toggle */}
              <div className="reg-section">
                <div className="reg-section-title">Pflege zu Hause?</div>
                <div className="reg-switch-row" onClick={() => setHomeCare(!homeCare)}>
                  <span className="reg-switch-label">{homeCare ? 'Ja, häusliche Pflege' : 'Nein'}</span>
                  <div className={`reg-switch${homeCare ? ' on' : ''}`}>
                    <div className="reg-switch-knob" />
                  </div>
                </div>
              </div>

              {/* Pflegehilfsmittel Toggle */}
              {pflegegrad >= 1 && homeCare && (
                <div className="reg-section">
                  <div className="reg-section-title">Pflegehilfsmittel (bis 42 €/Monat)</div>
                  <div className="reg-section-desc">Handschuhe, Desinfektion, Masken u.v.m. — von der Pflegekasse übernommen.</div>
                  <div className="reg-switch-row" onClick={() => setPflegehilfsmittel(!pflegehilfsmittel)}>
                    <span className="reg-switch-label">{pflegehilfsmittel ? 'Ja, Interesse' : 'Noch nicht'}</span>
                    <div className={`reg-switch${pflegehilfsmittel ? ' on' : ''}`}>
                      <div className="reg-switch-knob" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {error && <div className="auth-error">{error}</div>}
          <button className="btn-gold" type="submit" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
            {loading ? 'Wird erstellt...' : 'REGISTRIEREN'}
          </button>
        </form>
        <div className="auth-link">
          Bereits ein Konto? <Link href="/auth/login">Anmelden</Link>
        </div>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="screen auth-screen"><div className="auth-card"><div className="auth-title">Laden...</div></div></div>}>
      <RegisterForm />
    </Suspense>
  )
}
