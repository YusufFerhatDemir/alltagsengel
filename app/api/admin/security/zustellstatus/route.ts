// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/security/zustellstatus?providerId=<id>
// ═══════════════════════════════════════════════════════════════════════
//
// DER EINZIGE ECHTE ZUSTELLNACHWEIS.
//
// Alles, was in unseren eigenen Tabellen steht, ist unsere eigene
// Behauptung: `security_notification_sent` heisst „wir haben uns
// entschieden zu melden", `notification_delivery_log.status='sent'`
// heisst „wir haben die Mail dem Provider uebergeben". Keines von
// beiden heisst „sie ist angekommen". Diese Route fragt deshalb den
// Provider selbst und gibt dessen Wort zurueck, unveraendert.
//
// WARUM AUF ANFORDERUNG UND NICHT IN DER LISTE
// Eine Seite mit 50 Zeilen wuerde 50 fremde HTTP-Aufrufe ausloesen —
// langsam, und Resend begrenzt die Aufrufe. Die Liste zeigt darum den
// eigenen Stand; wer den externen Beleg braucht, holt ihn je Zeile.
//
// BERECHTIGUNG: 'sicherheit.lesen' — dieselbe wie die Spur selbst
// (nur admin und superadmin).
//
// KEIN MAILINHALT. Zurueck gehen nur Zustellzustand, Zeitpunkte,
// Empfaenger und Betreff — also genau das, was in der Ansicht ohnehin
// schon steht. `html`/`text` der Nachricht werden bewusst verworfen:
// sie enthalten die vollstaendigen Ereignisdaten ein zweites Mal, und
// eine Statusabfrage braucht sie nicht.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { requireBerechtigung } from '@/lib/auth/guard'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Resend-Nachrichten-IDs sind UUIDs. Alles andere wird nicht angefragt. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Zeitlimit. Das Resend-SDK bringt keines mit (Befund „Resend-Fehlerpfade
 *  gehaertet") — hier laeuft der Aufruf ueber fetch, das Limit steht
 *  deshalb ausdruecklich da. */
const ZEITLIMIT_MS = 8_000

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireBerechtigung('sicherheit.lesen')
  if (!auth.ok) return auth.response

  try {
    const providerId = new URL(request.url).searchParams.get('providerId')?.trim() ?? ''
    if (!UUID_RE.test(providerId)) {
      return NextResponse.json(
        { fehler: 'Keine gueltige Provider-Nachrichten-ID' },
        { status: 400 },
      )
    }

    const schluessel = process.env.RESEND_API_KEY?.trim()
    if (!schluessel) {
      // Fail-closed und AUSGESPROCHEN: ohne Schluessel gibt es keinen
      // externen Nachweis. Ein stilles „unbekannt" waere hier das
      // Gefaehrlichste — es sieht aus wie eine Antwort.
      return NextResponse.json({
        providerId,
        erreichbar: false,
        status: null,
        hinweis: 'RESEND_API_KEY ist nicht gesetzt — ein externer Zustellnachweis '
          + 'ist derzeit nicht abrufbar. Der Stand in der Liste ist ausschliesslich '
          + 'unser eigener.',
      })
    }

    const abbruch = AbortSignal.timeout(ZEITLIMIT_MS)
    const antwort = await fetch(`https://api.resend.com/emails/${providerId}`, {
      headers: { Authorization: `Bearer ${schluessel}` },
      signal: abbruch,
      cache: 'no-store',
    })

    if (!antwort.ok) {
      return NextResponse.json({
        providerId,
        erreichbar: false,
        status: null,
        hinweis: `Der Provider antwortet mit HTTP ${antwort.status}. `
          + (antwort.status === 404
            ? 'Diese Nachrichten-ID ist dort nicht (mehr) bekannt.'
            : 'Kein Zustellnachweis abrufbar.'),
      })
    }

    const daten = (await antwort.json()) as Record<string, unknown>

    return NextResponse.json({
      providerId,
      erreichbar: true,
      /** Resend nennt den Zustellzustand `last_event`:
       *  sent / delivered / delivery_delayed / bounced / complained. */
      status: typeof daten.last_event === 'string' ? daten.last_event : null,
      empfaenger: Array.isArray(daten.to) ? (daten.to as unknown[]).map(String) : [],
      betreff: typeof daten.subject === 'string' ? daten.subject : null,
      erzeugtAm: typeof daten.created_at === 'string' ? daten.created_at : null,
      absender: typeof daten.from === 'string' ? daten.from : null,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
