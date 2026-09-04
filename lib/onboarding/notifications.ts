/**
 * Onboarding — Nachrichtenvorlagen
 *
 * Rein rechnend: baut Betreff und Text, versendet nichts. Der Versand
 * laeuft ueber den bestehenden Weg (lib/notifications/retry.ts →
 * sendeIdempotent), damit Zustellspur, Wiederholung und Bounce-Behandlung
 * genau dieselben sind wie bei Rechnungen und Sicherheitsmeldungen. Ein
 * eigener Versandweg fuer Onboarding waere ein zweiter, der nachtraeglich
 * abgesichert werden muesste.
 *
 * ── ABSENDER: IMMER „ALLTAGSENGEL" ─────────────────────────────────────
 * Nie ein persoenlicher Name — weder in Anrede, Unterschrift noch
 * Betreff. Das ist die Namens-Policy des Hauses und gilt fuer JEDE
 * Kommunikation in Kundenrichtung. Gleiche Regel und gleiche Formeln wie
 * lib/emails/rechnung-email.ts:
 *
 *   Anrede         „Hallo Frau/Herr [Nachname],"
 *   Verabschiedung „Herzliche Grüße" / „Ihr Team von Alltagsengel"
 *
 * ── TON ────────────────────────────────────────────────────────────────
 * Die Empfaenger sind pflegebeduerftige Menschen, ihre Angehoerigen und
 * Bewerberinnen — oft aeltere Personen, oft in einer belastenden Lage.
 * Deshalb: kein Marketington, keine Dringlichkeit, kein „letzte Chance".
 * Jede Erinnerung sagt ausdruecklich, dass nichts verloren geht und dass
 * man sich melden kann.
 */

import { schrittNummer, schrittfolge, type OnboardingTyp } from './schritte'
import type { NachrichtenAnlass } from './triggers'

/** Wie die Person angesprochen wird. */
export interface Empfaenger {
  /** Nachname ohne „Herr"/„Frau". Leer ⇒ neutrale Anrede. */
  nachname?: string | null
  /** 'frau' | 'herr' | null — null ⇒ neutrale Anrede ohne Geschlecht. */
  anredeform?: 'frau' | 'herr' | null
}

export interface VorlagenLage {
  typ: OnboardingTyp
  empfaenger: Empfaenger
  aktuellerSchritt: number
  gesamtSchritte: number
  fehlendeAngaben: readonly string[]
  /** Absolute URL, unter der die Person weitermacht. */
  fortsetzenUrl: string
}

export interface Nachricht {
  betreff: string
  /** Reiner Text — die HTML-Fassung entsteht im Versandweg. */
  text: string
}

/**
 * „Hallo Frau Müller," — oder ohne Namen „Hallo,".
 *
 * Fail-soft: fehlt der Nachname oder die Anredeform, wird NICHT geraten.
 * Eine falsche Anrede ist schlimmer als eine neutrale.
 */
export function anrede(empfaenger: Empfaenger): string {
  const nachname = (empfaenger.nachname ?? '').trim()
  if (!nachname) return 'Hallo,'
  if (empfaenger.anredeform === 'frau') return `Hallo Frau ${nachname},`
  if (empfaenger.anredeform === 'herr') return `Hallo Herr ${nachname},`
  return `Hallo ${nachname},`
}

/** Verabschiedung — wortgleich zu lib/emails/rechnung-email.ts. */
export const GRUSS = 'Herzliche Grüße\nIhr Team von Alltagsengel'

/** Klartext je erwarteter Angabe. Unbekannte Schluessel bleiben lesbar. */
const ANGABE_TEXT: Record<string, string> = {
  vorname: 'Vorname',
  nachname: 'Nachname',
  email: 'E-Mail-Adresse',
  telefon: 'Telefonnummer',
  plz: 'Postleitzahl',
  ort: 'Ort',
  strasse: 'Straße und Hausnummer',
  mobilitaet: 'Wie Sie zu den Einsätzen kommen',
  erfahrung: 'Ihre bisherige Erfahrung',
  qualifikationen: 'Qualifikationen',
  wochenstunden: 'Gewünschte Wochenstunden',
  zeitfenster: 'Ihre möglichen Zeiten',
  fuehrungszeugnis: 'Erweitertes Führungszeugnis',
  lebenslauf: 'Lebenslauf',
  pflegegrad: 'Pflegegrad',
  pflegekasse: 'Pflegekasse',
  leistungsarten: 'Gewünschte Unterstützung',
  wunschzeiten: 'Wunschzeiten',
  terminwunsch: 'Terminwunsch',
  beziehungsart: 'Ihr Verhältnis zur betreuten Person',
  betroffene_person: 'Die betreute Person',
  einsicht_umfang: 'Umfang der Einsicht',
}

export function angabeText(schluessel: string): string {
  return ANGABE_TEXT[schluessel] ?? schluessel
}

/** Wie der Ablauf in einem Satz heisst. */
const ABLAUF_BEZEICHNUNG: Record<OnboardingTyp, string> = {
  bewerber: 'Ihre Bewerbung',
  kunde: 'Ihre Anmeldung',
  angehoerige: 'Ihr Zugang als angehörige Person',
}

function fortschrittZeile(lage: VorlagenLage): string {
  return `Sie sind bei Schritt ${lage.aktuellerSchritt} von ${lage.gesamtSchritte}.`
}

function naechsterSchrittTitel(lage: VorlagenLage): string | null {
  try {
    return schrittNummer(lage.typ, lage.aktuellerSchritt).titel
  } catch {
    // Schrittfolge gekuerzt, waehrend der Ablauf lief. Kein Grund, die
    // Nachricht scheitern zu lassen — sie kommt dann ohne diesen Satz.
    return null
  }
}

/**
 * Baut die Nachricht zu einem Anlass.
 *
 * Fail-soft in den Randfaellen (fehlender Name, gekuerzte Schrittfolge):
 * eine Erinnerung, die wegen eines fehlenden Nachnamens gar nicht
 * rausgeht, ist schlechter als eine mit neutraler Anrede.
 */
export function baueNachricht(anlass: NachrichtenAnlass, lage: VorlagenLage): Nachricht {
  const kopf = anrede(lage.empfaenger)
  const bezeichnung = ABLAUF_BEZEICHNUNG[lage.typ]

  switch (anlass) {
    case 'begruessung': {
      const titel = naechsterSchrittTitel(lage)
      return {
        betreff: `${bezeichnung} bei Alltagsengel`,
        text: [
          kopf,
          '',
          `schön, dass Sie da sind. ${bezeichnung} ist gespeichert.`,
          fortschrittZeile(lage),
          titel ? `Als Nächstes: ${titel}.` : null,
          '',
          'Sie können jederzeit pausieren und später weitermachen — Ihre Angaben bleiben erhalten:',
          lage.fortsetzenUrl,
          '',
          'Wenn etwas unklar ist, antworten Sie einfach auf diese E-Mail.',
          '',
          GRUSS,
        ].filter(z => z !== null).join('\n'),
      }
    }

    case 'erinnerung': {
      const titel = naechsterSchrittTitel(lage)
      return {
        betreff: `${bezeichnung} — Sie können jederzeit weitermachen`,
        text: [
          kopf,
          '',
          `${bezeichnung} liegt noch offen bei uns. ${fortschrittZeile(lage)}`,
          titel ? `Es fehlt nur noch: ${titel}.` : null,
          '',
          'Alles, was Sie bereits eingetragen haben, ist gespeichert:',
          lage.fortsetzenUrl,
          '',
          'Falls Sie es sich anders überlegt haben, ist das völlig in Ordnung — '
          + 'Sie müssen uns dafür nichts mitteilen.',
          '',
          GRUSS,
        ].filter(z => z !== null).join('\n'),
      }
    }

    case 'unterlagen': {
      // Konkret benennen, was fehlt. „Es fehlen noch Angaben" zwingt die
      // Person, den Ablauf zu oeffnen, um herauszufinden, worum es geht.
      const liste = lage.fehlendeAngaben.map(a => `• ${angabeText(a)}`).join('\n')
      return {
        betreff: `${bezeichnung} — es fehlen noch wenige Angaben`,
        text: [
          kopf,
          '',
          `für ${bezeichnung.toLowerCase()} fehlen uns noch diese Angaben:`,
          '',
          liste,
          '',
          'Sie können das in wenigen Minuten nachtragen:',
          lage.fortsetzenUrl,
          '',
          'Sollten Ihnen Unterlagen fehlen, melden Sie sich gern — wir finden eine Lösung.',
          '',
          GRUSS,
        ].join('\n'),
      }
    }

    case 'abschluss': {
      return {
        betreff: `${bezeichnung} ist bei uns eingegangen`,
        text: [
          kopf,
          '',
          `vielen Dank — ${bezeichnung.toLowerCase()} ist vollständig bei uns eingegangen.`,
          '',
          'Wir schauen sie uns an und melden uns bei Ihnen. '
          + 'Sie müssen dafür nichts weiter tun.',
          '',
          GRUSS,
        ].join('\n'),
      }
    }
  }
}

/**
 * Alle Anlaesse einmal durchgerechnet — fuer Vorschau und Test.
 * Stellt sicher, dass keine Vorlage bei einer leeren Lage bricht.
 */
export function alleVorlagen(lage: VorlagenLage): Record<NachrichtenAnlass, Nachricht> {
  return {
    begruessung: baueNachricht('begruessung', lage),
    erinnerung: baueNachricht('erinnerung', lage),
    unterlagen: baueNachricht('unterlagen', lage),
    abschluss: baueNachricht('abschluss', lage),
  }
}

/** Die Schritt-Titel einer Ablaufart — fuer Vorschauen in der Verwaltung. */
export function schrittTitel(typ: OnboardingTyp): string[] {
  return schrittfolge(typ).map(s => s.titel)
}
