import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import {
  FEHLER_KATEGORIEN, klassifiziereFehlercode, pflegeKatalogEintrag,
  type FehlerKategorie,
} from '@/lib/abrechnung/ruecklaeufer-fehlercodes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/dta/fehlercodes            → Katalog + Kategorien
 * GET /api/billing/dta/fehlercodes?code=301   → Klassifizierung eines Codes
 */
export async function GET(request: Request) {
  const auth = await requireAdminMitOrg()
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const admin = createAdminClient()

    if (code) {
      const klassifizierung = await klassifiziereFehlercode(
        admin,
        auth.organizationId,
        code,
        url.searchParams.get('text'),
        url.searchParams.get('quelle_ik'),
      )
      return NextResponse.json({ code, klassifizierung })
    }

    const { data } = await admin
      .from('dta_fehlercode_katalog')
      .select('id, kassen_code, quelle_ik, kategorie, beschreibung, massnahme, korrigierbar, spec_quelle, organization_id')
      .or(`organization_id.eq.${auth.organizationId},organization_id.is.null`)
      .is('deleted_at', null)
      .order('kassen_code')

    return NextResponse.json({
      kategorien: FEHLER_KATEGORIEN,
      katalog: data ?? [],
      anzahl: (data ?? []).length,
      hinweis: (data ?? []).length === 0
        ? 'Der Katalog ist leer. Fehlercodes werden nicht geraten — Einträge stammen aus dem '
          + 'Fehlerverzeichnis der jeweiligen Datenannahmestelle und brauchen eine Quellenangabe. '
          + 'Bis dahin greift die Heuristik, unbekannte Codes landen als "unbekannt" sichtbar im Arbeitsvorrat.'
        : null,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
}

/**
 * POST /api/billing/dta/fehlercodes
 * Body: { kassen_code, kategorie, beschreibung, spec_quelle, quelle_ik?,
 *         massnahme?, korrigierbar?, global? }
 *
 * `spec_quelle` ist Pflicht: welches Fehlerverzeichnis, welcher Stand.
 * `global: true` legt den Eintrag organisationsübergreifend an (nur sinnvoll
 * für Codes, die bei allen Mandanten dasselbe bedeuten).
 */
export async function POST(request: Request) {
  const auth = await requireAdminMitOrg()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()

    if (!body?.kategorie || !(body.kategorie in FEHLER_KATEGORIEN)) {
      return NextResponse.json(
        { error: `kategorie muss einer von: ${Object.keys(FEHLER_KATEGORIEN).join(', ')} sein.` },
        { status: 400 },
      )
    }
    if (!body?.beschreibung || typeof body.beschreibung !== 'string') {
      return NextResponse.json({ error: 'beschreibung ist ein Pflichtfeld.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const ergebnis = await pflegeKatalogEintrag(admin, {
      organizationId: body.global === true ? null : auth.organizationId,
      kassenCode: String(body.kassen_code ?? ''),
      quelleIk: body.quelle_ik ?? null,
      kategorie: body.kategorie as FehlerKategorie,
      beschreibung: body.beschreibung,
      massnahme: body.massnahme ?? null,
      korrigierbar: body.korrigierbar !== false,
      specQuelle: String(body.spec_quelle ?? ''),
      actorId: auth.userId,
    })

    return NextResponse.json(ergebnis)
  } catch (err) {
    const message = (err as Error).message
    return NextResponse.json(
      { error: message },
      { status: message.includes('Pflicht') ? 400 : 500 },
    )
  }
}
