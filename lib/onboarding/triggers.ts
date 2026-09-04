/**
 * Onboarding — Ausloeser (P0-Ereignisse)
 *
 * Rein rechnend: keine Datenbank, kein Versand. Dieses Modul beantwortet
 * genau eine Frage — „was soll aufgrund dieses Ereignisses passieren?" —
 * und ueberlaesst das Tun den Aufrufern (service.ts, dem Erinnerungslauf).
 *
 * ── WARUM DIE ENTSCHEIDUNG VOM TUN GETRENNT IST ────────────────────────
 * Eine Erinnerungsregel, die im Cron-Job steckt, ist nur im Cron-Job
 * pruefbar — also praktisch gar nicht. Hier ist sie eine Funktion mit
 * Eingabe und Ausgabe, und der Test kann jede Frist durchspielen, ohne
 * dass jemals eine Mail entsteht.
 *
 * ── ERINNERN IST EIN EINGRIFF ──────────────────────────────────────────
 * Jede automatische Nachricht geht an einen echten Menschen, der sich
 * gerade NICHT gemeldet hat. Die Regeln sind deshalb bewusst
 * zurueckhaltend:
 *
 *   * hoechstens MAX_ERINNERUNGEN je Ablauf — danach nie wieder
 *   * mindestens ABSTAND_TAGE zwischen zwei Nachrichten
 *   * eine Karenzzeit, bevor die erste Erinnerung ueberhaupt faellig wird
 *   * abgeschlossene Ablaeufe bekommen nichts
 *
 * Im Zweifel wird NICHT erinnert. Eine ausbleibende Erinnerung kostet
 * einen Kontakt; eine zu viel kostet Vertrauen.
 */

import type { OnboardingTyp } from './schritte'

/** Ereignisse, die einen Ablauf betreffen. Geschlossene Liste. */
export const ONBOARDING_EREIGNISSE = [
  /** Jemand hat einen Ablauf betreten (Wizard geoeffnet). */
  'ablauf_begonnen',
  /** Ein Schritt wurde gespeichert. */
  'schritt_gespeichert',
  /** Der Wizard wurde ohne Abschluss verlassen. */
  'ablauf_verlassen',
  /** Eine erwartete Unterlage fehlt weiterhin. */
  'unterlage_fehlt',
  /** Alle Pflichtschritte sind erledigt. */
  'ablauf_abgeschlossen',
] as const

export type OnboardingEreignis = (typeof ONBOARDING_EREIGNISSE)[number]

export function istOnboardingEreignis(wert: unknown): wert is OnboardingEreignis {
  return typeof wert === 'string' && (ONBOARDING_EREIGNISSE as readonly string[]).includes(wert)
}

/** Anlaesse, aus denen eine Nachricht entstehen kann. */
export const NACHRICHTEN_ANLAESSE = [
  'begruessung',
  'erinnerung',
  'unterlagen',
  'abschluss',
] as const
export type NachrichtenAnlass = (typeof NACHRICHTEN_ANLAESSE)[number]

// ---------------------------------------------------------------------------
// Fristen
// ---------------------------------------------------------------------------

/**
 * Der Erinnerungsplan — die EINE Stelle, an der die Fristen stehen.
 *
 * Zwei Stufen, dann Schluss:
 *
 *   Stufe 1  nach 1 Tag ohne Aktivitaet   freundlicher Anstoss
 *   Stufe 2  nach 3 Tagen ohne Aktivitaet letzte Erinnerung
 *   danach   nichts mehr
 *
 * Die Obergrenze ist keine Zahl, die man hochsetzen kann, sondern eine
 * Zusage: wer zweimal nicht reagiert hat, moechte nicht reagieren. Die
 * dritte Nachricht bringt niemanden zurueck, sie kostet nur Vertrauen —
 * und landet beim naechsten Mal im Spamordner, samt allem anderen, was
 * wir dieser Person je schreiben.
 *
 * Die Verwaltung sieht offene Ablaeufe weiterhin in der Betriebssicht
 * (/admin/onboarding). Automatisch passiert danach nichts mehr; ein
 * Mensch kann sich jederzeit melden.
 *
 * Die Tage zaehlen ab der letzten AKTIVITAET der Person, nicht ab dem
 * Beginn: wer gestern noch einen Schritt gemacht hat, ist mitten im
 * Ablauf und wird nicht angestossen.
 */
export const ERINNERUNGS_STUFEN = [
  { stufe: 1, nachTagenInaktiv: 1 },
  { stufe: 2, nachTagenInaktiv: 3 },
] as const

/** Hoechstzahl automatischer Erinnerungen — ergibt sich aus dem Plan. */
export const MAX_ERINNERUNGEN = ERINNERUNGS_STUFEN.length

/** Wartezeit bis zur ERSTEN Erinnerung (Tage ohne Aktivitaet). */
export const KARENZ_TAGE = ERINNERUNGS_STUFEN[0].nachTagenInaktiv

/**
 * Mindestabstand zwischen zwei Nachrichten. Abgeleitet aus dem Plan,
 * nicht daneben gepflegt — sonst koennen sich Plan und Abstand
 * widersprechen und die zweite Stufe faellt still aus.
 */
export const ABSTAND_TAGE =
  ERINNERUNGS_STUFEN[1].nachTagenInaktiv - ERINNERUNGS_STUFEN[0].nachTagenInaktiv

const TAG_MS = 24 * 60 * 60 * 1000

/** Ganze Tage zwischen zwei Zeitpunkten (abgerundet, nie negativ). */
export function tageSeit(zeitpunkt: string | null, jetzt: Date): number {
  if (!zeitpunkt) return Number.POSITIVE_INFINITY
  const dann = new Date(zeitpunkt).getTime()
  if (!Number.isFinite(dann)) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.floor((jetzt.getTime() - dann) / TAG_MS))
}

// ---------------------------------------------------------------------------
// Erinnerungsentscheidung
// ---------------------------------------------------------------------------

/** Nur die Felder, die die Entscheidung braucht — bewusst kein DB-Typ. */
export interface ErinnerungsLage {
  typ: OnboardingTyp
  aktuellerSchritt: number
  gesamtSchritte: number
  fehlendeAngaben: readonly string[]
  /** Wann der Ablauf begonnen wurde. */
  createdAt: string
  /** Letzte Aenderung durch die Person. */
  updatedAt: string
  letzteAutoNachricht: string | null
  abgeschlossenAm: string | null
  /** Wie viele automatische Nachrichten bereits rausgingen. */
  bisherigeErinnerungen: number
}

export interface ErinnerungsEntscheidung {
  /** true = jetzt erinnern. */
  faellig: boolean
  anlass: NachrichtenAnlass | null
  /** Ein Satz fuer Protokoll und Betriebssicht — auch bei „nein". */
  begruendung: string
}

/**
 * Entscheidet, ob fuer einen offenen Ablauf jetzt eine automatische
 * Nachricht faellig ist.
 *
 * Reihenfolge der Ausschluesse ist Absicht: der jeweils GRUNDSAETZLICHERE
 * Grund gewinnt, damit die Begruendung die eigentliche Ursache nennt und
 * nicht die zufaellig zuerst gepruefte.
 */
export function pruefeErinnerung(
  lage: ErinnerungsLage,
  jetzt: Date = new Date(),
): ErinnerungsEntscheidung {
  const nein = (begruendung: string): ErinnerungsEntscheidung =>
    ({ faellig: false, anlass: null, begruendung })

  if (lage.abgeschlossenAm) {
    return nein('Ablauf ist abgeschlossen — es gibt nichts zu erinnern.')
  }

  const bisher = Math.max(0, Math.trunc(lage.bisherigeErinnerungen) || 0)
  if (bisher >= MAX_ERINNERUNGEN) {
    return nein(
      `Bereits ${bisher} Erinnerungen versendet (Hoechstzahl ${MAX_ERINNERUNGEN}) — `
      + 'es wird nicht weiter nachgefasst.',
    )
  }

  // Die naechste faellige Stufe ergibt sich aus der Zahl der bisherigen
  // Nachrichten: wer eine hat, ist als Naechstes bei Stufe 2.
  const stufe = ERINNERUNGS_STUFEN[bisher]

  const tageInaktiv = tageSeit(lage.updatedAt, jetzt)
  if (tageInaktiv < stufe.nachTagenInaktiv) {
    return nein(
      `Letzte Aktivität vor ${tageInaktiv} Tag(en) — Stufe ${stufe.stufe} wird erst `
      + `nach ${stufe.nachTagenInaktiv} Tag(en) ohne Aktivität fällig.`,
    )
  }

  const tageSeitNachricht = tageSeit(lage.letzteAutoNachricht, jetzt)
  if (tageSeitNachricht < ABSTAND_TAGE) {
    return nein(
      `Letzte Nachricht vor ${tageSeitNachricht} Tag(en) — Mindestabstand `
      + `${ABSTAND_TAGE} Tage nicht erreicht.`,
    )
  }

  // Der Anlass bestimmt den Text. Fehlen konkrete Unterlagen, wird das
  // benannt — „Sie haben etwas nicht ausgefuellt" hilft niemandem.
  const anlass: NachrichtenAnlass =
    lage.fehlendeAngaben.length > 0 ? 'unterlagen' : 'erinnerung'

  return {
    faellig: true,
    anlass,
    begruendung:
      `Stufe ${stufe.stufe}: seit ${tageInaktiv} Tagen keine Aktivität bei Schritt `
      + `${lage.aktuellerSchritt} von ${lage.gesamtSchritte}.`,
  }
}

// ---------------------------------------------------------------------------
// Ereignis → Wirkung
// ---------------------------------------------------------------------------

export interface EreignisWirkung {
  /** Soll aus diesem Ereignis eine Nachricht entstehen? */
  nachricht: NachrichtenAnlass | null
  /** Soll die Abbruchstelle festgehalten werden? */
  abbruchMerken: boolean
  /** Soll der Ablauf abgeschlossen werden? */
  abschliessen: boolean
}

/**
 * Was ein Ereignis auslöst.
 *
 * `schritt_gespeichert` loest bewusst KEINE Nachricht aus: die Person ist
 * gerade im Ablauf und sieht das Ergebnis auf dem Bildschirm. Eine Mail
 * dazu waere Post ueber etwas, das man eben selbst getan hat.
 */
export function wirkungVon(ereignis: OnboardingEreignis): EreignisWirkung {
  switch (ereignis) {
    case 'ablauf_begonnen':
      return { nachricht: 'begruessung', abbruchMerken: false, abschliessen: false }
    case 'schritt_gespeichert':
      return { nachricht: null, abbruchMerken: false, abschliessen: false }
    case 'ablauf_verlassen':
      // Nur merken. Die Erinnerung entscheidet spaeter der Lauf ueber
      // pruefeErinnerung() — sofort zu schreiben hiesse, jemanden
      // anzuschreiben, der vielleicht nur den Tab gewechselt hat.
      return { nachricht: null, abbruchMerken: true, abschliessen: false }
    case 'unterlage_fehlt':
      return { nachricht: null, abbruchMerken: false, abschliessen: false }
    case 'ablauf_abgeschlossen':
      return { nachricht: 'abschluss', abbruchMerken: false, abschliessen: true }
  }
}
