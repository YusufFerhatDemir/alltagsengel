'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IconDocument } from '@/components/Icons'
import { logger } from '@/lib/logger'
const log = logger.child('admin:mahnwesen')

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

interface QueueZaehler {
  wartend: number
  versendet: number
  fehlgeschlagen: number
  storniert: number
  /** Dead Letter — diese Mahnungen gehen ohne Eingriff nie mehr raus. */
  aufgegeben: number
}

interface VersandErgebnis {
  geprueft: number
  versendet: number
  storniert: number
  fehlgeschlagen: number
  aufgegeben: number
  uebersprungen: number
  reaktiviert: number
  details: Array<{ queueId: string; empfaenger: string; status: string; grund?: string }>
}

interface DunningRunResult {
  geprueft: number
  eskaliert: Array<{ invoiceNumber: string | null; fromLevel: string; toLevel: string; daysOverdue: number; feeCents: number }>
  blockiert: Array<{ invoiceNumber: string | null; reason: string }>
  unveraendert: number
  dryRun: boolean
}

export default function MahnwesenPage() {
  const [entries, setEntries] = useState<DunningEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [ladeFehler, setLadeFehler] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ html: string; email: { subject: string; body: string } } | null>(null)
  const [lauf, setLauf] = useState<DunningRunResult | null>(null)
  const [laufLoading, setLaufLoading] = useState<'dry' | 'echt' | null>(null)
  const [queue, setQueue] = useState<QueueZaehler | null>(null)
  const [versandLoading, setVersandLoading] = useState(false)
  const [versand, setVersand] = useState<VersandErgebnis | null>(null)

  const ladeQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/dunning/versand')
      if (!res.ok) return
      const json = await res.json()
      setQueue(json.queue as QueueZaehler)
    } catch {
      // Der Zaehler ist Zusatzinformation — ein Fehler darf die Seite nicht kippen.
    }
  }, [])

  /**
   * Stoesst den Versand der wartenden Mahnschreiben an.
   *
   * `wiederholen` holt vorher die FAELLIGEN fehlgeschlagenen Eintraege
   * dieser Organisation zurueck auf 'wartend' — faellig heisst: die
   * Wartezeit ist um und die Versuchsobergrenze noch nicht erreicht.
   * Ein Eintrag im Dead Letter ('aufgegeben') kommt dabei NICHT zurueck.
   */
  async function starteVersand(wiederholen: boolean) {
    const frage = wiederholen
      ? 'Fehlgeschlagene Mahnschreiben erneut versenden? Die Mails gehen an echte Kunden.'
      : 'Wartende Mahnschreiben jetzt per E-Mail versenden? Die Mails gehen an echte Kunden.'
    if (!confirm(frage)) return

    setVersandLoading(true)
    setVersand(null)
    try {
      const res = await fetch('/api/billing/dunning/versand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wiederholen }),
      })
      const data = await res.json()
      if (!res.ok) alert(`Fehler: ${data.error}`)
      else {
        setVersand(data as VersandErgebnis)
        await ladeQueue()
        await loadData()
      }
    } catch { alert('Netzwerkfehler') }
    setVersandLoading(false)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    // „Keine offenen Mahnungen." ueber einer gestoerten Abfrage heisst: der
    // Mahnlauf wird uebersprungen und Forderungen verjaehren still.
    const { data, error: entriesErr } = await supabase
      .from('dunning_entries')
      .select('*, invoice:invoices(invoice_number, invoice_number_formatted, client:clients(first_name, last_name))')
      .neq('dunning_level', 'bezahlt')
      .order('days_overdue', { ascending: false })
    if (entriesErr) {
      log.error(`Mahnliste laden fehlgeschlagen: ${entriesErr.message}`)
      setLadeFehler(true)
      setLoading(false)
      return
    }
    setLadeFehler(false)
    setEntries((data || []) as DunningEntry[])
    setLoading(false)
  }, [])

  useEffect(() => { loadData(); ladeQueue() }, [loadData, ladeQueue])

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

  async function starteMahnlauf(dryRun: boolean) {
    if (!dryRun && !confirm('Mahnlauf jetzt ausführen? Alle fälligen Rechnungen werden um eine Stufe eskaliert.')) return
    setLaufLoading(dryRun ? 'dry' : 'echt')
    setLauf(null)
    try {
      const res = await fetch('/api/billing/dunning/lauf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      })
      const data = await res.json()
      if (!res.ok) alert(`Fehler: ${data.error}`)
      else {
        setLauf(data as DunningRunResult)
        if (!dryRun) loadData()
      }
    } catch { alert('Netzwerkfehler') }
    setLaufLoading(null)
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Offene Mahnungen" value={stats.total} />
        <StatCard label="Gesamtforderung" value={formatCurrency(stats.totalOpen)} />
        <StatCard label="Blockiert" value={stats.blocked} color="#f59e0b" />
        <StatCard label="> 30 Tage überfällig" value={stats.overdue30} color="#ef4444" />
      </div>

      {/* Mahnlauf — dieselbe Logik läuft nachts um 07:00 automatisch (Cron). */}
      <div style={{ border: '1px solid var(--border, #2a2a2a)', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Mahnlauf</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              Fristen ab Fälligkeit: 14 Tage Zahlungserinnerung · 28 Tage 1. Mahnung · 42 Tage 2. Mahnung ·
              56 Tage letzte Mahnung · 70 Tage Inkasso-Vorbereitung. Je Lauf wird höchstens eine Stufe
              eskaliert. Läuft automatisch täglich um 07:00 Uhr. Der Versand der Schreiben läuft nur
              automatisch mit, wenn MAHNVERSAND_AUTOMATISCH gesetzt ist — sonst hier von Hand anstoßen.
            </div>
          </div>
          <button onClick={() => starteMahnlauf(true)} disabled={laufLoading !== null} style={btnStyle}>
            {laufLoading === 'dry' ? 'Prüfe…' : 'Simulieren'}
          </button>
          <button onClick={() => starteMahnlauf(false)} disabled={laufLoading !== null} style={{ ...btnStyle, background: '#c8a84e', color: '#1a1a1a', borderColor: '#c8a84e' }}>
            {laufLoading === 'echt' ? 'Läuft…' : 'Mahnlauf starten'}
          </button>
        </div>

        {lauf && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border, #2a2a2a)', fontSize: 13 }}>
            <div style={{ marginBottom: 6 }}>
              {lauf.dryRun ? 'Simulation: ' : 'Ergebnis: '}
              {lauf.geprueft} fällige Rechnung(en) geprüft · <strong>{lauf.eskaliert.length}</strong> eskaliert
              {lauf.dryRun ? ' (würden eskaliert)' : ''} · {lauf.unveraendert} unverändert · {lauf.blockiert.length} blockiert
            </div>
            {lauf.eskaliert.map((e, i) => (
              <div key={`e${i}`} style={{ color: '#f59e0b' }}>
                {e.invoiceNumber || '(ohne Nummer)'}: {DUNNING_LABELS[e.fromLevel] || e.fromLevel} →{' '}
                {DUNNING_LABELS[e.toLevel] || e.toLevel} ({e.daysOverdue} Tage überfällig
                {e.feeCents > 0 ? `, ${formatCurrency(e.feeCents)} Gebühr` : ''})
              </div>
            ))}
            {lauf.blockiert.map((b, i) => (
              <div key={`b${i}`} style={{ color: '#ef4444' }}>
                {b.invoiceNumber || '(ohne Nummer)'}: blockiert — {b.reason}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Versand der wartenden Mahnschreiben (dunning_email_queue) */}
      <div style={{ border: '1px solid var(--border, #2a2a2a)', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Mahnschreiben versenden</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {queue
                ? `${queue.wartend} wartend · ${queue.versendet} versendet · ${queue.fehlgeschlagen} fehlgeschlagen · ${queue.storniert} storniert · ${queue.aufgegeben} aufgegeben`
                : 'Warteschlange wird geladen…'}
              <br />
              Vor jedem Versand wird erneut geprüft, ob die Rechnung inzwischen bezahlt oder blockiert
              ist — dann wird der Eintrag storniert statt gemahnt. Jedes Schreiben geht mit PDF-Anhang raus.
            </div>
          </div>
          <button
            onClick={() => starteVersand(false)}
            disabled={versandLoading || !queue?.wartend}
            style={{ ...btnStyle, background: '#c8a84e', color: '#1a1a1a', borderColor: '#c8a84e', opacity: !queue?.wartend ? 0.5 : 1 }}
          >
            {versandLoading ? 'Versende…' : 'Wartende versenden'}
          </button>
          {(queue?.fehlgeschlagen ?? 0) > 0 && (
            <button onClick={() => starteVersand(true)} disabled={versandLoading} style={btnStyle}>
              Fehlgeschlagene wiederholen
            </button>
          )}
        </div>

        {(queue?.aufgegeben ?? 0) > 0 && (
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.12)', border: '1px solid #ef4444', fontSize: 13 }}>
            <strong>{queue?.aufgegeben} Mahnschreiben endgültig aufgegeben.</strong> Diese Einträge
            wurden dauerhaft nicht zugestellt (ungültige Adresse) oder haben die Versuchsobergrenze
            erreicht. Der automatische Lauf fasst sie nicht mehr an. Erst Empfängeradresse bzw.
            Ursache prüfen — ein erneuter Versand an dieselbe Adresse führt zum selben Ergebnis.
          </div>
        )}

        {versand && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border, #2a2a2a)', fontSize: 13 }}>
            <div style={{ marginBottom: 6 }}>
              {versand.geprueft} Eintrag/Einträge bearbeitet · <strong>{versand.versendet}</strong> versendet ·{' '}
              {versand.storniert} storniert · {versand.fehlgeschlagen} fehlgeschlagen ·{' '}
              {versand.aufgegeben} aufgegeben · {versand.uebersprungen} übersprungen
            </div>
            {versand.details.filter(d => d.status !== 'versendet').map((d, i) => (
              <div key={`v${i}`} style={{ color: d.status === 'storniert' ? '#22c55e' : '#ef4444' }}>
                {d.empfaenger}: {d.status}{d.grund ? ` — ${d.grund}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? <p>Laden…</p> : (
        <div style={{ overflowX: 'auto' }}>
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
              const inv = e.invoice
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
              <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: ladeFehler ? '#c62828' : '#999' }}>
                {ladeFehler
                  ? 'Die Mahnliste konnte nicht geladen werden. Bitte laden Sie die Seite neu — dies ist KEINE Aussage über offene Forderungen.'
                  : 'Keine offenen Mahnungen.'}
              </td></tr>
            )}
          </tbody>
        </table>
        </div>
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
