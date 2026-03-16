'use client'
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, KpiCard, DataTable, Tabs, MisButton, Badge, RiskBadge, ProgressBar, StatRow, EmptyState, Modal } from '@/components/mis/MisComponents'
import { useMis } from '@/lib/mis/MisContext'
import type { QualityProcess, QualityAudit, CAPA } from '@/lib/mis/types'

export default function QualityPage() {
  const { isMobile } = useMis()
  const [processes, setProcesses] = useState<QualityProcess[]>([])
  const [audits, setAudits] = useState<QualityAudit[]>([])
  const [capas, setCapas] = useState<CAPA[]>([])
  const [tab, setTab] = useState('processes')
  const [auditOpen, setAuditOpen] = useState(false)
  const [auditForm, setAuditForm] = useState({ audit_number: '', audit_type: 'internal', auditor_name: '', scheduled_date: '', notes: '' })
  const [capaOpen, setCapaOpen] = useState(false)
  const [capaForm, setCapaForm] = useState({ capa_number: '', type: 'corrective', title: '', description: '', priority: 'medium', due_date: '' })

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient()
        const [{ data: p, error: e1 }, { data: a, error: e2 }, { data: c, error: e3 }] = await Promise.all([
          supabase.from('mis_quality_processes').select('*').order('process_id'),
          supabase.from('mis_quality_audits').select('*').order('scheduled_date', { ascending: false }),
          supabase.from('mis_capa').select('*').order('created_at', { ascending: false }),
        ])
        if (e1) console.error('Processes error:', e1)
        if (e2) console.error('Audits error:', e2)
        if (e3) console.error('CAPA error:', e3)
        setProcesses(p as QualityProcess[] || [])
        setAudits(a as QualityAudit[] || [])
        setCapas(c as CAPA[] || [])
      } catch (err) { console.error('Quality loadData error:', err) }
    })()
  }, [])

  const openCapas = capas.filter(c => c.status !== 'closed').length

  async function handleAddAudit() {
    try {
      const supabase = createClient()
      const { error } = await supabase.from('mis_quality_audits').insert({
        ...auditForm,
        scheduled_date: auditForm.scheduled_date || null,
      })
      if (error) { alert('Fehler: ' + error.message); return }
      setAuditOpen(false)
      setAuditForm({ audit_number: '', audit_type: 'internal', auditor_name: '', scheduled_date: '', notes: '' })
      const { data } = await supabase.from('mis_quality_audits').select('*').order('scheduled_date', { ascending: false })
      setAudits(data as QualityAudit[] || [])
    } catch { alert('Speichern fehlgeschlagen') }
  }

  async function handleAddCapa() {
    try {
      const supabase = createClient()
      const { error } = await supabase.from('mis_capa').insert({
        ...capaForm,
        due_date: capaForm.due_date || null,
      })
      if (error) { alert('Fehler: ' + error.message); return }
      setCapaOpen(false)
      setCapaForm({ capa_number: '', type: 'corrective', title: '', description: '', priority: 'medium', due_date: '' })
      const { data } = await supabase.from('mis_capa').select('*').order('created_at', { ascending: false })
      setCapas(data as CAPA[] || [])
    } catch { alert('Speichern fehlgeschlagen') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader title="Qualitätsmanagement (ISO 9001)" subtitle="Prozesse, Audits, CAPA und kontinuierliche Verbesserung" icon="shield" />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: isMobile ? 10 : 16 }}>
        <KpiCard title="Prozesse" value={processes.length} icon="layers" />
        <KpiCard title="Audits geplant" value={audits.filter(a => a.status === 'planned').length} icon="calendar" color={BRAND.info} />
        <KpiCard title="Offene CAPA" value={openCapas} icon="zap" color={openCapas > 0 ? BRAND.warning : BRAND.success} />
        <KpiCard title="ISO 9001 Status" value="Aufbau" icon="award" color={BRAND.gold} />
      </div>

      <Tabs tabs={[
        { id: 'processes', label: 'Prozesse', icon: 'layers', count: processes.length },
        { id: 'audits', label: 'Audits', icon: 'shield', count: audits.length },
        { id: 'capa', label: 'CAPA', icon: 'zap', count: openCapas },
        { id: 'matrix', label: 'Prozesslandkarte', icon: 'target' },
      ]} active={tab} onChange={setTab} />

      {tab === 'processes' && (
        <Card noPad>
          {processes.length === 0 ? (
            <EmptyState icon="layers" title="Keine Prozesse definiert" description="Definieren Sie ISO 9001 Prozesse, um das QMS aufzubauen." />
          ) : (
            <DataTable
              columns={[
                { key: 'process_id', label: 'ID', width: isMobile ? '50px' : '80px' },
                { key: 'name', label: 'Prozess', render: (r) => <span style={{ fontWeight: 600, fontSize: isMobile ? 12 : 14 }}>{r.name as string}</span> },
                { key: 'category', label: 'Kat.', render: (r) => (
                  <Badge label={r.category === 'core' ? 'Kern' : r.category === 'support' ? 'Supp.' : 'Mgmt.'} color={r.category === 'core' ? BRAND.gold : r.category === 'support' ? BRAND.info : BRAND.muted} size="sm" />
                )},
                ...(!isMobile ? [{ key: 'risk_level', label: 'Risiko', render: (r: Record<string,unknown>) => <RiskBadge level={r.risk_level as string} /> }] : []),
                { key: 'status', label: 'Status', render: (r) => (
                  <Badge label={r.status === 'active' ? 'Aktiv' : String(r.status)} color={r.status === 'active' ? BRAND.success : BRAND.warning} size="sm" />
                )},
              ]}
              data={processes as unknown as Record<string,unknown>[]}
            />
          )}
        </Card>
      )}

      {tab === 'audits' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <MisButton icon="plus" onClick={() => setAuditOpen(true)}>Audit planen</MisButton>
          </div>
          {audits.length === 0 ? (
            <Card><EmptyState icon="shield" title="Keine Audits geplant" description="Planen Sie interne oder externe Audits." /></Card>
          ) : (
            <Card noPad>
              <DataTable
                columns={[
                  { key: 'audit_number', label: 'Nr.' },
                  { key: 'audit_type', label: 'Typ', render: (r) => <Badge label={String(r.audit_type)} color={BRAND.info} size="sm" /> },
                  ...(!isMobile ? [{ key: 'auditor_name', label: 'Auditor' }] : []),
                  { key: 'status', label: 'Status', render: (r) => <Badge label={String(r.status)} color={r.status === 'completed' ? BRAND.success : BRAND.warning} size="sm" /> },
                  ...(!isMobile ? [{ key: 'findings_count', label: 'Befunde' }] : []),
                  { key: 'scheduled_date', label: 'Datum', render: (r) => r.scheduled_date ? new Date(r.scheduled_date as string).toLocaleDateString('de-DE') : '—' },
                ]}
                data={audits as unknown as Record<string,unknown>[]}
              />
            </Card>
          )}
        </>
      )}

      {tab === 'capa' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <MisButton icon="plus" onClick={() => setCapaOpen(true)}>CAPA erstellen</MisButton>
          </div>
          {capas.length === 0 ? (
            <Card><EmptyState icon="zap" title="Keine CAPA-Einträge" description="Erstellen Sie korrigierende oder vorbeugende Maßnahmen." /></Card>
          ) : (
            <Card noPad>
              <DataTable
                columns={[
                  { key: 'capa_number', label: 'Nr.' },
                  { key: 'title', label: 'Titel', render: (r) => <span style={{ fontWeight: 600 }}>{r.title as string}</span> },
                  { key: 'type', label: 'Typ', render: (r) => <Badge label={r.type === 'corrective' ? 'Korrektur' : r.type === 'preventive' ? 'Prävention' : 'Verbesserung'} color={r.type === 'corrective' ? BRAND.error : r.type === 'preventive' ? BRAND.warning : BRAND.success} size="sm" /> },
                  { key: 'priority', label: 'Priorität', render: (r) => <RiskBadge level={r.priority as string} /> },
                  { key: 'status', label: 'Status', render: (r) => <Badge label={String(r.status)} color={r.status === 'closed' ? BRAND.success : BRAND.warning} size="sm" /> },
                ]}
                data={capas as unknown as Record<string,unknown>[]}
              />
            </Card>
          )}
        </>
      )}

      {tab === 'matrix' && (
        <Card title="ISO 9001 Prozesslandkarte" icon="target">
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: isMobile ? 10 : 16 }}>
            {['Kernprozesse', 'Supportprozesse', 'Managementprozesse'].map((cat, ci) => {
              const catKey = ['core', 'support', 'management'][ci]
              const catColor = [BRAND.gold, BRAND.info, BRAND.muted][ci]
              const catProcesses = processes.filter(p => p.category === catKey)
              return (
                <div key={cat} style={{ border: `2px solid ${catColor}30`, borderRadius: 12, padding: 16 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: catColor, margin: '0 0 12px', textAlign: 'center' }}>{cat}</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {catProcesses.map(p => (
                      <div key={p.id} style={{
                        padding: '10px 12px', borderRadius: 8, background: `${catColor}08`,
                        border: `1px solid ${catColor}20`, fontSize: 12,
                      }}>
                        <div style={{ fontWeight: 600, color: BRAND.text }}>{p.process_id}: {p.name}</div>
                        <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 2 }}>{p.description}</div>
                      </div>
                    ))}
                    {catProcesses.length === 0 && <p style={{ fontSize: 12, color: BRAND.muted, textAlign: 'center' }}>Keine Prozesse</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Audit Modal */}
      <Modal open={auditOpen} onClose={() => setAuditOpen(false)} title="Audit planen">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input value={auditForm.audit_number} onChange={e => setAuditForm({...auditForm, audit_number: e.target.value})} placeholder="Audit-Nummer (z.B. AUD-001) *" style={inputStyle} />
          <select value={auditForm.audit_type} onChange={e => setAuditForm({...auditForm, audit_type: e.target.value})} style={inputStyle}>
            <option value="internal">Intern</option>
            <option value="external">Extern</option>
            <option value="supplier">Lieferanten-Audit</option>
          </select>
          <input value={auditForm.auditor_name} onChange={e => setAuditForm({...auditForm, auditor_name: e.target.value})} placeholder="Auditor Name" style={inputStyle} />
          <input type="date" value={auditForm.scheduled_date} onChange={e => setAuditForm({...auditForm, scheduled_date: e.target.value})} placeholder="Datum" style={inputStyle} />
          <textarea value={auditForm.notes} onChange={e => setAuditForm({...auditForm, notes: e.target.value})} placeholder="Notizen" rows={3} style={{...inputStyle, resize: 'vertical' as const}} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <MisButton variant="secondary" onClick={() => setAuditOpen(false)}>Abbrechen</MisButton>
            <MisButton onClick={handleAddAudit} disabled={!auditForm.audit_number}>Speichern</MisButton>
          </div>
        </div>
      </Modal>

      {/* CAPA Modal */}
      <Modal open={capaOpen} onClose={() => setCapaOpen(false)} title="CAPA erstellen">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input value={capaForm.capa_number} onChange={e => setCapaForm({...capaForm, capa_number: e.target.value})} placeholder="CAPA-Nummer (z.B. CAPA-001) *" style={inputStyle} />
          <input value={capaForm.title} onChange={e => setCapaForm({...capaForm, title: e.target.value})} placeholder="Titel *" style={inputStyle} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <select value={capaForm.type} onChange={e => setCapaForm({...capaForm, type: e.target.value})} style={inputStyle}>
              <option value="corrective">Korrekturmaßnahme</option>
              <option value="preventive">Vorbeugemaßnahme</option>
              <option value="improvement">Verbesserung</option>
            </select>
            <select value={capaForm.priority} onChange={e => setCapaForm({...capaForm, priority: e.target.value})} style={inputStyle}>
              <option value="low">Niedrig</option>
              <option value="medium">Mittel</option>
              <option value="high">Hoch</option>
              <option value="critical">Kritisch</option>
            </select>
          </div>
          <textarea value={capaForm.description} onChange={e => setCapaForm({...capaForm, description: e.target.value})} placeholder="Beschreibung" rows={3} style={{...inputStyle, resize: 'vertical' as const}} />
          <input type="date" value={capaForm.due_date} onChange={e => setCapaForm({...capaForm, due_date: e.target.value})} style={inputStyle} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <MisButton variant="secondary" onClick={() => setCapaOpen(false)}>Abbrechen</MisButton>
            <MisButton onClick={handleAddCapa} disabled={!capaForm.capa_number || !capaForm.title}>Speichern</MisButton>
          </div>
        </div>
      </Modal>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: BRAND.light, color: BRAND.text, boxSizing: 'border-box' }
