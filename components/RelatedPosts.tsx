import Link from 'next/link'
import { BLOG_POSTS } from '@/lib/blog-posts'

/**
 * Server-gerenderte „Weiterlesen"-Sektion für Blog-Posts: 3 thematisch
 * passende Artikel (gleiche Kategorie zuerst) + 1 passende Money-Page.
 * Zweck: interne Verlinkung — vorher waren 9 Posts kontextuell verwaist
 * und /termin sowie /budgetrechner hatten null Blog-Inbound-Links.
 */

// Blog→Service-Verlinkung: jede Kategorie zeigt auf die passenden Money-Pages,
// damit kein Post ohne Links auf Service-Seiten endet (Internal-Linking-Garantie).
const CATEGORY_SERVICES: Record<string, { href: string; label: string }[]> = {
  Finanzierung: [
    { href: '/entlastungsbetrag', label: 'Entlastungsbetrag (131 €/Monat)' },
    { href: '/verhinderungspflege', label: 'Verhinderungspflege' },
    { href: '/finanzierung', label: 'Alle Finanzierungswege' },
  ],
  Pflegegrad: [
    { href: '/pflegegrad-check', label: 'Pflegegrad-Check' },
    { href: '/entlastungsbetrag', label: 'Entlastungsbetrag (131 €/Monat)' },
    { href: '/hygienebox', label: 'Kostenlose Pflegebox' },
  ],
  Services: [
    { href: '/krankenfahrten', label: 'Krankenfahrten' },
    { href: '/hygienebox', label: 'Kostenlose Pflegebox' },
    { href: '/alltagsbegleitung', label: 'Alltagsbegleitung' },
  ],
  Alltagsbegleitung: [
    { href: '/alltagsbegleitung', label: 'Alltagsbegleitung' },
    { href: '/entlastungsbetrag', label: 'Entlastungsbetrag (131 €/Monat)' },
    { href: '/einzugsgebiet', label: 'Einsatzgebiet Rhein-Main' },
  ],
  Karriere: [
    { href: '/engel-werden', label: 'Engel werden' },
    { href: '/jobs', label: 'Offene Stellen' },
  ],
  Ratgeber: [
    { href: '/alltagsbegleitung', label: 'Alltagsbegleitung' },
    { href: '/faq', label: 'Häufige Fragen' },
    { href: '/termin', label: 'Beratungstermin' },
  ],
}

const CATEGORY_CTA: Record<string, { href: string; label: string }> = {
  Finanzierung: { href: '/budgetrechner', label: 'Budgetrechner: Wie viel Entlastungsbetrag steht Ihnen zu?' },
  Pflegegrad: { href: '/pflegegrad-check', label: 'Pflegegrad-Check: Kostenlose Selbsteinschätzung in 5 Minuten' },
  Services: { href: '/termin', label: 'Jetzt unverbindlichen Beratungstermin vereinbaren' },
  Alltagsbegleitung: { href: '/alltagsbegleitung', label: 'Alltagsbegleitung: Leistungen & Abrechnung über die Pflegekasse' },
  Karriere: { href: '/engel-werden', label: 'Alltagsengel werden: Flexibler Nebenjob mit Sinn' },
  Ratgeber: { href: '/termin', label: 'Persönliche Beratung: Termin kostenlos vereinbaren' },
}

export default function RelatedPosts({ slug }: { slug: string }) {
  const current = BLOG_POSTS.find((p) => p.slug === slug)

  const sameCategory = BLOG_POSTS.filter(
    (p) => p.slug !== slug && current && p.category === current.category
  )
  const others = BLOG_POSTS.filter(
    (p) => p.slug !== slug && (!current || p.category !== current.category)
  )
  // Deterministisch (kein Zufall): gleiche Kategorie zuerst, dann neueste.
  const byDate = (a: { datePublished: string }, b: { datePublished: string }) =>
    b.datePublished.localeCompare(a.datePublished)
  const related = [...sameCategory.sort(byDate), ...others.sort(byDate)].slice(0, 3)

  const cta = (current && CATEGORY_CTA[current.category]) || CATEGORY_CTA.Ratgeber
  const services = (current && CATEGORY_SERVICES[current.category]) || CATEGORY_SERVICES.Ratgeber

  if (related.length === 0) return null

  return (
    <aside style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid rgba(201,150,60,0.2)' }}>
      <h2 style={{ fontSize: 18, color: '#C9963C', marginBottom: 16 }}>Weiterlesen</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {related.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/blog/${p.slug}`}
              style={{ color: '#F5F0E8', textDecoration: 'none', fontSize: 15, lineHeight: 1.4 }}
            >
              → {p.headline}
            </Link>
          </li>
        ))}
      </ul>
      <h2 style={{ fontSize: 18, color: '#C9963C', margin: '28px 0 12px' }}>Passende Leistungen</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {services.map((s) => (
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
      <p style={{ marginTop: 20 }}>
        <Link
          href={cta.href}
          style={{
            display: 'inline-block',
            background: 'rgba(201,150,60,0.12)',
            border: '1px solid rgba(201,150,60,0.35)',
            borderRadius: 10,
            padding: '10px 16px',
            color: '#C9963C',
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          {cta.label}
        </Link>
      </p>
    </aside>
  )
}
