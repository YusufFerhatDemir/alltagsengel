// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Rechtstexte und ihre Fassungen
//
// WARUM ZENTRAL: Die Widerrufsbelehrung muss an drei Stellen wortgleich
// erscheinen — auf der Bestellseite, in der Bestellbestätigung per Mail
// und auf der Widerrufsseite. Stünde sie dreimal getrennt da, wiche sie
// nach der ersten Korrektur voneinander ab; welche Fassung dann gilt,
// wäre im Streitfall nicht mehr feststellbar.
//
// VERSIONIERUNG: Bei jeder Bestellung wird die geltende Fassung in
// coach_bestellungen.widerrufsbelehrung_version festgehalten. Ändert
// sich der Text, wird hier die Version erhöht — bestehende Bestellungen
// behalten nachweisbar ihre Fassung.
//
// ═══ RECHTLICHE PRÜFUNG STEHT AUS ══════════════════════════════
// Die Texte unten sind eine sorgfältig erstellte VORLAGE, keine
// Rechtsberatung und keine anwaltlich geprüfte Fassung. Die
// Widerrufsbelehrung folgt dem gesetzlichen Muster der Anlage 1 zu
// Art. 246a § 1 Abs. 2 EGBGB; die AGB sind an den Regelfall eines
// digitalen Abo-Dienstes angelehnt. Vor dem Verkaufsstart müssen beide
// juristisch gegengelesen werden — das ist Teil derselben Freigabe wie
// die Preisentscheidung (siehe lib/coach/pricing.ts).
// ═══════════════════════════════════════════════════════════════

import { COACH_SUPPORT_EMAIL } from './version'

/** Fassung der Widerrufsbelehrung. Bei Textänderung erhöhen. */
export const WIDERRUFSBELEHRUNG_VERSION = '1.0'

/** Fassung der AGB. Bei Textänderung erhöhen. */
export const AGB_VERSION = '1.0'

export const RECHTSTEXTE_STAND = '2026-08-14'

/** Anschrift für Widerrufserklärungen — identisch zum Impressum. */
export const WIDERRUF_ANSCHRIFT = {
  name: 'Alltagsengel UG (haftungsbeschränkt)',
  zusatz: 'Digitaler PflegeCoach',
  strasse: 'Neue Mainzer Straße 66-68',
  ort: '60311 Frankfurt am Main',
  email: COACH_SUPPORT_EMAIL,
} as const

/**
 * Widerrufsbelehrung nach dem gesetzlichen Muster.
 *
 * Als Absatz-Array statt als ein Block: So kann die Seite es als
 * <p>-Folge rendern und die E-Mail-Vorlage dasselbe tun, ohne dass
 * jemand HTML in einen Konstanten-String schreiben muss.
 */
export const WIDERRUFSBELEHRUNG: { titel: string; absaetze: string[] }[] = [
  {
    titel: 'Widerrufsrecht',
    absaetze: [
      'Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.',
      'Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsschlusses.',
      `Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (${WIDERRUF_ANSCHRIFT.name}, ${WIDERRUF_ANSCHRIFT.zusatz}, ${WIDERRUF_ANSCHRIFT.strasse}, ${WIDERRUF_ANSCHRIFT.ort}, E-Mail: ${WIDERRUF_ANSCHRIFT.email}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.`,
      'Sie können den Widerruf außerdem jederzeit selbst in Ihrem Konto unter „Konto und Nutzung beenden" erklären. Er wirkt dann sofort.',
      'Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.',
    ],
  },
  {
    titel: 'Folgen des Widerrufs',
    absaetze: [
      'Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist.',
      'Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.',
      // Der zweite Halbsatz ist der Kern der Selbstverpflichtung: Wir
      // verlangen KEINEN Wertersatz, obwohl § 357 Abs. 8 BGB ihn unter
      // Voraussetzungen erlauben würde. Siehe lib/coach/bestellung.ts.
      'Wir verlangen für die Zeit bis zum Widerruf keinen Wertersatz. Sie erhalten den gezahlten Betrag vollständig zurück, auch wenn Sie den PflegeCoach in dieser Zeit genutzt haben.',
    ],
  },
]

/** Muster-Widerrufsformular nach Anlage 2 zu Art. 246a § 1 Abs. 2 EGBGB. */
export const MUSTER_WIDERRUFSFORMULAR = [
  '(Wenn Sie den Vertrag widerrufen wollen, füllen Sie bitte dieses Formular aus und senden Sie es zurück.)',
  '',
  `An ${WIDERRUF_ANSCHRIFT.name}, ${WIDERRUF_ANSCHRIFT.zusatz}, ${WIDERRUF_ANSCHRIFT.strasse}, ${WIDERRUF_ANSCHRIFT.ort}, E-Mail: ${WIDERRUF_ANSCHRIFT.email}:`,
  '',
  'Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über die Bereitstellung des Digitalen PflegeCoach:',
  '',
  'Bestellt am (*) / erhalten am (*): ______________________',
  'Name des/der Verbraucher(s): ______________________',
  'Anschrift des/der Verbraucher(s): ______________________',
  'Rechnungs- oder Bestellnummer (falls vorhanden): ______________________',
  '',
  'Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier): ______________________',
  'Datum: ______________________',
  '',
  '(*) Unzutreffendes streichen.',
].join('\n')

/**
 * AGB als strukturierte Abschnitte.
 *
 * Bewusst als Daten und nicht als JSX: So kann derselbe Text ohne
 * Doppelpflege auch in einen Export oder eine Mail wandern, und eine
 * Änderung ist im Diff als Textänderung sichtbar statt als Markup-Umbau.
 */
export interface AgbAbschnitt {
  nummer: string
  titel: string
  absaetze: string[]
}

export const AGB: AgbAbschnitt[] = [
  {
    nummer: '§ 1',
    titel: 'Geltungsbereich und Vertragspartner',
    absaetze: [
      'Diese Allgemeinen Geschäftsbedingungen gelten für die Nutzung des Digitalen PflegeCoach (nachfolgend „PflegeCoach") gegenüber Verbraucherinnen und Verbrauchern.',
      `Anbieterin ist die ${WIDERRUF_ANSCHRIFT.name}, ${WIDERRUF_ANSCHRIFT.strasse}, ${WIDERRUF_ANSCHRIFT.ort}, eingetragen im Handelsregister des Amtsgerichts Frankfurt am Main unter HRB 140351.`,
      'Abweichende Bedingungen der Nutzerin oder des Nutzers werden nicht Vertragsbestandteil, es sei denn, die Anbieterin stimmt ihrer Geltung ausdrücklich in Textform zu.',
    ],
  },
  {
    nummer: '§ 2',
    titel: 'Gegenstand der Leistung',
    absaetze: [
      'Der PflegeCoach ist ein digitales Unterstützungsangebot für die häusliche Pflege. Er stellt strukturierte Anleitungs-, Erinnerungs- und Dokumentationsfunktionen bereit: Pflegeassessment, Ziele, Aktivitäten, Wochenplan, Mobilitätsanleitungen, Wissensmodule und Belastungs-Check für pflegende Angehörige, Verlaufsdarstellung sowie einen druckbaren Verlaufsbericht.',
      'Der PflegeCoach ist ausdrücklich kein Medizinprodukt. Er dient nicht der Erkennung, Behandlung, Linderung oder Überwachung von Krankheiten, trifft keine diagnostischen oder therapeutischen Entscheidungen und gibt keine Therapieempfehlungen.',
      'Der PflegeCoach ersetzt weder ärztliche noch pflegefachliche Beratung und keinen Pflegedienst. In Notfällen ist der Rettungsdienst unter 112 zu verständigen.',
      'Der PflegeCoach ist keine Leistung der gesetzlichen Pflege- oder Krankenversicherung. Eine Abrechnung mit Pflege- oder Krankenkassen findet nicht statt; ein Erstattungsanspruch gegenüber einem Kostenträger besteht nicht. Die Nutzung erfolgt als privat zu zahlendes Angebot.',
    ],
  },
  {
    nummer: '§ 3',
    titel: 'Vertragsschluss',
    absaetze: [
      'Die Darstellung des PflegeCoach auf der Website stellt kein bindendes Angebot dar, sondern eine Aufforderung zur Abgabe eines Angebots.',
      'Mit dem Absenden der Bestellung gibt die Nutzerin oder der Nutzer ein verbindliches Angebot ab. Der Vertrag kommt zustande, sobald die Anbieterin die Bestellung per E-Mail bestätigt oder den Zugang freischaltet — je nachdem, was zuerst eintritt.',
      'Voraussetzung für die Nutzung ist ein Alltagsengel-Konto sowie die Einwilligung in die Verarbeitung der im PflegeCoach eingegebenen Pflege- und Gesundheitsdaten.',
    ],
  },
  {
    nummer: '§ 4',
    titel: 'Preise und Zahlung',
    absaetze: [
      'Es gelten die zum Zeitpunkt der Bestellung auf der Bestellseite angegebenen Preise. Alle Preise sind Endpreise für Verbraucherinnen und Verbraucher.',
      'Die Zahlung erfolgt über den Zahlungsdienstleister Stripe Payments Europe, Ltd. Die Anbieterin erhebt und speichert selbst keine Zahlungsmitteldaten.',
      'Das Entgelt ist für den jeweiligen Abrechnungszeitraum im Voraus fällig. Der Zugang wird nach erfolgreicher Zahlung freigeschaltet.',
      'Über jede Zahlung wird eine Rechnung ausgestellt, die im Konto abrufbar ist.',
    ],
  },
  {
    nummer: '§ 5',
    titel: 'Laufzeit, Verlängerung und Kündigung',
    absaetze: [
      'Der Vertrag läuft über den gewählten Abrechnungszeitraum und verlängert sich jeweils automatisch um denselben Zeitraum, solange er nicht gekündigt wird.',
      'Der Vertrag kann jederzeit ohne Einhaltung einer Frist zum Ende des jeweils laufenden, bereits bezahlten Abrechnungszeitraums gekündigt werden. Eine Mindestlaufzeit über den gewählten Abrechnungszeitraum hinaus besteht nicht.',
      'Die Kündigung ist jederzeit unmittelbar im Konto unter „Konto und Nutzung beenden" möglich; eine Begründung ist nicht erforderlich. Sie kann ebenso formlos per E-Mail erklärt werden.',
      'Der Zugang bleibt bis zum Ende des bezahlten Zeitraums bestehen. Eine anteilige Erstattung für den bereits bezahlten Zeitraum erfolgt nicht, da die Leistung bis dahin erbracht wird.',
      'Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt für beide Seiten unberührt.',
    ],
  },
  {
    nummer: '§ 6',
    titel: 'Widerrufsrecht',
    absaetze: [
      'Verbraucherinnen und Verbrauchern steht ein gesetzliches Widerrufsrecht von vierzehn Tagen zu. Einzelheiten regelt die Widerrufsbelehrung.',
      'Die Anbieterin verlangt bei Widerruf keinen Wertersatz für die bis dahin erfolgte Nutzung und holt bewusst keine Erklärung über ein vorzeitiges Erlöschen des Widerrufsrechts ein. Das Widerrufsrecht besteht damit während der gesamten Frist ungeschmälert fort, auch wenn der Zugang bereits genutzt wurde.',
    ],
  },
  {
    nummer: '§ 7',
    titel: 'Verfügbarkeit',
    absaetze: [
      'Die Anbieterin bemüht sich um eine möglichst durchgehende Verfügbarkeit des PflegeCoach, schuldet jedoch keine ununterbrochene Erreichbarkeit.',
      'Wartungsarbeiten werden nach Möglichkeit angekündigt und in nutzungsschwache Zeiten gelegt. Bei einer erheblichen, von der Anbieterin zu vertretenden Nichtverfügbarkeit über mehrere Tage wird das Entgelt für den betroffenen Zeitraum anteilig erstattet.',
    ],
  },
  {
    nummer: '§ 8',
    titel: 'Pflichten der Nutzerin oder des Nutzers',
    absaetze: [
      'Die Zugangsdaten sind vertraulich zu behandeln und nicht an Dritte weiterzugeben.',
      'Der PflegeCoach ist für die eigene Nutzung oder die Unterstützung einer angehörigen Person bestimmt. Eine gewerbliche Weitergabe oder Mehrfachnutzung eines Zugangs ist nicht gestattet.',
      'Für Einträge, die eine andere Person betreffen, ist deren Einverständnis erforderlich.',
    ],
  },
  {
    nummer: '§ 9',
    titel: 'Haftung',
    absaetze: [
      'Die Anbieterin haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei der Verletzung von Leben, Körper oder Gesundheit.',
      'Bei einfacher Fahrlässigkeit haftet die Anbieterin nur bei Verletzung einer wesentlichen Vertragspflicht, deren Erfüllung die ordnungsgemäße Durchführung des Vertrags überhaupt erst ermöglicht und auf deren Einhaltung vertraut werden darf; die Haftung ist in diesem Fall auf den vertragstypischen, vorhersehbaren Schaden begrenzt.',
      'Die Haftung nach dem Produkthaftungsgesetz bleibt unberührt.',
      'Da der PflegeCoach kein Medizinprodukt ist und keine medizinischen oder pflegefachlichen Entscheidungen trifft, ersetzt er keine fachliche Beurteilung. Für Entscheidungen, die allein auf Angaben im PflegeCoach gestützt werden, wird keine Haftung übernommen.',
    ],
  },
  {
    nummer: '§ 10',
    titel: 'Datenschutz',
    absaetze: [
      'Die Verarbeitung personenbezogener Daten richtet sich nach den Datenschutzhinweisen zum PflegeCoach.',
      'Die im PflegeCoach eingegebenen Pflege- und Gesundheitsdaten werden ausschließlich auf Grundlage einer ausdrücklichen Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO verarbeitet. Die Einwilligung ist jederzeit mit Wirkung für die Zukunft widerruflich.',
      'Die Daten können jederzeit selbst heruntergeladen (Art. 20 DSGVO) und selbst vollständig gelöscht werden (Art. 17 DSGVO).',
    ],
  },
  {
    nummer: '§ 11',
    titel: 'Änderungen dieser Bedingungen',
    absaetze: [
      'Änderungen dieser Bedingungen werden mindestens sechs Wochen vor ihrem Wirksamwerden in Textform mitgeteilt.',
      'Widerspricht die Nutzerin oder der Nutzer nicht bis zum Wirksamwerden, gelten die Änderungen als angenommen; auf diese Wirkung wird in der Mitteilung gesondert hingewiesen. Im Fall des Widerspruchs kann jede Seite den Vertrag zum Zeitpunkt des Wirksamwerdens kündigen.',
    ],
  },
  {
    nummer: '§ 12',
    titel: 'Streitbeilegung',
    absaetze: [
      'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung bereit.',
      'Die Anbieterin ist zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle weder bereit noch verpflichtet.',
    ],
  },
  {
    nummer: '§ 13',
    titel: 'Schlussbestimmungen',
    absaetze: [
      'Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Zwingende Verbraucherschutzvorschriften des Staates, in dem die Nutzerin oder der Nutzer ihren gewöhnlichen Aufenthalt hat, bleiben unberührt.',
      'Sollte eine Bestimmung dieser Bedingungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.',
    ],
  },
]
