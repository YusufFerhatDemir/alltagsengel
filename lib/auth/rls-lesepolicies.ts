// ═══════════════════════════════════════════════════════════════════════
// Welche Berechtigung entscheidet ueber das Lesen welcher Tabelle?
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (npm run lint:rls-sicht, 31.08.2026): 25 Tabellen trugen KEINE
// Policy, die eine Berechtigung auswertet — nur `is_admin()` und teils
// `is_internal_staff()`. Fuer pdl, qm und buchhaltung hiess das: die Seite
// oeffnet sich, die Abfrage laeuft ohne Fehler, und es kommen null Zeilen.
// Wer sie lesen darf, war nirgends entschieden.
//
// Diese Datei ist die Entscheidung. Sie steht in TypeScript und nicht nur
// in der Migration, aus zwei Gruenden:
//
//   1. Ein Test kann sie lesen (__tests__/security/rls-lesepolicies.test.ts
//      prueft, dass die Migration Zeichen fuer Zeichen dazu passt). Eine
//      Zuordnung, die nur in einer SQL-Datei steht, driftet unbemerkt.
//   2. `npm run verify:rls-lesepolicies` misst live gegen genau diese
//      Tabelle: sieht die vorgesehene Rolle wirklich etwas, und bleibt die
//      ausgeschlossene wirklich draussen.
//
// ── DIE REGEL HINTER DER ZUORDNUNG ────────────────────────────────────
//
// Massgeblich ist, WAS in der Tabelle steht — nicht, welche Seite sie
// zufaellig liest. Drei Seiten aus drei Bereichen lesen `review_errors`;
// die Tabelle bekommt trotzdem genau ein Recht. Sonst waere das Recht
// eine Funktion der Oberflaeche, und jede neue Seite koennte eine
// Zugriffsentscheidung verschieben, ohne dass jemand eine trifft.
//
// Wo Gegenstand und Seite auseinanderfallen, gewinnt der Gegenstand. Das
// laesst vier Seiten fuer eine Rolle bewusst leer (verordnungen,
// verordnung_leistungen, care_notes, absences, caregiver_bonuses); damit
// die Seite das SAGT statt es zu verschweigen, tragen die betroffenen
// Bereiche in lib/auth/bereiche.ts die passenden `zusatzRechte`.

import type { Berechtigung, Rolle } from './rollen'
import { ROLLEN_MATRIX, VERWALTUNGSROLLEN } from './rollen'

export interface Lesepolicy {
  /** Tabelle in public. */
  tabelle: string
  /** Die Berechtigung, die ueber das Lesen entscheidet. */
  recht: Berechtigung
  /** Warum diese und keine andere. Steht wortgleich in der Migration. */
  grund: string
  /**
   * Bundesweite Zeilen ohne organization_id sind erlaubt.
   *
   * Nur `datenannahmestellen`: dort laesst schon der RESTRICTIVE
   * org_fence `organization_id IS NULL` durch, weil die Annahmestellen
   * der Kassen fuer alle Mandanten dieselben sind. Die Lesepolicy bildet
   * das nach — sonst waere sie enger als der Fence und die Liste bliebe
   * trotz Policy leer.
   */
  globalZeilenErlaubt?: true
}

/**
 * Die 24 Zuordnungen. `documents` fehlt bewusst: der einzige Befund dort
 * (/admin/sepa) war ein Fehlbefund des Linters — die Seite spricht
 * `supabase.storage.from('documents')` an, den Speicher-Eimer, nicht die
 * Tabelle. Die Tabelle fuehrt live Fuehrungszeugnisse und Ausweise und
 * bleibt bei `is_admin()` plus Eigene-Zeilen-Pfad.
 */
export const RLS_LESEPOLICIES: readonly Lesepolicy[] = [
  {
    tabelle: 'absences',
    recht: 'personal.lesen',
    grund:
      'Abwesenheiten der Pflegekraefte. `grund` traegt Krankheit — ein '
      + 'Gesundheitsdatum der MITARBEITENDEN. Deshalb personal.lesen und nicht '
      + 'einsatz.lesen: die Buchhaltung plant keine Ausfaelle und braucht den '
      + 'Krankheitsgrund einer Kollegin nie.',
  },
  {
    tabelle: 'applications',
    recht: 'personal.lesen',
    grund:
      'Bewerbungen. Personalgewinnung — dieselbe Akte wie das spaetere '
      + 'Arbeitsverhaeltnis, nur frueher.',
  },
  {
    tabelle: 'bookings',
    recht: 'einsatz.lesen',
    grund:
      'Termine der Kundschaft. Das Einsatzgeschehen selbst; pdl, qm und '
      + 'buchhaltung tragen einsatz.lesen alle drei.',
  },
  {
    tabelle: 'care_notes',
    recht: 'pflege.lesen',
    grund:
      'Pflegenotizen. Die Tabelle traegt verlauf_id und massnahme_id — sie haengt '
      + 'am Pflegeprozess und kann Gesundheitsangaben zum Klienten enthalten. NICHT '
      + 'stammdaten.lesen (das haette die Buchhaltung eingeschlossen, der '
      + 'lib/auth/rollen.ts ausdruecklich keine Gesundheitsdaten zugesteht).',
  },
  {
    tabelle: 'caregiver_bonuses',
    recht: 'bonus.verwalten',
    grund:
      'Verguetung, nicht Personalstammdatum. Der Vorbehalt steht schon in BEREICHE '
      + "('/admin/bonuses' → bonus.verwalten) und in NUR_ADMINISTRATION. Die Policy "
      + 'AENDERT NICHTS an der Sichtbarkeit (bonus.verwalten haben nur admin und '
      + 'superadmin, genau wie is_admin()); sie schreibt die Entscheidung nur dorthin, '
      + "wo sie gelesen wird — in die Datenbank. Vorher stand dort keine, und 'niemand "
      + "hat es entschieden' sah aus wie 'niemand darf'.",
  },
  {
    tabelle: 'caregiver_documents',
    recht: 'personal.lesen',
    grund:
      'Personalakte: Fuehrungszeugnis, Vertraege, Nachweise — genau das, was '
      + 'lib/auth/rollen.ts der Buchhaltung ausdruecklich verwehrt.',
  },
  {
    tabelle: 'caregiver_initials_history',
    recht: 'personal.lesen',
    grund:
      'Handzeichen-Historie der Mitarbeitenden; Teil der Personalakte und Grundlage '
      + 'jeder Unterschriftszuordnung.',
  },
  {
    tabelle: 'caregiver_qualifications',
    recht: 'personal.lesen',
    grund:
      'Qualifikationsnachweise. Der Ursprungsbefund vom 29.08.2026: /admin/nachweise '
      + "zeigte der Pflegedienstleitung 'keine Nachweise vorhanden', obwohl "
      + 'Fuehrungszeugnisse abliefen.',
  },
  {
    tabelle: 'client_preferred_substitutes',
    recht: 'einsatz.lesen',
    grund:
      'Wunsch-Vertretungen je Klient. Reine Einsatzplanung — weder '
      + 'Gesundheits- noch Personalakte.',
  },
  {
    tabelle: 'cooperation_partners',
    recht: 'stammdaten.lesen',
    grund:
      'Kooperationspartner — Stammdaten des Umfelds, keine Gesundheits- und keine '
      + 'Personaldaten.',
  },
  {
    tabelle: 'datenannahmestellen',
    recht: 'abrechnung.lesen',
    grund:
      'DTA-Datenannahmestellen. Abrechnungsstammdaten; die Zeilen ohne '
      + 'organization_id sind bundesweite Vorgaben und werden vom Fence ausdruecklich '
      + 'durchgelassen — die Policy bildet das nach.',
    globalZeilenErlaubt: true,
  },
  {
    tabelle: 'dta_dakota_auftraege',
    recht: 'abrechnung.lesen',
    grund:
      'DTA-Auftraege an die Kostentraeger — der Versandvorgang der '
      + 'Kassenabrechnung. Gehoert zur Abrechnung und zu nichts sonst.',
  },
  {
    tabelle: 'einsatz_absagen',
    recht: 'einsatz.lesen',
    grund:
      'Abgesagte Einsaetze samt Ersatzsuche. Einsatzgeschehen; die Buchhaltung '
      + 'braucht es fuer nicht erbrachte Leistungen.',
  },
  {
    tabelle: 'kostentraeger_kontakte',
    recht: 'stammdaten.lesen',
    grund:
      'Ansprechpersonen bei Kassen und Kostentraegern — Kontaktstammdaten '
      + 'des Umfelds, keine Gesundheits- und keine Personaldaten.',
  },
  {
    tabelle: 'monthly_closings',
    recht: 'abrechnung.lesen',
    grund:
      'Monatsabschluesse je Klient — die Rechnungsgrundlage und damit '
      + 'Gegenstand der Abrechnung.',
  },
  {
    tabelle: 'ocr_results',
    recht: 'einsatz.lesen',
    grund:
      'Texterkennung eingescannter Leistungsnachweise. Der Nachweis ist '
      + 'Einsatzgeschehen; qm prueft ihn, die Buchhaltung rechnet ihn ab.',
  },
  {
    tabelle: 'partner_visits',
    recht: 'stammdaten.lesen',
    grund:
      'Besuche bei Kooperationspartnern. Gehoert sachlich zu '
      + 'cooperation_partners und traegt deshalb dasselbe Recht.',
  },
  {
    tabelle: 'payment_allocations',
    recht: 'abrechnung.lesen',
    grund:
      'Zuordnung von Zahlungen zu Rechnungen; ohne sie ist kein offener '
      + 'Posten nachvollziehbar.',
  },
  {
    tabelle: 'payment_status',
    recht: 'abrechnung.lesen',
    grund: 'Zahlungsstand je Rechnung — die Sicht der Buchhaltung auf offene Posten.',
  },
  {
    tabelle: 'review_errors',
    recht: 'einsatz.lesen',
    grund:
      'Prueffehler am Leistungsnachweis (haengen an service_record_id und '
      + 'ocr_result_id). Drei Seiten lesen sie aus drei Bereichen — QM-Pruefprotokoll, '
      + 'Monatsabschluss, Nachweis-Upload. einsatz.lesen ist das Recht, das alle drei '
      + 'Rollen tragen, und zugleich das, dem der Gegenstand gehoert: der Nachweis.',
  },
  {
    tabelle: 'state_settings',
    recht: 'einsatz.lesen',
    grund:
      'Bundeslandfreischaltung. /admin/kalender liest daraus die Bundeslaender fuer '
      + 'die Feiertage. Schreiben bleibt bei is_admin(); diese Policy gilt '
      + 'ausschliesslich fuer SELECT.',
  },
  {
    tabelle: 'substitution_requests',
    recht: 'einsatz.lesen',
    grund: 'Vertretungsanfragen im Dienstplan — Teil der laufenden Einsatzplanung.',
  },
  {
    tabelle: 'verordnung_leistungen',
    recht: 'pflege.lesen',
    grund:
      'Positionen einer aerztlichen Verordnung. Teilt das Schicksal der '
      + 'Verordnung selbst und damit deren Recht.',
  },
  {
    tabelle: 'verordnungen',
    recht: 'pflege.lesen',
    grund:
      'Aerztliche Verordnungen. Die Tabelle fuehrt eine Spalte `diagnose` — ein '
      + 'Gesundheitsdatum. Deshalb pflege.lesen, obwohl /admin/abrechnung sie '
      + 'ebenfalls liest: die Buchhaltung bekommt hier bewusst NICHTS. Braucht die '
      + 'Abrechnung die Genehmigungsdaten, gehoert dafuer eine Route her, die nur die '
      + 'abrechnungsrelevanten Spalten herausgibt — RLS kann keine Spalten ausblenden.',
  },
] as const

/** Der Policy-Name, den die Migration vergibt. */
export function policyName(tabelle: string): string {
  return `rk_${tabelle}_lesen`
}

/**
 * Welche Verwaltungsrollen sollen diese Tabelle nach der Migration lesen
 * koennen? Aus ROLLEN_MATRIX abgeleitet — hier steht KEINE zweite Liste.
 */
export function rollenMitLeserecht(recht: Berechtigung): Rolle[] {
  return VERWALTUNGSROLLEN.filter(r => (ROLLEN_MATRIX[r] as readonly string[]).includes(recht))
}

/** Nachschlag je Tabelle; `undefined`, wenn die Tabelle nicht Teil der Entscheidung ist. */
export function lesepolicyFuer(tabelle: string): Lesepolicy | undefined {
  return RLS_LESEPOLICIES.find(p => p.tabelle === tabelle)
}
