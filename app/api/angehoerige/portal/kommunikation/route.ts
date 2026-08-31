// ═══════════════════════════════════════════════════════════════
// GET/POST /api/angehoerige/portal/kommunikation — Nachrichten
// ═══════════════════════════════════════════════════════════════
//
// Die Abfragen laufen mit dem Dienstschlüssel (Begründung in
// lib/angehoerige/portal-helpers.ts) und tragen deshalb den
// Mandanten-Fence und die Zugangs-Erlaubnisliste selbst.

import { NextRequest, NextResponse } from 'next/server'
import {
  requirePortalAccess,
  zugaengeMitBereich,
  portalDatenClient,
} from '@/lib/angehoerige/portal-helpers'
import { protokolliereZugriff } from '@/lib/angehoerige/angehoerige'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('angehoerige-kommunikation')

/** Obergrenzen, damit ein Nachrichtenfeld nicht als Ablage missbraucht wird. */
const MAX_BETREFF = 200
const MAX_INHALT = 5000

export const GET = withTracking(async function GET() {
  const auth = await requirePortalAccess()
  if (!auth.ok) return auth.response

  const { ctx } = auth
  const zugangIds = zugaengeMitBereich(ctx.zugaenge, 'nachrichten').map(z => z.id)

  if (zugangIds.length === 0) {
    return NextResponse.json({ error: 'Kein Zugriff auf Nachrichten.' }, { status: 403 })
  }

  const supabase = portalDatenClient()

  const { data: nachrichten, error } = await supabase
    .from('angehoerigen_nachrichten')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .in('zugang_id', zugangIds)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: 'Nachrichten konnten nicht geladen werden.' }, { status: 500 })
  }

  const zeilen = (nachrichten ?? []) as Array<{ client_id: string }>
  const clientIds = [...new Set(zeilen.map(n => n.client_id))]

  const namen = new Map<string, string>()
  if (clientIds.length > 0) {
    // Ohne Fehlerpruefung trug bei einem Ausfall jede Nachricht den
    // Platzhalter „Klient" — bei mehreren freigegebenen Klienten ist das
    // keine Anzeige, sondern eine Verwechslungsgefahr.
    const { data: clients, error: clientsFehler } = await supabase
      .from('clients')
      .select('id, first_name, last_name')
      .eq('organization_id', ctx.organizationId)
      .in('id', clientIds)
    if (clientsFehler) {
      return NextResponse.json({ error: 'Klientennamen konnten nicht geladen werden.' }, { status: 500 })
    }
    for (const c of (clients ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
      namen.set(c.id, [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Klient')
    }
  }

  const enriched = zeilen.map(n => ({ ...n, client_name: namen.get(n.client_id) ?? 'Klient' }))

  return NextResponse.json({ nachrichten: enriched })
})

export const POST = withTracking(async function POST(request: NextRequest) {
  const auth = await requirePortalAccess()
  if (!auth.ok) return auth.response

  const { ctx } = auth

  const erlaubteZugaenge = zugaengeMitBereich(ctx.zugaenge, 'nachrichten')
  if (erlaubteZugaenge.length === 0) {
    return NextResponse.json({ error: 'Kein Zugriff auf Nachrichten.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 })
  }

  const zugangId = typeof body.zugang_id === 'string' ? body.zugang_id : ''
  const betreff = typeof body.betreff === 'string' ? body.betreff.trim() : ''
  const inhalt = typeof body.inhalt === 'string' ? body.inhalt.trim() : ''

  if (!zugangId || !betreff || !inhalt) {
    return NextResponse.json({ error: 'Zugang, Betreff und Inhalt sind Pflichtfelder.' }, { status: 400 })
  }
  if (betreff.length > MAX_BETREFF || inhalt.length > MAX_INHALT) {
    return NextResponse.json(
      { error: `Betreff (max. ${MAX_BETREFF} Zeichen) oder Nachricht (max. ${MAX_INHALT} Zeichen) ist zu lang.` },
      { status: 400 },
    )
  }

  // Der Zugang muss dem Nutzer gehören UND den Bereich „Nachrichten"
  // tragen. Vorher genügte die Zugehörigkeit: wer irgendeinen Zugang mit
  // Nachrichten-Freigabe hatte, konnte über JEDEN seiner Zugänge senden.
  const zugang = erlaubteZugaenge.find(z => z.id === zugangId)
  if (!zugang) {
    return NextResponse.json({ error: 'Ungültiger Zugang.' }, { status: 403 })
  }

  const supabase = portalDatenClient()

  const { data: nachricht, error } = await supabase
    .from('angehoerigen_nachrichten')
    .insert({
      organization_id: ctx.organizationId,
      zugang_id: zugang.id,
      client_id: zugang.client_id,
      absender_id: ctx.userId,
      absender_typ: 'angehoeriger',
      betreff,
      inhalt,
      status: 'gesendet',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Nachricht konnte nicht gesendet werden.' }, { status: 500 })
  }

  // Hier bewusst NICHT fail-closed: die Nachricht liegt bereits in der
  // Datenbank und IST damit selbst der Nachweis. Ein Abbruch würde dem
  // Absender fälschlich sagen, sie sei nicht angekommen. Der Fehler wird
  // aber als Fehler protokolliert, nicht als Warnung weggeschluckt.
  try {
    await protokolliereZugriff(supabase, ctx.organizationId, {
      zugang_id: zugang.id,
      user_id: ctx.userId,
      client_id: zugang.client_id,
      aktion: 'nachricht_gesendet',
      details: { nachricht_id: (nachricht as { id?: string } | null)?.id },
    })
  } catch (err) {
    log.errorWithException('Zugriffsprotokoll fuer gesendete Nachricht fehlgeschlagen', err)
  }

  return NextResponse.json({ nachricht })
})
