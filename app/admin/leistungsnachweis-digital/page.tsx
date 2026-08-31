'use client'
import { datumBerlin } from '@/lib/utils/timezone';
import { aufCent } from '@/lib/geld'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  euro, formatDate, formatTime, fullName, diffMinutes, formatDuration,
  BUDGET_TYPE, SERVICE_TYPES,
} from '@/lib/admin/ops'
import { StatusBadge, Banner, EmptyRow } from '@/components/admin/OpsUI'
import SignaturePad from '@/components/admin/SignaturePad'
import DialogOverlay from '@/components/DialogOverlay'
import { klickbareZeile } from '@/lib/a11y'

// -- Typen ------------------------------------------------------------------

interface ServiceRecord {
  id: string
  client_id: string | null
  caregiver_id: string | null
  date: string
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  service_type: string | null
  budget_type: string | null
  billing_type: string | null
  amount: number | null
  status: string
  proof_status: string | null
  billing_status: string | null
  notes: string | null
  leistung_beschreibung: string | null
  client_signature: string | null
  client_signed_at: string | null
  client_signer_name: string | null
  client_signer_role: string | null
  caregiver_initials: string | null
  caregiver_confirmed_at: string | null
  gps_start_lat: number | null
  gps_start_lng: number | null
  gps_end_lat: number | null
  gps_end_lng: number | null
  is_locked: boolean | null
  signature_hash: string | null
  created_at: string | null
  updated_at: string | null
  client: { first_name: string | null; last_name: string | null } | null
  caregiver: { first_name: string | null; last_name: string | null; initials: string | null } | null
}

interface AuditEntry {
  id: string
  record_id: string
  action: string | null
  field_name: string | null
  old_value: string | null
  new_value: string | null
  changed_by: string | null
  created_at: string
}

interface DropdownItem {
  id: string
  first_name: string | null
  last_name: string | null
}

// -- Nachweis-Status --------------------------------------------------------

const PROOF_STATUS: Record<string, { label: string; color: string }> = {
  ENTWURF:       { label: 'Entwurf',       color: '#999' },
  ABGESCHLOSSEN: { label: 'Abgeschlossen', color: '#2196F3' },
  UNTERSCHRIEBEN:{ label: 'Unterschrieben', color: '#5CB882' },
  ABGERECHNET:   { label: 'Abgerechnet',   color: '#9C27B0' },
  STORNIERT:     { label: 'Storniert',     color: '#D04B3B' },
}

const BILLING_STATUS: Record<string, { label: string; color: string }> = {
  OFFEN:       { label: 'Offen',       color: '#999' },
  KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET: { label: 'Kasse n. freigesc.', color: '#FF9800' },
  ZUGEORDNET:  { label: 'Zugeordnet',  color: '#2196F3' },
  ABGERECHNET: { label: 'Abgerechnet', color: '#5CB882' },
  STORNIERT:   { label: 'Storniert',   color: '#D04B3B' },
}

const BILLING_TYPE_LABELS: Record<string, string> = {
  PRIVAT:   'Privat',
  '§45b':   '§45b Entlastung',
  '§39':    '§39 Verhinderung',
  '§36':    '§36 Sachleistung',
  '§37':    '§37 Pflegegeld',
  '§42':    '§42 Kurzzeitpflege',
  SONSTIGE: 'Sonstige',
}

function proofMeta(status: string | null | undefined) {
  if (!status) return { label: '--', color: '#999' }
  return PROOF_STATUS[status] || { label: status, color: '#999' }
}
function billingMeta(status: string | null | undefined) {
  if (!status) return { label: '--', color: '#999' }
  return BILLING_STATUS[status] || { label: status, color: '#999' }
}
function billingTypeLabel(bt: string | null | undefined) {
  if (!bt) return '--'
  return BILLING_TYPE_LABELS[bt] || bt
}

// -- Innere Komponente -------------------------------------------------------

function LeistungsnachweisDigitalInner() {
  const [records, setRecords] = useState<ServiceRecord[]>([])
  const [clients, setClients] = useState<DropdownItem[]>([])
  const [caregivers, setCaregivers] = useState<DropdownItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filter-Zustand
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [filterMonth, setFilterMonth] = useState(defaultMonth)
  const [filterClient, setFilterClient] = useState('')
  const [filterCaregiver, setFilterCaregiver] = useState('')
  const [filterProofStatus, setFilterProofStatus] = useState('')
  const [filterBillingStatus, setFilterBillingStatus] = useState('')

  // Modal-Zustand
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailRecord, setDetailRecord] = useState<ServiceRecord | null>(null)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [showSignPad, setShowSignPad] = useState(false)
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  // Erstellungs-Modal
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    client_id: '', caregiver_id: '', date: '', start_time: '', end_time: '',
    service_type: '', billing_type: 'PRIVAT', budget_type: 'private',
    amount: '', leistung_beschreibung: '', notes: '',
  })
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')

  // -- Daten laden -----------------------------------------------------------

  const loadRecords = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      let query = supabase
        .from('service_records')
        .select('*, client:clients(first_name, last_name), caregiver:caregivers(first_name, last_name, initials)')
        .order('date', { ascending: false })
        .limit(500)

      if (filterMonth) {
        const start = `${filterMonth}-01`
        const d = new Date(start)
        d.setMonth(d.getMonth() + 1)
        d.setDate(0)
        const end = datumBerlin(d)
        query = query.gte('date', start).lte('date', end)
      }
      if (filterClient) query = query.eq('client_id', filterClient)
      if (filterCaregiver) query = query.eq('caregiver_id', filterCaregiver)
      if (filterProofStatus) query = query.eq('proof_status', filterProofStatus)
      if (filterBillingStatus) query = query.eq('billing_status', filterBillingStatus)

      const { data, error: err } = await query
      if (err) { setError(err.message); setLoading(false); return }
      setRecords((data || []) as unknown as ServiceRecord[])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }, [filterMonth, filterClient, filterCaregiver, filterProofStatus, filterBillingStatus])

  useEffect(() => { loadRecords() }, [loadRecords])

  // Dropdown-Daten
  useEffect(() => {
    async function loadDropdowns() {
      const supabase = createClient()
      const [{ data: c }, { data: cg }] = await Promise.all([
        supabase.from('clients').select('id, first_name, last_name').order('last_name'),
        supabase.from('caregivers').select('id, first_name, last_name').order('last_name'),
      ])
      setClients((c || []) as DropdownItem[])
      setCaregivers((cg || []) as DropdownItem[])
    }
    loadDropdowns()
  }, [])

  // -- Detail laden ----------------------------------------------------------

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id)
    setDetailLoading(true)
    setDetailRecord(null)
    setAuditLog([])
    setActionError('')
    setShowSignPad(false)
    setSignatureData(null)
    try {
      const supabase = createClient()
      const { data, error: err } = await supabase
        .from('service_records')
        .select('*, client:clients(first_name, last_name), caregiver:caregivers(first_name, last_name, initials)')
        .eq('id', id)
        .single()
      if (err) { setActionError(err.message); return }
      setDetailRecord(data as unknown as ServiceRecord)

      // Die Revisionsspur eines Nachweises. Faellt sie aus, sah die Detail-
      // ansicht aus, als gaebe es keine Aenderungshistorie — genau die
      // Aussage, die eine Pruefung nicht auf einem verworfenen Fehler
      // treffen darf.
      const { data: auditRows, error: auditErr } = await supabase
        .from('service_record_audit_log')
        .select('*')
        .eq('record_id', id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (auditErr) { setActionError('Die Änderungshistorie konnte nicht geladen werden.'); setAuditLog([]); return }
      setAuditLog((auditRows || []) as AuditEntry[])
    } catch {
      setActionError('Fehler beim Laden der Details')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const closeDetail = useCallback(() => {
    setSelectedId(null)
    setDetailRecord(null)
    setAuditLog([])
    setShowSignPad(false)
    setSignatureData(null)
    setActionError('')
  }, [])

  // -- Aktionen --------------------------------------------------------------

  const doAction = useCallback(async (action: string, extra?: Record<string, unknown>) => {
    if (!selectedId) return
    setActionLoading(true)
    setActionError('')
    try {
      const res = await fetch('/api/leistungsnachweis/crud', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedId, action, ...extra }),
      })
      const json = await res.json()
      if (!res.ok) { setActionError(json.error || 'Fehler'); return }
      // Aktualisieren
      await openDetail(selectedId)
      await loadRecords()
    } catch {
      setActionError('Netzwerkfehler')
    } finally {
      setActionLoading(false)
    }
  }, [selectedId, openDetail, loadRecords])

  const handleConfirm = useCallback(() => doAction('confirm'), [doAction])
  const handleCancel = useCallback(() => {
    if (!confirm('Diesen Nachweis wirklich stornieren?')) return
    doAction('cancel')
  }, [doAction])
  const handleSign = useCallback(() => {
    if (!signatureData) { setActionError('Bitte zuerst unterschreiben'); return }
    doAction('sign', { client_signature: signatureData })
  }, [doAction, signatureData])

  // -- Erstellen -------------------------------------------------------------

  const handleCreate = useCallback(async () => {
    setCreateLoading(true)
    setCreateError('')
    try {
      const f = createForm
      if (!f.client_id || !f.caregiver_id || !f.date || !f.start_time || !f.end_time || !f.service_type) {
        setCreateError('Bitte alle Pflichtfelder ausfuellen')
        setCreateLoading(false)
        return
      }
      const cg = caregivers.find(c => c.id === f.caregiver_id)
      // parseFloat() war hier zweifach nachlaessig: es akzeptiert einen
      // Muell-Suffix still ("12.5x" → 12.5) und liefert bei ungueltiger
      // Eingabe NaN, das JSON.stringify als null verschickt — der
      // Leistungsnachweis waere ohne Betrag entstanden und damit nicht
      // abrechenbar. Number() ist streng, aufCent() rundet kaufmaennisch
      // auf volle Cent, bevor der Wert in die EURO-Spalte
      // service_records.amount geht.
      const betragRoh = f.amount.trim()
      const betrag = betragRoh ? Number(betragRoh) : null
      if (betrag !== null && !Number.isFinite(betrag)) {
        setCreateError('Ungültiger Betrag.')
        setCreateLoading(false)
        return
      }
      const body = {
        client_id: f.client_id,
        caregiver_id: f.caregiver_id,
        date: f.date,
        start_time: f.start_time,
        end_time: f.end_time,
        service_type: f.service_type,
        billing_type: f.billing_type,
        budget_type: f.budget_type,
        caregiver_initials: cg ? `${(cg.first_name || '')[0] || ''}${(cg.last_name || '')[0] || ''}`.toUpperCase() : '??',
        amount: betrag === null ? null : aufCent(betrag),
        leistung_beschreibung: f.leistung_beschreibung || null,
        notes: f.notes || null,
      }
      const res = await fetch('/api/leistungsnachweis/crud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setCreateError(json.error || 'Fehler beim Erstellen'); return }
      setShowCreate(false)
      setCreateForm({
        client_id: '', caregiver_id: '', date: '', start_time: '', end_time: '',
        service_type: '', billing_type: 'PRIVAT', budget_type: 'private',
        amount: '', leistung_beschreibung: '', notes: '',
      })
      await loadRecords()
    } catch {
      setCreateError('Netzwerkfehler')
    } finally {
      setCreateLoading(false)
    }
  }, [createForm, caregivers, loadRecords])

  // -- Statistiken -----------------------------------------------------------

  const stats = useMemo(() => {
    const total = records.length
    const entwurf = records.filter(r => r.proof_status === 'ENTWURF').length
    const abgeschlossen = records.filter(r => r.proof_status === 'ABGESCHLOSSEN').length
    const unterschrieben = records.filter(r => r.proof_status === 'UNTERSCHRIEBEN').length
    const fehlend = entwurf + abgeschlossen
    return { total, entwurf, abgeschlossen, unterschrieben, fehlend }
  }, [records])

  // -- Render ----------------------------------------------------------------

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <h1>Digitale Leistungsnachweise</h1>
          <p className="admin-subtitle">Nachweiserfassung, Unterschriften und Abrechnung</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowCreate(true)} style={primaryBtn}>+ Neuer Nachweis</button>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {/* Statistiken */}
      <div className="admin-stats-grid" style={{ marginBottom: 16 }}>
        <div className="admin-stat-card">
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{stats.total}</div>
          <div style={{ fontSize: 13, color: 'var(--ink4)' }}>Gesamt</div>
        </div>
        <div className="admin-stat-card">
          <div style={{ fontSize: 24, fontWeight: 700, color: '#999' }}>{stats.entwurf}</div>
          <div style={{ fontSize: 13, color: 'var(--ink4)' }}>Entwurf</div>
        </div>
        <div className="admin-stat-card">
          <div style={{ fontSize: 24, fontWeight: 700, color: '#2196F3' }}>{stats.abgeschlossen}</div>
          <div style={{ fontSize: 13, color: 'var(--ink4)' }}>Abgeschlossen</div>
        </div>
        <div className="admin-stat-card">
          <div style={{ fontSize: 24, fontWeight: 700, color: '#5CB882' }}>{stats.unterschrieben}</div>
          <div style={{ fontSize: 13, color: 'var(--ink4)' }}>Unterschrieben</div>
        </div>
        <div className="admin-stat-card">
          <div style={{ fontSize: 24, fontWeight: 700, color: '#D04B3B' }}>{stats.fehlend}</div>
          <div style={{ fontSize: 13, color: 'var(--ink4)' }}>Fehlende Unterschriften</div>
        </div>
      </div>

      {/* Filter-Leiste */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'flex-end' }}>
        <label style={filterLabelStyle}>
          <span style={filterLabelText}>Monat</span>
          <input aria-label="Monat" type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={filterInputStyle} />
        </label>
        <label style={filterLabelStyle}>
          <span style={filterLabelText}>Klient</span>
          <select aria-label="Klient" value={filterClient} onChange={e => setFilterClient(e.target.value)} style={filterInputStyle}>
            <option value="">Alle</option>
            {clients.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
          </select>
        </label>
        <label style={filterLabelStyle}>
          <span style={filterLabelText}>Betreuungskraft</span>
          <select aria-label="Betreuungskraft" value={filterCaregiver} onChange={e => setFilterCaregiver(e.target.value)} style={filterInputStyle}>
            <option value="">Alle</option>
            {caregivers.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
          </select>
        </label>
        <label style={filterLabelStyle}>
          <span style={filterLabelText}>Nachweis-Status</span>
          <select aria-label="Nachweis-Status" value={filterProofStatus} onChange={e => setFilterProofStatus(e.target.value)} style={filterInputStyle}>
            <option value="">Alle</option>
            {Object.entries(PROOF_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label style={filterLabelStyle}>
          <span style={filterLabelText}>Abrechnungs-Status</span>
          <select aria-label="Abrechnungs-Status" value={filterBillingStatus} onChange={e => setFilterBillingStatus(e.target.value)} style={filterInputStyle}>
            <option value="">Alle</option>
            {Object.entries(BILLING_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      </div>

      {/* Tabelle */}
      {loading ? <p style={{ color: 'var(--ink4)' }}>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Klient</th>
                <th>Betreuungskraft</th>
                <th>Uhrzeit</th>
                <th>Dauer</th>
                <th>Leistungsart</th>
                <th>Abrechnungsart</th>
                <th>Nachweis-Status</th>
                <th>Abrechnungs-Status</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <EmptyRow colSpan={10}>Keine Nachweise im gewaehlten Zeitraum</EmptyRow>
              ) : records.map(r => {
                const pm = proofMeta(r.proof_status)
                const bm = billingMeta(r.billing_status)
                const duration = r.duration_minutes ?? (r.start_time && r.end_time ? diffMinutes(r.start_time, r.end_time) : null)
                return (
                  <tr key={r.id} {...klickbareZeile(() => openDetail(r.id))} style={{ cursor: 'pointer' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                    <td style={{ fontWeight: 600 }}>{fullName(r.client)}</td>
                    <td>{fullName(r.caregiver)}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{formatTime(r.start_time)} - {formatTime(r.end_time)}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{duration ? formatDuration(duration) : '--'}</td>
                    <td>{r.service_type || '--'}</td>
                    <td style={{ fontSize: 13 }}>{billingTypeLabel(r.billing_type)}</td>
                    <td><StatusBadge label={pm.label} color={pm.color} /></td>
                    <td><StatusBadge label={bm.label} color={bm.color} /></td>
                    <td>
                      <button
                        onClick={e => { e.stopPropagation(); openDetail(r.id) }}
                        style={smallBtn}
                      >Details</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail-Modal */}
      {selectedId && (
        <DialogOverlay onClose={closeDetail}>
          <div role="dialog" aria-label="Leistungsnachweis-Details" aria-modal="true" className="admin-modal" style={{ maxWidth: 820, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            {detailLoading ? <p>Laden...</p> : detailRecord ? (
              <>
                <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Leistungsnachweis</h2>
                <p style={{ margin: '0 0 16px', color: 'var(--ink4)', fontSize: 13 }}>
                  ID: {detailRecord.id}
                </p>

                {/* Sperr-Anzeige */}
                {detailRecord.is_locked && (
                  <Banner tone="warn">
                    Gesperrt -- Manipulationsschutz aktiv
                  </Banner>
                )}

                {actionError && <Banner tone="danger">{actionError}</Banner>}

                {/* Klient & Kraft */}
                <div style={detailGrid}>
                  <div>
                    <div style={detailLabel}>Klient</div>
                    <div style={detailValue}>{fullName(detailRecord.client)}</div>
                  </div>
                  <div>
                    <div style={detailLabel}>Betreuungskraft</div>
                    <div style={detailValue}>{fullName(detailRecord.caregiver)} {detailRecord.caregiver_initials ? `(${detailRecord.caregiver_initials})` : ''}</div>
                  </div>
                </div>

                {/* Zeit */}
                <div style={detailGrid}>
                  <div>
                    <div style={detailLabel}>Datum</div>
                    <div style={detailValue}>{formatDate(detailRecord.date)}</div>
                  </div>
                  <div>
                    <div style={detailLabel}>Start</div>
                    <div style={detailValue}>{formatTime(detailRecord.start_time)}</div>
                  </div>
                  <div>
                    <div style={detailLabel}>Ende</div>
                    <div style={detailValue}>{formatTime(detailRecord.end_time)}</div>
                  </div>
                  <div>
                    <div style={detailLabel}>Dauer</div>
                    <div style={detailValue}>
                      {detailRecord.duration_minutes
                        ? formatDuration(detailRecord.duration_minutes)
                        : detailRecord.start_time && detailRecord.end_time
                          ? formatDuration(diffMinutes(detailRecord.start_time, detailRecord.end_time))
                          : '--'}
                    </div>
                  </div>
                </div>

                {/* Leistung */}
                <div style={detailGrid}>
                  <div>
                    <div style={detailLabel}>Leistungsart</div>
                    <div style={detailValue}>{detailRecord.service_type || '--'}</div>
                  </div>
                  <div>
                    <div style={detailLabel}>Abrechnungsart</div>
                    <div style={detailValue}>{billingTypeLabel(detailRecord.billing_type)}</div>
                  </div>
                  <div>
                    <div style={detailLabel}>Budget-Topf</div>
                    <div style={detailValue}>{detailRecord.budget_type ? (BUDGET_TYPE[detailRecord.budget_type] || detailRecord.budget_type) : '--'}</div>
                  </div>
                  <div>
                    <div style={detailLabel}>Betrag</div>
                    <div style={detailValue}>{euro(detailRecord.amount)}</div>
                  </div>
                </div>

                {/* Beschreibung / Bemerkungen */}
                {detailRecord.leistung_beschreibung && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={detailLabel}>Erbrachte Leistung</div>
                    <div style={{ ...detailValue, whiteSpace: 'pre-wrap' }}>{detailRecord.leistung_beschreibung}</div>
                  </div>
                )}
                {detailRecord.notes && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={detailLabel}>Bemerkungen</div>
                    <div style={{ ...detailValue, whiteSpace: 'pre-wrap' }}>{detailRecord.notes}</div>
                  </div>
                )}

                {/* GPS */}
                {(detailRecord.gps_start_lat != null || detailRecord.gps_end_lat != null) && (
                  <div style={detailGrid}>
                    {detailRecord.gps_start_lat != null && (
                      <div>
                        <div style={detailLabel}>GPS Start</div>
                        <div style={{ ...detailValue, fontSize: 12 }}>{detailRecord.gps_start_lat}, {detailRecord.gps_start_lng}</div>
                      </div>
                    )}
                    {detailRecord.gps_end_lat != null && (
                      <div>
                        <div style={detailLabel}>GPS Ende</div>
                        <div style={{ ...detailValue, fontSize: 12 }}>{detailRecord.gps_end_lat}, {detailRecord.gps_end_lng}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Status */}
                <div style={{ ...detailGrid, marginTop: 8 }}>
                  <div>
                    <div style={detailLabel}>Nachweis-Status</div>
                    <div><StatusBadge {...proofMeta(detailRecord.proof_status)} /></div>
                    {detailRecord.caregiver_confirmed_at && (
                      <div style={{ fontSize: 11, color: 'var(--ink5)', marginTop: 2 }}>
                        Bestaetigt: {formatDate(detailRecord.caregiver_confirmed_at)} {formatTime(detailRecord.caregiver_confirmed_at?.slice(11, 16) || null)}
                      </div>
                    )}
                    {detailRecord.client_signed_at && (
                      <div style={{ fontSize: 11, color: 'var(--ink5)', marginTop: 2 }}>
                        Unterschrieben: {formatDate(detailRecord.client_signed_at)} {formatTime(detailRecord.client_signed_at?.slice(11, 16) || null)}
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={detailLabel}>Abrechnungs-Status</div>
                    <div><StatusBadge {...billingMeta(detailRecord.billing_status)} /></div>
                  </div>
                </div>

                {/* Unterschrift / Signatur-Hash */}
                {detailRecord.signature_hash && (
                  <div style={{ marginTop: 8 }}>
                    <div style={detailLabel}>Signatur-Hash</div>
                    <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--ink5)', wordBreak: 'break-all' }}>
                      {detailRecord.signature_hash}
                    </div>
                  </div>
                )}

                {detailRecord.client_signature && (
                  <div style={{ marginTop: 12 }}>
                    <div style={detailLabel}>Klienten-Unterschrift</div>
                    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: 8, display: 'inline-block' }}>
                      { }
                      <img src={detailRecord.client_signature} alt="Unterschrift" style={{ maxWidth: 300, maxHeight: 120 }} />
                    </div>
                    {detailRecord.client_signer_name && (
                      <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 4 }}>
                        Unterzeichner: {detailRecord.client_signer_name}
                        {detailRecord.client_signer_role ? ` (${detailRecord.client_signer_role})` : ''}
                      </div>
                    )}
                  </div>
                )}

                {/* Unterschrift-Pad (nur wenn ABGESCHLOSSEN) */}
                {detailRecord.proof_status === 'ABGESCHLOSSEN' && !detailRecord.client_signature && (
                  <div style={{ marginTop: 16 }}>
                    {showSignPad ? (
                      <>
                        <SignaturePad onChange={setSignatureData} height={160} label="Klienten-Unterschrift" />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button onClick={handleSign} disabled={actionLoading || !signatureData} style={primaryBtn}>
                            {actionLoading ? 'Speichern...' : 'Unterschrift speichern'}
                          </button>
                          <button onClick={() => { setShowSignPad(false); setSignatureData(null) }} style={cancelBtn}>Abbrechen</button>
                        </div>
                      </>
                    ) : (
                      <button onClick={() => setShowSignPad(true)} style={primaryBtn}>Unterschrift einholen</button>
                    )}
                  </div>
                )}

                {/* Audit-Log */}
                {auditLog.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ ...detailLabel, marginBottom: 6, fontSize: 14 }}>Audit-Log</div>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="admin-table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th>Zeitpunkt</th>
                            <th>Aktion</th>
                            <th>Feld</th>
                            <th>Alt</th>
                            <th>Neu</th>
                            <th>Benutzer</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditLog.map(a => (
                            <tr key={a.id}>
                              <td style={{ whiteSpace: 'nowrap' }}>{formatDate(a.created_at?.slice(0, 10))} {formatTime(a.created_at?.slice(11, 16))}</td>
                              <td>{a.action || '--'}</td>
                              <td>{a.field_name || '--'}</td>
                              <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.old_value || '--'}</td>
                              <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.new_value || '--'}</td>
                              <td style={{ fontSize: 11 }}>{a.changed_by ? a.changed_by.slice(0, 8) + '...' : '--'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Aktions-Buttons */}
                <div className="admin-modal-btns" style={{ marginTop: 20 }}>
                  {detailRecord.proof_status === 'ENTWURF' && (
                    <button onClick={handleConfirm} disabled={actionLoading} style={primaryBtn}>
                      {actionLoading ? 'Wird bestaetigt...' : 'Bestaetigen'}
                    </button>
                  )}
                  {detailRecord.proof_status !== 'STORNIERT' && detailRecord.proof_status !== 'ABGERECHNET' && (
                    <button onClick={handleCancel} disabled={actionLoading} style={dangerBtn}>
                      Stornieren
                    </button>
                  )}
                  {detailRecord.client_id && detailRecord.date && (
                    <a
                      href={`/api/leistungsnachweis?client_id=${detailRecord.client_id}&month=${detailRecord.date.slice(0, 7)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...smallBtn, textDecoration: 'none', display: 'inline-block' }}
                    >
                      PDF herunterladen
                    </a>
                  )}
                  <button onClick={closeDetail} className="btn-cancel">Schliessen</button>
                </div>
              </>
            ) : (
              <p>Nachweis nicht gefunden</p>
            )}
          </div>
        </DialogOverlay>
      )}

      {/* Erstellungs-Modal */}
      {showCreate && (
        <DialogOverlay onClose={() => setShowCreate(false)}>
          <div role="dialog" aria-modal="true" aria-label="Neuer Leistungsnachweis" className="admin-modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Neuer Leistungsnachweis</h2>

            {createError && <Banner tone="danger">{createError}</Banner>}

            <div style={formGrid}>
              <label style={formLabel}>
                <span style={filterLabelText}>Klient *</span>
                <select aria-label="Klient" value={createForm.client_id} onChange={e => setCreateForm(f => ({ ...f, client_id: e.target.value }))} style={filterInputStyle}>
                  <option value="">Bitte waehlen</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
                </select>
              </label>
              <label style={formLabel}>
                <span style={filterLabelText}>Betreuungskraft *</span>
                <select aria-label="Betreuungskraft" value={createForm.caregiver_id} onChange={e => setCreateForm(f => ({ ...f, caregiver_id: e.target.value }))} style={filterInputStyle}>
                  <option value="">Bitte waehlen</option>
                  {caregivers.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
                </select>
              </label>
              <label style={formLabel}>
                <span style={filterLabelText}>Datum *</span>
                <input aria-label="Datum" type="date" value={createForm.date} onChange={e => setCreateForm(f => ({ ...f, date: e.target.value }))} style={filterInputStyle} />
              </label>
              <label style={formLabel}>
                <span style={filterLabelText}>Start *</span>
                <input aria-label="Start" type="time" value={createForm.start_time} onChange={e => setCreateForm(f => ({ ...f, start_time: e.target.value }))} style={filterInputStyle} />
              </label>
              <label style={formLabel}>
                <span style={filterLabelText}>Ende *</span>
                <input aria-label="Ende" type="time" value={createForm.end_time} onChange={e => setCreateForm(f => ({ ...f, end_time: e.target.value }))} style={filterInputStyle} />
              </label>
              <label style={formLabel}>
                <span style={filterLabelText}>Leistungsart *</span>
                <select aria-label="Leistungsart" value={createForm.service_type} onChange={e => setCreateForm(f => ({ ...f, service_type: e.target.value }))} style={filterInputStyle}>
                  <option value="">Bitte waehlen</option>
                  {SERVICE_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </label>
              <label style={formLabel}>
                <span style={filterLabelText}>Abrechnungsart</span>
                <select aria-label="Abrechnungsart" value={createForm.billing_type} onChange={e => setCreateForm(f => ({ ...f, billing_type: e.target.value }))} style={filterInputStyle}>
                  {Object.entries(BILLING_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label style={formLabel}>
                <span style={filterLabelText}>Budget-Topf</span>
                <select aria-label="Budget-Topf" value={createForm.budget_type} onChange={e => setCreateForm(f => ({ ...f, budget_type: e.target.value }))} style={filterInputStyle}>
                  {Object.entries(BUDGET_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label style={formLabel}>
                <span style={filterLabelText}>Betrag</span>
                <input aria-label="Betrag" type="number" step="0.01" min="0" placeholder="0.00" value={createForm.amount} onChange={e => setCreateForm(f => ({ ...f, amount: e.target.value }))} style={filterInputStyle} />
              </label>
            </div>

            <label style={{ ...formLabel, marginTop: 8 }}>
              <span style={filterLabelText}>Leistungsbeschreibung</span>
              <textarea aria-label="Leistungsbeschreibung" value={createForm.leistung_beschreibung} onChange={e => setCreateForm(f => ({ ...f, leistung_beschreibung: e.target.value }))} rows={3} style={{ ...filterInputStyle, resize: 'vertical' }} />
            </label>
            <label style={{ ...formLabel, marginTop: 8 }}>
              <span style={filterLabelText}>Bemerkungen</span>
              <textarea aria-label="Bemerkungen" value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...filterInputStyle, resize: 'vertical' }} />
            </label>

            <div className="admin-modal-btns" style={{ marginTop: 16 }}>
              <button onClick={handleCreate} disabled={createLoading} style={primaryBtn} className="btn-confirm">
                {createLoading ? 'Wird erstellt...' : 'Nachweis erstellen'}
              </button>
              <button onClick={() => setShowCreate(false)} className="btn-cancel">Abbrechen</button>
            </div>
          </div>
        </DialogOverlay>
      )}
    </div>
  )
}

// -- Export -------------------------------------------------------------------

export default function LeistungsnachweisDigitalPage() {
  return (
    <Suspense fallback={<div className="admin-page"><h1>Digitale Leistungsnachweise</h1><p>Laden...</p></div>}>
      <LeistungsnachweisDigitalInner />
    </Suspense>
  )
}

// -- Styles ------------------------------------------------------------------

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const smallBtn: React.CSSProperties = {
  fontSize: 12, color: 'var(--ink)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit',
}

const cancelBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--ink3)', fontWeight: 500,
  background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const dangerBtn: React.CSSProperties = {
  fontSize: 14, color: '#fff', fontWeight: 600,
  background: '#D04B3B', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const filterLabelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
}

const filterLabelText: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--ink4)',
}

const filterInputStyle: React.CSSProperties = {
  fontSize: 14, padding: '6px 10px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--coal)',
  color: 'var(--ink)', fontFamily: 'inherit', minWidth: 140,
}

const formGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12,
}

const formLabel: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
}

const detailGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 12, marginBottom: 12,
}

const detailLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--ink5)', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: 2,
}

const detailValue: React.CSSProperties = {
  fontSize: 14, color: 'var(--ink)',
}
