'use client'

import ErrorContent from '@/components/ErrorContent'

export default function MISError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent error={error} reset={reset} bereich="MIS" zurueckHref="/mis" />
}
