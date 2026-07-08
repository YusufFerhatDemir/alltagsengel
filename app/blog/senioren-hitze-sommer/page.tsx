import type { Metadata } from 'next'
import { Fragment } from 'react'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import RelatedPosts from '@/components/RelatedPosts'

export const metadata: Metadata = {
  title: 'Senioren & Hitze: 7 Tipps für den Sommer',
  description: 'Hitze ist für Senioren gefährlich: 7 praktische Tipps gegen Dehydration und Hitzschlag. Plus: Alltagsbegleitung für 131 €/Monat über die Pflegekasse sichern.',
  keywords: ['Senioren Hitze', 'Senioren Hitze Tipps', 'Pflege im Sommer', 'Hitze ältere Menschen', 'Dehydration Senioren', 'Hitzschlag Vorbeugung', 'Alltagsbegleitung Sommer'],
  alternates: { canonical: 'https://alltagsengel.care/blog/senioren-hitze-sommer' },
  openGraph: {
    title: 'Senioren & Hitze: 7 Tipps für den Sommer',
    description: 'So schützen Sie ältere Angehörige bei Hitze — 7 praktische Tipps gegen Dehydration und Kreislaufprobleme.',
    url: 'https://alltagsengel.care/blog/senioren-hitze-sommer',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Senioren & Hitze: 7 Tipps, wie Sie Ihre Angehörigen im Sommer schützen',
  description: 'Hitze ist für Senioren gefährlich: 7 praktische Tipps gegen Dehydration und Hitzschlag. Plus: Alltagsbegleitung für 131 €/Monat über die Pflegekasse sichern.',
  author: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  publisher: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care', logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.png' } },
  datePublished: '2026-07-02',
  dateModified: '2026-07-02',
  mainEntityOfPage: 'https://alltagsengel.care/blog/senioren-hitze-sommer',
  image: 'https://alltagsengel.care/og-image.png',
  inLanguage: 'de-DE',
}

// Ein Array für sichtbare FAQ-Sektion UND FAQPage-JSON-LD (Google-Richtlinie: kein unsichtbares FAQ-Markup)
const faqs = [
  {
    q: 'Wie viel sollten Senioren bei Hitze trinken?',
    a: 'Mindestens 1,5 Liter am Tag, bei großer Hitze eher 2 Liter — sofern keine ärztliche Trinkmengenbegrenzung (z. B. bei Herz- oder Nierenerkrankung) besteht. Da das Durstgefühl im Alter nachlässt, helfen feste Trinkzeiten und Getränke in Sichtweite.',
  },
  {
    q: 'Welche Getränke sind bei Hitze am besten?',
    a: 'Ideal sind Wasser, ungesüßte Kräuter- und Früchtetees sowie stark verdünnte Fruchtsaftschorlen. Auf Alkohol und stark gezuckerte Getränke sollte verzichtet werden, da sie dem Körper zusätzlich Flüssigkeit entziehen.',
  },
  {
    q: 'Kann ich die Betreuung im Sommer über die Pflegekasse finanzieren?',
    a: 'Ja. Der Entlastungsbetrag von 131 €/Monat steht ab Pflegegrad 1 nach §45b SGB XI zur Verfügung und kann für Alltagsbegleitung genutzt werden. Nicht genutzte Beträge verfallen erst am 30. Juni des Folgejahres — der Sommer ist also ein guter Zeitpunkt, das Budget sinnvoll einzusetzen.',
  },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function SeniorenHitzeSommerPage() {
  return (
    <main className="blog-container">
      <BreadcrumbSchema items={[{ name: 'Ratgeber', url: '/blog' }, { name: 'Senioren & Hitze' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <article className="blog-article">
        <header className="blog-header">
          <h1>Senioren &amp; Hitze: 7 Tipps, wie Sie Ihre Angehörigen im Sommer schützen</h1>
          <p className="blog-meta">Veröffentlicht am 2. Juli 2026 | 7 min Lesezeit</p>
        </header>

        <div className="blog-content">
          <p className="blog-intro">
            Sommerhitze kann für ältere Menschen lebensgefährlich werden. Was für jüngere Menschen unangenehm
            ist, kann bei Senioren zu <strong>Dehydration, Kreislaufkollaps oder Hitzschlag</strong> führen.
            Der Körper reguliert die Temperatur im Alter schlechter, das Durstgefühl lässt nach und viele
            Medikamente verstärken die Hitzeempfindlichkeit. Mit den folgenden sieben Tipps schützen Sie
            Ihre Angehörigen — und erfahren, wie eine <Link href="/alltagsbegleitung">Alltagsbegleitung</Link> gerade
            in den heißen Monaten spürbar entlastet.
          </p>

          <h2>Warum Hitze für Senioren besonders gefährlich ist</h2>
          <p>
            Mit zunehmendem Alter verändert sich die Fähigkeit des Körpers, mit Hitze umzugehen. Drei Faktoren
            spielen dabei zusammen:
          </p>
          <ul className="blog-list">
            <li><strong>Vermindertes Durstgefühl:</strong> Ältere Menschen spüren Durst deutlich später — oft
              trinken sie erst, wenn der Körper bereits Flüssigkeit verloren hat.</li>
            <li><strong>Schlechtere Temperaturregulierung:</strong> Die Haut kann weniger schwitzen, die
              Wärmeabgabe funktioniert langsamer.</li>
            <li><strong>Wechselwirkung mit Medikamenten:</strong> Entwässerungstabletten (Diuretika),
              Blutdruck- und Herzmedikamente können den Flüssigkeitshaushalt zusätzlich belasten.</li>
          </ul>
          <p>
            Die Folge: Schon ein heißer Tag kann zu Schwindel, Verwirrtheit und im schlimmsten Fall zu einem
            Hitzschlag führen. Umso wichtiger ist Vorbeugung.
          </p>

          <h2>Tipp 1: Ausreichend trinken — mit System</h2>
          <p>
            Mindestens <strong>1,5 Liter am Tag</strong>, bei großer Hitze eher 2 Liter (sofern der Arzt keine
            Trinkmengenbegrenzung vorgegeben hat). Da sich viele Senioren nicht von allein ans Trinken erinnern,
            helfen feste Rituale: ein Glas Wasser zu jeder Mahlzeit, Getränke gut sichtbar auf dem Tisch, ein
            Trinkprotokoll am Kühlschrank. Wasserreiche Lebensmittel wie <strong>Wassermelone, Gurke und
            Tomaten</strong> liefern zusätzliche Flüssigkeit.
          </p>

          <h2>Tipp 2: Die Wohnung kühl halten</h2>
          <p>
            Lüften Sie in den <strong>frühen Morgen- und späten Abendstunden</strong>, wenn die Luft kühl ist.
            Tagsüber Rollläden, Vorhänge oder Jalousien schließen, um die Sonne auszusperren. Aufenthaltsräume
            sollten möglichst im Schatten liegen. Ein feuchtes Tuch über dem Ventilator oder kühle Wadenwickel
            senken die gefühlte Temperatur zusätzlich.
          </p>

          <h2>Tipp 3: Aktivitäten in die kühlen Stunden verlegen</h2>
          <p>
            Spaziergänge, Einkäufe und Arzttermine gehören in die <strong>Morgen- oder Abendstunden</strong>.
            Die pralle Mittagssonne zwischen 11 und 17 Uhr sollte gemieden werden. Genau hier setzt
            Alltagsbegleitung an: Unsere Alltagsbegleiter:innen passen die Besuchszeiten flexibel an die Hitze
            an — Einkäufe am kühlen Morgen, ein Spaziergang im schattigen Park am Abend.
          </p>

          <h2>Tipp 4: Leichte Kleidung und Sonnenschutz</h2>
          <p>
            Luftige, helle Kleidung aus Baumwolle oder Leinen lässt Wärme entweichen. Bei Aufenthalten im Freien
            gehören <strong>Kopfbedeckung und Sonnencreme</strong> dazu — die Haut wird im Alter dünner und
            empfindlicher gegenüber UV-Strahlung.
          </p>

          <h2>Tipp 5: Medikamente vom Hausarzt prüfen lassen</h2>
          <p>
            Manche Medikamente verstärken die Hitzeempfindlichkeit oder müssen bei starkem Flüssigkeitsverlust
            angepasst werden. Ein <strong>kurzer Check beim Hausarzt vor dem Sommer</strong> schafft Sicherheit.
            Wichtig: Medikamente kühl und trocken lagern — nicht in der Sonne auf der Fensterbank.
          </p>

          <h2>Tipp 6: Warnzeichen eines Hitzschlags kennen</h2>
          <p>
            Achten Sie auf diese Symptome — sie sind ein medizinischer Notfall:
          </p>
          <ul className="blog-list">
            <li>Hohe Körpertemperatur, heiße und trockene Haut</li>
            <li>Verwirrtheit, Desorientierung oder ungewöhnliches Verhalten</li>
            <li>Kopfschmerzen, Schwindel, Übelkeit</li>
            <li>Schneller Puls, flache Atmung</li>
          </ul>
          <p>
            Bei diesen Anzeichen: Person in den Schatten bringen, Kleidung öffnen, mit feuchten Tüchern kühlen,
            in kleinen Schlucken Wasser geben und im Zweifel sofort den <strong>Notruf 112</strong> wählen.
          </p>

          <h2>Tipp 7: Niemanden allein lassen — regelmäßige Besuche</h2>
          <p>
            Der wichtigste Schutz ist, dass <strong>jemand regelmäßig nach dem älteren Menschen schaut</strong> —
            gerade wenn Angehörige berufstätig sind oder selbst in den Urlaub fahren. Ein Besuch am Tag genügt
            oft, um sicherzustellen, dass genug getrunken wird, die Wohnung kühl ist und es der Person gut geht.
          </p>

          <h2>Wie Alltagsbegleitung im Sommer entlastet</h2>
          <p>
            Genau für diese regelmäßige Zuwendung gibt es die <strong>Alltagsbegleitung</strong>. Unsere
            zertifizierten Alltagsbegleiter:innen (Engel) besuchen Ihre Angehörigen zu Hause und achten aktiv
            auf die Hitze-Risiken:
          </p>
          <ul className="blog-list">
            <li>Regelmäßig ans Trinken erinnern und Getränke bereitstellen</li>
            <li>Einkäufe und Besorgungen in die kühlen Tageszeiten legen</li>
            <li>Für gekühlte Räume und angemessene Kleidung sorgen</li>
            <li>Gesellschaft leisten und den Allgemeinzustand im Blick behalten</li>
            <li>Bei Bedarf Kontakt zu Angehörigen oder Hausarzt herstellen</li>
          </ul>
          <p>
            Das Beste: Ab <Link href="/blog/pflegegrad-1-leistungen">Pflegegrad 1</Link> übernimmt die Pflegekasse
            die Kosten über den <Link href="/blog/entlastungsbetrag-45b">Entlastungsbetrag nach §45b SGB XI</Link> —
            <strong> 131 € pro Monat</strong>. Die komplette Abrechnung übernimmt Alltagsengel für Sie, ganz
            ohne Papierkram.
          </p>

          <h2>Häufige Fragen zu Senioren und Hitze</h2>

          {faqs.map((f) => (
            <Fragment key={f.q}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </Fragment>
          ))}

          <div className="blog-cta">
            <h3>Jetzt Alltagsbegleitung für den Sommer sichern</h3>
            <p>
              Damit Ihre Angehörigen auch bei Hitze gut versorgt sind: Registrieren Sie sich kostenlos bei
              Alltagsengel und finden Sie zertifizierte Alltagsbegleiter:innen in Frankfurt &amp; Rhein-Main.
              Abrechnung über den Entlastungsbetrag, keine Vermittlungsgebühr.
            </p>
            <Link href="/auth/register" className="cta-button">
              Kostenlos registrieren →
            </Link>
            <p style={{ marginTop: 12 }}>
              <Link href="/kontakt" style={{ color: '#C9963C', textDecoration: 'underline' }}>
                Oder lassen Sie sich kostenlos beraten →
              </Link>
            </p>
          </div>
        </div>

        <RelatedPosts slug="senioren-hitze-sommer" />

        <footer className="blog-footer">
          <Link href="/blog" className="blog-back">← Zurück zum Ratgeber</Link>
        </footer>

        <section className="blog-related" style={{ marginTop: 40, padding: '24px 20px', background: 'rgba(201,150,60,0.06)', borderRadius: 12, border: '1px solid rgba(201,150,60,0.15)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#C9963C' }}>Weiterführende Informationen</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li><Link href="/alltagsbegleitung" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Alltagsbegleitung buchen</Link></li>
            <li><Link href="/blog/entlastungsbetrag-45b" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Entlastungsbetrag: 131 €/Monat verstehen</Link></li>
            <li><Link href="/blog/einsamkeit-im-alter" style={{ color: '#F5F0E8', textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 14 }}>Einsamkeit im Alter — Ursachen &amp; Hilfe</Link></li>
          </ul>
        </section>
      </article>
    </main>
  )
}
