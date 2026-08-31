import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { pruefeCronGeheimnis } from '@/lib/api/cron-auth'
import { withTracking } from '@/lib/monitoring/tracker'
import { logger } from '@/lib/logger'
import {
  AUFBEWAHRUNGSKATALOG, NICHT_AUTOMATISCH, alleEnvSchluessel, katalogMitFristen,
} from '@/lib/aufbewahrung/katalog'
import { fuehreAufbewahrungslaufAus, type LaufClient } from '@/lib/aufbewahrung/lauf'

// ═══════════════════════════════════════════════════════════════════════
// CRON: ZENTRALE AUFBEWAHRUNG
// ═══════════════════════════════════════════════════════════════════════
//
// Ein Lauf ueber den GESAMTEN Katalog (lib/aufbewahrung/katalog.ts) —
// Perimeter und Betrieb. Die aeltere Route /api/cron/perimeter-aufbewahrung
// bleibt bestehen und deckt weiterhin nur den Perimeter ab; sie zu
// entfernen waere ein zweiter Eingriff im selben Zug. Beide lesen
// dieselben Perimeter-Regeln, es gibt also keine zweite Antwort auf die
// Frage „wie lange heben wir das auf?" — nur zwei Takte auf demselben
// Katalog.
//
// ─────────────────────────────────────────────────────────────────────
// STANDARD IST DER TROCKENLAUF
// ─────────────────────────────────────────────────────────────────────
// Ohne `AUFBEWAHRUNG_AKTIV=1` zaehlt dieser Lauf nur und aendert NICHTS.
// Dieselbe Zurueckhaltung wie beim Perimeter-Lauf und beim
// Pilot-Erstversand: eine Frist, die beim ersten Einschalten einen
// Bestand entfernt, den nie jemand angesehen hat, gehoert vorher
// angesehen — und die Zahlen des Trockenlaufs SIND das
// Entscheidungsmaterial.
//
// Der Trockenlauf raeumt bewusst nicht „schon mal ein bisschen" auf. Er
// zaehlt genau das, was der scharfe Lauf entfernen wuerde, Schutzbedingung
// eingerechnet.
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

const log = logger.child('cron:aufbewahrung')

export const GET = withTracking(async function GET(request: Request) {
  const abweisung = pruefeCronGeheimnis(request)
  if (abweisung) return abweisung

  try {
    const scharf = process.env.AUFBEWAHRUNG_AKTIV === '1'
    const client = createAdminClient() as unknown as LaufClient

    const ergebnis = await fuehreAufbewahrungslaufAus(client, {
      jetzt: new Date(),
      trockenlauf: !scharf,
    })

    const meldung = ergebnis.trockenlauf
      ? 'Trockenlauf — nichts geaendert. Zum Ausfuehren AUFBEWAHRUNG_AKTIV=1 setzen.'
      : 'Aufbewahrung ausgefuehrt.'

    if (ergebnis.fehler > 0) {
      log.error('Aufbewahrung mit Fehlern', {
        fehler: ergebnis.fehler,
        regeln: ergebnis.regeln.filter(r => r.fehler).map(r => `${r.tabelle}: ${r.fehler}`),
      })
    } else {
      log.info(meldung, {
        trockenlauf: ergebnis.trockenlauf,
        ipGekuerzt: ergebnis.ipGekuerztGesamt,
        geloescht: ergebnis.geloeschtGesamt,
        spurGeschrieben: ergebnis.spurGeschrieben,
      })
    }
    if (ergebnis.warnungen.length > 0) {
      log.error('Aufbewahrung: ungueltige Frist in der Umgebung', { warnungen: ergebnis.warnungen })
    }
    if (ergebnis.spurGeschrieben === false) {
      log.error('Aufbewahrung: Revisionsspur NICHT geschrieben', { fehler: ergebnis.spurFehler })
    }

    return NextResponse.json({
      ok: ergebnis.fehler === 0 && ergebnis.spurGeschrieben !== false,
      meldung,
      trockenlauf: ergebnis.trockenlauf,
      ip_gekuerzt: ergebnis.ipGekuerztGesamt,
      geloescht: ergebnis.geloeschtGesamt,
      fehler: ergebnis.fehler,
      warnungen: ergebnis.warnungen,
      spur_geschrieben: ergebnis.spurGeschrieben,
      spur_fehler: ergebnis.spurFehler,
      regeln: ergebnis.regeln,
      // Beides mitgeben, damit der Aufruf selbst beantwortet, WELCHE
      // Fristen gelten und WAS bewusst ausgenommen ist. Sonst muesste man
      // dafuer in den Quelltext sehen.
      katalog: katalogMitFristen().map(r => ({
        tabelle: r.tabelle,
        bereich: r.bereich,
        loesch_frist_tage: r.loeschFrist.tage,
        frist_quelle: r.loeschFrist.quelle,
        ip_frist_tage: r.ipFrist?.tage ?? null,
        env_schluessel: r.envSchluessel,
        schutz: r.schutz?.begruendung ?? null,
      })),
      nicht_automatisch: NICHT_AUTOMATISCH,
      stellschrauben: alleEnvSchluessel(),
      regeln_gesamt: AUFBEWAHRUNGSKATALOG.length,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
