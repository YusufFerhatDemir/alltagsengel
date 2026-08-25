// ═══════════════════════════════════════════════════════════════════════════
// VERSAND-SCHALTER — die zwei Flags, die echte Post an echte Kunden auslösen
//
// PROBLEM, DAS DIESE DATEI LÖST
// `RECHNUNGSVERSAND_AUTOMATISCH` und `MAHNVERSAND_AUTOMATISCH` wurden an drei
// Stellen mit `process.env.X === '1'` ausgewertet. Das war fail-closed und
// insofern richtig — aber es fehlten drei Dinge:
//
//   1. UMGEBUNGSTRENNUNG. Eine Vercel-Variable, die für „All Environments"
//      angelegt wird, steht auch in JEDEM Preview-Deployment und in jedem
//      lokalen `vercel env pull`. Beim Umlegen des Schalters für die
//      Produktion hätte damit jeder Branch-Preview und jeder Entwicklerrechner
//      angefangen, echte Rechnungen und Mahnungen zu verschicken — an dieselbe
//      Produktionsdatenbank, mit demselben Resend-Schlüssel. Der Schalter
//      allein reicht deshalb nicht mehr: er wirkt NUR im Produktionslauf.
//      Wer ihn außerhalb der Produktion braucht (bewusster Test gegen eine
//      Testdatenbank), setzt zusätzlich `VERSAND_NICHT_PRODUKTION_ERLAUBT=1`.
//
//   2. UNGÜLTIGE WERTE waren nicht von „nicht gesetzt" unterscheidbar.
//      `true`, `yes`, `ja`, `1 ` (mit Leerzeichen) — alle bedeuteten AUS, und
//      das ist richtig. Aber niemand erfuhr davon. Wer den Schalter umlegt und
//      `true` einträgt, sitzt danach vor einem System, das schweigt und nichts
//      verschickt. Ein ungültiger Wert ist jetzt ein eigener Befund mit
//      lautem Protokolleintrag.
//
//   3. AUDIT. Ein Wechsel zwischen „verschickt automatisch" und „verschickt
//      nicht" ist eine geldrelevante Betriebsänderung. Sie war nirgends
//      festgehalten — nachträglich ließ sich nicht sagen, ob am 3. des Monats
//      automatisch versendet wurde oder nicht.
//
// ── FAIL-CLOSED, WÖRTLICH ──────────────────────────────────────────────────
// AN ist ausschließlich der exakte Wert `'1'`. NICHT getrimmt: `' 1'` ist
// ungültig, nicht an. Das ist bewusst strenger als nötig — ein Wert, bei dem
// unklar ist, ob er absichtlich so aussieht, darf keine Post auslösen.
//
// ── ABGRENZUNG ─────────────────────────────────────────────────────────────
// Dieses Modul entscheidet, OB automatisch versendet werden darf. Es versendet
// nichts und kennt keine Rechnung. Der manuelle Versand über
// POST /api/billing/invoices/[id]/versenden bzw. /api/billing/dunning/versand
// hängt NICHT an diesen Schaltern: dort steht ein Mensch davor.
// ═══════════════════════════════════════════════════════════════════════════

import { istBuildLauf, istProduktionslauf, type EnvQuelle } from '@/lib/env/pruefung'

/** Die beiden Schalter. Mehr gibt es nicht, und mehr soll es nicht geben. */
export const VERSAND_FLAGS = [
  'RECHNUNGSVERSAND_AUTOMATISCH',
  'MAHNVERSAND_AUTOMATISCH',
] as const

export type VersandFlagName = (typeof VERSAND_FLAGS)[number]

/** Die Ausnahme-Variable, die den Schalter außerhalb der Produktion zulässt. */
export const NICHT_PRODUKTION_ERLAUBT = 'VERSAND_NICHT_PRODUKTION_ERLAUBT'

/** Der einzige Wert, der einschaltet. */
export const AN_WERT = '1'

/**
 * Warum der Schalter steht, wie er steht.
 *
 * Die Unterscheidung ist der eigentliche Zweck: „aus, weil nicht gesetzt" ist
 * der Normalzustand, „aus, weil der Wert Unsinn ist" ist ein Konfigurations-
 * fehler, und „aus, weil das hier kein Produktionslauf ist" ist die
 * Umgebungstrennung bei der Arbeit.
 */
export type VersandFlagBefund =
  /** Nicht gesetzt oder leer — Normalzustand. */
  | 'aus_fehlt'
  /** Ausdrücklich abgeschaltet ('0'). */
  | 'aus_explizit'
  /** Gesetzt, aber mit einem Wert, der nicht '1' ist. Konfigurationsfehler. */
  | 'aus_ungueltig'
  /** Auf '1', aber der Lauf ist keine Produktion und die Ausnahme fehlt. */
  | 'aus_umgebung'
  /** Scharf. */
  | 'an'

export interface VersandFlagStand {
  name: VersandFlagName
  /** Steht überhaupt ein nicht-leerer Wert in der Umgebung? */
  gesetzt: boolean
  /**
   * Ist der Wert einer der beiden verstandenen ('1' / '0')?
   *
   * Der Rohwert selbst wird bewusst NICHT nach außen gegeben — er landete
   * sonst über die Cron-Antwort im Protokoll. Für die Fehlersuche genügt
   * „ungültig".
   */
  wertGueltig: boolean
  /** Darf automatisch versendet werden? Das ist die einzige Frage, die zählt. */
  aktiv: boolean
  befund: VersandFlagBefund
  /** Ein Satz Klartext für Protokoll und Betriebsantwort. */
  grund: string
}

export interface VersandFlagsStand {
  rechnung: VersandFlagStand
  mahnung: VersandFlagStand
  /** Produktionslauf im Sinne von lib/env/pruefung.ts. */
  produktion: boolean
  /** Ist die Ausnahme für Nicht-Produktion gesetzt? */
  ausnahmeAktiv: boolean
  /** Alles, was jemand sehen sollte: ungültige Werte, aktive Ausnahme. */
  warnungen: string[]
}

const LABEL: Record<VersandFlagName, string> = {
  RECHNUNGSVERSAND_AUTOMATISCH: 'Automatischer Rechnungsversand',
  MAHNVERSAND_AUTOMATISCH: 'Automatischer Mahnversand',
}

/**
 * Liest einen Schalter aus einer Umgebungsquelle.
 *
 * Rein: keine Nebenwirkung, kein Protokoll, keine Datenbank. Genau deshalb
 * ist jede der fünf Befundlagen einzeln testbar.
 */
export function leseVersandFlag(
  name: VersandFlagName,
  quelle: EnvQuelle = process.env,
): VersandFlagStand {
  const roh = quelle[name]
  const gesetzt = typeof roh === 'string' && roh !== ''

  if (!gesetzt) {
    return {
      name,
      gesetzt: false,
      wertGueltig: true,
      aktiv: false,
      befund: 'aus_fehlt',
      grund: `${LABEL[name]} ist aus: ${name} ist nicht gesetzt.`,
    }
  }

  if (roh === '0') {
    return {
      name,
      gesetzt: true,
      wertGueltig: true,
      aktiv: false,
      befund: 'aus_explizit',
      grund: `${LABEL[name]} ist aus: ${name} steht auf '0'.`,
    }
  }

  if (roh !== AN_WERT) {
    // Bewusst OHNE den Rohwert in der Meldung: der Grund wandert in
    // Cron-Antworten und Protokolle, und dort hat auch ein harmloser
    // Konfigurationswert nichts verloren, dessen Herkunft niemand kennt.
    return {
      name,
      gesetzt: true,
      wertGueltig: false,
      aktiv: false,
      befund: 'aus_ungueltig',
      grund:
        `${LABEL[name]} ist aus: ${name} trägt einen Wert, der weder '1' noch '0' ist. ` +
        `Nur der exakte Wert '1' schaltet ein — auch Leerraum um die Ziffer zählt als ungültig.`,
    }
  }

  // Ab hier: der Wert ist '1'. Bleibt die Umgebungsfrage.
  const produktion = istProduktionslauf(quelle)
  const ausnahme = quelle[NICHT_PRODUKTION_ERLAUBT] === AN_WERT

  if (!produktion && !ausnahme) {
    return {
      name,
      gesetzt: true,
      wertGueltig: true,
      aktiv: false,
      befund: 'aus_umgebung',
      grund:
        `${LABEL[name]} ist aus: ${name} steht zwar auf '1', dieser Lauf ist aber keine ` +
        `Produktion (Preview, Entwicklung oder Build). Eine Vercel-Variable für „All ` +
        `Environments" gilt sonst auch in jedem Branch-Preview. Für einen bewussten Test ` +
        `außerhalb der Produktion zusätzlich ${NICHT_PRODUKTION_ERLAUBT}=1 setzen.`,
    }
  }

  return {
    name,
    gesetzt: true,
    wertGueltig: true,
    aktiv: true,
    befund: 'an',
    grund: ausnahme && !produktion
      ? `${LABEL[name]} ist SCHARF — außerhalb der Produktion, freigegeben über ${NICHT_PRODUKTION_ERLAUBT}=1.`
      : `${LABEL[name]} ist SCHARF.`,
  }
}

/** Beide Schalter auf einmal, samt Umgebungslage und Warnungen. */
export function versandFlagsStand(quelle: EnvQuelle = process.env): VersandFlagsStand {
  const rechnung = leseVersandFlag('RECHNUNGSVERSAND_AUTOMATISCH', quelle)
  const mahnung = leseVersandFlag('MAHNVERSAND_AUTOMATISCH', quelle)
  const produktion = istProduktionslauf(quelle)
  const ausnahmeAktiv = quelle[NICHT_PRODUKTION_ERLAUBT] === AN_WERT

  const warnungen: string[] = []
  for (const stand of [rechnung, mahnung]) {
    if (stand.befund === 'aus_ungueltig') warnungen.push(stand.grund)
    if (stand.befund === 'aus_umgebung') warnungen.push(stand.grund)
  }
  if (ausnahmeAktiv && !produktion) {
    warnungen.push(
      `${NICHT_PRODUKTION_ERLAUBT}=1 ist gesetzt: die Versand-Schalter wirken in dieser ` +
      `Nicht-Produktions-Umgebung. Das ist nur für einen begleiteten Test gedacht.`,
    )
  }
  if (ausnahmeAktiv && produktion) {
    warnungen.push(
      `${NICHT_PRODUKTION_ERLAUBT} ist in der PRODUKTION gesetzt. Dort ist die Variable ` +
      `wirkungslos und gehört entfernt — sie verschleiert nur, woran der Versand hängt.`,
    )
  }
  return { rechnung, mahnung, produktion, ausnahmeAktiv, warnungen }
}

/** Kurzfrage für den Rechnungsweg. */
export function rechnungsversandAktiv(quelle: EnvQuelle = process.env): boolean {
  return leseVersandFlag('RECHNUNGSVERSAND_AUTOMATISCH', quelle).aktiv
}

/** Kurzfrage für den Mahnweg. */
export function mahnversandAktiv(quelle: EnvQuelle = process.env): boolean {
  return leseVersandFlag('MAHNVERSAND_AUTOMATISCH', quelle).aktiv
}

// ---------------------------------------------------------------------------
// Startprüfung
// ---------------------------------------------------------------------------

/**
 * Schreibt die Lage beider Schalter einmal pro Serverprozess ins Protokoll.
 *
 * Bricht NICHT ab — aus demselben Grund, aus dem `pruefeEnvBeimStart` wegen
 * eines fehlenden `RESEND_API_KEY` nicht abbricht: eine Produktionsseite wegen
 * eines Versandschalters herunterzufahren wäre der größere Schaden. Was diese
 * Funktion leistet, ist Sichtbarkeit: nach einem Deployment steht im
 * Vercel-Protokoll, ob automatisch verschickt wird, und bei einem ungültigen
 * Wert steht dort auch, dass er ungültig ist.
 *
 * Im Build-Lauf passiert nichts: dort sind die Variablen absichtlich nur
 * Platzhalter (.github/workflows/ci.yml), ein Befund wäre bedeutungslos.
 */
export function pruefeVersandFlagsBeimStart(
  quelle: EnvQuelle = process.env,
  protokoll: Pick<Console, 'log' | 'warn'> = console,
): VersandFlagsStand {
  const stand = versandFlagsStand(quelle)
  if (istBuildLauf(quelle)) return stand

  protokoll.log(
    `[versand-flags] ${stand.rechnung.grund} ${stand.mahnung.grund}` +
    ` (Produktionslauf: ${stand.produktion ? 'ja' : 'nein'})`,
  )
  for (const w of stand.warnungen) protokoll.warn(`[versand-flags] ${w}`)

  return stand
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/**
 * Was von einem Schalterstand im Audit landet.
 *
 * Bewusst nur der Befund, nie der Rohwert.
 */
export interface VersandFlagAuditZustand {
  rechnungsversand: VersandFlagBefund
  mahnversand: VersandFlagBefund
  produktion: boolean
}

export function auditZustand(stand: VersandFlagsStand): VersandFlagAuditZustand {
  return {
    rechnungsversand: stand.rechnung.befund,
    mahnversand: stand.mahnung.befund,
    produktion: stand.produktion,
  }
}

/**
 * Haben sich die Schalter gegenüber dem zuletzt festgehaltenen Zustand geändert?
 *
 * Rein und damit testbar. `vorher === null` (noch nie festgehalten) gilt als
 * Änderung — der erste Eintrag ist der Anfang der Spur.
 */
export function standGeaendert(
  vorher: VersandFlagAuditZustand | null,
  jetzt: VersandFlagAuditZustand,
): boolean {
  if (!vorher) return true
  return (
    vorher.rechnungsversand !== jetzt.rechnungsversand ||
    vorher.mahnversand !== jetzt.mahnversand ||
    vorher.produktion !== jetzt.produktion
  )
}
