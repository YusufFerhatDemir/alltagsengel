import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { logAuditEvent } from '@/lib/audit-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERLAUBTE_FELDER = [
  'art', 'grund', 'richterlich_genehmigt', 'genehmigung_aktenzeichen', 'genehmigung_gueltig_bis',
  'eilfall', 'eilfall_nachtraeglich_beantragt_am', 'einwilligung_betreuer', 'betreuer_name',
  'arzt_informiert', 'arzt_id', 'ueberwachungsintervall_minuten', 'bemerkung',
  'status', 'ende_am', 'beendigungsgrund',
] as const

function nurErlaubteFelder(roh: Record<string, unknown>): Record<string, unknown> {
  const sauber: Record<string, unknown> = {}
  for (const feld of ERLAUBTE_FELDER) {
    if (roh[feld] !== undefined) sauber[feld] = roh[feld]
  }
  return sauber
}

/** PATCH — Maßnahme aktualisieren oder beenden (status='beendet' setzt ende_am/beendigungsgrund voraus). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOpsAdmin()
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

    if (eingabe.status === 'beendet' && !eingabe.ende_am) {
      eingabe.ende_am = new Date().toISOString()
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('freiheitsentziehende_massnahmen')
      .update(eingabe)
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('[admin/fixierungen] Update fehlgeschlagen:', error.message)
      return NextResponse.json({ error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    }

    await logAuditEvent({
      action: eingabe.status === 'beendet' ? 'update' : 'update',
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      actorRole: auth.ctx.role,
      organizationId: auth.ctx.organizationId,
      entityType: 'freiheitsentziehende_massnahme',
      entityId: data.id,
      details: { geaenderte_felder: Object.keys(eingabe) },
      request: req,
    })

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    console.error('[admin/fixierungen] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

/** DELETE — Maßnahme archivieren (Soft-Delete). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('freiheitsentziehende_massnahmen')
      .update({ archiviert_am: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .is('archiviert_am', null)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('[admin/fixierungen] Archivierung fehlgeschlagen:', error.message)
      return NextResponse.json({ error: `Archivierung fehlgeschlagen: ${error.message}` }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Nicht gefunden oder bereits archiviert' }, { status: 404 })
    }

    await logAuditEvent({
      action: 'archive',
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      actorRole: auth.ctx.role,
      organizationId: auth.ctx.organizationId,
      entityType: 'freiheitsentziehende_massnahme',
      entityId: data.id,
      details: { aktion: 'archiviert' },
      request: req,
    })

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    console.error('[admin/fixierungen] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
