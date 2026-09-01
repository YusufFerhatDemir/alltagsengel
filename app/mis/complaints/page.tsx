'use client'
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, DataTable, MisButton, SearchInput, Badge, Tabs, EmptyState, Modal } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'
import { useMis } from '@/lib/mis/MisContext'
import { createComplaint, updateComplaintStatus, saveComplaintCapa, deleteComplaint } from './actions'
import { logger } from '@/lib/logger'
const log = logger.child('mis:complaints')

// ===== Beschwerde-Konstanten =====
const COMPLAINT_STATUS: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  eingegangen: { label: 'Eingegangen', color: '#3B82F6', next: 'in_bearbeitung', nextLabel: 'Bearbeitung starten' },
  in_bearbeitung: { label: 'In Bearbeitung', color: '#F59E0B', next: 'massnahme_eingeleitet', nextLabel: 'Maßnahme einleiten' },
  massnahme_eingeleitet: { label: 'Maßnahme eingeleitet', color: '#F97316', next: 'geloest', nextLabel: 'Als gelöst markieren' },
  geloest: { label: 'Gelöst', color: '#22C55E', next: 'geschlossen', nextLabel: 'Abschließen' },
  geschlossen: { label: 'Geschlossen', color: '#6B7280' },
}

const COMPLAINT_CATEGORIES: Record<string, { label: string; icon: string }> = {
  puenktlichkeit: { label: 'Pünktlichkeit', icon: 'clock' },
  qualitaet: { label: 'Qualität', icon: 'shield' },
  kommunikation: { label: 'Kommunikation', icon: 'send' },
  abrechnung: { label: 'Abrechnung', icon: 'banknote' },
  verhalten: { label: 'Verhalten', icon: 'users' },
  sonstiges: { label: 'Sonstiges', icon: 'files' },
}

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  normal: { label: 'Normal', color: '#3B82F6' },
  dringend: { label: 'Dringend', color: '#F97316' },
  kritisch: { label: 'Kritisch', color: '#EF4444' },
}

const STATUS_TABS = [
  { id: 'alle', label: 'Alle' },
  { id: 'eingegangen', label: 'Eingegangen' },
  { id: 'in_bearbeitung', label: 'In Bearbeitung' },
  { id: 'massnahme_eingeleitet', label: 'Maßnahme' },
  { id: 'geloest', label: 'Gelöst' },
  { id: 'geschlossen', label: 'Geschlossen' },
]

interface Complaint {
  id: string
  title: string
  description: string
  category: string
  priority: string
  status: string
  customer_name: string
  angel_name: string
  reported_by: string
  assigned_to: string
  incident_date: string | null
  due_date: string | null
  resolved_date: string | null
  closed_date: string | null
  corrective_action: string
  preventive_action: string
  root_cause: string
  notes: string
  created_at: string
  updated_at: string
}

// ===== BESCHWERDEMANAGEMENT =====
export default function ComplaintsPage() {
  const { isMobile } = useMis()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('alle')
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null)
  const [capaOpen, setCapaOpen] = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', category: 'sonstiges', priority: 'normal',
    customer_name: '', angel_name: '', reported_by: '', assigned_to: '',
    incident_date: '', due_date: '', notes: '',
  })
  const [capaForm, setCapaForm] = useState({
    root_cause: '', corrective_action: '', preventive_action: '',
  })

  useEffect(() => { loadComplaints() }, [])

  async function loadComplaints() {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('mis_complaints')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) log.errorWithException('Complaints error', error)
      setComplaints(data as Complaint[] || [])
    } catch (err) {
      log.errorWithException('Complaints load error', err)
    }
    setLoading(false)
  }

  async function handleCreate() {
    const result = await createComplaint({
      title: form.title,
      description: form.description,
      category: form.category,
      priority: form.priority,
      customer_name: form.customer_name,
      angel_name: form.angel_name,
      reported_by: form.reported_by,
      assigned_to: form.assigned_to,
      incident_date: form.incident_date,
      due_date: form.due_date,
      notes: form.notes,
    })
    if (result.ok) {
      setCreateOpen(false)
      setForm({ title: '', description: '', category: 'sonstiges', priority: 'normal', customer_name: '', angel_name: '', reported_by: '', assigned_to: '', incident_date: '', due_date: '', notes: '' })
      loadComplaints()
    } else {
      alert('Fehler: ' + result.error)
    }
  }

  async function handleStatusChange(complaint: Complaint, newStatus: string) {
    await updateComplaintStatus(complaint.id, newStatus)
    setSelectedComplaint(null)
    loadComplaints()
  }

  async function handleSaveCapa() {
    if (!selectedComplaint) return
    await saveComplaintCapa(selectedComplaint.id, {
      root_cause: capaForm.root_cause,
      corrective_action: capaForm.corrective_action,
      preventive_action: capaForm.preventive_action,
    })
    setCapaOpen(false)
    setSelectedComplaint(null)
    loadComplaints()
  }

  async function handleDelete(id: string) {
    if (!confirm('Beschwerde wirklich löschen?')) return
    await deleteComplaint(id)
    setSelectedComplaint(null)
    loadComplaints()
  }

  // Filter
  const filtered = complaints.filter(c => {
    const matchesSearch = !search ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      c.angel_name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase())
    const matchesTab = activeTab === 'alle' || c.status === activeTab
    return matchesSearch && matchesTab
  })

  // ===== KPIs =====
  const openCount = complaints.filter(c => !['geloest', 'geschlossen'].includes(c.status)).length
  const resolvedCount = complaints.filter(c => ['geloest', 'geschlossen'].includes(c.status)).length
  const resolutionRate = complaints.length > 0 ? Math.round((resolvedCount / complaints.length) * 100) : 0

  // Ø Bearbeitungszeit (Tage)
  const resolvedWithDates = complaints.filter(c => c.resolved_date && c.created_at)
  const avgDays = resolvedWithDates.length > 0
    ? Math.round(resolvedWithDates.reduce((sum, c) => {
        const created = new Date(c.created_at).getTime()
        const resolved = new Date(c.resolved_date!).getTime()
        return sum + (resolved - created) / (1000 * 60 * 60 * 24)
      }, 0) / resolvedWithDates.length)
    : 0

  // Beschwerden diesen Monat
  const now = new Date()
  const thisMonth = complaints.filter(c => {
    const d = new Date(c.created_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  const kritisch = complaints.filter(c => c.priority === 'kritisch' && !['geloest', 'geschlossen'].includes(c.status)).length

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${BRAND.border}`,
    background: BRAND.light, color: BRAND.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionHeader
        title="Beschwerdemanagement"
        subtitle="Qualitätssicherung nach §45b SGB XI — Beschwerden erfassen, bearbeiten und nachverfolgen"
        icon="alert"
        actions={
          <MisButton icon="plus" onClick={() => setCreateOpen(true)}>
            Neue Beschwerde
          </MisButton>
        }
      />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: isMobile ? 10 : 16 }}>
        {[
          { label: 'Offen', value: openCount, icon: 'alert', color: BRAND.warning },
          { label: 'Ø Bearbeitungszeit', value: `${avgDays} Tage`, icon: 'clock', color: BRAND.info },
          { label: 'Lösungsrate', value: `${resolutionRate}%`, icon: 'check', color: BRAND.success },
          { label: 'Diesen Monat', value: thisMonth, icon: 'calendar', color: BRAND.gold },
          { label: 'Kritisch offen', value: kritisch, icon: 'zap', color: BRAND.error },
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

      {/* Search */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Beschwerde, Kunde oder Engel suchen..." />
        </div>
      </div>

      {/* Status Tabs */}
      <Tabs
        tabs={STATUS_TABS.map(t => {
          const count = t.id === 'alle' ? complaints.length : complaints.filter(c => c.status === t.id).length
          return { id: t.id, label: t.label, count }
        })}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* Complaints Table */}
      {loading ? (
        <Card><div style={{ textAlign: 'center', padding: 40, color: BRAND.muted }}>Lade Beschwerden...</div></Card>
      ) : filtered.length === 0 ? (
        <EmptyState icon="alert" title="Keine Beschwerden" description={activeTab === 'alle' ? 'Noch keine Beschwerden erfasst. Das ist ein gutes Zeichen!' : 'Keine Beschwerden mit diesem Status.'} />
      ) : (
        <Card noPad>
          <DataTable
            columns={[
              { key: 'title', label: 'Beschwerde', render: (r: Record<string, unknown>) => (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>{String(r.title)}</div>
                  <div style={{ fontSize: 11, color: BRAND.muted }}>
                    {COMPLAINT_CATEGORIES[String(r.category)]?.label || String(r.category)}
                  </div>
                </div>
              )},
              { key: 'customer_name', label: 'Kunde', render: (r: Record<string, unknown>) => (
                <div>
                  <div style={{ fontSize: 13, color: BRAND.text }}>{String(r.customer_name) || '—'}</div>
                  <div style={{ fontSize: 11, color: BRAND.muted }}>{String(r.angel_name) ? `Engel: ${String(r.angel_name)}` : ''}</div>
                </div>
              )},
              { key: 'priority', label: 'Priorität', render: (r: Record<string, unknown>) => {
                const p = PRIORITY_MAP[String(r.priority)] || { label: String(r.priority), color: BRAND.muted }
                return <Badge label={p.label} color={p.color} />
              }},
              { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => {
                const st = COMPLAINT_STATUS[String(r.status)] || { label: String(r.status), color: BRAND.muted }
                return <Badge label={st.label} color={st.color} />
              }},
              { key: 'created_at', label: 'Erfasst', render: (r: Record<string, unknown>) => (
                <span style={{ fontSize: 12, color: BRAND.muted }}>{formatDate(r.created_at as string)}</span>
              )},
              { key: 'actions', label: '', render: (r: Record<string, unknown>) => (
                <MisButton variant="secondary" icon="eye" onClick={() => {
                  const complaint = r as unknown as Complaint
                  setSelectedComplaint(complaint)
                  setCapaForm({
                    root_cause: complaint.root_cause || '',
                    corrective_action: complaint.corrective_action || '',
                    preventive_action: complaint.preventive_action || '',
                  })
                }}>
                  {isMobile ? '' : 'Details'}
                </MisButton>
              )},
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </Card>
      )}

      {/* ===== Create Modal ===== */}
      {createOpen && (
        <Modal open title="Neue Beschwerde erfassen" onClose={() => setCreateOpen(false)} width={600}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="complaints-betreff" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Betreff *</label>
              <input id="complaints-betreff" style={inputStyle} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Kurzbeschreibung der Beschwerde" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="complaints-kunde" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Kunde</label>
                <input id="complaints-kunde" style={inputStyle} value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} placeholder="Name des Kunden" />
              </div>
              <div>
                <label htmlFor="complaints-betroffener-engel" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Betroffener Engel</label>
                <input id="complaints-betroffener-engel" style={inputStyle} value={form.angel_name} onChange={e => setForm({ ...form, angel_name: e.target.value })} placeholder="Name des Engels" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="complaints-kategorie" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Kategorie</label>
                <select id="complaints-kategorie" style={inputStyle} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  {Object.entries(COMPLAINT_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="complaints-eskalationsstufe" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Eskalationsstufe</label>
                <select id="complaints-eskalationsstufe" style={inputStyle} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                  {Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="complaints-vorfallsdatum" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Vorfallsdatum</label>
                <input id="complaints-vorfallsdatum" style={inputStyle} type="date" value={form.incident_date} onChange={e => setForm({ ...form, incident_date: e.target.value })} />
              </div>
              <div>
                <label htmlFor="complaints-faelligkeitsdatum" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Fälligkeitsdatum</label>
                <input id="complaints-faelligkeitsdatum" style={inputStyle} type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="complaints-gemeldet-von" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Gemeldet von</label>
                <input id="complaints-gemeldet-von" style={inputStyle} value={form.reported_by} onChange={e => setForm({ ...form, reported_by: e.target.value })} placeholder="Wer hat gemeldet?" />
              </div>
              <div>
                <label htmlFor="complaints-zugewiesen-an" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Zugewiesen an</label>
                <input id="complaints-zugewiesen-an" style={inputStyle} value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} placeholder="Verantwortliche Person" />
              </div>
            </div>
            <div>
              <label htmlFor="complaints-beschreibung" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Beschreibung *</label>
              <textarea id="complaints-beschreibung" style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Detaillierte Beschreibung des Vorfalls..." />
            </div>
            <div>
              <label htmlFor="complaints-notizen" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Notizen</label>
              <textarea id="complaints-notizen" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Interne Anmerkungen..." />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setCreateOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="plus" onClick={handleCreate} disabled={!form.title || !form.description}>Beschwerde erfassen</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== Detail Modal ===== */}
      {selectedComplaint && !capaOpen && (
        <Modal open title={selectedComplaint.title} onClose={() => setSelectedComplaint(null)} width={650}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Status & Priorität Header */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge label={COMPLAINT_STATUS[selectedComplaint.status]?.label || selectedComplaint.status} color={COMPLAINT_STATUS[selectedComplaint.status]?.color || BRAND.muted} />
              <Badge label={PRIORITY_MAP[selectedComplaint.priority]?.label || selectedComplaint.priority} color={PRIORITY_MAP[selectedComplaint.priority]?.color || BRAND.muted} />
              <Badge label={COMPLAINT_CATEGORIES[selectedComplaint.category]?.label || selectedComplaint.category} color={BRAND.gold} />
            </div>

            {/* Details Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Kunde</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>{selectedComplaint.customer_name || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Betroffener Engel</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{selectedComplaint.angel_name || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Gemeldet von</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{selectedComplaint.reported_by || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Zugewiesen an</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{selectedComplaint.assigned_to || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Vorfallsdatum</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{formatDate(selectedComplaint.incident_date)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Fälligkeitsdatum</div>
                <div style={{ fontSize: 14, color: selectedComplaint.due_date && new Date(selectedComplaint.due_date) < new Date() && !['geloest', 'geschlossen'].includes(selectedComplaint.status) ? BRAND.error : BRAND.text, fontWeight: selectedComplaint.due_date && new Date(selectedComplaint.due_date) < new Date() ? 700 : 400 }}>
                  {formatDate(selectedComplaint.due_date)}
                  {selectedComplaint.due_date && new Date(selectedComplaint.due_date) < new Date() && !['geloest', 'geschlossen'].includes(selectedComplaint.status) && ' (Überfällig!)'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Erfasst am</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{formatDate(selectedComplaint.created_at)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Gelöst am</div>
                <div style={{ fontSize: 14, color: selectedComplaint.resolved_date ? BRAND.success : BRAND.muted }}>
                  {selectedComplaint.resolved_date ? formatDate(selectedComplaint.resolved_date) : 'Noch offen'}
                </div>
              </div>
            </div>

            {/* Beschreibung */}
            <div>
              <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Beschreibung</div>
              <div style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.6, padding: 12, background: BRAND.light, borderRadius: 8 }}>
                {selectedComplaint.description || '—'}
              </div>
            </div>

            {/* CAPA Section */}
            {(selectedComplaint.root_cause || selectedComplaint.corrective_action || selectedComplaint.preventive_action) && (
              <div style={{ borderTop: `1px solid ${BRAND.border}`, paddingTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.gold, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MIcon name="shield" size={16} /> Maßnahmen (CAPA)
                </div>
                {selectedComplaint.root_cause && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Ursachenanalyse</div>
                    <div style={{ fontSize: 13, color: BRAND.text, padding: 10, background: BRAND.light, borderRadius: 8 }}>{selectedComplaint.root_cause}</div>
                  </div>
                )}
                {selectedComplaint.corrective_action && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Korrekturmaßnahme</div>
                    <div style={{ fontSize: 13, color: BRAND.text, padding: 10, background: BRAND.light, borderRadius: 8 }}>{selectedComplaint.corrective_action}</div>
                  </div>
                )}
                {selectedComplaint.preventive_action && (
                  <div>
                    <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Präventivmaßnahme</div>
                    <div style={{ fontSize: 13, color: BRAND.text, padding: 10, background: BRAND.light, borderRadius: 8 }}>{selectedComplaint.preventive_action}</div>
                  </div>
                )}
              </div>
            )}

            {/* Notizen */}
            {selectedComplaint.notes && (
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Interne Notizen</div>
                <div style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.6, padding: 12, background: BRAND.light, borderRadius: 8 }}>{selectedComplaint.notes}</div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* Status-Workflow Button */}
                {COMPLAINT_STATUS[selectedComplaint.status]?.next && (
                  <MisButton icon="check" onClick={() => handleStatusChange(selectedComplaint, COMPLAINT_STATUS[selectedComplaint.status].next!)}>
                    {COMPLAINT_STATUS[selectedComplaint.status].nextLabel}
                  </MisButton>
                )}
                {/* CAPA Button */}
                {!['geschlossen'].includes(selectedComplaint.status) && (
                  <MisButton variant="secondary" icon="shield" onClick={() => setCapaOpen(true)}>
                    Maßnahmen bearbeiten
                  </MisButton>
                )}
              </div>
              <MisButton variant="danger" icon="trash" onClick={() => handleDelete(selectedComplaint.id)}>Löschen</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== CAPA Modal ===== */}
      {capaOpen && selectedComplaint && (
        <Modal open title="Maßnahmen (CAPA)" onClose={() => setCapaOpen(false)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, color: BRAND.muted, padding: '8px 12px', background: `${BRAND.gold}10`, borderRadius: 8, border: `1px solid ${BRAND.border}` }}>
              <strong style={{ color: BRAND.gold }}>CAPA</strong> — Korrektur- und Präventivmaßnahmen dokumentieren, um systematische Verbesserungen nachzuweisen.
            </div>
            <div>
              <label htmlFor="complaints-ursachenanalyse-root-cause" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Ursachenanalyse (Root Cause)</label>
              <textarea id="complaints-ursachenanalyse-root-cause" style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={capaForm.root_cause} onChange={e => setCapaForm({ ...capaForm, root_cause: e.target.value })} placeholder="Was war die eigentliche Ursache?" />
            </div>
            <div>
              <label htmlFor="complaints-korrekturmassnahme-corrective-action" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Korrekturmaßnahme (Corrective Action)</label>
              <textarea id="complaints-korrekturmassnahme-corrective-action" style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={capaForm.corrective_action} onChange={e => setCapaForm({ ...capaForm, corrective_action: e.target.value })} placeholder="Was wurde sofort unternommen?" />
            </div>
            <div>
              <label htmlFor="complaints-praeventivmassnahme-preventive-action" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Präventivmaßnahme (Preventive Action)</label>
              <textarea id="complaints-praeventivmassnahme-preventive-action" style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={capaForm.preventive_action} onChange={e => setCapaForm({ ...capaForm, preventive_action: e.target.value })} placeholder="Wie wird verhindert, dass es wieder vorkommt?" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setCapaOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="check" onClick={handleSaveCapa}>Maßnahmen speichern</MisButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
