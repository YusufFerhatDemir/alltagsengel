import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { withTracking } from '@/lib/monitoring/tracker'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'

// Akzeptiert sendBeacon-Body (Blob). text() statt json() macht es robust.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface VitalPayload {
  name: string
  value: number
  id: string
  rating?: string | null
  delta?: number | null
  path?: string
  ts?: number
}

const ALLOWED_METRICS = new Set(['CLS', 'INP', 'LCP', 'FCP', 'TTFB', 'FID'])

// Rate-Limit pro IP, 60 Events/Minute. Reicht für 12 Page-Loads pro Min.
//
// Track 13 B2: instanzuebergreifend in der Datenbank statt in einer Map
// im Modul-Scope. Auf Vercel startet jede neue Serverless-Instanz mit
// leerem Zaehler. Diese Route schreibt mit dem Dienstschluessel in
// `analytics_events` — ohne wirksames Limit waechst die Tabelle
// unbegrenzt, und zwar aus einer Quelle, die niemand authentifiziert hat.
const VITALS_LIMIT = 60
const VITALS_FENSTER_MS = 60_000

export const POST = withTracking(async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)

    if (!(await rateLimitPersistent(`vitals:${ip}`, VITALS_LIMIT, VITALS_FENSTER_MS))) {
      return NextResponse.json({ ok: true })
    }

    const raw = await req.text()
    if (!raw || raw.length > 2000) return NextResponse.json({ ok: true })

    let data: VitalPayload
    try {
      data = JSON.parse(raw)
    } catch {
      return NextResponse.json({ ok: true })
    }

    if (!data?.name || !ALLOWED_METRICS.has(data.name)) {
      return NextResponse.json({ ok: true })
    }
    if (typeof data.value !== 'number' || !Number.isFinite(data.value)) {
      return NextResponse.json({ ok: true })
    }

    // Ohne Supabase-ENV: still durchwinken, damit Local-Dev nicht raucht.
    const geheimerKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !geheimerKey) {
      return NextResponse.json({ ok: true, persisted: false })
    }

    const supabase = createAdminClient()
    await supabase.from('analytics_events').insert({
      // Die Stamm-Organisation steht hier AUSDRUECKLICH, statt sich auf den
      // Spalten-Default current_org_id() zu verlassen: dieser Weg laeuft mit
      // dem Dienstschluessel ohne auth.uid(), der Default faellt dann auf
      // genau diesen Wert zurueck — aber als fail-open-Rueckfall, nicht als
      // Aussage. Hier ist er eine Aussage: die oeffentliche Website gehoert
      // der Stamm-Organisation, es gibt keinen anderen Mandanten dahinter.
      organization_id: DEFAULT_ORG_ID,
      event_name: 'web_vital',
      event_props: {
        metric: data.name,
        value: data.value,
        id: data.id,
        rating: data.rating ?? null,
        delta: data.delta ?? null,
      },
      page_path: (data.path || '/').slice(0, 500),
      user_agent: (req.headers.get('user-agent') || '').slice(0, 500),
      ip_hash: null,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return safeApiError(err, req)
  }
})
