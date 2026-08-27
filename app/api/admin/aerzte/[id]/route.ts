import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { logAuditEvent } from '@/lib/audit-log'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('admin/aerzte')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Erlaubte Felder fuer Schreibzugriffe — Mass-Assignment-Schutz. */
const ERLAUBTE_FELDER = [
  'anrede', 'titel', 'vorname', 'nachname', 'fachrichtung',
  'lanr', 'bsnr', 'praxis_name', 'strasse', 'plz', 'ort',
  'telefon', 'fax', 'email', 'mobiltelefon', 'notizen', 'aktiv',
] as const

function nurErlaubteFelder(roh: Record<string, unknown>): Record<string, unknown> {
  const sauber: Record<string, unknown> = {}
  for (const feld of ERLAUBTE_FELDER) {
    if (roh[feld] !== undefined) sauber[feld] = roh[feld]
  }
  return sauber
}

/** Validiert LANR/BSNR (9-stellig numerisch, wie DB-CHECK-Constraint) vorab,
 *  damit der Nutzer eine verstaendliche Fehlermeldung statt eines rohen
 *  Postgres-Constraint-Fehlers (23514) sieht. */
function validiereFelder(eingabe: Record<string, unknown>): string | null {
  for (const [feld, label] of [['lanr', 'LANR'], ['bsnr', 'BSNR']] as const) {
    const wert = eingabe[feld]
    if (wert !== null && wert !== undefined && wert !== '' && !/^\d{9}$/.test(String(wert))) {
      return `${label} muss 9-stellig numerisch sein.`
    }
  }
  if (typeof eingabe.email === 'string' && eingabe.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eingabe.email)) {
    return 'E-Mail-Adresse ist ungueltig.'
  }
  return null
}

/** GET — einzelnen Arzt laden. */
export const GET = withTracking(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOpsAdmin('stammdaten.lesen')
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('aerzte_praxen')
      .select('id, anrede, titel, vorname, nachname, fachrichtung, lanr, bsnr, praxis_name, strasse, plz, ort, telefon, fax, email, mobiltelefon, notizen, aktiv, created_at, updated_at')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (error) {
      log.error('Laden fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (e) {
    return safeApiError(e, _req)
  }
})

/** PATCH — Arzt aktualisieren. */
export const PATCH = withTracking(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOpsAdmin('stammdaten.schreiben')
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
    }

    const eingabe = nurErlaubteFelder(body)
    if (Object.keys(eingabe).length === 0) {
      return NextResponse.json({ error: 'Keine aenderbaren Felder uebergeben' }, { status: 400 })
    }

    const validierungsfehler = validiereFelder(eingabe)
    if (validierungsfehler) {
      return NextResponse.json({ error: validierungsfehler }, { status: 400 })
    }

    const admin = createAdminClient()
    // organization_id im WHERE ist die IDOR-Grenze
    const { data, error } = await admin
      .from('aerzte_praxen')
      .update(eingabe)
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .select('id')
      .maybeSingle()

    if (error) {
      log.error('Update fehlgeschlagen', { errorMessage: error.message })
      return apiErrorResponse(error)
    }
    if (!data) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    }

    await logAuditEvent({
      action: 'update',
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      actorRole: auth.ctx.role,
      organizationId: auth.ctx.organizationId,
      entityType: 'arzt',
      entityId: data.id,
      details: { geaenderte_felder: Object.keys(eingabe) },
      request: req,
    })

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    return safeApiError(e, req)
  }
})

/** DELETE — Soft-Delete (aktiv = false). */
export const DELETE = withTracking(async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOpsAdmin('stammdaten.schreiben')
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const admin = createAdminClient()
    // organization_id im WHERE ist die IDOR-Grenze
    const { data, error } = await admin
      .from('aerzte_praxen')
      .update({ aktiv: false })
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .select('id')
      .maybeSingle()

    if (error) {
      log.error('Deaktivieren fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    }

    await logAuditEvent({
      action: 'delete',
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      actorRole: auth.ctx.role,
      organizationId: auth.ctx.organizationId,
      entityType: 'arzt',
      entityId: data.id,
      details: { grund: 'deaktiviert' },
      request: req,
    })

    return NextResponse.json({ erfolg: true })
  } catch (e) {
    return safeApiError(e, req)
  }
})
