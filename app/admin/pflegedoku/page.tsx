'use client'
// ═══════════════════════════════════════════════════════════════
// Pflegedoku-Übersicht — View pflege_uebersicht
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PFLEGE_AUFNAHMESTATUS, formatDate, statusMeta } from '@/lib/admin/ops'
import { Banner, EmptyRow, SearchInput, StatusBadge } from '@/components/admin/OpsUI'
import type { PflegeUebersichtZeile } from '@/lib/pflege/types'

type Zusammenfassung = {
  kunden: number
  ohne_anamnese: number
  ohne_aktiven_plan: number
  offene_aufnahmen: number
  mit_risiken: number
}

export default function AdminPflegedokuPage() {
  const [zeilen, setZeilen] = useState<PflegeUebersichtZeile[]>([])
  const [zusammenfassung, setZusammenfassung] = useState<Zusammenfassung | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'alle' | 'ohne_anamnese' | 'ohne_plan' | 'offene_aufnahme'>('alle')

  useEffect(() => {
    fetch('/api/pflege/uebersicht')
      .then(r => r.json())
      .then(body => {
        if (body.error) { setError(body.error); return }
        setZeilen(body.uebersicht || [])
        setZusammenfassung(body.zusammenfassung || null)
      })
      .catch(() => setError('Laden fehlgeschlagen.'))
      .finally(() => setLoading(false))
  }, [])

  const gefiltert = useMemo(() => {
    const suche = search.trim().toLowerCase()
    return zeilen.filter(z => {
      if (suche && !`${z.first_name ?? ''} ${z.last_name ?? ''}`.toLowerCase().includes(suche)) return false
      if (filter === 'ohne_anamnese') return Number(z.anamnesen_count) === 0
      if (filter === 'ohne_plan') return Number(z.aktive_plaene) === 0
      if (filter === 'offene_aufnahme') return z.aufnahmestatus === 'offen' || z.aufnahmestatus === 'in_bearbeitung'
      return true
    })
  }, [zeilen, search, filter])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Pflegedokumentation</h1>
          <p className="admin-subtitle">{zeilen.length} Kunden · Aufnahme, Anamnese, Maßnahmenplan und Verlauf</p>
        </div>
        <Link href="/admin/pflegedoku/risiko-dashboard" style={secondaryBtn}>Risiko-Dashboard</Link>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {zusammenfassung && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          <Stat label="Kunden" value={zusammenfassung.kunden} tone="ok" active={filter === 'alle'} onClick={() => setFilter('alle')} />
          <Stat label="Ohne Anamnese" value={zusammenfassung.ohne_anamnese} tone="warn" active={filter === 'ohne_anamnese'} onClick={() => setFilter('ohne_anamnese')} />
          <Stat label="Ohne aktiven Plan" value={zusammenfassung.ohne_aktiven_plan} tone="warn" active={filter === 'ohne_plan'} onClick={() => setFilter('ohne_plan')} />
          <Stat label="Offene Aufnahmen" value={zusammenfassung.offene_aufnahmen} tone="warn" active={filter === 'offene_aufnahme'} onClick={() => setFilter('offene_aufnahme')} />
          <Stat label="Mit aktiven Risiken" value={zusammenfassung.mit_risiken} tone="danger" active={false} onClick={() => setFilter('alle')} />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Kundenname…" />
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Kunde</th><th>PG</th><th>Aufnahme</th><th>Anamnese</th>
              <th>Diagnosen</th><th>Risiken</th><th>Pläne</th><th>Letzter Verlauf</th><th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <EmptyRow colSpan={9}>Laden…</EmptyRow>
              : gefiltert.length === 0
                ? <EmptyRow colSpan={9}>Keine Kunden gefunden</EmptyRow>
                : gefiltert.map(z => (
                  <tr key={z.client_id}>
                    <td style={{ fontWeight: 600 }}>{z.first_name} {z.last_name}</td>
                    <td style={{ fontSize: 13 }}>{z.pflegegrad ?? '—'}</td>
                    <td>
                      <StatusBadge
                        label={statusMeta(PFLEGE_AUFNAHMESTATUS, z.aufnahmestatus ?? 'offen').label}
                        color={statusMeta(PFLEGE_AUFNAHMESTATUS, z.aufnahmestatus ?? 'offen').color}
                      />
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {Number(z.anamnesen_count) === 0
                        ? <span style={{ color: '#E8A000' }}>fehlt</span>
                        : `${z.anamnesen_count} · ${formatDate(z.letzte_anamnese)}`}
                    </td>
                    <td style={{ fontSize: 13 }}>{z.aktive_diagnosen}</td>
                    <td style={{ fontSize: 13, color: Number(z.aktive_risiken) > 0 ? '#D04B3B' : 'var(--ink3)' }}>{z.aktive_risiken}</td>
                    <td style={{ fontSize: 13 }}>
                      {Number(z.aktive_plaene) === 0
                        ? <span style={{ color: '#E8A000' }}>kein aktiver</span>
                        : z.aktive_plaene}
                    </td>
                    <td style={{ fontSize: 13 }}>{z.letzter_verlauf ? formatDate(z.letzter_verlauf) : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link href={`/admin/pflegedoku/aufnahme/${z.client_id}`} style={miniLink}>Aufnahme</Link>
                      <Link href={`/admin/pflegedoku/anamnese/${z.client_id}`} style={miniLink}>Anamnese</Link>
                      <Link href={`/admin/pflegedoku/diagnosen/${z.client_id}`} style={miniLink}>Diagnosen</Link>
                      <Link href={`/admin/pflegedoku/massnahmenplan/${z.client_id}`} style={miniLink}>Plan</Link>
                      <Link href={`/admin/pflegedoku/verlauf/${z.client_id}`} style={miniLink}>Verlauf</Link>
                      <Link href={`/admin/pflegedoku/berichteblatt/${z.client_id}`} style={miniLink}>Berichteblatt</Link>
                      <Link href={`/admin/pflegedoku/perioden/${z.client_id}`} style={miniLink}>Perioden</Link>
                    </td>
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

const miniLink: React.CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', fontWeight: 600, marginRight: 10,
  textDecoration: 'none', whiteSpace: 'nowrap',
}
