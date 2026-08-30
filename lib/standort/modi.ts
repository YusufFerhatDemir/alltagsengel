// ═══════════════════════════════════════════════════════════════════════
// Standortfreigabe — die drei Modi
// ═══════════════════════════════════════════════════════════════════════
//
// Diese Datei ist bewusst REIN: keine Datenbank, kein `server-only`,
// keine Kopfzeilen. Sie wird von der Oberflaeche (Client-Komponenten),
// von den Routen und von den Server-Modulen gleichermassen benutzt —
// die drei Stellen sollen dieselbe Antwort auf die Frage geben, was ein
// gueltiger Modus ist. Drei Wertelisten waeren drei Gelegenheiten,
// auseinanderzulaufen.
//
// DIE MODI (identisch mit dem CHECK in
// supabase/migrations/20261020000000_standortfreigabe.sql):
//
//   off             Vorgabe. Es wird nichts erhoben.
//   during_service  Nur waehrend eines laufenden Einsatzes.
//   always          Dauerhaft — nur mit eigener Aktivierung UND
//                   Betriebssystem-Berechtigung.
// ═══════════════════════════════════════════════════════════════════════

export const MODI = ['off', 'during_service', 'always'] as const
export type Modus = (typeof MODI)[number]

export const MODUS_AUS: Modus = 'off'

export function istModus(wert: unknown): wert is Modus {
  return typeof wert === 'string' && (MODI as readonly string[]).includes(wert)
}

/** Modi, in denen ueberhaupt ein Punkt entstehen darf. */
export function erfasstStandort(modus: Modus): modus is 'during_service' | 'always' {
  return modus !== 'off'
}

/**
 * Verlangt dieser Modus die Betriebssystem-Berechtigung?
 *
 * Nur der Dauermodus — so steht es in der Aufgabenstellung und so steht
 * es im CHECK der Tabelle. Fuer 'during_service' gibt das Geraet den
 * Standort ohnehin nur mit Berechtigung heraus; wir machen daraus aber
 * KEINE zusaetzliche Eintragungsbedingung, weil sonst eine Person mit
 * „nur beim Benutzen der App"-Berechtigung ihren Einsatzmodus nicht
 * einschalten koennte, obwohl genau der dafuer gedacht ist.
 */
export function brauchtBetriebssystemFreigabe(modus: Modus): boolean {
  return modus === 'always'
}

export const BEZEICHNUNG_MODUS: Record<Modus, string> = {
  off: 'Aus',
  during_service: 'Nur während eines Einsatzes',
  always: 'Dauerhaft freigegeben',
}

export const ERKLAERUNG_MODUS: Record<Modus, string> = {
  off:
    'Es wird kein Standort erhoben. Das ist die Voreinstellung und lässt sich '
    + 'jederzeit wiederherstellen.',
  during_service:
    'Ihr Standort wird ausschließlich während eines laufenden Einsatzes erfasst. '
    + 'Außerhalb der Einsatzzeit entsteht kein Punkt.',
  always:
    'Ihr Standort wird dauerhaft erfasst, solange die App läuft und das '
    + 'Betriebssystem die Berechtigung erteilt hat.',
}

/** Plattformen, die ein Standortpunkt tragen darf (CHECK der Tabelle). */
export const PLATTFORMEN = ['ios', 'android', 'web'] as const
export type StandortPlattform = (typeof PLATTFORMEN)[number]

export function istStandortPlattform(wert: unknown): wert is StandortPlattform {
  return typeof wert === 'string' && (PLATTFORMEN as readonly string[]).includes(wert)
}

/**
 * Die Plattform der Sicherheitsspur kennt zusaetzlich 'server' und
 * 'unbekannt'. Ein Standortpunkt kann keines von beidem sein — er kommt
 * immer von einem Geraet. Passt der Wert nicht, wird NULL geschrieben
 * statt geraten; der CHECK der Tabelle liesse den Insert sonst
 * scheitern und der Punkt ginge verloren.
 */
export function plattformFuerPunkt(wert: unknown): StandortPlattform | null {
  return istStandortPlattform(wert) ? wert : null
}
