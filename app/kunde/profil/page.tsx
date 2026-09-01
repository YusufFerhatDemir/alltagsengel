'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import { savePlzAction } from './actions'
import Link from 'next/link'
import { IconDocument, IconNav, IconCalendar, IconMoney, IconClipboard, IconChat, IconCard } from '@/components/Icons'
import { AvatarKunde } from '@/components/AvatarGlow'
import { normalizePlz, resolvePlz } from '@/lib/expansion/plz-bundesland'
import BundeslandErkennung from '@/components/kunde/BundeslandErkennung'
import { logger } from '@/lib/logger'
import DialogOverlay from '@/components/DialogOverlay'
const log = logger.child('kunde:profil')

// KASSEN-Liste entfernt (gehoerte zur Pflegedaten-UI, deaktiviert Phase 5)

export default function KundeProfilPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [ladeFehler, setLadeFehler] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [plzInput, setPlzInput] = useState('')
  const [plzStatus, setPlzStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function savePlz() {
    const plz = normalizePlz(plzInput)
    if (!plz) { setPlzStatus('error'); return }
    setPlzStatus('saving')
    try {
      const result = await savePlzAction({ plz })
      if (!result.ok) throw new Error(result.error)
      setProfile((prev: any) => (prev ? { ...prev, postal_code: plz } : prev))
      setPlzStatus('saved')
    } catch (err) {
      log.errorWithException('PLZ speichern', err)
      setPlzStatus('error')
    }
  }

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

      // Diese Seite zeigt Name, Ort und PLZ — und speichert sie auch. Ein
      // verworfener Ladefehler liess sie leer stehen („...", „—"), und die
      // PLZ-Eingabe haette den gespeicherten Wert ueberschrieben.
      const { data: p, error: profilFehler } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (profilFehler) {
        log.error(`Profil laden fehlgeschlagen: ${profilFehler.message}`)
        setLadeFehler(true)
        setLoading(false)
        return
      }
      setLadeFehler(false)
      setProfile(p)
      setPlzInput(resolvePlz(p?.postal_code, p?.location) || '')

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

  // Kein leeres Profil ueber ungelesenen Daten: „...", „—" und ein leeres
  // PLZ-Feld sehen aus wie fehlende Angaben und werden auch so korrigiert.
  if (ladeFehler) return (
    <div className="screen" id="mprofil">
      <div className="mp-header"><div className="mp-nav"><Link href="/kunde/home" className="mp-back">‹</Link><div className="mp-title">Mein Profil</div></div></div>
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 8 }}>Ihr Profil konnte nicht geladen werden</div>
        <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 20 }}>Bitte laden Sie die Seite neu. Ihre gespeicherten Angaben bestehen weiter.</div>
      </div>
    </div>
  )

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
          {/* Die PLZ steuert, welche Engel gefunden werden (Umkreis-Suche)
              und ob Kassenleistung möglich ist — deshalb hier direkt
              editierbar statt nur als Anzeige. */}
          <div className="setting-row" style={{ display: 'block' }}>
            <div className="setting-main">Postleitzahl</div>
            <div className="setting-sub" style={{ marginBottom: 8 }}>
              Wir zeigen Ihnen nur Engel in Ihrer Nähe — und Ihre PLZ bestimmt,
              welche Leistungen in Ihrem Bundesland abrechenbar sind
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                inputMode="numeric"
                maxLength={5}
                value={plzInput}
                onChange={e => { setPlzInput(e.target.value.replace(/\D/g, '').slice(0, 5)); setPlzStatus('idle') }}
                placeholder="z.B. 60311"
                aria-label="Postleitzahl"
                style={{
                  width: 110, padding: '10px 12px', borderRadius: 10,
                  border: '1px solid var(--border2)', background: 'var(--coal)',
                  color: 'var(--ink)', fontSize: 14, outline: 'none',
                }}
              />
              <button
                onClick={savePlz}
                disabled={plzInput.length !== 5 || plzStatus === 'saving'}
                style={{
                  padding: '10px 16px', borderRadius: 10, border: 'none',
                  background: plzInput.length === 5
                    ? 'linear-gradient(135deg,var(--gold),var(--gold2))'
                    : 'var(--coal4)',
                  color: plzInput.length === 5 ? 'var(--coal)' : 'var(--ink5)',
                  fontSize: 13, fontWeight: 600,
                  cursor: plzInput.length === 5 ? 'pointer' : 'not-allowed',
                }}
              >
                {plzStatus === 'saving' ? 'Speichern…' : 'Speichern'}
              </button>
              {plzStatus === 'saved' && (
                <span style={{ fontSize: 12.5, color: 'var(--green)' }}>Gespeichert</span>
              )}
              {plzStatus === 'error' && (
                <span style={{ fontSize: 12.5, color: '#ff6b6b' }}>Fehlgeschlagen</span>
              )}
            </div>
            {/* Erkennt das Bundesland aus der eingegebenen PLZ und zeigt sofort,
                was dort möglich ist — noch bevor gespeichert wurde. */}
            <BundeslandErkennung plz={plzInput} ausfuehrlich />
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
          <Link href="/kunde/budget" style={{ textDecoration: 'none' }}>
            <div className="setting-row" style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconMoney size={18} color="var(--gold2)" />
                <div>
                  <div className="setting-main">Mein Budget</div>
                  <div className="setting-sub">Entlastungsbetrag und Verhinderungspflege im Blick</div>
                </div>
              </div>
            </div>
          </Link>
          <Link href="/kunde/rechnungen" style={{ textDecoration: 'none' }}>
            <div className="setting-row" style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconCard size={18} color="var(--gold2)" />
                <div>
                  <div className="setting-main">Meine Rechnungen</div>
                  <div className="setting-sub">Alle Rechnungen mit Einzelpositionen</div>
                </div>
              </div>
            </div>
          </Link>
          <Link href="/kunde/leistungsnachweis" style={{ textDecoration: 'none' }}>
            <div className="setting-row" style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconClipboard size={18} color="var(--gold2)" />
                <div>
                  <div className="setting-main">Leistungsnachweis</div>
                  <div className="setting-sub">Alle Einsätze nach Monaten sortiert</div>
                </div>
              </div>
            </div>
          </Link>
          <Link href="/kunde/nachrichten" style={{ textDecoration: 'none' }}>
            <div className="setting-row" style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconChat size={18} color="var(--gold2)" />
                <div>
                  <div className="setting-main">Nachrichten an Alltagsengel</div>
                  <div className="setting-sub">Direkter Draht zu unserem Team</div>
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
          <Link href="/kunde/vertraege" style={{ textDecoration: 'none' }}>
            <div className="setting-row" style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconDocument size={18} color="var(--gold2)" />
                <div>
                  <div className="setting-main">Meine Verträge</div>
                  <div className="setting-sub">Vertragsstatus und Unterschriften</div>
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

        {/* DSGVO Art. 15: Auskunft ueber die eigenen Daten */}
        <a
          href="/api/user/export"
          style={{
            display: 'block', width: '100%', padding: '12px 0', borderRadius: 12,
            border: 'none', background: 'transparent', textAlign: 'center',
            color: 'var(--ink5)', fontSize: 13, cursor: 'pointer', marginTop: 8,
            textDecoration: 'none',
          }}
        >
          Meine Daten herunterladen
        </a>

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
          <DialogOverlay className="" onClose={() => { if (!deleting) { setDeleteConfirm(false); setDeletePassword(''); setDeleteError('') } }} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
            <div role="dialog" aria-modal="true" aria-label="Konto löschen?" onClick={e => e.stopPropagation()} style={{
              background: 'var(--coal2)', borderRadius: 18, padding: 24, maxWidth: 340, width: '100%',
              border: '1px solid rgba(255,80,80,.2)',
            }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#ff6b6b', marginBottom: 8 }}>Konto löschen?</div>
              <p style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.5, marginBottom: 14 }}>
                Alle deine Daten werden unwiderruflich gelöscht: Profil, Buchungen, Nachrichten und Dokumente. Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
              <label htmlFor="profil-zur-bestaetigung-dein-aktuelles-passwort" style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                Zur Bestätigung: Dein aktuelles Passwort
              </label>
              <input
                id="profil-zur-bestaetigung-dein-aktuelles-passwort"
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
          </DialogOverlay>
        )}

        <div style={{ height: 80 }}></div>
      </div>
    </div>
  )
}
