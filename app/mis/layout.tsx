'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { NAV_ITEMS, BRAND } from '@/lib/mis/constants'
import { MIcon } from '@/components/mis/MisIcons'
import { SearchInput } from '@/components/mis/MisComponents'
import { MisProvider } from '@/lib/mis/MisContext'

export default function MISLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 900 : false)
  const [search, setSearch] = useState('')

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [aiOpen, setAiOpen] = useState(false)
  const [aiMessages, setAiMessages] = useState<{ role: string; text: string }[]>([
    { role: 'assistant', text: 'Willkommen im AlltagsEngel KI-Assistenten. Wie kann ich Ihnen helfen?' }
  ])
  const [aiInput, setAiInput] = useState('')
  const [notifications, setNotifications] = useState(3)
  const [notifOpen, setNotifOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [userName, setUserName] = useState('Admin')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        supabase.from('profiles').select('first_name,last_name').eq('id', data.user.id).single()
          .then(({ data: profile }) => {
            if (profile) setUserName(`${profile.first_name} ${profile.last_name}`.trim() || 'Admin')
          })
      }
    })
  }, [])

  const handleAiSend = () => {
    if (!aiInput.trim()) return
    setAiMessages(prev => [...prev, { role: 'user', text: aiInput }])
    const q = aiInput
    setAiInput('')
    // Simulate AI response
    setTimeout(() => {
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        text: getAiResponse(q)
      }])
    }, 800)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      try { await supabase.from('mis_auth_log').insert({
        user_id: user.id, user_email: user.email, user_name: userName,
        action: 'logout', device: /iPhone|iPad/i.test(navigator.userAgent) ? 'iOS' : /Android/i.test(navigator.userAgent) ? 'Android' : /Mac/i.test(navigator.userAgent) ? 'Mac' : 'Desktop',
        status: 'success',
      }) } catch {}
    }
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = () => { setNotifOpen(false); setUserMenuOpen(false) }
    if (notifOpen || userMenuOpen) {
      const timer = setTimeout(() => document.addEventListener('click', handleClick), 0)
      return () => { clearTimeout(timer); document.removeEventListener('click', handleClick) }
    }
  }, [notifOpen, userMenuOpen])

  const activeModule = NAV_ITEMS.find(item =>
    pathname === item.href || (item.href !== '/mis' && pathname.startsWith(item.href))
  )

  return (
    <MisProvider>
    <div className="mis-root" style={{ display: 'flex', minHeight: '100dvh', background: BRAND.light, fontFamily: "'Jost', var(--font-jost), sans-serif", overflowX: 'hidden' }}>
      {/* MOBILE OVERLAY */}
      {isMobile && mobileOpen && (
        <div onClick={() => setMobileOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 49, transition: 'opacity 0.25s',
        }} />
      )}

      {/* SIDEBAR */}
      <aside className={`mis-sidebar${mobileOpen ? ' mis-sidebar-open' : ''}`} style={{
        width: isMobile ? 260 : (sidebarOpen ? 260 : 72),
        background: BRAND.coal, color: BRAND.cream,
        display: 'flex', flexDirection: 'column', transition: 'transform 0.25s ease, width 0.25s ease',
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50, overflowY: 'auto', overflowX: 'hidden',
        transform: isMobile && !mobileOpen ? 'translateX(-100%)' : 'translateX(0)',
        WebkitOverflowScrolling: 'touch',
      }}>
        {/* Logo */}
        <div style={{
          padding: sidebarOpen ? '20px 22px' : '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${BRAND.gold}, ${BRAND.gold}BB)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <MIcon name="wings" size={20} />
          </div>
          {sidebarOpen && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.05em', color: BRAND.cream }}>ALLTAGSENGEL</div>
              <div style={{ fontSize: 10, color: BRAND.gold, fontWeight: 600, letterSpacing: '0.1em' }}>MIS PORTAL</div>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href || (item.href !== '/mis' && pathname.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href} onClick={() => isMobile && setMobileOpen(false)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: sidebarOpen ? '10px 14px' : '10px 0',
                borderRadius: 10, textDecoration: 'none', transition: 'all 0.15s',
                background: isActive ? `${BRAND.gold}20` : 'transparent',
                color: isActive ? BRAND.gold : 'rgba(255,255,255,0.6)',
                justifyContent: sidebarOpen ? 'flex-start' : 'center',
              }}>
                <MIcon name={item.icon} size={20} />
                {sidebarOpen && <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400 }}>{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Sidebar Footer */}
        <div style={{ padding: sidebarOpen ? '16px 22px' : '16px 8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {sidebarOpen && (
            <>
              <a href="/admin/home" style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10,
                background: `${BRAND.gold}15`, color: BRAND.gold, textDecoration: 'none', fontSize: 12, fontWeight: 600,
                marginBottom: 8,
              }}>
                <MIcon name="settings" size={14} /> Admin Panel
              </a>
              <a href="https://alltagsengel.care/kunde/home" target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: 12, fontWeight: 600,
                marginBottom: 12,
              }}>
                <MIcon name="externalLink" size={14} /> App öffnen
              </a>
            </>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer', padding: 8, width: '100%', display: 'flex', justifyContent: 'center',
          }}>
            <MIcon name={sidebarOpen ? 'chevronRight' : 'menu'} size={18} />
          </button>
          {sidebarOpen && (
            <div style={{ textAlign: 'center', paddingTop: 8 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>powered by </span>
              <a href="https://dripfy.app" target="_blank" rel="noopener noreferrer" style={{
                fontSize: 10, color: BRAND.gold, textDecoration: 'none', fontWeight: 700,
              }}>DRIPFY.APP</a>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <div className="mis-main" style={{ flex: 1, marginLeft: isMobile ? 0 : (sidebarOpen ? 260 : 72), transition: 'margin 0.25s ease', display: 'flex', flexDirection: 'column' }}>
        {/* HEADER */}
        <header style={{
          height: 56, background: '#1E1B17', borderBottom: `1px solid ${BRAND.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: isMobile ? '0 14px' : '0 28px', position: 'sticky', top: 0, zIndex: 40,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
            <button className="mis-hamburger" onClick={() => setMobileOpen(!mobileOpen)} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: BRAND.text,
              display: isMobile ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center',
              padding: 4, flexShrink: 0,
            }}>
              <MIcon name="menu" size={22} />
            </button>
            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <h1 style={{ fontSize: isMobile ? 15 : 18, fontWeight: 700, color: BRAND.text, margin: 0, fontFamily: 'var(--font-cormorant), serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeModule?.label || 'Dashboard'}
              </h1>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 12, flexShrink: 0 }}>
            {!isMobile && (
              <div style={{ width: 260 }}>
                <SearchInput value={search} onChange={setSearch} placeholder="MIS durchsuchen..." />
              </div>
            )}

            {/* AI Button */}
            <button onClick={() => setAiOpen(!aiOpen)} style={{
              width: isMobile ? 34 : 38, height: isMobile ? 34 : 38, borderRadius: 10, border: `1px solid ${BRAND.border}`,
              background: aiOpen ? `${BRAND.gold}15` : BRAND.white, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: BRAND.gold,
              position: 'relative', flexShrink: 0,
            }}>
              <MIcon name="sparkles" size={isMobile ? 16 : 18} />
            </button>

            {/* Notifications */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => { setNotifOpen(!notifOpen); setUserMenuOpen(false) }} style={{
                width: isMobile ? 34 : 38, height: isMobile ? 34 : 38, borderRadius: 10, border: `1px solid ${BRAND.border}`,
                background: notifOpen ? `${BRAND.gold}15` : BRAND.white, cursor: 'pointer', position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: BRAND.muted, flexShrink: 0,
              }}>
                <MIcon name="bell" size={isMobile ? 16 : 18} />
                {notifications > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4, width: 18, height: 18,
                    borderRadius: '50%', background: BRAND.error, color: '#ffffff',
                    fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{notifications}</span>
                )}
              </button>
              {notifOpen && (
                <div style={{
                  position: 'absolute', top: 46, right: 0, width: isMobile ? 280 : 320,
                  background: BRAND.white, border: `1px solid ${BRAND.border}`, borderRadius: 12,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.3)', zIndex: 200, overflow: 'hidden',
                }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BRAND.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: BRAND.text }}>Benachrichtigungen</span>
                    <button onClick={() => { setNotifications(0); setNotifOpen(false) }} style={{ background: 'none', border: 'none', color: BRAND.gold, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Alle gelesen</button>
                  </div>
                  {[
                    { icon: 'files', title: 'Pitch Deck v2 hochgeladen', time: 'vor 2 Stunden', color: BRAND.gold },
                    { icon: 'shield', title: 'QP-002 Audit abgeschlossen', time: 'vor 5 Stunden', color: BRAND.success },
                    { icon: 'users', title: 'Neuer Engel registriert', time: 'vor 1 Tag', color: BRAND.info },
                  ].map((n, i) => (
                    <div key={i} onClick={() => setNotifOpen(false)} style={{
                      padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
                      borderBottom: `1px solid ${BRAND.border}`, cursor: 'pointer', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = BRAND.light}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${n.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <MIcon name={n.icon} size={14} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: BRAND.text }}>{n.title}</div>
                        <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 2 }}>{n.time}</div>
                      </div>
                    </div>
                  ))}
                  <div style={{ padding: '10px 16px', textAlign: 'center' }}>
                    <a href="/mis/settings" onClick={() => setNotifOpen(false)} style={{ fontSize: 12, color: BRAND.gold, textDecoration: 'none', fontWeight: 600 }}>Alle anzeigen</a>
                  </div>
                </div>
              )}
            </div>

            {/* User */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, marginLeft: isMobile ? 0 : 8, flexShrink: 0 }}>
              <button onClick={() => { setUserMenuOpen(!userMenuOpen); setNotifOpen(false) }} style={{
                background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 0,
              }}>
                <div style={{
                  width: isMobile ? 30 : 34, height: isMobile ? 30 : 34, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${BRAND.gold}, ${BRAND.coal})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: BRAND.cream, fontSize: isMobile ? 12 : 14, fontWeight: 700, flexShrink: 0,
                }}>
                  {userName.charAt(0)}
                </div>
                {!isMobile && <span style={{ fontSize: 13, fontWeight: 500, color: BRAND.text }}>{userName}</span>}
              </button>
              {userMenuOpen && (
                <div style={{
                  position: 'absolute', top: 46, right: 0, width: 200,
                  background: BRAND.white, border: `1px solid ${BRAND.border}`, borderRadius: 12,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.3)', zIndex: 200, overflow: 'hidden',
                }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BRAND.border}` }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text }}>{userName}</div>
                    <div style={{ fontSize: 11, color: BRAND.muted }}>Administrator</div>
                  </div>
                  {[
                    { icon: 'users', label: 'Profil', href: '/mis/settings' },
                    { icon: 'settings', label: 'Einstellungen', href: '/mis/settings' },
                  ].map((item, i) => (
                    <a key={i} href={item.href} onClick={() => setUserMenuOpen(false)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                      textDecoration: 'none', color: BRAND.text, fontSize: 13, transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = BRAND.light}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <MIcon name={item.icon} size={16} />
                      {item.label}
                    </a>
                  ))}
                  <div style={{ borderTop: `1px solid ${BRAND.border}` }}>
                    <button onClick={() => { setUserMenuOpen(false); handleLogout() }} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                      background: 'none', border: 'none', cursor: 'pointer', color: BRAND.error,
                      fontSize: 13, width: '100%',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = BRAND.light}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <MIcon name="logout" size={16} />
                      Abmelden
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="mis-content" style={{ flex: 1, padding: isMobile ? 12 : 28, width: '100%', maxWidth: '100%', overflowX: 'hidden', minWidth: 0, boxSizing: 'border-box' }}>
          {children}
        </main>

        {/* FOOTER */}
        <footer style={{
          padding: isMobile ? '12px 14px' : '16px 28px', borderTop: `1px solid ${BRAND.border}`, background: '#1E1B17',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: BRAND.muted,
          flexWrap: 'wrap' as const, gap: 4,
        }}>
          <span>AlltagsEngel UG — Management Information System — VERTRAULICH</span>
          <span>powered by <a href="https://dripfy.app" target="_blank" rel="noopener noreferrer" style={{ color: BRAND.gold, textDecoration: 'none', fontWeight: 700 }}>DRIPFY.APP</a></span>
        </footer>
      </div>

      {/* AI CHAT PANEL */}
      {aiOpen && (
        <div style={{
          position: 'fixed', right: isMobile ? 0 : 20, bottom: isMobile ? 0 : 20,
          width: isMobile ? '100%' : 380, height: isMobile ? '100%' : 520,
          background: BRAND.white, borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          border: `1px solid ${BRAND.border}`, display: 'flex', flexDirection: 'column', zIndex: 100,
          overflow: 'hidden',
        }}>
          {/* AI Header */}
          <div style={{
            padding: '14px 18px', borderBottom: `1px solid ${BRAND.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: `linear-gradient(135deg, ${BRAND.coal}, #2D2820)`, color: BRAND.cream,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MIcon name="sparkles" size={18} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>KI-Assistent</span>
            </div>
            <button onClick={() => setAiOpen(false)} style={{ background: 'none', border: 'none', color: BRAND.cream, cursor: 'pointer' }}>
              <MIcon name="x" size={18} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {aiMessages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
                background: msg.role === 'user' ? BRAND.gold : BRAND.light,
                color: msg.role === 'user' ? '#1A1612' : BRAND.text,
                fontSize: 13, lineHeight: 1.5,
              }}>
                {msg.text}
              </div>
            ))}
          </div>

          {/* AI Input */}
          <div style={{
            padding: '12px 16px', borderTop: `1px solid ${BRAND.border}`,
            display: 'flex', gap: 8,
          }}>
            <input
              value={aiInput} onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAiSend()}
              placeholder="Frage stellen..."
              style={{
                flex: 1, border: `1px solid ${BRAND.border}`, borderRadius: 10,
                padding: '8px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit',
                background: BRAND.light, color: BRAND.text,
              }}
            />
            <button onClick={handleAiSend} style={{
              width: 38, height: 38, borderRadius: 10, background: BRAND.gold, border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#1A1612',
            }}>
              <MIcon name="send" size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
    </MisProvider>
  )
}

// Simple local AI response (real version would call API)
function getAiResponse(query: string): string {
  const q = query.toLowerCase()
  if (q.includes('entlastung')) return 'Der Entlastungsbetrag nach §45b SGB XI beträgt seit 2026 monatlich 131 €. Dies ergibt ein jährliches Volumen von 1.572 € pro anspruchsberechtigter Person.'
  if (q.includes('umsatz') || q.includes('revenue')) return 'Laut den Finanzprognosen wird der Umsatz von 180K € (2026) auf 18M € (2030) wachsen. Die Break-Even-Punkt wird für Q3 2027 erwartet.'
  if (q.includes('markt') || q.includes('tam') || q.includes('sam')) return 'Der TAM beträgt 24,6 Mrd. €, SAM 7,80 Mrd. € (4,96M Pflegebedürftige × 131 € × 12 Monate). Ca. 60% des Budgets bleiben ungenutzt — 4,7 Mrd. € Marktchance.'
  if (q.includes('team') || q.includes('mitarbeiter')) return 'Das Gründerteam besteht derzeit aus den Kernmitgliedern. Weitere Informationen finden Sie unter Team im MIS-Portal.'
  if (q.includes('iso') || q.includes('qualität')) return 'Das ISO 9001 QMS umfasst 10 definierte Prozesse: 4 Kernprozesse (QP-001 bis QP-004), 2 Supportprozesse und 4 Managementprozesse.'
  if (q.includes('dokument') || q.includes('data room')) return 'Der Data Room enthält 10+ Dokumente in 8 Kategorien. Alle Dokumente sind ISO 9001-konform gelenkt mit Versionierung, Freigabe-Workflows und Audit-Trail.'
  return 'Vielen Dank für Ihre Frage. Ich durchsuche die MIS-Datenbank und die verknüpften Dokumente. Bitte stellen Sie eine spezifischere Frage, damit ich Ihnen besser helfen kann.'
}
