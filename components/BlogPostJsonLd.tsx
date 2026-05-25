'use client'

import { usePathname } from 'next/navigation'
import { getBlogPost } from '@/lib/blog-posts'

const BASE_URL = 'https://alltagsengel.care'
const ORG_LOGO = `${BASE_URL}/icon-512x512.png`

/**
 * Rendert Article + BreadcrumbList JSON-LD nur auf einzelnen Blog-Posts.
 * Wird im app/blog/layout.tsx eingebunden — auf /blog selbst greift der
 * Pathname-Check nicht und nichts wird gerendert.
 */
export default function BlogPostJsonLd() {
  const pathname = usePathname() || ''
  // Match nur /blog/<slug>, nicht /blog (Index) oder /blog/<slug>/<irgendwas>
  const m = pathname.match(/^\/blog\/([^/]+)\/?$/)
  if (!m) return null

  const slug = m[1]
  const post = getBlogPost(slug)
  if (!post) return null

  const url = `${BASE_URL}/blog/${post.slug}`

  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: post.headline,
    description: post.description,
    image: [`${BASE_URL}/og-image.png`],
    datePublished: post.datePublished,
    dateModified: post.dateModified ?? post.datePublished,
    inLanguage: 'de-DE',
    articleSection: post.category,
    author: {
      '@type': 'Organization',
      name: 'AlltagsEngel',
      url: BASE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: 'AlltagsEngel',
      logo: { '@type': 'ImageObject', url: ORG_LOGO },
    },
  }

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Startseite', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Ratgeber', item: `${BASE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: post.headline, item: url },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
    </>
  )
}
