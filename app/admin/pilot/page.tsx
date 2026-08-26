'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Banner } from '@/components/admin/OpsUI'
import type {
  Ampel,
  KundenKette,
  SchrittDefinition,
  SchrittStand,
  VoraussetzungErgebnis,
  VoraussetzungPunkt,
} from '@/lib/pilot/types'
import { VORAUSSETZUNG_GRUPPEN } from '@/lib/pilot/types'
import type {
  MoneyPathAmpel,
  MoneyPathBereich,
  MoneyPathKennzahl,
  MoneyPathUebersicht,
} from '@/lib/pilot/control-center'
import type {
  PilotPhase,
  PilotPhasenUebersicht,
  VorgangStatus,
} from '@/lib/pilot/pilot-phasen'
import type { BusinessInputBericht, BusinessInputStand } from '@/lib/pilot/business-inputs'

interface PilotAntwort {
  voraussetzungen: VoraussetzungErgebnis
  ketten: KundenKette[]
  moneyPath: MoneyPathUebersicht
  phasen: PilotPhasenUebersicht
  businessInputs: BusinessInputBericht
  schritte: SchrittDefinition[]
  gekappt: boolean
}

/**
 * Sieben Zustände, sieben Farben — und BLOCKED ist bewusst NICHT dieselbe
 * Farbe wie FAILED. „Etwas verbietet den Schritt" und „der Schritt wurde
 * versucht und ging schief" schicken jemanden an völlig verschiedene
 * Stellen.
 */
const PHASE_STATUS: Record<VorgangStatus, { farbe: string; label: string }> = {
  NOT_STARTED: { farbe: '#94a3b8', label: 'NICHT BEGONNEN' },
  READY:       { farbe: '#0ea5e9', label: 'BEREIT' },
  APPROVED:    { farbe: '#8b5cf6', label: 'FREIGEGEBEN' },
  EXECUTING:   { farbe: '#f59e0b', label: 'LÄUFT' },
  VERIFIED:    { farbe: '#22c55e', label: 'GEPRÜFT' },
  FAILED:      { farbe: '#ef4444', label: 'GESCHEITERT' },
  BLOCKED:     { farbe: '#b91c1c', label: 'BLOCKIERT' },
}

const AMPEL_FARBE: Record<Ampel, string> = {
  gruen: '#22c55e',
  gelb: '#f59e0b',
  rot: '#ef4444',
}

/**
 * Vier Farben statt drei. `ungeprueft` ist bewusst NICHT rot: „Messung
 * gescheitert" und „Befund" sind zwei verschiedene Aussagen, und wer sie
 * gleich einfärbt, sucht später am falschen Ende.
 */
const MP_AMPEL: Record<MoneyPathAmpel, { farbe: string; label: string }> = {
  gruen:      { farbe: '#22c55e', label: 'BEREIT' },
  gelb:       { farbe: '#f59e0b', label: 'ACHTUNG' },
  rot:        { farbe: '#ef4444', label: 'BLOCKIERT' },
  ungeprueft: { farbe: '#6366f1', label: 'UNGEPRÜFT' },
}

const STAND_FARBE: Record<SchrittStand, string> = {
  erledigt: '#22c55e',
  laeuft: '#f59e0b',
  offen: '#cbd5e1',
  blockiert: '#ef4444',
  entfaellt: '#e2e8f0',
}

const STAND_TITEL: Record<SchrittStand, string> = {
  erledigt: 'erledigt',
  laeuft: 'läuft',
  offen: 'offen',
  blockiert: 'blockiert',
  entfaellt: 'entfällt',
}

export default function PilotPage() {
  const [data, setData] = useState<PilotAntwort | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/pilot')
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        return j as PilotAntwort
      })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return <div className="admin-page"><p>Lade Pilot-Status…</p></div>
  if (error) return <div className="admin-page"><Banner tone="danger">{error}</Banner></div>
  if (!data) return null

  const v = data.voraussetzungen
  const pflichtOffen = v.punkte.filter(p => p.pflicht && p.ampel === 'rot')

  // Tabellen, die für mindestens einen Kunden nicht lesbar waren. Ohne diesen
  // Hinweis sähe ein defekter Select aus wie ein Kunde, bei dem noch nichts
  // passiert ist — die Seite würde ihren eigenen Defekt verdecken.
  const datenfehler = [...new Set(data.ketten.flatMap(k => k.datenfehler ?? []))]

  return (
    <div className="admin-page">
      <h1>Pilot — kontrollierter Echtbetrieb</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24, maxWidth: 760 }}>
        Diese Seite beantwortet zwei Fragen getrennt: <strong>Darf</strong> heute ein echter Kunde
        abgerechnet werden (Betriebs-Checkliste), und <strong>wie weit</strong> ist jeder Kunde auf dem
        Weg vom Stammdatensatz bis in die Buchhaltung (Kundenketten).
      </p>

      <Banner tone={v.echtbetriebFreigegeben ? 'success' : 'danger'}>
        {v.echtbetriebFreigegeben
          ? 'Alle Pflichtpunkte erfüllt — ein echter Kunde kann vollständig bearbeitet und abgerechnet werden.'
          : `Echtbetrieb gesperrt: ${pflichtOffen.length} Pflichtpunkt(e) offen — ${pflichtOffen.map(p => p.label).join(', ')}.`}
      </Banner>

      {datenfehler.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Banner tone="danger">
            <strong>Kettenstand teilweise nicht ermittelbar.</strong> Die folgenden Tabellen liessen
            sich nicht lesen. Die betroffenen Schritte stehen auf „blockiert" — das ist ein
            technischer Defekt und NICHT als „noch nichts passiert" zu lesen:
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {datenfehler.map(f => <li key={f}><code>{f}</code></li>)}
            </ul>
          </Banner>
        </div>
      )}

      {v.gesperrteWege.length > 0 && (
        <div className="admin-card" style={{ marginTop: 20, borderLeft: '4px solid #f59e0b' }}>
          <h3>Bewusst gesperrte Wege</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -4, marginBottom: 12 }}>
            Diese Wege sind abgeschaltet, weil externe Voraussetzungen fehlen. Sie blockieren den
            Pilotbetrieb nicht — die Kette läuft als Selbstzahler-Betrieb vollständig durch.
          </p>
          <ul style={{ lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
            {v.gesperrteWege.map(w => (
              <li key={w.weg}>
                <strong>{w.weg}</strong> — {w.grund}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, margin: '24px 0' }}>
        <KPI label="Erfüllt" value={v.zusammenfassung.gruen} color={AMPEL_FARBE.gruen} />
        <KPI label="Teilweise" value={v.zusammenfassung.gelb} color={AMPEL_FARBE.gelb} />
        <KPI label="Blockiert" value={v.zusammenfassung.rot} color={AMPEL_FARBE.rot} />
        <KPI label="Pilotkunden" value={data.ketten.length} />
        <KPI label="Kette komplett" value={data.ketten.filter(k => k.vollstaendig).length} color={AMPEL_FARBE.gruen} />
      </div>

      <h2 style={{ marginTop: 32 }}>1 · Betriebs-Checkliste</h2>
      {VORAUSSETZUNG_GRUPPEN.map(gruppe => {
        const punkte = v.punkte.filter(p => p.gruppe === gruppe.id)
        if (punkte.length === 0) return null
        return (
          <div className="admin-card" key={gruppe.id} style={{ marginBottom: 16 }}>
            <h3>{gruppe.titel}</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {punkte.map(p => <PunktZeile key={p.id} punkt={p} />)}
              </tbody>
            </table>
          </div>
        )
      })}

      <h2 style={{ marginTop: 36 }}>2 · Kundenketten</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 16, maxWidth: 760 }}>
        Jede Spalte ist ein Kettenschritt in fester Reihenfolge. Grün = erledigt, gelb = begonnen,
        grau = offen, rot = blockiert (eine Voraussetzung fehlt).
      </p>

      {data.gekappt && (
        <Banner tone="warn">
          Es werden nur die ersten 100 aktiven Kunden angezeigt. Weitere Kunden sind vorhanden, aber
          in dieser Übersicht nicht enthalten.
        </Banner>
      )}

      {data.ketten.length === 0 ? (
        <div className="admin-card">
          <p style={{ margin: 0 }}>
            Kein aktiver Kunde vorhanden. <Link href="/admin/clients">Kunden anlegen</Link>, um den
            Pilotbetrieb zu starten.
          </p>
        </div>
      ) : (
        <div className="admin-card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 12px 8px 0', fontSize: 13 }}>Kunde</th>
                {data.schritte.map(s => (
                  <th
                    key={s.id}
                    title={`${s.nr}. ${s.label} — ${s.kriterium}`}
                    style={{ padding: '8px 4px', fontSize: 11, fontWeight: 500, color: 'var(--muted)', width: 34 }}
                  >
                    {s.nr}
                  </th>
                ))}
                <th style={{ textAlign: 'left', padding: '8px 0 8px 16px', fontSize: 13 }}>Nächster Schritt</th>
              </tr>
            </thead>
            <tbody>
              {data.ketten.map(k => (
                <tr key={k.clientId} style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
                  <td style={{ padding: '10px 12px 10px 0', whiteSpace: 'nowrap' }}>
                    <Link href={`/admin/pilot/${k.clientId}`} style={{ fontWeight: 500 }}>{k.name}</Link>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {k.fortschritt.erledigt}/{k.fortschritt.anwendbar} · {k.fortschritt.prozent} %
                    </div>
                  </td>
                  {k.schritte.map(s => (
                    <td key={s.id} style={{ padding: '10px 4px', textAlign: 'center' }}>
                      <span
                        title={`${s.nr}. ${s.label}: ${STAND_TITEL[s.stand]}${s.wert ? ` (${s.wert})` : ''}`}
                        aria-label={`${s.label}: ${STAND_TITEL[s.stand]}`}
                        style={{
                          display: 'inline-block', width: 14, height: 14, borderRadius: 4,
                          background: STAND_FARBE[s.stand],
                        }}
                      />
                    </td>
                  ))}
                  <td style={{ padding: '10px 0 10px 16px', fontSize: 13 }}>
                    {k.vollstaendig ? (
                      <span style={{ color: '#16a34a', fontWeight: 500 }}>Kette vollständig durchlaufen</span>
                    ) : k.aktuellerSchritt ? (
                      <Link href={k.aktuellerSchritt.aktionHref}>
                        {k.aktuellerSchritt.nr}. {k.aktuellerSchritt.label}
                      </Link>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ marginTop: 36 }}>3 · Money-Path — Betriebslage heute</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 12, maxWidth: 760 }}>
        Die vier Geldpfade und die Umgebung, in gemessenen Zahlen. Abschnitt 1 fragt
        <em> ob</em> abgerechnet werden darf, Abschnitt 2 <em>wie weit</em> ein Kunde ist —
        dieser Abschnitt fragt, <em>was gerade liegen geblieben ist</em>.
      </p>

      <Banner tone="info">
        <strong>Messung, keine Freigabe.</strong> {data.moneyPath.freigabeHinweis}
      </Banner>

      {data.moneyPath.hinweise.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Banner tone="warn">
            <strong>Nicht messbar (gilt als ungeprüft, NICHT als 0):</strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {data.moneyPath.hinweise.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </Banner>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {data.moneyPath.bereiche.map(b => <MoneyPathKarte key={b.id} bereich={b} />)}
      </div>

      <h2 style={{ marginTop: 36 }}>4 · Erstbetrieb — Phasenkette</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 12, maxWidth: 760 }}>
        Der begleitete Erstlauf in neun Phasen, in fester Reihenfolge. Jede Phase nennt das Modul,
        das die Aktion <em>tatsächlich</em> freigibt — diese Seite selbst gibt nichts frei.
      </p>

      <Banner tone="info">
        <strong>Anzeigetafel, kein Gate.</strong> {data.phasen.freigabeHinweis}
      </Banner>

      {data.phasen.hinweise.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Banner tone="warn">
            <strong>Nicht messbar (die betroffene Phase steht auf BLOCKIERT, nicht auf 0):</strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {data.phasen.hinweise.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </Banner>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, margin: '20px 0' }}>
        <KPI
          label="Phasen geprüft"
          value={data.phasen.fortschritt.verifiziert}
          color={PHASE_STATUS.VERIFIED.farbe}
        />
        <KPI label="Phasen gesamt" value={data.phasen.fortschritt.gesamt} />
        <KPI label="Fortschritt %" value={data.phasen.fortschritt.prozent} />
      </div>

      {data.phasen.aktuellePhase && (
        <div className="admin-card" style={{ marginBottom: 16, borderLeft: `4px solid ${PHASE_STATUS[data.phasen.aktuellePhase.status].farbe}` }}>
          <h3 style={{ marginTop: 0 }}>Nächster Schritt: {data.phasen.aktuellePhase.titel}</h3>
          <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.6 }}>
            {data.phasen.aktuellePhase.naechsterSchritt ?? data.phasen.aktuellePhase.begruendung}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
            Freigabe liegt bei <code>{data.phasen.aktuellePhase.gate}</code>
          </p>
        </div>
      )}

      <div>
        {data.phasen.phasen.map(p => <PhasenKarte key={p.id} phase={p} />)}
      </div>

      <h2 style={{ marginTop: 36 }}>5 · Offene Geschäftsangaben</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 12, maxWidth: 760 }}>
        Angaben, die niemand im System erfinden darf. Entscheidend ist die erste Zeile: ob sie den
        Rechnungspilot aufhalten.
      </p>

      <Banner tone={data.businessInputs.rechnungspilotBlockiert ? 'danger' : 'success'}>
        <strong>
          Rechnungspilot blockiert: {data.businessInputs.rechnungspilotBlockiert ? 'JA' : 'NEIN'}.
        </strong>{' '}
        {data.businessInputs.rechnungspilotBlockiert
          ? 'Mindestens eine offene Angabe liegt auf dem Rechnungsweg.'
          : 'Keine der offenen Angaben liegt auf dem Rechnungsweg — DATEV ist eine nachgelagerte Ausleitung, ChairMatch ein anderes Repo und ein anderes Supabase-Projekt.'}
      </Banner>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, margin: '16px 0' }}>
        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>Läuft ohne jede dieser Angaben</h3>
          <ul style={{ lineHeight: 1.7, margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {data.businessInputs.laeuftUnabhaengig.map(x => <li key={x}>{x}</li>)}
          </ul>
        </div>
        <div className="admin-card" style={{ borderLeft: '4px solid #ef4444' }}>
          <h3 style={{ marginTop: 0 }}>Läuft nicht, solange D1/D2 fehlen</h3>
          <ul style={{ lineHeight: 1.7, margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {data.businessInputs.laeuftNicht.map(x => <li key={x}>{x}</li>)}
          </ul>
        </div>
      </div>

      <div className="admin-card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
          <tbody>
            {data.businessInputs.eingaben.map(e => <EingabeZeile key={e.id} eingabe={e} />)}
          </tbody>
        </table>
      </div>

      <div className="admin-card" style={{ marginTop: 20 }}>
        <h3>Legende der Kettenschritte</h3>
        <ol style={{ lineHeight: 1.8, margin: 0, paddingLeft: 20, fontSize: 13 }}>
          {data.schritte.map(s => (
            <li key={s.id}>
              <strong>{s.label}</strong> — {s.kriterium}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function MoneyPathKarte({ bereich }: { bereich: MoneyPathBereich }) {
  const a = MP_AMPEL[bereich.ampel]
  return (
    <div className="admin-card" style={{ marginBottom: 16, borderLeft: `4px solid ${a.farbe}` }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0, flex: '1 1 220px' }}>{bereich.titel}</h3>
        <span style={{
          padding: '3px 10px', borderRadius: 999, border: `1px solid ${a.farbe}`,
          color: a.farbe, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, whiteSpace: 'nowrap',
        }}>
          {a.label}
        </span>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6 }}>{bereich.begruendung}</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 420 }}>
          <tbody>
            {bereich.kennzahlen.map((k, i) => <MoneyPathZeile key={i} kennzahl={k} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MoneyPathZeile({ kennzahl: k }: { kennzahl: MoneyPathKennzahl }) {
  const auffaellig = k.wert !== null && k.wert > 0 && k.ampel !== 'gruen'
  const farbe = k.wert === null
    ? MP_AMPEL.ungeprueft.farbe
    : auffaellig ? MP_AMPEL[k.ampel].farbe : 'inherit'

  return (
    <tr style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
      {/* Der Unterschied, um den es geht: „—" ist nicht „0". */}
      <td style={{ padding: '8px 8px 8px 0', width: 70, textAlign: 'right', fontWeight: 700, fontSize: 16, color: farbe }}>
        {k.wert === null ? '—' : k.wert}
      </td>
      <td style={{ padding: 8 }}>
        <div style={{ fontWeight: 500 }}>{k.label}</div>
        <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2, lineHeight: 1.5 }}>
          {k.wert === null ? 'Nicht messbar — siehe Hinweise oben. ' : ''}{k.bedeutung}
        </div>
      </td>
    </tr>
  )
}

function PunktZeile({ punkt }: { punkt: VoraussetzungPunkt }) {
  return (
    <tr style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
      <td style={{ padding: '10px 8px 10px 0', width: 28 }}>
        <span
          aria-label={punkt.ampel}
          style={{
            display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
            background: AMPEL_FARBE[punkt.ampel],
          }}
        />
      </td>
      <td style={{ padding: '10px 8px', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {punkt.label}
        {punkt.pflicht && (
          <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 4, background: '#e0e7ff', color: '#3730a3' }}>
            PFLICHT
          </span>
        )}
      </td>
      <td style={{ padding: '10px 8px', color: 'var(--muted)', fontSize: 13 }}>{punkt.wert ?? '—'}</td>
      <td style={{ padding: '10px 0', color: 'var(--muted)', fontSize: 13 }}>
        {punkt.hinweis}
        {punkt.blocker === 'extern' && (
          <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 4, background: '#fef3c7', color: '#92400e' }}>
            EXTERN
          </span>
        )}
        {punkt.aktion && (
          <>
            {' '}
            <Link href={punkt.aktion.href} style={{ whiteSpace: 'nowrap' }}>{punkt.aktion.label} →</Link>
          </>
        )}
      </td>
    </tr>
  )
}

function KPI({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="admin-card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? 'inherit' }}>{value}</div>
      <div style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</div>
    </div>
  )
}

function PhasenKarte({ phase }: { phase: PilotPhase }) {
  const s = PHASE_STATUS[phase.status]
  return (
    <div className="admin-card" style={{ marginBottom: 12, borderLeft: `4px solid ${s.farbe}` }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 6 }}>
        <h3 style={{ margin: 0, flex: '1 1 260px', fontSize: 15 }}>
          {phase.nr}. {phase.titel}
        </h3>
        <span style={{
          padding: '3px 10px', borderRadius: 999, border: `1px solid ${s.farbe}`,
          color: s.farbe, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, whiteSpace: 'nowrap',
        }}>
          {s.label}
        </span>
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.6 }}>{phase.begruendung}</p>
      {phase.naechsterSchritt && (
        <p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.6 }}>
          <strong>Zu tun:</strong> {phase.naechsterSchritt}
        </p>
      )}
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)' }}>
        Backend-Gate: <code>{phase.gate}</code>
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {phase.kennzahlen.map((k, i) => (
          <div key={i} style={{ minWidth: 130 }}>
            {/* „—" ist nicht „0". */}
            <div style={{ fontSize: 18, fontWeight: 700, color: k.wert === null ? '#6366f1' : 'inherit' }}>
              {k.wert === null ? '—' : k.wert}
            </div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{k.label}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>
              {k.wert === null ? 'Nicht messbar. ' : ''}{k.bedeutung}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const EINGABE_FARBE: Record<BusinessInputStand['stand'], string> = {
  offen: '#f59e0b',
  gesetzt: '#22c55e',
  nicht_pruefbar: '#6366f1',
}

function EingabeZeile({ eingabe: e }: { eingabe: BusinessInputStand }) {
  return (
    <tr style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
      <td style={{ padding: '10px 8px 10px 0', width: 46, verticalAlign: 'top', fontWeight: 700 }}>
        {e.id}
      </td>
      <td style={{ padding: '10px 8px', width: 110, verticalAlign: 'top' }}>
        <span style={{
          padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
          border: `1px solid ${EINGABE_FARBE[e.stand]}`, color: EINGABE_FARBE[e.stand],
          whiteSpace: 'nowrap',
        }}>
          {e.stand === 'nicht_pruefbar' ? 'NICHT PRÜFBAR' : e.stand.toUpperCase()}
        </span>
      </td>
      <td style={{ padding: '10px 0' }}>
        <div style={{ fontWeight: 500 }}>{e.frage}</div>
        <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>
          Quelle: {e.quelle} · {e.befund}
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>
          <strong>Offen:</strong> {e.wirkungOffen}
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>
          <strong>Blockiert nicht:</strong> {e.blockiertNicht}
        </div>
      </td>
    </tr>
  )
}
