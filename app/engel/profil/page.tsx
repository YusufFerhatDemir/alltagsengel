'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { IconWingsGold, IconDocument, IconCheck, IconClock, IconInfo, IconShield } from '@/components/Icons'
import { UNIT_ECONOMICS } from '@/lib/mis/constants'
import { AvatarEngel } from '@/components/AvatarGlow'

export default function MeinProfilPage() {
  const router = useRouter()
  const [settings, setSettings] = useState({ sofort: true, push: true, kasse: false })
  const [profile, setProfile] = useState<any>(null)
  const [angel, setAngel] = useState<any>(null)
  const [totalEarnings, setTotalEarnings] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')

  const toggle = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleLogout() {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const loadProfile = async () => {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: p, error: pErr } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (pErr) throw pErr
      const { data: a, error: aErr } = await supabase.from('angels').select('*').eq('id', user.id).maybeSingle()
      if (aErr) throw aErr
      setProfile(p)
      setAngel(a)

      const { data: completed, error: compErr } = await supabase
        .from('bookings')
        .select('total_amount')
        .eq('angel_id', user.id)
        .eq('status', 'completed')
      if (compErr) throw compErr
      setTotalEarnings((completed || []).reduce((sum, b) => sum + (b.total_amount || 0), 0))
    } catch (err) {
      console.error('Profile load error:', err)
      setError('Fehler beim Laden des Profils. Bitte versuche es später erneut.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [])

  const name = profile ? `${profile.first_name} ${profile.last_name}` : '...'
  const qualLabel = angel?.qualification || 'Alltagsbegleiter/in'
  const loc = profile?.location || '—'

  if (loading) return <div className="screen" id="mprofil"><div className="mp-header"><div className="mp-nav"><Link href="/engel/home" className="mp-back">‹</Link><div className="mp-title">Mein Profil</div></div></div></div>

  if (error) return (
    <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 24px',textAlign:'center'}}>
      <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
      <p style={{color:'var(--ink3)',fontSize:14,marginBottom:16}}>{error}</p>
      <button onClick={loadProfile} style={{padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold2))',color:'var(--coal)',fontSize:13,fontWeight:600,cursor:'pointer'}}>Erneut versuchen</button>
    </div>
  )

  return (
    <div className="screen" id="mprofil">
      <div className="mp-header">
        <div className="mp-nav">
          <Link href="/engel/home" className="mp-back">‹</Link>
          <div className="mp-title">Mein Profil</div>
        </div>
        <div className="mp-main">
          <AvatarEngel size={72} />
          <div>
            <div className="mp-name">{name}</div>
            <div className="mp-sub">{qualLabel}</div>
            <div className="mp-chips">
              <span className="mp-chip light">{loc}</span>
              {angel?.is_45b_capable && <span className="mp-chip gold">§45b</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="mp-body">
        <div className="earn-card">
          <div className="earn-top">
            <div>
              <div className="earn-label">Gesamtverdienst</div>
              <div className="earn-val">{totalEarnings.toFixed(0)}€</div>
              <div className="earn-change">{UNIT_ECONOMICS.helperPayPerHour}€/Std.</div>
            </div>
            <div className="earn-btn">Auszahlen</div>
          </div>
        </div>

        <div className="section-label">Einstellungen</div>
        <div className="settings-card">
          <div className="setting-row">
            <div><div className="setting-main">Sofort-Buchung</div><div className="setting-sub">Aufträge automatisch annehmen</div></div>
            <div className={`toggle${settings.sofort ? ' on' : ''}`} onClick={() => toggle('sofort')}></div>
          </div>
          <div className="setting-row">
            <div><div className="setting-main">Push-Benachrichtigungen</div><div className="setting-sub">Neue Anfragen sofort erhalten</div></div>
            <div className={`toggle${settings.push ? ' on' : ''}`} onClick={() => toggle('push')}></div>
          </div>
          <div className="setting-row">
            <div><div className="setting-main">§45b Aufträge</div><div className="setting-sub">Nur Kassenaufträge anzeigen</div></div>
            <div className={`toggle${settings.kasse ? ' on' : ''}`} onClick={() => toggle('kasse')}></div>
          </div>
        </div>

        <div className="section-label">Dokumente & Zertifikate</div>
        <div className="docs-card">
          <div className="setting-row"><div><div className="setting-main"><IconDocument size={14} /> §45b Zertifikat</div><div className="setting-sub" style={{ color: 'var(--green)' }}><IconCheck size={11} /> Verifiziert</div></div></div>
          <div className="setting-row"><div><div className="setting-main"><IconDocument size={14} /> Erste-Hilfe-Nachweis</div><div className="setting-sub" style={{ color: 'var(--green)' }}><IconCheck size={11} /> Verifiziert</div></div></div>
          <div className="setting-row"><div><div className="setting-main"><IconDocument size={14} /> Polizeiliches Führungszeugnis</div><div className="setting-sub" style={{ color: 'var(--gold)' }}><IconClock size={11} /> Wird geprüft</div></div></div>
          <div className="setting-row"><div><div className="setting-main"><IconDocument size={14} /> Versicherungsnachweis</div><div className="setting-sub" style={{ color: 'var(--green)' }}><IconCheck size={11} /> Automatisch</div></div></div>
        </div>

        <div className="section-label">Info &amp; Hilfe</div>
        <div className="settings-card">
          <Link href="/engel/info" className="setting-row" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
            <div>
              <div className="setting-main"><IconInfo size={14} /> Ablauf &amp; Vergütung</div>
              <div className="setting-sub">Wie funktioniert AlltagsEngel für dich?</div>
            </div>
            <div style={{ color: 'var(--ink4)', fontSize: 18 }}>›</div>
          </Link>
          <Link href="/datenschutz" className="setting-row" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
            <div>
              <div className="setting-main"><IconShield size={14} /> Datenschutz</div>
              <div className="setting-sub">Wie wir deine Daten verarbeiten</div>
            </div>
            <div style={{ color: 'var(--ink4)', fontSize: 18 }}>›</div>
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
            marginTop: 8,
          }}
        >
          {loggingOut ? 'Abmelden...' : 'Abmelden'}
        </button>

        <button onClick={() => setDeleteConfirm(true)} style={{
          width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
          background: 'transparent', color: 'var(--ink5)', fontSize: 13, cursor: 'pointer', marginTop: 8,
        }}>Konto und Daten löschen</button>

        {deleteConfirm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => { if (!deleting) { setDeleteConfirm(false); setDeletePassword(''); setDeleteError('') } }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--coal2)', borderRadius: 18, padding: 24, maxWidth: 340, width: '100%', border: '1px solid rgba(255,80,80,.2)' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#ff6b6b', marginBottom: 8 }}>Konto löschen?</div>
              <p style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.5, marginBottom: 14 }}>Alle deine Daten werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.</p>
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
                <button onClick={() => { setDeleteConfirm(false); setDeletePassword(''); setDeleteError('') }} disabled={deleting} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Abbrechen</button>
                <button
                  onClick={async () => {
                    if (!deletePassword) { setDeleteError('Passwort erforderlich'); return }
                    setDeleting(true); setDeleteError('')
                    try {
                      const r = await fetch('/api/user/delete', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password: deletePassword }),
                      })
                      if (r.ok) {
                        router.push('/')
                      } else {
                        const data = await r.json().catch(() => ({}))
                        setDeleteError(data?.error || 'Fehler beim Löschen. Bitte versuche es erneut.')
                      }
                    } catch {
                      setDeleteError('Netzwerkfehler. Bitte prüfe deine Verbindung.')
                    }
                    setDeleting(false)
                  }}
                  disabled={deleting || !deletePassword}
                  style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', background: deletePassword ? '#ff4444' : 'var(--coal4)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: deletePassword ? 'pointer' : 'not-allowed', opacity: deleting || !deletePassword ? 0.6 : 1 }}
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
