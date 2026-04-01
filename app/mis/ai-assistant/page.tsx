'use client'
import React, { useState, useRef, useEffect } from 'react'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, Badge } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'
import { useMis } from '@/lib/mis/MisContext'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const SUGGESTIONS = [
  { icon: 'chart', text: 'Wie viele Benutzer haben wir aktuell und welche Rollen haben sie?' },
  { icon: 'trending', text: 'Analysiere unsere Besucherzahlen — woher kommen die meisten Besucher?' },
  { icon: 'banknote', text: 'Zeige mir die aktuellen Finanzkennzahlen und den Umsatz' },
  { icon: 'users', text: 'Wie viele Engel, Kunden und Fahrer sind registriert?' },
  { icon: 'activity', text: 'Wer hat sich zuletzt eingeloggt und von welchem Gerät?' },
  { icon: 'target', text: 'Erstelle eine Zusammenfassung für Investoren mit aktuellen KPIs' },
  { icon: 'shield', text: 'Wie ist der Status unserer ISO 9001 Zertifizierung?' },
  { icon: 'truck', text: 'Wie groß ist der Krankenfahrten-Markt und unsere Strategie?' },
]

export default function AiAssistantPage() {
  const { isMobile } = useMis()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1', role: 'assistant', content:
        'Willkommen beim AlltagsEngel KI-Assistenten! 🤖\n\nIch habe Echtzeit-Zugriff auf Ihre Datenbank — Benutzer, Buchungen, Besucher und Login-Daten. Stellen Sie mir jede Frage zu Ihrem Unternehmen.\n\nBeispiele:\n• „Wie viele Nutzer haben wir?"\n• „Woher kommen unsere Besucher?"\n• „Erstelle einen Investorenbericht"\n• „Analysiere unsere Wachstumsstrategie"',
      timestamp: new Date(),
    }
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(text?: string) {
    const q = text || input
    if (!q.trim() || isTyping) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: q,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)
    setError(null)

    try {
      // Conversation history für Kontext (ohne die allererste Welcome-Message)
      const history = [...messages.filter(m => m.id !== '1'), userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }))

      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Fehler ${res.status}`)
      }

      const data = await res.json()

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, aiMsg])
    } catch (err: any) {
      setError(err.message || 'Verbindungsfehler')
      // Fehlermeldung als Assistant-Nachricht
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ ${err.message || 'Verbindungsfehler. Bitte versuchen Sie es erneut.'}`,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setIsTyping(false)
      inputRef.current?.focus()
    }
  }

  function clearChat() {
    setMessages([{
      id: Date.now().toString(),
      role: 'assistant',
      content: 'Chat wurde zurückgesetzt. Wie kann ich Ihnen helfen?',
      timestamp: new Date(),
    }])
    setError(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: isMobile ? 'auto' : 'calc(100vh - 180px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <SectionHeader title="KI-Assistent" subtitle="Gemini AI mit Echtzeit-Zugriff auf alle Unternehmensdaten" icon="sparkles" />
        <button onClick={clearChat} style={{
          padding: '8px 16px', borderRadius: 8, border: `1px solid ${BRAND.border}`,
          background: 'none', color: BRAND.muted, fontSize: 12, cursor: 'pointer',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <MIcon name="refresh" size={14} /> Neuer Chat
        </button>
      </div>

      <div style={{ display: 'flex', gap: 20, flex: 1, minHeight: 0, flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Chat Area */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          background: BRAND.white, borderRadius: 14,
          border: `1px solid ${BRAND.border}`, overflow: 'hidden',
          minHeight: isMobile ? 500 : 0,
        }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.map(msg => (
              <div key={msg.id} style={{
                display: 'flex', flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  {msg.role === 'assistant' && (
                    <span style={{ color: BRAND.gold, display: 'flex' }}><MIcon name="sparkles" size={14} /></span>
                  )}
                  <span style={{ fontSize: 11, color: BRAND.muted, fontWeight: 600 }}>
                    {msg.role === 'assistant' ? 'KI-Assistent' : 'Sie'}
                  </span>
                </div>
                <div style={{
                  maxWidth: '85%', padding: '12px 16px', borderRadius: 14,
                  background: msg.role === 'user' ? BRAND.gold : 'rgba(255,255,255,0.05)',
                  color: msg.role === 'user' ? '#1A1612' : BRAND.text,
                  fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                  border: msg.role === 'assistant' ? `1px solid ${BRAND.border}` : 'none',
                }}>
                  {msg.content}
                </div>
                <span style={{ fontSize: 10, color: BRAND.muted }}>
                  {msg.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
            {isTyping && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <span style={{ color: BRAND.gold }}><MIcon name="sparkles" size={16} /></span>
                <span style={{ fontSize: 13, color: BRAND.muted }}>Analysiert Daten...</span>
                <span style={{ display: 'inline-flex', gap: 3 }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 6, height: 6, borderRadius: '50%', background: BRAND.gold,
                      animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                      opacity: 0.4,
                    }} />
                  ))}
                </span>
                <style>{`@keyframes pulse { 0%,100% { opacity:0.4; transform:scale(1); } 50% { opacity:1; transform:scale(1.2); } }`}</style>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '16px 20px', borderTop: `1px solid ${BRAND.border}`,
            display: 'flex', gap: 10,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Fragen Sie etwas über Ihr Unternehmen..."
              disabled={isTyping}
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 12,
                border: `1px solid ${BRAND.border}`,
                fontSize: 14, fontFamily: 'inherit', outline: 'none',
                background: BRAND.light, color: BRAND.text,
                opacity: isTyping ? 0.5 : 1,
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isTyping}
              style={{
                width: 44, height: 44, borderRadius: 12, background: BRAND.gold,
                border: 'none', cursor: input.trim() && !isTyping ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#1A1612', opacity: input.trim() && !isTyping ? 1 : 0.5,
              }}
            >
              <MIcon name="send" size={18} />
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{
          width: isMobile ? '100%' : 300, minWidth: 200,
          display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0,
        }}>
          <Card title="Vorschläge" icon="sparkles">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => handleSend(s.text)} disabled={isTyping} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px',
                  borderRadius: 8, border: `1px solid ${BRAND.border}`, background: 'none',
                  cursor: isTyping ? 'not-allowed' : 'pointer', textAlign: 'left',
                  fontSize: 12, color: BRAND.text, fontFamily: 'inherit',
                  transition: 'all 0.15s', lineHeight: 1.4,
                  opacity: isTyping ? 0.5 : 1,
                }}
                  onMouseEnter={e => { if (!isTyping) { e.currentTarget.style.background = BRAND.light; e.currentTarget.style.borderColor = BRAND.gold } }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = BRAND.border }}
                >
                  <span style={{ color: BRAND.gold, flexShrink: 0, marginTop: 1 }}>
                    <MIcon name={s.icon} size={14} />
                  </span>
                  {s.text}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Fähigkeiten" icon="brain">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: BRAND.muted }}>
              {[
                'Echtzeit-Datenbankzugriff',
                'Benutzer- & Buchungsanalyse',
                'Besucher-Tracking & Herkunft',
                'Finanz- & KPI-Analyse',
                'Markt- & Wettbewerbsanalyse',
                'ISO 9001 Compliance-Status',
                'Investorenberichte erstellen',
                'Strategische Empfehlungen',
              ].map(c => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: BRAND.success }}><MIcon name="check" size={12} /></span> {c}
                </div>
              ))}
            </div>
          </Card>

          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(201,150,60,0.08)',
            border: `1px solid rgba(201,150,60,0.15)`,
            fontSize: 11, color: BRAND.muted, lineHeight: 1.5,
          }}>
            💡 Der Assistent nutzt Google Gemini AI mit Echtzeit-Daten aus Ihrer Supabase-Datenbank. Jede Antwort basiert auf aktuellen Unternehmenskennzahlen.
          </div>
        </div>
      </div>
    </div>
  )
}
