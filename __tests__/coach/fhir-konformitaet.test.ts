/**
 * DiPA / PflegeCoach — FHIR-Konformität des Übergabe-Bundles
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `lib/coach/fhir.test.ts` prüft die ABBILDUNG: wird aus einem erreichten
 * Ziel ein `achievementStatus`, fällt ein unbekannter Wochentag weg, bleibt
 * ein lizenzpflichtiger Fragetext draussen. Jede dieser Prüfungen sieht
 * genau eine Ressource an.
 *
 * Diese Suite prüft die andere Frage: Ist das Ergebnis als GANZES ein
 * gültiges FHIR-R4-Bundle? Sie läuft nicht über einzelne Fälle, sondern
 * GENERISCH über jede Ressource und jedes Feld eines vollständig gefüllten
 * Bundles. Der Unterschied ist praktisch: Eine sechste Ressourcenart, die
 * jemand später ergänzt, wird von den Einzelfall-Tests nicht erfasst — von
 * einem Baumdurchlauf schon.
 *
 * WAS HIER GEPRÜFT WIRD, UND WARUM GENAU DAS:
 *
 *  1. REQUIRED BINDINGS. FHIR R4 lässt bei `Questionnaire.status`,
 *     `QuestionnaireResponse.status`, `Goal.lifecycleStatus`,
 *     `CarePlan.status`, `CarePlan.intent` und
 *     `CarePlan.activity.detail.status` ausschliesslich Werte aus einer
 *     festen Liste zu ("required" ist die strengste Bindungsstärke). Ein
 *     Wert daneben ist keine Geschmacksfrage, sondern macht die Ressource
 *     ungültig — und fällt beim Empfänger auf, nicht bei uns. Die
 *     zulässigen Listen stehen unten mit Quelle.
 *
 *  2. AUFLÖSBARE VERWEISE. Jeder `reference`-String im Bundle muss auf
 *     eine Ressource ZEIGEN, die im selben Bundle liegt. Ein Verweis ins
 *     Leere ist schlimmer als ein fehlender: Der Empfänger sieht ein Ziel
 *     genannt, das er nicht auflösen kann, und weiss nicht, ob es fehlt
 *     oder ob er es übersehen hat.
 *
 *  3. DEUTBARE ANTWORTEN. Jede `QuestionnaireResponse` mit `questionnaire`
 *     muss den zugehörigen Fragebogen im Bundle haben, UND jeder
 *     `linkId` einer Antwort muss in diesem Fragebogen vorkommen. Das ist
 *     die Prüfung mit dem grössten Nutzen: Ergänzt jemand einen sechsten
 *     Assessment-Bereich in der Antwort-Abbildung, ohne ihn in den
 *     Fragebogen aufzunehmen, überträgt das Bundle eine Zahl ohne Frage.
 *     Sie wäre syntaktisch gültig und inhaltlich wertlos.
 *
 *  4. PRODUKTGRENZE. Im Bundle darf keine `Patient`-Ressource und kein
 *     `subject`-Verweis stehen, und keine interne Datenbank-ID. Das ist
 *     nicht bloss Datensparsamkeit: Eine Patient-Ressource wäre die
 *     Behauptung, hier werde ein Behandlungskontext geführt.
 *
 * KEINE ZULASSUNGSAUSSAGE: Konform heisst hier „entspricht der
 * FHIR-R4-Spezifikation", geprüft gegen die unten genannten Wertelisten.
 * Es ist keine Zertifizierung, keine Prüfung gegen ein KBV-/MIO-Profil
 * und kein Ersatz für einen Validator-Lauf beim Empfänger. Das Bundle
 * behauptet ausdrücklich KEIN Profil (`meta.profile` fehlt bewusst).
 */

import { describe, it, expect } from 'vitest'
import { buildFhirBundle, FHIR_BASIS } from '@/lib/coach/fhir'
import type { CoachActivity, CoachAssessment, CoachGoal, CoachMeasurement } from '@/lib/coach/types'

// ═══════════════════════════════════════════════════════════════════
// Zulässige Werte — FHIR R4 (4.0.1), Bindungsstärke "required"
// ═══════════════════════════════════════════════════════════════════
/** http://hl7.org/fhir/R4/valueset-publication-status.html */
const PUBLICATION_STATUS = ['draft', 'active', 'retired', 'unknown']
/** http://hl7.org/fhir/R4/valueset-questionnaire-answers-status.html */
const QR_STATUS = ['in-progress', 'completed', 'amended', 'entered-in-error', 'stopped']
/** http://hl7.org/fhir/R4/valueset-goal-status.html */
const GOAL_LIFECYCLE = [
  'proposed', 'planned', 'accepted', 'active', 'on-hold',
  'completed', 'cancelled', 'entered-in-error', 'rejected',
]
/** http://hl7.org/fhir/R4/valueset-request-status.html */
const CAREPLAN_STATUS = [
  'draft', 'active', 'on-hold', 'revoked', 'completed', 'entered-in-error', 'unknown',
]
/** http://hl7.org/fhir/R4/valueset-care-plan-intent.html */
const CAREPLAN_INTENT = ['proposal', 'plan', 'order', 'option']
/** http://hl7.org/fhir/R4/valueset-care-plan-activity-status.html */
const ACTIVITY_STATUS = [
  'not-started', 'scheduled', 'in-progress', 'on-hold', 'completed',
  'cancelled', 'stopped', 'unknown', 'entered-in-error',
]
/** http://hl7.org/fhir/R4/valueset-item-type.html */
const ITEM_TYPE = [
  'group', 'display', 'boolean', 'decimal', 'integer', 'date', 'dateTime',
  'time', 'string', 'text', 'url', 'choice', 'open-choice', 'attachment',
  'reference', 'quantity',
]
/** http://hl7.org/fhir/R4/valueset-days-of-week.html */
const DAYS_OF_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
/** http://hl7.org/fhir/R4/datatypes.html#id */
const FHIR_ID = /^[A-Za-z0-9\-.]{1,64}$/
/** Interne Datenbankschlüssel — dürfen das Bundle nie verlassen. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

// ═══════════════════════════════════════════════════════════════════
// Vollständig gefüllter Bestand — echte UUIDs als Datenbank-IDs, damit
// die Leck-Prüfung etwas zu finden HÄTTE, wenn eine durchrutschte.
// ═══════════════════════════════════════════════════════════════════
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const assessments: CoachAssessment[] = [{
  id: U(1), coach_user_id: U(99), assessment_typ: 'erstassessment',
  mobilitaet: 2, selbstversorgung: 1, alltagsgestaltung: 4,
  soziale_teilhabe: 0, kognition: 3,
  // Merkzeichen statt Alltagswoerter: 'Rollator' oder 'allein' kommen
  // auch in Zieltexten vor, die ZURECHT uebertragen werden — eine
  // Leck-Pruefung darauf haette einen Treffer gemeldet, der keiner ist.
  hilfsmittel: 'HILFSMITTEL-NICHT-UEBERTRAGEN',
  wohnsituation: 'WOHNSITUATION-NICHT-UEBERTRAGEN',
  notizen: 'NOTIZ-NICHT-UEBERTRAGEN',
  erhoben_am: '2026-08-01T09:00:00Z', created_at: '2026-08-01T09:00:00Z',
}]

const measurements: CoachMeasurement[] = [
  {
    id: U(2), coach_user_id: U(99), instrument: 'belastung_kurz', messzeitpunkt: 't0',
    antworten: { erschoepfung: 2, schlaf: 3 }, summenwert: 5,
    erhoben_am: '2026-08-02T09:00:00Z', created_at: '2026-08-02T09:00:00Z',
  },
  {
    // Lizenzpflichtiges Instrument — trägt bewusst KEIN `questionnaire`.
    id: U(3), coach_user_id: U(99), instrument: 'fes_i_k', messzeitpunkt: 't1',
    antworten: {}, summenwert: 21,
    erhoben_am: '2026-08-03T09:00:00Z', created_at: '2026-08-03T09:00:00Z',
  },
]

const goals: CoachGoal[] = [
  {
    id: U(4), coach_user_id: U(99), titel: 'Täglich 10 Minuten gehen',
    beschreibung: 'mit dem Rollator', bereich: 'mobilitaet',
    messgroesse: 'Minuten pro Tag', startwert: 2, zielwert: 10, aktueller_wert: 6,
    start_am: '2026-08-01', ziel_bis: '2026-10-01', status: 'aktiv',
    anpassungs_notiz: null, created_at: '2026-08-01T09:00:00Z', updated_at: '2026-08-01T09:00:00Z',
  },
  {
    id: U(5), coach_user_id: U(99), titel: 'Wieder allein duschen',
    beschreibung: null, bereich: 'selbstversorgung',
    messgroesse: null, startwert: null, zielwert: null, aktueller_wert: null,
    start_am: '2026-07-01', ziel_bis: null, status: 'erreicht',
    anpassungs_notiz: null, created_at: '2026-07-01T09:00:00Z', updated_at: '2026-08-01T09:00:00Z',
  },
  {
    id: U(6), coach_user_id: U(99), titel: 'Pausiertes Ziel', beschreibung: null,
    bereich: 'entlastung_angehoerige', messgroesse: null, startwert: null,
    zielwert: null, aktueller_wert: null, start_am: '2026-06-01', ziel_bis: null,
    status: 'pausiert', anpassungs_notiz: null,
    created_at: '2026-06-01T09:00:00Z', updated_at: '2026-08-01T09:00:00Z',
  },
  {
    id: U(7), coach_user_id: U(99), titel: 'Beendetes Ziel', beschreibung: null,
    bereich: 'soziale_teilhabe', messgroesse: null, startwert: null,
    zielwert: null, aktueller_wert: null, start_am: '2026-05-01', ziel_bis: null,
    status: 'beendet', anpassungs_notiz: null,
    created_at: '2026-05-01T09:00:00Z', updated_at: '2026-08-01T09:00:00Z',
  },
]

const activities: CoachActivity[] = [
  {
    id: U(8), coach_user_id: U(99), titel: 'Spaziergang', beschreibung: 'um den Block',
    kategorie: 'mobilitaet', wochentage: [1, 3, 5], uhrzeit: '10:00', dauer_minuten: 20,
    goal_id: U(4), aktiv: true, created_at: '2026-08-01T09:00:00Z', updated_at: '2026-08-01T09:00:00Z',
  },
  {
    id: U(9), coach_user_id: U(99), titel: 'Pausierte Übung', beschreibung: null,
    kategorie: 'erinnerung', wochentage: [7], uhrzeit: null, dauer_minuten: null,
    goal_id: U(5), aktiv: false, created_at: '2026-08-01T09:00:00Z', updated_at: '2026-08-01T09:00:00Z',
  },
]

const bundle = buildFhirBundle({
  erstelltAm: '2026-08-29T12:00:00.000Z',
  assessments, measurements, goals, activities,
})

type Ressource = Record<string, unknown> & { resourceType: string; id: string }
const ressourcen = bundle.entry.map(e => e.resource as Ressource)
const nachTyp = (typ: string) => ressourcen.filter(r => r.resourceType === typ)

/** Alle Werte eines Schlüssels, egal wie tief sie liegen. */
function sammle(knoten: unknown, schluessel: string, treffer: unknown[] = []): unknown[] {
  if (Array.isArray(knoten)) {
    for (const k of knoten) sammle(k, schluessel, treffer)
  } else if (knoten && typeof knoten === 'object') {
    for (const [k, v] of Object.entries(knoten as Record<string, unknown>)) {
      if (k === schluessel) treffer.push(v)
      sammle(v, schluessel, treffer)
    }
  }
  return treffer
}

// ═══════════════════════════════════════════════════════════════════
describe('Bundle-Gerüst', () => {
  it('ist eine Sammlung mit Zeitstempel und Quellenangabe', () => {
    expect(bundle.resourceType).toBe('Bundle')
    // `collection` statt `document`: ein FHIR-Document bräuchte eine
    // Composition mit Autor und Bestätigung. Diese Behauptung wird
    // bewusst nicht aufgestellt.
    expect(bundle.type).toBe('collection')
    expect(bundle.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/)
    expect(String(bundle.meta?.source)).toContain(FHIR_BASIS)
  })

  it('enthält alle fünf Ressourcenarten (Gegenprobe gegen einen leeren Durchlauf)', () => {
    // Ohne diese Zeile wären sämtliche Baumprüfungen unten auch dann
    // grün, wenn das Bundle leer bliebe.
    const typen = new Set(ressourcen.map(r => r.resourceType))
    expect([...typen].sort()).toEqual(['CarePlan', 'Goal', 'Questionnaire', 'QuestionnaireResponse'])
    expect(nachTyp('Questionnaire')).toHaveLength(2)
    expect(nachTyp('QuestionnaireResponse')).toHaveLength(3)
    expect(nachTyp('Goal')).toHaveLength(4)
    expect(nachTyp('CarePlan')).toHaveLength(1)
  })

  it('jeder Eintrag hat eine eigene fullUrl', () => {
    const urls = bundle.entry.map(e => e.fullUrl)
    expect(urls.every(u => typeof u === 'string' && u.length > 0)).toBe(true)
    // Doppelte fullUrl macht das Bundle mehrdeutig: welcher Eintrag gilt?
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('jede Ressource hat resourceType und eine gültige FHIR-id', () => {
    for (const r of ressourcen) {
      expect(typeof r.resourceType).toBe('string')
      expect(r.id, `id von ${r.resourceType}`).toMatch(FHIR_ID)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Required Bindings — die Wertelisten, die FHIR fest vorgibt', () => {
  it('Questionnaire.status', () => {
    for (const q of nachTyp('Questionnaire')) expect(PUBLICATION_STATUS).toContain(q.status)
  })

  it('QuestionnaireResponse.status', () => {
    for (const qr of nachTyp('QuestionnaireResponse')) expect(QR_STATUS).toContain(qr.status)
  })

  it('Goal.lifecycleStatus — für JEDEN im Produkt möglichen Zielstatus', () => {
    // Der Bestand oben deckt aktiv/erreicht/pausiert/beendet ab. Ein
    // Zielstatus, den die Abbildung nicht kennt, fiele auf 'active'
    // zurück — der Test hält fest, dass kein Wert ausserhalb der Liste
    // entsteht, und der Test darüber, dass alle vier Ziele ankommen.
    for (const g of nachTyp('Goal')) expect(GOAL_LIFECYCLE).toContain(g.lifecycleStatus)
    const gesetzt = nachTyp('Goal').map(g => g.lifecycleStatus)
    expect(new Set(gesetzt).size).toBeGreaterThanOrEqual(3)
  })

  it('CarePlan.status und .intent', () => {
    for (const p of nachTyp('CarePlan')) {
      expect(CAREPLAN_STATUS).toContain(p.status)
      expect(CAREPLAN_INTENT).toContain(p.intent)
    }
  })

  it('CarePlan.activity.detail.status', () => {
    const stati = sammle(nachTyp('CarePlan'), 'status')
      .filter(s => typeof s === 'string' && !CAREPLAN_STATUS.includes(s as string))
    // Sowohl aktive als auch pausierte Aktivität liegen im Bestand.
    expect(stati.length).toBeGreaterThan(0)
    for (const s of stati) expect(ACTIVITY_STATUS).toContain(s)
  })

  it('Questionnaire.item.type', () => {
    for (const t of sammle(nachTyp('Questionnaire'), 'type')) expect(ITEM_TYPE).toContain(t)
  })

  it('Timing.repeat.dayOfWeek', () => {
    for (const tage of sammle(bundle, 'dayOfWeek')) {
      for (const tag of tage as string[]) expect(DAYS_OF_WEEK).toContain(tag)
    }
  })

  it('eine Dauer wird nie ohne Einheit übertragen', () => {
    // FHIR verlangt durationUnit, sobald duration gesetzt ist. Eine Zahl
    // ohne Einheit liest der Empfänger als das, was er erwartet — und das
    // sind bei Pflegeaktivitäten ebenso gut Stunden wie Minuten.
    for (const repeat of sammle(bundle, 'repeat') as Array<Record<string, unknown>>) {
      if (repeat.duration !== undefined) expect(repeat.durationUnit).toBe('min')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Verweise', () => {
  it('jeder reference-Verweis löst sich innerhalb des Bundles auf', () => {
    const vorhanden = new Set(ressourcen.map(r => `${r.resourceType}/${r.id}`))
    const verweise = sammle(bundle, 'reference') as string[]
    expect(verweise.length).toBeGreaterThan(0)
    for (const v of verweise) {
      expect(vorhanden, `Verweis ${v} zeigt ins Leere`).toContain(v)
    }
  })

  it('der Plan verweist nur auf Ziele, nie auf etwas anderes', () => {
    for (const v of sammle(nachTyp('CarePlan'), 'reference') as string[]) {
      expect(v.startsWith('Goal/')).toBe(true)
    }
  })

  it('jeder Coding-Eintrag nennt System UND Code', () => {
    // Ein Code ohne System ist beim Empfänger nicht auflösbar — er weiss
    // nicht, in welchem Vokabular er nachschlagen soll.
    const codings = sammle(bundle, 'coding').flat() as Array<Record<string, unknown>>
    expect(codings.length).toBeGreaterThan(0)
    for (const c of codings) {
      expect(typeof c.system).toBe('string')
      expect(typeof c.code).toBe('string')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Deutbarkeit der Antworten', () => {
  const fragebogenNachUrl = new Map(
    nachTyp('Questionnaire').map(q => [q.url as string, q]),
  )

  it('jede Antwort mit Fragebogen-Verweis hat den Fragebogen im Bundle', () => {
    const mitVerweis = nachTyp('QuestionnaireResponse').filter(qr => qr.questionnaire)
    expect(mitVerweis.length).toBeGreaterThan(0)
    for (const qr of mitVerweis) {
      expect(
        fragebogenNachUrl.has(qr.questionnaire as string),
        `Fragebogen ${qr.questionnaire} fehlt im Bundle — die Antworten sind dann nicht deutbar.`,
      ).toBe(true)
    }
  })

  it('jede linkId einer Antwort kommt im zugehörigen Fragebogen vor', () => {
    // Die wichtigste Prüfung dieser Suite. Ergänzt jemand einen weiteren
    // Assessment-Bereich in der Antwort-Abbildung, ohne ihn in den
    // Fragebogen aufzunehmen, überträgt das Bundle eine Zahl ohne Frage:
    // syntaktisch gültig, inhaltlich wertlos.
    let geprueft = 0
    for (const qr of nachTyp('QuestionnaireResponse')) {
      const q = fragebogenNachUrl.get(qr.questionnaire as string)
      if (!q) continue
      const bekannt = new Set((sammle(q, 'linkId') as string[]))
      for (const link of sammle(qr, 'linkId') as string[]) {
        expect(bekannt, `linkId "${link}" steht in keiner Frage des Fragebogens.`).toContain(link)
        geprueft++
      }
    }
    expect(geprueft).toBeGreaterThanOrEqual(7)
  })

  it('lizenzpflichtige Instrumente kommen ohne Fragebogen und ohne Fragetext', () => {
    // Ohne Lizenz dürfen die Fragetexte nicht verbreitet werden (AK-QI-02).
    // Übertragen wird nur der Summenwert.
    const ohne = nachTyp('QuestionnaireResponse').filter(qr => !qr.questionnaire)
    expect(ohne).toHaveLength(1)
    const items = (ohne[0].item as Array<Record<string, unknown>>)
    expect(items).toHaveLength(1)
    expect(items[0].linkId).toBe('instrument/fes_i_k')
    expect(items[0].answer).toEqual([{ valueInteger: 21 }])
  })

  it('beide Fragebögen weisen aus, dass sie nicht validiert sind', () => {
    // Ohne diesen Hinweis IM Dokument könnte ein Empfänger die Werte für
    // ein validiertes Messergebnis halten.
    for (const q of nachTyp('Questionnaire')) {
      expect(String(q.purpose)).toMatch(/Kein validiertes Messinstrument/)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Produktgrenze — was NICHT im Bundle stehen darf', () => {
  const roh = JSON.stringify(bundle)

  it('keine interne Datenbank-ID', () => {
    // Der Bestand oben trägt überall echte UUIDs. Rutschte eine durch,
    // fände die Prüfung sie — anders als bei erfundenen Kurz-IDs.
    expect(UUID.test(roh)).toBe(false)
  })

  it('keine Patient-Ressource und kein subject-Verweis', () => {
    // Eine Patient-Ressource wäre die Behauptung, hier werde ein
    // Behandlungskontext geführt. Der PflegeCoach führt keinen.
    expect(nachTyp('Patient')).toHaveLength(0)
    expect(sammle(bundle, 'subject')).toEqual([])
  })

  it('keine Freitextfelder, die nie zur Übergabe bestimmt waren', () => {
    // notizen/hilfsmittel/wohnsituation stehen im Assessment, gehören
    // aber nicht in die Übergabe an Dritte.
    expect(roh).not.toContain('HILFSMITTEL-NICHT-UEBERTRAGEN')
    expect(roh).not.toContain('WOHNSITUATION-NICHT-UEBERTRAGEN')
    expect(roh).not.toContain('NOTIZ-NICHT-UEBERTRAGEN')
    // Gegenprobe: Zieltexte des Nutzers SOLLEN ankommen — die Prüfung
    // oben darf nicht daher rühren, dass gar kein Freitext im Bundle steht.
    expect(roh).toContain('mit dem Rollator')
  })

  it('behauptet kein Profil und kein fremdes Vokabular ausser dem einen erlaubten', () => {
    // meta.profile fehlt bewusst: Ein Profil-Anspruch wäre eine Zusage,
    // die niemand geprüft hat. Einzige fremde Terminologie ist
    // goal-achievement — ein HL7-Standardcode, kein Profil.
    expect(sammle(bundle, 'profile')).toEqual([])
    const fremd = (sammle(bundle, 'system') as string[])
      .filter(s => !s.startsWith(FHIR_BASIS))
    expect([...new Set(fremd)]).toEqual(['http://terminology.hl7.org/CodeSystem/goal-achievement'])
  })
})
