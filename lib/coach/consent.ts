// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Einwilligungen: Auswertung und Durchsetzung
//
// WARUM DIESES MODUL EXISTIERT: Der Widerruf der Pflicht-Einwilligung
// war bisher folgenlos — die Oberfläche sagte „Ohne diese Einwilligung
// kann der PflegeCoach nicht weiter genutzt werden", tatsächlich lief
// aber alles unverändert weiter. Art. 7 Abs. 3 DSGVO verlangt, dass der
// Widerruf so einfach wirkt wie die Erteilung; hier wird er wirksam.
//
// WIRKUNG DES WIDERRUFS (bewusst asymmetrisch):
//  * GESPERRT wird das SCHREIBEN neuer Gesundheitsdaten (Assessments,
//    Ziele, Aktivitäten, Erledigungen, Messungen, Berichte).
//  * ERLAUBT bleiben Lesen, Datenexport (Art. 15/20), Löschung (Art. 17),
//    das erneute Erteilen der Einwilligung und die Darstellungs-
//    Einstellungen. Sonst wäre der Widerruf eine Falle: der Nutzer käme
//    an seine eigenen Daten nicht mehr heran.
//  * Bestehende Daten werden NICHT automatisch gelöscht — der Widerruf
//    wirkt ex nunc. Die Löschung ist ein eigener, ausdrücklicher Schritt
//    (/pflegecoach/loeschung).
// ═══════════════════════════════════════════════════════════════

import type { ConsentTyp } from './types'

/** Ohne diese Einwilligung dürfen keine neuen Gesundheitsdaten entstehen. */
export const PFLICHT_CONSENT: ConsentTyp = 'gesundheitsdaten_art9'

/** Minimal-Form einer Consent-Zeile — bewusst schmal, damit die
 *  Auswertung ohne DB-Typen testbar bleibt. */
export interface ConsentZeile {
  consent_typ: string
  erteilt: boolean
  widerrufen_am: string | null
}

/**
 * Gilt eine Einwilligung aktuell?
 *
 * Die Tabelle ist append-only: Erteilung und Widerruf sind je eine Zeile,
 * beim Widerruf werden zusätzlich die offenen Erteilungen mit
 * `widerrufen_am` gestempelt. Aktiv ist deshalb genau dann etwas, wenn es
 * mindestens eine erteilte, nicht widerrufene Zeile gibt — die Reihenfolge
 * der Zeilen spielt keine Rolle.
 */
export function hatAktiveEinwilligung(zeilen: ConsentZeile[], typ: ConsentTyp): boolean {
  return zeilen.some(z => z.consent_typ === typ && z.erteilt === true && !z.widerrufen_am)
}

export const EINWILLIGUNG_FEHLT_CODE = 'EINWILLIGUNG_FEHLT'

export const EINWILLIGUNG_FEHLT_TEXT =
  'Ihre Einwilligung in die Verarbeitung Ihrer Pflege- und Gesundheitsdaten ist widerrufen. ' +
  'Neue Einträge sind deshalb nicht möglich. Sie können die Einwilligung in den Einstellungen ' +
  'erneut erteilen — oder Ihre Daten dort exportieren und anschließend löschen.'

export const FREISCHALTUNG_NOETIG_CODE = 'FREISCHALTUNG_NOETIG'

export const FREISCHALTUNG_NOETIG_TEXT =
  'Für neue Einträge ist ein freigeschalteter Zugang nötig. Bitte lösen Sie Ihren Freischaltcode ein.'
