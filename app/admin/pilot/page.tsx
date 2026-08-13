'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Banner } from '@/components/admin/OpsUI'
import type {
  Ampel,
  KundenKette,
  SchrittDefinition,
  SchrittStand,
  VoraussetzungErgebnis,
  VoraussetzungPunkt,
} from '@/lib/pilot/types'
import { VORAUSSETZUNG_GRUPPEN } from '@/lib/pilot/types'

interface PilotAntwort {
  voraussetzungen: VoraussetzungErgebnis
  ketten: KundenKette[]
  schritte: SchrittDefinition[]
  gekappt: boolean
}

const AMPEL_FARBE: Record<Ampel, string> = {
  gruen: '#22c55e',
  gelb: '#f59e0b',
  rot: '#ef4444',
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

export default function PilotPage() {
  const [data, setData] = useState<PilotAntwort | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/pilot')
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        return j as PilotAntwort
      })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return <div className="admin-page"><p>Lade Pilot-Status…</p></div>
  if (error) return <div className="admin-page"><Banner tone="danger">{error}</Banner></div>
  if (!data) return null

  const v = data.voraussetzungen
  const pflichtOffen = v.punkte.filter(p => p.pflicht && p.ampel === 'rot')

  // Tabellen, die für mindestens einen Kunden nicht lesbar waren. Ohne diesen
  // Hinweis sähe ein defekter Select aus wie ein Kunde, bei dem noch nichts
  // passiert ist — die Seite würde ihren eigenen Defekt verdecken.
  const datenfehler = [...new Set(data.ketten.flatMap(k => k.datenfehler ?? []))]

  return (
    <div className="admin-page">
      <h1>Pilot — kontrollierter Echtbetrieb</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24, maxWidth: 760 }}>
        Diese Seite beantwortet zwei Fragen getrennt: <strong>Darf</strong> heute ein echter Kunde
        abgerechnet werden (Betriebs-Checkliste), und <strong>wie weit</strong> ist jeder Kunde auf dem
        Weg vom Stammdatensatz bis in die Buchhaltung (Kundenketten).
      </p>

      <Banner tone={v.echtbetriebFreigegeben ? 'success' : 'danger'}>
        {v.echtbetriebFreigegeben
          ? 'Alle Pflichtpunkte erfüllt — ein echter Kunde kann vollständig bearbeitet und abgerechnet werden.'
          : `Echtbetrieb gesperrt: ${pflichtOffen.length} Pflichtpunkt(e) offen — ${pflichtOffen.map(p => p.label).join(', ')}.`}
      </Banner>

      {datenfehler.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Banner tone="danger">
            <strong>Kettenstand teilweise nicht ermittelbar.</strong> Die folgenden Tabellen liessen
            sich nicht lesen. Die betroffenen Schritte stehen auf „blockiert" — das ist ein
            technischer Defekt und NICHT als „noch nichts passiert" zu lesen:
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {datenfehler.map(f => <li key={f}><code>{f}</code></li>)}
            </ul>
          </Banner>
        </div>
      )}

      {v.gesperrteWege.length > 0 && (
        <div className="admin-card" style={{ marginTop: 20, borderLeft: '4px solid #f59e0b' }}>
          <h3>Bewusst gesperrte Wege</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -4, marginBottom: 12 }}>
            Diese Wege sind abgeschaltet, weil externe Voraussetzungen fehlen. Sie blockieren den
            Pilotbetrieb nicht — die Kette läuft als Selbstzahler-Betrieb vollständig durch.
          </p>
          <ul style={{ lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
            {v.gesperrteWege.map(w => (
              <li key={w.weg}>
                <strong>{w.weg}</strong> — {w.grund}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, margin: '24px 0' }}>
        <KPI label="Erfüllt" value={v.zusammenfassung.gruen} color={AMPEL_FARBE.gruen} />
        <KPI label="Teilweise" value={v.zusammenfassung.gelb} color={AMPEL_FARBE.gelb} />
        <KPI label="Blockiert" value={v.zusammenfassung.rot} color={AMPEL_FARBE.rot} />
        <KPI label="Pilotkunden" value={data.ketten.length} />
        <KPI label="Kette komplett" value={data.ketten.filter(k => k.vollstaendig).length} color={AMPEL_FARBE.gruen} />
      </div>

      <h2 style={{ marginTop: 32 }}>1 · Betriebs-Checkliste</h2>
      {VORAUSSETZUNG_GRUPPEN.map(gruppe => {
        const punkte = v.punkte.filter(p => p.gruppe === gruppe.id)
        if (punkte.length === 0) return null
        return (
          <div className="admin-card" key={gruppe.id} style={{ marginBottom: 16 }}>
            <h3>{gruppe.titel}</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {punkte.map(p => <PunktZeile key={p.id} punkt={p} />)}
              </tbody>
            </table>
          </div>
        )
      })}

      <h2 style={{ marginTop: 36 }}>2 · Kundenketten</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 16, maxWidth: 760 }}>
        Jede Spalte ist ein Kettenschritt in fester Reihenfolge. Grün = erledigt, gelb = begonnen,
        grau = offen, rot = blockiert (eine Voraussetzung fehlt).
      </p>

      {data.gekappt && (
        <Banner tone="warn">
          Es werden nur die ersten 100 aktiven Kunden angezeigt. Weitere Kunden sind vorhanden, aber
          in dieser Übersicht nicht enthalten.
        </Banner>
      )}

      {data.ketten.length === 0 ? (
        <div className="admin-card">
          <p style={{ margin: 0 }}>
            Kein aktiver Kunde vorhanden. <Link href="/admin/clients">Kunden anlegen</Link>, um den
            Pilotbetrieb zu starten.
          </p>
        </div>
      ) : (
        <div className="admin-card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 12px 8px 0', fontSize: 13 }}>Kunde</th>
                {data.schritte.map(s => (
                  <th
                    key={s.id}
                    title={`${s.nr}. ${s.label} — ${s.kriterium}`}
                    style={{ padding: '8px 4px', fontSize: 11, fontWeight: 500, color: 'var(--muted)', width: 34 }}
                  >
                    {s.nr}
                  </th>
                ))}
                <th style={{ textAlign: 'left', padding: '8px 0 8px 16px', fontSize: 13 }}>Nächster Schritt</th>
              </tr>
            </thead>
            <tbody>
              {data.ketten.map(k => (
                <tr key={k.clientId} style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
                  <td style={{ padding: '10px 12px 10px 0', whiteSpace: 'nowrap' }}>
                    <Link href={`/admin/pilot/${k.clientId}`} style={{ fontWeight: 500 }}>{k.name}</Link>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {k.fortschritt.erledigt}/{k.fortschritt.anwendbar} · {k.fortschritt.prozent} %
                    </div>
                  </td>
                  {k.schritte.map(s => (
                    <td key={s.id} style={{ padding: '10px 4px', textAlign: 'center' }}>
                      <span
                        title={`${s.nr}. ${s.label}: ${STAND_TITEL[s.stand]}${s.wert ? ` (${s.wert})` : ''}`}
                        aria-label={`${s.label}: ${STAND_TITEL[s.stand]}`}
                        style={{
                          display: 'inline-block', width: 14, height: 14, borderRadius: 4,
                          background: STAND_FARBE[s.stand],
                        }}
                      />
                    </td>
                  ))}
                  <td style={{ padding: '10px 0 10px 16px', fontSize: 13 }}>
                    {k.vollstaendig ? (
                      <span style={{ color: '#16a34a', fontWeight: 500 }}>Kette vollständig durchlaufen</span>
                    ) : k.aktuellerSchritt ? (
                      <Link href={k.aktuellerSchritt.aktionHref}>
                        {k.aktuellerSchritt.nr}. {k.aktuellerSchritt.label}
                      </Link>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-card" style={{ marginTop: 20 }}>
        <h3>Legende der Kettenschritte</h3>
        <ol style={{ lineHeight: 1.8, margin: 0, paddingLeft: 20, fontSize: 13 }}>
          {data.schritte.map(s => (
            <li key={s.id}>
              <strong>{s.label}</strong> — {s.kriterium}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function PunktZeile({ punkt }: { punkt: VoraussetzungPunkt }) {
  return (
    <tr style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
      <td style={{ padding: '10px 8px 10px 0', width: 28 }}>
        <span
          aria-label={punkt.ampel}
          style={{
            display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
            background: AMPEL_FARBE[punkt.ampel],
          }}
        />
      </td>
      <td style={{ padding: '10px 8px', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {punkt.label}
        {punkt.pflicht && (
          <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 4, background: '#e0e7ff', color: '#3730a3' }}>
            PFLICHT
          </span>
        )}
      </td>
      <td style={{ padding: '10px 8px', color: 'var(--muted)', fontSize: 13 }}>{punkt.wert ?? '—'}</td>
      <td style={{ padding: '10px 0', color: 'var(--muted)', fontSize: 13 }}>
        {punkt.hinweis}
        {punkt.blocker === 'extern' && (
          <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 4, background: '#fef3c7', color: '#92400e' }}>
            EXTERN
          </span>
        )}
        {punkt.aktion && (
          <>
            {' '}
            <Link href={punkt.aktion.href} style={{ whiteSpace: 'nowrap' }}>{punkt.aktion.label} →</Link>
          </>
        )}
      </td>
    </tr>
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
