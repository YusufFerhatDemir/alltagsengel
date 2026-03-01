'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Icon3D from '@/components/Icon3D'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    // Supabase will automatically pick up the token from the URL hash
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein')
      return
    }
    if (password.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen lang sein')
      return
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Passwort muss Groß-, Kleinbuchstaben und Zahlen enthalten')
      return
    }

    setLoading(true)
    setError('')
    const supabase = createClient()

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    })

    if (updateError) {
      setError('Passwort konnte nicht geändert werden. Bitte versuchen Sie es erneut.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
    setTimeout(() => router.push('/auth/login'), 2000)
  }

  return (
    <div className="screen auth-screen">
      <div className="auth-card">
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <Icon3D size={56} />
        </div>
        <div className="auth-title">Neues Passwort</div>
        <div className="auth-sub">
          {success ? 'Passwort erfolgreich geändert!' : 'Geben Sie Ihr neues Passwort ein'}
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 16, color: 'var(--green)' }}>&#10003;</div>
            <p style={{ color: 'var(--ink-3)', lineHeight: 1.5 }}>
              Sie werden zum Login weitergeleitet...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              className="auth-input"
              type="password"
              placeholder="Neues Passwort (min. 8 Zeichen, Groß-/Kleinbuchstaben + Zahl)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <input
              className="auth-input"
              type="password"
              placeholder="Passwort bestätigen"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
            {error && <div className="auth-error">{error}</div>}
            {!sessionReady && (
              <div style={{ color: 'var(--ink-4)', fontSize: 13, marginBottom: 8, textAlign: 'center' }}>
                Bitte den Link in Ihrer E-Mail verwenden.
              </div>
            )}
            <button className="btn-gold" type="submit" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
              {loading ? 'Wird gespeichert...' : 'PASSWORT ÄNDERN'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
