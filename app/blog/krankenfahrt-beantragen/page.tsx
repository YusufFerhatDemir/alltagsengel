import type { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import HowToSchema from '@/components/HowToSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Krankenfahrt beantragen: Anleitung in 5 Schritten',
  description: 'Krankenfahrt beantragen leicht gemacht: Muster-4-Verordnung vom Arzt, Genehmigung der Krankenkasse, Fahrt buchen. Schritt-für-Schritt-Anleitung 2026.',
  keywords: 'Krankenfahrt beantragen, Krankenfahrt bestellen, Muster 4, Verordnung Krankenbeförderung, Krankenkasse Genehmigung, §60 SGB V, Arztfahrt Senioren',
  alternates: { canonical: 'https://alltagsengel.care/blog/krankenfahrt-beantragen' },
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Krankenfahrt beantragen: Anleitung in 5 Schritten',
    description: 'Von der Muster-4-Verordnung bis zur gebuchten Fahrt: So beantragen Sie eine Krankenfahrt bei der Krankenkasse — Schritt für Schritt.',
  },
};

// EIN Array für sichtbare FAQ-Sektion UND FAQPage-Schema (Google-Richtlinie:
// nur sichtbar gerenderte FAQs auszeichnen).
const faqItems = [
  {
    q: 'Kann ich eine Krankenfahrt auch rückwirkend beantragen?',
    a: 'Grundsätzlich nein: Die Verordnung muss vor der Fahrt ausgestellt und genehmigungspflichtige Fahrten müssen vor Fahrtantritt genehmigt sein. Nur in echten Ausnahmefällen (z. B. kurzfristige Krankenhauseinweisung) akzeptieren Kassen eine nachträgliche Verordnung.',
  },
  {
    q: 'Wie lange dauert die Genehmigung durch die Krankenkasse?',
    a: 'Bei vollständigen Unterlagen entscheiden die meisten Kassen innerhalb weniger Werktage, oft direkt online. Bei genehmigungsfreien Fällen (Pflegegrad 4/5, Pflegegrad 3 mit Mobilitätsbeeinträchtigung, Merkzeichen aG/Bl/H) entfällt der Schritt komplett.',
  },
  {
    q: 'Muss ich für jede Fahrt einen neuen Antrag stellen?',
    a: 'Nein. Bei Serienbehandlungen wie Dialyse, Chemo- oder Strahlentherapie verordnet der Arzt die gesamte Behandlungsserie auf einem Muster 4, und die Kasse genehmigt die Serie — oft als Dauergenehmigung über mehrere Monate.',
  },
  {
    q: 'Kann ich die Krankenfahrt für meine Eltern beantragen und bestellen?',
    a: 'Ja. Angehörige können die Verordnung in der Praxis abholen, den Antrag bei der Kasse einreichen und die Fahrt buchen — bei Alltagsengel auch komplett aus der Ferne über die App, inklusive Serienplanung für Dialyse- oder Therapietermine.',
  },
  {
    q: 'Was kostet mich die genehmigte Krankenfahrt?',
    a: 'Nur die gesetzliche Zuzahlung: 10 % des Fahrpreises, mindestens 5 €, höchstens 10 € pro Fahrt. Mit Befreiungsausweis (Belastungsgrenze 2 % bzw. 1 % des Bruttoeinkommens) entfällt auch diese.',
  },
]

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Krankenfahrt beantragen: Schritt-für-Schritt-Anleitung',
  description: 'Krankenfahrt beantragen leicht gemacht: Muster-4-Verordnung vom Arzt, Genehmigung der Krankenkasse, Fahrt buchen. Schritt-für-Schritt-Anleitung 2026.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-07-12',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/krankenfahrt-beantragen',
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

export default function KrankenfahrtBeantragen() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Krankenfahrt beantragen' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <HowToSchema
        name="Krankenfahrt bei der Krankenkasse beantragen"
        description="In 5 Schritten von der Muster-4-Verordnung zur genehmigten Krankenfahrt nach §60 SGB V."
        totalTime="P3D"
        steps={[
          { name: 'Anspruch prüfen', text: 'Prüfen Sie, ob Ihre Fahrt übernommen wird: stationäre Behandlung, Serienbehandlung (Dialyse, Chemo, Bestrahlung), Pflegegrad 3–5 oder Merkzeichen aG/Bl/H.' },
          { name: 'Verordnung (Muster 4) vom Arzt holen', text: 'Lassen Sie sich vor der Fahrt die Verordnung einer Krankenbeförderung ausstellen — mit Grund, Beförderungsmittel „Taxi/Mietwagen" und Behandlungsort.' },
          { name: 'Genehmigung der Krankenkasse einholen', text: 'Serienfahrten und Härtefälle reichen Sie vor Fahrtantritt bei der Kasse ein. Bei Pflegegrad 4/5, Pflegegrad 3 mit Mobilitätsbeeinträchtigung und Merkzeichen aG/Bl/H gilt die Fahrt als genehmigt.' },
          { name: 'Fahrt buchen', text: 'Buchen Sie die Krankenfahrt bei einem Fahrdienst mit Kassenabrechnung — bei Alltagsengel in 2 Minuten in der App, Verordnung als Foto hochladen.', url: '/krankenfahrten' },
          { name: 'Zuzahlung zahlen — fertig', text: 'Der Fahrdienst rechnet direkt mit der Kasse ab. Sie zahlen nur die Zuzahlung von 5–10 € pro Fahrt, mit Befreiungsausweis nichts.' },
        ]}
      />
      <article className="blog-article">
        <div className="blog-header">
          <h1>Krankenfahrt beantragen: Schritt-für-Schritt-Anleitung</h1>
          <div className="blog-meta">
            <span className="blog-date">12. Juli 2026</span>
            <span className="blog-reading-time">7 Min. Lesezeit</span>
          </div>
        </div>

        <div className="blog-intro">
          <p>Eine Krankenfahrt zu beantragen ist einfacher, als viele denken — wenn man die Reihenfolge kennt: erst die <strong>Verordnung (Muster 4)</strong> vom Arzt, dann (falls nötig) die <strong>Genehmigung der Krankenkasse</strong>, dann die Fahrt bestellen. Diese Anleitung führt Sie in 5 Schritten durch den gesamten Prozess — inklusive der Fälle, in denen Sie gar keine Genehmigung brauchen.</p>
        </div>

        <div className="blog-content">
          <h2>Schritt 1: Anspruch prüfen — wird Ihre Fahrt übernommen?</h2>
          <p>Die Krankenkasse zahlt Krankenfahrten nach <strong>§60 SGB V</strong> nur, wenn sie medizinisch zwingend notwendig sind. Sicher übernommen werden:</p>
          <ul className="blog-list">
            <li><strong>Fahrten zur stationären Behandlung</strong> — Krankenhausaufnahme und Entlassung</li>
            <li><strong>Serienbehandlungen</strong> — Dialyse, Chemotherapie, Strahlentherapie (mit Genehmigung)</li>
            <li><strong>Ambulante Fahrten mit Pflegegrad 4 oder 5</strong> — genehmigungsfrei</li>
            <li><strong>Pflegegrad 3 mit dauerhafter Mobilitätsbeeinträchtigung</strong> — genehmigungsfrei</li>
            <li><strong>Merkzeichen aG, Bl oder H</strong> im Schwerbehindertenausweis — genehmigungsfrei</li>
            <li><strong>Härtefälle</strong> — wenn der Arzt eine zwingende Notwendigkeit bescheinigt und die Kasse vorab genehmigt</li>
          </ul>
          <p>Der einfache Arztbesuch ohne eine dieser Voraussetzungen wird nicht übernommen — dann fahren Sie als Selbstzahler oder nutzen für die Begleitung den <Link href="/entlastungsbetrag">Entlastungsbetrag (131 €/Monat)</Link>. Welche Fälle im Detail übernommen werden, erklärt der Ratgeber <Link href="/blog/krankenfahrt-kostenuebernahme">Wann zahlt die Krankenkasse?</Link></p>

          <h2>Schritt 2: Die Verordnung (Muster 4) vom Arzt holen</h2>
          <p>Das Herzstück jedes Antrags ist die <strong>„Verordnung einer Krankenbeförderung" — Muster 4</strong>. Sie bekommen sie von dem Arzt, der die Behandlung durchführt oder veranlasst. Wichtig:</p>
          <ul className="blog-list">
            <li><strong>Vor der Fahrt ausstellen lassen</strong> — am besten direkt bei der Terminvereinbarung in der Praxis danach fragen</li>
            <li><strong>Beförderungsmittel:</strong> Für die sitzende Krankenfahrt genügt „Taxi/Mietwagen" — ein Krankentransportwagen (KTW) wird nur angekreuzt, wenn unterwegs fachliche Betreuung nötig ist</li>
            <li><strong>Vollständigkeit prüfen:</strong> Grund der Beförderung, Behandlungsort, Hin-/Rückfahrt, Unterschrift und Stempel — unvollständige Verordnungen sind der häufigste Ablehnungsgrund</li>
            <li><strong>Serienbehandlung?</strong> Gleich die gesamte Serie auf einem Formular verordnen lassen</li>
          </ul>
          <p>Ausführliche Tipps zum Arztgespräch finden Sie im Ratgeber <Link href="/blog/krankenfahrt-verordnung-erhalten">Krankenfahrt-Verordnung erhalten</Link>.</p>

          <h2>Schritt 3: Genehmigung der Krankenkasse — wenn nötig</h2>
          <p>Hier trennen sich zwei Wege:</p>
          <ul className="blog-list">
            <li><strong>Genehmigungsfrei:</strong> Mit Pflegegrad 4/5, Pflegegrad 3 plus dauerhafter Mobilitätsbeeinträchtigung oder Merkzeichen aG/Bl/H gilt die verordnete Fahrt automatisch als genehmigt. Sie können direkt buchen.</li>
            <li><strong>Genehmigungspflichtig:</strong> Serienfahrten (Dialyse, Chemo, Bestrahlung) und Härtefälle reichen Sie mit der Verordnung bei Ihrer Kasse ein — per Post, in der Geschäftsstelle oder bei den meisten Kassen online. Die Genehmigung muss <strong>vor Fahrtantritt</strong> vorliegen; bei Serien gilt sie dann für die gesamte Behandlungsdauer.</li>
          </ul>

          <h2>Schritt 4: Krankenfahrt bestellen</h2>
          <p>Mit Verordnung (und ggf. Genehmigung) buchen Sie bei einem Fahrdienst, der mit der Kasse abrechnet. Bei Alltagsengel geht das in 2 Minuten: registrieren, Start- und Zieladresse eingeben, Fahrtart wählen (sitzend, Rollstuhl, Tragestuhl) und die Verordnung als Foto oder PDF hochladen. Bei Serienterminen legen wir einen festen Fahrplan an — gleiche Abholzeit, möglichst derselbe Fahrer. Angehörige können Fahrten auch aus der Ferne für ihre Eltern organisieren und sehen in der App, wann die Abholung und die sichere Rückkehr erfolgt sind.</p>

          <h2>Schritt 5: Abrechnung und Zuzahlung</h2>
          <p>Der Fahrdienst rechnet direkt mit der Krankenkasse ab — Sie gehen nicht in Vorleistung. Es bleibt die gesetzliche Zuzahlung: <strong>10 % des Fahrpreises, mindestens 5 €, höchstens 10 € pro Fahrt</strong>. Wer viel fährt, erreicht schnell die Belastungsgrenze und kann sich befreien lassen. Alle Rechenbeispiele dazu: <Link href="/blog/zuzahlung-krankenfahrt">Zuzahlung Krankenfahrt — was muss ich zahlen?</Link></p>

          <h2>Tipp für Senioren: Fahrt und Begleitung kombinieren</h2>
          <p>Die genehmigte Krankenfahrt deckt den Weg — aber nicht das Wartezimmer. Für eine <strong>Arztfahrt mit Begleitung</strong> kombinieren viele Familien die Krankenfahrt mit einer <Link href="/alltagsbegleitung">Alltagsbegleitung</Link>: Der Engel begleitet in die Praxis, hört beim Arztgespräch mit und hilft danach beim Einkauf oder Rezept-Einlösen. Die Begleitung läuft über den <Link href="/entlastungsbetrag">Entlastungsbetrag (131 €/Monat, §45b SGB XI)</Link>, die Fahrt über die Verordnung — zwei Töpfe, ein Termin. Mit Pflegegrad lohnt sich zusätzlich die <Link href="/hygienebox">kostenlose Pflegebox (42 €/Monat)</Link>.</p>

          <h2>Häufige Fragen zum Antrag</h2>
          {faqItems.map((f) => (
            <div key={f.q}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </div>

        <div className="blog-cta">
          <h3>Krankenfahrt jetzt bestellen</h3>
          <p>Verordnung hochladen, Fahrt buchen, fertig — Alltagsengel vermittelt zuverlässige Krankenfahrten in Frankfurt & Rhein-Main mit direkter Kassenabrechnung.</p>
          <Link href="/krankenfahrten" className="btn-gold">Krankenfahrt jetzt anfragen</Link>
        </div>

        <section className="blog-related" style={{ marginTop: 40, padding: '24px 20px', background: 'rgba(201,150,60,0.06)', borderRadius: 12, border: '1px solid rgba(201,150,60,0.15)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#C9963C' }}>Weiterführende Informationen</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li><Link href="/krankenfahrten" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Krankenfahrten in Frankfurt & Rhein-Main</Link></li>
            <li><Link href="/blog/krankenfahrt-kostenuebernahme" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Krankenfahrt: Wann zahlt die Krankenkasse?</Link></li>
            <li><Link href="/blog/zuzahlung-krankenfahrt" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Zuzahlung Krankenfahrt — was muss ich zahlen?</Link></li>
            <li><Link href="/blog/krankenfahrt-verordnung-erhalten" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Krankenfahrt-Verordnung (Muster 4) erhalten</Link></li>
          </ul>
        </section>

        <RelatedPosts slug="krankenfahrt-beantragen" />
      </article>
    </main>
  );
}
