'use client'
import React, { useState, useRef, useEffect } from 'react'
import { BRAND, UNIT_ECONOMICS, MARKET_DATA, FINANCIAL_PROJECTIONS } from '@/lib/mis/constants'
import { SectionHeader, Card, MisButton, Badge } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'
import { useMis } from '@/lib/mis/MisContext'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  sources?: { title: string; module: string }[]
}

const SUGGESTIONS = [
  { icon: 'chart', text: 'Zeige mir die aktuellen Finanzkennzahlen', module: 'finance' },
  { icon: 'trending', text: 'Wie groß ist unser adressierbarer Markt?', module: 'market' },
  { icon: 'shield', text: 'Welche ISO 9001 Audits stehen an?', module: 'quality' },
  { icon: 'files', text: 'Welche Dokumente brauchen eine Überprüfung?', module: 'documents' },
  { icon: 'users', text: 'Wie viele aktive Engel haben wir?', module: 'team' },
  { icon: 'truck', text: 'Status der Lieferantenbewertungen?', module: 'supply-chain' },
  { icon: 'banknote', text: 'Was ist der aktuelle Entlastungsbetrag?', module: 'market' },
  { icon: 'target', text: 'Erstelle einen Investorenbericht', module: 'dataroom' },
]

export default function AiAssistantPage() {
  const { isMobile } = useMis()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1', role: 'assistant', content:
        'Willkommen beim AlltagsEngel KI-Assistenten! Ich habe Zugriff auf alle MIS-Module und kann Ihnen bei Analysen, Berichten und Entscheidungen helfen.\n\nWas möchten Sie wissen?',
      timestamp: new Date(),
    }
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function handleSend(text?: string) {
    const q = text || input
    if (!q.trim()) return
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: q, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    setTimeout(() => {
      const { response, sources } = generateResponse(q)
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(), role: 'assistant', content: response,
        timestamp: new Date(), sources,
      }
      setMessages(prev => [...prev, aiMsg])
      setIsTyping(false)
    }, 1000 + Math.random() * 1000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: isMobile ? 'auto' : 'calc(100vh - 180px)' }}>
      <SectionHeader title="KI-Assistent" subtitle="Intelligente Suche, Analyse und Empfehlungen über alle MIS-Module" icon="sparkles" />

      <div style={{ display: 'flex', gap: 20, flex: 1, minHeight: 0, flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Chat Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BRAND.white, borderRadius: 14, border: `1px solid ${BRAND.border}`, overflow: 'hidden', minHeight: isMobile ? 400 : 0 }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.map(msg => (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
                <div style={{
                  maxWidth: '80%', padding: '12px 16px', borderRadius: 14,
                  background: msg.role === 'user' ? BRAND.gold : BRAND.light,
                  color: msg.role === 'user' ? '#1A1612' : BRAND.text,
                  fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: '80%' }}>
                    {msg.sources.map((s, i) => (
                      <Badge key={i} label={`📄 ${s.title}`} color={BRAND.info} size="sm" />
                    ))}
                  </div>
                )}
                <span style={{ fontSize: 10, color: BRAND.muted }}>
                  {msg.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
            {isTyping && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: BRAND.muted, fontSize: 13 }}>
                <span style={{ color: BRAND.gold }}><MIcon name="sparkles" size={16} /></span>
                Analysiert...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '16px 20px', borderTop: `1px solid ${BRAND.border}`, display: 'flex', gap: 10 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Stellen Sie eine Frage zu Ihrem Unternehmen..."
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 12, border: `1px solid ${BRAND.border}`,
                fontSize: 14, fontFamily: 'inherit', outline: 'none', background: BRAND.light, color: BRAND.text,
              }}
            />
            <button onClick={() => handleSend()} disabled={!input.trim()} style={{
              width: 44, height: 44, borderRadius: 12, background: BRAND.gold, border: 'none',
              cursor: input.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#1A1612', opacity: input.trim() ? 1 : 0.5,
            }}>
              <MIcon name="send" size={18} />
            </button>
          </div>
        </div>

        {/* Sidebar: Suggestions */}
        <div style={{ width: isMobile ? '100%' : 300, display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
          <Card title="Vorschläge" icon="sparkles">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => handleSend(s.text)} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px',
                  borderRadius: 8, border: `1px solid ${BRAND.border}`, background: 'none',
                  cursor: 'pointer', textAlign: 'left', fontSize: 12, color: BRAND.text,
                  fontFamily: 'inherit', transition: 'all 0.15s', lineHeight: 1.4,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = BRAND.light; e.currentTarget.style.borderColor = BRAND.gold }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = BRAND.border }}
                >
                  <span style={{ color: BRAND.gold, flexShrink: 0, marginTop: 1 }}><MIcon name={s.icon} size={14} /></span>
                  {s.text}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Fähigkeiten" icon="brain">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: BRAND.muted }}>
              {['Dokumentensuche & Crawling', 'Finanzkennzahlen-Analyse', 'Markt- & Wettbewerbsanalyse', 'ISO 9001 Compliance-Check', 'Investorenberichte erstellen', 'Lieferketten-Übersicht', 'KPI-Trend-Analyse', 'Automatische Empfehlungen'].map(c => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: BRAND.success }}><MIcon name="check" size={12} /></span> {c}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function generateResponse(query: string): { response: string; sources: { title: string; module: string }[] } {
  const q = query.toLowerCase()
  if (q.includes('entlastung') || q.includes('§45b') || q.includes('131')) {
    return {
      response: `Der Entlastungsbetrag nach §45b SGB XI beträgt seit 2026:\n\n• Monatlich: €131 pro Person\n• Jährlich: €1.572 pro Person\n• Anspruchsberechtigte: 4,96 Millionen (PG 1-5)\n• Gesamtvolumen: €7,80 Mrd. p.a.\n\nCa. 60% dieses Budgets bleibt aktuell ungenutzt — das sind €4,7 Mrd. jährlich. AlltagsEngel adressiert genau diese Lücke durch einfache digitale Buchung und §45b-Integration.`,
      sources: [{ title: 'Marktanalyse', module: 'market' }, { title: 'Financial Projections', module: 'finance' }],
    }
  }
  if (q.includes('finanz') || q.includes('umsatz') || q.includes('revenue') || q.includes('burn')) {
    return {
      response: `Aktuelle Finanzkennzahlen:\n\n📊 5-Jahres-Prognose:\n• 2026: €390K Umsatz (Start)\n• 2027: €1,96M (Break-Even Q3)\n• 2028: €7,8M\n• 2029: €23,4M\n• 2030: €58,5M\n\n💰 Seed-Runde: €500K bei €2,5M Pre-Money\n• Burn Rate: ~€12K/Monat\n• Runway: ~42 Monate\n\n📈 Unit Economics:\n• CAC: €${UNIT_ECONOMICS.cac} | LTV: €${UNIT_ECONOMICS.ltv} | Ratio: ${UNIT_ECONOMICS.ltvCacRatio}x\n• Payback: ${UNIT_ECONOMICS.paybackMonths} Monate`,
      sources: [{ title: 'Financial Projections', module: 'finance' }, { title: 'Pitch Deck', module: 'dataroom' }],
    }
  }
  if (q.includes('markt') || q.includes('tam') || q.includes('sam') || q.includes('wettbewerb')) {
    return {
      response: `Marktübersicht:\n\n🌍 Marktgröße:\n• TAM: €24,6 Mrd. (gesamter Pflegemarkt)\n• SAM: €7,80 Mrd. (§45b Entlastungsbetrag)\n• SOM (Jahr 5): €52 Mio.\n\n🏆 Hauptwettbewerber:\n• Careship — Plattform, keine §45b-Integration\n• Pflege.de — Nur Vermittlung\n• Home Instead — Premium, wenig digital\n\n✅ Unser Vorteil: Einzige volldigitale Plattform mit direkter §45b-Abrechnung.`,
      sources: [{ title: 'Market Analysis', module: 'market' }],
    }
  }
  if (q.includes('iso') || q.includes('qualität') || q.includes('audit')) {
    return {
      response: `ISO 9001 QMS-Status:\n\n📋 10 definierte Prozesse:\n• 4 Kernprozesse (Registrierung, Buchung, Zertifizierung, Zahlung)\n• 2 Supportprozesse (Kundensupport, Datenschutz)\n• 4 Managementprozesse (Dokumentenlenkung, Review, Lieferanten, KVP)\n\n⚠️ Status: Aufbauphase\n• Prozesslandkarte definiert\n• Audit-Planung beginnt Q2 2026\n• Zertifizierungsziel: Q4 2026`,
      sources: [{ title: 'Quality Processes', module: 'quality' }],
    }
  }
  if (q.includes('dokument') || q.includes('data room') || q.includes('investor')) {
    return {
      response: `Data Room Übersicht:\n\n📁 11 Dokumente in 8 Sektionen:\n• Executive Summary (PDF)\n• Company Overview (DOCX)\n• Pitch Deck DE (PPTX, 16 Folien)\n• Brand Identity Guidelines (PDF)\n• Market Analysis (DOCX)\n• Financial Projections (XLSX)\n• Product & Technology (PDF)\n• Go-To-Market Strategy (DOCX)\n• Legal & Compliance (DOCX)\n• Data Room Index (PDF)\n\n✅ Alle Dokumente sind finalisiert und bereit für Investoren.`,
      sources: [{ title: 'Data Room Index', module: 'dataroom' }],
    }
  }
  if (q.includes('engel') || q.includes('team') || q.includes('mitarbeiter')) {
    return {
      response: `Team-Übersicht:\n\nDie Benutzerdaten werden aus der Supabase-Datenbank geladen. Aktuelle Rollen:\n• Admin — Systemadministratoren\n• Engel — Zertifizierte Alltagsbegleiter\n• Kunde — Pflegebedürftige und Angehörige\n\nFür detaillierte Team-Informationen besuchen Sie das Team-Modul im MIS.`,
      sources: [{ title: 'Profiles', module: 'team' }],
    }
  }
  if (q.includes('bericht') || q.includes('report')) {
    return {
      response: `Ich kann folgende Berichte für Sie erstellen:\n\n1. 📊 Investorenbericht — KPIs, Finanzen, Markt\n2. 📋 ISO 9001 Management Review\n3. 💰 Monatlicher Finanzbericht\n4. 📈 Markt- und Wettbewerbsanalyse\n5. 👥 Team & HR Report\n6. 🚚 Lieferantenbewertung\n\nWelchen Bericht soll ich erstellen?`,
      sources: [],
    }
  }
  return {
    response: `Vielen Dank für Ihre Frage. Ich durchsuche das gesamte MIS:\n\n• 📁 Dokumentenarchiv\n• 💰 Finanzdaten\n• 📊 Marktanalysen\n• 🏗️ Qualitätsprozesse\n• 🚚 Lieferkette\n\nKönnten Sie Ihre Frage etwas spezifischer formulieren? Zum Beispiel:\n— "Wie hoch ist der aktuelle Entlastungsbetrag?"\n— "Zeige die 5-Jahres-Prognose"\n— "Welche Audits stehen an?"`,
    sources: [],
  }
}
