// ═══════════════════════════════════════════════════════════════
// /api/expansion/waitlist
// ═══════════════════════════════════════════════════════════════
// POST  — Interessent:in in die Warteliste eines Bundeslands eintragen
//         (öffentlich, auch ohne Login — Lead-Erfassung)
// GET   — Warteliste lesen (nur Administratoren)
//
// Die Warteliste ist das Gegenstück zur fehlenden Anerkennung:
// Wer in einem noch nicht freigeschalteten Bundesland wohnt, kann sich
// registrieren, vormerken lassen und wird bei der Freischaltung
// benachrichtigt. Kein Kunde geht verloren, weil ein Bescheid fehlt.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import { requireExpansionAdmin } from '@/lib/expansion/api-auth'
import { bundeslandFuerPlz, normalizeBundesland, normalizePlz } from '@/lib/expansion/plz-bundesland'
import { bundeslandEinstellungen } from '@/lib/expansion/state-settings'
import { istBundeslandCode } from '@/lib/expansion/types'
import { logger } from '@/lib/logger'
const log = logger.child('expansion/waitlist')

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const INTERESSEN = ['kasse', 'privat', 'beides', 'mitarbeit'] as const

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
    }

    // ── E-Mail ──
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' },
        { status: 400 }
      )
    }

    // ── Bundesland: explizit angegeben oder aus der PLZ abgeleitet ──
    const plz = normalizePlz(body.plz)
    let bundesland = normalizeBundesland(body.bundesland)
    if (!bundesland && plz) {
      bundesland = bundeslandFuerPlz(plz).code
    }
    if (!bundesland || !istBundeslandCode(bundesland)) {
      return NextResponse.json(
        { error: 'Bundesland konnte nicht ermittelt werden. Bitte Postleitzahl prüfen.' },
        { status: 400 }
      )
    }

    // ── Ist die Warteliste für dieses Bundesland überhaupt offen? ──
    const einstellungen = await bundeslandEinstellungen(bundesland, DEFAULT_ORG_ID)
    if (!einstellungen.waitinglist_enabled) {
      return NextResponse.json(
        { error: 'Für dieses Bundesland ist derzeit keine Warteliste geöffnet.' },
        { status: 409 }
      )
    }

    const interesse = INTERESSEN.includes(body.interesse) ? body.interesse : 'kasse'

    // Eingeloggte Nutzer:innen werden verknüpft (für spätere Benachrichtigung)
    let userId: string | null = null
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id ?? null
    } catch {
      userId = null
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('state_waitlist')
      .upsert(
        {
          organization_id: DEFAULT_ORG_ID,
          bundesland,
          plz,
          ort: typeof body.ort === 'string' ? body.ort.trim().slice(0, 120) : null,
          name: typeof body.name === 'string' ? body.name.trim().slice(0, 120) : null,
          email,
          telefon: typeof body.telefon === 'string' ? body.telefon.trim().slice(0, 40) : null,
          interesse,
          benachrichtigen: body.benachrichtigen !== false,
          quelle: typeof body.quelle === 'string' ? body.quelle.slice(0, 40) : 'web',
          user_id: userId,
        },
        { onConflict: 'organization_id,bundesland,email' }
      )

    if (error) {
      log.error('Eintragung fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json(
        { error: 'Eintragung fehlgeschlagen. Bitte später erneut versuchen.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        ok: true,
        bundesland,
        meldung: 'Sie stehen auf der Warteliste. Wir melden uns, sobald die '
          + 'Pflegekassenabrechnung in Ihrem Bundesland freigeschaltet ist.',
      },
      { status: 201 }
    )
  } catch (err) {
    return safeApiError(err, request)
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireExpansionAdmin()
  if (!auth.ok) return auth.response

  const bundeslandParam = request.nextUrl.searchParams.get('bundesland')
  const nurOffene = request.nextUrl.searchParams.get('offen') === '1'

  const admin = createAdminClient()
  let query = admin
    .from('state_waitlist')
    .select('id, bundesland, plz, ort, name, email, telefon, interesse, benachrichtigen, quelle, notified_at, created_at')
    .eq('organization_id', auth.orgId)
    .order('created_at', { ascending: false })
    .limit(1000)

  const bundesland = normalizeBundesland(bundeslandParam)
  if (bundesland) query = query.eq('bundesland', bundesland)
  if (nurOffene) query = query.is('notified_at', null)

  const { data, error } = await query
  if (error) {
    log.error('Laden fehlgeschlagen', { errorMessage: error.message })
    return NextResponse.json({ error: 'Warteliste konnte nicht geladen werden' }, { status: 500 })
  }

  return NextResponse.json({ eintraege: data ?? [] })
}
