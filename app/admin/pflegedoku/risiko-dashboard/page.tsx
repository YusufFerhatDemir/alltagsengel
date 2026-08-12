'use client'
// ═══════════════════════════════════════════════════════════════
// Risiko-Dashboard — View pflege_risiko_dashboard
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PFLEGE_PRUEFSTATUS, PFLEGE_RISIKO_TYP, PFLEGE_SCHWEREGRAD, formatDate, statusMeta } from '@/lib/admin/ops'
import { Banner, EmptyRow, SearchInput, StatusBadge } from '@/components/admin/OpsUI'
import { pflegeSecondaryBtn } from '@/components/admin/PflegeUI'
import type { PflegeRisikoDashboardZeile, RisikoPruefstatus } from '@/lib/pflege/types'

type Zusammenfassung = {
  gesamt: number
  kritisch: number
  hoch: number
  ueberfaellig: number
  bald_faellig: number
  ohne_pruefung: number
}

export default function AdminRisikoDashboardPage() {
  const [risiken, setRisiken] = useState<PflegeRisikoDashboardZeile[]>([])
  const [zusammenfassung, setZusammenfassung] = useState<Zusammenfassung | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [typFilter, setTypFilter] = useState('all')
  const [pruefFilter, setPruefFilter] = useState<RisikoPruefstatus | 'all'>('all')

  useEffect(() => {
    fetch('/api/pflege/uebersicht?risiken=true')
      .then(r => r.json())
      .then(body => {
        if (body.error) { setError(body.error); return }
        setRisiken(body.risiken || [])
        setZusammenfassung(body.zusammenfassung || null)
      })
      .catch(() => setError('Laden fehlgeschlagen.'))
      .finally(() => setLoading(false))
  }, [])

  const gefiltert = useMemo(() => {
    const suche = search.trim().toLowerCase()
    return risiken.filter(r => {
      if (suche && !`${r.kunde_name} ${r.bezeichnung}`.toLowerCase().includes(suche)) return false
      if (typFilter !== 'all' && r.risiko_typ !== typFilter) return false
      if (pruefFilter !== 'all' && r.pruefstatus !== pruefFilter) return false
      return true
    })
  }, [risiken, search, typFilter, pruefFilter])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Risiko-Dashboard</h1>
          <p className="admin-subtitle">{risiken.length} aktive Risiken über alle Kunden</p>
        </div>
        <Link href="/admin/pflegedoku" style={pflegeSecondaryBtn}>← Pflegedoku</Link>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {zusammenfassung && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          <Stat label="Aktive Risiken" value={zusammenfassung.gesamt} tone="ok" active={pruefFilter === 'all'} onClick={() => setPruefFilter('all')} />
          <Stat label="Kritisch" value={zusammenfassung.kritisch} tone="danger" active={false} onClick={() => setPruefFilter('all')} />
          <Stat label="Hoch" value={zusammenfassung.hoch} tone="danger" active={false} onClick={() => setPruefFilter('all')} />
          <Stat label="Prüfung überfällig" value={zusammenfassung.ueberfaellig} tone="danger" active={pruefFilter === 'ueberfaellig'} onClick={() => setPruefFilter('ueberfaellig')} />
          <Stat label="Bald fällig" value={zusammenfassung.bald_faellig} tone="warn" active={pruefFilter === 'bald_faellig'} onClick={() => setPruefFilter('bald_faellig')} />
          <Stat label="Ohne Prüftermin" value={zusammenfassung.ohne_pruefung} tone="warn" active={pruefFilter === 'keine_pruefung'} onClick={() => setPruefFilter('keine_pruefung')} />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Kunde oder Risiko…" />
      </div>

      <div className="admin-filters">
        <button className={`admin-filter-btn ${typFilter === 'all' ? 'active' : ''}`} onClick={() => setTypFilter('all')}>Alle Typen</button>
        {Object.entries(PFLEGE_RISIKO_TYP).map(([k, v]) => (
          <button key={k} className={`admin-filter-btn ${typFilter === k ? 'active' : ''}`} onClick={() => setTypFilter(k)}>{v.label}</button>
        ))}
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Kunde</th><th>Risiko</th><th>Typ</th><th>Schweregrad</th><th>Maßnahmen</th><th>Nächste Prüfung</th><th>Prüfstatus</th></tr>
          </thead>
          <tbody>
            {loading
              ? <EmptyRow colSpan={7}>Laden…</EmptyRow>
              : gefiltert.length === 0
                ? <EmptyRow colSpan={7}>Keine Risiken gefunden</EmptyRow>
                : gefiltert.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>
                      <Link href={`/admin/pflegedoku/diagnosen/${r.client_id}`} style={{ color: 'inherit' }}>{r.kunde_name}</Link>
                    </td>
                    <td style={{ fontSize: 13 }}>{r.bezeichnung}</td>
                    <td><StatusBadge label={statusMeta(PFLEGE_RISIKO_TYP, r.risiko_typ).label} color={statusMeta(PFLEGE_RISIKO_TYP, r.risiko_typ).color} /></td>
                    <td><StatusBadge label={statusMeta(PFLEGE_SCHWEREGRAD, r.schweregrad).label} color={statusMeta(PFLEGE_SCHWEREGRAD, r.schweregrad).color} /></td>
                    <td style={{ fontSize: 13, maxWidth: 260 }}>{r.massnahmen || '—'}</td>
                    <td style={{ fontSize: 13 }}>{formatDate(r.naechste_pruefung)}</td>
                    <td><StatusBadge label={statusMeta(PFLEGE_PRUEFSTATUS, r.pruefstatus).label} color={statusMeta(PFLEGE_PRUEFSTATUS, r.pruefstatus).color} /></td>
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
