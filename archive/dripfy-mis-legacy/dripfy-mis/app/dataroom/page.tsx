'use client'
import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, DataTable, MisButton, Badge, EmptyState, StatRow, KpiCard } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'

const DATA_ROOM_DOCS = [
  { section: 'Unternehmensübersicht', file: 'AlltagsEngel-Company-Overview.docx', size: '13 KB', type: 'DOCX', status: 'final' },
  { section: 'Executive Summary', file: 'AlltagsEngel-Executive-Summary.pdf', size: '6,7 KB', type: 'PDF', status: 'final' },
  { section: 'Pitch Deck (DE)', file: 'AlltagsEngel-Detailed-Pitch-Deck-2026.pptx', size: '460 KB', type: 'PPTX', status: 'final' },
  { section: 'Pitch Deck (PDF)', file: 'AlltagsEngel-Investor-Pitch-Deck.pdf', size: '152 KB', type: 'PDF', status: 'final' },
  { section: 'Markenidentität', file: 'AlltagsEngel-Brand-Identity-Guidelines.pdf', size: '23 KB', type: 'PDF', status: 'final' },
  { section: 'Marktanalyse', file: 'AlltagsEngel-Market-Analysis.docx', size: '18 KB', type: 'DOCX', status: 'final' },
  { section: 'Finanzprognosen', file: 'AlltagsEngel-Financial-Projections.xlsx', size: '8,7 KB', type: 'XLSX', status: 'final' },
  { section: 'Produkt & Technologie', file: 'AlltagsEngel-Product-Technology-Overview.pdf', size: '17 KB', type: 'PDF', status: 'final' },
  { section: 'Go-To-Market', file: 'AlltagsEngel-Go-To-Market-Strategy.docx', size: '13 KB', type: 'DOCX', status: 'final' },
  { section: 'Recht & Compliance', file: 'AlltagsEngel-Legal-Compliance-Summary.docx', size: '17 KB', type: 'DOCX', status: 'final' },
  { section: 'Data Room Index', file: 'AlltagsEngel-Data-Room-Index.pdf', size: '45 KB', type: 'PDF', status: 'final' },
]

export default function DataRoomPage() {
  const [accessLog, setAccessLog] = useState<Record<string,unknown>[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('mis_dataroom_access').select('*').order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setAccessLog(data || []))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader
        title="Investor Data Room"
        subtitle="Sichere Dokumentenfreigabe für Investoren & Partner"
        icon="lock"
        actions={<MisButton icon="externalLink" variant="secondary" onClick={() => window.open('/data-room', '_blank')}>Data Room öffnen</MisButton>}
      />

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <KpiCard title="Dokumente" value={DATA_ROOM_DOCS.length} icon="files" />
        <KpiCard title="Sektionen" value="8" icon="layers" />
        <KpiCard title="Zugriffe (30 Tage)" value={accessLog.length} icon="eye" trend="up" />
        <KpiCard title="Status" value="Bereit" icon="check" color={BRAND.success} />
      </div>

      {/* Documents */}
      <Card title="Data Room Dokumente" icon="files" noPad>
        <DataTable
          columns={[
            { key: 'section', label: 'Sektion' },
            { key: 'file', label: 'Datei', render: (r) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: BRAND.gold }}><MIcon name="files" size={14} /></span>
                <span style={{ fontWeight: 500 }}>{r.file as string}</span>
              </div>
            )},
            { key: 'type', label: 'Typ', render: (r) => <Badge label={r.type as string} color={BRAND.info} size="sm" /> },
            { key: 'size', label: 'Größe' },
            { key: 'status', label: 'Status', render: () => <Badge label="Final" color={BRAND.success} size="sm" /> },
          ]}
          data={DATA_ROOM_DOCS as unknown as Record<string,unknown>[]}
        />
      </Card>

      {/* Access Log */}
      <Card title="Zugriffsprotokoll" icon="eye" noPad>
        {accessLog.length === 0 ? (
          <EmptyState icon="eye" title="Noch keine Zugriffe" description="Zugriffsprotokoll wird hier angezeigt, sobald Investoren auf den Data Room zugreifen." />
        ) : (
          <DataTable
            columns={[
              { key: 'accessed_by_email', label: 'E-Mail' },
              { key: 'access_type', label: 'Typ', render: (r) => <Badge label={r.access_type as string} color={BRAND.info} size="sm" /> },
              { key: 'created_at', label: 'Zeitpunkt', render: (r) => new Date(r.created_at as string).toLocaleString('de-DE') },
            ]}
            data={accessLog}
          />
        )}
      </Card>

      {/* Sharing Info */}
      <Card style={{ background: `linear-gradient(135deg, ${BRAND.coal}, #2D2820)`, border: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: BRAND.gold }}><MIcon name="lock" size={32} /></span>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: BRAND.cream, margin: '0 0 4px' }}>Vertraulichkeit</h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
              Alle Data Room Dokumente sind vertraulich. Zugriffe werden protokolliert und überwacht.
              NDA-Unterzeichnung vor Zugriff empfohlen.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
