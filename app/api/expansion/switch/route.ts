// ═══════════════════════════════════════════════════════════════
// /api/expansion/switch — Bundesland-Umschalter der Admin-Oberfläche
// ═══════════════════════════════════════════════════════════════
// GET  → aktuelle Auswahl + alle 16 Bundesländer mit ihrem Status,
//        damit der Umschalter den Zustand direkt anzeigen kann.
// POST → Auswahl setzen ({ bundesland: 'hessen' | 'alle' }).
//
// Die Auswahl ist ein reiner Anzeigefilter. Sie ändert weder Rechte
// noch Freischaltungen — deshalb reicht ein Cookie ohne JWT-Anpassung.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireExpansionAdmin } from '@/lib/expansion/api-auth'
import { normalizeBundesland } from '@/lib/expansion/plz-bundesland'
import { getActiveBundesland } from '@/lib/expansion/active-state'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ACTIVE_BUNDESLAND_COOKIE,
  ALLE_BUNDESLAENDER,
  BUNDESLAND_NAMEN,
  type ExpansionStatus,
} from '@/lib/expansion/types'
import { withTracking } from '@/lib/monitoring/tracker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withTracking(async function GET() {
  const auth = await requireExpansionAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  const aktiv = await getActiveBundesland()

  // Status je Bundesland, damit der Umschalter farbig anzeigen kann,
  // wo bereits abgerechnet werden darf.
  const admin = createAdminClient()
  const { data } = await admin
    .from('state_settings')
    .select('bundesland, status, insurance_enabled, private_enabled')
    .eq('organization_id', auth.orgId)

  const laender = Object.entries(BUNDESLAND_NAMEN).map(([code, label]) => {
    const zeile = (data ?? []).find(z => z.bundesland === code)
    return {
      code,
      label,
      status: (zeile?.status ?? 'VORBEREITUNG') as ExpansionStatus,
      insurance_enabled: zeile?.insurance_enabled === true,
      private_enabled: zeile?.private_enabled === true,
    }
  })

  return NextResponse.json({ aktiv, laender })
})

export const POST = withTracking(async function POST(req: NextRequest) {
  const auth = await requireExpansionAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => null)
  const roh = typeof body?.bundesland === 'string' ? body.bundesland : ''

  let wert: string
  if (roh === ALLE_BUNDESLAENDER) {
    wert = ALLE_BUNDESLAENDER
  } else {
    const code = normalizeBundesland(roh)
    if (!code) {
      return NextResponse.json(
        { error: `Unbekanntes Bundesland: "${roh}"` },
        { status: 400 }
      )
    }
    wert = code
  }

  const store = await cookies()
  store.set(ACTIVE_BUNDESLAND_COOKIE, wert, {
    path: '/',
    httpOnly: false,   // der Client-Context liest es ebenfalls
    sameSite: 'lax',
    secure: true,
    maxAge: 60 * 60 * 24 * 365,
  })

  return NextResponse.json({ ok: true, aktiv: wert })
})
