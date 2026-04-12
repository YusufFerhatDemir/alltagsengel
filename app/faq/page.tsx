import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Häufige Fragen (FAQ) — AlltagsEngel',
  description: 'Antworten auf häufige Fragen zu AlltagsEngel, Entlastungsbetrag, Pflegegrad, Abrechnung und Alltagsbegleitung.',
  keywords: ['FAQ', 'Alltagsbegleitung', 'Entlastungsbetrag', 'Pflegegrad', 'Fragen', 'Hilfe'],
  openGraph: {
    title: 'Häufige Fragen (FAQ) — AlltagsEngel',
    description: 'Antworten auf häufige Fragen zu Alltagsbegleitung und Entlastungsbetrag.',
    url: 'https://alltagsengel.care/faq',
    type: 'website',
  },
}

interface FAQItem {
  question: string
  answer: string
  category: string
}

const faqs: FAQItem[] = [
  // Allgemein
  {
    category: 'Allgemein',
    question: 'Was ist AlltagsEngel?',
    answer: 'AlltagsEngel ist eine Plattform, die Senioren und Pflegebedürftige mit zertifizierten Alltagsbegleitern in ihrer Nähe verbindet. Wir bieten Einkaufsbegleitung, Arztbesuche, Haushaltshilfe, Gesellschaft und vieles mehr — finanziert über den Entlastungsbetrag der Pflegekasse.',
  },
  {
    category: 'Allgemein',
    question: 'Für wen ist AlltagsEngel gedacht?',
    answer: 'AlltagsEngel richtet sich an Menschen mit anerkanntem Pflegegrad (1-5), die Unterstützung im Alltag benötigen, sowie an deren Angehörige. Auch ohne Pflegegrad können Sie unsere Dienste als Selbstzahler nutzen.',
  },
  {
    category: 'Allgemein',
    question: 'In welchen Regionen ist AlltagsEngel verfügbar?',
    answer: 'Aktuell sind wir in Frankfurt am Main und dem gesamten Rhein-Main-Gebiet verfügbar. Wir expandieren kontinuierlich in weitere Regionen in Deutschland.',
  },

  // Kosten & Finanzierung
  {
    category: 'Kosten & Finanzierung',
    question: 'Was kostet AlltagsEngel?',
    answer: 'Für Personen mit Pflegegrad ist AlltagsEngel komplett kostenlos. Die Abrechnung erfolgt direkt über den Entlastungsbetrag (§45b SGB XI) — 131€ pro Monat von der Pflegekasse. Sie zahlen keinen Cent aus eigener Tasche.',
  },
  {
    category: 'Kosten & Finanzierung',
    question: 'Was ist der Entlastungsbetrag nach §45b SGB XI?',
    answer: 'Der Entlastungsbetrag ist eine monatliche Leistung der Pflegekasse in Höhe von 131€ für alle Personen mit Pflegegrad 1-5. Das Geld ist zweckgebunden für anerkannte Entlastungsangebote wie Alltagsbegleitung. Nicht genutztes Budget verfällt am 30. Juni des Folgejahres.',
  },
  {
    category: 'Kosten & Finanzierung',
    question: 'Kann ich den Entlastungsbetrag rückwirkend nutzen?',
    answer: 'Ja! Nicht genutzter Entlastungsbetrag kann bis zum 30. Juni des Folgejahres übertragen werden. Das bedeutet, Sie können theoretisch bis zu 3.144€ ansammeln (24 Monate × 131€).',
  },
  {
    category: 'Kosten & Finanzierung',
    question: 'Wie funktioniert die Abrechnung mit der Pflegekasse?',
    answer: 'Wir übernehmen die komplette Abrechnung für Sie. Nach jedem Einsatz erstellen wir automatisch eine Rechnung, die direkt an Ihre Pflegekasse gesendet wird. Sie müssen sich um nichts kümmern.',
  },

  // Buchung & Service
  {
    category: 'Buchung & Service',
    question: 'Wie buche ich einen Alltagsbegleiter?',
    answer: 'Ganz einfach: 1) Registrieren Sie sich kostenlos in der App, 2) Wählen Sie den gewünschten Service (Einkauf, Arzt, Gesellschaft...), 3) Wählen Sie Datum und Uhrzeit, 4) Ein passender Engel wird Ihnen zugewiesen. Die Buchung dauert nur 2 Minuten.',
  },
  {
    category: 'Buchung & Service',
    question: 'Welche Services bietet AlltagsEngel an?',
    answer: 'Unsere Leistungen umfassen: Einkaufsbegleitung, Arztbegleitung, Haushaltshilfe, Gesellschaft & Spaziergänge, Behördengänge, Postservice, Apothekenbesuche, Gedächtnistraining, Freizeitaktivitäten und Krankenfahrten.',
  },
  {
    category: 'Buchung & Service',
    question: 'Kann ich meinen Engel selbst wählen?',
    answer: 'Ja! Sie können aus verfügbaren Alltagsbegleitern in Ihrer Nähe wählen, basierend auf Bewertungen, Entfernung und Verfügbarkeit. Wenn Ihnen ein Engel besonders gut gefällt, können Sie ihn für zukünftige Buchungen als Favorit markieren.',
  },
  {
    category: 'Buchung & Service',
    question: 'Was passiert bei einer Stornierung?',
    answer: 'Buchungen können bis zu 24 Stunden vorher kostenlos storniert werden. Bei kurzfristigen Absagen helfen wir, schnell einen Ersatz zu finden.',
  },

  // Für Alltagsbegleiter
  {
    category: 'Für Alltagsbegleiter',
    question: 'Wie werde ich Alltagsbegleiter bei AlltagsEngel?',
    answer: 'Registrieren Sie sich als Engel in der App und laden Sie Ihre Qualifikationsnachweise hoch (§45a SGB XI Zertifikat, erweitertes Führungszeugnis). Nach der Prüfung werden Sie freigeschaltet und können Anfragen annehmen.',
  },
  {
    category: 'Für Alltagsbegleiter',
    question: 'Welche Qualifikation brauche ich?',
    answer: 'Sie benötigen eine Qualifikation nach §45a SGB XI (Alltagsbegleiter-Kurs, mind. 40 Stunden). Zusätzlich benötigen wir ein erweitertes Führungszeugnis und einen Nachweis über eine Haftpflichtversicherung.',
  },
  {
    category: 'Für Alltagsbegleiter',
    question: 'Wie flexibel sind die Arbeitszeiten?',
    answer: 'Vollkommen flexibel! Sie entscheiden selbst, wann und wo Sie arbeiten. Sie können Anfragen annehmen oder ablehnen und Ihre Verfügbarkeit jederzeit in der App einstellen.',
  },
  {
    category: 'Für Alltagsbegleiter',
    question: 'Wie viel verdient man als Alltagsbegleiter?',
    answer: 'Die Vergütung liegt zwischen 15-25€ pro Stunde, je nach Service und Region. Die Auszahlung erfolgt automatisch nach jedem abgeschlossenen Einsatz.',
  },

  // Sicherheit
  {
    category: 'Sicherheit & Datenschutz',
    question: 'Sind die Alltagsbegleiter geprüft?',
    answer: 'Ja, alle Engel durchlaufen eine gründliche Prüfung: Qualifikationsnachweis nach §45a SGB XI, erweitertes Führungszeugnis, persönliches Gespräch und fortlaufende Bewertung durch Kunden.',
  },
  {
    category: 'Sicherheit & Datenschutz',
    question: 'Wie schützt AlltagsEngel meine Daten?',
    answer: 'Wir arbeiten vollständig DSGVO-konform. Alle Daten werden verschlüsselt gespeichert, in EU-Rechenzentren gehostet und nur für die Serviceerbringung genutzt. Wir verkaufen keine Daten an Dritte.',
  },

  // Pflegegrad
  {
    category: 'Pflegegrad',
    question: 'Wie beantrage ich einen Pflegegrad?',
    answer: 'Stellen Sie einen formlosen Antrag bei Ihrer Pflegekasse. Ein Gutachter des MDK wird einen Hausbesuch machen und den Pflegebedarf einschätzen. Die Einstufung erfolgt in Pflegegrad 1-5. Wir helfen Ihnen gerne bei der Antragstellung.',
  },
  {
    category: 'Pflegegrad',
    question: 'Brauche ich einen Pflegegrad, um AlltagsEngel zu nutzen?',
    answer: 'Nein! AlltagsEngel kann auch ohne Pflegegrad genutzt werden — dann als Selbstzahler. Mit Pflegegrad übernimmt allerdings die Pflegekasse die Kosten über den Entlastungsbetrag.',
  },
]

export default function FAQPage() {
  const categories = [...new Set(faqs.map(f => f.category))]

  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #1A1612 0%, #2A2420 100%)',
      padding: '0 16px 60px',
    }}>
      {/* Hero */}
      <section style={{
        textAlign: 'center',
        padding: '60px 0 40px',
        maxWidth: 700,
        margin: '0 auto',
      }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <img src="/icon-192x192.png" alt="AlltagsEngel" width={40} height={40} style={{ borderRadius: 10 }} />
          <span style={{ color: '#C9963C', fontWeight: 700, fontSize: 16 }}>AlltagsEngel</span>
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
          Finden Sie Antworten auf die wichtigsten Fragen rund um AlltagsEngel, Entlastungsbetrag und Alltagsbegleitung.
        </p>
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
          Schreiben Sie uns auf WhatsApp oder rufen Sie an.
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

      {/* Schema.org FAQ structured data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map(faq => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      })}} />
    </main>
  )
}
