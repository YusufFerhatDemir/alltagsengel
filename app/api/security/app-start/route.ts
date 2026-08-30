// ═══════════════════════════════════════════════════════════════════════
// POST /api/security/app-start
// ═══════════════════════════════════════════════════════════════════════
//
// „App-Start mit authentifizierter Sitzung" — soweit technisch erfassbar.
//
// WARUM ES DAFUER EINEN ENDPUNKT BRAUCHT
// Die native Huelle ist ein WKWebView/WebView der Live-Seite (Capacitor,
// siehe capacitor.config.json). Der Server sieht einen gewoehnlichen
// Seitenaufruf und kann den App-START nicht von einer Navigation
// innerhalb der App unterscheiden. Nur der Client weiss, dass die App
// gerade hochgefahren ist.
//
// WARUM DAS TROTZDEM KEIN FRONTEND-VERTRAUEN IST
// Der Client sagt nur DASS die App gestartet ist. WER sie gestartet hat,
// entscheidet ausschliesslich die serverseitig gepruefte Sitzung
// (`supabase.auth.getUser()`); der Rumpf traegt keine Konto-Kennung und
// wird auch nicht danach gefragt. Eine gefaelschte Meldung koennte also
// hoechstens einen zusaetzlichen App-Start FUER DAS EIGENE KONTO
// erzeugen — kein Zugriff, keine fremde Zuordnung.
//
// GEGEN FLUTEN
// Ein persistenter Ratenzaehler (nicht die instanz-lokale Variante,
// die auf Vercel umgehbar ist): hoechstens 6 Meldungen je Konto und
// Stunde. Ohne ihn koennte ein Konto seine eigene Ueberwachung mit
// Meldungen zuschuetten, bis niemand mehr hinsieht.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'
import { erfasseSicherheitsereignis } from '@/lib/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Hoechstens sechs App-Starts je Konto und Stunde. */
const GRENZE = 6
const FENSTER_MS = 3_600_000

export const POST = withTracking(async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Ohne Sitzung gibt es nichts zu melden — und ausdruecklich KEINE
    // Auskunft darueber, ob eine Sitzung bestand.
    if (!user) return NextResponse.json({ ok: true }, { status: 202 })

    if (!(await rateLimitPersistent(`security:app-start:${user.id}`, GRENZE, FENSTER_MS))) {
      return NextResponse.json({ ok: true, gedrosselt: true }, { status: 202 })
    }

    await erfasseSicherheitsereignis({
      eventType: 'app_start',
      userId: user.id,
      userEmail: user.email ?? null,
      request,
      metadata: { funktion: 'App-Start', ergebnis: 'SUCCESS' },
      // Ein App-Start auf einem neuen Geraet ist derselbe Befund wie
      // eine Anmeldung auf einem neuen Geraet.
      geraetePruefung: true,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return safeApiError(err, request)
  }
})
