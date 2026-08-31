'use client'
import { useEffect, useState } from 'react'
import { KEINE_ZUORDNUNG_STATUS, alsPostgrestListe } from '@/lib/billing/status-vokabular'
import { parseBetragZuCent } from '@/lib/admin/betrag'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { euro, formatDate, fullName } from '@/lib/admin/ops'
import { Banner } from '@/components/admin/OpsUI'
import Link from 'next/link'

interface OpenInvoice {
  id: string
  invoice_number: string
  client_name: string
  total_amount: number
  paid_amount: number
  open_amount: number
  status: string
  period_start: string
  selected: boolean
  allocAmount: string
}

export default function ZuordnungPage() {
  const searchParams = useSearchParams()
  const paymentId = searchParams.get('paymentId')

  const [payment, setPayment] = useState<any>(null)
  const [invoices, setInvoices] = useState<OpenInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!paymentId) return
    async function load() {
      const supabase = createClient()

      // „Zahlung nicht gefunden." ist eine Aussage ueber den Bestand. Bei
      // gestoerter Abfrage ist sie falsch — und der Eingang bliebe
      // unzugeordnet liegen.
      const { data: pay, error: payErr } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .maybeSingle()
      if (payErr) { setError('Die Zahlung konnte nicht geladen werden. Bitte laden Sie die Seite neu.'); setLoading(false); return }
      if (!pay) { setError('Zahlung nicht gefunden.'); setLoading(false); return }
      setPayment(pay)

      const unallocated = pay.amount_cents - (pay.allocated_cents || 0)

      // Eine leere Rechnungsliste heisst „nichts zuzuordnen". Bei gestoerter
      // Abfrage stimmt das nicht, und der Zahlungseingang bliebe offen.
      const { data: invs, error: invsErr } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_number_formatted, total_amount, paid_amount, status, period_start, client:clients(first_name, last_name)')
        // Gemeinsame Liste — beide Vokabulare von invoices.status.
        .not('status', 'in', alsPostgrestListe(KEINE_ZUORDNUNG_STATUS))
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100)

      if (invsErr) { setError('Die offenen Rechnungen konnten nicht geladen werden. Bitte laden Sie die Seite neu.'); setLoading(false); return }

      setInvoices((invs || []).map((i: any) => {
        const total = Number(i.total_amount || 0)
        const paid = Number(i.paid_amount || 0)
        const open = Math.max(0, total - paid)
        return {
          id: i.id,
          invoice_number: i.invoice_number_formatted || i.invoice_number || '—',
          client_name: fullName(i.client),
          total_amount: total,
          paid_amount: paid,
          open_amount: open,
          status: i.status,
          period_start: i.period_start,
          selected: false,
          allocAmount: '',
        }
      }).filter(i => i.open_amount > 0))
      setLoading(false)
    }
    load()
  }, [paymentId])

  function toggleInvoice(id: string) {
    setInvoices(prev => prev.map(i => {
      if (i.id !== id) return i
      const sel = !i.selected
      return { ...i, selected: sel, allocAmount: sel ? String((Math.min(remaining(), i.open_amount * 100) / 100).toFixed(2).replace('.', ',')) : '' }
    }))
  }

  function setAllocAmount(id: string, val: string) {
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, allocAmount: val } : i))
  }

  // Eine leere oder unlesbare Eingabe zaehlt als 0 — die Zeile wird dann
  // durch den `amountCents > 0`-Filter aussortiert, statt als NaN in die
  // Summe zu laufen. Die Rundung liegt in parseBetragZuCent()
  // (euroZuCent), nicht in Math.round(x * 100): letzteres verfehlte den
  // exakten Halb-Cent und ordnete einen Cent zu wenig zu, was die
  // Rechnung als weiterhin offen stehen liess.
  function zuordnungCent(eingabe: string): number {
    const cent = parseBetragZuCent(eingabe)
    return Number.isFinite(cent) ? cent : 0
  }

  function remaining() {
    if (!payment) return 0
    const unallocated = payment.amount_cents - (payment.allocated_cents || 0)
    const allocated = invoices
      .filter(i => i.selected)
      .reduce((s, i) => s + zuordnungCent(i.allocAmount), 0)
    return unallocated - allocated
  }

  async function submit() {
    setError(null)
    const allocs = invoices
      .filter(i => i.selected)
      .map(i => ({
        invoiceId: i.id,
        amountCents: zuordnungCent(i.allocAmount),
      }))
      .filter(a => a.amountCents > 0)

    if (allocs.length === 0) { setError('Keine Zuordnungen ausgewählt.'); return }

    const totalAlloc = allocs.reduce((s, a) => s + a.amountCents, 0)
    const unallocated = payment.amount_cents - (payment.allocated_cents || 0)
    if (totalAlloc > unallocated) { setError(`Zuordnung (${euro(totalAlloc / 100)}) übersteigt verfügbaren Betrag (${euro(unallocated / 100)}).`); return }

    setSaving(true)
    try {
      const res = await fetch('/api/billing/payments/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, allocations: allocs }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error); setSaving(false); return }
      setSuccess(true)
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  if (!paymentId) return <div className="admin-page"><Banner tone="danger">Keine paymentId angegeben.</Banner></div>
  if (loading) return <div className="admin-page"><p>Laden…</p></div>
  if (success) return (
    <div className="admin-page">
      <Banner tone="success">Zuordnung erfolgreich gespeichert.</Banner>
      <Link href="/admin/zahlungseingaenge" style={{ color: 'var(--gold2)', fontSize: 14 }}>← Zurück zu Zahlungseingänge</Link>
    </div>
  )

  const unallocated = payment ? payment.amount_cents - (payment.allocated_cents || 0) : 0

  return (
    <div className="admin-page">
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin/zahlungseingaenge" style={{ fontSize: 13, color: 'var(--gold2)' }}>← Zurück</Link>
      </div>

      <h1 style={{ fontSize: 20 }}>Zahlung zuordnen</h1>
      {error && <Banner tone="danger">{error}</Banner>}

      {payment && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, margin: '12px 0' }}>
          <StatCard label="Zahlungsbetrag" value={euro(payment.amount_cents / 100)} />
          <StatCard label="Bereits zugeordnet" value={euro((payment.allocated_cents || 0) / 100)} />
          <StatCard label="Verfügbar" value={euro(unallocated / 100)} color="#5CB882" />
          <StatCard label="Verbleibend" value={euro(remaining() / 100)} color={remaining() < 0 ? '#D04B3B' : '#5CB882'} />
        </div>
      )}

      <h3 style={{ fontSize: 15, margin: '16px 0 8px' }}>Offene Rechnungen</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th></th><th>Rechnung</th><th>Klient</th><th>Offen</th><th>Zuordnen</th></tr>
          </thead>
          <tbody>
            {invoices.map(i => (
              <tr key={i.id}>
                <td><input type="checkbox" checked={i.selected} onChange={() => toggleInvoice(i.id)} /></td>
                <td style={{ fontWeight: 600 }}>{i.invoice_number}</td>
                <td>{i.client_name}</td>
                <td>{euro(i.open_amount)}</td>
                <td>
                  {i.selected && (
                    <input
                      value={i.allocAmount}
                      onChange={e => setAllocAmount(i.id, e.target.value)}
                      style={{ width: 100, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--coal3)', color: 'var(--ink)' }}
                      placeholder="0,00"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <Link href="/admin/zahlungseingaenge" className="btn-cancel" style={{ textDecoration: 'none', padding: '8px 16px' }}>Abbrechen</Link>
        <button className="btn-confirm" onClick={submit} disabled={saving || invoices.filter(i => i.selected).length === 0}>
          {saving ? 'Speichern…' : 'Zuordnung speichern'}
        </button>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--coal3)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--ink4)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: color || 'var(--ink)' }}>{value}</div>
    </div>
  )
}
