'use client'

import ErrorContent from '@/components/ErrorContent'

export default function BlogError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent error={error} reset={reset} bereich="Ratgeber" zurueckHref="/blog" zurueckLabel="Zum Ratgeber" />
}
