'use client'

import ErrorContent from '@/components/ErrorContent'

export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent error={error} reset={reset} bereich="Anmeldung" zurueckHref="/auth/login" zurueckLabel="Zum Login" />
}
