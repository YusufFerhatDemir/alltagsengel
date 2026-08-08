'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  statusMeta, formatDate,
  AUFGABEN_STATUS, AUFGABEN_KATEGORIE, AUFGABEN_PRIORITAET, FAELLIGKEITS_STATUS,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow } from '@/components/admin/OpsUI'

interface AufgabeRow {
  id: string
  titel: string
  beschreibung: string | null
  kategorie: string
  prioritaet: string
  status: string
  verantwortlich_name: string | null
  faellig_am: string | null
  checkliste_total: number
  checkliste_erledigt: number
  faelligkeits_status: string | null
  created_at: string | null
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
  textDecoration: 'none', display: 'inline-block',
}

export default function AufgabenPage() {
  const [rows, setRows] = useState<AufgabeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterKategorie, setFilterKategorie] = useState('all')
  const [filterPrioritaet, setFilterPrioritaet] = useState('all')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/ops/aufgaben')
        if (!res.ok) { setLoading(false); return }
        const data = await res.json()
        setRows(data)
      } catch { /* ignore */ } finally { setLoading(false) }
    }
    load()
  }, [])

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    rows.forEach(r => { m[r.status] = (m[r.status] || 0) + 1 })
    return m
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false
      if (filterKategorie !== 'all' && r.kategorie !== filterKategorie) return false
      if (filterPrioritaet !== 'all' && r.prioritaet !== filterPrioritaet) return false
      if (!q) return true
      return r.titel.toLowerCase().includes(q) ||
        (r.verantwortlich_name || '').toLowerCase().includes(q) ||
        (r.beschreibung || '').toLowerCase().includes(q)
    })
  }, [rows, filterStatus, filterKategorie, filterPrioritaet, search])

  const offenCount = rows.filter(r => r.status === 'offen' || r.status === 'in_bearbeitung').length
  const ueberfaelligCount = rows.filter(r => r.faelligkeits_status === 'ueberfaellig').length

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Aufgaben</h1>
          <p className="admin-subtitle">
            {rows.length} Aufgaben{' '}
            {offenCount > 0 && <>&middot; {offenCount} offen</>}{' '}
            {ueberfaelligCount > 0 && <span style={{ color: '#D04B3B' }}>&middot; {ueberfaelligCount} überfällig</span>}
          </p>
        </div>
        <Link href="/admin/aufgaben/neu" style={primaryBtn}>+ Neue Aufgabe</Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Titel, Verantwortlich..." />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={selectStyle}
        >
          <option value="all">Alle Status ({rows.length})</option>
          {Object.entries(AUFGABEN_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label} ({counts[k] || 0})</option>
          ))}
        </select>

        <select
          value={filterKategorie}
          onChange={e => setFilterKategorie(e.target.value)}
          style={selectStyle}
        >
          <option value="all">Alle Kategorien</option>
          {Object.entries(AUFGABEN_KATEGORIE).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <select
          value={filterPrioritaet}
          onChange={e => setFilterPrioritaet(e.target.value)}
          style={selectStyle}
        >
          <option value="all">Alle Prioritäten</option>
          {Object.entries(AUFGABEN_PRIORITAET).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {loading ? <p>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Titel</th>
                <th>Kategorie</th>
                <th>Priorität</th>
                <th>Status</th>
                <th>Verantwortlich</th>
                <th>Fällig am</th>
                <th>Checkliste</th>
                <th>Fälligkeit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={8}>
                  {search || filterStatus !== 'all' || filterKategorie !== 'all' || filterPrioritaet !== 'all'
                    ? 'Keine Treffer' : 'Noch keine Aufgaben'}
                </EmptyRow>
              ) : filtered.map(r => {
                const kat = statusMeta(AUFGABEN_KATEGORIE, r.kategorie)
                const prio = statusMeta(AUFGABEN_PRIORITAET, r.prioritaet)
                const st = statusMeta(AUFGABEN_STATUS, r.status)
                const faellig = statusMeta(FAELLIGKEITS_STATUS, r.faelligkeits_status)
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/aufgaben/${r.id}`} style={{ color: 'var(--gold)', fontWeight: 600, textDecoration: 'none' }}>
                        {r.titel}
                      </Link>
                    </td>
                    <td><StatusBadge label={kat.label} color={kat.color} /></td>
                    <td><StatusBadge label={prio.label} color={prio.color} /></td>
                    <td><StatusBadge label={st.label} color={st.color} /></td>
                    <td style={{ fontSize: 13 }}>{r.verantwortlich_name || '—'}</td>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(r.faellig_am)}</td>
                    <td style={{ fontSize: 13 }}>
                      {r.checkliste_total > 0
                        ? `${r.checkliste_erledigt}/${r.checkliste_total}`
                        : '—'}
                    </td>
                    <td>
                      {r.faelligkeits_status
                        ? <StatusBadge label={faellig.label} color={faellig.color} />
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal2)', color: 'var(--ink)', fontSize: 13,
  fontFamily: "'Jost',sans-serif", cursor: 'pointer',
}
