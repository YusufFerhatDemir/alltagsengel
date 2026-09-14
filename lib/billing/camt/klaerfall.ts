// ═══════════════════════════════════════════════════════════════════════
// Klaerfall anlegen — und nur zaehlen, was wirklich entstanden ist
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (Block 96, 14.09.2026)
//
// Beide Klaerfall-Anlagen des CAMT-Imports standen als blosses
//
//     await supabase.from('klaerfaelle').insert({ … })
//
// — ohne Zerlegung, ohne Fehlerpruefung. PostgREST wirft nicht: ein
// abgewiesener INSERT (RLS, CHECK, Fremdschluessel, Ausfall) kommt als
// stilles `error` im ERGEBNIS zurueck, das dort niemand ansah.
//
// `klaerfaelle++` stand aber davor. Die Antwort der Route meldete dann N
// Klaerfaelle, `camt_imports.klaerfaelle_anzahl` schrieb N fort, und der
// Pruefeintrag behauptete dasselbe — waehrend keine einzige Zeile
// existierte, die jemand haette abarbeiten koennen.
//
// Bei einer nicht zuzuordnenden Ruecklastschrift ist das der teuerste
// offene Posten des ganzen Imports; der Kommentar an jener Stelle sagt es
// selbst: das Geld ist zurueckgegangen, die Rechnung steht weiter auf
// 'bezahlt', und ohne Klaerfall sieht es niemand.
//
// WARUM EIN EIGENES MODUL: `route.ts` darf ausser den Handlern nichts
// exportieren — ein zusaetzlicher Export bricht den Vercel-Build erst nach
// dem Webpack-Compile. Hier ist die Funktion direkt pruefbar, und die
// beiden Fehlschlagsarten (`error` gesetzt / keine Zeile getroffen) lassen
// sich EINZELN belegen. Gegen eine echte Datenbank ist „kein Fehler und
// trotzdem keine Zeile" nicht herstellbar — aber genau das ist die Lage,
// in der eine Zaehlung ins Leere laeuft.
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

export interface KlaerfallEintrag {
  organization_id: string
  zahlungseingang_id: string
  grund: string
  vorschlaege: unknown
  status: string
}

export type KlaerfallErgebnis =
  | { ok: true }
  | { ok: false; grund: string }

/**
 * Legt einen Klaerfall an und meldet, ob er entstanden ist.
 *
 * `.select('id')` erzwingt die Rueckgabe der angelegten Zeile — erst damit
 * ist „angelegt" von „nicht angelegt" unterscheidbar.
 */
export async function legeKlaerfallAn(
  supabase: SupabaseClient,
  eintrag: KlaerfallEintrag,
): Promise<KlaerfallErgebnis> {
  const { data, error } = await supabase
    .from('klaerfaelle')
    .insert(eintrag)
    .select('id')

  if (error) return { ok: false, grund: error.message }

  // Null getroffene Zeilen ist bei PostgREST KEIN Fehler. Ohne diese
  // zweite Frage bliebe genau der Fall offen, gegen den das Modul gebaut
  // ist: die Route zaehlt einen Klaerfall, den es nicht gibt.
  if ((data?.length ?? 0) === 0) return { ok: false, grund: 'keine Zeile angelegt' }

  return { ok: true }
}
