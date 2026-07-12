import type { Metadata } from 'next';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import HowToSchema from '@/components/HowToSchema'
import SpeakableSchema from '@/components/SpeakableSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Alltagsbegleitung bei psychischen Erkrankungen',
  description: 'Alltagsbegleitung bei Depression, Angststörung & Co.: Was Begleiter leisten, wo die Grenzen zur Therapie liegen und wie die Pflegekasse mit 131 €/Monat zahlt.',
  keywords: 'Alltagsbegleitung psychische Erkrankungen, Alltagsbegleitung Depression, Alltagshilfe psychisch krank, Pflegegrad psychische Erkrankung, Betreuung Depression zu Hause, Entlastungsbetrag psychische Erkrankung',
  alternates: { canonical: 'https://alltagsengel.care/blog/alltagsbegleitung-psychische-erkrankungen' },
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Alltagsbegleitung bei psychischen Erkrankungen',
    description: 'Wie Alltagsbegleitung Menschen mit Depression, Angststörung oder anderen psychischen Erkrankungen im Alltag stützt — und wer die Kosten übernimmt.',
  },
};

// Ein gemeinsames Array speist das sichtbare FAQ UND das FAQPage-JSON-LD
// (Google-Richtlinie: FAQ-Markup muss sichtbarem Seiteninhalt entsprechen).
const faqItems = [
  {
    frage: 'Hilft Alltagsbegleitung bei Depression?',
    antwort:
      'Ja — als Ergänzung zur Behandlung. Alltagsbegleitung ersetzt keine Therapie, stützt aber genau dort, wo Depression den Alltag lähmt: Sie hilft bei Haushalt und Einkäufen, begleitet zu Terminen, bringt Tagesstruktur und wirkt der sozialen Isolation entgegen.',
  },
  {
    frage: 'Bekommt man mit einer psychischen Erkrankung einen Pflegegrad?',
    antwort:
      'Ja. Seit 2017 bewertet die Pflegebegutachtung psychische und kognitive Beeinträchtigungen gleichwertig zu körperlichen. Entscheidend ist, wie stark die Selbstständigkeit im Alltag eingeschränkt ist — etwa bei Tagesstruktur, Selbstversorgung und sozialen Kontakten.',
  },
  {
    frage: 'Wer zahlt Alltagsbegleitung bei psychischen Erkrankungen?',
    antwort:
      'Mit Pflegegrad 1 bis 5 zahlt die Pflegekasse über den Entlastungsbetrag (§45b SGB XI) 131 € pro Monat für anerkannte Alltagsbegleitung — ohne Eigenanteil. Ab Pflegegrad 2 können Umwandlungsanspruch und Verhinderungspflege hinzukommen.',
  },
  {
    frage: 'Was ist der Unterschied zwischen Alltagsbegleitung und Soziotherapie?',
    antwort:
      'Soziotherapie (§37a SGB V) ist eine ärztlich verordnete Leistung für schwer psychisch erkrankte Menschen, die von speziell qualifizierten Fachkräften koordiniert wird. Alltagsbegleitung ist niedrigschwelliger: praktische Hilfe und Begleitung im Alltag, ohne Verordnung, finanziert über die Pflegekasse.',
  },
  {
    frage: 'Darf ein Alltagsbegleiter therapeutische Gespräche führen?',
    antwort:
      'Nein. Alltagsbegleiter führen alltägliche, stützende Gespräche — sie leisten Gesellschaft, hören zu und motivieren. Diagnostik, Therapie und Krisenintervention gehören ausschließlich in die Hände von Ärzten und Psychotherapeuten.',
  },
  {
    frage: 'Was passiert bei einer akuten psychischen Krise?',
    antwort:
      'Alltagsbegleitung ist keine Krisenhilfe. Bei akuter Selbst- oder Fremdgefährdung zählt der Notruf 112, der sozialpsychiatrische Dienst oder die Telefonseelsorge (0800 111 0 111, kostenlos, rund um die Uhr). Die Begleitung kann aber helfen, Frühwarnzeichen zu bemerken und Angehörige zu informieren.',
  },
  {
    frage: 'Eignet sich Alltagsbegleitung auch für jüngere Menschen mit psychischer Erkrankung?',
    antwort:
      'Ja. Alltagsbegleitung ist keine Altersleistung — entscheidend ist der Pflegegrad, nicht das Geburtsjahr. Auch jüngere Menschen mit Depression, Angststörung oder anderen Erkrankungen können den Entlastungsbetrag für Unterstützung im Alltag nutzen.',
  },
  {
    frage: 'Wie finde ich eine passende Begleitung für einen psychisch erkrankten Angehörigen?',
    antwort:
      'Achten Sie auf Einfühlungsvermögen, Verlässlichkeit und die Möglichkeit, die Person vorab kennenzulernen. Bei Alltagsengel geben Sie den Unterstützungsbedarf bei der Buchung an, wählen Ihren Engel selbst aus und können jederzeit wechseln, wenn die Chemie nicht stimmt.',
  },
]

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Alltagsbegleitung bei psychischen Erkrankungen: Halt im Alltag',
  description: 'Alltagsbegleitung bei Depression, Angststörung & Co.: Was Begleiter leisten, wo die Grenzen zur Therapie liegen und wie die Pflegekasse mit 131 €/Monat zahlt.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-07-12',
  dateModified: '2026-07-12',
  mainEntityOfPage: 'https://alltagsengel.care/blog/alltagsbegleitung-psychische-erkrankungen',
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

export default function AlltagsbegleitungPsychischeErkrankungenPage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Alltagsbegleitung bei psychischen Erkrankungen' }]} />
      <SpeakableSchema url="/blog/alltagsbegleitung-psychische-erkrankungen" cssSelectors={['.blog-header h1', '.blog-intro p']} />
      <HowToSchema
        name="Alltagsbegleitung bei einer psychischen Erkrankung organisieren"
        description="In fünf Schritten passende Alltagsunterstützung bei Depression, Angststörung oder anderen psychischen Erkrankungen aufbauen — finanziert über den Entlastungsbetrag."
        totalTime="P14D"
        steps={[
          { name: 'Bedarf mit Behandlern besprechen', text: 'Klären Sie mit Hausarzt, Psychiater oder Therapeut, welche Alltagsunterstützung sinnvoll ist — Alltagsbegleitung ergänzt die Behandlung, ersetzt sie aber nicht.' },
          { name: 'Pflegegrad beantragen', text: 'Psychische Beeinträchtigungen zählen bei der Begutachtung gleichwertig. Stellen Sie einen formlosen Antrag bei der Pflegekasse; ein Pflegetagebuch über typische Alltagseinschränkungen hilft.', url: '/pflegegrad-check' },
          { name: 'Entlastungsbetrag nutzen', text: 'Ab Pflegegrad 1 stehen 131 €/Monat für anerkannte Alltagsbegleitung bereit — die Abrechnung mit der Pflegekasse übernimmt Alltagsengel komplett.', url: '/entlastungsbetrag' },
          { name: 'Begleitung behutsam starten', text: 'Ein unverbindliches Kennenlernen, klare Absprachen über Nähe und Distanz, kleine erste Schritte — Vertrauen wächst über Verlässlichkeit.', url: '/auth/register' },
          { name: 'Rhythmus und Ziele festhalten', text: 'Ein fester wöchentlicher Termin mit wiederkehrenden Elementen (Einkauf, Spaziergang, Papierkram) gibt Struktur — und lässt sich flexibel an gute und schlechte Tage anpassen.' },
        ]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <article className="blog-article">
        <div className="blog-header">
          <h1>Alltagsbegleitung bei psychischen Erkrankungen: Halt im Alltag</h1>
          <div className="blog-meta">
            <span className="blog-date">12. Juli 2026</span>
            <span className="blog-reading-time">11 Min. Lesezeit</span>
          </div>
        </div>

        <div className="blog-intro">
          <p>Eine Depression, eine Angststörung oder eine andere psychische Erkrankung verändert den Alltag oft gründlicher als jede körperliche Diagnose: Der Einkauf wird zur Hürde, Post bleibt ungeöffnet, Kontakte schlafen ein. Alltagsbegleitung setzt genau dort an — mit praktischer Hilfe, verlässlicher Struktur und menschlicher Ansprache. Sie ersetzt keine Therapie, aber sie stützt den Alltag, in dem Genesung stattfindet. Und: Mit Pflegegrad zahlt die Pflegekasse über den Entlastungsbetrag 131 € pro Monat dafür.</p>
        </div>

        <div className="blog-content">
          <h2>Psychische Erkrankung und Alltag: die unterschätzte Baustelle</h2>
          <p>Behandlung findet in der Praxis oder Klinik statt — gelebt wird zu Hause. Zwischen Therapieterminen liegen Tage und Wochen, in denen Wäsche, Einkäufe, Behördenpost und Mahlzeiten anfallen. Viele psychische Erkrankungen greifen genau die Fähigkeiten an, die dafür nötig sind: Antrieb, Konzentration, Entscheidungsfähigkeit, das Vertrauen, unter Menschen zu gehen.</p>
          <p>Die Folge ist ein Teufelskreis: Der unerledigte Alltag wächst zum Berg, der Berg verstärkt Scham und Rückzug, der Rückzug verschlimmert die Erkrankung. Studien zur Depressionsbehandlung zeigen seit Langem, dass <strong>Tagesstruktur, Aktivierung und soziale Kontakte</strong> wesentliche Genesungsfaktoren sind — Elemente, die eine <Link href="/alltagsbegleitung">Alltagsbegleitung</Link> ganz praktisch in die Woche bringt.</p>

          <h2>Was Alltagsbegleitung leisten kann — und was nicht</h2>
          <h3>Das leistet die Begleitung</h3>
          <ul>
            <li><strong>Struktur:</strong> Ein fester wöchentlicher Termin ist ein Ankerpunkt, der auch an schweren Tagen Bestand hat — jemand kommt, verlässlich.</li>
            <li><strong>Gemeinsam statt allein:</strong> Einkaufen, Kochen, Aufräumen fallen zu zweit leichter. Die Begleitung erledigt nicht über den Kopf hinweg, sondern <em>mit</em> der Person — kleine Erfolge gehören zur Stabilisierung.</li>
            <li><strong>Papierkram und Behörden:</strong> Anträge, Post und Termine sind für viele Betroffene die größte Hürde. Die Begleitung sortiert mit, erinnert und begleitet zu Ämtern.</li>
            <li><strong>Begleitung aus dem Haus:</strong> Der Weg zum Arzt, zur Apotheke oder einfach in den Park — in Begleitung gelingt, was allein unüberwindbar scheint. Gerade bei Angststörungen ist das oft der wertvollste Baustein.</li>
            <li><strong>Ansprache ohne Bewertung:</strong> Ein alltägliches Gespräch ohne Diagnose-Blick, Zuhören ohne Therapieauftrag — viele Betroffene erleben das als entlastend.</li>
            <li><strong>Entlastung für Angehörige:</strong> Partner und Familie psychisch erkrankter Menschen tragen viel — eine verlässliche Begleitung verschafft Freiräume. Mehr dazu: <Link href="/blog/tipps-fuer-pflegende-angehoerige">Tipps für pflegende Angehörige</Link>.</li>
          </ul>
          <h3>Klare Grenzen: keine Therapie, keine Krisenhilfe</h3>
          <p>Genauso wichtig ist, was Alltagsbegleitung <strong>nicht</strong> ist:</p>
          <ul>
            <li><strong>Keine Psychotherapie:</strong> Diagnostik, therapeutische Gespräche und Behandlungsentscheidungen gehören zu Ärzten und Psychotherapeuten. Die Begleitung ergänzt die Behandlung — idealerweise in Absprache mit den Behandlern.</li>
            <li><strong>Keine Medikamentenverantwortung:</strong> Erinnern ist erlaubt, Stellen und Verabreichen nicht — das bleibt bei Behandlern, Pflegedienst oder Angehörigen.</li>
            <li><strong>Keine Krisenintervention:</strong> Bei akuter Selbst- oder Fremdgefährdung gilt: Notruf 112, sozialpsychiatrischer Dienst oder Telefonseelsorge (0800 111 0 111, rund um die Uhr und kostenlos). Eine gute Begleitung kennt diese Wege und informiert im Zweifel die Angehörigen.</li>
          </ul>
          <p>Für schwer psychisch erkrankte Menschen gibt es zusätzlich spezialisierte Leistungen der Krankenkasse — etwa die ärztlich verordnete <strong>Soziotherapie (§37a SGB V)</strong> oder die ambulante psychiatrische Pflege. Alltagsbegleitung ist die niedrigschwellige Ergänzung dazu: ohne Verordnung, ohne Wartezeit, direkt im Alltag.</p>

          <h2>Typische Situationen: Wie Begleitung je nach Erkrankung hilft</h2>
          <ul>
            <li><strong>Depression:</strong> Wenn Antrieb und Energie fehlen, scheitert der Tag oft an der ersten Hürde. Die Begleitung senkt die Einstiegsschwelle — gemeinsam aufstehen, gemeinsam anfangen. Kleine, verlässlich wiederkehrende Aktivitäten wirken der Antriebslosigkeit entgegen, ohne zu überfordern.</li>
            <li><strong>Angst- und Panikstörungen:</strong> Der Weg vor die Tür ist die zentrale Herausforderung. Eine vertraute Begleitperson macht Wege zum Arzt, zum Supermarkt oder zur Behörde wieder gangbar — und hilft, den Bewegungsradius Schritt für Schritt zu erweitern, in Absprache mit der Therapie.</li>
            <li><strong>Zwangserkrankungen:</strong> Alltagsroutinen kosten überdurchschnittlich viel Zeit und Kraft. Die Begleitung entlastet bei den praktischen Aufgaben, die liegen bleiben, und bringt eine wohlwollende Außenstruktur in den Tag.</li>
            <li><strong>Bipolare Störungen und Psychosen (in stabilen Phasen):</strong> Nach einem Klinikaufenthalt hilft die Begleitung, den Alltag wieder aufzubauen — Post sortieren, Termine koordinieren, Tagesrhythmus stabilisieren — und ist eine verlässliche Konstante zwischen den Behandlungsterminen.</li>
            <li><strong>Altersdepression und Einsamkeit:</strong> Bei älteren Menschen verstärken sich Isolation und depressive Symptome gegenseitig. Ein fester wöchentlicher Besuch durchbricht diesen Kreislauf — oft die wirksamste einzelne Maßnahme.</li>
          </ul>
          <p>In allen Fällen gilt: Die Begleitung stimmt sich — mit Einverständnis der betroffenen Person — auf das ab, was Behandler und Familie erarbeitet haben. Sie ist Teil des unterstützenden Umfelds, nicht Teil der Behandlung.</p>

          <h2>Pflegegrad bei psychischen Erkrankungen: seit 2017 gleichberechtigt</h2>
          <p>Viele Betroffene und Angehörige wissen nicht, dass psychische Erkrankungen einen <strong>Pflegegrad</strong> begründen können. Seit der Pflegereform 2017 bewertet die Begutachtung nicht mehr körperliche Defizite, sondern die <strong>Selbstständigkeit</strong> in sechs Lebensbereichen — darunter „kognitive und kommunikative Fähigkeiten", „Verhaltensweisen und psychische Problemlagen" und „Gestaltung des Alltagslebens und sozialer Kontakte". Wer krankheitsbedingt seine Tagesstruktur, Selbstversorgung oder soziale Teilhabe nicht mehr eigenständig bewältigt, kann einen Pflegegrad erhalten — unabhängig vom Alter.</p>
          <p>Für den Antrag gilt: formlos bei der Pflegekasse stellen, den Begutachtungstermin gut vorbereiten und ehrlich schildern, wie ein <em>schlechter</em> Tag aussieht — nicht der beste. Ein über zwei Wochen geführtes Tagebuch der Einschränkungen hilft dem Gutachter enorm. Die Schritte im Detail: <Link href="/blog/pflegegrad-beantragen">Pflegegrad beantragen</Link>; eine erste Selbsteinschätzung gibt der <Link href="/pflegegrad-check">Pflegegrad-Check</Link>.</p>

          <h2>Wer zahlt? Finanzierung über die Pflegekasse</h2>
          <ul>
            <li><strong>Entlastungsbetrag (§45b SGB XI):</strong> <strong>131 € pro Monat</strong> ab Pflegegrad 1, zweckgebunden für anerkannte Angebote zur Unterstützung im Alltag. Das finanziert etwa vier Begleitstunden monatlich ohne Eigenanteil — nicht Genutztes bleibt bis zum 30. Juni des Folgejahres erhalten. Details: <Link href="/entlastungsbetrag">Entlastungsbetrag</Link>.</li>
            <li><strong>Umwandlungsanspruch (§45a Abs. 4 SGB XI):</strong> Ab Pflegegrad 2 können bis zu 40 % der Pflegesachleistungen zusätzlich in Alltagsunterstützung fließen.</li>
            <li><strong>Verhinderungspflege (§39 SGB XI):</strong> Kümmert sich hauptsächlich ein Angehöriger, finanziert sie mit bis zu 3.539 € pro Jahr stundenweise Vertretung — Details: <Link href="/verhinderungspflege">Verhinderungspflege</Link>.</li>
            <li><strong>Selbstzahler:</strong> Ohne Pflegegrad ist Alltagsbegleitung ab 32 €/Stunde privat buchbar; haushaltsnahe Dienstleistungen sind steuerlich absetzbar.</li>
          </ul>
          <p>Alle Finanzierungswege im Überblick: <Link href="/blog/wer-zahlt-alltagsbegleitung">Wer zahlt die Alltagsbegleitung?</Link> — und der <Link href="/budgetrechner">Budgetrechner</Link> zeigt Ihr persönliches Budget.</p>

          <h2>Worauf es bei der Begleitung psychisch erkrankter Menschen ankommt</h2>
          <ul>
            <li><strong>Verlässlichkeit vor allem anderen:</strong> Abgesagte Termine treffen Menschen mit Depression oder Angststörung besonders hart. Eine feste Bezugsperson mit festem Rhythmus ist die Basis.</li>
            <li><strong>Geduld mit schlechten Tagen:</strong> Es gibt Besuche, an denen nur ein kurzes Gespräch möglich ist — auch das ist ein Erfolg. Gute Begleitung passt das Tempo an, statt Druck aufzubauen.</li>
            <li><strong>Nähe und Distanz respektieren:</strong> Klare Absprachen, was gewünscht ist und was nicht, geben beiden Seiten Sicherheit.</li>
            <li><strong>Ressourcen stärken:</strong> Die Begleitung übernimmt nicht alles, sondern so viel wie nötig — Selbstwirksamkeit ist Teil der Stabilisierung.</li>
            <li><strong>Zusammenarbeit mit dem Umfeld:</strong> Mit Einverständnis der betroffenen Person tauscht sich die Begleitung mit Angehörigen aus, damit niemand aneinander vorbei arbeitet.</li>
          </ul>
          <p>Bei Alltagsengel wählen Sie Ihren Engel selbst aus, lernen ihn vorab kennen und können jederzeit wechseln. Alle Engel sind geprüft (Identität, Führungszeugnis), geschult und im Einsatz versichert. Übrigens wirkt regelmäßige Begleitung auch präventiv gegen die Isolation, die psychische Erkrankungen im Alter oft verstärkt — mehr dazu im Ratgeber <Link href="/blog/einsamkeit-im-alter">Einsamkeit im Alter</Link>.</p>

          <h2>Häufige Fragen zur Alltagsbegleitung bei psychischen Erkrankungen</h2>
          {faqItems.map((f) => (
            <div key={f.frage}>
              <h3>{f.frage}</h3>
              <p>{f.antwort}</p>
            </div>
          ))}

          <h2>Fazit: Praktische Hilfe, die Behandlung trägt</h2>
          <p>Psychische Erkrankungen werden in Praxis und Klinik behandelt — aber bewältigt werden sie im Alltag. Alltagsbegleitung füllt genau diese Lücke: mit Struktur, praktischer Unterstützung und verlässlicher menschlicher Präsenz, ohne Therapieanspruch und ohne Stigma. Dank des Entlastungsbetrags von 131 € monatlich ist sie ab Pflegegrad 1 ohne Eigenanteil zugänglich — auch für jüngere Betroffene. Der erste Schritt ist oft der Pflegegrad-Antrag; alles Weitere übernimmt ein anerkannter Anbieter wie Alltagsengel, inklusive der kompletten Abrechnung mit der Pflegekasse.</p>
        </div>

        <div className="blog-cta">
          <h3>Behutsam starten — mit einem Kennenlernen</h3>
          <p>Wählen Sie einen geprüften Engel aus, lernen Sie ihn unverbindlich kennen und nutzen Sie Ihre 131 €/Monat von der Pflegekasse. Wir übernehmen die komplette Abrechnung.</p>
          <Link href="/alltagsbegleitung" className="btn-gold">Mehr zur Alltagsbegleitung</Link>
        </div>

        <RelatedPosts slug="alltagsbegleitung-psychische-erkrankungen" />
      </article>
    </main>
  );
}
