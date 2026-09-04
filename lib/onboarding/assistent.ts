/**
 * Onboarding-Assistent — regelbasierte Auskunft zum eigenen Ablauf
 *
 * Rein rechnend: kein Modellaufruf, keine Datenbank. Eingabe ist die
 * Frage und der Stand des Ablaufs, Ausgabe ist eine Antwort. Dadurch ist
 * jede Auskunft, die dieser Assistent gibt, im Test nachvollziehbar —
 * und das ist bei diesem Gegenstand keine Stilfrage.
 *
 * ── DIE REGEL, DIE ÜBER ALLEM STEHT ────────────────────────────────────
 * Der Assistent behauptet NIE, dass etwas vorliegt, angekommen,
 * anerkannt oder genehmigt ist, ohne dass es im Stand steht.
 *
 * Das ist strenger, als es klingt. „Ihr Führungszeugnis fehlt" wäre schon
 * eine Behauptung: im Stand steht nur, dass in DIESEM Ablauf nichts
 * vermerkt ist — per Post oder E-Mail kann es längst hier sein. Die
 * ehrliche Auskunft lautet deshalb „dazu ist in Ihrem Ablauf nichts
 * vermerkt", und sie sagt dazu, dass ein anderer Weg hier nicht sichtbar
 * wäre. Wer stattdessen „fehlt" sagt, schickt Menschen ein zweites Mal
 * zum Amt.
 *
 * Genauso wenig sagt er etwas über Ansprüche zu. Ob ein Pflegegrad
 * zusteht oder eine Bewerbung angenommen wird, entscheiden Pflegekasse
 * und Menschen — nicht ein Formular und nicht dieser Text.
 *
 * ── WARUM REGELN UND KEIN MODELL ───────────────────────────────────────
 * Die häufigen Fragen sind wenige und immer dieselben. Eine Regel
 * antwortet darauf sofort, kostenlos, offline und in genau dem Wortlaut,
 * den jemand geprüft hat. Ein Modell könnte hier bestenfalls dasselbe
 * sagen — und schlimmstenfalls einen Anspruch erfinden. Fragen, für die
 * es keine Regel gibt, werden ausdrücklich NICHT beantwortet, sondern an
 * Menschen weitergereicht.
 */

import { erwarteteAngabenFuer, schrittfolge, type OnboardingTyp } from './schritte'
import { angabeText } from './notifications'
import type { SchrittEintrag } from './service'

/** Was der Assistent über den Ablauf wissen muss. */
export interface AssistentLage {
  typ: OnboardingTyp
  aktuellerSchritt: number
  gesamtSchritte: number
  schritteDaten: Record<string, SchrittEintrag>
  fehlendeAngaben: readonly string[]
  dokumentStatus: Record<string, unknown>
  abgeschlossenAm: string | null
}

/** Was die Oberfläche als Knopf anbieten kann. */
export type Aktion =
  | { art: 'gehe_zu_schritt'; schritt: number; label: string }
  | { art: 'oeffne_ablauf'; typ: OnboardingTyp; label: string }
  | { art: 'hochladen'; dokumentArt: string; label: string }
  | { art: 'waehle_leistung'; wert: string; label: string }
  | { art: 'mensch'; label: string }

export interface Antwort {
  /** Der Antworttext. Bereits so formuliert, wie er angezeigt wird. */
  text: string
  aktionen: Aktion[]
  /**
   * Woher die Antwort stammt:
   *   'stand'   aus dem Ablauf abgeleitet
   *   'wissen'  allgemeine Erklärung ohne Personenbezug
   *   'keine'   nicht beantwortbar — an Menschen weitergereicht
   * Für Protokoll und Test: eine Antwort aus 'wissen' darf NIE etwas
   * über den persönlichen Stand aussagen.
   */
  quelle: 'stand' | 'wissen' | 'keine'
}

export const ABSICHTEN = [
  'anspruch',
  'offene_schritte',
  'pflegegrad_finden',
  'dokument_status',
  'leistung_waehlen',
  'als_engel_bewerben',
  'finanzierung',
  'dauer',
  'mensch',
] as const
export type Absicht = (typeof ABSICHTEN)[number]

/**
 * Schlüsselwörter je Absicht.
 *
 * Bewusst großzügig und in Alltagssprache: „Was muss ich noch machen",
 * „wie weit bin ich", „was fehlt" meinen dasselbe. Reihenfolge zählt —
 * die erste passende Absicht gewinnt, deshalb stehen die spezifischen
 * oben.
 */
const MUSTER: ReadonlyArray<{ absicht: Absicht; woerter: readonly RegExp[] }> = [
  {
    // ── STEHT GANZ OBEN, UND ZWAR MIT ABSICHT ────────────────────────
    // „Bekomme ich Pflegegrad 3?" enthaelt das Wort Pflegegrad und waere
    // sonst als Frage nach dem FUNDORT beantwortet worden — eine
    // hoefliche Nicht-Antwort auf eine Frage, die niemand hier
    // beantworten darf. Anspruchsfragen bekommen deshalb eine eigene,
    // ausdrueckliche Absage, bevor irgendein Stichwort greift.
    absicht: 'anspruch',
    woerter: [
      /\bbekomme? ich\b/i, /\bkrieg(e)? ich\b/i, /\bsteht mir\b/i,
      /\bhabe ich (einen )?anspruch\b/i, /\bwerde ich\b.*\b(genommen|eingestellt|angenommen)\b/i,
      /\bwird (das |es )?(genehmigt|bewilligt|übernommen|uebernommen)\b/i,
      /\bzahlt (die |meine )?(kasse|pflegekasse)\b/i,
      /\bbin ich berechtigt\b/i, /\bkomme ich in frage\b/i,
    ],
  },
  {
    absicht: 'als_engel_bewerben',
    woerter: [/\bengel\b.*\b(werden|bewerb)/i, /\bbewerb\w*\b/i, /\barbeiten\b.*\b(bei|für) euch\b/i,
      /\bjob\b/i, /\bstelle\b/i, /\bmitarbeit/i],
  },
  {
    absicht: 'pflegegrad_finden',
    woerter: [/pflegegrad/i, /\bpflegestufe\b/i, /\bbescheid\b/i, /\beinstufung\b/i],
  },
  {
    absicht: 'dokument_status',
    woerter: [/\b(dokument|unterlage|nachweis|führungszeugnis|fuehrungszeugnis|lebenslauf|zeugnis)\w*\b/i,
      /\bhochgeladen\b/i, /\bangekommen\b/i, /\berhalten\b/i],
  },
  {
    absicht: 'leistung_waehlen',
    woerter: [/\beinkauf/i, /\bhaushalt/i, /\bputzen\b/i, /\bwäsche\b|\bwaesche\b/i,
      /\bbegleit/i, /\barzt\b/i, /\bspaziergang|spazieren\b/i, /\bgesellschaft\b/i,
      /\bdemenz\b/i, /\bhilfe beim\b/i, /\bunterstützung bei\b|\bunterstuetzung bei\b/i],
  },
  {
    absicht: 'finanzierung',
    // „kostet", „zahlt", „bezahle" — Flexionsformen, nicht nur die
    // Grundform. `\bkosten\b` traf „Was kostet das?" nicht.
    woerter: [/\bkost(en|et)\b/i, /\bbezahl\w*/i, /\bpreis\w*/i, /\bteuer\b/i,
      /\bzahl\w*/i, /\bentlastungsbetrag\b/i, /\bkasse\b/i, /\bgeld\b/i,
      /\bfinanzier\w*/i],
  },
  {
    absicht: 'offene_schritte',
    woerter: [/\bwas\b.*\b(noch|fehlt|machen|tun)\b/i, /\bwie weit\b/i, /\boffen\b/i,
      /\bfehlt\b/i, /\bnächste[rn]?\b|\bnaechste[rn]?\b/i, /\bweiter\b/i, /\bstand\b/i],
  },
  {
    absicht: 'dauer',
    woerter: [/\bwie lange\b/i, /\bdauer/i, /\bwann\b.*\b(fertig|antwort|meldet)\b/i],
  },
  {
    absicht: 'mensch',
    woerter: [/\bmensch\b/i, /\banrufen\b/i, /\btelefon/i, /\bsprechen\b/i,
      /\bmitarbeiter/i, /\bberatung\b/i, /\bpersönlich\b|\bpersoenlich\b/i],
  },
]

/** Erkennt die Absicht. `null`, wenn keine Regel greift — kein Raten. */
export function erkenneAbsicht(frage: string): Absicht | null {
  const text = String(frage ?? '').trim()
  if (!text) return null
  for (const eintrag of MUSTER) {
    if (eintrag.woerter.some(w => w.test(text))) return eintrag.absicht
  }
  return null
}

const MENSCH: Aktion = { art: 'mensch', label: 'Mit einem Menschen sprechen' }

/** Die Schritte, die noch nicht als erledigt vermerkt sind. */
export function offeneSchritte(lage: AssistentLage) {
  return schrittfolge(lage.typ)
    .map((schritt, index) => ({ schritt, nummer: index + 1 }))
    .filter(({ schritt }) => lage.schritteDaten[schritt.schluessel]?.status !== 'fertig')
}

function fehlendeKlartext(lage: AssistentLage): string[] {
  return lage.fehlendeAngaben.map(angabeText)
}

// ---------------------------------------------------------------------------
// Antworten
// ---------------------------------------------------------------------------

function antwortOffeneSchritte(lage: AssistentLage): Antwort {
  if (lage.abgeschlossenAm) {
    return {
      quelle: 'stand',
      text: 'Sie sind durch — es ist alles abgeschickt. Wir melden uns bei Ihnen; '
        + 'Sie müssen dafür nichts weiter tun.',
      aktionen: [MENSCH],
    }
  }

  const offen = offeneSchritte(lage)
  if (offen.length === 0) {
    return {
      quelle: 'stand',
      text: 'Alle Schritte sind ausgefüllt. Sie können den Ablauf jetzt abschicken.',
      aktionen: [
        { art: 'gehe_zu_schritt', schritt: lage.gesamtSchritte, label: 'Zum letzten Schritt' },
      ],
    }
  }

  const pflicht = offen.filter(o => !o.schritt.ueberspringbar)
  const freiwillig = offen.filter(o => o.schritt.ueberspringbar)

  const zeilen: string[] = []
  if (pflicht.length > 0) {
    zeilen.push('Das brauchen wir noch von Ihnen:')
    zeilen.push(...pflicht.map(o => `• ${o.schritt.titel}`))
  }
  if (freiwillig.length > 0) {
    zeilen.push('')
    zeilen.push('Freiwillig — Sie können es auch weglassen:')
    zeilen.push(...freiwillig.map(o => `• ${o.schritt.titel}`))
  }

  const fehlend = fehlendeKlartext(lage)
  if (fehlend.length > 0) {
    zeilen.push('')
    zeilen.push(`Einzelne Angaben fehlen noch: ${fehlend.join(', ')}.`)
  }

  const naechster = pflicht[0] ?? offen[0]
  return {
    quelle: 'stand',
    text: zeilen.join('\n'),
    aktionen: [
      { art: 'gehe_zu_schritt', schritt: naechster.nummer, label: `Weiter mit „${naechster.schritt.titel}"` },
      MENSCH,
    ],
  }
}

function antwortPflegegrad(lage: AssistentLage): Antwort {
  // ── KEINE AUSSAGE ÜBER DEN GRAD SELBST ──────────────────────────────
  // Was jemand angegeben hat, steht im Stand; ob es stimmt oder was ihm
  // zusteht, entscheidet die Pflegekasse. Der Assistent sagt deshalb
  // nur, WO die Angabe zu finden ist.
  const text = [
    'Ihren Pflegegrad finden Sie auf dem Bescheid Ihrer Pflegekasse — das ist '
    + 'der Brief, mit dem der Grad festgestellt wurde. Er steht meist auf der '
    + 'ersten Seite.',
    '',
    'Wenn Sie den Brief nicht finden: Ihre Pflegekasse nennt Ihnen den Grad auch '
    + 'am Telefon. Die Nummer steht auf Ihrer Versichertenkarte.',
    '',
    'Sie müssen den Grad hier nicht angeben, um weiterzumachen — „Weiß ich nicht" '
    + 'ist eine gültige Antwort, und wir klären das gemeinsam.',
  ].join('\n')

  const schritt = schrittfolge(lage.typ)
    .findIndex(s => s.schluessel === 'pflegegrad')

  const aktionen: Aktion[] = []
  if (schritt >= 0) {
    aktionen.push({ art: 'gehe_zu_schritt', schritt: schritt + 1, label: 'Zur Frage nach dem Pflegegrad' })
  }
  aktionen.push({ art: 'hochladen', dokumentArt: 'pflegegradbescheid', label: 'Bescheid hochladen' })
  aktionen.push(MENSCH)

  return { quelle: 'wissen', text, aktionen }
}

function antwortDokumente(lage: AssistentLage): Antwort {
  const vermerkt = Object.keys(lage.dokumentStatus ?? {})

  // ── ABWESENHEIT IST KEINE AUSSAGE ───────────────────────────────────
  // „Nichts vermerkt" heißt nicht „nicht angekommen": per Post oder
  // E-Mail zugesandte Unterlagen tauchen in diesem Ablauf nicht auf.
  // Das steht ausdrücklich dabei, damit niemand ein zweites Mal losläuft.
  const hinweis = 'Ich sehe nur, was in diesem Ablauf hochgeladen wurde. '
    + 'Unterlagen, die Sie uns per Post oder E-Mail geschickt haben, '
    + 'erscheinen hier nicht — sie können trotzdem längst bei uns sein.'

  if (vermerkt.length === 0) {
    return {
      quelle: 'stand',
      text: `In Ihrem Ablauf ist bisher keine Unterlage vermerkt.\n\n${hinweis}`,
      aktionen: [MENSCH],
    }
  }

  return {
    quelle: 'stand',
    text: [
      'In Ihrem Ablauf sind diese Unterlagen vermerkt:',
      ...vermerkt.map(a => `• ${angabeText(a)}`),
      '',
      hinweis,
    ].join('\n'),
    aktionen: [MENSCH],
  }
}

function antwortLeistung(lage: AssistentLage, frage: string): Antwort {
  if (lage.typ !== 'kunde') {
    return {
      quelle: 'wissen',
      text: 'Diese Auswahl gehört zur Anfrage für Unterstützung im Alltag. '
        + 'Sie sind gerade in einem anderen Ablauf.',
      aktionen: [{ art: 'oeffne_ablauf', typ: 'kunde', label: 'Unterstützung anfragen' }, MENSCH],
    }
  }

  const treffer = leistungAusFrage(frage)
  const nummer = schrittfolge('kunde').findIndex(s => s.schluessel === 'bedarf') + 1

  const aktionen: Aktion[] = []
  if (treffer) {
    aktionen.push({ art: 'waehle_leistung', wert: treffer.wert, label: `„${treffer.label}" auswählen` })
  }
  if (nummer > 0) {
    aktionen.push({ art: 'gehe_zu_schritt', schritt: nummer, label: 'Zur Auswahl der Unterstützung' })
  }
  aktionen.push(MENSCH)

  return {
    quelle: 'wissen',
    text: treffer
      ? `Das können wir übernehmen. Ich habe „${treffer.label}" für Sie herausgesucht — `
        + 'Sie können die Auswahl im nächsten Schritt noch ändern oder ergänzen.'
      : 'Sagen Sie uns im Schritt „Womit können wir helfen?", was Sie brauchen. '
        + 'Sie können mehrere Punkte auswählen und alles später ändern.',
    aktionen,
  }
}

/**
 * Ordnet eine Alltagsformulierung einer Leistung zu.
 * Die Werte sind kanonische Tarif-Schlüssel — dieselben wie im Wizard.
 */
const LEISTUNGS_MUSTER: ReadonlyArray<{ muster: RegExp; wert: string; label: string }> = [
  { muster: /\beinkauf|besorgung|apotheke\b/i, wert: 'einkaufsservice', label: 'Einkaufen und Besorgungen' },
  { muster: /\bhaushalt|putzen|wäsche|waesche|aufräumen|aufraeumen\b/i, wert: 'hauswirtschaft', label: 'Haushalt und Wäsche' },
  { muster: /\barzt|behörde|behoerde|termin|begleit/i, wert: 'begleitservice', label: 'Begleitung zu Terminen' },
  { muster: /\bspazier|ausflug|draußen|draussen\b/i, wert: 'alltagsbegleitung', label: 'Spaziergänge und Ausflüge' },
  { muster: /\bgesellschaft|vorlesen|reden|einsam/i, wert: 'betreuung_45a', label: 'Gesellschaft und Gespräche' },
  { muster: /\bdemenz|alzheimer\b/i, wert: 'demenzbetreuung', label: 'Betreuung bei Demenz' },
]

export function leistungAusFrage(frage: string): { wert: string; label: string } | null {
  const text = String(frage ?? '')
  for (const eintrag of LEISTUNGS_MUSTER) {
    if (eintrag.muster.test(text)) return { wert: eintrag.wert, label: eintrag.label }
  }
  return null
}

function antwortBewerben(lage: AssistentLage): Antwort {
  if (lage.typ === 'bewerber') {
    return {
      quelle: 'stand',
      text: 'Sie sind bereits in der Bewerbung. Ich kann Ihnen sagen, was noch offen ist — '
        + 'fragen Sie einfach „Was muss ich noch machen?".',
      aktionen: [
        { art: 'gehe_zu_schritt', schritt: lage.aktuellerSchritt, label: 'Weiter mit der Bewerbung' },
        MENSCH,
      ],
    }
  }
  return {
    quelle: 'wissen',
    text: 'Gern — als Alltagsbegleiterin oder Alltagsbegleiter unterstützen Sie Menschen '
      + 'in ihrem Zuhause. Eine Ausbildung ist nicht nötig. Das Ausfüllen dauert etwa '
      + 'fünf Minuten, und Sie können jederzeit pausieren.',
    aktionen: [
      { art: 'oeffne_ablauf', typ: 'bewerber', label: 'Bewerbung starten' },
      MENSCH,
    ],
  }
}

function antwortFinanzierung(lage: AssistentLage): Antwort {
  // Bewusst KEINE Beträge im Text: der Assistent verweist auf den Schritt,
  // der sie aus den gesetzlichen Werten holt. Eine hier abgeschriebene Zahl
  // wäre beim nächsten Rechtsstand falsch.
  const nummer = schrittfolge(lage.typ).findIndex(s => s.schluessel === 'finanzierung') + 1
  const aktionen: Aktion[] = []
  if (nummer > 0) {
    aktionen.push({ art: 'gehe_zu_schritt', schritt: nummer, label: 'Finanzierung ansehen' })
  }
  aktionen.push(MENSCH)

  return {
    quelle: 'wissen',
    text: 'Es gibt mehrere Wege: Leistungen der Pflegekasse oder private Abrechnung. '
      + 'Welcher für Sie in Frage kommt, hängt vom Pflegegrad ab — das entscheidet die '
      + 'Pflegekasse, nicht wir. Im Schritt zur Finanzierung sind alle Möglichkeiten '
      + 'mit den aktuellen Beträgen erklärt. Ihre Anfrage ist in jedem Fall '
      + 'unverbindlich und kostenfrei.',
    aktionen,
  }
}

function antwortDauer(): Antwort {
  return {
    quelle: 'wissen',
    text: 'Das Ausfüllen dauert wenige Minuten, und Sie können jederzeit pausieren — '
      + 'Ihre Angaben bleiben gespeichert.\n\n'
      + 'Wie schnell wir uns danach melden, hängt davon ab, wie viel gerade zu tun ist. '
      + 'Ein festes Versprechen kann ich Ihnen dazu nicht geben.',
    aktionen: [MENSCH],
  }
}

/**
 * Fragen nach einem Anspruch, einer Genehmigung oder einer Zusage.
 *
 * Die einzige zulaessige Antwort ist: ich kann das nicht beurteilen.
 * Ob ein Pflegegrad zusteht, entscheidet die Pflegekasse; ob eine
 * Bewerbung angenommen wird, entscheiden Menschen. Eine freundliche
 * Vermutung waere hier keine Hilfe, sondern eine Zusage, die niemand
 * gegeben hat — und auf die sich jemand verlassen wuerde.
 */
function antwortAnspruch(): Antwort {
  return {
    quelle: 'keine',
    text: 'Das kann ich Ihnen nicht beantworten — und ich moechte Ihnen dazu '
      + 'auch nichts vermuten.\n\n'
      + 'Ueber Pflegegrad und Kostenuebernahme entscheidet Ihre Pflegekasse, '
      + 'nicht wir. Ueber eine Bewerbung entscheiden Menschen bei uns, nachdem '
      + 'sie Ihre Angaben gelesen haben.\n\n'
      + 'Am besten sprechen Sie mit einer Kollegin oder einem Kollegen — '
      + 'die koennen Ihre Lage einschaetzen.',
    aktionen: [MENSCH],
  }
}

function antwortMensch(): Antwort {
  return {
    quelle: 'wissen',
    text: 'Sehr gern. Wir rufen Sie zurück oder Sie erreichen uns direkt — '
      + 'sagen Sie uns einfach, was Ihnen lieber ist.',
    aktionen: [MENSCH],
  }
}

/**
 * Die Antwort auf eine Frage.
 *
 * Fail-closed: greift keine Regel, wird NICHT geraten. Der Assistent sagt,
 * dass er es nicht weiß, und reicht an Menschen weiter. Eine erfundene
 * Auskunft über einen Anspruch oder einen Bearbeitungsstand richtet mehr
 * Schaden an als ein ehrliches „das kann ich nicht beantworten".
 */
export function beantworte(frage: string, lage: AssistentLage): Antwort {
  const absicht = erkenneAbsicht(frage)

  switch (absicht) {
    case 'anspruch': return antwortAnspruch()
    case 'offene_schritte': return antwortOffeneSchritte(lage)
    case 'pflegegrad_finden': return antwortPflegegrad(lage)
    case 'dokument_status': return antwortDokumente(lage)
    case 'leistung_waehlen': return antwortLeistung(lage, frage)
    case 'als_engel_bewerben': return antwortBewerben(lage)
    case 'finanzierung': return antwortFinanzierung(lage)
    case 'dauer': return antwortDauer()
    case 'mensch': return antwortMensch()
    default:
      return {
        quelle: 'keine',
        text: 'Das kann ich Ihnen leider nicht beantworten — ich möchte Ihnen nichts '
          + 'Falsches sagen. Eine Kollegin oder ein Kollege hilft Ihnen gern weiter.',
        aktionen: [MENSCH],
      }
  }
}

/** Vorschläge, die als Knöpfe unter dem Eingabefeld stehen. */
export function vorschlaege(lage: AssistentLage): string[] {
  const gemeinsam = ['Was muss ich noch machen?', 'Ich möchte mit jemandem sprechen']
  if (lage.typ === 'kunde') {
    return ['Was muss ich noch machen?', 'Ich finde meinen Pflegegrad nicht',
      'Ich möchte Hilfe beim Einkaufen', 'Was kostet das?']
  }
  if (lage.typ === 'bewerber') {
    return ['Was muss ich noch machen?', 'Welche Unterlagen brauchen Sie?',
      'Wie lange dauert das?', ...gemeinsam.slice(1)]
  }
  return gemeinsam
}
