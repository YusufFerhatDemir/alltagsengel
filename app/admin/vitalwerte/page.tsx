'use client'
// ═══════════════════════════════════════════════════════════════
// Vitalwerte-Übersicht — aktive Alarme + Klientenliste
// Klienten kommen aus /api/pflege/uebersicht (bestehende View),
// Alarme aus /api/vitals/alarme (jüngste Messung je Klient & Typ).
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Banner, SearchInput, StatusBadge } from '@/components/admin/OpsUI'
import { pflegeSecondaryBtn } from '@/components/admin/PflegeUI'
import { VITAL_TYPEN, type VitalTyp } from '@/lib/vitals/types'
import type { KlientenAlarm } from '@/lib/vitals/vitals'
import type { PflegeUebersichtZeile } from '@/lib/pflege/types'

const STUFEN_FARBE = { warnung: '#E8A000', kritisch: '#D04B3B' }

export default function AdminVitalwertePage() {
  const [klienten, setKlienten] = useState<PflegeUebersichtZeile[]>([])
  const [alarme, setAlarme] = useState<KlientenAlarm[]>([])
  const [alarmeAktiv, setAlarmeAktiv] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/pflege/uebersicht').then(r => r.json()),
      fetch('/api/vitals/alarme').then(r => r.json()),
    ])
      .then(([kBody, aBody]) => {
        if (kBody.error) { setError(kBody.error); return }
        if (aBody.error) { setError(aBody.error); return }
        setKlienten(kBody.uebersicht || [])
        setAlarme(aBody.alarme || [])
        setAlarmeAktiv(Boolean(aBody.alarmeAktiv))
      })
      .catch(() => setError('Laden fehlgeschlagen.'))
      .finally(() => setLoading(false))
  }, [])

  const alarmeJeKlient = useMemo(() => {
    const map = new Map<string, KlientenAlarm[]>()
    for (const a of alarme) {
      const liste = map.get(a.client_id) ?? []
      liste.push(a)
      map.set(a.client_id, liste)
    }
    return map
  }, [alarme])

  const gefiltert = useMemo(() => {
    const suche = search.trim().toLowerCase()
    return klienten.filter(k =>
      !suche || `${k.first_name ?? ''} ${k.last_name ?? ''}`.toLowerCase().includes(suche))
  }, [klienten, search])

  const kritische = alarme.filter(a => a.bewertung.stufe === 'kritisch')

  if (loading) return <div className="admin-page"><p style={{ color: 'var(--muted)' }}>Laden…</p></div>

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Vitalwerte</h1>
          <p className="admin-subtitle">
            {klienten.length} Klienten · {alarmeAktiv
              ? `${alarme.length} aktive Alarme (${kritische.length} kritisch)`
              : 'Dokumentation & Verlauf'}
          </p>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {!alarmeAktiv && (
        <Banner tone="info">
          Die automatische <strong>Grenzwert-Alarmfunktion ist deaktiviert</strong> (regulatorische
          Medizinprodukt-Prüfung ausstehend). Vitalwerte werden erfasst und als Verlauf dargestellt;
          es findet keine automatische klinische Bewertung statt.
        </Banner>
      )}

      {alarmeAktiv && kritische.length > 0 && (
        <Banner tone="danger">
          <strong>{kritische.length} kritische{kritische.length === 1 ? 'r' : ''} Alarm{kritische.length === 1 ? '' : 'e'}:</strong>{' '}
          {kritische.slice(0, 3).map(a => a.bewertung.meldungen[0]).join(' · ')}
          {kritische.length > 3 ? ` · +${kritische.length - 3} weitere` : ''}
        </Banner>
      )}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Klient suchen…" />
      </div>

      {gefiltert.length === 0 && (
        <p style={{ color: 'var(--muted)', padding: 24, textAlign: 'center' }}>Keine Klienten gefunden</p>
      )}

      {gefiltert.map(k => {
        const klientAlarme = alarmeJeKlient.get(k.client_id) ?? []
        return (
          <div key={k.client_id} style={{
            background: 'var(--coal2)',
            border: `1px solid ${klientAlarme.some(a => a.bewertung.stufe === 'kritisch') ? 'rgba(208,75,59,.45)' : 'var(--border)'}`,
            borderRadius: 12, padding: 14, marginBottom: 10,
            display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
          }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 600 }}>{k.first_name} {k.last_name}</div>
              {alarmeAktiv && klientAlarme.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {klientAlarme.map((a, i) => (
                    <StatusBadge
                      key={i}
                      label={`${VITAL_TYPEN[a.type as VitalTyp]?.label ?? a.type}: ${a.bewertung.stufe}`}
                      color={STUFEN_FARBE[a.bewertung.stufe as 'warnung' | 'kritisch'] ?? 'var(--border)'}
                    />
                  ))}
                </div>
              )}
              {alarmeAktiv && klientAlarme.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--ink5)', marginTop: 4 }}>Keine aktiven Alarme</div>
              )}
            </div>
            <Link href={`/admin/vitalwerte/${k.client_id}`} style={pflegeSecondaryBtn}>Vitalwerte →</Link>
          </div>
        )
      })}
    </div>
  )
}
