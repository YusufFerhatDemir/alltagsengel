// ═══════════════════════════════════════════════════════════════
// Qualitätsanforderungen an eUL-Erbringer — Nachweise (15d)
//
// Der Kriterienkatalog steht in lib/coach/eul.ts (konfigurierbar).
// Hier wird nur nachgehalten, wer welches Kriterium wann nachgewiesen
// hat — und daraus die Einsatzfreigabe abgeleitet (fail-closed).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createClient } from '@/lib/supabase/server'
import { EUL_QUALITAETSKRITERIEN, pruefeEulFreigabe } from '@/lib/coach/eul'
import { heuteBerlin } from '@/lib/utils/timezone';
import { withTracking } from '@/lib/monitoring/tracker'

const KRITERIUM_KEYS = EUL_QUALITAETSKRITERIEN.map(k => k.key)

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const caregiverId = url.searchParams.get('caregiverId')

  const supabase = await createClient()
  let query = supabase.from('eul_qualifikationen').select('*').eq('organization_id', auth.ctx.organizationId).order('created_at', { ascending: false })
  if (caregiverId) query = query.eq('caregiver_id', caregiverId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Nachweise konnten nicht geladen werden.' }, { status: 500 })

  const zeilen = data ?? []
  const heute = heuteBerlin()

  // Freigabe je Erbringer bestimmen (nur wenn nach Erbringer gefiltert wurde,
  // sonst gruppiert über caregiver_id).
  const gruppen = new Map<string, typeof zeilen>()
  for (const z of zeilen) {
    const key = z.caregiver_id ?? z.user_id ?? 'ohne_zuordnung'
    gruppen.set(key, [...(gruppen.get(key) ?? []), z])
  }
  const freigaben = [...gruppen.entries()].map(([erbringer, eigene]) => ({
    erbringer,
    name: eigene[0]?.erbringer_name ?? null,
    freigabe: pruefeEulFreigabe(eigene, heute),
  }))

  return NextResponse.json({ qualifikationen: zeilen, freigaben, kriterien: EUL_QUALITAETSKRITERIEN })
})

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  if (typeof body.kriterium_key !== 'string' || !KRITERIUM_KEYS.includes(body.kriterium_key)) {
    return NextResponse.json({ error: 'Unbekanntes Qualitätskriterium.' }, { status: 400 })
  }
  if (!body.caregiver_id && !body.user_id && !body.erbringer_name) {
    return NextResponse.json({ error: 'Bitte die erbringende Person angeben.' }, { status: 400 })
  }

  const datumOderNull = (wert: unknown) =>
    typeof wert === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(wert) ? wert : null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('eul_qualifikationen')
    .insert({
      organization_id: auth.ctx.organizationId,
      caregiver_id: typeof body.caregiver_id === 'string' && body.caregiver_id ? body.caregiver_id : null,
      user_id: typeof body.user_id === 'string' && body.user_id ? body.user_id : null,
      erbringer_name: typeof body.erbringer_name === 'string' ? body.erbringer_name.slice(0, 200) : null,
      kriterium_key: body.kriterium_key,
      erfuellt: Boolean(body.erfuellt),
      nachweis_art: typeof body.nachweis_art === 'string' ? body.nachweis_art.slice(0, 200) : null,
      geprueft_am: datumOderNull(body.geprueft_am) ?? heuteBerlin(),
      geprueft_durch: auth.ctx.name,
      gueltig_bis: datumOderNull(body.gueltig_bis),
      notiz: typeof body.notiz === 'string' ? body.notiz.slice(0, 1000) : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Nachweis konnte nicht gespeichert werden.' }, { status: 400 })
  return NextResponse.json({ qualifikation: data })
})
