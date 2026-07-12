import type { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Pflegegrad beantragen: Komplette Anleitung 2026',
  description: 'Pflegegrad beantragen 2026: Antrag bei der Pflegekasse, MD-Begutachtung mit Punktesystem, Pflegetagebuch, Fristen und Widerspruch — die komplette Anleitung.',
  keywords: 'Pflegegrad beantragen, Pflegekasse, MD Begutachtung, Medizinischer Dienst, Pflegetagebuch, Punktesystem Pflegegrad, Widerspruch Pflegegrad',
  alternates: { canonical: 'https://alltagsengel.care/blog/pflegegrad-beantragen' },
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Pflegegrad beantragen: Komplette Anleitung 2026',
    description: 'Antrag, MD-Begutachtung, Punktesystem, Fristen, Widerspruch: Schritt für Schritt zum richtigen Pflegegrad.',
  },
};


const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Pflegegrad beantragen: Komplette Anleitung 2026',
  description: 'Pflegegrad beantragen 2026: Antrag bei der Pflegekasse, MD-Begutachtung mit Punktesystem, Pflegetagebuch, Fristen und Widerspruch — die komplette Anleitung.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-04-03',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/pflegegrad-beantragen',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

// Eine Quelle für sichtbare FAQ-Sektion UND FAQPage-Schema (Google-Richtlinie)
const faqData = [
  { q: 'Wie lange dauert es, bis über den Pflegegrad-Antrag entschieden wird?', a: 'Die Pflegekasse muss innerhalb von 25 Arbeitstagen nach Antragseingang entscheiden. Überschreitet sie diese Frist ohne triftigen Grund, stehen Ihnen 70 Euro pro angefangener Woche Verzögerung zu.' },
  { q: 'Ab wann werden die Leistungen gezahlt?', a: 'Rückwirkend ab dem Monat der Antragstellung — nicht erst ab dem Bescheid. Deshalb lohnt es sich, den Antrag früh zu stellen, notfalls formlos per Telefon mit anschließender schriftlicher Bestätigung.' },
  { q: 'Muss ich ein bestimmtes Formular für den Antrag verwenden?', a: 'Nein. Der Antrag ist formlos möglich — ein Satz wie „Hiermit beantrage ich Leistungen der Pflegeversicherung" per Brief, Telefon oder über das Online-Portal der Pflegekasse genügt. Die Kasse schickt Ihnen danach die Formulare zu.' },
  { q: 'Wie viele Punkte brauche ich für welchen Pflegegrad?', a: 'Pflegegrad 1: ab 12,5 Punkte, Pflegegrad 2: ab 27 Punkte, Pflegegrad 3: ab 47,5 Punkte, Pflegegrad 4: ab 70 Punkte, Pflegegrad 5: ab 90 Punkte. Die Punkte ergeben sich aus der gewichteten Bewertung von sechs Lebensbereichen (Modulen).' },
  { q: 'Was ist der Unterschied zwischen MD und MDK?', a: 'Keiner inhaltlich — der Medizinische Dienst der Krankenversicherung (MDK) heißt seit 2020 nur noch Medizinischer Dienst (MD). Bei Privatversicherten übernimmt Medicproof die Begutachtung nach denselben Regeln.' },
  { q: 'Wie lange habe ich Zeit für einen Widerspruch?', a: 'Einen Monat ab Zugang des Bescheids. Legen Sie zunächst fristwahrend formlos Widerspruch ein und fordern Sie das vollständige Gutachten an — die ausführliche Begründung können Sie nachreichen.' },
  { q: 'Bekomme ich mit Pflegegrad 1 überhaupt Geld?', a: 'Pflegegeld gibt es erst ab Pflegegrad 2. Mit Pflegegrad 1 haben Sie aber Anspruch auf den Entlastungsbetrag von 131 Euro pro Monat für Alltagsbegleitung oder Haushaltshilfe sowie auf Pflegehilfsmittel im Wert von bis zu 42 Euro monatlich.' },
  { q: 'Kann ich eine Höherstufung beantragen, wenn sich der Zustand verschlechtert?', a: 'Ja, jederzeit und formlos bei der Pflegekasse — ein Höherstufungsantrag ist ein neuer Antrag mit erneuter Begutachtung. Bereiten Sie sich darauf genauso gründlich vor wie beim Erstantrag, inklusive aktuellem Pflegetagebuch.' },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqData.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function PflegegradBeantragen() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Pflegegrad beantragen' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <article className="blog-article">
        <div className="blog-header">
          <h1>Pflegegrad beantragen: Komplette Anleitung 2026</h1>
          <div className="blog-meta">
            <span className="blog-date">3. April 2026 · Aktualisiert am 12. Juli 2026</span>
            <span className="blog-reading-time">11 Min. Lesezeit</span>
          </div>
        </div>

        <div className="blog-intro">
          <p>Ein anerkannter Pflegegrad öffnet den Zugang zu wichtigen Leistungen der Pflegekasse – von Pflegegeld über Pflegehilfsmittel bis zum <Link href="/entlastungsbetrag">Entlastungsbetrag von 131 Euro pro Monat</Link>. Doch viele Menschen erhalten anfangs einen zu niedrigen Grad oder bekommen ihren Antrag abgelehnt, weil sie die Begutachtung nicht richtig vorbereiten. Diese Anleitung führt Sie durch alle Schritte: vom formlosen Antrag über die MD-Begutachtung mit dem Punktesystem bis zu Fristen, Bescheid und Widerspruch.</p>
        </div>

        <div className="blog-content">
          <h2>Was ist ein Pflegegrad?</h2>
          <p>Der Pflegegrad ist eine offizielle Einstufung, die anzeigt, wie stark eine Person in ihrer Selbstständigkeit eingeschränkt ist und wie viel Pflege und Unterstützung sie benötigt. Es gibt fünf Pflegegrade:</p>
          <ul>
            <li><strong>Pflegegrad 1:</strong> Geringe Beeinträchtigung der Selbstständigkeit</li>
            <li><strong>Pflegegrad 2:</strong> Erhebliche Beeinträchtigung (früher: Pflegestufe 1)</li>
            <li><strong>Pflegegrad 3:</strong> Schwere Beeinträchtigung (früher: Pflegestufe 2)</li>
            <li><strong>Pflegegrad 4:</strong> Schwerste Beeinträchtigung (früher: Pflegestufe 3)</li>
            <li><strong>Pflegegrad 5:</strong> Schwerste Beeinträchtigung mit besonderen Anforderungen an die pflegerische Versorgung (früher: Pflegestufe 3 mit Härtefall)</li>
          </ul>
          <p>Jeder Pflegegrad berechtigt zu unterschiedlichen Leistungen und Geldbeträgen. Entscheidend ist dabei nicht die Diagnose, sondern wie selbstständig jemand seinen Alltag noch bewältigen kann. Wenn Sie unsicher sind, ob sich ein Antrag lohnt, hilft unser kostenloser <Link href="/pflegegrad-check">Pflegegrad-Check</Link> bei einer ersten Einschätzung.</p>

          <h2>Schritt 1: Antrag bei der Pflegekasse stellen — formlos genügt</h2>
          <p>Der Antrag auf einen Pflegegrad ist bewusst einfach gehalten: Er ist <strong>formlos</strong> möglich. Sie brauchen kein spezielles Formular und keine ärztliche Bescheinigung, um ihn zu stellen. Zuständig ist die Pflegekasse — sie ist bei Ihrer Krankenkasse angesiedelt und unter derselben Adresse erreichbar. Sie können den Antrag stellen:</p>
          <ul>
            <li><strong>Telefonisch:</strong> Ein Anruf bei der Pflegekasse genügt, um den Antrag auszulösen. Lassen Sie sich das Gespräch schriftlich bestätigen und notieren Sie Datum und Namen des Gesprächspartners.</li>
            <li><strong>Schriftlich:</strong> Ein einziger Satz reicht: „Hiermit beantrage ich Leistungen der Pflegeversicherung." Per Brief oder Fax an die Pflegekasse — am besten mit Einwurfeinschreiben.</li>
            <li><strong>Online:</strong> Viele Kassen bieten den Antrag inzwischen über ihr Kundenportal an.</li>
            <li><strong>Persönlich:</strong> In der Geschäftsstelle Ihrer Krankenkasse.</li>
          </ul>
          <p><strong>Wichtig: Das Antragsdatum zählt.</strong> Die Leistungen werden rückwirkend ab dem Monat der Antragstellung gezahlt — nicht erst ab dem Bescheid oder dem Begutachtungstermin. Wer den Antrag am 28. eines Monats stellt, sichert sich die Leistungen für den ganzen Monat. Warten Sie also nicht, bis alle Unterlagen beisammen sind: Erst den Antrag stellen, dann vorbereiten.</p>
          <p>Nach dem Eingang schickt die Pflegekasse Ihnen ein Antragsformular mit Fragen zur Person, zur Wohnsituation und zur gewünschten Leistungsart (Pflegegeld, Pflegesachleistung oder Kombination). Auch der Antrag durch Bevollmächtigte oder Betreuer ist möglich — etwa wenn Angehörige den Antrag für ihre Eltern stellen.</p>

          <h2>Schritt 2: Die MD-Begutachtung verstehen — die 6 Module</h2>
          <p>Nach dem Antrag beauftragt die Pflegekasse den <strong>Medizinischen Dienst (MD, früher MDK)</strong> — bei Privatversicherten Medicproof — mit einer Begutachtung. Ein Gutachter oder eine Gutachterin kommt zu Ihnen nach Hause und bewertet die Selbstständigkeit in sechs Lebensbereichen, den sogenannten Modulen. Jedes Modul fließt mit einer festen Gewichtung in das Gesamtergebnis ein:</p>
          <ul>
            <li><strong>Modul 1 — Mobilität (10 %):</strong> Aufstehen, Umsetzen, Treppensteigen, Fortbewegen innerhalb der Wohnung, Halten einer stabilen Sitzposition.</li>
            <li><strong>Modul 2 und 3 — Kognitive und kommunikative Fähigkeiten sowie Verhaltensweisen und psychische Problemlagen (zusammen 15 %):</strong> Orientierung, Gedächtnis, Gesprächsfähigkeit, aber auch Unruhe, Ängste, nächtliches Umherwandern oder Abwehrverhalten. Von beiden Modulen zählt nur das mit dem höheren Punktwert.</li>
            <li><strong>Modul 4 — Selbstversorgung (40 %):</strong> Waschen, Duschen, Zahnpflege, An- und Auskleiden, Essen, Trinken, Toilettengang, Umgang mit Inkontinenz. Dieses Modul hat mit Abstand das größte Gewicht — hier entscheidet sich oft der Pflegegrad.</li>
            <li><strong>Modul 5 — Umgang mit krankheits- und therapiebedingten Anforderungen (20 %):</strong> Medikamente stellen und einnehmen, Injektionen, Verbandswechsel, Arztbesuche, Einhalten von Diäten und Therapien.</li>
            <li><strong>Modul 6 — Gestaltung des Alltagslebens und soziale Kontakte (15 %):</strong> Tagesablauf selbst gestalten, sich beschäftigen, in die Zukunft planen, Kontakte pflegen.</li>
          </ul>
          <p>In jedem Modul vergibt der Gutachter Punkte danach, wie selbstständig die Person die jeweiligen Aktivitäten ausführen kann — von „selbstständig" bis „unselbstständig". Die Modulergebnisse werden gewichtet und zu einer Gesamtpunktzahl von 0 bis 100 zusammengerechnet.</p>

          <h2>Das Punktesystem: Ab wie vielen Punkten gibt es welchen Pflegegrad?</h2>
          <p>Aus der gewichteten Gesamtpunktzahl ergibt sich der Pflegegrad nach festen Schwellen:</p>
          <ul>
            <li><strong>Pflegegrad 1:</strong> ab 12,5 bis unter 27 Punkte</li>
            <li><strong>Pflegegrad 2:</strong> ab 27 bis unter 47,5 Punkte</li>
            <li><strong>Pflegegrad 3:</strong> ab 47,5 bis unter 70 Punkte</li>
            <li><strong>Pflegegrad 4:</strong> ab 70 bis unter 90 Punkte</li>
            <li><strong>Pflegegrad 5:</strong> ab 90 bis 100 Punkte</li>
          </ul>
          <p>Diese Schwellen erklären, warum eine gute Vorbereitung so wichtig ist: Wenige Punkte können über einen ganzen Pflegegrad entscheiden — und damit über mehrere hundert Euro monatlich. Wer etwa mit 26 Punkten knapp unter der Schwelle zu Pflegegrad 2 landet, weil im Gespräch Einschränkungen bei der Selbstversorgung unerwähnt blieben, verliert den Anspruch auf Pflegegeld und Pflegesachleistungen.</p>

          <h2>Schritt 3: Pflegetagebuch führen — Ihre wichtigste Vorbereitung</h2>
          <p>Das wirksamste Instrument zur Vorbereitung ist ein <strong>Pflegetagebuch</strong>. Beginnen Sie damit am besten direkt nach der Antragstellung und führen Sie es mindestens ein bis zwei Wochen lang. Notieren Sie täglich:</p>
          <ul>
            <li>Bei welchen Verrichtungen Hilfe nötig war (Waschen, Anziehen, Toilettengang, Essen)</li>
            <li>Wie oft und wie lange geholfen wurde — auch nachts</li>
            <li>Welche Aufgaben die Person gar nicht mehr allein schafft</li>
            <li>Besonderheiten wie Stürze, Verwirrtheit, vergessene Medikamente oder abgebrochene Mahlzeiten</li>
            <li>Schwankungen: gute und schlechte Tage getrennt festhalten</li>
          </ul>
          <p>Das Tagebuch hat zwei Funktionen: Es macht Ihnen selbst bewusst, wie viel Unterstützung tatsächlich geleistet wird — Angehörige unterschätzen das regelmäßig, weil vieles zur Routine geworden ist. Und es liefert dem Gutachter konkrete, dokumentierte Beispiele statt vager Aussagen. Legen Sie das Tagebuch beim Begutachtungstermin vor und übergeben Sie eine Kopie.</p>
          <p>Sammeln Sie zusätzlich alle relevanten Unterlagen: aktuelle Arztberichte und Diagnosen, Medikamentenplan, Krankenhausentlassungsbriefe, Schwerbehindertenausweis, Berichte von Therapeuten sowie eine Liste der verwendeten Hilfsmittel (Rollator, Duschhocker, Inkontinenzmaterial). Nutzen Sie schon Pflegehilfsmittel wie die <Link href="/hygienebox">monatliche Pflegebox</Link>, gehört auch das in die Aufstellung.</p>

          <h2>Schritt 4: Der Begutachtungstermin — so läuft er ab</h2>
          <p>Der MD kündigt den Hausbesuch schriftlich an. Der Termin dauert in der Regel 45 bis 90 Minuten. Der Gutachter stellt Fragen zur Krankengeschichte, beobachtet Alltagsbewegungen (Aufstehen, Gehen, Greifen), prüft die kognitiven Fähigkeiten und geht die sechs Module systematisch durch. Diese Tipps haben sich bewährt:</p>
          <ul>
            <li><strong>Angehörige oder Pflegeperson dabeihaben:</strong> Wer täglich hilft, kann konkret schildern, wo Unterstützung nötig ist — und korrigieren, wenn die pflegebedürftige Person aus Stolz untertreibt.</li>
            <li><strong>Ehrlich bleiben, nichts vorspielen:</strong> Weder übertreiben noch beschönigen. Gutachter sind erfahren und erkennen Inszenierungen — Übertreibungen schaden der Glaubwürdigkeit des gesamten Antrags.</li>
            <li><strong>Schlechte Tage schildern:</strong> Viele ältere Menschen mobilisieren am Begutachtungstag alle Kräfte und wirken fitter als im Alltag. Sagen Sie ausdrücklich: „Heute ist ein guter Tag — an schlechten Tagen schafft er das Aufstehen nicht ohne Hilfe."</li>
            <li><strong>Konkrete Beispiele statt allgemeiner Aussagen:</strong> Nicht „Es geht so schlecht", sondern „Beim Duschen muss ich den Rücken und die Beine waschen, allein traut sie sich wegen Sturzgefahr nicht mehr in die Wanne."</li>
            <li><strong>Psychische Beeinträchtigungen ansprechen:</strong> Ängste, depressive Verstimmungen, Orientierungsprobleme und nächtliche Unruhe fließen über die Module 2 und 3 in die Bewertung ein — sie werden oft aus Scham verschwiegen.</li>
            <li><strong>Wohnung realistisch zeigen:</strong> Nicht extra aufräumen oder Hilfsmittel wegstellen. Der Gutachter soll die tatsächlichen Lebensbedingungen sehen.</li>
          </ul>

          <h2>Fristen: Wie lange darf die Pflegekasse brauchen?</h2>
          <p>Die Pflegekasse muss Ihnen den Bescheid <strong>innerhalb von 25 Arbeitstagen</strong> nach Antragseingang zustellen. In dieser Frist muss auch die Begutachtung stattfinden. In besonderen Situationen gelten verkürzte Fristen — etwa bei einem Krankenhausaufenthalt mit anstehender Entlassung oder in der Palliativversorgung, wo binnen einer Woche begutachtet werden muss.</p>
          <p>Überschreitet die Kasse die 25 Arbeitstage aus Gründen, die sie selbst zu vertreten hat, muss sie <strong>70 Euro für jede angefangene Woche der Fristüberschreitung</strong> zahlen. Fragen Sie bei Verzögerungen schriftlich nach und berufen Sie sich auf diese Frist.</p>

          <h2>Bescheid erhalten: annehmen oder Widerspruch einlegen</h2>
          <p>Mit dem Bescheid teilt die Pflegekasse mit, welcher Pflegegrad anerkannt wurde — oder dass der Antrag abgelehnt wurde. Fordern Sie in jedem Fall das <strong>vollständige Gutachten</strong> an, falls es nicht beiliegt. Darin sehen Sie die Punktvergabe je Modul und können nachvollziehen, wo Punkte fehlen.</p>
          <p>Sind Sie mit der Entscheidung nicht einverstanden, können Sie <strong>innerhalb eines Monats</strong> nach Zugang des Bescheids Widerspruch einlegen. So gehen Sie vor:</p>
          <ul>
            <li><strong>Fristwahrend widersprechen:</strong> Zunächst genügt ein formloses Schreiben: „Hiermit lege ich Widerspruch gegen Ihren Bescheid vom … ein. Die Begründung reiche ich nach." Damit ist die Monatsfrist gewahrt.</li>
            <li><strong>Gutachten prüfen:</strong> Vergleichen Sie die Modulbewertungen mit Ihrem Pflegetagebuch. Wo wurde „selbstständig" angekreuzt, obwohl täglich geholfen wird?</li>
            <li><strong>Begründung nachreichen:</strong> Führen Sie konkret auf, welche Einschränkungen falsch oder gar nicht bewertet wurden, und legen Sie ärztliche Atteste und das Pflegetagebuch bei.</li>
            <li><strong>Zweitbegutachtung:</strong> Im Widerspruchsverfahren kommt es meist zu einer erneuten Begutachtung — bereiten Sie sich darauf genauso sorgfältig vor wie auf den ersten Termin.</li>
          </ul>
          <p>Der Widerspruch lohnt sich: Ein erheblicher Teil der Widersprüche führt zu einer besseren Einstufung. Bleibt die Kasse bei ihrer Entscheidung, steht Ihnen der Klageweg zum Sozialgericht offen — dort fallen für Versicherte keine Gerichtskosten an.</p>

          <h2>Leistungen je Pflegegrad im Überblick (2026)</h2>

          <h3>Pflegegrad 1</h3>
          <ul>
            <li>Entlastungsbetrag: 131 Euro/Monat</li>
            <li>Pflegehilfsmittel zum Verbrauch: bis 42 Euro/Monat</li>
            <li>Kein Pflegegeld, aber Zugang zu Beratung, Wohnraumanpassung (bis 4.000 Euro) und Hausnotruf-Zuschuss</li>
          </ul>
          <p>Alle Details dazu im Ratgeber <Link href="/blog/pflegegrad-1-leistungen">Pflegegrad 1: Was steht Ihnen zu?</Link></p>

          <h3>Pflegegrad 2</h3>
          <ul>
            <li>Pflegegeld: 347 Euro/Monat (wenn Angehörige pflegen)</li>
            <li>Pflegesachleistung: 796 Euro/Monat (professionelle Pflegedienste)</li>
            <li>Entlastungsbetrag: 131 Euro/Monat</li>
          </ul>

          <h3>Pflegegrad 3</h3>
          <ul>
            <li>Pflegegeld: 599 Euro/Monat</li>
            <li>Pflegesachleistung: 1.497 Euro/Monat</li>
            <li>Entlastungsbetrag: 131 Euro/Monat</li>
          </ul>

          <h3>Pflegegrad 4</h3>
          <ul>
            <li>Pflegegeld: 800 Euro/Monat</li>
            <li>Pflegesachleistung: 1.859 Euro/Monat</li>
            <li>Entlastungsbetrag: 131 Euro/Monat</li>
          </ul>

          <h3>Pflegegrad 5</h3>
          <ul>
            <li>Pflegegeld: 990 Euro/Monat</li>
            <li>Pflegesachleistung: 2.299 Euro/Monat</li>
            <li>Entlastungsbetrag: 131 Euro/Monat</li>
            <li>Zusatzleistungen bei besonderem Versorgungsbedarf möglich</li>
          </ul>
          <p>Der <Link href="/entlastungsbetrag">Entlastungsbetrag von 131 Euro pro Monat</Link> steht damit in jedem Pflegegrad zu — er kommt zusätzlich zu Pflegegeld und Sachleistungen und wird auf keine andere Leistung angerechnet.</p>

          <h2>Höherstufung: Wenn sich der Zustand verschlechtert</h2>
          <p>Ein Pflegegrad ist keine endgültige Entscheidung. Verschlechtert sich der Gesundheitszustand — etwa nach einem Sturz, einem Krankenhausaufenthalt oder bei fortschreitender Demenz — können Sie jederzeit einen <strong>Höherstufungsantrag</strong> stellen. Auch dieser ist formlos bei der Pflegekasse möglich und löst eine neue Begutachtung aus.</p>
          <p>Wichtig zu wissen: Auch bei der Höherstufung zählt das Antragsdatum für die höheren Leistungen. Führen Sie vor dem neuen Begutachtungstermin wieder ein aktuelles Pflegetagebuch, das die Verschlechterung dokumentiert. Ein theoretisches Risiko der Rückstufung besteht, ist in der Praxis bei dokumentierter Verschlechterung aber selten.</p>

          <h2>Kostenlose Beratung nutzen</h2>
          <p>Sie müssen den Antrag nicht allein stemmen. Kostenlose Unterstützung bieten:</p>
          <ul>
            <li><strong>Pflegeberatung nach § 7a SGB XI:</strong> Ihre Pflegekasse muss Ihnen binnen zwei Wochen nach Antragstellung eine Beratung anbieten — auf Wunsch bei Ihnen zu Hause</li>
            <li><strong>Pflegestützpunkte:</strong> Neutrale Anlaufstellen in vielen Städten und Landkreisen</li>
            <li><strong>Sozialverbände:</strong> VdK, SoVD, Caritas, Diakonie und AWO unterstützen auch beim Widerspruch</li>
            <li><strong>Unabhängige Patientenberatung:</strong> Telefonisch und kostenfrei</li>
          </ul>

          <h2>Fazit</h2>
          <p>Der Weg zum Pflegegrad ist kein Hexenwerk, wenn Sie die Reihenfolge kennen: früh und formlos den Antrag stellen (das Datum sichert die Leistungen), mit dem Pflegetagebuch und vollständigen Unterlagen auf die MD-Begutachtung vorbereiten, im Termin ehrlich und konkret die schlechten Tage schildern — und bei einem zu niedrigen Ergebnis innerhalb eines Monats Widerspruch einlegen. Wer die sechs Module und das Punktesystem versteht, geht deutlich besser vorbereitet in die Begutachtung. Und sobald der Pflegegrad anerkannt ist, sollten Sie die Leistungen auch tatsächlich abrufen — vom ersten Tag an.</p>
        </div>

        <div className="blog-cta">
          <h3>Pflegegrad da? Jetzt Leistungen nutzen</h3>
          <p>Mit einem anerkannten Pflegegrad können Sie über Alltagsengel Alltagsbegleitung und Haushaltshilfe buchen — finanziert über den Entlastungsbetrag, direkt mit der Pflegekasse abgerechnet.</p>
          <Link href="/termin" className="btn-gold">Kostenloses Erstgespräch vereinbaren</Link>
        </div>

        <div className="blog-content">
          <h2>Häufige Fragen zum Pflegegrad-Antrag</h2>
          <div className="blog-faq">
            {faqData.map((f, i) => (
              <details key={i} className="lp-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>

        <section className="blog-related" style={{ marginTop: 40, padding: '24px 20px', background: 'rgba(201,150,60,0.06)', borderRadius: 12, border: '1px solid rgba(201,150,60,0.15)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#C9963C' }}>Weiterführende Informationen</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li><Link href="/pflegegrad-check" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Pflegegrad-Check: Kostenlose Ersteinschätzung in 2 Minuten</Link></li>
            <li><Link href="/entlastungsbetrag" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Entlastungsbetrag: 131 €/Monat ab Pflegegrad 1 nutzen</Link></li>
            <li><Link href="/blog/pflegegrad-1-leistungen" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Pflegegrad 1: Alle Leistungen im Überblick</Link></li>
            <li><Link href="/hygienebox" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Pflegebox bei Pflegegrad 1-5 bestellen</Link></li>
            <li><Link href="/blog/entlastungsbetrag-45b" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Entlastungsbetrag: Was steht Ihnen zu?</Link></li>
          </ul>
        </section>

        <RelatedPosts slug="pflegegrad-beantragen" />
      </article>
    </main>
  );
}
