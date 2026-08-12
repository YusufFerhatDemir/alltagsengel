// ═══════════════════════════════════════════════════════════════
// Freischaltung des PflegeCoach per Aktivierungscode (15a, Schritt 3)
//
// BEWUSSTE ABWEICHUNG von lib/coach/api-auth.ts (dort steht: kein
// service_role in coach-Routen): Das Einlösen eines Codes MUSS im
// Systemkontext laufen —
//   * die Code-Tabelle darf für Nutzer nicht lesbar sein (sonst könnte
//     man gültige Codes auslesen),
//   * die Freischaltung darf der Nutzer nicht selbst schreiben (sonst
//     wäre die Zugangsprüfung wertlos).
// Der Admin-Client wird deshalb AUSSCHLIESSLICH für die beiden
// Berechtigungstabellen verwendet — nie für coach_*-Gesundheitsdaten.
//
// KEIN BRUTE-FORCE-SCHUTZ nötig: Der Coderaum (31^12 ≈ 8·10^17) macht
// Raten über HTTP aussichtslos. Fehlversuche liefern bewusst dieselbe
// Meldung, damit sich gültige Präfixe nicht abfragen lassen.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  hashCode, istCodeFormatGueltig, istFreigeschaltet,
  pruefeCodeGueltigkeit, codePraefix,
} from '@/lib/coach/freischaltung'
import { freischaltungPflicht } from '@/lib/coach/config'

const FEHLER_UNGUELTIG = 'Dieser Code ist nicht gültig. Bitte prüfen Sie Ihre Eingabe.'

/** Eigener Freischaltstatus. */
export async function GET() {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('coach_freischaltungen')
    .select('*')
    .eq('coach_user_id', auth.coachUser.id)
    .order('freigeschaltet_am', { ascending: false })

  if (error) return NextResponse.json({ error: 'Freischaltung konnte nicht geladen werden.' }, { status: 500 })

  const heute = new Date().toISOString().slice(0, 10)
  return NextResponse.json({
    freischaltungen: data ?? [],
    freigeschaltet: istFreigeschaltet(data ?? [], heute),
    pflicht: freischaltungPflicht(),
  })
}

/** Code einlösen. */
export async function POST(request: Request) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const eingabe = typeof body.code === 'string' ? body.code : ''
  if (!istCodeFormatGueltig(eingabe)) {
    return NextResponse.json({ error: FEHLER_UNGUELTIG }, { status: 400 })
  }

  const admin = createAdminClient()
  const heute = new Date().toISOString().slice(0, 10)

  const { data: code, error: codeFehler } = await admin
    .from('coach_freischaltcodes')
    .select('id, status, gueltig_von, gueltig_bis, quelle, code_praefix')
    .eq('code_hash', hashCode(eingabe))
    .maybeSingle()

  if (codeFehler) {
    return NextResponse.json({ error: 'Der Code konnte gerade nicht geprüft werden. Bitte später erneut versuchen.' }, { status: 500 })
  }
  if (!code) return NextResponse.json({ error: FEHLER_UNGUELTIG }, { status: 404 })

  const gueltigkeit = pruefeCodeGueltigkeit({
    status: code.status,
    gueltig_von: code.gueltig_von,
    gueltig_bis: code.gueltig_bis,
    heute,
  })
  if (!gueltigkeit.gueltig) {
    return NextResponse.json({ error: gueltigkeit.grund }, { status: 409 })
  }

  // Pseudonym über die SECURITY-DEFINER-Funktion — der Klartext-Bezug
  // zwischen Nutzer und Code entsteht dadurch nirgends.
  const { data: pseudonym, error: pseudoFehler } = await admin.rpc('coach_pseudonym', {
    p_user_id: auth.user.id,
  })
  if (pseudoFehler) {
    return NextResponse.json({ error: 'Die Freischaltung konnte nicht abgeschlossen werden.' }, { status: 500 })
  }

  // Einlösen mit Status-Guard: bei parallelen Versuchen gewinnt genau einer.
  const { data: eingeloest, error: updateFehler } = await admin
    .from('coach_freischaltcodes')
    .update({
      status: 'eingeloest',
      eingeloest_am: new Date().toISOString(),
      eingeloest_pseudonym: pseudonym,
    })
    .eq('id', code.id)
    .eq('status', 'ausgegeben')
    .select('id')

  if (updateFehler) {
    return NextResponse.json({ error: 'Die Freischaltung konnte nicht abgeschlossen werden.' }, { status: 500 })
  }
  if (!eingeloest?.length) {
    return NextResponse.json({ error: 'Dieser Code wurde bereits eingelöst.' }, { status: 409 })
  }

  const { data: freischaltung, error: insertFehler } = await admin
    .from('coach_freischaltungen')
    .insert({
      coach_user_id: auth.coachUser.id,
      code_id: code.id,
      code_praefix: code.code_praefix ?? codePraefix(eingabe),
      quelle: code.quelle,
      gueltig_von: code.gueltig_von,
      gueltig_bis: code.gueltig_bis,
    })
    .select()
    .single()

  if (insertFehler) {
    // Code zurückdrehen, damit der Nutzer es erneut versuchen kann.
    await admin
      .from('coach_freischaltcodes')
      .update({ status: 'ausgegeben', eingeloest_am: null, eingeloest_pseudonym: null })
      .eq('id', code.id)
    return NextResponse.json({ error: 'Die Freischaltung konnte nicht abgeschlossen werden.' }, { status: 500 })
  }

  return NextResponse.json({ freischaltung, freigeschaltet: true })
}
