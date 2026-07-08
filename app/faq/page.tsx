import type { Metadata } from 'next'
import Link from 'next/link'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  alternates: { canonical: 'https://alltagsengel.care/faq' },
  title: 'FAQ: Entlastungsbetrag, Pflegegrad & Alltagsbegleitung',
  description: 'Antworten auf häufige Fragen zu Entlastungsbetrag (131 €/Monat), Pflegehilfsmitteln (42 €/Monat), Pflegegrad und Alltagsbegleitung. Jetzt informieren!',
  keywords: [
    'FAQ Alltagsbegleitung',
    'Entlastungsbetrag §45b',
    '131 Euro Entlastungsbetrag',
    'Pflegehilfsmittel §40',
    '42 Euro Pflegehilfsmittel',
    'Pflegegrad beantragen',
    'Alltagsbegleitung Kosten',
    'Krankenfahrten §60',
    'Entlastungsbetrag beantragen',
    'Pflegekasse Leistungen',
    'Alltagsbegleiter finden',
    'Entlastungsbetrag Verfall',
    'Pflegegrad 1 2 3 4 5',
  ],
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'FAQ — Alltagsbegleitung, Entlastungsbetrag & Pflegegrad | Alltagsengel',
    description: 'Alle Antworten rund um Entlastungsbetrag (131€/Monat), Pflegehilfsmittel (42€/Monat), Pflegegrad und Alltagsbegleitung.',
    url: 'https://alltagsengel.care/faq',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
  },
}

interface FAQItem {
  question: string
  answer: string
  category: string
}

const faqs: FAQItem[] = [
  // ──── Entlastungsbetrag §45b ────
  {
    category: 'Entlastungsbetrag (§ 45b SGB XI)',
    question: 'Was ist der Entlastungsbetrag nach § 45b SGB XI?',
    answer: 'Der Entlastungsbetrag ist eine monatliche Leistung der Pflegekasse in Höhe von 131 € für alle Personen mit Pflegegrad 1 bis 5. Er dient der Finanzierung von anerkannten Entlastungsangeboten im Alltag, zum Beispiel Alltagsbegleitung, Haushaltshilfe oder Betreuungsgruppen. Der Anspruch besteht unabhängig davon, ob weitere Pflegeleistungen bezogen werden.',
  },
  {
    category: 'Entlastungsbetrag (§ 45b SGB XI)',
    question: 'Wie hoch ist der Entlastungsbetrag 2025/2026?',
    answer: 'Seit der Pflegereform 2025 beträgt der Entlastungsbetrag 131 € pro Monat (zuvor 125 €). Pro Jahr stehen damit 1.572 € zur Verfügung. Nicht genutztes Budget wird in das Folgejahr übertragen und verfällt am 30. Juni des Folgejahres.',
  },
  {
    category: 'Entlastungsbetrag (§ 45b SGB XI)',
    question: 'Wer hat Anspruch auf den Entlastungsbetrag?',
    answer: 'Jede Person mit anerkanntem Pflegegrad 1, 2, 3, 4 oder 5 hat Anspruch auf den Entlastungsbetrag von 131 € pro Monat. Ein gesonderter Antrag ist in der Regel nicht nötig — der Anspruch besteht automatisch ab Feststellung des Pflegegrads. Die Abrechnung erfolgt über zugelassene Anbieter wie Alltagsengel.',
  },
  {
    category: 'Entlastungsbetrag (§ 45b SGB XI)',
    question: 'Wie beantrage ich den Entlastungsbetrag?',
    answer: 'Der Entlastungsbetrag muss nicht separat beantragt werden. Sobald ein Pflegegrad vorliegt, besteht der Anspruch. Sie nutzen einfach einen nach Landesrecht anerkannten Anbieter wie Alltagsengel und reichen die Rechnungen bei der Pflegekasse ein. Alltagsengel übernimmt die komplette Abrechnung für Sie.',
  },
  {
    category: 'Entlastungsbetrag (§ 45b SGB XI)',
    question: 'Wann verfällt der Entlastungsbetrag?',
    answer: 'Nicht genutzte Beträge des Entlastungsbetrags werden automatisch ins nächste Kalenderjahr übertragen. Sie verfallen am 30. Juni des Folgejahres. Beispiel: Nicht genutzter Entlastungsbetrag aus 2025 verfällt am 30. Juni 2026. Es können maximal 24 Monate angespart werden (bis zu 3.144 €).',
  },
  {
    category: 'Entlastungsbetrag (§ 45b SGB XI)',
    question: 'Wofür darf der Entlastungsbetrag verwendet werden?',
    answer: 'Der Entlastungsbetrag ist zweckgebunden für nach Landesrecht anerkannte Entlastungsangebote: Alltagsbegleitung und Betreuungsangebote (§ 45a SGB XI), Haushaltshilfe und haushaltsnahe Dienstleistungen, Tages- und Nachtpflege (als Eigenanteil-Zuschuss), Kurzzeitpflege (als Eigenanteil-Zuschuss) sowie anerkannte Betreuungsgruppen. Er darf nicht für medizinische Pflege oder beliebige Privatleistungen genutzt werden.',
  },
  {
    category: 'Entlastungsbetrag (§ 45b SGB XI)',
    question: 'Kann ich den Entlastungsbetrag rückwirkend nutzen?',
    answer: 'Ja. Nicht genutzter Entlastungsbetrag wird ins Folgejahr übertragen und kann bis zum 30. Juni des Folgejahres eingesetzt werden. Beispiel: Wer 2025 keinen Entlastungsbetrag genutzt hat, kann die gesamten 1.572 € (12 × 131 €) noch bis zum 30. Juni 2026 abrufen — zusätzlich zum laufenden Entlastungsbetrag 2026.',
  },

  // ──── Pflegehilfsmittel §40 ────
  {
    category: 'Pflegehilfsmittel (§ 40 SGB XI)',
    question: 'Was sind Pflegehilfsmittel zum Verbrauch?',
    answer: 'Pflegehilfsmittel zum Verbrauch sind Produkte, die im Rahmen der häuslichen Pflege regelmäßig benötigt und verbraucht werden. Dazu gehören Einmalhandschuhe, Bettschutzeinlagen, Desinfektionsmittel, Mundschutz, Schutzschürzen und Fingerlinge. Die Pflegekasse übernimmt die Kosten bis zu 42 € pro Monat.',
  },
  {
    category: 'Pflegehilfsmittel (§ 40 SGB XI)',
    question: 'Wie hoch ist der Zuschuss für Pflegehilfsmittel?',
    answer: 'Die Pflegekasse übernimmt monatlich bis zu 42 € für Pflegehilfsmittel zum Verbrauch. Dieser Betrag gilt für alle Pflegegrade (1–5). Der Anspruch besteht zusätzlich zum Entlastungsbetrag und muss separat beantragt werden. Alltagsengel hilft Ihnen beim Antrag und bei der Bestellung einer kostenlosen Pflegebox.',
  },
  {
    category: 'Pflegehilfsmittel (§ 40 SGB XI)',
    question: 'Wie beantrage ich Pflegehilfsmittel?',
    answer: 'Sie stellen einen formlosen Antrag bei Ihrer Pflegekasse oder nutzen das Antragsformular Ihres Pflegehilfsmittel-Anbieters. Alternativ können Sie über Alltagsengel eine kostenlose Pflegebox bestellen — wir übernehmen den Antrag und die monatliche Lieferung direkt zu Ihnen nach Hause.',
  },

  // ──── Pflegegrad ────
  {
    category: 'Pflegegrad',
    question: 'Was ist ein Pflegegrad?',
    answer: 'Der Pflegegrad (1 bis 5) beschreibt den Grad der Pflegebedürftigkeit eines Menschen. Er wird vom Medizinischen Dienst (MD, ehemals MDK) durch ein Begutachtungsverfahren festgestellt. Je höher der Pflegegrad, desto umfangreicher sind die Leistungsansprüche gegenüber der Pflegekasse. Bereits ab Pflegegrad 1 besteht Anspruch auf den Entlastungsbetrag von 131 € pro Monat.',
  },
  {
    category: 'Pflegegrad',
    question: 'Wie beantrage ich einen Pflegegrad?',
    answer: 'Stellen Sie einen formlosen Antrag bei Ihrer Pflegekasse (telefonisch, schriftlich oder online). Die Pflegekasse beauftragt dann den Medizinischen Dienst (MD) mit einem Hausbesuch. Der Gutachter bewertet sechs Lebensbereiche (Mobilität, kognitive Fähigkeiten, Selbstversorgung etc.) und vergibt Punkte. Anhand der Gesamtpunktzahl wird der Pflegegrad 1–5 festgelegt. Alltagsengel unterstützt Sie kostenlos bei der Antragstellung.',
  },
  {
    category: 'Pflegegrad',
    question: 'Welche Leistungen stehen mir mit welchem Pflegegrad zu?',
    answer: 'Ab Pflegegrad 1: Entlastungsbetrag 131 €/Monat, Pflegehilfsmittel 42 €/Monat, Wohnraumanpassung bis 4.000 €. Ab Pflegegrad 2: zusätzlich Pflegegeld (347 €), Pflegesachleistungen (796 €), Tages-/Nachtpflege (721 €) sowie der gemeinsame Jahresbetrag für Verhinderungs- und Kurzzeitpflege (3.539 €/Jahr, seit 01.07.2025). Die Leistungen steigen mit höherem Pflegegrad. Alltagsengel hilft Ihnen, alle Ansprüche optimal zu nutzen.',
  },
  {
    category: 'Pflegegrad',
    question: 'Wie kann ich einen bestehenden Pflegegrad erhöhen lassen?',
    answer: 'Wenn sich Ihr Gesundheitszustand verschlechtert hat, können Sie bei Ihrer Pflegekasse einen Höherstufungsantrag stellen. Es erfolgt eine erneute Begutachtung durch den Medizinischen Dienst. Tipp: Führen Sie vorab ein Pflegetagebuch, um den erhöhten Pflegebedarf zu dokumentieren. Alltagsengel berät Sie gerne kostenlos zum Höherstufungsantrag.',
  },
  {
    category: 'Pflegegrad',
    question: 'Brauche ich einen Pflegegrad, um Alltagsengel zu nutzen?',
    answer: 'Nein. Alltagsengel kann auch ohne Pflegegrad genutzt werden — dann als Selbstzahler zum regulären Stundensatz von 32 €. Mit anerkanntem Pflegegrad übernimmt die Pflegekasse die Kosten jedoch über den Entlastungsbetrag (131 €/Monat), sodass für Sie keine Kosten entstehen.',
  },

  // ──── Alltagsbegleitung ────
  {
    category: 'Alltagsbegleitung',
    question: 'Was ist Alltagsbegleitung?',
    answer: 'Alltagsbegleitung ist eine Unterstützungsleistung für pflegebedürftige Menschen und Senioren im Alltag. Zertifizierte Alltagsbegleiter (nach § 45a SGB XI) helfen bei Einkäufen, Arztbegleitung, Haushaltshilfe, Spaziergängen, Behördengängen und leisten Gesellschaft. Alltagsbegleitung ist keine medizinische Pflege, sondern eine Entlastung im täglichen Leben — finanziert über den Entlastungsbetrag der Pflegekasse.',
  },
  {
    category: 'Alltagsbegleitung',
    question: 'Was kostet Alltagsbegleitung bei Alltagsengel?',
    answer: 'Für Personen mit Pflegegrad ist Alltagsbegleitung über Alltagsengel ohne eigene Zuzahlung möglich. Die Kosten werden direkt über den Entlastungsbetrag (§ 45b, 131 €/Monat) mit der Pflegekasse abgerechnet. Der reguläre Stundensatz beträgt ab 32 €. Selbstzahler ohne Pflegegrad zahlen den Stundensatz privat.',
  },
  {
    category: 'Alltagsbegleitung',
    question: 'Was ist Alltagsengel?',
    answer: 'Alltagsengel ist eine Plattform, die Senioren und Pflegebedürftige mit zertifizierten Alltagsbegleitern in ihrer Nähe verbindet. Wir bieten Einkaufsbegleitung, Arztbesuche, Haushaltshilfe, Gesellschaft und vieles mehr — finanziert über den Entlastungsbetrag der Pflegekasse. Aktuell sind wir in Frankfurt am Main und dem gesamten Rhein-Main-Gebiet verfügbar.',
  },
  {
    category: 'Alltagsbegleitung',
    question: 'Welche Leistungen bietet Alltagsengel an?',
    answer: 'Unsere Alltagsbegleitung umfasst: Einkaufsbegleitung und Besorgungen, Arztbegleitung und Apothekenbesuche, Haushaltshilfe (Kochen, Putzen, Wäsche), Spaziergänge und Freizeitgestaltung, Behördengänge und Postservice, psychosoziale Betreuung und Gespräche, Gedächtnistraining und geistige Aktivierung, Unterstützung bei der Tagesstrukturierung sowie Antragshilfen bei Pflegekasse und Behörden.',
  },
  {
    category: 'Alltagsbegleitung',
    question: 'In welchen Regionen ist Alltagsengel verfügbar?',
    answer: 'Alltagsengel ist aktuell in Frankfurt am Main und dem gesamten Rhein-Main-Gebiet verfügbar, darunter Offenbach, Wiesbaden, Darmstadt, Hanau, Bad Homburg, Mainz und Aschaffenburg. Wir expandieren kontinuierlich in weitere Regionen in Deutschland.',
  },
  {
    category: 'Alltagsbegleitung',
    question: 'Wie buche ich einen Alltagsbegleiter?',
    answer: 'Die Buchung ist einfach: 1. Registrieren Sie sich kostenlos in der App oder auf der Website. 2. Wählen Sie den gewünschten Service (Einkauf, Arztbegleitung, Haushaltshilfe etc.). 3. Wählen Sie Datum und Uhrzeit. 4. Ein passender, zertifizierter Engel wird Ihnen zugewiesen. Die Buchung dauert nur 2 Minuten und ist kostenlos.',
  },
  {
    category: 'Alltagsbegleitung',
    question: 'Kann ich meinen Alltagsbegleiter selbst wählen?',
    answer: 'Ja. Sie können aus verfügbaren Alltagsbegleitern in Ihrer Nähe wählen, basierend auf Bewertungen, Entfernung und Verfügbarkeit. Wenn Ihnen ein Engel besonders gut gefällt, können Sie ihn als Favorit markieren und für zukünftige Buchungen bevorzugen.',
  },

  // ──── Krankenfahrten §60 ────
  {
    category: 'Krankenfahrten (§ 60 SGB V)',
    question: 'Was sind Krankenfahrten nach § 60 SGB V?',
    answer: 'Krankenfahrten sind medizinisch notwendige Fahrten zu Ärzten, Krankenhäusern oder Therapieeinrichtungen. Die Krankenkasse übernimmt die Kosten, wenn eine ärztliche Verordnung vorliegt. Voraussetzungen: anerkannter Pflegegrad 3 oder höher, Schwerbehindertenausweis mit Merkzeichen „aG", „Bl" oder „H", oder eine Verordnung für eine dauerhafte Behandlung (z. B. Dialyse, Chemotherapie).',
  },
  {
    category: 'Krankenfahrten (§ 60 SGB V)',
    question: 'Wie beantrage ich eine Krankenfahrt?',
    answer: 'Für eine Krankenfahrt benötigen Sie eine ärztliche Verordnung (Transportschein). Ihr Arzt stellt diese aus, wenn die Fahrt medizinisch notwendig ist. Ab Pflegegrad 3 ist die Verordnung oft eine Formsache. Die Krankenkasse muss die Fahrt vorab genehmigen (bei Serienbehandlungen reicht eine einmalige Genehmigung). Alltagsengel bietet Krankenfahrten an und hilft Ihnen beim gesamten Ablauf.',
  },
  {
    category: 'Krankenfahrten (§ 60 SGB V)',
    question: 'Muss ich bei Krankenfahrten zuzahlen?',
    answer: 'In der Regel fällt eine gesetzliche Zuzahlung von 10 % der Fahrtkosten an, mindestens 5 € und maximal 10 € pro Fahrt. Personen mit einer Befreiung von der Zuzahlung (Belastungsgrenze erreicht) zahlen nichts. Kinder unter 18 Jahren sind generell von der Zuzahlung befreit.',
  },

  // ──── Kosten & Abrechnung ────
  {
    category: 'Kosten & Abrechnung',
    question: 'Was kostet Alltagsengel?',
    answer: 'Für Personen mit Pflegegrad ist Alltagsengel in der Regel komplett kostenlos. Die Abrechnung erfolgt direkt über den Entlastungsbetrag (§ 45b SGB XI) — 131 € pro Monat von der Pflegekasse. Sie zahlen keinen Cent aus eigener Tasche. Selbstzahler ohne Pflegegrad zahlen den regulären Stundensatz ab 32 €.',
  },
  {
    category: 'Kosten & Abrechnung',
    question: 'Wie funktioniert die Abrechnung mit der Pflegekasse?',
    answer: 'Alltagsengel übernimmt die komplette Abrechnung für Sie. Nach jedem Einsatz erstellen wir automatisch eine Rechnung, die direkt an Ihre Pflegekasse gesendet wird. Sie müssen sich um nichts kümmern — kein Papierkram, keine Vorkasse, keine Formulare.',
  },

  // ──── Für Alltagsbegleiter ────
  {
    category: 'Für Alltagsbegleiter (Engel)',
    question: 'Wie werde ich Alltagsbegleiter bei Alltagsengel?',
    answer: 'Registrieren Sie sich als Engel in der App und laden Sie Ihre Qualifikationsnachweise hoch: Zertifikat nach § 45a SGB XI (mindestens 40 Stunden Qualifikation) und ein erweitertes Führungszeugnis. Nach der Prüfung werden Sie freigeschaltet und können Anfragen in Ihrer Region annehmen.',
  },
  {
    category: 'Für Alltagsbegleiter (Engel)',
    question: 'Welche Qualifikation brauche ich als Alltagsbegleiter?',
    answer: 'Sie benötigen eine Qualifikation nach § 45a SGB XI (Alltagsbegleiter-Kurs mit mindestens 40 Stunden Schulung). Zusätzlich benötigen wir ein aktuelles erweitertes Führungszeugnis und einen Nachweis über eine Haftpflichtversicherung. Bei Alltagsengel sind Sie automatisch über unsere Plattform versichert.',
  },
  {
    category: 'Für Alltagsbegleiter (Engel)',
    question: 'Wie viel verdient man als Alltagsbegleiter?',
    answer: 'Die Vergütung liegt zwischen 15 und 25 € pro Stunde, je nach Service und Region. Die Auszahlung erfolgt automatisch nach jedem abgeschlossenen Einsatz. Arbeitszeiten und Einsatzorte bestimmen Sie völlig flexibel selbst.',
  },

  // ──── Sicherheit & Datenschutz ────
  {
    category: 'Sicherheit & Datenschutz',
    question: 'Sind die Alltagsbegleiter geprüft?',
    answer: 'Ja, alle Engel durchlaufen eine gründliche Prüfung: Qualifikationsnachweis nach § 45a SGB XI, erweitertes Führungszeugnis, persönliches Gespräch und fortlaufende Bewertung durch Kunden. Zudem sind alle Engel über Alltagsengel versichert.',
  },
  {
    category: 'Sicherheit & Datenschutz',
    question: 'Wie schützt Alltagsengel meine Daten?',
    answer: 'Alltagsengel arbeitet vollständig DSGVO-konform. Alle Daten werden verschlüsselt gespeichert und in EU-Rechenzentren gehostet. Wir nutzen Ihre Daten ausschließlich für die Serviceerbringung und verkaufen keine Daten an Dritte.',
  },
]

export default function FAQPage() {
  const categories = [...new Set(faqs.map(f => f.category))]

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    name: 'Häufige Fragen zu Alltagsbegleitung, Entlastungsbetrag und Pflegegrad',
    description: 'Antworten auf die wichtigsten Fragen rund um Alltagsbegleitung, Entlastungsbetrag (131€/Monat), Pflegehilfsmittel (42€/Monat), Pflegegrad und Krankenfahrten.',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }

  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Alltagsengel',
    url: 'https://alltagsengel.care',
    description: 'Zertifizierte Alltagsbegleitung im Rhein-Main-Gebiet. Abrechnung über den Entlastungsbetrag §45b SGB XI.',
    areaServed: {
      '@type': 'GeoCircle',
      geoMidpoint: { '@type': 'GeoCoordinates', latitude: 50.1109, longitude: 8.6821 },
      geoRadius: '50000',
    },
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #1A1612 0%, #2A2420 100%)',
      padding: '0 16px 60px',
    }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
      <BreadcrumbSchema items={[{ name: 'FAQ' }]} />

      {/* Hero */}
      <section style={{
        textAlign: 'center',
        padding: '60px 0 40px',
        maxWidth: 700,
        margin: '0 auto',
      }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <img src="/icon-192x192.png" alt="Alltagsengel" width={40} height={40} style={{ borderRadius: 10 }} />
          <span style={{ color: '#C9963C', fontWeight: 700, fontSize: 16 }}>Alltagsengel</span>
        </Link>
        <h1 style={{
          fontSize: 'clamp(28px, 5vw, 38px)',
          fontWeight: 700,
          color: '#F5F0E8',
          marginBottom: 12,
          lineHeight: 1.2,
        }}>
          Häufige Fragen
        </h1>
        <p style={{ color: '#B8B0A4', fontSize: 16, lineHeight: 1.6, maxWidth: 520, margin: '0 auto' }}>
          Antworten auf die wichtigsten Fragen rund um Alltagsbegleitung,
          Entlastungsbetrag (131 €/Monat), Pflegehilfsmittel (42 €/Monat),
          Pflegegrad und Krankenfahrten.
        </p>
      </section>

      {/* Quick Facts */}
      <section style={{
        maxWidth: 700,
        margin: '0 auto 40px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
      }}>
        {[
          { label: 'Entlastungsbetrag', value: '131 €/Monat', detail: '§ 45b SGB XI' },
          { label: 'Pflegehilfsmittel', value: '42 €/Monat', detail: '§ 40 SGB XI' },
          { label: 'Stundensatz', value: 'ab 32 €', detail: 'Alltagsbegleitung' },
        ].map(item => (
          <div key={item.label} style={{
            background: 'rgba(201, 150, 60, 0.08)',
            border: '1px solid rgba(201, 150, 60, 0.2)',
            borderRadius: 14,
            padding: '16px 20px',
            textAlign: 'center',
          }}>
            <div style={{ color: '#C9963C', fontSize: 22, fontWeight: 700 }}>{item.value}</div>
            <div style={{ color: '#F5F0E8', fontSize: 14, fontWeight: 600, marginTop: 4 }}>{item.label}</div>
            <div style={{ color: '#B8B0A4', fontSize: 12, marginTop: 2 }}>{item.detail}</div>
          </div>
        ))}
      </section>

      {/* FAQ Sections */}
      <section style={{ maxWidth: 700, margin: '0 auto' }}>
        {categories.map(category => (
          <div key={category} style={{ marginBottom: 40 }}>
            <h2 style={{
              color: '#C9963C',
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 16,
              paddingBottom: 8,
              borderBottom: '1px solid rgba(201, 150, 60, 0.2)',
            }}>
              {category}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {faqs.filter(f => f.category === category).map((faq, i) => (
                <details
                  key={i}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.06)',
                    overflow: 'hidden',
                  }}
                >
                  <summary style={{
                    padding: '16px 20px',
                    color: '#F5F0E8',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer',
                    listStyle: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    lineHeight: 1.4,
                  }}>
                    {faq.question}
                    <span style={{ color: '#C9963C', fontSize: 20, flexShrink: 0, marginLeft: 12 }}>+</span>
                  </summary>
                  <div style={{
                    padding: '0 20px 16px',
                    color: '#B8B0A4',
                    fontSize: 14,
                    lineHeight: 1.7,
                  }}>
                    {faq.answer}
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section style={{
        maxWidth: 700,
        margin: '40px auto 0',
        textAlign: 'center',
        background: 'linear-gradient(135deg, rgba(201, 150, 60, 0.1) 0%, rgba(201, 150, 60, 0.05) 100%)',
        borderRadius: 20,
        padding: 'clamp(28px, 4vw, 44px)',
        border: '1px solid rgba(201, 150, 60, 0.2)',
      }}>
        <h2 style={{ color: '#F5F0E8', fontSize: 'clamp(18px, 3vw, 24px)', fontWeight: 700, marginBottom: 10 }}>
          Noch Fragen? Wir helfen gerne!
        </h2>
        <p style={{ color: '#B8B0A4', fontSize: 14, marginBottom: 20 }}>
          Schreiben Sie uns auf WhatsApp oder rufen Sie an — kostenlos und unverbindlich.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/auth/register" style={{
            display: 'inline-block',
            background: '#C9963C',
            color: '#1A1612',
            padding: '12px 28px',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 15,
            textDecoration: 'none',
          }}>
            Kostenlos starten
          </Link>
          <Link href="/kontakt" style={{
            display: 'inline-block',
            background: 'rgba(255,255,255,0.06)',
            color: '#F5F0E8',
            padding: '12px 28px',
            borderRadius: 12,
            fontWeight: 600,
            fontSize: 15,
            textDecoration: 'none',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            Kontakt
          </Link>
        </div>
      </section>

      {/* Footer Navigation */}
      <nav style={{
        maxWidth: 700,
        margin: '40px auto 0',
        display: 'flex',
        justifyContent: 'center',
        gap: 20,
        flexWrap: 'wrap',
      }}>
        {[
          { href: '/alltagsbegleitung', label: 'Alltagsbegleitung' },
          { href: '/impressum', label: 'Impressum' },
          { href: '/datenschutz', label: 'Datenschutz' },
          { href: '/agb', label: 'AGB' },
        ].map(link => (
          <Link key={link.href} href={link.href} style={{ color: '#B8B0A4', fontSize: 13, textDecoration: 'none' }}>
            {link.label}
          </Link>
        ))}
      </nav>
    </main>
  )
}
