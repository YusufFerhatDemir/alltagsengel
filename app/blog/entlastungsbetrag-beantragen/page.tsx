import type { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Entlastungsbetrag 2026: Anspruch, Antrag & Nutzung (131 €)',
  description: 'Entlastungsbetrag 2026: 131 €/Monat ab Pflegegrad 1 nach §45b SGB XI. Der Praxis-Guide zu Anspruch, Abrechnung, Fristen, Beispielrechnungen und Fehlern.',
  keywords: 'Entlastungsbetrag 2026, § 45b, Pflegekasse, Pflegegrad, Entlastungsbetrag beantragen, 131 Euro',
  alternates: { canonical: 'https://alltagsengel.care/blog/entlastungsbetrag-beantragen' },
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Entlastungsbetrag 2026: Anspruch, Antrag & Nutzung (131 €/Monat)',
    description: 'Der komplette Praxis-Guide zum Entlastungsbetrag nach §45b SGB XI: Anspruch ab Pflegegrad 1, Abrechnungswege, Fristen und Beispielrechnungen.',
  },
};

// Eine Quelle für sichtbare FAQ UND FAQPage-JSON-LD (Google-Richtlinie:
// Structured-Data-FAQs müssen sichtbar auf der Seite stehen)
const faqData = [
  {
    frage: 'Wie hoch ist der Entlastungsbetrag 2026?',
    antwort:
      'Der Entlastungsbetrag beträgt 2026 genau 131 Euro pro Monat, also 1.572 Euro pro Kalenderjahr. Der Betrag ist für alle Pflegegrade gleich hoch und wird zusätzlich zu Pflegegeld und Pflegesachleistungen gewährt — er wird auf keine andere Leistung angerechnet.',
  },
  {
    frage: 'Muss ich den Entlastungsbetrag formell beantragen?',
    antwort:
      'Nein. Ein klassischer Antrag ist nicht nötig — der Anspruch entsteht automatisch mit dem anerkannten Pflegegrad 1 bis 5. Sie müssen den Betrag nur abrufen: entweder per Kostenerstattung (Rechnung einreichen) oder per Abtretungserklärung, bei der ein anerkannter Anbieter direkt mit der Pflegekasse abrechnet.',
  },
  {
    frage: 'Habe ich auch mit Pflegegrad 1 Anspruch auf die 131 Euro?',
    antwort:
      'Ja, in voller Höhe. Der Entlastungsbetrag ist die zentrale Geldleistung bei Pflegegrad 1, denn Pflegegeld und Pflegesachleistungen gibt es dort noch nicht. Gerade Menschen mit Pflegegrad 1 verschenken die Leistung besonders häufig, weil sie schlicht nicht davon wissen.',
  },
  {
    frage: 'Verfällt der Entlastungsbetrag, wenn ich ihn nicht nutze?',
    antwort:
      'Nicht sofort. Ungenutzte Monatsbeträge sammeln sich im laufenden Kalenderjahr automatisch an. Restguthaben aus dem Vorjahr bleibt bis zum 30. Juni des Folgejahres nutzbar — erst danach verfällt es unwiderruflich. Wer den Betrag nie abruft, verschenkt bis zu 1.572 Euro pro Jahr.',
  },
  {
    frage: 'Kann ich mir den Entlastungsbetrag bar auszahlen lassen?',
    antwort:
      'Nein. Der Entlastungsbetrag ist zweckgebunden und wird nur gegen Leistungsnachweis erstattet oder direkt mit einem anerkannten Anbieter abgerechnet. Eine Auszahlung auf das eigene Konto ohne Nachweis ist gesetzlich ausgeschlossen.',
  },
  {
    frage: 'Welche Anbieter darf ich mit dem Entlastungsbetrag bezahlen?',
    antwort:
      'Nur nach Landesrecht anerkannte Angebote zur Unterstützung im Alltag (§45a SGB XI), zugelassene ambulante Pflegedienste sowie Einrichtungen der Tages-, Nacht- und Kurzzeitpflege. Rechnungen von Privatpersonen oder Nachbarn ohne Anerkennung erstattet die Pflegekasse nicht — auch nicht rückwirkend.',
  },
  {
    frage: 'Darf ich den Entlastungsbetrag für die Verhinderungspflege einsetzen?',
    antwort:
      'Nein, das ist nicht erlaubt. Die Verhinderungspflege ist ein eigener Topf mit einem gemeinsamen Jahresbetrag von 3.539 Euro (ab Pflegegrad 2). Beide Leistungen lassen sich aber kombinieren: Zusammen stehen bis zu 5.111 Euro pro Jahr zur Verfügung.',
  },
  {
    frage: 'Wie lange dauert es, bis ich den Entlastungsbetrag nutzen kann?',
    antwort:
      'Bei der Direktabrechnung per Abtretungserklärung geht es sehr schnell: Sobald die Erklärung unterschrieben ist, können Leistungen gebucht werden — der Anbieter rechnet direkt mit der Kasse ab. Beim Kostenerstattungsweg hängt die Dauer von der Bearbeitungszeit Ihrer Pflegekasse ab, nachdem Sie die Rechnung eingereicht haben.',
  },
]

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Entlastungsbetrag 2026: Anspruch, Antrag & Nutzung (131 €/Monat)',
  description: 'Entlastungsbetrag 2026: 131 €/Monat ab Pflegegrad 1 nach §45b SGB XI. Der Praxis-Guide zu Anspruch, Abrechnung, Fristen, Beispielrechnungen und Fehlern.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-04-12',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/entlastungsbetrag-beantragen',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqData.map((faq) => ({
    '@type': 'Question',
    name: faq.frage,
    acceptedAnswer: { '@type': 'Answer', text: faq.antwort },
  })),
}

export default function EntlastungsbetragBeantragen() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Entlastungsbetrag beantragen' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <article className="blog-article">
        <div className="blog-header">
          <h1>Entlastungsbetrag 2026: Anspruch, Antrag & Nutzung (131 €/Monat)</h1>
          <div className="blog-meta">
            <span className="blog-date">12. April 2026 — Aktualisiert am 12. Juli 2026</span>
            <span className="blog-reading-time">10 Min. Lesezeit</span>
          </div>
        </div>

        <div className="blog-intro">
          <p>Der Entlastungsbetrag nach § 45b SGB XI bringt jeder Person mit Pflegegrad 131 Euro pro Monat — 2026 sind das bis zu 1.572 Euro im Jahr. Trotzdem bleibt ein Großteil dieses Geldes ungenutzt bei den Pflegekassen liegen, weil viele Betroffene den Anspruch nicht kennen oder den Weg zur Abrechnung scheuen. Dieser Guide erklärt Schritt für Schritt, wer Anspruch hat, wofür Sie den Betrag einsetzen dürfen, wie die beiden Abrechnungswege funktionieren, welche Fristen 2026 gelten und welche Fehler Sie vermeiden sollten — mit konkreten Beispielrechnungen.</p>
        </div>

        <div className="blog-content">
          <h2>Was ist der Entlastungsbetrag nach § 45b SGB XI?</h2>
          <p>Der Entlastungsbetrag ist eine zweckgebundene Leistung der Pflegeversicherung in Höhe von <strong>131 Euro pro Monat</strong> (1.572 Euro pro Jahr). Er soll pflegende Angehörige entlasten und Pflegebedürftigen helfen, möglichst lange selbstständig zu Hause zu leben. Anders als das Pflegegeld wird er nicht auf Ihr Konto ausgezahlt: Der Betrag wird gegen Rechnung eines anerkannten Anbieters mit der Pflegekasse abgerechnet — zum Beispiel für Haushaltshilfe, Einkaufsbegleitung oder <Link href="/alltagsbegleitung">Alltagsbegleitung</Link>.</p>
          <p>Wichtig zur Einordnung: Der Entlastungsbetrag ist ein eigener Topf. Er wird zusätzlich zu Pflegegeld und Pflegesachleistungen gewährt und auf keine andere Leistung der Pflegeversicherung angerechnet. Wer ihn nutzt, verliert also nichts an anderer Stelle.</p>

          <h2>Wer hat 2026 Anspruch? Pflegegrad 1 bis 5</h2>
          <p>Der Anspruch besteht für <strong>alle Pflegegrade von 1 bis 5</strong>, sofern die pflegebedürftige Person zu Hause lebt — dazu zählen auch ambulant betreute Wohngemeinschaften. Die Voraussetzungen im Überblick:</p>
          <ul>
            <li>Anerkannter Pflegegrad 1, 2, 3, 4 oder 5</li>
            <li>Häusliche Pflege (kein vollstationäres Pflegeheim)</li>
            <li>Versicherung bei einer Pflegekasse — der Anspruch ist unabhängig vom Einkommen</li>
            <li>Einsatz des Betrags bei einem anerkannten Anbieter (dazu unten mehr)</li>
          </ul>
          <p>Besonders wichtig: Auch mit <strong>Pflegegrad 1</strong> — bei dem es noch kein Pflegegeld gibt — besteht der volle Anspruch auf die 131 Euro monatlich. Für Menschen mit Pflegegrad 1 ist der Entlastungsbetrag sogar die zentrale Geldleistung der Pflegekasse. Gerade diese Gruppe verschenkt die Leistung besonders häufig, weil sie schlicht nicht davon weiß.</p>
          <p>Die Höhe ist bei allen Pflegegraden identisch. Was sich unterscheidet, ist die Rolle im Gesamtbudget: Bei Pflegegrad 2 und 3 ergänzt der Betrag typischerweise die wöchentliche Haushaltshilfe oder Alltagsbegleitung, bei Pflegegrad 4 und 5 finanziert er vor allem Betreuungsstunden, die pflegenden Angehörigen Freiräume schaffen.</p>

          <h2>Wofür dürfen Sie die 131 Euro einsetzen?</h2>
          <p>Der Entlastungsbetrag ist zweckgebunden für Leistungen, die den Pflegealltag erleichtern:</p>
          <ul>
            <li><strong>Alltagsbegleitung:</strong> Einkäufe, Arztbegleitung, Behördengänge, Gesellschaft</li>
            <li><strong>Haushaltsnahe Hilfen:</strong> Kochen, Putzen, Wäsche, Aufräumen</li>
            <li><strong>Betreuung und Tagesstrukturierung</strong> — auch bei Demenz</li>
            <li><strong>Spaziergänge, Freizeitgestaltung und geistige Aktivierung</strong></li>
            <li><strong>Tages- und Nachtpflege sowie Kurzzeitpflege</strong> (Eigenanteile)</li>
            <li><strong>Ab Pflegegrad 2:</strong> anteilig Leistungen ambulanter Pflegedienste</li>
          </ul>
          <p>Nicht erlaubt ist der Einsatz für die Verhinderungspflege — dafür existiert ein eigenes Budget von 3.539 Euro pro Jahr (ab Pflegegrad 2). Ebenfalls ausgeschlossen: die Bezahlung von Privatpersonen oder Nachbarn ohne Anerkennung nach Landesrecht. Abgerechnet werden können nur anerkannte Angebote zur Unterstützung im Alltag (§ 45a SGB XI), zugelassene ambulante Pflegedienste sowie Einrichtungen der Tages-, Nacht- und Kurzzeitpflege.</p>

          <h2>Muss man den Entlastungsbetrag überhaupt beantragen?</h2>
          <p>Hier räumen wir mit einem verbreiteten Missverständnis auf: <strong>Einen klassischen Antrag auf den Entlastungsbetrag gibt es nicht.</strong> Der Anspruch entsteht automatisch mit dem anerkannten Pflegegrad. Sie müssen keine Formulare bei der Pflegekasse einreichen und keine Genehmigung abwarten, bevor Sie starten können. Was Sie tun müssen, ist den Betrag <em>abzurufen</em> — also eine anerkannte Leistung zu nutzen und dafür zu sorgen, dass sie korrekt mit der Kasse abgerechnet wird.</p>
          <p>Trotzdem ist ein kurzer Kontakt mit der Pflegekasse sinnvoll: Informieren Sie Ihre Kasse formlos, dass Sie den Entlastungsbetrag nutzen möchten — viele Kassen senden dann automatisch die passenden Unterlagen zu und teilen Ihnen auf Nachfrage mit, wie viel angespartes Guthaben noch auf Ihrem Konto liegt.</p>

          <h2>Schritt für Schritt: So nutzen Sie den Entlastungsbetrag 2026</h2>

          <h3>Schritt 1: Pflegegrad prüfen oder beantragen</h3>
          <p>Voraussetzung ist ein anerkannter Pflegegrad 1 bis 5. Liegt noch keiner vor, stellen Sie einen formlosen Antrag bei Ihrer Pflegekasse — die Kontaktdaten finden Sie auf Ihrer Versichertenkarte. Der Medizinische Dienst begutachtet dann die Pflegebedürftigkeit. Liegt der Bescheid bereits vor, halten Sie ihn bereit: Darauf stehen Pflegegrad und Pflegekasse — mehr brauchen Sie für den Start nicht.</p>

          <h3>Schritt 2: Ungenutztes Guthaben überschlagen</h3>
          <p>Rechnen Sie kurz nach: Monate seit Anerkennung des Pflegegrads mal 131 Euro, plus eventuelles Restguthaben aus dem Vorjahr (nutzbar bis zum 30. Juni). Wer seit Januar 2026 einen Pflegegrad hat und noch nichts genutzt hat, verfügt im Juli bereits über 917 Euro angespartes Budget. Einen schnellen Überblick über alle Pflegekassen-Budgets gibt der <Link href="/budgetrechner">Budgetrechner</Link>.</p>

          <h3>Schritt 3: Anerkannten Anbieter wählen</h3>
          <p>Der Entlastungsbetrag darf nur bei anerkannten Anbietern eingesetzt werden. Prüfen Sie vor der ersten Buchung, ob der Dienstleister nach Landesrecht als Angebot zur Unterstützung im Alltag anerkannt ist — sonst bleibt die Rechnung an Ihnen hängen. Die Alltagsbegleiter von Alltagsengel erfüllen diese Anforderungen und sind versichert.</p>

          <h3>Schritt 4: Abrechnungsweg festlegen</h3>
          <p>Entscheiden Sie sich zwischen Kostenerstattung und Direktabrechnung (Details im nächsten Abschnitt). Bei der Direktabrechnung unterschreiben Sie einmalig eine Abtretungserklärung — danach läuft alles automatisch, ohne Vorleistung und ohne Belege.</p>

          <h3>Schritt 5: Leistungen buchen und abrechnen lassen</h3>
          <p>Buchen Sie Termine nach Bedarf — viele starten mit einem Kennenlerntermin von zwei Stunden. Die geleisteten Stunden werden dokumentiert und über den Entlastungsbetrag abgerechnet, bis zu 131 Euro pro Monat. Einen <Link href="/termin">kostenlosen Beratungstermin</Link> können Sie direkt online vereinbaren.</p>

          <h2>Die zwei Abrechnungswege im Vergleich</h2>
          <p>Für den Abruf der 131 Euro gibt es zwei Wege — und die Wahl macht im Alltag einen großen Unterschied:</p>
          <ul>
            <li><strong>Kostenerstattung:</strong> Sie bezahlen die Leistung zunächst selbst und reichen die Rechnung des anerkannten Anbieters bei Ihrer Pflegekasse ein. Die Kasse erstattet bis zu 131 Euro pro Monat. Nachteil: Sie gehen in Vorleistung, müssen Belege sammeln, Fristen im Blick behalten und auf die Bearbeitung warten. Geht eine Rechnung verloren, gibt es keine Erstattung.</li>
            <li><strong>Direktabrechnung per Abtretungserklärung:</strong> Sie unterschreiben einmalig eine Abtretungserklärung. Danach rechnet der Anbieter direkt mit der Pflegekasse ab — kein Papierkram, keine Vorleistung, kein Risiko verlorener Belege. Diesen Weg nutzt Alltagsengel: Ihr Eigenanteil liegt bei 0 Euro.</li>
          </ul>
          <p>Für die allermeisten Familien ist die Direktabrechnung der deutlich bequemere Weg. Die Kostenerstattung lohnt sich vor allem dann, wenn Sie gelegentlich wechselnde Anbieter nutzen, die keine Abtretung anbieten.</p>

          <h2>Ansparen und rückwirkende Nutzung: die Fristen 2026</h2>
          <p>Der Entlastungsbetrag verfällt nicht am Monatsende. Nicht genutzte Beträge werden <strong>automatisch angespart</strong>: Alle Monatsbeträge seit Januar — beziehungsweise seit Anerkennung des Pflegegrads — summieren sich im Kalenderjahr. Restguthaben aus dem Vorjahr bleibt bis zum <strong>30. Juni des Folgejahres</strong> nutzbar; erst danach verfällt es unwiderruflich.</p>
          <p>Konkret für 2026 heißt das: Ungenutzte Beträge aus dem Jahr 2025 konnten noch bis zum 30. Juni 2026 eingesetzt werden. Was Sie 2026 nicht verbrauchen, können Sie noch bis zum 30. Juni 2027 abrufen. Wer also erst jetzt vom Anspruch erfährt, hat nichts endgültig verloren — im Gegenteil: Das aufgelaufene Budget aus den Vormonaten steht in voller Höhe bereit. Wie Sie angespartes Guthaben gezielt abrufen, erklärt der Ratgeber <Link href="/blog/entlastungsbetrag-rueckwirkend">Entlastungsbetrag rückwirkend nutzen</Link> im Detail.</p>

          <h2>Beispielrechnungen: So viel Budget steckt im Entlastungsbetrag</h2>
          <p><strong>Beispiel 1 — später Start im Jahr:</strong> Eine Kundin erhält im März 2026 ihren Pflegegrad 2, nutzt den Entlastungsbetrag aber erst ab September. Ihr stehen dann die angesparten Beträge von März bis September zur Verfügung — 7 × 131 Euro = 917 Euro. Was sie bis Jahresende nicht verbraucht, kann sie noch bis zum 30. Juni 2027 einsetzen.</p>
          <p><strong>Beispiel 2 — volles Jahr nie genutzt:</strong> Ein Kunde mit Pflegegrad 2 hatte den Betrag lange nicht abgerufen. Durch die Übertragungsregel konnte er das angesparte Budget aus dem Vorjahr noch bis zum 30. Juni einsetzen — über 1.500 Euro für regelmäßige Arztbegleitungen und Spaziergänge, die sonst verfallen wären.</p>
          <p><strong>Beispiel 3 — Kombination der Töpfe:</strong> Eine Familie mit Pflegegrad 3 finanziert über den Entlastungsbetrag zwei Nachmittage Betreuung pro Monat. Für den Jahresurlaub der pflegenden Tochter nutzt sie zusätzlich die Verhinderungspflege (3.539 Euro pro Jahr) — zusammen stehen so bis zu 5.111 Euro pro Jahr zur Verfügung. Weitere Praxisbeispiele zeigt der Ratgeber <Link href="/blog/entlastungsbetrag-nutzen">So nutzen Familien die 131 Euro</Link>.</p>

          <h2>Die häufigsten Fehler — und wie Sie sie vermeiden</h2>
          <ul>
            <li><strong>Den Anspruch gar nicht kennen:</strong> Ein Großteil der Berechtigten ruft die 131 Euro nie ab. Der Anspruch besteht automatisch mit dem Pflegegrad — es gibt keinen Grund zu warten.</li>
            <li><strong>Die Juni-Frist verpassen:</strong> Restguthaben aus dem Vorjahr verfällt am 30. Juni. Wer im Frühjahr angespartes Budget hat, sollte es gezielt bis dahin einsetzen — zum Beispiel für zusätzliche Betreuungsstunden.</li>
            <li><strong>Nicht anerkannte Helfer bezahlen:</strong> Rechnungen von Privatpersonen ohne Anerkennung nach Landesrecht erstattet die Kasse nicht — auch nicht rückwirkend. Zulassung des Anbieters immer vorher prüfen.</li>
            <li><strong>Belege verlieren:</strong> Beim Kostenerstattungsweg gilt: keine Rechnung, keine Erstattung. Die Direktabrechnung per Abtretungserklärung umgeht das Problem komplett.</li>
            <li><strong>Mit der Verhinderungspflege verwechseln:</strong> Der Entlastungsbetrag darf nicht für Verhinderungspflege eingesetzt werden — das ist ein eigener Topf. Wer beide kennt, schöpft bis zu 5.111 Euro pro Jahr aus.</li>
            <li><strong>Auf Barauszahlung hoffen:</strong> Der Betrag ist zweckgebunden. Eine Auszahlung aufs eigene Konto ohne Leistungsnachweis ist gesetzlich ausgeschlossen — planen Sie ihn deshalb als Dienstleistungsbudget, nicht als Geldleistung.</li>
          </ul>

          <h2>Das ist 2026 wichtig</h2>
          <p>Für 2026 gilt unverändert der Betrag von 131 Euro pro Monat (1.572 Euro pro Jahr). Wer den Entlastungsbetrag noch nie genutzt hat, sollte zwei Daten im Kalender markieren: den <strong>31. Dezember 2026</strong> als Ende des laufenden Ansparjahres und den <strong>30. Juni 2027</strong> als letzte Frist für das Restguthaben aus 2026. Sinnvoll ist außerdem ein Blick auf das Gesamtbudget: Neben dem Entlastungsbetrag stehen je nach Pflegegrad Verhinderungspflege, Pflegebox und der Umwandlungsanspruch aus Pflegesachleistungen bereit. Alle Beträge und Fristen im Zusammenspiel erklärt die große Übersichtsseite zum <Link href="/entlastungsbetrag">Entlastungsbetrag</Link>.</p>

          <h2>Wie Alltagsengel Ihnen hilft</h2>
          <p>Die Abrechnung des Entlastungsbetrags kann kompliziert wirken, besonders wenn Sie bereits Pflegeverantwortung tragen. Alltagsengel nimmt Ihnen den kompletten Ablauf ab: Sie registrieren sich kostenlos, wählen einen Alltagsbegleiter in Ihrer Stadt und unterschreiben einmalig die Abtretungserklärung — digital, in wenigen Minuten. Ab dann rechnen wir jede Stunde direkt mit Ihrer Pflegekasse ab. Sie gehen nicht in Vorleistung, reichen keine Belege ein und behalten trotzdem jederzeit den Überblick über Ihr Budget. So nutzen Sie Ihre 131 Euro monatlich sicher, ohne sich mit bürokratischen Details zu belasten.</p>

          <h2>Häufige Fragen zum Entlastungsbetrag 2026</h2>
          {faqData.map((faq) => (
            <details className="info-faq" key={faq.frage}>
              <summary>{faq.frage}</summary>
              <p>{faq.antwort}</p>
            </details>
          ))}
        </div>

        <div className="blog-cta">
          <h3>Jetzt Alltagsengel testen</h3>
          <p>Vereinbaren Sie einen kostenlosen Termin und finden Sie geprüfte Alltagsbegleiter, die Ihren Entlastungsbetrag direkt mit der Pflegekasse abrechnen.</p>
          <Link href="/termin" className="btn-gold">Jetzt kostenlos starten</Link>
        </div>

        <p style={{ marginTop: 32, fontSize: 15 }}>
          <strong>Alles Wichtige auf einen Blick:</strong>{' '}
          <Link href="/entlastungsbetrag">Zum großen Entlastungsbetrag-Ratgeber — 131 €/Monat nutzen</Link>
        </p>

        <RelatedPosts slug="entlastungsbetrag-beantragen" />
      </article>
    </main>
  );
}
