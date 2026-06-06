import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Entlastungsbetrag rückwirkend nutzen: Bis zu 3.144€ sichern (2026)',
  description: 'Nicht genutzten Entlastungsbetrag rückwirkend einsetzen: Fristen, Beantragung und wie Sie bis zu 3.144€ aus 2 Jahren nachholen. Aktuell: 131€/Monat seit 2025.',
  keywords: [
    'Entlastungsbetrag rückwirkend',
    'Entlastungsbetrag nachholen',
    'Entlastungsbetrag verfällt',
    'Entlastungsbetrag Frist',
    '131 Euro rückwirkend',
    'Entlastungsbetrag ansparen',
    'Entlastungsbetrag 2024 nachholen',
    'Entlastungsbetrag nicht genutzt',
    '§45b rückwirkend',
    'Entlastungsbetrag Folgejahr',
  ],
  alternates: { canonical: 'https://alltagsengel.care/blog/entlastungsbetrag-rueckwirkend' },
  openGraph: {
    title: 'Entlastungsbetrag rückwirkend nutzen — bis zu 3.144€ sichern',
    description: 'So holen Sie nicht genutzten Entlastungsbetrag nach. Fristen, Berechnung und Beantragung erklärt.',
    url: 'https://alltagsengel.care/blog/entlastungsbetrag-rueckwirkend',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'article',
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Entlastungsbetrag rückwirkend nutzen: Bis zu 3.144€ sichern (2026)',
  description: 'Nicht genutzten Entlastungsbetrag rückwirkend einsetzen: Fristen, Beantragung und wie Sie bis zu 3.144€ nachholen.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-06-06',
  dateModified: '2026-06-06',
  mainEntityOfPage: 'https://alltagsengel.care/blog/entlastungsbetrag-rueckwirkend',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Wie lange kann ich den Entlastungsbetrag rückwirkend nutzen?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Nicht genutzte Beträge eines Kalenderjahres können bis zum 30. Juni des Folgejahres eingesetzt werden. Beispiel: Der Entlastungsbetrag aus 2025 verfällt am 30. Juni 2026.',
      },
    },
    {
      '@type': 'Question',
      name: 'Wie viel Entlastungsbetrag kann ich maximal ansparen?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Im Jahr 2026 beträgt der Entlastungsbetrag 131€/Monat = 1.572€/Jahr. Zusammen mit den nicht verbrauchten Beträgen aus 2025 (die bis 30.06.2026 gelten) können bis zu 3.144€ verfügbar sein.',
      },
    },
    {
      '@type': 'Question',
      name: 'Was passiert mit nicht genutztem Entlastungsbetrag?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Nicht genutzte Beträge verfallen am 30. Juni des Folgejahres unwiderruflich. Es gibt keine Auszahlung — der Betrag kann nur für zugelassene Entlastungsleistungen verwendet werden.',
      },
    },
    {
      '@type': 'Question',
      name: 'Kann ich den Entlastungsbetrag auch ohne Pflegedienst nutzen?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Der Entlastungsbetrag muss für Leistungen nach §45a SGB XI verwendet werden — z.B. Alltagsbegleitung, Haushaltshilfe oder Tagesbetreuung. Der Anbieter muss nach Landesrecht anerkannt sein, wie Alltagsengel.',
      },
    },
  ],
}

export default function EntlastungsbetragRueckwirkend() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Entlastungsbetrag rückwirkend nutzen' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <article className="blog-article">
        <div className="blog-header">
          <h1>Entlastungsbetrag rückwirkend nutzen: Bis zu 3.144 € sichern</h1>
          <div className="blog-meta">
            <span className="blog-date">6. Juni 2026</span>
            <span className="blog-reading-time">6 Min. Lesezeit</span>
          </div>
        </div>

        <div className="blog-intro">
          <p>
            Wussten Sie, dass viele Pflegebedürftige ihren Entlastungsbetrag gar nicht oder nicht
            vollständig nutzen? Dabei lässt sich nicht verbrauchtes Geld aus dem Vorjahr noch bis
            zum 30. Juni des Folgejahres einsetzen. In diesem Artikel erfahren Sie, wie Sie bis zu
            3.144 € aus zwei Jahren zusammen nutzen können — bevor das Geld unwiderruflich verfällt.
          </p>
        </div>

        <div className="blog-content">
          <h2>Was ist der Entlastungsbetrag?</h2>
          <p>
            Der Entlastungsbetrag (§ 45b SGB XI) steht jedem Versicherten mit anerkanntem Pflegegrad
            (1–5) zu. Seit 2025 beträgt er <strong>131 € pro Monat</strong> (vorher 125 €). Das
            Geld ist zweckgebunden für Entlastungsleistungen wie Alltagsbegleitung, Haushaltshilfe,
            Tagesbetreuung oder anerkannte Betreuungsgruppen.
          </p>

          <h2>Die Anspar-Regel: So funktioniert&apos;s</h2>
          <p>
            Wenn Sie den Entlastungsbetrag in einem Monat nicht (vollständig) nutzen, verfällt er
            nicht sofort. Stattdessen sammelt sich das Guthaben an — bis zum <strong>30. Juni des
            Folgejahres</strong>.
          </p>
          <p>
            Das bedeutet konkret:
          </p>
          <ul>
            <li>Nicht genutzte Beträge aus 2025 → verfügbar bis <strong>30. Juni 2026</strong></li>
            <li>Nicht genutzte Beträge aus 2026 → verfügbar bis 30. Juni 2027</li>
            <li>Am 1. Juli verfallen die Vorjahres-Beträge unwiderruflich</li>
          </ul>

          <h2>Rechenbeispiel: Bis zu 3.144 € im Juni 2026</h2>
          <p>
            Nehmen wir an, Sie hatten 2025 einen Pflegegrad, haben aber den Entlastungsbetrag das
            ganze Jahr nicht genutzt:
          </p>
          <ul>
            <li>Restguthaben 2025: 12 × 131 € = <strong>1.572 €</strong></li>
            <li>Guthaben 2026 (Jan–Jun): 6 × 131 € = <strong>786 €</strong></li>
            <li>Gesamtguthaben im Juni 2026: <strong>2.358 €</strong></li>
          </ul>
          <p>
            Im absoluten Maximalfall (wenn auch das zweite Halbjahr 2026 schon gebucht wird):
            1.572 € (2025) + 1.572 € (2026) = <strong>3.144 €</strong>.
          </p>

          <h2>Achtung: Diese Frist ist entscheidend</h2>
          <p>
            Der <strong>30. Juni</strong> ist der Stichtag! Danach sind alle nicht genutzten Beträge
            aus dem Vorjahr weg — es gibt keine Verlängerung, keine Ausnahme, keine Auszahlung.
          </p>
          <p>
            Wichtig: Es zählt das Datum der <em>Leistungserbringung</em>, nicht der Rechnungsstellung.
            Die Alltagsbegleitung (oder andere Leistung) muss also <strong>bis zum 30. Juni
            tatsächlich stattgefunden</strong> haben.
          </p>

          <h2>So nutzen Sie den Restbetrag noch rechtzeitig</h2>

          <h3>Schritt 1: Guthaben prüfen</h3>
          <p>
            Rufen Sie bei Ihrer Pflegekasse an und fragen Sie nach Ihrem aktuellen
            Entlastungsbetrag-Guthaben. Die Kasse kann Ihnen genau sagen, wie viel aus dem
            Vorjahr noch offen ist.
          </p>

          <h3>Schritt 2: Anerkannten Anbieter wählen</h3>
          <p>
            Der Entlastungsbetrag darf nur für Leistungen nach § 45a SGB XI bei einem nach
            Landesrecht anerkannten Anbieter eingesetzt werden. Alltagsengel ist in Hessen
            zugelassen und rechnet direkt mit Ihrer Pflegekasse ab.
          </p>

          <h3>Schritt 3: Termine buchen</h3>
          <p>
            Buchen Sie bei Alltagsengel Alltagsbegleitung, Haushaltshilfe oder Betreuung — so
            viele Stunden, wie Ihr Guthaben hergibt. Bei 32 €/Stunde und 1.572 € Restguthaben
            sind das fast <strong>50 Stunden</strong> Alltagsbegleitung!
          </p>

          <h3>Schritt 4: Abrechnung läuft automatisch</h3>
          <p>
            Alltagsengel rechnet die erbrachten Leistungen direkt mit Ihrer Pflegekasse über den
            Entlastungsbetrag ab. Sie zahlen nichts aus eigener Tasche.
          </p>

          <h2>Wofür kann der Entlastungsbetrag verwendet werden?</h2>
          <ul>
            <li>Alltagsbegleitung (Einkaufen, Arztbegleitung, Spaziergänge)</li>
            <li>Hauswirtschaftliche Hilfe (Putzen, Kochen, Wäsche)</li>
            <li>Betreuungsgruppen und Tagesbetreuung</li>
            <li>Pflegeberatung und Schulung für Angehörige</li>
            <li>Teilstationäre Pflege (Tages-/Nachtpflege) — Eigenanteil</li>
            <li>Kurzzeitpflege — Eigenanteil</li>
          </ul>

          <h2>Häufige Fehler vermeiden</h2>
          <ul>
            <li><strong>Zu spät angefangen:</strong> Im Juni ist es oft schwer, noch genug Termine zu bekommen. Beginnen Sie früh im Jahr!</li>
            <li><strong>Nicht anerkannter Anbieter:</strong> Nur nach Landesrecht zugelassene Dienste werden akzeptiert.</li>
            <li><strong>Verwechslung mit Pflegegeld:</strong> Der Entlastungsbetrag ist ZUSÄTZLICH zum Pflegegeld — unabhängig davon.</li>
            <li><strong>Keine Quittung:</strong> Bewahren Sie alle Leistungsnachweise auf, falls die Kasse nachfragt.</li>
          </ul>

          <h2>Fazit: Entlastungsbetrag jetzt nutzen — nicht verfallen lassen</h2>
          <p>
            Der Entlastungsbetrag ist eine wertvolle Leistung, die vielen Pflegebedürftigen und
            ihren Angehörigen echte Entlastung im Alltag bringt. Nutzen Sie Ihr Guthaben rechtzeitig
            — vor allem wenn der 30. Juni näher rückt. Bei 131 € monatlich summiert sich das
            schnell zu einem erheblichen Betrag, den Sie für professionelle Alltagsbegleitung
            einsetzen können.
          </p>
        </div>

        <div className="blog-cta">
          <h3>Entlastungsbetrag jetzt nutzen</h3>
          <p>Buchen Sie Alltagsbegleitung über den Entlastungsbetrag — bevor Ihr Guthaben verfällt.</p>
          <Link href="/alltagsbegleitung" className="btn-gold">Alltagsbegleitung buchen</Link>
        </div>

        <div className="blog-related">
          <h3>Weiterlesen</h3>
          <ul>
            <li><Link href="/blog/entlastungsbetrag-beantragen">Entlastungsbetrag beantragen — Anleitung</Link></li>
            <li><Link href="/blog/entlastungsbetrag-45b">Entlastungsbetrag §45b erklärt</Link></li>
            <li><Link href="/blog/entlastungsbetrag-nutzen">Entlastungsbetrag sinnvoll nutzen</Link></li>
            <li><Link href="/blog/alltagsbegleitung-kosten">Was kostet Alltagsbegleitung?</Link></li>
          </ul>
        </div>
      </article>
    </main>
  )
}
