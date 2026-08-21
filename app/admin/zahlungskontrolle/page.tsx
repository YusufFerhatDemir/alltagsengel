'use client'
import { heuteBerlin } from '@/lib/utils/timezone';
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  euro, formatDate, fullName, statusMeta, PAYMENT_STATUS,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { sendPaymentReminder, recordPayment } from './actions'
import { logger } from '@/lib/logger';
const log = logger.child('admin:zahlungskontrolle');

interface PaymentRow {
  id: string
  invoice_id: string
  invoice_number: string | null
  client: string
  status: string
  amount_due: number
  amount_paid: number
  due_date: string | null
  paid_date: string | null
  payment_method: string | null
  reminder_count: number
  last_reminder_at: string | null
  isOverdue: boolean
}

const today = () => heuteBerlin()

export default function AdminZahlungskontrollePage() {
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [paymentModal, setPaymentModal] = useState<PaymentRow | null>(null)
  const [reminderBusyId, setReminderBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error: e } = await supabase
        .from('payment_status')
        .select('id, invoice_id, status, amount_due, amount_paid, due_date, paid_date, payment_method, reminder_count, last_reminder_at, invoice:invoices(invoice_number, client:clients(first_name, last_name))')
        .order('due_date', { ascending: true })
      if (e) { setError(e.message); setLoading(false); return }
      const t = today()
      setRows((data || []).map((p: any) => ({
        id: p.id,
        invoice_id: p.invoice_id,
        invoice_number: p.invoice?.invoice_number ?? null,
        client: fullName(p.invoice?.client),
        status: p.status,
        amount_due: p.amount_due,
        amount_paid: p.amount_paid,
        due_date: p.due_date,
        paid_date: p.paid_date,
        payment_method: p.payment_method,
        reminder_count: p.reminder_count || 0,
        last_reminder_at: p.last_reminder_at,
        isOverdue: !!p.due_date && p.due_date < t && p.status !== 'bezahlt' && p.status !== 'storniert',
      })))
    } catch (err) {
      log.errorWithException('Zahlungskontrolle load error', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function sendReminder(row: PaymentRow) {
    setReminderBusyId(row.id)
    try {
      await sendPaymentReminder(row.id, row.reminder_count)
      await load()
    } catch (err: any) {
      log.errorWithException('Mahnung error', err)
      setError(err?.message || 'Mahnung fehlgeschlagen.')
    } finally {
      setReminderBusyId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false
      if (!q) return true
      return r.client.toLowerCase().includes(q) || (r.invoice_number || '').toLowerCase().includes(q)
    })
  }, [rows, filter, search])

  const overdueCount = rows.filter(r => r.isOverdue).length

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Zahlungskontrolle</h1>
          <p className="admin-subtitle">{rows.length} Rechnungen im Zahlungsstatus</p>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {overdueCount > 0 && <Banner tone="danger">❗ {overdueCount} überfällige Zahlung(en).</Banner>}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Klient, Rechnungsnr…" />
      </div>

      <div className="admin-filters">
        {['all', 'offen', 'teilbezahlt', 'bezahlt', 'ueberfaellig', 'storniert'].map(f => (
          <button key={f} className={`admin-filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Alle' : statusMeta(PAYMENT_STATUS, f).label}
            {f !== 'all' && ` (${rows.filter(r => r.status === f).length})`}
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Rechnungsnr.</th><th>Klient</th><th>Fällig</th><th>Betrag</th>
                <th>Bezahlt</th><th>Mahnungen</th><th>Status</th><th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={8}>{search || filter !== 'all' ? 'Keine Treffer' : 'Noch keine Zahlungsdaten'}</EmptyRow>
              ) : filtered.map(r => {
                const sm = statusMeta(PAYMENT_STATUS, r.status)
                return (
                  <tr key={r.id} style={r.isOverdue ? { background: 'rgba(208,75,59,.06)' } : undefined}>
                    <td style={{ fontWeight: 600 }}>{r.invoice_number || '—'}</td>
                    <td>{r.client}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13, color: r.isOverdue ? '#D04B3B' : 'var(--ink2)', fontWeight: r.isOverdue ? 600 : 400 }}>
                      {formatDate(r.due_date)}{r.isOverdue ? ' ⚠️' : ''}
                    </td>
                    <td>{euro(r.amount_due)}</td>
                    <td>{euro(r.amount_paid)}</td>
                    <td style={{ textAlign: 'center' }}>
                      {r.reminder_count > 0 ? (
                        <span title={r.last_reminder_at ? `Zuletzt: ${formatDate(r.last_reminder_at)}` : undefined}>{r.reminder_count}</span>
                      ) : '—'}
                    </td>
                    <td><StatusBadge label={sm.label} color={sm.color} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {r.status !== 'bezahlt' && r.status !== 'storniert' && (
                          <>
                            <button onClick={() => setPaymentModal(r)} style={actionBtn}>Zahlung erfassen</button>
                            <button onClick={() => sendReminder(r)} disabled={reminderBusyId === r.id} style={actionBtnSecondary}>
                              {reminderBusyId === r.id ? '…' : 'Mahnung senden'}
                            </button>
                          </>
                        )}
                        {(r.status === 'bezahlt' || r.status === 'storniert') && <span style={{ color: 'var(--ink5)', fontSize: 12 }}>—</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {paymentModal && (
        <PaymentModal
          row={paymentModal}
          onClose={() => setPaymentModal(null)}
          onSaved={() => { setPaymentModal(null); load() }}
        />
      )}
    </div>
  )
}

function PaymentModal({ row, onClose, onSaved }: {
  row: PaymentRow
  onClose: () => void
  onSaved: () => void
}) {
  const [amountPaid, setAmountPaid] = useState(String(row.amount_due))
  const [paidDate, setPaidDate] = useState(today())
  const [method, setMethod] = useState('überweisung')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null)
    const paid = Number(amountPaid.replace(',', '.'))
    if (isNaN(paid) || paid < 0) { setErr('Ungültiger Betrag.'); return }
    setSaving(true)
    try {
      await recordPayment(row.id, paid, paidDate, method, row.amount_due)
      onSaved()
    } catch (e: any) {
      setErr(e?.message || 'Unerwarteter Fehler.')
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: 420, width: '92%' }} onClick={e => e.stopPropagation()}>
        <h3>Zahlung erfassen</h3>
        <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '0 0 14px' }}>
          {row.invoice_number || 'Rechnung'} · {row.client} · offen: {euro(row.amount_due - row.amount_paid)}
        </p>
        {err && <Banner tone="danger">{err}</Banner>}
        <Field label="Bezahlter Betrag (€) *">
          <input value={amountPaid} onChange={e => setAmountPaid(e.target.value)} style={modalInput} />
        </Field>
        <Field label="Zahlungsdatum">
          <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} style={modalInput} />
        </Field>
        <Field label="Zahlungsart">
          <select value={method} onChange={e => setMethod(e.target.value)} style={modalInput}>
            <option value="überweisung">Überweisung</option>
            <option value="lastschrift">Lastschrift</option>
            <option value="bar">Bar</option>
            <option value="sonstige">Sonstige</option>
          </select>
        </Field>
        <div className="admin-modal-btns" style={{ marginTop: 14 }}>
          <button className="btn-cancel" onClick={onClose}>Abbrechen</button>
          <button className="btn-confirm" onClick={save} disabled={saving}>{saving ? 'Speichern…' : 'Zahlung speichern'}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{label}</span>
      <div style={{ marginTop: 3 }}>{children}</div>
    </div>
  )
}

const actionBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const actionBtnSecondary: React.CSSProperties = {
  fontSize: 12, color: 'var(--ink3)', background: 'var(--coal3)',
  border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const modalInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box',
}
