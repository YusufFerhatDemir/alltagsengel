// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Veröffentlichung der Interoperabilitäts-Standards
//
// ZWECK: Anlage 2 DiPAV, Themenfeld I (Interoperabilität), Nr. 4 verlangt
// wörtlich, dass „die für die Herstellung der Interoperabilität der
// digitalen Pflegeanwendung genutzten Standards und Profile vollständig
// veröffentlicht, auf der Anwendungswebseite verlinkt" sind und
// „diskriminierungsfrei genutzt und von Dritten in ihren Systemen
// implementiert werden" können.
//
// Bis 15.08.2026 existierte diese Veröffentlichung NICHT — der FHIR-Export
// war gebaut (lib/coach/fhir.ts), aber nirgends öffentlich beschrieben.
// Genau das war der verbleibende interne Rest von AK-INT-02.
//
// Diese Datei ist die eine Wahrheit dafür; app/pflegecoach/interoperabilitaet
// rendert sie nur. So kann lib/coach/interop.test.ts prüfen, dass die
// veröffentlichte Liste zu dem passt, was der Export tatsächlich erzeugt —
// eine Veröffentlichung, die vom Code abweicht, wäre schlimmer als keine.
//
// KEINE ERFUNDENEN ZUSAGEN: Hier steht nur, was der Export nachweislich
// kann. Profilierungen haben wir keine vorgenommen (Anlage 2 I Nr. 5 ist
// damit „nicht zutreffend" mit der dort ausdrücklich zugelassenen
// Begründung), eine Geräte-/Wearable-Schnittstelle gibt es nicht
// (Anlage 2 I Nr. 3, ebenfalls zugelassene Begründung).
// ═══════════════════════════════════════════════════════════════

import { FHIR_BASIS, FHIR_VERSION } from './fhir'

export interface InteropStandard {
  /** Anzeigename des Standards. */
  name: string
  /** Fassung, in der er verwendet wird. */
  fassung: string
  /** Herausgeber — für die Nachprüfbarkeit durch Dritte. */
  herausgeber: string
  /** Öffentlich erreichbare Fundstelle der Spezifikation. */
  url: string
  /** Wofür wir ihn im PflegeCoach einsetzen. */
  verwendung: string
  /** Nutzungsbedingungen des Standards selbst (Diskriminierungsfreiheit). */
  lizenz: string
}

/**
 * Die tatsächlich verwendeten offenen Standards.
 *
 * FHIR R4 ist ein „offener, international anerkannter Standard" im Sinne
 * von DiPAV §7 Satz 1 — damit greift die erste Alternative der Vorschrift
 * und es ist gerade KEIN eigenes Profil nötig (§7 Satz 1 zweite Alternative
 * gilt nur, „sofern kein entsprechender Standard vorhanden ist").
 */
export const INTEROP_STANDARDS: InteropStandard[] = [
  {
    name: 'HL7 FHIR',
    fassung: `R4 (${FHIR_VERSION})`,
    herausgeber: 'Health Level Seven International',
    url: 'https://hl7.org/fhir/R4/',
    verwendung:
      'Strukturierter Export des gesamten Nutzerdatenbestands als Bundle über ' +
      '/api/coach/export?format=fhir',
    lizenz: 'Creative Commons „No Rights Reserved" (CC0) — frei und ohne Gegenleistung nutzbar',
  },
  {
    name: 'JSON',
    fassung: 'RFC 8259',
    herausgeber: 'IETF',
    url: 'https://www.rfc-editor.org/rfc/rfc8259',
    verwendung: 'Serialisierungsformat beider Exportwege (FHIR-Bundle und Eigenschema)',
    lizenz: 'IETF-Standard, frei zugänglich',
  },
  {
    name: 'JSON Schema',
    fassung: 'Draft 2020-12',
    herausgeber: 'JSON Schema Organization',
    url: 'https://json-schema.org/draft/2020-12/schema',
    verwendung: 'Formale Beschreibung des Eigenschemas de.alltagsengel.pflegecoach.export',
    lizenz: 'Frei zugänglich',
  },
]

/**
 * Die FHIR-Ressourcentypen, die der Export erzeugt.
 *
 * Bewusst ohne Profil- und Terminologie-Anspruch: es sind unveränderte
 * R4-Basisressourcen. Wer sie einliest, braucht nichts von uns — das ist
 * der Kern der Diskriminierungsfreiheit nach Anlage 2 I Nr. 4.
 */
export const FHIR_RESSOURCEN: Array<{ typ: string; inhalt: string }> = [
  { typ: 'Bundle', inhalt: 'Klammer um den gesamten Export (type: collection)' },
  { typ: 'Questionnaire', inhalt: 'Die beiden Fragebogen-Definitionen (Selbsteinschätzung, Belastungs-Check)' },
  { typ: 'QuestionnaireResponse', inhalt: 'Ausgefüllte Selbsteinschätzungen und Messungen' },
  { typ: 'Goal', inhalt: 'Vom Nutzer gesetzte Pflegeziele' },
  { typ: 'CarePlan', inhalt: 'Geplante Aktivitäten und ihr Bezug zu den Zielen' },
]

/** Kanonische Basis der von uns vergebenen FHIR-Bezeichner. */
export const FHIR_BASIS_URL = FHIR_BASIS

/** Das produkteigene, dokumentierte Exportschema (menschen- und maschinenlesbar). */
export const EIGENSCHEMA = {
  kennung: 'de.alltagsengel.pflegecoach.export',
  fassung: '1.0',
  datei: 'lib/coach/export.schema.json',
  zweck:
    'Vollständiger Selbstexport aller Nutzerdaten in einem stabilen, dokumentierten ' +
    'Eigenformat — unabhängig vom FHIR-Weg und ohne Informationsverlust.',
} as const

/**
 * Punkte aus Anlage 2 Themenfeld I, die für den PflegeCoach „nicht
 * zutreffend" sind — jeweils mit genau der Begründung, die Anlage 2 an
 * dieser Stelle ausdrücklich als zulässig benennt.
 *
 * Das steht hier und nicht nur im Antrag, damit die Erklärung im Produkt
 * und im Antrag nicht auseinanderlaufen können.
 */
export const NICHT_ZUTREFFEND: Array<{ punkt: string; begruendung: string }> = [
  {
    punkt: 'Anlage 2 I Nr. 3 — Schnittstelle zu Medizingeräten und Wearables',
    begruendung:
      'Im Rahmen der bestimmungsgemäßen Nutzung ist nicht vorgesehen, dass die digitale ' +
      'Pflegeanwendung Daten mit von Pflegebedürftigen genutzten Medizingeräten oder mit von ' +
      'Pflegebedürftigen getragenen Sensoren zur Messung und Übertragung von Vitalwerten ' +
      '(Wearables) austauscht.',
  },
  {
    punkt: 'Anlage 2 I Nr. 5 — Veröffentlichung eigener Profilierungen',
    begruendung: 'Der Hersteller hat keine eigenen Profilierungen vorgenommen.',
  },
]

/**
 * Zusage der Diskriminierungsfreiheit (Anlage 2 I Nr. 4, zweiter Halbsatz).
 * Bewusst als Konstante, damit sie in Produkt und Antrag identisch ist.
 */
export const DISKRIMINIERUNGSFREI_ZUSAGE =
  'Die hier genannten Standards sind vollständig veröffentlicht und können von Dritten ' +
  'ohne Genehmigung, ohne Registrierung, ohne Entgelt und ohne Rückfrage bei uns in ' +
  'eigenen Systemen implementiert werden. Wir behalten uns daran keine Rechte vor.'
