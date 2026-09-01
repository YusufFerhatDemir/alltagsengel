'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { requireUser } from '@/lib/supabase/require-session'
import { IconChat, IconCheck, IconShield } from '@/components/Icons'
import type { AngehoerigenNachricht } from '@/lib/angehoerige/types'

interface NachrichtMitClient extends AngehoerigenNachricht {
  client_name: string
}

interface ZugangOption {
  id: string
  client_id: string
  client_name: string
  rolle: string
}

export default function KommunikationPage() {
  const router = useRouter()
  const [nachrichten, setNachrichten] = useState<NachrichtMitClient[]>([])
  const [zugaenge, setZugaenge] = useState<ZugangOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCompose, setShowCompose] = useState(false)
  const [sendingMsg, setSendingMsg] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendSuccess, setSendSuccess] = useState(false)
  const [selectedZugang, setSelectedZugang] = useState('')
  const [betreff, setBetreff] = useState('')
  const [inhalt, setInhalt] = useState('')
  const formRef = useRef<HTMLDivElement>(null)

  async function load() {
    setError('')
    setLoading(true)
    try {
      const user = await requireUser(router, { redirectTo: '/angehoerige/kommunikation' })
      if (!user) return

      // Zugänge + Nachrichten parallel laden
      const [portalRes, nachrichtenRes] = await Promise.all([
        fetch('/api/angehoerige/portal'),
        fetch('/api/angehoerige/portal/kommunikation'),
      ])

      if (portalRes.ok) {
        const portalData = await portalRes.json()
        setZugaenge((portalData.zugaenge ?? []).map((z: any) => ({
          id: z.id,
          client_id: z.client_id,
          client_name: z.client_name,
          rolle: z.rolle,
        })))
      }

      if (!nachrichtenRes.ok) {
        const err = await nachrichtenRes.json().catch(() => ({}))
        throw new Error(err.error || 'Nachrichten konnten nicht geladen werden.')
      }

      const nachrichtenData = await nachrichtenRes.json()
      setNachrichten(nachrichtenData.nachrichten ?? [])
    } catch (err: any) {
      setError(err?.message || 'Ein Fehler ist aufgetreten.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedZugang || !betreff.trim() || !inhalt.trim()) return

    setSendError('')
    setSendingMsg(true)
    try {
      const res = await fetch('/api/angehoerige/portal/kommunikation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zugang_id: selectedZugang,
          betreff: betreff.trim(),
          inhalt: inhalt.trim(),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Nachricht konnte nicht gesendet werden.')
      }

      setSendSuccess(true)
      setBetreff('')
      setInhalt('')
      setShowCompose(false)
      setTimeout(() => setSendSuccess(false), 3000)
      load() // Nachrichten neu laden
    } catch (err: any) {
      setSendError(err?.message || 'Ein Fehler ist aufgetreten.')
    } finally {
      setSendingMsg(false)
    }
  }

  if (loading) {
    return (
      <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="gold-spinner" />
          <p style={{ color: 'var(--ink4)', fontSize: 13, marginTop: 16 }}>Nachrichten werden geladen...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
        <IconShield size={48} color="var(--gold)" />
        <p style={{ color: 'var(--ink4)', fontSize: 14, marginTop: 12 }}>{error}</p>
        <button
          onClick={() => { setError(''); load() }}
          style={{ marginTop: 16, padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,var(--gold),var(--gold2))', color: 'var(--coal)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Erneut versuchen
        </button>
      </div>
    )
  }

  return (
    <div className="screen">
      <div style={{ padding: '24px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Nachrichten</h1>
          <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '4px 0 0' }}>
            Kommunikation mit dem Pflegeteam
          </p>
        </div>
        {zugaenge.length > 0 && (
          <button
            onClick={() => {
              setShowCompose(!showCompose)
              if (!selectedZugang && zugaenge.length === 1) {
                setSelectedZugang(zugaenge[0].id)
              }
              setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
            }}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: showCompose ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,var(--gold),var(--gold2))',
              color: showCompose ? 'var(--ink3)' : 'var(--coal)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {showCompose ? 'Abbrechen' : 'Neue Nachricht'}
          </button>
        )}
      </div>

      <div style={{ padding: '0 20px 100px' }}>
        {/* Erfolgs-Banner */}
        {sendSuccess && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 16,
            background: 'rgba(92,184,130,0.1)', border: '1px solid rgba(92,184,130,0.2)',
            display: 'flex', alignItems: 'center', gap: 8,
            color: 'var(--green)', fontSize: 13, fontWeight: 600,
          }}>
            <IconCheck size={16} />
            Nachricht wurde gesendet.
          </div>
        )}

        {/* Neue Nachricht Form */}
        {showCompose && (
          <div ref={formRef} style={{
            padding: 16, borderRadius: 12, marginBottom: 20,
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '0 0 12px' }}>
              Neue Nachricht
            </h3>

            <form onSubmit={handleSend}>
              {zugaenge.length > 1 && (
                <div style={{ marginBottom: 12 }}>
                  <label htmlFor="kommunikation-betrifft" style={{ fontSize: 12, color: 'var(--ink4)', display: 'block', marginBottom: 4 }}>
                    Betrifft
                  </label>
                  <select
                    id="kommunikation-betrifft"
                    value={selectedZugang}
                    onChange={e => setSelectedZugang(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)',
                      color: 'var(--ink)', fontSize: 14,
                    }}
                  >
                    <option value="">Klient auswählen...</option>
                    {zugaenge.map(z => (
                      <option key={z.id} value={z.id}>{z.client_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <label htmlFor="kommunikation-betreff" style={{ fontSize: 12, color: 'var(--ink4)', display: 'block', marginBottom: 4 }}>
                  Betreff
                </label>
                <input
                  id="kommunikation-betreff"
                  type="text"
                  value={betreff}
                  onChange={e => setBetreff(e.target.value)}
                  placeholder="Betreff eingeben..."
                  required
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)',
                    color: 'var(--ink)', fontSize: 14, boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label htmlFor="kommunikation-nachricht" style={{ fontSize: 12, color: 'var(--ink4)', display: 'block', marginBottom: 4 }}>
                  Nachricht
                </label>
                <textarea
                  id="kommunikation-nachricht"
                  value={inhalt}
                  onChange={e => setInhalt(e.target.value)}
                  placeholder="Ihre Nachricht..."
                  required
                  rows={4}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)',
                    color: 'var(--ink)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {sendError && (
                <div style={{ color: 'var(--red-w)', fontSize: 13, marginBottom: 12 }}>
                  {sendError}
                </div>
              )}

              <button
                type="submit"
                disabled={sendingMsg || !selectedZugang || !betreff.trim() || !inhalt.trim()}
                style={{
                  padding: '10px 24px', borderRadius: 8, border: 'none',
                  background: 'linear-gradient(135deg,var(--gold),var(--gold2))',
                  color: 'var(--coal)', fontSize: 13, fontWeight: 600,
                  cursor: sendingMsg ? 'wait' : 'pointer',
                  opacity: sendingMsg ? 0.6 : 1,
                }}
              >
                {sendingMsg ? 'Wird gesendet...' : 'Senden'}
              </button>
            </form>
          </div>
        )}

        {/* Nachrichten-Liste */}
        {nachrichten.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <IconChat size={48} color="var(--ink4)" />
            <p style={{ color: 'var(--ink4)', fontSize: 14, marginTop: 12 }}>
              Noch keine Nachrichten vorhanden.
            </p>
          </div>
        ) : (
          nachrichten.map(n => {
            const isOwn = n.absender_typ === 'angehoeriger'
            return (
              <div
                key={n.id}
                className="portal-list-item"
                style={{
                  borderLeft: `3px solid ${isOwn ? 'var(--gold)' : 'var(--green)'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink4)', fontWeight: 600 }}>
                    {isOwn ? 'Sie' : 'Pflegeteam'}
                    <span style={{ fontWeight: 400 }}> • {n.client_name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink4)' }}>
                    {new Date(n.created_at).toLocaleDateString('de-DE')}
                    {' '}
                    {new Date(n.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
                  {n.betreff}
                </div>

                <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {n.inhalt}
                </div>

                {!isOwn && n.status === 'gesendet' && (
                  <span style={{
                    display: 'inline-block', marginTop: 8,
                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                    background: 'rgba(201,150,60,0.1)', color: 'var(--gold2)', fontWeight: 600,
                  }}>
                    Neu
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
