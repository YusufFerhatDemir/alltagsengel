import type { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Krankenfahrt zum Arzt: Wann zahlt die Krankenkasse?',
  description: 'Wann zahlt die Krankenkasse Ihre Krankenfahrt? §60 SGB V, Muster-4-Verordnung, Genehmigung und Zuzahlung ausführlich erklärt — mit Vergleichstabelle.',
  keywords: 'Krankenfahrt, Krankenfahrt zum Arzt, Krankentransport Kostenübernahme, Krankenkasse, §60 SGB V, Muster 4, Verordnung Krankenbeförderung, Zuzahlung Krankenfahrt',
  alternates: { canonical: 'https://alltagsengel.care/blog/krankenfahrt-kostenuebernahme' },
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Krankenfahrt zum Arzt: Wann zahlt die Krankenkasse?',
    description: 'Der ausführliche Ratgeber zur Kostenübernahme bei Krankenfahrten: §60 SGB V, Muster 4, Genehmigungsregeln und Zuzahlung.',
  },
};

// EIN Array für sichtbare FAQ-Sektion UND FAQPage-Schema (Google-Richtlinie:
// nur sichtbar gerenderte FAQs auszeichnen).
const faqItems = [
  {
    q: 'Kann ich auch eine Privatperson fahren lassen?',
    a: 'Ja. Fährt Sie ein Angehöriger oder Nachbar mit dem privaten Pkw, erstattet die Krankenkasse auf Antrag die Kosten in Höhe der Wegstreckenentschädigung (Kilometerpauschale) — nicht aber einen Verdienstausfall des Fahrers. Die medizinische Notwendigkeit muss auch hier per Verordnung belegt sein.',
  },
  {
    q: 'Wie lange gilt die Genehmigung der Krankenkasse?',
    a: 'Bei Serienbehandlungen wie Dialyse, Chemo- oder Strahlentherapie genehmigt die Kasse in der Regel die gesamte Behandlungsserie — oft als Dauergenehmigung für mehrere Monate. Die genaue Geltungsdauer steht im Genehmigungsbescheid Ihrer Kasse.',
  },
  {
    q: 'Was mache ich, wenn die Krankenkasse die Kostenübernahme ablehnt?',
    a: 'Sie können innerhalb eines Monats Widerspruch einlegen. Fordern Sie eine schriftliche Begründung an, lassen Sie den Arzt die medizinische Notwendigkeit präzisieren und wenden Sie sich bei Bedarf an die Unabhängige Patientenberatung. Viele Ablehnungen beruhen auf unvollständig ausgefüllten Verordnungen.',
  },
  {
    q: 'Zahlt die Kasse auch die Rückfahrt?',
    a: 'Ja, wenn sie verordnet ist. Hin- und Rückfahrt gelten als zwei Fahrten — für beide fällt jeweils die Zuzahlung von 5 bis 10 € an, sofern keine Befreiung vorliegt.',
  },
  {
    q: 'Gilt die Kostenübernahme auch für Privatversicherte?',
    a: '§60 SGB V gilt unmittelbar nur für gesetzlich Versicherte. Privatversicherte und Beihilfeberechtigte reichen die Fahrtrechnung je nach Tarif bei ihrer Versicherung ein — die Erstattungsvoraussetzungen (medizinische Notwendigkeit, ärztliche Verordnung) sind meist vergleichbar.',
  },
  {
    q: 'Zahlt die Krankenkasse die Fahrt zum Hausarzt?',
    a: 'Nur in den geregelten Ausnahmefällen: Bei Pflegegrad 4 oder 5, bei Pflegegrad 3 mit dauerhafter Mobilitätsbeeinträchtigung und bei Merkzeichen aG, Bl oder H gilt die Fahrt zur ambulanten Behandlung ohne Einzelgenehmigung als genehmigt — die Verordnung genügt. Ohne diese Voraussetzungen bleibt die Fahrt zum Routinetermin in der Regel Privatsache oder erfordert eine vorab genehmigte Härtefallentscheidung der Kasse.',
  },
  {
    q: 'Übernimmt die Kasse Fahrten zur Dialyse oder Chemotherapie?',
    a: 'Ja. Serienfahrten zu Dialyse, Chemotherapie, Strahlentherapie und vergleichbaren hochfrequenten Behandlungsserien gehören zu den anerkannten Ausnahmefällen nach §60 SGB V. Mit Verordnung und vorheriger Genehmigung der Kasse werden alle Fahrten der Behandlungsserie übernommen — meist per Dauergenehmigung mit einem einzigen Formular.',
  },
  {
    q: 'Zahlt die Krankenkasse auch die Fahrtkosten einer Begleitperson?',
    a: 'Ja, wenn der Arzt die medizinische Notwendigkeit der Begleitung auf der Verordnung bescheinigt, übernimmt die Kasse auch deren Fahrtkosten. Wer darüber hinaus jemanden im Wartezimmer und beim Arztgespräch braucht, kombiniert die Fahrt mit einer Alltagsbegleitung — abrechenbar über den Entlastungsbetrag von 131 €/Monat ab Pflegegrad 1.',
  },
]

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Krankenfahrt zum Arzt: Wann zahlt die Krankenkasse?',
  description: 'Wann zahlt die Krankenkasse Ihre Krankenfahrt? §60 SGB V, Muster-4-Verordnung, Genehmigung und Zuzahlung ausführlich erklärt — mit Vergleichstabelle.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-04-10',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/krankenfahrt-kostenuebernahme',
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

export default function KrankenfahrtKostenuebernahme() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Krankenfahrt Kostenübernahme' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <article className="blog-article">
        <div className="blog-header">
          <h1>Krankenfahrt zum Arzt: Wann zahlt die Krankenkasse?</h1>
          <div className="blog-meta">
            <span className="blog-date">10. April 2026 · Aktualisiert am 12. Juli 2026</span>
            <span className="blog-reading-time">8 Min. Lesezeit</span>
          </div>
        </div>

        <div className="blog-intro">
          <p>Fahrten zu Dialyse, Chemotherapie oder Arztterminen können ins Geld gehen — dabei übernimmt die gesetzliche Krankenkasse viele dieser Fahrten nach <strong>§60 SGB V</strong>. Dieser Ratgeber erklärt ausführlich, wann die Kasse zahlt, wie die <strong>Muster-4-Verordnung</strong> funktioniert, welche Zuzahlung bleibt und wie Sie eine Ablehnung vermeiden.</p>
        </div>

        <div className="blog-content">
          <h2>Was ist eine Krankenfahrt — und was nicht?</h2>
          <p>Eine Krankenfahrt ist die Beförderung zu einer medizinischen Behandlung <strong>ohne medizinisch-fachliche Betreuung unterwegs</strong>: Sie sitzen im Pkw, Taxi oder Mietwagen, bei Bedarf mit Rollstuhl oder Tragestuhl. Davon abzugrenzen sind der qualifizierte Krankentransport (KTW) und die Rettungsfahrt:</p>

          <div className="blog-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Merkmal</th>
                  <th>Krankenfahrt</th>
                  <th>Krankentransport (KTW)</th>
                  <th>Rettungsfahrt (RTW)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Fahrzeug</td>
                  <td>Pkw, Taxi, Mietwagen</td>
                  <td>Krankentransportwagen</td>
                  <td>Rettungswagen</td>
                </tr>
                <tr>
                  <td>Betreuung unterwegs</td>
                  <td>Keine nötig</td>
                  <td>Medizinisch-fachlich</td>
                  <td>Notfallmedizinisch</td>
                </tr>
                <tr>
                  <td>Anordnung</td>
                  <td>Muster 4 („Taxi/Mietwagen")</td>
                  <td>Muster 4 („KTW")</td>
                  <td>Notruf 112</td>
                </tr>
                <tr>
                  <td>Typische Anlässe</td>
                  <td>Dialyse, Chemo, Arzttermin</td>
                  <td>Nach OP, liegender Transport</td>
                  <td>Unfall, Herzinfarkt</td>
                </tr>
                <tr>
                  <td>Kostenübernahme</td>
                  <td>§60 SGB V</td>
                  <td>§60 SGB V</td>
                  <td>Krankenkasse (Notfall)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p>Für die Kostenübernahme ist diese Einordnung entscheidend: Der Arzt kreuzt das Beförderungsmittel auf der Verordnung an, und die Kasse zahlt genau das medizinisch Notwendige — ein unnötig verordneter KTW führt zu Rückfragen, ein normales Taxi ohne Verordnung zahlen Sie selbst.</p>

          <h2>Die Rechtsgrundlage: §60 SGB V</h2>
          <p>§60 SGB V regelt die Fahrkosten der gesetzlichen Krankenversicherung. Der Grundsatz lautet: Die Kasse übernimmt Fahrkosten nur, wenn sie <strong>im Zusammenhang mit einer Kassenleistung zwingend medizinisch notwendig</strong> sind. Daraus ergeben sich zwei Welten:</p>
          <ul className="blog-list">
            <li><strong>Fahrten zur stationären Behandlung</strong> (Krankenhausaufnahme und -entlassung): werden grundsätzlich übernommen.</li>
            <li><strong>Fahrten zur ambulanten Behandlung</strong> (Arztpraxis, Dialysezentrum, Tagesklinik): werden nur in geregelten Ausnahmefällen übernommen — dann aber zuverlässig.</li>
          </ul>

          <h2>Die Ausnahmefälle: Wann die Kasse ambulante Fahrten zahlt</h2>

          <h3>1. Genehmigungsfrei mit Pflegegrad oder Merkzeichen</h3>
          <p>Seit 2019 gelten Fahrten zu ambulanten Behandlungen <strong>ohne Einzelgenehmigung als genehmigt</strong>, wenn eine dieser Voraussetzungen vorliegt:</p>
          <ul className="blog-list">
            <li><strong>Pflegegrad 4 oder 5</strong> — die Verordnung genügt, keine Genehmigung nötig</li>
            <li><strong>Pflegegrad 3 mit dauerhafter Mobilitätsbeeinträchtigung</strong></li>
            <li><strong>Schwerbehindertenausweis mit Merkzeichen aG, Bl oder H</strong></li>
          </ul>
          <p>In diesen Fällen reichen Sie einfach die Verordnung zusammen mit der Fahrtrechnung ein — die Kasse darf die Übernahme nicht von einer Vorab-Genehmigung abhängig machen.</p>

          <h3>2. Serienbehandlungen mit hoher Frequenz</h3>
          <p>Fahrten zu <strong>Dialyse, Chemotherapie und Strahlentherapie</strong> sowie vergleichbaren Behandlungsserien übernimmt die Kasse mit vorheriger Genehmigung — meist als Dauergenehmigung für die gesamte Serie. Ein Formular, alle Fahrten gedeckt.</p>

          <h3>3. Vergleichbare Härtefälle</h3>
          <p>Auch außerhalb der Regelfälle kann der Arzt eine zwingende medizinische Notwendigkeit bescheinigen — etwa wenn die Grunderkrankung oder ihre Behandlung eine selbstständige Anreise ausschließt. Diese Fahrten muss die Kasse <strong>vor Fahrtantritt</strong> genehmigen.</p>

          <h2>Die Muster-4-Verordnung verstehen</h2>
          <p>Die „Verordnung einer Krankenbeförderung" — das <strong>Muster 4</strong> — ist das zentrale Dokument. Ihr behandelnder Arzt füllt darauf drei Bereiche aus:</p>
          <ul className="blog-list">
            <li><strong>Grund der Beförderung:</strong> z. B. hochfrequente Behandlung (Dialyse, Chemo), dauerhafte Mobilitätsbeeinträchtigung, stationäre Behandlung</li>
            <li><strong>Beförderungsmittel:</strong> für die Krankenfahrt „Taxi/Mietwagen" — KTW nur, wenn fachliche Betreuung unterwegs nötig ist</li>
            <li><strong>Behandlungsort und Richtung:</strong> Hinfahrt, Rückfahrt oder beides</li>
          </ul>
          <p>Drei Regeln ersparen Ihnen den meisten Ärger: Die Verordnung wird <strong>vor der Fahrt</strong> ausgestellt (fragen Sie direkt bei der Terminvereinbarung danach). Prüfen Sie, ob <strong>alle Felder ausgefüllt und unterschrieben</strong> sind — unvollständige Verordnungen sind der häufigste Ablehnungsgrund. Und bei Serienbehandlungen lassen Sie gleich die <strong>gesamte Serie</strong> verordnen. Wie Sie im Detail an die Verordnung kommen, erklärt unser Ratgeber <Link href="/blog/krankenfahrt-verordnung-erhalten">Krankenfahrt-Verordnung erhalten</Link>; den kompletten Antragsweg zeigt <Link href="/blog/krankenfahrt-beantragen">Krankenfahrt beantragen — Schritt für Schritt</Link>.</p>

          <h2>Zuzahlung: Das bleibt bei Ihnen</h2>
          <p>Übernimmt die Kasse die Fahrt, zahlen Versicherte ab 18 Jahren eine gesetzliche Zuzahlung von <strong>10 % des Fahrpreises, mindestens 5 €, höchstens 10 € pro Fahrt</strong> — Hin- und Rückfahrt zählen als zwei Fahrten. Wer die Belastungsgrenze von 2 % des Bruttoeinkommens erreicht (1 % bei chronisch Kranken), lässt sich für den Rest des Jahres befreien. Alle Details, Beispielrechnungen und den Weg zum Befreiungsausweis finden Sie im Ratgeber <Link href="/blog/zuzahlung-krankenfahrt">Zuzahlung Krankenfahrt — was muss ich zahlen?</Link></p>

          <h2>Wer darf die Fahrt durchführen?</h2>
          <p>Die Kasse rechnet mit Taxi- und Mietwagenunternehmen mit Kassenvertrag, anerkannten Fahrdiensten und Krankentransportunternehmen ab. Alltagsengel vermittelt qualifizierte Fahrer in Frankfurt und dem Rhein-Main-Gebiet — die Abrechnung über die Verordnung läuft direkt, Sie zahlen nur die Zuzahlung. Auch die Erstattung privater Fahrten (Angehörige, eigener Pkw) ist möglich: Die Kasse zahlt dann die Wegstreckenentschädigung, nicht aber Verdienstausfälle.</p>

          <h2>Zwei Beispiele aus der Praxis</h2>
          <p><strong>Beispiel 1 — Serienfahrt mit Dauergenehmigung:</strong> Frau B. fährt dreimal pro Woche von Offenbach zur Dialyse nach Frankfurt. Ihre Kasse hat die gesamte Behandlungsserie vorab per Dauergenehmigung bewilligt; die Fahrtkosten werden vollständig übernommen. Frau B. zahlt pro Fahrt nur die gesetzliche Zuzahlung zwischen 5 und 10 €. Da sie chronisch krank ist, erreicht sie früh im Jahr die Belastungsgrenze von 1 % ihres Bruttoeinkommens — ab dann fährt sie mit Befreiungsausweis komplett zuzahlungsfrei.</p>
          <p><strong>Beispiel 2 — Selbstzahler ohne Anspruch:</strong> Herr T. möchte zum Kontrolltermin beim Zahnarzt in der Nachbarstadt. Er hat weder einen Pflegegrad noch ein Merkzeichen, und es handelt sich nicht um eine Serienbehandlung — die Kasse übernimmt die Fahrt nicht. Er bucht als Selbstzahler; der Preis richtet sich nach Region, Fahrtart und Hilfebedarf und wird vor der Buchung transparent angezeigt. Für die Begleitung in die Praxis nutzt er zusätzlich seinen Entlastungsbetrag (131 €/Monat).</p>

          <h2>So beantragen Sie die Kostenübernahme — Kurzfassung</h2>
          <ul className="blog-list">
            <li><strong>Schritt 1:</strong> Verordnung (Muster 4) beim behandelnden Arzt holen — vor der Fahrt</li>
            <li><strong>Schritt 2:</strong> Prüfen, ob Ihr Fall genehmigungsfrei ist (Pflegegrad 4/5, Pflegegrad 3 mit Mobilitätsbeeinträchtigung, Merkzeichen aG/Bl/H)</li>
            <li><strong>Schritt 3:</strong> Falls nicht: Genehmigung bei der Kasse einholen (Serienfahrten, Härtefälle) — oft online möglich</li>
            <li><strong>Schritt 4:</strong> Fahrt buchen; der Fahrdienst rechnet direkt mit der Kasse ab, Sie zahlen nur die Zuzahlung</li>
          </ul>
          <p>Die Buchung selbst dauert bei <Link href="/krankenfahrten">Alltagsengel</Link> nur wenige Minuten: Datum, Uhrzeit und Zielort wählen, Hilfebedarf angeben, Verordnung als Foto oder PDF hochladen — bei Serienfahrten wird sie automatisch jeder Fahrt zugeordnet. Wie das in der Praxis aussieht, zeigt der Ratgeber <Link href="/blog/krankenfahrt-buchen-frankfurt">Krankenfahrt in Frankfurt buchen</Link>. Wenn Sie unsicher sind, welcher Weg für Ihre Situation der richtige ist, vereinbaren Sie einfach einen <Link href="/termin">kostenlosen Beratungstermin</Link>.</p>

          <h2>Was tun bei Ablehnung? Ihr Recht auf Widerspruch</h2>
          <p>Lehnt die Krankenkasse die Kostenübernahme ab, müssen Sie das nicht hinnehmen — Widersprüche gegen Fahrkosten-Bescheide haben gute Chancen, wenn die medizinische Notwendigkeit sauber belegt ist. So gehen Sie vor:</p>
          <ul className="blog-list">
            <li><strong>Frist wahren:</strong> Legen Sie innerhalb eines Monats nach Zugang des Bescheids schriftlich Widerspruch ein. Ein formloses Schreiben genügt zunächst — die ausführliche Begründung können Sie nachreichen.</li>
            <li><strong>Begründung anfordern:</strong> Verlangen Sie eine schriftliche Begründung der Ablehnung. Oft scheitert die Übernahme an formalen Punkten wie einer unvollständig ausgefüllten Verordnung — das lässt sich beheben.</li>
            <li><strong>Ärztliche Stellungnahme beilegen:</strong> Lassen Sie sich vom behandelnden Arzt die medizinische Notwendigkeit der Fahrt ausführlich bescheinigen. Je konkreter Diagnose und Mobilitätseinschränkung beschrieben sind, desto besser stehen die Chancen.</li>
            <li><strong>Beratung nutzen:</strong> Die Unabhängige Patientenberatung und Sozialverbände unterstützen beim Widerspruch — oft kostenlos oder für einen geringen Mitgliedsbeitrag.</li>
            <li><strong>Sozialgericht als letzter Schritt:</strong> Bleibt der Widerspruch erfolglos, können Sie Klage vor dem Sozialgericht erheben. Das Verfahren ist für Versicherte gerichtskostenfrei.</li>
          </ul>
          <p>Wichtig: Fahren Sie im Zweifel nicht einfach los in der Hoffnung auf nachträgliche Erstattung. Die Verordnung muss grundsätzlich vor der Fahrt ausgestellt sein, und genehmigungspflichtige Fahrten müssen vor Fahrtantritt bewilligt werden — rückwirkende Übernahmen sind die seltene Ausnahme.</p>

          <h2>Mehr als eine Fahrt nötig? Arztbegleitung für Senioren</h2>
          <p>Die Verordnung deckt die Fahrt — nicht aber die Begleitung im Wartezimmer, das Gespräch mit dem Arzt oder den Einkauf danach. Dafür gibt es die <Link href="/alltagsbegleitung">Alltagsbegleitung mit Arztbegleitung</Link>: Ein Engel begleitet Sie oder Ihre Angehörigen durch den gesamten Termin, notiert die Anweisungen des Arztes und löst danach das Rezept in der Apotheke ein. Finanzierbar ist das über den <Link href="/entlastungsbetrag">Entlastungsbetrag — 131 €/Monat</Link>, die jeder Person mit Pflegegrad 1–5 nach §45b SGB XI zustehen. So laufen Fahrt und Begleitung über zwei getrennte Töpfe für einen einzigen Termin. Wie die Begleitung konkret abläuft, lesen Sie im Ratgeber <Link href="/blog/arztbegleitung-senioren">Arztbegleitung für Senioren</Link>. Und mit Pflegegrad stehen Ihnen zusätzlich kostenlose Pflegehilfsmittel über die <Link href="/hygienebox">Pflegebox (42 €/Monat)</Link> zu.</p>

          <h2>Häufig gestellte Fragen</h2>
          {faqItems.map((f) => (
            <div key={f.q}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </div>

        <div className="blog-cta">
          <h3>Krankenfahrt mit Kostenübernahme buchen</h3>
          <p>Registrieren Sie sich kostenlos, laden Sie Ihre Verordnung hoch und buchen Sie zuverlässige Fahrten zu Arzt, Dialyse und Klinik in Frankfurt & Rhein-Main.</p>
          <Link href="/krankenfahrten" className="btn-gold">Krankenfahrt jetzt anfragen</Link>
        </div>

        <section className="blog-related" style={{ marginTop: 40, padding: '24px 20px', background: 'rgba(201,150,60,0.06)', borderRadius: 12, border: '1px solid rgba(201,150,60,0.15)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#C9963C' }}>Weiterführende Informationen</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li><Link href="/krankenfahrten" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Krankenfahrt jetzt buchen</Link></li>
            <li><Link href="/blog/krankenfahrt-beantragen" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Krankenfahrt beantragen — Schritt für Schritt</Link></li>
            <li><Link href="/blog/zuzahlung-krankenfahrt" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Zuzahlung Krankenfahrt — was muss ich zahlen?</Link></li>
            <li><Link href="/blog/krankenfahrt-buchen-frankfurt" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Krankenfahrt in Frankfurt buchen</Link></li>
            <li><Link href="/blog/krankenfahrt-verordnung-erhalten" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Krankenfahrt-Verordnung (Muster 4) erhalten</Link></li>
            <li><Link href="/blog/arztbegleitung-senioren" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Arztbegleitung für Senioren</Link></li>
            <li><Link href="/termin" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Kostenlose Beratung vereinbaren</Link></li>
            <li><Link href="/faq" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>FAQ: Krankenfahrten und Kostenübernahme</Link></li>
          </ul>
        </section>

        <RelatedPosts slug="krankenfahrt-kostenuebernahme" />
      </article>
    </main>
  );
}
