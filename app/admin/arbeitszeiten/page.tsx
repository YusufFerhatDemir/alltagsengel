'use client'
import { useEffect, useMemo, useState } from 'react'
import { statusMeta, ARBEITSZEIT_STATUS, MONATSNAMEN } from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger'
const log = logger.child('admin:arbeitszeiten')

interface Row {
  id: string
  caregiver_id: string
  mitarbeiter: string
  monat: number
  jahr: number
  ist_stunden: number
  soll_stunden: number
  ueberstunden: number
  korrigierte_eintraege: number
}

export default function ArbeitszeitenPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const now = new Date()
  const [monat, setMonat] = useState(now.getMonth() + 1)
  const [jahr, setJahr] = useState(now.getFullYear())

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/personal/arbeitszeiten/konto?monat=${monat}&jahr=${jahr}`)
        if (!res.ok) { log.error('Fehler beim Laden der Arbeitszeiten'); setLoading(false); return }
        const data = await res.json()
        setRows((data.konten || data || []).map((r: any) => ({
          id: r.id || `${r.caregiver_id}-${r.monat}-${r.jahr}`,
          caregiver_id: r.caregiver_id,
          mitarbeiter: r.caregiver_name || '—',
          monat: r.monat || monat,
          jahr: r.jahr || jahr,
          // Werte kommen als Minuten aus der DB — fuer die Anzeige in Stunden umrechnen.
          ist_stunden: (r.ist_minuten_gesamt ?? 0) / 60,
          soll_stunden: (r.soll_minuten_gesamt ?? 0) / 60,
          ueberstunden: (r.ueberstunden_gesamt ?? 0) / 60,
          korrigierte_eintraege: r.korrigierte_eintraege ?? 0,
        })))
      } catch (err) {
        log.errorWithException('Arbeitszeiten laden fehlgeschlagen', err)
      } finally {
        setLoading(false)
      }
    }
    setLoading(true)
    load()
  }, [monat, jahr])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.mitarbeiter.toLowerCase().includes(q))
  }, [rows, search])

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Arbeitszeitkonto</h1>
          <p className="admin-subtitle">{MONATSNAMEN[monat - 1]} {jahr} — {rows.length} Mitarbeiter</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Mitarbeiter suchen..." />
        <select
          value={monat}
          onChange={e => setMonat(Number(e.target.value))}
          style={{
            padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--coal2)', color: 'var(--ink)', fontSize: 14,
            fontFamily: "'Jost',sans-serif", cursor: 'pointer',
          }}
        >
          {MONATSNAMEN.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={jahr}
          onChange={e => setJahr(Number(e.target.value))}
          style={{
            padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--coal2)', color: 'var(--ink)', fontSize: 14,
            fontFamily: "'Jost',sans-serif", cursor: 'pointer',
          }}
        >
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {loading ? <p>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Monat / Jahr</th>
                <th style={{ textAlign: 'right' }}>Ist-Stunden</th>
                <th style={{ textAlign: 'right' }}>Soll-Stunden</th>
                <th style={{ textAlign: 'right' }}>Überstunden</th>
                <th style={{ textAlign: 'right' }}>Korrigiert</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={6}>
                  {search ? 'Keine Treffer' : 'Keine Arbeitszeitdaten vorhanden'}
                </EmptyRow>
              ) : filtered.map(row => (
                <tr key={row.id}>
                  <td style={{ fontWeight: 600 }}>{row.mitarbeiter}</td>
                  <td>{MONATSNAMEN[row.monat - 1]} {row.jahr}</td>
                  <td style={{ textAlign: 'right' }}>{row.ist_stunden.toFixed(1)} h</td>
                  <td style={{ textAlign: 'right' }}>{row.soll_stunden.toFixed(1)} h</td>
                  <td style={{
                    textAlign: 'right', fontWeight: 600,
                    color: row.ueberstunden > 0 ? '#E8A000' : row.ueberstunden < 0 ? '#D04B3B' : 'var(--ink)',
                  }}>
                    {row.ueberstunden > 0 ? '+' : ''}{row.ueberstunden.toFixed(1)} h
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {row.korrigierte_eintraege > 0 ? (
                      <StatusBadge label={`${row.korrigierte_eintraege} Korr.`} color="#E8A000" />
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
