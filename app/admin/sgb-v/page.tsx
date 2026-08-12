'use client'
import { monatBerlin } from '@/lib/utils/timezone';
// ═══════════════════════════════════════════════════════════════
// § 302 SGB V — Sonstige Leistungserbringer (Block 17)
//
// Abrechnungskanal für häusliche Krankenpflege (§ 37 SGB V). Getrennt vom
// § 105-SGB-XI-Kanal (/admin/abrechnung), weil Krankenkassen anders routen
// und ein anderes Format verlangen (SLGA/SLLA bzw. HKP-XML statt PLGA/PLAA).
//
// WICHTIG: Der Export ist bewusst GESPERRT. Die Technische Anlage 1 zur
// § 302-Vereinbarung liegt nicht vor; Segmentstrukturen werden nicht geraten,
// weil eine formal plausible, fachlich falsche Datei der schlechteste
// Ausgang wäre. Diese Seite zeigt, was bereits trägt (Positionsaufbereitung,
// Verordnungsprüfung, Routing) und was noch fehlt.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { euro, formatDate } from '@/lib/admin/ops'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'

interface ReadinessPunkt {
  id: string
  label: string
  ampel: 'gruen' | 'gelb' | 'rot'
  wert: string | null
  hinweis: string | null
  blocker: 'intern' | 'extern' | null
}

interface Readiness {
  gesamt: 'gruen' | 'gelb' | 'rot'
  abrechnungsbereit: boolean
  punkte: ReadinessPunkt[]
  zusammenfassung: { gruen: number; gelb: number; rot: number; gesamt: number }
  offeneBlocker: { intern: string[]; extern: string[] }
}

interface Position {
  leistung_id: string
  datum: string
  dauer_minuten: number | null
  leistungsart: string | null
  betrag_cent: number
}

interface Fall {
  kostentraeger_ik: string
  kostentraeger_name: string | null
  client_id: string
  klient_name: string
  versichertennummer: string
  positionen: Position[]
  betrag_cent: number
}

interface Abgelehnt {
  leistung_id: string
  klient_name: string
  datum: string
  problem: string
  hinweis: string
}

interface RoutingStatus {
  kostentraeger_ik: string
  ok: boolean
  problem: string | null
  hinweis: string | null
  datenannahmestelle: string | null
}

interface Vorschau {
  abrechnungsmonat: string
  zeitraum: { von: string; bis: string }
  faelle: Fall[]
  abgelehnt: Abgelehnt[]
  summe_cent: number
  anzahl_faelle: number
  anzahl_positionen: number
  routing: RoutingStatus[]
  version: {
    ok: boolean
    bezeichnung: string | null
    ta_version: string | null
    sperrgrund: string | null
    hinweis: string | null
  }
  export_moeglich: boolean
}

const AMPEL_FARBE: Record<string, string> = {
  gruen: '#5CB882',
  gelb: '#E8A000',
  rot: '#D04B3B',
}

const AMPEL_LABEL: Record<string, string> = {
  gruen: 'OK',
  gelb: 'Offen',
  rot: 'Blockiert',
}

function aktuellerMonat(): string {
  return monatBerlin()
}

export default function SgbVPage() {
  const [monat, setMonat] = useState(aktuellerMonat())
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [vorschau, setVorschau] = useState<Vorschau | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offenerFall, setOffenerFall] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rRes, vRes] = await Promise.all([
        fetch(`/api/billing/sgb-v/readiness?monat=${monat}`),
        fetch(`/api/billing/sgb-v/vorschau?monat=${monat}`),
      ])
      const rJson = await rRes.json()
      const vJson = await vRes.json()
      if (!rRes.ok) { setError(rJson.error || 'Readiness konnte nicht geladen werden.'); return }
      if (!vRes.ok) { setError(vJson.error || 'Vorschau konnte nicht geladen werden.'); return }
      setReadiness(rJson)
      setVorschau(vJson)
    } catch {
      setError('Unerwarteter Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }, [monat])

  useEffect(() => { load() }, [load])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>§ 302 SGB V — Sonstige Leistungserbringer</h1>
          <p className="admin-subtitle">
            Abrechnungskanal für häusliche Krankenpflege (§ 37 SGB V) — getrennt von § 105 SGB XI
          </p>
        </div>
        <input
          type="month"
          value={monat}
          onChange={e => setMonat(e.target.value)}
          style={inputStyle}
        />
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <Banner tone="warn">
        <strong>Export gesperrt.</strong> Die Technische Anlage 1 zur § 302-Vereinbarung
        (Segmentstrukturen SLGA/SLLA, Schlüsselverzeichnisse) liegt nicht vor. Datensätze werden
        erst erzeugt, wenn die Anlage hinterlegt und die Formatversion als spec-bestätigt markiert
        ist — bis dahin würde jede Datei nur plausibel aussehen. Positionsaufbereitung,
        Verordnungsprüfung und Routing sind bereits nutzbar und unten auswertbar.
      </Banner>

      {loading ? <p>Laden…</p> : (
        <>
          {/* ── Readiness ── */}
          {readiness && (
            <>
              <h2 style={cardTitle}>Voraussetzungen</h2>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <StatusBadge
                  label={`Gesamt: ${AMPEL_LABEL[readiness.gesamt]}`}
                  color={AMPEL_FARBE[readiness.gesamt]}
                />
                <span style={{ fontSize: 13, color: 'var(--ink4)' }}>
                  {readiness.zusammenfassung.gruen} OK · {readiness.zusammenfassung.gelb} offen ·{' '}
                  {readiness.zusammenfassung.rot} blockiert
                </span>
              </div>

              <div className="admin-table-wrap" style={{ marginBottom: 24 }}>
                <table className="admin-table">
                  <thead>
                    <tr><th>Punkt</th><th>Status</th><th>Wert</th><th>Blocker</th><th>Hinweis</th></tr>
                  </thead>
                  <tbody>
                    {readiness.punkte.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.label}</td>
                        <td><StatusBadge label={AMPEL_LABEL[p.ampel]} color={AMPEL_FARBE[p.ampel]} /></td>
                        <td style={{ fontSize: 13 }}>{p.wert || '—'}</td>
                        <td style={{ fontSize: 12 }}>
                          {p.blocker === 'extern'
                            ? <span style={{ color: '#D04B3B' }}>extern</span>
                            : p.blocker === 'intern'
                              ? <span style={{ color: '#E8A000' }}>intern</span>
                              : '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--ink4)', maxWidth: 420 }}>{p.hinweis || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(readiness.offeneBlocker.extern.length > 0 || readiness.offeneBlocker.intern.length > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 24 }}>
                  <BlockerKarte
                    titel="Extern zu beschaffen"
                    hinweis="Nur von aussen lösbar — Zulassung, Technische Anlage, Kassenverzeichnisse."
                    punkte={readiness.offeneBlocker.extern}
                    farbe="#D04B3B"
                  />
                  <BlockerKarte
                    titel="Intern lösbar"
                    hinweis="In Code oder Stammdaten dieser Plattform lösbar."
                    punkte={readiness.offeneBlocker.intern}
                    farbe="#E8A000"
                  />
                </div>
              )}
            </>
          )}

          {/* ── Trockenlauf ── */}
          {vorschau && (
            <>
              <h2 style={cardTitle}>
                Abrechenbare HKP-Leistungen — {formatDate(vorschau.zeitraum.von)} bis {formatDate(vorschau.zeitraum.bis)}
              </h2>
              <p style={{ fontSize: 13, color: 'var(--ink4)', marginBottom: 12 }}>
                {vorschau.anzahl_faelle} Fall/Fälle · {vorschau.anzahl_positionen} Positionen ·{' '}
                {euro(vorschau.summe_cent / 100)}
                {vorschau.abgelehnt.length > 0 && ` · ${vorschau.abgelehnt.length} nicht abrechenbar`}
              </p>

              <div className="admin-table-wrap" style={{ marginBottom: 24 }}>
                <table className="admin-table">
                  <thead>
                    <tr><th>Krankenkasse (IK)</th><th>Klient</th><th>Versichertennr.</th><th>Positionen</th><th>Betrag</th><th></th></tr>
                  </thead>
                  <tbody>
                    {vorschau.faelle.length === 0 ? (
                      <EmptyRow colSpan={6}>Keine abrechenbaren HKP-Leistungen in diesem Monat</EmptyRow>
                    ) : vorschau.faelle.map(f => {
                      const key = `${f.kostentraeger_ik}|${f.client_id}`
                      const offen = offenerFall === key
                      return [
                        <tr key={key}>
                          <td style={{ fontSize: 13 }}>
                            {f.kostentraeger_name || '—'}
                            <div style={{ fontSize: 11, color: 'var(--ink4)', fontFamily: 'monospace' }}>{f.kostentraeger_ik}</div>
                          </td>
                          <td style={{ fontWeight: 600 }}>{f.klient_name}</td>
                          <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{f.versichertennummer}</td>
                          <td>{f.positionen.length}</td>
                          <td style={{ fontWeight: 600, color: 'var(--gold2)' }}>{euro(f.betrag_cent / 100)}</td>
                          <td>
                            <button style={actionBtn} onClick={() => setOffenerFall(offen ? null : key)}>
                              {offen ? 'Zuklappen' : 'Positionen'}
                            </button>
                          </td>
                        </tr>,
                        offen ? (
                          <tr key={`${key}-detail`}>
                            <td colSpan={6} style={{ background: 'var(--coal3)' }}>
                              <table style={{ width: '100%', fontSize: 12 }}>
                                <thead>
                                  <tr style={{ color: 'var(--ink4)' }}>
                                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Datum</th>
                                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Leistung</th>
                                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Dauer</th>
                                    <th style={{ textAlign: 'right', padding: '4px 8px' }}>Betrag</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {f.positionen.map(p => (
                                    <tr key={p.leistung_id}>
                                      <td style={{ padding: '4px 8px' }}>{formatDate(p.datum)}</td>
                                      <td style={{ padding: '4px 8px' }}>{p.leistungsart || '—'}</td>
                                      <td style={{ padding: '4px 8px' }}>{p.dauer_minuten ? `${p.dauer_minuten} Min` : '—'}</td>
                                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{euro(p.betrag_cent / 100)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        ) : null,
                      ]
                    })}
                  </tbody>
                </table>
              </div>

              {/* Routing je Kasse */}
              {vorschau.routing.length > 0 && (
                <>
                  <h2 style={cardTitle}>Kassen-Routing</h2>
                  <div className="admin-table-wrap" style={{ marginBottom: 24 }}>
                    <table className="admin-table">
                      <thead>
                        <tr><th>Krankenkasse (IK)</th><th>Status</th><th>Datenannahmestelle</th><th>Hinweis</th></tr>
                      </thead>
                      <tbody>
                        {vorschau.routing.map(r => (
                          <tr key={r.kostentraeger_ik}>
                            <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{r.kostentraeger_ik}</td>
                            <td><StatusBadge label={r.ok ? 'OK' : 'Fehlt'} color={r.ok ? '#5CB882' : '#D04B3B'} /></td>
                            <td style={{ fontSize: 13 }}>{r.datenannahmestelle || '—'}</td>
                            <td style={{ fontSize: 12, color: 'var(--ink4)' }}>{r.hinweis || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Nicht abrechenbar */}
              {vorschau.abgelehnt.length > 0 && (
                <>
                  <h2 style={cardTitle}>Nicht abrechenbar ({vorschau.abgelehnt.length})</h2>
                  <p style={{ fontSize: 13, color: 'var(--ink4)', marginBottom: 12 }}>
                    Diese Leistungen sind einer HKP-Verordnung zugeordnet, erfüllen aber die
                    Abrechnungsvoraussetzungen nicht. Sie werden nicht stillschweigend
                    weggelassen — jede Zeile nennt den Grund.
                  </p>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr><th>Datum</th><th>Klient</th><th>Grund</th></tr>
                      </thead>
                      <tbody>
                        {vorschau.abgelehnt.map(a => (
                          <tr key={a.leistung_id}>
                            <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{formatDate(a.datum)}</td>
                            <td>{a.klient_name}</td>
                            <td style={{ fontSize: 12, color: 'var(--ink4)' }}>{a.hinweis}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function BlockerKarte({ titel, hinweis, punkte, farbe }: {
  titel: string; hinweis: string; punkte: string[]; farbe: string
}) {
  return (
    <div style={{ background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: farbe, marginBottom: 4 }}>
        {titel} ({punkte.length})
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink4)', marginBottom: 8 }}>{hinweis}</div>
      {punkte.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink4)' }}>—</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink3)' }}>
          {punkte.map(p => <li key={p} style={{ marginBottom: 3 }}>{p}</li>)}
        </ul>
      )}
    </div>
  )
}

const cardTitle: CSSProperties = {
  fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 700,
  color: 'var(--ink)', margin: '20px 0 12px',
}
const inputStyle: CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
}
const actionBtn: CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
