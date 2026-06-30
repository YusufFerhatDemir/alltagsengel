'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  euro, formatDate, fullName, statusMeta, INVOICE_STATUS,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface InvoiceRow {
  id: string
  invoice_number: string | null
  client_id: string
  client: string
  insurance_name: string | null
  period_start: string | null
  period_end: string | null
  total_amount: number | null
  budget_amount: number | null
  private_amount: number | null
  paid_amount: number | null
  status: string
  sent_at: string | null
  paid_at: string | null
}

interface OpenRecord {
  id: string
  date: string
  service_type: string | null
  duration_minutes: number | null
  amount: number | null
  budget_type: string | null
}

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  async function loadInvoices() {
    const supabase = createClient()
    const { data, error: e } = await supabase
      .from('invoices')
      .select('id, invoice_number, client_id, insurance_name, period_start, period_end, total_amount, budget_amount, private_amount, paid_amount, status, sent_at, paid_at, client:clients(first_name, last_name)')
      .order('created_at', { ascending: false })
    if (e) { setError(e.message); setLoading(false); return }
    setInvoices((data || []).map((i: any) => ({
      id: i.id, invoice_number: i.invoice_number, client_id: i.client_id, client: fullName(i.client),
      insurance_name: i.insurance_name, period_start: i.period_start, period_end: i.period_end,
      total_amount: i.total_amount, budget_amount: i.budget_amount, private_amount: i.private_amount,
      paid_amount: i.paid_amount, status: i.status, sent_at: i.sent_at, paid_at: i.paid_at,
    })))
    setLoading(false)
  }

  useEffect(() => { loadInvoices() }, [])

  // Status weiterschalten: draft → sent → paid
  async function advance(inv: InvoiceRow) {
    const supabase = createClient()
    if (inv.status === 'draft') {
      await supabase.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', inv.id)
      loadInvoices()
    } else if (inv.status === 'sent' || inv.status === 'partial' || inv.status === 'disputed') {
      const input = window.prompt(`Bezahlter Betrag für Rechnung ${inv.invoice_number || ''}?\n(Rechnungssumme: ${euro(inv.total_amount)})`, String(inv.total_amount ?? ''))
      if (input === null) return
      const paid = Number(input.replace(',', '.'))
      if (isNaN(paid)) { alert('Ungültiger Betrag'); return }
      const total = inv.total_amount ?? 0
      const diff = total - paid
      const fullyPaid = paid >= total
      await supabase.from('invoices').update({
        status: fullyPaid ? 'paid' : 'partial',
        paid_amount: paid,
        paid_at: new Date().toISOString(),
      }).eq('id', inv.id)
      // Kürzung dokumentieren
      if (diff > 0.005) {
        const reason = window.prompt('Grund der Kürzung dokumentieren:', '') || 'Kürzung durch Kostenträger'
        await supabase.from('invoice_disputes').insert({
          invoice_id: inv.id, original_amount: total, paid_amount: paid, difference: diff,
          reason, status: 'open',
        })
      }
      loadInvoices()
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return invoices.filter(i => {
      if (filter !== 'all' && i.status !== filter) return false
      if (!q) return true
      return i.client.toLowerCase().includes(q) || (i.invoice_number || '').toLowerCase().includes(q) || (i.insurance_name || '').toLowerCase().includes(q)
    })
  }, [invoices, filter, search])

  const totals = useMemo(() => ({
    open: invoices.filter(i => ['draft', 'sent', 'partial', 'disputed'].includes(i.status)).reduce((s, i) => s + (i.total_amount || 0), 0),
    paid: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.paid_amount || i.total_amount || 0), 0),
  }), [invoices])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Rechnungen</h1>
          <p className="admin-subtitle">{invoices.length} Rechnungen · {euro(totals.open)} offen · {euro(totals.paid)} bezahlt</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={primaryBtn}>+ Rechnung erstellen</button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Klient, Rechnungsnr., Kasse…" />
      </div>

      <div className="admin-filters">
        {['all', 'draft', 'sent', 'partial', 'paid', 'disputed', 'rejected'].map(f => (
          <button key={f} className={`admin-filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Alle' : statusMeta(INVOICE_STATUS, f).label}
            {f !== 'all' && ` (${invoices.filter(i => i.status === f).length})`}
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Rechnungsnr.</th><th>Klient</th><th>Kasse</th><th>Zeitraum</th>
                <th>Summe</th><th>Bezahlt</th><th>Status</th><th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={8}>{search || filter !== 'all' ? 'Keine Treffer' : 'Noch keine Rechnungen'}</EmptyRow>
              ) : filtered.map(i => {
                const sm = statusMeta(INVOICE_STATUS, i.status)
                const reduced = i.status === 'paid' && i.paid_amount != null && i.total_amount != null && i.paid_amount < i.total_amount
                return (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 600 }}>{i.invoice_number || '—'}</td>
                    <td>{i.client}</td>
                    <td style={{ fontSize: 13 }}>{i.insurance_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{formatDate(i.period_start)}–{formatDate(i.period_end)}</td>
                    <td>{euro(i.total_amount)}</td>
                    <td style={{ color: reduced ? '#D04B3B' : 'var(--ink2)' }}>
                      {i.paid_amount != null ? euro(i.paid_amount) : '—'}
                      {reduced && <span style={{ display: 'block', fontSize: 11 }}>−{euro((i.total_amount || 0) - (i.paid_amount || 0))}</span>}
                    </td>
                    <td><StatusBadge label={sm.label} color={sm.color} /></td>
                    <td>
                      {(i.status === 'draft' || i.status === 'sent' || i.status === 'partial' || i.status === 'disputed') ? (
                        <button onClick={() => advance(i)} style={actionBtn}>
                          {i.status === 'draft' ? 'Versenden →' : 'Zahlung erfassen'}
                        </button>
                      ) : <span style={{ color: 'var(--ink5)', fontSize: 12 }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateInvoiceModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadInvoices() }} />}
    </div>
  )
}

// ═══ Modal: Rechnung aus Leistungsnachweisen erstellen ═══
function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [clients, setClients] = useState<{ id: string; label: string; insurance_name: string | null; insurance_number: string | null }[]>([])
  const [clientId, setClientId] = useState('')
  const [records, setRecords] = useState<OpenRecord[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase.from('clients').select('id, first_name, last_name, insurance_name, insurance_number').order('last_name')
      setClients((data || []).map((c: any) => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim(), insurance_name: c.insurance_name, insurance_number: c.insurance_number })))
    }
    load()
  }, [])

  useEffect(() => {
    if (!clientId) { setRecords([]); setSelected(new Set()); return }
    async function loadRecords() {
      setLoadingRecords(true)
      const supabase = createClient()
      // Nur abgeschlossene/unterschriebene, noch nicht abgerechnete Nachweise
      const { data } = await supabase.from('service_records')
        .select('id, date, service_type, duration_minutes, amount, budget_type')
        .eq('client_id', clientId).in('status', ['complete', 'signed'])
        .order('date', { ascending: true })
      const recs = (data || []) as OpenRecord[]
      setRecords(recs)
      setSelected(new Set(recs.map(r => r.id)))
      setLoadingRecords(false)
    }
    loadRecords()
  }, [clientId])

  const chosen = records.filter(r => selected.has(r.id))
  const total = chosen.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const budgetTotal = chosen.filter(r => r.budget_type !== 'private').reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const privateTotal = chosen.filter(r => r.budget_type === 'private').reduce((s, r) => s + (Number(r.amount) || 0), 0)

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function create() {
    setErr(null)
    if (!clientId || chosen.length === 0) { setErr('Bitte Klient und mindestens einen Nachweis wählen.'); return }
    setSaving(true)
    try {
      const supabase = createClient()
      const client = clients.find(c => c.id === clientId)
      const dates = chosen.map(r => r.date).sort()
      const invoiceNumber = `RE-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`

      const { data: inv, error: invErr } = await supabase.from('invoices').insert({
        invoice_number: invoiceNumber,
        client_id: clientId,
        insurance_name: client?.insurance_name ?? null,
        insurance_number: client?.insurance_number ?? null,
        period_start: dates[0],
        period_end: dates[dates.length - 1],
        total_amount: total,
        budget_amount: budgetTotal,
        private_amount: privateTotal,
        status: 'draft',
      }).select('id').single()
      if (invErr || !inv) { setErr(`Fehler: ${invErr?.message}`); setSaving(false); return }

      const items = chosen.map(r => ({
        invoice_id: inv.id,
        service_record_id: r.id,
        description: r.service_type || 'Leistung',
        date: r.date,
        duration_minutes: r.duration_minutes,
        amount: r.amount,
        budget_type: r.budget_type,
      }))
      const { error: itemsErr } = await supabase.from('invoice_items').insert(items)
      if (itemsErr) { setErr(`Positionen-Fehler: ${itemsErr.message}`); setSaving(false); return }

      // Nachweise als abgerechnet markieren
      await supabase.from('service_records').update({ status: 'invoiced' }).in('id', chosen.map(r => r.id))
      onCreated()
    } catch (e: any) {
      setErr(`Unerwarteter Fehler: ${e.message}`)
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: 620, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>Rechnung aus Leistungsnachweisen</h3>
        <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '0 0 14px' }}>
          Bündelt abgeschlossene, noch nicht abgerechnete Nachweise zu einer Rechnung.
        </p>

        {err && <Banner tone="danger">{err}</Banner>}

        <span style={{ fontSize: 13, color: 'var(--ink3)', fontWeight: 600 }}>Klient</span>
        <select value={clientId} onChange={e => setClientId(e.target.value)} style={{ ...modalSelect, marginTop: 4, marginBottom: 12 }}>
          <option value="">— wählen —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>

        {clientId && (
          loadingRecords ? <p style={{ fontSize: 13 }}>Nachweise werden geladen…</p> : (
            records.length === 0 ? (
              <Banner tone="info">Keine offenen Nachweise für diesen Klienten.</Banner>
            ) : (
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12 }}>
                {records.map(r => (
                  <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                    <span style={{ flex: 1 }}>{formatDate(r.date)} · {r.service_type || 'Leistung'}</span>
                    <span style={{ color: 'var(--ink4)' }}>{r.duration_minutes ? `${r.duration_minutes}min` : ''}</span>
                    <span style={{ fontWeight: 600, color: 'var(--gold2)' }}>{euro(r.amount)}</span>
                  </label>
                ))}
              </div>
            )
          )
        )}

        {chosen.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, padding: '8px 0', marginBottom: 8 }}>
            <span>{chosen.length} Position(en)</span>
            <span style={{ color: 'var(--gold2)' }}>Summe: {euro(total)}</span>
          </div>
        )}

        <div className="admin-modal-btns">
          <button className="btn-cancel" onClick={onClose}>Abbrechen</button>
          <button className="btn-confirm" onClick={create} disabled={saving || chosen.length === 0}>
            {saving ? 'Erstellen…' : 'Rechnung erstellen'}
          </button>
        </div>
      </div>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const actionBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const modalSelect: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box',
}
