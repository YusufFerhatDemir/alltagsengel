'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import Link from 'next/link'
import { IconDocument, IconNav, IconCalendar, IconMedical, IconBox } from '@/components/Icons'
import { AvatarKunde } from '@/components/AvatarGlow'

const KASSEN = ['AOK', 'TK', 'Barmer', 'DAK', 'IKK', 'KKH', 'BKK', 'HEK', 'Knappschaft']

export default function KundeProfilPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  // ═══════════════════════════════════════════════════════════════
  // Care-Daten in EINEM State-Objekt gebuendelt.
  //
  // WARUM?
  // Vorher: pflegegrad/homeCare/krankenkasse waren 4 separate States.
  // Jeder Handler las die anderen 3 via Closure — bei schnellen Klicks
  // waren die Closures noch nicht neu (React batched Updates async).
  // Beispiel: Senior klickt Pflegegrad 3, dann schnell AOK. Der
  // Krankenkasse-Handler sah pflegegrad noch als 0 und ueberschrieb
  // die frisch gespeicherte 3 mit 0 → "Speichern tut manchmal nichts".
  //
  // Jetzt: Eine Quelle der Wahrheit. Mit setCareState(prev => ...)
  // sehen wir IMMER den aktuellsten Wert, unabhaengig vom Render-Timing.
  // ═══════════════════════════════════════════════════════════════
  interface CareState {
    pflegegrad: number
    homeCare: boolean
    pflegehilfsmittel: boolean
    krankenkasse: string
  }
  const [care, setCare] = useState<CareState>({
    pflegegrad: 0,
    homeCare: true,
    pflegehilfsmittel: false,
    krankenkasse: '',
  })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')

  // AbortController fuer in-flight Request — verhindert out-of-order Writes
  // wenn Senior schnell mehrmals hintereinander klickt.
  const inFlightAbortRef = useRef<AbortController | null>(null)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function handleLogout() {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  useEffect(() => {
    async function loadProfile() {
      // Retry-faehiger Auth-Check (Race-Condition-Fix aus Bug #1)
      const user = await requireUser(router, { redirectTo: '/kunde/profil' })
      if (!user) return

      setUserId(user.id)
      const supabase = createClient()

      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p)

      // Load care eligibility
      const { data: ce } = await supabase.from('care_eligibility').select('*').eq('user_id', user.id).maybeSingle()
      if (ce) {
        setCare({
          pflegegrad: ce.pflegegrad || 0,
          homeCare: ce.home_care ?? true,
          pflegehilfsmittel: ce.pflegehilfsmittel_interest ?? false,
          krankenkasse: ce.insurance_type === 'public' ? (ce.krankenkasse || '') : '',
        })
      }

      setLoading(false)
    }
    loadProfile()
  }, [])

  // Aufraeumen bei Unmount
  useEffect(() => {
    return () => {
      inFlightAbortRef.current?.abort()
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    }
  }, [])

  async function saveCare(patch: Partial<CareState>) {
    if (!userId) {
      // Auth noch nicht geladen — UI-Hinweis statt stilles Ignorieren
      setSaveStatus('error')
      setSaveError('Noch nicht angemeldet. Bitte warte einen Moment.')
      return
    }

    // Funktionales Update: garantiert aktuellsten Stand
    let computed: CareState = care
    setCare(prev => {
      computed = { ...prev, ...patch }
      return computed
    })
    const nextState: CareState = computed

    // Alte in-flight-Request canceln — verhindert out-of-order Writes
    inFlightAbortRef.current?.abort()
    const controller = new AbortController()
    inFlightAbortRef.current = controller

    setSaveStatus('saving')
    setSaveError('')

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('care_eligibility')
        .upsert(
          {
            user_id: userId,
            pflegegrad: nextState.pflegegrad,
            home_care: nextState.homeCare,
            pflegehilfsmittel_interest: nextState.pflegehilfsmittel,
            insurance_type: nextState.krankenkasse ? 'public' : 'unknown',
            krankenkasse: nextState.krankenkasse,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
        .abortSignal(controller.signal)

      // Falls waehrend des awaits ein neuer Klick kam → ignorieren
      if (controller.signal.aborted) return

      if (error) {
        console.error('[saveCare] Supabase error:', error)
        setSaveStatus('error')
        setSaveError('Speichern fehlgeschlagen. Bitte versuche es erneut.')
        return
      }

      setSaveStatus('saved')
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
      hintTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1800)
    } catch (err: any) {
      // AbortError bedeutet: ein neuer Klick hat uns abgebrochen → kein Fehler
      if (err?.name === 'AbortError' || controller.signal.aborted) return
      console.error('[saveCare] Unexpected error:', err)
      setSaveStatus('error')
      setSaveError('Netzwerkfehler. Bitte pruefe deine Verbindung.')
    }
  }

  function handlePflegegrad(g: number) {
    saveCare({ pflegegrad: g })
  }

  function handleHomeCare() {
    saveCare({ homeCare: !care.homeCare })
  }

  function handlePflegehilfsmittel() {
    saveCare({ pflegehilfsmittel: !care.pflegehilfsmittel })
  }

  function handleKrankenkasse(kk: string) {
    saveCare({ krankenkasse: care.krankenkasse === kk ? '' : kk })
  }

  // Bequeme Aliase fuer JSX (keine Refactor-Kaskade)
  const pflegegrad = care.pflegegrad
  const homeCare = care.homeCare
  const pflegehilfsmittel = care.pflegehilfsmittel
  const krankenkasse = care.krankenkasse
  const savedHint = saveStatus === 'saved' ? 'saved' : ''

  const name = profile ? `${profile.first_name} ${profile.last_name}` : '...'
  const loc = profile?.location || '—'

  if (loading) return <div className="screen" id="mprofil"><div className="mp-header"><div className="mp-nav"><Link href="/kunde/home" className="mp-back">‹</Link><div className="mp-title">Mein Profil</div></div></div></div>

  return (
    <div className="screen" id="mprofil">
      <div className="mp-header">
        <div className="mp-nav">
          <Link href="/kunde/home" className="mp-back">‹</Link>
          <div className="mp-title">Mein Profil</div>
        </div>
        <div className="mp-main">
          <AvatarKunde size={72} />
          <div>
            <div className="mp-name">{name}</div>
            <div className="mp-sub">Kunde</div>
            <div className="mp-chips">
              <span className="mp-chip light">{loc}</span>
              {pflegegrad > 0 && <span className="mp-chip gold">PG {pflegegrad}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="mp-body">
        {/* Pflegegrad Section */}
        <div className="section-label">
          Pflegedaten
          <span className={`pf-saved${savedHint ? ' show' : ''}`}>✓ Gespeichert</span>
          {saveStatus === 'saving' && (
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ink4)', fontWeight: 400 }}>
              Speichern...
            </span>
          )}
        </div>
        {saveStatus === 'error' && saveError && (
          <div
            role="alert"
            style={{
              marginBottom: 10,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              color: 'var(--red-w, #dc2626)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>⚠️ {saveError}</span>
            <button
              type="button"
              onClick={() => setSaveStatus('idle')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                textDecoration: 'underline',
                fontSize: 11,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              OK
            </button>
          </div>
        )}
        <div className="settings-card" style={{ padding: '14px 16px' }}>
          <div className="pf-section">
            <div className="pf-section-title">Pflegegrad</div>
            <div className="pf-toggle-row">
              {[0, 1, 2, 3, 4, 5].map(g => (
                <button
                  key={g}
                  type="button"
                  className={`pf-toggle-btn${pflegegrad === g ? ' active' : ''}`}
                  onClick={() => handlePflegegrad(g)}
                >
                  {g === 0 ? 'Kein' : `${g}`}
                </button>
              ))}
            </div>
            {pflegegrad > 0 && (
              <div className="pf-hint">Pflegegrad {pflegegrad} — Anspruch auf Entlastungsleistungen</div>
            )}
          </div>

          {pflegegrad > 0 && (
            <>
              <div className="pf-section">
                <div className="pf-section-title">Pflege zu Hause?</div>
                <div className="pf-switch-row" onClick={handleHomeCare}>
                  <span className="pf-switch-label">{homeCare ? 'Ja, häusliche Pflege' : 'Nein'}</span>
                  <div className={`reg-switch${homeCare ? ' on' : ''}`}>
                    <div className="reg-switch-knob" />
                  </div>
                </div>
              </div>

              <div className="pf-section">
                <div className="pf-section-title">Gesetzliche Krankenkasse</div>
                <div className="pf-kk-grid">
                  {KASSEN.map(kk => (
                    <div
                      key={kk}
                      className={`pf-kk-item${krankenkasse === kk ? ' on' : ''}`}
                      onClick={() => handleKrankenkasse(kk)}
                    >
                      {kk}
                    </div>
                  ))}
                </div>
              </div>

              {homeCare && (
                <div className="pf-section">
                  <div className="pf-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <IconBox size={14} color="var(--gold2)" />
                    Pflegehilfsmittel (bis 42 €/Monat)
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink4)', marginBottom: 6, fontWeight: 300 }}>
                    Handschuhe, Desinfektion, Masken u.v.m. — von der Pflegekasse übernommen.
                  </div>
                  <div className="pf-switch-row" onClick={handlePflegehilfsmittel}>
                    <span className="pf-switch-label">{pflegehilfsmittel ? 'Ja, ich habe Interesse' : 'Noch kein Interesse'}</span>
                    <div className={`reg-switch${pflegehilfsmittel ? ' on' : ''}`}>
                      <div className="reg-switch-knob" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="section-label">Einstellungen</div>
        <div className="settings-card">
          <div className="setting-row">
            <div>
              <div className="setting-main">E-Mail</div>
              <div className="setting-sub">{profile?.email || '—'}</div>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <div className="setting-main">Standort</div>
              <div className="setting-sub">{loc}</div>
            </div>
          </div>
        </div>

        <div className="section-label">Services</div>
        <div className="settings-card">
          <Link href="/kunde/buchungen" style={{ textDecoration: 'none' }}>
            <div className="setting-row" style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconCalendar size={18} color="var(--gold2)" />
                <div>
                  <div className="setting-main">Meine Buchungen</div>
                  <div className="setting-sub">Alle vergangenen und aktiven Buchungen</div>
                </div>
              </div>
            </div>
          </Link>
          <Link href="/kunde/pflegebox" style={{ textDecoration: 'none' }}>
            <div className="setting-row" style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconMedical size={18} color="var(--gold2)" />
                <div>
                  <div className="setting-main">Pflegebox</div>
                  <div className="setting-sub">Kostenlose Pflegehilfsmittel bestellen</div>
                </div>
              </div>
            </div>
          </Link>
          <Link href="/kunde/dokumente" style={{ textDecoration: 'none' }}>
            <div className="setting-row" style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconDocument size={18} color="var(--gold2)" />
                <div>
                  <div className="setting-main">Dokumente</div>
                  <div className="setting-sub">Ausweise und Versicherungsnachweise</div>
                </div>
              </div>
            </div>
          </Link>
          <Link href="/kunde/karte" style={{ textDecoration: 'none' }}>
            <div className="setting-row" style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconNav size={18} color="var(--gold2)" />
                <div>
                  <div className="setting-main">Karte</div>
                  <div className="setting-sub">Engel in deiner Nähe anzeigen</div>
                </div>
              </div>
            </div>
          </Link>
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            width: '100%',
            padding: '14px 0',
            borderRadius: 12,
            border: '1px solid rgba(255,80,80,0.3)',
            background: 'rgba(255,80,80,0.1)',
            color: '#ff6b6b',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            marginTop: 16,
          }}
        >
          {loggingOut ? 'Abmelden...' : 'Abmelden'}
        </button>

        {/* DSGVO: Konto löschen */}
        <button
          onClick={() => setDeleteConfirm(true)}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 12,
            border: 'none', background: 'transparent',
            color: 'var(--ink5)', fontSize: 13, cursor: 'pointer', marginTop: 8,
          }}
        >
          Konto und Daten löschen
        </button>

        {deleteConfirm && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }} onClick={() => { if (!deleting) { setDeleteConfirm(false); setDeletePassword(''); setDeleteError('') } }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'var(--coal2)', borderRadius: 18, padding: 24, maxWidth: 340, width: '100%',
              border: '1px solid rgba(255,80,80,.2)',
            }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#ff6b6b', marginBottom: 8 }}>Konto löschen?</div>
              <p style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.5, marginBottom: 14 }}>
                Alle deine Daten werden unwiderruflich gelöscht: Profil, Buchungen, Nachrichten und Dokumente. Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
              <label style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                Zur Bestätigung: Dein aktuelles Passwort
              </label>
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => { setDeletePassword(e.target.value); setDeleteError('') }}
                disabled={deleting}
                placeholder="Passwort"
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10,
                  border: `1px solid ${deleteError ? 'rgba(255,80,80,.5)' : 'var(--border2)'}`,
                  background: 'var(--coal)', color: 'var(--ink)', fontSize: 14,
                  marginBottom: deleteError ? 6 : 16, outline: 'none',
                }}
              />
              {deleteError && (
                <div style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 14 }}>{deleteError}</div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setDeleteConfirm(false); setDeletePassword(''); setDeleteError('') }} disabled={deleting} style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>Abbrechen</button>
                <button
                  onClick={async () => {
                    if (!deletePassword) { setDeleteError('Passwort erforderlich'); return }
                    setDeleting(true); setDeleteError('')
                    try {
                      const res = await fetch('/api/user/delete', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password: deletePassword }),
                      })
                      if (res.ok) {
                        router.push('/')
                      } else {
                        const data = await res.json().catch(() => ({}))
                        setDeleteError(data?.error || 'Fehler beim Löschen. Bitte versuche es erneut.')
                      }
                    } catch {
                      setDeleteError('Netzwerkfehler. Bitte prüfe deine Verbindung.')
                    }
                    setDeleting(false)
                  }}
                  disabled={deleting || !deletePassword}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                    background: deletePassword ? '#ff4444' : 'var(--coal4)',
                    color: '#fff', fontSize: 13, fontWeight: 600,
                    cursor: deletePassword ? 'pointer' : 'not-allowed',
                    opacity: deleting || !deletePassword ? 0.6 : 1,
                  }}
                >
                  {deleting ? 'Wird gelöscht...' : 'Endgültig löschen'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ height: 80 }}></div>
      </div>
    </div>
  )
}
