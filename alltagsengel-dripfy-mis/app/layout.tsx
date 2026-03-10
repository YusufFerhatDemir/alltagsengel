'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { NAV_ITEMS, BRAND } from '@/lib/mis/constants'
import { MIcon } from '@/components/mis/MisIcons'
import { SearchInput } from '@/components/mis/MisComponents'
import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname?.startsWith('/auth')

  return (
    <html lang="de">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Jost:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <title>AlltagsEngel MIS Portal</title>
        <meta name="description" content="AlltagsEngel Management Information System" />
      </head>
      <body style={{ margin: 0, fontFamily: "'Jost', sans-serif" }}>
        {isAuthPage ? children : <MISShell>{children}</MISShell>}
      </body>
    </html>
  )
}

function MISShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [search, setSearch] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [aiMessages, setAiMessages] = useState<{ role: string; text: string }[]>([
    { role: 'assistant', text: 'Willkommen im AlltagsEngel KI-Assistenten. Wie kann ich Ihnen helfen?' }
  ])
  const [aiInput, setAiInput] = useState('')
  const [notifications] = useState(3)
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
    setTimeout(() => {
      setAiMessages(prev => [...prev, { role: 'assistant', text: getAiResponse(q) }])
    }, 800)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const activeModule = NAV_ITEMS.find(item =>
    pathname === item.href || ((item.href as string) !== '/' && pathname.startsWith(item.href))
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: BRAND.light, fontFamily: "'Jost', sans-serif" }}>
      {/* SIDEBAR */}
      <aside style={{
        width: sidebarOpen ? 260 : 72, background: BRAND.coal, color: BRAND.cream,
        display: 'flex', flexDirection: 'column', transition: 'width 0.25s ease',
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50, overflow: 'hidden',
      }}>
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

        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href || ((item.href as string) !== '/' && pathname.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href} style={{
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

        <div style={{ padding: sidebarOpen ? '16px 22px' : '16px 8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {sidebarOpen && (
            <a href="https://alltagsengel.vercel.app/kunde/home" target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10,
              background: `${BRAND.gold}15`, color: BRAND.gold, textDecoration: 'none', fontSize: 12, fontWeight: 600,
              marginBottom: 12,
            }}>
              <MIcon name="externalLink" size={14} /> App öffnen
            </a>
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
      <div style={{ flex: 1, marginLeft: sidebarOpen ? 260 : 72, transition: 'margin 0.25s ease', display: 'flex', flexDirection: 'column' }}>
        <header style={{
          height: 64, background: BRAND.white, borderBottom: `1px solid ${BRAND.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 28px', position: 'sticky', top: 0, zIndex: 40,
        }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: BRAND.coal, margin: 0, fontFamily: "'Cormorant Garamond', serif" }}>
              {activeModule?.label || 'Dashboard'}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 260 }}>
              <SearchInput value={search} onChange={setSearch} placeholder="MIS durchsuchen..." />
            </div>
            <button onClick={() => setAiOpen(!aiOpen)} style={{
              width: 38, height: 38, borderRadius: 10, border: `1px solid ${BRAND.border}`,
              background: aiOpen ? `${BRAND.gold}15` : BRAND.white, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: BRAND.gold,
            }}>
              <MIcon name="sparkles" size={18} />
            </button>
            <button style={{
              width: 38, height: 38, borderRadius: 10, border: `1px solid ${BRAND.border}`,
              background: BRAND.white, cursor: 'pointer', position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: BRAND.muted,
            }}>
              <MIcon name="bell" size={18} />
              {notifications > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4, width: 18, height: 18,
                  borderRadius: '50%', background: BRAND.error, color: BRAND.white,
                  fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{notifications}</span>
              )}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: `linear-gradient(135deg, ${BRAND.gold}, ${BRAND.coal})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: BRAND.cream, fontSize: 14, fontWeight: 700,
              }}>
                {userName.charAt(0)}
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: BRAND.coal }}>{userName}</span>
              <button onClick={handleLogout} title="Abmelden" style={{
                background: 'none', border: 'none', cursor: 'pointer', color: BRAND.muted, padding: 4,
              }}>
                <MIcon name="logout" size={16} />
              </button>
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: 28, maxWidth: 1440, width: '100%' }}>
          {children}
        </main>

        <footer style={{
          padding: '16px 28px', borderTop: `1px solid ${BRAND.border}`, background: BRAND.white,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: BRAND.muted,
        }}>
          <span>AlltagsEngel UG — Management Information System — VERTRAULICH</span>
          <span>powered by <a href="https://dripfy.app" target="_blank" rel="noopener noreferrer" style={{ color: BRAND.gold, textDecoration: 'none', fontWeight: 700 }}>DRIPFY.APP</a></span>
        </footer>
      </div>

      {/* AI CHAT PANEL */}
      {aiOpen && (
        <div style={{
          position: 'fixed', right: 20, bottom: 20, width: 380, height: 520,
          background: BRAND.white, borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          border: `1px solid ${BRAND.border}`, display: 'flex', flexDirection: 'column', zIndex: 100,
          overflow: 'hidden',
        }}>
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
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {aiMessages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
                background: msg.role === 'user' ? BRAND.gold : BRAND.light,
                color: msg.role === 'user' ? BRAND.white : BRAND.coal,
                fontSize: 13, lineHeight: 1.5,
              }}>
                {msg.text}
              </div>
            ))}
          </div>
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${BRAND.border}`, display: 'flex', gap: 8 }}>
            <input
              value={aiInput} onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAiSend()}
              placeholder="Frage stellen..."
              style={{
                flex: 1, border: `1px solid ${BRAND.border}`, borderRadius: 10,
                padding: '8px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit',
                background: BRAND.light,
              }}
            />
            <button onClick={handleAiSend} style={{
              width: 38, height: 38, borderRadius: 10, background: BRAND.gold, border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: BRAND.white,
            }}>
              <MIcon name="send" size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function getAiResponse(query: string): string {
  const q = query.toLowerCase()
  if (q.includes('entlastung')) return 'Der Entlastungsbetrag nach §45b SGB XI beträgt seit 2026 monatlich 131 €. Dies ergibt ein jährliches Volumen von 1.572 € pro anspruchsberechtigter Person.'
  if (q.includes('umsatz') || q.includes('revenue')) return 'Laut den Finanzprognosen wird der Umsatz von 180K € (2026) auf 18M € (2030) wachsen. Die Break-Even-Punkt wird für Q3 2027 erwartet.'
  if (q.includes('markt') || q.includes('tam') || q.includes('sam')) return 'Der TAM beträgt 24,6 Mrd. €, SAM 7,84 Mrd. € (4,96M Pflegebedürftige × 131 € × 12 Monate). Ca. 60% des Budgets bleiben ungenutzt — 4,7 Mrd. € Marktchance.'
  if (q.includes('team') || q.includes('mitarbeiter')) return 'Das Gründerteam besteht derzeit aus den Kernmitgliedern. Weitere Informationen finden Sie unter Team im MIS-Portal.'
  if (q.includes('iso') || q.includes('qualität')) return 'Das ISO 9001 QMS umfasst 10 definierte Prozesse: 4 Kernprozesse (QP-001 bis QP-004), 2 Supportprozesse und 4 Managementprozesse.'
  if (q.includes('dokument') || q.includes('data room')) return 'Der Data Room enthält 10+ Dokumente in 8 Kategorien. Alle Dokumente sind ISO 9001-konform gelenkt mit Versionierung, Freigabe-Workflows und Audit-Trail.'
  return 'Vielen Dank für Ihre Frage. Ich durchsuche die MIS-Datenbank und die verknüpften Dokumente. Bitte stellen Sie eine spezifischere Frage, damit ich Ihnen besser helfen kann.'
}
