// ═══════════════════════════════════════════════════════════════════════
// Alarmspur — wurde zu diesem Ereignis gemeldet, und kam die Mail an?
// ═══════════════════════════════════════════════════════════════════════
//
// DAS PROBLEM, DAS DIESES MODUL LOEST
// Die Sicherheitsansicht zeigte bisher nur, DASS etwas passiert ist.
// Ob daraufhin jemand benachrichtigt wurde — und ob diese Mail beim
// Empfaenger ankam — stand in zwei anderen Tabellen, die niemand
// nebeneinander gelegt hat. Genau daran ist der Fall vom 31.08.2026
// aufgefallen: es gab einen Versandnachweis, es gab eine Zustellzeile,
// und trotzdem war die Frage „ist die Mail angekommen?" nicht
// beantwortbar, ohne drei Abfragen von Hand zu fahren.
//
// DREI QUELLEN, DREI VERSCHIEDENE AUSSAGEN — und der Unterschied ist
// der ganze Punkt:
//
//   1. security_audit_log, event_type='security_notification_sent'
//      → „wir haben uns ENTSCHIEDEN zu melden und den Versand angestossen"
//        Das ist eine Aussage ueber uns selbst, kein Zustellbeleg.
//
//   2. notification_delivery_log (vorgang_art='sicherheitsmeldung')
//      → „wir haben die Mail dem Provider UEBERGEBEN" (+ dessen
//        Nachrichten-ID, Versuchszaehler, Fehlergrund)
//        Auch das ist noch kein Zustellbeleg: `status='sent'` heisst
//        uebergeben, nicht angekommen.
//
//   3. Der Provider selbst (Resend, GET /emails/{id})
//      → „zugestellt / bounced / gescheitert"
//        ERST DAS ist ein Zustellbeleg, und er kommt von aussen.
//
// Dieses Modul legt 1 und 2 an die Ereigniszeile. Quelle 3 ist
// ausdruecklich NICHT hier: ein Listenaufruf mit 50 Zeilen wuerde 50
// fremde HTTP-Aufrufe ausloesen. Sie wird auf Anforderung je Zeile
// geholt — app/api/admin/security/zustellstatus.
//
// KEINE ZUSAETZLICHEN PERSONENDATEN
// Angelegt wird nur, was zur Beantwortung der Frage noetig ist:
// Empfaengeradresse (wer wurde informiert), Provider-ID, Status,
// Zeitstempel, Fehlergrund. `sanitized_error` ist bereits entschaerft
// (lib/notifications/delivery-log.ts). Es wird KEIN Mailinhalt geladen.
// ═══════════════════════════════════════════════════════════════════════

import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { SICHERHEITSMELDUNG_ART, MELDE_NACHWEIS } from './benachrichtigung'

type AdminClient = ReturnType<typeof createAdminClient>

/** Ein Zustellversuch, wie ihn notification_delivery_log fuehrt. */
export interface Zustellversuch {
  status: string
  empfaenger: string | null
  provider: string | null
  /** Nachrichten-ID des Providers. Ohne sie ist NICHTS nachpruefbar. */
  providerNachrichtId: string | null
  versuche: number | null
  letzterVersuch: string | null
  zugestelltAm: string | null
  gescheitertAm: string | null
  fehlergrund: string | null
}

/**
 * Der Alarmzustand einer Ereigniszeile.
 *
 * `ausgeloest` beantwortet „wurde gemeldet?" — und zwar bewusst aus dem
 * Versandnachweis, nicht aus der Zustellspur: ein Ereignis ohne
 * Organisation bekommt gar keinen Zustellvorgang (siehe
 * benachrichtigung.ts), waere aber trotzdem gemeldet worden. Wer nur
 * die Zustellspur ansaehe, hielte das faelschlich fuer „nicht gemeldet".
 */
export interface Alarmzustand {
  ausgeloest: boolean
  nachweisId: string | null
  nachweisZeit: string | null
  meldeGrund: string | null
  empfaengerAnzahl: number | null
  zustellungen: Zustellversuch[]
  /**
   * true, wenn gemeldet wurde, aber KEIN Zustellvorgang registriert ist.
   * Dann gab es nur den Sofortversuch — ein Fehlschlag waere endgueltig,
   * der Wiederholungslauf sieht diese Meldung nie. Ein Befund, kein
   * Schoenheitsfehler.
   */
  ohneWiederholung: boolean
}

export const LEERER_ALARM: Alarmzustand = {
  ausgeloest: false,
  nachweisId: null,
  nachweisZeit: null,
  meldeGrund: null,
  empfaengerAnzahl: null,
  zustellungen: [],
  ohneWiederholung: false,
}

/** Rohform der Zustellzeile — die Select-Liste ist zusammengesetzt, damit
 *  kann der Typ sie nicht selbst herleiten. */
interface ZustellRoh {
  vorgang_ref: string | null
  status: string | null
  recipient: string | null
  provider: string | null
  provider_message_id: string | null
  attempt_count: number | null
  attempted_at: string | null
  delivered_at: string | null
  failed_at: string | null
  sanitized_error: string | null
  grund: string | null
}

function text(wert: unknown): string | null {
  return typeof wert === 'string' && wert.trim() !== '' ? wert : null
}

function zahl(wert: unknown): number | null {
  return typeof wert === 'number' && Number.isFinite(wert) ? wert : null
}

/**
 * Laedt fuer eine Menge von Ereignis-IDs den Alarmzustand.
 *
 * ZWEI Abfragen fuer die ganze Seite, nicht zwei je Zeile. Eine Seite
 * mit 200 Eintraegen ergaebe sonst 400 Abfragen — derselbe Fehler, den
 * `anreichern()` in abfrage.ts schon vermeidet.
 *
 * Fail-soft: faellt eine der beiden Abfragen aus, wird die Liste OHNE
 * Alarmspalten geliefert statt gar nicht. Eine Sicherheitsansicht, die
 * wegen einer Zusatzinformation komplett leer bleibt, ist schlechter
 * als eine mit einer Luecke.
 */
export async function alarmZustaende(
  admin: AdminClient,
  ereignisIds: readonly string[],
): Promise<Map<string, Alarmzustand>> {
  const ergebnis = new Map<string, Alarmzustand>()
  const ids = [...new Set(ereignisIds.filter(Boolean))]
  if (ids.length === 0) return ergebnis

  // ── 1 · Versandnachweise ────────────────────────────────────────────
  // Der Bezug steht in metadata->>bezug_ereignis. PostgREST kann darauf
  // filtern; `in.(…)` braucht die Werte in Klammern und ohne Leerzeichen.
  try {
    const { data } = await admin
      .from('security_audit_log')
      .select('id, created_at, metadata')
      .eq('event_type', MELDE_NACHWEIS)
      .in('metadata->>bezug_ereignis', ids)

    for (const zeile of data ?? []) {
      const meta = (zeile.metadata ?? {}) as Record<string, unknown>
      const bezug = text(meta.bezug_ereignis)
      if (!bezug) continue
      ergebnis.set(bezug, {
        ...LEERER_ALARM,
        ausgeloest: true,
        nachweisId: (zeile.id as string) ?? null,
        nachweisZeit: (zeile.created_at as string) ?? null,
        meldeGrund: text(meta.melde_grund),
        empfaengerAnzahl: zahl(meta.empfaenger_anzahl),
        zustellungen: [],
      })
    }
  } catch {
    // fail-soft, siehe Kopf
  }

  // ── 2 · Zustellversuche ─────────────────────────────────────────────
  try {
    const { data } = await admin
      .from('notification_delivery_log')
      .select('vorgang_ref, status, recipient, provider, provider_message_id, '
        + 'attempt_count, attempted_at, delivered_at, failed_at, sanitized_error, grund')
      .eq('vorgang_art', SICHERHEITSMELDUNG_ART)
      .in('vorgang_ref', ids)

    for (const zeile of ((data ?? []) as unknown as ZustellRoh[])) {
      const bezug = text(zeile.vorgang_ref)
      if (!bezug) continue
      const versuch: Zustellversuch = {
        status: text(zeile.status) ?? 'unbekannt',
        empfaenger: text(zeile.recipient),
        provider: text(zeile.provider),
        providerNachrichtId: text(zeile.provider_message_id),
        versuche: zahl(zeile.attempt_count),
        letzterVersuch: text(zeile.attempted_at),
        zugestelltAm: text(zeile.delivered_at),
        gescheitertAm: text(zeile.failed_at),
        fehlergrund: text(zeile.sanitized_error) ?? text(zeile.grund),
      }
      const vorhanden = ergebnis.get(bezug)
      if (vorhanden) vorhanden.zustellungen.push(versuch)
      else {
        // Zustellzeile ohne Versandnachweis: kommt vor, wenn der
        // Sofortversuch scheiterte (dann schreibt benachrichtigung.ts
        // KEINEN Nachweis) und der Wiederholungslauf uebernimmt. Die
        // Zeile gehoert trotzdem sichtbar an das Ereignis.
        ergebnis.set(bezug, { ...LEERER_ALARM, zustellungen: [versuch] })
      }
    }
  } catch {
    // fail-soft, siehe Kopf
  }

  for (const zustand of ergebnis.values()) {
    zustand.ohneWiederholung = zustand.ausgeloest && zustand.zustellungen.length === 0
  }

  return ergebnis
}

/**
 * Der Satz, der in der Oberflaeche steht. Bewusst hier und nicht im
 * Bauteil: dieselbe Aussage soll in Liste, CSV und Bericht gleich
 * lauten, und sie ist die Stelle, an der „uebergeben" und „zugestellt"
 * NICHT verwechselt werden duerfen.
 */
export function alarmKurzfassung(a: Alarmzustand): string {
  if (!a.ausgeloest && a.zustellungen.length === 0) return 'kein Alarm'

  const zugestellt = a.zustellungen.filter(z => z.zugestelltAm)
  const gescheitert = a.zustellungen.filter(z => z.gescheitertAm)

  if (gescheitert.length > 0 && zugestellt.length === 0) {
    return `Alarm — Zustellung GESCHEITERT (${gescheitert.length})`
  }
  if (zugestellt.length > 0) {
    return `Alarm — an Provider uebergeben (${zugestellt.length}), Zustellung beim Provider pruefen`
  }
  if (a.ohneWiederholung) {
    return 'Alarm ausgeloest — kein Zustellvorgang (keine Wiederholung moeglich)'
  }
  return 'Alarm ausgeloest — Zustellung offen'
}
