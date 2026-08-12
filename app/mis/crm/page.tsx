'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, DataTable, MisButton, SearchInput, Badge, Tabs, EmptyState, Modal, KpiCard, ActivityItem } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'
import { useMis } from '@/lib/mis/MisContext'

// ===== Pipeline Status =====
const PIPELINE_STATUS: Record<string, { label: string; color: string; icon: string }> = {
  lead: { label: 'Lead', color: '#3B82F6', icon: 'inbox' },
  erstgespraech: { label: 'Erstgespräch', color: '#F59E0B', icon: 'messageCircle' },
  active: { label: 'Aktiv', color: '#22C55E', icon: 'check' },
  paused: { label: 'Pausiert', color: '#8A8278', icon: 'clock' },
  ended: { label: 'Beendet', color: '#EF4444', icon: 'x' },
}

const LEAD_STATUS: Record<string, { label: string; color: string }> = {
  new: { label: 'Neu', color: '#3B82F6' },
  contacted: { label: 'Kontaktiert', color: '#F59E0B' },
  qualified: { label: 'Qualifiziert', color: '#22C55E' },
  converted: { label: 'Konvertiert', color: BRAND.gold },
  lost: { label: 'Verloren', color: '#EF4444' },
}

const PARTNER_TYPES: Record<string, string> = {
  pflegedienst: 'Pflegedienst',
  arztpraxis: 'Arztpraxis',
  klinik: 'Klinik',
  beratungsstelle: 'Beratungsstelle',
  pflegestuetzpunkt: 'Pflegestützpunkt',
  vermittler: 'Vermittler',
  sonstige: 'Sonstige',
}

// ===== Types =====
interface Client {
  id: string
  customer_number: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  city: string | null
  zip_code: string | null
  care_level: number | null
  pipeline_status: string
  source: string | null
  assigned_engel: string | null
  monthly_hours: number | null
  contract_start: string | null
  last_contact: string | null
  status: string
  notes: string | null
  created_at: string
}

interface Lead {
  id: string
  name: string
  phone: string
  plz: string
  message: string | null
  source: string | null
  service: string | null
  utm_source: string | null
  status: string
  assigned_to: string | null
  follow_up_date: string | null
  notes: string | null
  converted_client_id: string | null
  created_at: string
}

interface Partner {
  id: string
  name: string
  type: string
  city: string | null
  phone: string | null
  email: string | null
  contact_person: string | null
  status: string | null
  last_visit: string | null
  next_visit: string | null
  visit_notes: string | null
  visited_by: string | null
}

interface SatisfactionCall {
  id: string
  client_id: string
  call_type: string
  call_date: string
  called_by: string | null
  satisfaction_rating: number | null
  is_punctual: boolean | null
  feels_comfortable: boolean | null
  keep_caregiver: boolean | null
  suggestions: string | null
  notes: string | null
  next_call_date: string | null
  client?: Client
}

interface CrmActivity {
  id: string
  client_id: string | null
  lead_id: string | null
  partner_id: string | null
  activity_type: string
  title: string
  description: string | null
  performed_by: string | null
  created_at: string
}

// ===== HELPER =====
const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'
const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `vor ${mins} Min.`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `vor ${hrs} Std.`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `vor ${days} Tagen`
  return formatDate(d)
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${BRAND.border}`,
  background: BRAND.light, color: BRAND.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
}

// ===== CRM MODULE =====
export default function CrmPage() {
  const { isMobile } = useMis()
  const [activeTab, setActiveTab] = useState('pipeline')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Data
  const [clients, setClients] = useState<Client[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [satisfactionCalls, setSatisfactionCalls] = useState<SatisfactionCall[]>([])
  const [activities, setActivities] = useState<CrmActivity[]>([])

  // Modals
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null)
  const [createLeadOpen, setCreateLeadOpen] = useState(false)
  const [createPartnerOpen, setCreatePartnerOpen] = useState(false)
  const [addActivityOpen, setAddActivityOpen] = useState(false)
  const [pipelineFilter, setPipelineFilter] = useState('all')

  // Forms
  const [leadForm, setLeadForm] = useState({ name: '', phone: '', plz: '', message: '', source: '', service: '' })
  const [partnerForm, setPartnerForm] = useState({ name: '', type: 'pflegedienst', city: '', phone: '', email: '', contact_person: '' })
  const [activityForm, setActivityForm] = useState({ activity_type: 'call', title: '', description: '', performed_by: '' })

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const [clientsRes, leadsRes, partnersRes, satisfactionRes, activitiesRes] = await Promise.all([
        supabase.from('clients').select('*').order('created_at', { ascending: false }),
        supabase.from('lead_inquiries').select('*').order('created_at', { ascending: false }),
        supabase.from('cooperation_partners').select('*').order('name'),
        supabase.from('satisfaction_calls').select('*').order('call_date', { ascending: false }),
        supabase.from('mis_crm_activities').select('*').order('created_at', { ascending: false }).limit(50),
      ])
      setClients(clientsRes.data as Client[] || [])
      setLeads(leadsRes.data as Lead[] || [])
      setPartners(partnersRes.data as Partner[] || [])
      setSatisfactionCalls(satisfactionRes.data as SatisfactionCall[] || [])
      setActivities(activitiesRes.data as CrmActivity[] || [])
    } catch (err) {
      console.error('CRM load error:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ===== ACTIONS =====
  async function updateClientPipeline(id: string, newStatus: string) {
    const supabase = createClient()
    await supabase.from('clients').update({ pipeline_status: newStatus, updated_at: new Date().toISOString() }).eq('id', id)
    await supabase.from('mis_crm_activities').insert({
      client_id: id, activity_type: 'status_change',
      title: `Status → ${PIPELINE_STATUS[newStatus]?.label || newStatus}`,
      performed_by: 'System',
    })
    setSelectedClient(null)
    loadData()
  }

  async function updateLeadStatus(id: string, newStatus: string) {
    const supabase = createClient()
    await supabase.from('lead_inquiries').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id)
    setSelectedLead(null)
    loadData()
  }

  async function handleCreateLead() {
    const supabase = createClient()
    const { error } = await supabase.from('lead_inquiries').insert({
      name: leadForm.name, phone: leadForm.phone, plz: leadForm.plz,
      message: leadForm.message || null, source: leadForm.source || null,
      service: leadForm.service || null, status: 'new',
    })
    if (!error) {
      setCreateLeadOpen(false)
      setLeadForm({ name: '', phone: '', plz: '', message: '', source: '', service: '' })
      loadData()
    } else alert('Fehler: ' + error.message)
  }

  async function handleCreatePartner() {
    const supabase = createClient()
    const { error } = await supabase.from('cooperation_partners').insert({
      name: partnerForm.name, type: partnerForm.type,
      city: partnerForm.city || null, phone: partnerForm.phone || null,
      email: partnerForm.email || null, contact_person: partnerForm.contact_person || null,
      status: 'active',
    })
    if (!error) {
      setCreatePartnerOpen(false)
      setPartnerForm({ name: '', type: 'pflegedienst', city: '', phone: '', email: '', contact_person: '' })
      loadData()
    } else alert('Fehler: ' + error.message)
  }

  async function handleAddActivity() {
    const supabase = createClient()
    const payload: Record<string, unknown> = {
      activity_type: activityForm.activity_type, title: activityForm.title,
      description: activityForm.description || null, performed_by: activityForm.performed_by || null,
    }
    if (selectedClient) payload.client_id = selectedClient.id
    if (selectedLead) payload.lead_id = selectedLead.id
    const { error } = await supabase.from('mis_crm_activities').insert(payload)
    if (!error) {
      setAddActivityOpen(false)
      setActivityForm({ activity_type: 'call', title: '', description: '', performed_by: '' })
      loadData()
    }
  }

  // ===== KPIs =====
  const activeClients = clients.filter(c => c.pipeline_status === 'active').length
  const leadsThisWeek = leads.filter(l => {
    const d = new Date(l.created_at)
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    return d >= weekAgo
  }).length
  const totalLeads = leads.filter(l => !['converted', 'lost'].includes(l.status || '')).length
  const convertedLeads = leads.filter(l => l.status === 'converted').length
  const conversionRate = leads.length > 0 ? Math.round((convertedLeads / leads.length) * 100) : 0
  const avgSatisfaction = satisfactionCalls.length > 0
    ? (satisfactionCalls.reduce((s, c) => s + (c.satisfaction_rating || 0), 0) / satisfactionCalls.filter(c => c.satisfaction_rating).length).toFixed(1)
    : '—'

  // ===== FILTERED DATA =====
  const filteredClients = clients.filter(c => {
    const matchesSearch = !search || `${c.first_name} ${c.last_name} ${c.customer_number} ${c.city || ''}`.toLowerCase().includes(search.toLowerCase())
    const matchesPipeline = pipelineFilter === 'all' || c.pipeline_status === pipelineFilter
    return matchesSearch && matchesPipeline
  })
  const filteredLeads = leads.filter(l =>
    !search || `${l.name} ${l.plz} ${l.source || ''}`.toLowerCase().includes(search.toLowerCase())
  )
  const filteredPartners = partners.filter(p =>
    !search || `${p.name} ${p.city || ''} ${p.contact_person || ''}`.toLowerCase().includes(search.toLowerCase())
  )

  const tabs = [
    { id: 'pipeline', label: 'Pipeline', icon: 'trendingUp', count: clients.length },
    { id: 'leads', label: 'Leads', icon: 'inbox', count: totalLeads },
    { id: 'satisfaction', label: 'Zufriedenheit', icon: 'heart', count: satisfactionCalls.length },
    { id: 'partners', label: 'Partner', icon: 'briefcase', count: partners.length },
    { id: 'activities', label: 'Aktivitäten', icon: 'activity', count: activities.length },
  ]

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <SectionHeader title="CRM" subtitle="Kundenbeziehungen verwalten" icon="users" />
        <Card><div style={{ textAlign: 'center', padding: 40, color: BRAND.muted }}>Lade CRM-Daten...</div></Card>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionHeader
        title="CRM"
        subtitle="Kunden, Leads & Kooperationspartner verwalten"
        icon="users"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <MisButton icon="userPlus" variant="secondary" onClick={() => setCreateLeadOpen(true)}>
              {isMobile ? '' : 'Neuer Lead'}
            </MisButton>
            <MisButton icon="briefcase" variant="secondary" onClick={() => setCreatePartnerOpen(true)}>
              {isMobile ? '' : 'Neuer Partner'}
            </MisButton>
          </div>
        }
      />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16 }}>
        <KpiCard title="Aktive Kunden" value={activeClients} icon="users" color={BRAND.success} trend={activeClients > 0 ? 'up' : 'stable'} />
        <KpiCard title="Leads diese Woche" value={leadsThisWeek} icon="inbox" color={BRAND.info} />
        <KpiCard title="Conversion Rate" value={`${conversionRate}%`} icon="percent" color={BRAND.gold} />
        <KpiCard title="Ø Zufriedenheit" value={avgSatisfaction} icon="star" color="#F59E0B" unit="/ 5" />
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Kunden, Leads oder Partner suchen..." />
        </div>
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* ===== TAB: PIPELINE ===== */}
      {activeTab === 'pipeline' && (
        <>
          {/* Pipeline Filter */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[{ id: 'all', label: 'Alle', count: clients.length }, ...Object.entries(PIPELINE_STATUS).map(([id, s]) => ({
              id, label: s.label, count: clients.filter(c => c.pipeline_status === id).length,
            }))].map(f => (
              <button key={f.id} onClick={() => setPipelineFilter(f.id)} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: pipelineFilter === f.id ? `${BRAND.gold}20` : BRAND.white,
                color: pipelineFilter === f.id ? BRAND.gold : BRAND.muted,
                border: `1px solid ${pipelineFilter === f.id ? BRAND.gold + '40' : BRAND.border}`,
                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {f.label}
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 10,
                  background: pipelineFilter === f.id ? `${BRAND.gold}15` : `${BRAND.muted}10`,
                }}>{f.count}</span>
              </button>
            ))}
          </div>

          {/* Pipeline Visual */}
          {!isMobile && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Object.keys(PIPELINE_STATUS).length}, 1fr)`, gap: 12 }}>
              {Object.entries(PIPELINE_STATUS).map(([key, status]) => {
                const count = clients.filter(c => c.pipeline_status === key).length
                return (
                  <div key={key} style={{
                    background: BRAND.white, borderRadius: 12, border: `1px solid ${BRAND.border}`,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '10px 14px', borderBottom: `2px solid ${status.color}`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MIcon name={status.icon} size={14} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.text }}>{status.label}</span>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: `${status.color}18`, color: status.color,
                      }}>{count}</span>
                    </div>
                    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 80, maxHeight: 240, overflowY: 'auto' }}>
                      {clients.filter(c => c.pipeline_status === key).map(c => (
                        <div key={c.id} onClick={() => setSelectedClient(c)} style={{
                          padding: '8px 10px', borderRadius: 8, background: BRAND.light,
                          cursor: 'pointer', transition: 'all 0.15s', fontSize: 12,
                          border: `1px solid transparent`,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = status.color + '40' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent' }}>
                          <div style={{ fontWeight: 600, color: BRAND.text }}>{c.first_name} {c.last_name}</div>
                          <div style={{ color: BRAND.muted, fontSize: 11 }}>{c.city || c.zip_code || '—'}</div>
                        </div>
                      ))}
                      {count === 0 && <div style={{ fontSize: 11, color: BRAND.muted, textAlign: 'center', padding: 16 }}>Keine Kunden</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Clients Table */}
          <Card noPad title="Kundenliste" icon="users">
            {filteredClients.length === 0 ? (
              <EmptyState icon="users" title="Keine Kunden" description="Noch keine Kunden im CRM." />
            ) : (
              <DataTable
                columns={[
                  { key: 'name', label: 'Kunde', render: (r: Record<string, unknown>) => (
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>{String(r.first_name)} {String(r.last_name)}</div>
                      <div style={{ fontSize: 11, color: BRAND.muted }}>{String(r.customer_number)}</div>
                    </div>
                  )},
                  ...(!isMobile ? [
                    { key: 'city', label: 'Ort', render: (r: Record<string, unknown>) => (
                      <span style={{ fontSize: 13 }}>{String(r.city || '—')}</span>
                    )},
                    { key: 'care_level', label: 'PG', render: (r: Record<string, unknown>) => (
                      <Badge label={r.care_level ? `PG ${r.care_level}` : '—'} color={BRAND.gold} size="sm" />
                    )},
                    { key: 'phone', label: 'Telefon', render: (r: Record<string, unknown>) => (
                      <span style={{ fontSize: 12, color: BRAND.muted }}>{String(r.phone || '—')}</span>
                    )},
                  ] : []),
                  { key: 'pipeline_status', label: 'Status', render: (r: Record<string, unknown>) => {
                    const ps = PIPELINE_STATUS[String(r.pipeline_status)] || { label: String(r.pipeline_status), color: BRAND.muted }
                    return <Badge label={ps.label} color={ps.color} />
                  }},
                  { key: 'actions', label: '', width: '80px', render: (r: Record<string, unknown>) => (
                    <MisButton variant="ghost" size="sm" icon="eye" onClick={() => setSelectedClient(r as unknown as Client)}>
                      {isMobile ? '' : 'Details'}
                    </MisButton>
                  )},
                ]}
                data={filteredClients as unknown as Record<string, unknown>[]}
              />
            )}
          </Card>
        </>
      )}

      {/* ===== TAB: LEADS ===== */}
      {activeTab === 'leads' && (
        <>
          {/* Lead Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 10 }}>
            {Object.entries(LEAD_STATUS).map(([key, st]) => {
              const count = leads.filter(l => (l.status || 'new') === key).length
              return (
                <Card key={key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: st.color }} />
                    <span style={{ fontSize: 12, color: BRAND.muted }}>{st.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 700, color: BRAND.text }}>{count}</span>
                  </div>
                </Card>
              )
            })}
          </div>

          <Card noPad title="Lead-Anfragen" icon="inbox" actions={
            <MisButton icon="plus" size="sm" onClick={() => setCreateLeadOpen(true)}>Neuer Lead</MisButton>
          }>
            {filteredLeads.length === 0 ? (
              <EmptyState icon="inbox" title="Keine Leads" description="Noch keine Anfragen eingegangen. Leads kommen z.B. über Verbund Pflegehilfe oder 11880." action={
                <MisButton icon="plus" onClick={() => setCreateLeadOpen(true)}>Lead manuell anlegen</MisButton>
              } />
            ) : (
              <DataTable
                columns={[
                  { key: 'name', label: 'Name', render: (r: Record<string, unknown>) => (
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>{String(r.name)}</div>
                      <div style={{ fontSize: 11, color: BRAND.muted }}>{String(r.source || '—')} · PLZ {String(r.plz)}</div>
                    </div>
                  )},
                  { key: 'phone', label: 'Telefon', render: (r: Record<string, unknown>) => (
                    <span style={{ fontSize: 12 }}>{String(r.phone)}</span>
                  )},
                  ...(!isMobile ? [
                    { key: 'service', label: 'Service', render: (r: Record<string, unknown>) => (
                      <span style={{ fontSize: 12, color: BRAND.muted }}>{String(r.service || '—')}</span>
                    )},
                    { key: 'created_at', label: 'Eingang', render: (r: Record<string, unknown>) => (
                      <span style={{ fontSize: 12, color: BRAND.muted }}>{timeAgo(String(r.created_at))}</span>
                    )},
                  ] : []),
                  { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => {
                    const ls = LEAD_STATUS[String(r.status || 'new')] || { label: String(r.status), color: BRAND.muted }
                    return <Badge label={ls.label} color={ls.color} />
                  }},
                  { key: 'actions', label: '', width: '80px', render: (r: Record<string, unknown>) => (
                    <MisButton variant="ghost" size="sm" icon="eye" onClick={() => setSelectedLead(r as unknown as Lead)}>
                      {isMobile ? '' : 'Details'}
                    </MisButton>
                  )},
                ]}
                data={filteredLeads as unknown as Record<string, unknown>[]}
              />
            )}
          </Card>
        </>
      )}

      {/* ===== TAB: SATISFACTION ===== */}
      {activeTab === 'satisfaction' && (
        <>
          {/* Satisfaction KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16 }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: BRAND.gold, fontFamily: 'var(--font-cormorant), serif' }}>{avgSatisfaction}</div>
                <div style={{ fontSize: 12, color: BRAND.muted }}>Ø Bewertung (1-5)</div>
              </div>
            </Card>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: BRAND.success, fontFamily: 'var(--font-cormorant), serif' }}>
                  {satisfactionCalls.length > 0 ? Math.round((satisfactionCalls.filter(c => c.is_punctual).length / satisfactionCalls.length) * 100) : 0}%
                </div>
                <div style={{ fontSize: 12, color: BRAND.muted }}>Pünktlichkeit</div>
              </div>
            </Card>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: BRAND.success, fontFamily: 'var(--font-cormorant), serif' }}>
                  {satisfactionCalls.length > 0 ? Math.round((satisfactionCalls.filter(c => c.feels_comfortable).length / satisfactionCalls.length) * 100) : 0}%
                </div>
                <div style={{ fontSize: 12, color: BRAND.muted }}>Wohlfühlfaktor</div>
              </div>
            </Card>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: BRAND.success, fontFamily: 'var(--font-cormorant), serif' }}>
                  {satisfactionCalls.length > 0 ? Math.round((satisfactionCalls.filter(c => c.keep_caregiver).length / satisfactionCalls.length) * 100) : 0}%
                </div>
                <div style={{ fontSize: 12, color: BRAND.muted }}>Engel behalten</div>
              </div>
            </Card>
          </div>

          <Card noPad title="Zufriedenheitsanrufe" icon="phone">
            {satisfactionCalls.length === 0 ? (
              <EmptyState icon="phone" title="Keine Anrufe" description="Noch keine Zufriedenheitsanrufe dokumentiert." />
            ) : (
              <DataTable
                columns={[
                  { key: 'call_date', label: 'Datum', render: (r: Record<string, unknown>) => formatDate(String(r.call_date)) },
                  { key: 'call_type', label: 'Typ', render: (r: Record<string, unknown>) => (
                    <Badge label={String(r.call_type)} color={BRAND.info} size="sm" />
                  )},
                  { key: 'satisfaction_rating', label: 'Bewertung', render: (r: Record<string, unknown>) => {
                    const rating = Number(r.satisfaction_rating) || 0
                    return (
                      <div style={{ display: 'flex', gap: 2 }}>
                        {[1,2,3,4,5].map(i => (
                          <span key={i} style={{ color: i <= rating ? '#F59E0B' : BRAND.border }}>
                            <MIcon name="star" size={14} />
                          </span>
                        ))}
                      </div>
                    )
                  }},
                  ...(!isMobile ? [
                    { key: 'is_punctual', label: 'Pünktlich', render: (r: Record<string, unknown>) => (
                      <span style={{ color: r.is_punctual ? BRAND.success : BRAND.error }}>
                        <MIcon name={r.is_punctual ? 'check' : 'x'} size={16} />
                      </span>
                    )},
                    { key: 'feels_comfortable', label: 'Wohlfühlen', render: (r: Record<string, unknown>) => (
                      <span style={{ color: r.feels_comfortable ? BRAND.success : BRAND.error }}>
                        <MIcon name={r.feels_comfortable ? 'check' : 'x'} size={16} />
                      </span>
                    )},
                    { key: 'called_by', label: 'Anrufer', render: (r: Record<string, unknown>) => (
                      <span style={{ fontSize: 12, color: BRAND.muted }}>{String(r.called_by || '—')}</span>
                    )},
                  ] : []),
                  { key: 'notes', label: 'Notizen', render: (r: Record<string, unknown>) => (
                    <span style={{ fontSize: 12, color: BRAND.muted, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                      {String(r.notes || r.suggestions || '—')}
                    </span>
                  )},
                ]}
                data={satisfactionCalls as unknown as Record<string, unknown>[]}
              />
            )}
          </Card>
        </>
      )}

      {/* ===== TAB: PARTNERS ===== */}
      {activeTab === 'partners' && (
        <Card noPad title="Kooperationspartner" icon="briefcase" actions={
          <MisButton icon="plus" size="sm" onClick={() => setCreatePartnerOpen(true)}>Neuer Partner</MisButton>
        }>
          {filteredPartners.length === 0 ? (
            <EmptyState icon="briefcase" title="Keine Partner" description="Noch keine Kooperationspartner angelegt." action={
              <MisButton icon="plus" onClick={() => setCreatePartnerOpen(true)}>Partner anlegen</MisButton>
            } />
          ) : (
            <DataTable
              columns={[
                { key: 'name', label: 'Partner', render: (r: Record<string, unknown>) => (
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>{String(r.name)}</div>
                    <div style={{ fontSize: 11, color: BRAND.muted }}>{PARTNER_TYPES[String(r.type)] || String(r.type)}</div>
                  </div>
                )},
                ...(!isMobile ? [
                  { key: 'city', label: 'Ort', render: (r: Record<string, unknown>) => String(r.city || '—') },
                  { key: 'contact_person', label: 'Ansprechpartner', render: (r: Record<string, unknown>) => String(r.contact_person || '—') },
                  { key: 'phone', label: 'Telefon', render: (r: Record<string, unknown>) => String(r.phone || '—') },
                  { key: 'last_visit', label: 'Letzter Besuch', render: (r: Record<string, unknown>) => formatDate(r.last_visit as string | null) },
                  { key: 'next_visit', label: 'Nächster Besuch', render: (r: Record<string, unknown>) => {
                    const next = r.next_visit as string | null
                    if (!next) return <span style={{ color: BRAND.muted }}>—</span>
                    const isOverdue = new Date(next) < new Date()
                    return <span style={{ color: isOverdue ? BRAND.error : BRAND.text, fontWeight: isOverdue ? 700 : 400 }}>{formatDate(next)}</span>
                  }},
                ] : []),
                { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => (
                  <Badge label={String(r.status || 'Aktiv')} color={r.status === 'inactive' ? BRAND.muted : BRAND.success} size="sm" />
                )},
                { key: 'actions', label: '', width: '80px', render: (r: Record<string, unknown>) => (
                  <MisButton variant="ghost" size="sm" icon="eye" onClick={() => setSelectedPartner(r as unknown as Partner)}>
                    {isMobile ? '' : 'Details'}
                  </MisButton>
                )},
              ]}
              data={filteredPartners as unknown as Record<string, unknown>[]}
            />
          )}
        </Card>
      )}

      {/* ===== TAB: ACTIVITIES ===== */}
      {activeTab === 'activities' && (
        <Card title="Letzte Aktivitäten" icon="activity">
          {activities.length === 0 ? (
            <EmptyState icon="activity" title="Keine Aktivitäten" description="Noch keine CRM-Aktivitäten vorhanden." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {activities.map(a => {
                const iconMap: Record<string, string> = {
                  call: 'phone', email: 'send', visit: 'mapPin',
                  note: 'edit', follow_up: 'clock', status_change: 'trendingUp',
                }
                const colorMap: Record<string, string> = {
                  call: BRAND.info, email: BRAND.gold, visit: BRAND.success,
                  note: BRAND.muted, follow_up: BRAND.warning, status_change: '#8B5CF6',
                }
                return (
                  <ActivityItem
                    key={a.id}
                    icon={iconMap[a.activity_type] || 'activity'}
                    color={colorMap[a.activity_type]}
                    title={`${a.title}${a.performed_by ? ` — ${a.performed_by}` : ''}`}
                    time={timeAgo(a.created_at)}
                  />
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* ===== MODAL: Client Detail ===== */}
      {selectedClient && (
        <Modal open title={`${selectedClient.first_name} ${selectedClient.last_name}`} onClose={() => setSelectedClient(null)} width={640}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Status Badge */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge label={PIPELINE_STATUS[selectedClient.pipeline_status]?.label || selectedClient.pipeline_status} color={PIPELINE_STATUS[selectedClient.pipeline_status]?.color || BRAND.muted} />
              <span style={{ fontSize: 12, color: BRAND.muted }}>Kd.-Nr.: {selectedClient.customer_number}</span>
            </div>

            {/* Info Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Telefon', value: selectedClient.phone },
                { label: 'E-Mail', value: selectedClient.email },
                { label: 'Ort', value: `${selectedClient.zip_code || ''} ${selectedClient.city || ''}`.trim() },
                { label: 'Pflegegrad', value: selectedClient.care_level ? `PG ${selectedClient.care_level}` : '—' },
                { label: 'Engel', value: selectedClient.assigned_engel },
                { label: 'Monatl. Stunden', value: selectedClient.monthly_hours ? `${selectedClient.monthly_hours} Std.` : '—' },
                { label: 'Quelle', value: selectedClient.source },
                { label: 'Vertragsbeginn', value: formatDate(selectedClient.contract_start) },
                { label: 'Letzter Kontakt', value: formatDate(selectedClient.last_contact) },
                { label: 'Entlastungsbetrag', value: '131 €/Monat' },
              ].map((item, i) => (
                <div key={i}>
                  <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: BRAND.text, fontWeight: 500 }}>{item.value || '—'}</div>
                </div>
              ))}
            </div>

            {selectedClient.notes && (
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Notizen</div>
                <div style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.6, padding: 12, background: BRAND.light, borderRadius: 8 }}>{selectedClient.notes}</div>
              </div>
            )}

            {/* Pipeline Actions */}
            <div>
              <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pipeline verschieben</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(PIPELINE_STATUS).filter(([k]) => k !== selectedClient.pipeline_status).map(([key, st]) => (
                  <MisButton key={key} variant="secondary" size="sm" onClick={() => updateClientPipeline(selectedClient.id, key)}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, display: 'inline-block' }} />
                    {st.label}
                  </MisButton>
                ))}
              </div>
            </div>

            {/* Add Activity */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: `1px solid ${BRAND.border}`, paddingTop: 12 }}>
              <MisButton variant="secondary" icon="plus" onClick={() => setAddActivityOpen(true)}>Aktivität hinzufügen</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== MODAL: Lead Detail ===== */}
      {selectedLead && (
        <Modal open title={selectedLead.name} onClose={() => setSelectedLead(null)} width={540}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge label={LEAD_STATUS[selectedLead.status || 'new']?.label || selectedLead.status} color={LEAD_STATUS[selectedLead.status || 'new']?.color || BRAND.muted} />
              <span style={{ fontSize: 12, color: BRAND.muted }}>Eingang: {formatDate(selectedLead.created_at)}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Telefon', value: selectedLead.phone },
                { label: 'PLZ', value: selectedLead.plz },
                { label: 'Quelle', value: selectedLead.source || selectedLead.utm_source },
                { label: 'Service', value: selectedLead.service },
                { label: 'Zugewiesen an', value: selectedLead.assigned_to },
                { label: 'Follow-up', value: formatDate(selectedLead.follow_up_date) },
              ].map((item, i) => (
                <div key={i}>
                  <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: BRAND.text, fontWeight: 500 }}>{item.value || '—'}</div>
                </div>
              ))}
            </div>

            {selectedLead.message && (
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Nachricht</div>
                <div style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.6, padding: 12, background: BRAND.light, borderRadius: 8 }}>{selectedLead.message}</div>
              </div>
            )}

            {/* Lead Status Actions */}
            <div>
              <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status ändern</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(LEAD_STATUS).filter(([k]) => k !== (selectedLead.status || 'new')).map(([key, st]) => (
                  <MisButton key={key} variant="secondary" size="sm" onClick={() => updateLeadStatus(selectedLead.id, key)}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, display: 'inline-block' }} />
                    {st.label}
                  </MisButton>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== MODAL: Partner Detail ===== */}
      {selectedPartner && (
        <Modal open title={selectedPartner.name} onClose={() => setSelectedPartner(null)} width={540}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Typ', value: PARTNER_TYPES[selectedPartner.type] || selectedPartner.type },
                { label: 'Ort', value: selectedPartner.city },
                { label: 'Telefon', value: selectedPartner.phone },
                { label: 'E-Mail', value: selectedPartner.email },
                { label: 'Ansprechpartner', value: selectedPartner.contact_person },
                { label: 'Status', value: selectedPartner.status },
                { label: 'Letzter Besuch', value: formatDate(selectedPartner.last_visit) },
                { label: 'Nächster Besuch', value: formatDate(selectedPartner.next_visit) },
                { label: 'Besucht von', value: selectedPartner.visited_by },
              ].map((item, i) => (
                <div key={i}>
                  <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: BRAND.text, fontWeight: 500 }}>{item.value || '—'}</div>
                </div>
              ))}
            </div>
            {selectedPartner.visit_notes && (
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Besuchsnotizen</div>
                <div style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.6, padding: 12, background: BRAND.light, borderRadius: 8 }}>{selectedPartner.visit_notes}</div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ===== MODAL: Create Lead ===== */}
      {createLeadOpen && (
        <Modal open title="Neuer Lead" onClose={() => setCreateLeadOpen(false)} width={500}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Name *</label>
              <input style={inputStyle} value={leadForm.name} onChange={e => setLeadForm({ ...leadForm, name: e.target.value })} placeholder="Vor- und Nachname" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Telefon *</label>
                <input style={inputStyle} value={leadForm.phone} onChange={e => setLeadForm({ ...leadForm, phone: e.target.value })} placeholder="030 ..." />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>PLZ *</label>
                <input style={inputStyle} value={leadForm.plz} onChange={e => setLeadForm({ ...leadForm, plz: e.target.value })} placeholder="10115" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Quelle</label>
                <select style={inputStyle} value={leadForm.source} onChange={e => setLeadForm({ ...leadForm, source: e.target.value })}>
                  <option value="">— Auswählen —</option>
                  <option value="Verbund Pflegehilfe">Verbund Pflegehilfe</option>
                  <option value="11880">11880</option>
                  <option value="Website">Website</option>
                  <option value="Empfehlung">Empfehlung</option>
                  <option value="Pflegestützpunkt">Pflegestützpunkt</option>
                  <option value="Sonstige">Sonstige</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Service</label>
                <select style={inputStyle} value={leadForm.service} onChange={e => setLeadForm({ ...leadForm, service: e.target.value })}>
                  <option value="">— Auswählen —</option>
                  <option value="Alltagsbegleitung">Alltagsbegleitung</option>
                  <option value="Haushaltshilfe">Haushaltshilfe</option>
                  <option value="Einkaufsbegleitung">Einkaufsbegleitung</option>
                  <option value="Spaziergänge">Spaziergänge</option>
                  <option value="Arztbegleitung">Arztbegleitung</option>
                  <option value="Sonstige">Sonstige</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Nachricht</label>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={leadForm.message} onChange={e => setLeadForm({ ...leadForm, message: e.target.value })} placeholder="Anfrage-Details..." />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setCreateLeadOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="plus" onClick={handleCreateLead} disabled={!leadForm.name || !leadForm.phone || !leadForm.plz}>Lead anlegen</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== MODAL: Create Partner ===== */}
      {createPartnerOpen && (
        <Modal open title="Neuer Kooperationspartner" onClose={() => setCreatePartnerOpen(false)} width={500}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Name *</label>
              <input style={inputStyle} value={partnerForm.name} onChange={e => setPartnerForm({ ...partnerForm, name: e.target.value })} placeholder="Einrichtungsname" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Typ</label>
                <select style={inputStyle} value={partnerForm.type} onChange={e => setPartnerForm({ ...partnerForm, type: e.target.value })}>
                  {Object.entries(PARTNER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Ort</label>
                <input style={inputStyle} value={partnerForm.city} onChange={e => setPartnerForm({ ...partnerForm, city: e.target.value })} placeholder="Berlin" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Telefon</label>
                <input style={inputStyle} value={partnerForm.phone} onChange={e => setPartnerForm({ ...partnerForm, phone: e.target.value })} placeholder="030 ..." />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>E-Mail</label>
                <input style={inputStyle} value={partnerForm.email} onChange={e => setPartnerForm({ ...partnerForm, email: e.target.value })} placeholder="info@..." />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Ansprechpartner</label>
              <input style={inputStyle} value={partnerForm.contact_person} onChange={e => setPartnerForm({ ...partnerForm, contact_person: e.target.value })} placeholder="Vor- und Nachname" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setCreatePartnerOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="plus" onClick={handleCreatePartner} disabled={!partnerForm.name}>Partner anlegen</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== MODAL: Add Activity ===== */}
      {addActivityOpen && (
        <Modal open title="Aktivität hinzufügen" onClose={() => setAddActivityOpen(false)} width={460}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Typ</label>
              <select style={inputStyle} value={activityForm.activity_type} onChange={e => setActivityForm({ ...activityForm, activity_type: e.target.value })}>
                <option value="call">Anruf</option>
                <option value="email">E-Mail</option>
                <option value="visit">Besuch</option>
                <option value="note">Notiz</option>
                <option value="follow_up">Follow-up</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Titel *</label>
              <input style={inputStyle} value={activityForm.title} onChange={e => setActivityForm({ ...activityForm, title: e.target.value })} placeholder="z.B. Erstgespräch geführt" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Beschreibung</label>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={activityForm.description} onChange={e => setActivityForm({ ...activityForm, description: e.target.value })} placeholder="Details..." />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Durchgeführt von</label>
              <input style={inputStyle} value={activityForm.performed_by} onChange={e => setActivityForm({ ...activityForm, performed_by: e.target.value })} placeholder="Name" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setAddActivityOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="plus" onClick={handleAddActivity} disabled={!activityForm.title}>Speichern</MisButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
