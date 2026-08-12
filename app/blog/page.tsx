import type { Metadata } from 'next'
import Link from 'next/link'
import NewsletterSignup from '@/components/NewsletterSignup'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import { BLOG_POSTS } from '@/lib/blog-posts'

export const metadata: Metadata = {
  title: 'Pflege-Ratgeber — Entlastungsbetrag & Pflegegrad',
  description: 'Hilfreiche Ratgeber-Artikel zu Pflegegrad, Entlastungsbetrag, Alltagsbegleitung und Seniorenbetreuung. Jetzt kostenlos lesen und Ansprüche sichern.',
  keywords: ['Pflege Ratgeber', 'Entlastungsbetrag', 'Pflegegrad', 'Alltagsbegleitung', 'Seniorenbetreuung', 'Pflegehilfsmittel'],
  alternates: {
    canonical: 'https://alltagsengel.care/blog',
    types: {
      'application/rss+xml': [{ url: '/blog/feed.xml', title: 'Alltagsengel Ratgeber' }],
    },
  },
  openGraph: {
    title: 'Ratgeber — Pflege, Alltagsbegleitung & Entlastungsbetrag',
    description: 'Hilfreiche Artikel rund um Pflegegrad, Entlastungsbetrag und Seniorenbetreuung.',
    url: 'https://alltagsengel.care/blog',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
}

// Alle Artikel-Daten kommen aus der zentralen Registry (lib/blog-posts.ts) —
// sortiert nach Veröffentlichungsdatum, neueste zuerst.
const articles = [...BLOG_POSTS].sort((a, b) =>
  b.datePublished.localeCompare(a.datePublished)
)

// ISO-Datum → deutsches Anzeigeformat (z.B. "2. Juli 2026")
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'long', year: 'numeric' })
}

const categoryColors: Record<string, string> = {
  'Finanzierung': '#C9963C',
  'Pflegegrad': '#8B6D3F',
  'Alltagsbegleitung': '#5B8A72',
  'Services': '#4A7A8B',
  'Karriere': '#7B5EA7',
  'Ratgeber': '#A05A5A',
}

// CollectionPage + ItemList: macht die Ratgeber-Übersicht für Google und
// KI-Suchsysteme als kuratierte Artikelsammlung lesbar.
const collectionJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': 'https://alltagsengel.care/blog#collection',
  name: 'Alltagsengel Ratgeber — Pflege, Alltagsbegleitung & Entlastungsbetrag',
  url: 'https://alltagsengel.care/blog',
  inLanguage: 'de-DE',
  isPartOf: { '@id': 'https://alltagsengel.care/#website' },
  publisher: { '@id': 'https://alltagsengel.care/#organization' },
  mainEntity: {
    '@type': 'ItemList',
    numberOfItems: articles.length,
    itemListElement: articles.map((a, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://alltagsengel.care/blog/${a.slug}`,
      name: a.headline,
    })),
  },
}

export default function BlogIndexPage() {
  const categories = [...new Set(articles.map(a => a.category))]

  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #1A1612 0%, #2A2420 100%)',
      padding: '0 16px 60px',
    }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <BreadcrumbSchema items={[{ name: 'Ratgeber' }]} />
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
              {articles[0].headline}
            </h2>
            <p style={{ color: '#B8B0A4', fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>
              {articles[0].description}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ color: '#C9963C', fontSize: 13, fontWeight: 600 }}>{articles[0].category}</span>
              <span style={{ color: '#777', fontSize: 13 }}>{articles[0].readTimeMin} min Lesezeit</span>
              <span style={{ color: '#777', fontSize: 13 }}>{formatDate(articles[0].datePublished)}</span>
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
                {article.headline}
              </h3>
              <p style={{ color: '#8A8279', fontSize: 14, lineHeight: 1.5, marginBottom: 16, flex: 1 }}>
                {article.description}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#8F887B', fontSize: 12 }}>{article.readTimeMin} min Lesezeit · {formatDate(article.datePublished)}</span>
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

      {/* Newsletter Signup */}
      <section style={{ maxWidth: 800, margin: '40px auto 0' }}>
        <NewsletterSignup />
      </section>

      {/* Kollektions-Schema kommt aus collectionJsonLd (oben) — ein zweiter
          Blog-Block mit denselben 27 Posts wäre redundantes Doppel-Markup. */}
    </main>
  )
}
