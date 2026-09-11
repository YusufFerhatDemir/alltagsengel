import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Entlastungsbetrag §45b SGB XI — 131€/Monat',
  description: 'Erfahren Sie wie Sie den Entlastungsbetrag nach §45b SGB XI nutzen können. 131€ monatlich für anerkannte Angebote zur Unterstützung im Alltag. Alltagsengel: §45a-Anerkennung im Verfahren.',
  keywords: ['Entlastungsbetrag', '§45b', '§45b SGB XI', 'Alltagsbegleitung', 'Pflegekasse', 'Pflegegrad', '131 Euro'],
  alternates: { canonical: 'https://alltagsengel.care/blog/entlastungsbetrag-45b' },
  openGraph: {
    title: 'Entlastungsbetrag §45b SGB XI — 131€/Monat',
    description: 'Nutzen Sie Ihren Entlastungsbetrag für anerkannte Alltagsbegleitung',
    url: 'https://alltagsengel.care/blog/entlastungsbetrag-45b',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}


const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Entlastungsbetrag §45b SGB XI — 131€/Monat für Alltagsbegleitung',
  description: 'Erfahren Sie wie Sie den Entlastungsbetrag nach §45b SGB XI nutzen können. 131€ monatlich für anerkannte Angebote zur Unterstützung im Alltag. Alltagsengel: §45a-Anerkennung im Verfahren.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-03-19',
  dateModified: '2026-03-19',
  mainEntityOfPage: 'https://alltagsengel.care/blog/entlastungsbetrag-45b',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

export default function EntlastungsbetragPage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Entlastungsbetrag §45b SGB XI' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <article className="blog-article">
        <header className="blog-header">
          <h1>Entlastungsbetrag §45b SGB XI — 131€/Monat für Alltagsbegleitung</h1>
          <p className="blog-meta">Veröffentlicht am 19. März 2026 | 6 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Der Entlastungsbetrag nach <strong>§45b SGB XI</strong> ist eine staatliche Leistung für alle Menschen mit anerkanntem Pflegegrad. 
            Monatlich stehen Ihnen <strong>131 Euro</strong> zur Verfügung, um sich im Alltag durch anerkannte Angebote professionell unterstützen zu lassen. 
            Ob der Entlastungsbetrag für ein konkretes Angebot eingesetzt werden kann, setzt die Anerkennung des Anbieters nach § 45a SGB XI voraus — Alltagsengel befindet sich derzeit im Anerkennungsverfahren.
          </p>

          <h2>Was ist der Entlastungsbetrag?</h2>
          <p>
            Der Entlastungsbetrag ist eine finanzielle Leistung der Pflegekasse für Personen mit Pflegegrad 1 bis 5. 
            Dieses Geld darf gezielt für <strong>anerkannte Entlastungsangebote</strong> ausgegeben werden — darunter fallen vor allem 
            Alltagsbegleiter nach §45a SGB XI.
          </p>
          <p>
            <strong>Wichtig:</strong> Nicht genutzte Beträge werden angespart und bleiben bis zum 30. Juni des Folgejahres nutzbar — danach verfallen sie. 
            Deshalb lohnt sich eine Planung im ersten Halbjahr.
          </p>

          <h2>131 Euro monatlich — Was ist möglich?</h2>
          <p>
            Mit 131 Euro pro Monat haben Sie vielfältige Möglichkeiten:
          </p>
          <ul className="blog-list">
            <li><strong>Stundenweise Alltagsbegleitung</strong> — wie viele Stunden der Betrag abdeckt, hängt vom Stundensatz des Anbieters ab</li>
            <li><strong>Regelmäßige Arztbesuche</strong> mit geschultem Begleiter</li>
            <li><strong>Einkaufshilfe &amp; Besorgungen</strong> wöchentlich</li>
            <li><strong>Gesellschaftliche Teilhabe:</strong> Spaziergang, Museumsbesuch, kulturelle Veranstaltungen</li>
            <li><strong>Psychosoziale Betreuung</strong> bei Einsamkeit oder Trauer</li>
          </ul>

          <h2>Wer bekommt den Entlastungsbetrag?</h2>
          <p>
            Anspruch auf den Entlastungsbetrag haben alle Personen mit:
          </p>
          <ul className="blog-list">
            <li>Anerkanntem <strong>Pflegegrad 1, 2, 3, 4 oder 5</strong></li>
            <li>Gültigem Pflegeversicherungsschutz</li>
            <li>Kein Mindesterwerbstätigkeitsmerkmal erforderlich</li>
          </ul>
          <p>
            Sie müssen <strong>nicht zuhause pflegebedürftig</strong> sein — auch Senioren, Menschen mit psychischen Erkrankungen 
            oder körperlichen Einschränkungen haben Anspruch.
          </p>

          <h2>Wie funktioniert die Buchung bei Alltagsengel?</h2>
          <p>
            Ob der Entlastungsbetrag für ein konkretes Angebot eingesetzt werden kann, setzt die Anerkennung des Anbieters nach § 45a SGB XI voraus — Alltagsengel befindet sich derzeit im Anerkennungsverfahren. <strong>Bis dahin ist die Buchung als Selbstzahler möglich.</strong> So funktioniert es:
          </p>
          <ol className="blog-list">
            <li>Sie registrieren sich kostenlos bei Alltagsengel.care</li>
            <li>Sie buchen einen Engel für Ihr gewünschtes Anliegen</li>
            <li>Nach dem Einsatz erstellen wir eine Rechnung</li>
          </ol>
          <p>
            <strong>Keine versteckten Kosten.</strong> Zu Ihren Finanzierungswegen beraten wir Sie vorab kostenlos.
          </p>

          <h2>Warum Alltagsengel wählen?</h2>
          <ul className="blog-list">
            <li>✓ <strong>100% Versichert:</strong> Jeder Einsatz ist haftpflichtversichert</li>
            <li>✓ <strong>§45a-Anerkennung im Verfahren:</strong> Alltagsengel befindet sich derzeit im Anerkennungsverfahren nach § 45a SGB XI</li>
            <li>✓ <strong>Sofort buchbar:</strong> Engel in Ihrer Nähe finden, Termin wählen, fertig</li>
            <li>✓ <strong>Individuelle Preisgestaltung:</strong> Preis auf Anfrage, kostenlose Beratung zu Ihren Finanzierungswegen</li>
          </ul>

          <h2>Beispiel: So sieht der Ablauf aus</h2>
          <p>
            <strong>Szenario:</strong> Maria, 72 Jahre alt, hat Pflegegrad 2. Sie lebt allein und möchte gerne zweimal die Woche 
            zur Physiotherapie gehen, schafft aber die Fahrt nicht allein.
          </p>
          <p>
            Sie bucht über Alltagsengel einen Begleiter für <strong>2 × 2 Stunden/Woche = 4 Std./Woche = 16 Std./Monat</strong>. 
            Die Kosten richten sich nach Umfang und Art der Unterstützung; wir erstellen ihr ein individuelles Angebot. Bei einem nach § 45a SGB XI anerkannten Anbieter könnte sie davon <strong>131€ im Monat über den Entlastungsbetrag</strong> decken. 
            Da Alltagsengel sich derzeit im Anerkennungsverfahren befindet, bucht Maria bis dahin als Selbstzahlerin.
          </p>
          <p>
            Ohne Alltagsengel hätte Maria keine praktikable Lösung. Mit Alltagsengel bekommt sie professionelle, versicherte 
            Unterstützung.
          </p>

          <h2>Häufige Fragen</h2>
          <p>
            <strong>Kann ich den Entlastungsbetrag auch sparen?</strong><br />
            Ja, bis zu einer Frist: Nicht genutzte Beträge können bis zum 30. Juni des Folgejahres verwendet werden. Danach verfällt ungenutztes Budget.
          </p>
          <p>
            <strong>Kann ich den Betrag auch für andere Leistungen nutzen?</strong><br />
            Ja! Nicht nur Alltagsbegleitung — auch Pflegekurse, Krisenintervention oder zugelassene Tagespflegezentren 
            können über §45b abgerechnet werden.
          </p>
          <p>
            <strong>Muss ich die Rechnung selbst bei der Kasse einreichen?</strong><br />
            Bei einem anerkannten Anbieter läuft die Abrechnung entweder per Abtretung direkt über den Anbieter oder per Kostenerstattung über Sie. Alltagsengel befindet sich derzeit im Anerkennungsverfahren nach § 45a SGB XI; bis dahin ist die Buchung als Selbstzahler möglich.
          </p>

          <div className="blog-cta">
            <h3>Jetzt Unterstützung im Alltag finden</h3>
            <p>
              Finden Sie noch heute einen geprüften Alltagsbegleiter und nehmen Sie sich die Unterstützung, 
              die Sie verdienen. Kostenlose Registrierung, sofort buchbar. Zu Ihren Finanzierungswegen beraten wir Sie vorab kostenlos — die Anerkennung nach § 45a SGB XI läuft.
            </p>
            <Link href="/termin" className="cta-button">
              Jetzt Engel finden →
            </Link>
          </div>
        </div>

        <p style={{ marginTop: 32, fontSize: 15 }}>
          <strong>Alles Wichtige auf einen Blick:</strong>{' '}
          <Link href="/entlastungsbetrag">Zum großen Entlastungsbetrag-Ratgeber — 131 €/Monat nutzen</Link>
        </p>

        <RelatedPosts slug="entlastungsbetrag-45b" />

        <footer className="blog-footer">
          <Link href="/" className="blog-back">← Zurück zur Startseite</Link>
        </footer>
      
        <section className="blog-related" style={{ marginTop: 40, padding: '24px 20px', background: 'rgba(201,150,60,0.06)', borderRadius: 12, border: '1px solid rgba(201,150,60,0.15)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#C9963C' }}>Weiterführende Informationen</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li><Link href="/alltagsbegleitung" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Alltagsbegleitung buchen — Preis auf Anfrage</Link></li>
            <li><Link href="/hygienebox" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Pflegebox bestellen — 42 Euro/Monat von der Kasse</Link></li>
            <li><Link href="/blog/entlastungsbetrag-beantragen" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Entlastungsbetrag beantragen: Anleitung</Link></li>
          </ul>
        </section>
      </article>
    </main>
  )
}
