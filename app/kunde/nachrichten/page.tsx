'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import { IconWingsGold } from '@/components/Icons'

// ═══════════════════════════════════════════════════════════════
// Kunden-Support-Nachrichten — buchungsunabhängig
// ═══════════════════════════════════════════════════════════════
// Die messages-Tabelle verlangt eine booking_id (NOT NULL) und eine
// receiver_id — beides gibt es für allgemeine Support-Anfragen nicht.
// Stattdessen nutzen wir das rollenübergreifende Notizsystem care_notes
// (Migration 20260719): Klienten dürfen per RLS eigene Notizen mit
// author_role='kunde' anlegen und alle nicht-internen Notizen zu ihrem
// Klienten lesen. Antworten des Büros (author_role='buero'/'admin')
// erscheinen damit automatisch — inkl. Realtime-Subscription.
// ═══════════════════════════════════════════════════════════════

interface NoteMessage {
  id: string
  author_id: string
  author_role: string
  content: string
  is_urgent: boolean
  created_at: string
}

// Absender-Label — nie persönliche Namen in Kundenrichtung
function senderLabel(role: string): string {
  if (role === 'engel') return 'Ihre Betreuungskraft'
  return 'Alltagsengel'
}

export default function KundeNachrichtenPage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [clientId, setClientId] = useState<string | null>(null)
  const [messages, setMessages] = useState<NoteMessage[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authorName, setAuthorName] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let channel: any = null

    async function init() {
      setError('')
      try {
        const user = await requireUser(router, { redirectTo: '/kunde/nachrichten' })
        if (!user || cancelled) return
        setUserId(user.id)
        const supabase = createClient()

        // Name für author_name (Klient darf eigenes Profil lesen)
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', user.id)
          .maybeSingle()
        if (profile) setAuthorName(`${profile.first_name || ''} ${profile.last_name || ''}`.trim())

        // client_id ermitteln: die clients-Tabelle selbst ist für Kunden nicht
        // lesbar (RLS), aber die eigenen Budget-/Leistungs-/Rechnungszeilen
        // enthalten die client_id.
        let cid: string | null = null
        for (const table of ['client_budgets', 'service_records', 'invoices'] as const) {
          const { data } = await supabase.from(table).select('client_id').limit(1)
          if (data && data[0]?.client_id) { cid = data[0].client_id; break }
        }
        if (cancelled) return
        setClientId(cid)

        if (cid) {
          // Verlauf laden (RLS blendet interne Notizen aus)
          const { data: notes, error: notesErr } = await supabase
            .from('care_notes')
            .select('id, author_id, author_role, content, is_urgent, created_at')
            .eq('client_id', cid)
            .order('created_at', { ascending: true })
            .limit(300)
          if (notesErr) throw new Error('Nachrichten konnten nicht geladen werden')
          if (cancelled) return
          setMessages((notes || []) as NoteMessage[])

          // Realtime: neue Nachrichten sofort anzeigen
          channel = supabase
            .channel(`support-notes-${cid}`)
            .on('postgres_changes', {
              event: 'INSERT', schema: 'public', table: 'care_notes',
              filter: `client_id=eq.${cid}`,
            }, (payload) => {
              const note = payload.new as any
              if (note.is_internal) return
              setMessages(prev => prev.some(m => m.id === note.id) ? prev : [...prev, note as NoteMessage])
            })
            .subscribe()
        }
        setLoading(false)
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Ein Fehler beim Laden der Nachrichten ist aufgetreten')
          setLoading(false)
        }
      }
    }

    init()
    return () => {
      cancelled = true
      if (channel) {
        const supabase = createClient()
        supabase.removeChannel(channel)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, loading])

  async function handleSend() {
    if (!newMsg.trim() || !userId || !clientId) return
    const supabase = createClient()
    const content = newMsg.trim()
    setNewMsg('')

    const optimistic: NoteMessage = {
      id: `temp-${Date.now()}`,
      author_id: userId,
      author_role: 'kunde',
      content,
      is_urgent: false,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])

    const { data, error: sendErr } = await supabase
      .from('care_notes')
      .insert({
        client_id: clientId,
        author_id: userId,
        author_role: 'kunde',
        author_name: authorName,
        category: 'allgemein',
        content,
      })
      .select('id, author_id, author_role, content, is_urgent, created_at')
      .single()

    if (data) {
      setMessages(prev => prev.map(m => m.id === optimistic.id ? (data as NoteMessage) : m))
    } else if (sendErr) {
      console.error('[KundeNachrichten:send] error:', sendErr)
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setError('Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es erneut.')
      setTimeout(() => setError(''), 4000)
    }
  }

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <button onClick={() => router.back()} className="back-btn" type="button">‹</button>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--gold-pale)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconWingsGold size={18} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Alltagsengel</div>
          <div style={{ fontSize: 11, color: 'var(--ink4)' }}>Ihr direkter Draht zu uns</div>
        </div>
      </div>

      {/* Fehler-Banner */}
      {error && !loading && (
        <div style={{
          margin: '10px 20px 0', padding: '8px 12px', borderRadius: 10, fontSize: 12,
          color: 'var(--red-w)', background: 'rgba(208,75,59,.1)', border: '1px solid rgba(208,75,59,.25)',
          flexShrink: 0,
        }}>⚠️ {error}</div>
      )}

      {/* Nachrichten */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--ink4)', padding: '40px 0' }}>Laden...</div>
        ) : !clientId ? (
          /* Fallback: noch kein Klienten-Datensatz vorhanden */
          <div style={{ textAlign: 'center', padding: '50px 10px' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>💬</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
              Nachrichten noch nicht verfügbar
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto 20px' }}>
              Sobald Ihre Betreuung bei uns eingerichtet ist, können Sie hier
              direkt Nachrichten an das Alltagsengel-Team senden. Bis dahin
              erreichen Sie uns jederzeit per E-Mail.
            </p>
            <a href="mailto:info@alltagsengel.care" style={{
              display: 'inline-block', padding: '12px 24px', borderRadius: 12,
              background: 'linear-gradient(135deg, var(--gold), var(--gold2))',
              color: 'var(--coal)', fontSize: 14, fontWeight: 600, textDecoration: 'none',
            }}>✉️ info@alltagsengel.care</a>
            <div style={{ marginTop: 14 }}>
              <Link href="/kunde/chat" style={{ fontSize: 12, color: 'var(--ink4)' }}>
                Zu Ihren Buchungs-Chats ›
              </Link>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--ink4)', padding: '60px 0', fontSize: 13 }}>
            Schreiben Sie uns — wir melden uns schnellstmöglich zurück!
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.author_role === 'kunde' && msg.author_id === userId
            return (
              <div key={msg.id} style={{
                alignSelf: isMe ? 'flex-end' : 'flex-start',
                maxWidth: '75%',
                background: isMe ? 'linear-gradient(135deg, var(--gold), var(--gold2))' : 'var(--white)',
                color: isMe ? 'var(--bg)' : 'var(--ink)',
                padding: '10px 14px',
                borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                fontSize: 14, lineHeight: 1.5,
              }}>
                {!isMe && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold2)', marginBottom: 3 }}>
                    {senderLabel(msg.author_role)}{msg.is_urgent ? ' · Wichtig' : ''}
                  </div>
                )}
                {msg.content}
                <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6, textAlign: 'right' }}>
                  {new Date(msg.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Eingabe */}
      {clientId && !loading && (
        <div style={{
          padding: '12px 20px 28px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, flexShrink: 0,
        }}>
          <input
            value={newMsg}
            onChange={e => setNewMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Nachricht an Alltagsengel..."
            className="input"
            style={{ flex: 1, borderRadius: 24, padding: '12px 16px' }}
          />
          <button onClick={handleSend} style={{
            width: 44, height: 44, borderRadius: '50%',
            background: newMsg.trim() ? 'linear-gradient(135deg, var(--gold), var(--gold2))' : 'var(--white)',
            border: 'none', color: newMsg.trim() ? 'var(--bg)' : 'var(--ink4)',
            fontSize: 18, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>➤</button>
        </div>
      )}
    </div>
  )
}
