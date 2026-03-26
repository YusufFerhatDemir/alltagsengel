'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Icon3D from '@/components/Icon3D'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const justRegistered = searchParams.get('registered') === 'true'
  const redirectTo = searchParams.get('redirectTo') || ''
  const adminError = searchParams.get('error') === 'admin_required'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function getDeviceInfo(): string {
    const ua = navigator.userAgent
    if (/iPhone/i.test(ua)) return 'iPhone'
    if (/iPad/i.test(ua)) return 'iPad'
    if (/Android/i.test(ua)) return 'Android'
    if (/Mac/i.test(ua)) return 'Mac'
    if (/Windows/i.test(ua)) return 'Windows'
    if (/Linux/i.test(ua)) return 'Linux'
    return 'Unbekannt'
  }

  async function getClientIP(): Promise<string> {
    try {
      // Erst eigene API Route (funktioniert immer, auch auf iPhone)
      const res = await fetch('/api/client-ip', { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const data = await res.json()
        if (data.ip) return data.ip
      }
    } catch {}
    try {
      // Fallback: ipapi.co (funktioniert auf Desktop)
      const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const data = await res.json()
        return data.ip || ''
      }
    } catch {}
    return ''
  }

  async function loginAndRedirect(loginEmail: string, loginPassword: string) {
    const supabase = createClient()
    const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    })

    if (authError) {
      if (authError.message === 'Email not confirmed') {
        setError('Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse. Prüfen Sie Ihren Posteingang.')
      } else if (authError.message === 'Invalid login credentials') {
        setError('E-Mail oder Passwort ist falsch.')
      } else {
        setError(authError.message)
      }
      return
    }

    if (!signInData.user) return

    // Role direkt JWT'den al — veritabanı sorgusu YOK
    const role = signInData.user.user_metadata?.role || ''

    // Log arka planda (redirect'i beklemesin)
    Promise.all([
      getClientIP(),
      supabase.from('profiles').select('first_name, last_name').eq('id', signInData.user.id).single()
    ]).then(([ip, { data: profile }]) => {
      const displayName = profile?.first_name
        ? `${profile.first_name} ${(profile.last_name || '').charAt(0)}.`.trim()
        : signInData.user.user_metadata?.first_name || signInData.user.email
      supabase.from('mis_auth_log').insert({
        user_id: signInData.user.id,
        user_email: signInData.user.email,
        user_name: displayName,
        action: 'login',
        ip_address: ip || null,
        device: getDeviceInfo(),
        status: 'success',
      }).then(() => {})
    })

    // Yönlendirme — basit ve hızlı
    if (role === 'admin' || role === 'superadmin') {
      window.location.href = '/mis'
    } else if (role === 'engel') {
      window.location.href = '/engel/home'
    } else if (role === 'fahrer') {
      window.location.href = '/fahrer/home'
    } else {
      window.location.href = '/kunde/home'
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await loginAndRedirect(email, password)
    } catch (err: any) {
      setError(err?.message || 'Netzwerkfehler. Bitte versuchen Sie es erneut.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen auth-screen">
      <div className="auth-card">
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <Icon3D size={56} />
        </div>
        <div className="auth-title">Willkommen zurück</div>
        <div className="auth-sub">Melden Sie sich an</div>

        {justRegistered && (
          <div style={{ background: 'rgba(76, 175, 80, 0.15)', border: '1px solid rgba(76, 175, 80, 0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: '#81c784', textAlign: 'center' }}>
            Konto erfolgreich erstellt! Bitte prüfen Sie Ihre E-Mail und melden Sie sich dann an.
          </div>
        )}

        {adminError && (
          <div style={{ background: 'rgba(208, 75, 59, 0.15)', border: '1px solid rgba(208, 75, 59, 0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: '#ef9a9a', textAlign: 'center' }}>
            Zugriff verweigert. Admin-Berechtigung erforderlich.
          </div>
        )}

        {redirectTo?.startsWith('/mis') && (
          <div style={{ background: 'rgba(201, 150, 60, 0.12)', border: '1px solid rgba(201, 150, 60, 0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: '#C9963C', textAlign: 'center' }}>
            MIS Portal — Bitte melden Sie sich mit Ihrem Admin-Konto an.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input className="auth-input" type="email" placeholder="E-Mail-Adresse" value={email} onChange={e => setEmail(e.target.value)} required />
          <div style={{ position: 'relative' }}>
            <input className="auth-input" type={showPassword ? 'text' : 'password'} placeholder="Passwort" value={password} onChange={e => setPassword(e.target.value)} required style={{ paddingRight: 48 }} />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(201,150,60,0.6)', cursor: 'pointer', fontSize: 13, padding: '4px 0' }}
            >
              {showPassword ? 'Verbergen' : 'Anzeigen'}
            </button>
          </div>
          {error && <div className="auth-error">{error}</div>}
          <div style={{ textAlign: 'right', marginBottom: 4 }}>
            <Link href="/auth/forgot-password" style={{ color: 'var(--gold-2)', fontSize: 13, textDecoration: 'none' }}>Passwort vergessen?</Link>
          </div>
          <button className="btn-gold" type="submit" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
            {loading ? 'Anmelden...' : 'ANMELDEN'}
          </button>
        </form>
        <div className="auth-link">
          Noch kein Konto? <Link href="/choose">Registrieren</Link>
        </div>


      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="screen auth-screen"><div className="auth-card"><div className="auth-title">Laden...</div></div></div>}>
      <LoginForm />
    </Suspense>
  )
}
