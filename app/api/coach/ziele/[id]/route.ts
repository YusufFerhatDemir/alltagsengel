import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import type { ZielStatus } from '@/lib/coach/types'

const STATUS: ZielStatus[] = ['aktiv', 'erreicht', 'angepasst', 'pausiert', 'beendet']

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCoachUser({ schreibzugriff: true })
  if (!auth.ok) return auth.response
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = {}

  if (body.titel !== undefined) {
    if (typeof body.titel !== 'string' || !body.titel.trim()) return NextResponse.json({ error: 'Titel darf nicht leer sein.' }, { status: 400 })
    update.titel = body.titel.trim().slice(0, 200)
  }
  if (body.beschreibung !== undefined) update.beschreibung = typeof body.beschreibung === 'string' ? body.beschreibung.slice(0, 2000) : null
  if (body.messgroesse !== undefined) update.messgroesse = typeof body.messgroesse === 'string' ? body.messgroesse.slice(0, 200) : null
  if (body.zielwert !== undefined) update.zielwert = body.zielwert == null ? null : Number(body.zielwert)
  if (body.aktueller_wert !== undefined) update.aktueller_wert = body.aktueller_wert == null ? null : Number(body.aktueller_wert)
  if (body.ziel_bis !== undefined) update.ziel_bis = typeof body.ziel_bis === 'string' && body.ziel_bis ? body.ziel_bis : null
  if (body.status !== undefined) {
    if (!STATUS.includes(body.status)) return NextResponse.json({ error: 'Ungültiger Status.' }, { status: 400 })
    update.status = body.status
  }
  if (body.anpassungs_notiz !== undefined) update.anpassungs_notiz = typeof body.anpassungs_notiz === 'string' ? body.anpassungs_notiz.slice(0, 2000) : null

  if (!Object.keys(update).length) return NextResponse.json({ error: 'Keine änderbaren Felder übergeben.' }, { status: 400 })

  // RLS begrenzt auf eigene Zeilen; .eq coach_user_id zusätzlich als Defense-in-Depth.
  const { data, error } = await auth.supabase
    .from('coach_goals')
    .update(update)
    .eq('id', id)
    .eq('coach_user_id', auth.coachUser.id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Ziel konnte nicht aktualisiert werden.' }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Ziel nicht gefunden.' }, { status: 404 })
  return NextResponse.json({ ziel: data })
}
