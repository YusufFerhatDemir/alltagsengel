'use client'
/**
 * Rückläufer-Dashboard — der Arbeitsvorrat aus abgelehnten und gekürzten
 * Positionen.
 *
 * Die Queue selbst gab es bereits (lib/abrechnung/wiedervorlage.ts, API unter
 * /api/billing/dta/wiedervorlage), aber keine Ansicht: der Arbeitsvorrat war
 * nur per API sichtbar. Diese Seite ist die Liste, auf der ein abgelehnter
 * Betrag nicht verschwinden kann — mit Filter nach Kategorie, Status und
 * Fälligkeit, weil genau danach gearbeitet wird.
 *
 * Statuswechsel folgen der Statusmaschine aus dem Modul: „erledigt“ ist nur
 * nach einer tatsächlichen Wiedereinreichung erreichbar, „verworfen“ nur mit
 * Begründung.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Banner } from '@/components/admin/OpsUI'

type Status = 'offen' | 'in_korrektur' | 'korrigiert' | 'eingereicht' | 'erledigt' | 'verworfen'
type Kategorie = 'verarbeitungsfehler' | 'datenfehler' | 'tarifabweichung' | 'versicherter_unbekannt' | 'unbekannt'

interface Eintrag {
  id: string
  ruecklaeuferId: string
  originalLaufId: string | null
  invoiceId: string | null
  kategorie: Kategorie
  fehlerCode: string | null
  fehlerText: string | null
  status: Status
  betragAngefordertCent: number | null
  betragAnerkanntCent: number | null
  betragOffenCent: number
  korrekturNotiz: string | null
  faelligAm: string | null
  eingereichtAm: string | null
  createdAt: string
  massnahme: string
}

interface Uebersicht {
  gesamt: number
  proStatus: Record<Status, number>
  proKategorie: Record<Kategorie, number>
  offenerBetragCent: number
  ueberfaellig: number
}

const STATUS_LABEL: Record<Status, string> = {
  offen: 'Offen',
  in_korrektur: 'In Korrektur',
  korrigiert: 'Korrigiert',
  eingereicht: 'Eingereicht',
  erledigt: 'Erledigt',
  verworfen: 'Verworfen',
}

const KATEGORIE_LABEL: Record<Kategorie, string> = {
  verarbeitungsfehler: 'Verarbeitung / Technik',
  datenfehler: 'Daten',
  tarifabweichung: 'Tarifabweichung',
  versicherter_unbekannt: 'Versicherter unbekannt',
  unbekannt: 'Unbekannt',
}

/** Nächste sinnvolle Aktion je Status — dieselben Übergänge wie im Modul. */
const NAECHSTER_SCHRITT: Partial<Record<Status, { ziel: Status; label: string }>> = {
  offen: { ziel: 'in_korrektur', label: 'Übernehmen' },
  in_korrektur: { ziel: 'korrigiert', label: 'Als korrigiert markieren' },
  eingereicht: { ziel: 'erledigt', label: 'Als erledigt markieren' },
}

const OFFENE_STATUS: Status[] = ['offen', 'in_korrektur', 'korrigiert']

function euro(cent: number): string {
  return (cent / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function heute(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function WiedervorlagePage() {
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [uebersicht, setUebersicht] = useState<Uebersicht | null>(null)
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)

  const [filterStatus, setFilterStatus] = useState<Status[]>(OFFENE_STATUS)
  const [filterKategorie, setFilterKategorie] = useState<Kategorie | ''>('')
  const [nurUeberfaellig, setNurUeberfaellig] = useState(false)

  const holen = useCallback(async () => {
    setLaden(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus.length > 0) params.set('status', filterStatus.join(','))
      if (filterKategorie) params.set('kategorie', filterKategorie)
      if (nurUeberfaellig) params.set('ueberfaellig', '1')

      const res = await fetch(`/api/billing/dta/wiedervorlage?${params}`)
      const daten = await res.json()
      if (!res.ok) throw new Error(daten.error)
      setEintraege(daten.eintraege ?? [])
      setUebersicht(daten.uebersicht ?? null)
      setFehler(null)
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setLaden(false)
    }
  }, [filterStatus, filterKategorie, nurUeberfaellig])

  useEffect(() => { holen() }, [holen])

  async function statusSetzen(id: string, ziel: Status, verworfenGrund?: string) {
    setMeldung(null)
    const res = await fetch(`/api/billing/dta/wiedervorlage/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: ziel, verworfen_grund: verworfenGrund }),
    })
    const daten = await res.json()
    if (!res.ok) { setFehler(daten.error); return }
    setMeldung(`Eintrag steht jetzt auf „${STATUS_LABEL[ziel]}“.`)
    holen()
  }

  async function einreichen(laufId: string) {
    setMeldung(null)
    const res = await fetch('/api/billing/dta/wiedervorlage/einreichen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ original_lauf_id: laufId }),
    })
    const daten = await res.json()
    if (!res.ok) { setFehler(daten.error); return }
    setMeldung(
      `${daten.eintraege} Position(en) über einen Korrekturlauf eingereicht `
      + `(${euro(daten.betragCent)}).${daten.hinweis ? ` ${daten.hinweis}` : ''}`,
    )
    holen()
  }

  /** Läufe, für die korrigierte Einträge zur Wiedereinreichung bereitstehen. */
  const einreichbareLaeufe = useMemo(() => {
    const map = new Map<string, { anzahl: number; betragCent: number }>()
    for (const e of eintraege) {
      if (e.status !== 'korrigiert' || !e.originalLaufId) continue
      const bisher = map.get(e.originalLaufId) ?? { anzahl: 0, betragCent: 0 }
      map.set(e.originalLaufId, {
        anzahl: bisher.anzahl + 1,
        betragCent: bisher.betragCent + e.betragOffenCent,
      })
    }
    return [...map.entries()]
  }, [eintraege])

  function statusUmschalten(s: Status) {
    setFilterStatus(vorher =>
      vorher.includes(s) ? vorher.filter(x => x !== s) : [...vorher, s],
    )
  }

  return (
    <div className="admin-page">
      <h1>Rückläufer &amp; Wiedervorlagen</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 8 }}>
        Abgelehnte und gekürzte Positionen aus den Rückmeldungen der Kassen. Jede Zeile ist ein Betrag,
        der ohne Korrektur nicht kommt.
      </p>
      <p style={{ marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/admin/kassenabrechnung">← Kassenabrechnung</Link>
        <Link href="/admin/kassenabrechnung/betrieb">→ Betrieb &amp; Fehlerqueue</Link>
        <Link href="/admin/ruecklaeufer">→ Rückläufer verarbeiten</Link>
      </p>

      {fehler && <Banner tone="danger">{fehler}</Banner>}
      {meldung && <Banner tone="success">{meldung}</Banner>}

      {uebersicht && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          <KPI label="Einträge gesamt" wert={String(uebersicht.gesamt)} />
          <KPI label="Offen" wert={String(uebersicht.proStatus.offen + uebersicht.proStatus.in_korrektur + uebersicht.proStatus.korrigiert)} />
          <KPI label="Überfällig" wert={String(uebersicht.ueberfaellig)} farbe={uebersicht.ueberfaellig > 0 ? '#ef4444' : undefined} />
          <KPI label="Offener Betrag" wert={euro(uebersicht.offenerBetragCent)} />
          <KPI label="Eingereicht" wert={String(uebersicht.proStatus.eingereicht)} />
          <KPI label="Erledigt" wert={String(uebersicht.proStatus.erledigt)} />
        </div>
      )}

      <div className="admin-card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>Filter</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {(Object.keys(STATUS_LABEL) as Status[]).map(s => (
            <button
              key={s}
              onClick={() => statusUmschalten(s)}
              style={{
                ...filterBtn,
                borderColor: filterStatus.includes(s) ? 'var(--gold)' : 'var(--border)',
                color: filterStatus.includes(s) ? 'var(--gold)' : 'var(--ink3)',
              }}
            >
              {STATUS_LABEL[s]}
              {uebersicht ? ` (${uebersicht.proStatus[s] ?? 0})` : ''}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 14 }}>
            Kategorie:{' '}
            <select
              value={filterKategorie}
              onChange={e => setFilterKategorie(e.target.value as Kategorie | '')}
              style={{ ...filterBtn, padding: '6px 10px' }}
            >
              <option value="">alle</option>
              {(Object.keys(KATEGORIE_LABEL) as Kategorie[]).map(k => (
                <option key={k} value={k}>
                  {KATEGORIE_LABEL[k]}{uebersicht ? ` (${uebersicht.proKategorie[k] ?? 0})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={nurUeberfaellig} onChange={e => setNurUeberfaellig(e.target.checked)} />
            nur überfällige (Frist vor heute)
          </label>

          <button style={filterBtn} onClick={() => { setFilterStatus(OFFENE_STATUS); setFilterKategorie(''); setNurUeberfaellig(false) }}>
            Zurücksetzen
          </button>
        </div>
      </div>

      {einreichbareLaeufe.length > 0 && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>Zur Wiedereinreichung bereit</h3>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Korrigierte Positionen werden je Original-Lauf über einen Korrekturlauf erneut eingereicht.
          </p>
          {einreichbareLaeufe.map(([laufId, info]) => (
            <div key={laufId} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{laufId.slice(0, 8)}…</span>
              <span>{info.anzahl} Position(en), {euro(info.betragCent)}</span>
              <button style={filterBtn} onClick={() => einreichen(laufId)}>Korrekturlauf erstellen</button>
            </div>
          ))}
        </div>
      )}

      {laden ? <p>Lade…</p> : eintraege.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Keine Einträge für diese Filter.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Fällig</th>
              <th>Kategorie</th>
              <th>Fehler</th>
              <th>Offen</th>
              <th>Status</th>
              <th>Maßnahme</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {eintraege.map(e => {
              const ueberfaellig = !!e.faelligAm && e.faelligAm < heute() && OFFENE_STATUS.includes(e.status)
              const schritt = NAECHSTER_SCHRITT[e.status]
              return (
                <tr key={e.id}>
                  <td style={{ color: ueberfaellig ? '#ef4444' : undefined, fontWeight: ueberfaellig ? 600 : undefined }}>
                    {e.faelligAm ?? '—'}
                    {ueberfaellig && <div style={{ fontSize: 11 }}>überfällig</div>}
                  </td>
                  <td>{KATEGORIE_LABEL[e.kategorie]}</td>
                  <td>
                    {e.fehlerCode ? <code style={{ fontSize: 12 }}>{e.fehlerCode}</code> : '—'}
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{e.fehlerText ?? ''}</div>
                  </td>
                  <td>{euro(e.betragOffenCent)}</td>
                  <td>{STATUS_LABEL[e.status]}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 260 }}>{e.massnahme}</td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {schritt && (
                      <button style={filterBtn} onClick={() => statusSetzen(e.id, schritt.ziel)}>
                        {schritt.label}
                      </button>
                    )}
                    {OFFENE_STATUS.includes(e.status) && (
                      <button
                        style={filterBtn}
                        onClick={() => {
                          const grund = window.prompt('Warum wird diese Forderung nicht weiterverfolgt? (Pflichtangabe)')
                          if (grund?.trim()) statusSetzen(e.id, 'verworfen', grund)
                        }}
                      >
                        Verwerfen
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function KPI({ label, wert, farbe }: { label: string; wert: string; farbe?: string }) {
  return (
    <div className="admin-card" style={{ textAlign: 'center', padding: '12px 8px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: farbe }}>{wert}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
    </div>
  )
}

const filterBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit',
}
