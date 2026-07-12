/**
 * Zentrale Blog-Post-Metadaten — Quelle für:
 *   - app/blog/page.tsx (Index-Karten)
 *   - components/RelatedPosts.tsx (Weiterlesen-Sektion)
 *
 * NICHT mehr konsumiert von app/sitemap.ts oder BlogPostJsonLd (gelöscht).
 *
 * Regeln: headline MUSS exakt der <h1> des Posts entsprechen,
 * datePublished dem sichtbaren Byline-Datum (ISO 8601).
 * Keine Werbesprache hier rein — description = Meta-Description der Seite.
 */

export interface BlogPostMeta {
  slug: string
  headline: string
  description: string
  category: string
  datePublished: string // ISO
  dateModified?: string // ISO, optional
  readTimeMin: number
}

export const BLOG_POSTS: BlogPostMeta[] = [
  {
    slug: 'was-ist-alltagsbegleitung',
    headline: 'Was ist Alltagsbegleitung? Der komplette Guide 2026',
    description:
      'Was ist Alltagsbegleitung? Definition, Aufgaben, Kosten & Anspruch einfach erklärt. Plus: Alltagsbegleitung beantragen und über 131 €/Monat (§45b) finanzieren.',
    category: 'Alltagsbegleitung',
    datePublished: '2026-07-12',
    dateModified: '2026-07-12',
    readTimeMin: 12,
  },
  {
    slug: 'alltagsbegleitung-demenz',
    headline: 'Alltagsbegleitung für Demenz-Patienten: Struktur, Entlastung & Finanzierung',
    description:
      'Alltagsbegleitung bei Demenz: Wie geschulte Begleiter Struktur, Aktivierung und Entlastung bringen — Aufgaben, Kosten und Finanzierung über 131 €/Monat (§45b).',
    category: 'Alltagsbegleitung',
    datePublished: '2026-07-12',
    dateModified: '2026-07-12',
    readTimeMin: 11,
  },
  {
    slug: 'alltagsbegleitung-psychische-erkrankungen',
    headline: 'Alltagsbegleitung bei psychischen Erkrankungen: Halt im Alltag',
    description:
      'Alltagsbegleitung bei Depression, Angststörung & Co.: Was Begleiter leisten, wo die Grenzen zur Therapie liegen und wie die Pflegekasse mit 131 €/Monat zahlt.',
    category: 'Alltagsbegleitung',
    datePublished: '2026-07-12',
    dateModified: '2026-07-12',
    readTimeMin: 11,
  },
  {
    slug: 'alltagsbegleitung-vs-pflegedienst',
    headline: 'Alltagsbegleitung vs. Pflegedienst — Was ist der Unterschied?',
    description:
      'Alltagsbegleitung oder Pflegedienst? Aufgaben, Kosten und Finanzierung im Vergleich — wann Sie was brauchen und wie sich beide Leistungen kombinieren lassen.',
    category: 'Alltagsbegleitung',
    datePublished: '2026-07-12',
    dateModified: '2026-07-12',
    readTimeMin: 8,
  },
  {
    slug: 'tipps-fuer-pflegende-angehoerige',
    headline: '10 Tipps für Angehörige von Pflegebedürftigen',
    description:
      '10 praktische Tipps für pflegende Angehörige: Entlastungsbetrag 131 €/Monat, Verhinderungspflege, Pflegebox, Selbstfürsorge und rechtliche Vorsorge.',
    category: 'Ratgeber',
    datePublished: '2026-07-12',
    dateModified: '2026-07-12',
    readTimeMin: 9,
  },
  {
    slug: 'demenzbetreuung-zu-hause',
    headline: 'Demenzbetreuung zu Hause — Unterstützung für Familien',
    description:
      'Demenzbetreuung zu Hause: Wie Familien den Alltag mit Demenz meistern — Tipps zu Kommunikation, Alltagsstruktur und Finanzierung über 131 € Entlastungsbetrag.',
    category: 'Ratgeber',
    datePublished: '2026-07-12',
    dateModified: '2026-07-12',
    readTimeMin: 10,
  },
  {
    slug: 'kurzzeitpflege-verhinderungspflege-kombinieren',
    headline: 'Kurzzeitpflege und Verhinderungspflege kombinieren — So sparen Sie',
    description:
      'Kurzzeitpflege und Verhinderungspflege kombinieren: Seit 01.07.2025 gilt der gemeinsame Jahresbetrag von 3.539 €. So teilen Sie das Budget klug auf.',
    category: 'Finanzierung',
    datePublished: '2026-07-12',
    dateModified: '2026-07-12',
    readTimeMin: 9,
  },
  {
    slug: 'pflegebox-bestellen-anleitung',
    headline: 'Pflegebox bestellen — Komplettanleitung 2026',
    description:
      'Pflegebox bestellen in 5 Schritten: Anspruch prüfen, Anbieter wählen, Antrag stellen, Genehmigung, Lieferung. Mit Checkliste, Fristen und typischen Fehlern.',
    category: 'Services',
    datePublished: '2026-07-12',
    dateModified: '2026-07-12',
    readTimeMin: 9,
  },
  {
    slug: 'welche-pflegehilfsmittel-stehen-mir-zu',
    headline: 'Welche Pflegehilfsmittel stehen mir zu?',
    description:
      'Pflegehilfsmittel im Überblick: 42 €/Monat zum Verbrauch (§40 SGB XI), technische Hilfsmittel wie Pflegebett & Hausnotruf, Zuständigkeit Pflegekasse vs. Krankenkasse.',
    category: 'Services',
    datePublished: '2026-07-12',
    dateModified: '2026-07-12',
    readTimeMin: 8,
  },
  {
    slug: 'krankenfahrt-beantragen',
    headline: 'Krankenfahrt beantragen: Schritt-für-Schritt-Anleitung',
    description:
      'Krankenfahrt beantragen leicht gemacht: Muster-4-Verordnung vom Arzt, Genehmigung der Krankenkasse, Fahrt buchen. Schritt-für-Schritt-Anleitung 2026.',
    category: 'Services',
    datePublished: '2026-07-12',
    dateModified: '2026-07-12',
    readTimeMin: 7,
  },
  {
    slug: 'zuzahlung-krankenfahrt',
    headline: 'Zuzahlung Krankenfahrt — was muss ich zahlen?',
    description:
      'Zuzahlung bei Krankenfahrten: 10 % des Fahrpreises, mindestens 5 €, höchstens 10 € pro Fahrt. Mit Beispielrechnungen, Belastungsgrenze und Befreiung.',
    category: 'Services',
    datePublished: '2026-07-12',
    dateModified: '2026-07-12',
    readTimeMin: 6,
  },
  {
    slug: 'erfahrungsbericht-alltagsengel',
    headline: 'Erfahrungsbericht: Mein Alltag als Alltagsengel',
    description:
      'Wie sieht der Arbeitsalltag als Alltagsbegleiterin wirklich aus? Ein Tag zwischen Einkauf, Arztbegleitung und Kaffeeklatsch — ehrlich erzählt, mit allen Zahlen.',
    category: 'Karriere',
    datePublished: '2026-07-12',
    dateModified: '2026-07-12',
    readTimeMin: 6,
  },
  {
    slug: 'pflegereform-2027',
    headline: 'Pflegereform 2027: Was sich für Alltagsbegleitung & Entlastungsbetrag ändert',
    description:
      'Pflegereform 2027 (PNOG): Was für Entlastungsbetrag und Alltagsbegleitung geplant ist — und was Angehörige jetzt tun sollten. Verständlich erklärt.',
    category: 'Finanzierung',
    datePublished: '2026-07-02',
    dateModified: '2026-07-02',
    readTimeMin: 8,
  },
  {
    slug: 'senioren-hitze-sommer',
    headline: 'Senioren & Hitze: 7 Tipps, wie Sie Ihre Angehörigen im Sommer schützen',
    description:
      'Hitze ist für Senioren gefährlich: 7 praktische Tipps gegen Dehydration und Hitzschlag. Plus: Alltagsbegleitung für 131 €/Monat über die Pflegekasse sichern.',
    category: 'Ratgeber',
    datePublished: '2026-07-02',
    dateModified: '2026-07-02',
    readTimeMin: 7,
  },
  {
    slug: 'wer-zahlt-alltagsbegleitung',
    headline: 'Wer zahlt die Alltagsbegleitung?',
    description:
      'Wer zahlt die Alltagsbegleitung? Pflegekasse (131 € Entlastungsbetrag), Verhinderungspflege, Sozialamt oder privat — alle Finanzierungswege im Überblick.',
    category: 'Finanzierung',
    datePublished: '2026-07-02',
    dateModified: '2026-07-02',
    readTimeMin: 7,
  },
  {
    slug: 'alltagsbegleitung-kosten',
    headline: 'Was kostet Alltagsbegleitung? Preise & Finanzierung 2026',
    description:
      'Alltagsbegleitung kostet 25–45 €/Stunde. Alle Finanzierungswege 2026: Entlastungsbetrag 131 €/Monat, Verhinderungspflege 3.539 €/Jahr, Steuerbonus §35a.',
    category: 'Alltagsbegleitung',
    datePublished: '2026-06-06',
    dateModified: '2026-07-12',
    readTimeMin: 11,
  },
  {
    slug: 'entlastungsbetrag-nutzen',
    headline: 'Entlastungsbetrag richtig nutzen: So schöpfen Sie 131 € monatlich voll aus',
    description:
      'Entlastungsbetrag richtig nutzen: welche Leistungen abgedeckt sind, häufige Fehler vermeiden und die 131 €/Monat optimal einsetzen. Mit Checkliste.',
    category: 'Finanzierung',
    datePublished: '2026-06-06',
    dateModified: '2026-06-06',
    readTimeMin: 10,
  },
  {
    slug: 'entlastungsbetrag-rueckwirkend',
    headline: 'Entlastungsbetrag rückwirkend nutzen: Bis zu 3.144 € sichern',
    description:
      'Nicht genutzten Entlastungsbetrag rückwirkend einsetzen: Fristen, Beantragung und wie Sie bis zu 3.144€ aus 2 Jahren nachholen. Aktuell: 131€/Monat seit 2025.',
    category: 'Finanzierung',
    datePublished: '2026-06-06',
    dateModified: '2026-06-06',
    readTimeMin: 6,
  },
  {
    slug: 'krankenfahrt-verordnung-erhalten',
    headline: 'Krankenfahrt Verordnung: Wer bekommt sie & wie beantragen?',
    description:
      'Verordnung für Krankenfahrten erhalten: Anspruch bei Pflegegrad & Merkzeichen, Arztgespräch, Genehmigung der Kasse. Jetzt Schritt für Schritt informieren.',
    category: 'Services',
    datePublished: '2026-06-06',
    dateModified: '2026-06-06',
    readTimeMin: 7,
  },
  {
    slug: 'pflegegrad-1-leistungen',
    headline: 'Pflegegrad 1 Leistungen 2026: Was steht Ihnen zu?',
    description:
      'Alle Leistungen bei Pflegegrad 1: Entlastungsbetrag 131€, Pflegehilfsmittel 42€, Wohnraumanpassung, Beratung. Was die Pflegekasse wirklich zahlt.',
    category: 'Pflegegrad',
    datePublished: '2026-06-06',
    dateModified: '2026-06-06',
    readTimeMin: 8,
  },
  {
    slug: 'seniorenbetreuung-frankfurt',
    headline: 'Seniorenbetreuung in Frankfurt: Angebote, Kosten & Anbieter',
    description:
      'Seniorenbetreuung in Frankfurt: Angebote, Kosten & Anbieter im Überblick — von Alltagsbegleitung bis Demenzbetreuung. Jetzt passende Betreuung finden!',
    category: 'Alltagsbegleitung',
    datePublished: '2026-06-06',
    dateModified: '2026-07-08',
    readTimeMin: 9,
  },
  {
    slug: 'haushaltshilfe-frankfurt',
    headline: 'Haushaltshilfe Frankfurt — Jetzt über die Pflegekasse buchen',
    description:
      'Haushaltshilfe in Frankfurt am Main und Rhein-Main-Gebiet: Einkaufen, Kochen, Putzen, Begleitung. Kostenübernahme über Pflegekasse möglich. Jetzt buchen.',
    category: 'Alltagsbegleitung',
    datePublished: '2026-06-04',
    dateModified: '2026-06-04',
    readTimeMin: 6,
  },
  {
    slug: 'krankenfahrt-buchen-frankfurt',
    headline: 'Krankenfahrt buchen Frankfurt — Fahrt zum Arzt über die Krankenkasse',
    description:
      'Krankenfahrt in Frankfurt buchen: Fahrten zu Arzt, Klinik, Dialyse und Therapie. Mit Verordnung über die Krankenkasse abrechenbar. Jetzt in der App buchen.',
    category: 'Services',
    datePublished: '2026-06-04',
    dateModified: '2026-06-04',
    readTimeMin: 5,
  },
  {
    slug: 'pflegebox-kostenlos-bestellen',
    headline: 'Pflegebox kostenlos bestellen: Schritt-für-Schritt-Anleitung',
    description:
      'Pflegebox kostenlos bestellen — Schritt für Schritt: Anspruch bei Pflegegrad 1–5 prüfen, Antrag stellen, monatlich bis zu 42 € Pflegehilfsmittel erhalten.',
    category: 'Services',
    datePublished: '2026-06-04',
    dateModified: '2026-07-12',
    readTimeMin: 9,
  },
  {
    slug: 'entlastungsbetrag-beantragen',
    headline: 'Entlastungsbetrag 2026: Anspruch, Antrag & Nutzung (131 €/Monat)',
    description:
      'Entlastungsbetrag 2026: 131 €/Monat ab Pflegegrad 1 nach §45b SGB XI. Der Praxis-Guide zu Anspruch, Abrechnung, Fristen, Beispielrechnungen und Fehlern.',
    category: 'Finanzierung',
    datePublished: '2026-04-12',
    dateModified: '2026-07-12',
    readTimeMin: 10,
  },
  {
    slug: 'krankenfahrt-kostenuebernahme',
    headline: 'Krankenfahrt zum Arzt: Wann zahlt die Krankenkasse?',
    description:
      'Wann zahlt die Krankenkasse Ihre Krankenfahrt? §60 SGB V, Muster-4-Verordnung, Genehmigung und Zuzahlung ausführlich erklärt — mit Vergleichstabelle.',
    category: 'Services',
    datePublished: '2026-04-10',
    dateModified: '2026-07-12',
    readTimeMin: 9,
  },
  {
    slug: 'alltagsbegleiter-werden',
    headline: 'Alltagsbegleiter werden: Ausbildung, Gehalt & Voraussetzungen',
    description:
      'Alltagsbegleiter werden 2026: Qualifizierung nach §45a SGB XI, Gehalt von 18–24 €/Stunde, Voraussetzungen und Bewerbung — der komplette Weg in den Beruf.',
    category: 'Karriere',
    datePublished: '2026-04-08',
    dateModified: '2026-07-12',
    readTimeMin: 12,
  },
  {
    slug: 'nebenjob-pflege',
    headline: 'Nebenjob in der Pflege: Flexibel 20€/Stunde als Alltagsbegleiter',
    description:
      'Flexibler Nebenjob als Alltagsbegleiter: 18–22 € pro Stunde, freie Zeiteinteilung, keine Ausbildung nötig. Jetzt bei Alltagsengel als Helfer starten!',
    category: 'Karriere',
    datePublished: '2026-04-05',
    dateModified: '2026-04-05',
    readTimeMin: 6,
  },
  {
    slug: 'seniorenbetreuung-zu-hause',
    headline: 'Seniorenbetreuung zu Hause — Kosten, Möglichkeiten & Tipps',
    description:
      'Vollständiger Überblick über Seniorenbetreuung im eigenen Zuhause: Kosten, Betreuungsmodelle und Finanzierung durch die Pflegekasse. Jetzt informieren!',
    category: 'Ratgeber',
    datePublished: '2026-04-05',
    dateModified: '2026-04-05',
    readTimeMin: 7,
  },
  {
    slug: 'pflegegrad-beantragen',
    headline: 'Pflegegrad beantragen: Komplette Anleitung 2026',
    description:
      'Pflegegrad beantragen 2026: Antrag bei der Pflegekasse, MD-Begutachtung mit Punktesystem, Pflegetagebuch, Fristen und Widerspruch — die komplette Anleitung.',
    category: 'Pflegegrad',
    datePublished: '2026-04-03',
    dateModified: '2026-07-12',
    readTimeMin: 11,
  },
  {
    slug: 'alltagshilfe-senioren',
    headline: 'Alltagshilfe für Senioren: Was ist möglich und wer zahlt?',
    description:
      'Alltagshilfe für Senioren: Welche Hilfen es gibt, was sie kosten und wie Pflegekasse & Entlastungsbetrag (131 €/Monat) zahlen. Jetzt informieren!',
    category: 'Alltagsbegleitung',
    datePublished: '2026-04-01',
    dateModified: '2026-04-01',
    readTimeMin: 7,
  },
  {
    slug: 'einsamkeit-im-alter',
    headline: 'Einsamkeit im Alter: So helfen Alltagsbegleiter gegen Isolation',
    description:
      'Einsamkeit im Alter schadet der Gesundheit wie Rauchen. Erfahren Sie, wie Alltagsbegleiter helfen – über §45b oft ohne Zusatzkosten. Jetzt informieren.',
    category: 'Alltagsbegleitung',
    datePublished: '2026-04-01',
    dateModified: '2026-04-01',
    readTimeMin: 7,
  },
  {
    slug: 'pflege-app-vergleich',
    headline: 'Pflege-App Vergleich 2026: Die besten Apps für Pflegebedürftige',
    description:
      'Welche Pflege-Apps gibt es? Vergleich der besten Angebote 2026 für Seniorenhilfe und Alltagsbegleitung. Jetzt informieren und passende Hilfe finden.',
    category: 'Ratgeber',
    datePublished: '2026-03-28',
    dateModified: '2026-03-28',
    readTimeMin: 8,
  },
  {
    slug: 'arztbegleitung-senioren',
    headline: 'Arztbegleitung für Senioren: Sicher zum Termin und zurück',
    description:
      'Arztbegleitung für Senioren: Was ein Begleiter beim Arzttermin übernimmt, was es kostet und wie die Pflegekasse zahlt. Jetzt Begleitung finden!',
    category: 'Alltagsbegleitung',
    datePublished: '2026-03-25',
    dateModified: '2026-03-25',
    readTimeMin: 5,
  },
  {
    slug: 'einkaufshilfe-senioren',
    headline: 'Einkaufshilfe für Senioren: So klappt der Einkauf mit Begleitung',
    description:
      'Einkaufshilfe für Senioren: So funktionieren Begleitdienste, was sie kosten und wie Sie über den Entlastungsbetrag (131 €/Monat) kostenfrei buchen.',
    category: 'Alltagsbegleitung',
    datePublished: '2026-03-20',
    dateModified: '2026-03-20',
    readTimeMin: 6,
  },
  {
    slug: 'alltagsbegleitung-frankfurt',
    headline: 'Alltagsbegleitung in Frankfurt — Zertifizierte Alltagsbegleiter finden',
    description:
      'Finden Sie zertifizierte Alltagsbegleiter in Frankfurt. §45a qualifiziert, versichert & abrechenbar über §45b. Schnell, diskret, professionell.',
    category: 'Alltagsbegleitung',
    datePublished: '2026-03-19',
    dateModified: '2026-03-19',
    readTimeMin: 7,
  },
  {
    slug: 'entlastungsbetrag-45b',
    headline: 'Entlastungsbetrag §45b SGB XI — 131€/Monat für Alltagsbegleitung',
    description:
      'Erfahren Sie wie Sie den Entlastungsbetrag nach §45b SGB XI nutzen können. 131€ monatlich für zertifizierte Alltagsbegleitung. Abrechnung mit der Pflegekasse.',
    category: 'Finanzierung',
    datePublished: '2026-03-19',
    dateModified: '2026-03-19',
    readTimeMin: 6,
  },
  {
    slug: 'pflegehilfsmittel-40-euro',
    headline: 'Pflegehilfsmittel: 42€/Monat kostenlos — Hygienebox bestellen',
    description:
      'Pflegehilfsmittel kostenlos: Bis zu 42 € monatlich von der Pflegekasse (§40 SGB XI). Hygienebox mit Windeln & Bettschutz — jetzt bestellen.',
    category: 'Services',
    datePublished: '2026-03-19',
    dateModified: '2026-03-19',
    readTimeMin: 5,
  },
  {
    slug: 'verhinderungspflege-beantragen',
    headline: "Verhinderungspflege beantragen: So geht's richtig",
    description:
      'Verhinderungspflege beantragen: Formular, Nachweise, Fristen und Beispielrechnung. Schritt für Schritt zur Erstattung – bis zu 3.539 € pro Jahr sichern.',
    category: 'Finanzierung',
    datePublished: '2026-03-15',
    dateModified: '2026-07-12',
    readTimeMin: 10,
  },
]

export function getBlogPost(slug: string): BlogPostMeta | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug)
}
