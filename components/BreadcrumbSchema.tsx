import Link from 'next/link'

/**
 * Breadcrumb — JSON-LD (BreadcrumbList) + sichtbare Navigation in einem.
 * Usage: <BreadcrumbSchema items={[{ name: 'Blog', url: '/blog' }, { name: 'Artikeltitel' }]} />
 * The last item should NOT have a url (it's the current page).
 *
 * Die sichtbare <nav> ist Google-Voraussetzung dafür, dass das
 * BreadcrumbList-Schema als Rich Snippet gewertet wird (Markup muss
 * sichtbaren Inhalt beschreiben). `showNav={false}` nur für Seiten,
 * deren Layout keine Inline-Navigation verträgt.
 * Styles: .breadcrumb-nav in app/globals.css.
 */

interface BreadcrumbItem {
  name: string
  url?: string
}

interface Props {
  items: BreadcrumbItem[]
  showNav?: boolean
}

export default function BreadcrumbSchema({ items, showNav = true }: Props) {
  const baseUrl = 'https://alltagsengel.care'

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Startseite',
        item: baseUrl,
      },
      ...items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 2,
        name: item.name,
        ...(item.url ? { item: `${baseUrl}${item.url}` } : {}),
      })),
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {showNav && (
        <nav aria-label="Breadcrumb" className="breadcrumb-nav">
          <ol>
            <li>
              <Link href="/">Startseite</Link>
            </li>
            {items.map((item, index) => (
              <li key={index} aria-current={index === items.length - 1 ? 'page' : undefined}>
                {item.url ? <Link href={item.url}>{item.name}</Link> : <span>{item.name}</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
    </>
  )
}
