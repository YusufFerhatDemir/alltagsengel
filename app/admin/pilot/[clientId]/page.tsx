'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { Banner } from '@/components/admin/OpsUI'
import type { KundenKette, SchrittStand, VoraussetzungErgebnis } from '@/lib/pilot/types'

interface DetailAntwort {
  kette: KundenKette
  voraussetzungen: VoraussetzungErgebnis
}

const STAND_FARBE: Record<SchrittStand, string> = {
  erledigt: '#22c55e',
  laeuft: '#f59e0b',
  offen: '#cbd5e1',
  blockiert: '#ef4444',
  entfaellt: '#e2e8f0',
}

const STAND_TITEL: Record<SchrittStand, string> = {
  erledigt: 'erledigt',
  laeuft: 'läuft',
  offen: 'offen',
  blockiert: 'blockiert',
  entfaellt: 'entfällt',
}

export default function PilotKundePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params)
  const [data, setData] = useState<DetailAntwort | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/pilot/${clientId}`)
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        return j as DetailAntwort
      })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [clientId])

  if (loading) return <div className="admin-page"><p>Lade Kundenkette…</p></div>
  if (error) return <div className="admin-page"><Banner tone="danger">{error}</Banner></div>
  if (!data) return null

  const { kette, voraussetzungen } = data

  return (
    <div className="admin-page">
      <p style={{ marginBottom: 8 }}>
        <Link href="/admin/pilot">← Zurück zur Pilot-Übersicht</Link>
      </p>
      <h1>{kette.name}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
        Abrechnungsweg: <strong>{kette.abrechnungsweg === 'kasse' ? 'Pflegekasse hinterlegt' : 'Selbstzahler'}</strong>
        {' · '}
        Fortschritt: <strong>{kette.fortschritt.erledigt} von {kette.fortschritt.anwendbar}</strong> ({kette.fortschritt.prozent} %)
      </p>

      {!voraussetzungen.echtbetriebFreigegeben && (
        <Banner tone="danger">
          Der Echtbetrieb ist noch gesperrt — offene Pflichtpunkte in der{' '}
          <Link href="/admin/pilot">Betriebs-Checkliste</Link>. Schritte weiter unten in der Kette
          lassen sich erst danach sauber abschliessen.
        </Banner>
      )}

      {kette.vollstaendig && (
        <Banner tone="success">
          Die Kette ist vollständig durchlaufen — von den Stammdaten bis zur DATEV-Übergabe.
        </Banner>
      )}

      <div style={{ marginTop: 24 }}>
        {kette.schritte.map(s => (
          <div
            key={s.id}
            className="admin-card"
            style={{
              marginBottom: 12,
              borderLeft: `4px solid ${STAND_FARBE[s.stand]}`,
              opacity: s.stand === 'entfaellt' ? 0.55 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                {String(s.nr).padStart(2, '0')}
              </span>
              <strong style={{ fontSize: 16 }}>{s.label}</strong>
              <span
                style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 999,
                  background: STAND_FARBE[s.stand],
                  color: s.stand === 'offen' || s.stand === 'entfaellt' ? '#334155' : '#fff',
                }}
              >
                {STAND_TITEL[s.stand]}
              </span>
              {s.wert && (
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>{s.wert}</span>
              )}
            </div>

            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted)' }}>{s.kriterium}</p>

            {s.naechsterSchritt && (
              <p style={{ margin: '8px 0 0', fontSize: 13 }}>
                <strong>Jetzt zu tun:</strong> {s.naechsterSchritt}{' '}
                <Link href={s.aktionHref} style={{ whiteSpace: 'nowrap' }}>Öffnen →</Link>
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
