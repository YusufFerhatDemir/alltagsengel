// ═══════════════════════════════════════════════════════════════════════
// Der Snapshot ist der Beleg — und er wurde blind geschrieben
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (Block 98, 14.09.2026)
//
// `invoice_snapshots` ist die Unveraenderlichkeits-Spur der Abrechnung:
// jede Zeile traegt den vollstaendigen Inhalt eines Vorgangs und eine
// Pruefsumme darueber. Storno, Korrektur und Gutschrift schreiben sie —
// an vier Stellen, und an allen vieren so:
//
//     await supabase.from('invoice_snapshots').insert({ … })
//
// Kein `error`, keine Zerlegung. PostgREST wirft nicht: ein abgewiesener
// INSERT kommt als stilles `error` im ERGEBNIS zurueck. Der Ablauf lief
// danach weiter und stornierte, korrigierte oder gutschrieb — ohne den
// Beleg, der spaeter beweisen soll, WAS storniert wurde und dass es
// seither unveraendert ist.
//
// Die Tabelle kann den INSERT auf mehreren Wegen abweisen (live am
// 14.09.2026 gelesen):
//   invoice_snapshots_org_fence   RESTRICTIVE — falsche organization_id
//   snapshot_type CHECK           nur festschreibung|storno|korrektur|gutschrift
//   unique_invoice_version        UNIQUE (invoice_id, version)
//   checksum NOT NULL
//
// WAS DARAN BESONDERS AUFFAELLT: in denselben drei Funktionen steht der
// Rollback-Weg bereits ausformuliert und begruendet — „scheitert sie,
// steht eine Gutschrift ohne Gegenstueck in der Tabelle und mindert den
// offenen Betrag, ohne dass jemand davon weiss". Der Snapshot-Schritt
// ist in jeder dieser Folgen der EINZIGE, der nicht nachsieht. Wieder
// derselbe Satz wie in den Bloecken 55 bis 97: der Schritt, der
// entscheidet, war lockerer als sein Nachbar in derselben Funktion.
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

export interface SnapshotEintrag {
  invoice_id: string
  version: number
  snapshot: unknown
  snapshot_type: 'festschreibung' | 'storno' | 'korrektur' | 'gutschrift'
  bezug_snapshot_id?: string | null
  checksum: string
  created_by?: string | null
  organization_id: string
}

export type SnapshotErgebnis =
  | { ok: true }
  | { ok: false; grund: string }

/**
 * Schreibt eine Snapshot-Zeile und meldet, ob sie entstanden ist.
 *
 * `.select('id')` erzwingt die Rueckgabe der angelegten Zeile — erst
 * damit ist „geschrieben" von „nicht geschrieben" unterscheidbar. Null
 * getroffene Zeilen ist bei PostgREST kein Fehler und muss hier trotzdem
 * als Fehlschlag gelten: ein Beleg, den es nicht gibt, belegt nichts.
 */
export async function schreibeSnapshot(
  supabase: SupabaseClient,
  eintrag: SnapshotEintrag,
): Promise<SnapshotErgebnis> {
  const { data, error } = await supabase
    .from('invoice_snapshots')
    .insert(eintrag)
    .select('id')

  if (error) return { ok: false, grund: error.message }
  if ((data?.length ?? 0) === 0) return { ok: false, grund: 'keine Zeile angelegt' }
  return { ok: true }
}
