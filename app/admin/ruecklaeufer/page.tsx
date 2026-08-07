'use client'
import { useEffect, useState } from 'react'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import Link from 'next/link'

function euro(cents: number) {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  eingegangen: { label: 'Eingegangen', color: '#3b82f6' },
  in_verarbeitung: { label: 'In Verarbeitung', color: '#f59e0b' },
  zugeordnet: { label: 'Zugeordnet', color: '#06b6d4' },
  angenommen: { label: 'Angenommen', color: '#22c55e' },
  angenommen_mit_hinweis: { label: 'Angenom. (Hinweis)', color: '#84cc16' },
  teilweise_abgelehnt: { label: 'Teilw. abgelehnt', color: '#f97316' },
  abgelehnt: { label: 'Abgelehnt', color: '#ef4444' },
  technischer_fehler: { label: 'Techn. Fehler', color: '#ef4444' },
  fachlicher_fehler: { label: 'Fachl. Fehler', color: '#e11d48' },
  duplikat: { label: 'Duplikat', color: '#9ca3af' },
  korrektur_erforderlich: { label: 'Korrektur erf.', color: '#f97316' },
  korrektur_erstellt: { label: 'Korrektur erstellt', color: '#06b6d4' },
  erledigt: { label: 'Erledigt', color: '#6b7280' },
}

const TYP_LABELS: Record<string, string> = {
  quittung: 'Quittung',
  annahmebestaetigung: 'Annahmebestätigung',
  fehlermeldung: 'Fehlermeldung',
  abrechnungsergebnis: 'Abrechnungsergebnis',
  zahlungsavis: 'Zahlungsavis',
  sonstige: 'Sonstige',
}

interface Ruecklaeufer {
  id: string
  lauf_id: string | null
  ruecklaeufer_typ: string
  status: string
  kostentraeger_ik: string | null
  positionen_gesamt: number
  positionen_angenommen: number
  positionen_abgelehnt: number
  betrag_angefordert_cent: number | null
  betrag_anerkannt_cent: number | null
  betrag_differenz_cent: number | null
  quelldatei_name: string | null
  created_at: string
  lauf: { abrechnungsmonat: string; kostentraeger_name: string } | null
}

export default function RuecklaeuferPage() {
  const [items, setItems] = useState<Ruecklaeufer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/billing/dta/ruecklaeufer')
      .then(r => r.json())
      .then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const filtered = items.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search) {
      const s = search.toLowerCase()
      return (r.kostentraeger_ik?.includes(s) || r.quelldatei_name?.toLowerCase().includes(s) ||
        r.lauf?.kostentraeger_name?.toLowerCase().includes(s))
    }
    return true
  })

  const offen = items.filter(r => ['eingegangen', 'in_verarbeitung', 'korrektur_erforderlich'].includes(r.status)).length
  const fehler = items.filter(r => ['technischer_fehler', 'fachlicher_fehler', 'abgelehnt'].includes(r.status)).length

  return (
    <div className="admin-page">
      <h1>Rückläufer</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
        Rückmeldungen von Datenannahmestellen und Kostenträgern.
      </p>

      {offen > 0 && <Banner tone="info">{offen} Rückläufer offen/in Bearbeitung.</Banner>}
      {fehler > 0 && <Banner tone="danger">{fehler} Rückläufer mit Fehlern.</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Suche nach Kostenträger, Datei…" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="admin-select">
          <option value="all">Alle Status</option>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Typ</th>
              <th>Kostenträger</th>
              <th>Lauf</th>
              <th>Status</th>
              <th>Pos.</th>
              <th style={{ textAlign: 'right' }}>Angefordert</th>
              <th style={{ textAlign: 'right' }}>Anerkannt</th>
              <th style={{ textAlign: 'right' }}>Differenz</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10}>Lade…</td></tr>
            ) : filtered.length === 0 ? (
              <EmptyRow colSpan={10}>Keine Rückläufer vorhanden.</EmptyRow>
            ) : filtered.map(r => {
              const sm = STATUS_META[r.status] || { label: r.status, color: '#94a3b8' }
              return (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleDateString('de-DE')}</td>
                  <td>{TYP_LABELS[r.ruecklaeufer_typ] || r.ruecklaeufer_typ}</td>
                  <td>{r.lauf?.kostentraeger_name || r.kostentraeger_ik || '—'}</td>
                  <td>
                    {r.lauf_id ? (
                      <Link href={`/admin/dta/laeufe/${r.lauf_id}`}>{r.lauf?.abrechnungsmonat || '→'}</Link>
                    ) : '—'}
                  </td>
                  <td><StatusBadge label={sm.label} color={sm.color} /></td>
                  <td>{r.positionen_gesamt}</td>
                  <td style={{ textAlign: 'right' }}>{r.betrag_angefordert_cent != null ? euro(r.betrag_angefordert_cent) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{r.betrag_anerkannt_cent != null ? euro(r.betrag_anerkannt_cent) : '—'}</td>
                  <td style={{ textAlign: 'right', color: (r.betrag_differenz_cent ?? 0) > 0 ? '#ef4444' : undefined }}>
                    {r.betrag_differenz_cent != null ? euro(r.betrag_differenz_cent) : '—'}
                  </td>
                  <td>
                    {r.lauf_id && (
                      <Link href={`/admin/dta/laeufe/${r.lauf_id}`} className="admin-btn small">
                        Details
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
