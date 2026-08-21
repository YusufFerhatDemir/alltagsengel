'use client'

import ErrorContent from '@/components/ErrorContent'

export default function FahrerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent error={error} reset={reset} bereich="Fahrer-Portal" zurueckHref="/fahrer/home" />
}
