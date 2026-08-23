// ═══════════════════════════════════════════════════════════════════════
// Aufraeum-Lauf fuer die Zustellspur
// ═══════════════════════════════════════════════════════════════════════
//
// Migration 20260923000000 legt `cleanup_notification_delivery_log()` an
// und entzieht sie anon/authenticated — ausfuehren darf sie nur
// service_role. Sie hatte bis hierhin allerdings KEINEN Aufrufer im
// gesamten Repo: die Funktion existierte, lief aber nie. Ohne diesen
// Baustein waechst notification_delivery_log unbegrenzt.
//
// MANDANTENUEBERGREIFEND: die Funktion loescht nach Alter, nicht nach
// Organisation. Sie gehoert deshalb NICHT in die pro-Organisation
// laufende Kette (lib/automation/index.ts), sondern einmal pro Cron-Lauf
// — sonst liefe sie je Mandant erneut und meldete beim zweiten Mal 0.
//
// FEHLERTOLERANT: schlaegt der Aufruf fehl (Migration nicht eingespielt,
// Recht entzogen), wird gewarnt und `ok: false` gemeldet. Ein voller
// Protokolltabelle ist ein Betriebsthema, kein Grund, den taeglichen
// Cron-Lauf abzubrechen.
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

const log = logger.child('zustellspur-aufraeumen')

export interface AufraeumErgebnis {
  ok: boolean
  /** Anzahl geloeschter Zeilen; null, wenn der Aufruf nicht durchkam. */
  geloescht: number | null
  grund?: string
}

/**
 * Loescht Zustellprotokolle aelter als 400 Tage (Grenze steht in der
 * Migration, nicht hier — sie ist Teil der SECURITY-DEFINER-Funktion).
 *
 * Gefahrlos wiederholbar: ein zweiter Lauf am selben Tag loescht nichts
 * mehr und meldet 0.
 */
export async function raeumeZustellspurAuf(
  admin: SupabaseClient
): Promise<AufraeumErgebnis> {
  try {
    const { data, error } = await admin.rpc('cleanup_notification_delivery_log')
    if (error) {
      log.warn('Zustellspur nicht aufgeraeumt', { errorMessage: error.message })
      return { ok: false, geloescht: null, grund: error.message }
    }
    const geloescht = typeof data === 'number' ? data : Number(data ?? 0)
    if (geloescht > 0) {
      log.info('Zustellspur aufgeraeumt', { geloescht })
    }
    return { ok: true, geloescht: Number.isFinite(geloescht) ? geloescht : 0 }
  } catch (err) {
    log.errorWithException('Zustellspur: Ausnahme beim Aufraeumen', err)
    return {
      ok: false,
      geloescht: null,
      grund: err instanceof Error ? err.message : String(err),
    }
  }
}
