'use client'
import { useEffect, useState } from 'react'
import { SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'

interface AblaufWarnung {
  qualifikation_id: string
  caregiver_id: string
  caregiver_name: string
  qualifikation: string
  typ: string
  gueltig_bis: string | null
  pflicht: boolean
  einsatzrelevant: boolean
  warnstufe: string
  tage_verbleibend: number | null
  einsatzfreigabe: boolean | null
}

const WARN_FARBEN: Record<string, string> = {
  abgelaufen: '#D04B3B',
  kritisch: '#E8A000',
  warnung: '#C9963C',
  ok: '#5CB882',
}

export default function QualifikationenUebersichtPage() {
  const [warnungen, setWarnungen] = useState<AblaufWarnung[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [suche, setSuche] = useState('')
  const [filterStufe, setFilterStufe] = useState<string>('')

  useEffect(() => { laden() }, [])

  async function laden() {
    setLoading(true)
    try {
      const res = await fetch('/api/personal/qualifikationen/ablauf')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setWarnungen(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const gefiltert = warnungen.filter(w => {
    if (suche) {
      const s = suche.toLowerCase()
      if (!w.caregiver_name?.toLowerCase().includes(s) && !w.qualifikation?.toLowerCase().includes(s)) return false
    }
    if (filterStufe && w.warnstufe !== filterStufe) return false
    return true
  })

  const abgelaufen = warnungen.filter(w => w.warnstufe === 'abgelaufen').length
  const kritisch = warnungen.filter(w => w.warnstufe === 'kritisch').length

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Qualifikationen &mdash; Ablaufkontrolle</h1>
      <p style={{ color: '#888', marginBottom: 20 }}>
        Alle einsatzrelevanten und Pflichtqualifikationen mit Ablaufdatum.
      </p>

      {abgelaufen > 0 && (
        <Banner tone="danger">
          {abgelaufen} Qualifikation(en) abgelaufen &mdash; betroffene Mitarbeiter sind nicht einsatzbereit.
        </Banner>
      )}
      {kritisch > 0 && (
        <Banner tone="warn">
          {kritisch} Qualifikation(en) laufen in den n&auml;chsten 30 Tagen ab.
        </Banner>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchInput value={suche} onChange={setSuche} placeholder="Mitarbeiter oder Qualifikation suchen..." />
        <select
          value={filterStufe}
          onChange={e => setFilterStufe(e.target.value)}
          style={{ fontSize: 14, padding: '6px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fff' }}
        >
          <option value="">Alle Warnstufen</option>
          <option value="abgelaufen">Abgelaufen</option>
          <option value="kritisch">Kritisch (&lt; 30 Tage)</option>
          <option value="warnung">Warnung (&lt; 90 Tage)</option>
          <option value="ok">OK</option>
        </select>
      </div>

      {error && <p style={{ color: '#D04B3B' }}>{error}</p>}
      {loading ? (
        <p>Lade Qualifikationen...</p>
      ) : gefiltert.length === 0 ? (
        <EmptyRow colSpan={8}>Keine Eintr&auml;ge gefunden.</EmptyRow>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left', fontSize: 13 }}>
              <th style={{ padding: '8px 12px' }}>Mitarbeiter</th>
              <th style={{ padding: '8px 12px' }}>Qualifikation</th>
              <th style={{ padding: '8px 12px' }}>Typ</th>
              <th style={{ padding: '8px 12px' }}>G&uuml;ltig bis</th>
              <th style={{ padding: '8px 12px' }}>Status</th>
              <th style={{ padding: '8px 12px' }}>Tage</th>
              <th style={{ padding: '8px 12px' }}>Pflicht</th>
              <th style={{ padding: '8px 12px' }}>Freigabe</th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.map(w => (
              <tr key={w.qualifikation_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '8px 12px', fontSize: 14 }}>{w.caregiver_name}</td>
                <td style={{ padding: '8px 12px', fontSize: 14 }}>{w.qualifikation}</td>
                <td style={{ padding: '8px 12px', fontSize: 13, color: '#888' }}>{w.typ}</td>
                <td style={{ padding: '8px 12px', fontSize: 14 }}>
                  {w.gueltig_bis ? new Date(w.gueltig_bis).toLocaleDateString('de-DE') : '–'}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                    color: '#fff', background: WARN_FARBEN[w.warnstufe] || '#999',
                  }}>
                    {w.warnstufe === 'abgelaufen' ? 'Abgelaufen' :
                     w.warnstufe === 'kritisch' ? 'Kritisch' :
                     w.warnstufe === 'warnung' ? 'Warnung' : 'OK'}
                  </span>
                </td>
                <td style={{ padding: '8px 12px', fontSize: 14, textAlign: 'right' }}>
                  {w.tage_verbleibend !== null ? w.tage_verbleibend : '–'}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 14 }}>
                  {w.pflicht ? 'Ja' : '–'}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 14 }}>
                  {w.einsatzfreigabe ? '✅' : '❌'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
