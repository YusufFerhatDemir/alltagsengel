'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

// ═══════════════════════════════════════════════════════════
// BERATUNGS-CHAT — Floating KI-Berater auf den Public-Seiten
// ═══════════════════════════════════════════════════════════
// Beantwortet Fragen zu Entlastungsbetrag, Pflegegraden und
// Leistungen über /api/beratung-chat. Sitzt unten links
// (WhatsApp-Button ist unten rechts). Absender: "Alltagsengel".
// ═══════════════════════════════════════════════════════════

// Nur auf öffentlichen Marketing-/Info-Seiten anzeigen
const PUBLIC_PREFIXES = [
  '/alltagsbegleitung', '/hygienebox', '/krankenfahrten', '/blog', '/faq',
  '/kontakt', '/budgetrechner', '/pflegegrad-check', '/termin',
  '/engel-werden', '/karriere', '/jobs', '/team', '/finanzierung', '/lp',
  '/einzugsgebiet', '/bewertungen', '/ueber-uns',
]

const QUICK_FRAGEN = [
  'Was ist der Entlastungsbetrag?',
  'Habe ich Anspruch auf 131 €?',
  'Was kostet mich das?',
  'Wie bekomme ich einen Pflegegrad?',
]

interface Msg { role: 'user' | 'assistant'; content: string }

const BEGRUESSUNG: Msg = {
  role: 'assistant',
  content: 'Hallo! Ich bin der digitale Berater von Alltagsengel. Ich beantworte Ihre Fragen zum Entlastungsbetrag (131 €/Monat), zu Pflegegraden und zu unseren Leistungen. Was möchten Sie wissen?',
}

/** Text mit internen Pfaden (/budgetrechner …) und Telefonnummern als Links rendern */
function MsgText({ text }: { text: string }) {
  const teile = text.split(/(\/(?:budgetrechner|pflegegrad-check|termin|kontakt|hygienebox|krankenfahrten|engel-werden|alltagsbegleitung|blog)[\w-/]*|\+49[\s\d]{8,16})/g)
  return (
    <>
      {teile.map((t, i) => {
        if (/^\/[a-z]/.test(t)) {
          return <a key={i} href={t} style={{ color: '#E8C87E', textDecoration: 'underline' }}>{t}</a>
        }
        if (/^\+49/.test(t)) {
          return <a key={i} href={`https://wa.me/${t.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#E8C87E', textDecoration: 'underline' }}>{t}</a>
        }
        return <span key={i}>{t}</span>
      })}
    </>
  )
}

export default function BeratungsChat() {
  const pathname = usePathname()
  const [offen, setOffen] = useState(false)
  const [sichtbar, setSichtbar] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([BEGRUESSUNG])
  const [input, setInput] = useState('')
  const [laedt, setLaedt] = useState(false)
  const listeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setSichtbar(true), 2500)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    listeRef.current?.scrollTo({ top: listeRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, laedt, offen])

  const istPublic = pathname === '/' || PUBLIC_PREFIXES.some(p => pathname?.startsWith(p))
  if (!istPublic || !sichtbar) return null

  // Seiten mit Sticky-CTA-Leiste unten (Landing, Jobs, Karriere, Engel-werden)
  // → Button höher setzen, sonst verdeckt er den Haupt-CTA
  const hasStickyBar = pathname === '/' || ['/jobs', '/karriere', '/engel-werden'].includes(pathname || '')
  const bottom = hasStickyBar ? 'calc(118px + env(safe-area-inset-bottom))' : 'calc(24px + env(safe-area-inset-bottom))'

  async function senden(text: string) {
    const frage = text.trim()
    if (!frage || laedt) return
    const neu: Msg[] = [...messages, { role: 'user', content: frage }]
    setMessages(neu)
    setInput('')
    setLaedt(true)
    try {
      const res = await fetch('/api/beratung-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: neu.slice(1) }), // Begrüßung nicht mitsenden
      })
      const data = await res.json().catch(() => null)
      const antwort = data?.content || 'Entschuldigung, da ist etwas schiefgelaufen. Versuchen Sie es bitte erneut — oder buchen Sie eine kostenlose Beratung unter /termin.'
      setMessages(m => [...m, { role: 'assistant', content: antwort }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Entschuldigung, da ist etwas schiefgelaufen. Versuchen Sie es bitte erneut — oder schreiben Sie uns per WhatsApp: +49 178 3382825.' }])
    } finally {
      setLaedt(false)
    }
  }

  return (
    <>
      {/* Chat-Panel */}
      {offen && (
        <div
          role="dialog"
          aria-label="Alltagsengel Beratungs-Chat"
          style={{
            position: 'fixed', left: 16, bottom: `calc(${bottom} + 66px)`, zIndex: 1002,
            width: 'min(92vw, 380px)', height: 'min(70vh, 540px)',
            display: 'flex', flexDirection: 'column',
            background: '#1E1A16', border: '1px solid rgba(201,150,60,0.35)', borderRadius: 18,
            boxShadow: '0 12px 48px rgba(0,0,0,0.55)', overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, rgba(201,150,60,0.22), rgba(201,150,60,0.08))', borderBottom: '1px solid rgba(201,150,60,0.25)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #E8C87E, #C9963C)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }} aria-hidden="true">😇</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 700 }}>Alltagsengel Beratung</div>
              <div style={{ color: '#B8B0A4', fontSize: 11 }}>KI-Assistent · antwortet sofort</div>
            </div>
            <button onClick={() => setOffen(false)} aria-label="Chat schließen" style={{ background: 'none', border: 'none', color: '#B8B0A4', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
          </div>

          {/* Nachrichten */}
          <div ref={listeRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%', padding: '10px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.55,
                  background: m.role === 'user' ? 'rgba(201,150,60,0.22)' : 'rgba(255,255,255,0.06)',
                  color: '#F5F0E8',
                  border: m.role === 'user' ? '1px solid rgba(201,150,60,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  borderBottomRightRadius: m.role === 'user' ? 4 : 14,
                  borderBottomLeftRadius: m.role === 'user' ? 14 : 4,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}
              >
                <MsgText text={m.content} />
              </div>
            ))}
            {laedt && (
              <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', color: '#8A8279', fontSize: 13 }} aria-live="polite">
                Alltagsengel schreibt…
              </div>
            )}
            {/* Schnellfragen nur solange noch nichts gefragt wurde */}
            {messages.length === 1 && !laedt && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {QUICK_FRAGEN.map(f => (
                  <button
                    key={f}
                    onClick={() => senden(f)}
                    style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 12, fontSize: 13, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(201,150,60,0.35)', color: '#E8C87E' }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Eingabe */}
          <form
            onSubmit={e => { e.preventDefault(); senden(input) }}
            style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ihre Frage…"
              aria-label="Ihre Frage an Alltagsengel"
              maxLength={1200}
              style={{ flex: 1, padding: '11px 13px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#F5F0E8', fontSize: 14, outline: 'none' }}
            />
            <button
              type="submit"
              disabled={laedt || !input.trim()}
              aria-label="Senden"
              style={{ padding: '0 16px', borderRadius: 12, border: 'none', background: input.trim() && !laedt ? '#C9963C' : 'rgba(255,255,255,0.08)', color: input.trim() && !laedt ? '#1A1612' : '#6A6259', fontSize: 15, fontWeight: 700, cursor: input.trim() && !laedt ? 'pointer' : 'default' }}
            >
              ➤
            </button>
          </form>
          <div style={{ padding: '0 12px 10px', color: '#6A6259', fontSize: 10, textAlign: 'center' }}>
            KI-Assistent — kann Fehler machen. Verbindliche Auskünfte im kostenlosen Beratungsgespräch.
          </div>
        </div>
      )}

      {/* Floating Button (unten links — WhatsApp sitzt rechts) */}
      <button
        onClick={() => setOffen(o => !o)}
        aria-label={offen ? 'Beratungs-Chat schließen' : 'Beratungs-Chat öffnen'}
        style={{
          position: 'fixed', left: 16, bottom, zIndex: 1001,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: offen ? '14px 16px' : '13px 18px 13px 14px',
          borderRadius: 999, border: '1px solid rgba(232,200,126,0.5)',
          background: 'linear-gradient(135deg, #E8C87E, #C9963C)',
          color: '#1A1612', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 6px 24px rgba(201,150,60,0.45)',
        }}
      >
        <span style={{ fontSize: 18 }} aria-hidden="true">💬</span>
        {!offen && <span>Fragen zur Pflege?</span>}
        {offen && <span>Schließen</span>}
      </button>
    </>
  )
}
