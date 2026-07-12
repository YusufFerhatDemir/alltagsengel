/**
 * Speakable JSON-LD Schema — markiert vorlesbare Kernabschnitte für
 * Sprachassistenten und AI-Crawler (Google Assistant, GEO).
 * Usage: <SpeakableSchema url="/entlastungsbetrag" />
 * Die Default-Selektoren treffen Hero-Titel und -Untertitel der info-Seiten.
 */

interface Props {
  url: string
  cssSelectors?: string[]
}

export default function SpeakableSchema({ url, cssSelectors = ['.info-hero-title', '.info-hero-sub'] }: Props) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `https://alltagsengel.care${url}#webpage`,
    url: `https://alltagsengel.care${url}`,
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: cssSelectors,
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}
