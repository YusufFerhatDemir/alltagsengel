'use client'

import ErrorContent from '@/components/ErrorContent'

export default function KundeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent error={error} reset={reset} bereich="Kundenbereich" zurueckHref="/kunde/chat" zurueckLabel="Zum Chat" />
}
