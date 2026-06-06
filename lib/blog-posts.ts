/**
 * Zentrale Blog-Post-Metadaten — Quelle für:
 *   - app/sitemap.ts (Auto-Discovery + Datum)
 *   - components/BlogPostJsonLd (Article + Breadcrumb-Schema)
 *
 * datePublished als ISO-String. headline & description kommen 1:1 in
 * <h1>/<meta description>, also keine Werbesprache hier rein.
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
    slug: 'entlastungsbetrag-45b',
    headline: 'Entlastungsbetrag §45b SGB XI — 131€/Monat für Alltagsbegleitung',
    description:
      'Erfahren Sie wie Sie den Entlastungsbetrag nach §45b SGB XI nutzen. 131€ monatlich für zertifizierte Alltagsbegleitung — Abrechnung mit der Pflegekasse.',
    category: 'Finanzierung',
    datePublished: '2026-03-19',
    readTimeMin: 6,
  },
  {
    slug: 'entlastungsbetrag-beantragen',
    headline: 'Entlastungsbetrag beantragen — Schritt für Schritt',
    description:
      'So beantragen Sie den Entlastungsbetrag richtig. Vollständige Anleitung mit Tipps zur schnellen Bewilligung.',
    category: 'Finanzierung',
    datePublished: '2026-03-20',
    readTimeMin: 5,
  },
  {
    slug: 'pflegegrad-beantragen',
    headline: 'Pflegegrad beantragen — Antrag, MDK-Begutachtung & Tipps',
    description:
      'Alles zum Pflegegrad-Antrag: Antragstellung, MDK-Besuch und Einstufung verständlich erklärt.',
    category: 'Pflegegrad',
    datePublished: '2026-03-21',
    readTimeMin: 8,
  },
  {
    slug: 'verhinderungspflege-beantragen',
    headline: 'Verhinderungspflege beantragen — bis zu 1.612€/Jahr',
    description:
      'So nutzen Sie die Verhinderungspflege richtig: Antrag, Voraussetzungen und Kombination mit Kurzzeitpflege.',
    category: 'Finanzierung',
    datePublished: '2026-03-22',
    readTimeMin: 6,
  },
  {
    slug: 'pflegehilfsmittel-40-euro',
    headline: 'Pflegehilfsmittel — 40€/Monat kostenlos von der Kasse',
    description:
      'Diese Pflegehilfsmittel stehen Ihnen monatlich zu: Einmalhandschuhe, Desinfektionsmittel, Bettschutz und mehr.',
    category: 'Finanzierung',
    datePublished: '2026-03-23',
    readTimeMin: 4,
  },
  {
    slug: 'alltagsbegleitung-frankfurt',
    headline: 'Alltagsbegleitung in Frankfurt — Angebote & Kosten',
    description:
      'Finden Sie die beste Alltagsbegleitung in Frankfurt am Main. Angebote, Kosten und Kassenabrechnung im Überblick.',
    category: 'Alltagsbegleitung',
    datePublished: '2026-03-24',
    readTimeMin: 5,
  },
  {
    slug: 'seniorenbetreuung-zu-hause',
    headline: 'Seniorenbetreuung zu Hause — Angebote, Kosten & Finanzierung',
    description:
      'Professionelle Seniorenbetreuung in den eigenen vier Wänden — welche Möglichkeiten gibt es und was zahlt die Kasse?',
    category: 'Alltagsbegleitung',
    datePublished: '2026-03-25',
    readTimeMin: 7,
  },
  {
    slug: 'alltagshilfe-senioren',
    headline: 'Alltagshilfe für Senioren — Was wird angeboten?',
    description:
      'Von Einkaufsbegleitung bis Haushaltshilfe: Diese Alltagshilfen unterstützen Senioren im täglichen Leben.',
    category: 'Alltagsbegleitung',
    datePublished: '2026-03-26',
    readTimeMin: 5,
  },
  {
    slug: 'einkaufshilfe-senioren',
    headline: 'Einkaufshilfe für Senioren — Unterstützung beim Einkaufen',
    description:
      'Professionelle Einkaufshilfe für ältere Menschen. So funktioniert Begleitung und Abrechnung über die Pflegekasse.',
    category: 'Services',
    datePublished: '2026-03-27',
    readTimeMin: 4,
  },
  {
    slug: 'arztbegleitung-senioren',
    headline: 'Arztbegleitung für Senioren — Sicher zum Arzttermin',
    description:
      'Professionelle Begleitung zum Arzt: Ablauf, Kosten und Kassenabrechnung für Seniorenbegleitung.',
    category: 'Services',
    datePublished: '2026-03-28',
    readTimeMin: 4,
  },
  {
    slug: 'krankenfahrt-kostenuebernahme',
    headline: 'Krankenfahrt Kostenübernahme — Wer zahlt die Fahrt zum Arzt?',
    description:
      'Wann übernimmt die Krankenkasse die Fahrtkosten? Alles zu Krankenfahrten, Genehmigung und Erstattung.',
    category: 'Services',
    datePublished: '2026-03-29',
    readTimeMin: 5,
  },
  {
    slug: 'alltagsbegleiter-werden',
    headline: 'Alltagsbegleiter werden — Ausbildung, Gehalt & Einstieg',
    description:
      'So werden Sie zertifizierter Alltagsbegleiter nach §45a SGB XI. Qualifikation, Verdienst und Bewerbung.',
    category: 'Karriere',
    datePublished: '2026-03-30',
    readTimeMin: 6,
  },
  {
    slug: 'nebenjob-pflege',
    headline: 'Nebenjob in der Pflege — Flexibel als Alltagsbegleiter arbeiten',
    description:
      'Nebenjob als Alltagsbegleiter: Flexible Arbeitszeiten, faire Bezahlung und sinnvolle Tätigkeit.',
    category: 'Karriere',
    datePublished: '2026-03-31',
    readTimeMin: 5,
  },
  {
    slug: 'einsamkeit-im-alter',
    headline: 'Einsamkeit im Alter — Ursachen, Folgen & Hilfsangebote',
    description:
      'Einsamkeit betrifft viele Senioren. Welche Hilfsangebote gibt es und wie kann Alltagsbegleitung helfen?',
    category: 'Ratgeber',
    datePublished: '2026-04-01',
    readTimeMin: 7,
  },
  {
    slug: 'pflege-app-vergleich',
    headline: 'Pflege-App Vergleich 2026 — Die besten Apps für pflegende Angehörige',
    description:
      'Welche Pflege-Apps helfen wirklich? Vergleich der besten digitalen Helfer für Pflegebedürftige und Angehörige.',
    category: 'Ratgeber',
    datePublished: '2026-04-02',
    readTimeMin: 8,
  },
  {
    slug: 'haushaltshilfe-frankfurt',
    headline: 'Haushaltshilfe Frankfurt — Jetzt über die Pflegekasse buchen',
    description:
      'Haushaltshilfe in Frankfurt am Main und Rhein-Main-Gebiet: Einkaufen, Kochen, Putzen, Begleitung. Kostenübernahme über Pflegekasse möglich.',
    category: 'Services',
    datePublished: '2026-06-04',
    readTimeMin: 6,
  },
  {
    slug: 'pflegebox-kostenlos-bestellen',
    headline: 'Pflegebox kostenlos bestellen — 42€/Monat von der Pflegekasse',
    description:
      'Bis zu 42€ monatlich für Pflegehilfsmittel von der Pflegekasse. Handschuhe, Desinfektion, Bettschutz — alles in einer Box.',
    category: 'Finanzierung',
    datePublished: '2026-06-04',
    readTimeMin: 4,
  },
  {
    slug: 'krankenfahrt-buchen-frankfurt',
    headline: 'Krankenfahrt buchen Frankfurt — Fahrt zum Arzt über die Krankenkasse',
    description:
      'Krankenfahrt in Frankfurt buchen: Fahrten zu Arzt, Klinik, Dialyse und Therapie. Mit Verordnung über die Krankenkasse abrechenbar.',
    category: 'Services',
    datePublished: '2026-06-04',
    readTimeMin: 5,
  },
  {
    slug: 'alltagsbegleitung-kosten',
    headline: 'Was kostet Alltagsbegleitung? Kosten, Finanzierung & Tipps',
    description:
      'Stundensätze von 25–45€, Finanzierung über den Entlastungsbetrag (131€/Monat) und praktische Tipps zur Kostenübernahme.',
    category: 'Finanzierung',
    datePublished: '2026-06-06',
    readTimeMin: 8,
  },
  {
    slug: 'seniorenbetreuung-frankfurt',
    headline: 'Seniorenbetreuung in Frankfurt: Angebote, Kosten & Anbieter',
    description:
      'Alle Angebote für Seniorenbetreuung in Frankfurt: Alltagsbegleitung, Haushaltshilfe, Demenzbetreuung im Rhein-Main-Gebiet.',
    category: 'Alltagsbegleitung',
    datePublished: '2026-06-06',
    readTimeMin: 9,
  },
  {
    slug: 'entlastungsbetrag-nutzen',
    headline: 'Entlastungsbetrag richtig nutzen — 131€/Monat voll ausschöpfen',
    description:
      'Praktischer Ratgeber: So nutzen Sie den Entlastungsbetrag optimal. Welche Leistungen sind abgedeckt, häufige Fehler und Checkliste.',
    category: 'Finanzierung',
    datePublished: '2026-06-06',
    readTimeMin: 10,
  },
]

export function getBlogPost(slug: string): BlogPostMeta | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug)
}
