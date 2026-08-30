import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { fuehreWiederholungslaufAus } from '@/lib/notifications/retry-worker'
import { sendeOffeneSicherheitsmeldungen } from '@/lib/security/nachzuegler'
import { pruefeCronGeheimnis } from '@/lib/api/cron-auth'
import { withTracking } from '@/lib/monitoring/tracker'

// ═══════════════════════════════════════════════════════════════════════
// CRON: WIEDERHOLUNGSLAUF FUER BENACHRICHTIGUNGEN
// ═══════════════════════════════════════════════════════════════════════
// Nimmt fehlgeschlagene und haengen gebliebene Zustellungen aus
// notification_delivery_log wieder auf und schliesst aussichtslose als
// Dead Letter ab.
//
// WER RUFT AUF
//   * .github/workflows/zustellung-retry.yml — alle 5 Minuten, der
//     eigentliche Takt
//   * vercel.json — taeglich um 04:00 als Rueckfall
//
// Der 5-Minuten-Takt steht in GitHub Actions und nicht in vercel.json,
// weil der Tarif dieses Projekts Cron-Jobs nur einmal taeglich ausloest;
// ein Deployment mit `*/5 * * * *` wird von Vercel abgelehnt.
//
// WARUM ALLE 5 MINUTEN
// Die kuerzeste Wartezeit betraegt eine Minute; ein Takt darunter wuerde
// nur leere Laeufe erzeugen. Ueber der Wartezeit von 5 Minuten liegend
// waere jede Nachricht unnoetig lange unterwegs. Ein Lauf, der laenger
// braucht als der Takt, blockiert den naechsten nicht falsch: der zweite
// Aufruf sieht die Sperre und meldet 'blockiert' — das ist der
// Normalfall bei langen Laeufen, kein Fehler.
//
// ZEITBUDGET
// maxDuration deckelt die Funktion bei 60 s, der Lauf selbst hoert nach
// 45 s von sich aus auf und gibt die Sperre ordentlich frei. Ein harter
// Abbruch durch die Plattform wuerde die Sperre stehen lassen; sie
// verfaellt dann nach 10 Minuten ueber den Herzschlag.
// ═══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const GET = withTracking(async function GET(request: Request) {
  const abweisung = pruefeCronGeheimnis(request)
  if (abweisung) return abweisung

  try {
    const ergebnis = await fuehreWiederholungslaufAus({ zeitbudgetMs: 45_000 })

    // Sicherheitsmeldungen zu Ereignissen, die die DATENBANK geschrieben
    // hat (Trigger auf auth.users und profiles). Ein Trigger kann keine
    // Mail senden; ohne diesen Nachlauf staende die Anmeldung oder die
    // Adressaenderung im Protokoll, und niemand erfuehre davon.
    //
    // Haengt bewusst HIER und nicht an einem eigenen Cron: der Tarif
    // loest Vercel-Cronjobs nur taeglich aus, und der 5-Minuten-Takt
    // dieses Laufs ist genau der, den eine Sicherheitsmeldung braucht.
    //
    // Fail-soft: ein Fehler im Nachlauf darf den Wiederholungslauf nicht
    // rot faerben — der ist die wichtigere Aufgabe dieser Route.
    let sicherheit = { geprueft: 0, gemeldet: 0, uebersprungen: 0, fehler: 0 }
    try {
      sicherheit = await sendeOffeneSicherheitsmeldungen()
    } catch {
      sicherheit.fehler++
    }

    // 200 auch bei 'blockiert' und 'nicht_bereit': beides sind gueltige
    // Betriebszustaende, keine Stoerungen. Vercel wuerde einen 5xx als
    // fehlgeschlagenen Cron werten und Alarm schlagen, obwohl nichts
    // kaputt ist. Der Status steht im Rumpf.
    return NextResponse.json({
      ok: ergebnis.ok,
      status: ergebnis.status,
      laufId: ergebnis.laufId,
      uebernommen: ergebnis.uebernommen,
      grund: ergebnis.grund ?? null,
      dauerMs: ergebnis.dauerMs,
      metriken: ergebnis.metriken,
      sicherheitsmeldungen: sicherheit,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
