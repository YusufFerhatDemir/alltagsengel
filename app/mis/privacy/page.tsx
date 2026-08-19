'use client'
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, DataTable, MisButton, SearchInput, Badge, Tabs, EmptyState, Modal, ProgressBar } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'
import { useMis } from '@/lib/mis/MisContext'
import { createPrivacyRecord, deletePrivacyRecord, createPrivacyConsent, revokePrivacyConsent, createPrivacyRequest, updatePrivacyRequestStatus } from './actions'

// ===== Status-Maps =====
const RECORD_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: 'Aktiv', color: '#22C55E' },
  inactive: { label: 'Inaktiv', color: '#6B7280' },
  draft: { label: 'Entwurf', color: '#F59E0B' },
}

const CONSENT_STATUS: Record<string, { label: string; color: string }> = {
  erteilt: { label: 'Erteilt', color: '#22C55E' },
  widerrufen: { label: 'Widerrufen', color: '#EF4444' },
}

const REQUEST_STATUS: Record<string, { label: string; color: string }> = {
  offen: { label: 'Offen', color: '#F59E0B' },
  in_bearbeitung: { label: 'In Bearbeitung', color: '#3B82F6' },
  abgeschlossen: { label: 'Abgeschlossen', color: '#22C55E' },
  abgelehnt: { label: 'Abgelehnt', color: '#EF4444' },
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  auskunft: 'Auskunft (Art. 15)',
  loeschung: 'Löschung (Art. 17)',
  berichtigung: 'Berichtigung (Art. 16)',
  datenportabilitaet: 'Datenportabilität (Art. 20)',
  widerspruch: 'Widerspruch (Art. 21)',
  einschraenkung: 'Einschränkung (Art. 18)',
}

const LEGAL_BASIS_OPTIONS = [
  'Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)',
  'Art. 6 Abs. 1 lit. b DSGVO (Vertrag)',
  'Art. 6 Abs. 1 lit. c DSGVO (Rechtl. Verpflichtung)',
  'Art. 6 Abs. 1 lit. d DSGVO (Lebenswichtige Interessen)',
  'Art. 6 Abs. 1 lit. e DSGVO (Öffentl. Interesse)',
  'Art. 6 Abs. 1 lit. f DSGVO (Berechtigtes Interesse)',
]

const PERSON_TYPE_LABELS: Record<string, string> = {
  kunde: 'Kunde',
  engel: 'Engel',
  mitarbeiter: 'Mitarbeiter',
}

// ===== Interfaces =====
interface PrivacyRecord {
  id: string
  title: string
  purpose: string
  legal_basis: string
  data_categories: string[]
  affected_persons: string[]
  recipients: string[]
  retention_period: string | null
  toms: string | null
  third_country_transfer: boolean
  responsible_person: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

interface PrivacyConsent {
  id: string
  person_name: string
  person_type: string
  consent_type: string
  status: string
  granted_at: string
  revoked_at: string | null
  channel: string
  notes: string | null
  created_at: string
}

interface PrivacyRequest {
  id: string
  requester_name: string
  request_type: string
  status: string
  description: string | null
  assigned_to: string | null
  due_date: string | null
  completed_at: string | null
  response_notes: string | null
  created_at: string
  updated_at: string
}

interface AuditEntry {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  performed_by: string | null
  details: Record<string, unknown>
  created_at: string
}

// ===== DSGVO-CENTER =====
export default function PrivacyPage() {
  const { isMobile } = useMis()
  const [activeTab, setActiveTab] = useState('verzeichnis')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Data
  const [records, setRecords] = useState<PrivacyRecord[]>([])
  const [consents, setConsents] = useState<PrivacyConsent[]>([])
  const [requests, setRequests] = useState<PrivacyRequest[]>([])
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])

  // Modals
  const [createRecordOpen, setCreateRecordOpen] = useState(false)
  const [createConsentOpen, setCreateConsentOpen] = useState(false)
  const [createRequestOpen, setCreateRequestOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<PrivacyRecord | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<PrivacyRequest | null>(null)

  // Forms
  const [recordForm, setRecordForm] = useState({
    title: '', purpose: '', legal_basis: LEGAL_BASIS_OPTIONS[1],
    data_categories: '', affected_persons: '', recipients: '',
    retention_period: '', toms: '', responsible_person: '', notes: '',
  })
  const [consentForm, setConsentForm] = useState({
    person_name: '', person_type: 'kunde', consent_type: '', channel: 'app', notes: '',
  })
  const [requestForm, setRequestForm] = useState({
    requester_name: '', request_type: 'auskunft', description: '', assigned_to: '',
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const supabase = createClient()
      const [r1, r2, r3, r4] = await Promise.all([
        supabase.from('mis_privacy_records').select('*').order('created_at', { ascending: false }),
        supabase.from('mis_privacy_consents').select('*').order('created_at', { ascending: false }),
        supabase.from('mis_privacy_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('mis_privacy_audit_log').select('*').order('created_at', { ascending: false }).limit(100),
      ])
      setRecords((r1.data as PrivacyRecord[]) || [])
      setConsents((r2.data as PrivacyConsent[]) || [])
      setRequests((r3.data as PrivacyRequest[]) || [])
      setAuditLog((r4.data as AuditEntry[]) || [])
    } catch (err) {
      console.error('Privacy load error:', err)
    }
    setLoading(false)
  }

  // ===== CRUD: Records =====
  async function handleCreateRecord() {
    const result = await createPrivacyRecord({
      title: recordForm.title,
      purpose: recordForm.purpose,
      legal_basis: recordForm.legal_basis,
      data_categories: recordForm.data_categories,
      affected_persons: recordForm.affected_persons,
      recipients: recordForm.recipients,
      retention_period: recordForm.retention_period,
      toms: recordForm.toms,
      responsible_person: recordForm.responsible_person,
      notes: recordForm.notes,
    })
    if (result.ok) {
      setCreateRecordOpen(false)
      setRecordForm({ title: '', purpose: '', legal_basis: LEGAL_BASIS_OPTIONS[1], data_categories: '', affected_persons: '', recipients: '', retention_period: '', toms: '', responsible_person: '', notes: '' })
      loadAll()
    } else alert('Fehler: ' + result.error)
  }

  async function handleDeleteRecord(id: string) {
    if (!confirm('Verarbeitungstätigkeit wirklich löschen?')) return
    await deletePrivacyRecord(id)
    setSelectedRecord(null)
    loadAll()
  }

  // ===== CRUD: Consents =====
  async function handleCreateConsent() {
    const result = await createPrivacyConsent({
      person_name: consentForm.person_name,
      person_type: consentForm.person_type,
      consent_type: consentForm.consent_type,
      channel: consentForm.channel,
      notes: consentForm.notes,
    })
    if (result.ok) {
      setCreateConsentOpen(false)
      setConsentForm({ person_name: '', person_type: 'kunde', consent_type: '', channel: 'app', notes: '' })
      loadAll()
    } else alert('Fehler: ' + result.error)
  }

  async function handleRevokeConsent(id: string) {
    await revokePrivacyConsent(id)
    loadAll()
  }

  // ===== CRUD: Requests =====
  async function handleCreateRequest() {
    const result = await createPrivacyRequest({
      requester_name: requestForm.requester_name,
      request_type: requestForm.request_type,
      description: requestForm.description,
      assigned_to: requestForm.assigned_to,
    })
    if (result.ok) {
      setCreateRequestOpen(false)
      setRequestForm({ requester_name: '', request_type: 'auskunft', description: '', assigned_to: '' })
      loadAll()
    } else alert('Fehler: ' + result.error)
  }

  async function handleUpdateRequestStatus(id: string, status: string) {
    await updatePrivacyRequestStatus(id, status)
    setSelectedRequest(null)
    loadAll()
  }

  // ===== Helpers =====
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'
  const formatDateTime = (d: string | null) => d ? new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${BRAND.border}`,
    background: BRAND.light, color: BRAND.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  }

  // ===== KPIs =====
  const openRequests = requests.filter(r => r.status === 'offen' || r.status === 'in_bearbeitung').length
  const overdueRequests = requests.filter(r => {
    if (r.status === 'abgeschlossen' || r.status === 'abgelehnt') return false
    return r.due_date && new Date(r.due_date) < new Date()
  }).length
  const avgProcessingDays = (() => {
    const completed = requests.filter(r => r.completed_at && r.created_at)
    if (completed.length === 0) return 0
    const totalDays = completed.reduce((sum, r) => {
      const diff = new Date(r.completed_at!).getTime() - new Date(r.created_at).getTime()
      return sum + diff / (1000 * 60 * 60 * 24)
    }, 0)
    return Math.round(totalDays / completed.length)
  })()
  const consentRate = (() => {
    if (consents.length === 0) return 0
    const active = consents.filter(c => c.status === 'erteilt').length
    return Math.round((active / consents.length) * 100)
  })()

  // Löschfristen — Einträge mit abgelaufenem retention_period
  const retentionItems = records.filter(r => r.retention_period && r.status === 'active').map(r => {
    const months = parseInt(r.retention_period || '0')
    if (isNaN(months) || months === 0) return null
    const createdDate = new Date(r.created_at)
    const deleteDate = new Date(createdDate)
    const origDay = deleteDate.getDate()
    deleteDate.setMonth(deleteDate.getMonth() + months)
    if (deleteDate.getDate() !== origDay) deleteDate.setDate(0)
    const daysLeft = Math.ceil((deleteDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return { ...r, deleteDate, daysLeft }
  }).filter(Boolean) as (PrivacyRecord & { deleteDate: Date; daysLeft: number })[]

  const overdueDeletions = retentionItems.filter(r => r.daysLeft <= 0).length

  // ===== Tabs =====
  const tabs = [
    { id: 'verzeichnis', label: 'Verarbeitungsverzeichnis', icon: 'files' },
    { id: 'einwilligungen', label: 'Einwilligungen', icon: 'check' },
    { id: 'anfragen', label: 'Datenschutz-Anfragen', icon: 'messageCircle' },
    { id: 'loeschfristen', label: 'Löschfristen', icon: 'clock' },
    { id: 'audit', label: 'Audit-Log', icon: 'eye' },
  ]

  // ===== Create-Button per Tab =====
  const createButton = activeTab === 'verzeichnis' ? (
    <MisButton icon="plus" onClick={() => setCreateRecordOpen(true)}>Neue Tätigkeit</MisButton>
  ) : activeTab === 'einwilligungen' ? (
    <MisButton icon="plus" onClick={() => setCreateConsentOpen(true)}>Einwilligung erfassen</MisButton>
  ) : activeTab === 'anfragen' ? (
    <MisButton icon="plus" onClick={() => setCreateRequestOpen(true)}>Neue Anfrage</MisButton>
  ) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionHeader
        title="DSGVO-Center"
        subtitle="Datenschutz-Grundverordnung — Verarbeitungsverzeichnis, Einwilligungen & Betroffenenrechte"
        icon="shield"
        actions={createButton}
      />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16 }}>
        {[
          { label: 'Offene Anfragen', value: openRequests, icon: 'messageCircle', color: BRAND.warning },
          { label: 'Ø Bearbeitungszeit', value: `${avgProcessingDays} Tage`, icon: 'clock', color: BRAND.info },
          { label: 'Einwilligungsquote', value: `${consentRate}%`, icon: 'check', color: BRAND.success },
          { label: 'Überfällige Löschungen', value: overdueDeletions, icon: 'alert', color: overdueDeletions > 0 ? BRAND.error : BRAND.success },
        ].map((kpi, i) => (
          <Card key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${kpi.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MIcon name={kpi.icon} size={18} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: BRAND.text }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: BRAND.muted }}>{kpi.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Overdue Warning */}
      {overdueRequests > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <MIcon name="alert" size={20} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.error }}>
              {overdueRequests} überfällige Datenschutz-Anfrage{overdueRequests > 1 ? 'n' : ''}
            </div>
            <div style={{ fontSize: 12, color: BRAND.muted }}>Die gesetzliche Frist von 30 Tagen wurde überschritten.</div>
          </div>
        </div>
      )}

      <SearchInput value={search} onChange={setSearch} placeholder="Datenschutz-Einträge durchsuchen..." />

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {loading ? (
        <Card><div style={{ textAlign: 'center', padding: 40, color: BRAND.muted }}>Lade Datenschutz-Daten...</div></Card>
      ) : (
        <>
          {/* ===== TAB: VERARBEITUNGSVERZEICHNIS ===== */}
          {activeTab === 'verzeichnis' && (() => {
            const filtered = records.filter(r =>
              !search || r.title.toLowerCase().includes(search.toLowerCase()) || r.purpose.toLowerCase().includes(search.toLowerCase())
            )
            return filtered.length === 0 ? (
              <EmptyState icon="shield" title="Kein Verarbeitungsverzeichnis" description="Erstellen Sie Ihre erste Verarbeitungstätigkeit gemäß Art. 30 DSGVO." />
            ) : (
              <Card noPad>
                <DataTable
                  columns={[
                    { key: 'title', label: 'Verarbeitungstätigkeit', render: (r: Record<string, unknown>) => (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>{String(r.title)}</div>
                        <div style={{ fontSize: 11, color: BRAND.muted, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(r.purpose)}</div>
                      </div>
                    )},
                    { key: 'legal_basis', label: 'Rechtsgrundlage', render: (r: Record<string, unknown>) => (
                      <span style={{ fontSize: 12, color: BRAND.text }}>{String(r.legal_basis).split('(')[0].trim()}</span>
                    )},
                    { key: 'affected_persons', label: 'Betroffene', render: (r: Record<string, unknown>) => (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {(r.affected_persons as string[] || []).slice(0, 2).map((p, i) => (
                          <Badge key={i} label={p} color={BRAND.info} size="sm" />
                        ))}
                        {(r.affected_persons as string[] || []).length > 2 && <Badge label={`+${(r.affected_persons as string[]).length - 2}`} color={BRAND.muted} size="sm" />}
                      </div>
                    )},
                    { key: 'retention_period', label: 'Löschfrist', render: (r: Record<string, unknown>) => (
                      <span style={{ fontSize: 12, color: BRAND.muted }}>{r.retention_period ? `${r.retention_period} Monate` : '—'}</span>
                    )},
                    { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => {
                      const s = RECORD_STATUS[String(r.status)] || { label: String(r.status), color: BRAND.muted }
                      return <Badge label={s.label} color={s.color} />
                    }},
                    { key: 'actions', label: '', render: (r: Record<string, unknown>) => (
                      <MisButton variant="secondary" icon="eye" size="sm" onClick={() => setSelectedRecord(r as unknown as PrivacyRecord)}>
                        {isMobile ? '' : 'Details'}
                      </MisButton>
                    )},
                  ]}
                  data={filtered as unknown as Record<string, unknown>[]}
                />
              </Card>
            )
          })()}

          {/* ===== TAB: EINWILLIGUNGEN ===== */}
          {activeTab === 'einwilligungen' && (() => {
            const filtered = consents.filter(c =>
              !search || c.person_name.toLowerCase().includes(search.toLowerCase()) || c.consent_type.toLowerCase().includes(search.toLowerCase())
            )
            return filtered.length === 0 ? (
              <EmptyState icon="check" title="Keine Einwilligungen" description="Erfassen Sie die erste Einwilligung eines Kunden oder Engels." />
            ) : (
              <Card noPad>
                <DataTable
                  columns={[
                    { key: 'person_name', label: 'Person', render: (r: Record<string, unknown>) => (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>{String(r.person_name)}</div>
                        <div style={{ fontSize: 11, color: BRAND.muted }}>{PERSON_TYPE_LABELS[String(r.person_type)] || String(r.person_type)}</div>
                      </div>
                    )},
                    { key: 'consent_type', label: 'Einwilligungstyp', render: (r: Record<string, unknown>) => (
                      <span style={{ fontSize: 13, color: BRAND.text }}>{String(r.consent_type)}</span>
                    )},
                    { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => {
                      const s = CONSENT_STATUS[String(r.status)] || { label: String(r.status), color: BRAND.muted }
                      return <Badge label={s.label} color={s.color} />
                    }},
                    { key: 'granted_at', label: 'Erteilt am', render: (r: Record<string, unknown>) => (
                      <span style={{ fontSize: 12, color: BRAND.text }}>{formatDate(r.granted_at as string)}</span>
                    )},
                    { key: 'revoked_at', label: 'Widerrufen am', render: (r: Record<string, unknown>) => (
                      <span style={{ fontSize: 12, color: r.revoked_at ? BRAND.error : BRAND.muted }}>{formatDate(r.revoked_at as string | null)}</span>
                    )},
                    { key: 'channel', label: 'Kanal', render: (r: Record<string, unknown>) => (
                      <Badge label={String(r.channel || 'app')} color={BRAND.info} size="sm" />
                    )},
                    { key: 'actions', label: '', render: (r: Record<string, unknown>) => (
                      String(r.status) === 'erteilt' ? (
                        <MisButton variant="danger" icon="x" size="sm" onClick={() => handleRevokeConsent(String(r.id))}>
                          {isMobile ? '' : 'Widerrufen'}
                        </MisButton>
                      ) : null
                    )},
                  ]}
                  data={filtered as unknown as Record<string, unknown>[]}
                />
              </Card>
            )
          })()}

          {/* ===== TAB: DATENSCHUTZ-ANFRAGEN ===== */}
          {activeTab === 'anfragen' && (() => {
            const filtered = requests.filter(r =>
              !search || r.requester_name.toLowerCase().includes(search.toLowerCase()) || r.request_type.toLowerCase().includes(search.toLowerCase())
            )
            return filtered.length === 0 ? (
              <EmptyState icon="messageCircle" title="Keine Datenschutz-Anfragen" description="Erfassen Sie eingehende Betroffenenrechte-Anfragen." />
            ) : (
              <Card noPad>
                <DataTable
                  columns={[
                    { key: 'requester_name', label: 'Anfragender', render: (r: Record<string, unknown>) => (
                      <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>{String(r.requester_name)}</div>
                    )},
                    { key: 'request_type', label: 'Anfragetyp', render: (r: Record<string, unknown>) => (
                      <span style={{ fontSize: 12, color: BRAND.text }}>{REQUEST_TYPE_LABELS[String(r.request_type)] || String(r.request_type)}</span>
                    )},
                    { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => {
                      const s = REQUEST_STATUS[String(r.status)] || { label: String(r.status), color: BRAND.muted }
                      return <Badge label={s.label} color={s.color} />
                    }},
                    { key: 'due_date', label: 'Frist', render: (r: Record<string, unknown>) => {
                      const due = r.due_date as string | null
                      if (!due) return <span style={{ color: BRAND.muted }}>—</span>
                      const isOverdue = new Date(due) < new Date() && String(r.status) !== 'abgeschlossen' && String(r.status) !== 'abgelehnt'
                      return <span style={{ fontSize: 12, color: isOverdue ? BRAND.error : BRAND.text, fontWeight: isOverdue ? 700 : 400 }}>
                        {formatDate(due)} {isOverdue && '⚠'}
                      </span>
                    }},
                    { key: 'assigned_to', label: 'Bearbeiter', render: (r: Record<string, unknown>) => (
                      <span style={{ fontSize: 12, color: BRAND.muted }}>{String(r.assigned_to || '—')}</span>
                    )},
                    { key: 'actions', label: '', render: (r: Record<string, unknown>) => (
                      <MisButton variant="secondary" icon="eye" size="sm" onClick={() => setSelectedRequest(r as unknown as PrivacyRequest)}>
                        {isMobile ? '' : 'Details'}
                      </MisButton>
                    )},
                  ]}
                  data={filtered as unknown as Record<string, unknown>[]}
                />
              </Card>
            )
          })()}

          {/* ===== TAB: LÖSCHFRISTEN ===== */}
          {activeTab === 'loeschfristen' && (() => {
            const sorted = [...retentionItems].sort((a, b) => a.daysLeft - b.daysLeft)
            const filteredItems = sorted.filter(r =>
              !search || r.title.toLowerCase().includes(search.toLowerCase())
            )
            return filteredItems.length === 0 ? (
              <EmptyState icon="clock" title="Keine Löschfristen definiert" description="Hinterlegen Sie Löschfristen in Ihren Verarbeitungstätigkeiten (in Monaten)." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filteredItems.map(item => {
                  const totalMonths = parseInt(item.retention_period || '0')
                  const totalDays = totalMonths * 30
                  const elapsed = totalDays - item.daysLeft
                  const progress = Math.min(100, Math.max(0, (elapsed / totalDays) * 100))
                  const statusColor = item.daysLeft <= 0 ? BRAND.error : item.daysLeft <= 30 ? BRAND.warning : BRAND.success

                  return (
                    <Card key={item.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: BRAND.text, marginBottom: 4 }}>{item.title}</div>
                          <div style={{ fontSize: 12, color: BRAND.muted, marginBottom: 8 }}>
                            Aufbewahrung: {item.retention_period} Monate — Löschdatum: {formatDate(item.deleteDate.toISOString())}
                          </div>
                          <ProgressBar value={progress} color={statusColor} label={
                            item.daysLeft <= 0 ? `${Math.abs(item.daysLeft)} Tage überfällig` : `${item.daysLeft} Tage verbleibend`
                          } />
                        </div>
                        <Badge
                          label={item.daysLeft <= 0 ? 'Überfällig' : item.daysLeft <= 30 ? 'Bald fällig' : 'OK'}
                          color={statusColor}
                        />
                      </div>
                    </Card>
                  )
                })}
              </div>
            )
          })()}

          {/* ===== TAB: AUDIT-LOG ===== */}
          {activeTab === 'audit' && (() => {
            const filtered = auditLog.filter(a =>
              !search || a.action.toLowerCase().includes(search.toLowerCase()) || a.entity_type.toLowerCase().includes(search.toLowerCase()) || (a.performed_by || '').toLowerCase().includes(search.toLowerCase())
            )
            return filtered.length === 0 ? (
              <EmptyState icon="eye" title="Kein Audit-Log" description="Aktionen werden automatisch protokolliert." />
            ) : (
              <Card noPad>
                <DataTable
                  columns={[
                    { key: 'created_at', label: 'Zeitpunkt', render: (r: Record<string, unknown>) => (
                      <span style={{ fontSize: 12, color: BRAND.muted }}>{formatDateTime(r.created_at as string)}</span>
                    )},
                    { key: 'action', label: 'Aktion', render: (r: Record<string, unknown>) => (
                      <Badge label={String(r.action).replace(/_/g, ' ')} color={BRAND.gold} />
                    )},
                    { key: 'entity_type', label: 'Bereich', render: (r: Record<string, unknown>) => (
                      <span style={{ fontSize: 13, color: BRAND.text, textTransform: 'capitalize' }}>{String(r.entity_type).replace(/_/g, ' ')}</span>
                    )},
                    { key: 'performed_by', label: 'Ausgeführt von', render: (r: Record<string, unknown>) => (
                      <span style={{ fontSize: 12, color: BRAND.muted }}>{String(r.performed_by || '—')}</span>
                    )},
                    { key: 'details', label: 'Details', render: (r: Record<string, unknown>) => {
                      const det = r.details as Record<string, unknown> | null
                      if (!det || Object.keys(det).length === 0) return <span style={{ color: BRAND.muted }}>—</span>
                      return <span style={{ fontSize: 11, color: BRAND.muted }}>{Object.entries(det).map(([k, v]) => `${k}: ${v}`).join(', ')}</span>
                    }},
                  ]}
                  data={filtered as unknown as Record<string, unknown>[]}
                />
              </Card>
            )
          })()}
        </>
      )}

      {/* ===== MODAL: Verarbeitungstätigkeit erstellen ===== */}
      {createRecordOpen && (
        <Modal open title="Neue Verarbeitungstätigkeit (Art. 30)" onClose={() => setCreateRecordOpen(false)} width={600}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Bezeichnung *</label>
              <input style={inputStyle} value={recordForm.title} onChange={e => setRecordForm({ ...recordForm, title: e.target.value })} placeholder="z.B. Kundenverwaltung" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Zweck der Verarbeitung *</label>
              <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={recordForm.purpose} onChange={e => setRecordForm({ ...recordForm, purpose: e.target.value })} placeholder="Beschreiben Sie den Zweck..." />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Rechtsgrundlage *</label>
              <select style={inputStyle} value={recordForm.legal_basis} onChange={e => setRecordForm({ ...recordForm, legal_basis: e.target.value })}>
                {LEGAL_BASIS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Datenkategorien</label>
                <input style={inputStyle} value={recordForm.data_categories} onChange={e => setRecordForm({ ...recordForm, data_categories: e.target.value })} placeholder="Name, Adresse, E-Mail (kommagetrennt)" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Betroffene Personen</label>
                <input style={inputStyle} value={recordForm.affected_persons} onChange={e => setRecordForm({ ...recordForm, affected_persons: e.target.value })} placeholder="Kunden, Engel (kommagetrennt)" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Empfänger</label>
                <input style={inputStyle} value={recordForm.recipients} onChange={e => setRecordForm({ ...recordForm, recipients: e.target.value })} placeholder="Pflegekasse, Finanzamt (kommagetrennt)" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Löschfrist (Monate)</label>
                <input style={inputStyle} type="number" value={recordForm.retention_period} onChange={e => setRecordForm({ ...recordForm, retention_period: e.target.value })} placeholder="z.B. 36" />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Technisch-organisatorische Maßnahmen (TOMs)</label>
              <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={recordForm.toms} onChange={e => setRecordForm({ ...recordForm, toms: e.target.value })} placeholder="Verschlüsselung, Zugangskontrolle, Backup-Konzept..." />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Verantwortliche Person</label>
                <input style={inputStyle} value={recordForm.responsible_person} onChange={e => setRecordForm({ ...recordForm, responsible_person: e.target.value })} placeholder="Name des/der DSB" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Notizen</label>
                <input style={inputStyle} value={recordForm.notes} onChange={e => setRecordForm({ ...recordForm, notes: e.target.value })} placeholder="Zusätzliche Hinweise" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setCreateRecordOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="plus" onClick={handleCreateRecord} disabled={!recordForm.title || !recordForm.purpose}>Erstellen</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== MODAL: Einwilligung erfassen ===== */}
      {createConsentOpen && (
        <Modal open title="Einwilligung erfassen" onClose={() => setCreateConsentOpen(false)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Name der Person *</label>
              <input style={inputStyle} value={consentForm.person_name} onChange={e => setConsentForm({ ...consentForm, person_name: e.target.value })} placeholder="Vor- und Nachname" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Personentyp *</label>
                <select style={inputStyle} value={consentForm.person_type} onChange={e => setConsentForm({ ...consentForm, person_type: e.target.value })}>
                  <option value="kunde">Kunde</option>
                  <option value="engel">Engel</option>
                  <option value="mitarbeiter">Mitarbeiter</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Kanal</label>
                <select style={inputStyle} value={consentForm.channel} onChange={e => setConsentForm({ ...consentForm, channel: e.target.value })}>
                  {['app', 'email', 'papier', 'telefon', 'website'].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Einwilligungstyp *</label>
              <input style={inputStyle} value={consentForm.consent_type} onChange={e => setConsentForm({ ...consentForm, consent_type: e.target.value })} placeholder="z.B. Datenverarbeitung, Marketing, Fotonutzung" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Notizen</label>
              <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={consentForm.notes} onChange={e => setConsentForm({ ...consentForm, notes: e.target.value })} placeholder="Zusätzliche Hinweise..." />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setCreateConsentOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="check" onClick={handleCreateConsent} disabled={!consentForm.person_name || !consentForm.consent_type}>Einwilligung speichern</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== MODAL: Datenschutz-Anfrage erstellen ===== */}
      {createRequestOpen && (
        <Modal open title="Neue Datenschutz-Anfrage" onClose={() => setCreateRequestOpen(false)} width={500}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Name des Anfragenden *</label>
              <input style={inputStyle} value={requestForm.requester_name} onChange={e => setRequestForm({ ...requestForm, requester_name: e.target.value })} placeholder="Vor- und Nachname" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Anfragetyp *</label>
              <select style={inputStyle} value={requestForm.request_type} onChange={e => setRequestForm({ ...requestForm, request_type: e.target.value })}>
                {Object.entries(REQUEST_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Beschreibung</label>
              <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={requestForm.description} onChange={e => setRequestForm({ ...requestForm, description: e.target.value })} placeholder="Details zur Anfrage..." />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Zuständiger Bearbeiter</label>
              <input style={inputStyle} value={requestForm.assigned_to} onChange={e => setRequestForm({ ...requestForm, assigned_to: e.target.value })} placeholder="Name" />
            </div>
            <div style={{ padding: '10px 14px', background: `${BRAND.info}10`, borderRadius: 8, fontSize: 12, color: BRAND.muted }}>
              <strong style={{ color: BRAND.info }}>Hinweis:</strong> Die gesetzliche Bearbeitungsfrist von 30 Tagen wird automatisch gesetzt.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setCreateRequestOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="plus" onClick={handleCreateRequest} disabled={!requestForm.requester_name}>Anfrage erstellen</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== MODAL: Verarbeitungstätigkeit Detail ===== */}
      {selectedRecord && (
        <Modal open title={selectedRecord.title} onClose={() => setSelectedRecord(null)} width={600}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Zweck</div>
                <div style={{ fontSize: 13, color: BRAND.text }}>{selectedRecord.purpose}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Rechtsgrundlage</div>
                <div style={{ fontSize: 13, color: BRAND.text }}>{selectedRecord.legal_basis}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Status</div>
                <Badge label={RECORD_STATUS[selectedRecord.status]?.label || selectedRecord.status} color={RECORD_STATUS[selectedRecord.status]?.color || BRAND.muted} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Verantwortlich</div>
                <div style={{ fontSize: 13, color: BRAND.text }}>{selectedRecord.responsible_person || '—'}</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Datenkategorien</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {selectedRecord.data_categories.length > 0 ? selectedRecord.data_categories.map((c, i) => <Badge key={i} label={c} color={BRAND.gold} size="sm" />) : <span style={{ color: BRAND.muted, fontSize: 12 }}>—</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Betroffene Personen</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {selectedRecord.affected_persons.length > 0 ? selectedRecord.affected_persons.map((p, i) => <Badge key={i} label={p} color={BRAND.info} size="sm" />) : <span style={{ color: BRAND.muted, fontSize: 12 }}>—</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Empfänger</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {selectedRecord.recipients.length > 0 ? selectedRecord.recipients.map((r, i) => <Badge key={i} label={r} color={BRAND.warning} size="sm" />) : <span style={{ color: BRAND.muted, fontSize: 12 }}>—</span>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Löschfrist</div>
                <div style={{ fontSize: 13, color: BRAND.text }}>{selectedRecord.retention_period ? `${selectedRecord.retention_period} Monate` : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Drittlandtransfer</div>
                <div style={{ fontSize: 13, color: selectedRecord.third_country_transfer ? BRAND.warning : BRAND.success }}>
                  {selectedRecord.third_country_transfer ? 'Ja' : 'Nein'}
                </div>
              </div>
            </div>
            {selectedRecord.toms && (
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>TOMs</div>
                <div style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.6, padding: 12, background: BRAND.light, borderRadius: 8 }}>{selectedRecord.toms}</div>
              </div>
            )}
            {selectedRecord.notes && (
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Notizen</div>
                <div style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.6, padding: 12, background: BRAND.light, borderRadius: 8 }}>{selectedRecord.notes}</div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <MisButton variant="danger" icon="trash" onClick={() => handleDeleteRecord(selectedRecord.id)}>Löschen</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== MODAL: Anfrage Detail ===== */}
      {selectedRequest && (
        <Modal open title={`Anfrage: ${selectedRequest.requester_name}`} onClose={() => setSelectedRequest(null)} width={540}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Anfragetyp</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{REQUEST_TYPE_LABELS[selectedRequest.request_type]}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Status</div>
                <Badge label={REQUEST_STATUS[selectedRequest.status]?.label || selectedRequest.status} color={REQUEST_STATUS[selectedRequest.status]?.color || BRAND.muted} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Erstellt am</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{formatDateTime(selectedRequest.created_at)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Frist</div>
                <div style={{ fontSize: 14, color: selectedRequest.due_date && new Date(selectedRequest.due_date) < new Date() && selectedRequest.status !== 'abgeschlossen' ? BRAND.error : BRAND.text, fontWeight: 600 }}>
                  {formatDate(selectedRequest.due_date)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Bearbeiter</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{selectedRequest.assigned_to || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Abgeschlossen am</div>
                <div style={{ fontSize: 14, color: selectedRequest.completed_at ? BRAND.success : BRAND.muted }}>
                  {formatDateTime(selectedRequest.completed_at)}
                </div>
              </div>
            </div>
            {selectedRequest.description && (
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Beschreibung</div>
                <div style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.6, padding: 12, background: BRAND.light, borderRadius: 8 }}>{selectedRequest.description}</div>
              </div>
            )}
            {/* Frist-Fortschritt */}
            {selectedRequest.due_date && selectedRequest.status !== 'abgeschlossen' && selectedRequest.status !== 'abgelehnt' && (() => {
              const totalDays = 30
              const created = new Date(selectedRequest.created_at).getTime()
              const due = new Date(selectedRequest.due_date).getTime()
              const now = Date.now()
              const elapsed = Math.ceil((now - created) / (1000 * 60 * 60 * 24))
              const remaining = Math.ceil((due - now) / (1000 * 60 * 60 * 24))
              const progress = Math.min(100, (elapsed / totalDays) * 100)
              return (
                <div>
                  <ProgressBar
                    value={progress}
                    color={remaining <= 0 ? BRAND.error : remaining <= 7 ? BRAND.warning : BRAND.success}
                    label={remaining <= 0 ? `${Math.abs(remaining)} Tage überfällig` : `${remaining} von 30 Tagen verbleibend`}
                  />
                </div>
              )
            })()}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {selectedRequest.status === 'offen' && (
                <MisButton icon="zap" onClick={() => handleUpdateRequestStatus(selectedRequest.id, 'in_bearbeitung')}>In Bearbeitung</MisButton>
              )}
              {(selectedRequest.status === 'offen' || selectedRequest.status === 'in_bearbeitung') && (
                <MisButton icon="check" onClick={() => handleUpdateRequestStatus(selectedRequest.id, 'abgeschlossen')}>Abschließen</MisButton>
              )}
              {(selectedRequest.status === 'offen' || selectedRequest.status === 'in_bearbeitung') && (
                <MisButton variant="danger" icon="x" onClick={() => handleUpdateRequestStatus(selectedRequest.id, 'abgelehnt')}>Ablehnen</MisButton>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
