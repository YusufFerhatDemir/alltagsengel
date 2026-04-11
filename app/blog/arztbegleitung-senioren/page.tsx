import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Arztbegleitung für Senioren: Sicher zum Termin und zurück',
  description: 'Warum Arztbegleitung für Senioren wichtig ist. Erfahren Sie, was ein Begleiter beim Arzttermin macht und wie Sie über AlltagsEngel eine geeignete Begleitperson finden.',
  keywords: 'Arztbegleitung Senioren, Arzt Begleitung, Alltagsbegleiter, Pflege, Seniorenbetreuung',
  openGraph: {
    title: 'Arztbegleitung für Senioren: Sicher zum Termin und zurück',
    description: 'Vollständiger Leitfaden zur Arztbegleitung für ältere Menschen.',
    type: 'article',
    publishedTime: '2026-03-25',
  },
};

export default function ArztbegleitungPage() {
  return (
    <main className="blog-container">
      <article className="blog-article">
        <header className="blog-header">
          <h1>Arztbegleitung für Senioren: Sicher zum Termin und zurück</h1>
          <div className="blog-meta">
            <span className="date">25. März 2026</span>
            <span className="reading-time">5 Min. Lesezeit</span>
          </div>
        </header>

        <div className="blog-intro">
          <p>
            Ärztliche Termine sind stressig – besonders für Senioren. Anfahrtsweg, Wartezeit, komplexe Informationen: Eine vertraute Begleitperson macht den Arztbesuch deutlich einfacher und gibt Sicherheit. Entdecken Sie, warum Arztbegleitung so wertvoll ist und wie Sie die passende Begleitperson finden.
          </p>
        </div>

        <div className="blog-content">
          <h2>Warum ist Arztbegleitung für Senioren so wichtig?</h2>
          <p>
            Mit dem Alter entstehen beim Arztbesuch zusätzliche Herausforderungen:
          </p>
          <ul>
            <li><strong>Mobilität:</strong> Der Weg zur Praxis, das Warten – körperlich anstrengend</li>
            <li><strong>Sicherheit:</strong> Sturzgefahr im Wartezimmer, in der Praxis, auf der Toilette</li>
            <li><strong>Verständnis:</strong> Medizinische Informationen sind komplex, eine zweite Stimme hilft</li>
            <li><strong>Einsamkeit:</strong> Ein vertrauter Mensch an der Seite reduziert Angst</li>
            <li><strong>Gedächtnis:</strong> Ein Begleiter kann sich Informationen und Anweisungen merken</li>
            <li><strong>Fragen stellen:</strong> Manche Senioren trauen sich nicht, Fragen zu stellen – ein Begleiter kann helfen</li>
          </ul>

          <h2>Was macht ein Begleiter beim Arzttermin?</h2>
          <p>
            Ein guter Alltagsbegleiter bei einem Arzttermin ist verantwortlich für:
          </p>
          <p>
            <strong>Vor dem Termin:</strong>
          </p>
          <ul>
            <li>Fahrt zur Praxis oder zum Krankenhaus organisieren</li>
            <li>Dokumentation und Versicherungskarte mitnehmen</li>
            <li>Aktuelle Medikamentenliste zusammenstellen</li>
            <li>Fragen aufschreiben, die der Arzt beantworten soll</li>
          </ul>

          <p>
            <strong>Während des Termins:</strong>
          </p>
          <ul>
            <li>Im Wartezimmer die ganze Zeit dabei sein (für Sicherheit und Orientierung)</li>
            <li>Falls erlaubt, mit in den Untersuchungsraum gehen</li>
            <li>Sich Informationen und Anweisungen notieren</li>
            <li>Bei Verständnisproblemen nachfragen</li>
            <li>Emotionale Unterstützung geben</li>
          </ul>

          <p>
            <strong>Nach dem Termin:</strong>
          </p>
          <ul>
            <li>Rezepte oder Überweisung in die Apotheke oder zum nächsten Arzt bringen</li>
            <li>Mit dem Senior die Anweisungen des Arztes besprechen</li>
            <li>Sicher nach Hause fahren</li>
            <li>Falls nötig, Medikation erklären und organisieren</li>
          </ul>

          <h2>Unterschied: Arztbegleiter vs. Pflegefachkraft</h2>
          <p>
            Ein <strong>Arztbegleiter</strong> ist ein Alltagsbegleiter ohne medizinische Ausbildung. Er unterstützt, organisiert und ist da für emotionale Sicherheit.
          </p>
          <p>
            Eine <strong>Pflegefachkraft</strong> hat medizinische Ausbildung und kann auch medizinische Aufgaben übernehmen (Verbandswechsel, Spritze, etc.).
          </p>
          <p>
            Für die meisten Arztbesuche reicht ein gut geschulter Alltagsbegleiter völlig aus. Für komplexere medizinische Fragen nach einem Termin können Sie später einen Pflegefachkraft hinzuziehen.
          </p>

          <h2>Kosten für Arztbegleitung</h2>
          <p>
            <strong>Privat:</strong> 15–25€ pro Stunde
          </p>
          <p>
            <strong>Über Pflegekasse (§45b):</strong> Bis zu 125€ monatlich für Betreuungsleistungen (darin enthalten: Arztbegleitung, Einkaufen, Spaziergänge, etc.)
          </p>
          <p>
            <strong>Über Verhinderungspflege:</strong> Bis zu 1.612€ pro Jahr
          </p>
          <p>
            <strong>Tipp:</strong> Viele Krankenkassen zahlen regelmäßige Arztbegleitungen aus der §45b-Quote. Fragen Sie Ihre Kasse!
          </p>

          <h2>Wie finden Sie die richtige Arztbegleitperson?</h2>
          <p>
            <strong>Über AlltagsEngel:</strong>
          </p>
          <ol>
            <li>Registrieren Sie sich (kostenlos)</li>
            <li>Erstellen Sie eine Anfrage: „Arztbegleitung, Zahnarzt Dr. Schmidt, Donnerstag 10 Uhr"</li>
            <li>Wählen Sie einen geprüften Begleiter</li>
            <li>Besprechen Sie Besonderheiten (z. B. Sie wollen, dass der Begleiter in den Behandlungsraum kommt)</li>
            <li>Der Begleiter begleitet Sie zum Termin</li>
          </ol>

          <h2>Fragen, die Sie vor Buchung stellen sollten</h2>
          <ul>
            <li>Haben Sie Erfahrung mit Arztbegleitungen?</li>
            <li>Sind Sie diskret und können Vertrauliches für sich behalten?</li>
            <li>Können Sie zuverlässig pünktlich sein?</li>
            <li>Fahren Sie selbst oder können wir ein Taxi nehmen?</li>
            <li>Wie gehen Sie mit Notfallsituationen um?</li>
          </ul>

          <h2>Tipps für eine erfolgreiche Arztbegleitung</h2>
          <ul>
            <li><strong>Vorher besprechen:</strong> Sagen Sie dem Begleiter, worum es beim Termin geht (Routine-Check, neue Symptome, etc.)</li>
            <li><strong>Liste mitnehmen:</strong> Eine schriftliche Liste mit allen aktuellen Medikamenten ist wertvoll</li>
            <li><strong>Fragen aufschreiben:</strong> So vergisst der Senior keine Frage beim Arzt</li>
            <li><strong>Notizen machen:</strong> Der Begleiter sollte die Anweisungen des Arztes notieren</li>
            <li><strong>Ruhe gönnen:</strong> Nach dem Termin sollte der Senior sich ausruhen können</li>
          </ul>

          <h2>Häufig gestellte Fragen</h2>
          <p>
            <strong>Darf die Begleitperson mit in den Behandlungsraum?</strong>
            <br />
            Das entscheidet der Arzt und der Patient. Machen Sie das vorher ab.
          </p>
          <p>
            <strong>Was ist mit privatem Arzt – bezahlt das die Kasse?</strong>
            <br />
            Bei Privatpatienten zahlt die Krankenkasse normalerweise nicht. Dann zahlen Sie privat.
          </p>
          <p>
            <strong>Kann die Begleitperson auch Medikamente abholen?</strong>
            <br />
            Ja, wenn Sie eine schriftliche Vollmacht geben.
          </p>

          <div className="blog-cta">
            <h3>Jetzt AlltagsEngel testen</h3>
            <p>Registrieren Sie sich kostenlos und finden Sie sofort Unterstützung in Ihrer Region.</p>
            <Link href="/choose" className="btn-gold">Kostenlos registrieren</Link>
          </div>
        </div>
      </article>
    </main>
  );
}
