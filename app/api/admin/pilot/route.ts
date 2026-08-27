import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { ermittleVoraussetzungen } from '@/lib/pilot/voraussetzungen'
import { ermittleKundenKetten } from '@/lib/pilot/kundenkette'
import { KETTEN_SCHRITTE } from '@/lib/pilot/schritte'
import { ermittleMoneyPath } from '@/lib/pilot/control-center'
import { ermittlePilotPhasen } from '@/lib/pilot/pilot-phasen'
import { ermittleBusinessInputs } from '@/lib/pilot/business-inputs'
import { ermittlePilotKandidat } from '@/lib/pilot/pilot-kandidat'
import { ermittleLaufzeitHerkunft } from '@/lib/pilot/laufzeit-herkunft'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('admin/pilot')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Obergrenze, damit die Übersicht bei wachsendem Kundenstamm nicht kippt. */
const MAX_KUNDEN = 100

/**
 * GET /api/admin/pilot
 *
 * Liefert den Pilot-Status der aktiven Organisation:
 *   - Betriebs-Voraussetzungen (darf überhaupt echt abgerechnet werden?)
 *   - Kundenketten aller aktiven Kunden (wie weit ist wer gekommen?)
 *   - Money-Path-Betriebslage (CAMT, Rechnung, Mahnung, DATEV, System)
 *   - Pilot-Kandidat: welche Rechnung traegt den ersten echten Versand
 *   - Laufzeit-Herkunft: welcher Commit misst hier gegen welche Datenbank
 *
 * Nur lesend. Antwortet ausschliesslich mit Status- und Zählwerten,
 * niemals mit Zugangsdaten.
 *
 * ‼️ Diese Route hat bewusst KEIN POST/PUT/PATCH/DELETE. Sie kann keine
 * Geldaktion auslösen. Die Riegel gegen Doppelversand, Doppelbuchung und
 * fremde Mandanten sitzen in den jeweiligen Diensten — eine Zahl aus
 * dieser Antwort ist eine Messung, keine Erlaubnis.
 */
export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireAdminMitOrg('system.verwalten')
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()

    const { data: clients, error: clientsError } = await admin
      .from('clients')
      .select('id')
      .eq('organization_id', auth.organizationId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(MAX_KUNDEN)

    if (clientsError) {
      log.errorWithException('Kunden nicht lesbar', clientsError)
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }

    const clientIds = (clients ?? []).map(c => c.id)

    const [voraussetzungen, ketten, moneyPath, phasen, businessInputs, kandidat] = await Promise.all([
      ermittleVoraussetzungen(admin, auth.organizationId),
      ermittleKundenKetten(admin, auth.organizationId, clientIds),
      // Dritte, unabhaengige Sicht: die Betriebslage der vier Geldpfade
      // (CAMT, Rechnung, Mahnung, DATEV) plus Umgebung und Audit.
      // Ebenfalls nur lesend — siehe Modulkopf von
      // lib/pilot/control-center.ts.
      ermittleMoneyPath(admin, auth.organizationId),
      // Vierte Sicht (Phase 8, Track 10): der Erstbetrieb als Phasenkette.
      // PRE-FLIGHT bis AUDIT, je mit Stand und mit dem Namen des Moduls,
      // das die Aktion tatsaechlich freigibt. Fuehrt nichts aus.
      ermittlePilotPhasen(admin, { organizationId: auth.organizationId }),
      // Fuenfte Sicht (Phase 8, Track 9): welche Geschaeftsangaben fehlen
      // und was trotzdem laeuft. Nennt keinen Wert, nur den Stand.
      ermittleBusinessInputs(admin, auth.organizationId),
      // Sechste Sicht (Phase 8.3, Track 4): WELCHE Rechnung soll den ersten
      // echten Versand tragen? Steht keine bereit, ist die Antwort
      // NO_PILOT_INVOICE mit der zugehoerigen Handlungsanweisung — eine
      // fehlende Geschaeftshandlung, kein technischer Fehler.
      ermittlePilotKandidat(admin, auth.organizationId),
    ])

    return NextResponse.json({
      voraussetzungen,
      ketten,
      moneyPath,
      phasen,
      businessInputs,
      kandidat,
      // Woher die Zahlen stammen: laufender Commit, Bereitstellungsart,
      // Supabase-Projekt. Rein aus der Umgebung des laufenden Prozesses,
      // ohne Datenbankzugriff und ohne einen einzigen Geheimniswert.
      herkunft: ermittleLaufzeitHerkunft(),
      schritte: KETTEN_SCHRITTE,
      // Ehrlich benennen, wenn die Liste abgeschnitten wurde — eine stille
      // Kappung liest sich wie "das sind alle Kunden".
      gekappt: clientIds.length >= MAX_KUNDEN,
    })
  } catch (e) {
    return safeApiError(e, request)
  }
})
