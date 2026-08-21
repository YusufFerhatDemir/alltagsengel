'use client'
// ═══════════════════════════════════════════════════════════════
// Gutschriften & Korrekturen (Block 16)
//
// Zeigt alle Korrekturbelege (Storno, Teilstorno, Korrektur, Gutschrift)
// des aktiven Mandanten und macht den Workflow bedienbar:
//
//   Neue Gutschrift  → /api/billing/invoices/[id]/credit   (Entwurf)
//   Freigeben        → /api/billing/corrections/[id]/release
//   Verwerfen        → /api/billing/corrections/[id]/discard
//   Rechnung stornieren → /api/billing/invoices/[id]/cancel (sofort freigegeben)
//
// Betraege der Korrekturen liegen in CENT (invoice_corrections),
// invoices.total_amount dagegen in EURO — die API rechnet das um.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { euro, formatDate } from '@/lib/admin/ops'
import { SearchInput, EmptyRow, Banner, StatusBadge } from '@/components/admin/OpsUI'
import DialogOverlay from '@/components/DialogOverlay'

interface CorrectionRow {
  id: string
  correction_type: string
  status: string
  reason: string
  original_amount_cents: number
  corrected_amount_cents: number
  difference_cents: number
  created_at: string
  approved_at: string | null
  original_invoice_id: string | null
  original_invoice_number: string
  original_invoice_status: string | null
  client_name: string
  correction_invoice_id: string | null
  correction_invoice_number: string
  correction_invoice_status: string | null
  correction_invoice_frozen: boolean
}

interface Kpi {
  gesamt: number
  entwuerfe: number
  gutschriften: number
  gutschriften_cents: number
  stornos: number
  stornos_cents: number
  korrekturen: number
  korrekturen_cents: number
  differenz_cents: number
}

interface CreditableInvoice {
  id: string
  invoice_number: string
  client_name: string
  status: string
  period_start: string | null
  period_end: string | null
  total_amount: number
  total_cents: number
  credited_cents: number
  remaining_creditable_cents: number
}

const TYPE_META: Record<string, { label: string; color: string }> = {
  storno: { label: 'Storno', color: '#D04B3B' },
  teilstorno: { label: 'Teilstorno', color: '#FF7043' },
  korrektur: { label: 'Korrektur', color: '#7B68EE' },
  gutschrift: { label: 'Gutschrift', color: '#C9963C' },
}

const CORRECTION_STATUS_META: Record<string, { label: string; color: string }> = {
  entwurf: { label: 'Entwurf', color: '#999' },
  freigegeben: { label: 'Freigegeben', color: '#4CAF50' },
  uebermittelt: { label: 'Übermittelt', color: '#2196F3' },
  verarbeitet: { label: 'Verarbeitet', color: '#00BCD4' },
}

// Cent-Eingabe aus einem deutschen Betragsfeld ("12,50" oder "12.50")
function parseEuroToCents(input: string): number | null {
  const normalized = input.trim().replace(/\./g, '').replace(',', '.')
  if (!normalized) return null
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

export default function GutschriftenPage() {
  const [rows, setRows] = useState<CorrectionRow[]>([])
  const [kpi, setKpi] = useState<Kpi | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  // Dialog: Gutschrift erzeugen bzw. Rechnung stornieren
  const [dialogMode, setDialogMode] = useState<'gutschrift' | 'storno' | null>(null)
  const [candidates, setCandidates] = useState<CreditableInvoice[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [candidateSearch, setCandidateSearch] = useState('')
  const [selected, setSelected] = useState<CreditableInvoice | null>(null)
  const [amountInput, setAmountInput] = useState('')
  const [reasonInput, setReasonInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/corrections')
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Korrekturen konnten nicht geladen werden.')
        return
      }
      setRows(json.rows || [])
      setKpi(json.kpi || null)
    } catch {
      setError('Unerwarteter Fehler beim Laden der Korrekturen.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function loadCandidates() {
    setCandidatesLoading(true)
    setDialogError(null)
    try {
      const res = await fetch('/api/billing/invoices?creditable=1&limit=300')
      const json = await res.json()
      if (!res.ok) {
        setDialogError(json.error || 'Rechnungen konnten nicht geladen werden.')
        return
      }
      setCandidates(json.rows || [])
    } catch {
      setDialogError('Unerwarteter Fehler beim Laden der Rechnungen.')
    } finally {
      setCandidatesLoading(false)
    }
  }

  function openDialog(mode: 'gutschrift' | 'storno') {
    setDialogMode(mode)
    setSelected(null)
    setAmountInput('')
    setReasonInput('')
    setDialogError(null)
    setCandidateSearch('')
    loadCandidates()
  }

  function closeDialog() {
    setDialogMode(null)
    setSelected(null)
    setDialogError(null)
  }

  async function submitDialog() {
    if (!selected || !dialogMode) return
    const reason = reasonInput.trim()
    if (!reason) {
      setDialogError('Bitte einen Grund angeben — er landet revisionssicher im Audit-Trail.')
      return
    }

    let url: string
    let body: Record<string, unknown>

    if (dialogMode === 'gutschrift') {
      const cents = parseEuroToCents(amountInput)
      if (cents === null) {
        setDialogError('Bitte einen gültigen Betrag größer als 0 angeben (z. B. 35,00).')
        return
      }
      if (cents > selected.remaining_creditable_cents) {
        setDialogError(
          `Betrag übersteigt den gutschreibbaren Restbetrag von ${euro(selected.remaining_creditable_cents / 100)}.`
        )
        return
      }
      url = `/api/billing/invoices/${selected.id}/credit`
      body = { amountCents: cents, reason }
    } else {
      url = `/api/billing/invoices/${selected.id}/cancel`
      body = { reason }
    }

    setSubmitting(true)
    setDialogError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setDialogError(json.error || 'Vorgang fehlgeschlagen.')
        return
      }
      setNotice(
        dialogMode === 'gutschrift'
          ? `Gutschrift ${json.creditInvoiceNumber || ''} als Entwurf erstellt — bitte noch freigeben.`
          : `Rechnung storniert — Stornobeleg ${json.correctionInvoiceNumber || ''} erzeugt.`
      )
      closeDialog()
      await load()
    } catch {
      setDialogError('Unerwarteter Fehler beim Speichern.')
    } finally {
      setSubmitting(false)
    }
  }

  async function release(row: CorrectionRow) {
    setBusyId(row.id)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/billing/corrections/${row.id}/release`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Freigabe fehlgeschlagen.')
        return
      }
      setNotice(`Korrektur ${row.correction_invoice_number} freigegeben und festgeschrieben.`)
      await load()
    } catch {
      setError('Unerwarteter Fehler bei der Freigabe.')
    } finally {
      setBusyId(null)
    }
  }

  async function discard(row: CorrectionRow) {
    const reason = window.prompt('Grund für das Verwerfen (wird protokolliert):')
    if (reason === null) return
    if (!reason.trim()) {
      setError('Ohne Grund kann nicht verworfen werden.')
      return
    }
    setBusyId(row.id)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/billing/corrections/${row.id}/discard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Verwerfen fehlgeschlagen.')
        return
      }
      setNotice('Korrektur verworfen.')
      await load()
    } catch {
      setError('Unerwarteter Fehler beim Verwerfen.')
    } finally {
      setBusyId(null)
    }
  }

  async function generatePdf(row: CorrectionRow) {
    if (!row.correction_invoice_id) return
    setBusyId(row.id)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/invoices/${row.correction_invoice_id}/generate-pdf`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'PDF-Erzeugung fehlgeschlagen.')
        return
      }
      if (json.pdf_url) window.open(json.pdf_url, '_blank', 'noopener')
      setNotice(`Belegdokument für ${row.correction_invoice_number} erzeugt.`)
    } catch {
      setError('Unerwarteter Fehler bei der PDF-Erzeugung.')
    } finally {
      setBusyId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (typeFilter !== 'all' && r.correction_type !== typeFilter) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (!q) return true
      return r.client_name.toLowerCase().includes(q)
        || r.original_invoice_number.toLowerCase().includes(q)
        || r.correction_invoice_number.toLowerCase().includes(q)
        || r.reason.toLowerCase().includes(q)
    })
  }, [rows, typeFilter, statusFilter, search])

  const filteredCandidates = useMemo(() => {
    const q = candidateSearch.trim().toLowerCase()
    if (!q) return candidates.slice(0, 60)
    return candidates
      .filter(c => c.invoice_number.toLowerCase().includes(q) || c.client_name.toLowerCase().includes(q))
      .slice(0, 60)
  }, [candidates, candidateSearch])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Gutschriften &amp; Korrekturen</h1>
          <p className="admin-subtitle">
            Storno, Teilstorno, Korrekturrechnungen und Gutschriften — mit Freigabe und Audit-Trail
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={primaryBtn} onClick={() => openDialog('gutschrift')}>Neue Gutschrift</button>
          <button style={dangerBtn} onClick={() => openDialog('storno')}>Rechnung stornieren</button>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {notice && <Banner tone="success">{notice}</Banner>}

      {kpi && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '16px 0 20px' }}>
          <KpiCard label="Korrekturen gesamt" value={String(kpi.gesamt)} />
          <KpiCard label="Offene Entwürfe" value={String(kpi.entwuerfe)} color={kpi.entwuerfe > 0 ? '#E8A000' : undefined} />
          <KpiCard label={`Gutschriften (${kpi.gutschriften})`} value={euro(kpi.gutschriften_cents / 100)} color="#C9963C" />
          <KpiCard label={`Stornos (${kpi.stornos})`} value={euro(kpi.stornos_cents / 100)} color="#D04B3B" />
          <KpiCard label="Differenz gesamt" value={euro(kpi.differenz_cents / 100)} color={kpi.differenz_cents < 0 ? '#D04B3B' : '#5CB882'} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Klient, Rechnungsnr., Grund…" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="all">Alle Status</option>
          {Object.entries(CORRECTION_STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div className="admin-filters">
        {[{ key: 'all', label: 'Alle' }, ...Object.entries(TYPE_META).map(([k, v]) => ({ key: k, label: v.label }))].map(f => (
          <button
            key={f.key}
            className={`admin-filter-btn ${typeFilter === f.key ? 'active' : ''}`}
            onClick={() => setTypeFilter(f.key)}
          >
            {f.label}{f.key !== 'all' && ` (${rows.filter(r => r.correction_type === f.key).length})`}
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Typ</th><th>Original</th><th>Beleg</th><th>Klient</th>
                <th>Original-Betrag</th><th>Differenz</th>
                <th>Grund</th><th>Status</th><th>Datum</th><th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={10}>Keine Gutschriften oder Korrekturen</EmptyRow>
              ) : filtered.map(r => {
                const tm = TYPE_META[r.correction_type] || { label: r.correction_type, color: '#999' }
                const sm = CORRECTION_STATUS_META[r.status] || { label: r.status, color: '#999' }
                const isBusy = busyId === r.id
                return (
                  <tr key={r.id}>
                    <td><StatusBadge label={tm.label} color={tm.color} /></td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{r.original_invoice_number}</td>
                    <td style={{ fontSize: 13 }}>{r.correction_invoice_number}</td>
                    <td>{r.client_name}</td>
                    <td>{euro(r.original_amount_cents / 100)}</td>
                    <td style={{ fontWeight: 600, color: r.difference_cents < 0 ? '#D04B3B' : r.difference_cents > 0 ? '#5CB882' : 'var(--ink4)' }}>
                      {euro(r.difference_cents / 100)}
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason}>
                      {r.reason || '—'}
                    </td>
                    <td><StatusBadge label={sm.label} color={sm.color} /></td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(r.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {r.status === 'entwurf' && (
                          <>
                            <button style={actionBtn} disabled={isBusy} onClick={() => release(r)}>
                              {isBusy ? '…' : 'Freigeben'}
                            </button>
                            <button style={linkDangerBtn} disabled={isBusy} onClick={() => discard(r)}>
                              Verwerfen
                            </button>
                          </>
                        )}
                        {r.correction_invoice_id && r.status !== 'entwurf' && (
                          <button style={actionBtn} disabled={isBusy} onClick={() => generatePdf(r)}>
                            {isBusy ? '…' : 'Beleg-PDF'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialogMode && (
        <DialogOverlay className="" onClose={closeDialog} style={overlayStyle}>
          <div role="dialog" aria-modal="true" aria-label={dialogMode === 'gutschrift' ? 'Neue Gutschrift' : 'Rechnung stornieren'} style={modalStyle} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 4px', fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: 'var(--ink)' }}>
              {dialogMode === 'gutschrift' ? 'Neue Gutschrift' : 'Rechnung stornieren'}
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink4)' }}>
              {dialogMode === 'gutschrift'
                ? 'Die Gutschrift wird als Entwurf angelegt und muss anschließend freigegeben werden.'
                : 'Das Storno wird sofort freigegeben und erzeugt einen Stornobeleg mit negativen Beträgen.'}
            </p>

            {dialogError && <Banner tone="danger">{dialogError}</Banner>}

            {!selected ? (
              <>
                <div style={{ marginBottom: 10 }}>
                  <SearchInput value={candidateSearch} onChange={setCandidateSearch} placeholder="Rechnungsnr. oder Klient suchen…" />
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  {candidatesLoading ? (
                    <div style={{ padding: 16, fontSize: 13, color: 'var(--ink4)' }}>Rechnungen laden…</div>
                  ) : filteredCandidates.length === 0 ? (
                    <div style={{ padding: 16, fontSize: 13, color: 'var(--ink4)' }}>
                      Keine passende Rechnung gefunden.
                    </div>
                  ) : filteredCandidates.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelected(c); setDialogError(null) }}
                      style={candidateRowStyle}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{c.invoice_number}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink4)' }}>
                          {c.client_name}
                          {c.period_start && ` · ${formatDate(c.period_start)}–${formatDate(c.period_end)}`}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gold2)' }}>{euro(c.total_amount)}</div>
                        {dialogMode === 'gutschrift' && (
                          <div style={{ fontSize: 11, color: 'var(--ink4)' }}>
                            gutschreibbar: {euro(c.remaining_creditable_cents / 100)}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ background: 'var(--coal3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{selected.invoice_number}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink4)' }}>{selected.client_name}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--gold2)' }}>{euro(selected.total_amount)}</div>
                      {dialogMode === 'gutschrift' && (
                        <div style={{ fontSize: 11, color: 'var(--ink4)' }}>
                          gutschreibbar: {euro(selected.remaining_creditable_cents / 100)}
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setSelected(null)} style={{ ...linkDangerBtn, marginTop: 8 }}>
                    Andere Rechnung wählen
                  </button>
                </div>

                {dialogMode === 'gutschrift' && (
                  <label style={labelStyle}>
                    Gutschriftbetrag (€)
                    <input
                      value={amountInput}
                      onChange={e => setAmountInput(e.target.value)}
                      inputMode="decimal"
                      placeholder="z. B. 35,00"
                      style={inputStyle}
                    />
                  </label>
                )}

                <label style={labelStyle}>
                  {dialogMode === 'gutschrift' ? 'Grund der Gutschrift' : 'Stornierungsgrund'}
                  <textarea
                    value={reasonInput}
                    onChange={e => setReasonInput(e.target.value)}
                    rows={3}
                    placeholder={dialogMode === 'gutschrift'
                      ? 'z. B. Leistung wurde doppelt abgerechnet'
                      : 'z. B. Rechnung an falschen Kostenträger adressiert'}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </label>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button style={cancelBtn} onClick={closeDialog} disabled={submitting}>Abbrechen</button>
              {selected && (
                <button
                  style={dialogMode === 'storno' ? dangerBtn : primaryBtn}
                  onClick={submitDialog}
                  disabled={submitting}
                >
                  {submitting
                    ? 'Speichern…'
                    : dialogMode === 'gutschrift' ? 'Gutschrift anlegen' : 'Jetzt stornieren'}
                </button>
              )}
            </div>
          </div>
        </DialogOverlay>
      )}
    </div>
  )
}

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

const primaryBtn: CSSProperties = {
  fontSize: 13, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const dangerBtn: CSSProperties = {
  fontSize: 13, color: '#fff', fontWeight: 600, background: '#D04B3B', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const cancelBtn: CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const actionBtn: CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const linkDangerBtn: CSSProperties = {
  fontSize: 12, color: '#D04B3B', background: 'transparent', border: 'none',
  padding: '4px 2px', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
}
const selectStyle: CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
}
const inputStyle: CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box', marginTop: 6,
}
const labelStyle: CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink3)', marginBottom: 12,
}
const overlayStyle: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
}
const modalStyle: CSSProperties = {
  background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 14,
  padding: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
}
const candidateRowStyle: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
  width: '100%', textAlign: 'left', padding: '10px 12px', background: 'transparent',
  border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
}
