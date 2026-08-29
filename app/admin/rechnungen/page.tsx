'use client'
import { heuteBerlin } from '@/lib/utils/timezone';
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  euro, formatDate, fullName, statusMeta, INVOICE_STATUS,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import Link from 'next/link'
import { klickbareZeile } from '@/lib/a11y'

interface InvoiceRow {
  id: string
  invoice_number: string | null
  client_id: string
  client: string
  insurance_name: string | null
  period_start: string | null
  period_end: string | null
  total_amount: number | null
  paid_amount: number | null
  status: string
  billing_type: string | null
  due_date: string | null
  dunning_level: string | null
}

const FILTERS: { key: string; label: string; matches: string[] }[] = [
  { key: 'all', label: 'Alle', matches: [] },
  { key: 'entwurf', label: 'Entwürfe', matches: ['draft', 'entwurf', 'geprueft'] },
  { key: 'freigegeben', label: 'Freigegeben', matches: ['freigegeben', 'uebermittelt', 'quittiert', 'sent', 'erneut_eingereicht'] },
  { key: 'bezahlt', label: 'Bezahlt', matches: ['paid', 'bezahlt', 'akzeptiert'] },
  { key: 'offen', label: 'Offen', matches: ['teilweise_bezahlt', 'partial', 'gekuerzt', 'strittig'] },
  { key: 'problem', label: 'Probleme', matches: ['abgelehnt', 'korrektur_erforderlich', 'storniert'] },
  // Ohne eigenen Eintrag waere eine abgeschriebene Rechnung nur unter
  // "Alle" auffindbar: sie ist weder offen noch bezahlt, und in die
  // Problemgruppe gehoert sie nicht — die Entscheidung ist ja gefallen.
  { key: 'abgeschrieben', label: 'Abgeschrieben', matches: ['abgeschrieben'] },
]

const OPEN_STATUSES = new Set([
  'draft', 'sent', 'partial', 'disputed',
  'entwurf', 'geprueft', 'freigegeben', 'uebermittelt', 'quittiert',
  'teilweise_bezahlt', 'gekuerzt', 'strittig', 'korrektur_erforderlich', 'erneut_eingereicht',
])
const PAID_STATUSES = new Set(['paid', 'bezahlt', 'akzeptiert'])

export default function RechnungenPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_number_formatted, client_id, insurance_name, period_start, period_end, total_amount, paid_amount, status, billing_type, due_date, dunning_level, client:clients(first_name, last_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500)
      setInvoices((data || []).map((i: any) => ({
        id: i.id,
        invoice_number: i.invoice_number_formatted || i.invoice_number,
        client_id: i.client_id,
        client: fullName(i.client),
        insurance_name: i.insurance_name,
        period_start: i.period_start,
        period_end: i.period_end,
        total_amount: i.total_amount,
        paid_amount: i.paid_amount,
        status: i.status,
        billing_type: i.billing_type,
        due_date: i.due_date,
        dunning_level: i.dunning_level,
      })))
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const f = FILTERS.find(x => x.key === filter)
    return invoices.filter(i => {
      if (f && f.matches.length > 0 && !f.matches.includes(i.status)) return false
      if (!q) return true
      return i.client.toLowerCase().includes(q) || (i.invoice_number || '').toLowerCase().includes(q)
    })
  }, [invoices, filter, search])

  const totals = useMemo(() => ({
    open: invoices.filter(i => OPEN_STATUSES.has(i.status)).reduce((s, i) => s + (i.total_amount || 0), 0),
    paid: invoices.filter(i => PAID_STATUSES.has(i.status)).reduce((s, i) => s + (i.paid_amount || i.total_amount || 0), 0),
    overdue: invoices.filter(i => i.due_date && i.due_date < heuteBerlin() && OPEN_STATUSES.has(i.status)).length,
  }), [invoices])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Rechnungsübersicht</h1>
          <p className="admin-subtitle">
            {invoices.length} Rechnungen · {euro(totals.open)} offen · {euro(totals.paid)} bezahlt
            {totals.overdue > 0 && <span style={{ color: '#D04B3B' }}> · {totals.overdue} überfällig</span>}
          </p>
        </div>
        <Link href="/admin/rechnungserstellung" style={primaryBtn}>+ Rechnung erstellen</Link>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Klient, Rechnungsnr.…" />
        </div>
      </div>

      <div className="admin-filters">
        {FILTERS.map(f => {
          const count = f.matches.length > 0 ? invoices.filter(i => f.matches.includes(i.status)).length : invoices.length
          return (
            <button key={f.key} className={`admin-filter-btn ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label} {f.key !== 'all' && `(${count})`}
            </button>
          )
        })}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Rechnungsnr.</th><th>Klient</th><th>Zeitraum</th><th>Typ</th>
                <th>Summe</th><th>Bezahlt</th><th>Fälligkeit</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={8}>{search || filter !== 'all' ? 'Keine Treffer' : 'Noch keine Rechnungen'}</EmptyRow>
              ) : filtered.map(i => {
                const sm = statusMeta(INVOICE_STATUS, i.status)
                const isOverdue = i.due_date && i.due_date < heuteBerlin() && OPEN_STATUSES.has(i.status)
                return (
                  <tr key={i.id} style={{ cursor: 'pointer' }} {...klickbareZeile(() => { window.location.href = `/admin/rechnungen/${i.id}` })}>
                    <td style={{ fontWeight: 600 }}>{i.invoice_number || '—'}</td>
                    <td>{i.client}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{formatDate(i.period_start)}–{formatDate(i.period_end)}</td>
                    <td style={{ fontSize: 12, textTransform: 'capitalize' }}>{i.billing_type || 'privat'}</td>
                    <td>{euro(i.total_amount)}</td>
                    <td style={{ color: i.paid_amount != null && i.total_amount != null && i.paid_amount < i.total_amount ? '#D04B3B' : 'var(--ink2)' }}>
                      {i.paid_amount != null ? euro(i.paid_amount) : '—'}
                    </td>
                    <td style={{ fontSize: 13, color: isOverdue ? '#D04B3B' : 'var(--ink4)', fontWeight: isOverdue ? 600 : 400 }}>
                      {i.due_date ? formatDate(i.due_date) : '—'}
                      {isOverdue && ' ⚠'}
                    </td>
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

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
  textDecoration: 'none', display: 'inline-block',
}
