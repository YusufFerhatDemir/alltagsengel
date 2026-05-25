import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
const limit = new Map<string, { c: number; r: number }>()
function ok(ip: string) {
  const now = Date.now()
  const e = limit.get(ip)
  if (!e || now > e.r) {
    limit.set(ip, { c: 1, r: now + 60_000 })
    return true
  }
  if (e.c >= 60) return false
  e.c++
  return true
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'

    if (!ok(ip)) return NextResponse.json({ ok: true })

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
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: true, persisted: false })
    }

    const supabase = createAdminClient()
    await supabase.from('analytics_events').insert({
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
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
