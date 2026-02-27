'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { IconUser, IconDocument, IconNav, IconCalendar } from '@/components/Icons'

export default function KundeProfilPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p)
      setLoading(false)
    }
    loadProfile()
  }, [])

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
          <div className="mp-avatar"><IconUser size={26} /></div>
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

        <div style={{ height: 80 }}></div>
      </div>
    </div>
  )
}
