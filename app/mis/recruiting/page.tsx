'use client'
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, DataTable, MisButton, SearchInput, Badge, Tabs, EmptyState, Modal } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'
import { useMis } from '@/lib/mis/MisContext'
import { createApplicant, createJobPosting, updateApplicantStatus, updateApplicantRating, deleteApplicant, updatePostingStatus, deleteJobPosting } from './actions'
import { logger } from '@/lib/logger'
const log = logger.child('mis:recruiting')

// ===== Status-Definitionen =====
const APPLICANT_STATUS: Record<string, { label: string; color: string }> = {
  eingang: { label: 'Eingang', color: '#3B82F6' },
  vorauswahl: { label: 'Vorauswahl', color: '#8B5CF6' },
  gespraech: { label: 'Gespräch', color: '#F59E0B' },
  probetag: { label: 'Probetag', color: '#F97316' },
  eingestellt: { label: 'Eingestellt', color: '#22C55E' },
  abgelehnt: { label: 'Abgelehnt', color: '#EF4444' },
}

const PIPELINE_STEPS = ['eingang', 'vorauswahl', 'gespraech', 'probetag', 'eingestellt'] as const

const POSTING_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Entwurf', color: '#6B7280' },
  active: { label: 'Aktiv', color: '#22C55E' },
  paused: { label: 'Pausiert', color: '#F59E0B' },
  closed: { label: 'Geschlossen', color: '#EF4444' },
}

const SOURCES = ['Arbeitsagentur', 'Indeed', 'Empfehlung', 'Initiativbewerbung', 'Social Media'] as const
const POSITIONS = ['Alltagsbegleiter/in', 'Fahrer/in KF', 'Büro'] as const
const CHANNELS = ['Arbeitsagentur', 'Indeed', 'Stepstone', 'Social Media', 'Website', 'Empfehlung'] as const

interface Applicant {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  position: string
  status: string
  source: string
  notes: string
  rating: number
  documents: { name: string; type: string }[]
  job_posting_id: string | null
  applied_at: string
  created_at: string
  updated_at: string
}

interface JobPosting {
  id: string
  title: string
  description: string
  location: string
  position_type: string
  status: string
  channels: string[]
  created_at: string
  updated_at: string
}

// ===== BEWERBERMANAGEMENT =====
export default function RecruitingPage() {
  const { isMobile } = useMis()
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [postings, setPostings] = useState<JobPosting[]>([])
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [createPostingOpen, setCreatePostingOpen] = useState(false)
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null)
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    position: 'Alltagsbegleiter/in', source: 'Initiativbewerbung', notes: '',
    job_posting_id: '',
  })
  const [postingForm, setPostingForm] = useState({
    title: '', description: '', location: 'Hagen',
    position_type: 'Alltagsbegleiter/in', channels: [] as string[],
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      const supabase = createClient()
      const [aRes, pRes] = await Promise.all([
        supabase.from('mis_applicants').select('*').order('created_at', { ascending: false }),
        supabase.from('mis_job_postings').select('*').order('created_at', { ascending: false }),
      ])
      if (aRes.error) log.error('Applicants error', { error: aRes.error })
      if (pRes.error) log.error('Postings error', { error: pRes.error })
      setApplicants((aRes.data as Applicant[]) || [])
      setPostings((pRes.data as JobPosting[]) || [])
    } catch (err) {
      log.errorWithException('Recruiting load error', err)
    }
    setLoading(false)
  }

  async function handleCreateApplicant() {
    const result = await createApplicant({
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      phone: form.phone,
      position: form.position,
      source: form.source,
      notes: form.notes,
      job_posting_id: form.job_posting_id || '',
    })
    if (result.ok) {
      setCreateOpen(false)
      setForm({ first_name: '', last_name: '', email: '', phone: '', position: 'Alltagsbegleiter/in', source: 'Initiativbewerbung', notes: '', job_posting_id: '' })
      loadAll()
    } else alert('Fehler: ' + result.error)
  }

  async function handleCreatePosting() {
    const result = await createJobPosting({
      title: postingForm.title,
      description: postingForm.description,
      location: postingForm.location,
      position_type: postingForm.position_type,
      channels: postingForm.channels,
    })
    if (result.ok) {
      setCreatePostingOpen(false)
      setPostingForm({ title: '', description: '', location: 'Hagen', position_type: 'Alltagsbegleiter/in', channels: [] })
      loadAll()
    } else alert('Fehler: ' + result.error)
  }

  async function handleStatusUpdate(id: string, status: string) {
    await updateApplicantStatus(id, status)
    setSelectedApplicant(null)
    loadAll()
  }

  async function handleRating(id: string, rating: number) {
    await updateApplicantRating(id, rating)
    loadAll()
    if (selectedApplicant?.id === id) setSelectedApplicant(prev => prev ? { ...prev, rating } : null)
  }

  async function handleDeleteApplicant(id: string) {
    if (!confirm('Bewerber wirklich löschen?')) return
    await deleteApplicant(id)
    setSelectedApplicant(null)
    loadAll()
  }

  async function handlePostingStatusUpdate(id: string, status: string) {
    await updatePostingStatus(id, status)
    loadAll()
  }

  async function handleDeletePosting(id: string) {
    if (!confirm('Stellenanzeige wirklich löschen?')) return
    await deleteJobPosting(id)
    loadAll()
  }

  // Filters
  const tabs = [
    { id: 'all', label: `Alle Bewerber (${applicants.length})` },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'postings', label: `Stellenanzeigen (${postings.length})` },
  ]

  const filtered = applicants.filter(a => {
    const matchesSearch = !search ||
      `${a.first_name} ${a.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase()) ||
      a.position.toLowerCase().includes(search.toLowerCase())
    return matchesSearch
  })

  // KPIs
  const openApplicants = applicants.filter(a => !['eingestellt', 'abgelehnt'].includes(a.status)).length
  const hired = applicants.filter(a => a.status === 'eingestellt').length
  const hireRate = applicants.length > 0 ? Math.round((hired / applicants.length) * 100) : 0
  const activePostings = postings.filter(p => p.status === 'active').length

  // Avg processing time (applied_at to updated_at for hired/rejected)
  const completedApplicants = applicants.filter(a => ['eingestellt', 'abgelehnt'].includes(a.status))
  const avgDays = completedApplicants.length > 0
    ? Math.round(completedApplicants.reduce((sum, a) => {
        const diff = new Date(a.updated_at).getTime() - new Date(a.applied_at).getTime()
        return sum + diff / (1000 * 60 * 60 * 24)
      }, 0) / completedApplicants.length)
    : 0

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${BRAND.border}`,
    background: BRAND.light, color: BRAND.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  }

  // ===== RENDER =====
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionHeader
        title="Bewerbermanagement"
        subtitle="Bewerbungen verwalten, Pipeline steuern und Stellenanzeigen pflegen"
        icon="userPlus"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <MisButton variant="secondary" icon="plus" onClick={() => setCreatePostingOpen(true)}>
              Stellenanzeige
            </MisButton>
            <MisButton icon="plus" onClick={() => setCreateOpen(true)}>
              Neuer Bewerber
            </MisButton>
          </div>
        }
      />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16 }}>
        {[
          { label: 'Offene Bewerbungen', value: openApplicants, icon: 'inbox', color: BRAND.gold },
          { label: 'Ø Bearbeitungszeit', value: `${avgDays} Tage`, icon: 'clock', color: BRAND.info },
          { label: 'Einstellungsquote', value: `${hireRate}%`, icon: 'trending', color: BRAND.success },
          { label: 'Aktive Stellen', value: activePostings, icon: 'briefcase', color: '#8B5CF6' },
        ].map((kpi, i) => (
          <Card key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${kpi.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: kpi.color }}>
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
      {activeTab !== 'pipeline' && (
        <SearchInput value={search} onChange={setSearch} placeholder="Bewerber oder Position suchen..." />
      )}

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* ===== TAB: Alle Bewerber ===== */}
      {activeTab === 'all' && (
        <>
          {loading ? (
            <Card><div style={{ textAlign: 'center', padding: 40, color: BRAND.muted }}>Lade Bewerbungen...</div></Card>
          ) : filtered.length === 0 ? (
            <EmptyState icon="userPlus" title="Keine Bewerber" description="Fügen Sie einen neuen Bewerber hinzu, um die Pipeline zu starten." />
          ) : (
            <Card noPad>
              <DataTable
                columns={[
                  { key: 'name', label: 'Name', render: (r: Record<string, unknown>) => (
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>{String(r.first_name)} {String(r.last_name)}</div>
                      <div style={{ fontSize: 11, color: BRAND.muted }}>{String(r.email)}</div>
                    </div>
                  )},
                  { key: 'position', label: 'Position', render: (r: Record<string, unknown>) => (
                    <span style={{ fontSize: 13, color: BRAND.text }}>{String(r.position)}</span>
                  )},
                  { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => {
                    const s = APPLICANT_STATUS[String(r.status)] || { label: String(r.status), color: BRAND.muted }
                    return <Badge label={s.label} color={s.color} />
                  }},
                  { key: 'source', label: 'Quelle', render: (r: Record<string, unknown>) => (
                    <span style={{ fontSize: 12, color: BRAND.muted }}>{String(r.source)}</span>
                  )},
                  { key: 'rating', label: 'Bewertung', render: (r: Record<string, unknown>) => (
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <span key={n} style={{ cursor: 'pointer', color: n <= (r.rating as number) ? BRAND.gold : `${BRAND.muted}40`, fontSize: 14 }}
                          onClick={e => { e.stopPropagation(); handleRating(String(r.id), n) }}>
                          ★
                        </span>
                      ))}
                    </div>
                  )},
                  { key: 'applied_at', label: 'Beworben', render: (r: Record<string, unknown>) => (
                    <span style={{ fontSize: 12, color: BRAND.muted }}>{formatDate(r.applied_at as string)}</span>
                  )},
                  { key: 'actions', label: '', render: (r: Record<string, unknown>) => (
                    <MisButton variant="secondary" icon="eye" onClick={() => setSelectedApplicant(r as unknown as Applicant)}>
                      {isMobile ? '' : 'Details'}
                    </MisButton>
                  )},
                ]}
                data={filtered as unknown as Record<string, unknown>[]}
              />
            </Card>
          )}
        </>
      )}

      {/* ===== TAB: Pipeline ===== */}
      {activeTab === 'pipeline' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : `repeat(${PIPELINE_STEPS.length}, 1fr)`,
          gap: 12,
        }}>
          {PIPELINE_STEPS.map(step => {
            const stepApplicants = applicants.filter(a => a.status === step)
            const st = APPLICANT_STATUS[step]
            return (
              <div key={step} style={{
                background: BRAND.white,
                borderRadius: 14,
                border: `1px solid ${BRAND.border}`,
                overflow: 'hidden',
              }}>
                {/* Column header */}
                <div style={{
                  padding: '12px 14px',
                  borderBottom: `1px solid ${BRAND.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: st.color }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>{st.label}</span>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: st.color,
                    background: `${st.color}20`, padding: '2px 8px', borderRadius: 8,
                  }}>
                    {stepApplicants.length}
                  </span>
                </div>

                {/* Cards */}
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80 }}>
                  {stepApplicants.length === 0 ? (
                    <div style={{ fontSize: 12, color: BRAND.muted, textAlign: 'center', padding: 16 }}>Keine Bewerber</div>
                  ) : (
                    stepApplicants.map(a => (
                      <div key={a.id} onClick={() => setSelectedApplicant(a)} style={{
                        background: BRAND.light,
                        borderRadius: 10,
                        padding: '10px 12px',
                        cursor: 'pointer',
                        border: `1px solid ${BRAND.border}`,
                        transition: 'border-color 0.15s',
                      }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text, marginBottom: 4 }}>
                          {a.first_name} {a.last_name}
                        </div>
                        <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>{a.position}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: BRAND.muted }}>{a.source}</span>
                          <div style={{ display: 'flex', gap: 1 }}>
                            {[1, 2, 3, 4, 5].map(n => (
                              <span key={n} style={{ color: n <= a.rating ? BRAND.gold : `${BRAND.muted}30`, fontSize: 10 }}>★</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ===== TAB: Stellenanzeigen ===== */}
      {activeTab === 'postings' && (
        <>
          {postings.length === 0 ? (
            <EmptyState icon="briefcase" title="Keine Stellenanzeigen" description="Erstellen Sie eine neue Stellenanzeige, um Bewerber zu gewinnen." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 16 }}>
              {postings.map(p => {
                const ps = POSTING_STATUS[p.status] || { label: p.status, color: BRAND.muted }
                const applicantCount = applicants.filter(a => a.job_posting_id === p.id).length
                return (
                  <Card key={p.id}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text, marginBottom: 2 }}>{p.title}</div>
                          <div style={{ fontSize: 12, color: BRAND.muted }}>{p.position_type} · {p.location}</div>
                        </div>
                        <Badge label={ps.label} color={ps.color} />
                      </div>
                      {p.description && (
                        <div style={{ fontSize: 13, color: BRAND.muted, lineHeight: 1.5 }}>
                          {p.description.length > 120 ? p.description.slice(0, 120) + '…' : p.description}
                        </div>
                      )}
                      {/* Channels */}
                      {p.channels.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {p.channels.map(ch => (
                            <span key={ch} style={{
                              fontSize: 11, padding: '3px 8px', borderRadius: 6,
                              background: `${BRAND.gold}15`, color: BRAND.gold, fontWeight: 500,
                            }}>{ch}</span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${BRAND.border}`, paddingTop: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <MIcon name="users" size={14} />
                          <span style={{ fontSize: 12, color: BRAND.muted }}>{applicantCount} Bewerber</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {p.status === 'active' && (
                            <MisButton variant="secondary" icon="x" onClick={() => handlePostingStatusUpdate(p.id, 'paused')}>Pausieren</MisButton>
                          )}
                          {p.status === 'paused' && (
                            <MisButton variant="secondary" icon="check" onClick={() => handlePostingStatusUpdate(p.id, 'active')}>Aktivieren</MisButton>
                          )}
                          {p.status !== 'closed' && (
                            <MisButton variant="secondary" icon="lock" onClick={() => handlePostingStatusUpdate(p.id, 'closed')}>Schließen</MisButton>
                          )}
                          <MisButton variant="danger" icon="trash" onClick={() => handleDeletePosting(p.id)}>
                            {isMobile ? '' : 'Löschen'}
                          </MisButton>
                        </div>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ===== Modal: Neuer Bewerber ===== */}
      {createOpen && (
        <Modal open title="Neuer Bewerber" onClose={() => setCreateOpen(false)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Vorname *</label>
                <input style={inputStyle} value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder="Vorname" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Nachname *</label>
                <input style={inputStyle} value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder="Nachname" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>E-Mail</label>
                <input style={inputStyle} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@beispiel.de" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Telefon</label>
                <input style={inputStyle} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+49..." />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Position *</label>
                <select style={inputStyle} value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Quelle</label>
                <select style={inputStyle} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            {postings.filter(p => p.status === 'active').length > 0 && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Stellenanzeige (optional)</label>
                <select style={inputStyle} value={form.job_posting_id} onChange={e => setForm({ ...form, job_posting_id: e.target.value })}>
                  <option value="">— Keine —</option>
                  {postings.filter(p => p.status === 'active').map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Notizen</label>
              <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Zusätzliche Informationen..." />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setCreateOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="plus" onClick={handleCreateApplicant} disabled={!form.first_name || !form.last_name}>
                Bewerber anlegen
              </MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== Modal: Neue Stellenanzeige ===== */}
      {createPostingOpen && (
        <Modal open title="Neue Stellenanzeige" onClose={() => setCreatePostingOpen(false)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Titel *</label>
              <input style={inputStyle} value={postingForm.title} onChange={e => setPostingForm({ ...postingForm, title: e.target.value })} placeholder="z.B. Alltagsbegleiter/in (m/w/d)" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Positionstyp</label>
                <select style={inputStyle} value={postingForm.position_type} onChange={e => setPostingForm({ ...postingForm, position_type: e.target.value })}>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Standort</label>
                <input style={inputStyle} value={postingForm.location} onChange={e => setPostingForm({ ...postingForm, location: e.target.value })} placeholder="Standort" />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Beschreibung</label>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={postingForm.description} onChange={e => setPostingForm({ ...postingForm, description: e.target.value })} placeholder="Stellenbeschreibung..." />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Veröffentlichungskanäle</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CHANNELS.map(ch => {
                  const selected = postingForm.channels.includes(ch)
                  return (
                    <span key={ch} onClick={() => {
                      setPostingForm({
                        ...postingForm,
                        channels: selected
                          ? postingForm.channels.filter(c => c !== ch)
                          : [...postingForm.channels, ch],
                      })
                    }} style={{
                      fontSize: 12, padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                      background: selected ? `${BRAND.gold}25` : BRAND.light,
                      color: selected ? BRAND.gold : BRAND.muted,
                      border: `1px solid ${selected ? BRAND.gold : BRAND.border}`,
                      fontWeight: selected ? 600 : 400,
                      transition: 'all 0.15s',
                    }}>
                      {ch}
                    </span>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setCreatePostingOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="plus" onClick={handleCreatePosting} disabled={!postingForm.title}>
                Stellenanzeige erstellen
              </MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== Modal: Bewerber-Detail ===== */}
      {selectedApplicant && (
        <Modal open title={`${selectedApplicant.first_name} ${selectedApplicant.last_name}`} onClose={() => setSelectedApplicant(null)} width={580}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Kontaktdaten & Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Position</div>
                <div style={{ fontSize: 14, color: BRAND.text, fontWeight: 600 }}>{selectedApplicant.position}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Status</div>
                <Badge label={APPLICANT_STATUS[selectedApplicant.status]?.label || selectedApplicant.status} color={APPLICANT_STATUS[selectedApplicant.status]?.color || BRAND.muted} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>E-Mail</div>
                <div style={{ fontSize: 13, color: BRAND.text }}>{selectedApplicant.email || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Telefon</div>
                <div style={{ fontSize: 13, color: BRAND.text }}>{selectedApplicant.phone || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Quelle</div>
                <div style={{ fontSize: 13, color: BRAND.text }}>{selectedApplicant.source}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Beworben am</div>
                <div style={{ fontSize: 13, color: BRAND.text }}>{formatDate(selectedApplicant.applied_at)}</div>
              </div>
            </div>

            {/* Bewertung */}
            <div>
              <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 6 }}>Bewertung</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <span key={n} onClick={() => handleRating(selectedApplicant.id, n)} style={{
                    cursor: 'pointer', fontSize: 22,
                    color: n <= selectedApplicant.rating ? BRAND.gold : `${BRAND.muted}40`,
                    transition: 'color 0.15s',
                  }}>★</span>
                ))}
              </div>
            </div>

            {/* Notizen */}
            {selectedApplicant.notes && (
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Notizen</div>
                <div style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.6, padding: 12, background: BRAND.light, borderRadius: 8 }}>{selectedApplicant.notes}</div>
              </div>
            )}

            {/* Dokumente */}
            <div>
              <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 6 }}>Dokumente</div>
              {selectedApplicant.documents && selectedApplicant.documents.length > 0 ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {selectedApplicant.documents.map((doc, i) => (
                    <span key={i} style={{
                      fontSize: 12, padding: '5px 10px', borderRadius: 8,
                      background: `${BRAND.info}15`, color: BRAND.info, display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <MIcon name="files" size={12} /> {doc.name}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: BRAND.muted, fontStyle: 'italic' }}>Keine Dokumente hinterlegt</div>
              )}
            </div>

            {/* Status-Pipeline (visuell) */}
            <div>
              <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 8 }}>Pipeline-Fortschritt</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {PIPELINE_STEPS.map((step, i) => {
                  const st = APPLICANT_STATUS[step]
                  const currentIdx = PIPELINE_STEPS.indexOf(selectedApplicant.status as typeof PIPELINE_STEPS[number])
                  const isActive = i <= currentIdx
                  const isCurrent = step === selectedApplicant.status
                  return (
                    <React.Fragment key={step}>
                      {i > 0 && <div style={{ flex: '0 0 12px', height: 2, background: isActive ? st.color : BRAND.border }} />}
                      <div
                        onClick={() => handleStatusUpdate(selectedApplicant.id, step)}
                        style={{
                          flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 8, cursor: 'pointer',
                          background: isCurrent ? `${st.color}25` : isActive ? `${st.color}10` : BRAND.light,
                          border: `1px solid ${isCurrent ? st.color : 'transparent'}`,
                          transition: 'all 0.15s',
                        }}>
                        <div style={{ fontSize: 10, fontWeight: isCurrent ? 700 : 500, color: isActive ? st.color : BRAND.muted }}>{st.label}</div>
                      </div>
                    </React.Fragment>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 4 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selectedApplicant.status !== 'eingestellt' && selectedApplicant.status !== 'abgelehnt' && (
                  <>
                    <MisButton icon="check" onClick={() => handleStatusUpdate(selectedApplicant.id, 'eingestellt')}>Einstellen</MisButton>
                    <MisButton variant="secondary" icon="x" onClick={() => handleStatusUpdate(selectedApplicant.id, 'abgelehnt')}>Ablehnen</MisButton>
                  </>
                )}
              </div>
              <MisButton variant="danger" icon="trash" onClick={() => handleDeleteApplicant(selectedApplicant.id)}>Löschen</MisButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
