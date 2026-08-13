// ═══════════════════════════════════════════════════════════════
// PflegeCoach — regelbasierte Anpassungs-Empfehlungen
//
// MDR-NEGATIVABGRENZUNG (bitte bei JEDER Änderung beachten):
// Diese Engine erzeugt ausschließlich ORGANISATORISCHE Hinweise
// (Ziel überprüfen, Aktivität anpassen, Verlaufsassessment fällig,
// statischer Verweis auf Pflegeberatung/Entlastungsangebote).
// VERBOTEN sind: Risiko-Scores, diagnostische Deutungen („Anzeichen
// für…"), individualisierte Übungsanpassung anhand von Gesundheits-
// daten, Dosier-/Therapieempfehlungen. Solche Regeln würden die
// Einstufung als Medizinprodukt (MDR) auslösen — siehe
// audit/DIPA_REGULATORIK_2026-08-09.md Abschnitt 2.5.
// ═══════════════════════════════════════════════════════════════

import type { CoachActivity, CoachActivityLog, CoachAssessment, CoachGoal, CoachMeasurement } from './types'
import { vergleicheAssessments, verschlechterteBereiche } from './assessment'
import { belastungHinweisNoetig } from './belastung'

export type EmpfehlungTyp =
  | 'ziel_ueberfaellig'
  | 'ziel_bereich_pruefen'
  | 'aktivitaet_anpassen'
  | 'verlaufsassessment_faellig'
  | 'entlastung_hinweis'
  | 'sturz_besprechen'

export interface Empfehlung {
  typ: EmpfehlungTyp
  titel: string
  text: string
  /** interner Link im PflegeCoach */
  link: string
  prioritaet: 1 | 2 | 3
  bezugId?: string
}

/** Statischer Hinweis, der jeder Empfehlungsliste beiliegt (MDR-Abgrenzung). */
export const EMPFEHLUNG_DISCLAIMER =
  'Diese Hinweise sind Organisationshilfen und ersetzen keine ärztliche oder pflegefachliche Beratung. ' +
  'Bei gesundheitlichen Fragen wenden Sie sich an Hausarztpraxis oder Pflegeberatung (§ 7a SGB XI).'

export interface EmpfehlungInput {
  heute: string // ISO-Datum, injiziert für Testbarkeit
  goals: CoachGoal[]
  activities: CoachActivity[]
  activityLog: CoachActivityLog[] // letzte 14 Tage
  assessments: CoachAssessment[]  // chronologisch aufsteigend
  belastungMessungen: CoachMeasurement[] // instrument belastung_kurz, aufsteigend
  sturzEreignisse: CoachMeasurement[]    // instrument sturzereignis, aufsteigend
}

/** Anzahl geplanter Vorkommen einer Aktivität in den letzten 14 Tagen. */
export function geplanteVorkommen14Tage(activity: CoachActivity, heute: string): number {
  if (!activity.wochentage.length) return 0
  let count = 0
  const ende = new Date(heute + 'T00:00:00Z')
  for (let i = 0; i < 14; i++) {
    const d = new Date(ende)
    d.setUTCDate(d.getUTCDate() - i)
    // JS: 0=So..6=Sa → ISO 1=Mo..7=So
    const isoTag = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
    if (activity.wochentage.includes(isoTag)) count++
  }
  return count
}

export function berechneEmpfehlungen(input: EmpfehlungInput): Empfehlung[] {
  const out: Empfehlung[] = []
  const { heute, goals, activities, activityLog, assessments, belastungMessungen, sturzEreignisse } = input

  // 1) Überfällige aktive Ziele → Ziel überprüfen/anpassen
  for (const g of goals) {
    if (g.status === 'aktiv' && g.ziel_bis && g.ziel_bis < heute) {
      out.push({
        typ: 'ziel_ueberfaellig',
        titel: `Ziel überprüfen: „${g.titel}"`,
        text: 'Der Zieltermin ist erreicht. Prüfen Sie gemeinsam, ob das Ziel erreicht ist, angepasst werden soll oder mehr Zeit braucht.',
        link: '/pflegecoach/ziele',
        prioritaet: 2,
        bezugId: g.id,
      })
    }
  }

  // 2) Niedrige Erledigungsquote (< 50 % über 14 Tage) → Aktivität anpassen
  for (const a of activities) {
    if (!a.aktiv) continue
    const geplant = geplanteVorkommen14Tage(a, heute)
    if (geplant < 4) continue // zu wenig Datenbasis für eine Aussage
    const erledigt = activityLog.filter(l => l.activity_id === a.id && l.status !== 'ausgelassen').length
    if (erledigt / geplant < 0.5) {
      out.push({
        typ: 'aktivitaet_anpassen',
        titel: `Aktivität anpassen: „${a.titel}"`,
        text: 'Diese Aktivität wurde in den letzten zwei Wochen selten umgesetzt. Vielleicht passt eine andere Uhrzeit, ein anderer Wochentag oder eine kleinere Variante besser in den Alltag.',
        link: '/pflegecoach/wochenplan',
        prioritaet: 3,
        bezugId: a.id,
      })
    }
  }

  // 3) Verlaufsassessment: Verschlechterung um >= 2 Stufen in einem Bereich
  //    → Ziele in diesem Bereich überprüfen + statischer Beratungs-Hinweis
  if (assessments.length >= 2) {
    const deltas = vergleicheAssessments(assessments[assessments.length - 2], assessments[assessments.length - 1])
    for (const d of verschlechterteBereiche(deltas, 2)) {
      out.push({
        typ: 'ziel_bereich_pruefen',
        titel: `Maßnahmen im Bereich „${d.label}" überprüfen`,
        text: `Ihre Selbsteinschätzung im Bereich ${d.label} zeigt mehr Unterstützungsbedarf als bei der letzten Erhebung. ` +
          'Prüfen Sie, ob Ziele und Aktivitäten in diesem Bereich noch passen. ' +
          'Besprechen Sie Veränderungen bei Bedarf mit der Pflegeberatung (§ 7a SGB XI) oder Ihrer Hausarztpraxis.',
        link: '/pflegecoach/ziele',
        prioritaet: 1,
      })
    }
  }

  // 4) Verlaufsassessment fällig (letztes älter als 8 Wochen)
  const letztes = assessments[assessments.length - 1]
  if (letztes) {
    const grenze = new Date(heute + 'T00:00:00Z')
    grenze.setUTCDate(grenze.getUTCDate() - 56)
    if (new Date(letztes.erhoben_am + 'T00:00:00Z') < grenze) {
      out.push({
        typ: 'verlaufsassessment_faellig',
        titel: 'Verlaufsassessment fällig',
        text: 'Die letzte Selbsteinschätzung liegt über 8 Wochen zurück. Eine neue Erhebung macht Ihren Verlauf sichtbar.',
        link: '/pflegecoach/assessment',
        prioritaet: 2,
      })
    }
  }

  // 5) Belastung gestiegen / hoch → statischer Hinweis auf Entlastungsangebote
  if (belastungMessungen.length >= 1) {
    const aktuell = belastungMessungen[belastungMessungen.length - 1]
    const vorher = belastungMessungen.length >= 2 ? belastungMessungen[belastungMessungen.length - 2] : null
    if (
      typeof aktuell.summenwert === 'number' &&
      belastungHinweisNoetig(aktuell.summenwert, typeof vorher?.summenwert === 'number' ? vorher.summenwert : null)
    ) {
      out.push({
        typ: 'entlastung_hinweis',
        titel: 'Entlastungsangebote ansehen',
        text: 'Ihre Selbsteinschätzung zeigt eine hohe Belastung. Es gibt gesetzliche Entlastungsangebote, die Sie in Anspruch nehmen können — z. B. den Entlastungsbetrag (§ 45b SGB XI), Verhinderungspflege und kostenlose Pflegeberatung (§ 7a SGB XI).',
        link: '/pflegecoach/angehoerige',
        prioritaet: 1,
      })
    }
  }

  // 6) Gemeldetes Sturzereignis in den letzten 4 Wochen → statischer Hinweis
  //    (KEINE Risikobewertung — nur Gesprächs- und Wohnraum-Check-Hinweis)
  const sturzGrenze = new Date(heute + 'T00:00:00Z')
  sturzGrenze.setUTCDate(sturzGrenze.getUTCDate() - 28)
  const juengsterSturz = sturzEreignisse[sturzEreignisse.length - 1]
  if (juengsterSturz && new Date(juengsterSturz.erhoben_am) >= sturzGrenze) {
    out.push({
      typ: 'sturz_besprechen',
      titel: 'Sturz notiert — bitte ansprechen',
      text: 'Sie haben einen Sturz notiert. Besprechen Sie das Ereignis mit Ihrer Hausarztpraxis oder der Pflegeberatung. ' +
        'Der Wohnraum-Sicherheits-Check im Bereich Mobilität hilft, Stolperquellen zu finden.',
      link: '/pflegecoach/mobilitaet',
      prioritaet: 1,
      bezugId: juengsterSturz.id,
    })
  }

  return out.sort((a, b) => a.prioritaet - b.prioritaet)
}
