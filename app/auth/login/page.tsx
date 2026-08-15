'use client'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Icon3D from '@/components/Icon3D'
import { flushPendingProfile } from '@/lib/pending-profile'
import { codeAbfrageNoetig, type MfaNiveau } from '@/lib/coach/mfa'

// ═══ Brute-Force Schutz: Konstanten ═══
const MAX_CLIENT_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 900000 // 15 Minuten

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const justRegistered = searchParams.get('registered') === 'true'
  const redirectTo = searchParams.get('redirectTo') || searchParams.get('next') || ''
  const authError = searchParams.get('error') === 'admin_required' || searchParams.get('error') === 'auth_required'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showAdminPw, setShowAdminPw] = useState(false)
  const [adminPwInput, setAdminPwInput] = useState('')

  // ═══ Zweiter Faktor ═══
  // Hat das Konto einen bestätigten TOTP-Faktor, steht die Sitzung nach dem
  // Passwort erst auf AAL1. Erst der Code hebt sie auf AAL2 — bis dahin wird
  // NICHT weitergeleitet. Regeln: lib/coach/mfa.ts
  const [mfaUser, setMfaUser] = useState<{ id: string; email?: string; user_metadata?: Record<string, unknown> } | null>(null)
  const [mfaCode, setMfaCode] = useState('')

  // ═══ Brute-Force State ═══
  const [lockoutUntil, setLockoutUntil] = useState<number>(0)
  const [lockoutMessage, setLockoutMessage] = useState('')
  const [attemptsWarning, setAttemptsWarning] = useState('')
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Client-side Lockout aus localStorage laden
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ae_login_lockout')
      if (stored) {
        const data = JSON.parse(stored)
        if (data.until > Date.now()) {
          setLockoutUntil(data.until)
          setLockoutMessage(data.message || 'Zu viele Fehlversuche.')
        } else {
          localStorage.removeItem('ae_login_lockout')
        }
      }
    } catch {}
  }, [])

  // Lockout Countdown Timer
  useEffect(() => {
    if (lockoutUntil <= Date.now()) {
      setLockoutMessage('')
      return
    }
    const tick = () => {
      const remaining = lockoutUntil - Date.now()
      if (remaining <= 0) {
        setLockoutUntil(0)
        setLockoutMessage('')
        localStorage.removeItem('ae_login_lockout')
        return
      }
      const min = Math.ceil(remaining / 60000)
      setLockoutMessage(
        min > 60
          ? `Zu viele Fehlversuche. Gesperrt für ${Math.ceil(min / 60)} Stunde(n).`
          : `Zu viele Fehlversuche. Bitte warten Sie ${min} Minute(n).`
      )
    }
    tick()
    lockoutTimerRef.current = setInterval(tick, 10000)
    return () => { if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current) }
  }, [lockoutUntil])

  // Server-side Rate Limit Check
  const checkServerRateLimit = useCallback(async (loginEmail: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/check-rate-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, action: 'check' }),
      })
      const data = await res.json()
      if (data.locked) {
        const until = Date.now() + (data.remainingSeconds || 900) * 1000
        setLockoutUntil(until)
        setLockoutMessage(data.message || 'Zu viele Fehlversuche.')
        try { localStorage.setItem('ae_login_lockout', JSON.stringify({ until, message: data.message })) } catch {}
        return false
      }
      return data.allowed !== false
    } catch {
      // Fail-open: Bei Netzwerkfehler Login erlauben
      return true
    }
  }, [])

  // Failed Login an Server melden
  const reportFailedLogin = useCallback(async (loginEmail: string) => {
    try {
      const res = await fetch('/api/auth/check-rate-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, action: 'fail' }),
      })
      const data = await res.json()
      if (data.locked) {
        const until = Date.now() + (data.remainingSeconds || 900) * 1000
        setLockoutUntil(until)
        setLockoutMessage(data.message)
        try { localStorage.setItem('ae_login_lockout', JSON.stringify({ until, message: data.message })) } catch {}
      } else if (data.message) {
        setAttemptsWarning(data.message)
      }
    } catch {}
  }, [])

  // Erfolgreichen Login melden
  const reportSuccessfulLogin = useCallback(async (loginEmail: string) => {
    try {
      await fetch('/api/auth/check-rate-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, action: 'success' }),
      })
      localStorage.removeItem('ae_login_lockout')
      setLockoutUntil(0)
      setLockoutMessage('')
      setAttemptsWarning('')
    } catch {}
  }, [])

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
    // Schnelle interne API zuerst (1.5s Timeout)
    try {
      const res = await fetch('/api/client-ip', { signal: AbortSignal.timeout(1500) })
      if (res.ok) {
        const data = await res.json()
        if (data.ip) return data.ip
      }
    } catch {}
    // ipapi.co nur im Web (NICHT in Capacitor — externe Calls hängen WebView)
    const isNative =
      typeof window !== 'undefined' &&
      (window as any).Capacitor?.isNativePlatform?.()
    if (!isNative) {
      try {
        const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(1500) })
        if (res.ok) {
          const data = await res.json()
          return data.ip || ''
        }
      } catch {}
    }
    return ''
  }

  async function loginAndRedirect(loginEmail: string, loginPassword: string) {
    // ═══ Brute-Force Check: Client-side Lockout ═══
    if (lockoutUntil > Date.now()) {
      setError(lockoutMessage || 'Zu viele Fehlversuche. Bitte warten Sie.')
      return
    }

    // ═══ Brute-Force Check: Server-side Rate Limit ═══
    const allowed = await checkServerRateLimit(loginEmail)
    if (!allowed) return

    const supabase = createClient()
    const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    })

    if (authError) {
      // ═══ Fehlversuch melden ═══
      await reportFailedLogin(loginEmail)

      // Failed Login loggen (im Hintergrund)
      getClientIP().then(ip => {
        const supabaseLog = createClient()
        supabaseLog.from('mis_auth_log').insert({
          user_id: null,
          user_email: loginEmail,
          user_name: null,
          action: 'login_failed',
          ip_address: ip || null,
          device: getDeviceInfo(),
          status: 'failed',
        }).then(() => {})
      })

      // AUTH-005 Fix: Keine E-Mail-Enumeration mehr — generische Fehlermeldung für alle Auth-Fehler,
      // die an E-Mail-Existenz gekoppelt sind. Details nur server-seitig in mis_auth_log.
      if (
        authError.message === 'Email not confirmed' ||
        authError.message === 'Invalid login credentials'
      ) {
        setError('E-Mail oder Passwort ist falsch. Falls Sie sich neu registriert haben, bestätigen Sie bitte zuerst Ihre E-Mail-Adresse über den Link, den wir Ihnen geschickt haben.')
      } else {
        // Generischer Fallback — Supabase-Message nicht leaken
        setError('Anmeldung fehlgeschlagen. Bitte versuchen Sie es später erneut.')
      }
      return
    }

    if (!signInData.user) return

    // ═══ Erfolgreichen Login melden → Counter zurücksetzen ═══
    await reportSuccessfulLogin(loginEmail)

    // ═══ Zweiter Faktor: Code abfragen, bevor irgendetwas weitergeht ═══
    // Fail-open bei Fehlern in der Niveau-Abfrage ist Absicht: Wer keinen
    // Faktor hat, dürfte sonst wegen einer Störung gar nicht mehr hinein.
    // Die verbindliche Durchsetzung sitzt ohnehin serverseitig
    // (lib/coach/api-auth.ts) und ist von dieser Abfrage unabhängig.
    let aktuellesNiveau: MfaNiveau = null
    let naechstesNiveau: MfaNiveau = null
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      aktuellesNiveau = (aal?.currentLevel as MfaNiveau) ?? null
      naechstesNiveau = (aal?.nextLevel as MfaNiveau) ?? null
    } catch {}
    if (codeAbfrageNoetig(aktuellesNiveau, naechstesNiveau)) {
      setMfaUser(signInData.user)
      setMfaCode('')
      setError('')
      return
    }

    await nachAnmeldung(signInData.user)
  }

  /**
   * Alles, was NACH der vollständigen Authentifizierung passiert —
   * Protokoll, geparkte Profildaten, Weiterleitung. Bewusst herausgezogen:
   * Der Weg mit zweitem Faktor betritt ihn erst nach der Code-Prüfung.
   */
  async function nachAnmeldung(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
    const supabase = createClient()
    const role = (user.user_metadata?.role as string) || ''

    // Log im Hintergrund
    Promise.all([
      getClientIP(),
      supabase.from('profiles').select('first_name, last_name').eq('id', user.id).single()
    ]).then(([ip, { data: profile }]) => {
      const displayName = profile?.first_name
        ? `${profile.first_name} ${(profile.last_name || '').charAt(0)}.`.trim()
        : (user.user_metadata?.first_name as string) || user.email
      supabase.from('mis_auth_log').insert({
        user_id: user.id,
        user_email: user.email,
        user_name: displayName,
        action: 'login',
        ip_address: ip || null,
        device: getDeviceInfo(),
        status: 'success',
      }).then(() => {})
    })

    // Bei der Registrierung geparkte Profildaten (u.a. PLZ) nachtragen —
    // relevant, wenn signUp wegen E-Mail-Bestätigung keine Session hatte.
    await flushPendingProfile(supabase, user.id)

    // Redirect — ?next= / ?redirectTo= hat Vorrang (sicherer Rücksprung nach Middleware-Redirect)
    // Nur relative Pfade erlaubt (kein Open-Redirect via https://evil.com)
    if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
      window.location.href = redirectTo
    } else if (role === 'admin' || role === 'superadmin') {
      window.location.href = '/mis'
    } else if (role === 'engel') {
      window.location.href = '/engel/home'
    } else if (role === 'fahrer') {
      window.location.href = '/fahrer/home'
    } else {
      // Prüfe ob der User einen aktiven Angehörigen-Zugang hat
      const { data: zugaenge } = await supabase
        .from('angehoerigen_zugaenge')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'aktiv')
        .limit(1)

      if (zugaenge && zugaenge.length > 0) {
        window.location.href = '/angehoerige'
      } else {
        window.location.href = '/kunde/home'
      }
    }
  }

  /** Code aus der Authenticator-App prüfen und die Anmeldung abschließen. */
  async function bestaetigeMfa(e: React.FormEvent) {
    e.preventDefault()
    if (!mfaUser) return
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: faktoren, error: listenFehler } = await supabase.auth.mfa.listFactors()
      const faktor = faktoren?.totp?.[0]
      if (listenFehler || !faktor) {
        setError('Ihr zweiter Faktor konnte nicht geladen werden. Bitte laden Sie die Seite neu.')
        return
      }
      const { data: challenge, error: challengeFehler } = await supabase.auth.mfa.challenge({ factorId: faktor.id })
      if (challengeFehler || !challenge) {
        setError('Die Prüfung konnte nicht gestartet werden. Bitte versuchen Sie es erneut.')
        return
      }
      const { error: pruefFehler } = await supabase.auth.mfa.verify({
        factorId: faktor.id,
        challengeId: challenge.id,
        code: mfaCode.replace(/\s/g, ''),
      })
      if (pruefFehler) {
        setError('Der Code stimmt nicht. Bitte geben Sie den aktuell angezeigten sechsstelligen Code ein — er wechselt alle 30 Sekunden.')
        return
      }
      await nachAnmeldung(mfaUser)
    } catch {
      setError('Netzwerkfehler. Bitte versuchen Sie es erneut.')
    } finally {
      setLoading(false)
    }
  }

  /** Abbrechen: Sitzung beenden, damit keine halbe Anmeldung stehen bleibt. */
  async function brichMfaAb() {
    setMfaUser(null)
    setMfaCode('')
    setError('')
    setPassword('')
    try { await createClient().auth.signOut() } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (lockoutUntil > Date.now()) {
      setError(lockoutMessage || 'Zu viele Fehlversuche. Bitte warten Sie.')
      return
    }
    setLoading(true)
    setError('')
    setAttemptsWarning('')
    try {
      await loginAndRedirect(email, password)
    } catch (err: any) {
      setError(err?.message || 'Netzwerkfehler. Bitte versuchen Sie es erneut.')
    } finally {
      setLoading(false)
    }
  }

  const isLocked = lockoutUntil > Date.now()

  // ═══ Zwischenschritt: Code aus der Authenticator-App ═══
  // Eigene Ansicht statt eines zusätzlichen Feldes im Anmeldeformular:
  // An dieser Stelle ist das Passwort bereits akzeptiert; ein weiterhin
  // sichtbares Passwortfeld würde den Stand der Anmeldung verschleiern.
  if (mfaUser) {
    return (
      <div className="screen auth-screen">
        <div className="auth-card">
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <Icon3D size={56} />
          </div>
          <div className="auth-title">Noch ein Schritt</div>
          <div className="auth-sub">Bitte geben Sie den Code aus Ihrer Authenticator-App ein</div>

          <form onSubmit={bestaetigeMfa}>
            <label htmlFor="mfa-code" style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
              Sechsstelliger Code
            </label>
            <input
              id="mfa-code"
              className="auth-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              required
              autoFocus
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value)}
              style={{ letterSpacing: '0.3em', fontSize: 20, textAlign: 'center' }}
            />
            {error && <div className="auth-error">{error}</div>}
            <button className="btn-gold" type="submit" disabled={loading || mfaCode.trim().length < 6} style={{ width: '100%', marginTop: 8 }}>
              {loading ? 'Wird geprüft...' : 'BESTÄTIGEN'}
            </button>
          </form>

          <div className="auth-link" style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={brichMfaAb}
              style={{ background: 'none', border: 'none', color: 'var(--gold-2)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline', padding: 0 }}
            >
              Abbrechen und neu anmelden
            </button>
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
        <div className="auth-title">Willkommen zurück</div>
        <div className="auth-sub">Melden Sie sich an</div>

        {justRegistered && (
          <div style={{ background: 'rgba(76, 175, 80, 0.15)', border: '1px solid rgba(76, 175, 80, 0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: '#81c784', textAlign: 'center' }}>
            Konto erfolgreich erstellt! Bitte prüfen Sie Ihre E-Mail und melden Sie sich dann an.
          </div>
        )}

        {authError && (
          <div style={{ background: 'rgba(208, 75, 59, 0.15)', border: '1px solid rgba(208, 75, 59, 0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: '#ef9a9a', textAlign: 'center' }}>
            Zugriff verweigert. Bitte melden Sie sich an.
          </div>
        )}

        {redirectTo?.startsWith('/mis') && (
          <div style={{ background: 'rgba(201, 150, 60, 0.12)', border: '1px solid rgba(201, 150, 60, 0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: '#C9963C', textAlign: 'center' }}>
            MIS Portal — Bitte melden Sie sich mit Ihrem Admin-Konto an.
          </div>
        )}

        {/* ═══ Lockout Warnung ═══ */}
        {isLocked && lockoutMessage && (
          <div style={{ background: 'rgba(208, 75, 59, 0.15)', border: '1px solid rgba(208, 75, 59, 0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: '#ef9a9a', textAlign: 'center' }}>
            {lockoutMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input className="auth-input" type="email" placeholder="E-Mail-Adresse" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" name="email" disabled={isLocked} />
          <div style={{ position: 'relative' }}>
            <input className="auth-input" type={showPassword ? 'text' : 'password'} placeholder="Passwort" value={password} onChange={e => setPassword(e.target.value)} required style={{ paddingRight: 48 }} autoComplete="current-password" name="password" disabled={isLocked} />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(201,150,60,0.6)', cursor: 'pointer', fontSize: 13, padding: '4px 0' }}
            >
              {showPassword ? 'Verbergen' : 'Anzeigen'}
            </button>
          </div>
          {error && <div className="auth-error">{error}</div>}
          {attemptsWarning && !error && (
            <div style={{ color: '#ff9800', fontSize: 12, marginBottom: 4, textAlign: 'center' }}>{attemptsWarning}</div>
          )}
          <div style={{ textAlign: 'right', marginBottom: 4 }}>
            <Link href="/auth/forgot-password" style={{ color: 'var(--gold-2)', fontSize: 13, textDecoration: 'none' }}>Passwort vergessen?</Link>
          </div>
          <button className="btn-gold" type="submit" disabled={loading || isLocked} style={{ width: '100%', marginTop: 8, opacity: isLocked ? 0.5 : 1 }}>
            {loading ? 'Anmelden...' : isLocked ? 'Gesperrt' : 'ANMELDEN'}
          </button>
        </form>
        <div className="auth-link">
          Noch kein Konto? <Link href="/choose">Registrieren</Link>
        </div>

        {/* ═══ Admin-Zugang (E-Mail NICHT hardcoded) ═══ */}
        <div style={{ marginTop: 24, borderTop: '1px solid rgba(201,150,60,0.15)', paddingTop: 16 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Admin-Zugang</div>
          {!showAdminPw ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-gold"
                style={{ flex: 1, fontSize: 12, padding: '10px 0', background: 'rgba(201,150,60,0.08)', color: 'var(--gold-2)', border: '1px solid rgba(201,150,60,0.2)' }}
                onClick={() => setShowAdminPw(true)}
                disabled={isLocked}
              >ADMIN</button>
              <button type="button" className="btn-gold"
                style={{ flex: 1, fontSize: 12, padding: '10px 0', background: 'linear-gradient(135deg, #C9963C, #DBA84A)', color: '#0D0A08', border: '1px solid rgba(201,150,60,0.2)', fontWeight: 700 }}
                onClick={() => router.push('/mis')}
              >MIS PORTAL</button>
            </div>
          ) : (
            <div>
              <input
                type="email"
                placeholder="Admin E-Mail"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ width: '100%', marginBottom: 8, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(201,150,60,0.25)', background: 'rgba(13,10,8,0.5)', color: '#e8e0d4', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
                disabled={isLocked}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  placeholder="Admin-Passwort"
                  value={adminPwInput}
                  onChange={e => setAdminPwInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !isLocked && email && adminPwInput) { setLoading(true); setError(''); loginAndRedirect(email, adminPwInput).catch(() => setError('Login fehlgeschlagen')).finally(() => setLoading(false)) } }}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(201,150,60,0.25)', background: 'rgba(13,10,8,0.5)', color: '#e8e0d4', fontSize: 13, fontFamily: 'inherit' }}
                  autoFocus
                  disabled={isLocked}
                />
                <button type="button" className="btn-gold"
                  style={{ fontSize: 12, padding: '10px 16px', background: 'linear-gradient(135deg, #C9963C, #DBA84A)', color: '#0D0A08', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', opacity: isLocked ? 0.5 : 1 }}
                  disabled={loading || !adminPwInput || !email || isLocked}
                  onClick={async () => { setLoading(true); setError(''); try { await loginAndRedirect(email, adminPwInput) } catch { setError('Login fehlgeschlagen') } finally { setLoading(false) } }}
                >OK</button>
              </div>
            </div>
          )}
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
