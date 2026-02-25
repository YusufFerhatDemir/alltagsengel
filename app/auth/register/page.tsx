'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
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
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

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

      // Email confirmation required (session is null)
      if (data.user && !data.session) {
        setEmailSent(true)
        setLoading(false)
        return
      }

      // Auto-confirmed — create profile and redirect
      if (data.user && data.session) {
        // Profile may already exist via auth trigger, upsert to be safe
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: data.user.id,
          role,
          first_name: firstName,
          last_name: lastName,
          email,
        })

        if (profileError) {
          console.error('Profile upsert error:', profileError)
          // Don't block redirect — profile might already exist from auth trigger
        }

        if (role === 'engel') {
          router.push('/engel/register')
        } else {
          router.push('/kunde/home')
        }
        return
      }

      // Fallback — should not happen
      setError('Unbekannter Fehler. Bitte versuchen Sie es erneut.')
    } catch (err: any) {
      setError(err?.message || 'Netzwerkfehler. Bitte prüfen Sie Ihre Internetverbindung.')
    } finally {
      setLoading(false)
    }
  }

  if (emailSent) {
    return (
      <div className="screen auth-screen">
        <div className="auth-card">
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <Icon3D size={56} />
          </div>
          <div className="auth-title">E-Mail bestätigen</div>
          <div style={{ textAlign: 'center', color: 'var(--ink-3, #aaa)', lineHeight: 1.6, margin: '16px 0' }}>
            Wir haben eine Bestätigungs-E-Mail an <strong style={{ color: 'var(--gold-2, #c9a84c)' }}>{email}</strong> gesendet.
            <br /><br />
            Bitte klicken Sie auf den Link in der E-Mail, um Ihr Konto zu aktivieren.
          </div>
          <div className="auth-link" style={{ marginTop: 20 }}>
            <Link href="/auth/login">Zurück zur Anmeldung</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen auth-screen">
      <div className="auth-card">
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <Icon3D size={56} />
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
