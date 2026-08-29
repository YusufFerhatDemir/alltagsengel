'use client'
// ═══════════════════════════════════════════════════════════════
// Dienstplan-Freigabe — die Woche der Pflegedienstleitung
//
// BEFUND (29.08.2026): lib/pdl/dienstplanfreigabe.ts und die Route
// /api/personal/dienstplan/freigabe waren vollständig — Wochenübersicht,
// Auslastung, Freigabe, Rücknahme und `quittiereVerstoss()`. Es gab nur
// keine einzige Stelle, die sie aufruft.
//
// Das ist bei der Quittierung mehr als eine fehlende Ansicht. Die Migration
// `20260920060000` hält ausdrücklich fest, der ArbZG-Trigger blockiere
// bewusst nicht: „Stattdessen wird der Verstoß protokolliert — PDL
// entscheidet." Ohne Oberfläche gab es diese Entscheidung nicht. Der
// Verstoß stand im Fristen-Dashboard, blieb dort `quittiert = false` und
// konnte die Liste nie verlassen — egal, wie die PDL entschied.
//
// Die Seite bildet deshalb genau die drei Entscheidungen ab, die die
// Bibliothek kennt, und keine vierte.
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { formatDate } from '@/lib/admin/ops'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'
import { pflegeMiniBtn, pflegePrimaryBtn, pflegeSecondaryBtn } from '@/components/admin/PflegeUI'
import { VERSTOSS_LABEL, type VerstossArt } from '@/lib/personal/arbzg'
import type { WochenUebersicht } from '@/lib/pdl/dienstplanfreigabe'

/** Stunden mit einer Nachkommastelle — Minuten sind hier nie die Frage. */
function stunden(minuten: number | null): string {
  if (minuten == null) return '—'
  return `${(minuten / 60).toFixed(1)} h`
}

/** Montag der Woche, in der `datum` liegt — dieselbe Rechnung wie serverseitig. */
function wochenStart(datum: Date): string {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()))
  // getUTCDay: 0 = Sonntag. Der Sonntag gehört zur VORIGEN Woche (ISO),
  // deshalb −6 statt +1 — sonst begänne die Woche einen Tag zu spät und
  // die Freigabe träfe die falsche.
  const versatz = d.getUTCDay() === 0 ? -6 : 1 - d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + versatz)
  return d.toISOString().slice(0, 10)
}

function wocheVerschieben(iso: string, tage: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + tage)
  return d.toISOString().slice(0, 10)
}

export default function DienstplanFreigabePage() {
  const [woche, setWoche] = useState(() => wochenStart(new Date()))
  const [uebersicht, setUebersicht] = useState<WochenUebersicht | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hinweis, setHinweis] = useState('')
  const [freigabeHinweis, setFreigabeHinweis] = useState('')
  const [grund, setGrund] = useState('')
  const [zeigeRuecknahme, setZeigeRuecknahme] = useState(false)
  /** Verstoß-Id → Begründung, die die PDL gerade tippt. */
  const [bemerkungen, setBemerkungen] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/personal/dienstplan/freigabe?woche=${woche}`)
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Laden fehlgeschlagen.'); return }
      setUebersicht(body.uebersicht)
    } catch {
      setError('Laden fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }, [woche])

  useEffect(() => { load() }, [load])

  async function aktion(rumpf: Record<string, unknown>, erfolg: string) {
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch('/api/personal/dienstplan/freigabe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rumpf),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Aktion fehlgeschlagen.'); return false }
      setHinweis(erfolg)
      await load()
      return true
    } catch {
      setError('Aktion fehlgeschlagen.')
      return false
    } finally { setBusy(false) }
  }

  const freigabe = uebersicht?.freigabe ?? null
  const istFreigegeben = freigabe?.status === 'freigegeben'
  const luecken = uebersicht?.diensteUnbesetzt ?? 0
  const offene = uebersicht?.offeneVerstoesse ?? []

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Dienstplan-Freigabe</h1>
          <p className="admin-subtitle">
            {uebersicht
              ? `Woche ${formatDate(uebersicht.wocheStart)} – ${formatDate(uebersicht.wocheEnde)}`
              : 'Woche wird geladen…'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setWoche(w => wocheVerschieben(w, -7))} style={pflegeSecondaryBtn}>← Woche</button>
          <button onClick={() => setWoche(wochenStart(new Date()))} style={pflegeSecondaryBtn}>Diese Woche</button>
          <button onClick={() => setWoche(w => wocheVerschieben(w, 7))} style={pflegeSecondaryBtn}>Woche →</button>
          <Link href="/admin/dienstplan" style={pflegeSecondaryBtn}>Zum Dienstplan</Link>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {hinweis && <Banner tone="success">{hinweis}</Banner>}

      {loading ? <p style={{ color: 'var(--muted)' }}>Laden…</p> : !uebersicht ? (
        <Banner tone="info">Für diese Woche liegen keine Daten vor.</Banner>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
            <Kennzahl label="Dienste" wert={uebersicht.diensteGesamt} />
            <Kennzahl label="Unbesetzt" wert={luecken} ton={luecken > 0 ? 'warn' : 'ok'} />
            <Kennzahl label="Geplant" wert={stunden(uebersicht.geplanteMinuten)} />
            <Kennzahl label="Abwesenheiten" wert={uebersicht.abwesenheiten} />
            <Kennzahl label="ArbZG offen" wert={offene.length} ton={offene.length > 0 ? 'danger' : 'ok'} />
          </div>

          {/* ── Der Stand der Woche ───────────────────────────────── */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16 }}>Stand</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink4)' }}>
                  {istFreigegeben
                    ? `Freigegeben am ${formatDate(freigabe!.freigegeben_am)}`
                    : freigabe?.status === 'zurueckgezogen'
                      ? `Freigabe zurückgezogen am ${formatDate(freigabe.zurueckgezogen_am)}`
                      : 'Entwurf — bis zur Freigabe ist der Plan unverbindlich.'}
                </p>
                {freigabe?.hinweis && (
                  <p style={{ margin: '4px 0 0', fontSize: 13 }}>Hinweis: {freigabe.hinweis}</p>
                )}
                {freigabe?.zurueckziehungsgrund && (
                  <p style={{ margin: '4px 0 0', fontSize: 13 }}>Grund der Rücknahme: {freigabe.zurueckziehungsgrund}</p>
                )}
              </div>
              <StatusBadge
                label={istFreigegeben ? 'Freigegeben' : freigabe ? 'Zurückgezogen' : 'Entwurf'}
                color={istFreigegeben ? '#5CB882' : freigabe ? '#E8A000' : '#999'}
              />
            </div>

            {!istFreigegeben && (
              <div style={{ marginTop: 16 }}>
                {luecken > 0 && (
                  <Banner tone="info">
                    {luecken} Dienst(e) ohne zugewiesene Kraft. Eine Freigabe ist trotzdem möglich —
                    sie wird dann ausdrücklich als Freigabe mit Lücken festgehalten.
                  </Banner>
                )}
                <input
                  value={freigabeHinweis}
                  onChange={e => setFreigabeHinweis(e.target.value)}
                  placeholder="Hinweis zur Freigabe (optional)"
                  style={eingabe}
                />
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={async () => {
                      const ok = await aktion(
                        { aktion: 'freigeben', woche: uebersicht.wocheStart, trotzLuecken: luecken > 0, hinweis: freigabeHinweis || null },
                        'Woche freigegeben — der Plan ist ab jetzt verbindlich.',
                      )
                      if (ok) setFreigabeHinweis('')
                    }}
                    disabled={busy}
                    style={pflegePrimaryBtn}
                  >
                    {luecken > 0 ? 'Trotz Lücken freigeben' : 'Woche freigeben'}
                  </button>
                </div>
              </div>
            )}

            {istFreigegeben && (
              <div style={{ marginTop: 16 }}>
                {!zeigeRuecknahme ? (
                  <button onClick={() => setZeigeRuecknahme(true)} style={pflegeSecondaryBtn}>
                    Freigabe zurückziehen
                  </button>
                ) : (
                  <>
                    {/* Der Grund ist keine Formalie: ab der Freigabe ist der
                        Plan verbindlich, und jede Änderung danach braucht
                        eine nachlesbare Begründung. Die Bibliothek weist
                        eine Rücknahme ohne Grund ab; hier steht die
                        Fassung, die man vor dem Absenden liest. */}
                    <input
                      value={grund}
                      onChange={e => setGrund(e.target.value)}
                      placeholder="Grund der Rücknahme (Pflichtangabe)"
                      style={eingabe}
                    />
                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      <button
                        onClick={async () => {
                          const ok = await aktion(
                            { aktion: 'zurueckziehen', woche: uebersicht.wocheStart, grund },
                            'Freigabe zurückgezogen.',
                          )
                          if (ok) { setGrund(''); setZeigeRuecknahme(false) }
                        }}
                        disabled={busy || grund.trim().length === 0}
                        style={pflegePrimaryBtn}
                      >
                        Zurückziehen
                      </button>
                      <button onClick={() => { setZeigeRuecknahme(false); setGrund('') }} style={pflegeSecondaryBtn}>
                        Abbrechen
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── ArbZG: die Entscheidung, die es bisher nicht gab ───── */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Offene ArbZG-Verstöße ({offene.length})</h2>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--ink4)' }}>
              Ein Verstoß aus dem <strong>Plan</strong> lässt sich noch umplanen. Ein Verstoß aus der
              <strong> Erfassung</strong> ist bereits geschehen und nur noch zur Kenntnis zu nehmen —
              die Begründung bleibt dauerhaft am Vorgang.
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Verstoß</th><th>Datum</th><th>Herkunft</th><th>Gemessen</th><th>Grenzwert</th><th>Entscheidung</th></tr>
                </thead>
                <tbody>
                  {offene.length === 0
                    ? <EmptyRow colSpan={6}>Keine offenen Verstöße in dieser Woche</EmptyRow>
                    : offene.map(v => (
                      <tr key={v.id}>
                        <td style={{ fontWeight: 600 }}>
                          {VERSTOSS_LABEL[v.art as VerstossArt] ?? v.art}
                        </td>
                        <td style={{ fontSize: 13 }}>{formatDate(v.datum)}</td>
                        <td>
                          <StatusBadge
                            label={v.basis === 'ist' ? 'Erfassung' : 'Dienstplan'}
                            color={v.basis === 'ist' ? '#D04B3B' : '#E8A000'}
                          />
                        </td>
                        <td style={{ fontSize: 13 }}>{stunden(v.gemessen)}</td>
                        <td style={{ fontSize: 13 }}>{stunden(v.grenzwert)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              value={bemerkungen[v.id] ?? ''}
                              onChange={e => setBemerkungen(b => ({ ...b, [v.id]: e.target.value }))}
                              placeholder="Begründung (Pflichtangabe)"
                              style={{ ...eingabe, marginTop: 0, minWidth: 220 }}
                            />
                            <button
                              onClick={async () => {
                                const ok = await aktion(
                                  { aktion: 'quittieren', verstossId: v.id, bemerkung: bemerkungen[v.id] },
                                  'Verstoß zur Kenntnis genommen.',
                                )
                                if (ok) setBemerkungen(b => ({ ...b, [v.id]: '' }))
                              }}
                              disabled={busy || (bemerkungen[v.id] ?? '').trim().length === 0}
                              style={pflegeMiniBtn}
                            >
                              Quittieren
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Auslastung ────────────────────────────────────────── */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Auslastung</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Mitarbeiter</th><th style={{ textAlign: 'right' }}>Dienste</th><th style={{ textAlign: 'right' }}>Geplant</th><th style={{ textAlign: 'right' }}>Soll</th><th style={{ textAlign: 'right' }}>Abweichung</th></tr>
                </thead>
                <tbody>
                  {uebersicht.auslastung.length === 0
                    ? <EmptyRow colSpan={5}>Keine Dienste in dieser Woche</EmptyRow>
                    : uebersicht.auslastung.map(a => (
                      <tr key={a.caregiverId}>
                        <td style={{ fontWeight: 600 }}>{a.name}</td>
                        <td style={{ textAlign: 'right', fontSize: 13 }}>{a.dienste}</td>
                        <td style={{ textAlign: 'right', fontSize: 13 }}>{stunden(a.geplanteMinuten)}</td>
                        <td style={{ textAlign: 'right', fontSize: 13 }}>{stunden(a.sollMinuten)}</td>
                        <td style={{
                          textAlign: 'right', fontSize: 13, fontWeight: 600,
                          // Ohne hinterlegtes Soll gibt es keine Abweichung —
                          // hier eine 0 zu zeigen hiesse „passt genau", und das
                          // ist etwas anderes als „nicht vergleichbar".
                          color: a.abweichungMinuten == null ? 'var(--ink4)'
                            : a.abweichungMinuten > 0 ? '#E8A000'
                            : a.abweichungMinuten < 0 ? '#D04B3B' : 'var(--ink)',
                        }}>
                          {a.abweichungMinuten == null
                            ? 'kein Soll hinterlegt'
                            : `${a.abweichungMinuten > 0 ? '+' : ''}${stunden(a.abweichungMinuten)}`}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const eingabe: React.CSSProperties = {
  marginTop: 12, width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--coal2)',
  color: 'var(--ink)', fontSize: 14, fontFamily: 'inherit',
}

function Kennzahl({ label, wert, ton = 'ok' }: {
  label: string; wert: number | string; ton?: 'ok' | 'warn' | 'danger'
}) {
  const farbe = ton === 'danger' ? '#D04B3B' : ton === 'warn' ? '#E8A000' : 'var(--ink)'
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: 'var(--ink4)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: farbe }}>{wert}</div>
    </div>
  )
}
