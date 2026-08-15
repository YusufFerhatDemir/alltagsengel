'use client'
import { useEffect, useMemo, useState } from 'react'
import { formatDate } from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'

// ═══════════════════════════════════════════════════════════════
// Fristen-Dashboard — Zentrale Fristenübersicht für PDL/Admin
// ═══════════════════════════════════════════════════════════════

interface FristRow {
  id: string
  typ: string
  titel: string
  beschreibung: string
  bezug: string
  faellig_am: string
  tage_verbleibend: number
  dringlichkeit: 'ueberfaellig' | 'kritisch' | 'warnung' | 'ok'
  quelle: string
}

interface Zusammenfassung {
  ueberfaellig: number
  kritisch: number
  warnung: number
  ok: number
  gesamt: number
}

const DRINGLICHKEIT_META: Record<string, { label: string; color: string; dotColor: string }> = {
  ueberfaellig: { label: 'Ueberfaellig', color: '#D04B3B', dotColor: '#D04B3B' },
  kritisch: { label: 'Kritisch', color: '#E8A000', dotColor: '#E8A000' },
  warnung: { label: 'Warnung', color: '#C9963C', dotColor: '#C9963C' },
  ok: { label: 'OK', color: '#5CB882', dotColor: '#5CB882' },
}

const QUELLE_OPTIONS = ['Alle', 'Qualifikationen', 'Verordnungen', 'Schulungen', 'Dokumente', 'Abrechnung']
const DRINGLICHKEIT_OPTIONS = ['alle', 'ueberfaellig', 'kritisch', 'warnung', 'ok']

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal2)', color: 'var(--ink)', fontSize: 13,
  fontFamily: "'Jost',sans-serif", cursor: 'pointer',
}

function verbleibenLabel(tage: number): string {
  if (tage < 0) return `${Math.abs(tage)} Tage ueberfaellig`
  if (tage === 0) return 'Heute faellig'
  if (tage === 1) return 'Morgen'
  return `${tage} Tage`
}

export default function FristenDashboardPage() {
  const [fristen, setFristen] = useState<FristRow[]>([])
  const [zusammenfassung, setZusammenfassung] = useState<Zusammenfassung>({
    ueberfaellig: 0, kritisch: 0, warnung: 0, ok: 0, gesamt: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warnungen, setWarnungen] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [filterDringlichkeit, setFilterDringlichkeit] = useState('alle')
  const [filterQuelle, setFilterQuelle] = useState('Alle')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/fristen')
        if (!res.ok) {
          setError(`Fehler beim Laden (HTTP ${res.status})`)
          setLoading(false)
          return
        }
        const data = await res.json()
        setFristen(data.fristen || [])
        setZusammenfassung(data.zusammenfassung || { ueberfaellig: 0, kritisch: 0, warnung: 0, ok: 0, gesamt: 0 })
        if (data.warnungen) setWarnungen(data.warnungen)
      } catch {
        setError('Netzwerkfehler beim Laden der Fristen')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return fristen.filter(f => {
      if (filterDringlichkeit !== 'alle' && f.dringlichkeit !== filterDringlichkeit) return false
      if (filterQuelle !== 'Alle' && f.quelle !== filterQuelle) return false
      if (!q) return true
      return f.titel.toLowerCase().includes(q) ||
        f.bezug.toLowerCase().includes(q) ||
        f.typ.toLowerCase().includes(q) ||
        f.beschreibung.toLowerCase().includes(q)
    })
  }, [fristen, filterDringlichkeit, filterQuelle, search])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Fristen-Dashboard</h1>
          <p className="admin-subtitle">
            Zentrale Uebersicht aller ablaufenden Fristen, Qualifikationen und Dokumente
          </p>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {warnungen.length > 0 && (
        <Banner tone="warn">
          <strong>Hinweis:</strong> Einige Quellen konnten nicht geladen werden: {warnungen.join(', ')}
        </Banner>
      )}

      {/* ── Zusammenfassungskarten ─────────────────────────────── */}
      <div className="admin-stats-grid" style={{ marginBottom: 20 }}>
        <StatCard
          label="Ueberfaellig"
          count={zusammenfassung.ueberfaellig}
          color="#D04B3B"
          active={filterDringlichkeit === 'ueberfaellig'}
          onClick={() => setFilterDringlichkeit(filterDringlichkeit === 'ueberfaellig' ? 'alle' : 'ueberfaellig')}
        />
        <StatCard
          label="Kritisch"
          sublabel="< 14 Tage"
          count={zusammenfassung.kritisch}
          color="#E8A000"
          active={filterDringlichkeit === 'kritisch'}
          onClick={() => setFilterDringlichkeit(filterDringlichkeit === 'kritisch' ? 'alle' : 'kritisch')}
        />
        <StatCard
          label="Warnung"
          sublabel="< 30 Tage"
          count={zusammenfassung.warnung}
          color="#C9963C"
          active={filterDringlichkeit === 'warnung'}
          onClick={() => setFilterDringlichkeit(filterDringlichkeit === 'warnung' ? 'alle' : 'warnung')}
        />
        <StatCard
          label="Gesamt"
          count={zusammenfassung.gesamt}
          color="var(--ink3)"
          active={filterDringlichkeit === 'alle'}
          onClick={() => setFilterDringlichkeit('alle')}
        />
      </div>

      {/* ── Filter ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Titel, Bezug, Typ durchsuchen..." />
        <select value={filterQuelle} onChange={e => setFilterQuelle(e.target.value)} style={selectStyle}>
          {QUELLE_OPTIONS.map(q => (
            <option key={q} value={q}>{q === 'Alle' ? 'Alle Quellen' : q}</option>
          ))}
        </select>
        <select value={filterDringlichkeit} onChange={e => setFilterDringlichkeit(e.target.value)} style={selectStyle}>
          {DRINGLICHKEIT_OPTIONS.map(d => (
            <option key={d} value={d}>
              {d === 'alle' ? 'Alle Dringlichkeiten' : DRINGLICHKEIT_META[d]?.label || d}
            </option>
          ))}
        </select>
      </div>

      {/* ── Tabelle ─────────────────────────────────────────────── */}
      {loading ? (
        <p style={{ color: 'var(--ink3)', padding: 24 }}>Laden...</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>Status</th>
                <th>Frist</th>
                <th>Verbleibend</th>
                <th>Typ</th>
                <th>Titel</th>
                <th>Bezug</th>
                <th>Quelle</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={7}>
                  {search || filterDringlichkeit !== 'alle' || filterQuelle !== 'Alle'
                    ? 'Keine Fristen fuer diesen Filter'
                    : 'Keine ablaufenden Fristen vorhanden'}
                </EmptyRow>
              ) : filtered.map(f => {
                const meta = DRINGLICHKEIT_META[f.dringlichkeit] || DRINGLICHKEIT_META.ok
                return (
                  <tr key={f.id}>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: meta.dotColor,
                        }}
                        title={meta.label}
                      />
                    </td>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {formatDate(f.faellig_am)}
                    </td>
                    <td>
                      <span style={{
                        fontSize: 13,
                        fontWeight: f.dringlichkeit === 'ueberfaellig' || f.dringlichkeit === 'kritisch' ? 600 : 400,
                        color: meta.color,
                      }}>
                        {verbleibenLabel(f.tage_verbleibend)}
                      </span>
                    </td>
                    <td>
                      <StatusBadge label={f.typ} color={typColor(f.typ)} />
                    </td>
                    <td style={{ fontWeight: 600, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.titel}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {f.bezug}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink4)' }}>
                      {f.quelle}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--ink5)', marginTop: 12, textAlign: 'right' }}>
          {filtered.length} von {fristen.length} Fristen angezeigt
        </p>
      )}
    </div>
  )
}

// ── Zusammenfassungskarte ────────────────────────────────────────

function StatCard({ label, sublabel, count, color, active, onClick }: {
  label: string
  sublabel?: string
  count: number
  color: string
  active: boolean
  onClick: () => void
}) {
  return (
    <div
      className="admin-stat-card"
      onClick={onClick}
      style={{
        cursor: 'pointer',
        border: active ? `2px solid ${color}` : '1px solid var(--border)',
        borderRadius: 14,
        padding: '16px 20px',
        background: active ? `${color}11` : 'var(--coal2)',
        transition: 'border-color .15s, background .15s',
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: "'Cormorant Garamond',serif" }}>
        {count}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)', marginTop: 2 }}>
        {label}
      </div>
      {sublabel && (
        <div style={{ fontSize: 11, color: 'var(--ink5)', marginTop: 2 }}>
          {sublabel}
        </div>
      )}
    </div>
  )
}

// ── Typ-Farben ───────────────────────────────────────────────────

function typColor(typ: string): string {
  switch (typ) {
    case 'Qualifikation': return '#26A69A'
    case 'Verordnung': return '#7E57C2'
    case 'Genehmigung': return '#5CB882'
    case 'Schulung': return '#2196F3'
    case 'Dokument': return '#C9963C'
    case 'Abrechnungsfrist': return '#E8A000'
    default: return '#999'
  }
}
