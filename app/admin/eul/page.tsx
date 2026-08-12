'use client'
// ═══════════════════════════════════════════════════════════════
// Ergänzende Unterstützungsleistungen (eUL) — Block 15d
//
// Persönliche Begleitleistungen rund um die Nutzung des Digitalen
// PflegeCoach: erfassen, auf Vollständigkeit prüfen, bestätigen.
//
// ABGRENZUNG: Der Weg führt bewusst nur in diese Richtung — aus dem
// Betrieb heraus lässt sich eine eUL an eine Buchung hängen. Aus dem
// PflegeCoach heraus gibt es KEINE Bewerbung und keinen Buchungs-Button
// (Werbefreiheit der Kernfunktion, siehe lib/coach/eul.ts).
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react'
import { Banner, EmptyRow } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, SchalterFeld, TextBereich, TextFeld,
  Tabs, pflegeMiniBtn, pflegePrimaryBtn,
} from '@/components/admin/PflegeUI'
import {
  ABGRENZUNG, EUL_DEFINITIONEN, EUL_DURCHFUEHRUNGSFORMEN,
  EUL_DURCHFUEHRUNGSFORM_LABELS, EUL_LEISTUNGSARTEN, EUL_LEISTUNGSART_LABELS,
  EUL_QUALITAETSKRITERIEN, type EulLeistungsart,
} from '@/lib/coach/eul'
import type { EulErbringung, EulQualifikation } from '@/lib/coach/types'

type TabKey = 'nachweise' | 'qualifikation' | 'abgrenzung'

const EINORDNUNG_LABELS: Record<string, string> = {
  digital_dipa: 'Digitale Nutzung (DiPA)',
  persoenlich_eul: 'Persönliche Leistung (eUL)',
  weder_noch: 'Weder noch',
}

export default function AdminEulPage() {
  const [tab, setTab] = useState<TabKey>('nachweise')
  const [error, setError] = useState('')

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Ergänzende Unterstützungsleistungen</h1>
          <p className="admin-subtitle">
            Persönliche Begleitung rund um den Digitalen PflegeCoach — Nachweise und Qualifikation
          </p>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <Tabs<TabKey>
        tabs={[
          { key: 'nachweise', label: 'Leistungsnachweise' },
          { key: 'qualifikation', label: 'Qualifikation der Erbringer' },
          { key: 'abgrenzung', label: 'Abgrenzung' },
        ]}
        aktiv={tab}
        onChange={setTab}
      />

      {tab === 'nachweise' && <NachweiseTab onError={setError} />}
      {tab === 'qualifikation' && <QualifikationTab onError={setError} />}
      {tab === 'abgrenzung' && <AbgrenzungTab />}
    </div>
  )
}

function NachweiseTab({ onError }: { onError: (m: string) => void }) {
  const [zeilen, setZeilen] = useState<EulErbringung[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [leistungsart, setLeistungsart] = useState<EulLeistungsart>('einweisung')
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10))
  const [dauer, setDauer] = useState('60')
  const [form, setForm] = useState<string>('persoenlich_vor_ort')
  const [inhalt, setInhalt] = useState('')
  const [erbringer, setErbringer] = useState('')
  const [qualiGeprueft, setQualiGeprueft] = useState(false)
  const [bookingId, setBookingId] = useState('')
  const [clientId, setClientId] = useState('')

  const laden = useCallback(() => {
    fetch('/api/eul/erbringungen')
      .then(r => r.json())
      .then(body => {
        if (body.error) { onError(body.error); return }
        setZeilen(body.erbringungen || [])
      })
      .catch(() => onError('Nachweise konnten nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [onError])

  useEffect(laden, [laden])

  async function erfassen() {
    setBusy(true)
    try {
      const res = await fetch('/api/eul/erbringungen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leistungsart,
          datum,
          dauer_minuten: Number(dauer),
          durchfuehrungsform: form,
          inhalt,
          erbringer_name: erbringer || null,
          qualifikation_geprueft: qualiGeprueft,
          booking_id: bookingId || null,
          client_id: clientId || null,
        }),
      })
      const body = await res.json()
      if (body.error) { onError(body.error); return }
      setInhalt('')
      setBookingId('')
      laden()
    } catch {
      onError('Nachweis konnte nicht gespeichert werden.')
    } finally {
      setBusy(false)
    }
  }

  async function bestaetigen(id: string) {
    const res = await fetch(`/api/eul/erbringungen/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bestaetigen: true }),
    })
    const body = await res.json()
    if (body.error) { onError(body.error); return }
    laden()
  }

  const definition = EUL_DEFINITIONEN[leistungsart]

  return (
    <>
      <Karte titel="Leistung erfassen">
        <FeldRaster>
          <AuswahlFeld
            label="Leistungsart"
            value={leistungsart}
            onChange={v => setLeistungsart(v as EulLeistungsart)}
            optionen={EUL_LEISTUNGSARTEN.map(a => [a, EUL_LEISTUNGSART_LABELS[a]] as [string, string])}
          />
          <TextFeld label="Datum" value={datum} onChange={setDatum} type="date" />
          <TextFeld label="Dauer (Minuten)" value={dauer} onChange={setDauer} type="number" />
          <AuswahlFeld
            label="Durchführung"
            value={form}
            onChange={setForm}
            optionen={EUL_DURCHFUEHRUNGSFORMEN.map(f => [f, EUL_DURCHFUEHRUNGSFORM_LABELS[f]] as [string, string])}
          />
          <TextFeld label="Erbringende Person" value={erbringer} onChange={setErbringer} />
          <TextFeld label="Kunden-ID (optional)" value={clientId} onChange={setClientId} />
          <TextFeld label="Buchungs-ID (optional)" value={bookingId} onChange={setBookingId} />
        </FeldRaster>

        <div style={{ marginTop: 12 }}>
          <TextBereich
            label="Inhalt der Leistung"
            value={inhalt}
            onChange={setInhalt}
            rows={4}
            placeholder={definition.nachweisinhalt.join(' · ')}
          />
          <p style={{ fontSize: 12, color: 'var(--ink5)', margin: '4px 0 12px' }}>
            {definition.beschreibung} — Richtwert {definition.richtdauerMinuten} Minuten.
            Erforderlich im Nachweis: {definition.nachweisinhalt.join(', ')}.
          </p>
          <SchalterFeld
            label="Qualifikation der erbringenden Person ist geprüft"
            value={qualiGeprueft}
            onChange={setQualiGeprueft}
          />
        </div>

        <button style={{ ...pflegePrimaryBtn, marginTop: 12 }} onClick={erfassen} disabled={busy}>
          {busy ? 'Wird gespeichert …' : 'Nachweis speichern'}
        </button>
      </Karte>

      <Karte titel={`Erfasste Nachweise (${zeilen.length})`}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Leistungsart</th>
              <th>Dauer</th>
              <th>Form</th>
              <th>Erbringer</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <EmptyRow colSpan={7}>Wird geladen …</EmptyRow>}
            {!loading && !zeilen.length && <EmptyRow colSpan={7}>Noch keine Nachweise erfasst.</EmptyRow>}
            {zeilen.map(z => (
              <tr key={z.id}>
                <td>{formatDatum(z.datum)}</td>
                <td>{EUL_LEISTUNGSART_LABELS[z.leistungsart as EulLeistungsart] ?? z.leistungsart}</td>
                <td>{z.dauer_minuten} Min.</td>
                <td>{EUL_DURCHFUEHRUNGSFORM_LABELS[z.durchfuehrungsform as keyof typeof EUL_DURCHFUEHRUNGSFORM_LABELS] ?? z.durchfuehrungsform}</td>
                <td>{z.erbringer_name ?? '—'}</td>
                <td>{z.bestaetigt_am ? `Bestätigt (${formatDatum(z.bestaetigt_am)})` : 'Entwurf'}</td>
                <td>
                  {!z.bestaetigt_am && (
                    <button style={pflegeMiniBtn} onClick={() => bestaetigen(z.id)}>Bestätigen</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>
    </>
  )
}

function QualifikationTab({ onError }: { onError: (m: string) => void }) {
  const [zeilen, setZeilen] = useState<EulQualifikation[]>([])
  const [freigaben, setFreigaben] = useState<Array<{
    erbringer: string
    name: string | null
    freigabe: { freigegeben: boolean; fehlend?: string[] }
  }>>([])
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [kriterium, setKriterium] = useState(EUL_QUALITAETSKRITERIEN[0].key)
  const [nachweisArt, setNachweisArt] = useState('')
  const [gueltigBis, setGueltigBis] = useState('')

  const laden = useCallback(() => {
    fetch('/api/eul/qualifikationen')
      .then(r => r.json())
      .then(body => {
        if (body.error) { onError(body.error); return }
        setZeilen(body.qualifikationen || [])
        setFreigaben(body.freigaben || [])
      })
      .catch(() => onError('Qualifikationsnachweise konnten nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [onError])

  useEffect(laden, [laden])

  async function erfassen() {
    const res = await fetch('/api/eul/qualifikationen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        erbringer_name: name,
        kriterium_key: kriterium,
        erfuellt: true,
        nachweis_art: nachweisArt || null,
        gueltig_bis: gueltigBis || null,
      }),
    })
    const body = await res.json()
    if (body.error) { onError(body.error); return }
    setNachweisArt('')
    laden()
  }

  return (
    <>
      <Banner tone="info">
        Der Kriterienkatalog ist der selbst gesetzte Qualitätsstandard von Alltagsengel.
        Kriterien mit dem Vermerk „regulatorisch offen" sind intern begründet und vor einer
        Antragstellung gegen die dann gültigen Vorgaben zu prüfen.
      </Banner>

      <Karte titel="Kriterienkatalog">
        <table className="admin-table">
          <thead>
            <tr><th>Kriterium</th><th>Anforderung</th><th>Nachweisform</th><th>Pflicht</th><th>Herkunft</th><th>Wiederholung</th></tr>
          </thead>
          <tbody>
            {EUL_QUALITAETSKRITERIEN.map(k => (
              <tr key={k.key}>
                <td>{k.bezeichnung}</td>
                <td>{k.anforderung}</td>
                <td>{k.nachweisform.join(', ')}</td>
                <td>{k.pflicht ? 'Ja' : 'Nein'}</td>
                <td>{k.regulatorischGefordert === 'offen' ? 'regulatorisch offen' : 'intern gesetzt'}</td>
                <td>{k.wiederholungMonate ? `alle ${k.wiederholungMonate} Monate` : 'einmalig'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>

      <Karte titel="Nachweis erfassen">
        <FeldRaster>
          <TextFeld label="Erbringende Person" value={name} onChange={setName} />
          <AuswahlFeld
            label="Kriterium"
            value={kriterium}
            onChange={setKriterium}
            optionen={EUL_QUALITAETSKRITERIEN.map(k => [k.key, k.bezeichnung] as [string, string])}
          />
          <TextFeld label="Nachweisform" value={nachweisArt} onChange={setNachweisArt} />
          <TextFeld label="Gültig bis (optional)" value={gueltigBis} onChange={setGueltigBis} type="date" />
        </FeldRaster>
        <button style={{ ...pflegePrimaryBtn, marginTop: 12 }} onClick={erfassen} disabled={!name.trim()}>
          Nachweis speichern
        </button>
      </Karte>

      <Karte titel="Einsatzfreigabe">
        <table className="admin-table">
          <thead><tr><th>Person</th><th>Freigabe</th><th>Fehlende Nachweise</th></tr></thead>
          <tbody>
            {loading && <EmptyRow colSpan={3}>Wird geladen …</EmptyRow>}
            {!loading && !freigaben.length && <EmptyRow colSpan={3}>Noch keine Nachweise erfasst.</EmptyRow>}
            {freigaben.map(f => (
              <tr key={f.erbringer}>
                <td>{f.name ?? f.erbringer}</td>
                <td>{f.freigabe.freigegeben ? 'Freigegeben' : 'Nicht freigegeben'}</td>
                <td>{f.freigabe.fehlend?.join(', ') ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>

      <Karte titel={`Erfasste Nachweise (${zeilen.length})`}>
        <table className="admin-table">
          <thead><tr><th>Person</th><th>Kriterium</th><th>Nachweisform</th><th>Geprüft am</th><th>Gültig bis</th></tr></thead>
          <tbody>
            {!zeilen.length && <EmptyRow colSpan={5}>Noch keine Nachweise erfasst.</EmptyRow>}
            {zeilen.map(z => (
              <tr key={z.id}>
                <td>{z.erbringer_name ?? '—'}</td>
                <td>{EUL_QUALITAETSKRITERIEN.find(k => k.key === z.kriterium_key)?.bezeichnung ?? z.kriterium_key}</td>
                <td>{z.nachweis_art ?? '—'}</td>
                <td>{z.geprueft_am ? formatDatum(z.geprueft_am) : '—'}</td>
                <td>{z.gueltig_bis ? formatDatum(z.gueltig_bis) : 'unbefristet'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>
    </>
  )
}

function AbgrenzungTab() {
  return (
    <>
      <Banner tone="warn">
        Falsch eingeordnete Leistungen sind das größte Risiko in diesem Bereich. Im Zweifel gilt:
        Was ohne die digitale Anwendung genauso stattfinden würde, ist keine ergänzende
        Unterstützungsleistung.
      </Banner>

      <Karte titel="Digital, persönlich oder keines von beidem">
        <table className="admin-table">
          <thead><tr><th>Tätigkeit</th><th>Einordnung</th><th>Begründung</th></tr></thead>
          <tbody>
            {ABGRENZUNG.map(r => (
              <tr key={r.taetigkeit}>
                <td>{r.taetigkeit}</td>
                <td>{EINORDNUNG_LABELS[r.einordnung]}</td>
                <td>{r.begruendung}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>
    </>
  )
}

function formatDatum(wert: string): string {
  const iso = wert.slice(0, 10)
  const [j, m, t] = iso.split('-')
  return t && m && j ? `${t}.${m}.${j}` : iso
}
