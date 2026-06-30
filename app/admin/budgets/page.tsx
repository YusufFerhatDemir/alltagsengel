'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  euro, formatDate, fullName, summarizeBudget, AMPEL_META,
  ENTLASTUNGSBETRAG_MONAT, type Ampel, type BudgetSummary,
} from '@/lib/admin/ops'
import { AmpelDot, BudgetBar, Banner, SearchInput, EmptyRow } from '@/components/admin/OpsUI'

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
        if (error) { console.error('Budgets load error:', error); setLoading(false); return }
        const mapped: BudgetRow[] = (data || []).map((b: any) => ({
          client_id: b.client_id,
          name: fullName(b.client),
          summary: summarizeBudget(b),
          carryover_expires: b.carryover_expires,
        })).sort((a: BudgetRow, b: BudgetRow) => b.summary.pct - a.summary.pct)
        setRows(mapped)
      } catch (err) {
        console.error('Budgets page error:', err)
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
                <tr key={r.client_id} onClick={() => router.push(`/admin/clients/${r.client_id}`)} style={{ cursor: 'pointer' }}>
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
