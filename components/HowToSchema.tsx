/**
 * HowTo JSON-LD Schema — adds structured data for step-by-step processes.
 * Generates rich snippets showing steps in Google results.
 */

interface HowToStep {
  name: string
  text: string
  url?: string
}

interface Props {
  name: string
  description: string
  totalTime?: string  // ISO 8601 duration, e.g. "PT5M"
  steps: HowToStep[]
}

export default function HowToSchema({ name, description, totalTime, steps }: Props) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    ...(totalTime ? { totalTime } : {}),
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
      ...(step.url ? { url: `https://alltagsengel.care${step.url}` } : {}),
    })),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}
