'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { requireUser } from '@/lib/supabase/require-session'
import { IconBell, IconCheck } from '@/components/Icons'

const TYP_META: Record<string, { label: string; color: string }> = {
  info: { label: 'Info', color: '#2196F3' },
  warnung: { label: 'Warnung', color: '#FF9800' },
  fehler: { label: 'Fehler', color: '#D04B3B' },
  erfolg: { label: 'Erfolg', color: '#5CB882' },
  erinnerung: { label: 'Erinnerung', color: '#9C27B0' },
  eskalation: { label: 'Eskalation', color: '#D04B3B' },
}

const KAT_LABELS: Record<string, string> = {
  dienstplan: 'Dienstplan', einsatz: 'Einsatz', urlaub: 'Urlaub',
  qualifikation: 'Qualifikation', dokument: 'Dokument', abrechnung: 'Abrechnung',
  aufgabe: 'Aufgabe', pflege: 'Pflege', personal: 'Personal', system: 'System',
  kommunikation: 'Kommunikation', wiedervorlage: 'Wiedervorlage', eskalation: 'Eskalation',
}

interface Benachrichtigung {
  id: string
  titel: string
  inhalt: string | null
  typ: string
  kategorie: string
  gelesen: boolean
  link: string | null
  created_at: string
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
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })
}

export default function EngelBenachrichtigungenPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState<Benachrichtigung[]>([])
  const [marking, setMarking] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const user = await requireUser(router, { redirectTo: '/engel/benachrichtigungen' })
      if (!user) { setLoading(false); return }

      const res = await fetch('/api/ops/benachrichtigungen?limit=50')
      if (!res.ok) {
        const r = await res.json()
        throw new Error(r.error || 'Fehler beim Laden')
      }
      const data = await res.json()
      setItems((data || []) as Benachrichtigung[])
    } catch (e: any) {
      console.error('Benachrichtigungen load error:', e)
      setError('Fehler beim Laden der Benachrichtigungen')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { load() }, [load])

  const markAsRead = async (ids: string[]) => {
    if (ids.length === 0) return
    setMarking(true)
    try {
      const res = await fetch('/api/ops/benachrichtigungen/gelesen', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error('Fehler')
      setItems(prev => prev.map(b => ids.includes(b.id) ? { ...b, gelesen: true } : b))
    } catch { /* ignore */ }
    finally { setMarking(false) }
  }

  const markAllRead = () => {
    const unreadIds = items.filter(b => !b.gelesen).map(b => b.id)
    markAsRead(unreadIds)
  }

  const handleClick = (b: Benachrichtigung) => {
    if (!b.gelesen) markAsRead([b.id])
    if (b.link) router.push(b.link)
  }

  const unreadCount = items.filter(b => !b.gelesen).length

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)' }}>
        <div style={{ fontSize: 14 }}>Lade Benachrichtigungen...</div>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 2, fontFamily: "'Cormorant Garamond', serif" }}>
            Benachrichtigungen
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ink4)', margin: 0 }}>
            {unreadCount > 0 ? `${unreadCount} ungelesen` : 'Alles gelesen'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={marking}
            style={{
              padding: '8px 14px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              background: 'var(--coal2)', color: 'var(--gold2)',
              border: '1px solid var(--border)', borderRadius: 8,
              cursor: 'pointer', whiteSpace: 'nowrap',
              opacity: marking ? 0.5 : 1,
            }}
          >
            <IconCheck size={12} /> Alle gelesen
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <IconBell size={28} color="var(--ink4)" />
          <div style={{ fontSize: 14, color: 'var(--ink4)', marginTop: 8 }}>Keine Benachrichtigungen</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(b => {
            const tm = TYP_META[b.typ] || { label: b.typ, color: '#999' }
            const isEskalation = b.typ === 'eskalation' || b.typ === 'fehler'

            return (
              <div
                key={b.id}
                onClick={() => handleClick(b)}
                style={{
                  background: 'var(--coal2)',
                  border: `1px solid ${isEskalation && !b.gelesen ? 'rgba(208,75,59,0.4)' : 'var(--border)'}`,
                  borderRadius: 12,
                  padding: '12px 14px',
                  cursor: b.link ? 'pointer' : 'default',
                  borderLeft: !b.gelesen ? '3px solid var(--gold2)' : undefined,
                  opacity: b.gelesen ? 0.7 : 1,
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: b.gelesen ? 400 : 700,
                      color: 'var(--ink)',
                      lineHeight: 1.3,
                    }}>
                      {b.titel}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--ink4)', marginLeft: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {timeAgo(b.created_at)}
                  </span>
                </div>

                {/* Badges */}
                <div style={{ display: 'flex', gap: 6, marginBottom: b.inhalt ? 6 : 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: tm.color, background: `${tm.color}18`, padding: '1px 6px', borderRadius: 4 }}>
                    {tm.label}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--ink4)', background: 'var(--coal3)', padding: '1px 6px', borderRadius: 4 }}>
                    {KAT_LABELS[b.kategorie] || b.kategorie}
                  </span>
                </div>

                {/* Content */}
                {b.inhalt && (
                  <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.4, marginTop: 4 }}>
                    {b.inhalt}
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
