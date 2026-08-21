'use client'

import ErrorContent from '@/components/ErrorContent'

export default function AngehoerigeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent error={error} reset={reset} bereich="Angehörigenportal" zurueckHref="/angehoerige" />
}
