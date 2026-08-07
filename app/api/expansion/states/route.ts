// ═══════════════════════════════════════════════════════════════
// /api/expansion/states  — Freischaltungs-Matrix (Administration)
// ═══════════════════════════════════════════════════════════════
// GET    — vollständige Matrix der aktiven Organisation
// PATCH  — die von der Anerkennung UNABHÄNGIGEN Schalter und die
//          Stammdaten eines Bundeslands ändern.
//
// Bewusst NICHT über diese Route änderbar:
//   • insurance_enabled und die fünf abhängigen Kassenmodule
//   • der Status ANERKANNT
// Beides läuft ausschließlich über
//   POST /api/expansion/states/[bundesland]/activate
// damit die Bescheid-Pflicht und die Modul-Kaskade nicht umgangen werden.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireExpansionAdmin } from '@/lib/expansion/api-auth'
import { adminMatrix, invalidateStateCache } from '@/lib/expansion/state-settings'
import { normalizeBundesland } from '@/lib/expansion/plz-bundesland'
import { istExpansionStatus } from '@/lib/expansion/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireExpansionAdmin()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()

  // Bevorzugt die Dashboard-View: alle Kennzahlen je Bundesland in EINER
  // Abfrage (Status, Modulschalter, Warteliste, Tarife je Schicht, Klienten).
  const { data: dashboard, error } = await admin
    .from('state_expansion_dashboard')
    .select('*')
    .eq('organization_id', auth.orgId)
    .order('sort_order')

  if (!error && dashboard) {
    return NextResponse.json({
      organization_id: auth.orgId,
      bundeslaender: dashboard,
      dashboard: true,
    })
  }

  // Fallback, solange 20260808130000 noch nicht angewendet ist: nackte Matrix.
  console.warn('[expansion/states] Dashboard-View nicht verfügbar:', error?.message)
  const matrix = await adminMatrix(auth.orgId)
  return NextResponse.json({
    organization_id: auth.orgId,
    bundeslaender: matrix,
    dashboard: false,
  })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireExpansionAdmin()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  }

  const bundesland = normalizeBundesland(body.bundesland)
  if (!bundesland) {
    return NextResponse.json(
      { error: `Unbekanntes Bundesland: "${body.bundesland}"` },
      { status: 400 }
    )
  }

  // Status: ANERKANNT ist der Ein-Klick-Route vorbehalten.
  if (body.status !== undefined && body.status !== null) {
    if (!istExpansionStatus(body.status)) {
      return NextResponse.json(
        {
          error: `Ungültiger Status: "${body.status}". Erlaubt: VORBEREITUNG, `
            + 'ANTRAG_EINGEREICHT, IN_PRUEFUNG, ANERKANNT, ABGELEHNT.',
        },
        { status: 400 }
      )
    }
    if (body.status === 'ANERKANNT') {
      return NextResponse.json(
        {
          error: 'Der Status ANERKANNT wird ausschließlich über die Freischaltung gesetzt '
            + '(POST /api/expansion/states/' + bundesland + '/activate) — dort ist der '
            + 'Anerkennungsbescheid Pflicht.',
        },
        { status: 409 }
      )
    }
  }

  // Versuche, Kassenmodule direkt zu setzen, werden abgewiesen statt ignoriert.
  const gesperrt = [
    'insurance_enabled', 'kassentarife_enabled', 'budgetpruefung_enabled',
    'kassenrechnung_enabled', 'elnw_enabled', 'dakota_export_enabled',
  ].filter(feld => body[feld] !== undefined)

  if (gesperrt.length > 0) {
    return NextResponse.json(
      {
        error: `Diese Felder sind gesperrt und werden über die Freischaltung gesetzt: `
          + `${gesperrt.join(', ')}.`,
      },
      { status: 409 }
    )
  }

  const bool = (v: unknown) => (typeof v === 'boolean' ? v : null)
  const text = (v: unknown, max = 500) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
  const datum = (v: unknown) =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null

  // Ein leerer String bedeutet „Feld zurücksetzen". Ohne diese Liste würde
  // COALESCE in der RPC den alten Wert behalten und ein Tippfehler ließe sich
  // nie wieder entfernen.
  const LEERBAR = [
    'effective_date', 'antrag_eingereicht_am', 'approval_document',
    'approval_reference', 'approval_authority', 'rechtsgrundlage_land',
    'ansprechpartner_name', 'ansprechpartner_email', 'ansprechpartner_telefon',
    'notes',
  ] as const
  const felderLeeren = LEERBAR.filter(
    feld => body[feld] === '' || body[feld] === null
  )

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('update_state_settings', {
    p_org_id: auth.orgId,
    p_bundesland: bundesland,
    p_actor_id: auth.userId,
    p_status: istExpansionStatus(body.status) ? body.status : null,
    p_marketing_enabled: bool(body.marketing_enabled),
    p_registration_enabled: bool(body.registration_enabled),
    p_waitinglist_enabled: bool(body.waitinglist_enabled),
    p_private_enabled: bool(body.private_enabled),
    p_effective_date: datum(body.effective_date),
    p_antrag_eingereicht_am: datum(body.antrag_eingereicht_am),
    p_approval_document: text(body.approval_document),
    p_approval_reference: text(body.approval_reference, 200),
    p_approval_authority: text(body.approval_authority, 200),
    p_rechtsgrundlage_land: text(body.rechtsgrundlage_land, 200),
    p_ansprechpartner_name: text(body.ansprechpartner_name, 120),
    p_ansprechpartner_email: text(body.ansprechpartner_email, 200),
    p_ansprechpartner_telefon: text(body.ansprechpartner_telefon, 40),
    p_notes: text(body.notes, 4000),
    p_felder_leeren: felderLeeren.length > 0 ? felderLeeren : null,
  })

  if (error) {
    console.error('[expansion/states] PATCH fehlgeschlagen:', error.message)
    return NextResponse.json(
      { error: `Änderung fehlgeschlagen: ${error.message}` },
      { status: 400 }
    )
  }

  invalidateStateCache()
  return NextResponse.json({ ok: true, bundesland: data })
}
