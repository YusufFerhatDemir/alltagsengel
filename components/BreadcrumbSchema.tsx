/**
 * BreadcrumbList JSON-LD Schema — adds structured data for rich snippets.
 * Usage: <BreadcrumbSchema items={[{ name: 'Blog', url: '/blog' }, { name: 'Artikeltitel' }]} />
 * The last item should NOT have a url (it's the current page).
 */

interface BreadcrumbItem {
  name: string
  url?: string
}

interface Props {
  items: BreadcrumbItem[]
}

export default function BreadcrumbSchema({ items }: Props) {
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
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}
