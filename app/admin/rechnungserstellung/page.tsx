'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { euro, formatDate, statusMeta, INVOICE_STATUS } from '@/lib/admin/ops'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'

interface BillableRecord {
  id: string
  client_id: string
  date: string
  service_type: string | null
  duration_minutes: number | null
  amount: number | null
  budget_type: string | null
}

interface ClientGroup {
  client_id: string
  clientName: string
  insurance_name: string | null
  insurance_number: string | null
  records: BillableRecord[]
  count: number
  sum: number
}

interface GeneratedInvoice {
  id: string
  invoice_number: string | null
  client_id: string
  clientName: string
  period_start: string | null
  period_end: string | null
  total_amount: number | null
  status: string
  pdf_url: string | null
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
}

function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0) // letzter Tag des Monats
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { start: iso(start), end: iso(end) }
}

export default function RechnungserstellungPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const [groups, setGroups] = useState<ClientGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creatingFor, setCreatingFor] = useState<string | null>(null)

  const [invoices, setInvoices] = useState<GeneratedInvoice[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(true)
  const [generatingPdfFor, setGeneratingPdfFor] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)

  async function loadBillable() {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { start, end } = monthBounds(year, month)

      // Abgeschlossene/unterschriebene Nachweise im Zeitraum, noch nicht abgerechnet
      const { data: records, error: recErr } = await supabase
        .from('service_records')
        .select('id, client_id, date, service_type, duration_minutes, amount, budget_type, client:clients(first_name, last_name, insurance_name, insurance_number)')
        .in('status', ['complete', 'signed'])
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true })

      if (recErr) { setError(recErr.message); setLoading(false); return }

      const allRecords = records || []
      const recordIds = allRecords.map((r: any) => r.id)

      // Bereits abgerechnete Nachweise ausschließen (invoice_items-Verknüpfung)
      let billedIds = new Set<string>()
      if (recordIds.length > 0) {
        const { data: billedItems } = await supabase
          .from('invoice_items')
          .select('service_record_id')
          .in('service_record_id', recordIds)
        billedIds = new Set((billedItems || []).map((i: any) => i.service_record_id))
      }

      const unbilled = allRecords.filter((r: any) => !billedIds.has(r.id))

      const byClient: Record<string, ClientGroup> = {}
      for (const r of unbilled as any[]) {
        const cid = r.client_id
        if (!byClient[cid]) {
          byClient[cid] = {
            client_id: cid,
            clientName: `${r.client?.first_name || ''} ${r.client?.last_name || ''}`.trim() || '—',
            insurance_name: r.client?.insurance_name ?? null,
            insurance_number: r.client?.insurance_number ?? null,
            records: [],
            count: 0,
            sum: 0,
          }
        }
        byClient[cid].records.push({
          id: r.id, client_id: r.client_id, date: r.date, service_type: r.service_type,
          duration_minutes: r.duration_minutes, amount: r.amount, budget_type: r.budget_type,
        })
        byClient[cid].count += 1
        byClient[cid].sum += Number(r.amount) || 0
      }

      setGroups(Object.values(byClient).sort((a, b) => a.clientName.localeCompare(b.clientName)))
    } catch (err: any) {
      console.error('Rechnungserstellung Ladefehler:', err)
      setError('Unerwarteter Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }

  async function loadInvoices() {
    setLoadingInvoices(true)
    try {
      const supabase = createClient()
      const { data, error: e } = await supabase
        .from('invoices')
        .select('id, invoice_number, client_id, period_start, period_end, total_amount, status, client:clients(first_name, last_name), invoice_packages(pdf_url)')
        .order('created_at', { ascending: false })
        .limit(50)
      if (e) { console.error('Rechnungen Ladefehler:', e); setLoadingInvoices(false); return }
      setInvoices((data || []).map((i: any) => ({
        id: i.id,
        invoice_number: i.invoice_number,
        client_id: i.client_id,
        clientName: `${i.client?.first_name || ''} ${i.client?.last_name || ''}`.trim() || '—',
        period_start: i.period_start,
        period_end: i.period_end,
        total_amount: i.total_amount,
        status: i.status,
        pdf_url: Array.isArray(i.invoice_packages) ? (i.invoice_packages[0]?.pdf_url ?? null) : (i.invoice_packages?.pdf_url ?? null),
      })))
    } catch (err) {
      console.error('Rechnungen Ladefehler:', err)
    } finally {
      setLoadingInvoices(false)
    }
  }

  useEffect(() => { loadBillable() }, [year, month]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadInvoices() }, [])

  async function createInvoice(group: ClientGroup) {
    setCreatingFor(group.client_id)
    setError(null)
    try {
      const periodMonth = `${year}-${String(month).padStart(2, '0')}`
      const res = await fetch('/api/billing/invoices/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: group.client_id,
          periodMonth,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        const detail = json.warnings?.length
          ? `${json.error} (${json.warnings.join('; ')})`
          : json.error
        setError(`Fehler beim Erstellen: ${detail}`)
        setCreatingFor(null)
        return
      }

      if (json.warnings?.length) {
        console.warn('[Rechnungserstellung] Warnungen:', json.warnings)
      }

      await loadBillable()
      await loadInvoices()
    } catch (err: any) {
      setError(`Unerwarteter Fehler: ${err.message}`)
    } finally {
      setCreatingFor(null)
    }
  }

  async function generatePdf(invoiceId: string) {
    setGeneratingPdfFor(invoiceId)
    setPdfError(null)
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/generate-pdf`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setPdfError(json.error || 'PDF-Erzeugung fehlgeschlagen.')
        setGeneratingPdfFor(null)
        return
      }
      await loadInvoices()
    } catch (err: any) {
      console.error('PDF-Erzeugung Fehler:', err)
      setPdfError('Unerwarteter Fehler bei der PDF-Erzeugung.')
    } finally {
      setGeneratingPdfFor(null)
    }
  }

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), [])
  const yearOptions = useMemo(() => [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1], [now])
  const totalUnbilled = useMemo(() => groups.reduce((s, g) => s + g.sum, 0), [groups])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Rechnungserstellung</h1>
          <p className="admin-subtitle">Abgeschlossene, noch nicht abgerechnete Leistungsnachweise je Klient &amp; Monat bündeln</p>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {pdfError && <Banner tone="danger">{pdfError}</Banner>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <select value={month} onChange={e => setMonth(Number(e.target.value))} style={select}>
          {monthOptions.map(m => <option key={m} value={m}>{monthLabel(year, m)}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ ...select, width: 110 }}>
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span style={{ fontSize: 13, color: 'var(--ink4)' }}>
          {groups.length} Klient(en) · {euro(totalUnbilled)} abrechenbar
        </span>
      </div>

      <h2 style={cardTitle}>Abrechenbare Leistungen — {monthLabel(year, month)}</h2>
      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap" style={{ marginBottom: 28 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Klient</th><th>Pflegekasse</th><th>Anzahl</th><th>Summe</th><th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <EmptyRow colSpan={5}>Keine abrechenbaren Nachweise für diesen Monat</EmptyRow>
              ) : groups.map(g => (
                <tr key={g.client_id}>
                  <td style={{ fontWeight: 600 }}>{g.clientName}</td>
                  <td style={{ fontSize: 13 }}>{g.insurance_name || '—'}</td>
                  <td>{g.count}</td>
                  <td style={{ fontWeight: 600, color: 'var(--gold2)' }}>{euro(g.sum)}</td>
                  <td>
                    <button onClick={() => createInvoice(g)} disabled={creatingFor === g.client_id} style={primaryBtnSm}>
                      {creatingFor === g.client_id ? 'Erstellen…' : 'Rechnung erstellen'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={cardTitle}>Erstellte Rechnungen</h2>
      {loadingInvoices ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Rechnungsnr.</th><th>Klient</th><th>Zeitraum</th><th>Summe</th><th>Status</th><th>PDF-Paket</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <EmptyRow colSpan={6}>Noch keine Rechnungen erstellt</EmptyRow>
              ) : invoices.map(inv => {
                const sm = statusMeta(INVOICE_STATUS, inv.status)
                return (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 600 }}>{inv.invoice_number || '—'}</td>
                    <td>{inv.clientName}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{formatDate(inv.period_start)}–{formatDate(inv.period_end)}</td>
                    <td>{euro(inv.total_amount)}</td>
                    <td><StatusBadge label={sm.label} color={sm.color} /></td>
                    <td>
                      {inv.pdf_url ? (
                        <a href={inv.pdf_url} target="_blank" rel="noreferrer" style={{ color: 'var(--gold2)', fontSize: 13 }}>
                          PDF herunterladen
                        </a>
                      ) : (
                        <button onClick={() => generatePdf(inv.id)} disabled={generatingPdfFor === inv.id} style={actionBtn}>
                          {generatingPdfFor === inv.id ? 'Erzeugen…' : 'PDF-Paket erzeugen'}
                        </button>
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

const cardTitle: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 700, color: 'var(--ink)', margin: '20px 0 14px',
}
const select: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box',
}
const primaryBtnSm: React.CSSProperties = {
  fontSize: 13, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const actionBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
