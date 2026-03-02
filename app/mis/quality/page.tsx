'use client'
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, KpiCard, DataTable, Tabs, MisButton, Badge, RiskBadge, ProgressBar, StatRow, EmptyState } from '@/components/mis/MisComponents'
import type { QualityProcess, QualityAudit, CAPA } from '@/lib/mis/types'

export default function QualityPage() {
  const [processes, setProcesses] = useState<QualityProcess[]>([])
  const [audits, setAudits] = useState<QualityAudit[]>([])
  const [capas, setCapas] = useState<CAPA[]>([])
  const [tab, setTab] = useState('processes')

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('mis_quality_processes').select('*').order('process_id'),
      supabase.from('mis_quality_audits').select('*').order('scheduled_date', { ascending: false }),
      supabase.from('mis_capa').select('*').order('created_at', { ascending: false }),
    ]).then(([{ data: p }, { data: a }, { data: c }]) => {
      setProcesses(p as QualityProcess[] || [])
      setAudits(a as QualityAudit[] || [])
      setCapas(c as CAPA[] || [])
    })
  }, [])

  const openCapas = capas.filter(c => c.status !== 'closed').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader title="Qualitätsmanagement (ISO 9001)" subtitle="Prozesse, Audits, CAPA und kontinuierliche Verbesserung" icon="shield" />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
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
                { key: 'process_id', label: 'ID', width: '80px' },
                { key: 'name', label: 'Prozessname', render: (r) => <span style={{ fontWeight: 600 }}>{r.name as string}</span> },
                { key: 'category', label: 'Kategorie', render: (r) => (
                  <Badge label={r.category === 'core' ? 'Kern' : r.category === 'support' ? 'Support' : 'Management'} color={r.category === 'core' ? BRAND.gold : r.category === 'support' ? BRAND.info : BRAND.muted} size="sm" />
                )},
                { key: 'risk_level', label: 'Risiko', render: (r) => <RiskBadge level={r.risk_level as string} /> },
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
            <MisButton icon="plus">Audit planen</MisButton>
          </div>
          {audits.length === 0 ? (
            <Card><EmptyState icon="shield" title="Keine Audits geplant" description="Planen Sie interne oder externe Audits." /></Card>
          ) : (
            <Card noPad>
              <DataTable
                columns={[
                  { key: 'audit_number', label: 'Audit-Nr.' },
                  { key: 'audit_type', label: 'Typ', render: (r) => <Badge label={String(r.audit_type)} color={BRAND.info} size="sm" /> },
                  { key: 'auditor_name', label: 'Auditor' },
                  { key: 'status', label: 'Status', render: (r) => <Badge label={String(r.status)} color={r.status === 'completed' ? BRAND.success : BRAND.warning} size="sm" /> },
                  { key: 'findings_count', label: 'Befunde' },
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
            <MisButton icon="plus">CAPA erstellen</MisButton>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
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
                        <div style={{ fontWeight: 600, color: BRAND.coal }}>{p.process_id}: {p.name}</div>
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
    </div>
  )
}
