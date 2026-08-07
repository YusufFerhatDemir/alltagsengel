'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Banner } from '@/components/admin/OpsUI'

export default function DtaPage() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/billing/dta/dashboard')
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="admin-page">
      <h1>Datenaustausch (DTA)</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
        Elektronischer Datenaustausch mit Kostenträgern nach § 105 SGB XI.
      </p>

      {loading ? <p>Lade…</p> : stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 32 }}>
          <Stat label="Läufe" value={stats.laeufe_gesamt} />
          <Stat label="Bereit" value={stats.laeufe_bereit} />
          <Stat label="Angenommen" value={stats.laeufe_angenommen} />
          <Stat label="Fehler" value={stats.offene_fehler} warn />
        </div>
      )}

      <h2>Workflow</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <Step nr={1} href="/admin/dta/laeufe" label="Abrechnungslauf erstellen"
          desc="Monat + Bundesland wählen, Pre-Flight-Validierung, Lauf anlegen" />
        <Step nr={2} href="/admin/abrechnung" label="EDIFACT exportieren"
          desc="Dateien erzeugen, validieren, für Versand bereitstellen" />
        <Step nr={3} href="/admin/dakota" label="DAKOTA-Übermittlung"
          desc="Verschlüsseln, an Datenannahmestelle senden" />
        <Step nr={4} href="/admin/ruecklaeufer" label="Rückläufer verarbeiten"
          desc="Antworten importieren, Fehler zuordnen" />
        <Step nr={5} href="/admin/korrekturlaeufe" label="Korrekturen"
          desc="Abgelehnte Positionen korrigieren, erneut einreichen" />
      </div>
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="admin-card" style={{ textAlign: 'center', padding: '12px 8px' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: warn && value > 0 ? '#ef4444' : undefined }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
    </div>
  )
}

function Step({ nr, href, label, desc }: { nr: number; href: string; label: string; desc: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="admin-card" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', cursor: 'pointer' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: 'var(--primary, #3b82f6)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 14, flexShrink: 0,
        }}>{nr}</div>
        <div>
          <div style={{ fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{desc}</div>
        </div>
      </div>
    </Link>
  )
}
