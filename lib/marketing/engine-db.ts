/**
 * Marketing Execution Engine — Anbindung an `marketing_content_status`.
 *
 * Trennung mit Absicht: `engine.ts` rechnet (Stufen, Übergänge, Regeln) und
 * kennt keine Datenbank. Diese Datei schreibt und liest, und kennt keine
 * Regeln. Wer die Übergangskette ändern will, fasst engine.ts an; wer die
 * Ablage ändert, diese Datei.
 *
 * ── WAS DIE DATENBANK VORGIBT ────────────────────────────────────────
 *   status              CHECK auf offen | geplant | veroeffentlicht | verworfen
 *   veroeffentlicht_am  CHECK: status='veroeffentlicht' nur MIT Zeitstempel
 *   notiz               freier Text — trägt die feine Stufe und die
 *                       Redaktionsfelder (siehe NOTIZ_MARKER in engine.ts)
 *   (content_id, organization_id)   ein Stand je Stück und Mandant (UNIQUE)
 *
 * ── WARUM HIER EIN VERGLEICH-UND-SETZE STEHT ─────────────────────────
 * Zwei Personen, die dasselbe Stück gleichzeitig weiterschalten, würden sich
 * sonst gegenseitig überschreiben — und der Verlierer erfährt nichts davon.
 * `wechsleStufe` liest den Stand, prüft den Übergang gegen GENAU diesen Stand
 * und schreibt mit `eq('status', <gelesener Status>)`. Trifft das keine Zeile,
 * hat jemand anders zuerst geschrieben; der Aufrufer bekommt das gesagt statt
 * eines stillen Erfolgs.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ausNotiz, schreibsatzFuer, dbStatusFuer, nachNotiz,
  type MarketingStueck, type MarketingStufe,
} from '@/lib/marketing/engine'

export const TABELLE = 'marketing_content_status'

export interface GeladenesStueck {
  contentId: string
  stueck: MarketingStueck
  /** Der gelesene DB-Status — Grundlage des Vergleich-und-Setze. */
  dbStatus: string
  kanal: string | null
  veroeffentlichtAm: string | null
}

export interface LadeErgebnis {
  stuecke: GeladenesStueck[]
  fehler: string | null
}

/**
 * Alle Stände eines Mandanten. Ein Lesefehler wird GEMELDET, nicht als
 * leere Liste zurückgegeben — „nichts geplant" und „nicht nachsehen können"
 * sind verschiedene Aussagen (siehe lint:leerzustand).
 */
export async function ladeStuecke(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<LadeErgebnis> {
  const { data, error } = await supabase
    .from(TABELLE)
    .select('content_id, status, kanal, notiz, veroeffentlicht_am')
    .eq('organization_id', organizationId)

  if (error) return { stuecke: [], fehler: `${TABELLE} lesen fehlgeschlagen: ${error.message}` }

  const stuecke: GeladenesStueck[] = []
  for (const z of data ?? []) {
    const zeile = z as {
      content_id: string; status: string | null; kanal: string | null
      notiz: string | null; veroeffentlicht_am: string | null
    }
    const stueck = ausNotiz(zeile.notiz, zeile.status)
    if (!stueck) continue   // unbekannter Status — lieber auslassen als erfinden
    stuecke.push({
      contentId: zeile.content_id,
      stueck,
      dbStatus: zeile.status ?? 'offen',
      kanal: zeile.kanal,
      veroeffentlichtAm: zeile.veroeffentlicht_am,
    })
  }
  return { stuecke, fehler: null }
}

export interface WechselErgebnis {
  ok: boolean
  /** Klartext für die Oberfläche. `null` bei Erfolg. */
  fehler: string | null
  /** Die Stufe, die jetzt gilt. */
  stufe: MarketingStufe | null
}

/**
 * Stufe eines Stücks weiterschalten.
 *
 * Prüft erst die Regeln der Engine (Übergang erlaubt? Caption da? Termin
 * gesetzt?), dann schreibt es mit Vergleich-und-Setze auf den gelesenen
 * Status.
 */
export async function wechsleStufe(
  supabase: SupabaseClient,
  organizationId: string,
  geladen: GeladenesStueck,
  nach: MarketingStufe,
  jetzt: Date = new Date(),
): Promise<WechselErgebnis> {
  const { satz, fehler } = schreibsatzFuer(geladen.stueck, nach, jetzt)
  if (!satz) return { ok: false, fehler, stufe: geladen.stueck.stufe }

  const { data, error } = await supabase
    .from(TABELLE)
    .update({
      status: satz.status,
      notiz: satz.notiz,
      veroeffentlicht_am: satz.veroeffentlicht_am,
      updated_at: jetzt.toISOString(),
    })
    .eq('organization_id', organizationId)
    .eq('content_id', geladen.contentId)
    // Der Riegel: nur schreiben, wenn der Stand noch der gelesene ist.
    .eq('status', geladen.dbStatus)
    .select('content_id')

  if (error) return { ok: false, fehler: `Speichern fehlgeschlagen: ${error.message}`, stufe: null }
  if (!data || data.length === 0) {
    return {
      ok: false,
      stufe: null,
      fehler: 'Der Stand hat sich zwischenzeitlich geändert — bitte neu laden.',
    }
  }
  return { ok: true, fehler: null, stufe: nach }
}

/**
 * Stück anlegen, falls es noch keinen Stand hat.
 *
 * `upsert` auf (organization_id, content_id): der UNIQUE-Index macht daraus
 * genau eine Zeile je Stück und Mandant. **Ohne** Statuswechsel — ein neu
 * angelegtes Stück beginnt als Idee, und ein bestehender Stand wird dabei
 * NICHT zurückgestempelt (siehe Projekt-Memory „Upsert stempelt Endzustände
 * zurück"): darum `ignoreDuplicates`.
 */
export async function legeStueckAn(
  supabase: SupabaseClient,
  organizationId: string,
  contentId: string,
  stueck: MarketingStueck,
  kanal: string | null = null,
): Promise<{ ok: boolean; fehler: string | null }> {
  const { error } = await supabase
    .from(TABELLE)
    .upsert({
      organization_id: organizationId,
      content_id: contentId,
      status: dbStatusFuer(stueck.stufe),
      kanal,
      notiz: nachNotiz(stueck),
      veroeffentlicht_am: stueck.stufe === 'veroeffentlicht' ? new Date().toISOString() : null,
    }, { onConflict: 'organization_id,content_id', ignoreDuplicates: true })

  if (error) return { ok: false, fehler: `Anlegen fehlgeschlagen: ${error.message}` }
  return { ok: true, fehler: null }
}

export type StufenZaehlung = Record<MarketingStufe, number>

export function zaehleStufen(stuecke: readonly GeladenesStueck[]): StufenZaehlung {
  const z = {
    idee: 0, entwurf: 0, review: 0, freigegeben: 0,
    geplant: 0, veroeffentlicht: 0, verworfen: 0,
  } satisfies StufenZaehlung
  for (const s of stuecke) z[s.stueck.stufe]++
  return z
}
