'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { euro, formatDate, fullName, statusMeta, DUNNING_STATUS } from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { klickbareZeile } from '@/lib/a11y'

interface DunningRow {
  id: string
  invoice_id: string
  invoice_number: string
  client_name: string
  dunning_level: string
  due_date: string
  days_overdue: number
  amount_due_cents: number
  amount_paid_cents: number
  amount_open_cents: number
  dunning_fee_cents: number
  block_dunning: boolean
  block_reason: string | null
  last_dunning_at: string | null
}

interface Overview {
  total: number
  totalOpenCents: number
  totalOverdueCents: number
  blockedCount: number
  byLevel: Record<string, number>
}

const LEVEL_FILTERS = [
  { key: 'all', label: 'Alle' },
  { key: 'offen', label: 'Offen' },
  { key: 'erinnerung', label: 'Erinnerung' },
  { key: 'mahnung_1', label: '1. Mahnung' },
  { key: 'mahnung_2', label: '2. Mahnung' },
  { key: 'letzte_mahnung', label: 'Letzte Mahnung' },
  { key: 'inkasso_vorbereitung', label: 'Inkasso' },
]

export default function ForderungenPage() {
  const [entries, setEntries] = useState<DunningRow[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/billing/dunning')
      const json = await res.json()
      if (!res.ok) { setError(json.error); setLoading(false); return }

      setOverview(json.overview)
      setEntries((json.entries || []).map((e: any) => ({
        id: e.id,
        invoice_id: e.invoice_id,
        invoice_number: e.invoice?.invoice_number_formatted || e.invoice?.invoice_number || '—',
        client_name: e.invoice?.client ? fullName(e.invoice.client) : '—',
        dunning_level: e.dunning_level,
        due_date: e.due_date,
        days_overdue: e.days_overdue || 0,
        amount_due_cents: e.amount_due_cents || 0,
        amount_paid_cents: e.amount_paid_cents || 0,
        amount_open_cents: (e.amount_due_cents || 0) - (e.amount_paid_cents || 0),
        dunning_fee_cents: e.dunning_fee_cents || 0,
        block_dunning: e.block_dunning,
        block_reason: e.block_reason,
        last_dunning_at: e.last_dunning_at,
      })))
      setLoading(false)
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleAdvance(invoiceId: string) {
    setActionBusy(invoiceId)
    setError(null)
    try {
      const res = await fetch('/api/billing/dunning/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      })
      const json = await res.json()
      if (!res.ok) setError(json.error || 'Fehler')
      else await load()
    } catch (e: any) {
      setError(e.message)
    }
    setActionBusy(null)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter(e => {
      if (filter !== 'all' && e.dunning_level !== filter) return false
      if (!q) return true
      return e.client_name.toLowerCase().includes(q) || e.invoice_number.toLowerCase().includes(q)
    })
  }, [entries, filter, search])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Forderungsmanagement</h1>
          <p className="admin-subtitle">
            {overview ? `${overview.total} offene Forderungen · ${euro(overview.totalOpenCents / 100)} offen · ${euro(overview.totalOverdueCents / 100)} überfällig` : 'Laden…'}
          </p>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, margin: '12px 0 16px' }}>
          <StatCard label="Offene Forderungen" value={String(overview.total)} />
          <StatCard label="Offener Betrag" value={euro(overview.totalOpenCents / 100)} color="#D04B3B" />
          <StatCard label="Überfällig" value={euro(overview.totalOverdueCents / 100)} color="#B71C1C" />
          <StatCard label="Blockiert" value={String(overview.blockedCount)} color={overview.blockedCount > 0 ? '#E8A000' : undefined} />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Klient, Rechnungsnr.…" />
      </div>

      <div className="admin-filters">
        {LEVEL_FILTERS.map(f => {
          const count = f.key === 'all' ? entries.length : entries.filter(e => e.dunning_level === f.key).length
          return (
            <button key={f.key} className={`admin-filter-btn ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label} {f.key !== 'all' && count > 0 && `(${count})`}
            </button>
          )
        })}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Rechnung</th><th>Klient</th><th>Fällig</th><th>Tage</th>
                <th>Forderung</th><th>Offen</th><th>Gebühren</th><th>Stufe</th><th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={9}>{search || filter !== 'all' ? 'Keine Treffer' : 'Keine offenen Forderungen'}</EmptyRow>
              ) : filtered.map(e => {
                const sm = statusMeta(DUNNING_STATUS, e.dunning_level)
                const canAdvance = !e.block_dunning && e.dunning_level !== 'inkasso_vorbereitung'
                return (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 600, cursor: 'pointer' }} {...klickbareZeile(() => { window.location.href = `/admin/rechnungen/${e.invoice_id}` })}>
                      {e.invoice_number}
                    </td>
                    <td>{e.client_name}</td>
                    <td style={{ fontSize: 13 }}>{formatDate(e.due_date)}</td>
                    <td style={{ color: e.days_overdue > 30 ? '#D04B3B' : 'var(--ink4)', fontWeight: e.days_overdue > 30 ? 600 : 400 }}>
                      {e.days_overdue > 0 ? `${e.days_overdue}d` : '—'}
                    </td>
                    <td>{euro(e.amount_due_cents / 100)}</td>
                    <td style={{ fontWeight: 600, color: '#D04B3B' }}>{euro(e.amount_open_cents / 100)}</td>
                    <td style={{ fontSize: 13 }}>{e.dunning_fee_cents > 0 ? euro(e.dunning_fee_cents / 100) : '—'}</td>
                    <td><StatusBadge label={sm.label} color={sm.color} /></td>
                    <td>
                      {e.block_dunning ? (
                        <span style={{ fontSize: 11, color: 'var(--ink5)' }} title={e.block_reason || ''}>Blockiert</span>
                      ) : canAdvance ? (
                        <button onClick={() => handleAdvance(e.invoice_id)} disabled={actionBusy === e.invoice_id} style={actionBtn}>
                          {actionBusy === e.invoice_id ? '…' : 'Mahnen →'}
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--ink5)' }}>—</span>
                      )}
                    </td>
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

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--coal3)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--ink4)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--ink)' }}>{value}</div>
    </div>
  )
}

const actionBtn: React.CSSProperties = {
  fontSize: 12, color: '#D04B3B', background: 'rgba(208,75,59,0.1)',
  border: '1px solid rgba(208,75,59,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
