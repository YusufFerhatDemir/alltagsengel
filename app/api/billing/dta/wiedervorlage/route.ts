import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import {
  ladeWiedervorlage, wiedervorlageUebersicht, reiheRuecklaeuferEin,
  type WiedervorlageStatus,
} from '@/lib/abrechnung/wiedervorlage'
import { FEHLER_KATEGORIEN, type FehlerKategorie } from '@/lib/abrechnung/ruecklaeufer-fehlercodes'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS: WiedervorlageStatus[] = [
  'offen', 'in_korrektur', 'korrigiert', 'eingereicht', 'erledigt', 'verworfen',
]

/**
 * GET /api/billing/dta/wiedervorlage?status=offen,in_korrektur&kategorie=…&ueberfaellig=1
 *
 * Der Arbeitsvorrat aus abgelehnten/gekürzten Positionen, mit Übersicht.
 */
export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireAdminMitOrg('abrechnung.lesen')
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const statusParam = url.searchParams.get('status')
    const status = statusParam
      ? statusParam.split(',').map(s => s.trim()).filter(s => STATUS.includes(s as WiedervorlageStatus)) as WiedervorlageStatus[]
      : undefined

    const kategorie = url.searchParams.get('kategorie') as FehlerKategorie | null
    if (kategorie && !(kategorie in FEHLER_KATEGORIEN)) {
      return NextResponse.json(
        { error: `Unbekannte Kategorie "${kategorie}". Erlaubt: ${Object.keys(FEHLER_KATEGORIEN).join(', ')}` },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const [eintraege, uebersicht] = await Promise.all([
      ladeWiedervorlage(admin, auth.organizationId, {
        status,
        kategorie: kategorie ?? undefined,
        ruecklaeuferId: url.searchParams.get('ruecklaeufer_id') ?? undefined,
        nurUeberfaellig: url.searchParams.get('ueberfaellig') === '1',
        limit: Number(url.searchParams.get('limit')) || undefined,
      }),
      wiedervorlageUebersicht(admin, auth.organizationId),
    ])

    return NextResponse.json({ eintraege, uebersicht, kategorien: FEHLER_KATEGORIEN })
  } catch (err) {
    return safeApiError(err, request)
  }
})

/**
 * POST /api/billing/dta/wiedervorlage
 * Body: { "ruecklaeufer_id": "…" }
 *
 * Nimmt alle abgelehnten/gekürzten Positionen eines Rückläufers in die Queue auf.
 * Wiederholte Aufrufe erzeugen keine Dubletten.
 */
export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireAdminMitOrg('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const ruecklaeuferId = body?.ruecklaeufer_id
    if (!ruecklaeuferId || typeof ruecklaeuferId !== 'string') {
      return NextResponse.json({ error: 'ruecklaeufer_id ist ein Pflichtfeld.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const ergebnis = await reiheRuecklaeuferEin(admin, {
      ruecklaeuferId,
      organizationId: auth.organizationId,
      actorId: auth.userId,
    })

    return NextResponse.json(ergebnis)
  } catch (err) {
    return safeApiError(err, request)
  }
})
