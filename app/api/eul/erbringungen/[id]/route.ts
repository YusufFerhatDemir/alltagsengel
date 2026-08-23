import { NextResponse } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createClient } from '@/lib/supabase/server'
import { pruefeNachweisVollstaendig } from '@/lib/coach/eul'

/**
 * Nachweis ändern oder bestätigen.
 *
 * Die Bestätigung ist der Punkt, an dem der Nachweis verbindlich wird —
 * deshalb wird sie erst gesetzt, wenn er vollständig ist, und ein bereits
 * bestätigter Nachweis lässt sich inhaltlich nicht mehr ändern.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const supabase = await createClient()

  const { data: vorhanden, error: ladeFehler } = await supabase
    .from('eul_erbringungen')
    .select('*')
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .maybeSingle()

  if (ladeFehler) return NextResponse.json({ error: 'Nachweis konnte nicht geladen werden.' }, { status: 500 })
  if (!vorhanden) return NextResponse.json({ error: 'Nachweis nicht gefunden.' }, { status: 404 })
  if (vorhanden.bestaetigt_am) {
    return NextResponse.json(
      { error: 'Dieser Nachweis ist bereits bestätigt und kann nicht mehr geändert werden.' },
      { status: 409 }
    )
  }

  const update: Record<string, unknown> = {}
  if (body.inhalt !== undefined) {
    if (typeof body.inhalt !== 'string' || body.inhalt.trim().length < 10) {
      return NextResponse.json({ error: 'Bitte beschreiben Sie die erbrachte Leistung (mindestens 10 Zeichen).' }, { status: 400 })
    }
    update.inhalt = body.inhalt.trim().slice(0, 4000)
  }
  if (body.dauer_minuten !== undefined) {
    const dauer = Number(body.dauer_minuten)
    if (!Number.isInteger(dauer) || dauer < 1 || dauer > 480) {
      return NextResponse.json({ error: 'Die Dauer muss zwischen 1 und 480 Minuten liegen.' }, { status: 400 })
    }
    update.dauer_minuten = dauer
  }
  if (body.qualifikation_geprueft !== undefined) update.qualifikation_geprueft = Boolean(body.qualifikation_geprueft)
  if (body.erbringer_name !== undefined) {
    update.erbringer_name = typeof body.erbringer_name === 'string' ? body.erbringer_name.slice(0, 200) : null
  }
  if (body.bemerkung !== undefined) {
    update.bemerkung = typeof body.bemerkung === 'string' ? body.bemerkung.slice(0, 2000) : null
  }

  // Bestätigung nur bei vollständigem Nachweis.
  if (body.bestaetigen === true) {
    const zusammen = { ...vorhanden, ...update }
    const pruefung = pruefeNachweisVollstaendig({
      leistungsart: zusammen.leistungsart,
      datum: zusammen.datum,
      dauer_minuten: zusammen.dauer_minuten,
      inhalt: zusammen.inhalt,
      erbringer_name: zusammen.erbringer_name,
      qualifikation_geprueft: zusammen.qualifikation_geprueft,
    })
    if (!pruefung.vollstaendig) {
      return NextResponse.json(
        { error: `Nachweis unvollständig: ${pruefung.fehlend.join(', ')}.` },
        { status: 400 }
      )
    }
    update.bestaetigt_am = new Date().toISOString()
    update.bestaetigt_durch = auth.ctx.name
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Keine änderbaren Felder übergeben.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('eul_erbringungen')
    .update(update)
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Nachweis konnte nicht geändert werden.' }, { status: 400 })
  return NextResponse.json({ erbringung: data })
}

/** Nur unbestätigte Nachweise dürfen gelöscht werden. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response
  const { id } = await params

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('eul_erbringungen')
    .delete()
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .is('bestaetigt_am', null)
    .select('id')

  if (error) return NextResponse.json({ error: 'Nachweis konnte nicht gelöscht werden.' }, { status: 400 })
  if (!data?.length) {
    return NextResponse.json({ error: 'Nachweis nicht gefunden oder bereits bestätigt.' }, { status: 409 })
  }
  return NextResponse.json({ geloescht: true })
}
