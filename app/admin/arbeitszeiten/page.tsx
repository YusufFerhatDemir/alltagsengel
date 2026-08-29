'use client'
import { useEffect, useMemo, useState } from 'react'
import { formatDate, statusMeta, ARBEITSZEIT_STATUS, MONATSNAMEN } from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import type { PersonalZeitkorrektur } from '@/lib/personal/types'
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
  /**
   * Offene (unquittierte) ArbZG-Verstoesse im Monat. Steht neben Ist- und
   * Sollstunden, weil eine Ueberstunde eine Frage der Abrechnung ist und
   * ein ArbZG-Verstoss eine der Zulaessigkeit — wer nur die Zahl sieht,
   * sieht nicht, ob sie unter Bruch einer Schutzvorschrift zustande kam.
   */
  verstoesse_offen: number
  /** Davon aus der ERFASSTEN Zeit (§ 2 Abs. 1 ArbZG), nicht aus dem Plan. */
  verstoesse_aus_erfassung: number
}

export default function ArbeitszeitenPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const now = new Date()
  const [monat, setMonat] = useState(now.getMonth() + 1)
  const [jahr, setJahr] = useState(now.getFullYear())
  // Das Korrekturprotokoll zu einem Mitarbeiter — die Zahl in der Spalte
  // „Korrigiert" stand bisher fuer sich allein: man sah, DASS korrigiert
  // wurde, aber nicht was, von wem und warum. Ein Revisionsprotokoll, das
  // niemand lesen kann, ist als Nachweis nichts wert.
  const [korrekturFuer, setKorrekturFuer] = useState<Row | null>(null)
  const [korrekturen, setKorrekturen] = useState<PersonalZeitkorrektur[] | null>(null)
  const [korrekturFehler, setKorrekturFehler] = useState('')

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
          verstoesse_offen: r.verstoesse_offen ?? 0,
          verstoesse_aus_erfassung: r.verstoesse_aus_erfassung ?? 0,
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

  async function korrekturenOeffnen(row: Row) {
    setKorrekturFuer(row)
    setKorrekturen(null)
    setKorrekturFehler('')
    try {
      const res = await fetch(`/api/personal/arbeitszeiten/korrekturen?caregiverId=${row.caregiver_id}`)
      const body = await res.json()
      if (!res.ok) { setKorrekturFehler(body.error || 'Korrekturen konnten nicht geladen werden.'); return }
      setKorrekturen(Array.isArray(body) ? body : (body.korrekturen ?? []))
    } catch {
      setKorrekturFehler('Korrekturen konnten nicht geladen werden.')
    }
  }

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
                <th style={{ textAlign: 'right' }}>ArbZG</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={7}>
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
                      <button
                        onClick={() => korrekturenOeffnen(row)}
                        style={{
                          background: 'none', border: 'none', padding: 0,
                          cursor: 'pointer', font: 'inherit',
                        }}
                        aria-label={`Korrekturen von ${row.mitarbeiter} anzeigen`}
                      >
                        <StatusBadge label={`${row.korrigierte_eintraege} Korr.`} color="#E8A000" />
                      </button>
                    ) : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {/* Rot, nicht gelb: ein ArbZG-Verstoss ist keine Auffaelligkeit,
                        sondern ein Bruch einer Schutzvorschrift. Die Herkunft steht
                        dabei, weil sie sagt, WO nachzusehen ist — bei einem
                        Ist-Verstoss steht im Dienstplan nichts Auffaelliges. */}
                    {row.verstoesse_offen > 0 ? (
                      <StatusBadge
                        label={row.verstoesse_aus_erfassung > 0
                          ? `${row.verstoesse_offen} offen · ${row.verstoesse_aus_erfassung} aus Erfassung`
                          : `${row.verstoesse_offen} offen`}
                        color="#D04B3B"
                      />
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {korrekturFuer && (
        <div style={{ marginTop: 20, border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Korrekturprotokoll — {korrekturFuer.mitarbeiter}</h2>
            <button
              onClick={() => { setKorrekturFuer(null); setKorrekturen(null); setKorrekturFehler('') }}
              style={{
                fontSize: 13, color: 'var(--ink3)', background: 'var(--coal2)',
                border: '1px solid var(--border)', borderRadius: 8,
                padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Schließen
            </button>
          </div>
          {/* Ausdrueckliche Ansage statt eines stillen Monatsfilters: das
              Protokoll fuehrt `created_at` — den Zeitpunkt der KORREKTUR,
              nicht den der Arbeit. Eine im September vorgenommene Korrektur
              an einer August-Zeit stuende unter September. Danach zu filtern
              haette also eine andere Frage beantwortet als die Spalte, unter
              der die Liste haengt — und das haette niemand gemerkt. */}
          <p style={{ margin: '4px 0 12px', fontSize: 12, color: 'var(--ink4)' }}>
            Alle Korrekturen dieses Mitarbeiters, jüngste zuerst — nicht auf {MONATSNAMEN[korrekturFuer.monat - 1]} eingegrenzt.
            Das Protokoll führt den Zeitpunkt der Korrektur, nicht den der Arbeit.
          </p>
          {korrekturFehler && <Banner tone="danger">{korrekturFehler}</Banner>}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Korrigiert am</th><th>Feld</th><th>Vorher</th><th>Nachher</th><th>Grund</th></tr>
              </thead>
              <tbody>
                {korrekturen === null
                  ? <EmptyRow colSpan={5}>{korrekturFehler ? '—' : 'Laden…'}</EmptyRow>
                  : korrekturen.length === 0
                    ? <EmptyRow colSpan={5}>Keine Korrekturen protokolliert</EmptyRow>
                    : korrekturen.map(k => (
                      <tr key={k.id}>
                        <td style={{ fontSize: 13 }}>{formatDate(k.created_at)}</td>
                        <td style={{ fontSize: 13, fontWeight: 600 }}>{k.feld}</td>
                        <td style={{ fontSize: 13 }}>{k.alter_wert ?? '—'}</td>
                        <td style={{ fontSize: 13 }}>{k.neuer_wert ?? '—'}</td>
                        <td style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{k.grund}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
