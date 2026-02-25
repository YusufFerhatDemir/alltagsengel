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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        role,
        first_name: firstName,
        last_name: lastName,
        email,
      })

      if (profileError) {
        setError(profileError.message)
        setLoading(false)
        return
      }

      if (role === 'engel') {
        router.push('/engel/register')
      } else {
        router.push('/kunde/home')
      }
    }
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
