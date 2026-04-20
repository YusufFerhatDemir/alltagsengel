'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { geocodePLZ } from '@/lib/geocoding'
import { validatePassword, validatePasswordAsync } from '@/lib/password-validation'
import Link from 'next/link'
import Icon3D from '@/components/Icon3D'
import { trackRegistration } from '@/lib/tracking'

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // SICHERHEIT: Nur erlaubte Rollen — admin/superadmin NICHT per URL möglich
  const ALLOWED_SIGNUP_ROLES = ['kunde', 'engel', 'fahrer']
  const rawRole = searchParams.get('role') || 'kunde'
  const role = ALLOWED_SIGNUP_ROLES.includes(rawRole) ? rawRole : 'kunde'
  // Referral-Code: aus URL oder Cookie (wurde von Middleware gesetzt)
  const refFromUrl = searchParams.get('ref') || ''
  const refCode = refFromUrl || (typeof document !== 'undefined'
    ? document.cookie.match(/ref_code=([^;]+)/)?.[1] || ''
    : '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [plz, setPlz] = useState('')
  const [stadt, setStadt] = useState('')
  const [pflegegrad, setPflegegrad] = useState<number>(0)
  const [homeCare, setHomeCare] = useState(true)
  const [pflegehilfsmittel, setPflegehilfsmittel] = useState(false)
  // Angehörigen-Modus
  const [registerFor, setRegisterFor] = useState<'selbst' | 'angehoerig'>('selbst')
  const [crFirstName, setCrFirstName] = useState('')
  const [crLastName, setCrLastName] = useState('')
  const [crBirthYear, setCrBirthYear] = useState('')
  const [crAddress, setCrAddress] = useState('')
  const [crPlz, setCrPlz] = useState('')
  const [crCity, setCrCity] = useState('')
  const [crRelationship, setCrRelationship] = useState('')
  const [crNotes, setCrNotes] = useState('')
  const [error, setError] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<string[]>([])
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong'>('weak')
  const [loading, setLoading] = useState(false)

  // Passwort-Validierung in Echtzeit
  function handlePasswordChange(value: string) {
    setPassword(value)
    if (value.length > 0) {
      const result = validatePassword(value)
      setPasswordErrors(result.errors)
      setPasswordStrength(result.strength)
    } else {
      setPasswordErrors([])
      setPasswordStrength('weak')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // ═══ Passwort-Validierung (zxcvbn + Regex, AUTH-011) ═══
    // userInputs: persönliche Strings, die zxcvbn zusätzlich als „bekannt" wertet.
    // So wird z. B. „Alltagsengel2024!" oder „yusuf12345" als zu schwach erkannt.
    const pwCheck = await validatePasswordAsync(password, [
      email,
      email.split('@')[0] || '',
      firstName,
      lastName,
      'Alltagsengel',
      'alltagsengel',
    ])
    if (!pwCheck.valid) {
      setError(
        pwCheck.errors[0] && pwCheck.errors[0].startsWith('Zu schwach')
          ? pwCheck.errors[0]
          : 'Passwort erfüllt nicht die Mindestanforderungen.'
      )
      setPasswordErrors(pwCheck.errors)
      setPasswordStrength(pwCheck.strength)
      setLoading(false)
      return
    }

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
        // AUTH-005 Fix: "already registered" verrät Existenz → generischen Success-Flow nutzen (silent redirect).
        // Supabase sendet bei bereits registrierten E-Mails intern nichts — kein Leak nach außen.
        if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
          router.push('/auth/login?registered=true')
          return
        } else if (authError.message.includes('valid email')) {
          setError('Bitte geben Sie eine gültige E-Mail-Adresse ein.')
        } else if (authError.message.includes('at least')) {
          setError('Das Passwort muss mindestens 8 Zeichen lang sein und Großbuchstaben, Zahlen und Sonderzeichen enthalten.')
        } else if (authError.message.includes('rate limit') || authError.message.includes('too many')) {
          setError('Zu viele Versuche. Bitte warten Sie einen Moment.')
        } else if (authError.message.includes('signups not allowed') || authError.message.includes('Signups not allowed')) {
          setError('Registrierung ist derzeit deaktiviert. Bitte kontaktieren Sie den Support.')
        } else if (authError.message.includes('Database error')) {
          setError('Registrierung fehlgeschlagen. Bitte versuchen Sie es später erneut.')
        } else {
          // AUTH-005: Keine rohen Supabase-Messages leaken
          setError('Registrierung fehlgeschlagen. Bitte prüfen Sie Ihre Angaben oder versuchen Sie es später erneut.')
        }
        setLoading(false)
        return
      }

      // AUTH-005 Fix: User already exists (Supabase liefert user mit leeren identities als Enumeration-Schutz).
      // Wir behandeln das wie einen echten Erfolg → gleicher Redirect, keine Welcome-Mail (um Re-Send zu vermeiden).
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        router.push('/auth/login?registered=true')
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
            (profileData as any).postal_code = plz
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
          // Hinweis: care_eligibility-Schreibvorgang entfernt (Pflegebox-Feature deaktiviert,
          // Tabelle existiert nicht in DB). Pflegegrad wandert in care_recipients beim
          // Angehörigen-Modus; Selbst-Modus speichert nur das Profil. Wenn Pflegebox spaeter
          // priorisiert wird, kommt eine eigene DB-Migration + Re-Insert hier dran.
          if (role === 'kunde') {
            // Angehörige Person speichern
            if (registerFor === 'angehoerig' && crFirstName && crLastName) {
              await supabase.from('care_recipients').insert({
                profile_id: data.user.id,
                first_name: crFirstName,
                last_name: crLastName,
                birth_year: crBirthYear ? parseInt(crBirthYear) : null,
                pflegegrad: pflegegrad || null,
                address: crAddress || null,
                postal_code: crPlz || null,
                city: crCity || null,
                relationship: crRelationship || null,
                notes: crNotes || null,
              }).then(() => {})
            }
          }
        }

        // Notify admins about new registration (fire-and-forget)
        if (data.user) {
          fetch('/api/notify-admin-registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: data.user.id,
              role,
              firstName: firstName,
              lastName: lastName,
              email,
              phone: '',
            }),
          }).catch(() => {})
        }

        // Always send welcome/confirmation email via Resend (fire-and-forget)
        fetch('/api/auth/send-welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, firstName, role }),
        }).catch(() => {})

        // Referral-Code einlösen (fire-and-forget)
        if (refCode && data.user) {
          fetch('/api/referral', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              referral_code: refCode,
              referred_user_id: data.user.id,
            }),
          }).catch(() => {})
        }

        // Conversion-Tracking für Google Ads
        trackRegistration(role as 'kunde' | 'engel' | 'fahrer')

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

        router.push('/auth/login?registered=true')
        return
      }

      setError('Registrierung fehlgeschlagen. Bitte versuchen Sie es später erneut.')
    } catch (err: any) {
      // AUTH-005 / AUTH-002: Rohe err.message nicht leaken (kann Enumeration oder interne Details enthüllen)
      console.error('register error:', { name: err?.name, code: err?.code })
      setError('Netzwerkfehler. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.')
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
          <input className="auth-input" type="email" placeholder="E-Mail-Adresse" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          <input className="auth-input" type="password" placeholder="Passwort (min. 8 Zeichen)" value={password} onChange={e => handlePasswordChange(e.target.value)} required minLength={8} autoComplete="new-password" />
          {password.length > 0 && (
            <div style={{ marginTop: -4, marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: passwordStrength === 'weak' ? '#D04B3B' : passwordStrength === 'medium' ? '#ff9800' : '#4caf50' }} />
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: passwordStrength === 'medium' ? '#ff9800' : passwordStrength === 'strong' ? '#4caf50' : 'rgba(255,255,255,0.1)' }} />
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: passwordStrength === 'strong' ? '#4caf50' : 'rgba(255,255,255,0.1)' }} />
              </div>
              {passwordErrors.length > 0 && (
                <div style={{ fontSize: 11, color: '#ef9a9a' }}>
                  {passwordErrors.map((err, i) => <div key={i}>• {err}</div>)}
                </div>
              )}
              {passwordErrors.length === 0 && (
                <div style={{ fontSize: 11, color: '#81c784' }}>Passwort erfüllt alle Anforderungen</div>
              )}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10 }}>
            <input className="auth-input" type="text" placeholder="PLZ" value={plz} onChange={e => setPlz(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" maxLength={5} minLength={5} required />
            <input className="auth-input" type="text" placeholder="Stadt" value={stadt} onChange={e => setStadt(e.target.value)} required />
          </div>
          {role === 'kunde' && (
            <>
              {/* Für wen suchen Sie Unterstützung? */}
              <div className="reg-section">
                <div className="reg-section-title">Für wen suchen Sie Unterstützung?</div>
                <div className="reg-toggle-row">
                  <button
                    type="button"
                    className={`reg-toggle-btn${registerFor === 'selbst' ? ' active' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => setRegisterFor('selbst')}
                  >
                    Für mich selbst
                  </button>
                  <button
                    type="button"
                    className={`reg-toggle-btn${registerFor === 'angehoerig' ? ' active' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => setRegisterFor('angehoerig')}
                  >
                    Für einen Angehörigen
                  </button>
                </div>
              </div>

              {/* Angehörigen-Daten */}
              {registerFor === 'angehoerig' && (
                <div className="reg-section" style={{ background: 'rgba(212,175,55,0.08)', borderRadius: 12, padding: 14, marginBottom: 8 }}>
                  <div className="reg-section-title" style={{ marginBottom: 8 }}>Angaben zur pflegebedürftigen Person</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input className="auth-input" type="text" placeholder="Vorname *" value={crFirstName} onChange={e => setCrFirstName(e.target.value)} required />
                    <input className="auth-input" type="text" placeholder="Nachname *" value={crLastName} onChange={e => setCrLastName(e.target.value)} required />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input className="auth-input" type="text" placeholder="Geburtsjahr" value={crBirthYear} onChange={e => setCrBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" maxLength={4} />
                    <select className="auth-input" value={crRelationship} onChange={e => setCrRelationship(e.target.value)} style={{ color: crRelationship ? '#F5F0E8' : '#8a8070' }}>
                      <option value="">Beziehung...</option>
                      <option value="Mutter">Mutter</option>
                      <option value="Vater">Vater</option>
                      <option value="Kind">Kind</option>
                      <option value="Ehepartner/in">Ehepartner/in</option>
                      <option value="Großelternteil">Großelternteil</option>
                      <option value="Sonstige">Sonstige</option>
                    </select>
                  </div>
                  <input className="auth-input" type="text" placeholder="Adresse der pflegebedürftigen Person" value={crAddress} onChange={e => setCrAddress(e.target.value)} />
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10 }}>
                    <input className="auth-input" type="text" placeholder="PLZ" value={crPlz} onChange={e => setCrPlz(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" maxLength={5} />
                    <input className="auth-input" type="text" placeholder="Stadt" value={crCity} onChange={e => setCrCity(e.target.value)} />
                  </div>
                  <textarea className="auth-input" placeholder="Besondere Hinweise (z.B. Mobilität, Demenz, Allergien...)" value={crNotes} onChange={e => setCrNotes(e.target.value)} rows={2} style={{ resize: 'vertical', minHeight: 50 }} />
                </div>
              )}

              {/* Pflegegrad Toggle-Buttons */}
              <div className="reg-section">
                <div className="reg-section-title">
                  {registerFor === 'angehoerig' ? 'Pflegegrad des Angehörigen' : 'Pflegegrad'}
                </div>
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
                  <div className="reg-hint">
                    Pflegegrad {pflegegrad} — {registerFor === 'angehoerig' ? 'Ihr Angehöriger hat' : 'Sie haben'} Anspruch auf Entlastungsleistungen
                  </div>
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
