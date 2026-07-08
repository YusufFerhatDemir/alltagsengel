import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Wer zahlt die Alltagsbegleitung?',
  description: 'Wer zahlt die Alltagsbegleitung? Pflegekasse (131 € Entlastungsbetrag), Verhinderungspflege, Sozialamt oder privat — alle Finanzierungswege im Überblick.',
  keywords: ['wer zahlt Alltagsbegleitung', 'Alltagsbegleitung Kostenübernahme', 'Alltagsbegleitung Pflegekasse', 'Entlastungsbetrag Alltagsbegleitung', 'Alltagsbegleitung wer bezahlt'],
  alternates: { canonical: 'https://alltagsengel.care/blog/wer-zahlt-alltagsbegleitung' },
  openGraph: {
    title: 'Wer zahlt die Alltagsbegleitung?',
    description: 'Pflegekasse, Entlastungsbetrag, Verhinderungspflege oder Selbstzahler — so wird Alltagsbegleitung finanziert.',
    url: 'https://alltagsengel.care/blog/wer-zahlt-alltagsbegleitung',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Wer zahlt die Alltagsbegleitung?',
  description: 'Wer zahlt die Alltagsbegleitung? Pflegekasse (131 € Entlastungsbetrag), Verhinderungspflege, Sozialamt oder privat — alle Finanzierungswege im Überblick.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-07-02',
  dateModified: '2026-07-02',
  mainEntityOfPage: 'https://alltagsengel.care/blog/wer-zahlt-alltagsbegleitung',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

// Ein gemeinsames Array speist das sichtbare FAQ UND das FAQPage-JSON-LD
// (Google-Richtlinie: FAQ-Markup muss sichtbarem Seiteninhalt entsprechen).
const faqItems = [
  {
    frage: 'Wer zahlt die Alltagsbegleitung?',
    antwort:
      'In den meisten Fällen die Pflegekasse: Ab Pflegegrad 1 stehen 131 € monatlich als Entlastungsbetrag nach §45b SGB XI zur Verfügung. Zusätzlich können Verhinderungspflege, bei geringem Einkommen das Sozialamt (Hilfe zur Pflege) oder eine private Selbstzahlung die Kosten decken.',
  },
  {
    frage: 'Zahlt die Pflegekasse Alltagsbegleitung auch bei Pflegegrad 1?',
    antwort:
      'Ja. Der Entlastungsbetrag von 131 € pro Monat steht bereits ab Pflegegrad 1 zu und kann für zertifizierte Alltagsbegleitung eingesetzt werden. Die Abrechnung übernimmt Alltagsengel direkt mit der Pflegekasse.',
  },
  {
    frage: 'Zahlt die Krankenkasse die Alltagsbegleitung?',
    antwort:
      'Nein, zuständig ist die Pflegekasse (nicht die Krankenkasse), und zwar über den Entlastungsbetrag. Die Krankenkasse übernimmt dagegen andere Leistungen wie Krankenfahrten zum Arzt bei entsprechender Verordnung.',
    link: { href: '/krankenfahrten', label: 'Mehr zu Krankenfahrten →' },
  },
  {
    frage: 'Muss ich die Kosten vorstrecken?',
    antwort:
      'Bei Alltagsengel nicht. Wir rechnen die Alltagsbegleitung direkt mit Ihrer Pflegekasse über den Entlastungsbetrag ab — Sie müssen weder in Vorleistung gehen noch Belege einreichen.',
  },
  {
    frage: 'Was, wenn ich noch keinen Pflegegrad habe?',
    antwort:
      'Dann lohnt sich die Beantragung — schon ab Pflegegrad 1 gibt es den Entlastungsbetrag. Bis dahin können Sie Alltagsbegleitung als Selbstzahler nutzen.',
    link: { href: '/blog/pflegegrad-beantragen', label: 'So beantragen Sie den Pflegegrad →' },
  },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((f) => ({
    '@type': 'Question',
    name: f.frage,
    acceptedAnswer: { '@type': 'Answer', text: f.antwort },
  })),
}

export default function WerZahltAlltagsbegleitungPage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Wer zahlt Alltagsbegleitung?' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <article className="blog-article">
        <header className="blog-header">
          <h1>Wer zahlt die Alltagsbegleitung?</h1>
          <p className="blog-meta">Veröffentlicht am 2. Juli 2026 | 7 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            „Wer zahlt eigentlich die Alltagsbegleitung?" — diese Frage stellen sich viele Angehörige, bevor
            sie Unterstützung organisieren. Die gute Nachricht: In den allermeisten Fällen müssen Sie die
            Kosten <strong>nicht selbst tragen</strong>. Es gibt mehrere Kostenträger, allen voran die
            Pflegekasse. Dieser Ratgeber zeigt alle Finanzierungswege — und wie Sie sie kombinieren.
          </p>

          <h2>1. Die Pflegekasse — Entlastungsbetrag (131 €/Monat)</h2>
          <p>
            Der wichtigste Kostenträger ist die <strong>Pflegekasse</strong>. Über den
            <Link href="/blog/entlastungsbetrag-45b"> Entlastungsbetrag nach §45b SGB XI</Link> stehen jeder
            Person mit anerkanntem Pflegegrad (1–5) <strong>131 € pro Monat</strong> zu — das sind 1.572 € im
            Jahr. Dieser Betrag ist zweckgebunden und kann u. a. für zertifizierte Alltagsbegleitung eingesetzt
            werden.
          </p>
          <p>
            Wichtig: Der Anbieter muss nach <strong>§45a SGB XI anerkannt</strong> sein, damit die Pflegekasse
            zahlt. Alle Alltagsbegleiter:innen von Alltagsengel erfüllen diese Voraussetzung. Die Abrechnung
            läuft direkt über die Kasse — Sie gehen nicht in Vorleistung.
          </p>

          <h2>2. Verhinderungspflege — zusätzliches Budget</h2>
          <p>
            Sind Sie als pflegender Angehöriger verhindert (Urlaub, Krankheit, Auszeit), springt die
            <Link href="/blog/verhinderungspflege-beantragen"> Verhinderungspflege</Link> ein. Ab Pflegegrad 2
            steht ein jährliches Budget zur Verfügung, das ebenfalls für stundenweise Betreuung und
            Alltagsbegleitung genutzt werden kann. Seit Juli 2025 ist es gemeinsam mit der Kurzzeitpflege
            flexibler nutzbar.
          </p>

          <h2>3. Das Sozialamt — Hilfe zur Pflege</h2>
          <p>
            Reichen Rente und Vermögen nicht aus, um notwendige Pflege zu finanzieren, kann das
            <strong> Sozialamt über die „Hilfe zur Pflege" (SGB XII)</strong> einspringen. Das ist vor allem
            dann relevant, wenn kein oder ein niedriger Pflegegrad vorliegt und der Bedarf trotzdem besteht.
            Der Antrag wird beim örtlichen Sozialamt gestellt.
          </p>

          <h2>4. Selbstzahler — flexibel und steuerlich absetzbar</h2>
          <p>
            Wer (noch) keinen Pflegegrad hat oder mehr Stunden möchte, als das Budget hergibt, kann
            Alltagsbegleitung privat bezahlen. Der Vorteil: <strong>volle Flexibilität</strong>. Und: Als
            haushaltsnahe Dienstleistung sind 20 % der Kosten (max. 4.000 € im Jahr) über die Einkommensteuer
            absetzbar. Mehr dazu im Ratgeber
            <Link href="/blog/alltagsbegleitung-kosten"> Was kostet Alltagsbegleitung?</Link>.
          </p>

          <h2>Kombinieren lohnt sich</h2>
          <p>
            Die genannten Töpfe schließen sich nicht aus. Ein typisches Beispiel:
          </p>
          <ul className="blog-list">
            <li>131 €/Monat über den Entlastungsbetrag für die wöchentliche Alltagsbegleitung</li>
            <li>zusätzlich Verhinderungspflege, wenn die Hauptpflegeperson in den Urlaub fährt</li>
            <li>bei Mehrbedarf einzelne Stunden als Selbstzahler — steuerlich absetzbar</li>
          </ul>
          <p>
            So lässt sich eine verlässliche Betreuung aufbauen, ohne die Familie finanziell zu belasten.
          </p>

          <h2>So läuft die Abrechnung bei Alltagsengel</h2>
          <div className="info-steps" style={{ marginTop: 8 }}>
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-text">Kostenlos registrieren und Pflegegrad angeben</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">Zertifizierte:n Alltagsbegleiter:in in Ihrer Nähe auswählen</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">Wir rechnen direkt mit der Pflegekasse ab — kein Papierkram</div>
            </div>
          </div>

          <h2>Häufige Fragen</h2>

          {faqItems.map((f) => (
            <div key={f.frage}>
              <h3>{f.frage}</h3>
              <p>
                {f.antwort}
                {f.link && (
                  <>
                    {' '}
                    <Link href={f.link.href}>{f.link.label}</Link>
                  </>
                )}
              </p>
            </div>
          ))}

          <div className="blog-cta">
            <h3>Kostenlose Alltagsbegleitung über die Pflegekasse</h3>
            <p>
              Nutzen Sie Ihren Anspruch: Registrieren Sie sich kostenlos bei Alltagsengel und lassen Sie die
              Alltagsbegleitung direkt über den Entlastungsbetrag (131 €/Monat) abrechnen — ohne Vorleistung,
              ohne Vermittlungsgebühr.
            </p>
            <Link href="/auth/register" className="cta-button">
              Kostenlos registrieren →
            </Link>
            <p style={{ marginTop: 12 }}>
              <Link href="/kontakt" style={{ color: '#C9963C', textDecoration: 'underline' }}>
                Oder lassen Sie sich kostenlos beraten →
              </Link>
            </p>
          </div>
        </div>

        <RelatedPosts slug="wer-zahlt-alltagsbegleitung" />

        <footer className="blog-footer">
          <Link href="/blog" className="blog-back">← Zurück zum Ratgeber</Link>
        </footer>
      </article>
    </main>
  )
}
