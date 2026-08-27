/**
 * Fehlerqueue (Dead Letter) — nicht zustellbare Übertragungen.
 *
 * GET   → Liste + Übersicht, filterbar nach Status und Kanal
 * PATCH → Status ändern oder wiedervorlegen
 *
 * Ein Eintrag hier ist eine Abrechnung, die die Kasse nicht erhalten hat.
 * Deshalb kennt diese Route keinen Löschweg: ein Eintrag verlässt die Liste
 * über 'erledigt' (erneut versendet) oder 'verworfen' (mit Begründung).
 */

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import {
  ladeDeadLetter, deadLetterUebersicht, aktualisiereDeadLetter,
  zurueckInDieWarteschlange, DEAD_LETTER_GRUND_TEXT,
  type DeadLetterStatus,
} from '@/lib/abrechnung/dead-letter'
import type { VersandKanal } from '@/lib/abrechnung/versand-protokoll'
import { withTracking } from '@/lib/monitoring/tracker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS: DeadLetterStatus[] = ['offen', 'in_analyse', 'wiedervorgelegt', 'erledigt', 'verworfen']
const KANAELE: VersandKanal[] = ['sftp_105', 'sftp_302', 'kim', 'manuell']

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireAdminMitOrg('abrechnung.lesen')
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const statusParam = url.searchParams.get('status')
    const status = statusParam
      ? statusParam.split(',').map(s => s.trim())
          .filter(s => STATUS.includes(s as DeadLetterStatus)) as DeadLetterStatus[]
      : undefined

    const kanalParam = url.searchParams.get('kanal') as VersandKanal | null
    if (kanalParam && !KANAELE.includes(kanalParam)) {
      return NextResponse.json(
        { error: `Unbekannter Kanal "${kanalParam}". Erlaubt: ${KANAELE.join(', ')}` },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const [eintraege, uebersicht] = await Promise.all([
      ladeDeadLetter(admin, auth.organizationId, {
        status,
        kanal: kanalParam ?? undefined,
        limit: Number(url.searchParams.get('limit')) || undefined,
      }),
      deadLetterUebersicht(admin, auth.organizationId),
    ])

    return NextResponse.json({ eintraege, uebersicht, gruende: DEAD_LETTER_GRUND_TEXT })
  } catch (err) {
    return safeApiError(err, request)
  }
})

/**
 * PATCH — Body: { "id": "…", "status": "in_analyse" | … , "notiz"?, "verworfen_grund"? }
 * oder    Body: { "id": "…", "aktion": "wiedervorlegen", "notiz"? }
 *
 * "wiedervorlegen" setzt den zugehörigen DAKOTA-Auftrag zurück auf
 * 'bereit_zur_uebermittlung' — es startet KEINEN Versand. Wer wiedervorlegt,
 * hat die Ursache gesehen und löst den Versand danach bewusst aus.
 */
export const PATCH = withTracking(async function PATCH(request: Request) {
  const auth = await requireAdminMitOrg('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const id = body?.id
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id ist ein Pflichtfeld.' }, { status: 400 })
    }

    const admin = createAdminClient()

    if (body?.aktion === 'wiedervorlegen') {
      const ergebnis = await zurueckInDieWarteschlange(admin, {
        eintragId: id,
        organizationId: auth.organizationId,
        actorId: auth.userId,
        notiz: body?.notiz ? String(body.notiz) : undefined,
      })
      return NextResponse.json(ergebnis)
    }

    const neuerStatus = body?.status as DeadLetterStatus
    if (!STATUS.includes(neuerStatus)) {
      return NextResponse.json(
        { error: `Unbekannter Status "${body?.status}". Erlaubt: ${STATUS.join(', ')}` },
        { status: 400 },
      )
    }

    const eintrag = await aktualisiereDeadLetter(admin, {
      eintragId: id,
      organizationId: auth.organizationId,
      actorId: auth.userId,
      neuerStatus,
      notiz: body?.notiz ? String(body.notiz) : undefined,
      verworfenGrund: body?.verworfen_grund ? String(body.verworfen_grund) : undefined,
    })

    return NextResponse.json({ eintrag })
  } catch (err) {
    const message = (err as Error).message
    const status = message.includes('nicht gefunden')
      ? 404
      : /nicht vorgesehen|Pflicht/i.test(message)
        ? 400
        : 500
    return NextResponse.json({ error: message }, { status })
  }
})
