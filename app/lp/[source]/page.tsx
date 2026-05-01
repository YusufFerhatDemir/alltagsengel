import { redirect } from 'next/navigation'

/**
 * /lp/[source] → Redirect zur Hauptseite
 *
 * Vorher: separate Werbe-Landings (/lp/google, /lp/facebook etc.) mit
 * eigenem Layout (ohne Phone-Frame, falsches Logo). Wirkte "billig" gegen
 * die schöne Hauptseite.
 *
 * Jetzt: Werbe-Klicker landen auf der Hauptseite — gleicher edler Look,
 * Phone-Frame, echtes Logo. Werbe-Parameter (gclid, fbclid, utm_*)
 * werden weitergegeben damit Conversion-Tracking funktioniert.
 *
 * Quelle (google/facebook/instagram/tiktok) wird als utm_source
 * weitergegeben falls noch nicht im Original-URL gesetzt.
 */
type Props = {
  params: Promise<{ source: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function LandingRedirect({ params, searchParams }: Props) {
  const { source } = await params
  const sp = await searchParams

  // Bestehende Query-Parameter beibehalten + utm_source ergänzen falls fehlt
  const queryParams = new URLSearchParams()

  // Alle vorhandenen Parameter weitergeben
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === 'string') {
      queryParams.set(key, value)
    } else if (Array.isArray(value) && value.length > 0) {
      queryParams.set(key, value[0])
    }
  }

  // utm_source ergänzen wenn nicht gesetzt (z.B. wenn Auto-Tagging aktiv,
  // dann ist nur gclid da, kein utm_source)
  if (!queryParams.has('utm_source')) {
    queryParams.set('utm_source', source)
  }
  if (!queryParams.has('utm_medium')) {
    queryParams.set('utm_medium', 'ad')
  }

  const queryString = queryParams.toString()
  redirect(queryString ? `/?${queryString}` : '/')
}

// Alle 4 Werbe-Quellen weiterleiten (statisch generiert für SEO)
export function generateStaticParams() {
  return [
    { source: 'google' },
    { source: 'facebook' },
    { source: 'instagram' },
    { source: 'tiktok' },
  ]
}

// Falls SEO-Bots auf /lp/google landen — kein indexieren
export const metadata = {
  robots: { index: false, follow: false },
}
