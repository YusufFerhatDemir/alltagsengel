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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState('')

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

    if (signInData.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', signInData.user.id)
        .single()

      if (profile?.role === 'admin') {
        router.push('/admin/home')
      } else if (profile?.role === 'engel') {
        router.push('/engel/home')
      } else {
        router.push('/kunde/home')
      }
      router.refresh()
    }
  }

  async function demoLogin(role: 'admin' | 'engel' | 'kunde') {
    setDemoLoading(role)
    setError('')
    const creds = {
      admin: { email: 'admin@alltagsengel.de', password: 'Admin2026!' },
      engel: { email: 'anna@example.com', password: 'password123' },
      kunde: { email: 'maria@example.com', password: 'password123' },
    }
    try {
      await loginAndRedirect(creds[role].email, creds[role].password)
    } catch (err: any) {
      setError(err?.message || 'Netzwerkfehler. Bitte versuchen Sie es erneut.')
    } finally {
      setDemoLoading('')
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

        <form onSubmit={handleSubmit}>
          <input className="auth-input" type="email" placeholder="E-Mail-Adresse" value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="auth-input" type="password" placeholder="Passwort" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <div className="auth-error">{error}</div>}
          <div style={{ textAlign: 'right', marginBottom: 4 }}>
            <Link href="/auth/forgot-password" style={{ color: 'var(--gold-2)', fontSize: 13, textDecoration: 'none' }}>Passwort vergessen?</Link>
          </div>
          <button className="btn-gold" type="submit" disabled={loading || !!demoLoading} style={{ width: '100%', marginTop: 8 }}>
            {loading ? 'Anmelden...' : 'ANMELDEN'}
          </button>
        </form>
        <div className="auth-link">
          Noch kein Konto? <Link href="/choose">Registrieren</Link>
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--ink-6, #333)' }}>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-4, #888)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Demo Zugang</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => demoLogin('admin')}
              disabled={!!demoLoading || loading}
              style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--gold-2, #c9a84c)', background: 'transparent', color: 'var(--gold-2, #c9a84c)', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (demoLoading || loading) ? 0.5 : 1 }}
            >
              {demoLoading === 'admin' ? '...' : 'Admin'}
            </button>
            <button
              onClick={() => demoLogin('engel')}
              disabled={!!demoLoading || loading}
              style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--gold-2, #c9a84c)', background: 'transparent', color: 'var(--gold-2, #c9a84c)', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (demoLoading || loading) ? 0.5 : 1 }}
            >
              {demoLoading === 'engel' ? '...' : 'Engel'}
            </button>
            <button
              onClick={() => demoLogin('kunde')}
              disabled={!!demoLoading || loading}
              style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--gold-2, #c9a84c)', background: 'transparent', color: 'var(--gold-2, #c9a84c)', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (demoLoading || loading) ? 0.5 : 1 }}
            >
              {demoLoading === 'kunde' ? '...' : 'Kunde'}
            </button>
          </div>
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
