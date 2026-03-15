import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // IP aus Header lesen (Vercel / Cloudflare)
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'

    // Vercel Geo-Header
    const country = req.headers.get('x-vercel-ip-country') || ''
    const city = decodeURIComponent(req.headers.get('x-vercel-ip-city') || '')
    const region = req.headers.get('x-vercel-ip-country-region') || ''
    const lat = req.headers.get('x-vercel-ip-latitude')
    const lng = req.headers.get('x-vercel-ip-longitude')

    // 1) visitors-Tabelle (original)
    await supabase.from('visitors').insert({
      ip,
      country,
      city,
      region,
      user_agent: req.headers.get('user-agent') || '',
      referrer: body.referrer || '',
      page: body.page || '/',
    })

    // 2) visitor_locations befüllen (für MIS Analytics, server-side IP)
    const pagePath = body.page || '/'
    let portal = 'landing'
    if (pagePath.startsWith('/kunde')) portal = 'kunde'
    else if (pagePath.startsWith('/engel')) portal = 'engel'
    else if (pagePath.startsWith('/fahrer')) portal = 'fahrer'
    else if (pagePath.startsWith('/investor')) portal = 'investor'
    else if (pagePath.startsWith('/mis')) portal = 'admin'

    await supabase.from('visitor_locations').insert({
      portal,
      city: city || null,
      country: country || null,
      region: region || null,
      latitude: lat ? parseFloat(lat) : null,
      longitude: lng ? parseFloat(lng) : null,
      source: lat ? 'vercel' : 'ip',
      ip_address: ip !== 'unknown' ? ip : null,
      user_agent: req.headers.get('user-agent') || null,
      page_path: pagePath,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
