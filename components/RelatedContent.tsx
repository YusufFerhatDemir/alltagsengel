import Link from 'next/link'
import { BLOG_POSTS } from '@/lib/blog-posts'

/**
 * „Das könnte Sie auch interessieren" — Service→Blog-Gegenstück zu
 * RelatedPosts (Blog→Service): Pillar- und Tool-Seiten verlinken auf
 * thematisch passende Ratgeber-Artikel + verwandte Leistungen.
 * Blog-Headlines kommen aus lib/blog-posts.ts; dort fehlende Slugs werden
 * still übersprungen (kein Build-Bruch, wenn ein Post umbenannt wird).
 * Server Component — rendert reine Links, kein JS im Client.
 */

interface ServiceLink {
  href: string
  label: string
}

interface RelatedEntry {
  blogSlugs: string[]
  services: ServiceLink[]
}

const RELATED: Record<string, RelatedEntry> = {
  entlastungsbetrag: {
    blogSlugs: [
      'entlastungsbetrag-beantragen',
      'entlastungsbetrag-nutzen',
      'entlastungsbetrag-rueckwirkend',
      'pflegegrad-1-leistungen',
    ],
    services: [
      { href: '/alltagsbegleitung', label: 'Alltagsbegleitung' },
      { href: '/budgetrechner', label: 'Budgetrechner' },
      { href: '/verhinderungspflege', label: 'Verhinderungspflege' },
    ],
  },
  verhinderungspflege: {
    blogSlugs: [
      'verhinderungspflege-beantragen',
      'wer-zahlt-alltagsbegleitung',
      'pflegegrad-beantragen',
    ],
    services: [
      { href: '/entlastungsbetrag', label: 'Entlastungsbetrag (131 €/Monat)' },
      { href: '/budgetrechner', label: 'Budgetrechner' },
      { href: '/alltagsbegleitung', label: 'Alltagsbegleitung' },
    ],
  },
  alltagsbegleitung: {
    blogSlugs: [
      'alltagsbegleitung-kosten',
      'wer-zahlt-alltagsbegleitung',
      'alltagshilfe-senioren',
      'einsamkeit-im-alter',
    ],
    services: [
      { href: '/entlastungsbetrag', label: 'Entlastungsbetrag (131 €/Monat)' },
      { href: '/einzugsgebiet', label: 'Einsatzgebiet Rhein-Main' },
      { href: '/termin', label: 'Beratungstermin' },
    ],
  },
  krankenfahrten: {
    blogSlugs: [
      'krankenfahrt-kostenuebernahme',
      'krankenfahrt-verordnung-erhalten',
      'krankenfahrt-buchen-frankfurt',
      'arztbegleitung-senioren',
    ],
    services: [
      { href: '/entlastungsbetrag', label: 'Entlastungsbetrag (131 €/Monat)' },
      { href: '/alltagsbegleitung', label: 'Alltagsbegleitung' },
      { href: '/einzugsgebiet', label: 'Einsatzgebiet Rhein-Main' },
    ],
  },
  hygienebox: {
    blogSlugs: [
      'pflegebox-kostenlos-bestellen',
      'pflegehilfsmittel-40-euro',
      'pflegegrad-1-leistungen',
    ],
    services: [
      { href: '/entlastungsbetrag', label: 'Entlastungsbetrag (131 €/Monat)' },
      { href: '/pflegegrad-check', label: 'Pflegegrad-Check' },
      { href: '/termin', label: 'Beratungstermin' },
    ],
  },
  budgetrechner: {
    blogSlugs: [
      'entlastungsbetrag-nutzen',
      'wer-zahlt-alltagsbegleitung',
      'verhinderungspflege-beantragen',
    ],
    services: [
      { href: '/entlastungsbetrag', label: 'Entlastungsbetrag (131 €/Monat)' },
      { href: '/verhinderungspflege', label: 'Verhinderungspflege' },
      { href: '/finanzierung', label: 'Alle Finanzierungswege' },
    ],
  },
  'pflegegrad-check': {
    blogSlugs: [
      'pflegegrad-beantragen',
      'pflegegrad-1-leistungen',
      'entlastungsbetrag-45b',
    ],
    services: [
      { href: '/entlastungsbetrag', label: 'Entlastungsbetrag (131 €/Monat)' },
      { href: '/hygienebox', label: 'Kostenlose Pflegebox' },
      { href: '/budgetrechner', label: 'Budgetrechner' },
    ],
  },
  finanzierung: {
    blogSlugs: [
      'wer-zahlt-alltagsbegleitung',
      'entlastungsbetrag-beantragen',
      'krankenfahrt-kostenuebernahme',
    ],
    services: [
      { href: '/budgetrechner', label: 'Budgetrechner' },
      { href: '/entlastungsbetrag', label: 'Entlastungsbetrag (131 €/Monat)' },
      { href: '/verhinderungspflege', label: 'Verhinderungspflege' },
    ],
  },
  faq: {
    blogSlugs: [
      'entlastungsbetrag-45b',
      'alltagshilfe-senioren',
      'pflegegrad-beantragen',
    ],
    services: [
      { href: '/termin', label: 'Beratungstermin' },
      { href: '/budgetrechner', label: 'Budgetrechner' },
      { href: '/kontakt', label: 'Kontakt' },
    ],
  },
}

export default function RelatedContent({ page }: { page: keyof typeof RELATED | string }) {
  const entry = RELATED[page]
  if (!entry) return null

  const posts = entry.blogSlugs
    .map((slug) => BLOG_POSTS.find((p) => p.slug === slug))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))

  return (
    <aside
      aria-label="Ähnliche Themen"
      style={{ margin: '32px 20px 8px', paddingTop: 20, borderTop: '1px solid rgba(201,150,60,0.2)' }}
    >
      <h2 style={{ fontSize: 17, color: '#C9963C', marginBottom: 12 }}>
        Das könnte Sie auch interessieren
      </h2>
      {posts.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {posts.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/blog/${p.slug}`}
                style={{ color: '#F5F0E8', textDecoration: 'none', fontSize: 14, lineHeight: 1.4 }}
              >
                → {p.headline}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {entry.services.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              style={{
                display: 'inline-block',
                border: '1px solid rgba(201,150,60,0.35)',
                borderRadius: 999,
                padding: '6px 14px',
                color: '#C9963C',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
