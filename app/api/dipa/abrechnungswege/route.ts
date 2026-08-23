// ═══════════════════════════════════════════════════════════════
// Betriebs-Seite: Abrechnungswege der DiPA konfigurieren (15a, Schritt 6)
//
// Hier werden ausschließlich WEGE konfiguriert — keine Preise, keine
// Vergütungshöhen. `verguetung_geklaert` bleibt so lange false, bis eine
// Vergütungsvereinbarung tatsächlich vorliegt; erst dann gibt
// istAbrechnungsbereit() den Weg frei.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createClient } from '@/lib/supabase/server'
import { istSchluesselGueltig } from '@/lib/coach/abrechnung'

export async function GET() {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('coach_abrechnungswege')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Abrechnungswege konnten nicht geladen werden.' }, { status: 500 })
  return NextResponse.json({ wege: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  if (typeof body.schluessel !== 'string' || !istSchluesselGueltig(body.schluessel)) {
    return NextResponse.json(
      { error: 'Schlüssel muss aus 3–60 Kleinbuchstaben, Ziffern oder Unterstrichen bestehen.' },
      { status: 400 }
    )
  }
  if (typeof body.bezeichnung !== 'string' || !body.bezeichnung.trim()) {
    return NextResponse.json({ error: 'Bezeichnung darf nicht leer sein.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('coach_abrechnungswege')
    .insert({
      organization_id: auth.ctx.organizationId,
      schluessel: body.schluessel,
      bezeichnung: body.bezeichnung.trim().slice(0, 200),
      beschreibung: typeof body.beschreibung === 'string' ? body.beschreibung.slice(0, 2000) : null,
      rechtsgrundlage: typeof body.rechtsgrundlage === 'string' ? body.rechtsgrundlage.slice(0, 500) : null,
    })
    .select()
    .single()

  if (error) {
    const doppelt = error.code === '23505'
    return NextResponse.json(
      { error: doppelt ? 'Dieser Schlüssel ist bereits vergeben.' : 'Abrechnungsweg konnte nicht angelegt werden.' },
      { status: doppelt ? 409 : 400 }
    )
  }
  return NextResponse.json({ weg: data })
}

export async function PATCH(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  if (typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ error: 'Kein Abrechnungsweg angegeben.' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.bezeichnung !== undefined && typeof body.bezeichnung === 'string' && body.bezeichnung.trim()) {
    update.bezeichnung = body.bezeichnung.trim().slice(0, 200)
  }
  if (body.beschreibung !== undefined) {
    update.beschreibung = typeof body.beschreibung === 'string' ? body.beschreibung.slice(0, 2000) : null
  }
  if (body.rechtsgrundlage !== undefined) {
    update.rechtsgrundlage = typeof body.rechtsgrundlage === 'string' ? body.rechtsgrundlage.slice(0, 500) : null
  }
  if (body.aktiv !== undefined) update.aktiv = Boolean(body.aktiv)
  if (body.verguetung_geklaert !== undefined) update.verguetung_geklaert = Boolean(body.verguetung_geklaert)

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Keine änderbaren Felder übergeben.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('coach_abrechnungswege')
    .update(update)
    .eq('id', body.id)
    .eq('organization_id', auth.ctx.organizationId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Abrechnungsweg konnte nicht geändert werden.' }, { status: 400 })
  return NextResponse.json({ weg: data })
}
