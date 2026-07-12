import type { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import SpeakableSchema from '@/components/SpeakableSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Alltagsbegleiter werden: Ausbildung, Gehalt & Voraussetzungen',
  description: 'Alltagsbegleiter werden 2026: Qualifizierung nach §45a SGB XI, Gehalt von 18–24 €/Stunde, Voraussetzungen und Bewerbung — der komplette Weg in den Beruf.',
  keywords: 'Alltagsbegleiter werden, Alltagsbegleiter Ausbildung, Alltagsbegleiter Gehalt, Alltagsbegleiter Voraussetzungen, Alltagsbegleiter Qualifizierung, Betreuungskraft werden, Nebenjob Betreuung',
  alternates: { canonical: 'https://alltagsengel.care/blog/alltagsbegleiter-werden' },
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Alltagsbegleiter werden: Ausbildung, Gehalt & Voraussetzungen',
    description: 'Der komplette Weg in den Beruf: Qualifizierung, Verdienst, Voraussetzungen und Bewerbung als Alltagsbegleiter — verständlich erklärt.',
  },
};

// HowTo-Schema für die sichtbare Schritt-für-Schritt-Anleitung
// (h2 "Schritt für Schritt zum Alltagsbegleiter" — Inhalte müssen sichtbar bleiben)
const howToJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'Alltagsbegleiter werden — Schritt für Schritt',
  description: 'In fünf Schritten zum Alltagsbegleiter: Modell wählen, Qualifizierung, Unterlagen, Bewerbung, erste Einsätze.',
  totalTime: 'P30D',
  step: [
    {
      '@type': 'HowToStep',
      position: 1,
      name: 'Arbeitsmodell wählen',
      text: 'Entscheiden Sie, ob Sie angestellt mit festen Touren oder flexibel über eine Plattform wie Alltagsengel arbeiten möchten — mit selbstgewählten Kunden und freier Zeiteinteilung.',
    },
    {
      '@type': 'HowToStep',
      position: 2,
      name: 'Basisqualifizierung absolvieren',
      text: 'Kurs nach den Landesvorgaben zu §45a SGB XI (je nach Bundesland ca. 30–160 Unterrichtsstunden) bei Volkshochschulen, Sozialverbänden oder integriert ins Onboarding des Anbieters.',
    },
    {
      '@type': 'HowToStep',
      position: 3,
      name: 'Unterlagen sammeln',
      text: 'Besorgen Sie polizeiliches Führungszeugnis, Identitätsnachweis, Lebenslauf sowie je nach Anbieter Erste-Hilfe-Bescheinigung und Gesundheitsnachweis.',
    },
    {
      '@type': 'HowToStep',
      position: 4,
      name: 'Bei Anbieter bewerben',
      text: 'Bewerben Sie sich bei Pflegediensten, Sozialunternehmen oder Online-Plattformen wie Alltagsengel — dort genügt ein Profil in der App plus persönliches Kennenlernen.',
    },
    {
      '@type': 'HowToStep',
      position: 5,
      name: 'Erste Einsätze übernehmen',
      text: 'Verfügbarkeit festlegen, Anfragen aus der Nähe annehmen, versichert arbeiten — aus den ersten Einsätzen entsteht meist ein fester Kundenstamm mit Wochenterminen.',
    },
  ],
}

// Ein gemeinsames Array speist das sichtbare FAQ UND das FAQPage-JSON-LD
// (Google-Richtlinie: FAQ-Markup muss sichtbarem Seiteninhalt entsprechen).
const faqItems = [
  {
    frage: 'Braucht man eine Ausbildung, um Alltagsbegleiter zu werden?',
    antwort:
      'Eine klassische Berufsausbildung ist nicht nötig. Für die Abrechnung über die Pflegekasse verlangen die Bundesländer eine Basisqualifizierung (je nach Land ca. 30–160 Unterrichtsstunden) nach den Landesverordnungen zu §45a SGB XI. Quereinstieg ist ausdrücklich möglich.',
  },
  {
    frage: 'Wie viel verdient ein Alltagsbegleiter?',
    antwort:
      'Üblich sind 18 bis 24 € brutto pro Stunde, je nach Region, Anbieter und Anstellungsform. Bei Alltagsengel verdienen Engel etwa 20 €/Stunde bei freier Zeiteinteilung. Angestellte Betreuungskräfte in Einrichtungen liegen in Vollzeit meist bei 2.300–2.900 € brutto monatlich.',
  },
  {
    frage: 'Wie lange dauert die Qualifizierung zum Alltagsbegleiter?',
    antwort:
      'Die Basisqualifizierung nach Landesrecht umfasst je nach Bundesland etwa 30 bis 160 Unterrichtsstunden und ist berufsbegleitend in wenigen Wochen zu schaffen. Viele Kurse laufen abends, am Wochenende oder online.',
  },
  {
    frage: 'Welche Voraussetzungen muss ich als Alltagsbegleiter erfüllen?',
    antwort:
      'Volljährigkeit, ein einwandfreies polizeiliches Führungszeugnis, gute Deutschkenntnisse, Zuverlässigkeit und Empathie. Dazu kommen die Basisqualifizierung nach Landesrecht sowie je nach Anbieter ein Erste-Hilfe-Kurs und ein persönliches Kennenlerngespräch.',
  },
  {
    frage: 'Kann ich Alltagsbegleiter im Nebenjob sein?',
    antwort:
      'Ja — die Tätigkeit eignet sich ideal als Nebenjob: Sie bestimmen Verfügbarkeit und Stundenumfang selbst, ob als Minijob (bis 603 €/Monat, Stand 2026), Midijob oder flexibel über eine Plattform wie Alltagsengel. Auch Studierende und Rentner arbeiten als Alltagsbegleiter.',
  },
  {
    frage: 'Was ist der Unterschied zwischen Alltagsbegleiter und Betreuungskraft nach §53b?',
    antwort:
      'Betreuungskräfte nach §53b SGB XI (früher §87b) arbeiten in stationären Pflegeeinrichtungen und absolvieren eine Qualifizierung von 160 Stunden plus Praktikum. Alltagsbegleiter arbeiten ambulant bei den Menschen zu Hause, nach den Landesregeln zu §45a SGB XI.',
  },
  {
    frage: 'Übernimmt ein Alltagsbegleiter Pflegeaufgaben?',
    antwort:
      'Nein. Körperpflege, Medikamentengabe und medizinische Aufgaben sind Pflegekräften vorbehalten. Alltagsbegleiter unterstützen bei Haushalt, Einkäufen, Terminen und leisten Gesellschaft — das macht den Beruf auch für Quereinsteiger ohne Pflegeausbildung zugänglich.',
  },
  {
    frage: 'Wie werde ich Alltagsbegleiter bei Alltagsengel?',
    antwort:
      'Online registrieren, Profil ausfüllen, Führungszeugnis und Identitätsnachweis hochladen, persönliches Kennenlernen und Schulung absolvieren — danach erhalten Sie Aufträge in Ihrer Nähe, arbeiten versichert und zu einem transparenten Stundenlohn von etwa 20 €.',
  },
]

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Alltagsbegleiter werden: Ausbildung, Gehalt & Voraussetzungen',
  description: 'Alltagsbegleiter werden 2026: Qualifizierung nach §45a SGB XI, Gehalt von 18–24 €/Stunde, Voraussetzungen und Bewerbung — der komplette Weg in den Beruf.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-04-08',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/alltagsbegleiter-werden',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((f) => ({
    '@type': 'Question',
    name: f.frage,
    acceptedAnswer: { '@type': 'Answer', text: f.antwort },
  })),
}

export default function AlltagsbegleiterWerden() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Alltagsbegleiter werden' }]} />
      <SpeakableSchema url="/blog/alltagsbegleiter-werden" cssSelectors={['.blog-header h1', '.blog-intro p']} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <article className="blog-article">
        <div className="blog-header">
          <h1>Alltagsbegleiter werden: Ausbildung, Gehalt &amp; Voraussetzungen</h1>
          <div className="blog-meta">
            <span className="blog-date">12. Juli 2026</span>
            <span className="blog-reading-time">12 Min. Lesezeit</span>
          </div>
        </div>

        {/* ─── Prominenter CTA-Banner ─── */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(201,150,60,0.12) 0%, rgba(201,150,60,0.04) 100%)',
          border: '1px solid rgba(201,150,60,0.3)',
          borderRadius: 16,
          padding: '20px 22px',
          marginBottom: 24,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#C9963C', marginBottom: 8 }}>
            Jetzt bewerben
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#F5F0E8', lineHeight: 1.3, marginBottom: 8 }}>
            Werde Alltagsengel — 20 €/Stunde, flexible Zeiten
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: 14 }}>
            Keine Pflegeausbildung nötig. Starte jetzt als Alltagsbegleiter in Frankfurt &amp; Rhein-Main.
          </div>
          <Link href="/engel-werden" className="btn-gold" style={{ display: 'inline-block', width: 'auto', padding: '12px 32px', fontSize: 13 }}>
            Zur Bewerbung
          </Link>
        </div>

        <div className="blog-intro">
          <p>Alltagsbegleiter ist einer der zugänglichsten Berufe im Sozialbereich: keine jahrelange Ausbildung, ein fairer Stundenlohn von 18 bis 24 € und eine Arbeit, deren Sinn man in jedem Einsatz spürt. Gleichzeitig wächst der Bedarf rasant — Deutschland altert, und Millionen Pflegebedürftige wollen zu Hause leben. Dieser Guide erklärt den kompletten Weg in den Beruf: welche Qualifizierung nötig ist, was Sie wirklich verdienen, welche Voraussetzungen gelten und wie die Bewerbung abläuft.</p>
        </div>

        <div className="blog-content">
          <h2>Was macht ein Alltagsbegleiter?</h2>
          <p>Ein Alltagsbegleiter unterstützt ältere, kranke oder pflegebedürftige Menschen bei allem, was den Alltag ausmacht — ohne medizinische oder körperbezogene Pflege. Typische Aufgaben:</p>
          <ul>
            <li>Einkaufen, Besorgungen und Botengänge</li>
            <li>Zubereitung von Mahlzeiten und leichte Hausarbeit</li>
            <li>Begleitung zu Arzt-, Behörden- und Freizeitterminen</li>
            <li>Spaziergänge, Gespräche, Vorlesen, Spiele — soziale Teilhabe</li>
            <li>Tagesstruktur und Aktivierung, etwa bei <Link href="/blog/alltagsbegleitung-demenz">Demenz</Link></li>
            <li>Entlastung pflegender Angehöriger durch stundenweise Betreuung</li>
          </ul>
          <p>Die Arbeit ist sozial-assistiv, nicht pflegerisch: Waschen, Anziehen und Medikamentengabe bleiben Pflegekräften vorbehalten — deshalb ist der Quereinstieg ohne Pflegeausbildung möglich. Wie sich der Job im Alltag anfühlt, lesen Sie im <Link href="/blog/erfahrungsbericht-alltagsengel">Erfahrungsbericht: Mein Alltag als Alltagsengel</Link>; das Berufsbild aus Kundensicht beschreibt der <Link href="/blog/was-ist-alltagsbegleitung">komplette Guide zur Alltagsbegleitung</Link>.</p>

          <h2>Ausbildung und Qualifizierung: Das verlangt der Gesetzgeber</h2>
          <p>„Alltagsbegleiter" ist keine geschützte Berufsbezeichnung mit klassischer Ausbildung — aber wer über die Pflegekasse abgerechnet werden will, braucht eine anerkannte Qualifizierung. Den Rahmen setzt <strong>§45a SGB XI</strong> („Angebote zur Unterstützung im Alltag"), die Details regelt jedes Bundesland in einer eigenen Verordnung.</p>
          <h3>Die Basisqualifizierung nach Landesrecht</h3>
          <p>Die meisten Bundesländer verlangen einen Basiskurs von etwa <strong>30 bis 40 Unterrichtsstunden</strong>, einige bis zu 160 Stunden. Typische Inhalte:</p>
          <ul>
            <li>Grundwissen Pflegebedürftigkeit, Pflegegrade und Leistungen der Pflegeversicherung</li>
            <li>Demenz und der Umgang mit kognitiven Einschränkungen</li>
            <li>Kommunikation, Nähe und Distanz, Biografiearbeit</li>
            <li>Hygiene, Sicherheit und Notfallverhalten</li>
            <li>Rechtliche Grundlagen: Schweigepflicht, Haftung, Dokumentation</li>
          </ul>
          <p>Kurse bieten Volkshochschulen, Sozialverbände (z. B. Caritas, DRK, Malteser), private Bildungsträger und Plattformen an — oft berufsbegleitend am Abend, am Wochenende oder online, teils kostenlos oder gefördert. Bei Alltagsengel ist die Schulung in den Onboarding-Prozess integriert.</p>
          <h3>Abgrenzung: Betreuungskraft nach §53b SGB XI</h3>
          <p>Wer in einer <strong>stationären</strong> Pflegeeinrichtung als zusätzliche Betreuungskraft arbeiten möchte, absolviert die umfangreichere Qualifizierung nach §53b SGB XI (früher §87b): 160 Unterrichtsstunden plus zweiwöchiges Praktikum. Für die ambulante Alltagsbegleitung zu Hause ist das nicht erforderlich — es ist aber ein möglicher Karriereschritt (siehe unten).</p>

          <h2>Gehalt: Was verdient ein Alltagsbegleiter 2026?</h2>
          <h3>Stundenlohn nach Tätigkeitsform</h3>
          <ul>
            <li><strong>Plattform / flexibel (z. B. Alltagsengel):</strong> ca. <strong>20 €/Stunde</strong>, freie Zeiteinteilung, Aufträge nach Verfügbarkeit — in Ballungsräumen wie Frankfurt bis 24 €.</li>
            <li><strong>Angestellt bei Betreuungsdiensten:</strong> meist 14–18 €/Stunde brutto, dafür mit Sozialversicherung, Urlaub und Lohnfortzahlung.</li>
            <li><strong>Betreuungskraft in Einrichtungen (§53b):</strong> in Vollzeit etwa 2.300–2.900 € brutto monatlich, nach Tarif teils darüber.</li>
            <li><strong>Privat organisiert:</strong> 15–25 €/Stunde, aber ohne Vermittlung, Versicherung und Abrechnungsservice.</li>
          </ul>
          <h3>Rechenbeispiele</h3>
          <ul>
            <li><strong>Nebenjob:</strong> 6 Stunden pro Woche à 20 € ≈ <strong>520 €/Monat</strong> — als Minijob (Grenze 2026: 603 €/Monat) weitgehend abgabenfrei.</li>
            <li><strong>Teilzeit:</strong> 20–25 Stunden pro Woche à 20 € ≈ <strong>1.600–2.000 €/Monat</strong> brutto.</li>
            <li><strong>Vollzeitnah:</strong> 30–35 Stunden pro Woche ≈ <strong>2.600–3.000 €/Monat</strong> brutto, je nach Region und Modell.</li>
          </ul>
          <p>Warum die Nachfrage stabil ist: Die Einsätze werden überwiegend von der Pflegekasse finanziert — allein der <Link href="/entlastungsbetrag">Entlastungsbetrag nach §45b SGB XI</Link> stellt jedem Menschen mit Pflegegrad <strong>131 € pro Monat</strong> für Alltagsunterstützung bereit. Millionen Anspruchsberechtigte schöpfen ihn bislang nicht aus — der Markt wächst also unabhängig von der Konjunktur. Mehr zum flexiblen Einstieg: <Link href="/blog/nebenjob-pflege">Nebenjob in der Pflege</Link>.</p>

          <h2>Voraussetzungen: Das müssen Sie mitbringen</h2>
          <h3>Formale Voraussetzungen</h3>
          <ul>
            <li>Volljährigkeit</li>
            <li><strong>Polizeiliches Führungszeugnis</strong> ohne relevante Einträge (online über das Bundesamt für Justiz oder beim Bürgeramt beantragen)</li>
            <li>Gute Deutschkenntnisse für Gespräche, Termine und Dokumentation</li>
            <li>Basisqualifizierung nach Landesrecht (siehe oben) — bei vielen Anbietern im Onboarding enthalten</li>
            <li>Je nach Anbieter: Erste-Hilfe-Kurs, Referenzen, Gesundheitsnachweis</li>
          </ul>
          <h3>Persönliche Eignung</h3>
          <ul>
            <li><strong>Empathie und Geduld</strong> — besonders im Umgang mit Demenz oder psychischen Erkrankungen</li>
            <li><strong>Zuverlässigkeit:</strong> Für viele Kunden ist der Besuch der Fixpunkt der Woche; Absagen wiegen schwer</li>
            <li><strong>Diskretion:</strong> Sie arbeiten im privatesten Raum der Menschen — ihrem Zuhause</li>
            <li><strong>Selbstorganisation:</strong> Termine, Wege und Dokumentation wollen koordiniert sein</li>
            <li><strong>Körperliche Grundfitness</strong> für Einkäufe, Spaziergänge und Haushalt</li>
          </ul>

          <h2>Schritt für Schritt zum Alltagsbegleiter</h2>
          <h3>Schritt 1: Arbeitsmodell wählen</h3>
          <p>Überlegen Sie zuerst, wie Sie arbeiten möchten: angestellt mit festen Touren oder flexibel mit selbstgewählten Kunden. Plattformen wie Alltagsengel vermitteln Aufträge in Ihrer Nähe, übernehmen Versicherung und Abrechnung mit der Pflegekasse und lassen Sie Umfang und Zeiten selbst bestimmen.</p>
          <h3>Schritt 2: Qualifizierung absolvieren</h3>
          <p>Melden Sie sich für einen Basiskurs nach den Vorgaben Ihres Bundeslandes an — oder wählen Sie einen Anbieter, der die Schulung ins Onboarding integriert. Berufserfahrung in Pflege, Betreuung oder Hauswirtschaft wird häufig angerechnet.</p>
          <h3>Schritt 3: Unterlagen zusammenstellen</h3>
          <p>Führungszeugnis, Identitätsnachweis, Lebenslauf, ggf. Erste-Hilfe-Bescheinigung und Qualifizierungsnachweis — mit vollständigen Unterlagen dauert die Freischaltung meist nur wenige Tage.</p>
          <h3>Schritt 4: Bewerben und Kennenlernen</h3>
          <p>Bei Alltagsengel läuft die Bewerbung komplett online über <Link href="/engel-werden">alltagsengel.care/engel-werden</Link>: registrieren, Profil ausfüllen, Dokumente hochladen. Danach folgt ein persönliches Kennenlernen — uns ist wichtig, wer zu den Menschen nach Hause kommt.</p>
          <h3>Schritt 5: Erste Einsätze und feste Kunden</h3>
          <p>Sie legen Ihre Verfügbarkeit in der App fest und erhalten Anfragen aus Ihrer Umgebung. Aus den ersten Einsätzen entstehen feste Kundenbeziehungen — die meisten Engel betreuen nach wenigen Wochen einen festen Stamm mit wiederkehrenden Wochenterminen.</p>

          <h2>Karriere und Weiterentwicklung</h2>
          <p>Alltagsbegleitung ist auch ein Sprungbrett im Sozial- und Gesundheitswesen:</p>
          <ul>
            <li><strong>Betreuungskraft nach §53b SGB XI:</strong> 160-Stunden-Qualifizierung plus Praktikum — eröffnet Stellen in Tagespflegen und Pflegeheimen.</li>
            <li><strong>Pflegehelfer / Pflegeassistenz:</strong> Ein- bis zweijährige Qualifizierung, deutlich höhere Gehälter, landesrechtlich geregelt.</li>
            <li><strong>Pflegefachkraft:</strong> Die dreijährige generalistische Ausbildung steht auch Quereinsteigern offen — praktische Erfahrung aus der Alltagsbegleitung ist dabei Gold wert.</li>
            <li><strong>Spezialisierung:</strong> Fortbildungen zu Demenz, Palliativbegleitung oder <Link href="/blog/alltagsbegleitung-psychische-erkrankungen">psychischen Erkrankungen</Link> machen Sie für anspruchsvollere Einsätze gefragt.</li>
          </ul>

          <h2>Vor- und Nachteile im Überblick</h2>
          <h3>Das spricht für den Beruf</h3>
          <ul>
            <li>Schneller Einstieg ohne lange Ausbildung — auch mit 50+ oder als Wiedereinstieg</li>
            <li>Flexible Zeiteinteilung: ideal neben Familie, Studium oder Rente</li>
            <li>Sinnstiftende Arbeit mit direktem, sichtbarem Nutzen</li>
            <li>Wachsender Markt mit sicherer Nachfrage durch die Pflegekassen-Finanzierung</li>
            <li>Echte Beziehungen statt anonymer Dienstleistung — feste Bezugspersonen sind das Modell</li>
          </ul>
          <h3>Das sollten Sie realistisch sehen</h3>
          <ul>
            <li>Emotionale Nähe bedeutet auch emotionale Belastung — Abgrenzung will gelernt sein</li>
            <li>Der Stundenlohn ist fair, aber kein Spitzengehalt; Vollzeit-Einkommen erfordern gute Auslastung</li>
            <li>Wege zwischen Einsätzen kosten Zeit — ein räumlich kompakter Kundenstamm hilft</li>
            <li>Als Selbstständiger tragen Sie Verantwortung für Steuern und Absicherung (bei Alltagsengel sind Einsätze über die Plattform haftpflichtversichert)</li>
          </ul>

          <h2>Häufige Fragen zum Beruf Alltagsbegleiter</h2>
          {faqItems.map((f) => (
            <div key={f.frage}>
              <h3>{f.frage}</h3>
              <p>{f.antwort}</p>
            </div>
          ))}

          <h2>Fazit: Der zugänglichste Weg in die soziale Arbeit</h2>
          <p>Alltagsbegleiter werden heißt: in wenigen Wochen startklar sein, fair verdienen und Arbeit leisten, die unmittelbar ankommt. Die Basisqualifizierung nach §45a SGB XI ist überschaubar, die Nachfrage wächst mit jedem Jahr — und über Plattformen wie Alltagsengel entfällt der organisatorische Ballast: Aufträge, Versicherung und die komplette Abrechnung mit der Pflegekasse sind abgedeckt. Wer Empathie, Zuverlässigkeit und Freude am Umgang mit Menschen mitbringt, findet hier einen Beruf mit Sinn und Zukunft.</p>
          <p>Sie wohnen außerhalb Frankfurts? Alle Infos zum Einstieg in Ihrer Stadt: <Link href="/engel-werden/offenbach">Offenbach</Link>, <Link href="/engel-werden/wiesbaden">Wiesbaden</Link>, <Link href="/engel-werden/darmstadt">Darmstadt</Link>, <Link href="/engel-werden/hanau">Hanau</Link>, <Link href="/engel-werden/mainz">Mainz</Link> und <Link href="/engel-werden/bad-homburg">Bad Homburg</Link>.</p>
        </div>

        <div className="blog-cta">
          <h3>Jetzt Alltagsengel werden</h3>
          <p>20 €/Stunde, flexible Zeiteinteilung, sinnvolle Arbeit. Registriere dich kostenlos als Alltagsbegleiter und starte in Frankfurt &amp; Rhein-Main.</p>
          <Link href="/engel-werden" className="btn-gold">Jetzt bewerben</Link>
        </div>

        <RelatedPosts slug="alltagsbegleiter-werden" />
      </article>
    </main>
  );
}
