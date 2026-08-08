'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import { IconChat } from '@/components/Icons'

interface Nachricht {
  nachricht_id: string
  betreff: string
  inhalt: string
  absender_id: string
  absender_name: string
  prioritaet: string
  kategorie: string
  gelesen: boolean
  created_at: string
  antworten_anzahl: number
  empfaenger_id: string
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Gerade eben'
  if (diffMin < 60) return `vor ${diffMin} Min.`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `vor ${diffH} Std.`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'Gestern'
  if (diffD < 7) return `vor ${diffD} Tagen`
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

export default function EngelNachrichtenPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nachrichten, setNachrichten] = useState<Nachricht[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const user = await requireUser(router, { redirectTo: '/engel/nachrichten' })
      if (!user) { setLoading(false); return }
      setUserId(user.id)

      const res = await fetch('/api/ops/nachrichten')
      if (!res.ok) {
        const r = await res.json()
        throw new Error(r.error || 'Fehler beim Laden')
      }
      const data = await res.json()
      setNachrichten((data || []) as Nachricht[])
    } catch (e: any) {
      console.error('Nachrichten load error:', e)
      setError('Fehler beim Laden der Nachrichten')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { load() }, [load])

  const markAsRead = async (nachrichtId: string) => {
    try {
      await fetch(`/api/ops/nachrichten/${nachrichtId}/gelesen`, { method: 'PATCH' })
      setNachrichten(prev =>
        prev.map(n => n.nachricht_id === nachrichtId ? { ...n, gelesen: true } : n)
      )
    } catch { /* ignore */ }
  }

  const handleExpand = (nachrichtId: string) => {
    const isExpanding = expandedId !== nachrichtId
    setExpandedId(isExpanding ? nachrichtId : null)
    setReplyText('')
    if (isExpanding) {
      const msg = nachrichten.find(n => n.nachricht_id === nachrichtId)
      if (msg && !msg.gelesen) {
        markAsRead(nachrichtId)
      }
    }
  }

  const sendReply = async (nachrichtId: string) => {
    if (!replyText.trim() || !userId) return
    setSending(true)
    try {
      const original = nachrichten.find(n => n.nachricht_id === nachrichtId)
      const res = await fetch(`/api/ops/nachrichten/${nachrichtId}/antworten`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          betreff: `Re: ${original?.betreff || ''}`,
          inhalt: replyText.trim(),
          empfaenger_ids: original ? [original.absender_id] : [],
        }),
      })
      if (!res.ok) {
        const r = await res.json()
        throw new Error(r.error || 'Fehler beim Senden')
      }
      setReplyText('')
      await load()
    } catch (e: any) {
      console.error('Reply error:', e)
    } finally {
      setSending(false)
    }
  }

  const unreadCount = nachrichten.filter(n => !n.gelesen).length

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)' }}>
        <div style={{ fontSize: 14 }}>Lade Nachrichten...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>!</div>
        <p style={{ color: 'var(--ink3)', fontSize: 14, marginBottom: 16 }}>{error}</p>
        <button onClick={load} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--gold), var(--gold2))', color: 'var(--coal)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Erneut versuchen
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, fontFamily: "'Cormorant Garamond', serif" }}>
        Posteingang
      </h1>
      <p style={{ fontSize: 13, color: 'var(--ink4)', marginBottom: 16 }}>
        {unreadCount > 0 ? `${unreadCount} ungelesene Nachricht${unreadCount !== 1 ? 'en' : ''}` : 'Alle Nachrichten gelesen'}
      </p>

      {nachrichten.length === 0 ? (
        <div style={{ background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <IconChat size={28} color="var(--ink4)" />
          <div style={{ fontSize: 14, color: 'var(--ink4)', marginTop: 8 }}>Keine Nachrichten vorhanden</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {nachrichten.map(n => {
            const isExpanded = expandedId === n.nachricht_id
            const isDringend = n.prioritaet === 'dringend'

            return (
              <div
                key={n.nachricht_id}
                style={{
                  background: 'var(--coal2)',
                  border: `1px solid ${isDringend && !n.gelesen ? 'rgba(208,75,59,0.4)' : 'var(--border)'}`,
                  borderRadius: 14,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  borderLeft: !n.gelesen ? '3px solid var(--gold2)' : undefined,
                }}
                onClick={() => handleExpand(n.nachricht_id)}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 15,
                      fontWeight: n.gelesen ? 400 : 700,
                      color: 'var(--ink)',
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: isExpanded ? 'normal' : 'nowrap',
                    }}>
                      {n.betreff}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--ink4)', marginLeft: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {timeAgo(n.created_at)}
                  </span>
                </div>

                {/* Sender + badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    {n.absender_name}
                  </span>
                  {isDringend && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#D04B3B', background: 'rgba(208,75,59,0.1)', padding: '1px 6px', borderRadius: 4 }}>
                      Dringend
                    </span>
                  )}
                  {n.antworten_anzahl > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--ink4)', background: 'var(--coal3)', padding: '1px 6px', borderRadius: 4 }}>
                      {n.antworten_anzahl} Antwort{n.antworten_anzahl !== 1 ? 'en' : ''}
                    </span>
                  )}
                </div>

                {/* Preview (collapsed) */}
                {!isExpanded && (
                  <div style={{
                    fontSize: 13, color: 'var(--ink4)', lineHeight: 1.4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {n.inhalt}
                  </div>
                )}

                {/* Full content (expanded) */}
                {isExpanded && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{
                      fontSize: 14, color: 'var(--ink2)', lineHeight: 1.6,
                      background: 'var(--coal3)', borderRadius: 10, padding: 14,
                      marginBottom: 12, whiteSpace: 'pre-wrap',
                    }}>
                      {n.inhalt}
                    </div>

                    {/* Reply form */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder="Antwort schreiben..."
                        rows={2}
                        onClick={e => e.stopPropagation()}
                        style={{
                          flex: 1, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10,
                          fontSize: 13, background: 'var(--coal)', color: 'var(--ink)', fontFamily: "'Jost', sans-serif",
                          outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                      <button
                        onClick={e => { e.stopPropagation(); sendReply(n.nachricht_id) }}
                        disabled={sending || !replyText.trim()}
                        style={{
                          padding: '8px 20px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                          background: replyText.trim() ? 'linear-gradient(135deg, var(--gold2), var(--gold))' : 'var(--coal3)',
                          color: replyText.trim() ? 'var(--coal)' : 'var(--ink4)',
                          border: 'none', borderRadius: 10, cursor: replyText.trim() ? 'pointer' : 'default',
                          opacity: sending ? 0.5 : 1,
                        }}
                      >
                        {sending ? 'Senden...' : 'Antworten'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
