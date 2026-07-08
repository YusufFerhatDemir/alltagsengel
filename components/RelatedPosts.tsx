import Link from 'next/link'
import { BLOG_POSTS } from '@/lib/blog-posts'

/**
 * Server-gerenderte „Weiterlesen"-Sektion für Blog-Posts: 3 thematisch
 * passende Artikel (gleiche Kategorie zuerst) + 1 passende Money-Page.
 * Zweck: interne Verlinkung — vorher waren 9 Posts kontextuell verwaist
 * und /termin sowie /budgetrechner hatten null Blog-Inbound-Links.
 */

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
