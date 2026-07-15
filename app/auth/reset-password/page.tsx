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
    let cancelled = false

    const ready = () => {
      if (cancelled) return
      setSessionReady(true)
      setChecking(false)
    }
    const fail = () => {
      if (cancelled) return
      setChecking(false)
    }

    // PASSWORD_RECOVERY/SIGNED_IN kann auch aus einer parallelen Quelle kommen
    // (z. B. bereits laufende Session-Wiederherstellung) — dann sind wir fertig.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') ready()
    })

    async function establishSession() {
      const { pathname, search, hash } = window.location
      const query = new URLSearchParams(search)
      const hashParams = new URLSearchParams(hash.replace(/^#/, ''))
      const cleanUrl = () => window.history.replaceState({}, '', pathname)

      // 1) Aktueller Flow: token_hash aus unserer eigenen Reset-Mail.
      //    verifyOtp ist unabhängig vom flowType des Clients und braucht
      //    keinen code_verifier. Siehe lib/supabase/recovery-link.ts
      const tokenHash = query.get('token_hash')
      if (tokenHash) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash,
        })
        cleanUrl()
        return otpError ? fail() : ready()
      }

      // 2) Alt-Links, die noch in Postfächern liegen: Supabase /verify leitet mit
      //    Implicit-Tokens im Fragment weiter. supabase-js ignoriert die wegen
      //    flowType 'pkce' ("Not a valid PKCE flow url") — also selbst setzen.
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        cleanUrl()
        return sessionError ? fail() : ready()
      }

      // 3) PKCE-Code — greift nur, wenn der Flow im selben Browser gestartet wurde.
      const code = query.get('code')
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        cleanUrl()
        return exchangeError ? fail() : ready()
      }

      // 4) Kein Token in der URL — evtl. besteht bereits eine Session.
      const { data: { session } } = await supabase.auth.getSession()
      return session ? ready() : fail()
    }

    establishSession()

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
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
