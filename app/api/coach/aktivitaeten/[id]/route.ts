import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = {}

  if (body.titel !== undefined) {
    if (typeof body.titel !== 'string' || !body.titel.trim()) return NextResponse.json({ error: 'Titel darf nicht leer sein.' }, { status: 400 })
    update.titel = body.titel.trim().slice(0, 200)
  }
  if (body.beschreibung !== undefined) update.beschreibung = typeof body.beschreibung === 'string' ? body.beschreibung.slice(0, 2000) : null
  if (body.wochentage !== undefined) {
    if (!Array.isArray(body.wochentage) || body.wochentage.map(Number).some((t: number) => !Number.isInteger(t) || t < 1 || t > 7)) {
      return NextResponse.json({ error: 'Wochentage müssen Zahlen von 1 (Mo) bis 7 (So) sein.' }, { status: 400 })
    }
    update.wochentage = [...new Set(body.wochentage.map(Number))].sort((a, b) => (a as number) - (b as number))
  }
  if (body.uhrzeit !== undefined) update.uhrzeit = typeof body.uhrzeit === 'string' && body.uhrzeit ? body.uhrzeit : null
  if (body.dauer_minuten !== undefined) update.dauer_minuten = body.dauer_minuten == null ? null : Number(body.dauer_minuten)
  if (body.aktiv !== undefined) update.aktiv = Boolean(body.aktiv)

  if (!Object.keys(update).length) return NextResponse.json({ error: 'Keine änderbaren Felder übergeben.' }, { status: 400 })

  const { data, error } = await auth.supabase
    .from('coach_activities')
    .update(update)
    .eq('id', id)
    .eq('coach_user_id', auth.coachUser.id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Aktivität konnte nicht aktualisiert werden.' }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Aktivität nicht gefunden.' }, { status: 404 })
  return NextResponse.json({ aktivitaet: data })
}
