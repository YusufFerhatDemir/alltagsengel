'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  statusMeta, formatDate, timeAgo,
  NACHRICHTEN_KATEGORIE, NACHRICHTEN_PRIORITAET,
} from '@/lib/admin/ops'
import { StatusBadge, Banner } from '@/components/admin/OpsUI'

interface Nachricht {
  id: string
  betreff: string
  inhalt: string | null
  absender_name: string | null
  absender_id: string | null
  kategorie: string | null
  prioritaet: string
  gelesen: boolean
  parent_id: string | null
  created_at: string | null
}

interface Reply {
  id: string
  inhalt: string | null
  absender_name: string | null
  created_at: string | null
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
  textDecoration: 'none', display: 'inline-block',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal3)', color: 'var(--ink)', fontSize: 14,
  fontFamily: "'Jost',sans-serif", boxSizing: 'border-box',
}

export default function NachrichtDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [msg, setMsg] = useState<Nachricht | null>(null)
  const [replies, setReplies] = useState<Reply[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  async function load() {
    try {
      const res = await fetch(`/api/ops/nachrichten/${id}`)
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setMsg(data.nachricht || data)
      setReplies(data.replies || [])

      // Mark as read
      const n = data.nachricht || data
      if (n && !n.gelesen) {
        fetch(`/api/ops/nachrichten/${id}/gelesen`, {
          method: 'PATCH',
        }).catch(() => {})
      }
    } catch (err) {
      console.error('Fehler beim Laden der Nachricht:', err)
      setError('Netzwerkfehler beim Laden der Nachricht.')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  async function sendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyText.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/ops/nachrichten/${id}/antworten`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          betreff: `Re: ${msg?.betreff ?? ''}`,
          inhalt: replyText.trim(),
        }),
      })
      if (!res.ok) {
        setError('Fehler beim Senden der Antwort')
        setSending(false)
        return
      }
      setReplyText('')
      load()
    } catch {
      setError('Netzwerkfehler')
    } finally { setSending(false) }
  }

  if (loading) return <div className="admin-page"><p>Laden...</p></div>
  if (!msg) return <div className="admin-page"><p>Nachricht nicht gefunden</p></div>

  const kat = statusMeta(NACHRICHTEN_KATEGORIE, msg.kategorie)
  const prio = statusMeta(NACHRICHTEN_PRIORITAET, msg.prioritaet)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>{msg.betreff}</h1>
          <p className="admin-subtitle">
            Von {msg.absender_name || '—'} &middot; {timeAgo(msg.created_at)}
          </p>
        </div>
        <Link href="/admin/nachrichten" style={secondaryBtn}>Zurück</Link>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{
        background: 'var(--coal2)', borderRadius: 12, padding: 20,
        border: '1px solid var(--border)', marginBottom: 24,
      }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          {msg.kategorie && <StatusBadge label={kat.label} color={kat.color} />}
          <StatusBadge label={prio.label} color={prio.color} />
          {msg.gelesen
            ? <span style={{ fontSize: 12, color: 'var(--ink4)' }}>Gelesen</span>
            : <span style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>Ungelesen</span>}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
          {msg.inhalt || 'Kein Inhalt'}
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink4)' }}>
          {formatDate(msg.created_at)}
        </div>
      </div>

      {/* Thread / Replies */}
      {replies.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Antworten ({replies.length})</h2>
          {replies.map(r => (
            <div key={r.id} style={{
              background: 'var(--coal3)', borderRadius: 10, padding: 14,
              border: '1px solid var(--border)', marginBottom: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.absender_name || '—'}</span>
                <span style={{ fontSize: 12, color: 'var(--ink4)' }}>{timeAgo(r.created_at)}</span>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {r.inhalt || '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply Form */}
      <div style={{
        background: 'var(--coal2)', borderRadius: 12, padding: 16,
        border: '1px solid var(--border)',
      }}>
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Antworten</h3>
        <form onSubmit={sendReply}>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: 'vertical', marginBottom: 10 }}
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder="Antwort schreiben..."
          />
          <button type="submit" style={primaryBtn} disabled={sending || !replyText.trim()}>
            {sending ? 'Sende...' : 'Antwort senden'}
          </button>
        </form>
      </div>
    </div>
  )
}
