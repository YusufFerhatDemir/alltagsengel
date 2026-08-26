// ═══════════════════════════════════════════════════════════════════════════
// NACHPRÜFUNG NACH EINEM ECHTEN VERSAND
//
// PROBLEM, DAS DIESE DATEI LÖST
// Ein Versand meldet „versendet", sobald Resend die Mail angenommen hat. Was
// danach passiert — Protokollzeile, Zustellspur, Audit-Eintrag,
// `invoices.sent_at` — steht in vier getrennten Schreibvorgängen, von denen
// jeder einzeln scheitern kann, ohne den Rückgabewert zu ändern. Der
// Versandweg tut das mit Absicht: nach einer angenommenen Mail darf ein
// Protokollfehler den Aufrufer nicht in einen Fehlerpfad schicken, sonst
// sendet der Wiederholungslauf ein zweites Mal.
//
// Das ist im laufenden Betrieb richtig und beim ERSTEN echten Versand nicht
// genug. Genau dort will man wissen, ob die vier Nachschreibungen tatsächlich
// stattgefunden haben — und zwar bevor der zweite Versand losgeht.
//
// ── ACHT PRÜFPUNKTE ────────────────────────────────────────────────────────
//   1. Resend hat angenommen
//   2. Es gibt eine Provider-Kennung, und sie steht auch im Protokoll
//   3. Genau EINE Erfolgszeile in `invoice_email_log` — nicht null, nicht zwei
//   4. Keine Retry-Dublette in der Zustellspur
//   5. Empfänger, Betreff und Betrag sind die, die sie sein sollten
//   6. Der Audit-Eintrag existiert
//   7. `invoices.sent_at` ist gesetzt
//   8. Keine fremde Organisation ist betroffen
//
// ── FAIL-CLOSED, UND ZWAR OHNE MITTELWEG ───────────────────────────────────
// Jede Abweichung führt zu einer P0-Sperre in `pilot_versand_sperre`, und
// jede offene Einmal-Freigabe wird entwertet. Ein Prüfpunkt, der NICHT
// AUSFÜHRBAR war, zählt dabei als Abweichung — nicht als „vermutlich in
// Ordnung". Der Sinn dieser Datei ist, den ersten Versand zu BESTÄTIGEN; ein
// unbestätigter Versand ist kein bestätigter.
//
// ── DIESE DATEI SENDET NICHT UND HEILT NICHT ───────────────────────────────
// Sie schreibt genau zwei Dinge: die Sperre und die Entwertung offener
// Freigaben. Sie setzt kein `sent_at` nach, legt keine fehlende
// Protokollzeile an und löscht keine doppelte. Ein Prüfwerkzeug, das seine
// eigenen Befunde wegräumt, kann sie beim nächsten Mal nicht mehr finden —
// und was hier fehlt, ist immer eine Frage für einen Menschen.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '@/lib/billing/core/audit'
import { euroZuCent } from '@/lib/geld'
import { logger } from '@/lib/logger'
import { entwerteAlleOffenenTokens } from './send-gate'

const log = logger.child('pilot-nachpruefung')

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type NachpruefSchluessel =
  | 'resend_erfolg'
  | 'message_id'
  | 'protokoll_genau_eins'
  | 'keine_retry_dublette'
  | 'empfaenger_betreff_betrag'
  | 'audit_eintrag'
  | 'rechnungsstatus'
  | 'keine_fremde_organisation'

export interface Nachpruefpunkt {
  schluessel: NachpruefSchluessel
  titel: string
  /** `null` = nicht prüfbar. Zählt wie `false`, siehe Modulkopf. */
  bestanden: boolean | null
  befund: string
}

export type NachpruefUrteil =
  /** Alle acht Punkte bestanden. */
  | 'BESTAETIGT'
  /** Mindestens ein Punkt verletzt oder nicht prüfbar. P0. */
  | 'ABWEICHUNG'

export interface NachpruefErgebnis {
  invoiceId: string
  organizationId: string
  geprueftAm: string
  urteil: NachpruefUrteil
  punkte: Nachpruefpunkt[]
  /** Befunde der nicht bestandenen bzw. nicht prüfbaren Punkte. */
  abweichungen: string[]
  /** Wurde eine P0-Sperre gesetzt? `false` bei BESTAETIGT. */
  sperreGesetzt: boolean
  /**
   * `true`, wenn eine Abweichung vorlag, die Sperre aber NICHT geschrieben
   * werden konnte. Der schwerste denkbare Zustand: es ist etwas schiefgegangen
   * UND nichts hält den nächsten Versand auf. Ein Aufrufer, der das sieht,
   * muss von Hand stoppen.
   */
  sperreFehlgeschlagen: boolean
  /** Anzahl entwerteter offener Freigaben; `null`, wenn nicht feststellbar. */
  entwerteteFreigaben: number | null
}

export interface NachpruefEingaben {
  invoiceId: string
  organizationId: string
  actorId: string
  /** Was der Versandweg zurückgemeldet hat. */
  versandStatus: 'versendet' | 'uebersprungen' | 'fehlgeschlagen'
  /** Die Provider-Kennung aus der Resend-Antwort. */
  providerMessageId?: string | null
  /** An wen die Mail ging. */
  empfaenger: string
  /** Der Betreff, den der Versandweg gebaut hat. */
  betreff?: string | null
  /** Der Rechnungsbetrag in Cent, wie er auf dem Beleg stand. */
  betragCents: number
  jetzt?: Date
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function punkt(
  schluessel: NachpruefSchluessel,
  titel: string,
  bestanden: boolean | null,
  befund: string,
): Nachpruefpunkt {
  return { schluessel, titel, bestanden, befund }
}

function gleicheAdresse(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

interface EmailLogZeile {
  id: string
  organization_id: string
  status: string
  empfaenger_email: string | null
  betreff: string | null
  provider_message_id: string | null
  versendet_am: string | null
  versuch: number | null
}

interface ZustellZeile {
  id: string
  organization_id: string
  status: string
  attempt_count: number | null
  provider_message_id: string | null
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

/**
 * Prüft einen erfolgten Versand gegen acht Punkte und sperrt bei jeder
 * Abweichung.
 */
export async function pruefeNachVersand(
  admin: SupabaseClient,
  eingaben: NachpruefEingaben,
): Promise<NachpruefErgebnis> {
  const {
    invoiceId, organizationId, actorId,
    versandStatus, providerMessageId, empfaenger, betreff, betragCents,
    jetzt,
  } = eingaben

  const geprueftAm = (jetzt ?? new Date()).toISOString()
  const punkte: Nachpruefpunkt[] = []

  // ── Daten holen ────────────────────────────────────────────────────────
  //
  // WICHTIG: `invoice_email_log` und `notification_delivery_log` werden
  // BEWUSST OHNE Mandantenfilter gelesen. Das ist keine vergessene Grenze,
  // sondern Punkt 8: gäbe es eine Zeile zu dieser Rechnung unter einer
  // fremden Organisation, würde ein org-gefilterter Lauf sie nicht sehen —
  // und genau das ist der Zustand, den niemand bemerkt. Der Client ist
  // service-role (BYPASSRLS); die Abfragen unten sind Prüfabfragen und
  // liefern nichts an einen Nutzer aus, sondern nur eine Ja/Nein-Aussage.

  const emailLog = await hole<EmailLogZeile>(admin, () => admin
    .from('invoice_email_log')
    .select('id, organization_id, status, empfaenger_email, betreff, provider_message_id, versendet_am, versuch')
    .eq('invoice_id', invoiceId))

  const zustellung = await hole<ZustellZeile>(admin, () => admin
    .from('notification_delivery_log')
    .select('id, organization_id, status, attempt_count, provider_message_id')
    .eq('correlation_id', invoiceId)
    .eq('channel', 'email'))

  const rechnung = await holeEines<{ id: string; organization_id: string; sent_at: string | null; total_amount: number | null; status: string }>(
    admin, () => admin
      .from('invoices')
      .select('id, organization_id, sent_at, total_amount, status')
      .eq('id', invoiceId)
      .eq('organization_id', organizationId)
      .maybeSingle())

  const auditZahl = await zaehle(admin, () => admin
    .from('billing_audit_trail')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('entity_id', invoiceId)
    .eq('action', 'email_versendet'))

  // ── 1. Resend hat angenommen ───────────────────────────────────────────
  punkte.push(versandStatus === 'versendet'
    ? punkt('resend_erfolg', 'Resend hat die Mail angenommen', true,
        'Der Versandweg meldet „versendet".')
    : punkt('resend_erfolg', 'Resend hat die Mail angenommen', false,
        `Der Versandweg meldet „${versandStatus}". Es gibt nichts zu bestätigen — und solange nicht geklärt ist, warum, geht auch nichts Weiteres raus.`))

  // ── 2. Provider-Kennung ────────────────────────────────────────────────
  const erfolgszeilen = emailLog.fehler ? [] : emailLog.zeilen.filter(z => z.status === 'versendet')
  const kennungImLog = erfolgszeilen.find(z => z.provider_message_id)?.provider_message_id ?? null

  if (!providerMessageId || providerMessageId.trim() === '') {
    punkte.push(punkt('message_id', 'Provider-Kennung vorhanden', false,
      'Der Versand meldet Erfolg, aber keine Provider-Kennung. Ohne sie lässt sich beim Anbieter nicht nachschlagen, ob die Mail zugestellt wurde — der Erfolg ist damit unbelegt.'))
  } else if (emailLog.fehler) {
    punkte.push(punkt('message_id', 'Provider-Kennung vorhanden', null,
      `Die Kennung liegt vor (${providerMessageId}), aber das Versandprotokoll ist nicht lesbar (${emailLog.fehler}) — der Abgleich fehlt.`))
  } else if (kennungImLog === null) {
    punkte.push(punkt('message_id', 'Provider-Kennung vorhanden', false,
      'Die Kennung liegt aus der Antwort vor, steht aber in keiner Protokollzeile. Das Protokoll ist damit nicht mit dem Anbieter abgleichbar.'))
  } else if (kennungImLog !== providerMessageId) {
    punkte.push(punkt('message_id', 'Provider-Kennung vorhanden', false,
      `Die Kennung im Protokoll (${kennungImLog}) ist eine andere als die aus der Antwort (${providerMessageId}). Das Protokoll gehört dann zu einem anderen Versand.`))
  } else {
    punkte.push(punkt('message_id', 'Provider-Kennung vorhanden', true,
      `Kennung ${providerMessageId} liegt vor und steht so auch im Protokoll.`))
  }

  // ── 3. Genau EINE Erfolgszeile ─────────────────────────────────────────
  if (emailLog.fehler) {
    punkte.push(punkt('protokoll_genau_eins', 'Genau ein Protokolleintrag „versendet"', null,
      `\`invoice_email_log\` ist nicht lesbar: ${emailLog.fehler}`))
  } else if (erfolgszeilen.length === 1) {
    punkte.push(punkt('protokoll_genau_eins', 'Genau ein Protokolleintrag „versendet"', true,
      `Eine Erfolgszeile, wie erwartet (Versuch ${erfolgszeilen[0].versuch ?? '?'}).`))
  } else if (erfolgszeilen.length === 0) {
    punkte.push(punkt('protokoll_genau_eins', 'Genau ein Protokolleintrag „versendet"', false,
      'Der Versand meldet Erfolg, das Protokoll kennt keinen. Die Mail ist beim Kunden und im Haus steht nichts davon — ein zweiter Lauf hielte den Beleg für unversendet.'))
  } else {
    punkte.push(punkt('protokoll_genau_eins', 'Genau ein Protokolleintrag „versendet"', false,
      `${erfolgszeilen.length} Erfolgszeilen für denselben Beleg. Entweder ist zweimal versendet worden oder das Protokoll zählt doppelt — beides muss geklärt sein, bevor etwas Weiteres rausgeht.`))
  }

  // ── 4. Keine Retry-Dublette ────────────────────────────────────────────
  if (zustellung.fehler) {
    punkte.push(punkt('keine_retry_dublette', 'Keine Retry-Dublette in der Zustellspur', null,
      `\`notification_delivery_log\` ist nicht lesbar: ${zustellung.fehler}`))
  } else {
    const erfolge = zustellung.zeilen.filter(z => z.status === 'sent' || z.status === 'delivered')
    const mehrfachVersuche = erfolge.filter(z => (z.attempt_count ?? 1) > 1)
    if (erfolge.length > 1) {
      punkte.push(punkt('keine_retry_dublette', 'Keine Retry-Dublette in der Zustellspur', false,
        `${erfolge.length} Erfolgszeilen in der Zustellspur für denselben Vorgang. Der Teilindex aus Migration 20260923000000 hätte das verhindern müssen.`))
    } else if (mehrfachVersuche.length > 0) {
      punkte.push(punkt('keine_retry_dublette', 'Keine Retry-Dublette in der Zustellspur', false,
        `Die Erfolgszeile trägt attempt_count ${mehrfachVersuche[0].attempt_count}. Beim ersten echten Versand darf es keinen zweiten Versuch gegeben haben — und wenn doch, muss geklärt sein, ob der erste beim Kunden gelandet ist.`))
    } else if (erfolge.length === 1) {
      punkte.push(punkt('keine_retry_dublette', 'Keine Retry-Dublette in der Zustellspur', true,
        'Genau eine Erfolgszeile, erster Versuch.'))
    } else {
      punkte.push(punkt('keine_retry_dublette', 'Keine Retry-Dublette in der Zustellspur', false,
        'Keine Erfolgszeile in der Zustellspur. Ohne sie greift die kanalübergreifende Idempotenz nicht — ein Wiederholungslauf sähe keinen erfolgten Versand.'))
    }
  }

  // ── 5. Empfänger, Betreff, Betrag ──────────────────────────────────────
  if (emailLog.fehler || rechnung.fehler) {
    punkte.push(punkt('empfaenger_betreff_betrag', 'Empfänger, Betreff und Betrag stimmen', null,
      `Nicht prüfbar: ${emailLog.fehler ?? rechnung.fehler}`))
  } else if (erfolgszeilen.length === 0) {
    punkte.push(punkt('empfaenger_betreff_betrag', 'Empfänger, Betreff und Betrag stimmen', null,
      'Ohne Protokollzeile gibt es nichts abzugleichen.'))
  } else {
    const zeile = erfolgszeilen[0]
    const abw: string[] = []
    if (!gleicheAdresse(zeile.empfaenger_email, empfaenger)) {
      abw.push('Der protokollierte Empfänger ist ein anderer als der, an den gesendet werden sollte.')
    }
    if (betreff && zeile.betreff !== betreff) {
      abw.push('Der protokollierte Betreff weicht vom versendeten ab.')
    }
    const rechnungCent = rechnung.zeile ? euroZuCent(Number(rechnung.zeile.total_amount ?? 0)) : null
    if (rechnungCent === null) {
      abw.push('Die Rechnung ist nicht lesbar — der Betrag lässt sich nicht abgleichen.')
    } else if (rechnungCent !== betragCents) {
      abw.push(`Der Rechnungsbetrag steht auf ${rechnungCent} Cent, versendet wurde über ${betragCents} Cent.`)
    }

    punkte.push(abw.length === 0
      ? punkt('empfaenger_betreff_betrag', 'Empfänger, Betreff und Betrag stimmen', true,
          'Protokollierter Empfänger, Betreff und Rechnungsbetrag entsprechen dem Versand.')
      : punkt('empfaenger_betreff_betrag', 'Empfänger, Betreff und Betrag stimmen', false, abw.join(' ')))
  }

  // ── 6. Audit-Eintrag ───────────────────────────────────────────────────
  punkte.push(auditZahl.fehler
    ? punkt('audit_eintrag', 'Audit-Eintrag vorhanden', null,
        `\`billing_audit_trail\` ist nicht lesbar: ${auditZahl.fehler}`)
    : (auditZahl.wert ?? 0) >= 1
      ? punkt('audit_eintrag', 'Audit-Eintrag vorhanden', true,
          `${auditZahl.wert} Audit-Eintrag/Einträge mit action 'email_versendet'.`)
      : punkt('audit_eintrag', 'Audit-Eintrag vorhanden', false,
          "Kein Audit-Eintrag mit action 'email_versendet'. Der Versand ist damit revisionsseitig nicht belegt — der Versandweg protokolliert das absichtlich fail-soft, genau deshalb wird hier nachgesehen."))

  // ── 7. Rechnungsstatus ─────────────────────────────────────────────────
  if (rechnung.fehler) {
    punkte.push(punkt('rechnungsstatus', 'Rechnungsstatus aktualisiert', null,
      `Die Rechnung ist nicht lesbar: ${rechnung.fehler}`))
  } else if (!rechnung.zeile) {
    punkte.push(punkt('rechnungsstatus', 'Rechnungsstatus aktualisiert', false,
      'Die Rechnung ist unter diesem Mandanten nicht auffindbar.'))
  } else if (rechnung.zeile.sent_at) {
    punkte.push(punkt('rechnungsstatus', 'Rechnungsstatus aktualisiert', true,
      `\`sent_at\` steht auf ${rechnung.zeile.sent_at}.`))
  } else {
    punkte.push(punkt('rechnungsstatus', 'Rechnungsstatus aktualisiert', false,
      '`sent_at` ist leer, obwohl die Mail angenommen wurde. Der nächste Lauf hielte den Beleg für unversendet — genau der Zustand, aus dem ein Doppelversand entsteht.'))
  }

  // ── 8. Keine fremde Organisation ───────────────────────────────────────
  const fremde: string[] = []
  if (emailLog.fehler || zustellung.fehler) {
    punkte.push(punkt('keine_fremde_organisation', 'Keine fremde Organisation betroffen', null,
      `Nicht prüfbar: ${emailLog.fehler ?? zustellung.fehler}`))
  } else {
    for (const z of emailLog.zeilen) {
      if (z.organization_id !== organizationId) fremde.push(`Protokollzeile ${z.id} gehört zu einer anderen Organisation.`)
    }
    for (const z of zustellung.zeilen) {
      if (z.organization_id !== organizationId) fremde.push(`Zustellzeile ${z.id} gehört zu einer anderen Organisation.`)
    }
    if (rechnung.zeile && rechnung.zeile.organization_id !== organizationId) {
      fremde.push('Die Rechnung gehört zu einer anderen Organisation.')
    }
    punkte.push(fremde.length === 0
      ? punkt('keine_fremde_organisation', 'Keine fremde Organisation betroffen', true,
          'Alle zu diesem Vorgang gefundenen Zeilen gehören zum geprüften Mandanten.')
      : punkt('keine_fremde_organisation', 'Keine fremde Organisation betroffen', false, fremde.join(' ')))
  }

  // ── Urteil ─────────────────────────────────────────────────────────────
  const abweichungen = punkte.filter(p => p.bestanden !== true).map(p => `${p.titel}: ${p.befund}`)
  const urteil: NachpruefUrteil = abweichungen.length === 0 ? 'BESTAETIGT' : 'ABWEICHUNG'

  const ergebnis: NachpruefErgebnis = {
    invoiceId,
    organizationId,
    geprueftAm,
    urteil,
    punkte,
    abweichungen,
    sperreGesetzt: false,
    sperreFehlgeschlagen: false,
    entwerteteFreigaben: null,
  }

  if (urteil === 'BESTAETIGT') {
    log.info('Versand nachgeprüft und bestätigt', { invoiceId, organizationId })
    return ergebnis
  }

  // ── Abweichung: sperren ────────────────────────────────────────────────
  log.error('Versand-Nachprüfung mit Abweichung — weitere Sendungen werden gesperrt', {
    invoiceId, organizationId, anzahl: abweichungen.length,
  })

  const gesperrt = await setzeVersandsperre(admin, {
    invoiceId,
    organizationId,
    actorId,
    grund:
      `Nachprüfung des Versands ergab ${abweichungen.length} Abweichung(en). `
      + 'Weitere Sendungen sind gesperrt, bis der Befund geklärt ist.',
    // Fremde Organisation im Spiel: die Sperre gilt dann für den ganzen
    // Mandanten, nicht nur für diese Rechnung — der Befund lässt sich nicht
    // auf einen Beleg begrenzen.
    mandantenweit: fremde.length > 0,
    befunde: punkte.filter(p => p.bestanden !== true),
    jetzt,
  })

  ergebnis.sperreGesetzt = gesperrt
  ergebnis.sperreFehlgeschlagen = !gesperrt

  ergebnis.entwerteteFreigaben = await entwerteAlleOffenenTokens(admin, {
    organizationId,
    grund: `Versand-Nachprüfung ${geprueftAm} mit Abweichung — offene Freigaben beziehen sich auf einen überholten Zustand.`,
    jetzt,
  })

  // Fail-soft: der Versand ist bereits passiert, ein Audit-Fehler darf den
  // Aufrufer nicht in einen Fehlerpfad schicken. Die Sperre steht ohnehin.
  try {
    await logBillingAction(admin, {
      entityType: 'invoice',
      entityId: invoiceId,
      organizationId,
      action: 'pilot_nachpruefung_abweichung',
      newState: {
        abweichungen: abweichungen.length,
        punkte: punkte.filter(p => p.bestanden !== true).map(p => p.schluessel),
        sperre_gesetzt: gesperrt,
      },
      actorId,
    })
  } catch (err) {
    log.errorWithException('Audit-Eintrag zur Nachprüfung fehlgeschlagen', err, { invoiceId })
  }

  return ergebnis
}

// ---------------------------------------------------------------------------
// Sperre
// ---------------------------------------------------------------------------

async function setzeVersandsperre(
  admin: SupabaseClient,
  p: {
    invoiceId: string
    organizationId: string
    actorId: string
    grund: string
    mandantenweit: boolean
    befunde: Nachpruefpunkt[]
    jetzt?: Date
  },
): Promise<boolean> {
  try {
    const { error } = await admin.from('pilot_versand_sperre').insert({
      organization_id: p.organizationId,
      invoice_id: p.mandantenweit ? null : p.invoiceId,
      schwere: 'P0',
      grund: p.grund,
      befunde: p.befunde.map(b => ({ schluessel: b.schluessel, titel: b.titel, befund: b.befund })),
      gesetzt_am: (p.jetzt ?? new Date()).toISOString(),
      gesetzt_von: p.actorId,
    })
    if (error) {
      log.error('P0-Versandsperre konnte NICHT gesetzt werden', {
        invoiceId: p.invoiceId, organizationId: p.organizationId, errorMessage: error.message,
      })
      return false
    }
    return true
  } catch (err) {
    log.errorWithException('P0-Versandsperre konnte NICHT gesetzt werden', err, { invoiceId: p.invoiceId })
    return false
  }
}

// ---------------------------------------------------------------------------
// Lesehilfen — ein Fehler ergibt einen Fehlertext, nie eine leere Liste
// ---------------------------------------------------------------------------

async function hole<T>(
  _admin: SupabaseClient,
  bauen: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<{ zeilen: T[]; fehler: string | null }> {
  try {
    const { data, error } = await bauen()
    if (error) return { zeilen: [], fehler: (error as { message?: string }).message ?? 'unbekannter Fehler' }
    return { zeilen: (data ?? []) as T[], fehler: null }
  } catch (err) {
    return { zeilen: [], fehler: (err as Error).message }
  }
}

async function holeEines<T>(
  _admin: SupabaseClient,
  bauen: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<{ zeile: T | null; fehler: string | null }> {
  try {
    const { data, error } = await bauen()
    if (error) return { zeile: null, fehler: (error as { message?: string }).message ?? 'unbekannter Fehler' }
    return { zeile: (data as T) ?? null, fehler: null }
  } catch (err) {
    return { zeile: null, fehler: (err as Error).message }
  }
}

async function zaehle(
  _admin: SupabaseClient,
  bauen: () => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<{ wert: number | null; fehler: string | null }> {
  try {
    const { count, error } = await bauen()
    if (error) return { wert: null, fehler: (error as { message?: string }).message ?? 'unbekannter Fehler' }
    return { wert: count ?? 0, fehler: null }
  } catch (err) {
    return { wert: null, fehler: (err as Error).message }
  }
}

// ---------------------------------------------------------------------------
// Menschenlesbare Fassung
// ---------------------------------------------------------------------------

export function nachpruefungAlsText(e: NachpruefErgebnis): string {
  const zeilen: string[] = [
    e.urteil === 'BESTAETIGT'
      ? 'NACHPRÜFUNG: BESTÄTIGT — alle acht Punkte in Ordnung.'
      : `NACHPRÜFUNG: ABWEICHUNG (P0) — ${e.abweichungen.length} von 8 Punkten nicht bestätigt.`,
    '',
    `Rechnung:  ${e.invoiceId}`,
    `Mandant:   ${e.organizationId}`,
    `Geprüft:   ${e.geprueftAm}`,
    '',
  ]

  for (const p of e.punkte) {
    const z = p.bestanden === true ? '[ok]' : p.bestanden === false ? '[XX]' : '[--]'
    zeilen.push(`  ${z} ${p.titel}`)
    zeilen.push(`       ${p.befund}`)
  }

  if (e.urteil === 'ABWEICHUNG') {
    zeilen.push('')
    zeilen.push(e.sperreGesetzt
      ? 'Eine P0-Versandsperre ist gesetzt. Weitere Sendungen dieses Mandanten werden abgewiesen.'
      : '‼️ Die P0-Versandsperre konnte NICHT gesetzt werden. Weitere Sendungen müssen VON HAND gestoppt werden.')
    zeilen.push(e.entwerteteFreigaben === null
      ? 'Ob offene Einmal-Freigaben entwertet wurden, ist nicht feststellbar.'
      : `${e.entwerteteFreigaben} offene Einmal-Freigabe(n) entwertet.`)
  }

  return zeilen.join('\n')
}
