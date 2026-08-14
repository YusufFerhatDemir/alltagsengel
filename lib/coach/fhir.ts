// ═══════════════════════════════════════════════════════════════
// PflegeCoach — FHIR-Abbildung (INT-02)
//
// ZWECK: Der Datenbestand eines Nutzers als FHIR-R4-Bundle, damit die
// Weitergabe an ein Praxis-, Pflege- oder Krankenhaussystem nicht am
// Format scheitert. Ergänzt den hauseigenen JSON-Export
// (lib/coach/export.ts), ersetzt ihn nicht.
//
// ═══ WAS HIER NICHT BEHAUPTET WIRD ═════════════════════════════
//  * KEINE Konformität zu einem MIO, einem KBV-Profil oder einer
//    gematik-Spezifikation. Es wird deshalb bewusst KEIN `meta.profile`
//    gesetzt: Ein Profil-Anspruch ohne bestandene Profilvalidierung wäre
//    eine Falschaussage.
//  * KEINE LOINC-, SNOMED-CT- oder ICF-Codes. Eine fachlich richtige
//    Zuordnung zu diesen Terminologien muss von Fachleuten geprüft und
//    lizenzrechtlich geklärt sein (LOINC-Lizenz, SNOMED-Affiliate). Bis
//    dahin werden ausschließlich EIGENE Codes unter der eigenen
//    Basis-URL vergeben — die sind eindeutig und maßen sich nichts an.
//  * KEINE Aussage darüber, dass FHIR für DiPA verbindlich wäre. Ob und
//    welches Austauschformat gefordert wird, ist offen (ORF-9, BfArM-
//    Frage 10). Diese Abbildung ist die vorbereitete Antwort auf ein
//    „ja", kein Beleg dafür.
//
// ═══ DATENSPARSAMKEIT ══════════════════════════════════════════
// Das Bundle enthält KEINE Patient-Ressource und keinen `subject`-
// Verweis. Der Empfänger weiß aus dem Übergabekontext, um wen es geht;
// eine Identität im Dokument würde beim Weiterreichen zu einem
// zusätzlichen Streuungsrisiko. Ressourcen-IDs sind laufende Nummern,
// keine Datenbank-Schlüssel — interne IDs bleiben intern.
//
// Reine Funktionen, kein IO — testbar in lib/coach/fhir.test.ts.
// ═══════════════════════════════════════════════════════════════

import { ASSESSMENT_BEREICHE, ASSESSMENT_BEREICH_LABELS, ASSESSMENT_STUFEN } from './assessment'
import { BELASTUNG_ITEMS, BELASTUNG_STUFEN } from './belastung'
import { BEREICH_LABELS, type CoachActivity, type CoachAssessment, type CoachGoal, type CoachMeasurement } from './types'
import { COACH_PRODUKT_NAME, COACH_PRODUKT_VERSION } from './version'

/** Fassung, gegen die abgebildet wird. */
export const FHIR_VERSION = '4.0.1'

/** Eigene Basis-URL für alle selbst vergebenen Kennungen. */
export const FHIR_BASIS = 'https://alltagsengel.care/fhir'

export const QUESTIONNAIRE_SELBSTEINSCHAETZUNG = `${FHIR_BASIS}/Questionnaire/pflegecoach-selbsteinschaetzung`
export const QUESTIONNAIRE_BELASTUNG = `${FHIR_BASIS}/Questionnaire/pflegecoach-belastung-kurz`

/** Minimal typisiert: FHIR-Ressourcen sind offen, wir prüfen nur unsere Felder. */
export type FhirRessource = Record<string, unknown> & { resourceType: string; id: string }

export interface FhirBundle {
  resourceType: 'Bundle'
  type: 'collection'
  timestamp: string
  meta: { source: string }
  entry: Array<{ fullUrl: string; resource: FhirRessource }>
}

export interface FhirEingabe {
  /** ISO-Zeitstempel, injiziert — damit die Ausgabe testbar deterministisch ist. */
  erstelltAm: string
  assessments: CoachAssessment[]
  measurements: CoachMeasurement[]
  goals: CoachGoal[]
  activities: CoachActivity[]
}

// ═══════════════════════════════════════════════════════════════
// Fragebogen-Definitionen
// ═══════════════════════════════════════════════════════════════
// Beide Instrumente sind hauseigen und NICHT validiert (siehe
// lib/coach/belastung.ts). Der Hinweis steht als `Questionnaire.purpose`
// IM Dokument — ein Empfänger darf die Werte sonst für ein validiertes
// Messergebnis halten.

const NICHT_VALIDIERT_HINWEIS =
  'Selbsteinschätzung zur Selbstreflexion und Verlaufsdarstellung. Kein validiertes ' +
  'Messinstrument, kein diagnostisches Screening, keine klinische Bewertung.'

function antwortOptionen(stufen: readonly string[]) {
  return stufen.map((text, wert) => ({
    valueCoding: { system: `${FHIR_BASIS}/CodeSystem/pflegecoach-stufen`, code: String(wert), display: text },
  }))
}

/** Fragebogen zur Selbsteinschätzung der Selbständigkeit (5 Bereiche, 0–4). */
export function questionnaireSelbsteinschaetzung(): FhirRessource {
  return {
    resourceType: 'Questionnaire',
    id: 'pflegecoach-selbsteinschaetzung',
    url: QUESTIONNAIRE_SELBSTEINSCHAETZUNG,
    version: COACH_PRODUKT_VERSION,
    name: 'PflegeCoachSelbsteinschaetzung',
    title: 'Selbsteinschätzung der Selbständigkeit',
    status: 'active',
    subjectType: ['Patient'],
    publisher: COACH_PRODUKT_NAME,
    purpose: NICHT_VALIDIERT_HINWEIS,
    item: ASSESSMENT_BEREICHE.map(bereich => ({
      linkId: bereich,
      text: ASSESSMENT_BEREICH_LABELS[bereich],
      type: 'choice',
      answerOption: antwortOptionen(ASSESSMENT_STUFEN),
    })),
  }
}

/** Fragebogen zur Belastungs-Selbsteinschätzung pflegender Angehöriger (7 Items, 0–3). */
export function questionnaireBelastung(): FhirRessource {
  return {
    resourceType: 'Questionnaire',
    id: 'pflegecoach-belastung-kurz',
    url: QUESTIONNAIRE_BELASTUNG,
    version: COACH_PRODUKT_VERSION,
    name: 'PflegeCoachBelastungKurz',
    title: 'Belastungs-Selbsteinschätzung (Kurzform)',
    status: 'active',
    subjectType: ['Patient'],
    publisher: COACH_PRODUKT_NAME,
    purpose: NICHT_VALIDIERT_HINWEIS,
    item: BELASTUNG_ITEMS.map(item => ({
      linkId: item.id,
      text: item.frage,
      type: 'choice',
      answerOption: antwortOptionen(BELASTUNG_STUFEN),
    })),
  }
}

// ═══════════════════════════════════════════════════════════════
// Antworten
// ═══════════════════════════════════════════════════════════════

function antwortItem(linkId: string, text: string, wert: number, stufen: readonly string[]) {
  return {
    linkId,
    text,
    answer: [{
      valueCoding: {
        system: `${FHIR_BASIS}/CodeSystem/pflegecoach-stufen`,
        code: String(wert),
        display: stufen[wert] ?? String(wert),
      },
    }],
  }
}

/** Ein Assessment → QuestionnaireResponse. Unbeantwortete Bereiche entfallen. */
export function assessmentAlsResponse(a: CoachAssessment, id: string): FhirRessource {
  return {
    resourceType: 'QuestionnaireResponse',
    id,
    questionnaire: QUESTIONNAIRE_SELBSTEINSCHAETZUNG,
    status: 'completed',
    authored: a.erhoben_am,
    item: ASSESSMENT_BEREICHE
      .filter(b => typeof a[b] === 'number')
      .map(b => antwortItem(b, ASSESSMENT_BEREICH_LABELS[b], a[b] as number, ASSESSMENT_STUFEN)),
  }
}

/**
 * Eine Messung → QuestionnaireResponse.
 *
 * Nur `belastung_kurz` wird auf den hauseigenen Fragebogen abgebildet.
 * Für die lizenzpflichtigen Instrumente (FES-I, BSFC-s, SUS) gibt es
 * bewusst KEINE Item-Abbildung: Deren Fragetexte dürfen ohne Lizenz nicht
 * verbreitet werden (QI-02). Übertragen wird dann nur der Summenwert mit
 * dem Instrumentnamen — mehr wäre eine Lizenzverletzung.
 */
export function messungAlsResponse(m: CoachMeasurement, id: string): FhirRessource {
  const basis = {
    resourceType: 'QuestionnaireResponse' as const,
    id,
    status: 'completed',
    authored: m.erhoben_am,
  }

  if (m.instrument === 'belastung_kurz') {
    return {
      ...basis,
      questionnaire: QUESTIONNAIRE_BELASTUNG,
      item: BELASTUNG_ITEMS
        .filter(i => typeof m.antworten?.[i.id] === 'number')
        .map(i => antwortItem(i.id, i.frage, m.antworten[i.id] as number, BELASTUNG_STUFEN)),
    }
  }

  return {
    ...basis,
    item: [{
      linkId: `instrument/${m.instrument}`,
      text: `Summenwert des Instruments „${m.instrument}" (Fragetexte aus Lizenzgründen nicht enthalten)`,
      answer: typeof m.summenwert === 'number' ? [{ valueInteger: m.summenwert }] : [],
    }],
  }
}

// ═══════════════════════════════════════════════════════════════
// Ziele und Plan
// ═══════════════════════════════════════════════════════════════

/**
 * Zielstatus → FHIR. `lifecycleStatus` beschreibt den Bearbeitungsstand,
 * `achievementStatus` die Zielerreichung — beides ist getrennt zu melden,
 * sonst geht die Information „erreicht" beim Empfänger verloren.
 */
const ZIEL_LIFECYCLE: Record<CoachGoal['status'], string> = {
  aktiv: 'active',
  erreicht: 'completed',
  angepasst: 'active',
  pausiert: 'on-hold',
  beendet: 'cancelled',
}

export function zielAlsGoal(g: CoachGoal, id: string): FhirRessource {
  const beschreibung = [g.titel, g.beschreibung].filter(Boolean).join(' — ')
  const ressource: FhirRessource = {
    resourceType: 'Goal',
    id,
    lifecycleStatus: ZIEL_LIFECYCLE[g.status] ?? 'active',
    category: [{
      coding: [{
        system: `${FHIR_BASIS}/CodeSystem/pflegecoach-zielbereich`,
        code: g.bereich,
        display: BEREICH_LABELS[g.bereich] ?? g.bereich,
      }],
    }],
    description: { text: beschreibung },
    startDate: g.start_am,
  }

  if (g.status === 'erreicht') {
    ressource.achievementStatus = {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/goal-achievement', code: 'achieved', display: 'Achieved' }],
    }
  }

  // Messgröße nur, wenn es tatsächlich eine gibt — ein leeres `target`
  // liest sich beim Empfänger wie „Ziel ohne Maß" statt „nicht erhoben".
  if (g.messgroesse && typeof g.zielwert === 'number') {
    ressource.target = [{
      measure: { text: g.messgroesse },
      detailQuantity: { value: g.zielwert },
      ...(g.ziel_bis ? { dueDate: g.ziel_bis } : {}),
    }]
  }
  return ressource
}

const WOCHENTAG_FHIR = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** Wochentage 1–7 (Mo–So) → FHIR-Codes. Unbekannte Werte entfallen. */
export function wochentageAlsFhir(tage: number[] | null | undefined): string[] {
  return (tage ?? [])
    .map(t => WOCHENTAG_FHIR[t - 1])
    .filter((t): t is string => Boolean(t))
}

/**
 * Alle Aktivitäten → ein CarePlan.
 * Der Plan verweist auf die Ziel-Ressourcen; die Zuordnung Aktivität→Ziel
 * kommt aus `goal_id` und wird über die Nummernkarte aufgelöst.
 */
export function aktivitaetenAlsCarePlan(
  aktivitaeten: CoachActivity[],
  zielRefs: Map<string, string>,
  id = 'plan-1'
): FhirRessource {
  return {
    resourceType: 'CarePlan',
    id,
    status: 'active',
    intent: 'plan',
    title: 'Wochenplan aus dem Digitalen PflegeCoach',
    description:
      'Selbst gewählte Alltagsaktivitäten. Kein ärztlicher oder pflegerischer Behandlungsplan.',
    goal: [...new Set(aktivitaeten.map(a => a.goal_id).filter((g): g is string => Boolean(g)))]
      .map(gid => zielRefs.get(gid))
      .filter((ref): ref is string => Boolean(ref))
      .map(ref => ({ reference: ref })),
    activity: aktivitaeten.map(a => ({
      detail: {
        status: a.aktiv ? 'in-progress' : 'not-started',
        description: [a.titel, a.beschreibung].filter(Boolean).join(' — '),
        code: {
          coding: [{
            system: `${FHIR_BASIS}/CodeSystem/pflegecoach-aktivitaet`,
            code: a.kategorie,
            display: a.kategorie,
          }],
        },
        scheduledTiming: {
          repeat: {
            ...(a.wochentage?.length ? { dayOfWeek: wochentageAlsFhir(a.wochentage) } : {}),
            ...(a.uhrzeit ? { timeOfDay: [a.uhrzeit] } : {}),
            ...(typeof a.dauer_minuten === 'number'
              ? { duration: a.dauer_minuten, durationUnit: 'min' }
              : {}),
          },
        },
      },
    })),
  }
}

// ═══════════════════════════════════════════════════════════════
// Bundle
// ═══════════════════════════════════════════════════════════════

/**
 * Vollständiges Bundle.
 *
 * `type: 'collection'` ist Absicht: Es ist eine Sammlung zur Übergabe,
 * kein signiertes `document` — für ein FHIR-Document bräuchte es eine
 * Composition mit Autor und Bestätigung, und Autor wäre hier der Nutzer
 * selbst. Diese Behauptung wird nicht aufgestellt.
 */
export function buildFhirBundle(input: FhirEingabe): FhirBundle {
  const eintraege: Array<{ fullUrl: string; resource: FhirRessource }> = []
  const hinzu = (r: FhirRessource) => {
    eintraege.push({ fullUrl: `urn:uuid-frei:${r.resourceType}/${r.id}`, resource: r })
  }

  const brauchtBelastung = input.measurements.some(m => m.instrument === 'belastung_kurz')
  if (input.assessments.length > 0) hinzu(questionnaireSelbsteinschaetzung())
  if (brauchtBelastung) hinzu(questionnaireBelastung())

  input.assessments.forEach((a, i) => hinzu(assessmentAlsResponse(a, `assessment-${i + 1}`)))
  input.measurements.forEach((m, i) => hinzu(messungAlsResponse(m, `messung-${i + 1}`)))

  // Nummernkarte Datenbank-ID → FHIR-Referenz: nur hier, damit interne
  // Schlüssel das Bundle nie verlassen.
  const zielRefs = new Map<string, string>()
  input.goals.forEach((g, i) => {
    const id = `ziel-${i + 1}`
    zielRefs.set(g.id, `Goal/${id}`)
    hinzu(zielAlsGoal(g, id))
  })

  if (input.activities.length > 0) hinzu(aktivitaetenAlsCarePlan(input.activities, zielRefs))

  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: input.erstelltAm,
    meta: { source: `${FHIR_BASIS}/${COACH_PRODUKT_NAME} ${COACH_PRODUKT_VERSION}` },
    entry: eintraege,
  }
}
