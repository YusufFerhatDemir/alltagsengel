'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { euro, formatDate, fullName, statusMeta, INVOICE_STATUS } from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface CorrectionRow {
  id: string
  correction_type: string
  original_invoice_number: string
  correction_invoice_number: string
  original_amount_cents: number
  corrected_amount_cents: number
  difference_cents: number
  reason: string
  status: string
  client_name: string
  created_at: string
}

const TYPE_LABELS: Record<string, string> = {
  storno: 'Storno', teilstorno: 'Teilstorno', korrektur: 'Korrektur', gutschrift: 'Gutschrift',
}

export default function GutschriftenPage() {
  const [rows, setRows] = useState<CorrectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('invoice_corrections')
        .select(`
          id, correction_type, original_amount_cents, corrected_amount_cents, difference_cents,
          reason, status, created_at,
          original:invoices!invoice_corrections_original_invoice_id_fkey(invoice_number, invoice_number_formatted, client:clients(first_name, last_name)),
          correction:invoices!invoice_corrections_correction_invoice_id_fkey(invoice_number, invoice_number_formatted)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200)

      setRows((data || []).map((r: any) => ({
        id: r.id,
        correction_type: r.correction_type,
        original_invoice_number: r.original?.invoice_number_formatted || r.original?.invoice_number || '—',
        correction_invoice_number: r.correction?.invoice_number_formatted || r.correction?.invoice_number || '—',
        original_amount_cents: r.original_amount_cents || 0,
        corrected_amount_cents: r.corrected_amount_cents || 0,
        difference_cents: r.difference_cents || 0,
        reason: r.reason || '',
        status: r.status,
        client_name: r.original?.client ? fullName(r.original.client) : '—',
        created_at: r.created_at,
      })))
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.correction_type !== filter) return false
      if (!q) return true
      return r.client_name.toLowerCase().includes(q)
        || r.original_invoice_number.toLowerCase().includes(q)
        || r.correction_invoice_number.toLowerCase().includes(q)
    })
  }, [rows, filter, search])

  const totalDiff = rows.reduce((s, r) => s + r.difference_cents, 0)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Gutschriften & Korrekturen</h1>
          <p className="admin-subtitle">
            {rows.length} Einträge · Differenz gesamt: {euro(totalDiff / 100)}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Klient, Rechnungsnr.…" />
        </div>
      </div>

      <div className="admin-filters">
        {[{ key: 'all', label: 'Alle' }, ...Object.entries(TYPE_LABELS).map(([k, v]) => ({ key: k, label: v }))].map(f => (
          <button key={f.key} className={`admin-filter-btn ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label} {f.key !== 'all' && `(${rows.filter(r => r.correction_type === f.key).length})`}
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Typ</th><th>Original</th><th>Korrektur</th><th>Klient</th>
                <th>Original-Betrag</th><th>Korr.-Betrag</th><th>Differenz</th>
                <th>Grund</th><th>Status</th><th>Datum</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={10}>Keine Gutschriften oder Korrekturen</EmptyRow>
              ) : filtered.map(r => (
                <tr key={r.id}>
                  <td><span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: r.correction_type === 'storno' ? 'rgba(208,75,59,0.15)' : 'rgba(201,150,60,0.15)', color: r.correction_type === 'storno' ? '#D04B3B' : 'var(--gold2)' }}>
                    {TYPE_LABELS[r.correction_type] || r.correction_type}
                  </span></td>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{r.original_invoice_number}</td>
                  <td style={{ fontSize: 13 }}>{r.correction_invoice_number}</td>
                  <td>{r.client_name}</td>
                  <td>{euro(r.original_amount_cents / 100)}</td>
                  <td>{euro(r.corrected_amount_cents / 100)}</td>
                  <td style={{ fontWeight: 600, color: r.difference_cents < 0 ? '#D04B3B' : r.difference_cents > 0 ? '#5CB882' : 'var(--ink4)' }}>
                    {euro(r.difference_cents / 100)}
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason}>
                    {r.reason || '—'}
                  </td>
                  <td style={{ fontSize: 12, textTransform: 'capitalize' }}>{r.status}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
