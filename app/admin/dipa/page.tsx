'use client'
// ═══════════════════════════════════════════════════════════════
// DiPA-Verwaltung (Block 15) — Betriebs-Seite des PflegeCoach
//
// WICHTIG: Diese Seite zeigt KEINE Gesundheitsdaten. Der PflegeCoach ist
// ein eigenständiges Produkt mit nutzer-eigener Datenhaltung; Admins
// haben darauf bewusst keinen Zugriff (Trennungsgebot). Hier gibt es nur:
// Freischaltcodes, aggregierte Nutzungskennzahlen, Abrechnungswege und
// den Anforderungskatalog.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banner, EmptyRow } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, SchalterFeld, TextFeld,
  Tabs, pflegeMiniBtn, pflegePrimaryBtn,
} from '@/components/admin/PflegeUI'
import {
  KATEGORIE_LABELS, STAND_LABELS,
  katalogFortschritt, katalogNachKategorie,
} from '@/lib/coach/anforderungskatalog'
import { antragsreife, formatiereBlocker } from '@/lib/coach/dipa-compliance'
import { ABRECHNUNGSWEG_VORLAGEN } from '@/lib/coach/abrechnung'
import { FREISCHALT_QUELLE_LABELS, FREISCHALT_QUELLEN } from '@/lib/coach/freischaltung'
import type { NutzungsAuswertung } from '@/lib/coach/nachweise'
import { EREIGNIS_LABELS, MIN_GRUPPENGROESSE } from '@/lib/coach/nachweise'
import type { CoachAbrechnungsweg, CoachFreischaltcode } from '@/lib/coach/types'

type TabKey = 'codes' | 'nachweise' | 'abrechnung' | 'katalog' | 'schalter'

const CODE_STATUS_LABELS: Record<string, string> = {
  ausgegeben: 'Ausgegeben',
  eingeloest: 'Eingelöst',
  abgelaufen: 'Abgelaufen',
  storniert: 'Zurückgezogen',
}

export default function AdminDipaPage() {
  const [tab, setTab] = useState<TabKey>('codes')
  const [error, setError] = useState('')

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Digitaler PflegeCoach — Verwaltung</h1>
          <p className="admin-subtitle">
            Freischaltung, Nachweise, Abrechnungswege und Zulassungsanforderungen
          </p>
        </div>
      </div>

      <Banner tone="info">
        Diese Seite enthält keine Gesundheitsdaten der PflegeCoach-Nutzer. Der Zugriff darauf ist
        für Administratoren technisch ausgeschlossen — sichtbar sind nur Berechtigungs-,
        Abrechnungs- und aggregierte Auswertungsdaten.
      </Banner>

      {error && <Banner tone="danger">{error}</Banner>}

      <Tabs<TabKey>
        tabs={[
          { key: 'codes', label: 'Freischaltcodes' },
          { key: 'nachweise', label: 'Nutzungsnachweise' },
          { key: 'abrechnung', label: 'Abrechnungswege' },
          { key: 'katalog', label: 'Anforderungskatalog' },
          { key: 'schalter', label: 'Schalter & Regulatorik' },
        ]}
        aktiv={tab}
        onChange={setTab}
      />

      {tab === 'codes' && <CodesTab onError={setError} />}
      {tab === 'nachweise' && <NachweiseTab onError={setError} />}
      {tab === 'abrechnung' && <AbrechnungTab onError={setError} />}
      {tab === 'katalog' && <KatalogTab />}
      {tab === 'schalter' && <SchalterTab onError={setError} />}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// Freischaltcodes
// ───────────────────────────────────────────────────────────────

function CodesTab({ onError }: { onError: (m: string) => void }) {
  const [codes, setCodes] = useState<CoachFreischaltcode[]>([])
  const [pepperOk, setPepperOk] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [neuerCode, setNeuerCode] = useState<string | null>(null)

  const [quelle, setQuelle] = useState<string>('pflegekasse')
  const [ik, setIk] = useState('')
  const [genehmigtAm, setGenehmigtAm] = useState('')
  const [gueltigBis, setGueltigBis] = useState('')
  const [notiz, setNotiz] = useState('')

  const laden = useCallback(() => {
    fetch('/api/dipa/codes')
      .then(r => r.json())
      .then(body => {
        if (body.error) { onError(body.error); return }
        setCodes(body.codes || [])
        setPepperOk(Boolean(body.pepperKonfiguriert))
      })
      .catch(() => onError('Codes konnten nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [onError])

  useEffect(laden, [laden])

  async function ausstellen() {
    setBusy(true)
    setNeuerCode(null)
    try {
      const res = await fetch('/api/dipa/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quelle,
          kostentraeger_ik: ik || null,
          genehmigt_am: genehmigtAm || null,
          gueltig_bis: gueltigBis || null,
          notiz: notiz || null,
        }),
      })
      const body = await res.json()
      if (body.error) { onError(body.error); return }
      setNeuerCode(body.klartext)
      setNotiz('')
      laden()
    } catch {
      onError('Code konnte nicht angelegt werden.')
    } finally {
      setBusy(false)
    }
  }

  async function stornieren(id: string) {
    const res = await fetch(`/api/dipa/codes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'storniert' }),
    })
    const body = await res.json()
    if (body.error) { onError(body.error); return }
    laden()
  }

  return (
    <>
      {!pepperOk && (
        <Banner tone="warn">
          Die Umgebungsvariable COACH_CODE_PEPPER ist nicht gesetzt. Codes werden dann ohne
          zusätzlichen serverseitigen Pfeffer gehasht. Vor dem Produktivbetrieb setzen — und
          beachten: bereits ausgegebene Codes lassen sich danach nicht mehr einlösen.
        </Banner>
      )}

      <Karte titel="Neuen Freischaltcode ausstellen">
        <FeldRaster>
          <AuswahlFeld
            label="Herkunft"
            value={quelle}
            onChange={setQuelle}
            optionen={FREISCHALT_QUELLEN.map(q => [q, FREISCHALT_QUELLE_LABELS[q]] as [string, string])}
          />
          <TextFeld label="IK der Pflegekasse (optional)" value={ik} onChange={setIk} />
          <TextFeld label="Genehmigt am (optional)" value={genehmigtAm} onChange={setGenehmigtAm} type="date" />
          <TextFeld label="Gültig bis (optional)" value={gueltigBis} onChange={setGueltigBis} type="date" />
          <TextFeld label="Notiz (optional)" value={notiz} onChange={setNotiz} breit />
        </FeldRaster>
        <button style={{ ...pflegePrimaryBtn, marginTop: 12 }} onClick={ausstellen} disabled={busy}>
          {busy ? 'Wird ausgestellt …' : 'Code ausstellen'}
        </button>

        {neuerCode && (
          <div style={{ marginTop: 12 }}>
            <Banner tone="success">
              Code: <strong style={{ fontSize: 18, letterSpacing: 1 }}>{neuerCode}</strong>
              <br />
              Jetzt notieren — der Code wird nicht gespeichert und kann später nicht erneut
              angezeigt werden.
            </Banner>
          </div>
        )}
      </Karte>

      <Karte titel={`Ausgegebene Codes (${codes.length})`}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Präfix</th>
              <th>Herkunft</th>
              <th>Gültig</th>
              <th>Status</th>
              <th>Eingelöst am</th>
              <th>Notiz</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <EmptyRow colSpan={7}>Wird geladen …</EmptyRow>}
            {!loading && !codes.length && <EmptyRow colSpan={7}>Noch keine Codes ausgestellt.</EmptyRow>}
            {codes.map(c => (
              <tr key={c.id}>
                <td>{c.code_praefix}…</td>
                <td>{FREISCHALT_QUELLE_LABELS[c.quelle] ?? c.quelle}</td>
                <td>
                  {formatDatum(c.gueltig_von)}
                  {c.gueltig_bis ? ` – ${formatDatum(c.gueltig_bis)}` : ' – unbefristet'}
                </td>
                <td>{CODE_STATUS_LABELS[c.status] ?? c.status}</td>
                <td>{c.eingeloest_am ? formatDatum(c.eingeloest_am) : '—'}</td>
                <td>{c.notiz ?? '—'}</td>
                <td>
                  {c.status === 'ausgegeben' && (
                    <button style={pflegeMiniBtn} onClick={() => stornieren(c.id)}>Zurückziehen</button>
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

// ───────────────────────────────────────────────────────────────
// Nutzungsnachweise (aggregiert)
// ───────────────────────────────────────────────────────────────

function NachweiseTab({ onError }: { onError: (m: string) => void }) {
  const [auswertung, setAuswertung] = useState<NutzungsAuswertung | null>(null)
  const [loading, setLoading] = useState(true)
  const [von, setVon] = useState('')
  const [bis, setBis] = useState('')

  const laden = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (von) params.set('von', von)
    if (bis) params.set('bis', bis)
    fetch(`/api/dipa/nachweise?${params.toString()}`)
      .then(r => r.json())
      .then(body => {
        if (body.error) { onError(body.error); return }
        setAuswertung(body.auswertung)
      })
      .catch(() => onError('Nachweisdaten konnten nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [von, bis, onError])

  useEffect(() => { laden() }, [laden])

  return (
    <>
      <Banner tone="info">
        Nutzungskennzahlen auf Basis pseudonymisierter Ereignisse — keine Aussage über
        Wirksamkeit. Unter {MIN_GRUPPENGROESSE} Teilnehmenden werden keine Details ausgewiesen,
        weil eine Kennzahl dann faktisch ein Einzeldatensatz wäre.
      </Banner>

      <Karte titel="Zeitraum">
        <FeldRaster>
          <TextFeld label="Von (Auswertungswoche)" value={von} onChange={setVon} type="date" />
          <TextFeld label="Bis (Auswertungswoche)" value={bis} onChange={setBis} type="date" />
        </FeldRaster>
      </Karte>

      {loading && <Karte titel="Auswertung"><p>Wird geladen …</p></Karte>}

      {!loading && auswertung && (
        <>
          <Karte titel="Überblick">
            <p style={{ margin: 0 }}>
              Teilnehmende: <strong>{auswertung.teilnehmende}</strong>
              {' · '}Ereignisse: <strong>{auswertung.gesamtEreignisse}</strong>
              {auswertung.anteilRegelmaessig !== null && (
                <>
                  {' · '}Regelmäßig genutzt (≥ 4 Wochen):{' '}
                  <strong>{Math.round(auswertung.anteilRegelmaessig * 100)} %</strong>
                </>
              )}
            </p>
            {auswertung.unterdrueckt && (
              <p style={{ marginBottom: 0 }}>
                Zu wenige Teilnehmende für eine Auswertung — es werden keine weiteren Kennzahlen
                angezeigt.
              </p>
            )}
          </Karte>

          {!auswertung.unterdrueckt && (
            <>
              <Karte titel="Ereignisse nach Art">
                <table className="admin-table">
                  <thead><tr><th>Ereignis</th><th>Anzahl</th></tr></thead>
                  <tbody>
                    {!auswertung.jeEreignis.length && <EmptyRow colSpan={2}>Keine Daten.</EmptyRow>}
                    {auswertung.jeEreignis.map(e => (
                      <tr key={e.ereignis}>
                        <td>{EREIGNIS_LABELS[e.ereignis] ?? e.ereignis}</td>
                        <td>{e.anzahl}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Karte>

              <Karte titel="Verlauf nach Woche">
                <table className="admin-table">
                  <thead><tr><th>Woche ab</th><th>Aktive Nutzer</th><th>Ereignisse</th></tr></thead>
                  <tbody>
                    {!auswertung.jeWoche.length && <EmptyRow colSpan={3}>Keine Daten.</EmptyRow>}
                    {auswertung.jeWoche.map(w => (
                      <tr key={w.woche}>
                        <td>{formatDatum(w.woche)}</td>
                        <td>{w.aktiveNutzer}</td>
                        <td>{w.ereignisse}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Karte>
            </>
          )}
        </>
      )}
    </>
  )
}

// ───────────────────────────────────────────────────────────────
// Abrechnungswege
// ───────────────────────────────────────────────────────────────

function AbrechnungTab({ onError }: { onError: (m: string) => void }) {
  const [wege, setWege] = useState<CoachAbrechnungsweg[]>([])
  const [loading, setLoading] = useState(true)

  const laden = useCallback(() => {
    fetch('/api/dipa/abrechnungswege')
      .then(r => r.json())
      .then(body => {
        if (body.error) { onError(body.error); return }
        setWege(body.wege || [])
      })
      .catch(() => onError('Abrechnungswege konnten nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [onError])

  useEffect(laden, [laden])

  const vorhandeneSchluessel = useMemo(() => new Set(wege.map(w => w.schluessel)), [wege])

  async function anlegen(vorlageIndex: number) {
    const v = ABRECHNUNGSWEG_VORLAGEN[vorlageIndex]
    const res = await fetch('/api/dipa/abrechnungswege', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schluessel: v.schluessel,
        bezeichnung: v.bezeichnung,
        beschreibung: v.beschreibung,
        rechtsgrundlage: v.rechtsgrundlage,
      }),
    })
    const body = await res.json()
    if (body.error) { onError(body.error); return }
    laden()
  }

  async function aendern(id: string, feld: 'aktiv' | 'verguetung_geklaert', wert: boolean) {
    const res = await fetch('/api/dipa/abrechnungswege', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [feld]: wert }),
    })
    const body = await res.json()
    if (body.error) { onError(body.error); return }
    laden()
  }

  return (
    <>
      <Banner tone="warn">
        Hier werden ausschließlich Abrechnungs<em>wege</em> konfiguriert — bewusst ohne Preise und
        Vergütungshöhen. Diese ergeben sich erst aus dem Zulassungs- und Vertragsverfahren.
        Solange „Vergütung geklärt" nicht gesetzt ist, ist über den Weg keine Abrechnung möglich.
      </Banner>

      <Karte titel="Vorlagen">
        <table className="admin-table">
          <thead><tr><th>Bezeichnung</th><th>Zu prüfende Grundlage</th><th>Voraussetzungen</th><th></th></tr></thead>
          <tbody>
            {ABRECHNUNGSWEG_VORLAGEN.map((v, i) => (
              <tr key={v.schluessel}>
                <td>{v.bezeichnung}</td>
                <td>{v.rechtsgrundlage}</td>
                <td>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {v.voraussetzungen.map(x => <li key={x}>{x}</li>)}
                  </ul>
                </td>
                <td>
                  {vorhandeneSchluessel.has(v.schluessel)
                    ? <span>angelegt</span>
                    : <button style={pflegeMiniBtn} onClick={() => anlegen(i)}>Anlegen</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>

      <Karte titel={`Konfigurierte Wege (${wege.length})`}>
        <table className="admin-table">
          <thead><tr><th>Bezeichnung</th><th>Schlüssel</th><th>Aktiv</th><th>Vergütung geklärt</th></tr></thead>
          <tbody>
            {loading && <EmptyRow colSpan={4}>Wird geladen …</EmptyRow>}
            {!loading && !wege.length && <EmptyRow colSpan={4}>Noch kein Abrechnungsweg konfiguriert.</EmptyRow>}
            {wege.map(w => (
              <tr key={w.id}>
                <td>{w.bezeichnung}</td>
                <td><code>{w.schluessel}</code></td>
                <td>
                  <SchalterFeld label="" value={w.aktiv} onChange={v => aendern(w.id, 'aktiv', v)} />
                </td>
                <td>
                  <SchalterFeld
                    label=""
                    value={w.verguetung_geklaert}
                    onChange={v => aendern(w.id, 'verguetung_geklaert', v)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>
    </>
  )
}

// ───────────────────────────────────────────────────────────────
// Anforderungskatalog
// ───────────────────────────────────────────────────────────────

function KatalogTab() {
  const fortschritt = katalogFortschritt()
  const gruppen = katalogNachKategorie()
  const reife = antragsreife()

  return (
    <>
      <Banner tone={reife.bereit ? 'success' : 'danger'}>
        {reife.bereit ? (
          <>Antragsreife (Zeitklasse A): kein offener Pflichtpunkt mehr.</>
        ) : (
          <>
            Antragsreife (Zeitklasse A): <strong>{reife.blocker.length}</strong> offene(r)
            Pflichtpunkt(e) vor Antragstellung — {reife.blockerIntern} intern (Klasse A–C),{' '}
            {reife.blockerExtern} extern (Klasse D–E). Live berechnet aus diesem Katalog, ersetzt
            die manuell gepflegte Liste in docs/dipa/.
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {reife.blocker.map(e => (
                <li key={e.id} style={{ fontSize: 12 }}>{formatiereBlocker(e)}</li>
              ))}
            </ul>
          </>
        )}
      </Banner>

      <Banner tone="warn">
        Der Katalog enthält bewusst KEINE ausformulierten Verordnungstexte. Maßgeblich sind die
        Originaldokumente in der zum Antragszeitpunkt gültigen Fassung. Einträge, deren
        Anforderungstext noch nicht gegen das Original geprüft wurde, zählen nicht als erfüllt —
        aktuell {fortschritt.ungeprueft} von {fortschritt.gesamt}.
      </Banner>

      <Karte titel="Stand">
        <p style={{ margin: 0 }}>
          Erfüllt (Selbsteinschätzung): <strong>{fortschritt.erfuellt}</strong>
          {' · '}In Arbeit: <strong>{fortschritt.inArbeit}</strong>
          {' · '}Offen: <strong>{fortschritt.offen}</strong>
          {' · '}Belastbar erfüllt (mit geprüftem Anforderungstext):{' '}
          <strong>{Math.round(fortschritt.quote * 100)} %</strong>
        </p>
      </Karte>

      {gruppen.map(g => (
        <Karte key={g.kategorie} titel={KATEGORIE_LABELS[g.kategorie]}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Arbeitsfassung</th>
                <th>Quelle</th>
                <th>Stand</th>
                <th>Nachweis</th>
                <th>Gap</th>
              </tr>
            </thead>
            <tbody>
              {g.eintraege.map(e => (
                <tr key={e.id}>
                  <td>{e.id}</td>
                  <td>
                    {e.formulierung}
                    {!e.anforderungstextGeprueft && (
                      <div style={{ fontSize: 11, color: 'var(--ink5)' }}>Originaltext noch nicht geprüft</div>
                    )}
                  </td>
                  <td>{e.quelle}</td>
                  <td>{STAND_LABELS[e.stand]}</td>
                  <td>{e.nachweis ?? '—'}</td>
                  <td>{e.gapId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Karte>
      ))}
    </>
  )
}

function formatDatum(wert: string): string {
  const iso = wert.slice(0, 10)
  const [j, m, t] = iso.split('-')
  return t && m && j ? `${t}.${m}.${j}` : iso
}

// ───────────────────────────────────────────────────────────────
// Schalter & Regulatorik
//
// Diese Ansicht beantwortet die Frage, die man am Tag einer Freigabe
// stellt: „Was ist gerade scharf, und was fehlt, bevor mehr scharf
// werden darf?" Sie zieht ihren Inhalt über /api/dipa/schalter, weil
// process.env in einer Client-Komponente leer ist — eine hier
// eingebaute Auswertung würde alles als „nicht gesetzt" anzeigen und
// damit das Gegenteil von dem behaupten, was gilt.
//
// Es werden ZUSTÄNDE angezeigt, keine Werte: Unter den Schaltern sind
// ein Pepper und ein Signaturschlüssel (siehe Kopf der Route).
// ───────────────────────────────────────────────────────────────

interface SchalterZeile {
  env: string
  titel: string
  modul: string
  wirkung: string
  voraussetzung: string
  risiko: string
  freigabeweg: 'intern' | 'extern' | 'entfaellt'
  sicherer_stand: 'aus' | 'an' | 'wert_noetig'
  zulassungsgebunden: boolean
  gesetzt: boolean
  aktiv: boolean
  abweichung: boolean
}

interface SchalterAntwort {
  stand: SchalterZeile[]
  eingangsblocker: Array<{
    katalog_id: string
    kurz: string
    ausstellende_stelle: string
    begruendung: string
    fundstelle: string
  }>
  leistungsanspruch: {
    norm: string
    dipa_euro_pro_monat: number
    eul_euro_pro_monat: number
    gemeinsamer_deckel_euro: number | null
    bezugszeitraum: string
  }
  regulatorik_stand: string
}

const FREIGABEWEG_LABELS: Record<SchalterZeile['freigabeweg'], string> = {
  intern: 'Interne Entscheidung',
  extern: 'Externe Freigabe nötig',
  entfaellt: 'Entfällt',
}

function zustandsText(z: SchalterZeile): string {
  if (z.sicherer_stand === 'wert_noetig') return z.gesetzt ? 'Wert gesetzt' : 'Kein Wert'
  return z.aktiv ? 'An' : 'Aus'
}

function SchalterTab({ onError }: { onError: (m: string) => void }) {
  const [daten, setDaten] = useState<SchalterAntwort | null>(null)
  const [laedt, setLaedt] = useState(true)

  useEffect(() => {
    let aktiv = true
    fetch('/api/dipa/schalter')
      .then(async r => {
        if (!r.ok) throw new Error('Schalterstand konnte nicht geladen werden.')
        return r.json() as Promise<SchalterAntwort>
      })
      .then(d => { if (aktiv) setDaten(d) })
      .catch(e => { if (aktiv) onError(e instanceof Error ? e.message : 'Unbekannter Fehler.') })
      .finally(() => { if (aktiv) setLaedt(false) })
    return () => { aktiv = false }
  }, [onError])

  if (laedt) return <Karte titel="Schalter"><p style={{ margin: 0 }}>Wird geladen …</p></Karte>
  if (!daten) return <Karte titel="Schalter"><p style={{ margin: 0 }}>Kein Schalterstand verfügbar.</p></Karte>

  const gebunden = daten.stand.filter(z => z.zulassungsgebunden)
  const scharf = gebunden.filter(z => z.abweichung)
  const uebrige = daten.stand.filter(z => !z.zulassungsgebunden)

  return (
    <>
      <Banner tone={scharf.length === 0 ? 'success' : 'danger'}>
        {scharf.length === 0 ? (
          <>
            Alle {gebunden.length} zulassungsgebundenen Schalter stehen auf dem sicheren Stand.
            Das Produkt macht damit keine Aussage, die eine BfArM-Listung voraussetzen würde.
          </>
        ) : (
          <>
            <strong>{scharf.length}</strong> zulassungsgebundene(r) Schalter ist/sind scharf,
            ohne dass eine Listung im DiPA-Verzeichnis vorliegt:{' '}
            {scharf.map(z => z.env).join(', ')}. Das ist kein Anzeigefehler — das Produkt
            behauptet in diesem Zustand etwas, das nicht gedeckt ist.
          </>
        )}
      </Banner>

      <Banner tone="warn">
        Eine DiPA-Zulassung liegt nicht vor. Der PflegeCoach ist dauerhaft kostenlos für
        Endnutzer; eine Vergütung durch Pflegekassen käme frühestens nach einer tatsächlichen
        Aufnahme in das DiPA-Verzeichnis in Betracht und ist derzeit weder vereinbart noch
        beantragbar.
      </Banner>

      <Karte titel="Zulassungsgebundene Schalter">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Variable</th>
              <th>Zustand</th>
              <th>Sicherer Stand</th>
              <th>Wirkung</th>
              <th>Voraussetzung für die Freigabe</th>
            </tr>
          </thead>
          <tbody>
            {gebunden.map(z => (
              <tr key={z.env}>
                <td><code>{z.env}</code><br /><span style={{ fontSize: 11, opacity: 0.7 }}>{z.titel}</span></td>
                <td>
                  <strong style={{ color: z.abweichung ? '#b42318' : undefined }}>
                    {zustandsText(z)}
                  </strong>
                </td>
                <td>{z.sicherer_stand === 'aus' ? 'Aus' : z.sicherer_stand === 'an' ? 'An' : 'Wert'}</td>
                <td style={{ fontSize: 12 }}>{z.wirkung}</td>
                <td style={{ fontSize: 12 }}>
                  <em>{FREIGABEWEG_LABELS[z.freigabeweg]}</em><br />{z.voraussetzung}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>

      <Karte titel="Übrige Schalter (Sicherheit, Steuer, Zahlungsanbindung)">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Variable</th>
              <th>Zustand</th>
              <th>Modul</th>
              <th>Wirkung</th>
            </tr>
          </thead>
          <tbody>
            {uebrige.map(z => (
              <tr key={z.env}>
                <td><code>{z.env}</code><br /><span style={{ fontSize: 11, opacity: 0.7 }}>{z.titel}</span></td>
                <td>
                  {zustandsText(z)}
                  {z.abweichung && (
                    <><br /><span style={{ fontSize: 11, color: '#b54708' }}>weicht ab</span></>
                  )}
                </td>
                <td style={{ fontSize: 11 }}><code>{z.modul}</code></td>
                <td style={{ fontSize: 12 }}>{z.wirkung}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 12, opacity: 0.75, marginBottom: 0 }}>
          Angezeigt wird ausschließlich, OB eine Variable gesetzt ist — nie ihr Inhalt. Unter
          diesen Schaltern sind ein Pepper und ein Signaturschlüssel.
        </p>
      </Karte>

      <Karte titel="Eingangsblocker — ohne diese ist der Antrag nicht formal vollständig">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Katalog</th>
              <th>Nachweis</th>
              <th>Ausstellende Stelle</th>
              <th>Fundstelle</th>
            </tr>
          </thead>
          <tbody>
            {daten.eingangsblocker.map(b => (
              <tr key={b.katalog_id}>
                <td><code>{b.katalog_id}</code></td>
                <td>{b.kurz}<br /><span style={{ fontSize: 11, opacity: 0.7 }}>{b.begruendung}</span></td>
                <td style={{ fontSize: 12 }}>{b.ausstellende_stelle}</td>
                <td style={{ fontSize: 11 }}>{b.fundstelle}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 12, opacity: 0.75, marginBottom: 0 }}>
          Keiner dieser Punkte ist intern erzeugbar oder nachreichbar. Sie bestimmen den
          kritischen Pfad allein.
        </p>
      </Karte>

      <Karte titel="Leistungsanspruch der versicherten Person (nach einer Aufnahme)">
        <p style={{ margin: 0 }}>
          <strong>{daten.leistungsanspruch.norm}</strong> — {daten.leistungsanspruch.dipa_euro_pro_monat} €
          für die digitale Pflegeanwendung und {daten.leistungsanspruch.eul_euro_pro_monat} € für
          ergänzende Unterstützungsleistungen, je {daten.leistungsanspruch.bezugszeitraum}.
          Zwei getrennte Beträge{daten.leistungsanspruch.gemeinsamer_deckel_euro === null
            ? ' — es gibt keinen gemeinsamen Höchstbetrag'
            : ''}; sie sind nicht gegeneinander verschiebbar.
        </p>
        <p style={{ fontSize: 12, opacity: 0.75, marginBottom: 0 }}>
          Das ist der Anspruch der versicherten Person, nicht eine Einnahme von Alltagsengel. Ein
          Vergütungsbetrag für den PflegeCoach existiert nicht; er entstünde erst aus einer
          Vereinbarung nach § 78a Abs. 1 SGB XI. Stand der Konstanten: {daten.regulatorik_stand}.
        </p>
      </Karte>
    </>
  )
}
