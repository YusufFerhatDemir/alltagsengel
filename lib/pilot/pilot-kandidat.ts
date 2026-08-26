// ═══════════════════════════════════════════════════════════════════════════
// WELCHE RECHNUNG SOLL DEN ERSTEN ECHTEN VERSAND TRAGEN?
//
// PROBLEM, DAS DIESE DATEI LÖST
// Das Control Center zählt Rechnungen. Eine Zahl beantwortet aber nicht die
// eine Frage, vor der der Erstbetrieb steht: WELCHE Rechnung ist gemeint, an
// WEN ginge sie, über WELCHEN Betrag — und was fehlt noch, damit sie rausgeht.
// „3 Rechnungen versandbereit" liest sich wie ein Fortschritt, obwohl keine
// einzige davon eine Empfängeradresse haben muss.
//
// ── DIE LEERE ANTWORT IST DIE WICHTIGSTE ───────────────────────────────────
// Steht kein Kandidat bereit, ist das KEIN Fehler und kein Warten auf
// Technik — es fehlt eine Geschäftshandlung. Genau das sagt der Zustand
// `NO_PILOT_INVOICE` mit der zugehörigen Handlungsanweisung. Ein Dashboard,
// das an dieser Stelle nur „0" zeigt, sieht aus wie ein System, das noch
// lädt.
//
// ── WAS HIER NICHT PASSIERT ────────────────────────────────────────────────
// Dieses Modul liest. Es stellt kein Token aus, es versendet nicht, es legt
// nichts an. Der zurückgegebene Kandidat ist eine BESCHREIBUNG, keine
// Erlaubnis: die Erlaubnis ist ausschließlich eine Zeile in
// `pilot_send_gate` (lib/pilot/send-gate.ts), und die entsteht nur über die
// Freigabe-Route mit gesetzter Umgebungs-Freigabe.
//
// ── WARUM DER PREFLIGHT NUR FÜR EINE RECHNUNG LÄUFT ────────────────────────
// `pruefeRechnungFuerPilot()` ist teuer (16 Punkte, mehrere Abfragen je
// Rechnung). Für die Übersicht genügt der Stand der EINEN Rechnung, die den
// Erstlauf tragen soll; die übrigen werden gezählt, nicht geprüft. Die
// Auswahl ist deterministisch (älteste zuerst), damit zwei Aufrufe
// hintereinander nicht auf verschiedene Rechnungen zeigen.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EnvQuelle } from '@/lib/env/pruefung'
import { pruefeRechnungFuerPilot, type PilotUrteil } from './rechnung-pilot'
import { erstversandFreigabe, FREIGABE_ENV, FREIGABE_AN_WERT, type FreigabeStand } from './send-gate'
import { NICHT_VERSANDFAEHIGE_STATUS } from './control-center'
import { logger } from '@/lib/logger'

const log = logger.child('pilot-kandidat')

/**
 * Der Zustand der Kandidatenfrage.
 *
 * `NICHT_MESSBAR` ist bewusst von `NO_PILOT_INVOICE` getrennt: „es gibt
 * keine Rechnung" und „ich konnte nicht nachsehen" führen zu
 * entgegengesetzten nächsten Schritten, und ein Dashboard, das beides gleich
 * darstellt, schickt jemanden in die falsche Richtung.
 */
export type KandidatZustand =
  | 'KANDIDAT_VORHANDEN'
  | 'NO_PILOT_INVOICE'
  | 'BEREITS_VERSENDET'
  | 'NICHT_MESSBAR'

/** Die Handlungsanweisung, wenn kein Kandidat bereitsteht. */
export const ACTION_REQUIRED_KEIN_KANDIDAT =
  'NO_PILOT_INVOICE — ACTION_REQUIRED: CREATE_OR_SELECT_REAL_DRAFT_INVOICE'

export interface KandidatToken {
  /** Offene, noch nicht verbrauchte Freigaben für DIESE Rechnung. */
  offen: number | null
  /** Verbrauchte Freigaben für diese Rechnung — > 0 heißt: es wurde gesendet. */
  verbraucht: number | null
  /**
   * Offene Freigaben, deren Gültigkeit abgelaufen ist.
   *
   * Zählt getrennt, weil ein verfallenes Token wie ein vorhandenes aussieht,
   * aber keines mehr ist: der Versand lehnt es mit `token_abgelaufen` ab.
   */
  verfallen: number | null
}

export interface PilotKandidat {
  invoiceId: string
  invoiceNumber: string | null
  kundeName: string | null
  /** Die Empfängeradresse, wie der Versand sie verwenden würde. */
  empfaenger: string | null
  betragEuro: number
  betragCent: number
  /** Das Pilot-Urteil der 16 Preflight-Punkte plus der Pilot-Sperren. */
  urteil: PilotUrteil
  blocker: string[]
  zuPruefen: string[]
  /** Steht ein Belegpaket-PDF? Der Preflight prüft es als eigenen Punkt. */
  pdfBereit: boolean | null
  token: KandidatToken
}

export interface PilotKandidatUebersicht {
  zustand: KandidatZustand
  /** Ein Satz, der den Zustand ohne Vorwissen erklärt. */
  begruendung: string
  /** Die nächste Handlung — bei `NO_PILOT_INVOICE` die Auftragskennung. */
  actionRequired: string | null
  /** Wie viele Rechnungen überhaupt in Frage kämen. */
  versandbereit: number | null
  /** Wie viele davon keine Empfängeradresse haben (kämen nie in Frage). */
  ohneEmpfaenger: number | null
  /**
   * Rechnungen mit Versandzeitpunkt, aber ohne Festschreibung.
   *
   * Über den Versandweg können sie nicht entstanden sein — er weist eine
   * nicht festgeschriebene Rechnung ab. Sie zählen deshalb NICHT als
   * erfolgter Erstversand. `null` heißt „nicht messbar".
   */
  versendetUnbelegt: number | null
  kandidat: PilotKandidat | null
  /** Der Stand der Umgebungs-Freigabe — ohne sie ist kein Token ausstellbar. */
  freigabe: FreigabeStand
  hinweise: string[]
}

async function zaehle(
  hinweise: string[],
  label: string,
  bauen: () => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number | null> {
  try {
    const { count, error } = await bauen()
    if (error) {
      hinweise.push(`${label}: ${(error as { message?: string }).message ?? 'nicht lesbar'}`)
      return null
    }
    return count ?? 0
  } catch (err) {
    hinweise.push(`${label}: ${(err as Error).message}`)
    return null
  }
}

/**
 * Ermittelt die Rechnung, die den ersten echten Versand tragen soll.
 *
 * Rein lesend. Führt für höchstens EINE Rechnung den Piloten aus.
 */
export async function ermittlePilotKandidat(
  admin: SupabaseClient,
  organizationId: string,
  quelle: EnvQuelle = process.env,
): Promise<PilotKandidatUebersicht> {
  const hinweise: string[] = []
  const freigabe = erstversandFreigabe(quelle)

  const nichtVersandfaehig = `(${NICHT_VERSANDFAEHIGE_STATUS.join(',')})`

  // Die Auswahl selbst: älteste festgeschriebene, noch nicht versendete
  // Rechnung mit versandfähigem Status. `limit(1)` nach `order` macht die
  // Auswahl deterministisch — ohne die Sortierung entscheidet die
  // Speicherreihenfolge, und die ändert sich beim ersten UPDATE.
  let kandidatZeile: { id: string; invoice_number: string | null } | null = null
  try {
    const { data, error } = await admin
      .from('invoices')
      .select('id, invoice_number, created_at')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .is('sent_at', null)
      .not('frozen_at', 'is', null)
      .not('status', 'in', nichtVersandfaehig)
      .order('created_at', { ascending: true })
      .limit(1)

    if (error) {
      hinweise.push(`invoices (Kandidat): ${error.message}`)
    } else if (data && data.length > 0) {
      kandidatZeile = data[0] as { id: string; invoice_number: string | null }
    }
  } catch (err) {
    hinweise.push(`invoices (Kandidat): ${(err as Error).message}`)
  }

  const inv = () => admin
    .from('invoices').select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId).is('deleted_at', null)

  const versandbereit = await zaehle(hinweise, 'invoices (versandbereit)', () =>
    inv().is('sent_at', null).not('frozen_at', 'is', null).not('status', 'in', nichtVersandfaehig))
  const versendet = await zaehle(hinweise, 'invoices (versendet)', () =>
    inv().not('sent_at', 'is', null))

  // ── Was ein Versandzeitpunkt WERT ist ──────────────────────────────────
  // `sent_at` allein belegt keinen Versand. Dieses System setzt es nur nach
  // einem Lauf, der `frozen_at` voraussetzt (lib/billing/versand/
  // rechnung-versand.ts weist eine nicht festgeschriebene Rechnung ab). Eine
  // Zeile mit Versandzeitpunkt OHNE Festschreibung kann also nicht ueber den
  // Versandweg entstanden sein — sie stammt aus einer Einspielung oder einem
  // Direkteingriff.
  //
  // Der Unterschied ist keine Kosmetik: ohne ihn meldet diese Uebersicht
  // BEREITS_VERSENDET, obwohl der Erstversand nie stattgefunden hat, und der
  // Erstlauf gilt faelschlich als erledigt.
  const versendetUnbelegt = await zaehle(hinweise, 'invoices (versendet ohne Festschreibung)', () =>
    inv().not('sent_at', 'is', null).is('frozen_at', null))
  const versendetBelegt = versendet !== null && versendetUnbelegt !== null
    ? Math.max(0, versendet - versendetUnbelegt)
    : null

  // Rechnungen ohne Empfängeradresse: kommen als Kandidat nie in Frage, und
  // ihre Zahl erklärt, warum „versandbereit > 0" trotzdem zu keinem
  // Kandidaten führen kann.
  let ohneEmpfaenger: number | null = null
  try {
    const { data, error } = await admin
      .from('invoices')
      .select('id, client:clients(email)')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .is('sent_at', null)
      .not('frozen_at', 'is', null)
      .not('status', 'in', nichtVersandfaehig)
      .limit(200)
    if (error) {
      hinweise.push(`invoices (ohne Empfänger): ${error.message}`)
    } else {
      ohneEmpfaenger = (data ?? []).filter(z => {
        const c = (z as { client?: { email?: string | null } | { email?: string | null }[] }).client
        const mail = Array.isArray(c) ? c[0]?.email : c?.email
        return !mail || mail.trim() === ''
      }).length
    }
  } catch (err) {
    hinweise.push(`invoices (ohne Empfänger): ${(err as Error).message}`)
  }

  // ── Kein Kandidat ────────────────────────────────────────────────────────
  if (!kandidatZeile) {
    // Nicht messbar geht vor: eine gescheiterte Abfrage darf nicht als
    // „es gibt nichts" durchgehen.
    if (versandbereit === null) {
      return {
        zustand: 'NICHT_MESSBAR',
        begruendung:
          'Der Rechnungsbestand ist nicht lesbar. Ob eine Pilotrechnung bereitsteht, ist damit '
          + 'unbekannt — das ist NICHT dasselbe wie „keine vorhanden".',
        actionRequired: null,
        versandbereit, ohneEmpfaenger, versendetUnbelegt, kandidat: null, freigabe, hinweise,
      }
    }
    // BEREITS_VERSENDET nur bei einem BELEGTEN Versand — sonst bliebe der
    // Erstlauf als erledigt stehen, obwohl er nie lief.
    if ((versandbereit ?? 0) === 0 && (versendetBelegt ?? 0) > 0) {
      return {
        zustand: 'BEREITS_VERSENDET',
        begruendung:
          `Es steht keine unversendete Rechnung mehr offen; ${versendetBelegt} trägt einen `
          + 'Versandzeitpunkt aus einem festgeschriebenen Beleg. Für einen weiteren Erstlauf gibt '
          + 'es nichts auszuwählen.',
        actionRequired: null,
        versandbereit, ohneEmpfaenger, versendetUnbelegt, kandidat: null, freigabe, hinweise,
      }
    }
    return {
      zustand: 'NO_PILOT_INVOICE',
      begruendung:
        'Es gibt keine festgeschriebene, noch nicht versendete Rechnung. Der Erstversand wartet '
        + 'nicht auf Technik, sondern auf einen Geschäftsvorgang: Kunde anlegen, Leistung erfassen, '
        + 'Rechnung erzeugen und festschreiben.'
        + ((versendetUnbelegt ?? 0) > 0
          ? ` Hinweis: ${versendetUnbelegt} Rechnung(en) tragen einen Versandzeitpunkt OHNE `
            + 'Festschreibung. Über den Versandweg können sie nicht entstanden sein — sie zählen '
            + 'deshalb nicht als erfolgter Erstversand.'
          : ''),
      actionRequired: ACTION_REQUIRED_KEIN_KANDIDAT,
      versandbereit, ohneEmpfaenger, versendetUnbelegt, kandidat: null, freigabe, hinweise,
    }
  }

  // ── Kandidat vorhanden: den Piloten für genau diese Rechnung laufen lassen ─
  const bericht = await pruefeRechnungFuerPilot(admin, {
    invoiceId: kandidatZeile.id,
    organizationId,
  })

  // Punkt 11 des Katalogs. `null` heißt „nicht ermittelt", nicht „nein" —
  // ein fehlender Punkt darf nicht wie ein fehlgeschlagener aussehen.
  const pdfPunkt = bericht.punkte.find(p => p.schluessel === 'pdf')
  const pdfBereit = pdfPunkt ? pdfPunkt.stand === 'erfuellt' : null

  const gate = () => admin
    .from('pilot_send_gate').select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId).eq('invoice_id', kandidatZeile.id)

  const tokenOffen = await zaehle(hinweise, 'pilot_send_gate (offen)', () =>
    gate().is('verbraucht_am', null).is('entwertet_am', null)
      .gt('gueltig_bis', new Date().toISOString()))
  const tokenVerfallen = await zaehle(hinweise, 'pilot_send_gate (verfallen)', () =>
    gate().is('verbraucht_am', null).is('entwertet_am', null)
      .lte('gueltig_bis', new Date().toISOString()))
  const tokenVerbraucht = await zaehle(hinweise, 'pilot_send_gate (verbraucht)', () =>
    gate().not('verbraucht_am', 'is', null))

  log.info('Pilot-Kandidat ermittelt', {
    invoiceId: kandidatZeile.id, organizationId, urteil: bericht.urteil,
  })

  return {
    zustand: 'KANDIDAT_VORHANDEN',
    begruendung:
      `Rechnung ${bericht.invoiceNumber ?? kandidatZeile.id.slice(0, 8)} ist der älteste offene `
      + `Kandidat. Der Pilot urteilt ${bericht.urteil}.`,
    actionRequired:
      bericht.urteil === 'READY_FOR_SEND'
        ? (freigabe.freigegeben
            ? 'READY_FOR_APPROVAL — für diese Rechnung eine Einmal-Freigabe ausstellen.'
            : `BLOCKED_BY_ENV — ohne ${FREIGABE_ENV}=${FREIGABE_AN_WERT} lässt sich keine Freigabe ausstellen.`)
        : `PREFLIGHT_${bericht.urteil} — die offenen Punkte am Beleg klären, bevor freigegeben wird.`,
    versandbereit, ohneEmpfaenger, versendetUnbelegt, freigabe, hinweise,
    kandidat: {
      invoiceId: bericht.invoiceId,
      invoiceNumber: bericht.invoiceNumber,
      kundeName: bericht.empfaengerName,
      empfaenger: bericht.empfaenger,
      betragEuro: bericht.betragEuro,
      betragCent: bericht.betragCent,
      urteil: bericht.urteil,
      blocker: bericht.blocker,
      zuPruefen: bericht.zuPruefen,
      pdfBereit,
      token: { offen: tokenOffen, verbraucht: tokenVerbraucht, verfallen: tokenVerfallen },
    },
  }
}
