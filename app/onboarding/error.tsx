'use client'

import ErrorContent from '@/components/ErrorContent'

export default function OnboardingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent error={error} reset={reset} bereich="Onboarding" zurueckHref="/" zurueckLabel="Zur Startseite" />
}
