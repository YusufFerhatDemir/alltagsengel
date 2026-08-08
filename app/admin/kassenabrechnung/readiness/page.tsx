'use client'
import { useEffect, useState } from 'react'
import { Banner } from '@/components/admin/OpsUI'
import Link from 'next/link'

type Ampel = 'gruen' | 'gelb' | 'rot'

interface ReadinessPunkt {
  id: string
  label: string
  ampel: Ampel
  wert: string | null
  hinweis: string | null
  blocker: 'intern' | 'extern' | null
  gruppe: 'organisation' | 'stammdaten' | 'secon' | 'transport' | 'betrieb'
}

interface Readiness {
  organisation: string | null
  ik_nummer: string | null
  gesamt: Ampel
  versandbereit: boolean
  modus: 'produktion' | 'test'
  punkte: ReadinessPunkt[]
  zusammenfassung: { gruen: number; gelb: number; rot: number; gesamt: number }
  offeneBlocker: { intern: string[]; extern: string[] }
  betrieb: {
    letzterLauf: { id: string; status: string; abrechnungsmonat: string; erstellt_am: string } | null
    letzterVersand: { id: string; uebermittelt_am: string } | null
    letzterRuecklaeufer: { id: string; status: string; created_at: string } | null
    letzterPreflight: string | null
    letzterDryRun: string | null
    offeneAufgaben: number
    offeneFehler: number
  }
}

const AMPEL_FARBE: Record<Ampel, string> = {
  gruen: '#22c55e',
  gelb: '#f59e0b',
  rot: '#ef4444',
}

const AMPEL_TEXT: Record<Ampel, string> = {
  gruen: 'erfüllt',
  gelb: 'teilweise',
  rot: 'blockiert',
}

const GRUPPEN: { id: ReadinessPunkt['gruppe']; titel: string }[] = [
  { id: 'organisation', titel: 'Organisation & Freischaltung' },
  { id: 'stammdaten', titel: 'Stammdaten' },
  { id: 'secon', titel: 'SECON / Zertifikate' },
  { id: 'transport', titel: 'Übertragung' },
  { id: 'betrieb', titel: 'Betrieb' },
]

function datum(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ReadinessPage() {
  const [data, setData] = useState<Readiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/billing/dta/readiness')
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        return j
      })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return <div className="admin-page"><p>Lade Bereitschaftsstatus…</p></div>
  if (error) return <div className="admin-page"><Banner tone="danger">{error}</Banner></div>
  if (!data) return null

  return (
    <div className="admin-page">
      <h1>Kassenabrechnung — Bereitschaft</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
        {data.organisation ?? 'Organisation'}{data.ik_nummer ? ` · IK ${data.ik_nummer}` : ''} ·
        Modus: <strong>{data.modus === 'produktion' ? 'Produktion' : 'Test'}</strong>
      </p>

      <Banner tone={data.gesamt === 'gruen' ? 'success' : data.gesamt === 'gelb' ? 'warn' : 'danger'}>
        {data.versandbereit
          ? 'Alle Voraussetzungen erfüllt — echter Kassenversand ist möglich.'
          : `Kein Echtversand möglich: ${data.zusammenfassung.rot} blockiert, ${data.zusammenfassung.gelb} teilweise erfüllt.`}
      </Banner>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, margin: '24px 0' }}>
        <KPI label="Erfüllt" value={data.zusammenfassung.gruen} color={AMPEL_FARBE.gruen} />
        <KPI label="Teilweise" value={data.zusammenfassung.gelb} color={AMPEL_FARBE.gelb} />
        <KPI label="Blockiert" value={data.zusammenfassung.rot} color={AMPEL_FARBE.rot} />
        <KPI label="Offene Aufgaben" value={data.betrieb.offeneAufgaben} />
        <KPI label="Offene Fehler" value={data.betrieb.offeneFehler} />
      </div>

      {(data.offeneBlocker.extern.length > 0 || data.offeneBlocker.intern.length > 0) && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <h3>Offene Sperren</h3>
          {data.offeneBlocker.extern.length > 0 && (
            <p style={{ marginBottom: 8 }}>
              <strong>Extern zu beschaffen ({data.offeneBlocker.extern.length}):</strong>{' '}
              {data.offeneBlocker.extern.join(' · ')}
            </p>
          )}
          {data.offeneBlocker.intern.length > 0 && (
            <p>
              <strong>Intern lösbar ({data.offeneBlocker.intern.length}):</strong>{' '}
              {data.offeneBlocker.intern.join(' · ')}
            </p>
          )}
        </div>
      )}

      {GRUPPEN.map(gruppe => {
        const punkte = data.punkte.filter(p => p.gruppe === gruppe.id)
        if (punkte.length === 0) return null
        return (
          <div className="admin-card" key={gruppe.id} style={{ marginBottom: 20 }}>
            <h3>{gruppe.titel}</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {punkte.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
                    <td style={{ padding: '10px 8px 10px 0', width: 28 }}>
                      <span
                        aria-label={AMPEL_TEXT[p.ampel]}
                        title={AMPEL_TEXT[p.ampel]}
                        style={{
                          display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                          background: AMPEL_FARBE[p.ampel],
                        }}
                      />
                    </td>
                    <td style={{ padding: '10px 8px', fontWeight: 500 }}>{p.label}</td>
                    <td style={{ padding: '10px 8px', color: 'var(--muted)' }}>{p.wert ?? '—'}</td>
                    <td style={{ padding: '10px 0', color: 'var(--muted)', fontSize: 13 }}>
                      {p.hinweis}
                      {p.blocker === 'extern' && (
                        <span style={{ marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e' }}>
                          EXTERN
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}

      <div className="admin-card">
        <h3>Letzte Aktivität</h3>
        <ul style={{ lineHeight: 1.9, margin: 0, paddingLeft: 18 }}>
          <li>Letzter Preflight: {datum(data.betrieb.letzterPreflight)}</li>
          <li>Letzter Dry-Run: {datum(data.betrieb.letzterDryRun)}</li>
          <li>
            Letzter Lauf:{' '}
            {data.betrieb.letzterLauf
              ? <Link href={`/admin/dta/laeufe/${data.betrieb.letzterLauf.id}`}>
                  {data.betrieb.letzterLauf.abrechnungsmonat} — {data.betrieb.letzterLauf.status}
                </Link>
              : '—'}
          </li>
          <li>Letzter Versand: {datum(data.betrieb.letzterVersand?.uebermittelt_am)}</li>
          <li>
            Letzter Rückläufer:{' '}
            {data.betrieb.letzterRuecklaeufer
              ? `${data.betrieb.letzterRuecklaeufer.status} — ${datum(data.betrieb.letzterRuecklaeufer.created_at)}`
              : '—'}
          </li>
        </ul>
      </div>

      <p style={{ marginTop: 20 }}>
        <Link href="/admin/kassenabrechnung">← Zurück zur Kassenabrechnung</Link>
      </p>
    </div>
  )
}

function KPI({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="admin-card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? 'inherit' }}>{value}</div>
      <div style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</div>
    </div>
  )
}
