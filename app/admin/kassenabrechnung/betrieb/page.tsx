'use client'
/**
 * Betriebsansicht der Kassenabrechnung.
 *
 * Beantwortet drei Fragen auf einer Seite:
 *   1. Läuft jeder Kanal? (Gate, Betriebsmodus, letzte Übertragung, Warteschlange)
 *   2. Sind die Zugangsmittel vollständig und wann läuft das nächste ab?
 *   3. Liegt etwas in der Fehlerqueue, das niemand angefasst hat?
 *
 * Der Umschalter auf Echtbetrieb steht bewusst hier und nicht in den
 * Einstellungen: er gehört neben den Zustand, den er verändert.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Banner } from '@/components/admin/OpsUI'

type Ampel = 'gruen' | 'gelb' | 'rot'

interface KanalGesundheit {
  kanal: string
  label: string
  ampel: Ampel
  gate: { envVariable: string; offen: boolean; stelle: string }
  betriebsmodus: {
    modus: 'test' | 'produktion'
    effektiverDateiindikator: '0' | '2'
    hinterlegt: boolean
    hinweis: string | null
  }
  letzteUebertragung: { am: string; dateiName: string | null; empfaengerIk: string | null } | null
  letzterVersuch: { am: string; ergebnis: string; phase: string } | null
  letzterFehler: { am: string; fehlerCode: string | null } | null
  warteschlange: {
    versandbereit: number
    inUebermittlung: number
    aeltesterWartendAm: string | null
    tageWartend: number | null
  }
  ruecklaeufer: { offen: number }
  deadLetter: { offen: number; aeltesterOffenerAm: string | null }
  befunde: string[]
}

interface CredentialStatus {
  id: string
  label: string
  art: 'bucket' | 'env'
  ort: string | null
  pflicht: boolean
  externOffen: boolean
  beschaffung: string
  vorhanden: number
  erwartet: number | null
  ampel: Ampel
  laeuftAbAm: string | null
  tageBisAblauf: number | null
  letzteRotationAm: string | null
  hinweis: string
  offenePunkte: string[]
}

interface Gesundheit {
  geprueftAm: string
  gesamt: Ampel
  kanaele: KanalGesundheit[]
  credentials: {
    eintraege: CredentialStatus[]
    vollstaendig: boolean
    offenIntern: string[]
    offenExtern: string[]
    naechsterAblauf: { label: string; am: string; tage: number } | null
  }
  wiedervorlage: { ueberfaellig: number; offenerBetragCent: number; gesamt: number }
  deadLetter: { offen: number; gesamt: number; aeltesterOffenerAm: string | null }
  handlungsbedarf: string[]
}

interface DeadLetterEintrag {
  id: string
  kanal: string
  grundText: string
  status: string
  fehlerCode: string | null
  fehlerMeldung: string | null
  letztePhase: string | null
  versuche: number
  dateiName: string | null
  empfaengerIk: string | null
  notiz: string | null
  createdAt: string
}

const AMPEL_FARBE: Record<Ampel, string> = {
  gruen: '#22c55e',
  gelb: '#f59e0b',
  rot: '#ef4444',
}

const AMPEL_TEXT: Record<Ampel, string> = {
  gruen: 'in Ordnung',
  gelb: 'beobachten',
  rot: 'Handlungsbedarf',
}

function datum(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

function euro(cent: number): string {
  return (cent / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export default function BetriebPage() {
  const [gesundheit, setGesundheit] = useState<Gesundheit | null>(null)
  const [deadLetter, setDeadLetter] = useState<DeadLetterEintrag[]>([])
  const [bestaetigungswort, setBestaetigungswort] = useState('ECHTBETRIEB')
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [umschalten, setUmschalten] = useState<string | null>(null)

  const holen = useCallback(async () => {
    setLaden(true)
    try {
      const [h, dl, bm] = await Promise.all([
        fetch('/api/admin/abrechnung/health').then(r => r.json()),
        fetch('/api/billing/dta/dead-letter?status=offen,in_analyse').then(r => r.json()),
        fetch('/api/admin/abrechnung/betriebsmodus').then(r => r.json()),
      ])
      if (h.error) throw new Error(h.error)
      setGesundheit(h)
      setDeadLetter(dl.eintraege ?? [])
      if (bm.bestaetigungswort) setBestaetigungswort(bm.bestaetigungswort)
      setFehler(null)
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => { holen() }, [holen])

  async function deadLetterAktion(id: string, body: Record<string, unknown>) {
    setMeldung(null)
    const res = await fetch('/api/billing/dta/dead-letter', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    })
    const daten = await res.json()
    if (!res.ok) { setFehler(daten.error); return }
    setMeldung(daten.hinweis ?? 'Eintrag aktualisiert.')
    holen()
  }

  if (laden && !gesundheit) return <div className="admin-page"><p>Lade Betriebszustand…</p></div>

  return (
    <div className="admin-page">
      <h1>Betrieb der Kassenabrechnung</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 8 }}>
        Zustand der Übertragungskanäle, Zugangsmittel und der Fehlerqueue.
        {gesundheit && <> Stand: {datum(gesundheit.geprueftAm)}.</>}
      </p>
      <p style={{ marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/admin/kassenabrechnung">← Kassenabrechnung</Link>
        <Link href="/admin/kassenabrechnung/readiness">→ Bereitschaft (Readiness)</Link>
        <Link href="/admin/kassenabrechnung/wiedervorlage">→ Rückläufer &amp; Wiedervorlagen</Link>
        <button onClick={holen} style={sekundaerBtn}>Neu laden</button>
      </p>

      {fehler && <Banner tone="danger">{fehler}</Banner>}
      {meldung && <Banner tone="info">{meldung}</Banner>}

      {gesundheit && (
        <>
          <div className="admin-card" style={{ marginBottom: 24, borderLeft: `4px solid ${AMPEL_FARBE[gesundheit.gesamt]}` }}>
            <h2 style={{ marginTop: 0 }}>
              Gesamtzustand: <span style={{ color: AMPEL_FARBE[gesundheit.gesamt] }}>{AMPEL_TEXT[gesundheit.gesamt]}</span>
            </h2>
            {gesundheit.handlungsbedarf.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Kein offener Handlungsbedarf.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {gesundheit.handlungsbedarf.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            )}
            <p style={{ marginTop: 12, marginBottom: 0, fontSize: 14, color: 'var(--muted)' }}>
              Offene Wiedervorlagen: {gesundheit.wiedervorlage.gesamt} ({gesundheit.wiedervorlage.ueberfaellig} überfällig),
              {' '}offener Betrag {euro(gesundheit.wiedervorlage.offenerBetragCent)} ·
              {' '}Fehlerqueue: {gesundheit.deadLetter.offen} von {gesundheit.deadLetter.gesamt}
            </p>
          </div>

          <h2>Kanäle</h2>
          <div style={{ display: 'grid', gap: 16, marginBottom: 32 }}>
            {gesundheit.kanaele.map(k => (
              <KanalKarte
                key={k.kanal}
                kanal={k}
                bestaetigungswort={bestaetigungswort}
                offen={umschalten === k.kanal}
                aufOeffnen={() => setUmschalten(umschalten === k.kanal ? null : k.kanal)}
                aufFertig={(text) => { setMeldung(text); setUmschalten(null); holen() }}
                aufFehler={setFehler}
              />
            ))}
          </div>

          <h2>Zugangsmittel</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 12 }}>
            Zertifikate und Schlüssel liegen im privaten Speicher, Passwörter in Umgebungsvariablen.
            Diese Ansicht zeigt nur, <em>ob</em> etwas hinterlegt ist und wann es abläuft — niemals den Wert.
          </p>
          <table className="admin-table" style={{ marginBottom: 32 }}>
            <thead>
              <tr>
                <th>Zugangsmittel</th>
                <th>Ablage</th>
                <th>Stand</th>
                <th>Läuft ab</th>
                <th>Letzter Austausch</th>
              </tr>
            </thead>
            <tbody>
              {gesundheit.credentials.eintraege.map(c => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.label}</strong>
                    {c.externOffen && (
                      <div style={{ fontSize: 12, color: '#f59e0b' }}>
                        Extern blockiert — {c.beschaffung}
                      </div>
                    )}
                    {c.offenePunkte.length > 0 && !c.externOffen && (
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--muted)' }}>
                        {c.offenePunkte.map((p, i) => <li key={i}>{p}</li>)}
                      </ul>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all' }}>
                    {c.art === 'env' ? 'Umgebungsvariable' : 'Speicher'}
                    <br />{c.ort ?? '— steht noch nicht fest —'}
                  </td>
                  <td>
                    <span style={{ color: AMPEL_FARBE[c.ampel], fontWeight: 600 }}>
                      {c.vorhanden}{c.erwartet !== null ? ` / ${c.erwartet}` : ''}
                    </span>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.hinweis}</div>
                  </td>
                  <td>{c.laeuftAbAm ? `${c.laeuftAbAm}${c.tageBisAblauf !== null ? ` (${c.tageBisAblauf} T.)` : ''}` : '—'}</td>
                  <td>{datum(c.letzteRotationAm)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>
            Fehlerqueue{' '}
            <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--muted)' }}>
              (nicht zustellbar — {gesundheit.deadLetter.offen} offen)
            </span>
          </h2>
          <p style={{ color: 'var(--muted)', marginBottom: 12 }}>
            Jeder Eintrag ist eine Abrechnung, die die Kasse nicht erhalten hat. Wiedervorlegen setzt den
            Auftrag zurück auf „bereit zur Übermittlung“ — der Versand wird dabei bewusst <em>nicht</em>
            {' '}automatisch gestartet.
          </p>
          {deadLetter.length === 0 ? (
            <p style={{ color: 'var(--muted)', marginBottom: 32 }}>Nichts offen.</p>
          ) : (
            <table className="admin-table" style={{ marginBottom: 32 }}>
              <thead>
                <tr>
                  <th>Eingestellt</th>
                  <th>Kanal</th>
                  <th>Datei / Empfänger</th>
                  <th>Grund</th>
                  <th>Versuche</th>
                  <th>Status</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {deadLetter.map(e => (
                  <tr key={e.id}>
                    <td>{datum(e.createdAt)}</td>
                    <td>{e.kanal}</td>
                    <td>
                      {e.dateiName ?? '—'}
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {e.empfaengerIk ? `IK ${e.empfaengerIk}` : ''}
                      </div>
                    </td>
                    <td>
                      {e.grundText}
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {e.letztePhase ? `Phase: ${e.letztePhase}. ` : ''}{e.fehlerMeldung ?? ''}
                      </div>
                    </td>
                    <td>{e.versuche}</td>
                    <td>{e.status}</td>
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {e.status === 'offen' && (
                        <button style={sekundaerBtn} onClick={() => deadLetterAktion(e.id, { status: 'in_analyse' })}>
                          In Analyse
                        </button>
                      )}
                      <button style={sekundaerBtn} onClick={() => deadLetterAktion(e.id, { aktion: 'wiedervorlegen' })}>
                        Wiedervorlegen
                      </button>
                      <button
                        style={sekundaerBtn}
                        onClick={() => {
                          const grund = window.prompt(
                            'Warum wird diese Abrechnung nicht weiterverfolgt? (Pflichtangabe)',
                          )
                          if (grund?.trim()) deadLetterAktion(e.id, { status: 'verworfen', verworfen_grund: grund })
                        }}
                      >
                        Verwerfen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}

// ── Kanalkarte mit Umschalter ───────────────────────────────────

function KanalKarte({
  kanal, bestaetigungswort, offen, aufOeffnen, aufFertig, aufFehler,
}: {
  kanal: KanalGesundheit
  bestaetigungswort: string
  offen: boolean
  aufOeffnen: () => void
  aufFertig: (meldung: string) => void
  aufFehler: (fehler: string) => void
}) {
  const [begruendung, setBegruendung] = useState('')
  const [bestaetigung, setBestaetigung] = useState('')
  const [testAm, setTestAm] = useState('')
  const [testReferenz, setTestReferenz] = useState('')
  const [testStelle, setTestStelle] = useState('')
  const [sendet, setSendet] = useState(false)

  const zielModus = kanal.betriebsmodus.modus === 'produktion' ? 'test' : 'produktion'

  async function umschalten() {
    setSendet(true)
    try {
      const res = await fetch('/api/admin/abrechnung/betriebsmodus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kanal: kanal.kanal,
          modus: zielModus,
          begruendung,
          bestaetigung,
          testuebertragung_am: testAm || undefined,
          testuebertragung_referenz: testReferenz || undefined,
          testuebertragung_stelle: testStelle || undefined,
        }),
      })
      const daten = await res.json()
      if (!res.ok) { aufFehler(daten.error); return }
      aufFertig(
        `Kanal ${kanal.label} steht jetzt auf "${daten.modusNachher}". `
        + `Dateiindikator: ${daten.effektiverDateiindikator}.`
        + (daten.hinweis ? ` ${daten.hinweis}` : ''),
      )
      setBegruendung(''); setBestaetigung(''); setTestAm(''); setTestReferenz(''); setTestStelle('')
    } finally {
      setSendet(false)
    }
  }

  return (
    <div className="admin-card" style={{ borderLeft: `4px solid ${AMPEL_FARBE[kanal.ampel]}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{kanal.label}</h3>
        <span style={{ color: AMPEL_FARBE[kanal.ampel], fontWeight: 600 }}>{AMPEL_TEXT[kanal.ampel]}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '12px 0' }}>
        <Feld label="Freigabe" wert={kanal.gate.offen ? 'offen' : 'gesperrt'} hinweis={kanal.gate.envVariable} />
        <Feld
          label="Betriebsmodus"
          wert={kanal.betriebsmodus.modus === 'produktion' ? 'Echtbetrieb' : 'Testbetrieb'}
          hinweis={`Dateiindikator ${kanal.betriebsmodus.effektiverDateiindikator}`}
        />
        <Feld label="Letzte Übertragung" wert={datum(kanal.letzteUebertragung?.am ?? null)} />
        <Feld
          label="Warteschlange"
          wert={String(kanal.warteschlange.versandbereit)}
          hinweis={kanal.warteschlange.tageWartend !== null ? `ältester: ${kanal.warteschlange.tageWartend} Tage` : undefined}
        />
        <Feld label="Offene Rückläufer" wert={String(kanal.ruecklaeufer.offen)} />
        <Feld label="Fehlerqueue" wert={String(kanal.deadLetter.offen)} />
      </div>

      <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 14 }}>
        {kanal.befunde.map((b, i) => <li key={i}>{b}</li>)}
      </ul>

      <button style={sekundaerBtn} onClick={aufOeffnen}>
        {offen ? 'Abbrechen' : zielModus === 'produktion' ? 'Auf Echtbetrieb umstellen' : 'Zurück in den Testbetrieb'}
      </button>

      {offen && (
        <div style={{ marginTop: 16, padding: 16, background: 'var(--coal2)', borderRadius: 8 }}>
          {zielModus === 'produktion' ? (
            <Banner tone="warn">
              Ab dem Umschalten tragen erzeugte Dateien den Dateiindikator 2 und lösen bei der Kasse
              eine Forderung aus. Voraussetzung ist eine von der Annahmestelle bestätigte
              Testübertragung.
            </Banner>
          ) : (
            <Banner tone="info">
              Zurück in den Testbetrieb: erzeugte Dateien tragen wieder den Indikator 0 und werden von
              der Annahmestelle folgenlos verarbeitet.
            </Banner>
          )}

          <label style={feldLabel}>Begründung (Pflicht)</label>
          <input style={feldInput} value={begruendung} onChange={e => setBegruendung(e.target.value)}
            placeholder="Warum wird jetzt umgeschaltet?" />

          {zielModus === 'produktion' && (
            <>
              <label style={feldLabel}>Datum der bestandenen Testübertragung (JJJJ-MM-TT)</label>
              <input style={feldInput} value={testAm} onChange={e => setTestAm(e.target.value)}
                placeholder="2026-09-01" />

              <label style={feldLabel}>Beleg der Annahmestelle (Ticket-, Protokoll- oder Mailreferenz)</label>
              <input style={feldInput} value={testReferenz} onChange={e => setTestReferenz(e.target.value)} />

              <label style={feldLabel}>Annahmestelle (optional)</label>
              <input style={feldInput} value={testStelle} onChange={e => setTestStelle(e.target.value)} />

              <label style={feldLabel}>Zur Bestätigung „{bestaetigungswort}“ eingeben</label>
              <input style={feldInput} value={bestaetigung} onChange={e => setBestaetigung(e.target.value)} />
            </>
          )}

          <button style={{ ...sekundaerBtn, marginTop: 12 }} disabled={sendet} onClick={umschalten}>
            {sendet ? 'Wird gesetzt…' : `Umschalten auf ${zielModus === 'produktion' ? 'Echtbetrieb' : 'Testbetrieb'}`}
          </button>
        </div>
      )}
    </div>
  )
}

function Feld({ label, wert, hinweis }: { label: string; wert: string; hinweis?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{wert}</div>
      {hinweis && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{hinweis}</div>}
    </div>
  )
}

const sekundaerBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit',
}

const feldLabel: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 12, marginBottom: 4,
}

const feldInput: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--coal)', color: 'inherit',
  fontFamily: 'inherit', fontSize: 14,
}
