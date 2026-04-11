import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Einkaufshilfe für Senioren: So klappt der Einkauf mit Begleitung',
  description: 'Praktischer Leitfaden für Einkaufshilfen bei Senioren. Erfahren Sie, wie Begleitungsdienste funktionieren, welche Kosten entstehen und wie Sie über AlltagsEngel buchen.',
  keywords: 'Einkaufshilfe Senioren, Einkaufsbegleitung, Einkaufsdienst, Begleitperson, Pflege',
  openGraph: {
    title: 'Einkaufshilfe für Senioren: So klappt der Einkauf mit Begleitung',
    description: 'Finden Sie die richtige Einkaufshilfe für Ihre Senioren im Alter.',
    type: 'article',
    publishedTime: '2026-03-20',
  },
};

export default function EinkaufshilfePage() {
  return (
    <main className="blog-container">
      <article className="blog-article">
        <header className="blog-header">
          <h1>Einkaufshilfe für Senioren: So klappt der Einkauf mit Begleitung</h1>
          <div className="blog-meta">
            <span className="date">20. März 2026</span>
            <span className="reading-time">6 Min. Lesezeit</span>
          </div>
        </header>

        <div className="blog-intro">
          <p>
            Einkaufen gehen – für viele Senioren wird diese alltägliche Aufgabe mit den Jahren zur Herausforderung. Schwere Taschen, lange Strecken, Gedränge im Supermarkt: Eine Einkaufshilfe macht das Einkaufen sicher, stressfreier und sozialer. Dieser Leitfaden zeigt Ihnen, wie Einkaufshilfen funktionieren und wie Sie die richtige Begleitung finden.
          </p>
        </div>

        <div className="blog-content">
          <h2>Warum ist Einkaufshilfe für Senioren wichtig?</h2>
          <p>
            Mit zunehmendem Alter werden alltägliche Aufgaben anspruchsvoller. Einkaufen erfordert körperliche Kraft (schwere Taschen tragen), Balance (lange Gehstrecken) und oft auch emotionale Überwindung (Gedränge, Stress). Eine Einkaufshilfe ermöglicht es Senioren, länger unabhängig zu leben und gleichzeitig ihre Sicherheit zu gewährleisten.
          </p>

          <h2>Was macht eine Einkaufshilfe konkret?</h2>
          <p>
            Eine gute Einkaufshilfe (auch „Alltagsbegleiter" genannt) übernimmt folgende Aufgaben:
          </p>
          <ul>
            <li><strong>Begleitung zum Supermarkt:</strong> Transport, Sicherheit, Unterstützung beim Gehen</li>
            <li><strong>Einkaufsplanung:</strong> Einkaufliste erstellen, Mahlzeiten planen</li>
            <li><strong>Auswahl unterstützen:</strong> Bei Produktwahl helfen, Haltbarkeitsdatum prüfen</li>
            <li><strong>Taschen tragen:</strong> Schwere Waren nach Hause transportieren</li>
            <li><strong>Soziale Interaktion:</strong> Mit dem Senior sprechen, Zeit verbringen, soziale Kontakte fördern</li>
            <li><strong>Praktische Hilfe:</strong> Produkte abladen, Rechnungen zählen, in den Schrank räumen</li>
          </ul>

          <h2>Unterschied zwischen Einkaufshilfe und Einkaufsdienst</h2>
          <p>
            <strong>Einkaufshilfe (Begleitung):</strong> Der Senior geht mit einer Begleitperson zum Einkaufen. Das bedeutet mehr Bewegung, soziale Interaktion und Unabhängigkeit.
          </p>
          <p>
            <strong>Einkaufsdienst:</strong> Eine Dienstleistung fährt einkaufen und bringt die Waren nach Hause – der Senior bleibt zu Hause.
          </p>
          <p>
            Beide haben ihre Vorteile. Einkaufshilfen fördern Bewegung und Selbstbestimmung, Einkaufsdienste sind zeitsparend und geeignet für sehr immobile Menschen.
          </p>

          <h2>Kosten für Einkaufshilfen</h2>
          <p>
            <strong>Private Bezahlung:</strong> 15–25€ pro Stunde, je nach Region und Qualifikation
          </p>
          <p>
            <strong>Über Pflegekasse (§45b):</strong> Viele Krankenkassen zahlen bis zu 125€ pro Monat für Betreuungsleistungen, unter die auch Einkaufshilfen fallen.
          </p>
          <p>
            <strong>Über Verhinderungspflege:</strong> Falls Sie bereits Verhinderungspflege in Anspruch nehmen, können Sie diese auch für Einkaufshilfen nutzen (bis 1.612€ pro Jahr).
          </p>
          <p>
            <strong>Stundensatz bei AlltagsEngel:</strong> Durchschnittlich 18–22€ pro Stunde – darin ist oft bereits eine Gewinnbeteiligung für den Helfer und Versicherung enthalten.
          </p>

          <h2>Wie buchen Sie eine Einkaufshilfe über AlltagsEngel?</h2>
          <p>
            <strong>Schritt 1: Registrieren</strong>
            <br />
            Melden Sie sich auf AlltagsEngel an. Das geht kostenlos und dauert 2 Minuten.
          </p>
          <p>
            <strong>Schritt 2: Anfrage erstellen</strong>
            <br />
            Beschreiben Sie, was Sie brauchen: „Einkaufshilfe beim Supermarkt XY, Dienstag 14 Uhr, 2 Stunden".
          </p>
          <p>
            <strong>Schritt 3: Begleiter auswählen</strong>
            <br />
            Sehen Sie Profile geprüfter Alltagsbegleiter und wählen Sie, wer am besten passt.
          </p>
          <p>
            <strong>Schritt 4: Termin bestätigen</strong>
            <br />
            Nach Bestätigung durch den Begleiter können Sie direkt kommunizieren und Details besprechen.
          </p>

          <h2>Tipps für eine erfolgreiche Einkaufshilfe</h2>
          <ul>
            <li><strong>Einkaufliste vorbereiten:</strong> Das spart Zeit und Stress beim Einkaufen.</li>
            <li><strong>Regelmäßigkeit:</strong> Wöchentliche Einkaufshilfe ist oft sinnvoller als sporadisch.</li>
            <li><strong>Die richtige Person:</strong> Ein Begleiter, mit dem man sich wohlfühlt, macht den Unterschied.</li>
            <li><strong>Kleine Pausen:</strong> Wenn möglich, eine Pause machen (Kaffee, Bank), um Kraft zu sparen.</li>
            <li><strong>Feedback geben:</strong> Sagen Sie dem Begleiter, was gut lief – das hilft beiden.</li>
          </ul>

          <h2>Fragen, die Sie vor Buchung stellen sollten</h2>
          <ul>
            <li>Haben Sie Erfahrung mit älteren Menschen?</li>
            <li>Kennen Sie die Gegend / den Supermarkt?</li>
            <li>Können Sie schwere Taschen tragen?</li>
            <li>Sind Sie geduldig und freundlich im Umgang?</li>
            <li>Wie lange dauert der Einkauf normalerweise?</li>
          </ul>

          <h2>Häufig gestellte Fragen</h2>
          <p>
            <strong>Wird Einkaufshilfe von der Krankenkasse bezahlt?</strong>
            <br />
            Ja, über §45b-Leistungen bis zu 125€ monatlich oder über Verhinderungspflege.
          </p>
          <p>
            <strong>Kann ich eine feste Begleitperson haben?</strong>
            <br />
            Ja, auf AlltagsEngel können Sie mit erfahrenen Begleitern eine regelmäßige Zusammenarbeit aufbauen.
          </p>
          <p>
            <strong>Was ist, wenn ich kurzfristig Hilfe brauche?</strong>
            <br />
            AlltagsEngel hat auch Notfall-Anfragen möglich, je nach Verfügbarkeit in Ihrer Region.
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
