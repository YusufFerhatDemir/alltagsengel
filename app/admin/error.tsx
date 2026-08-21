'use client'

import ErrorContent from '@/components/ErrorContent'

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent error={error} reset={reset} bereich="Admin" zurueckHref="/admin/home" />
}
