import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import {
  ladeBelegHoch,
  ladeBelege,
  signiereBeleg,
  istMigrationFehlt,
  MIGRATION_FEHLT_TEXT,
} from '@/lib/billing/core/tarif-belege'
import { pruefeBelegDatei, type QuellTabelle } from '@/lib/billing/core/tarif-verifizierung'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('api:billing')

const QUELLEN: readonly QuellTabelle[] = ['billing_tariffs', 'leistungspreise']

function istQuellTabelle(v: unknown): v is QuellTabelle {
  return typeof v === 'string' && (QUELLEN as readonly string[]).includes(v)
}

/**
 * Prueft, dass die Zeile existiert und zum Mandanten des Aufrufers gehoert.
 * Ohne diese Pruefung koennte ein Admin einen Beleg an eine fremde Tarifzeile
 * haengen und damit die Belegkette eines anderen Mandanten manipulieren.
 */
async function zeileGehoertZurOrg(
  admin: ReturnType<typeof createAdminClient>,
  quellTabelle: QuellTabelle,
  zeilenId: string,
  organizationId: string
): Promise<boolean> {
  let query = admin.from(quellTabelle).select('id').eq('id', zeilenId)
  query =
    quellTabelle === 'billing_tariffs'
      ? query.eq('organization_id', organizationId)
      : query.or(`organization_id.eq.${organizationId},organization_id.is.null`)
  const { data } = await query.maybeSingle()
  return Boolean(data)
}

/**
 * GET /api/billing/tarif-belege?quellTabelle=…&id=…
 * Belege einer Tarif-/Preiszeile mit kurzlebigen signierten Download-URLs.
 */
export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const quellTabelle = url.searchParams.get('quellTabelle')
    const zeilenId = url.searchParams.get('id')

    if (!istQuellTabelle(quellTabelle) || !zeilenId) {
      return NextResponse.json(
        { error: 'quellTabelle (billing_tariffs|leistungspreise) und id sind erforderlich.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    if (!(await zeileGehoertZurOrg(admin, quellTabelle, zeilenId, auth.ctx.organizationId))) {
      return NextResponse.json({ error: 'Tarif nicht gefunden.' }, { status: 404 })
    }

    const rows = await ladeBelege(admin, {
      organizationId: auth.ctx.organizationId,
      quellTabelle,
      zeilenId,
    })

    const belege = await Promise.all(
      rows.map(async b => ({
        id: b.id,
        dateiname: b.dateiname,
        mime_type: b.mime_type,
        groesse_bytes: b.groesse_bytes,
        sha256: b.sha256,
        quelle: b.quelle,
        hochgeladen_von: b.hochgeladen_von,
        hochgeladen_am: b.hochgeladen_am,
        url: await signiereBeleg(admin, b),
      }))
    )

    return NextResponse.json({ belege })
  } catch (err) {
    const nachricht = (err as Error).message
    if (nachricht === MIGRATION_FEHLT_TEXT || istMigrationFehlt(nachricht)) {
      return NextResponse.json({ error: MIGRATION_FEHLT_TEXT }, { status: 503 })
    }
    log.errorWithException('Belege laden fehlgeschlagen', err)
    return NextResponse.json({ error: 'Belege konnten nicht geladen werden.' }, { status: 500 })
  }
})

/**
 * POST /api/billing/tarif-belege  (multipart/form-data)
 *
 * Felder: datei (File), quellTabelle, id, quelle (optional)
 *
 * Laedt einen Primaerbeleg in den privaten Bucket 'tarif-belege'. Der Bucket
 * hat keine Client-Policies — die Datei ist danach ausschliesslich ueber
 * signierte URLs dieser API erreichbar.
 *
 * Der Upload verifiziert NICHTS. Er legt nur den Nachweis ab. Die Freigabe
 * ist ein zweiter, bewusster Schritt ueber PATCH …/verifizierung.
 */
export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const form = await request.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ error: 'multipart/form-data erwartet.' }, { status: 400 })
    }

    const quellTabelle = form.get('quellTabelle')
    const zeilenId = form.get('id')
    const quelle = form.get('quelle')
    const datei = form.get('datei')

    if (!istQuellTabelle(quellTabelle) || typeof zeilenId !== 'string' || !zeilenId) {
      return NextResponse.json(
        { error: 'quellTabelle (billing_tariffs|leistungspreise) und id sind erforderlich.' },
        { status: 400 }
      )
    }
    if (!(datei instanceof File)) {
      return NextResponse.json({ error: 'Es wurde keine Datei übermittelt.' }, { status: 400 })
    }

    const dateiPruefung = pruefeBelegDatei({ type: datei.type, size: datei.size, name: datei.name })
    if (!dateiPruefung.ok) {
      return NextResponse.json({ error: dateiPruefung.fehler }, { status: 400 })
    }

    const admin = createAdminClient()
    if (!(await zeileGehoertZurOrg(admin, quellTabelle, zeilenId, auth.ctx.organizationId))) {
      return NextResponse.json({ error: 'Tarif nicht gefunden.' }, { status: 404 })
    }

    const beleg = await ladeBelegHoch(admin, {
      organizationId: auth.ctx.organizationId,
      quellTabelle,
      zeilenId,
      quelle: typeof quelle === 'string' && quelle.trim() ? quelle.trim() : null,
      hochgeladenVon: `${auth.ctx.name} (${auth.ctx.userId})`,
      datei: {
        name: datei.name,
        type: datei.type,
        arrayBuffer: await datei.arrayBuffer(),
      },
    })

    return NextResponse.json(
      {
        beleg: {
          id: beleg.id,
          dateiname: beleg.dateiname,
          mime_type: beleg.mime_type,
          groesse_bytes: beleg.groesse_bytes,
          sha256: beleg.sha256,
          hochgeladen_von: beleg.hochgeladen_von,
          hochgeladen_am: beleg.hochgeladen_am,
        },
        hinweis:
          'Beleg gespeichert. Der Tarif ist damit noch NICHT freigegeben — ' +
          'die Freigabe ist ein eigener Schritt mit Angabe der Rechtsquelle.',
      },
      { status: 201 }
    )
  } catch (err) {
    const nachricht = (err as Error).message
    if (nachricht === MIGRATION_FEHLT_TEXT || istMigrationFehlt(nachricht)) {
      return NextResponse.json({ error: MIGRATION_FEHLT_TEXT }, { status: 503 })
    }
    log.errorWithException('Beleg-Upload fehlgeschlagen', err)
    return NextResponse.json({ error: 'Beleg konnte nicht gespeichert werden.' }, { status: 500 })
  }
})
