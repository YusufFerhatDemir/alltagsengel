'use client'
import { datumBerlin } from '@/lib/utils/timezone';
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  euro, fullName, statusMeta, summarizeBudget,
  AMPEL_META, CLOSING_STATUS, type Ampel, type BudgetSummary,
} from '@/lib/admin/ops'
import { AmpelDot, BudgetBar, StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { BUNDESLAND_NAMEN } from '@/lib/expansion/types'
import type { MonatsabschlussErgebnis } from '@/lib/abrechnung/monatsabschluss'
import AmpelSummaryWidget from '@/components/admin/AmpelSummaryWidget'
import { logger } from '@/lib/logger';
import { klickbareZeile } from '@/lib/a11y'
const log = logger.child('admin:monatsabschluss');

interface ClosingRow {
  client_id: string
  client: string
  recordCount: number
  totalAmount: number
  budgetSummary: BudgetSummary | null
  ampel: Ampel
  status: string
  isVirtual: boolean
}

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

function MonatsabschlussInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const now = new Date()
  const [year, setYear] = useState(Number(searchParams.get('year')) || now.getFullYear())
  const [month, setMonth] = useState(Number(searchParams.get('month')) || now.getMonth() + 1)
  const [rows, setRows] = useState<ClosingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | Ampel>('all')
  const [search, setSearch] = useState('')
  // War eine Konstante `0`, stand aber als Abhaengigkeit im Ladeeffekt und
  // im AmpelSummaryWidget — die Abhaengigkeit konnte damit nie feuern, ein
  // Neuladen war gar nicht ausloesbar. Jetzt echter State: nach einem
  // Abschlusslauf aendern sich die Perioden-Status, und die Tabelle darf
  // die alten nicht weiterzeigen.
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const supabase = createClient()
        const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
        const monthEnd = datumBerlin(new Date(year, month, 0))

        const [closingsRes, recordsRes, budgetsRes] = await Promise.all([
          supabase.from('monthly_closings').select('*, client:clients(first_name, last_name)').eq('year', year).eq('month', month),
          supabase.from('service_records').select('id, client_id, status, amount, client:clients(first_name, last_name)').gte('date', monthStart).lte('date', monthEnd),
          supabase.from('client_budgets').select('*').eq('year', year),
        ])

        const budgetByClient = new Map<string, any>()
        for (const b of budgetsRes.data || []) budgetByClient.set(b.client_id, b)

        const recordIds = (recordsRes.data || []).map((r: any) => r.id)
        const errorsByRecord = new Map<string, { severity: string; resolved: boolean }[]>()
        if (recordIds.length > 0) {
          const { data: errs, error: errsErr } = await supabase
            .from('review_errors')
            .select('service_record_id, severity, resolved')
            .in('service_record_id', recordIds)
          // Die Pruefefehler entscheiden ueber die Ampel des Monatsabschlusses.
          // Ihr Verlust faerbt den Monat gruen, obwohl niemand nachgesehen hat.
          if (errsErr) throw errsErr
          for (const e of errs || []) {
            const arr = errorsByRecord.get(e.service_record_id) || []
            arr.push({ severity: e.severity, resolved: e.resolved })
            errorsByRecord.set(e.service_record_id, arr)
          }
        }

        const recordsByClient = new Map<string, any[]>()
        for (const r of (recordsRes.data || [])) {
          const arr = recordsByClient.get(r.client_id) || []
          arr.push(r)
          recordsByClient.set(r.client_id, arr)
        }

        const closingByClient = new Map<string, any>()
        for (const c of closingsRes.data || []) closingByClient.set(c.client_id, c)

        const clientIds = new Set<string>([...closingByClient.keys(), ...recordsByClient.keys()])
        const result: ClosingRow[] = []

        for (const clientId of clientIds) {
          const closing = closingByClient.get(clientId)
          const records = recordsByClient.get(clientId) || []
          const clientName = closing ? fullName(closing.client) : fullName(records[0]?.client)
          const budget = budgetByClient.get(clientId)
          const budgetSummary = budget ? summarizeBudget(budget) : null

          let hasCritical = false
          let hasWarning = false
          let hasIncomplete = false
          for (const r of records) {
            if (r.status === 'incomplete' || r.status === 'draft') hasIncomplete = true
            for (const e of errorsByRecord.get(r.id) || []) {
              if (e.resolved) continue
              if (e.severity === 'critical') hasCritical = true
              else if (e.severity === 'warning') hasWarning = true
            }
          }
          const budgetExceeded = budgetSummary ? budgetSummary.remaining < 0 : false

          let ampel: Ampel
          if (closing) {
            ampel = closing.ampel
          } else {
            ampel = (hasCritical || budgetExceeded) ? 'rot' : (hasWarning || hasIncomplete) ? 'gelb' : 'gruen'
          }

          result.push({
            client_id: clientId,
            client: clientName,
            recordCount: closing ? closing.total_records : records.length,
            totalAmount: closing ? closing.total_amount : records.reduce((s, r) => s + (Number(r.amount) || 0), 0),
            budgetSummary,
            ampel,
            status: closing ? closing.status : 'open',
            isVirtual: !closing,
          })
        }

        result.sort((a, b) => a.client.localeCompare(b.client, 'de'))
        if (!cancelled) setRows(result)
      } catch (err) {
        log.errorWithException('Monatsabschluss load error', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [year, month, refreshKey])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.ampel !== filter) return false
      if (q && !r.client.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, filter, search])

  function updatePeriod(newYear: number, newMonth: number) {
    setYear(newYear)
    setMonth(newMonth)
    router.replace(`/admin/monatsabschluss?year=${newYear}&month=${newMonth}`)
  }

  // ── Abschlusslauf ─────────────────────────────────────────────────
  // BEFUND (29.08.2026): POST /api/billing/monthly-closing fuehrt den
  // Abschluss aus — mit ausdruecklichem `dryRun` fuer einen reinen
  // Pruef-/Vorschaulauf — und wurde von KEINER Stelle aufgerufen. Diese
  // Seite las den Bestand direkt aus Supabase und zeigte, WAS im Monat
  // liegt; ausloesen liess sich der Abschluss nirgends.
  //
  // Das Muster ist im Haus bereits etabliert: /admin/mahnwesen und
  // /admin/sammelrechnung bieten beide Simulation UND Echtlauf mit
  // Rueckfrage. Hier steht dasselbe, nichts Neues erfunden.
  const [bundesland, setBundesland] = useState('hessen')
  const [lauf, setLauf] = useState<(MonatsabschlussErgebnis & { modus: string }) | null>(null)
  const [laufLaeuft, setLaufLaeuft] = useState<'vorschau' | 'abschluss' | null>(null)
  const [laufFehler, setLaufFehler] = useState<string | null>(null)

  async function starteLauf(dryRun: boolean) {
    // Der Echtlauf schreibt `monthly_closings` fort. Die Rueckfrage steht
    // hier wie beim Mahnlauf: was danach auf `closed` oder `sent` steht,
    // laesst sich nicht mehr ueberschreiben
    // (ABGESCHLOSSENE_CLOSING_STATUS in lib/abrechnung/monatsabschluss.ts).
    if (!dryRun && !confirm(
      `Monatsabschluss ${MONTH_NAMES[month - 1]} ${year} jetzt ausführen? `
      + 'Die Perioden werden fortgeschrieben; abgeschlossene Perioden lassen sich nicht mehr überschreiben.'
    )) return

    setLaufLaeuft(dryRun ? 'vorschau' : 'abschluss')
    setLaufFehler(null)
    try {
      const res = await fetch('/api/billing/monthly-closing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // `month` als YYYY-MM, wie die Route es verlangt — nicht Jahr und
        // Monat getrennt: sie weist alles andere mit 400 ab.
        body: JSON.stringify({ month: `${year}-${String(month).padStart(2, '0')}`, bundesland, dryRun }),
      })
      const body = await res.json()
      if (!res.ok) { setLaufFehler(body.error || 'Abschlusslauf fehlgeschlagen.'); return }
      setLauf(body)
      // Nur nach dem Echtlauf neu laden: die Vorschau aendert nichts, und
      // ein Neuladen wuerde die Vorschau gegen unveraenderte Zahlen stellen.
      if (!dryRun) setRefreshKey((k: number) => k + 1)
    } catch {
      setLaufFehler('Abschlusslauf fehlgeschlagen.')
    } finally {
      setLaufLaeuft(null)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Monatsabschluss-Assistent</h1>
          <p className="admin-subtitle">{MONTH_NAMES[month - 1]} {year} — {rows.length} Klient(en) mit Leistungen</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={month} onChange={e => updatePeriod(year, Number(e.target.value))} style={selectStyle}>
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => updatePeriod(Number(e.target.value), month)} style={selectStyle}>
            {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <AmpelSummaryWidget year={year} month={month} refreshKey={refreshKey} />

      {/* ── Abschlusslauf ───────────────────────────────────────── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, margin: '16px 0' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ fontSize: 13 }}>
            Bundesland des Leistungsorts<br />
            {/* PFLICHTANGABE ohne Vorbelegung in der Route: ohne sie zöge die
                Preissuche landesfremde Sätze. Hier steht Hessen vorne, weil
                dort abgerechnet wird — die Auswahl bleibt aber offen und
                sichtbar, statt die Annahme zu verstecken. */}
            <select value={bundesland} onChange={e => setBundesland(e.target.value)} style={{ ...selectStyle, marginTop: 4 }}>
              {Object.entries(BUNDESLAND_NAMEN).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </label>
          <button
            className="admin-btn"
            onClick={() => void starteLauf(true)}
            disabled={laufLaeuft !== null}
            style={{ ...selectStyle, cursor: 'pointer' }}
          >
            {laufLaeuft === 'vorschau' ? 'Vorschau läuft…' : 'Vorschau (schreibt nichts)'}
          </button>
          <button
            className="admin-btn admin-btn-primary"
            onClick={() => void starteLauf(false)}
            disabled={laufLaeuft !== null}
            style={{ ...selectStyle, cursor: 'pointer', fontWeight: 600 }}
          >
            {laufLaeuft === 'abschluss' ? 'Abschluss läuft…' : 'Monat abschließen'}
          </button>
        </div>

        {laufFehler && <div style={{ marginTop: 12 }}><Banner tone="danger">{laufFehler}</Banner></div>}

        {lauf && (
          <div style={{ marginTop: 12 }}>
            <Banner tone={lauf.modus === 'vorschau' ? 'info' : 'success'}>
              {lauf.modus === 'vorschau' ? 'Vorschau' : 'Abschluss'} für {lauf.monat}
              {' '}({lauf.zeitraum.von} bis {lauf.zeitraum.bis}):
              {' '}{lauf.verordnungen_geprueft} Verordnung(en) geprüft,
              {' '}{lauf.positionen_abrechenbar} Position(en) abrechenbar,
              {' '}{lauf.positionen_blockiert} blockiert,
              {' '}Summe {(lauf.gesamt_cent / 100).toFixed(2)} €.
              {lauf.modus === 'vorschau'
                // Ausdrücklich benannt: eine Vorschau, die aussieht wie ein
                // Ergebnis, wird für eines gehalten.
                ? ' Es wurde nichts geschrieben.'
                : ` ${lauf.closings_geschrieben} Periode(n) fortgeschrieben.`}
            </Banner>

            {lauf.warnungen.length > 0 && (
              <div className="admin-table-wrap" style={{ marginTop: 12 }}>
                <table className="admin-table">
                  <thead>
                    <tr><th>Schwere</th><th>Klient</th><th>Befund</th></tr>
                  </thead>
                  <tbody>
                    {lauf.warnungen.map((w, i) => (
                      <tr key={`${w.verordnung_id ?? 'ohne'}-${i}`}>
                        <td>
                          <StatusBadge
                            label={w.schwere === 'fehler' ? 'Fehler' : w.schwere === 'warnung' ? 'Warnung' : 'Hinweis'}
                            color={w.schwere === 'fehler' ? '#D04B3B' : w.schwere === 'warnung' ? '#E8A000' : '#999'}
                          />
                        </td>
                        <td style={{ fontSize: 13 }}>{w.client ?? '—'}</td>
                        <td style={{ fontSize: 13 }}>{w.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {lauf.gruppen.length > 0 && (
              <div className="admin-table-wrap" style={{ marginTop: 12 }}>
                <table className="admin-table">
                  <thead>
                    <tr><th>Kostenträger</th><th>Typ</th><th>IK</th><th style={{ textAlign: 'right' }}>Positionen</th><th style={{ textAlign: 'right' }}>Summe</th></tr>
                  </thead>
                  <tbody>
                    {lauf.gruppen.map(g => (
                      <tr key={`${g.kostentraeger_name}-${g.ik_nummer ?? 'ohne'}`}>
                        <td style={{ fontWeight: 600 }}>{g.kostentraeger_name}</td>
                        <td style={{ fontSize: 13 }}>{g.kostentraeger_typ}</td>
                        <td style={{ fontSize: 13 }}>{g.ik_nummer ?? '—'}</td>
                        <td style={{ fontSize: 13, textAlign: 'right' }}>{g.positionen.length}</td>
                        <td style={{ fontSize: 13, textAlign: 'right' }}>{(g.summe_cent / 100).toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ margin: '4px 0 16px' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Klient suchen…" />
      </div>

      <div className="admin-filters">
        {(['all', 'rot', 'gelb', 'gruen'] as const).map(f => (
          <button key={f} className={`admin-filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Alle' : `${AMPEL_META[f].emoji} ${AMPEL_META[f].label}`}
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ampel</th><th>Klient</th><th>Einsätze</th><th>Summe</th>
                <th>Budget</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={6}>{search || filter !== 'all' ? 'Keine Treffer' : 'Keine Leistungen in diesem Monat'}</EmptyRow>
              ) : filtered.map(r => {
                const sm = statusMeta(CLOSING_STATUS, r.status)
                return (
                  <tr key={r.client_id} {...klickbareZeile(() => router.push(`/admin/monatsabschluss/${r.client_id}?year=${year}&month=${month}`))} style={{ cursor: 'pointer' }}>
                    <td><AmpelDot ampel={r.ampel} /></td>
                    <td style={{ fontWeight: 600 }}>{r.client}</td>
                    <td>{r.recordCount}</td>
                    <td>{euro(r.totalAmount)}</td>
                    <td>{r.budgetSummary ? <BudgetBar summary={r.budgetSummary} compact /> : <span style={{ color: 'var(--ink5)' }}>—</span>}</td>
                    <td><StatusBadge label={sm.label} color={sm.color} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function AdminMonatsabschlussPage() {
  return (
    <Suspense fallback={<div className="admin-page"><h1>Monatsabschluss-Assistent</h1><p>Laden…</p></div>}>
      <MonatsabschlussInner />
    </Suspense>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14,
  background: 'var(--coal2)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', cursor: 'pointer',
}
