'use client'
import { datumBerlin } from '@/lib/utils/timezone'
import { useCallback, useEffect, useState } from 'react'
import type {
  PdlCockpitData,
  LeistungsartZeile,
  KostentraegerZeile,
  PflegegradZeile,
} from '@/lib/analytics/pdl-cockpit'

function euro(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function aktuellerMonatVon(): string {
  const d = new Date()
  return datumBerlin(new Date(d.getFullYear(), d.getMonth(), 1))
}
function aktuellerMonatBis(): string {
  const d = new Date()
  return datumBerlin(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

export default function PdlCockpitPage() {
  const [von, setVon] = useState(aktuellerMonatVon())
  const [bis, setBis] = useState(aktuellerMonatBis())
  const [data, setData] = useState<PdlCockpitData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/analytics/pdl-cockpit?von=${von}&bis=${bis}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Unbekannter Fehler'); setData(null); return }
      setData(json)
    } catch (err: any) {
      setError(err.message || 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [von, bis])

  useEffect(() => { load() }, [load])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>PDL-Cockpit</h1>
          <p className="admin-subtitle">Operative Steuerung — Leistungen, Personal, Umsatz, Qualitaet</p>
        </div>
      </div>

      {/* Zeitraumauswahl */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginBottom: 20 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink3)' }}>
          Von
          <input type="date" value={von} onChange={e => setVon(e.target.value)} style={dateInput} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink3)' }}>
          Bis
          <input type="date" value={bis} onChange={e => setBis(e.target.value)} style={dateInput} />
        </label>
        <button onClick={load} disabled={loading} style={refreshBtn}>{loading ? 'Laedt...' : 'Aktualisieren'}</button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(208,75,59,0.1)', border: '1px solid rgba(208,75,59,0.3)', color: '#D04B3B', marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && !data ? <p>Laden...</p> : data && (
        <>
          {/* Sektion 1: Leistungsuebersicht */}
          <SectionHeader title="Leistungsuebersicht" />
          <div className="admin-stats-grid">
            <div className="admin-stat-card gold">
              <div className="admin-stat-value">{data.leistungen.gesamtStunden} h</div>
              <div className="admin-stat-label">Geleistete Stunden</div>
            </div>
            <div className="admin-stat-card accent">
              <div className="admin-stat-value">{data.leistungen.geplanteStunden} h</div>
              <div className="admin-stat-label">Geplante Stunden</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-value">
                {data.leistungen.erfuellungsquoteProzent != null ? `${data.leistungen.erfuellungsquoteProzent}%` : '---'}
              </div>
              <div className="admin-stat-label">Erfuellungsquote</div>
            </div>
          </div>
          {data.leistungen.nachLeistungsart.length > 0 && (
            <MiniTable
              columns={['Leistungsart', 'Stunden', 'Anzahl']}
              rows={data.leistungen.nachLeistungsart.map(z => [z.leistungsart, `${z.stunden} h`, String(z.anzahl)])}
            />
          )}

          {/* Sektion 2: Umsatz */}
          <SectionHeader title="Umsatz" />
          <div className="admin-stats-grid">
            <div className="admin-stat-card gold">
              <div className="admin-stat-value">
                {euro(data.umsatz.gesamt)}
                {data.umsatz.veraenderungProzent != null && (
                  <span style={{
                    fontSize: 13,
                    marginLeft: 8,
                    color: data.umsatz.veraenderungProzent >= 0 ? '#2E7D32' : '#D04B3B',
                  }}>
                    {data.umsatz.veraenderungProzent >= 0 ? '+' : ''}{data.umsatz.veraenderungProzent}%
                  </span>
                )}
              </div>
              <div className="admin-stat-label">
                Gesamtumsatz
                {data.umsatz.vormonat != null && ` (Vormonat: ${euro(data.umsatz.vormonat)})`}
              </div>
            </div>
            <div className="admin-stat-card accent">
              <div className="admin-stat-value">
                {data.umsatz.nachKostentraegerTyp.reduce((s, z) => s + z.anzahl, 0) || 0}
              </div>
              <div className="admin-stat-label">Anzahl Rechnungen</div>
            </div>
          </div>
          {data.umsatz.nachKostentraegerTyp.length > 0 && (
            <MiniTable
              columns={['Kostentraegertyp', 'Betrag', 'Anzahl']}
              rows={data.umsatz.nachKostentraegerTyp.map(z => [z.typ, euro(z.betrag), String(z.anzahl)])}
            />
          )}

          {/* Sektion 3: Personaluebersicht */}
          <SectionHeader title="Personaluebersicht" />
          <div className="admin-stats-grid">
            <div className="admin-stat-card gold">
              <div className="admin-stat-value">{data.personal.aktiveKraefte}</div>
              <div className="admin-stat-label">Aktive Kraefte</div>
            </div>
            <div className="admin-stat-card accent">
              <div className="admin-stat-value">{data.personal.imEinsatz}</div>
              <div className="admin-stat-label">Im Einsatz</div>
            </div>
            <div className="admin-stat-card" style={data.personal.krankgemeldet > 0 ? { borderLeft: '3px solid #D04B3B' } : undefined}>
              <div className="admin-stat-value">{data.personal.krankgemeldet}</div>
              <div className="admin-stat-label">Krankgemeldet</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-value">{data.personal.imUrlaub}</div>
              <div className="admin-stat-label">Im Urlaub</div>
            </div>
            {data.personal.krankenstandsquoteProzent !== null && (
              <div className="admin-stat-card" style={data.personal.krankenstandsquoteProzent > 5 ? { borderLeft: '3px solid #D04B3B' } : undefined}>
                <div className="admin-stat-value">{data.personal.krankenstandsquoteProzent.toFixed(1)}%</div>
                <div className="admin-stat-label">Krankenstandsquote (Zeitraum)</div>
              </div>
            )}
            {data.personal.fehlzeitenquoteProzent !== null && (
              <div className="admin-stat-card">
                <div className="admin-stat-value">{data.personal.fehlzeitenquoteProzent.toFixed(1)}%</div>
                <div className="admin-stat-label">Fehlzeitenquote (Zeitraum)</div>
              </div>
            )}
          </div>
          {(data.personal.ueberStundenKonto > 0 || data.personal.unterStundenKonto > 0) && (
            <div style={{ display: 'flex', gap: 12, marginTop: 8, marginBottom: 16 }}>
              <div style={stundenKontoBox}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#E65100' }}>{data.personal.ueberStundenKonto} h</span>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Ueberstunden (gesamt)</span>
              </div>
              <div style={stundenKontoBox}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#1565C0' }}>{data.personal.unterStundenKonto} h</span>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Unterstunden (gesamt)</span>
              </div>
            </div>
          )}

          {/* Sektion 4: Klienten */}
          <SectionHeader title="Klienten" />
          <div className="admin-stats-grid">
            <div className="admin-stat-card gold">
              <div className="admin-stat-value">{data.klienten.aktiv}</div>
              <div className="admin-stat-label">Aktive Klienten</div>
            </div>
            <div className="admin-stat-card success">
              <div className="admin-stat-value">{data.klienten.neuImZeitraum}</div>
              <div className="admin-stat-label">Neu im Zeitraum</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-value">{data.klienten.beendetImZeitraum}</div>
              <div className="admin-stat-label">Beendet im Zeitraum</div>
            </div>
          </div>
          {data.klienten.pflegegradVerteilung.length > 0 && (
            <PflegegradBar verteilung={data.klienten.pflegegradVerteilung} gesamt={data.klienten.aktiv} />
          )}

          {/* Sektion 5: Budget-Auslastung */}
          <SectionHeader title="Budget-Auslastung" />
          <div className="admin-stats-grid">
            <div className="admin-stat-card gold">
              <div className="admin-stat-value">{euro(data.budgets.gesamtBudgetEuro)}</div>
              <div className="admin-stat-label">Gesamtbudget</div>
            </div>
            <div className="admin-stat-card accent">
              <div className="admin-stat-value">{euro(data.budgets.verbrauchtEuro)}</div>
              <div className="admin-stat-label">Verbraucht</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-value">
                {data.budgets.auslastungProzent != null ? `${data.budgets.auslastungProzent}%` : '---'}
              </div>
              <div className="admin-stat-label">Auslastung</div>
            </div>
            <div className="admin-stat-card" style={data.budgets.kritischeBudgets > 0 ? { borderLeft: '3px solid #D04B3B' } : undefined}>
              <div className="admin-stat-value">{data.budgets.kritischeBudgets}</div>
              <div className="admin-stat-label">Kritische Budgets (&gt;90%)</div>
            </div>
          </div>

          {/* Sektion 6: Qualitaetsindikatoren */}
          <SectionHeader title="Qualitaetsindikatoren" />
          <div className="admin-stats-grid">
            <div className="admin-stat-card success">
              <div className="admin-stat-value">
                {data.qualitaet.zufriedenheitSchnitt != null ? `${data.qualitaet.zufriedenheitSchnitt.toFixed(2)} / 5` : '--- (keine Daten)'}
              </div>
              <div className="admin-stat-label">Zufriedenheit</div>
            </div>
            <div className="admin-stat-card" style={data.qualitaet.offeneWunden > 0 ? { borderLeft: '3px solid #E65100' } : undefined}>
              <div className="admin-stat-value">{data.qualitaet.offeneWunden}</div>
              <div className="admin-stat-label">Offene Wunden</div>
            </div>
            <div className="admin-stat-card" style={data.qualitaet.sturzEreignisse > 0 ? { borderLeft: '3px solid #D04B3B' } : undefined}>
              <div className="admin-stat-value">{data.qualitaet.sturzEreignisse}</div>
              <div className="admin-stat-label">Sturzereignisse</div>
            </div>
            <div className="admin-stat-card" style={data.qualitaet.ueberfaelligeVerordnungen > 0 ? { borderLeft: '3px solid #D04B3B' } : undefined}>
              <div className="admin-stat-value">{data.qualitaet.ueberfaelligeVerordnungen}</div>
              <div className="admin-stat-label">Ueberfaellige Verordnungen</div>
            </div>
          </div>

          {/* Fussnote */}
          <p style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 24 }}>
            Leistungsstunden aus service_records (duration_minutes) im Zeitraum.
            Umsatz = Summe invoices (created_at) im Zeitraum, total_amount in EUR.
            Personalzahlen = aktive Mitarbeiter (caregivers) mit laufenden Einsaetzen.
            Klientenstatus und Pflegegrad aus clients-Tabelle.
            Budgets = client_budgets (annual_amount + combined_annual_amount, Schwelle 90%).
            Verordnungen ueberfaellig = gueltig_bis vor heute bei laufendem Genehmigungsstatus.
          </p>
        </>
      )}
    </div>
  )
}

// ── Hilfskomponenten ────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 style={{
      fontSize: 16, fontWeight: 700, color: 'var(--ink)',
      borderLeft: '3px solid var(--gold)', paddingLeft: 10,
      margin: '28px 0 12px',
    }}>
      {title}
    </h2>
  )
}

function MiniTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} style={{
                textAlign: i === 0 ? 'left' : 'right',
                padding: '6px 10px', borderBottom: '1px solid var(--border)',
                color: 'var(--ink3)', fontWeight: 600, fontSize: 12,
              }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  textAlign: ci === 0 ? 'left' : 'right',
                  padding: '6px 10px', borderBottom: '1px solid var(--border)',
                  color: 'var(--ink)',
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const PG_FARBEN: Record<string, string> = {
  '1': '#4CAF50',
  '2': '#8BC34A',
  '3': '#FFC107',
  '4': '#FF9800',
  '5': '#F44336',
  'Kein PG': '#9E9E9E',
}

function PflegegradBar({ verteilung, gesamt }: { verteilung: PflegegradZeile[]; gesamt: number }) {
  if (gesamt === 0) return null
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 6 }}>Pflegegrad-Verteilung</div>
      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', height: 28 }}>
        {verteilung.map((z, i) => {
          const pct = (z.anzahl / gesamt) * 100
          if (pct === 0) return null
          const farbe = PG_FARBEN[String(z.pflegegrad)] || '#9E9E9E'
          return (
            <div
              key={i}
              title={`PG ${z.pflegegrad}: ${z.anzahl} (${Math.round(pct)}%)`}
              style={{
                width: `${pct}%`, minWidth: pct > 0 ? 24 : 0,
                background: farbe, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 11, fontWeight: 700,
              }}
            >
              {pct >= 8 ? `PG${z.pflegegrad}` : ''}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
        {verteilung.map((z, i) => (
          <span key={i} style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 2, display: 'inline-block',
              background: PG_FARBEN[String(z.pflegegrad)] || '#9E9E9E',
            }} />
            PG {z.pflegegrad}: {z.anzahl}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────

const dateInput: React.CSSProperties = {
  fontSize: 14, padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--coal2)',
  color: 'var(--ink)', fontFamily: 'inherit',
}

const refreshBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))',
  border: 'none', borderRadius: 8, padding: '8px 16px',
  cursor: 'pointer', fontFamily: 'inherit',
}

const stundenKontoBox: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2,
  padding: '10px 16px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--coal2)',
}
