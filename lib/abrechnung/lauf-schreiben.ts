/**
 * Zustandswechsel eines Abrechnungslaufs — mit Rückmeldung.
 *
 * ── WARUM ES DIESE DATEI GIBT ─────────────────────────────────────────
 * Am 13.09.2026 gezählt: **dreizehn** Schreibvorgänge auf
 * `abrechnungslaeufe` standen als nacktes `await supabase…` da — ohne
 * Destrukturierung, ohne `error`-Prüfung, ohne Rückfrage, ob überhaupt
 * eine Zeile getroffen wurde. Verteilt über die Engine, den Versand, die
 * Rückläufer und die Korrekturläufe. Keiner davon wurde ausgewertet.
 *
 * Das ist die Zustandsmaschine, die Abrechnungen an Kostenträger steuert.
 * Geht ein Übergang verloren, läuft der Vorgang weiter, als wäre er
 * geschehen: die Engine validiert einen Lauf, der in der Datenbank noch
 * „erstellt" heißt, exportiert ihn danach, und der Stand in der Tabelle
 * hat mit dem tatsächlichen Verlauf nichts mehr zu tun. Auffallen würde
 * das erst, wenn jemand die Liste ansieht — oder gar nicht.
 *
 * ── WARUM EIN HELFER UND NICHT DREIZEHN KOPIEN ────────────────────────
 * Dreizehnmal derselbe Fünfzeiler wäre dreizehnmal die Gelegenheit, ihn
 * unterschiedlich zu schreiben. Der Schrittname macht die Ausnahme
 * lesbar: wer den Fehler liest, weiß ohne Stacktrace, welcher Übergang
 * gescheitert ist.
 *
 * ── WARUM GEWORFEN UND NICHT PROTOKOLLIERT WIRD ───────────────────────
 * Die Engine wirft an sechzehn anderen Stellen. Ein Lauf, dessen Zustand
 * nicht festgehalten werden konnte, darf nicht weiterlaufen — er würde
 * sonst auf einer Annahme aufbauen, die nicht stimmt.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface LaufSchreibOptionen {
  /** Wird in die Fehlermeldung übernommen — z. B. „Validierung gestartet". */
  schritt: string
  /** Mandantenfilter, wo der Aufrufer ihn kennt. */
  organizationId?: string
  /**
   * Erwarteter Vorzustand.
   *
   * Gesetzt wird daraus eine Bedingung auf `status`: der Übergang greift
   * nur, solange der Lauf noch dort steht. Damit kann ein zweiter,
   * gleichzeitiger Durchlauf denselben Lauf nicht ein zweites Mal
   * weiterschalten.
   */
  vonStatus?: string
}

/**
 * Schreibt einen Zustandswechsel und stellt sicher, dass er ankam.
 *
 * @throws wenn die Datenbank einen Fehler meldet ODER keine Zeile
 *         getroffen wurde.
 */
export async function aktualisiereLauf(
  supabase: SupabaseClient,
  laufId: string,
  patch: Record<string, unknown>,
  optionen: LaufSchreibOptionen,
): Promise<void> {
  if (!laufId) {
    throw new Error(`${optionen.schritt}: keine Lauf-ID übergeben.`)
  }

  let abfrage = supabase
    .from('abrechnungslaeufe')
    .update(patch)
    .eq('id', laufId)

  if (optionen.organizationId) {
    abfrage = abfrage.eq('organization_id', optionen.organizationId)
  }
  if (optionen.vonStatus) {
    abfrage = abfrage.eq('status', optionen.vonStatus)
  }

  const { data, error } = await abfrage.select('id')

  if (error) {
    throw new Error(`${optionen.schritt} fehlgeschlagen: ${error.message}`)
  }
  if (!data || data.length === 0) {
    // Ohne `.select()` sähe dieser Fall aus wie Erfolg: PostgREST meldet
    // bei null getroffenen Zeilen keinen Fehler.
    const grund = optionen.vonStatus
      ? `Lauf steht nicht mehr auf „${optionen.vonStatus}"`
      : 'Lauf nicht gefunden oder kein Zugriff'
    throw new Error(`${optionen.schritt} ohne Wirkung: ${grund} (Lauf ${laufId}).`)
  }
}
