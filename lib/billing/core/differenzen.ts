// ═══════════════════════════════════════════════════════════════
// KUERZUNGEN — Lebenszyklus einer Zahlungsdifferenz
// ═══════════════════════════════════════════════════════════════
//
// Eine Kasse zahlt weniger als abgerechnet. recordPaymentDifference()
// haelt das fest (payment_differences) und setzt die Rechnung auf
// 'gekuerzt'. Was DANACH passiert — Widerspruch einlegen, Ergebnis
// festhalten, Restbetrag abschreiben — hat die Tabelle seit Migration
// 20260808210000 vollstaendig vorgesehen: acht Zustaende, Frist,
// Zeitpunkt, Notiz und drei Geldfelder.
//
// BEFUND (29.08.2026): KEIN Codepfad konnte einen anderen Zustand als
// 'offen' schreiben. recordPaymentDifference setzt widerspruch_status
// gar nicht (DB-Default 'offen'), lib/billing/sepa/ruecklastschrift.ts
// setzt ausdruecklich 'offen' — und sonst schrieb niemand das Feld.
//
// Das ist mehr als eine fehlende Ansicht. ZWEI Mahnbremsen fragen
// dieses Feld ab:
//   • lib/billing/core/dunning.ts    — Mahnlauf uebergeht die Rechnung
//   • lib/billing/dunning/mahn-safety-gate.ts — Pruefung 7
// Beide suchen nach 'widerspruch_eingereicht' oder 'nachforderung'.
// Da niemand diese Werte setzen konnte, war die Bremse toter Code: eine
// bestrittene Forderung wurde weitergemahnt, obwohl beide Stellen genau
// das verhindern sollen. Die Sperre stand da und konnte nie greifen.
//
// Dieses Modul ist bewusst OHNE Datenbank gebaut: der Fehler, den man
// bei einem Zustandsuebergang macht, ist ein Feld das stehenbleibt oder
// eines das faelschlich geraeumt wird, und beides sieht in einem Lauf
// gegen echte Daten nach Erfolg aus.

/**
 * Die acht Zustaende der CHECK-Bedingung auf
 * payment_differences.widerspruch_status (Migration 20260808210000).
 * Ein Wert ausserhalb dieser Liste laesst das UPDATE an der
 * CHECK-Bedingung scheitern — deshalb wird hier VOR dem Schreiben
 * geprueft, statt einen Constraint-Fehler als 500 durchzureichen.
 */
export const WIDERSPRUCH_STATUS = [
  'offen',
  'widerspruch_eingereicht',
  'widerspruch_anerkannt',
  'widerspruch_abgelehnt',
  'nachforderung',
  'gutschrift',
  'abschreibung',
  'erledigt',
] as const

export type WiderspruchStatus = (typeof WIDERSPRUCH_STATUS)[number]

/**
 * Zustaende, in denen die Forderung bestritten ist und NICHT gemahnt
 * werden darf. Einzige Quelle fuer beide Mahnbremsen — vorher stand die
 * Liste zweimal wortgleich im Code, und zwei Kopien einer Sperrliste
 * driften genau dann auseinander, wenn ein Zustand dazukommt.
 */
export const MAHNBREMSE_STATUS: readonly WiderspruchStatus[] = [
  'widerspruch_eingereicht',
  'nachforderung',
]

/**
 * Zustaende, in denen ueber das Geld entschieden IST: eine Gutschrift ist
 * erstellt, der Rest abgeschrieben, oder der Vorgang ausdruecklich
 * abgeschlossen.
 *
 * 'widerspruch_anerkannt' und 'widerspruch_abgelehnt' gehoeren bewusst
 * NICHT dazu: das ist die Entscheidung der Kasse, nicht die Erledigung
 * des Vorgangs. Nach einem abgelehnten Widerspruch steht der Betrag noch
 * genauso offen wie vorher — er muss erst abgeschrieben oder anders
 * verbucht werden. Traegt so eine Zeile schon ein resolved_at, behauptet
 * sie das Gegenteil dessen, was ihr Zustand sagt.
 */
export const ERLEDIGT_STATUS: readonly WiderspruchStatus[] = [
  'gutschrift',
  'abschreibung',
  'erledigt',
]

export function istMahnbremse(status: string): boolean {
  return (MAHNBREMSE_STATUS as readonly string[]).includes(status)
}

export function istErledigt(status: string): boolean {
  return (ERLEDIGT_STATUS as readonly string[]).includes(status)
}

export interface DifferenzBestand {
  /** Generierte Spalte soll_cents - ist_cents. */
  differenz_cents: number
  widerspruch_status: string
  widerspruch_at: string | null
  nachforderung_cents: number | null
  gutschrift_cents: number | null
  abschreibung_cents: number | null
}

export interface DifferenzEingabe {
  status?: unknown
  notizen?: unknown
  frist?: unknown
  nachforderungCents?: unknown
  gutschriftCents?: unknown
  abschreibungCents?: unknown
}

export type DifferenzPlan =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; fehler: string }

function istGanzzahlOderUndefined(v: unknown): v is number | undefined {
  return v === undefined || (typeof v === 'number' && Number.isInteger(v) && Number.isFinite(v))
}

/**
 * Baut aus Bestand und Eingabe den DB-Patch fuer eine Kuerzung.
 * Rein — kein DB-Zugriff, keine Uhr: `jetzt` und `actorId` kommen von aussen.
 */
export function planeDifferenzPatch(
  bestand: DifferenzBestand,
  eingabe: DifferenzEingabe,
  jetzt: string,
  actorId: string,
): DifferenzPlan {
  const patch: Record<string, unknown> = {}

  // ── Zustand ──────────────────────────────────────────────────
  let zielStatus = bestand.widerspruch_status
  if (eingabe.status !== undefined) {
    if (typeof eingabe.status !== 'string'
      || !(WIDERSPRUCH_STATUS as readonly string[]).includes(eingabe.status)) {
      return {
        ok: false,
        fehler: `Unbekannter Widerspruch-Status: ${JSON.stringify(eingabe.status)}. `
          + `Zulässig sind: ${WIDERSPRUCH_STATUS.join(', ')}.`,
      }
    }
    zielStatus = eingabe.status
    patch.widerspruch_status = zielStatus
  }

  // ── Notiz und Frist ──────────────────────────────────────────
  if (eingabe.notizen !== undefined) {
    if (eingabe.notizen !== null && typeof eingabe.notizen !== 'string') {
      return { ok: false, fehler: 'notizen muss Text oder null sein.' }
    }
    const text = typeof eingabe.notizen === 'string' ? eingabe.notizen.trim() : ''
    // Leerer Text wird zu null und nicht zum leeren String: die Spalte ist
    // nullable, und ein leerer String saehe in der Liste aus wie eine Notiz,
    // die jemand geschrieben und dann geleert hat.
    patch.widerspruch_notes = text === '' ? null : text
  }

  if (eingabe.frist !== undefined) {
    if (eingabe.frist === null || eingabe.frist === '') {
      patch.widerspruch_frist = null
    } else if (typeof eingabe.frist === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(eingabe.frist)) {
      patch.widerspruch_frist = eingabe.frist
    } else {
      return { ok: false, fehler: 'frist muss ein Datum im Format JJJJ-MM-TT oder null sein.' }
    }
  }

  // ── Geldfelder ───────────────────────────────────────────────
  const geldFelder = [
    ['nachforderungCents', 'nachforderung_cents'],
    ['gutschriftCents', 'gutschrift_cents'],
    ['abschreibungCents', 'abschreibung_cents'],
  ] as const
  for (const [eingabeName, spalte] of geldFelder) {
    const wert = eingabe[eingabeName]
    if (wert === undefined) continue
    if (!istGanzzahlOderUndefined(wert)) {
      return { ok: false, fehler: `${eingabeName} muss eine ganze Zahl in Cent sein.` }
    }
    if (wert < 0) {
      return { ok: false, fehler: `${eingabeName} darf nicht negativ sein.` }
    }
    patch[spalte] = wert
  }

  // Ueber die Kuerzung hinaus laesst sich nichts verbuchen: Nachforderung,
  // Gutschrift und Abschreibung teilen denselben einbehaltenen Betrag auf.
  // Ohne diesen Riegel liesse sich eine Kuerzung von 100 EUR als 100 EUR
  // Gutschrift UND 100 EUR Abschreibung festhalten — der Vorgang saehe
  // erledigt aus und die Summe waere doppelt so hoch wie das Geld, um das
  // es geht.
  const summe =
    Number(patch.nachforderung_cents ?? bestand.nachforderung_cents ?? 0)
    + Number(patch.gutschrift_cents ?? bestand.gutschrift_cents ?? 0)
    + Number(patch.abschreibung_cents ?? bestand.abschreibung_cents ?? 0)
  if (summe > bestand.differenz_cents) {
    return {
      ok: false,
      fehler:
        `Nachforderung, Gutschrift und Abschreibung ergeben zusammen ${(summe / 100).toFixed(2)} € `
        + `und übersteigen damit die Kürzung von ${(bestand.differenz_cents / 100).toFixed(2)} €.`,
    }
  }

  // ── Zeitstempel, die am Zustand haengen ──────────────────────
  if (eingabe.status !== undefined) {
    // Der Zeitpunkt des Widerspruchs wird beim ERSTEN Einlegen gesetzt und
    // danach nicht mehr angefasst — er belegt, wann die Frist gewahrt wurde.
    if (zielStatus === 'widerspruch_eingereicht' && !bestand.widerspruch_at) {
      patch.widerspruch_at = jetzt
    }

    if (istErledigt(zielStatus)) {
      patch.resolved_at = jetzt
      patch.resolved_by = actorId
    } else if (istErledigt(bestand.widerspruch_status)) {
      // ABRAEUMEN beim Zurueckholen in einen offenen Zustand. Bliebe der
      // Zeitstempel stehen, truege ein wieder offener Vorgang einen
      // Erledigungsbeleg — ein Nachweis, der das Gegenteil dessen behauptet,
      // was der Zustand sagt.
      patch.resolved_at = null
      patch.resolved_by = null
    }
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, fehler: 'Keine Änderungen übergeben.' }
  }

  return { ok: true, patch }
}
