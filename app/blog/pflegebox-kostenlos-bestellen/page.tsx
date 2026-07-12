import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Pflegebox kostenlos bestellen: Schritt-für-Schritt-Anleitung',
  description: 'Pflegebox kostenlos bestellen — Schritt für Schritt: Anspruch bei Pflegegrad 1–5 prüfen, Antrag stellen, monatlich bis zu 42 € Pflegehilfsmittel erhalten.',
  keywords: ['Pflegebox bestellen', 'Pflegebox kostenlos', 'Pflegehilfsmittel bestellen', 'Pflegebox Pflegekasse', 'Pflegebox 42 Euro', 'Hygienebox bestellen', 'Pflegehilfsmittel kostenlos', 'Pflegebox Anleitung'],
  alternates: { canonical: 'https://alltagsengel.care/blog/pflegebox-kostenlos-bestellen' },
  openGraph: {
    title: 'Pflegebox kostenlos bestellen: Schritt-für-Schritt-Anleitung',
    description: 'Pflegehilfsmittel kostenlos von der Pflegekasse. Bis zu 42 € monatlich. Schritt für Schritt zur ersten Pflegebox.',
    url: 'https://alltagsengel.care/blog/pflegebox-kostenlos-bestellen',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Pflegebox kostenlos bestellen: Schritt-für-Schritt-Anleitung',
  description: 'Pflegebox kostenlos bestellen — Schritt für Schritt: Anspruch bei Pflegegrad 1–5 prüfen, Antrag stellen, monatlich bis zu 42 € Pflegehilfsmittel erhalten.',
  author: { '@type': 'Organization', name: 'Alltagsengel' },
  publisher: {
    '@type': 'Organization',
    name: 'Alltagsengel',
    url: 'https://alltagsengel.care',
    logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' },
  },
  datePublished: '2026-06-04',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/pflegebox-kostenlos-bestellen',
}

const faqData = [
  { q: 'Ist die Pflegebox wirklich kostenlos?', a: 'Ja. Bei anerkanntem Pflegegrad (1–5) übernimmt die Pflegekasse nach §40 SGB XI bis zu 42 € monatlich für Pflegehilfsmittel zum Verbrauch. Ihr Eigenanteil beträgt 0 €.' },
  { q: 'Was ist in der Pflegebox enthalten?', a: 'Einmalhandschuhe, Händedesinfektion, Flächendesinfektion, Bettschutzeinlagen, Mund-Nasen-Schutz und Schutzschürzen. Den Inhalt können Sie in der App individuell anpassen.' },
  { q: 'Wie bestelle ich die Pflegebox?', a: 'Registrieren Sie sich kostenlos bei Alltagsengel, geben Sie Ihren Pflegegrad an, und wir kümmern uns um den Antrag bei Ihrer Pflegekasse. Die erste Box kommt innerhalb weniger Werktage.' },
  { q: 'Muss ich einen Antrag bei der Pflegekasse stellen?', a: 'Nein — wir übernehmen die komplette Antragstellung und Abrechnung mit Ihrer Pflegekasse. Sie unterschreiben nur einmalig eine Vollmacht, den Rest erledigt Alltagsengel.' },
  { q: 'Brauche ich ein Rezept vom Arzt für die Pflegebox?', a: 'Nein. Für Pflegehilfsmittel zum Verbrauch genügt der anerkannte Pflegegrad als Nachweis. Der Antrag geht direkt an die Pflegekasse — ganz ohne Arztbesuch.' },
  { q: 'Wie oft wird die Pflegebox geliefert?', a: 'Monatlich, automatisch und direkt zu Ihnen nach Hause. Ohne dass Sie sich jeden Monat neu darum kümmern müssen — die Lieferung ist versandkostenfrei.' },
  { q: 'Kann ich von einem anderen Pflegebox-Anbieter wechseln?', a: 'Ja, jederzeit. Sie kündigen beim alten Anbieter — es gibt keine Mindestlaufzeiten — und bestellen bei Alltagsengel neu. Wir stellen den Antrag bei Ihrer Pflegekasse auf uns um, damit die 42-€-Pauschale nicht doppelt abgerechnet wird.' },
  { q: 'Kann ich die Pflegebox jederzeit kündigen?', a: 'Ja. Keine Bindung, keine Mindestlaufzeit. Sie können jederzeit kündigen oder pausieren — zum Beispiel während eines Krankenhausaufenthalts.' },
]

const jsonLdFAQ = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqData.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function PflegeboxBestellenPage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Pflegebox kostenlos bestellen' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }} />

      <article className="blog-article">
        <header className="blog-header">
          <h1>Pflegebox kostenlos bestellen: Schritt-für-Schritt-Anleitung</h1>
          <p className="blog-meta">Veröffentlicht am 4. Juni 2026 | Aktualisiert am 12. Juli 2026 | 9 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Sie pflegen einen Angehörigen und brauchen regelmäßig Handschuhe, Desinfektion und Bettschutz?
            Mit der <strong>Pflegebox von Alltagsengel</strong> erhalten Sie jeden Monat Pflegehilfsmittel
            im Wert von bis zu <strong>42 €</strong> — komplett kostenlos, bezahlt von der Pflegekasse.
            Diese Anleitung führt Sie Schritt für Schritt durch die Bestellung: von der Anspruchsprüfung
            über den Antrag bis zur ersten Lieferung. Und sie erklärt, was Sie tun können, wenn die
            Pflegekasse einmal ablehnt.
          </p>

          <h2>42 € monatlich — Ihr Anspruch nach §40 SGB XI</h2>
          <p>
            Das Sozialgesetzbuch garantiert jedem Menschen mit Pflegegrad 1–5 einen monatlichen Anspruch
            auf Pflegehilfsmittel zum Verbrauch. Die Pflegekasse zahlt bis zu <strong>42 € pro Monat</strong> —
            das sind bis zu <strong>504 € pro Jahr</strong>. Ihr Eigenanteil: <strong>0 €</strong>.
            Die Pauschale wurde zum 01.01.2025 von 40 € auf 42 € erhöht.
          </p>
          <p>
            Trotzdem nutzen Millionen Pflegebedürftige diese Leistung nicht — weil sie davon nicht wissen
            oder den Antrag scheuen. Dabei ist der Weg zur kostenlosen Pflegebox bewusst einfach gehalten:
            Ein ärztliches Rezept ist nicht nötig, der anerkannte Pflegegrad genügt als Nachweis. Welche
            Produkte im Detail erstattungsfähig sind, erklärt unser Ratgeber
            <Link href="/blog/pflegehilfsmittel-40-euro"> Pflegehilfsmittel nach §40 SGB XI</Link>.
          </p>
          <p>
            Wichtig zu wissen: Die 42 € sind eine <strong>Monatspauschale</strong>. Nicht genutzte Beträge
            verfallen am Monatsende und lassen sich — anders als der{' '}
            <Link href="/entlastungsbetrag">Entlastungsbetrag von 131 €/Monat</Link>, der bis zum
            30. Juni des Folgejahres angespart werden kann — nicht übertragen. Eine laufende monatliche
            Lieferung schöpft das Budget deshalb am besten aus.
          </p>

          <h2>Anspruchsvoraussetzungen im Detail: Wer bekommt die Pflegebox?</h2>
          <p>
            Der Anspruch nach §40 SGB XI ist an drei Bedingungen geknüpft — und alle drei sind bewusst
            niedrigschwellig gehalten:
          </p>
          <ul className="blog-list">
            <li><strong>Anerkannter Pflegegrad 1 bis 5:</strong> Schon der niedrigste Pflegegrad genügt.
              Gerade bei Pflegegrad 1, wo es weder Pflegegeld noch Pflegesachleistungen gibt, ist die
              Pflegebox eine der wenigen Leistungen, die voll ausgeschöpft werden können.</li>
            <li><strong>Pflege in häuslicher Umgebung:</strong> Zu Hause, bei Angehörigen oder in einer
              Wohngemeinschaft — nicht im Pflegeheim. Dort stellt die Einrichtung die Hygieneprodukte.</li>
            <li><strong>Pflege durch Angehörige, Freunde, Nachbarn oder einen ambulanten Dienst:</strong>{' '}
              Die Pflege muss mindestens teilweise nicht-professionell erfolgen.</li>
          </ul>
          <p>
            Damit steht die Pflegebox praktisch jedem Pflegehaushalt zu. Auch privat Pflegeversicherte
            haben denselben Anspruch — die Abwicklung läuft dort je nach Versicherer über Kostenerstattung.
            Sie sind unsicher, ob ein Pflegegrad vorliegt oder beantragt werden sollte? Unser kostenloser{' '}
            <Link href="/pflegegrad-check">Pflegegrad-Check</Link> gibt Ihnen in wenigen Minuten eine
            erste Einschätzung.
          </p>

          <h2>Das ist in der Pflegebox</h2>
          <ul className="blog-list">
            <li><strong>Einmalhandschuhe</strong> — Latex oder Nitril, in verschiedenen Größen</li>
            <li><strong>Händedesinfektion</strong> — für die tägliche Hygiene vor und nach der Pflege</li>
            <li><strong>Flächendesinfektion</strong> — für Pflegebett, Nachttisch und Hilfsmittel</li>
            <li><strong>Bettschutzeinlagen</strong> — saugstark und hautfreundlich, zum Einmalgebrauch</li>
            <li><strong>Mund-Nasen-Schutz / FFP2-Masken</strong> — Schutz bei der Pflege</li>
            <li><strong>Schutzschürzen</strong> — Einmalschürzen für den Pflegealltag</li>
          </ul>
          <p>
            Alle Produkte stammen aus dem Pflegehilfsmittelverzeichnis der Pflegekassen (Produktgruppe 54) —
            nur so ist die volle Erstattung gesichert. Bei Alltagsengel wählen Sie zwischen der{' '}
            <strong>Basis-Box</strong> (Grundversorgung) und der <strong>Komfort-Box</strong>, die die
            Kassenerstattung maximal ausschöpft. Alle Details zu den Paketen finden Sie auf unserer{' '}
            <Link href="/hygienebox">Pflegebox-Seite</Link>.
          </p>

          <h2>Schritt 1: Anspruch prüfen — Pflegegrad und häusliche Pflege</h2>
          <p>
            Bevor Sie bestellen, klären Sie zwei Fragen: Liegt ein anerkannter Pflegegrad (1–5) vor?
            Und wird die pflegebedürftige Person zu Hause versorgt? Wenn Sie beide Fragen mit Ja
            beantworten, steht dem Anspruch nichts im Weg. Halten Sie für die Bestellung den
            Pflegegrad-Bescheid und die Versichertennummer bereit — mehr Unterlagen brauchen Sie nicht.
          </p>
          <p>
            Falls noch kein Pflegegrad vorliegt, lohnt sich der Antrag bei der Pflegekasse fast immer:
            Schon Pflegegrad 1 öffnet den Zugang zur Pflegebox und zum Entlastungsbetrag. Der{' '}
            <Link href="/pflegegrad-check">Pflegegrad-Check von Alltagsengel</Link> hilft Ihnen bei der
            Einschätzung, und in einem kostenlosen <Link href="/termin">Beratungstermin</Link> besprechen
            wir gemeinsam, welche Leistungen Ihnen zustehen.
          </p>

          <h2>Schritt 2: Box auswählen und kostenlos registrieren</h2>
          <p>
            Die eigentliche Bestellung dauert etwa zwei Minuten: Sie registrieren sich kostenlos bei
            Alltagsengel — online oder in der App — und wählen Ihre Wunsch-Box aus. Die Basis-Box deckt
            die Grundversorgung ab, die Komfort-Box nutzt die 42-€-Pauschale vollständig aus. Bei beiden
            gilt: <strong>0 € Eigenanteil</strong>, keine Versandkosten, keine Vertragsbindung.
          </p>
          <p>
            Schon bei der Auswahl legen Sie fest, welche Produkte in welcher Menge und Größe enthalten
            sein sollen — etwa Handschuhe in Größe M statt L oder mehr Bettschutzeinlagen und weniger
            Schürzen. Keine Sorge: Diese Zusammenstellung ist nicht in Stein gemeißelt, Sie können sie
            später jederzeit ändern.
          </p>

          <h2>Schritt 3: Pflegegrad angeben und Vollmacht unterschreiben</h2>
          <p>
            Im nächsten Schritt geben Sie den Pflegegrad, die Pflegekasse und die Versichertendaten der
            pflegebedürftigen Person an. Damit Alltagsengel den Antrag für Sie stellen darf, unterschreiben
            Sie einmalig eine Vollmacht — digital, ohne Ausdrucken und ohne Behördengang. Das ist der
            einzige Papierkram der gesamten Bestellung, und auch der läuft komplett online.
          </p>
          <p>
            Bestellen kann übrigens auch ein Angehöriger für die pflegebedürftige Person — zum Beispiel
            die Tochter für die Mutter. Wichtig ist nur, dass die Angaben zur versicherten Person gehören,
            für die der Pflegegrad anerkannt wurde.
          </p>

          <h2>Schritt 4: Alltagsengel stellt den Antrag bei der Pflegekasse</h2>
          <p>
            Jetzt sind wir dran: Alltagsengel füllt den Antrag auf Pflegehilfsmittel aus, reicht ihn bei
            Ihrer Pflegekasse ein und übernimmt die gesamte Kommunikation. Der Antrag besteht aus einem
            kurzen Formular mit Versichertendaten, Pflegegrad und der gewünschten Produktzusammenstellung.
            Ein ärztliches Rezept ist <strong>nicht</strong> erforderlich — der Pflegegrad genügt als
            Nachweis. Sie müssen in dieser Phase nichts weiter tun.
          </p>

          <h2>Was passiert nach der Bestellung? Genehmigung und erste Lieferung</h2>
          <p>
            Die Genehmigung durch die Pflegekasse dauert in der Regel <strong>wenige Tage bis zwei
            Wochen</strong>. Sobald sie vorliegt, gilt sie dauerhaft: Solange der Pflegegrad besteht,
            läuft die monatliche Lieferung automatisch weiter — Sie müssen den Antrag nicht jedes Jahr
            erneuern. Die erste Box kommt innerhalb weniger Werktage direkt zu Ihnen nach Hause,
            versandkostenfrei.
          </p>
          <p>
            Ab dann funktioniert alles von selbst: Jeden Monat kommt eine neue Box, die Abrechnung läuft
            direkt zwischen Alltagsengel und Ihrer Pflegekasse. Sie sehen keine Rechnung, reichen keine
            Quittungen ein und zahlen keinen Cent dazu. Auch bei einem Kassenwechsel kümmern wir uns um
            die Umstellung — die Genehmigung muss dann bei der neuen Pflegekasse neu beantragt werden,
            die Lieferung läuft in der Regel ohne Unterbrechung weiter.
          </p>

          <h2>Box-Inhalt individuell anpassen</h2>
          <p>
            Der Pflegebedarf ändert sich — und die Pflegebox sollte mitgehen. Deshalb können Sie die
            Zusammenstellung jederzeit in der App anpassen: Produkte tauschen, Mengen erhöhen oder
            reduzieren, Größen ändern. Die Anpassung gilt ab der nächsten Monatslieferung.
          </p>
          <ul className="blog-list">
            <li><strong>Handschuhgröße richtig wählen:</strong> Zu große Handschuhe rutschen, zu kleine
              reißen. Meist passt S/M für Frauen und M/L für Männer — bei Latexallergie Nitril wählen.</li>
            <li><strong>Bettschutz nach Bedarf dosieren:</strong> Bei leichter Inkontinenz genügen wenige
              Einlagen pro Woche, bei stärkerer lohnt der tägliche Wechsel.</li>
            <li><strong>Verbrauch beobachten:</strong> Je nach Pflegeintensität werden schnell 100 bis
              200 Handschuhe im Monat verbraucht — passen Sie die Menge an, statt Produkte zu horten,
              die Sie nicht brauchen.</li>
          </ul>

          <h2>Pflegebox vs. Einzelkauf: Warum sich die Box lohnt</h2>
          <p>
            Handschuhe und Desinfektionsmittel gibt es natürlich auch in Apotheke und Drogerie — aber
            dann zahlen Sie selbst, obwohl Ihnen die Kasse 42 € monatlich erstattet. Die Kostenerstattung
            für Einzelkäufe ist zwar theoretisch möglich, scheitert in der Praxis aber oft: Jede Quittung
            muss einzeln eingereicht werden, nicht gelistete Produkte werden abgelehnt, und wer einen
            Monat vergisst, verliert die Pauschale ersatzlos.
          </p>
          <p>
            Die Pflegebox löst alle drei Probleme auf einmal: Es kommen ausschließlich erstattungsfähige
            Produkte aus dem Hilfsmittelverzeichnis, die Abrechnung läuft direkt mit der Pflegekasse, und
            die monatliche Lieferung stellt sicher, dass kein Anspruch verfällt. Dazu kommt der praktische
            Vorteil: keine schweren Einkäufe, kein Vergessen, kein Vergleichen von Packungsgrößen — das
            Material ist einfach da, wenn es gebraucht wird.
          </p>

          <h2>Wechsel von einem anderen Anbieter zu Alltagsengel</h2>
          <p>
            Sie beziehen schon eine Pflegebox, sind aber unzufrieden — etwa wegen starrer Zusammenstellung,
            schlechter Erreichbarkeit oder Papierformularen? Der Wechsel ist unkompliziert: Pflegebox-Abos
            haben keine Mindestlaufzeit, Sie können beim bisherigen Anbieter jederzeit kündigen.
          </p>
          <ol className="blog-list">
            <li><strong>Beim alten Anbieter kündigen:</strong> Formlos per E-Mail genügt in der Regel.
              Notieren Sie sich, bis wann die letzte Box geliefert wird.</li>
            <li><strong>Bei Alltagsengel bestellen:</strong> Registrieren, Box wählen, Vollmacht
              unterschreiben — wie in den Schritten oben beschrieben.</li>
            <li><strong>Umstellung abwarten:</strong> Wir informieren Ihre Pflegekasse, dass die
              Versorgung künftig über Alltagsengel läuft. So wird die 42-€-Pauschale nicht doppelt
              abgerechnet und es entsteht keine Versorgungslücke.</li>
          </ol>
          <p>
            Ihr Anspruch geht beim Wechsel nicht verloren — die Pauschale ist an die versicherte Person
            gebunden, nicht an den Anbieter.
          </p>

          <h2>Typische Ablehnungsgründe — und was Sie dann tun können</h2>
          <p>
            Ablehnungen sind bei der Pflegebox selten, kommen aber vor. Die häufigsten Gründe — und wie
            Sie darauf reagieren:
          </p>
          <ul className="blog-list">
            <li><strong>Kein anerkannter Pflegegrad:</strong> Ohne Pflegegrad kein Anspruch nach §40
              SGB XI. Lösung: Pflegegrad bei der Pflegekasse beantragen — unser{' '}
              <Link href="/pflegegrad-check">Pflegegrad-Check</Link> zeigt, ob sich der Antrag lohnt.</li>
            <li><strong>Versorgung im Pflegeheim:</strong> Der Anspruch gilt nur für die häusliche
              Pflege. Bei vollstationärer Versorgung stellt die Einrichtung die Hygieneprodukte.</li>
            <li><strong>Pauschale bereits ausgeschöpft:</strong> Läuft noch ein Vertrag mit einem anderen
              Anbieter, lehnt die Kasse die Doppelversorgung ab. Lösung: Beim alten Anbieter kündigen und
              den Wechsel wie oben beschrieben durchführen.</li>
            <li><strong>Fehlende oder unvollständige Angaben:</strong> Falsche Versichertennummer oder
              fehlende Vollmacht verzögern die Genehmigung. Bei Alltagsengel prüfen wir die Unterlagen
              vor dem Einreichen — und haken bei der Kasse nach, wenn etwas fehlt.</li>
          </ul>
          <p>
            Wichtig: Eine Ablehnung ist kein endgültiges Nein. Gegen einen ablehnenden Bescheid können
            Sie innerhalb eines Monats Widerspruch einlegen. In den meisten Fällen lässt sich das Problem
            aber schon vorher lösen — sprechen Sie uns einfach an, wir kennen die Anforderungen der
            Pflegekassen und helfen bei der Klärung.
          </p>

          <h2>Pflegebox mit anderen Leistungen kombinieren</h2>
          <p>
            Die 42 € für Pflegehilfsmittel sind ein eigenständiger Anspruch — sie werden auf keine andere
            Leistung angerechnet, weder auf das Pflegegeld noch auf den{' '}
            <Link href="/entlastungsbetrag">Entlastungsbetrag von 131 €/Monat</Link>. Auch technische
            Pflegehilfsmittel wie Pflegebetten oder Hausnotruf laufen separat und mindern die Pauschale
            nicht. Zusammen mit dem Entlastungsbetrag stehen so schon bei Pflegegrad 1 monatlich{' '}
            <strong>173 €</strong> an konkreten Leistungen bereit.
          </p>
          <p>
            Welche Budgets Ihnen insgesamt zustehen und wie Sie sie kombinieren, besprechen wir gern
            persönlich — <Link href="/termin">vereinbaren Sie einfach einen kostenlosen Termin</Link>.
          </p>

          <h2>Warum Alltagsengel statt andere Anbieter?</h2>
          <ul className="blog-list">
            <li><strong>Alles digital:</strong> Kein Papierkram, alles in der App</li>
            <li><strong>Antrag inklusive:</strong> Wir kümmern uns um die Pflegekasse</li>
            <li><strong>Flexibel:</strong> Inhalt anpassbar, jederzeit kündbar</li>
            <li><strong>Regional:</strong> Sitz in Frankfurt, Lieferung deutschlandweit</li>
            <li><strong>Sozial:</strong> 1 € jeder Bestellung geht an Kinder und Familien in Not</li>
          </ul>

          <h2>Häufige Fragen zur Pflegebox</h2>
          <div className="blog-faq">
            {faqData.map((f, i) => (
              <details key={i} className="lp-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>

          <div className="blog-cta">
            <h2>Pflegebox jetzt kostenlos bestellen</h2>
            <p>0 € Eigenanteil. Keine Bindung. Monatlich automatisch geliefert.</p>
            <Link href="/pflegebox" className="btn-gold">JETZT BESTELLEN</Link>
          </div>

          <RelatedPosts slug="pflegebox-kostenlos-bestellen" />
        </div>
      </article>
    </main>
  )
}
