// ═══════════════════════════════════════════════════════════════════
// Leistungsnachweis — Zeitraum eines Einsatzes
// ═══════════════════════════════════════════════════════════════════
//
// BEFUND (Track 12, B5): `service_records.duration_minutes` ist live eine
// GENERATED-Spalte:
//
//     duration_minutes = (EXTRACT(epoch FROM (end_time - start_time)))::int / 60
//
// Und genau dieser Wert bestimmt den Rechnungsbetrag. In
// `create_invoice_draft_atomic` steht:
//
//     WHEN 'zeit_stunde' THEN ROUND(preis_cent/100.0 * (duration_minutes/60.0), 2)
//
// Es gibt live WEDER einen CHECK-Constraint NOCH eine Pruefung im
// Anwendungscode, die `end_time > start_time` verlangt. `start_time` und
// `end_time` sind `time without time zone`. Ein Nachtdienst von 22:00 bis
// 06:00 ist damit als Zeile darstellbar — und ergibt
//
//     duration_minutes = -960
//
// also eine Rechnungsposition mit NEGATIVEM Betrag. Der Einsatz wird nicht
// abgelehnt, nicht gemeldet und nicht gerundet: er zieht Geld von der
// Rechnung ab. Nachtzuschlaege sind in `billing_tariffs` ausdruecklich
// vorgesehen (`nacht_von`, `nacht_bis`, `zuschlag_nacht_prozent`) — ein
// Einsatz ueber Mitternacht ist also ein VORGESEHENER Fall, kein Ausreisser.
//
// Dass die richtige Antwort im Repo schon bekannt ist, steht in der
// Datenbank: `angel_availability` traegt den CHECK `zeitfenster_gueltig`.
// Fuer `service_records` und `assignments` fehlt das Gegenstueck.
//
// Diese Datei haelt die Regel als REINE Funktion — ohne next/server und ohne
// Supabase —, damit sie an jedem Schreibweg benutzbar und ohne Sitzung
// pruefbar ist. Die Migration 20261017000000 zieht denselben Riegel in der
// Datenbank nach; bis sie angewendet ist, ist diese Pruefung die einzige.
//
// ── Warum nicht "Mitternacht mitrechnen" ────────────────────────────────
// Naheliegend waere, bei end < start einfach 24 Stunden zu addieren und den
// Nachtdienst so korrekt zu berechnen. Das waere hier FALSCH: die Spalte,
// die abgerechnet wird, ist generiert und rechnet ohne diesen Zuschlag
// weiter. Die Anwendung wuerde dann eine andere Dauer melden als die, die in
// die Rechnung geht — ein Auseinanderlaufen, das niemand sieht. Solange die
// generierte Spalte so rechnet, wie sie rechnet, ist die einzige ehrliche
// Antwort: den Einsatz ueber Mitternacht in zwei Nachweise teilen und das
// hier auch so sagen.
// ═══════════════════════════════════════════════════════════════════

import { UserFacingError } from '@/lib/api/user-facing-error'

/** Zeitwert `HH:MM` oder `HH:MM:SS` in Minuten seit Mitternacht, sonst null. */
export function minutenSeitMitternacht(zeit: unknown): number | null {
  if (typeof zeit !== 'string') return null
  const treffer = zeit.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!treffer) return null
  const stunden = Number(treffer[1])
  const minuten = Number(treffer[2])
  const sekunden = treffer[3] ? Number(treffer[3]) : 0
  if (stunden > 23 || minuten > 59 || sekunden > 59) return null
  // Sekunden zaehlen nicht mit: die generierte Spalte teilt ganzzahlig durch
  // 60, Sekundenanteile fallen dort ohnehin weg.
  return stunden * 60 + minuten
}

/**
 * Dauer in Minuten — exakt so, wie die generierte Spalte sie bildet.
 *
 * Gibt null zurueck, wenn einer der Werte nicht lesbar ist. Ein negativer
 * Rueckgabewert ist moeglich und ausdruecklich gewollt: er ist der Befund,
 * nicht ein Fehler dieser Funktion.
 */
export function dauerMinuten(startTime: unknown, endTime: unknown): number | null {
  const start = minutenSeitMitternacht(startTime)
  const ende = minutenSeitMitternacht(endTime)
  if (start === null || ende === null) return null
  return ende - start
}

export type ZeitraumBefund =
  /** Beide Zeiten lesbar, Ende nach Beginn. */
  | 'gueltig'
  /** Mindestens eine Zeit fehlt oder ist nicht als HH:MM lesbar. */
  | 'unlesbar'
  /** Ende liegt vor dem Beginn — Einsatz ueber Mitternacht. */
  | 'ende_vor_beginn'
  /** Ende gleich Beginn — Dauer null, Rechnungsposition ueber 0,00 EUR. */
  | 'ohne_dauer'

export interface ZeitraumPruefung {
  befund: ZeitraumBefund
  dauerMinuten: number | null
  /** Menschenlesbare Begruendung, null bei 'gueltig'. */
  meldung: string | null
}

/**
 * Prueft den Zeitraum eines Leistungsnachweises.
 *
 * Fail-closed: ein nicht lesbarer Zeitwert gilt als ungueltig. Ein
 * stillschweigendes "dann eben ohne Pruefung" waere hier der gefaehrlichere
 * Ausgang — die generierte Spalte rechnet trotzdem, und was sie dann
 * ausrechnet, sieht niemand mehr an.
 */
export function pruefeZeitraum(startTime: unknown, endTime: unknown): ZeitraumPruefung {
  const dauer = dauerMinuten(startTime, endTime)

  if (dauer === null) {
    return {
      befund: 'unlesbar',
      dauerMinuten: null,
      meldung:
        'Beginn und Ende des Einsatzes müssen als Uhrzeit im Format HH:MM angegeben sein. '
        + 'Aus diesen beiden Werten berechnet die Datenbank die Einsatzdauer, und aus der '
        + 'Dauer den Rechnungsbetrag.',
    }
  }

  if (dauer < 0) {
    return {
      befund: 'ende_vor_beginn',
      dauerMinuten: dauer,
      meldung:
        'Das Ende des Einsatzes liegt vor seinem Beginn. Die Einsatzdauer wird aus der '
        + `Differenz berechnet und wäre damit negativ (${dauer} Minuten) — die Rechnungsposition `
        + 'würde Geld von der Rechnung abziehen statt es in Rechnung zu stellen. '
        + 'Einsätze über Mitternacht bitte als zwei Nachweise erfassen (bis 23:59 und ab 00:00).',
    }
  }

  if (dauer === 0) {
    return {
      befund: 'ohne_dauer',
      dauerMinuten: 0,
      meldung:
        'Beginn und Ende des Einsatzes sind identisch. Die Einsatzdauer wäre null und die '
        + 'Rechnungsposition damit 0,00 EUR.',
    }
  }

  return { befund: 'gueltig', dauerMinuten: dauer, meldung: null }
}

/** true nur bei 'gueltig'. */
export function istZeitraumGueltig(startTime: unknown, endTime: unknown): boolean {
  return pruefeZeitraum(startTime, endTime).befund === 'gueltig'
}

/**
 * Wirft UserFacingError(422), wenn der Zeitraum nicht abrechenbar ist.
 *
 * Aufzurufen VOR dem Schreibvorgang: ist die Zeile erst angelegt, steht die
 * generierte Dauer darin und der Nachweis laeuft mit in den Rechnungslauf.
 */
export function assertZeitraumGueltig(startTime: unknown, endTime: unknown): void {
  const pruefung = pruefeZeitraum(startTime, endTime)
  if (pruefung.befund === 'gueltig') return
  throw new UserFacingError(pruefung.meldung ?? 'Ungültiger Einsatzzeitraum.', 422)
}
