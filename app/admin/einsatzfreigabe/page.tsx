'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { statusMeta, fullName, VERTRAGSSTATUS, WARNSTUFE } from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger'
const log = logger.child('admin:einsatzfreigabe')

interface Row {
  id: string
  name: string
  vertragsstatus: string
  einsatzfreigabe: boolean
  probleme: number
  abgelaufene_qualifikationen: string[]
}

interface AblaufWarning {
  caregiver_id: string
  qualifikation: string
  warnstufe: string
  ablauf_datum: string | null
}

export default function EinsatzfreigabePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [nurProbleme, setNurProbleme] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [resSt, resAbl] = await Promise.all([
          fetch('/api/personal/stammdaten'),
          fetch('/api/personal/qualifikationen/ablauf'),
        ])
        const stamm = resSt.ok ? await resSt.json() : []
        const ablauf = resAbl.ok ? await resAbl.json() : []

        const stammArr: any[] = stamm.stammdaten || stamm || []
        const ablaufArr: AblaufWarning[] = (ablauf.warnungen || ablauf || [])

        // Group ablauf warnings by caregiver
        const problemMap = new Map<string, string[]>()
        for (const w of ablaufArr) {
          if (w.warnstufe === 'abgelaufen' || w.warnstufe === 'kritisch_7') {
            const existing = problemMap.get(w.caregiver_id) || []
            existing.push(w.qualifikation)
            problemMap.set(w.caregiver_id, existing)
          }
        }

        setRows(stammArr.map((r: any) => {
          const cid = r.id || r.caregiver_id
          const probs = problemMap.get(cid) || []
          return {
            id: cid,
            name: r.name || fullName(r),
            vertragsstatus: r.vertragsstatus || 'aktiv',
            einsatzfreigabe: r.einsatzfreigabe ?? r.deployment_cleared ?? false,
            probleme: probs.length,
            abgelaufene_qualifikationen: probs,
          }
        }))
      } catch (err) {
        log.errorWithException('Einsatzfreigabe laden fehlgeschlagen', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function toggleFreigabe(caregiverId: string, current: boolean) {
    setToggling(caregiverId)
    try {
      const res = await fetch(`/api/personal/einsatzfreigabe/${caregiverId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freigabe: !current }),
      })
      if (res.ok) {
        setRows(prev => prev.map(r =>
          r.id === caregiverId ? { ...r, einsatzfreigabe: !current } : r
        ))
      }
    } catch (err) {
      log.errorWithException('Freigabe-Toggle fehlgeschlagen', err)
    } finally {
      setToggling(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (nurProbleme && r.probleme === 0 && r.einsatzfreigabe) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q)
    })
  }, [rows, search, nurProbleme])

  const totalProbleme = rows.filter(r => r.probleme > 0).length

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Einsatzfreigabe</h1>
          <p className="admin-subtitle">{rows.length} Mitarbeiter — {totalProbleme} mit Problemen</p>
        </div>
      </div>

      {totalProbleme > 0 && (
        <Banner tone="warn">
          <strong>{totalProbleme} Mitarbeiter</strong> haben abgelaufene oder kritische Qualifikationen.
        </Banner>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Mitarbeiter suchen..." />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer', color: 'var(--ink)' }}>
          <input
            type="checkbox"
            checked={nurProbleme}
            onChange={e => setNurProbleme(e.target.checked)}
            style={{ accentColor: '#C9963C' }}
          />
          Nur Probleme anzeigen
        </label>
      </div>

      {loading ? <p>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Vertragsstatus</th>
                <th>Einsatzfreigabe</th>
                <th style={{ textAlign: 'right' }}>Probleme</th>
                <th>Abgelaufene Qualifikationen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={5}>
                  {search || nurProbleme ? 'Keine Treffer' : 'Keine Mitarbeiter vorhanden'}
                </EmptyRow>
              ) : filtered.map(row => {
                const vs = statusMeta(VERTRAGSSTATUS, row.vertragsstatus)
                return (
                  <tr key={row.id} style={row.probleme > 0 ? { background: 'rgba(208,75,59,.06)' } : undefined}>
                    <td style={{ fontWeight: 600 }}>
                      <Link href={`/admin/personal/${row.id}`} style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                        {row.name}
                      </Link>
                    </td>
                    <td><StatusBadge label={vs.label} color={vs.color} /></td>
                    <td>
                      <button
                        onClick={() => toggleFreigabe(row.id, row.einsatzfreigabe)}
                        disabled={toggling === row.id}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '4px 12px', borderRadius: 16, border: 'none',
                          cursor: toggling === row.id ? 'wait' : 'pointer',
                          fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                          background: row.einsatzfreigabe ? 'rgba(92,184,130,.15)' : 'rgba(208,75,59,.15)',
                          color: row.einsatzfreigabe ? '#5CB882' : '#D04B3B',
                        }}
                      >
                        <span style={{
                          display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                          background: row.einsatzfreigabe ? '#5CB882' : '#D04B3B',
                        }} />
                        {row.einsatzfreigabe ? 'Freigegeben' : 'Gesperrt'}
                      </button>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {row.probleme > 0 ? (
                        <StatusBadge label={`${row.probleme} Problem${row.probleme > 1 ? 'e' : ''}`} color="#D04B3B" />
                      ) : (
                        <span style={{ color: '#5CB882', fontSize: 13 }}>OK</span>
                      )}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--ink4)' }}>
                      {row.abgelaufene_qualifikationen.length > 0
                        ? row.abgelaufene_qualifikationen.join(', ')
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
