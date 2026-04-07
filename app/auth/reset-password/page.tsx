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
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    // 1) Check if we already have a valid session (e.g. came through /auth/callback)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true)
        setChecking(false)
      }
    })

    // 2) Listen for PASSWORD_RECOVERY event (fallback for implicit/hash flow)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setSessionReady(true)
        setChecking(false)
      }
    })

    // 3) Try to exchange code from URL if present (handles PKCE when verifier is available)
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
        if (!exchangeError) {
          setSessionReady(true)
          // Clean up URL
          window.history.replaceState({}, '', window.location.pathname)
        }
        setChecking(false)
      })
    } else {
      // No code in URL — give a moment for session check / auth state change
      setTimeout(() => setChecking(false), 1500)
    }

    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein')
      return
    }
    if (password.length < 6) {
      setError('Passwort muss mindestens 6 Zeichen lang sein')
      return
    }

    setLoading(true)
    setError('')
    const supabase = createClient()

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    })

    if (updateError) {
      if (updateError.message.includes('session') || updateError.message.includes('token')) {
        setError('Der Link ist abgelaufen. Bitte fordern Sie einen neuen Link an.')
      } else {
        setError(updateError.message)
      }
      setLoading(false)
      return
    }

    // Sign out so the user logs in fresh with the new password
    await supabase.auth.signOut()
    setSuccess(true)
    setLoading(false)
    setTimeout(() => router.push('/auth/login'), 2500)
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
        ) : checking ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ color: 'var(--ink-4)', lineHeight: 1.5 }}>
              Sitzung wird überprüft...
            </p>
          </div>
        ) : !sessionReady ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 16, color: 'var(--red-w)' }}>&#9888;</div>
            <p style={{ color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: 20 }}>
              Der Link ist abgelaufen oder ungültig. Bitte fordern Sie einen neuen Link an.
            </p>
            <button
              className="btn-gold"
              onClick={() => router.push('/auth/forgot-password')}
              style={{ width: '100%' }}
            >
              NEUEN LINK ANFORDERN
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              className="auth-input"
              type="password"
              placeholder="Neues Passwort (min. 6 Zeichen)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
            <input
              className="auth-input"
              type="password"
              placeholder="Passwort bestätigen"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
            {error && <div className="auth-error">{error}</div>}
            <button
              className="btn-gold"
              type="submit"
              disabled={loading}
              style={{ width: '100%', marginTop: 8 }}
            >
              {loading ? 'Wird gespeichert...' : 'PASSWORT ÄNDERN'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
