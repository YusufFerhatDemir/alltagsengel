'use client'
import { datumBerlin } from '@/lib/utils/timezone';
import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, DataTable, MisButton, SearchInput, Badge, Tabs, EmptyState, Modal } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'
import { useMis } from '@/lib/mis/MisContext'
import { seedTrainingCatalog as seedCatalogAction, createTrainingCatalogEntry, createTrainingRecord, deleteTrainingRecord, deleteTrainingCatalogEntry, updateTrainingRecordStatus } from './actions'
import { logger } from '@/lib/logger';
const log = logger.child('mis:training');

// ===== Typen =====
interface Training {
  id: string
  name: string
  description: string
  category: 'pflicht' | 'empfohlen' | 'optional'
  validity_months: number
  provider: string
  duration_hours: number
  is_active: boolean
  created_at: string
  updated_at: string
}

interface TrainingRecord {
  id: string
  training_id: string
  engel_id: string
  engel_name: string
  completed_date: string
  expires_date: string | null
  certificate_url: string
  notes: string
  status: string
  created_at: string
  // joined
  training?: Training
}

interface Engel {
  id: string
  first_name: string
  last_name: string
  role: string
}

// ===== Konstanten =====
const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  pflicht: { label: 'Pflicht', color: '#EF4444' },
  empfohlen: { label: 'Empfohlen', color: '#F59E0B' },
  optional: { label: 'Optional', color: '#3B82F6' },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  valid: { label: 'Gültig', color: '#22C55E' },
  expiring: { label: 'Läuft ab', color: '#F59E0B' },
  expired: { label: 'Abgelaufen', color: '#EF4444' },
}

const TAB_LIST = [
  { id: 'nachweise', label: 'Nachweise' },
  { id: 'katalog', label: 'Schulungskatalog' },
  { id: 'alerts', label: 'Fälligkeiten' },
]

// Standard-Pflichtschulungen für §45b
const DEFAULT_TRAININGS = [
  { name: 'Erste-Hilfe-Kurs', category: 'pflicht', validity_months: 24, duration_hours: 9, description: 'Erste-Hilfe-Grundausbildung (9 UE) gemäß DGUV Vorschrift 1', provider: '' },
  { name: 'Hygieneschulung', category: 'pflicht', validity_months: 12, duration_hours: 4, description: 'Hygiene in der Alltagsbegleitung, Infektionsschutz, Händehygiene', provider: '' },
  { name: '§45b SGB XI Nachweis', category: 'pflicht', validity_months: 0, duration_hours: 40, description: 'Qualifikationsnachweis für Angebote zur Unterstützung im Alltag nach §45b SGB XI', provider: '' },
  { name: 'Datenschutz (DSGVO)', category: 'pflicht', validity_months: 12, duration_hours: 2, description: 'Datenschutz-Grundunterweisung, Umgang mit personenbezogenen Daten', provider: '' },
  { name: 'Demenz-Betreuung', category: 'pflicht', validity_months: 24, duration_hours: 8, description: 'Grundlagen der Demenzbetreuung, Validation, Kommunikationstechniken', provider: '' },
  { name: 'Sturzprävention', category: 'empfohlen', validity_months: 24, duration_hours: 4, description: 'Sturzrisiko erkennen und vorbeugen im häuslichen Umfeld', provider: '' },
  { name: 'Ernährung im Alter', category: 'optional', validity_months: 36, duration_hours: 3, description: 'Grundlagen gesunder Ernährung und Mangelernährung bei Senioren', provider: '' },
]

// ===== SCHULUNGSMANAGEMENT =====
export default function TrainingPage() {
  const { isMobile } = useMis()
  const [catalog, setCatalog] = useState<Training[]>([])
  const [records, setRecords] = useState<TrainingRecord[]>([])
  const [engel, setEngel] = useState<Engel[]>([])
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('nachweise')
  const [loading, setLoading] = useState(true)

  // Modals
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [recordOpen, setRecordOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState<TrainingRecord | null>(null)

  // Forms
  const [catalogForm, setCatalogForm] = useState({
    name: '', description: '', category: 'pflicht', validity_months: '12',
    provider: '', duration_hours: '0',
  })
  const [recordForm, setRecordForm] = useState({
    training_id: '', engel_id: '', completed_date: '', certificate_url: '', notes: '',
  })

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const [{ data: cat }, { data: rec }, { data: eng }] = await Promise.all([
        supabase.from('mis_training_catalog').select('*').order('category').order('name'),
        supabase.from('mis_training_records').select('*').order('expires_date', { ascending: true, nullsFirst: false }),
        supabase.from('profiles').select('id, first_name, last_name, role').in('role', ['engel', 'admin', 'superadmin']),
      ])
      setCatalog(cat as Training[] || [])
      setRecords(rec as TrainingRecord[] || [])
      setEngel(eng as Engel[] || [])
    } catch (err) {
      log.errorWithException('Training loadData error', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Auto-update Status basierend auf expires_date
  useEffect(() => {
    if (records.length === 0) return
    const now = Date.now()
    const updates: { id: string; status: string }[] = []
    records.forEach(r => {
      if (!r.expires_date) return
      const diff = (new Date(r.expires_date).getTime() - now) / (1000 * 60 * 60 * 24)
      const newStatus = diff < 0 ? 'expired' : diff <= 90 ? 'expiring' : 'valid'
      if (r.status !== newStatus) updates.push({ id: r.id, status: newStatus })
    })
    if (updates.length > 0) {
      Promise.all(updates.map(u => updateTrainingRecordStatus(u.id, u.status)))
        .then(() => loadData())
    }
  }, [records, loadData])

  // ===== Seed Katalog =====
  async function seedCatalog() {
    const result = await seedCatalogAction()
    if (!result.ok) { alert('Fehler: ' + result.error); return }
    loadData()
  }

  // ===== CRUD =====
  async function handleCreateCatalog() {
    const result = await createTrainingCatalogEntry({
      name: catalogForm.name,
      description: catalogForm.description,
      category: catalogForm.category,
      validity_months: catalogForm.validity_months,
      provider: catalogForm.provider,
      duration_hours: catalogForm.duration_hours,
    })
    if (!result.ok) { alert('Fehler: ' + result.error); return }
    setCatalogOpen(false)
    setCatalogForm({ name: '', description: '', category: 'pflicht', validity_months: '12', provider: '', duration_hours: '0' })
    loadData()
  }

  async function handleCreateRecord() {
    const training = catalog.find(t => t.id === recordForm.training_id)
    const engelObj = engel.find(e => e.id === recordForm.engel_id)
    if (!training || !engelObj) return

    const completedDate = new Date(recordForm.completed_date)
    let expiresDate: string | null = null
    if (training.validity_months > 0) {
      const exp = new Date(completedDate)
      exp.setMonth(exp.getMonth() + training.validity_months)
      expiresDate = datumBerlin(exp)
    }

    const result = await createTrainingRecord({
      training_id: recordForm.training_id,
      engel_id: recordForm.engel_id,
      engel_name: `${engelObj.first_name} ${engelObj.last_name}`.trim(),
      completed_date: recordForm.completed_date,
      expires_date: expiresDate,
      certificate_url: recordForm.certificate_url,
      notes: recordForm.notes,
    })
    if (!result.ok) { alert('Fehler: ' + result.error); return }
    setRecordOpen(false)
    setRecordForm({ training_id: '', engel_id: '', completed_date: '', certificate_url: '', notes: '' })
    loadData()
  }

  async function handleDeleteRecord(id: string) {
    if (!confirm('Nachweis wirklich löschen?')) return
    await deleteTrainingRecord(id)
    setDetailRecord(null)
    loadData()
  }

  async function handleDeleteCatalogEntry(id: string) {
    if (!confirm('Schulung aus Katalog entfernen? Alle zugehörigen Nachweise werden ebenfalls gelöscht.')) return
    await deleteTrainingCatalogEntry(id)
    loadData()
  }

  // ===== Berechnungen =====
  const trainingMap = Object.fromEntries(catalog.map(t => [t.id, t]))
  const enrichedRecords = records.map(r => ({ ...r, training: trainingMap[r.training_id] }))

  const pflichtTrainings = catalog.filter(t => t.category === 'pflicht' && t.is_active)
  const engelList = engel.filter(e => e.role === 'engel')

  // KPIs
  const totalRecords = records.length
  const validRecords = records.filter(r => r.status === 'valid').length
  const expiringRecords = records.filter(r => r.status === 'expiring').length
  const expiredRecords = records.filter(r => r.status === 'expired').length

  // Schulungsquote: Engel mit ALLEN Pflichtschulungen gültig / Gesamt-Engel
  const engelWithAllPflicht = engelList.filter(e => {
    return pflichtTrainings.every(pt => {
      const rec = records.find(r => r.engel_id === e.id && r.training_id === pt.id && r.status === 'valid')
      return !!rec
    })
  }).length
  const schulungsquote = engelList.length > 0 ? Math.round((engelWithAllPflicht / engelList.length) * 100) : 0

  // Engel ohne mindestens eine Pflichtschulung
  const engelOhnePflicht = engelList.filter(e => {
    return pflichtTrainings.some(pt => {
      const rec = records.find(r => r.engel_id === e.id && r.training_id === pt.id && (r.status === 'valid' || r.status === 'expiring'))
      return !rec
    })
  })

  // Alerts: Fälligkeiten in 30/60/90 Tagen
  const now = Date.now()
  const alerts = enrichedRecords
    .filter(r => r.expires_date && r.status !== 'expired')
    .map(r => {
      const diff = Math.ceil((new Date(r.expires_date!).getTime() - now) / (1000 * 60 * 60 * 24))
      return { ...r, daysLeft: diff }
    })
    .filter(r => r.daysLeft <= 90)
    .sort((a, b) => a.daysLeft - b.daysLeft)

  // Filter
  const filteredRecords = enrichedRecords.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.engel_name.toLowerCase().includes(q) || (r.training?.name || '').toLowerCase().includes(q)
  })

  const filteredCatalog = catalog.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
  })

  // Helpers
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${BRAND.border}`,
    background: BRAND.light, color: BRAND.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionHeader
        title="Schulungsmanagement"
        subtitle="Pflichtschulungen, Nachweise und Fälligkeiten für alle Engel"
        icon="shield"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <MisButton icon="plus" onClick={() => setRecordOpen(true)}>
              Nachweis erfassen
            </MisButton>
          </div>
        }
      />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: isMobile ? 10 : 16 }}>
        {[
          { label: 'Schulungsquote', value: `${schulungsquote}%`, icon: 'shield', color: schulungsquote >= 80 ? BRAND.success : schulungsquote >= 50 ? BRAND.warning : BRAND.error },
          { label: 'Gültige Nachweise', value: validRecords, icon: 'check', color: BRAND.success },
          { label: 'Läuft bald ab', value: expiringRecords, icon: 'clock', color: BRAND.warning },
          { label: 'Überfällig', value: expiredRecords, icon: 'alert', color: BRAND.error },
          { label: 'Ohne Pflichtschulung', value: engelOhnePflicht.length, icon: 'users', color: engelOhnePflicht.length > 0 ? BRAND.error : BRAND.success },
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
          <SearchInput value={search} onChange={setSearch} placeholder="Schulung oder Engel suchen..." />
        </div>
      </div>

      <Tabs tabs={TAB_LIST} active={activeTab} onChange={setActiveTab} />

      {/* ===== TAB: Nachweise ===== */}
      {activeTab === 'nachweise' && (
        loading ? (
          <Card><div style={{ textAlign: 'center', padding: 40, color: BRAND.muted }}>Lade Schulungsnachweise...</div></Card>
        ) : filteredRecords.length === 0 ? (
          <EmptyState icon="shield" title="Keine Nachweise" description="Noch keine Schulungsnachweise erfasst. Erfassen Sie den ersten Nachweis." />
        ) : (
          <Card noPad>
            <DataTable
              columns={[
                { key: 'engel_name', label: 'Engel', render: (r: Record<string, unknown>) => (
                  <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>{String(r.engel_name)}</div>
                )},
                { key: 'training', label: 'Schulung', render: (r: Record<string, unknown>) => {
                  const t = r.training as Training | undefined
                  return (
                    <div>
                      <div style={{ fontSize: 13, color: BRAND.text }}>{t?.name || '—'}</div>
                      {t && <Badge label={CATEGORY_LABELS[t.category]?.label || t.category} color={CATEGORY_LABELS[t.category]?.color || BRAND.muted} />}
                    </div>
                  )
                }},
                { key: 'completed_date', label: 'Absolviert', render: (r: Record<string, unknown>) => formatDate(r.completed_date as string | null) },
                { key: 'expires_date', label: 'Gültig bis', render: (r: Record<string, unknown>) => {
                  const exp = r.expires_date as string | null
                  if (!exp) return <span style={{ color: BRAND.muted }}>Unbegrenzt</span>
                  const diff = (new Date(exp).getTime() - now) / (1000 * 60 * 60 * 24)
                  const color = diff < 0 ? BRAND.error : diff <= 30 ? BRAND.warning : BRAND.text
                  return <span style={{ color, fontWeight: diff <= 30 ? 700 : 400 }}>{formatDate(exp)}</span>
                }},
                { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => {
                  const s = STATUS_LABELS[String(r.status)] || { label: String(r.status), color: BRAND.muted }
                  return <Badge label={s.label} color={s.color} />
                }},
                { key: 'certificate_url', label: 'Zertifikat', render: (r: Record<string, unknown>) => {
                  const url = String(r.certificate_url || '')
                  return url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: BRAND.gold, fontSize: 12, textDecoration: 'none' }}>
                      <MIcon name="externalLink" size={14} />
                    </a>
                  ) : <span style={{ color: BRAND.muted, fontSize: 11 }}>—</span>
                }},
                { key: 'actions', label: '', render: (r: Record<string, unknown>) => (
                  <MisButton variant="secondary" icon="eye" onClick={() => setDetailRecord(r as unknown as TrainingRecord)}>
                    {isMobile ? '' : 'Details'}
                  </MisButton>
                )},
              ]}
              data={filteredRecords as unknown as Record<string, unknown>[]}
            />
          </Card>
        )
      )}

      {/* ===== TAB: Katalog ===== */}
      {activeTab === 'katalog' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {catalog.length === 0 && (
              <MisButton variant="secondary" icon="zap" onClick={seedCatalog}>
                Standard-Schulungen anlegen
              </MisButton>
            )}
            <MisButton icon="plus" onClick={() => setCatalogOpen(true)}>
              Schulung hinzufügen
            </MisButton>
          </div>

          {filteredCatalog.length === 0 ? (
            <EmptyState icon="shield" title="Leerer Katalog" description="Noch keine Schulungen definiert. Legen Sie Standard-Schulungen an oder erstellen Sie eigene." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 16 }}>
              {filteredCatalog.map(t => {
                const cat = CATEGORY_LABELS[t.category] || { label: t.category, color: BRAND.muted }
                const recordCount = records.filter(r => r.training_id === t.id && r.status === 'valid').length
                return (
                  <Card key={t.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: BRAND.text }}>{t.name}</span>
                          <Badge label={cat.label} color={cat.color} />
                        </div>
                        <div style={{ fontSize: 12, color: BRAND.muted, lineHeight: 1.5 }}>{t.description}</div>
                      </div>
                      <MisButton variant="danger" icon="trash" onClick={() => handleDeleteCatalogEntry(t.id)} />
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MIcon name="clock" size={14} />
                        <span style={{ fontSize: 11, color: BRAND.muted }}>
                          {t.validity_months > 0 ? `Alle ${t.validity_months} Monate` : 'Einmalig'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MIcon name="activity" size={14} />
                        <span style={{ fontSize: 11, color: BRAND.muted }}>{t.duration_hours} Std.</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MIcon name="users" size={14} />
                        <span style={{ fontSize: 11, color: BRAND.muted }}>{recordCount} gültig</span>
                      </div>
                      {t.provider && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <MIcon name="home" size={14} />
                          <span style={{ fontSize: 11, color: BRAND.muted }}>{t.provider}</span>
                        </div>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== TAB: Alerts / Fälligkeiten ===== */}
      {activeTab === 'alerts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Überfällige Schulungen */}
          {(() => {
            const overdue = enrichedRecords.filter(r => r.status === 'expired')
            return overdue.length > 0 ? (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `${BRAND.error}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MIcon name="alert" size={16} />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: BRAND.error }}>Überfällige Schulungen ({overdue.length})</span>
                </div>
                {overdue.map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${BRAND.border}` }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>{r.engel_name}</span>
                      <span style={{ fontSize: 12, color: BRAND.muted, marginLeft: 8 }}>{r.training?.name}</span>
                    </div>
                    <span style={{ fontSize: 12, color: BRAND.error, fontWeight: 600 }}>
                      Abgelaufen am {formatDate(r.expires_date)}
                    </span>
                  </div>
                ))}
              </Card>
            ) : null
          })()}

          {/* Bald ablaufend */}
          {alerts.length > 0 ? (
            <>
              {[
                { label: 'Innerhalb 30 Tagen', days: 30, color: BRAND.error },
                { label: 'Innerhalb 60 Tagen', days: 60, color: BRAND.warning },
                { label: 'Innerhalb 90 Tagen', days: 90, color: BRAND.info },
              ].map(bucket => {
                const items = alerts.filter(a => {
                  if (bucket.days === 30) return a.daysLeft <= 30 && a.daysLeft > 0
                  if (bucket.days === 60) return a.daysLeft > 30 && a.daysLeft <= 60
                  return a.daysLeft > 60 && a.daysLeft <= 90
                })
                if (items.length === 0) return null
                return (
                  <Card key={bucket.days}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${bucket.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <MIcon name="clock" size={16} />
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 14, color: bucket.color }}>
                        {bucket.label} ({items.length})
                      </span>
                    </div>
                    {items.map(r => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${BRAND.border}` }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>{r.engel_name}</span>
                          <span style={{ fontSize: 12, color: BRAND.muted, marginLeft: 8 }}>{r.training?.name}</span>
                        </div>
                        <span style={{ fontSize: 12, color: bucket.color, fontWeight: 600 }}>
                          {r.daysLeft} Tage verbleibend
                        </span>
                      </div>
                    ))}
                  </Card>
                )
              })}
            </>
          ) : (
            <EmptyState icon="check" title="Keine Fälligkeiten" description="Aktuell keine Schulungen, die in den nächsten 90 Tagen ablaufen." />
          )}

          {/* Engel ohne Pflichtschulung */}
          {engelOhnePflicht.length > 0 && (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `${BRAND.error}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MIcon name="users" size={16} />
                </div>
                <span style={{ fontWeight: 700, fontSize: 14, color: BRAND.error }}>
                  Engel ohne vollständige Pflichtschulungen ({engelOhnePflicht.length})
                </span>
              </div>
              {engelOhnePflicht.map(e => {
                const missing = pflichtTrainings.filter(pt => {
                  const rec = records.find(r => r.engel_id === e.id && r.training_id === pt.id && (r.status === 'valid' || r.status === 'expiring'))
                  return !rec
                })
                return (
                  <div key={e.id} style={{ padding: '10px 0', borderBottom: `1px solid ${BRAND.border}` }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text, marginBottom: 4 }}>
                      {e.first_name} {e.last_name}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {missing.map(m => (
                        <Badge key={m.id} label={`${m.name} fehlt`} color={BRAND.error} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </Card>
          )}
        </div>
      )}

      {/* ===== Modal: Schulung zum Katalog hinzufügen ===== */}
      {catalogOpen && (
        <Modal open title="Schulung zum Katalog hinzufügen" onClose={() => setCatalogOpen(false)} width={540}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="training-schulungsname" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Schulungsname *</label>
              <input id="training-schulungsname" style={inputStyle} value={catalogForm.name} onChange={e => setCatalogForm({ ...catalogForm, name: e.target.value })} placeholder="z.B. Brandschutzunterweisung" />
            </div>
            <div>
              <label htmlFor="training-beschreibung" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Beschreibung</label>
              <textarea id="training-beschreibung" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={catalogForm.description} onChange={e => setCatalogForm({ ...catalogForm, description: e.target.value })} placeholder="Worum geht es in der Schulung?" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="training-kategorie" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Kategorie</label>
                <select id="training-kategorie" style={inputStyle} value={catalogForm.category} onChange={e => setCatalogForm({ ...catalogForm, category: e.target.value })}>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="training-gueltigkeit-monate" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Gültigkeit (Monate)</label>
                <input id="training-gueltigkeit-monate" style={inputStyle} type="number" value={catalogForm.validity_months} onChange={e => setCatalogForm({ ...catalogForm, validity_months: e.target.value })} placeholder="0 = einmalig" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="training-anbieter" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Anbieter</label>
                <input id="training-anbieter" style={inputStyle} value={catalogForm.provider} onChange={e => setCatalogForm({ ...catalogForm, provider: e.target.value })} placeholder="Schulungsträger" />
              </div>
              <div>
                <label htmlFor="training-dauer-stunden" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Dauer (Stunden)</label>
                <input id="training-dauer-stunden" style={inputStyle} type="number" value={catalogForm.duration_hours} onChange={e => setCatalogForm({ ...catalogForm, duration_hours: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setCatalogOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="plus" onClick={handleCreateCatalog} disabled={!catalogForm.name}>Schulung anlegen</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== Modal: Nachweis erfassen ===== */}
      {recordOpen && (
        <Modal open title="Schulungsnachweis erfassen" onClose={() => setRecordOpen(false)} width={540}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="training-engel" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Engel *</label>
              <select id="training-engel" style={inputStyle} value={recordForm.engel_id} onChange={e => setRecordForm({ ...recordForm, engel_id: e.target.value })}>
                <option value="">— Engel auswählen —</option>
                {engel.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="training-schulung" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Schulung *</label>
              <select id="training-schulung" style={inputStyle} value={recordForm.training_id} onChange={e => setRecordForm({ ...recordForm, training_id: e.target.value })}>
                <option value="">— Schulung auswählen —</option>
                {catalog.filter(t => t.is_active).map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({CATEGORY_LABELS[t.category]?.label})</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="training-absolviert-am" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Absolviert am *</label>
              <input id="training-absolviert-am" style={inputStyle} type="date" value={recordForm.completed_date} onChange={e => setRecordForm({ ...recordForm, completed_date: e.target.value })} />
            </div>
            {recordForm.training_id && (() => {
              const t = catalog.find(c => c.id === recordForm.training_id)
              return t ? (
                <div style={{ padding: 10, background: `${BRAND.gold}10`, borderRadius: 8, fontSize: 12, color: BRAND.muted }}>
                  Gültigkeit: {t.validity_months > 0 ? `${t.validity_months} Monate ab Abschlussdatum` : 'Unbegrenzt (einmalig)'}
                </div>
              ) : null
            })()}
            <div>
              <label htmlFor="training-zertifikats-url-optional" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Zertifikats-URL (optional)</label>
              <input id="training-zertifikats-url-optional" style={inputStyle} value={recordForm.certificate_url} onChange={e => setRecordForm({ ...recordForm, certificate_url: e.target.value })} placeholder="Link zum Zertifikat oder Dokument" />
            </div>
            <div>
              <label htmlFor="training-notizen" style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginBottom: 4, display: 'block' }}>Notizen</label>
              <textarea id="training-notizen" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={recordForm.notes} onChange={e => setRecordForm({ ...recordForm, notes: e.target.value })} placeholder="Zusätzliche Anmerkungen..." />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="secondary" onClick={() => setRecordOpen(false)}>Abbrechen</MisButton>
              <MisButton icon="plus" onClick={handleCreateRecord} disabled={!recordForm.engel_id || !recordForm.training_id || !recordForm.completed_date}>Nachweis speichern</MisButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== Modal: Nachweis-Detail ===== */}
      {detailRecord && (
        <Modal open title="Schulungsnachweis" onClose={() => setDetailRecord(null)} width={500}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Engel</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>{detailRecord.engel_name}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Schulung</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{detailRecord.training?.name || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Kategorie</div>
                {detailRecord.training && <Badge label={CATEGORY_LABELS[detailRecord.training.category]?.label || detailRecord.training.category} color={CATEGORY_LABELS[detailRecord.training.category]?.color || BRAND.muted} />}
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Status</div>
                <Badge label={STATUS_LABELS[detailRecord.status]?.label || detailRecord.status} color={STATUS_LABELS[detailRecord.status]?.color || BRAND.muted} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Absolviert am</div>
                <div style={{ fontSize: 14, color: BRAND.text }}>{formatDate(detailRecord.completed_date)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 2 }}>Gültig bis</div>
                <div style={{ fontSize: 14, color: detailRecord.status === 'expired' ? BRAND.error : detailRecord.status === 'expiring' ? BRAND.warning : BRAND.text }}>
                  {detailRecord.expires_date ? formatDate(detailRecord.expires_date) : 'Unbegrenzt'}
                </div>
              </div>
            </div>
            {detailRecord.certificate_url && (
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Zertifikat</div>
                <a href={detailRecord.certificate_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: BRAND.gold, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MIcon name="externalLink" size={14} /> Zertifikat öffnen
                </a>
              </div>
            )}
            {detailRecord.notes && (
              <div>
                <div style={{ fontSize: 11, color: BRAND.muted, marginBottom: 4 }}>Notizen</div>
                <div style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.6, padding: 12, background: BRAND.light, borderRadius: 8 }}>{detailRecord.notes}</div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <MisButton variant="danger" icon="trash" onClick={() => handleDeleteRecord(detailRecord.id)}>Löschen</MisButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
