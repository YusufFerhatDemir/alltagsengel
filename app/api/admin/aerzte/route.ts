import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { logAuditEvent } from '@/lib/audit-log'
import { logger } from '@/lib/logger'
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

/** GET — alle Aerzte der aktiven Organisation. */
export async function GET(request: NextRequest) {
  const auth = await requireOpsAdmin('stammdaten.lesen')
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('aerzte_praxen')
      .select('id, anrede, titel, vorname, nachname, fachrichtung, lanr, bsnr, praxis_name, strasse, plz, ort, telefon, fax, email, mobiltelefon, notizen, aktiv, created_at, updated_at')
      .eq('organization_id', auth.ctx.organizationId)
      .order('nachname')
      .order('vorname')

    if (error) {
      log.error('Laden fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }

    return NextResponse.json({ aerzte: data ?? [] })
  } catch (e) {
    return safeApiError(e, request)
  }
}

/** POST — neuen Arzt anlegen. */
export async function POST(req: NextRequest) {
  const auth = await requireOpsAdmin('stammdaten.schreiben')
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
    }

    const eingabe = nurErlaubteFelder(body)

    if (!eingabe.vorname || !eingabe.nachname) {
      return NextResponse.json({ error: 'Vorname und Nachname sind Pflichtfelder' }, { status: 400 })
    }

    const validierungsfehler = validiereFelder(eingabe)
    if (validierungsfehler) {
      return NextResponse.json({ error: validierungsfehler }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('aerzte_praxen')
      .insert({ ...eingabe, organization_id: auth.ctx.organizationId })
      .select('id')
      .single()

    if (error) {
      log.error('Anlegen fehlgeschlagen', { errorMessage: error.message })
      return apiErrorResponse(error, req)
    }

    await logAuditEvent({
      action: 'create',
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      actorRole: auth.ctx.role,
      organizationId: auth.ctx.organizationId,
      entityType: 'arzt',
      entityId: data.id,
      details: { vorname: eingabe.vorname, nachname: eingabe.nachname, praxis_name: eingabe.praxis_name ?? null },
      request: req,
    })

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    return safeApiError(e, req)
  }
}
