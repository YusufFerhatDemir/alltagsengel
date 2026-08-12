'use client'
import { useEffect, useState } from 'react'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import Link from 'next/link'

const SCHWERE_META: Record<string, { label: string; color: string }> = {
  hinweis: { label: 'Hinweis', color: '#94a3b8' },
  warnung: { label: 'Warnung', color: '#f59e0b' },
  fehler: { label: 'Fehler', color: '#ef4444' },
  kritisch: { label: 'Kritisch', color: '#dc2626' },
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  neu: { label: 'Neu', color: '#3b82f6' },
  in_pruefung: { label: 'In Prüfung', color: '#f59e0b' },
  korrektur_erforderlich: { label: 'Korrektur erf.', color: '#f97316' },
  korrigiert: { label: 'Korrigiert', color: '#06b6d4' },
  erneut_eingereicht: { label: 'Erneut eingereicht', color: '#8b5cf6' },
  erledigt: { label: 'Erledigt', color: '#22c55e' },
  ignoriert: { label: 'Ignoriert', color: '#9ca3af' },
}

const QUELLE_LABELS: Record<string, string> = {
  validierung: 'Validierung',
  export: 'Export',
  verschluesselung: 'Verschlüsselung',
  transport: 'Transport',
  annahmestelle: 'Annahmestelle',
  kostentraeger: 'Kostenträger',
  ruecklaeufer: 'Rückläufer',
  intern: 'Intern',
}

interface Fehler {
  id: string
  lauf_id: string | null
  fehler_quelle: string
  fehler_kategorie: string
  fehler_code: string | null
  fehler_meldung: string
  schweregrad: string
  bearbeitungsstatus: string
  loesung: string | null
  created_at: string
  lauf: { abrechnungsmonat: string; kostentraeger_name: string } | null
}

interface Dashboard {
  gesamt: number
  neu: number
  inPruefung: number
  korrekturErforderlich: number
  erledigt: number
  kritisch: number
}

export default function AbrechnungsfehlerPage() {
  const [fehler, setFehler] = useState<Fehler[]>([])
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [schwereFilter, setSchwereFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [fehlerRes, dashRes] = await Promise.all([
        fetch('/api/billing/dta/fehler'),
        fetch('/api/billing/dta/fehler?view=dashboard'),
      ])
      const fehlerData = await fehlerRes.json()
      const dashData = await dashRes.json()
      setFehler(Array.isArray(fehlerData) ? fehlerData : [])
      setDashboard(dashData)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function updateStatus(fehlerId: string, bearbeitungsstatus: string, loesung?: string) {
    setActionBusy(fehlerId)
    try {
      const res = await fetch('/api/billing/dta/fehler', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fehlerId, bearbeitungsstatus, loesung }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error)
      else await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setActionBusy(null)
    }
  }

  const filtered = fehler.filter(f => {
    if (statusFilter !== 'all' && f.bearbeitungsstatus !== statusFilter) return false
    if (schwereFilter !== 'all' && f.schweregrad !== schwereFilter) return false
    if (search) {
      const s = search.toLowerCase()
      return f.fehler_meldung.toLowerCase().includes(s) ||
        f.fehler_code?.toLowerCase().includes(s) ||
        f.lauf?.kostentraeger_name?.toLowerCase().includes(s)
    }
    return true
  })

  return (
    <div className="admin-page">
      <h1>Abrechnungsfehler</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
        Zentrales Fehlerprotokoll für DTA-Prozesse.
      </p>

      {error && <Banner tone="danger">{error}</Banner>}

      {dashboard && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 24 }}>
          <KPI label="Gesamt" value={dashboard.gesamt} />
          <KPI label="Neu" value={dashboard.neu} color="#3b82f6" />
          <KPI label="In Prüfung" value={dashboard.inPruefung} color="#f59e0b" />
          <KPI label="Korrektur erf." value={dashboard.korrekturErforderlich} color="#f97316" />
          <KPI label="Kritisch" value={dashboard.kritisch} color="#ef4444" />
          <KPI label="Erledigt" value={dashboard.erledigt} color="#22c55e" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Suche in Fehlermeldungen…" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="admin-select">
          <option value="all">Alle Status</option>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={schwereFilter} onChange={e => setSchwereFilter(e.target.value)} className="admin-select">
          <option value="all">Alle Schweregrade</option>
          {Object.entries(SCHWERE_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Schwere</th>
              <th>Quelle</th>
              <th>Code</th>
              <th>Meldung</th>
              <th>Lauf</th>
              <th>Status</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8}>Lade…</td></tr>
            ) : filtered.length === 0 ? (
              <EmptyRow colSpan={8}>Keine Fehler gefunden.</EmptyRow>
            ) : filtered.map(f => {
              const sw = SCHWERE_META[f.schweregrad] || { label: f.schweregrad, color: '#94a3b8' }
              const st = STATUS_META[f.bearbeitungsstatus] || { label: f.bearbeitungsstatus, color: '#94a3b8' }
              const isBusy = actionBusy === f.id
              return (
                <tr key={f.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(f.created_at).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}</td>
                  <td><StatusBadge label={sw.label} color={sw.color} /></td>
                  <td>{QUELLE_LABELS[f.fehler_quelle] || f.fehler_quelle}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{f.fehler_code || '—'}</td>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={f.fehler_meldung}>{f.fehler_meldung}</td>
                  <td>
                    {f.lauf_id ? (
                      <Link href={`/admin/dta/laeufe/${f.lauf_id}`}>{f.lauf?.abrechnungsmonat || '→'}</Link>
                    ) : '—'}
                  </td>
                  <td><StatusBadge label={st.label} color={st.color} /></td>
                  <td>
                    {f.bearbeitungsstatus === 'neu' && (
                      <button className="admin-btn small" disabled={isBusy}
                        onClick={() => updateStatus(f.id, 'in_pruefung')}>Prüfen</button>
                    )}
                    {f.bearbeitungsstatus === 'in_pruefung' && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="admin-btn small" disabled={isBusy}
                          onClick={() => updateStatus(f.id, 'erledigt', 'Geprüft — kein Handlungsbedarf')}>OK</button>
                        <button className="admin-btn small danger" disabled={isBusy}
                          onClick={() => updateStatus(f.id, 'korrektur_erforderlich')}>Korrektur</button>
                      </div>
                    )}
                    {f.bearbeitungsstatus === 'korrektur_erforderlich' && (
                      <Link href="/admin/korrekturlaeufe" className="admin-btn small">
                        Korrektur
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KPI({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="admin-card" style={{ textAlign: 'center', padding: '10px 8px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
    </div>
  )
}
