'use client'
import { useEffect, useMemo, useState } from 'react'
import { euro, formatDate, statusMeta, MATCHING_STATUS } from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import Link from 'next/link'

interface PaymentRow {
  id: string
  payment_date: string
  amount_cents: number
  allocated_cents: number
  unallocated_cents: number
  payment_method: string
  payer_name: string | null
  payer_type: string
  bank_reference: string | null
  verwendungszweck: string | null
  matching_status: string
  allocation_count: number
}

const METHOD_LABELS: Record<string, string> = {
  ueberweisung: 'Überweisung', lastschrift: 'Lastschrift', bar: 'Bar', scheck: 'Scheck',
  kassen_sammelueberweisung: 'Kassen-Sammelüberw.', rueckzahlung: 'Rückzahlung',
}

const FILTERS = [
  { key: 'all', label: 'Alle' },
  { key: 'nicht_zugeordnet', label: 'Nicht zugeordnet' },
  { key: 'zuordnung_vorschlag', label: 'Vorschläge' },
  { key: 'teilweise_zugeordnet', label: 'Teilweise' },
  { key: 'manuell_zugeordnet', label: 'Manuell' },
  { key: 'automatisch_zugeordnet', label: 'Automatisch' },
]

export default function ZahlungseingaengePage() {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/billing/payments')
      const json = await res.json()
      if (!res.ok) { setError(json.error); setLoading(false); return }
      setPayments((json.payments || []).map((p: any) => ({
        id: p.id,
        payment_date: p.payment_date,
        amount_cents: p.amount_cents,
        allocated_cents: p.allocated_cents || 0,
        unallocated_cents: p.amount_cents - (p.allocated_cents || 0),
        payment_method: p.payment_method,
        payer_name: p.payer_name,
        payer_type: p.payer_type,
        bank_reference: p.bank_reference,
        verwendungszweck: p.verwendungszweck,
        matching_status: p.matching_status,
        allocation_count: (p.payment_allocations || []).length,
      })))
      setLoading(false)
    } catch (e: any) {
      setError(e.message); setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return payments.filter(p => {
      if (filter !== 'all' && p.matching_status !== filter) return false
      if (!q) return true
      return (p.payer_name || '').toLowerCase().includes(q)
        || (p.bank_reference || '').toLowerCase().includes(q)
        || (p.verwendungszweck || '').toLowerCase().includes(q)
    })
  }, [payments, filter, search])

  const totals = useMemo(() => ({
    total: payments.reduce((s, p) => s + p.amount_cents, 0),
    unallocated: payments.reduce((s, p) => s + p.unallocated_cents, 0),
    unmatched: payments.filter(p => p.matching_status === 'nicht_zugeordnet').length,
  }), [payments])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Zahlungseingänge</h1>
          <p className="admin-subtitle">
            {payments.length} Zahlungen · {euro(totals.total / 100)} gesamt · {euro(totals.unallocated / 100)} nicht zugeordnet
            {totals.unmatched > 0 && <span style={{ color: '#D04B3B' }}> · {totals.unmatched} offen</span>}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} style={primaryBtn}>+ Zahlung erfassen</button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Zahler, Referenz, Verwendungszweck…" />
        </div>
      </div>

      <div className="admin-filters">
        {FILTERS.map(f => {
          const count = f.key === 'all' ? payments.length : payments.filter(p => p.matching_status === f.key).length
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
                <th>Datum</th><th>Betrag</th><th>Methode</th><th>Zahler</th>
                <th>Verwendungszweck</th><th>Zugeordnet</th><th>Status</th><th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={8}>Keine Zahlungen</EmptyRow>
              ) : filtered.map(p => {
                const sm = statusMeta(MATCHING_STATUS, p.matching_status)
                const hasUnallocated = p.unallocated_cents > 0
                return (
                  <tr key={p.id}>
                    <td>{formatDate(p.payment_date)}</td>
                    <td style={{ fontWeight: 600 }}>{euro(p.amount_cents / 100)}</td>
                    <td style={{ fontSize: 12 }}>{METHOD_LABELS[p.payment_method] || p.payment_method}</td>
                    <td>{p.payer_name || '—'}</td>
                    <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.verwendungszweck || '—'}
                    </td>
                    <td>
                      {euro(p.allocated_cents / 100)}
                      {hasUnallocated && <span style={{ color: '#D04B3B', fontSize: 11, display: 'block' }}>
                        {euro(p.unallocated_cents / 100)} offen
                      </span>}
                    </td>
                    <td><StatusBadge label={sm.label} color={sm.color} /></td>
                    <td>
                      {hasUnallocated ? (
                        <Link href={`/admin/zahlungseingaenge/zuordnung?paymentId=${p.id}`} style={actionBtn}>
                          Zuordnen →
                        </Link>
                      ) : <span style={{ fontSize: 11, color: 'var(--ink5)' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreatePaymentModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load() }} />}
    </div>
  )
}

function CreatePaymentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    paymentDate: new Date().toISOString().split('T')[0],
    amount: '',
    paymentMethod: 'ueberweisung',
    payerType: 'kunde',
    payerName: '',
    bankReference: '',
    verwendungszweck: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setErr(null)
    const cents = Math.round(Number(form.amount.replace(',', '.')) * 100)
    if (isNaN(cents) || cents <= 0) { setErr('Ungültiger Betrag'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/billing/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentDate: form.paymentDate,
          amountCents: cents,
          paymentMethod: form.paymentMethod,
          payerType: form.payerType,
          payerName: form.payerName || undefined,
          bankReference: form.bankReference || undefined,
          verwendungszweck: form.verwendungszweck || undefined,
          notes: form.notes || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error); setSaving(false); return }
      onCreated()
    } catch (e: any) {
      setErr(e.message); setSaving(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
    fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
    boxSizing: 'border-box',
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: 520, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>Zahlung erfassen</h3>
        {err && <Banner tone="danger">{err}</Banner>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <label style={lbl}>Datum<input type="date" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} style={inp} /></label>
          <label style={lbl}>Betrag (EUR)<input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="123,45" style={inp} /></label>
          <label style={lbl}>Methode
            <select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))} style={inp}>
              {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label style={lbl}>Zahlertyp
            <select value={form.payerType} onChange={e => setForm(f => ({ ...f, payerType: e.target.value }))} style={inp}>
              <option value="kunde">Kunde</option>
              <option value="kostentraeger">Kostenträger</option>
              <option value="sonstiger">Sonstiger</option>
            </select>
          </label>
        </div>
        <label style={lbl}>Zahlername<input value={form.payerName} onChange={e => setForm(f => ({ ...f, payerName: e.target.value }))} style={inp} /></label>
        <label style={lbl}>Bankreferenz<input value={form.bankReference} onChange={e => setForm(f => ({ ...f, bankReference: e.target.value }))} style={inp} /></label>
        <label style={lbl}>Verwendungszweck<input value={form.verwendungszweck} onChange={e => setForm(f => ({ ...f, verwendungszweck: e.target.value }))} style={inp} /></label>
        <label style={lbl}>Notizen<textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={inp} /></label>

        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose}>Abbrechen</button>
          <button className="btn-confirm" onClick={submit} disabled={saving}>{saving ? 'Speichern…' : 'Zahlung erfassen'}</button>
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
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', textDecoration: 'none',
}
const lbl: React.CSSProperties = { fontSize: 12, color: 'var(--ink3)', fontWeight: 600, display: 'block', marginBottom: 8 }
