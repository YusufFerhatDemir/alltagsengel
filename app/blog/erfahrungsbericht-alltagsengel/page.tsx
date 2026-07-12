import type { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Erfahrungsbericht: Mein Alltag als Alltagsengel',
  description: 'Wie sieht der Arbeitsalltag als Alltagsbegleiterin wirklich aus? Ein Tag zwischen Einkauf, Arztbegleitung und Kaffeeklatsch — ehrlich erzählt, mit allen Zahlen.',
  keywords: 'Alltagsbegleiter Erfahrungen, Alltagsbegleiter Erfahrungsbericht, Arbeit als Alltagsbegleiter, Nebenjob Seniorenbetreuung Erfahrung, Alltagsengel Job',
  alternates: { canonical: 'https://alltagsengel.care/blog/erfahrungsbericht-alltagsengel' },
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Erfahrungsbericht: Mein Alltag als Alltagsengel',
    description: 'Ein Tag als Alltagsbegleiterin in Frankfurt — zwischen Einkauf, Arztbegleitung und Kaffeeklatsch. Ehrlich erzählt.',
  },
};

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Erfahrungsbericht: Mein Alltag als Alltagsengel',
  description: 'Wie sieht der Arbeitsalltag als Alltagsbegleiterin wirklich aus? Ein Tag zwischen Einkauf, Arztbegleitung und Kaffeeklatsch — ehrlich erzählt, mit allen Zahlen.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-07-12',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/erfahrungsbericht-alltagsengel',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

export default function ErfahrungsberichtAlltagsengel() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Erfahrungsbericht Alltagsengel' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <article className="blog-article">
        <div className="blog-header">
          <h1>Erfahrungsbericht: Mein Alltag als Alltagsengel</h1>
          <div className="blog-meta">
            <span className="blog-date">12. Juli 2026</span>
            <span className="blog-reading-time">6 Min. Lesezeit</span>
          </div>
        </div>

        <div className="blog-intro">
          <p>Wie fühlt sich die Arbeit als Alltagsbegleiterin wirklich an — jenseits von Stellenanzeigen und Stundenlöhnen? Dieser Bericht schildert einen typischen Arbeitstag, zusammengestellt aus den Erfahrungen unserer Engel in Frankfurt und dem Rhein-Main-Gebiet. Der Name der Erzählerin wurde geändert.</p>
        </div>

        <div className="blog-content">
          <h2>Wer hier erzählt</h2>
          <p>„Ich bin Petra, 54, gelernte Bürokauffrau. Als meine Kinder aus dem Haus waren, wollte ich etwas tun, das mehr ist als Zahlen sortieren. Eine Pflegeausbildung? Dafür fühlte ich mich zu alt. Dann habe ich gelesen, dass man für Alltagsbegleitung keine braucht — Einkaufen, Arztbegleitung, Gesellschaft leisten. Das kann ich. Seit gut einem Jahr bin ich jetzt Alltagsengel, an drei Tagen die Woche."</p>

          <h2>8:30 Uhr — Der Tag beginnt mit der App</h2>
          <p>„Beim Frühstück schaue ich in die Alltagsengel-App: Heute stehen drei Einsätze an, alle in meinem Viertel in Bornheim und im Nordend. Das ist das Erste, was ich an dem Job zu schätzen gelernt habe — ich fahre keine 40 Minuten quer durch die Stadt. Die Aufträge kommen aus meiner Nähe, und ich nehme nur an, was in meinen Kalender passt. Dienstags zum Beispiel arbeite ich nie, da ist Enkeltag."</p>

          <h2>9:00 Uhr — Einkaufen mit Herrn B.</h2>
          <p>„Mein erster Klient ist Herr B., 81, Witwer, Pflegegrad 2. Wir gehen zusammen zum Supermarkt — nicht ich für ihn, sondern wir zusammen. Das ist ihm wichtig. Er hält sich am Einkaufswagen fest, ich trage die Tasche, und an der Kasse erzählt er der Kassiererin jedes Mal denselben Witz. Auf dem Rückweg holen wir seine Medikamente aus der Apotheke.</p>
          <p>Was in keiner Stellenanzeige steht: Die halbe Stunde Kaffee danach ist der eigentliche Kern der Arbeit. Herr B. sieht außer mir und seinem Sohn, der in München wohnt, kaum jemanden. Man unterschätzt, was ein regelmäßiges Gespräch für einen Menschen bedeutet."</p>

          <h2>11:30 Uhr — Arztbegleitung ins Nordend</h2>
          <p>„Zweiter Einsatz: Frau K. hat einen Termin beim Kardiologen. Ich hole sie ab, wir nehmen die Straßenbahn, ich warte mit ihr im Wartezimmer und notiere mir, was der Arzt sagt — ihre Tochter will das immer genau wissen. Medizinisch mache ich dabei nichts, das ist nicht meine Aufgabe und das dürfte ich auch gar nicht. Aber ich bin das zweite Paar Ohren, und ich merke, wie viel ruhiger Frau K. ist, wenn jemand dabei ist."</p>

          <h2>14:00 Uhr — Spaziergang und Gedächtnistraining</h2>
          <p>„Nachmittags bin ich bei Frau S., 76, beginnende Demenz. Wir drehen unsere Runde durch den Günthersburgpark — immer dieselbe Strecke, das gibt ihr Sicherheit. Danach spielen wir Karten oder schauen alte Fotoalben an. Ihre Tochter arbeitet Vollzeit und sagt oft, diese drei Stunden seien ihre einzige Verschnaufpause. Abgerechnet wird das über den Entlastungsbetrag der Pflegekasse — die Familie zahlt nichts dazu, und ich muss mich um die Abrechnung nicht kümmern, das läuft über die App."</p>

          <h2>17:00 Uhr — Feierabend und Abrechnung</h2>
          <p>„Nach dem letzten Einsatz trage ich die Zeiten in der App ein — insgesamt sechs Stunden heute, macht 120 Euro. Ich sehe jederzeit, was ich im Monat verdient habe. Ich arbeite etwa 15 Stunden pro Woche; wer nur einen Minijob möchte, arbeitet entsprechend weniger. Das Schöne: Es gibt keinen Schichtplan, der mir vorschreibt, wann ich zu arbeiten habe."</p>

          <h2>Was mir der Job gibt — und was man wissen sollte</h2>
          <p>„Ehrlich gesagt: Es gibt auch schwere Momente. Wenn ein Klient ins Pflegeheim zieht oder stirbt, nimmt einen das mit. Man braucht ein stabiles Gemüt und die Fähigkeit, professionell nah und trotzdem abgegrenzt zu sein. Und man sollte zuverlässig sein — die Menschen richten ihren ganzen Tag nach unseren Terminen aus.</p>
          <p>Aber die Waage kippt klar ins Positive. Ich werde gebraucht, ich sehe jeden Tag, wofür ich arbeite, und ich verdiene fair dabei. Mein Rat an alle, die überlegen: Traut euch. Was diesen Job ausmacht, kann man nicht in einem Zertifikat nachweisen — zuhören, anpacken, da sein."</p>

          <h2>Die Fakten hinter dem Bericht</h2>
          <ul>
            <li><strong>Verdienst:</strong> 20 € pro Stunde, transparent über die App abgerechnet</li>
            <li><strong>Arbeitszeit:</strong> frei wählbar — vom Minijob bis zu 20+ Stunden/Woche</li>
            <li><strong>Voraussetzungen:</strong> keine Pflegeausbildung; Empathie, Zuverlässigkeit, Deutsch (B2), erweitertes Führungszeugnis</li>
            <li><strong>Aufgaben:</strong> Einkaufen, Arztbegleitung, Spaziergänge, leichte Haushaltshilfe, Gesellschaft — keine medizinische Pflege</li>
            <li><strong>Region:</strong> Frankfurt und das gesamte Rhein-Main-Gebiet, Aufträge in deiner Nähe</li>
            <li><strong>Versicherung:</strong> alle Einsätze sind haftpflichtversichert</li>
          </ul>
          <p>Wie der Einstieg konkret abläuft, liest du im Leitfaden <Link href="/blog/alltagsbegleiter-werden">Alltagsbegleiter werden: Verdienst, Voraussetzungen &amp; Bewerbung</Link> — oder du bewirbst dich direkt auf der Seite <Link href="/engel-werden">Engel werden</Link>.</p>
        </div>

        <div className="blog-cta">
          <h3>Klingt nach deinem Job?</h3>
          <p>20 €/Stunde, flexible Zeiteinteilung, sinnvolle Arbeit. Registriere dich kostenlos als Alltagsbegleiter und starte in Frankfurt &amp; Rhein-Main.</p>
          <Link href="/engel-werden" className="btn-gold">Jetzt bewerben</Link>
        </div>

        <RelatedPosts slug="erfahrungsbericht-alltagsengel" />
      </article>
    </main>
  );
}
