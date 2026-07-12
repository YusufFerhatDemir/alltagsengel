import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import EngelBewerbungForm from '@/components/EngelBewerbungForm'

// ═══════════════════════════════════════════════════════════
// Recruiting-Stadtseiten: "Alltagsbegleiter Job [Stadt]"
// Ziel-Keywords: alltagsbegleiter job <stadt>, betreuungskraft
// stellenangebot <stadt>, minijob alltagsbegleitung <stadt>
// ═══════════════════════════════════════════════════════════

interface CityData {
  name: string
  region: string
  slug: string
  // Echte Stadtteile — sichtbar gerendert + in FAQ integriert
  stadtteile: string[]
  // Stadtspezifischer Satz für Fließtext (nur stabile öffentliche Fakten)
  lokal: string
  // Slugs benachbarter Städte für „Auch in deiner Nähe"
  nachbarn: string[]
}

export const dynamicParams = true

const cities: Record<string, CityData> = {
  frankfurt: {
    name: 'Frankfurt am Main',
    region: 'Hessen',
    slug: 'frankfurt',
    stadtteile: ['Bornheim', 'Nordend', 'Sachsenhausen', 'Bockenheim', 'Rödelheim', 'Niederrad'],
    lokal: 'In Frankfurt vermitteln wir Einsätze beiderseits des Mains — du übernimmst Aufträge in deinem Stadtteil und sparst dir lange Anfahrten.',
    nachbarn: ['offenbach', 'bad-homburg', 'neu-isenburg', 'frankfurt-hoechst'],
  },
  offenbach: {
    name: 'Offenbach am Main',
    region: 'Hessen',
    slug: 'offenbach',
    stadtteile: ['Bürgel', 'Bieber', 'Rumpenheim', 'Lauterborn', 'Tempelsee'],
    lokal: 'In Offenbach warten Klientinnen und Klienten vom Kaiserlei im Westen bis Bürgel und Rumpenheim am Mainufer.',
    nachbarn: ['frankfurt', 'neu-isenburg', 'rodgau', 'hanau'],
  },
  wiesbaden: {
    name: 'Wiesbaden',
    region: 'Hessen',
    slug: 'wiesbaden',
    stadtteile: ['Biebrich', 'Dotzheim', 'Sonnenberg', 'Bierstadt', 'Schierstein'],
    lokal: 'In der Landeshauptstadt Wiesbaden gibt es Einsätze von Biebrich am Rhein bis hinauf nach Sonnenberg.',
    nachbarn: ['mainz', 'frankfurt-hoechst', 'frankfurt'],
  },
  darmstadt: {
    name: 'Darmstadt',
    region: 'Hessen',
    slug: 'darmstadt',
    stadtteile: ['Bessungen', 'Arheilgen', 'Eberstadt', 'Kranichstein', 'Wixhausen'],
    lokal: 'In der Wissenschaftsstadt Darmstadt vermitteln wir Aufträge von Arheilgen im Norden bis Eberstadt im Süden.',
    nachbarn: ['frankfurt', 'neu-isenburg', 'rodgau'],
  },
  hanau: {
    name: 'Hanau',
    region: 'Hessen',
    slug: 'hanau',
    stadtteile: ['Steinheim', 'Kesselstadt', 'Großauheim', 'Klein-Auheim', 'Mittelbuchen'],
    lokal: 'In der Brüder-Grimm-Stadt Hanau gibt es Einsätze von Kesselstadt bis Steinheim und Großauheim südlich des Mains.',
    nachbarn: ['offenbach', 'rodgau', 'frankfurt', 'aschaffenburg'],
  },
  'bad-homburg': {
    name: 'Bad Homburg',
    region: 'Hessen',
    slug: 'bad-homburg',
    stadtteile: ['Kirdorf', 'Gonzenheim', 'Dornholzhausen', 'Ober-Erlenbach', 'Ober-Eschbach'],
    lokal: 'In der Kurstadt Bad Homburg vor der Höhe vermitteln wir Einsätze von Kirdorf bis Ober-Erlenbach.',
    nachbarn: ['frankfurt', 'friedberg-wetterau', 'frankfurt-hoechst'],
  },
  mainz: {
    name: 'Mainz',
    region: 'Rheinland-Pfalz',
    slug: 'mainz',
    stadtteile: ['Gonsenheim', 'Mombach', 'Bretzenheim', 'Hechtsheim', 'Neustadt', 'Oberstadt'],
    lokal: 'In der rheinland-pfälzischen Landeshauptstadt Mainz gibt es Aufträge von der Neustadt bis Gonsenheim und Hechtsheim.',
    nachbarn: ['wiesbaden', 'frankfurt', 'frankfurt-hoechst'],
  },
  aschaffenburg: {
    name: 'Aschaffenburg',
    region: 'Bayern',
    slug: 'aschaffenburg',
    stadtteile: ['Damm', 'Nilkheim', 'Schweinheim', 'Obernau', 'Leider'],
    lokal: 'In Aschaffenburg am Bayerischen Untermain vermitteln wir Einsätze von Damm bis Schweinheim und Obernau.',
    nachbarn: ['hanau', 'rodgau', 'offenbach'],
  },
  'frankfurt-hoechst': {
    name: 'Frankfurt-Höchst',
    region: 'Hessen',
    slug: 'frankfurt-hoechst',
    stadtteile: ['Nied', 'Sindlingen', 'Unterliederbach', 'Zeilsheim', 'Sossenheim'],
    lokal: 'Im Frankfurter Westen gibt es Einsätze rund um die Höchster Altstadt sowie in den Nachbarstadtteilen.',
    nachbarn: ['frankfurt', 'wiesbaden', 'mainz'],
  },
  'neu-isenburg': {
    name: 'Neu-Isenburg',
    region: 'Hessen',
    slug: 'neu-isenburg',
    stadtteile: ['Stadtmitte', 'Gravenbruch', 'Zeppelinheim'],
    lokal: 'In Neu-Isenburg liegen die Einsätze nah beieinander — von der Stadtmitte bis Gravenbruch und Zeppelinheim.',
    nachbarn: ['frankfurt', 'offenbach', 'darmstadt', 'rodgau'],
  },
  'friedberg-wetterau': {
    name: 'Friedberg (Wetterau)',
    region: 'Hessen',
    slug: 'friedberg-wetterau',
    stadtteile: ['Ockstadt', 'Dorheim', 'Bauernheim', 'Bruchenbrücken', 'Ossenheim'],
    lokal: 'In der Kreisstadt Friedberg (Wetterau) gibt es Aufträge in der Kernstadt und allen Ortsteilen bis Ockstadt und Dorheim.',
    nachbarn: ['bad-homburg', 'frankfurt', 'hanau'],
  },
  rodgau: {
    name: 'Rodgau',
    region: 'Hessen',
    slug: 'rodgau',
    stadtteile: ['Jügesheim', 'Dudenhofen', 'Weiskirchen', 'Hainhausen', 'Nieder-Roden'],
    lokal: 'In Rodgau vermitteln wir Einsätze in allen fünf Stadtteilen — von Weiskirchen bis Nieder-Roden.',
    nachbarn: ['offenbach', 'hanau', 'neu-isenburg'],
  },
}

export function generateStaticParams() {
  return Object.keys(cities).map((stadt) => ({ stadt }))
}

export async function generateMetadata({ params }: { params: Promise<{ stadt: string }> }): Promise<Metadata> {
  const { stadt } = await params
  const city = cities[stadt]
  if (!city) return {}

  return {
    title: `Alltagsbegleiter Job ${city.name} — 20 €/Std. Nebenjob & Minijob`,
    description: `Alltagsbegleiter Job in ${city.name}: 20 €/Stunde, flexible Zeiten, keine Pflegeausbildung nötig. Stellenangebot als Betreuungskraft — Nebenjob oder Minijob. Jetzt bewerben!`,
    keywords: [
      `alltagsbegleiter job ${city.name.toLowerCase()}`,
      `alltagsbegleiter werden ${city.name.toLowerCase()}`,
      `betreuungskraft stellenangebot ${city.name.toLowerCase()}`,
      `minijob alltagsbegleitung ${city.name.toLowerCase()}`,
      `nebenjob seniorenbetreuung ${city.name.toLowerCase()}`,
      `stellenangebot betreuungskraft ${city.region.toLowerCase()}`,
      'alltagsbegleiter job rhein-main',
      'nebenjob pflege ohne ausbildung',
      'quereinsteiger betreuung job',
      '20 euro stunde nebenjob',
    ],
    openGraph: {
      title: `Alltagsbegleiter Job ${city.name} — 20 €/Stunde | Alltagsengel`,
      description: `Flexibler Nebenjob als Alltagsbegleiter/in in ${city.name}. Keine Pflegeausbildung nötig, Quereinsteiger willkommen. Jetzt bewerben!`,
      url:
        city.slug === 'frankfurt'
          ? 'https://alltagsengel.care/engel-werden'
          : `https://alltagsengel.care/engel-werden/${city.slug}`,
      siteName: 'Alltagsengel',
      locale: 'de_DE',
      type: 'website',
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: `Alltagsengel — Alltagsbegleiter Job ${city.name}` }],
    },
    // Frankfurt kanonisiert auf /engel-werden (die Hauptseite zielt bereits auf
    // "… Frankfurt"-Keywords — keine Kannibalisierung). Alle anderen Städte
    // (inkl. frankfurt-hoechst) bleiben self-canonical.
    alternates: {
      canonical:
        city.slug === 'frankfurt'
          ? 'https://alltagsengel.care/engel-werden'
          : `https://alltagsengel.care/engel-werden/${city.slug}`,
    },
  }
}

// Eine Quelle für sichtbare FAQ UND FAQPage-JSON-LD (Google-Richtlinie:
// Structured-Data-FAQs müssen sichtbar auf der Seite stehen)
function buildFaqs(city: CityData): { frage: string; antwort: string }[] {
  return [
    {
      frage: `Wie werde ich Alltagsbegleiter in ${city.name}?`,
      antwort: `Bewirb dich online bei Alltagsengel: Profil anlegen, kurzes Kennenlerngespräch, erweitertes Führungszeugnis einreichen — dann kannst du direkt Aufträge in ${city.name} übernehmen. Der gesamte Einstieg dauert meist nur wenige Tage.`,
    },
    {
      frage: `Was verdient ein Alltagsbegleiter in ${city.name}?`,
      antwort: `Bei Alltagsengel verdienst du 20 € pro Stunde — transparent über die App abgerechnet, pünktlich ausgezahlt. Du bestimmst selbst, wie viele Stunden pro Woche du in ${city.name} arbeitest.`,
    },
    {
      frage: 'Brauche ich eine Ausbildung?',
      antwort: 'Nein. Alltagsbegleitung ist keine medizinische Pflege — du hilfst beim Einkaufen, begleitest zu Arztterminen und leistest Gesellschaft. Empathie und Zuverlässigkeit zählen mehr als Zertifikate. Auf Wunsch unterstützen wir deine Qualifizierung zur Betreuungskraft nach §45a SGB XI.',
    },
    {
      frage: `Geht das auch als Minijob in ${city.name}?`,
      antwort: 'Ja. Viele Engel starten als Minijobber (bis 603 €/Monat). Je nach Verfügbarkeit kannst du auch mehr Stunden übernehmen — als Nebenjob neben Studium, Rente oder Hauptberuf.',
    },
    {
      frage: `In welchen Stadtteilen von ${city.name} gibt es Einsätze?`,
      antwort: `${city.lokal} Zu den Einsatzgebieten zählen unter anderem ${city.stadtteile.join(', ')} — du erhältst Aufträge in deiner Nähe.`,
    },
    {
      frage: 'Bin ich während der Einsätze versichert?',
      antwort: 'Ja. Alle Einsätze über Alltagsengel sind haftpflichtversichert. Du bist während deiner Tätigkeit abgesichert.',
    },
  ]
}

function buildJsonLd(city: CityData, faqs: { frage: string; antwort: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'JobPosting',
        title: `Alltagsbegleiter / Alltagsbegleiterin (m/w/d) – Nebenjob ${city.name}`,
        description: `Als Alltagsbegleiter/in (m/w/d) begleitest du ältere Menschen und Personen mit Pflegegrad in ${city.name} bei alltäglichen Aufgaben: Einkaufen, Arztbesuche, Spaziergänge, Gesellschaft leisten, leichte Haushaltshilfe. Keine medizinische Pflege, keine Ausbildung nötig. Flexible Zeiteinteilung — du bestimmst selbst, wann du arbeitest. 20 € pro Stunde, ideal als Nebenjob oder Minijob. Einsätze unter anderem in ${city.stadtteile.join(', ')}. Quereinsteiger herzlich willkommen!`,
        identifier: { '@type': 'PropertyValue', name: 'Alltagsengel', value: `ae-nebenjob-${city.slug}-001` },
        datePosted: '2026-07-12',
        validThrough: '2026-12-31',
        employmentType: 'PART_TIME',
        hiringOrganization: {
          '@type': 'Organization',
          name: 'Alltagsengel',
          sameAs: 'https://alltagsengel.care',
          logo: 'https://alltagsengel.care/icon-512x512.png',
        },
        jobLocation: {
          '@type': 'Place',
          address: {
            '@type': 'PostalAddress',
            addressLocality: city.name,
            addressRegion: city.region,
            addressCountry: 'DE',
          },
        },
        baseSalary: {
          '@type': 'MonetaryAmount',
          currency: 'EUR',
          value: { '@type': 'QuantitativeValue', value: 20, unitText: 'HOUR' },
        },
        directApply: true,
        experienceRequirements: { '@type': 'OccupationalExperienceRequirements', monthsOfExperience: 0 },
        educationRequirements: { '@type': 'EducationalOccupationalCredential', credentialCategory: 'no requirements' },
        qualifications:
          'Keine Ausbildung erforderlich, Quereinsteiger willkommen. Empathie, Zuverlässigkeit, gute Deutschkenntnisse (mind. B2).',
        industry: 'Sozialwesen / Alltagsbegleitung',
        workHours: 'Flexibel, nach eigener Verfügbarkeit (Minijob möglich)',
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.frage,
          acceptedAnswer: { '@type': 'Answer', text: faq.antwort },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Startseite', item: 'https://alltagsengel.care' },
          { '@type': 'ListItem', position: 2, name: 'Engel werden', item: 'https://alltagsengel.care/engel-werden' },
          { '@type': 'ListItem', position: 3, name: `Alltagsbegleiter Job ${city.name}`, item: `https://alltagsengel.care/engel-werden/${city.slug}` },
        ],
      },
    ],
  }
}

export default async function EngelWerdenStadtPage({ params }: { params: Promise<{ stadt: string }> }) {
  const { stadt } = await params
  const city = cities[stadt]
  if (!city) notFound()

  const faqs = buildFaqs(city)
  const jsonLd = buildJsonLd(city, faqs)
  // Frankfurt kanonisiert auf /engel-werden — interne Links folgen dem Canonical.
  const jobHref = (slug: string) => (slug === 'frankfurt' ? '/engel-werden' : `/engel-werden/${slug}`)

  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="legal-header">
        <Link href="/engel-werden" className="legal-back">&#8249;</Link>
        <h1 className="legal-title">Alltagsbegleiter Job {city.name}</h1>
      </div>
      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">💛</div>
          <h2 className="info-hero-title">Alltagsbegleiter Job in {city.name}</h2>
          <p className="info-hero-sub">
            20 €/Stunde · flexible Zeiten · keine Pflegeausbildung nötig — jetzt als Alltagsengel in {city.name} starten
          </p>
        </div>

        <section className="info-card">
          <h3>Dein Job als Alltagsbegleiter in {city.name}</h3>
          <p>
            Als Alltagsengel begleitest du ältere Menschen und Personen mit Pflegegrad in {city.name} bei
            alltäglichen Aufgaben: Einkaufen, Arztbesuche, Spaziergänge, Kochen oder einfach Gesellschaft
            leisten. Keine medizinische Pflege — sondern menschliche Nähe und praktische Hilfe. Du
            bestimmst selbst, wann und wie oft du arbeitest.
          </p>
          <p style={{ marginTop: 8 }}>{city.lokal}</p>
        </section>

        <section className="info-card">
          <h3>Deine Vorteile bei Alltagsengel</h3>
          <ul className="info-list">
            <li><strong>20 € pro Stunde</strong> — fairer, transparenter Stundenlohn, pünktlich ausgezahlt</li>
            <li><strong>Flexible Zeiteinteilung</strong> — kein Schichtplan, keine Mindestarbeitszeit</li>
            <li><strong>Sinnvolle Arbeit</strong> — du machst einen echten Unterschied im Alltag älterer Menschen</li>
            <li><strong>Keine Pflegeausbildung nötig</strong> — Quereinsteiger herzlich willkommen</li>
            <li><strong>Aufträge in deiner Nähe</strong> — Einsätze in {city.stadtteile.slice(0, 3).join(', ')} und Umgebung</li>
            <li><strong>Versichert</strong> — alle Einsätze sind haftpflichtversichert</li>
            <li><strong>Eigene App</strong> — Aufträge annehmen, Zeiten erfassen, Verdienst im Blick</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Minijob, Nebenjob oder mehr — du entscheidest</h3>
          <p>
            Viele Engel in {city.name} starten als Minijobber (bis 603 €/Monat) — ideal neben Studium,
            Rente oder Hauptberuf. Wer mehr möchte, übernimmt einfach mehr Stunden. Auf Wunsch
            unterstützen wir auch deine Qualifizierung zur anerkannten Betreuungskraft nach
            §45a SGB XI — damit sind deine Einsätze für Klienten über den Entlastungsbetrag
            (131 €/Monat) abrechenbar.
          </p>
        </section>

        <section className="info-card">
          <h3>Das bringst du mit</h3>
          <ul className="info-list">
            <li>Zuverlässigkeit und Pünktlichkeit</li>
            <li>Empathie und Freude am Umgang mit älteren Menschen</li>
            <li>Gute Deutschkenntnisse (mind. B2)</li>
            <li>Erweitertes Führungszeugnis (kann nach der Bewerbung eingereicht werden)</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>In 3 Schritten zum Alltagsengel</h3>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-text">Bewerben — Profil anlegen oder Kontaktdaten hinterlassen</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">Kennenlernen — kurzes Gespräch mit unserem Team</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">Loslegen — Aufträge in {city.name} annehmen &amp; verdienen</div>
            </div>
          </div>
        </section>

        <section className="info-card">
          <h3>Jetzt unverbindlich bewerben</h3>
          <p style={{ marginBottom: 16 }}>
            Hinterlasse deine Kontaktdaten — wir rufen dich an und besprechen alles Weitere.
            Kein Account nötig, keine Verpflichtung.
          </p>
          <EngelBewerbungForm />
        </section>

        <section className="info-card">
          <h3>Häufige Fragen zum Alltagsbegleiter-Job in {city.name}</h3>
          {faqs.map((faq) => (
            <details className="info-faq" key={faq.frage}>
              <summary>{faq.frage}</summary>
              <p>{faq.antwort}</p>
            </details>
          ))}
        </section>

        <section className="info-card">
          <h3>Mehr zum Einstieg</h3>
          <ul className="info-list">
            <li><Link href="/blog/alltagsbegleiter-werden">Alltagsbegleiter werden: Verdienst, Voraussetzungen &amp; Bewerbung</Link></li>
            <li><Link href="/blog/erfahrungsbericht-alltagsengel">Erfahrungsbericht: Mein Alltag als Alltagsengel</Link></li>
            <li><Link href="/blog/nebenjob-pflege">Nebenjob in der Pflege: Flexibel 20 €/Stunde</Link></li>
          </ul>
        </section>

        <div className="info-cta">
          <Link href="/engel/register" className="btn-gold" style={{ width: '100%' }}>JETZT IN {city.name.toUpperCase()} BEWERBEN</Link>
        </div>

        <section className="info-card">
          <h3>Auch in deiner Nähe</h3>
          <p>Alltagsbegleiter-Jobs gibt es auch in diesen Städten:</p>
          <ul className="info-list">
            {city.nachbarn.map((slug) => (
              <li key={slug}><Link href={jobHref(slug)}>Alltagsbegleiter Job {cities[slug].name}</Link></li>
            ))}
          </ul>
        </section>

        <div className="legal-footer-nav">
          <Link href="/engel-werden">Engel werden</Link>
          <Link href="/jobs">Jobs</Link>
          <Link href="/alltagsbegleitung">Alltagsbegleitung</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/agb">AGB</Link>
        </div>
      </div>
    </div>
  )
}
