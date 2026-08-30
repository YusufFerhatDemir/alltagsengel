// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/location/tracking — die Aufsichtsansicht
// ═══════════════════════════════════════════════════════════════════════
//
// BERECHTIGUNG: 'sicherheit.lesen'. Die haben nur admin und superadmin
// (NUR_ADMINISTRATION in lib/auth/rollen.ts). Bewusst dieselbe wie fuer
// die Sicherheitsspur und ausdruecklich NICHT 'personal.lesen' oder
// 'einsatz.lesen': hier steht, wo sich Kolleginnen und Kollegen
// aufgehalten haben. Das ist keine Personal- und keine Einsatzauskunft.
//
// DER ZUGRIFF IST SELBST EIN EREIGNIS. Jeder Aufruf schreibt
// `location_tracking_view` in security_audit_log — mit den benutzten
// Filtern. Eine Ansicht auf den Aufenthaltsort von Menschen, die
// niemand nachlesen kann, waere genau die verdeckte Ueberwachung, die
// dieses Modul ausschliessen soll.
//
// KEIN SCHREIBWEG. Diese Datei hat absichtlich nur einen GET-Handler.
// Es gibt keinen Verwaltungsweg, der eine Standortfreigabe einschaltet
// — auch nicht fuer die Administration.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { requireBerechtigung } from '@/lib/auth/guard'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { erfasseSicherheitsereignis } from '@/lib/security'
import {
  leseStandort, PUNKTE_STANDARD, PUNKTE_MAX,
  ZEITRAUM_MAX_TAGE, ZEITRAUM_VORGABE_STUNDEN,
  PLATTFORMEN, MODI, BEZEICHNUNG_MODUS, istStandortPlattform,
} from '@/lib/standort'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireBerechtigung('sicherheit.lesen')
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const p = url.searchParams

    const userId = p.get('userId')?.trim() || null
    const plattform = p.get('plattform')
    const grenzeRoh = Number(p.get('grenze'))

    if (userId && !UUID_RE.test(userId)) {
      return NextResponse.json(
        { error: 'Die Konto-Kennung ist keine gültige UUID.' },
        { status: 400 },
      )
    }

    const filter = {
      // Die Organisation kommt aus dem Auth-Kontext, NIE aus der
      // Anfrage. Ein `organizationId`-Parameter waere der Weg in einen
      // fremden Mandanten.
      organizationId: auth.ctx.organizationId,
      userId,
      vonDatum: p.get('von'),
      bisDatum: p.get('bis'),
      plattform: istStandortPlattform(plattform) ? plattform : null,
      grenze: Number.isFinite(grenzeRoh) && grenzeRoh > 0 ? grenzeRoh : PUNKTE_STANDARD,
    }

    const ergebnis = await leseStandort(createAdminClient(), filter)

    await erfasseSicherheitsereignis({
      eventType: 'location_tracking_view',
      userId: auth.ctx.userId,
      organizationId: auth.ctx.organizationId,
      request,
      metadata: {
        funktion: 'Standortansicht',
        ergebnis: 'SUCCESS',
        filter: {
          konto: filter.userId,
          von: ergebnis.von,
          bis: ergebnis.bis,
          plattform: filter.plattform,
        },
        punkte: ergebnis.punkte.length,
        konten: ergebnis.konten.length,
      },
    })

    return NextResponse.json({
      ...ergebnis,
      katalog: {
        modi: MODI.map(m => ({ wert: m, bezeichnung: BEZEICHNUNG_MODUS[m] })),
        plattformen: PLATTFORMEN,
        punkteMax: PUNKTE_MAX,
        zeitraumMaxTage: ZEITRAUM_MAX_TAGE,
        zeitraumVorgabeStunden: ZEITRAUM_VORGABE_STUNDEN,
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return safeApiError(err, request)
  }
})
