'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import { euro, formatDate, INVOICE_STATUS, statusMeta } from '@/lib/admin/ops'
import { budgetTypeLabel, fmtDuration } from '@/lib/kunde/leistungen'

interface InvoiceRow {
  id: string
  invoice_number: string | null
  period_start: string | null
  period_end: string | null
  total_amount: number | null
  budget_amount: number | null
  private_amount: number | null
  paid_amount: number | null
  status: string
  created_at: string
  has_pdf: boolean
}

interface ItemRow {
  id: string
  date: string | null
  description: string | null
  duration_minutes: number | null
  amount: number | null
  budget_type: string | null
}

export default function KundeRechnungenPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [items, setItems] = useState<Record<string, ItemRow[]>>({})
  const [itemsLoading, setItemsLoading] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setError('')
    setLoading(true)
    try {
      const user = await requireUser(router, { redirectTo: '/kunde/rechnungen' })
      if (!user) return
      const supabase = createClient()

      // RLS liefert nur die eigenen Rechnungen (clients.user_id = auth.uid())
      const { data, error: invErr } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_number_formatted, period_start, period_end, total_amount, budget_amount, private_amount, paid_amount, status, created_at, invoice_packages(pdf_url)')
        .order('period_start', { ascending: false, nullsFirst: false })

      if (invErr) throw new Error('Rechnungen konnten nicht geladen werden')
      setInvoices((data || []).map((d: any) => ({
        ...d,
        invoice_number: d.invoice_number_formatted || d.invoice_number,
        has_pdf: !!(d.invoice_packages && d.invoice_packages.length > 0 && d.invoice_packages[0].pdf_url),
      })) as InvoiceRow[])
    } catch (err: any) {
      setError(err?.message || 'Ein Fehler beim Laden der Rechnungen ist aufgetreten')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggleExpand(invoiceId: string) {
    if (expanded === invoiceId) {
      setExpanded(null)
      return
    }
    setExpanded(invoiceId)
    if (items[invoiceId]) return // schon geladen

    setItemsLoading(invoiceId)
    try {
      const supabase = createClient()
      const { data, error: itemErr } = await supabase
        .from('invoice_items')
        .select('id, date, description, duration_minutes, amount, budget_type')
        .eq('invoice_id', invoiceId)
        .order('date', { ascending: true })
      if (!itemErr) {
        setItems(prev => ({ ...prev, [invoiceId]: (data || []) as ItemRow[] }))
      }
    } finally {
      setItemsLoading(null)
    }
  }

  if (error && !loading) return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <p style={{ color: 'var(--ink3)', fontSize: 14, marginBottom: 16 }}>{error}</p>
      <button onClick={() => { setError(''); load() }} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,var(--gold),var(--gold2))', color: 'var(--coal)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Erneut versuchen</button>
    </div>
  )

  return (
    <div className="screen" id="kunde-rechnungen">
      <div className="topbar" style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/kunde/home" className="back-btn" style={{ textDecoration: 'none' }}>‹</Link>
        <div className="topbar-title">Meine Rechnungen</div>
      </div>

      <div style={{ padding: '0 20px' }}>
        {loading ? (
          <div className="chat-empty">Laden...</div>
        ) : invoices.length === 0 ? (
          <div className="chat-empty" style={{ paddingTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🧾</div>
            <div className="chat-empty-title">Keine Rechnungen</div>
            <div className="chat-empty-sub">Sobald eine Rechnung für Sie erstellt wurde, erscheint sie hier.</div>
          </div>
        ) : (
          invoices.map(inv => {
            const st = statusMeta(INVOICE_STATUS, inv.status)
            const isOpen = expanded === inv.id
            const invItems = items[inv.id]
            return (
              <div key={inv.id} style={{
                background: 'var(--white)', borderRadius: 16, marginBottom: 12,
                border: isOpen ? '1px solid rgba(201,150,60,.35)' : '1px solid var(--border)',
                overflow: 'hidden',
              }}>
                {/* Kopfzeile — klickbar */}
                <div onClick={() => toggleExpand(inv.id)} style={{ padding: 16, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                        {inv.invoice_number || 'Rechnung'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 3 }}>
                        {inv.period_start && inv.period_end
                          ? `${formatDate(inv.period_start)} – ${formatDate(inv.period_end)}`
                          : formatDate(inv.created_at)}
                      </div>
                    </div>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      color: st.color, background: `${st.color}1A`, border: `1px solid ${st.color}40`,
                      whiteSpace: 'nowrap',
                    }}>{st.label}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--ink4)' }}>
                      {Number(inv.budget_amount) > 0 && <span>Pflegekasse: {euro(Number(inv.budget_amount))}</span>}
                      {Number(inv.budget_amount) > 0 && Number(inv.private_amount) > 0 && <span> · </span>}
                      {Number(inv.private_amount) > 0 && <span>Eigenanteil: {euro(Number(inv.private_amount))}</span>}
                      {inv.paid_amount != null && Number(inv.paid_amount) > 0 && Number(inv.paid_amount) < Number(inv.total_amount) && (
                        <span style={{ color: '#D04B3B' }}> · Offen: {euro(Number(inv.total_amount || 0) - Number(inv.paid_amount))}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--gold2)' }}>{euro(Number(inv.total_amount) || 0)}</span>
                      <span style={{ color: 'var(--ink4)', fontSize: 12, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s', display: 'inline-block' }}>›</span>
                    </div>
                  </div>
                </div>

                {/* Aufschlüsselung */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '4px 16px 14px' }}>
                    {inv.has_pdf && (
                      <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <button onClick={async (e) => {
                          e.stopPropagation()
                          const supabase = createClient()
                          const { data: pkg } = await supabase.from('invoice_packages').select('pdf_url').eq('invoice_id', inv.id).single()
                          if (pkg?.pdf_url) window.open(pkg.pdf_url, '_blank')
                        }} style={{
                          width: '100%', padding: '10px 0', border: 'none', borderRadius: 8,
                          background: 'linear-gradient(135deg,var(--gold),var(--gold2))', color: 'var(--coal)',
                          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                          PDF herunterladen
                        </button>
                      </div>
                    )}
                    {itemsLoading === inv.id ? (
                      <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--ink4)', fontSize: 13 }}>Laden...</div>
                    ) : !invItems || invItems.length === 0 ? (
                      <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--ink4)', fontSize: 13 }}>
                        Keine Einzelpositionen vorhanden
                      </div>
                    ) : (
                      invItems.map(item => (
                        <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>
                              {item.description || 'Leistung'}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                              {euro(Number(item.amount) || 0)}
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 3 }}>
                            <div style={{ fontSize: 11, color: 'var(--ink4)' }}>
                              {formatDate(item.date)}
                              {item.duration_minutes ? ` · ${fmtDuration(item.duration_minutes)}` : ''}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--gold2)' }}>{budgetTypeLabel(item.budget_type)}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
        <div style={{ height: 90 }}></div>
      </div>
    </div>
  )
}
