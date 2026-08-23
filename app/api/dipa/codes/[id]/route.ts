import { NextResponse } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createClient } from '@/lib/supabase/server'

/**
 * Code zurückziehen oder Gültigkeit anpassen.
 * Ein bereits eingelöster Code wird nicht mehr verändert — sonst wäre der
 * Nachweis der Freischaltung nachträglich manipulierbar.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (!['ausgegeben', 'storniert', 'abgelaufen'].includes(body.status)) {
      return NextResponse.json({ error: 'Ungültiger Status.' }, { status: 400 })
    }
    update.status = body.status
  }
  if (body.gueltig_bis !== undefined) {
    update.gueltig_bis =
      typeof body.gueltig_bis === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.gueltig_bis)
        ? body.gueltig_bis
        : null
  }
  if (body.notiz !== undefined) {
    update.notiz = typeof body.notiz === 'string' ? body.notiz.slice(0, 500) : null
  }
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Keine änderbaren Felder übergeben.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('coach_freischaltcodes')
    .update(update)
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .neq('status', 'eingeloest')
    .select('id, code_praefix, status, gueltig_von, gueltig_bis, notiz')

  if (error) return NextResponse.json({ error: 'Code konnte nicht geändert werden.' }, { status: 400 })
  if (!data?.length) {
    return NextResponse.json(
      { error: 'Code nicht gefunden oder bereits eingelöst — eingelöste Codes sind unveränderlich.' },
      { status: 409 }
    )
  }
  return NextResponse.json({ code: data[0] })
}
