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
      // If there's a redirectTo URL, go there directly
      if (redirectTo) {
        router.push(redirectTo)
        router.refresh()
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', signInData.user.id)
        .single()

      if (profile?.role === 'admin') {
        router.push('/admin/home')
      } else if (profile?.role === 'engel') {
        // Check if angel profile exists
        const { data: angel } = await supabase
          .from('angels')
          .select('id')
          .eq('id', signInData.user.id)
          .single()
        router.push(angel ? '/engel/home' : '/engel/register')
      } else if (profile?.role === 'fahrer') {
        router.push('/fahrer/home')
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
      engel: { email: 'anna@example.com', password: 'Anna2026!' },
      kunde: { email: 'maria@example.com', password: 'Maria2026!' },
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

          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={async () => {
                setDemoLoading('mis')
                setError('')
                try {
                  const supabase = createClient()
                  const { data, error: authErr } = await supabase.auth.signInWithPassword({
                    email: 'mis-admin@alltagsengel.de', password: 'MisAdmin2026!'
                  })
                  if (authErr) { setError(authErr.message); return }
                  router.push('/mis')
                  router.refresh()
                } catch (err: any) {
                  setError(err?.message || 'Fehler')
                } finally { setDemoLoading('') }
              }}
              disabled={!!demoLoading || loading}
              style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid #C9963C', background: 'rgba(201,150,60,0.12)', color: '#C9963C', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (demoLoading || loading) ? 0.5 : 1, letterSpacing: 0.5 }}
            >
              {demoLoading === 'mis' ? '...' : '⚡ MIS Portal'}
            </button>
            <button
              onClick={() => {
                router.push('/investor')
              }}
              disabled={!!demoLoading || loading}
              style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid #C9963C', background: 'linear-gradient(135deg, rgba(201,150,60,0.18), rgba(201,150,60,0.06))', color: '#C9963C', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (demoLoading || loading) ? 0.5 : 1, letterSpacing: 0.5 }}
            >
              📊 Investor Portal
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
