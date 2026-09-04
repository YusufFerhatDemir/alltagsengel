/**
 * Onboarding — Wizard-Logik
 *
 * Rein rechnend, ohne React. Der Grund ist nicht Eleganz, sondern
 * Pruefbarkeit: dieses Repo hat keine DOM-Testumgebung (vitest laeuft im
 * Node-Modus, es gibt keine Testing-Library). Was in der Komponente
 * steckt, ist damit faktisch ungetestet. Also steckt hier alles, was
 * falsch sein KANN, und die Komponente rendert nur noch.
 *
 * ── DIE EINE REGEL, DIE ALLES TRAEGT ───────────────────────────────────
 * Erst speichern, dann weiterschalten. Nie umgekehrt.
 *
 * Schaltet die Oberflaeche weiter und speichert nebenher, verliert eine
 * Person bei jedem Netzfehler genau die Angaben, die sie gerade gemacht
 * hat — und merkt es erst, wenn sie am Ende wieder von vorn anfangen
 * soll. `zustandNachSpeichern()` setzt das durch: bei einem Fehlschlag
 * bleibt der Schritt stehen und die Eingaben bleiben im Zustand.
 *
 * ── ZWEI WEGE, EINEN SCHRITT ZU VERLASSEN ──────────────────────────────
 *   „Weiter"             prueft die Pflichtangaben des Schritts
 *   „Später fortsetzen"  prueft NICHTS und speichert, was da ist
 *
 * Das ist Absicht. Wer aussteigen will, soll nicht erst ein Formular
 * vervollstaendigen muessen — sonst steigt er ohne Speichern aus, und
 * alles Eingegebene ist weg. Die Luecken landen in fehlende_angaben und
 * kommen ueber die Erinnerung zurueck.
 */

import type { SchrittDefinition } from './schritte'

/**
 * Was der Wizard ueber einen Schritt wissen muss.
 *
 * Deckungsgleich mit SchrittDefinition — als eigener Name, damit der
 * Wizard nicht an die Onboarding-Schrittfolgen gebunden ist: er laesst
 * sich mit jeder Folge betreiben, die diese Form erfuellt.
 */
export type WizardSchritt = SchrittDefinition

export interface WizardZustand {
  /** 1-basiert. */
  aktuellerSchritt: number
  gesamtSchritte: number
  /** Eingaben je Schrittschluessel. */
  daten: Record<string, Record<string, unknown>>
  /** Laeuft gerade ein Speichervorgang? Sperrt die Knoepfe. */
  speichert: boolean
  /** Fehlertext des letzten Versuchs — null, wenn alles gut ging. */
  fehler: string | null
  /** Pflichtangaben, die beim letzten „Weiter" gefehlt haben. */
  fehlendePflicht: string[]
  /** Ablauf vollstaendig durchlaufen. */
  fertig: boolean
}

export function ersterZustand(
  gesamtSchritte: number,
  startSchritt = 1,
  daten: Record<string, Record<string, unknown>> = {},
): WizardZustand {
  const gesamt = Math.max(1, Math.trunc(gesamtSchritte) || 1)
  return {
    aktuellerSchritt: Math.min(Math.max(1, Math.trunc(startSchritt) || 1), gesamt),
    gesamtSchritte: gesamt,
    daten,
    speichert: false,
    fehler: null,
    fehlendePflicht: [],
    fertig: false,
  }
}

// ---------------------------------------------------------------------------
// Fortschritt
// ---------------------------------------------------------------------------

/**
 * Fortschritt in Prozent — fuer Balken und `aria-valuenow`.
 *
 * Der ERSTE Schritt zeigt bewusst nicht 0 %: ein leerer Balken sieht aus,
 * als haette man noch nichts geschafft, obwohl man gerade angefangen hat.
 * Gerechnet wird deshalb ueber abgeschlossene Schritte plus den laufenden
 * zur Haelfte.
 */
export function fortschrittProzent(aktuellerSchritt: number, gesamtSchritte: number): number {
  const gesamt = Math.max(1, gesamtSchritte)
  const aktuell = Math.min(Math.max(1, aktuellerSchritt), gesamt)
  return Math.round(((aktuell - 0.5) / gesamt) * 100)
}

export function istLetzterSchritt(aktuellerSchritt: number, gesamtSchritte: number): boolean {
  return aktuellerSchritt >= gesamtSchritte
}

/** Beschriftung des Hauptknopfes. Am Ende heisst „Weiter" nicht mehr Weiter. */
export function weiterBeschriftung(aktuellerSchritt: number, gesamtSchritte: number): string {
  return istLetzterSchritt(aktuellerSchritt, gesamtSchritte) ? 'Abschließen' : 'Weiter'
}

/** „Schritt 2 von 5" — auch fuer Vorlesesoftware. */
export function schrittBeschriftung(aktuellerSchritt: number, gesamtSchritte: number): string {
  return `Schritt ${aktuellerSchritt} von ${gesamtSchritte}`
}

// ---------------------------------------------------------------------------
// Pruefung
// ---------------------------------------------------------------------------

function istLeer(wert: unknown): boolean {
  if (wert === undefined || wert === null) return true
  if (typeof wert === 'string') return wert.trim() === ''
  if (Array.isArray(wert)) return wert.length === 0
  return false
}

/**
 * Welche erwarteten Angaben dieses Schritts fehlen.
 * Auch fuer ueberspringbare Schritte auswertbar — dort blockiert das
 * Ergebnis nur nichts.
 */
export function fehlendeAngabenImSchritt(
  schritt: WizardSchritt,
  daten: Record<string, unknown> | undefined,
): string[] {
  return schritt.erwarteteAngaben.filter(a => istLeer(daten?.[a]))
}

/**
 * Darf „Weiter" gedrueckt werden?
 *
 * Pflichtschritte verlangen ihre Angaben — sie sind genau die Schritte,
 * die schliesseAb() spaeter als 'fertig' sehen will. Ueberspringbare
 * Schritte verlangen nichts.
 */
export function darfWeiter(
  schritt: WizardSchritt,
  daten: Record<string, unknown> | undefined,
): boolean {
  if (schritt.ueberspringbar) return true
  return fehlendeAngabenImSchritt(schritt, daten).length === 0
}

// ---------------------------------------------------------------------------
// Zustandsuebergaenge
// ---------------------------------------------------------------------------

export interface SpeicherAuftrag {
  schritt: number
  schluessel: string
  daten: Record<string, unknown>
  status: 'fertig' | 'uebersprungen'
}

export type WeiterErgebnis =
  /** Pflichtangaben fehlen — es wird nichts gespeichert. */
  | { art: 'unvollstaendig'; zustand: WizardZustand }
  /** Speichern anstossen; danach zustandNachSpeichern() aufrufen. */
  | { art: 'speichern'; zustand: WizardZustand; auftrag: SpeicherAuftrag }

/**
 * Bereitet „Weiter" vor: prueft und liefert den Speicherauftrag.
 *
 * Schaltet NICHT weiter — das passiert erst in zustandNachSpeichern(),
 * und nur bei Erfolg.
 */
export function beginneWeiter(
  zustand: WizardZustand,
  schritt: WizardSchritt,
): WeiterErgebnis {
  const daten = zustand.daten[schritt.schluessel] ?? {}
  const fehlend = fehlendeAngabenImSchritt(schritt, daten)

  if (!schritt.ueberspringbar && fehlend.length > 0) {
    return {
      art: 'unvollstaendig',
      zustand: {
        ...zustand,
        fehlendePflicht: fehlend,
        fehler: 'Bitte füllen Sie die markierten Felder aus.',
      },
    }
  }

  // Ein ueberspringbarer Schritt ohne jede Eingabe gilt als uebersprungen,
  // nicht als fertig — sonst behauptet die Auswertung, jemand habe ihn
  // beantwortet.
  const status: SpeicherAuftrag['status'] =
    schritt.ueberspringbar && fehlend.length === schritt.erwarteteAngaben.length
      ? 'uebersprungen'
      : 'fertig'

  return {
    art: 'speichern',
    zustand: { ...zustand, speichert: true, fehler: null, fehlendePflicht: [] },
    auftrag: { schritt: zustand.aktuellerSchritt, schluessel: schritt.schluessel, daten, status },
  }
}

/**
 * Wertet den Ausgang des Speicherns aus.
 *
 * Bei Erfolg: einen Schritt weiter, am Ende `fertig`.
 * Bei Fehlschlag: der Schritt BLEIBT stehen, die Eingaben bleiben im
 * Zustand, der Fehlertext wird angezeigt. Nichts geht verloren.
 */
export function zustandNachSpeichern(
  zustand: WizardZustand,
  ergebnis: { ok: true } | { ok: false; fehler: string },
): WizardZustand {
  if (!ergebnis.ok) {
    return {
      ...zustand,
      speichert: false,
      fehler: ergebnis.fehler
        || 'Das Speichern hat nicht geklappt. Ihre Eingaben sind noch da — bitte erneut versuchen.',
    }
  }

  if (istLetzterSchritt(zustand.aktuellerSchritt, zustand.gesamtSchritte)) {
    return { ...zustand, speichert: false, fehler: null, fertig: true }
  }

  return {
    ...zustand,
    aktuellerSchritt: zustand.aktuellerSchritt + 1,
    speichert: false,
    fehler: null,
    fehlendePflicht: [],
  }
}

/**
 * Zu einem bereits erreichten Schritt springen — der Weg der
 * Korrektur-Knoepfe in der Zusammenfassung.
 *
 * Bewusst nur RUECKWAERTS: vorwaerts zu springen wuerde Schritte
 * ueberspringen, ohne sie zu speichern, und der Fortschritt in der
 * Datenbank liefe der Oberflaeche hinterher. Ein Ziel jenseits des
 * aktuellen Schritts wird deshalb auf ihn begrenzt, statt abgelehnt — die
 * Oberflaeche soll dafuer keine Fehlermeldung brauchen.
 */
export function springeZu(zustand: WizardZustand, ziel: number): WizardZustand {
  const begrenzt = Math.min(
    Math.max(1, Math.trunc(ziel) || 1),
    zustand.aktuellerSchritt,
  )
  return { ...zustand, aktuellerSchritt: begrenzt, fehler: null, fehlendePflicht: [] }
}

/**
 * Einen Schritt zurueck. Aendert nur die Ansicht: gespeicherte Angaben
 * bleiben, und der Fortschritt in der Datenbank wird nie gesenkt (siehe
 * service.ts).
 */
export function zurueck(zustand: WizardZustand): WizardZustand {
  return {
    ...zustand,
    aktuellerSchritt: Math.max(1, zustand.aktuellerSchritt - 1),
    fehler: null,
    fehlendePflicht: [],
  }
}

/** Eingaben eines Schritts uebernehmen. */
export function setzeSchrittDaten(
  zustand: WizardZustand,
  schluessel: string,
  teil: Record<string, unknown>,
): WizardZustand {
  return {
    ...zustand,
    daten: {
      ...zustand.daten,
      [schluessel]: { ...(zustand.daten[schluessel] ?? {}), ...teil },
    },
    // Sobald jemand tippt, ist die Fehlermeldung von vorhin ueberholt.
    fehler: null,
  }
}

/**
 * „Später fortsetzen": speichert den Stand OHNE Pruefung.
 * Der Auftrag traegt bewusst 'fertig' nur dann, wenn auch wirklich alles
 * da ist — sonst bleibt der Schritt offen und taucht in der Erinnerung auf.
 */
export function auftragFuerSpaeter(
  zustand: WizardZustand,
  schritt: WizardSchritt,
): SpeicherAuftrag {
  const daten = zustand.daten[schritt.schluessel] ?? {}
  const fehlend = fehlendeAngabenImSchritt(schritt, daten)
  return {
    schritt: zustand.aktuellerSchritt,
    schluessel: schritt.schluessel,
    daten,
    status: fehlend.length === 0 ? 'fertig' : 'uebersprungen',
  }
}

/** Marke fuer onboarding_progress.abbruchstelle. */
export function abbruchstelle(zustand: WizardZustand, schritt: WizardSchritt): string {
  return `schritt_${zustand.aktuellerSchritt}_${schritt.schluessel}`
}
