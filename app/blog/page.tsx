import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Ratgeber — Pflege, Alltagsbegleitung & Entlastungsbetrag',
  description: 'Hilfreiche Artikel rund um Pflegegrad, Entlastungsbetrag, Alltagsbegleitung und Seniorenbetreuung. Kostenlose Tipps von AlltagsEngel.',
  keywords: ['Pflege Ratgeber', 'Entlastungsbetrag', 'Pflegegrad', 'Alltagsbegleitung', 'Seniorenbetreuung', 'Pflegehilfsmittel'],
  openGraph: {
    title: 'Ratgeber — Pflege, Alltagsbegleitung & Entlastungsbetrag',
    description: 'Hilfreiche Artikel rund um Pflegegrad, Entlastungsbetrag und Seniorenbetreuung.',
    url: 'https://alltagsengel.care/blog',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

interface BlogArticle {
  slug: string
  title: string
  description: string
  category: string
  readTime: string
  date: string
}

const articles: BlogArticle[] = [
  {
    slug: 'entlastungsbetrag-45b',
    title: 'Entlastungsbetrag §45b SGB XI — 131€/Monat für Alltagsbegleitung',
    description: 'Erfahren Sie, wie Sie den Entlastungsbetrag nach §45b SGB XI nutzen können. 131€ monatlich für zertifizierte Alltagsbegleitung.',
    category: 'Finanzierung',
    readTime: '6 min',
    date: '19. März 2026',
  },
  {
    slug: 'entlastungsbetrag-beantragen',
    title: 'Entlastungsbetrag beantragen — Schritt für Schritt Anleitung',
    description: 'So beantragen Sie den Entlastungsbetrag richtig. Vollständige Anleitung mit Tipps zur schnellen Bewilligung.',
    category: 'Finanzierung',
    readTime: '5 min',
    date: '20. März 2026',
  },
  {
    slug: 'pflegegrad-beantragen',
    title: 'Pflegegrad beantragen — Antrag, MDK-Begutachtung & Tipps',
    description: 'Alles zum Pflegegrad-Antrag: Von der Antragstellung über den MDK-Besuch bis zur Einstufung.',
    category: 'Pflegegrad',
    readTime: '8 min',
    date: '21. März 2026',
  },
  {
    slug: 'verhinderungspflege-beantragen',
    title: 'Verhinderungspflege beantragen — bis zu 1.612€/Jahr',
    description: 'So nutzen Sie die Verhinderungspflege richtig: Antrag, Voraussetzungen und Kombination mit Kurzzeitpflege.',
    category: 'Finanzierung',
    readTime: '6 min',
    date: '22. März 2026',
  },
  {
    slug: 'pflegehilfsmittel-40-euro',
    title: 'Pflegehilfsmittel — 40€/Monat kostenlos von der Kasse',
    description: 'Diese Pflegehilfsmittel stehen Ihnen monatlich zu: Einmalhandschuhe, Desinfektionsmittel, Bettschutz und mehr.',
    category: 'Finanzierung',
    readTime: '4 min',
    date: '23. März 2026',
  },
  {
    slug: 'alltagsbegleitung-frankfurt',
    title: 'Alltagsbegleitung in Frankfurt — Angebote & Kosten',
    description: 'Finden Sie die beste Alltagsbegleitung in Frankfurt am Main. Überblick über Angebote, Kosten und Kassenabrechnung.',
    category: 'Alltagsbegleitung',
    readTime: '5 min',
    date: '24. März 2026',
  },
  {
    slug: 'seniorenbetreuung-zu-hause',
    title: 'Seniorenbetreuung zu Hause — Angebote, Kosten & Finanzierung',
    description: 'Professionelle Seniorenbetreuung in den eigenen vier Wänden. Welche Möglichkeiten gibt es und was bezahlt die Kasse?',
    category: 'Alltagsbegleitung',
    readTime: '7 min',
    date: '25. März 2026',
  },
  {
    slug: 'alltagshilfe-senioren',
    title: 'Alltagshilfe für Senioren — Was wird angeboten?',
    description: 'Von Einkaufsbegleitung bis Haushaltshilfe: Diese Alltagshilfen unterstützen Senioren im täglichen Leben.',
    category: 'Alltagsbegleitung',
    readTime: '5 min',
    date: '26. März 2026',
  },
  {
    slug: 'einkaufshilfe-senioren',
    title: 'Einkaufshilfe für Senioren — Unterstützung beim Einkaufen',
    description: 'Professionelle Einkaufshilfe für ältere Menschen. So funktioniert die Begleitung und Abrechnung über die Pflegekasse.',
    category: 'Services',
    readTime: '4 min',
    date: '27. März 2026',
  },
  {
    slug: 'arztbegleitung-senioren',
    title: 'Arztbegleitung für Senioren — Sicher zum Arzttermin',
    description: 'Professionelle Begleitung zum Arzt: Ablauf, Kosten und Kassenabrechnung für Seniorenbegleitung.',
    category: 'Services',
    readTime: '4 min',
    date: '28. März 2026',
  },
  {
    slug: 'krankenfahrt-kostenuebernahme',
    title: 'Krankenfahrt Kostenübernahme — Wer zahlt die Fahrt zum Arzt?',
    description: 'Wann übernimmt die Krankenkasse die Fahrtkosten? Alles zu Krankenfahrten, Genehmigung und Erstattung.',
    category: 'Services',
    readTime: '5 min',
    date: '29. März 2026',
  },
  {
    slug: 'alltagsbegleiter-werden',
    title: 'Alltagsbegleiter werden — Ausbildung, Gehalt & Einstieg',
    description: 'So werden Sie zertifizierter Alltagsbegleiter nach §45a SGB XI. Qualifikation, Verdienstmöglichkeiten und Bewerbung.',
    category: 'Karriere',
    readTime: '6 min',
    date: '30. März 2026',
  },
  {
    slug: 'nebenjob-pflege',
    title: 'Nebenjob in der Pflege — Flexibel als Alltagsbegleiter arbeiten',
    description: 'Nebenjob als Alltagsbegleiter: Flexible Arbeitszeiten, faire Bezahlung und sinnvolle Tätigkeit.',
    category: 'Karriere',
    readTime: '5 min',
    date: '31. März 2026',
  },
  {
    slug: 'einsamkeit-im-alter',
    title: 'Einsamkeit im Alter — Ursachen, Folgen & Hilfsangebote',
    description: 'Einsamkeit betrifft viele Senioren. Erfahren Sie, welche Hilfsangebote es gibt und wie Alltagsbegleitung helfen kann.',
    category: 'Ratgeber',
    readTime: '7 min',
    date: '1. April 2026',
  },
  {
    slug: 'pflege-app-vergleich',
    title: 'Pflege-App Vergleich 2026 — Die besten Apps für pflegende Angehörige',
    description: 'Welche Pflege-Apps helfen wirklich? Vergleich der besten digitalen Helfer für Pflegebedürftige und Angehörige.',
    category: 'Ratgeber',
    readTime: '8 min',
    date: '2. April 2026',
  },
]

const categoryColors: Record<string, string> = {
  'Finanzierung': '#C9963C',
  'Pflegegrad': '#8B6D3F',
  'Alltagsbegleitung': '#5B8A72',
  'Services': '#4A7A8B',
  'Karriere': '#7B5EA7',
  'Ratgeber': '#A05A5A',
}

export default function BlogIndexPage() {
  const categories = [...new Set(articles.map(a => a.category))]

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
        maxWidth: 800,
        margin: '0 auto',
      }}>
        <p style={{ color: '#C9963C', fontSize: 14, fontWeight: 600, letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' }}>
          Ratgeber & Wissen
        </p>
        <h1 style={{
          fontSize: 'clamp(28px, 5vw, 42px)',
          fontWeight: 700,
          color: '#F5F0E8',
          marginBottom: 16,
          lineHeight: 1.2,
        }}>
          Alles rund um Pflege, Entlastung & Alltagsbegleitung
        </h1>
        <p style={{ color: '#B8B0A4', fontSize: 17, lineHeight: 1.6, maxWidth: 600, margin: '0 auto' }}>
          Kostenlose Ratgeber-Artikel mit praktischen Tipps zur Finanzierung, Beantragung und Organisation von Pflegeleistungen.
        </p>
      </section>

      {/* Featured Article */}
      <section style={{ maxWidth: 800, margin: '0 auto 40px' }}>
        <Link href={`/blog/${articles[0].slug}`} style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'linear-gradient(135deg, #2C2520 0%, #1E1A16 100%)',
            borderRadius: 20,
            padding: 'clamp(24px, 4vw, 40px)',
            border: '1px solid rgba(201, 150, 60, 0.3)',
            transition: 'border-color 0.3s',
          }}>
            <span style={{
              display: 'inline-block',
              background: '#C9963C',
              color: '#1A1612',
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: 6,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 16,
            }}>
              Top-Artikel
            </span>
            <h2 style={{ color: '#F5F0E8', fontSize: 'clamp(20px, 3.5vw, 28px)', fontWeight: 700, marginBottom: 12, lineHeight: 1.3 }}>
              {articles[0].title}
            </h2>
            <p style={{ color: '#B8B0A4', fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>
              {articles[0].description}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ color: '#C9963C', fontSize: 13, fontWeight: 600 }}>{articles[0].category}</span>
              <span style={{ color: '#777', fontSize: 13 }}>{articles[0].readTime} Lesezeit</span>
              <span style={{ color: '#777', fontSize: 13 }}>{articles[0].date}</span>
            </div>
          </div>
        </Link>
      </section>

      {/* Category Filter (visual, no JS needed for SSR) */}
      <section style={{ maxWidth: 800, margin: '0 auto 32px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <span key={cat} style={{
              display: 'inline-block',
              background: 'rgba(255,255,255,0.06)',
              color: '#B8B0A4',
              fontSize: 13,
              fontWeight: 500,
              padding: '6px 14px',
              borderRadius: 20,
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              {cat}
            </span>
          ))}
        </div>
      </section>

      {/* Article Grid */}
      <section style={{
        maxWidth: 800,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))',
        gap: 20,
      }}>
        {articles.slice(1).map(article => (
          <Link key={article.slug} href={`/blog/${article.slug}`} style={{ textDecoration: 'none' }}>
            <article style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 16,
              padding: 'clamp(20px, 3vw, 28px)',
              border: '1px solid rgba(255,255,255,0.06)',
              transition: 'background 0.3s, border-color 0.3s',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: categoryColors[article.category] || '#C9963C',
                }} />
                <span style={{ color: categoryColors[article.category] || '#C9963C', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {article.category}
                </span>
              </div>
              <h3 style={{ color: '#F5F0E8', fontSize: 17, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
                {article.title}
              </h3>
              <p style={{ color: '#8A8279', fontSize: 14, lineHeight: 1.5, marginBottom: 16, flex: 1 }}>
                {article.description}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#666', fontSize: 12 }}>{article.readTime} Lesezeit</span>
                <span style={{ color: '#C9963C', fontSize: 13, fontWeight: 600 }}>Lesen →</span>
              </div>
            </article>
          </Link>
        ))}
      </section>

      {/* CTA Section */}
      <section style={{
        maxWidth: 800,
        margin: '60px auto 0',
        textAlign: 'center',
        background: 'linear-gradient(135deg, rgba(201, 150, 60, 0.1) 0%, rgba(201, 150, 60, 0.05) 100%)',
        borderRadius: 20,
        padding: 'clamp(32px, 5vw, 48px)',
        border: '1px solid rgba(201, 150, 60, 0.2)',
      }}>
        <h2 style={{ color: '#F5F0E8', fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 700, marginBottom: 12 }}>
          Noch Fragen? Wir helfen Ihnen gerne.
        </h2>
        <p style={{ color: '#B8B0A4', fontSize: 15, lineHeight: 1.6, maxWidth: 500, margin: '0 auto 24px' }}>
          Kostenlose Beratung zu Entlastungsbetrag, Pflegegrad und Alltagsbegleitung.
        </p>
        <Link href="/kontakt" style={{
          display: 'inline-block',
          background: '#C9963C',
          color: '#1A1612',
          padding: '14px 36px',
          borderRadius: 12,
          fontWeight: 700,
          textDecoration: 'none',
          fontSize: 16,
        }}>
          Kostenlos beraten lassen
        </Link>
      </section>

      {/* Schema.org structured data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: 'AlltagsEngel Ratgeber',
        description: 'Ratgeber-Artikel rund um Pflege, Entlastungsbetrag und Alltagsbegleitung.',
        url: 'https://alltagsengel.care/blog',
        publisher: {
          '@type': 'Organization',
          name: 'AlltagsEngel',
          url: 'https://alltagsengel.care',
          logo: { '@type': 'ImageObject', url: 'https://alltagsengel.care/icon-512x512.jpg' },
        },
        blogPost: articles.map(a => ({
          '@type': 'BlogPosting',
          headline: a.title,
          description: a.description,
          url: `https://alltagsengel.care/blog/${a.slug}`,
          datePublished: a.date,
          author: { '@type': 'Organization', name: 'AlltagsEngel' },
        })),
      })}} />
    </main>
  )
}
