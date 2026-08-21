'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  euro, formatDate, fullName, summarizeBudget, AMPEL_META,
  ENTLASTUNGSBETRAG_MONAT, type Ampel, type BudgetSummary,
} from '@/lib/admin/ops'
import { AmpelDot, BudgetBar, Banner, SearchInput, EmptyRow } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger'
import { klickbareZeile } from '@/lib/a11y'
const log = logger.child('admin:budgets')

interface BudgetRow {
  client_id: string
  name: string
  summary: BudgetSummary
  carryover_expires: string | null
}

export default function AdminBudgetsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<BudgetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | Ampel>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const year = new Date().getFullYear()
        const { data, error } = await supabase
          .from('client_budgets')
          .select('client_id, annual_amount, monthly_amount, carryover_amount, carryover_expires, used_amount, used_from_carryover, private_amount, client:clients(first_name, last_name)')
          .eq('year', year)
        if (error) { log.errorWithException('Budgets load error', error); setLoading(false); return }
        const mapped: BudgetRow[] = (data || []).map((b: any) => ({
          client_id: b.client_id,
          name: fullName(b.client),
          summary: summarizeBudget(b),
          carryover_expires: b.carryover_expires,
        })).sort((a: BudgetRow, b: BudgetRow) => b.summary.pct - a.summary.pct)
        setRows(mapped)
      } catch (err) {
        log.errorWithException('Budgets page error', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const counts = useMemo(() => ({
    gruen: rows.filter(r => r.summary.ampel === 'gruen').length,
    gelb: rows.filter(r => r.summary.ampel === 'gelb').length,
    rot: rows.filter(r => r.summary.ampel === 'rot').length,
  }), [rows])

  const carryoverSoon = rows.filter(r => r.summary.carryoverExpiresSoon)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.summary.ampel !== filter) return false
      if (q && !r.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, filter, search])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Budget-Übersicht</h1>
          <p className="admin-subtitle">Entlastungsbetrag §45b — {euro(ENTLASTUNGSBETRAG_MONAT)}/Monat · {rows.length} Klienten</p>
        </div>
      </div>

      <JahresuebertragPanel onFertig={() => window.location.reload()} />

      {/* Vorjahresübertrag-Warnung */}
      {carryoverSoon.length > 0 && (
        <Banner tone="warn">
          ⏳ Bei {carryoverSoon.length} Klient(en) verfällt der Vorjahresübertrag bald (30. Juni) — zuerst verbrauchen!
        </Banner>
      )}

      {/* Ampel-Zusammenfassung */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card" style={{ borderLeft: `3px solid ${AMPEL_META.gruen.color}` }}>
          <div className="admin-stat-value">{counts.gruen}</div>
          <div className="admin-stat-label">🟢 Im Rahmen</div>
        </div>
        <div className="admin-stat-card" style={{ borderLeft: `3px solid ${AMPEL_META.gelb.color}` }}>
          <div className="admin-stat-value">{counts.gelb}</div>
          <div className="admin-stat-label">🟡 Achtung (≥70%)</div>
        </div>
        <div className="admin-stat-card" style={{ borderLeft: `3px solid ${AMPEL_META.rot.color}` }}>
          <div className="admin-stat-value">{counts.rot}</div>
          <div className="admin-stat-label">🔴 Kritisch (&gt;95%)</div>
        </div>
      </div>

      <div style={{ margin: '20px 0 16px' }}>
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
                <th>Ampel</th><th>Klient</th><th>Auslastung</th><th>%</th>
                <th>Verfügbar</th><th>Verbleibend</th><th>Übertrag</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={7}>{search || filter !== 'all' ? 'Keine Treffer' : 'Noch keine Budgets hinterlegt'}</EmptyRow>
              ) : filtered.map(r => (
                <tr key={r.client_id} {...klickbareZeile(() => router.push(`/admin/clients/${r.client_id}`))} style={{ cursor: 'pointer' }}>
                  <td><AmpelDot ampel={r.summary.ampel} /></td>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td><BudgetBar summary={r.summary} compact /></td>
                  <td style={{ fontWeight: 600, color: AMPEL_META[r.summary.ampel].color }}>{r.summary.pct}%</td>
                  <td>{euro(r.summary.available)}</td>
                  <td style={{ color: r.summary.remaining < 0 ? '#D04B3B' : 'var(--ink2)', fontWeight: 600 }}>{euro(r.summary.remaining)}</td>
                  <td style={{ fontSize: 13 }}>
                    {r.summary.carryover > 0 ? (
                      <span style={{ color: r.summary.carryoverExpiresSoon ? '#E8A000' : r.summary.carryoverExpired ? '#D04B3B' : 'var(--ink3)' }}>
                        {euro(r.summary.carryover)}
                        {r.carryover_expires && <span style={{ display: 'block', fontSize: 11, color: 'var(--ink5)' }}>bis {formatDate(r.carryover_expires)}</span>}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Jahresübertrag § 45b — manuell auslösbar
// ═══════════════════════════════════════════════════════════════
// uebertrageJahresbudgets() hing bisher nur an POST /api/admin/budgets/
// jahresuebertrag, ohne Oberfläche und ohne Cron (Bereich 5 der
// Lückenanalyse). Der Übertrag ins Folgejahr verfällt am 30.06. — wenn
// ihn niemand auslöst, verfällt er ungenutzt.
//
// Der Cron /api/cron/jahresuebertrag läuft am 01.01.; dieser Knopf ist
// der Nachhol- und Korrekturweg (die Funktion ist idempotent: sie setzt
// carryover_amount, sie addiert nicht).
function JahresuebertragPanel({ onFertig }: { onFertig: () => void }) {
  const jetzt = new Date().getFullYear()
  const [offen, setOffen] = useState(false)
  const [vonJahr, setVonJahr] = useState(String(jetzt - 1))
  const [nachJahr, setNachJahr] = useState(String(jetzt))
  const [laeuft, setLaeuft] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ergebnis, setErgebnis] = useState<{ uebertragen: number; uebersprungen: number; fehler: string[] } | null>(null)

  async function starten() {
    setErr(null); setErgebnis(null); setLaeuft(true)
    try {
      const res = await fetch('/api/admin/budgets/jahresuebertrag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vonJahr: Number(vonJahr), nachJahr: Number(nachJahr) }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(json.error || 'Jahresübertrag fehlgeschlagen.'); return }
      setErgebnis({
        uebertragen: json.uebertragen ?? 0,
        uebersprungen: json.uebersprungen ?? 0,
        fehler: json.fehler ?? [],
      })
      if ((json.uebertragen ?? 0) > 0) onFertig()
    } catch (e: any) {
      setErr(e?.message || 'Jahresübertrag fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  if (!offen) {
    return (
      <div style={{ margin: '4px 0 16px' }}>
        <button className="admin-filter-btn" onClick={() => setOffen(true)}>
          Jahresübertrag § 45b auslösen
        </button>
      </div>
    )
  }

  return (
    <div className="admin-stat-card" style={{ padding: 20, margin: '4px 0 16px' }}>
      <h2 style={{ fontSize: 17, marginBottom: 8 }}>Jahresübertrag § 45b</h2>
      <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '0 0 12px' }}>
        Überträgt nicht verbrauchte Entlastungsbeträge ins Folgejahr (§ 45b Abs. 1 S. 5 SGB XI).
        Der Übertrag verfällt am 30.06. des Folgejahres. Verhinderungs-/Kurzzeitpflege wird
        nicht übertragen. Der Lauf ist wiederholbar — er setzt den Übertrag, er addiert ihn nicht.
      </p>
      {err && <Banner tone="danger">{err}</Banner>}
      {ergebnis && (
        <Banner tone={ergebnis.fehler.length > 0 ? 'warn' : 'info'}>
          {ergebnis.uebertragen} Budget(s) übertragen, {ergebnis.uebersprungen} ohne Restbetrag übersprungen.
          {ergebnis.fehler.length > 0 && ` ${ergebnis.fehler.length} Fehler: ${ergebnis.fehler.join(' | ')}`}
        </Banner>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10 }}>
        <label style={{ display: 'block' }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>von Jahr</span>
          <div><input type="number" value={vonJahr} onChange={e => setVonJahr(e.target.value)} style={jahrInput} /></div>
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>nach Jahr</span>
          <div><input type="number" value={nachJahr} onChange={e => setNachJahr(e.target.value)} style={jahrInput} /></div>
        </label>
        <button className="admin-filter-btn active" onClick={starten} disabled={laeuft}>
          {laeuft ? 'Läuft…' : 'Übertrag starten'}
        </button>
        <button className="admin-filter-btn" onClick={() => setOffen(false)} disabled={laeuft}>Schließen</button>
      </div>
    </div>
  )
}

const jahrInput: React.CSSProperties = {
  width: 110, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box',
}
