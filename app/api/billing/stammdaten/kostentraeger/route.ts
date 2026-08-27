import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import {
  speichereKostentraeger,
  importiereKostentraeger,
  type KostentraegerEingabe,
} from '@/lib/abrechnung/stammdaten'
import { logBillingAction } from '@/lib/billing/core/audit'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('stammdaten/kostentraeger')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Feldliste fuer Schreibzugriffe — alles andere aus dem Body wird verworfen. */
const ERLAUBTE_FELDER: (keyof KostentraegerEingabe)[] = [
  'ik_nummer', 'name', 'kassenart', 'bundesland', 'abrechnungsweg',
  'datenannahmestelle_id', 'leistungsarten', 'email', 'telefon',
  'gueltig_ab', 'gueltig_bis', 'ist_aktiv', 'notizen',
]

/**
 * Nimmt ausschliesslich die erlaubten Felder an.
 *
 * Ohne diese Filterung koennte ein Aufrufer `organization_id` mitschicken und
 * damit in einen fremden Mandanten schreiben (Mass Assignment) oder
 * `deleted_at` setzen und Zeilen unsichtbar machen.
 */
function nurErlaubteFelder(roh: Record<string, unknown>): KostentraegerEingabe {
  const sauber: Record<string, unknown> = {}
  for (const feld of ERLAUBTE_FELDER) {
    if (roh[feld] !== undefined) sauber[feld] = roh[feld]
  }
  return sauber as unknown as KostentraegerEingabe
}

/** GET — alle Kostentraeger der aktiven Organisation. */
export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireAdminMitOrg('abrechnung.lesen')
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('dta_kostentraeger')
      .select('id, ik_nummer, name, typ, kassenart, bundesland, abrechnungsweg, datenannahmestelle_id, leistungsarten, email, telefon, gueltig_ab, gueltig_bis, ist_aktiv, notizen, updated_at')
      .eq('organization_id', auth.organizationId)
      .is('deleted_at', null)
      .order('name')

    if (error) {
      log.error('Laden fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }

    return NextResponse.json({ kostentraeger: data ?? [] })
  } catch (e) {
    return safeApiError(e, request)
  }
})

/**
 * POST — einzelner Kostentraeger oder Massenimport.
 *
 * Body entweder `{ ...felder }` oder `{ zeilen: [...], dryRun?: boolean }`.
 * `dryRun` validiert nur und schreibt nichts — der Standardweg vor einem
 * Import echter Kassenlisten.
 */
export const POST = withTracking(async function POST(req: NextRequest) {
  const auth = await requireAdminMitOrg('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
    }

    const admin = createAdminClient()

    // ── Massenimport ──────────────────────────────────────────────
    if (Array.isArray(body.zeilen)) {
      if (body.zeilen.length > 500) {
        return NextResponse.json({ error: 'Maximal 500 Zeilen pro Import' }, { status: 400 })
      }
      const dryRun = body.dryRun !== false // Vorgabe: nicht schreiben
      const zeilen = body.zeilen.map((z: Record<string, unknown>) => nurErlaubteFelder(z ?? {}))
      const ergebnis = await importiereKostentraeger(admin, auth.organizationId, zeilen, { dryRun })

      if (!dryRun && ergebnis.erfolgreich > 0) {
        await logBillingAction(admin, {
          entityType: 'dta_kostentraeger',
      organizationId: auth.organizationId,
          entityId: auth.organizationId,
          action: 'kostentraeger_importiert',
          newState: { gesamt: ergebnis.gesamt, erfolgreich: ergebnis.erfolgreich, fehlerhaft: ergebnis.fehlerhaft },
          actorId: auth.userId,
        }).catch(err => log.errorWithException('Audit fehlgeschlagen', err))
      }

      return NextResponse.json(ergebnis, { status: ergebnis.fehlerhaft > 0 ? 207 : 200 })
    }

    // ── Einzelsatz ────────────────────────────────────────────────
    const eingabe = nurErlaubteFelder(body)
    const ergebnis = await speichereKostentraeger(admin, auth.organizationId, eingabe)

    if (!ergebnis.ok) {
      return NextResponse.json({ error: 'Validierung fehlgeschlagen', fehler: ergebnis.fehler, warnungen: ergebnis.warnungen }, { status: 400 })
    }

    await logBillingAction(admin, {
      entityType: 'dta_kostentraeger',
      organizationId: auth.organizationId,
      entityId: ergebnis.id!,
      action: 'kostentraeger_gespeichert',
      newState: { ik_nummer: eingabe.ik_nummer, name: eingabe.name, kassenart: eingabe.kassenart },
      actorId: auth.userId,
    }).catch(err => log.errorWithException('Audit fehlgeschlagen', err))

    return NextResponse.json({ erfolg: true, id: ergebnis.id, warnungen: ergebnis.warnungen })
  } catch (e) {
    return safeApiError(e, req)
  }
})

/** DELETE — Soft-Delete eines Kostentraegers der eigenen Organisation. */
export const DELETE = withTracking(async function DELETE(req: NextRequest) {
  const auth = await requireAdminMitOrg('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id ist Pflicht' }, { status: 400 })

    const admin = createAdminClient()
    // organization_id im WHERE ist die IDOR-Grenze: ohne sie koennte eine
    // fremde Kostentraeger-Id geloescht werden.
    const { data, error } = await admin
      .from('dta_kostentraeger')
      .update({ deleted_at: new Date().toISOString(), ist_aktiv: false })
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle()

    if (error) {
      log.error('Loeschen fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

    await logBillingAction(admin, {
      entityType: 'dta_kostentraeger',
      organizationId: auth.organizationId,
      entityId: id,
      action: 'kostentraeger_geloescht',
      actorId: auth.userId,
    }).catch(err => log.errorWithException('Audit fehlgeschlagen', err))

    return NextResponse.json({ erfolg: true })
  } catch (e) {
    return safeApiError(e, req)
  }
})
