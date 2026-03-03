'use client'
import React, { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { MIcon } from '@/components/mis/MisIcons'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const errorParam = searchParams.get('error')

  async function handleLogin(loginEmail: string, loginPassword: string) {
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail, password: loginPassword,
    })
    if (authError) {
      if (authError.message === 'Invalid login credentials') {
        setError('E-Mail oder Passwort ist falsch.')
      } else {
        setError(authError.message)
      }
      return
    }
    router.push('/')
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try { await handleLogin(email, password) }
    catch { setError('Netzwerkfehler') }
    finally { setLoading(false) }
  }

  async function demoLogin() {
    setDemoLoading(true)
    setError('')
    try { await handleLogin('admin@alltagsengel.de', 'Admin2026!') }
    catch { setError('Netzwerkfehler') }
    finally { setDemoLoading(false) }
  }

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: `linear-gradient(135deg, ${BRAND.gold}, ${BRAND.coal})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MIcon name="wings" size={28} />
          </div>
        </div>
        <div className="auth-title">MIS Portal</div>
        <div className="auth-sub">Management Information System</div>

        {errorParam === 'unauthorized' && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: BRAND.error, textAlign: 'center' }}>
            Sitzung abgelaufen. Bitte erneut anmelden.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input className="auth-input" type="email" placeholder="E-Mail-Adresse" value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="auth-input" type="password" placeholder="Passwort" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <div className="auth-error">{error}</div>}
          <button className="btn-gold" type="submit" disabled={loading || demoLoading} style={{ width: '100%', marginTop: 8 }}>
            {loading ? 'Anmelden...' : 'ANMELDEN'}
          </button>
        </form>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${BRAND.border}` }}>
          <div style={{ textAlign: 'center', fontSize: 11, color: BRAND.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Demo Zugang</div>
          <button onClick={demoLogin} disabled={loading || demoLoading} style={{
            width: '100%', padding: '10px 0', borderRadius: 10, border: `1px solid ${BRAND.gold}`,
            background: `${BRAND.gold}12`, color: BRAND.gold, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', opacity: (loading || demoLoading) ? 0.5 : 1, fontFamily: 'inherit',
          }}>
            {demoLoading ? 'Anmelden...' : 'Admin Demo Login'}
          </button>
          <div style={{ marginTop: 12, fontSize: 11, color: BRAND.muted, textAlign: 'center' }}>
            admin@alltagsengel.de / Admin2026!
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-bg"><div className="auth-card"><div className="auth-title">Laden...</div></div></div>}>
      <LoginForm />
    </Suspense>
  )
}
