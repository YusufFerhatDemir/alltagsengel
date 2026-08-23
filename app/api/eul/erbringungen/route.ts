// ═══════════════════════════════════════════════════════════════
// Ergänzende Unterstützungsleistungen — Nachweise (15d)
//
// Betriebsdaten des Leistungserbringers, org-gefenced. Diese Route
// berührt KEINE coach_*-Gesundheitsdaten; ein Bezug zur DiPA-Nutzung
// besteht höchstens über ein nicht auflösbares Pseudonym.
//
// Die Buchungs-Brücke: über booking_id lässt sich eine erbrachte eUL an
// einen bestehenden Einsatz hängen. Umgekehrt gibt es bewusst KEINEN Weg
// aus dem PflegeCoach heraus in die Buchung (Werbefreiheit der
// Kernfunktion — siehe lib/coach/eul.ts, Abgrenzungshinweis).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createClient } from '@/lib/supabase/server'
import { heuteBerlin } from '@/lib/utils/timezone'
import {
  istEulDurchfuehrungsform, istEulLeistungsart, pruefeNachweisVollstaendig,
} from '@/lib/coach/eul'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const clientId = url.searchParams.get('clientId')

  const supabase = await createClient()
  let query = supabase
    .from('eul_erbringungen')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .order('datum', { ascending: false })
    .limit(500)
  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Nachweise konnten nicht geladen werden.' }, { status: 500 })
  return NextResponse.json({ erbringungen: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))

  if (!istEulLeistungsart(body.leistungsart)) {
    return NextResponse.json({ error: 'Bitte eine gültige Leistungsart wählen.' }, { status: 400 })
  }
  const durchfuehrungsform = istEulDurchfuehrungsform(body.durchfuehrungsform)
    ? body.durchfuehrungsform
    : 'persoenlich_vor_ort'

  const datum = typeof body.datum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.datum)
    ? body.datum
    : heuteBerlin()
  const dauer = Number(body.dauer_minuten)
  if (!Number.isInteger(dauer) || dauer < 1 || dauer > 480) {
    return NextResponse.json({ error: 'Die Dauer muss zwischen 1 und 480 Minuten liegen.' }, { status: 400 })
  }
  const inhalt = typeof body.inhalt === 'string' ? body.inhalt.trim() : ''
  if (inhalt.length < 10) {
    return NextResponse.json({ error: 'Bitte beschreiben Sie die erbrachte Leistung (mindestens 10 Zeichen).' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('eul_erbringungen')
    .insert({
      organization_id: auth.ctx.organizationId,
      booking_id: typeof body.booking_id === 'string' && body.booking_id ? body.booking_id : null,
      client_id: typeof body.client_id === 'string' && body.client_id ? body.client_id : null,
      coach_pseudonym: typeof body.coach_pseudonym === 'string' ? body.coach_pseudonym.slice(0, 64) : null,
      leistungsart: body.leistungsart,
      datum,
      dauer_minuten: dauer,
      durchfuehrungsform,
      inhalt: inhalt.slice(0, 4000),
      erbracht_von: typeof body.erbracht_von === 'string' && body.erbracht_von ? body.erbracht_von : null,
      erbringer_name: typeof body.erbringer_name === 'string' ? body.erbringer_name.slice(0, 200) : auth.ctx.name,
      qualifikation_geprueft: Boolean(body.qualifikation_geprueft),
      abrechnungsweg_key: typeof body.abrechnungsweg_key === 'string' ? body.abrechnungsweg_key.slice(0, 60) : null,
      bemerkung: typeof body.bemerkung === 'string' ? body.bemerkung.slice(0, 2000) : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Nachweis konnte nicht gespeichert werden.' }, { status: 400 })

  // Vollständigkeit direkt zurückmelden — die Bestätigung erfolgt separat.
  const vollstaendigkeit = pruefeNachweisVollstaendig({
    leistungsart: data.leistungsart,
    datum: data.datum,
    dauer_minuten: data.dauer_minuten,
    inhalt: data.inhalt,
    erbringer_name: data.erbringer_name,
    qualifikation_geprueft: data.qualifikation_geprueft,
  })

  return NextResponse.json({ erbringung: data, vollstaendigkeit })
}
