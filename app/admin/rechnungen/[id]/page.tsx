'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { euro, formatDate, fullName, statusMeta, INVOICE_STATUS } from '@/lib/admin/ops'
import { StatusBadge, Banner } from '@/components/admin/OpsUI'
import Link from 'next/link'

interface Invoice {
  id: string; invoice_number: string | null; invoice_number_formatted: string | null
  client_id: string; client_name: string
  insurance_name: string | null; insurance_number: string | null
  period_start: string; period_end: string
  total_amount: number; budget_amount: number | null; private_amount: number | null
  paid_amount: number | null; status: string
  billing_type: string | null; due_date: string | null; dunning_level: string | null
  frozen_at: string | null; sent_at: string | null; paid_at: string | null
  correction_of: string | null; correction_type: string | null
  kostentraeger_name: string | null; kostentraeger_ik: string | null; bundesland: string | null
  created_at: string
}

interface InvoiceItem {
  id: string; description: string; date: string
  duration_minutes: number | null; amount: number
  budget_type: string | null; tariff_preis_cent: number | null
  tariff_einheit: string | null
}

interface AuditEntry {
  id: string; action: string; created_at: string
  actor_id: string; previous_state: any; new_state: any
}

interface Allocation {
  id: string; amount_cents: number; allocation_type: string; allocated_at: string
  payment: { id: string; payment_date: string; payer_name: string | null } | null
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [inv, setInv] = useState<Invoice | null>(null)
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  async function load() {
    const supabase = createClient()

    const { data: invData, error: invErr } = await supabase
      .from('invoices')
      .select('*, client:clients(first_name, last_name)')
      .eq('id', id)
      .single()

    if (invErr || !invData) { setError('Rechnung nicht gefunden.'); setLoading(false); return }

    setInv({
      ...invData,
      client_name: fullName(invData.client),
      invoice_number: invData.invoice_number_formatted || invData.invoice_number,
    } as Invoice)

    const [itemsRes, auditRes, allocRes] = await Promise.all([
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('date'),
      supabase.from('billing_audit_trail').select('id, action, created_at, actor_id, previous_state, new_state')
        .eq('entity_id', id).order('created_at', { ascending: false }).limit(20),
      supabase.from('payment_allocations')
        .select('id, amount_cents, allocation_type, allocated_at, payment:payments(id, payment_date, payer_name)')
        .eq('invoice_id', id).order('allocated_at', { ascending: false }),
    ])

    setItems((itemsRes.data || []) as InvoiceItem[])
    setAudit((auditRes.data || []) as AuditEntry[])
    setAllocations((allocRes.data || []).map((a: any) => ({
      ...a,
      payment: Array.isArray(a.payment) ? a.payment[0] || null : a.payment,
    })) as Allocation[])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function handleAction(action: string) {
    setActionLoading(true)
    setError(null)
    try {
      const endpoint = action === 'freeze' ? `/api/billing/invoices/${id}/freeze`
        : action === 'cancel' ? `/api/billing/invoices/${id}/cancel`
        : action === 'pdf' ? `/api/admin/invoices/${id}/generate-pdf`
        // 'check' schliesst die Luecke entwurf → geprueft; ohne diesen Schritt
        // ist "Festschreiben" (verlangt 'geprueft') nicht erreichbar.
        : action === 'check' ? `/api/billing/invoices/${id}/status`
        : action === 'credit' ? `/api/billing/invoices/${id}/credit`
        : action === 'zahlung' ? `/api/billing/invoices/${id}/zahlung`
        : null
      if (!endpoint) return

      const body: any = {}
      if (action === 'cancel') {
        const reason = window.prompt('Storno-Grund:')
        if (!reason) { setActionLoading(false); return }
        body.reason = reason
      }
      if (action === 'check') {
        body.status = 'geprueft'
        body.reason = 'Sachliche Prüfung im Betriebssystem'
      }
      if (action === 'zahlung') {
        // Default ist die Vollzahlung des offenen Betrags — der haeufigste Fall.
        const openEuro = ((inv?.total_amount || 0) - (inv?.paid_amount || 0))
        const amountRaw = window.prompt(
          'Zahlungsbetrag in Euro (Enter = offener Betrag):',
          openEuro.toFixed(2).replace('.', ',')
        )
        if (amountRaw === null) { setActionLoading(false); return }
        if (amountRaw.trim()) {
          const cents = Math.round(Number(amountRaw.trim().replace(/\./g, '').replace(',', '.')) * 100)
          if (!Number.isFinite(cents) || cents <= 0) {
            setError('Ungültiger Zahlungsbetrag.')
            setActionLoading(false)
            return
          }
          body.amountCents = cents
        }
        const datum = window.prompt('Zahlungsdatum (JJJJ-MM-TT, Enter = heute):', '')
        if (datum === null) { setActionLoading(false); return }
        if (datum.trim()) body.paymentDate = datum.trim()
        const zahler = window.prompt('Zahler (optional):', '')
        if (zahler && zahler.trim()) body.payerName = zahler.trim()
      }
      if (action === 'credit') {
        // Eingabe in Euro, die API erwartet Cent.
        const amountRaw = window.prompt('Gutschriftbetrag in Euro (z. B. 35,00):')
        if (!amountRaw) { setActionLoading(false); return }
        const cents = Math.round(Number(amountRaw.trim().replace(/\./g, '').replace(',', '.')) * 100)
        if (!Number.isFinite(cents) || cents <= 0) {
          setError('Ungültiger Gutschriftbetrag.')
          setActionLoading(false)
          return
        }
        const reason = window.prompt('Grund der Gutschrift:')
        if (!reason) { setActionLoading(false); return }
        body.amountCents = cents
        body.reason = reason
      }

      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) setError(json.error || 'Fehler')
      else {
        // Die signierte PDF-URL laeuft ab — direkt oeffnen statt merken.
        if (action === 'pdf' && json.pdf_url) window.open(json.pdf_url, '_blank', 'noopener')
        await load()
      }
    } catch (e: any) {
      setError(e.message)
    }
    setActionLoading(false)
  }

  if (loading) return <div className="admin-page"><p>Laden…</p></div>
  if (!inv) return <div className="admin-page"><Banner tone="danger">{error || 'Nicht gefunden'}</Banner></div>

  const sm = statusMeta(INVOICE_STATUS, inv.status)
  const openAmount = (inv.total_amount || 0) - (inv.paid_amount || 0)
  const isTerminal = ['bezahlt', 'akzeptiert', 'storniert'].includes(inv.status)

  return (
    <div className="admin-page">
      <div style={{ marginBottom: 16 }}>
        <Link href="/admin/rechnungen" style={{ fontSize: 13, color: 'var(--gold2)' }}>← Zurück zur Übersicht</Link>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: 22 }}>Rechnung {inv.invoice_number || '(Entwurf)'}</h1>
          <p className="admin-subtitle">
            {inv.client_name} · {formatDate(inv.period_start)}–{formatDate(inv.period_end)}
            {inv.correction_type && <span> · {inv.correction_type.toUpperCase()} von {inv.correction_of?.slice(0, 8)}</span>}
          </p>
        </div>
        <StatusBadge label={sm.label} color={sm.color} />
      </div>

      {/* Kennzahlen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, margin: '16px 0' }}>
        <StatCard label="Gesamtbetrag" value={euro(inv.total_amount)} />
        <StatCard label="Bezahlt" value={euro(inv.paid_amount)} color={inv.paid_amount != null && inv.paid_amount >= inv.total_amount ? '#5CB882' : undefined} />
        <StatCard label="Offen" value={euro(openAmount)} color={openAmount > 0.01 ? '#D04B3B' : '#5CB882'} />
        <StatCard label="Abrechnungsart" value={inv.billing_type || 'privat'} />
        {inv.due_date && <StatCard label="Fälligkeit" value={formatDate(inv.due_date)} />}
        {inv.kostentraeger_name && <StatCard label="Kostenträger" value={inv.kostentraeger_name} />}
        {inv.bundesland && <StatCard label="Bundesland" value={inv.bundesland} />}
      </div>

      {/* Aktionen */}
      {!isTerminal && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {inv.status === 'entwurf' && (
            <ActionBtn label="Prüfen" onClick={() => handleAction('check')} loading={actionLoading} />
          )}
          {inv.status === 'geprueft' && !inv.frozen_at && (
            <ActionBtn label="Festschreiben" onClick={() => handleAction('freeze')} loading={actionLoading} />
          )}
          {/* Zahlung erst ab 'freigegeben' — auf einen Entwurf zahlt niemand.
              Alt-Status (z. B. 'sent') bleiben bewusst buchbar. */}
          {openAmount > 0.01 && !['entwurf', 'geprueft'].includes(inv.status) && (
            <ActionBtn label="Zahlung verbuchen" onClick={() => handleAction('zahlung')} loading={actionLoading} />
          )}
          {/* Gutschrift nur auf echten Rechnungen — nicht auf Korrekturbelegen. */}
          {!inv.correction_type && (
            <ActionBtn label="Gutschrift" onClick={() => handleAction('credit')} loading={actionLoading} />
          )}
          {!isTerminal && (
            <ActionBtn label="Stornieren" onClick={() => handleAction('cancel')} loading={actionLoading} danger />
          )}
          <ActionBtn label="PDF erstellen" onClick={() => handleAction('pdf')} loading={actionLoading} />
        </div>
      )}

      {/* E-Invoicing Downloads — immer verfügbar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <ActionBtn label="XRechnung XML" onClick={() => window.open(`/api/ops/rechnungen/${id}/xrechnung`, '_blank')} loading={false} />
        <ActionBtn label="ZUGFeRD PDF" onClick={() => window.open(`/api/ops/rechnungen/${id}/zugferd`, '_blank')} loading={false} />
      </div>

      {/* Positionen */}
      <h3 style={{ fontSize: 16, margin: '20px 0 8px' }}>Positionen ({items.length})</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Datum</th><th>Leistung</th><th>Dauer</th><th>Betrag</th><th>Budget-Typ</th></tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink5)' }}>Keine Positionen</td></tr>
            ) : items.map(item => (
              <tr key={item.id}>
                <td>{formatDate(item.date)}</td>
                <td>{item.description}</td>
                <td>{item.duration_minutes ? `${item.duration_minutes} min` : '—'}</td>
                <td style={{ fontWeight: 600 }}>{euro(item.amount)}</td>
                <td style={{ fontSize: 12, textTransform: 'capitalize' }}>{item.budget_type || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Zahlungszuordnungen */}
      {allocations.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, margin: '20px 0 8px' }}>Zahlungseingänge ({allocations.length})</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Datum</th><th>Betrag</th><th>Typ</th><th>Zahler</th></tr>
              </thead>
              <tbody>
                {allocations.map(a => (
                  <tr key={a.id}>
                    <td>{formatDate(a.payment?.payment_date || a.allocated_at)}</td>
                    <td style={{ fontWeight: 600 }}>{euro(a.amount_cents / 100)}</td>
                    <td style={{ fontSize: 12 }}>{a.allocation_type}</td>
                    <td>{a.payment?.payer_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Audit-Trail */}
      <h3 style={{ fontSize: 16, margin: '20px 0 8px' }}>Verlauf</h3>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {audit.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink5)' }}>Keine Einträge</p>
        ) : audit.map(a => (
          <div key={a.id} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <span style={{ color: 'var(--ink4)', whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString('de-DE')}</span>
            <span style={{ fontWeight: 500 }}>{a.action}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--coal3)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--ink4)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: color || 'var(--ink)' }}>{value}</div>
    </div>
  )
}

function ActionBtn({ label, onClick, loading, danger }: { label: string; onClick: () => void; loading: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
      padding: '6px 14px', borderRadius: 8, border: 'none',
      background: danger ? 'rgba(208,75,59,0.15)' : 'rgba(201,150,60,0.15)',
      color: danger ? '#D04B3B' : 'var(--gold2)',
    }}>
      {loading ? '…' : label}
    </button>
  )
}
