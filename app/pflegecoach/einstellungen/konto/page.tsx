'use client'

// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Konto, Vertrag und Nutzung beenden
//
// Warum diese Seite eigenständig ist: In den Einstellungen stehen die
// laufenden Stellschrauben (Profil, einzelne Einwilligungen, Export).
// Hier steht alles, was den VERTRAG und den AUSSTIEG betrifft — und
// zwar vollständig an EINER Stelle: Stand, Geld, aufhören, mitnehmen,
// löschen.
//
// ═══ REIHENFOLGE IST ABSICHT ═══════════════════════════════════
// Zuerst der Vertrag (Zugang, Zahlungen, Kündigung, Widerruf), danach
// der Datenteil. Wer hierher kommt, will meist eines von zwei Dingen:
// wissen, was abgebucht wird, oder aufhören. Beides steht oben und
// nicht hinter einem Datenschutz-Abschnitt.
//
// ═══ FÜNF GETRENNTE DINGE, DIE NICHT VERMISCHT WERDEN DÜRFEN ═══
//  1. WIDERRUF (14 Tage)  → Vertrag gilt als nie geschlossen, Zugang
//     endet sofort, voller Betrag zurück.
//  2. KÜNDIGUNG           → Zugang läuft bis Periodenende weiter, keine
//     Erstattung, keine Verlängerung.
//  3. NUTZUNG BEENDEN     → Art.-9-Einwilligung widerrufen. Betrifft die
//     Datenverarbeitung, NICHT den Vertrag: Wer nur das tut, zahlt
//     weiter. Deshalb steht der Hinweis dazu ausdrücklich dort.
//  4. DATEN LÖSCHEN       → Art. 17 DSGVO, nur das Produkt.
//  5. KONTO LÖSCHEN       → gesamte Plattform.
// Eine Vermischung würde entweder Geld kosten oder Daten vernichten,
// die jemand nur zurückhalten wollte.
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { CoachConsent } from '@/lib/coach/types'
import { hatAktiveEinwilligung, PFLICHT_CONSENT } from '@/lib/coach/consent'
import { COACH_SUPPORT_EMAIL } from '@/lib/coach/version'
import { coachApi, useCoachProfil } from '../../_lib/client'
import { CoachLaden, CoachLadefehler } from '../../_lib/Zustand'

// ─── Anzeige-Typen (schmaler als die DB-Zeilen) ────────────────

interface BestellungAnzeige {
  id: string
  status: string
  tarif: string
  betrag_cent: number
  waehrung: string
  intervall_monate: number
  bestellt_am: string
  laufzeit_bis: string | null
  gekuendigt_am: string | null
  widerrufen_am: string | null
}

interface ZahlungAnzeige {
  id: string
  art: 'zahlung' | 'fehlgeschlagen' | 'erstattung'
  betrag_cent: number
  waehrung: string
  zeitraum_von: string | null
  zeitraum_bis: string | null
  fehlergrund: string | null
  gebucht_am: string
}

interface RechnungAnzeige {
  id: string
  nummer: string
  rechnungsdatum: string
  brutto_cent: number
  waehrung: string
  storniert_am: string | null
}

interface AboStand {
  bestellung: BestellungAnzeige | null
  zahlungen: ZahlungAnzeige[]
  rechnungen: RechnungAnzeige[]
  zugang: boolean
  naechste_abbuchung?: string | null
  widerruf_moeglich?: boolean
  widerruf_grund?: string | null
  widerrufsfrist_ende?: string | null
  kuendigung_moeglich?: boolean
  kuendigung_grund?: string | null
  kuendigung_wirkt_zum?: string | null
  verkauf_moeglich: boolean
}

// ─── Darstellungshelfer ────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  offen: 'Bestellung noch nicht abgeschlossen',
  aktiv: 'Aktiv',
  gekuendigt: 'Gekündigt — läuft noch',
  abgelaufen: 'Abgelaufen',
  widerrufen: 'Widerrufen',
  zahlung_offen: 'Zahlung offen',
  gesperrt: 'Gesperrt',
}

const STATUS_ERKLAERUNG: Record<string, string> = {
  offen: 'Ihre Bestellung ist noch nicht abgeschlossen. Sobald die Zahlung bestätigt ist, schalten wir Ihren Zugang frei.',
  aktiv: 'Ihr Zugang ist freigeschaltet. Sie können alle Bereiche des PflegeCoach nutzen.',
  gekuendigt: 'Sie haben gekündigt. Ihr Zugang bleibt bis zum Ende des bezahlten Zeitraums bestehen und verlängert sich danach nicht.',
  abgelaufen: 'Ihr Zugang ist abgelaufen. Ihre bisherigen Daten bleiben erhalten und können jederzeit heruntergeladen oder gelöscht werden.',
  widerrufen: 'Sie haben Ihre Bestellung widerrufen. Der Betrag wird vollständig erstattet; die Gutschrift erscheint je nach Zahlungsmittel innerhalb weniger Werktage.',
  zahlung_offen: 'Die letzte Zahlung konnte nicht eingezogen werden. Bitte hinterlegen Sie ein anderes Zahlungsmittel — Ihr Zugang bleibt vorerst bestehen.',
  gesperrt: 'Ihr Zugang ist gesperrt, weil eine Zahlung offen geblieben ist. Ihre Daten bleiben erhalten. Nach Ausgleich schalten wir den Zugang wieder frei.',
}

/** Status, bei denen die Oberfläche zum Handeln auffordern muss. */
const STATUS_WARNT = ['zahlung_offen', 'gesperrt']

const ZAHLUNG_ART_LABEL: Record<string, string> = {
  zahlung: 'Zahlung',
  fehlgeschlagen: 'Fehlgeschlagen',
  erstattung: 'Erstattung',
}

function geld(cent: number, waehrung = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: waehrung }).format(cent / 100)
}

function datum(iso: string | null | undefined): string {
  if (!iso) return '–'
  const [j, m, t] = iso.slice(0, 10).split('-')
  return t && m && j ? `${t}.${m}.${j}` : iso
}

export default function KontoSeite() {
  const { profil, laden, fehler, neuLaden } = useCoachProfil()
  const [consents, setConsents] = useState<CoachConsent[]>([])
  const [consentsGeladen, setConsentsGeladen] = useState(false)
  const [abo, setAbo] = useState<AboStand | null>(null)
  const [aboGeladen, setAboGeladen] = useState(false)
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'error'; text: string } | null>(null)
  const [laeuft, setLaeuft] = useState<string | null>(null)

  const ladeConsents = useCallback(
    () =>
      coachApi<{ consents: CoachConsent[] }>('/api/coach/consents')
        .then(r => { setConsents(r.consents); setConsentsGeladen(true) })
        .catch(e => setMeldung({ art: 'error', text: (e as Error).message })),
    []
  )

  const ladeAbo = useCallback(
    () =>
      coachApi<AboStand>('/api/coach/abo')
        .then(r => { setAbo(r); setAboGeladen(true) })
        // Der Vertragsteil darf die Seite nicht mitreißen: Wer hier ist,
        // will im Zweifel gerade seine Daten löschen. Das muss auch dann
        // gehen, wenn die Abo-Abfrage klemmt.
        .catch(() => setAboGeladen(true)),
    []
  )

  useEffect(() => {
    if (!profil) return
    ladeConsents()
    ladeAbo()
  }, [profil, ladeConsents, ladeAbo])

  if (laden) return <CoachLaden />
  if (fehler) return <CoachLadefehler fehler={fehler} neuLaden={neuLaden} />
  if (!profil) return null

  const nutzungAktiv = hatAktiveEinwilligung(consents, PFLICHT_CONSENT)
  const bestellung = abo?.bestellung ?? null

  // ─── Vertragsaktionen ──────────────────────────────────────────

  const aktion = async (
    name: 'kuendigen' | 'widerrufen' | 'zahlungsmittel',
    bestaetigung: string | null
  ) => {
    if (bestaetigung && !window.confirm(bestaetigung)) return
    setMeldung(null)
    setLaeuft(name)
    try {
      const antwort = await coachApi<{ meldung?: string; url?: string }>('/api/coach/abo', {
        method: 'POST',
        body: JSON.stringify({ aktion: name }),
      })
      if (antwort.url) {
        // Stripe-Kundenportal liegt auf fremder Domain.
        window.location.href = antwort.url
        return
      }
      setMeldung({ art: 'ok', text: antwort.meldung ?? 'Die Änderung wurde übernommen.' })
      await ladeAbo()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    } finally {
      setLaeuft(null)
    }
  }

  const beenden = async () => {
    const ok = window.confirm(
      'Nach dem Beenden nimmt der PflegeCoach keine neuen Einträge mehr entgegen — weder ' +
      'Assessments noch Ziele, Aktivitäten oder Messungen. Ihre bisherigen Daten bleiben ' +
      'lesbar und exportierbar, bis Sie die Löschung veranlassen. Sie können jederzeit wieder ' +
      'einsteigen. Nutzung jetzt beenden?'
    )
    if (!ok) return
    setMeldung(null)
    try {
      await coachApi('/api/coach/consents', {
        method: 'POST',
        body: JSON.stringify({ consent_typ: PFLICHT_CONSENT, erteilt: false }),
      })
      setMeldung({ art: 'ok', text: 'Die Nutzung ist beendet. Ihre Daten bleiben vorerst erhalten.' })
      await ladeConsents()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    }
  }

  const wiederAufnehmen = async () => {
    setMeldung(null)
    try {
      await coachApi('/api/coach/consents', {
        method: 'POST',
        body: JSON.stringify({ consent_typ: PFLICHT_CONSENT, erteilt: true }),
      })
      setMeldung({ art: 'ok', text: 'Die Nutzung ist wieder freigeschaltet.' })
      await ladeConsents()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    }
  }

  return (
    <>
      <h1 className="pc-h1">Konto, Vertrag und Nutzung beenden</h1>
      <p className="pc-lead">
        Hier sehen Sie Ihren Zugang und Ihre Zahlungen, kündigen oder widerrufen, nehmen Ihre
        Daten mit oder löschen sie. Sie entscheiden bei jedem Schritt einzeln.
      </p>

      {meldung && (
        <p
          className={`pc-feedback pc-feedback--${meldung.art}`}
          role={meldung.art === 'error' ? 'alert' : 'status'}
        >
          {meldung.text}
        </p>
      )}

      {/* ═══ VERTRAG ═══════════════════════════════════════════ */}

      <section className="pc-card" aria-labelledby="zugang-titel">
        <h2 id="zugang-titel">Ihr Zugang</h2>

        {!aboGeladen && <p>Wird geladen …</p>}

        {aboGeladen && !bestellung && (
          <>
            <p>
              <strong>Der PflegeCoach ist für Sie kostenlos.</strong> Es liegt keine Bestellung
              vor und es wird auch keine benötigt — Sie haben vollen Zugang ohne Kosten, ohne
              Abonnement und ohne Kreditkarte.
            </p>
            {abo?.verkauf_moeglich && (
              <Link className="pc-btn" href="/pflegecoach/checkout">Zugang bestellen</Link>
            )}
          </>
        )}

        {bestellung && (
          <>
            <p
              className={`pc-feedback pc-feedback--${STATUS_WARNT.includes(bestellung.status) ? 'error' : 'info'}`}
              role={STATUS_WARNT.includes(bestellung.status) ? 'alert' : 'status'}
            >
              <strong>{STATUS_LABEL[bestellung.status] ?? bestellung.status}.</strong>{' '}
              {STATUS_ERKLAERUNG[bestellung.status] ?? ''}
            </p>

            <div className="pc-table-wrap">
              <table className="pc-table">
                <tbody>
                  <tr>
                    <th scope="row">Tarif</th>
                    <td>
                      {bestellung.tarif === 'jaehrlich' ? 'Jährlich' : 'Monatlich'} —{' '}
                      {geld(bestellung.betrag_cent, bestellung.waehrung)}
                      {bestellung.intervall_monate === 1 ? ' pro Monat' : ' pro Jahr'}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Bestellt am</th>
                    <td>{datum(bestellung.bestellt_am)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Bezahlt bis</th>
                    <td>{datum(bestellung.laufzeit_bis)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Nächste Abbuchung</th>
                    <td>
                      {abo?.naechste_abbuchung
                        ? `${datum(abo.naechste_abbuchung)} — ${geld(bestellung.betrag_cent, bestellung.waehrung)}`
                        : 'keine weitere Abbuchung'}
                    </td>
                  </tr>
                  {bestellung.gekuendigt_am && (
                    <tr>
                      <th scope="row">Gekündigt am</th>
                      <td>{datum(bestellung.gekuendigt_am)}</td>
                    </tr>
                  )}
                  {bestellung.widerrufen_am && (
                    <tr>
                      <th scope="row">Widerrufen am</th>
                      <td>{datum(bestellung.widerrufen_am)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {STATUS_WARNT.includes(bestellung.status) && (
              <button
                type="button"
                className="pc-btn"
                disabled={laeuft !== null}
                onClick={() => aktion('zahlungsmittel', null)}
              >
                {laeuft === 'zahlungsmittel' ? 'Wird geöffnet …' : 'Zahlungsmittel aktualisieren'}
              </button>
            )}
          </>
        )}
      </section>

      {bestellung && (
        <section className="pc-card" aria-labelledby="zahlungen-titel">
          <h2 id="zahlungen-titel">Zahlungen und Rechnungen</h2>

          {(abo?.zahlungen.length ?? 0) === 0 ? (
            <p>Es wurde noch keine Zahlung verbucht.</p>
          ) : (
            <div className="pc-table-wrap">
              <table className="pc-table">
                <caption className="sr-only">Ihre Zahlungen zum PflegeCoach</caption>
                <thead>
                  <tr>
                    <th scope="col">Datum</th>
                    <th scope="col">Vorgang</th>
                    <th scope="col">Zeitraum</th>
                    <th scope="col">Betrag</th>
                  </tr>
                </thead>
                <tbody>
                  {abo?.zahlungen.map(z => (
                    <tr key={z.id}>
                      <td>{datum(z.gebucht_am)}</td>
                      <td>
                        {ZAHLUNG_ART_LABEL[z.art] ?? z.art}
                        {z.fehlergrund && <><br /><span className="pc-lead">{z.fehlergrund}</span></>}
                      </td>
                      <td>
                        {z.zeitraum_von ? `${datum(z.zeitraum_von)} – ${datum(z.zeitraum_bis)}` : '–'}
                      </td>
                      <td>
                        {/* Erstattungen mit Minuszeichen: Eine Liste, in der
                            Rückzahlung und Abbuchung gleich aussehen, liest
                            sich als doppelte Belastung. */}
                        {z.art === 'erstattung' ? '− ' : ''}
                        {geld(z.betrag_cent, z.waehrung)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3>Rechnungen</h3>
          {(abo?.rechnungen.length ?? 0) === 0 ? (
            <p>
              Es liegt noch keine Rechnung vor. Sobald eine Zahlung verbucht ist, erscheint sie
              hier zum Herunterladen.
            </p>
          ) : (
            <ul style={{ paddingLeft: 20 }}>
              {abo?.rechnungen.map(r => (
                <li key={r.id} style={{ marginBottom: 8 }}>
                  <a href={`/api/coach/rechnung/${r.id}`} target="_blank" rel="noopener">
                    Rechnung {r.nummer}
                  </a>{' '}
                  vom {datum(r.rechnungsdatum)} über {geld(r.brutto_cent, r.waehrung)}
                  {r.storniert_am && ' (storniert)'}
                </li>
              ))}
            </ul>
          )}
          <p className="pc-lead">
            Die Rechnung öffnet sich als Dokument. Zum Speichern als PDF wählen Sie im Browser
            „Drucken“ und dort „Als PDF sichern“.
          </p>
        </section>
      )}

      {/* Widerruf steht VOR der Kündigung: Solange die Frist läuft, ist er
          für die Kundin die günstigere Möglichkeit — volles Geld zurück
          statt Weiterlaufen bis Periodenende. */}
      {bestellung && abo?.widerruf_moeglich && (
        <section className="pc-card" aria-labelledby="widerruf-titel">
          <h2 id="widerruf-titel">Widerruf (14 Tage)</h2>
          <p>
            Ihre Widerrufsfrist läuft noch bis zum{' '}
            <strong>{datum(abo.widerrufsfrist_ende)}</strong>. Bis dahin können Sie ohne Angabe
            von Gründen widerrufen.
          </p>
          <p>
            <strong>Der Widerruf wirkt sofort:</strong> Ihr Zugang endet, das Abo wird beendet
            und Sie erhalten den <strong>vollen Betrag zurück</strong>. Für die Nutzung bis zum
            Widerruf berechnen wir nichts. Ihre Daten bleiben erhalten, bis Sie die Löschung
            selbst veranlassen.
          </p>
          <button
            type="button"
            className="pc-btn pc-btn--secondary"
            disabled={laeuft !== null}
            onClick={() =>
              aktion(
                'widerrufen',
                'Ihr Widerruf wirkt sofort: Der Zugang endet unmittelbar und der gezahlte Betrag ' +
                'wird vollständig erstattet. Ihre Daten bleiben erhalten. Widerruf jetzt erklären?'
              )
            }
          >
            {laeuft === 'widerrufen' ? 'Wird bearbeitet …' : 'Bestellung jetzt widerrufen'}
          </button>
          <p className="pc-lead">
            Ausführliche Belehrung und Muster-Formular:{' '}
            <Link href="/pflegecoach/widerruf">Widerrufsbelehrung</Link>
          </p>
        </section>
      )}

      {bestellung && (
        <section className="pc-card" aria-labelledby="kuendigen-titel">
          <h2 id="kuendigen-titel">Vertrag kündigen</h2>
          {abo?.kuendigung_moeglich ? (
            <>
              <p>
                Sie können jederzeit ohne Frist und ohne Begründung kündigen. Die Kündigung wirkt
                zum Ende des bereits bezahlten Zeitraums
                {abo.kuendigung_wirkt_zum ? ` — also zum ${datum(abo.kuendigung_wirkt_zum)}` : ''}.
                Bis dahin können Sie den PflegeCoach unverändert weiter nutzen; danach wird
                nichts mehr abgebucht.
              </p>
              <p>
                Eine anteilige Erstattung für den bereits bezahlten Zeitraum gibt es nicht — die
                Leistung wird bis dahin erbracht. Ihre Daten bleiben auch nach dem Ende
                erhalten, bis Sie sie selbst löschen.
              </p>
              {/* § 312k BGB: die Kündigung muss unmittelbar und ohne
                  Zwischenschritte auslösbar sein. Genau ein Klick,
                  eine Sicherheitsabfrage, fertig. */}
              <button
                type="button"
                className="pc-btn pc-btn--secondary"
                disabled={laeuft !== null}
                onClick={() =>
                  aktion(
                    'kuendigen',
                    'Ihre Kündigung wirkt zum Ende des bezahlten Zeitraums. Bis dahin bleibt Ihr ' +
                    'Zugang bestehen, danach wird nichts mehr abgebucht. Jetzt kündigen?'
                  )
                }
              >
                {laeuft === 'kuendigen' ? 'Wird bearbeitet …' : 'Vertrag jetzt kündigen'}
              </button>
            </>
          ) : (
            <p className="pc-feedback pc-feedback--info">
              {abo?.kuendigung_grund ?? 'Für diesen Vertrag ist keine Kündigung möglich.'}
            </p>
          )}
        </section>
      )}

      {/* ═══ DATEN ═════════════════════════════════════════════ */}

      <section className="pc-card" aria-labelledby="beenden-titel">
        <h2 id="beenden-titel">1. Nutzung beenden (Einwilligung widerrufen)</h2>
        <p>
          Sie beenden die Nutzung, indem Sie Ihre Einwilligung in die Verarbeitung Ihrer Pflege-
          und Gesundheitsdaten widerrufen. Danach nimmt der PflegeCoach keine neuen Einträge mehr
          entgegen. Ihre bisherigen Daten bleiben für Sie lesbar und exportierbar — gelöscht wird
          erst, wenn Sie es ausdrücklich veranlassen (Schritt 3).
        </p>
        {/* Der wichtigste Satz auf dieser Seite: Datenschutz-Widerruf und
            Vertragskündigung sind zwei verschiedene Dinge. Ohne diesen
            Hinweis beendet jemand die Nutzung und zahlt weiter. */}
        {bestellung && (
          <p className="pc-feedback pc-feedback--info">
            <strong>Wichtig:</strong> Dieser Schritt beendet die Datenverarbeitung, nicht Ihren
            Vertrag. Wenn Sie auch nicht mehr zahlen möchten, kündigen Sie bitte zusätzlich oben
            im Abschnitt „Vertrag kündigen“.
          </p>
        )}
        <p>
          Der Widerruf der Einwilligung wirkt sofort und Sie können jederzeit wieder einsteigen.
        </p>
        {consentsGeladen && (
          nutzungAktiv ? (
            <button type="button" className="pc-btn pc-btn--secondary" onClick={beenden}>
              Nutzung jetzt beenden
            </button>
          ) : (
            <>
              <p className="pc-feedback pc-feedback--info">
                Die Nutzung ist derzeit beendet. Es werden keine neuen Einträge gespeichert.
              </p>
              <button type="button" className="pc-btn" onClick={wiederAufnehmen}>
                Nutzung wieder aufnehmen
              </button>
            </>
          )
        )}
      </section>

      <section className="pc-card" aria-labelledby="mitnehmen-titel">
        <h2 id="mitnehmen-titel">2. Daten mitnehmen</h2>
        <p>
          Laden Sie Ihre Daten herunter, bevor Sie löschen — als maschinenlesbare Datei (JSON,
          Art. 20 DSGVO) oder als druckbaren Bericht. Nach der Löschung ist das nicht mehr
          möglich.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <a className="pc-btn pc-btn--secondary" href="/api/coach/export">
            Daten herunterladen (JSON)
          </a>
          <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/bericht">
            Bericht erstellen
          </Link>
        </div>
      </section>

      <section className="pc-card" aria-labelledby="loeschen-titel">
        <h2 id="loeschen-titel">3. PflegeCoach-Daten löschen</h2>
        <p>
          Sie können alle Ihre PflegeCoach-Daten selbst und vollständig löschen (Art. 17 DSGVO).
          Ihr Alltagsengel-Konto bleibt dabei bestehen. Die Löschseite zeigt Ihnen vorher genau
          an, was gelöscht wird, und verlangt eine ausdrückliche Bestätigung.
        </p>
        {bestellung && (
          // Rechnungen unterliegen § 147 AO (10 Jahre). Wer das erst nach
          // dem Löschen erfährt, hält es für einen Fehler.
          <p className="pc-feedback pc-feedback--info">
            <strong>Hinweis zu Rechnungen:</strong> Ausgestellte Rechnungen müssen wir aus
            steuerlichen Gründen aufbewahren; sie werden von der Löschung nicht erfasst. Bitte
            kündigen oder widerrufen Sie außerdem zuerst — sonst läuft der Vertrag weiter,
            obwohl Sie den PflegeCoach nicht mehr nutzen.
          </p>
        )}
        <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/loeschung">
          PflegeCoach-Daten löschen
        </Link>
      </section>

      <section className="pc-card" aria-labelledby="konto-titel">
        <h2 id="konto-titel">4. Alltagsengel-Konto löschen</h2>
        <p>
          Möchten Sie nicht nur den PflegeCoach, sondern Ihr gesamtes Alltagsengel-Konto löschen,
          gehen Sie über Ihr <Link href="/kunde/profil">Profil</Link>. Mit dem Konto werden auch
          Ihre PflegeCoach-Daten gelöscht.
        </p>
      </section>

      <section className="pc-card" aria-labelledby="hilfe-titel">
        <h2 id="hilfe-titel">Fragen zum Vertrag oder zum Beenden?</h2>
        <p>
          Wenn etwas unklar ist oder ein Schritt nicht funktioniert, schreiben Sie uns an{' '}
          <a href={`mailto:${COACH_SUPPORT_EMAIL}`}>{COACH_SUPPORT_EMAIL}</a>. Bitte senden Sie
          uns dabei keine Gesundheitsdaten.
        </p>
        <p>
          <Link href="/pflegecoach/agb">AGB</Link>{' · '}
          <Link href="/pflegecoach/widerruf">Widerrufsbelehrung</Link>{' · '}
          <Link href="/pflegecoach/datenschutz">Datenschutzhinweise</Link>{' · '}
          <Link href="/impressum">Impressum</Link>
        </p>
      </section>
    </>
  )
}
