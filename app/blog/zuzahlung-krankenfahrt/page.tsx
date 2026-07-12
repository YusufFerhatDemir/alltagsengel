import type { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Zuzahlung Krankenfahrt: Was muss ich zahlen?',
  description: 'Zuzahlung bei Krankenfahrten: 10 % des Fahrpreises, mindestens 5 €, höchstens 10 € pro Fahrt. Mit Beispielrechnungen, Belastungsgrenze und Befreiung.',
  keywords: 'Zuzahlung Krankenfahrt, Krankenfahrt Kosten, Eigenanteil Krankenfahrt, Befreiung Zuzahlung, Belastungsgrenze, Krankentransport Kostenübernahme, §60 SGB V',
  alternates: { canonical: 'https://alltagsengel.care/blog/zuzahlung-krankenfahrt' },
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Zuzahlung Krankenfahrt: Was muss ich zahlen?',
    description: 'So viel kostet Sie die genehmigte Krankenfahrt wirklich: Zuzahlungsregeln, Beispielrechnungen und der Weg zur Befreiung.',
  },
};

// EIN Array für sichtbare FAQ-Sektion UND FAQPage-Schema (Google-Richtlinie:
// nur sichtbar gerenderte FAQs auszeichnen).
const faqItems = [
  {
    q: 'Zählen Hin- und Rückfahrt als eine oder zwei Fahrten?',
    a: 'Als zwei Fahrten. Für die Hinfahrt zur Dialyse und die Rückfahrt nach Hause fällt jeweils eine eigene Zuzahlung von 5 bis 10 € an — bei drei Dialyseterminen pro Woche also bis zu sechs Zuzahlungen.',
  },
  {
    q: 'Müssen Kinder eine Zuzahlung leisten?',
    a: 'Nein. Kinder und Jugendliche unter 18 Jahren sind bei Krankenfahrten — anders als bei den meisten anderen Leistungen erst ab 18 üblich — grundsätzlich von der Zuzahlung befreit.',
  },
  {
    q: 'Wie beantrage ich die Befreiung von der Zuzahlung?',
    a: 'Sammeln Sie alle Zuzahlungsbelege des Kalenderjahres (Medikamente, Fahrten, Hilfsmittel, Krankenhaus). Sobald 2 % Ihres Bruttoeinkommens (1 % bei chronisch Kranken) erreicht sind, stellen Sie bei Ihrer Krankenkasse den Antrag auf Befreiung und erhalten einen Befreiungsausweis für den Rest des Jahres.',
  },
  {
    q: 'Gilt mein Befreiungsausweis auch für Krankenfahrten?',
    a: 'Ja. Der Befreiungsausweis der Krankenkasse gilt für alle gesetzlichen Zuzahlungen — auch für die 5 bis 10 € pro Krankenfahrt. Legen Sie ihn bei der Buchung vor bzw. hinterlegen Sie ihn in der App.',
  },
  {
    q: 'Was zahle ich ohne Verordnung?',
    a: 'Ohne Verordnung übernimmt die Kasse nichts — Sie fahren als Selbstzahler zum regulären Fahrpreis (Grundpreis plus Kilometerpauschale der Region). Für Begleitung zu Terminen lässt sich alternativ der Entlastungsbetrag von 131 €/Monat einsetzen.',
  },
]

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Zuzahlung Krankenfahrt — was muss ich zahlen?',
  description: 'Zuzahlung bei Krankenfahrten: 10 % des Fahrpreises, mindestens 5 €, höchstens 10 € pro Fahrt. Mit Beispielrechnungen, Belastungsgrenze und Befreiung.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-07-12',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/zuzahlung-krankenfahrt',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function ZuzahlungKrankenfahrt() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Zuzahlung Krankenfahrt' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <article className="blog-article">
        <div className="blog-header">
          <h1>Zuzahlung Krankenfahrt — was muss ich zahlen?</h1>
          <div className="blog-meta">
            <span className="blog-date">12. Juli 2026</span>
            <span className="blog-reading-time">6 Min. Lesezeit</span>
          </div>
        </div>

        <div className="blog-intro">
          <p>Auch wenn die Krankenkasse Ihre Krankenfahrt nach §60 SGB V übernimmt, bleibt ein kleiner Eigenanteil: die gesetzliche Zuzahlung. Die gute Nachricht: Sie ist gedeckelt — <strong>maximal 10 € pro Fahrt</strong> — und viele Versicherte können sich komplett befreien lassen. Hier sind alle Regeln, Beispielrechnungen und der Weg zur Befreiung.</p>
        </div>

        <div className="blog-content">
          <h2>Die Grundregel: 10 %, mindestens 5 €, höchstens 10 €</h2>
          <p>Für jede von der Kasse übernommene Krankenfahrt zahlen Versicherte ab 18 Jahren <strong>10 % des Fahrpreises, mindestens 5 € und höchstens 10 €</strong>. Kostet die Fahrt weniger als 5 €, zahlen Sie den tatsächlichen Preis. Wichtig: <strong>Hin- und Rückfahrt zählen als zwei Fahrten</strong> — mit jeweils eigener Zuzahlung.</p>

          <div className="blog-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fahrpreis</th>
                  <th>10 %-Regel</th>
                  <th>Ihre Zuzahlung</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>18 €</td><td>1,80 € → unter Minimum</td><td>5,00 €</td></tr>
                <tr><td>40 €</td><td>4,00 € → unter Minimum</td><td>5,00 €</td></tr>
                <tr><td>75 €</td><td>7,50 €</td><td>7,50 €</td></tr>
                <tr><td>140 €</td><td>14,00 € → über Maximum</td><td>10,00 €</td></tr>
              </tbody>
            </table>
          </div>

          <h2>Beispielrechnung Dialyse: Was kommt im Monat zusammen?</h2>
          <p>Frau B. fährt dreimal pro Woche zur Dialyse — mit genehmigter Verordnung. Pro Termin fallen zwei Fahrten an (hin und zurück), also 6 Zuzahlungen pro Woche. Bei 5 € Minimum sind das <strong>etwa 120 bis 130 € im Monat</strong> — bis sie ihre Belastungsgrenze erreicht. Als chronisch Kranke liegt diese bei nur 1 % ihres Bruttoeinkommens: Bei 1.500 € Monatseinkommen (18.000 €/Jahr) sind das 180 € im Jahr. <strong>Nach etwa sechs Wochen ist die Grenze erreicht</strong> — für den Rest des Jahres fährt Frau B. komplett zuzahlungsfrei.</p>

          <h2>Die Belastungsgrenze: So werden Sie befreit</h2>
          <ul className="blog-list">
            <li><strong>2 % des Bruttoeinkommens</strong> pro Kalenderjahr — die allgemeine Grenze für alle gesetzlichen Zuzahlungen</li>
            <li><strong>1 % des Bruttoeinkommens</strong> für chronisch Kranke (Dauerbehandlung wegen derselben Krankheit, mindestens ein Arztbesuch pro Quartal)</li>
            <li>Es zählen <strong>alle</strong> Zuzahlungen zusammen: Medikamente, Krankenhaus, Hilfsmittel, Heilmittel — und eben Krankenfahrten</li>
            <li>Bei Familien wird das Bruttoeinkommen um Freibeträge für Angehörige reduziert — die Grenze sinkt entsprechend</li>
            <li><strong>Kinder unter 18</strong> sind bei Krankenfahrten generell zuzahlungsfrei</li>
          </ul>
          <p>Praxis-Tipp: Sammeln Sie von Jahresbeginn an alle Quittungen (in der Alltagsengel-App sind Ihre Fahrten automatisch dokumentiert). Sobald die Grenze erreicht ist, beantragen Sie bei der Kasse den <strong>Befreiungsausweis</strong> — er gilt für den Rest des Kalenderjahres. Manche Kassen bieten an, die voraussichtliche Jahreszuzahlung vorab zu zahlen und direkt ab Januar befreit zu sein.</p>

          <h2>Und beim Krankentransport? Die Kostenübernahme im Vergleich</h2>
          <p>Die Zuzahlungsregel ist bei allen Beförderungsarten gleich: Auch beim qualifizierten <strong>Krankentransport (KTW)</strong> und bei der Rettungsfahrt zahlen Sie 5 bis 10 € pro Fahrt — obwohl die tatsächlichen Kosten dort um ein Vielfaches höher liegen. Der Unterschied liegt in den Voraussetzungen: Der KTW wird nur übernommen, wenn medizinisch-fachliche Betreuung unterwegs nötig ist. Die komplette Abgrenzung mit Vergleichstabelle finden Sie auf unserer <Link href="/krankenfahrten">Krankenfahrten-Seite</Link>, die Übernahmeregeln im Detail im Ratgeber <Link href="/blog/krankenfahrt-kostenuebernahme">Wann zahlt die Krankenkasse?</Link></p>

          <h2>Was zahle ich ohne Verordnung?</h2>
          <p>Ohne Muster-4-Verordnung fahren Sie als Selbstzahler zum regulären Preis: Grundpreis plus Kilometerpauschale, transparent vor der Buchung angezeigt. Wie Sie an die Verordnung kommen, zeigt die Anleitung <Link href="/blog/krankenfahrt-beantragen">Krankenfahrt beantragen — Schritt für Schritt</Link>.</p>

          <h2>Sparpotenzial daneben: Entlastungsbetrag & Pflegebox</h2>
          <p>Wer einen Pflegegrad hat, verschenkt oft Geld an anderer Stelle: Der <Link href="/entlastungsbetrag">Entlastungsbetrag von 131 €/Monat (§45b SGB XI)</Link> finanziert die <Link href="/alltagsbegleitung">Begleitung zum Arzt</Link> — jemand, der mit ins Wartezimmer geht, beim Gespräch zuhört und danach den Einkauf erledigt. Und über die <Link href="/hygienebox">Pflegebox</Link> gibt es Pflegehilfsmittel im Wert von 42 €/Monat kostenlos nach Hause. Beides ist unabhängig von der Fahrt-Zuzahlung und verfällt, wenn es nicht genutzt wird.</p>

          <h2>Häufige Fragen zur Zuzahlung</h2>
          {faqItems.map((f) => (
            <div key={f.q}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </div>

        <div className="blog-cta">
          <h3>Krankenfahrt mit Kassenabrechnung buchen</h3>
          <p>Verordnung hochladen, Fahrt buchen, nur die Zuzahlung zahlen — Alltagsengel vermittelt Krankenfahrten in Frankfurt & Rhein-Main.</p>
          <Link href="/krankenfahrten" className="btn-gold">Krankenfahrt jetzt anfragen</Link>
        </div>

        <section className="blog-related" style={{ marginTop: 40, padding: '24px 20px', background: 'rgba(201,150,60,0.06)', borderRadius: 12, border: '1px solid rgba(201,150,60,0.15)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#C9963C' }}>Weiterführende Informationen</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li><Link href="/krankenfahrten" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Krankenfahrten in Frankfurt & Rhein-Main</Link></li>
            <li><Link href="/blog/krankenfahrt-kostenuebernahme" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Krankenfahrt: Wann zahlt die Krankenkasse?</Link></li>
            <li><Link href="/blog/krankenfahrt-beantragen" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Krankenfahrt beantragen — Schritt für Schritt</Link></li>
            <li><Link href="/blog/krankenfahrt-verordnung-erhalten" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Krankenfahrt-Verordnung (Muster 4) erhalten</Link></li>
          </ul>
        </section>

        <RelatedPosts slug="zuzahlung-krankenfahrt" />
      </article>
    </main>
  );
}
