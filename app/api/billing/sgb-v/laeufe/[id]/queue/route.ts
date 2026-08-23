import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ladeAbrechnungslauf } from '@/lib/abrechnung/sgb-v/abrechnungslauf'
import { ladeAufbereitung } from '@/lib/abrechnung/sgb-v/versand'
import { erzeugePruefExport } from '@/lib/abrechnung/sgb-v/export-generator'
import { ladeWarteschlange, reiheEin, verarbeiteEintrag, type AdapterTyp } from '@/lib/abrechnung/sgb-v/transport-adapter'
import { logger } from '@/lib/logger'
const log = logger.child('billing/sgb-v/laeufe/[id]')

const ADAPTER_TYPEN: AdapterTyp[] = ['mock', 'file_export', 'dakota', 'kim']

/** GET /api/billing/sgb-v/laeufe/[id]/queue */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const admin = createAdminClient()
    const queue = await ladeWarteschlange(admin, auth.ctx.organizationId, id)
    return NextResponse.json({ queue })
  } catch (err) {
    return safeApiError(err, request)
  }
}

/**
 * POST /api/billing/sgb-v/laeufe/[id]/queue
 * Body: { adapterTyp: 'mock'|'file_export'|'dakota'|'kim' }
 *
 * Reiht ein und verarbeitet im selben Schritt (die Adapter sind heute alle
 * synchron: Mock/File-Export laufen sofort durch, Dakota/KIM schlagen sofort
 * mit einer klaren Meldung fehl).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const body = await request.json()
    if (!ADAPTER_TYPEN.includes(body.adapterTyp)) {
      return NextResponse.json({ error: `adapterTyp muss einer von ${ADAPTER_TYPEN.join(', ')} sein.` }, { status: 400 })
    }

    const admin = createAdminClient()
    const lauf = await ladeAbrechnungslauf(admin, auth.ctx.organizationId, id)
    if (!lauf) return NextResponse.json({ error: '§ 302-Lauf nicht gefunden.' }, { status: 404 })

    const aufbereitung = await ladeAufbereitung(admin, auth.ctx.organizationId, lauf.abrechnungsmonat)
    const gefiltert = lauf.kostentraeger_ik
      ? { ...aufbereitung, faelle: aufbereitung.faelle.filter((f: { kostentraeger_ik: string }) => f.kostentraeger_ik === lauf.kostentraeger_ik) }
      : aufbereitung
    const datensatz = erzeugePruefExport(id, lauf.abrechnungsmonat, gefiltert, new Date().toISOString())

    const queueId = await reiheEin(admin, auth.ctx.organizationId, id, body.adapterTyp, auth.ctx.userId)

    const speichern = async (dateiname: string, inhalt: string) => {
      const { error } = await admin.storage.from('sgb-v-pruefexporte').upload(
        `${auth.ctx.organizationId}/${dateiname}`,
        inhalt,
        { contentType: 'application/json', upsert: true },
      )
      if (error) throw new Error(`Prüf-Export konnte nicht gespeichert werden: ${error.message}`)
      return `sgb-v-pruefexporte/${auth.ctx.organizationId}/${dateiname}`
    }

    const ergebnis = await verarbeiteEintrag(admin, auth.ctx.organizationId, queueId, datensatz, auth.ctx.userId, speichern)

    return NextResponse.json({ queueId, ergebnis })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    log.error('/queue] Fehler', { message })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
