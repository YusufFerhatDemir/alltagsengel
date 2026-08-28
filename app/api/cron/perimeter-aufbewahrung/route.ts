import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { pruefeCronGeheimnis } from '@/lib/api/cron-auth'
import { withTracking } from '@/lib/monitoring/tracker'
import { logger } from '@/lib/logger'
import {
  AUFBEWAHRUNG,
  NICHT_AUTOMATISCH,
  fuehreAufbewahrungAus,
  type AufbewahrungsClient,
} from '@/lib/perimeter/aufbewahrung'

// ═══════════════════════════════════════════════════════════════════════
// CRON: AUFBEWAHRUNG AM UNAUTHENTIFIZIERTEN PERIMETER (Track 13 B5)
// ═══════════════════════════════════════════════════════════════════════
//
// Kuerzt alte IP-Adressen und entfernt alte Zeilen aus den vier Tabellen,
// die die oeffentliche Website ohne Anmeldung befuellt. Die Fristen und
// ihre Begruendung stehen in lib/perimeter/aufbewahrung.ts.
//
// ─────────────────────────────────────────────────────────────────────
// STANDARD IST DER TROCKENLAUF
// ─────────────────────────────────────────────────────────────────────
// Ohne `PERIMETER_AUFBEWAHRUNG_AKTIV=1` zaehlt dieser Lauf nur und aendert
// NICHTS. Der Grund ist die Groesse des ersten Laufs: mit den hier
// gesetzten Fristen waeren am 28.08.2026 rund 4650 Zeilen betroffen
// (visitors 2447, visitor_locations 2193, conversions 14) — Daten, die
// seit Maerz 2026 liegen. Eine Frist, die beim ersten Einschalten den
// halben Bestand entfernt, gehoert vorher angesehen und nicht von einem
// naechtlichen Cron entschieden.
//
// Derselbe Umgang wie beim Pilot-Erstversand und bei der stillgelegten
// Hard-Delete-Edge-Function: die Mechanik steht bereit und laeuft, die
// Wirkung ist eine ausdrueckliche Freigabe.
//
// Der Trockenlauf ist dabei kein Platzhalter — seine Zahlen sind das
// Entscheidungsmaterial. Wer ihn liest, sieht vor dem Einschalten genau,
// was verschwinden wuerde.
//
// ─────────────────────────────────────────────────────────────────────
// ANTWORT IMMER 200, solange der Tuersteher durchgelassen hat: ein Fehler
// an einer einzelnen Tabelle ist ein Betriebszustand, kein Ausfall der
// Route. Vercel wertet 5xx als fehlgeschlagenen Cron und wiederholt —
// eine Wiederholung wuerde hier nichts verbessern. Der Zustand steht im
// Rumpf und im Protokoll.
// ═══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const log = logger.child('cron:perimeter-aufbewahrung')

export const GET = withTracking(async function GET(request: Request) {
  const abweisung = pruefeCronGeheimnis(request)
  if (abweisung) return abweisung

  try {
    const scharf = process.env.PERIMETER_AUFBEWAHRUNG_AKTIV === '1'
    const client = createAdminClient() as unknown as AufbewahrungsClient

    const ergebnis = await fuehreAufbewahrungAus(client, {
      jetzt: new Date(),
      trockenlauf: !scharf,
    })

    const meldung = ergebnis.trockenlauf
      ? 'Trockenlauf — nichts geaendert. Zum Ausfuehren PERIMETER_AUFBEWAHRUNG_AKTIV=1 setzen.'
      : 'Aufbewahrung ausgefuehrt.'

    if (ergebnis.fehler > 0) {
      log.error('Aufbewahrung mit Fehlern', {
        fehler: ergebnis.fehler,
        tabellen: ergebnis.tabellen.filter(t => t.fehler).map(t => `${t.tabelle}: ${t.fehler}`),
      })
    } else {
      log.info(meldung, {
        trockenlauf: ergebnis.trockenlauf,
        ipGekuerzt: ergebnis.ipGekuerztGesamt,
        geloescht: ergebnis.geloeschtGesamt,
      })
    }

    return NextResponse.json({
      ok: ergebnis.fehler === 0,
      meldung,
      ...ergebnis,
      // Mitgeliefert, damit der Trockenlauf allein aussagekraeftig ist:
      // wer die Zahlen liest, sieht auch, WELCHE Frist sie erzeugt hat
      // und welche Tabellen bewusst aussen vor bleiben.
      fristen: AUFBEWAHRUNG.map(e => ({
        tabelle: e.tabelle,
        ipFristTage: e.ipFristTage ?? null,
        loeschFristTage: e.loeschFristTage,
      })),
      nichtAutomatisch: NICHT_AUTOMATISCH.map(e => e.tabelle),
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
