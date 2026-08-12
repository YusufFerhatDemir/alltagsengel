'use client'
// ═══════════════════════════════════════════════════════════════
// Ablaufwarnungen-Dashboard — akten_ablauf_dashboard
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AKTEN_DOKUMENT_TYP, AKTEN_DRINGLICHKEIT, formatDate, statusMeta } from '@/lib/admin/ops'
import { EmptyRow, StatusBadge, Banner } from '@/components/admin/OpsUI'
import type { AktenAblaufEintrag } from '@/lib/akten/types'

const STUFEN: Array<AktenAblaufEintrag['dringlichkeit']> = ['abgelaufen', '7_tage', '14_tage', '30_tage', '60_tage', '90_tage']

export default function AdminAblaufPage() {
  const [ablauf, setAblauf] = useState<AktenAblaufEintrag[]>([])
  const [zusammenfassung, setZusammenfassung] = useState<Record<string, number> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<AktenAblaufEintrag['dringlichkeit'] | 'all'>('all')

  useEffect(() => {
    fetch('/api/akten/ablauf')
      .then(r => r.json())
      .then(body => {
        if (body.error) { setError(body.error); return }
        setAblauf(body.ablauf || [])
        setZusammenfassung(body.zusammenfassung || null)
      })
      .catch(() => setError('Laden fehlgeschlagen.'))
      .finally(() => setLoading(false))
  }, [])

  const gefiltert = filter === 'all' ? ablauf : ablauf.filter(a => a.dringlichkeit === filter)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Ablaufwarnungen</h1>
          <p className="admin-subtitle">Dokumente mit bevorstehendem oder abgelaufenem Gültigkeitsdatum</p>
        </div>
        <Link href="/admin/dokumente" style={secondaryBtn}>← Zu allen Dokumenten</Link>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {zusammenfassung && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          <Stat label="Abgelaufen" value={zusammenfassung.abgelaufen} tone="danger" active={filter === 'abgelaufen'} onClick={() => setFilter('abgelaufen')} />
          <Stat label="≤ 7 Tage" value={zusammenfassung.in_7_tagen} tone="danger" active={filter === '7_tage'} onClick={() => setFilter('7_tage')} />
          <Stat label="≤ 14 Tage" value={zusammenfassung.in_14_tagen} tone="warn" active={filter === '14_tage'} onClick={() => setFilter('14_tage')} />
          <Stat label="≤ 30 Tage" value={zusammenfassung.in_30_tagen} tone="warn" active={filter === '30_tage'} onClick={() => setFilter('30_tage')} />
          <Stat label="≤ 60 Tage" value={zusammenfassung.in_60_tagen} tone="ok" active={filter === '60_tage'} onClick={() => setFilter('60_tage')} />
          <Stat label="≤ 90 Tage" value={zusammenfassung.in_90_tagen} tone="ok" active={filter === '90_tage'} onClick={() => setFilter('90_tage')} />
        </div>
      )}

      <div className="admin-filters">
        <button className={`admin-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Alle</button>
        {STUFEN.map(s => (
          <button key={s} className={`admin-filter-btn ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            {AKTEN_DRINGLICHKEIT[s].label}
          </button>
        ))}
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Titel</th><th>Typ</th><th>Zuordnung</th><th>Ablaufdatum</th><th>Dringlichkeit</th><th>Tage</th></tr>
          </thead>
          <tbody>
            {loading
              ? <EmptyRow colSpan={6}>Laden…</EmptyRow>
              : gefiltert.length === 0
                ? <EmptyRow colSpan={6}>Keine anstehenden Abläufe</EmptyRow>
                : gefiltert.map(a => (
                  <tr key={a.dokument_id}>
                    <td style={{ fontWeight: 600 }}>
                      <Link href={a.client_id ? `/admin/kundenakte/${a.client_id}` : a.caregiver_id ? `/admin/mitarbeiterakte/${a.caregiver_id}` : '/admin/dokumente'} style={{ color: 'inherit' }}>
                        {a.titel}
                      </Link>
                    </td>
                    <td><StatusBadge label={statusMeta(AKTEN_DOKUMENT_TYP, a.dokument_typ).label} color={statusMeta(AKTEN_DOKUMENT_TYP, a.dokument_typ).color} /></td>
                    <td style={{ fontSize: 13 }}>{a.client_id ? 'Kunde' : a.caregiver_id ? 'Mitarbeiter' : 'Organisation'}</td>
                    <td style={{ fontSize: 13 }}>{formatDate(a.ablaufdatum)}</td>
                    <td><StatusBadge label={statusMeta(AKTEN_DRINGLICHKEIT, a.dringlichkeit).label} color={statusMeta(AKTEN_DRINGLICHKEIT, a.dringlichkeit).color} /></td>
                    <td style={{ fontSize: 13, color: a.tage_bis_ablauf < 0 ? '#D04B3B' : 'var(--ink3)' }}>{a.tage_bis_ablauf}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value, tone, active, onClick }: { label: string; value: number; tone: 'danger' | 'warn' | 'ok'; active: boolean; onClick: () => void }) {
  const colors = { danger: '#D04B3B', warn: '#E8A000', ok: '#5CB882' }
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'center', padding: '12px 8px', borderRadius: 12, cursor: 'pointer',
        background: 'var(--coal2)', border: `1px solid ${active ? colors[tone] : 'var(--border)'}`,
        fontFamily: 'inherit',
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color: value > 0 ? colors[tone] : 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--ink4)' }}>{label}</div>
    </button>
  )
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--ink)', fontWeight: 600,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
  textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
}
