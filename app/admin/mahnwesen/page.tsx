'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IconDocument } from '@/components/Icons'

// ═══════════════════════════════════════════════════════════════
// Mahnwesen — Übersicht, PDF-Generierung, E-Mail-Versand
// ═══════════════════════════════════════════════════════════════

const DUNNING_LABELS: Record<string, string> = {
  offen: 'Offen',
  erinnerung: 'Zahlungserinnerung',
  mahnung_1: '1. Mahnung',
  mahnung_2: '2. Mahnung',
  letzte_mahnung: 'Letzte Mahnung',
  inkasso_vorbereitung: 'Inkasso-Vorbereitung',
  bezahlt: 'Bezahlt',
}

const LEVEL_COLORS: Record<string, string> = {
  offen: '#3b82f6',
  erinnerung: '#f59e0b',
  mahnung_1: '#f97316',
  mahnung_2: '#ef4444',
  letzte_mahnung: '#dc2626',
  inkasso_vorbereitung: '#991b1b',
  bezahlt: '#22c55e',
}

interface DunningEntry {
  id: string
  invoice_id: string
  dunning_level: string
  due_date: string
  amount_due_cents: number
  amount_paid_cents: number
  dunning_fee_cents: number
  days_overdue: number
  last_dunning_at: string | null
  next_dunning_at: string | null
  block_dunning: boolean
  block_reason: string | null
  invoice?: {
    invoice_number: string
    invoice_number_formatted: string
    client?: { first_name: string; last_name: string }
  }
}

export default function MahnwesenPage() {
  const [entries, setEntries] = useState<DunningEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ html: string; email: { subject: string; body: string } } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('dunning_entries')
      .select('*, invoice:invoices(invoice_number, invoice_number_formatted, client:clients(first_name, last_name))')
      .neq('dunning_level', 'bezahlt')
      .order('days_overdue', { ascending: false })
    setEntries((data || []) as DunningEntry[])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const formatCurrency = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'

  async function generateMahnung(entry: DunningEntry) {
    setGenerating(entry.id)
    try {
      const res = await fetch('/api/billing/dunning/dokumente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: entry.invoice_id,
          dunningEntryId: entry.id,
          dunningLevel: entry.dunning_level,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setPreview({ html: data.html, email: data.email })
      } else {
        const err = await res.json()
        alert(`Fehler: ${err.error}`)
      }
    } catch {
      alert('Netzwerkfehler')
    }
    setGenerating(null)
  }

  async function escalateDunning(invoiceId: string) {
    if (!confirm('Mahnstufe wirklich eskalieren?')) return
    try {
      const res = await fetch(`/api/billing/dunning/${invoiceId}/eskalieren`, {
        method: 'POST',
      })
      if (res.ok) loadData()
      else {
        const err = await res.json()
        alert(`Fehler: ${err.error}`)
      }
    } catch { alert('Netzwerkfehler') }
  }

  // Statistik-Karten
  const stats = {
    total: entries.length,
    totalOpen: entries.reduce((s, e) => s + (e.amount_due_cents - e.amount_paid_cents), 0),
    blocked: entries.filter(e => e.block_dunning).length,
    overdue30: entries.filter(e => e.days_overdue > 30).length,
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <IconDocument size={28} color="#c8a84e" />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Mahnwesen</h1>
      </div>

      {/* Statistik-Karten */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard label="Offene Mahnungen" value={stats.total} />
        <StatCard label="Gesamtforderung" value={formatCurrency(stats.totalOpen)} />
        <StatCard label="Blockiert" value={stats.blocked} color="#f59e0b" />
        <StatCard label="> 30 Tage überfällig" value={stats.overdue30} color="#ef4444" />
      </div>

      {loading ? <p>Laden…</p> : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Klient</th>
              <th style={thStyle}>Rechnung</th>
              <th style={thStyle}>Stufe</th>
              <th style={thStyle}>Offen</th>
              <th style={thStyle}>Gebühren</th>
              <th style={thStyle}>Tage überfällig</th>
              <th style={thStyle}>Nächste Mahnung</th>
              <th style={thStyle}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => {
              const openCents = e.amount_due_cents - e.amount_paid_cents
              const inv = e.invoice as any
              const clientName = inv?.client ? `${inv.client.first_name} ${inv.client.last_name}` : '—'
              const invNum = inv?.invoice_number_formatted || inv?.invoice_number || '—'

              return (
                <tr key={e.id} style={e.block_dunning ? { background: '#fef3c7' } : undefined}>
                  <td style={tdStyle}>{clientName}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{invNum}</td>
                  <td style={tdStyle}>
                    <span style={{ ...badgeStyle, background: LEVEL_COLORS[e.dunning_level] || '#999' }}>
                      {DUNNING_LABELS[e.dunning_level] || e.dunning_level}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(openCents)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {e.dunning_fee_cents > 0 ? formatCurrency(e.dunning_fee_cents) : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: e.days_overdue > 30 ? '#ef4444' : undefined, fontWeight: e.days_overdue > 30 ? 600 : 400 }}>
                    {e.days_overdue || 0}
                  </td>
                  <td style={tdStyle}>{formatDate(e.next_dunning_at)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!e.block_dunning && (
                        <>
                          <button onClick={() => generateMahnung(e)} disabled={generating === e.id}
                            style={actionBtnStyle} title="Mahnung generieren">
                            🖨
                          </button>
                          <button onClick={() => escalateDunning(e.invoice_id)}
                            style={actionBtnStyle} title="Stufe eskalieren">
                            ↑
                          </button>
                        </>
                      )}
                      {e.block_dunning && (
                        <span style={{ fontSize: 11, color: '#d97706' }} title={e.block_reason || ''}>
                          Blockiert
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {entries.length === 0 && (
              <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: '#999' }}>
                Keine offenen Mahnungen.
              </td></tr>
            )}
          </tbody>
        </table>
      )}

      {/* Vorschau-Modal */}
      {preview && (
        <div style={overlayStyle}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 800, width: '95%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Mahnungs-Vorschau</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => printHtml(preview.html)} style={btnStyle}>
                  🖨 Drucken / PDF
                </button>
                <button onClick={() => copyEmail(preview.email)} style={btnStyle}>
                  ✉ E-Mail kopieren
                </button>
              </div>
            </div>

            {/* HTML-Vorschau */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <iframe
                srcDoc={preview.html}
                style={{ width: '100%', height: 600, border: 'none' }}
                title="Mahnungs-Vorschau"
              />
            </div>

            {/* E-Mail-Vorschau */}
            <div style={{ marginTop: 16, padding: 16, background: '#f8fafc', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>E-Mail-Betreff:</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{preview.email.subject}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>E-Mail-Text:</div>
              <pre style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5, margin: 0 }}>{preview.email.body}</pre>
            </div>

            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <button onClick={() => setPreview(null)} style={cancelBtnStyle}>Schließen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  function printHtml(html: string) {
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
      setTimeout(() => w.print(), 500)
    }
  }

  function copyEmail(email: { subject: string; body: string }) {
    navigator.clipboard.writeText(`Betreff: ${email.subject}\n\n${email.body}`)
    alert('E-Mail-Inhalt in Zwischenablage kopiert.')
  }
}

// ---------------------------------------------------------------------------
// Shared components + styles
// ---------------------------------------------------------------------------
function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ padding: 16, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#1a365d', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 }
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }
const tdStyle: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }
const badgeStyle: React.CSSProperties = { display: 'inline-block', padding: '2px 10px', borderRadius: 99, color: '#fff', fontSize: 11, fontWeight: 600 }
const btnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1a365d', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }
const cancelBtnStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }
const actionBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
