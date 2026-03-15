'use client'
import React, { useState } from 'react'
import { BRAND } from '@/lib/mis/constants'
import { SectionHeader, Card, MisButton, Tabs, StatRow, Badge } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'
import { useMis } from '@/lib/mis/MisContext'

export default function SettingsPage() {
  const { isMobile } = useMis()
  const [tab, setTab] = useState('general')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader title="Einstellungen" subtitle="MIS-Konfiguration und Systemverwaltung" icon="settings" />

      <Tabs tabs={[
        { id: 'general', label: 'Allgemein', icon: 'settings' },
        { id: 'integrations', label: 'Integrationen', icon: 'layers' },
        { id: 'security', label: 'Sicherheit', icon: 'shield' },
        { id: 'about', label: 'Über MIS', icon: 'sparkles' },
      ]} active={tab} onChange={setTab} />

      {tab === 'general' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: isMobile ? 12 : 20 }}>
          <Card title="System" icon="settings">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <StatRow label="Unternehmen" value="AlltagsEngel UG" />
              <StatRow label="MIS Version" value="1.0.0" />
              <StatRow label="Framework" value="Next.js 16" />
              <StatRow label="Datenbank" value="Supabase (PostgreSQL)" />
              <StatRow label="Hosting" value="Vercel" />
              <StatRow label="Letzte Aktualisierung" value={new Date().toLocaleDateString('de-DE')} />
            </div>
          </Card>
          <Card title="Module" icon="layers">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { name: 'Dashboard', status: 'active' },
                { name: 'Dokumentenmanagement', status: 'active' },
                { name: 'Data Room', status: 'active' },
                { name: 'Finanzen', status: 'active' },
                { name: 'Lieferkette', status: 'active' },
                { name: 'Qualitätsmanagement', status: 'active' },
                { name: 'Marktanalyse', status: 'active' },
                { name: 'KI-Assistent', status: 'beta' },
                { name: 'Team & HR', status: 'active' },
              ].map(m => (
                <div key={m.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${BRAND.border}` }}>
                  <span style={{ fontSize: 13 }}>{m.name}</span>
                  <Badge label={m.status === 'active' ? 'Aktiv' : 'Beta'} color={m.status === 'active' ? BRAND.success : BRAND.warning} size="sm" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'integrations' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: isMobile ? 10 : 16 }}>
          {[
            { name: 'Supabase', desc: 'Datenbank, Auth, Storage', status: 'connected', icon: 'layers' },
            { name: 'Vercel', desc: 'Hosting & Deployment', status: 'connected', icon: 'globe' },
            { name: 'OpenAI / Claude', desc: 'KI-Assistent & Analyse', status: 'planned', icon: 'sparkles' },
            { name: 'Stripe', desc: 'Zahlungsabwicklung', status: 'planned', icon: 'banknote' },
            { name: 'SendGrid', desc: 'E-Mail-Benachrichtigungen', status: 'planned', icon: 'send' },
            { name: 'Google Analytics', desc: 'Web-Analytik', status: 'planned', icon: 'chart' },
          ].map(int => (
            <Card key={int.name}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8, padding: 10 }}>
                <span style={{ color: int.status === 'connected' ? BRAND.gold : BRAND.muted }}><MIcon name={int.icon} size={28} /></span>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: BRAND.text, margin: 0 }}>{int.name}</h4>
                <p style={{ fontSize: 12, color: BRAND.muted, margin: 0 }}>{int.desc}</p>
                <Badge label={int.status === 'connected' ? 'Verbunden' : 'Geplant'} color={int.status === 'connected' ? BRAND.success : BRAND.muted} size="sm" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'security' && (
        <Card title="Sicherheit & Compliance" icon="shield">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <StatRow label="Authentifizierung" value="Supabase Auth (E-Mail/Passwort)" />
            <StatRow label="Row Level Security" value="Aktiviert" />
            <StatRow label="Audit-Protokollierung" value="Aktiviert" />
            <StatRow label="Datenverschlüsselung" value="AES-256 (at rest)" />
            <StatRow label="DSGVO-Konformität" value="In Umsetzung" />
            <StatRow label="ISO 27001" value="Geplant" />
            <StatRow label="Backup-Intervall" value="Täglich (Supabase)" />
            <StatRow label="Zugriffskontrolle" value="Rollenbasiert (RBAC)" />
          </div>
        </Card>
      )}

      {tab === 'about' && (
        <Card style={{ background: `linear-gradient(135deg, ${BRAND.coal}, #2D2820)`, border: 'none' }}>
          <div style={{ textAlign: 'center', padding: 30 }}>
            <div style={{
              width: 60, height: 60, borderRadius: 16, margin: '0 auto 16px',
              background: `linear-gradient(135deg, ${BRAND.gold}, ${BRAND.gold}BB)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MIcon name="wings" size={30} />
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: BRAND.cream, fontFamily: 'var(--font-cormorant), serif', margin: '0 0 4px' }}>
              ALLTAGSENGEL MIS
            </h2>
            <p style={{ fontSize: 14, color: BRAND.gold, fontWeight: 600, margin: '0 0 16px' }}>
              Management Information System v1.0
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', maxWidth: 500, margin: '0 auto 20px', lineHeight: 1.6 }}>
              Integriertes Management-Informationssystem für AlltagsEngel UG.
              Dokumentenmanagement, Finanzen, Qualitätsmanagement (ISO 9001),
              Lieferkette, Marktanalyse und KI-gestützte Entscheidungsunterstützung.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20 }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Powered by</div>
                <a href="https://dripfy.app" target="_blank" rel="noopener noreferrer" style={{
                  fontSize: 16, color: BRAND.gold, textDecoration: 'none', fontWeight: 700,
                }}>DRIPFY.APP</a>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
