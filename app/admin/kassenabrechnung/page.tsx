'use client'
import { useEffect, useState } from 'react'
import { Banner, StatusBadge } from '@/components/admin/OpsUI'
import Link from 'next/link'

interface Dashboard {
  laeufe_gesamt: number
  laeufe_offen: number
  laeufe_bereit: number
  laeufe_in_uebermittlung: number
  laeufe_angenommen: number
  laeufe_probleme: number
  laeufe_abgeschlossen: number
  gesamt_cent: number
  angenommen_cent: number
  offene_fehler: number
  offene_ruecklaeufer: number
}

function euro(cents: number) {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export default function KassenabrechnungPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/billing/dta/dashboard')
      .then(r => r.json())
      .then(d => { setDashboard(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return <div className="admin-page"><p>Lade Dashboard…</p></div>
  if (error) return <div className="admin-page"><Banner tone="danger">{error}</Banner></div>

  const d = dashboard!

  return (
    <div className="admin-page">
      <h1>Kassenabrechnung</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
        Übersicht über alle DTA-Abrechnungsläufe, Rückläufer und Fehler.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <KPI label="Läufe gesamt" value={d.laeufe_gesamt} />
        <KPI label="Offen" value={d.laeufe_offen} color="#3b82f6" />
        <KPI label="Bereit" value={d.laeufe_bereit} color="#f59e0b" />
        <KPI label="In Übermittlung" value={d.laeufe_in_uebermittlung} color="#8b5cf6" />
        <KPI label="Angenommen" value={d.laeufe_angenommen} color="#22c55e" />
        <KPI label="Probleme" value={d.laeufe_probleme} color="#ef4444" />
        <KPI label="Abgeschlossen" value={d.laeufe_abgeschlossen} color="#6b7280" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div className="admin-card">
          <h3>Finanzen</h3>
          <p><strong>Gesamtvolumen:</strong> {euro(d.gesamt_cent)}</p>
          <p><strong>Angenommen:</strong> {euro(d.angenommen_cent)}</p>
        </div>
        <div className="admin-card">
          <h3>Offene Punkte</h3>
          <p>
            <strong>{d.offene_fehler}</strong> offene Fehler
            {d.offene_fehler > 0 && <span style={{ color: '#ef4444' }}> ⚠</span>}
          </p>
          <p>
            <strong>{d.offene_ruecklaeufer}</strong> unbearbeitete Rückläufer
          </p>
        </div>
      </div>

      <h2>Schnellzugriff</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <NavCard href="/admin/dta/laeufe" label="DTA-Läufe" desc="Abrechnungsläufe verwalten" />
        <NavCard href="/admin/abrechnung" label="EDIFACT-Export" desc="Dateien erzeugen" />
        <NavCard href="/admin/dakota" label="DAKOTA-Status" desc="Übermittlungsstatus" />
        <NavCard href="/admin/ruecklaeufer" label="Rückläufer" desc="Rückmeldungen verarbeiten" />
        <NavCard href="/admin/abrechnungsfehler" label="Fehlerprotokoll" desc="Fehler bearbeiten" />
        <NavCard href="/admin/korrekturlaeufe" label="Korrekturläufe" desc="Korrekturen erstellen" />
        <NavCard href="/admin/kostentraeger" label="Kostenträger" desc="Kassen & Annahmestellen" />
        <NavCard href="/admin/abrechnung/einstellungen" label="Einstellungen" desc="Zertifikate & SFTP" />
      </div>
    </div>
  )
}

function KPI({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="admin-card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'inherit' }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</div>
    </div>
  )
}

function NavCard({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="admin-card" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s', padding: '16px 20px' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{desc}</div>
      </div>
    </Link>
  )
}
