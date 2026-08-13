'use client'
import { datumBerlin } from '@/lib/utils/timezone';
import { useCallback, useEffect, useState } from 'react'

interface KpiDashboard {
  zeitraum: { von: string; bis: string }
  umsatz: { summeEuro: number; anzahlRechnungen: number }
  auslastung: { aktiveCaregiver: number; eingesetzteCaregiver: number; quoteProzent: number | null }
  ablehnungsquote: { gesamtBuchungen: number; abgelehnt: number; quoteProzent: number | null }
  pflegequalitaet: { datenquelle: 'zufriedenheitsanrufe' | 'keine_daten'; durchschnittsbewertung: number | null; anzahlBewertungen: number }
}

function euro(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function aktuellerMonatVon(): string {
  const d = new Date()
  return datumBerlin(new Date(d.getFullYear(), d.getMonth(), 1))
}
function aktuellerMonatBis(): string {
  const d = new Date()
  return datumBerlin(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

export default function AdminKpiDashboardPage() {
  const [von, setVon] = useState(aktuellerMonatVon())
  const [bis, setBis] = useState(aktuellerMonatBis())
  const [data, setData] = useState<KpiDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/analytics/kpi?von=${von}&bis=${bis}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Unbekannter Fehler'); setData(null); return }
      setData(json)
    } catch (err: any) {
      setError(err.message || 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [von, bis])

  useEffect(() => { load() }, [load])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>KPI-Dashboard</h1>
          <p className="admin-subtitle">Echtzeit-Kennzahlen — Umsatz, Auslastung, Ablehnungsquote, Pflegequalität</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginBottom: 20 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink3)' }}>
          Von
          <input type="date" value={von} onChange={e => setVon(e.target.value)} style={dateInput} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink3)' }}>
          Bis
          <input type="date" value={bis} onChange={e => setBis(e.target.value)} style={dateInput} />
        </label>
        <button onClick={load} disabled={loading} style={refreshBtn}>{loading ? 'Lädt…' : 'Aktualisieren'}</button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(208,75,59,0.1)', border: '1px solid rgba(208,75,59,0.3)', color: '#D04B3B', marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && !data ? <p>Laden…</p> : data && (
        <div className="admin-stats-grid">
          <div className="admin-stat-card gold">
            <div className="admin-stat-value">{euro(data.umsatz.summeEuro)}</div>
            <div className="admin-stat-label">Umsatz ({data.umsatz.anzahlRechnungen} Rechnungen)</div>
          </div>
          <div className="admin-stat-card accent">
            <div className="admin-stat-value">{data.auslastung.quoteProzent != null ? `${data.auslastung.quoteProzent}%` : '—'}</div>
            <div className="admin-stat-label">Auslastung ({data.auslastung.eingesetzteCaregiver}/{data.auslastung.aktiveCaregiver} Kräfte im Einsatz)</div>
          </div>
          <div className="admin-stat-card" style={{ borderLeft: (data.ablehnungsquote.quoteProzent || 0) > 20 ? '3px solid #D04B3B' : undefined }}>
            <div className="admin-stat-value">{data.ablehnungsquote.quoteProzent != null ? `${data.ablehnungsquote.quoteProzent}%` : '—'}</div>
            <div className="admin-stat-label">Ablehnungsquote ({data.ablehnungsquote.abgelehnt}/{data.ablehnungsquote.gesamtBuchungen} Buchungen)</div>
          </div>
          <div className="admin-stat-card success">
            <div className="admin-stat-value">
              {data.pflegequalitaet.datenquelle === 'zufriedenheitsanrufe' && data.pflegequalitaet.durchschnittsbewertung != null
                ? `${data.pflegequalitaet.durchschnittsbewertung.toFixed(2)} / 5`
                : '— (keine Datenquelle)'}
            </div>
            <div className="admin-stat-label">
              Pflegequalität {data.pflegequalitaet.datenquelle === 'zufriedenheitsanrufe' ? `(Ø aus ${data.pflegequalitaet.anzahlBewertungen} Zufriedenheitsanrufen)` : '— keine Datenquelle konfiguriert'}
            </div>
          </div>
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 24 }}>
        Umsatz = Summe der Rechnungen (created_at) im Zeitraum · Auslastung = aktive Kräfte mit laufender Einsatzzuweisung ·
        Ablehnungsquote = abgelehnte / gesamt gestellte Buchungsanfragen (created_at) · Pflegequalität = Ø-Bewertung aus dokumentierten Zufriedenheitsanrufen.
      </p>
    </div>
  )
}

const dateInput: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal2)', color: 'var(--ink)', fontSize: 13, fontFamily: "'Jost',sans-serif",
}
const refreshBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
