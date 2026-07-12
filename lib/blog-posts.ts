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
    headline: 'Was kostet Alltagsbegleitung? Kosten, Finanzierung & Tipps',
    description:
      'Was kostet Alltagsbegleitung? Stundensätze von 25–45€, Finanzierung über den Entlastungsbetrag (131€/Monat) und Tipps zur Kostenübernahme. Jetzt informieren!',
    category: 'Alltagsbegleitung',
    datePublished: '2026-06-06',
    dateModified: '2026-06-06',
    readTimeMin: 8,
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
    headline: 'Pflegebox kostenlos bestellen — 42€/Monat von der Pflegekasse',
    description:
      'Pflegebox kostenlos bestellen: Bis zu 42 € monatlich für Pflegehilfsmittel von der Pflegekasse. 0 € Eigenanteil. Jetzt kostenlos bestellen.',
    category: 'Services',
    datePublished: '2026-06-04',
    dateModified: '2026-06-04',
    readTimeMin: 4,
  },
  {
    slug: 'entlastungsbetrag-beantragen',
    headline: 'Entlastungsbetrag beantragen: Schritt-für-Schritt Anleitung 2026',
    description:
      'Erfahren Sie, wie Sie den Entlastungsbetrag nach § 45b beantragen. Anleitung mit allen Dokumenten und Tipps für die schnelle Genehmigung – jetzt lesen.',
    category: 'Finanzierung',
    datePublished: '2026-04-12',
    dateModified: '2026-04-12',
    readTimeMin: 5,
  },
  {
    slug: 'krankenfahrt-kostenuebernahme',
    headline: 'Krankenfahrt: Wann zahlt die Krankenkasse?',
    description:
      'Wann zahlt die Krankenkasse Ihre Krankenfahrt? Voraussetzungen, Zuzahlung und Antrag einfach erklärt – jetzt informieren und Fahrt sicher planen.',
    category: 'Services',
    datePublished: '2026-04-10',
    dateModified: '2026-04-10',
    readTimeMin: 6,
  },
  {
    slug: 'alltagsbegleiter-werden',
    headline: 'Alltagsbegleiter werden: Verdienst, Voraussetzungen & Bewerbung',
    description:
      'Alles über den Beruf des Alltagsbegleiters: Verdienst von ca. 20 €/Stunde, Voraussetzungen und Bewerbung. Jetzt bei Alltagsengel als Helfer starten.',
    category: 'Karriere',
    datePublished: '2026-04-08',
    dateModified: '2026-04-08',
    readTimeMin: 7,
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
    headline: 'Pflegegrad beantragen: So bekommen Sie den richtigen Pflegegrad',
    description:
      'Pflegegrad beantragen: Anleitung mit MDK-Vorbereitung, Tipps zur Begutachtung und Widerspruch. Jetzt lesen und Antrag erfolgreich stellen.',
    category: 'Pflegegrad',
    datePublished: '2026-04-03',
    dateModified: '2026-04-03',
    readTimeMin: 8,
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
    headline: 'Verhinderungspflege beantragen: 3.539€ pro Jahr nutzen',
    description:
      'Verhinderungspflege beantragen: bis zu 3.539 € pro Jahr für Ersatzpflege. So stellen Sie den Antrag bei der Pflegekasse – jetzt Anspruch sichern.',
    category: 'Finanzierung',
    datePublished: '2026-03-15',
    dateModified: '2026-07-08',
    readTimeMin: 5,
  },
]

export function getBlogPost(slug: string): BlogPostMeta | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug)
}
