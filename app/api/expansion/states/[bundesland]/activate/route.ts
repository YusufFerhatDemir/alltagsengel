// ═══════════════════════════════════════════════════════════════
// /api/expansion/states/[bundesland]/activate
// ═══════════════════════════════════════════════════════════════
// POST   — EIN-KLICK-FREISCHALTUNG der Kassenabrechnung.
//          Setzt in einer Transaktion:
//            Status ANERKANNT · Kassenabrechnung · Kassentarife ·
//            Budgetprüfung · Kassenrechnungen · digitale
//            Leistungsnachweise · Dakota-Export
//          plus revisionssicheren Audit-Eintrag.
//
// DELETE — Widerruf / Korrektur einer versehentlichen Freischaltung.
//          Begründung ist Pflicht.
//
// Der Anerkennungsbescheid ist zwingend: ohne `approval_document`
// weist bereits die Datenbank die Aktivierung ab.
//
// Die Benachrichtigung der Warteliste passiert BEWUSST NICHT automatisch —
// dafür gibt es notify-waitlist mit ausdrücklicher Bestätigung.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireExpansionAdmin } from '@/lib/expansion/api-auth'
import { invalidateStateCache } from '@/lib/expansion/state-settings'
import { normalizeBundesland } from '@/lib/expansion/plz-bundesland'
import { BUNDESLAND_NAMEN, type StateActivationResult } from '@/lib/expansion/types'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ bundesland: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireExpansionAdmin()
  if (!auth.ok) return auth.response

  const { bundesland: roh } = await context.params
  const bundesland = normalizeBundesland(roh)
  if (!bundesland) {
    return NextResponse.json({ error: `Unbekanntes Bundesland: "${roh}"` }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))

  const bescheid = typeof body?.approval_document === 'string'
    ? body.approval_document.trim()
    : ''

  if (!bescheid) {
    return NextResponse.json(
      {
        error: 'Ohne hinterlegten Anerkennungsbescheid kann die Kassenabrechnung nicht '
          + 'freigeschaltet werden. Bitte Storage-Pfad oder Aktenzeichen des Bescheids angeben.',
        feld: 'approval_document',
      },
      { status: 400 }
    )
  }

  const datum = (v: unknown) =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
  const text = (v: unknown, max = 200) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('activate_insurance_billing', {
    p_org_id: auth.orgId,
    p_bundesland: bundesland,
    p_actor_id: auth.userId,
    p_approval_document: bescheid.slice(0, 500),
    p_approval_reference: text(body?.approval_reference),
    p_approval_authority: text(body?.approval_authority),
    p_effective_date: datum(body?.effective_date),
    p_anerkannt_am: datum(body?.anerkannt_am),
  })

  if (error) {
    console.error('[expansion/activate] fehlgeschlagen:', error.message)
    return NextResponse.json(
      { error: `Freischaltung fehlgeschlagen: ${error.message}` },
      { status: 400 }
    )
  }

  invalidateStateCache()

  const ergebnis = (Array.isArray(data) ? data[0] : data) as StateActivationResult | null

  return NextResponse.json({
    ok: true,
    bundesland,
    bundesland_label: BUNDESLAND_NAMEN[bundesland],
    ergebnis,
    freigeschaltete_module: [
      'Kassentarife',
      'Budgetprüfung',
      'Kassenrechnungen',
      'Digitale Leistungsnachweise',
      'Export an Dakota',
    ],
    warteliste_offen: ergebnis?.waitlist_count ?? 0,
    hinweis: ergebnis?.already_active
      ? 'Die Kassenabrechnung war für dieses Bundesland bereits vollständig freigeschaltet.'
      : `${ergebnis?.waitlist_count ?? 0} Eintrag/Einträge auf der Warteliste warten auf `
        + 'Benachrichtigung. Der Versand startet erst nach ausdrücklicher Bestätigung.',
  })
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireExpansionAdmin()
  if (!auth.ok) return auth.response

  const { bundesland: roh } = await context.params
  const bundesland = normalizeBundesland(roh)
  if (!bundesland) {
    return NextResponse.json({ error: `Unbekanntes Bundesland: "${roh}"` }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const begruendung = typeof body?.begruendung === 'string' ? body.begruendung.trim() : ''

  if (begruendung.length < 10) {
    return NextResponse.json(
      {
        error: 'Für die Abschaltung der Kassenabrechnung ist eine Begründung von '
          + 'mindestens 10 Zeichen erforderlich (Revisionssicherheit).',
        feld: 'begruendung',
      },
      { status: 400 }
    )
  }

  const zielStatus = ['VORBEREITUNG', 'ANTRAG_EINGEREICHT', 'IN_PRUEFUNG', 'ABGELEHNT']
    .includes(body?.neuer_status) ? body.neuer_status : 'IN_PRUEFUNG'

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('deactivate_insurance_billing', {
    p_org_id: auth.orgId,
    p_bundesland: bundesland,
    p_actor_id: auth.userId,
    p_begruendung: begruendung.slice(0, 2000),
    p_neuer_status: zielStatus,
  })

  if (error) {
    console.error('[expansion/activate] DELETE fehlgeschlagen:', error.message)
    return NextResponse.json(
      { error: `Abschaltung fehlgeschlagen: ${error.message}` },
      { status: 400 }
    )
  }

  invalidateStateCache()

  return NextResponse.json({
    ok: true,
    bundesland,
    war_aktiv: data === true,
    neuer_status: zielStatus,
    hinweis: data === true
      ? 'Kassenabrechnung und alle abhängigen Module wurden abgeschaltet. '
        + 'Werbung, Registrierung, Warteliste und Privatleistungen laufen weiter.'
      : 'Die Kassenabrechnung war für dieses Bundesland nicht aktiv.',
  })
}
