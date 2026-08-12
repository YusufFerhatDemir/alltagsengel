'use client'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { Banner, EmptyRow } from '@/components/admin/OpsUI'

interface SyncKonflikt {
  id: string
  organization_id: string
  user_id: string
  queue_item_id: string
  idempotency_key: string
  entity_typ: string
  entity_id: string | null
  lokale_daten: Record<string, unknown>
  server_daten: Record<string, unknown> | null
  strategie: string
  status: string
  erstellt_am: string
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
}
const primaryBtn: React.CSSProperties = {
  fontSize: 13, color: '#fff', fontWeight: 600,
  background: 'var(--gold2, #C9A24B)', border: 'none',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
}
const dangerBtn: React.CSSProperties = {
  ...secondaryBtn, color: '#D04B3B', borderColor: 'rgba(208,75,59,.35)',
}

function ENTITY_LABEL(typ: string): string {
  const labels: Record<string, string> = {
    leistungsnachweis: 'Leistungsnachweis',
    pflegebericht: 'Pflegebericht (Verlauf)',
    signatur: 'Signatur',
    medikament_eingabe: 'Medikamenteneingabe',
    vitalwerte: 'Vitalwerte',
    wunddoku: 'Wunddokumentation',
    pflege_anamnese: 'Anamnese',
    pflege_aufnahme: 'Aufnahme',
    pflege_diagnose: 'Diagnose',
    pflege_massnahme: 'Maßnahme',
    pflege_massnahmenplan: 'Maßnahmenplan',
    pflege_risiko: 'Risiko',
  }
  return labels[typ] ?? typ
}

export default function SyncKonfliktePage() {
  const [konflikte, setKonflikte] = useState<SyncKonflikt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/sync-konflikte')
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Unbekannter Fehler'); return }
      setKonflikte(json.konflikte)
    } catch (err: any) {
      setError(err.message || 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const resolve = async (id: string, resolution: 'lokal' | 'server' | 'verwerfen') => {
    setResolving(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/sync-konflikte/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Auflösung fehlgeschlagen.'); return }
      setKonflikte(prev => prev.filter(k => k.id !== id))
    } catch (err: any) {
      setError(err.message || 'Unbekannter Fehler')
    } finally {
      setResolving(null)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Sync-Konflikte</h1>
          <p className="admin-subtitle">
            Offene Konflikte aus der bidirektionalen Sync-Konfliktlösung (Block 20) —
            Konfliktstrategie „manuell": Server- und Client-Stand weichen voneinander ab,
            eine Entscheidung ist erforderlich.
          </p>
        </div>
        <button style={secondaryBtn} onClick={load} disabled={loading}>
          {loading ? 'Lädt…' : 'Aktualisieren'}
        </button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Typ</th>
              <th>Entity-ID</th>
              <th>Erkannt am</th>
              <th>Details</th>
              <th style={{ textAlign: 'right' }}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {!loading && konflikte.length === 0 && (
              <EmptyRow colSpan={5}>Keine offenen Konflikte.</EmptyRow>
            )}
            {konflikte.map(k => (
              <Fragment key={k.id}>
                <tr>
                  <td>{ENTITY_LABEL(k.entity_typ)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{k.entity_id ?? '—'}</td>
                  <td>{new Date(k.erstellt_am).toLocaleString('de-DE')}</td>
                  <td>
                    <button
                      style={secondaryBtn}
                      onClick={() => setExpanded(expanded === k.id ? null : k.id)}
                    >
                      {expanded === k.id ? 'Ausblenden' : 'Vergleichen'}
                    </button>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', gap: 8 }}>
                      <button
                        style={primaryBtn}
                        disabled={resolving === k.id}
                        onClick={() => resolve(k.id, 'lokal')}
                        title="Lokale (Client-)Änderung jetzt anwenden"
                      >
                        Lokal übernehmen
                      </button>
                      <button
                        style={secondaryBtn}
                        disabled={resolving === k.id}
                        onClick={() => resolve(k.id, 'server')}
                        title="Server-Stand behalten, lokale Änderung verwerfen"
                      >
                        Server behalten
                      </button>
                      <button
                        style={dangerBtn}
                        disabled={resolving === k.id}
                        onClick={() => resolve(k.id, 'verwerfen')}
                        title="Konflikt ohne Anwendung schließen"
                      >
                        Verwerfen
                      </button>
                    </div>
                  </td>
                </tr>
                {expanded === k.id && (
                  <tr>
                    <td colSpan={5} style={{ background: 'var(--coal2)' }}>
                      <div style={{ display: 'flex', gap: 16, padding: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 280 }}>
                          <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 6 }}>Lokale Daten (Gerät)</div>
                          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                            {JSON.stringify(k.lokale_daten, null, 2)}
                          </pre>
                        </div>
                        <div style={{ flex: 1, minWidth: 280 }}>
                          <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 6 }}>Server-Daten (bei Erkennung)</div>
                          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                            {k.server_daten ? JSON.stringify(k.server_daten, null, 2) : '—'}
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
