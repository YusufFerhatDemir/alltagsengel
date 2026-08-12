'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  statusMeta, fullName, VERTRAGSSTATUS, QUALIFICATION_LEVEL,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow } from '@/components/admin/OpsUI'

interface Row {
  id: string
  name: string
  vertragsstatus: string
  qualifikationsstufe: string
  wochenstunden_soll: number | null
  einsatzfreigabe: boolean
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

export default function PersonalPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/personal/stammdaten')
        if (!res.ok) { console.error('Fehler beim Laden der Stammdaten'); setLoading(false); return }
        const data = await res.json()
        setRows((data.stammdaten || data || []).map((r: any) => ({
          id: r.id || r.caregiver_id,
          name: r.name || fullName(r),
          vertragsstatus: r.vertragsstatus || 'aktiv',
          qualifikationsstufe: r.qualifikationsstufe || r.qualification_level || '—',
          wochenstunden_soll: r.wochenstunden_soll ?? r.weekly_hours_target ?? null,
          einsatzfreigabe: r.einsatzfreigabe ?? r.deployment_cleared ?? false,
        })))
      } catch (err) {
        console.error('Personal laden fehlgeschlagen', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.vertragsstatus !== filter) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q)
    })
  }, [rows, filter, search])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Personal</h1>
          <p className="admin-subtitle">{rows.length} Mitarbeiter insgesamt</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Name suchen..." />
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--coal2)', color: 'var(--ink)', fontSize: 14,
            fontFamily: "'Jost',sans-serif", cursor: 'pointer',
          }}
        >
          <option value="all">Alle Vertragsstatus</option>
          {Object.entries(VERTRAGSSTATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {loading ? <p>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Vertragsstatus</th>
                <th>Qualifikation</th>
                <th>Wochenstunden-Soll</th>
                <th>Einsatzfreigabe</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={5}>
                  {search || filter !== 'all' ? 'Keine Treffer' : 'Noch keine Mitarbeiter vorhanden'}
                </EmptyRow>
              ) : filtered.map(row => {
                const vs = statusMeta(VERTRAGSSTATUS, row.vertragsstatus)
                const qs = statusMeta(QUALIFICATION_LEVEL, row.qualifikationsstufe)
                return (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>
                      <Link href={`/admin/personal/${row.id}`} style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                        {row.name}
                      </Link>
                    </td>
                    <td><StatusBadge label={vs.label} color={vs.color} /></td>
                    <td><StatusBadge label={qs.label} color={qs.color} /></td>
                    <td>{row.wochenstunden_soll != null ? `${row.wochenstunden_soll} h` : '—'}</td>
                    <td>
                      <span style={{
                        display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                        background: row.einsatzfreigabe ? '#5CB882' : '#D04B3B',
                      }} />
                      <span style={{ marginLeft: 6, fontSize: 13 }}>
                        {row.einsatzfreigabe ? 'Freigegeben' : 'Gesperrt'}
                      </span>
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
