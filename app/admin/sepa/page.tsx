'use client'

import { datumBerlin, heuteBerlin } from '@/lib/utils/timezone';
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IconMoney, IconDocument } from '@/components/Icons'

import { euroZuCent } from '@/lib/geld'
// ═══════════════════════════════════════════════════════════════
// SEPA-Lastschrift Verwaltung
// Mandate anlegen, Sammelaufträge erstellen, XML exportieren
// ═══════════════════════════════════════════════════════════════

interface Mandate {
  id: string
  client_id: string
  mandate_reference: string
  mandate_date: string
  mandate_type: string
  sequence_type: string
  debtor_name: string
  debtor_iban: string
  status: string
  last_used_at: string | null
  client?: { first_name: string; last_name: string; client_number?: string }
}

interface Batch {
  id: string
  batch_number: string
  batch_date: string
  total_items: number
  total_cents: number
  status: string
  requested_collection_date: string
  xml_storage_path: string | null
}

type Tab = 'mandate' | 'batches'

export default function SepaPage() {
  const [tab, setTab] = useState<Tab>('mandate')
  const [mandates, setMandates] = useState<Mandate[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewMandate, setShowNewMandate] = useState(false)
  const [showNewBatch, setShowNewBatch] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [mRes, bRes] = await Promise.all([
        fetch('/api/billing/sepa/mandates'),
        fetch('/api/billing/sepa/batches'),
      ])
      if (mRes.ok) setMandates(await mRes.json())
      if (bRes.ok) setBatches(await bRes.json())
    } catch { /* */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const formatCurrency = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'
  const formatIban = (iban: string) => iban.replace(/(.{4})/g, '$1 ').trim()

  const STATUS_COLORS: Record<string, string> = {
    aktiv: '#22c55e', pausiert: '#f59e0b', widerrufen: '#ef4444', abgelaufen: '#9ca3af',
    erstellt: '#3b82f6', freigegeben: '#22c55e', exportiert: '#8b5cf6', eingereicht: '#f59e0b',
    verarbeitet: '#22c55e', fehlerhaft: '#ef4444',
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <IconMoney size={28} color="#c8a84e" />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>SEPA-Lastschrift</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['mandate', 'batches'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: tab === t ? '#1a365d' : '#f1f5f9', color: tab === t ? '#fff' : '#333',
            fontWeight: tab === t ? 600 : 400, fontSize: 14,
          }}>
            {t === 'mandate' ? 'Mandate' : 'Sammelaufträge'}
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : tab === 'mandate' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 14, color: '#666' }}>{mandates.length} Mandate</span>
            <button onClick={() => setShowNewMandate(true)} style={btnStyle}>
              + Neues Mandat
            </button>
          </div>

          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Klient</th>
                <th style={thStyle}>Mandatsreferenz</th>
                <th style={thStyle}>IBAN</th>
                <th style={thStyle}>Datum</th>
                <th style={thStyle}>Typ</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {mandates.map(m => (
                <tr key={m.id}>
                  <td style={tdStyle}>
                    {m.client ? `${m.client.first_name} ${m.client.last_name}` : m.debtor_name}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{m.mandate_reference}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{formatIban(m.debtor_iban)}</td>
                  <td style={tdStyle}>{formatDate(m.mandate_date)}</td>
                  <td style={tdStyle}>{m.mandate_type} / {m.sequence_type}</td>
                  <td style={tdStyle}>
                    <span style={{ ...badgeStyle, background: STATUS_COLORS[m.status] || '#999' }}>
                      {m.status}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {m.status === 'aktiv' && (
                      <button onClick={() => revokeMandate(m.id)} style={actionBtnStyle} title="Widerrufen">
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {mandates.length === 0 && (
                <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#999' }}>
                  Keine Mandate vorhanden. Erstellen Sie ein neues Mandat.
                </td></tr>
              )}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 14, color: '#666' }}>{batches.length} Sammelaufträge</span>
            <button onClick={() => setShowNewBatch(true)} style={btnStyle}>
              + Neuer Sammelauftrag
            </button>
          </div>

          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Batch-Nr.</th>
                <th style={thStyle}>Datum</th>
                <th style={thStyle}>Einzugsdatum</th>
                <th style={thStyle}>Positionen</th>
                <th style={thStyle}>Summe</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>XML</th>
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{b.batch_number}</td>
                  <td style={tdStyle}>{formatDate(b.batch_date)}</td>
                  <td style={tdStyle}>{formatDate(b.requested_collection_date)}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{b.total_items}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(b.total_cents)}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ ...badgeStyle, background: STATUS_COLORS[b.status] || '#999' }}>
                      {b.status}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {b.xml_storage_path && (
                      <button onClick={() => downloadXml(b.id, b.batch_number)} style={actionBtnStyle} title="XML herunterladen">
                        ↓
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#999' }}>
                  Noch keine Sammelaufträge erstellt.
                </td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {showNewMandate && <NewMandateDialog onClose={() => setShowNewMandate(false)} onSaved={() => { setShowNewMandate(false); loadData() }} />}
      {showNewBatch && <NewBatchDialog onClose={() => setShowNewBatch(false)} onSaved={() => { setShowNewBatch(false); loadData() }} />}
    </div>
  )

  async function revokeMandate(id: string) {
    if (!confirm('Mandat wirklich widerrufen?')) return
    const reason = prompt('Grund für Widerruf:')
    if (!reason) return
    await fetch(`/api/billing/sepa/mandates/${id}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    loadData()
  }

  async function downloadXml(batchId: string, batchNumber: string) {
    const supabase = createClient()
    const { data: batch } = await supabase
      .from('sepa_batches')
      .select('xml_storage_path')
      .eq('id', batchId)
      .single()

    if (!batch?.xml_storage_path) return

    const { data } = await supabase.storage
      .from('documents')
      .download(batch.xml_storage_path)

    if (data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = `${batchNumber}.xml`
      a.click()
      URL.revokeObjectURL(url)
    }
  }
}

// ---------------------------------------------------------------------------
// NewMandateDialog
// ---------------------------------------------------------------------------
function NewMandateDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [clientId, setClientId] = useState('')
  const [debtorName, setDebtorName] = useState('')
  const [debtorIban, setDebtorIban] = useState('')
  const [debtorBic, setDebtorBic] = useState('')
  const [mandateDate, setMandateDate] = useState(() => heuteBerlin())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('clients').select('id, first_name, last_name').then(({ data }: { data: any[] | null }) => {
      setClients((data || []).map((c: any) => ({ id: c.id, name: `${c.first_name} ${c.last_name}` })))
    })
  }, [])

  // Wenn Client gewählt wird, Name vorbelegen
  useEffect(() => {
    const c = clients.find(c => c.id === clientId)
    if (c && !debtorName) setDebtorName(c.name)
  }, [clientId, clients, debtorName])

  async function save() {
    setErr(null)
    if (!clientId) { setErr('Bitte Klient wählen.'); return }
    if (!debtorIban.trim()) { setErr('IBAN erforderlich.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/billing/sepa/mandates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, debtorName, debtorIban, debtorBic: debtorBic || undefined, mandateDate }),
      })
      if (res.ok) onSaved()
      else {
        const data = await res.json()
        setErr(data.error || 'Fehler beim Speichern')
      }
    } catch { setErr('Netzwerkfehler') }
    setSaving(false)
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>Neues SEPA-Mandat</h3>
        {err && <div style={errStyle}>{err}</div>}
        <Field label="Klient *">
          <select value={clientId} onChange={e => setClientId(e.target.value)} style={modalInput}>
            <option value="">— Klient wählen —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Kontoinhaber *"><input value={debtorName} onChange={e => setDebtorName(e.target.value)} style={modalInput} /></Field>
        <Field label="IBAN *"><input value={debtorIban} onChange={e => setDebtorIban(e.target.value)} placeholder="DE89 3704 0044 0532 0130 00" style={modalInput} /></Field>
        <Field label="BIC (optional)"><input value={debtorBic} onChange={e => setDebtorBic(e.target.value)} style={modalInput} /></Field>
        <Field label="Mandatsdatum *"><input type="date" value={mandateDate} onChange={e => setMandateDate(e.target.value)} style={modalInput} /></Field>
        <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Abbrechen</button>
          <button onClick={save} disabled={saving} style={btnStyle}>{saving ? 'Speichern…' : 'Mandat anlegen'}</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// NewBatchDialog
// ---------------------------------------------------------------------------
function NewBatchDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [invoices, setInvoices] = useState<{ id: string; number: string; amount: number; clientName: string }[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collectionDate, setCollectionDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 5)
    return datumBerlin(d)
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    // Offene Privatrechnungen laden (billing_type = 'privat' oder keine Kasse)
    supabase.from('invoices')
      .select('id, invoice_number, invoice_number_formatted, total_amount, paid_amount, billing_type, client:clients(first_name, last_name)')
      .in('status', ['offen', 'faellig', 'ueberfaellig', 'teilweise_bezahlt'])
      .is('deleted_at', null)
      .then(({ data }: { data: any[] | null }) => {
        setInvoices((data || []).map((inv: any) => ({
          id: inv.id,
          number: inv.invoice_number_formatted || inv.invoice_number || '',
          amount: euroZuCent(inv.total_amount || 0) - euroZuCent(inv.paid_amount || 0),
          clientName: inv.client ? `${inv.client.first_name} ${inv.client.last_name}` : '—',
        })).filter((i: any) => i.amount > 0))
      })
  }, [])

  function toggleAll() {
    if (selected.size === invoices.length) setSelected(new Set())
    else setSelected(new Set(invoices.map(i => i.id)))
  }

  async function createBatch() {
    setErr(null)
    if (selected.size === 0) { setErr('Mindestens eine Rechnung auswählen.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/billing/sepa/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: [...selected], requestedCollectionDate: collectionDate }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult(data)
      } else {
        setErr(data.error || 'Fehler')
      }
    } catch { setErr('Netzwerkfehler') }
    setSaving(false)
  }

  const formatCurrency = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`
  const totalSelected = invoices.filter(i => selected.has(i.id)).reduce((s, i) => s + i.amount, 0)

  if (result) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#22c55e' }}>SEPA-Batch erstellt</h3>
          <p><strong>Batch:</strong> {result.batchNumber}</p>
          <p><strong>Positionen:</strong> {result.totalItems}</p>
          <p><strong>Summe:</strong> {formatCurrency(result.totalCents)}</p>
          {result.skipped?.length > 0 && (
            <div style={{ marginTop: 10, padding: 10, background: '#fef3c7', borderRadius: 6, fontSize: 13 }}>
              <strong>Übersprungen:</strong>
              {result.skipped.map((s: any, i: number) => <div key={i}>{s.reason}</div>)}
            </div>
          )}
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <button onClick={onSaved} style={btnStyle}>Schließen</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 700 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>Neuer SEPA-Sammelauftrag</h3>
        {err && <div style={errStyle}>{err}</div>}

        <Field label="Einzugsdatum *"><input type="date" value={collectionDate} onChange={e => setCollectionDate(e.target.value)} style={modalInput} /></Field>

        <div style={{ marginTop: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, color: '#666' }}>{invoices.length} offene Rechnungen</span>
          <label style={{ fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.size === invoices.length && invoices.length > 0} onChange={toggleAll} /> Alle auswählen
          </label>
        </div>

        <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
          <table style={{ ...tableStyle, margin: 0 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 30 }}></th>
                <th style={thStyle}>Rechnung</th>
                <th style={thStyle}>Klient</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Offen</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td style={tdStyle}>
                    <input type="checkbox" checked={selected.has(inv.id)}
                      onChange={() => {
                        const next = new Set(selected)
                        next.has(inv.id) ? next.delete(inv.id) : next.add(inv.id)
                        setSelected(next)
                      }} />
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{inv.number}</td>
                  <td style={tdStyle}>{inv.clientName}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(inv.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, padding: 10, background: '#f8f8f8', borderRadius: 6, fontSize: 14 }}>
          Ausgewählt: <strong>{selected.size}</strong> Rechnungen — Summe: <strong>{formatCurrency(totalSelected)}</strong>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Abbrechen</button>
          <button onClick={createBatch} disabled={saving} style={btnStyle}>
            {saving ? 'Erstellen…' : 'SEPA-Batch erstellen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared components + styles
// ---------------------------------------------------------------------------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'block', marginBottom: 12 }}><span style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{label}</span>{children}</label>
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 }
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }
const tdStyle: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }
const badgeStyle: React.CSSProperties = { display: 'inline-block', padding: '2px 10px', borderRadius: 99, color: '#fff', fontSize: 11, fontWeight: 600, textTransform: 'capitalize' as const }
const btnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1a365d', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }
const cancelBtnStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }
const actionBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }
const modalInput: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
const modalStyle: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 28, maxWidth: 480, width: '95%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }
const errStyle: React.CSSProperties = { padding: '8px 12px', background: '#fef2f2', color: '#dc2626', borderRadius: 6, fontSize: 13, marginBottom: 12 }
