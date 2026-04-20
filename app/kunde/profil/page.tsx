'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import Link from 'next/link'
import { IconDocument, IconNav, IconCalendar } from '@/components/Icons'
import { AvatarKunde } from '@/components/AvatarGlow'

// KASSEN-Liste entfernt (gehoerte zur Pflegedaten-UI, deaktiviert Phase 5)

export default function KundeProfilPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')

  // ═══════════════════════════════════════════════════════════════
  // Pflegedaten-Block entfernt (Phase 5 Architektur-Empfehlung):
  // care_eligibility-Tabelle existiert nicht in der DB → der Block
  // konnte nichts speichern. Wenn Pflegebox spaeter priorisiert wird,
  // kommt der Care-State + Save-Logik mit DB-Migration zurueck.
  // ═══════════════════════════════════════════════════════════════

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

      const supabase = createClient()

      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p)

      // Pflegedaten-Load entfernt: Tabelle care_eligibility existiert nicht in DB
      // (Phase 5 Architektur-Empfehlung, Pflegebox-Feature deaktiviert). Wenn das
      // Feature spaeter priorisiert wird, kommt hier ein neuer Load-Block + DB-Migration.

      setLoading(false)
    }
    loadProfile()
  }, [])

  // Aufraeumen bei Unmount
  // Aufraeum-Effect entfernt — gehoerte zur saveCare-Logik (care_eligibility)

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
            </div>
          </div>
        </div>
      </div>

      <div className="mp-body">
        {/* Pflegedaten-Block entfernt: care_eligibility-Tabelle existiert nicht */}

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
          {/* Pflegebox-Link entfernt: Feature deaktiviert (Phase 5). */}
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
