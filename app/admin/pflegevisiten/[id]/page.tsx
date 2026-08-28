'use client'
// ═══════════════════════════════════════════════════════════════
// Pflegevisite — Checkliste, Auswertung, Abschluss
//
// Die Checkliste zeigt ALLE Prüfpunkte, auch die noch nicht bewerteten.
// Das ist der Unterschied zwischen einer Prüfung und einer Notizsammlung:
// wer nur aufschreibt, was auffällt, kann nicht sagen, was er geprüft hat.
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { formatDate } from '@/lib/admin/ops'
import { Banner, StatusBadge } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, Karte, FeldRaster, TextBereich,
  pflegePrimaryBtn, pflegeSecondaryBtn, pflegeMiniBtn,
} from '@/components/admin/PflegeUI'
import {
  ABWEICHENDE_BEWERTUNGEN,
  BEFUNDBEWERTUNG_WERTE,
  GESAMTBEWERTUNG_BEZEICHNUNG,
  GESAMTBEWERTUNG_WERTE,
  PRUEFPUNKT_BEZEICHNUNG,
  PRUEFPUNKT_WERTE,
  type Befundbewertung,
  type Gesamtbewertung,
  type Pruefpunkt,
  type QmPflegevisite,
  type QmVisiteBefund,
} from '@/lib/qm/types'

const BEWERTUNG_LABEL: Record<Befundbewertung, string> = {
  erfuellt:           'erfüllt',
  teilweise_erfuellt: 'teilweise erfüllt',
  nicht_erfuellt:     'nicht erfüllt',
  nicht_anwendbar:    'nicht anwendbar',
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  geplant:       { label: 'Geplant',       color: '#64748b' },
  durchgefuehrt: { label: 'Durchgeführt',  color: '#0284c7' },
  ausgewertet:   { label: 'Ausgewertet',   color: '#7c3aed' },
  abgeschlossen: { label: 'Abgeschlossen', color: '#16a34a' },
  abgesagt:      { label: 'Abgesagt',      color: '#a1a1aa' },
}

export default function PflegevisiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('')
  const [visite, setVisite] = useState<QmPflegevisite | null>(null)
  const [befunde, setBefunde] = useState<QmVisiteBefund[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hinweis, setHinweis] = useState('')

  const [urteil, setUrteil] = useState<Gesamtbewertung>('ohne_beanstandung')
  const [zusammenfassung, setZusammenfassung] = useState('')

  useEffect(() => { params.then(p => setId(p.id)) }, [params])

  async function laden(visiteId: string) {
    const res = await fetch(`/api/qm/pflegevisiten/${visiteId}`).then(r => r.json())
    if (res.error) { setError(res.error); return }
    setVisite(res.visite)
    setBefunde(res.befunde || [])
    if (res.visite?.gesamtbewertung) setUrteil(res.visite.gesamtbewertung)
    if (res.visite?.zusammenfassung) setZusammenfassung(res.visite.zusammenfassung)
  }

  useEffect(() => {
    if (!id) return
    laden(id).catch(() => setError('Laden fehlgeschlagen.')).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const befundJePunkt = useMemo(() => {
    const map = new Map<string, QmVisiteBefund>()
    for (const b of befunde) map.set(b.pruefpunkt, b)
    return map
  }, [befunde])

  const offen = visite?.status !== 'abgeschlossen' && visite?.status !== 'abgesagt'

  const abweichungenOhneAbstellung = useMemo(
    () => befunde.filter(
      b => ABWEICHENDE_BEWERTUNGEN.includes(b.bewertung) && (!b.empfehlung?.trim() || !b.frist),
    ),
    [befunde],
  )

  async function aktion(koerper: Record<string, unknown>) {
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch(`/api/qm/pflegevisiten/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(koerper),
      })
      const body = await res.json()
      if (body.error) { setError(body.error); return }
      await laden(id)
      setHinweis('Gespeichert.')
    } catch {
      setError('Speichern fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="admin-page">Lade…</div>
  if (!visite) {
    return (
      <div className="admin-page">
        <Banner tone="danger">{error || 'Pflegevisite nicht gefunden.'}</Banner>
        <Link href="/admin/pflegevisiten">← Zurück zur Übersicht</Link>
      </div>
    )
  }

  const meta = STATUS_LABEL[visite.status] ?? { label: visite.status, color: '#64748b' }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Pflegevisite</h1>
          <p className="admin-subtitle">
            Geplant {formatDate(visite.geplant_am)}
            {visite.durchgefuehrt_am ? ` · durchgeführt ${formatDate(visite.durchgefuehrt_am)}` : ''}
            {' · '}<StatusBadge label={meta.label} color={meta.color} />
          </p>
        </div>
        <Link href="/admin/pflegevisiten" style={{ textDecoration: 'none' }}>← Übersicht</Link>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {hinweis && <Banner tone="success">{hinweis}</Banner>}

      {!offen && (
        <Banner tone="info">
          Diese Visite ist {visite.status === 'abgesagt' ? 'abgesagt' : 'abgeschlossen'} und damit
          unveränderlich. Nachtragbar bleibt nur die Erledigung eines Befundes — für eine erneute
          Prüfung ist eine Nachvisite vorgesehen.
        </Banner>
      )}

      <Karte titel="Checkliste">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '28%' }}>Prüfpunkt</th>
              <th style={{ width: '14%' }}>Bewertung</th>
              <th>Feststellung</th>
              <th>Empfehlung</th>
              <th style={{ width: '12%' }}>Frist</th>
            </tr>
          </thead>
          <tbody>
            {PRUEFPUNKT_WERTE.map(punkt => (
              <BefundZeile
                key={punkt}
                punkt={punkt}
                befund={befundJePunkt.get(punkt)}
                visiteId={id}
                bearbeitbar={!!offen && !busy}
                onGespeichert={() => laden(id)}
                onFehler={setError}
              />
            ))}
          </tbody>
        </table>
      </Karte>

      {visite.status === 'geplant' && (
        <Karte titel="Durchführung">
          <p style={{ color: '#64748b', marginTop: 0 }}>
            Das Datum der Durchführung bestimmt die Frist der nächsten Visite.
          </p>
          <button
            style={pflegePrimaryBtn}
            disabled={busy}
            onClick={() => aktion({ aktion: 'durchfuehren' })}
          >
            Als heute durchgeführt melden
          </button>
          <button
            style={{ ...pflegeSecondaryBtn, marginLeft: 8 }}
            disabled={busy}
            onClick={() => aktion({ aktion: 'absagen' })}
          >
            Visite absagen
          </button>
        </Karte>
      )}

      {visite.status === 'durchgefuehrt' && (
        <Karte titel="Auswertung">
          <FeldRaster>
            <AuswahlFeld
              label="Gesamturteil"
              value={urteil}
              onChange={v => setUrteil(v as Gesamtbewertung)}
              optionen={GESAMTBEWERTUNG_WERTE.map(b => [b, GESAMTBEWERTUNG_BEZEICHNUNG[b] ?? b] as [string, string])}
            />
          </FeldRaster>
          <TextBereich
            label="Zusammenfassung"
            value={zusammenfassung}
            onChange={setZusammenfassung}
            rows={3}
          />
          <button
            style={pflegePrimaryBtn}
            disabled={busy}
            onClick={() => aktion({ aktion: 'auswerten', gesamtbewertung: urteil, zusammenfassung })}
          >
            Auswertung speichern
          </button>
        </Karte>
      )}

      {visite.status === 'ausgewertet' && (
        <Karte titel="Abschluss">
          {abweichungenOhneAbstellung.length > 0 ? (
            <Banner tone="warn">
              {abweichungenOhneAbstellung.length} festgestellte Abweichung(en) ohne Empfehlung oder
              Frist. Eine festgestellte Abweichung braucht eine Maßnahme und einen Termin — sonst
              ist sie eine Notiz, keine Qualitätssicherung.
            </Banner>
          ) : (
            <p style={{ color: '#64748b', marginTop: 0 }}>
              Nach dem Abschluss ist die Visite unveränderlich. Nachtragbar bleibt nur die
              Erledigung eines Befundes.
            </p>
          )}
          <button
            style={pflegePrimaryBtn}
            disabled={busy || abweichungenOhneAbstellung.length > 0}
            onClick={() => aktion({ aktion: 'abschliessen' })}
          >
            Visite abschließen
          </button>
        </Karte>
      )}

      {visite.zusammenfassung && (
        <Karte titel="Zusammenfassung">
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{visite.zusammenfassung}</p>
          {visite.gesamtbewertung && (
            <p style={{ color: '#64748b' }}>
              Gesamturteil: {GESAMTBEWERTUNG_BEZEICHNUNG[visite.gesamtbewertung] ?? visite.gesamtbewertung}
            </p>
          )}
        </Karte>
      )}
    </div>
  )
}

/**
 * Eine Zeile der Checkliste. Nicht bewertete Prüfpunkte stehen mit, damit
 * am Ende ablesbar ist, was geprüft wurde und was nicht.
 */
function BefundZeile({
  punkt, befund, visiteId, bearbeitbar, onGespeichert, onFehler,
}: {
  punkt: Pruefpunkt
  befund?: QmVisiteBefund
  visiteId: string
  bearbeitbar: boolean
  onGespeichert: () => void
  onFehler: (msg: string) => void
}) {
  const [bewertung, setBewertung] = useState<Befundbewertung>(befund?.bewertung ?? 'erfuellt')
  const [feststellung, setFeststellung] = useState(befund?.feststellung ?? '')
  const [empfehlung, setEmpfehlung] = useState(befund?.empfehlung ?? '')
  const [frist, setFrist] = useState(befund?.frist ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!befund) return
    setBewertung(befund.bewertung)
    setFeststellung(befund.feststellung ?? '')
    setEmpfehlung(befund.empfehlung ?? '')
    setFrist(befund.frist ?? '')
  }, [befund])

  const abweichend = ABWEICHENDE_BEWERTUNGEN.includes(bewertung)

  async function speichern() {
    setBusy(true)
    try {
      const nutzlast = {
        bewertung,
        feststellung: feststellung.trim() || null,
        empfehlung: empfehlung.trim() || null,
        frist: frist || null,
        massnahmeBeantragt: abweichend,
      }
      const res = befund
        ? await fetch('/api/qm/befunde', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ befundId: befund.id, ...nutzlast }),
          })
        : await fetch('/api/qm/befunde', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visiteId, pruefpunkt: punkt, ...nutzlast }),
          })
      const body = await res.json()
      if (body.error) { onFehler(body.error); return }
      onGespeichert()
    } catch {
      onFehler('Speichern fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr>
      <td>
        {PRUEFPUNKT_BEZEICHNUNG[punkt]}
        {befund?.erledigt_am && (
          <div style={{ fontSize: 12, color: '#16a34a' }}>erledigt {formatDate(befund.erledigt_am)}</div>
        )}
      </td>
      <td>
        <select
          value={bewertung}
          onChange={e => setBewertung(e.target.value as Befundbewertung)}
          disabled={!bearbeitbar || busy}
          style={{ width: '100%' }}
        >
          {BEFUNDBEWERTUNG_WERTE.map(b => (
            <option key={b} value={b}>{BEWERTUNG_LABEL[b]}</option>
          ))}
        </select>
      </td>
      <td>
        <input
          value={feststellung}
          onChange={e => setFeststellung(e.target.value)}
          disabled={!bearbeitbar || busy}
          placeholder={abweichend ? 'Pflichtangabe bei Abweichung' : ''}
          style={{ width: '100%' }}
        />
      </td>
      <td>
        <input
          value={empfehlung}
          onChange={e => setEmpfehlung(e.target.value)}
          disabled={!bearbeitbar || busy}
          placeholder={abweichend ? 'für den Abschluss erforderlich' : ''}
          style={{ width: '100%' }}
        />
      </td>
      <td>
        <input
          type="date"
          value={frist}
          onChange={e => setFrist(e.target.value)}
          disabled={!bearbeitbar || busy}
          style={{ width: '100%' }}
        />
        {bearbeitbar && (
          <button style={{ ...pflegeMiniBtn, marginTop: 4 }} onClick={speichern} disabled={busy}>
            {befund ? 'Ändern' : 'Erfassen'}
          </button>
        )}
      </td>
    </tr>
  )
}
