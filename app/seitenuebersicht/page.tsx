import Link from 'next/link'
import type { Metadata } from 'next'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import { BLOG_POSTS } from '@/lib/blog-posts'

// ═══════════════════════════════════════════════════════════
// HTML-Sitemap (Seitenübersicht) — jede öffentliche Seite ist von hier
// aus in einem Klick erreichbar. Ergänzt sitemap.xml: Crawler bekommen
// einen flachen Linkgraphen, Besucher eine Gesamtübersicht.
// Blog-Links kommen aus lib/blog-posts.ts (Single Source of Truth) —
// neue Posts erscheinen hier automatisch.
// ═══════════════════════════════════════════════════════════

export const metadata: Metadata = {
  title: 'Seitenübersicht',
  description:
    'Alle Seiten von Alltagsengel im Überblick: Leistungen, Städte im Rhein-Main-Gebiet, Ratgeber-Artikel, Rechner und Kontakt.',
  alternates: { canonical: 'https://alltagsengel.care/seitenuebersicht' },
}

const SERVICES = [
  { href: '/alltagsbegleitung', label: 'Alltagsbegleitung' },
  { href: '/hygienebox', label: 'Kostenlose Pflegebox (Pflegehilfsmittel)' },
  { href: '/pflegebox', label: 'Pflegebox bestellen' },
  { href: '/krankenfahrten', label: 'Krankenfahrten' },
  { href: '/entlastungsbetrag', label: 'Entlastungsbetrag (§45b SGB XI)' },
  { href: '/verhinderungspflege', label: 'Verhinderungspflege (§39 SGB XI)' },
]

// Frankfurt kanonisiert bei Krankenfahrten & Pflegebox auf die Root-Seite —
// deshalb taucht es in diesen beiden Spalten nicht als Stadt-Link auf.
const CITIES = [
  { slug: 'frankfurt', name: 'Frankfurt am Main' },
  { slug: 'offenbach', name: 'Offenbach' },
  { slug: 'wiesbaden', name: 'Wiesbaden' },
  { slug: 'darmstadt', name: 'Darmstadt' },
  { slug: 'mainz', name: 'Mainz' },
  { slug: 'hanau', name: 'Hanau' },
  { slug: 'bad-homburg', name: 'Bad Homburg' },
  { slug: 'aschaffenburg', name: 'Aschaffenburg' },
  { slug: 'frankfurt-hoechst', name: 'Frankfurt-Höchst' },
  { slug: 'neu-isenburg', name: 'Neu-Isenburg' },
  { slug: 'friedberg-wetterau', name: 'Friedberg (Wetterau)' },
  { slug: 'rodgau', name: 'Rodgau' },
  { slug: 'giessen', name: 'Gießen' },
  { slug: 'marburg', name: 'Marburg' },
  { slug: 'kassel', name: 'Kassel' },
  { slug: 'fulda', name: 'Fulda' },
  { slug: 'limburg', name: 'Limburg' },
  { slug: 'koeln', name: 'Köln' },
  { slug: 'duesseldorf', name: 'Düsseldorf' },
  { slug: 'essen', name: 'Essen' },
  { slug: 'dortmund', name: 'Dortmund' },
  { slug: 'bonn', name: 'Bonn' },
]

const TOOLS = [
  { href: '/budgetrechner', label: 'Budgetrechner' },
  { href: '/pflegegrad-check', label: 'Pflegegrad-Check' },
  { href: '/finanzierung', label: 'Finanzierung & Kostenübernahme' },
  { href: '/einzugsgebiet', label: 'Einzugsgebiet (Karte)' },
  { href: '/termin', label: 'Beratungstermin buchen' },
  { href: '/faq', label: 'Häufige Fragen (FAQ)' },
]

const COMPANY = [
  { href: '/ueber-uns', label: 'Über uns' },
  { href: '/team', label: 'Team' },
  { href: '/bewertungen', label: 'Bewertungen' },
  { href: '/kontakt', label: 'Kontakt' },
  { href: '/engel-werden', label: 'Engel werden' },
  { href: '/jobs', label: 'Jobs' },
]

const LEGAL = [
  { href: '/impressum', label: 'Impressum' },
  { href: '/datenschutz', label: 'Datenschutz' },
  { href: '/agb', label: 'AGB' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 17, color: '#C9963C', marginBottom: 10 }}>{title}</h2>
      {children}
    </section>
  )
}

function LinkList({ items }: { items: { href: string; label: string }[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((i) => (
        <li key={i.href}>
          <Link href={i.href} style={{ color: '#F5F0E8', textDecoration: 'none', fontSize: 14 }}>
            → {i.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default function SeitenuebersichtPage() {
  const posts = [...BLOG_POSTS].sort((a, b) => b.datePublished.localeCompare(a.datePublished))

  return (
    <div className="screen info-screen">
      <BreadcrumbSchema items={[{ name: 'Seitenübersicht' }]} />
      <div className="info-body" style={{ padding: '8px 20px 32px' }}>
        <h1 style={{ fontSize: 24, color: '#F5F0E8', margin: '12px 0 6px' }}>Seitenübersicht</h1>
        <p style={{ fontSize: 14, color: 'rgba(245,240,232,0.6)', marginBottom: 24 }}>
          Alle Seiten von Alltagsengel im Überblick — Leistungen, Städte, Ratgeber und Service.
        </p>

        <Section title="Leistungen">
          <LinkList items={SERVICES} />
        </Section>

        <Section title="Alltagsbegleitung nach Stadt">
          <LinkList items={CITIES.map((c) => ({ href: `/alltagsbegleitung/${c.slug}`, label: c.name }))} />
        </Section>

        <Section title="Krankenfahrten nach Stadt">
          <LinkList
            items={CITIES.filter((c) => c.slug !== 'frankfurt').map((c) => ({
              href: `/krankenfahrten/${c.slug}`,
              label: c.name,
            }))}
          />
        </Section>

        <Section title="Pflegebox nach Stadt">
          <LinkList
            items={CITIES.filter((c) => c.slug !== 'frankfurt').map((c) => ({
              href: `/hygienebox/${c.slug}`,
              label: c.name,
            }))}
          />
        </Section>

        <Section title="Rechner, Beratung & Hilfe">
          <LinkList items={TOOLS} />
        </Section>

        <Section title={`Ratgeber (${posts.length} Artikel)`}>
          <LinkList
            items={[
              { href: '/blog', label: 'Ratgeber-Übersicht' },
              ...posts.map((p) => ({ href: `/blog/${p.slug}`, label: p.headline })),
            ]}
          />
        </Section>

        <Section title="Unternehmen">
          <LinkList items={COMPANY} />
        </Section>

        <Section title="Rechtliches">
          <LinkList items={LEGAL} />
        </Section>
      </div>
    </div>
  )
}
