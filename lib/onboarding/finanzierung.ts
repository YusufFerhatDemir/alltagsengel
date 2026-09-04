/**
 * Onboarding — Finanzierungswege verständlich erklären
 *
 * Rein rechnend. Die Beträge stammen AUSSCHLIESSLICH aus
 * lib/config/budget-constants.ts und werden hier nirgends wiederholt —
 * jede abgeschriebene Zahl wäre beim nächsten Rechtsstand falsch, und
 * zwar an einer Stelle, die Kundschaft liest.
 *
 * ── WARUM DAS EIN EIGENES MODUL IST ────────────────────────────────────
 * „Ich weiß es nicht" ist bei dieser Frage die häufigste und die
 * ehrlichste Antwort. Wer sie ankreuzt, braucht keine Fehlermeldung,
 * sondern eine Erklärung — und die muss überall gleich lauten: im Wizard,
 * in der Zusammenfassung, in der Anfrage, die bei der Verwaltung ankommt.
 * Als Text in einer Komponente wäre sie weder prüfbar noch
 * wiederverwendbar.
 *
 * ── KEINE ZUSAGE ───────────────────────────────────────────────────────
 * Die Texte sagen ausdrücklich, was NICHT feststeht. Ob ein Anspruch
 * besteht, entscheidet die Pflegekasse, nicht dieses Formular; ob ein
 * Betrag reicht, hängt an Leistungsart und Umfang. Ein Satz wie „das
 * kostet Sie nichts" wäre an dieser Stelle ein Versprechen, das niemand
 * halten kann.
 */

import {
  ENTLASTUNG_MONATLICH_EUR,
  VP_KZP_KOMBINIERT_EUR,
  budgetVersionFuerJahr,
} from '@/lib/config/budget-constants'

export const FINANZIERUNGSWEGE = [
  'entlastungsbetrag',
  'weitere_pflegeleistungen',
  'privat',
  'unklar',
] as const

export type Finanzierungsweg = (typeof FINANZIERUNGSWEGE)[number]

export function istFinanzierungsweg(wert: unknown): wert is Finanzierungsweg {
  return typeof wert === 'string' && (FINANZIERUNGSWEGE as readonly string[]).includes(wert)
}

export interface FinanzierungsOption {
  wert: Finanzierungsweg
  label: string
  /** Eine Zeile unter dem Label — reicht zur Auswahl. */
  kurz: string
  /** Die ausführliche Erklärung, sichtbar bei „Ich weiß es nicht". */
  lang: string
  /** Was für diesen Weg vorliegen muss. Leer = nichts. */
  voraussetzung: string | null
}

function euro(betrag: number): string {
  return betrag.toLocaleString('de-DE', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0,
  })
}

/**
 * Die Finanzierungswege für ein Leistungsjahr.
 *
 * Fail-closed: für ein Jahr ohne hinterlegte gesetzliche Werte wirft
 * budgetVersionFuerJahr(). Lieber keine Auskunft als eine geratene —
 * ein falscher Betrag an dieser Stelle steht in einer Kundenanfrage.
 */
export function finanzierungsOptionen(jahr: number = new Date().getFullYear()): FinanzierungsOption[] {
  const gesetz = budgetVersionFuerJahr(jahr)

  return [
    {
      wert: 'entlastungsbetrag',
      label: 'Entlastungsbetrag der Pflegekasse',
      kurz: `${euro(gesetz.entlastungMonatlich)} im Monat — der häufigste Weg`,
      lang:
        `Ab Pflegegrad ${gesetz.minPflegegradVpKzp - 1} steht Ihnen nach § 45b SGB XI ein `
        + `Entlastungsbetrag von ${euro(gesetz.entlastungMonatlich)} monatlich zu — `
        + `${euro(gesetz.entlastungJaehrlich)} im Jahr. Er ist für genau solche `
        + `Unterstützung im Alltag gedacht: Haushalt, Einkäufe, Begleitung, Gesellschaft. `
        + `Sie zahlen nichts aus eigener Tasche, solange der Betrag reicht. `
        + `Nicht genutzte Beträge verfallen nicht sofort — sie laufen bis zum 30. Juni des `
        + `Folgejahres weiter. Wir rechnen direkt mit Ihrer Pflegekasse ab.`,
      voraussetzung: 'Pflegegrad 1 bis 5',
    },
    {
      wert: 'weitere_pflegeleistungen',
      label: 'Weitere Leistungen der Pflegekasse',
      kurz: 'Verhinderungs- und Kurzzeitpflege',
      lang:
        `Wenn die Pflegeperson ausfällt oder Urlaub braucht, gibt es zusätzlich einen `
        + `gemeinsamen Jahresbetrag für Verhinderungs- und Kurzzeitpflege von `
        + `${euro(gesetz.vpKzpKombiniert)} (§ 42a SGB XI, ab Pflegegrad `
        + `${gesetz.minPflegegradVpKzp}). Der Betrag ist frei zwischen beiden Leistungen `
        + `aufteilbar. Ob er in Ihrem Fall in Frage kommt, klären wir gemeinsam — dafür `
        + `müssen Sie jetzt nichts entscheiden.`,
      voraussetzung: `Pflegegrad ${gesetz.minPflegegradVpKzp} bis 5`,
    },
    {
      wert: 'privat',
      label: 'Ich zahle selbst',
      kurz: 'Ohne Pflegekasse, ohne Antrag',
      lang:
        'Sie beauftragen uns direkt und bekommen eine Rechnung. Das ist der einfachste Weg, '
        + 'wenn kein Pflegegrad vorliegt oder Sie ihn nicht in Anspruch nehmen möchten. '
        + 'Den genauen Stundensatz nennen wir Ihnen vor dem ersten Einsatz — er hängt von '
        + 'der Leistung und vom Umfang ab. Ein Teil der Kosten lässt sich unter Umständen '
        + 'steuerlich geltend machen (§ 35a EStG).',
      voraussetzung: null,
    },
    {
      wert: 'unklar',
      label: 'Ich weiß es nicht',
      kurz: 'Das ist völlig in Ordnung — wir erklären es Ihnen',
      lang:
        'Sehr viele Menschen wissen das nicht, und es ist auch nicht einfach. '
        + 'Sie müssen sich hier nicht festlegen: Wir sehen uns Ihre Angaben an, prüfen, '
        + 'was Ihnen zusteht, und besprechen die Möglichkeiten in Ruhe mit Ihnen. '
        + 'Wenn noch kein Pflegegrad vorliegt, unterstützen wir Sie beim Antrag. '
        + 'Ihre Anfrage ist unverbindlich und kostet nichts.',
      voraussetzung: null,
    },
  ]
}

/** Klartext eines Weges — für Zusammenfassung und Anfrage. */
export function finanzierungsLabel(
  weg: string,
  jahr: number = new Date().getFullYear(),
): string {
  const treffer = finanzierungsOptionen(jahr).find(o => o.wert === weg)
  return treffer?.label ?? weg
}

/**
 * Die Erklärung, die bei „Ich weiß es nicht" erscheint: ALLE Wege
 * nacheinander, nicht nur der gewählte. Wer sich nicht auskennt, braucht
 * den Überblick, nicht die Bestätigung seiner Unsicherheit.
 */
export function erklaerungAlleWege(jahr: number = new Date().getFullYear()): FinanzierungsOption[] {
  return finanzierungsOptionen(jahr).filter(o => o.wert !== 'unklar')
}

/** Der Monatsbetrag als Zahl — für Anzeigen, die selbst formatieren. */
export const ENTLASTUNGSBETRAG_MONATLICH = ENTLASTUNG_MONATLICH_EUR
/** Gemeinsamer Jahresbetrag VP/KZP als Zahl. */
export const VP_KZP_JAHRESBETRAG = VP_KZP_KOMBINIERT_EUR
