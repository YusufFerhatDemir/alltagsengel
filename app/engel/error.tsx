'use client'

import ErrorContent from '@/components/ErrorContent'

export default function EngelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent error={error} reset={reset} bereich="Engel-Portal" zurueckHref="/engel/home" />
}
