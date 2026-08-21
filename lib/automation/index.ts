/**
 * Automatisierungsketten — zentraler Orchestrator.
 *
 * Bündelt alle 12 im WS7-Auftrag geprüften Ketten zu einem täglichen Lauf
 * pro Organisation. Jede Kette läuft unabhängig und fehlertolerant: eine
 * einzelne fehlschlagende Kette (z. B. wegen einer noch nicht angewendeten
 * Migration) darf die übrigen nicht verhindern.
 *
 * Aufrufer:
 *   - app/api/cron/automatisierung/route.ts (täglich, alle Organisationen)
 *   - app/api/admin/automatisierung/route.ts (manueller Admin-Trigger)
 *
 * Absichtlich NICHT hier: Kette 4 (Qualifikation blockiert Einsatz) und
 * Kette 10/11-Grundlogik (Rückläufer-Aufgabe, Mahnlauf-Eskalation) — die
 * laufen bereits ereignisgetrieben an ihrer Quelle (Einsatzplanung, Import,
 * eigener Cron) und brauchen keinen zusätzlichen Taktgeber.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { meldeFehlendeNachweise } from './nachweis-fehlt'
import { warneVorFristablauf } from './fristen-warnung'
import { eskaliereAbgelaufeneFristen } from './eskalation-fristen'
import { pruefeAlleBudgetsUndWarnen } from './budget-warnung'
import { erinnereFehlendeUnterschriften } from './unterschrift-erinnerung'
import { pruefeMonatsabschlussVollstaendigkeit } from './monatsabschluss-pruefung'
import { pruefeVitalwerteUndMeldePdl } from './vitalwerte-pdl'
import { escaliereUeberfaellige } from '@/lib/abrechnung/fristen-manager'
import { logger } from '@/lib/logger'
const log = logger.child('automatisierung')

export interface AutomatisierungsErgebnis {
  organizationId: string
  ketten: Record<string, { ok: boolean; ergebnis?: unknown; fehler?: string }>
}

async function ketteAusfuehren<T>(
  ketten: AutomatisierungsErgebnis['ketten'],
  name: string,
  fn: () => Promise<T>,
): Promise<void> {
  try {
    ketten[name] = { ok: true, ergebnis: await fn() }
  } catch (err) {
    log.error(`Kette "${name}" fehlgeschlagen: ${err}`)
    ketten[name] = { ok: false, fehler: (err as Error).message }
  }
}

/**
 * Führt alle täglichen Automatisierungsketten für eine Organisation aus.
 * `actorId` ist bei Cron-Läufen die Organisation selbst (systemgetrieben,
 * kein handelnder Benutzer) — derselbe Kompromiss wie im Mahnlauf-Cron.
 */
export async function fuehreTaeglicheAutomatisierungAus(
  supabase: SupabaseClient,
  organizationId: string,
  actorId: string = organizationId,
): Promise<AutomatisierungsErgebnis> {
  const ketten: AutomatisierungsErgebnis['ketten'] = {}

  await ketteAusfuehren(ketten, 'nachweis_fehlt', () => meldeFehlendeNachweise(supabase, organizationId, actorId))
  await ketteAusfuehren(ketten, 'fristen_warnung', () => warneVorFristablauf(supabase, organizationId))
  await ketteAusfuehren(ketten, 'eskalation_fristen', () => eskaliereAbgelaufeneFristen(supabase, organizationId, actorId))
  await ketteAusfuehren(ketten, 'eskalation_abrechnungsfristen', () => escaliereUeberfaellige(supabase, organizationId, actorId))
  await ketteAusfuehren(ketten, 'budget_warnung', () => pruefeAlleBudgetsUndWarnen(supabase, organizationId))
  await ketteAusfuehren(ketten, 'unterschrift_erinnerung', () => erinnereFehlendeUnterschriften(supabase, organizationId, actorId))
  await ketteAusfuehren(ketten, 'monatsabschluss_pruefung', () => pruefeMonatsabschlussVollstaendigkeit(supabase, organizationId, actorId))
  await ketteAusfuehren(ketten, 'vitalwerte_pdl', () => pruefeVitalwerteUndMeldePdl(supabase, organizationId, actorId))

  // Fallback für die überfällige-Aufgaben-Eskalation (SQL-Trigger-Kette):
  // Migration 20260918000000 legt eine pg_cron-Planung an, die nur greift,
  // wenn pg_cron in der Supabase-Instanz aktiviert UND die Migration
  // angewendet ist. Dieser RPC-Aufruf ist der Fallback, falls beides (noch)
  // nicht der Fall ist — schlägt die Funktion fehl, weil sie nicht existiert,
  // wird das als "nicht verfügbar" behandelt, nicht als Fehler des Laufs.
  try {
    const { error } = await supabase.rpc('cron_check_ueberfaellige_aufgaben')
    ketten.ueberfaellige_aufgaben_markieren = error
      ? { ok: false, fehler: error.message }
      : { ok: true }
  } catch (err) {
    ketten.ueberfaellige_aufgaben_markieren = { ok: false, fehler: (err as Error).message }
  }

  return { organizationId, ketten }
}
