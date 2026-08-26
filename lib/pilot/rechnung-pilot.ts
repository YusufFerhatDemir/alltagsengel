// ═══════════════════════════════════════════════════════════════════════════
// RECHNUNGS-PILOT — der Trockenlauf vor dem ersten echten Rechnungsversand
//
// PROBLEM, DAS DIESE DATEI LÖST
// Der 16-Punkte-Preflight (`lib/billing/preflight/rechnung-preflight.ts`)
// beantwortet die Frage „darf dieser Beleg raus?" für den LAUFENDEN BETRIEB.
// Für den ERSTEN echten Versand ist das aus zwei Gründen zu wenig:
//
//   1. Er kennt nur EINEN Doppelversand-Riegel: `invoices.sent_at`. Genau
//      dieses Feld ist aber das, was bei einem abgebrochenen Versand als
//      Letztes gesetzt wird — steht die Mail beim Kunden und der
//      anschließende UPDATE scheitert, ist `sent_at` leer und der Beleg sieht
//      wieder unversendet aus. Der Pilot prüft zusätzlich die beiden
//      Protokolle, die davon unabhängig sind (`invoice_email_log`,
//      `notification_delivery_log`). Drei Beine statt einem.
//
//   2. Er kennt die Versandsperre nicht, die die Nachprüfung
//      (`lib/pilot/post-send-verification.ts`) nach einer Abweichung setzt.
//      Eine Sperre, die der Vorlauf nicht liest, hält nichts auf.
//
// ── DIESE DATEI VERSENDET NICHT ────────────────────────────────────────────
// Sie importiert `lib/billing/versand/rechnung-versand.ts` nicht, erzeugt kein
// PDF, schreibt keinen Statuswechsel, keinen Audit-Eintrag, kein Protokoll.
// Sie ist beliebig oft aufrufbar. Ein Regressionstest hält das fest, indem er
// jeden Datenbankaufruf mitschreibt und auf `select` prüft.
//
// ── FAIL-CLOSED, UND ZWAR STRENGER ALS IM REGELBETRIEB ─────────────────────
// Ist eine der drei Dublettenquellen nicht lesbar, gilt das hier als BLOCKED
// — nicht als „vermutlich in Ordnung". Im Regelbetrieb wäre das zu streng
// (ein Protokollausfall darf den Versand nicht anhalten); beim allerersten
// Versand ist genau umgekehrt: es gibt nichts, was durch Warten verloren
// ginge, und alles, was durch eine zweite Mail an einen echten Kunden
// verloren geht.
//
// ── DREI URTEILE ───────────────────────────────────────────────────────────
//   READY_FOR_SEND  Alle 16 Punkte erfüllt und keine Pilot-Sperre.
//   NEEDS_REVIEW    Nichts ist falsch, aber etwas ist nicht belegbar richtig.
//   BLOCKED         Mindestens ein Punkt oder eine Pilot-Sperre ist verletzt.
//
// Für die Einmal-Freigabe (`lib/pilot/send-gate.ts`) zählt ausschließlich
// READY_FOR_SEND. NEEDS_REVIEW darf ein Mensch im Regelbetrieb verantworten —
// beim ersten Versand gibt es dafür keine Erfahrung, auf die er sich stützen
// könnte.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  pruefeRechnungVersandbereit,
  type PreflightPunkt,
  type PreflightStatus,
  type PunktSchluessel,
  type RechnungPreflightErgebnis,
} from '@/lib/billing/preflight/rechnung-preflight'
import { euroZuCent } from '@/lib/geld'

// ---------------------------------------------------------------------------
// Auftragskatalog
// ---------------------------------------------------------------------------

/**
 * Die im Auftrag benannten Prüfgegenstände, jeder auf seinen Punkt im
 * 16-Punkte-Katalog abgebildet.
 *
 * WARUM DIESE TABELLE ÜBERHAUPT EXISTIERT: Der Auftrag nennt siebzehn Namen,
 * der Katalog hat sechzehn Punkte — „Organisation" und „Rechnungssteller"
 * sind derselbe Punkt (die eigene Firma mit ihren Beleg-Pflichtangaben).
 * Ohne diese Abbildung entstünde die naheliegende und falsche Antwort: einen
 * siebzehnten Punkt danebenzubauen und damit zwei Kataloge zu führen, die
 * auseinanderlaufen.
 *
 * `__tests__/pilot/rechnung-pilot.test.ts` prüft beide Richtungen: jeder
 * Auftragsname trifft einen existierenden Punkt, und kein Punkt bleibt ohne
 * Auftragsnamen.
 */
export const AUFTRAGS_KATALOG: readonly { name: string; schluessel: PunktSchluessel }[] = [
  { name: 'Organisation', schluessel: 'mandant' },
  { name: 'Kunde', schluessel: 'kunde' },
  { name: 'Rechnungsnummer', schluessel: 'rechnungsnummer' },
  { name: 'Empfänger', schluessel: 'empfaengeradresse' },
  { name: 'Leistungszeitraum', schluessel: 'leistungszeitraum' },
  { name: 'Positionen', schluessel: 'positionen' },
  { name: 'Preise', schluessel: 'preise' },
  { name: 'Steuern', schluessel: 'steuern' },
  { name: 'Betrag', schluessel: 'betrag' },
  { name: 'IBAN', schluessel: 'bankdaten' },
  // Derselbe Punkt wie „Organisation": Absender, Beleg-Pflichtangaben und
  // Bankverbindung hängen alle an `organizations`.
  { name: 'Rechnungssteller', schluessel: 'mandant' },
  { name: 'PDF', schluessel: 'pdf' },
  { name: 'ZUGFeRD', schluessel: 'xrechnung' },
  { name: 'Audit', schluessel: 'audit' },
  { name: 'Duplikat-Schutz', schluessel: 'kein_doppelversand' },
  { name: 'Cross-Tenant', schluessel: 'mandantengrenze' },
  { name: 'Testdaten', schluessel: 'testdaten' },
] as const

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type PilotUrteil = 'READY_FOR_SEND' | 'NEEDS_REVIEW' | 'BLOCKED'

export type PilotBefundArt =
  /** Zweite Dublettenquelle: eine Erfolgszeile in invoice_email_log. */
  | 'protokoll_dublette'
  /** Dritte Dublettenquelle: eine Erfolgszeile in notification_delivery_log. */
  | 'zustellspur_dublette'
  /** Eine offene Sperre aus der Nachprüfung eines früheren Versands. */
  | 'versandsperre'
  /** Eine der Quellen war nicht lesbar — fail-closed. */
  | 'quelle_unlesbar'

export interface PilotBefund {
  art: PilotBefundArt
  /** Hält dieser Befund den Versand auf? */
  sperrt: boolean
  befund: string
}

export interface RechnungPilotBericht {
  invoiceId: string
  invoiceNumber: string | null
  organizationId: string
  erstelltAm: string

  /** Das Urteil des Piloten — bindend für die Einmal-Freigabe. */
  urteil: PilotUrteil
  /**
   * Das Urteil des allgemeinen Preflights.
   *
   * Kann milder sein als `urteil`: die Pilot-Sperren kommen obendrauf. Beide
   * stehen im Bericht, damit niemand die Differenz für einen Fehler hält.
   */
  preflightStatus: PreflightStatus

  /** Alle 16 Punkte, immer vollständig. */
  punkte: PreflightPunkt[]
  /** Die im Auftrag benannten Gegenstände mit ihrem jeweiligen Stand. */
  auftragspunkte: { name: string; schluessel: PunktSchluessel; stand: string; befund: string }[]

  blocker: string[]
  zuPruefen: string[]
  pilotBefunde: PilotBefund[]

  empfaenger: string | null
  empfaengerName: string | null
  betragEuro: number
  /** Derselbe Betrag in Cent — das ist der Wert, gegen den das Token bindet. */
  betragCent: number
  bereitsVersendetAm: string | null
}

export interface RechnungPilotParams {
  invoiceId: string
  organizationId: string
  /** Ausdrücklicher Nachversand. Für den Erstversand immer `false`. */
  erneutSenden?: boolean
  /** Zeitstempel — injizierbar für reproduzierbare Tests. */
  jetzt?: Date
}

// ---------------------------------------------------------------------------
// Pilot-Sperren
// ---------------------------------------------------------------------------

/**
 * Zweites Bein der Doppelversand-Sperre: eine Erfolgszeile im
 * Versandprotokoll.
 *
 * Unabhängig von `invoices.sent_at`, und das ist der Zweck: bei einem
 * Versand, der nach der angenommenen Mail abbricht, wird das Protokoll VOR
 * dem `sent_at`-Update geschrieben. Genau dann sagt `sent_at` „nie versendet"
 * und diese Zeile sagt die Wahrheit.
 */
async function pruefeProtokollDublette(
  admin: SupabaseClient,
  invoiceId: string,
  organizationId: string,
): Promise<PilotBefund | null> {
  try {
    const { count, error } = await admin
      .from('invoice_email_log')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', invoiceId)
      .eq('organization_id', organizationId)
      .eq('status', 'versendet')

    if (error) {
      return {
        art: 'quelle_unlesbar',
        sperrt: true,
        befund:
          `\`invoice_email_log\` ist nicht lesbar (${error.message}). Ob dieser Beleg schon einmal `
          + 'erfolgreich versendet wurde, ist damit nicht feststellbar — für einen Erstversand ist das ein Blocker.',
      }
    }
    if ((count ?? 0) > 0) {
      return {
        art: 'protokoll_dublette',
        sperrt: true,
        befund:
          `Im Versandprotokoll steht bereits ${count} erfolgreiche(r) Versand/Versände dieses Belegs `
          + '(invoice_email_log, Status „versendet"), unabhängig davon, was `invoices.sent_at` sagt.',
      }
    }
    return null
  } catch (err) {
    return {
      art: 'quelle_unlesbar',
      sperrt: true,
      befund: `\`invoice_email_log\` löste eine Ausnahme aus (${(err as Error).message}) — fail-closed.`,
    }
  }
}

/**
 * Drittes Bein: die kanalübergreifende Zustellspur.
 *
 * `notification_delivery_log` trägt einen Teilindex, der zwei Erfolgszeilen
 * für denselben Vorgang und Kanal verhindert (Migration 20260923000000). Eine
 * bestehende Erfolgszeile heißt: der Idempotenzschlüssel ist verbraucht, ein
 * zweiter Versand liefe in genau diesen Index.
 */
async function pruefeZustellspurDublette(
  admin: SupabaseClient,
  invoiceId: string,
  organizationId: string,
): Promise<PilotBefund | null> {
  try {
    const { count, error } = await admin
      .from('notification_delivery_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('correlation_id', invoiceId)
      .eq('channel', 'email')
      .in('status', ['sent', 'delivered'])

    if (error) {
      return {
        art: 'quelle_unlesbar',
        sperrt: true,
        befund:
          `\`notification_delivery_log\` ist nicht lesbar (${error.message}). Die dritte `
          + 'Dublettenquelle fehlt damit — fail-closed.',
      }
    }
    if ((count ?? 0) > 0) {
      return {
        art: 'zustellspur_dublette',
        sperrt: true,
        befund:
          `Die Zustellspur trägt bereits ${count} Erfolgszeile(n) für diesen Vorgang (Kanal E-Mail). `
          + 'Ein zweiter Versand liefe in den Idempotenz-Index aus Migration 20260923000000.',
      }
    }
    return null
  } catch (err) {
    return {
      art: 'quelle_unlesbar',
      sperrt: true,
      befund: `\`notification_delivery_log\` löste eine Ausnahme aus (${(err as Error).message}) — fail-closed.`,
    }
  }
}

/**
 * Offene Versandsperre aus einer früheren Nachprüfung.
 *
 * Die Sperre kann mandantenweit (`invoice_id IS NULL`) oder auf diesen Beleg
 * bezogen sein. Beides hält auf: eine mandantenweite Sperre entsteht genau
 * dann, wenn die Nachprüfung etwas gefunden hat, das nicht auf eine Rechnung
 * begrenzbar war — etwa eine fremde Organisation im Protokoll.
 */
async function pruefeVersandsperre(
  admin: SupabaseClient,
  invoiceId: string,
  organizationId: string,
): Promise<PilotBefund | null> {
  try {
    const { data, error } = await admin
      .from('pilot_versand_sperre')
      .select('id, schwere, grund, invoice_id, gesetzt_am')
      .eq('organization_id', organizationId)
      .is('aufgehoben_am', null)

    if (error) {
      return {
        art: 'quelle_unlesbar',
        sperrt: true,
        befund:
          `\`pilot_versand_sperre\` ist nicht lesbar (${error.message}). Ob eine Sperre steht, ist damit `
          + 'unbekannt — und eine unbekannte Sperre gilt als gesetzt.',
      }
    }

    const zeilen = (data ?? []) as { id: string; schwere: string; grund: string; invoice_id: string | null; gesetzt_am: string | null }[]
    const einschlaegig = zeilen.filter(z => z.invoice_id === null || z.invoice_id === invoiceId)
    if (einschlaegig.length === 0) return null

    return {
      art: 'versandsperre',
      sperrt: true,
      // `gesetzt_am` ist in der Migration NOT NULL. Trotzdem defensiv
      // gelesen: ein fehlendes Feld darf hier keine Ausnahme werfen, sonst
      // wird aus einer ECHTEN Sperre der Befund „Quelle unlesbar" — beides
      // blockiert zwar, aber die Begründung schickte jemanden in die
      // falsche Richtung.
      befund: einschlaegig
        .map(z => `${z.schwere} seit ${z.gesetzt_am ? z.gesetzt_am.slice(0, 10) : 'unbekannt'}${z.invoice_id === null ? ' (mandantenweit)' : ''}: ${z.grund}`)
        .join(' | '),
    }
  } catch (err) {
    return {
      art: 'quelle_unlesbar',
      sperrt: true,
      befund: `\`pilot_versand_sperre\` löste eine Ausnahme aus (${(err as Error).message}) — fail-closed.`,
    }
  }
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

/**
 * Führt den vollständigen Rechnungs-Preflight aus und legt die Pilot-Sperren
 * darüber. Schreibt nichts, versendet nichts.
 */
export async function pruefeRechnungFuerPilot(
  admin: SupabaseClient,
  params: RechnungPilotParams,
): Promise<RechnungPilotBericht> {
  const { invoiceId, organizationId, erneutSenden = false, jetzt } = params

  const preflight: RechnungPreflightErgebnis = await pruefeRechnungVersandbereit(admin, {
    invoiceId, organizationId, erneutSenden,
  })

  // Die drei Zusatzprüfungen laufen unabhängig voneinander und ohne
  // Abhängigkeit vom Preflight-Ergebnis: ein BLOCKED aus dem Preflight ist
  // kein Grund, eine bestehende Sperre nicht zu melden — wer den einen
  // Blocker behebt, soll den nächsten nicht erst danach erfahren.
  const [protokoll, zustellspur, sperre] = await Promise.all([
    pruefeProtokollDublette(admin, invoiceId, organizationId),
    pruefeZustellspurDublette(admin, invoiceId, organizationId),
    pruefeVersandsperre(admin, invoiceId, organizationId),
  ])

  const pilotBefunde = [protokoll, zustellspur, sperre].filter((x): x is PilotBefund => x !== null)
  const gesperrt = pilotBefunde.some(b => b.sperrt)

  const urteil: PilotUrteil =
    gesperrt || preflight.status === 'BLOCKED'
      ? 'BLOCKED'
      : preflight.status === 'NEEDS_REVIEW'
        ? 'NEEDS_REVIEW'
        : 'READY_FOR_SEND'

  const nachSchluessel = new Map(preflight.punkte.map(p => [p.schluessel, p]))
  const auftragspunkte = AUFTRAGS_KATALOG.map(a => {
    const p = nachSchluessel.get(a.schluessel)
    return {
      name: a.name,
      schluessel: a.schluessel,
      stand: p?.stand ?? 'nicht_anwendbar',
      befund: p?.befund ?? 'Zu diesem Punkt liegt kein Befund vor.',
    }
  })

  return {
    invoiceId,
    invoiceNumber: preflight.invoiceNumber,
    organizationId,
    erstelltAm: (jetzt ?? new Date()).toISOString(),
    urteil,
    preflightStatus: preflight.status,
    punkte: preflight.punkte,
    auftragspunkte,
    blocker: [...preflight.blocker, ...pilotBefunde.filter(b => b.sperrt).map(b => b.befund)],
    zuPruefen: [...preflight.zuPruefen, ...pilotBefunde.filter(b => !b.sperrt).map(b => b.befund)],
    pilotBefunde,
    empfaenger: preflight.empfaenger,
    empfaengerName: preflight.empfaengerName,
    betragEuro: preflight.betragEuro,
    betragCent: euroZuCent(preflight.betragEuro),
    bereitsVersendetAm: preflight.bereitsVersendetAm,
  }
}

// ---------------------------------------------------------------------------
// Menschenlesbare Fassung
// ---------------------------------------------------------------------------

const STAND_ZEICHEN: Record<string, string> = {
  erfuellt: '[ok]',
  blockiert: '[XX]',
  pruefen: '[!]',
  nicht_anwendbar: '[--]',
}

/**
 * Der Bericht als Text.
 *
 * Zeile 1 trägt das Urteil. Die vollständige E-Mail-Adresse steht bewusst
 * NICHT darin: ein Pilotbericht wird herumgereicht, und der Empfänger einer
 * Rechnung ist ein Gesundheitsdatum in dem Sinne, dass er den Kunden einer
 * Pflegeleistung benennt.
 */
export function pilotBerichtAlsText(b: RechnungPilotBericht): string {
  const kopf: Record<PilotUrteil, string> = {
    READY_FOR_SEND: 'READY_FOR_SEND — alle 16 Punkte erfüllt, keine Pilot-Sperre.',
    NEEDS_REVIEW: 'NEEDS_REVIEW — nichts ist nachweislich falsch, aber etwas ist nicht belegbar richtig.',
    BLOCKED: 'BLOCKED — mindestens ein Punkt ist verletzt. Es wird nichts versendet.',
  }

  const zeilen: string[] = [
    `RECHNUNGS-PILOT: ${kopf[b.urteil]}`,
    '',
    `Rechnung:     ${b.invoiceNumber ?? b.invoiceId}`,
    `Mandant:      ${b.organizationId}`,
    `Empfänger:    ${verdeckeEmail(b.empfaenger)}${b.empfaengerName ? ` (${b.empfaengerName})` : ''}`,
    `Betrag:       ${b.betragEuro.toFixed(2)} € (${b.betragCent} Cent)`,
    `Preflight:    ${b.preflightStatus}`,
    `Erstellt:     ${b.erstelltAm}`,
    '',
    'Die 16 Punkte:',
  ]

  for (const p of b.punkte) {
    zeilen.push(`  ${STAND_ZEICHEN[p.stand] ?? '[?]'} ${String(p.nummer).padStart(2, ' ')}. ${p.titel}`)
    zeilen.push(`         ${p.befund}`)
  }

  if (b.pilotBefunde.length > 0) {
    zeilen.push('', 'Zusätzliche Pilot-Prüfungen:')
    for (const pb of b.pilotBefunde) {
      zeilen.push(`  ${pb.sperrt ? '[XX]' : '[!]'} ${pb.art}: ${pb.befund}`)
    }
  }

  if (b.blocker.length > 0) {
    zeilen.push('', 'Blocker:')
    for (const x of b.blocker) zeilen.push(`  - ${x}`)
  }
  if (b.zuPruefen.length > 0) {
    zeilen.push('', 'Zur Sichtung:')
    for (const x of b.zuPruefen) zeilen.push(`  - ${x}`)
  }

  zeilen.push('', 'Dieser Bericht versendet nichts. Er stellt fest, was ein Versand täte.')
  return zeilen.join('\n')
}

/** `max.mustermann@example.org` → `m***@example.org`. */
export function verdeckeEmail(email: string | null): string {
  if (!email) return '—'
  const at = email.lastIndexOf('@')
  if (at <= 0) return '***'
  return `${email[0]}***${email.slice(at)}`
}
