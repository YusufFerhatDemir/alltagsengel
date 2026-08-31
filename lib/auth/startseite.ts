// ═══════════════════════════════════════════════════════════════════════
// Rolle → Startseite
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND 31.08.2026: dieselbe Frage wurde an drei Stellen unterschiedlich
// beantwortet — proxy.ts (ROLE_HOME), app/auth/login/page.tsx und
// app/auth/callback/route.ts. Die Antworten wichen fuer sechs der neun
// Rollen voneinander ab:
//
//   Rolle         proxy         Login-Seite     Callback
//   superadmin    /admin/home   /mis            /kunde/home   ←
//   pdl           /admin/home   /kunde/home ←   /kunde/home   ←
//   qm            /admin/home   /kunde/home ←   /kunde/home   ←
//   buchhaltung   /admin/home   /kunde/home ←   /kunde/home   ←
//   fahrer        /fahrer/home  /fahrer/home    /kunde/home   ←
//   angehoerige   /angehoerige  /angehoerige    /kunde/home   ←
//
// Kein Datenleck: der Proxy wirft die falsch geschickte Rolle wieder in
// ihren Bereich zurueck. Aber jede dieser Zeilen ist ein Umweg durch eine
// fremde Anwendung — eine Pflegedienstleitung meldet sich an, sieht kurz
// die Kunden-App und wird weitergeworfen. Wer ueber den Bestaetigungs-
// oder Magic-Link kam (Callback), landete als Fahrer oder Angehoeriger
// sogar auf einer Seite, die er ueberhaupt nicht betreten darf.
//
// Deshalb steht die Zuordnung ab jetzt genau einmal hier.
//
// ZWEI FRAGEN, NICHT EINE
// „Wohin nach dem Anmelden?" und „Wohin, wenn jemand im falschen Bereich
// steht?" sind nicht dieselbe Frage. Fuer admin/superadmin weichen sie
// bewusst ab: die Anmeldung fuehrt in die Betriebsuebersicht /mis, der
// Rueckverweis des Proxys dagegen nach /admin/home — dort steht mit
// `berichte.lesen` die niedrigste Anforderung, was eine Weiterleitungs-
// schleife ausschliesst. Genau das war der Unterschied, der oben als
// Widerspruch aussah und keiner ist; er ist hier benannt statt verstreut.

import type { Rolle } from './rollen'

/**
 * Rueckverweis, wenn jemand einen Bereich betritt, der ihm nicht offen
 * steht. Ziel muss eine Seite sein, die die Rolle sicher betreten darf —
 * sonst verweist der Proxy im Kreis.
 */
export const BEREICHS_STARTSEITE: Readonly<Record<Rolle, string>> = {
  superadmin:  '/admin/home',
  admin:       '/admin/home',
  pdl:         '/admin/home',
  qm:          '/admin/home',
  buchhaltung: '/admin/home',
  engel:       '/engel/home',
  fahrer:      '/fahrer/home',
  kunde:       '/kunde/home',
  angehoerige: '/angehoerige',
}

/**
 * Ziel direkt nach einer erfolgreichen Anmeldung.
 *
 * Weicht nur fuer die Administration ab (siehe Kopf): dort ist /mis die
 * gewollte Einstiegsseite.
 */
export const ANMELDE_STARTSEITE: Readonly<Record<Rolle, string>> = {
  ...BEREICHS_STARTSEITE,
  superadmin: '/mis',
  admin:      '/mis',
}

/** Ziel, wenn die Rolle unbekannt oder leer ist. */
export const UNBEKANNTE_ROLLE_ZIEL = '/kunde/home'

function nachschlagen(karte: Readonly<Record<string, string>>, rolle: string | null | undefined): string {
  if (!rolle) return UNBEKANNTE_ROLLE_ZIEL
  return karte[rolle] ?? UNBEKANNTE_ROLLE_ZIEL
}

/** Wohin nach dem Anmelden. */
export function startseiteNachAnmeldung(rolle: string | null | undefined): string {
  return nachschlagen(ANMELDE_STARTSEITE, rolle)
}

/** Wohin zurueck, wenn der angefragte Bereich der Rolle nicht offen steht. */
export function startseiteBeiFalschemBereich(rolle: string | null | undefined): string {
  return nachschlagen(BEREICHS_STARTSEITE, rolle)
}

/**
 * Betritt diese Rolle mit dem Anmelde-Ziel einen Bereich, den sie auch
 * behalten darf? Rein fuer Tests und Pruefskripte — die Antwort muss fuer
 * jede Rolle „ja" sein, sonst schickt die Anmeldung jemanden in eine
 * Weiterleitung.
 */
export function anmeldeZielIstErlaubt(
  rolle: Rolle,
  erlaubteBereiche: Readonly<Record<string, string[]>>,
): boolean {
  const ziel = ANMELDE_STARTSEITE[rolle]
  const bereiche = erlaubteBereiche[rolle] ?? []
  return bereiche.some(b => ziel === b || ziel.startsWith(b + '/'))
}
