// ═══════════════════════════════════════════════════════════════════════
// Empfehlungsbonus — Gutschrift auf profiles.referral_credit
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (28.08.2026, Track 7): /api/referral/complete hat die Gutschrift
// so gebucht:
//
//     try {
//       await supabaseAdmin.rpc('increment_referral_credit', { … })
//     } catch {
//       // Fallback wenn RPC nicht existiert
//       … profiles lesen, +bonus, zurueckschreiben …
//     }
//
// Zwei Fehler in vier Zeilen, die sich gegenseitig verdecken:
//
//   1. `increment_referral_credit` EXISTIERT NICHT — weder im Repo noch
//      live (28.08.2026 aus pg_proc gelesen: kein Treffer).
//   2. `supabase.rpc()` WIRFT NICHT. Der Client liefert `{ data, error }`;
//      eine fehlende Funktion kommt als PGRST202 im `error`-Feld zurueck,
//      nicht als Ausnahme. Der `catch`-Zweig konnte deshalb NIE laufen.
//
// Wirkung: der Bonus wurde weder per RPC noch per Fallback gutgeschrieben.
// Die Route hat den Vorgang trotzdem auf 'completed' gesetzt, beide
// *_credited-Kennzeichen auf true geschrieben und dem Nutzer geantwortet
// „20 € Bonus für beide Seiten gutgeschrieben“ — und weil der Vorgang
// damit verbrannt war, gab es keinen zweiten Versuch. Ein Versprechen, das
// nie eingeloest wird, und niemand sieht es.
//
// Deshalb liegt die Buchung jetzt hier, an EINER Stelle, mit gepruefter
// Antwort und ohne stille Rueckfallebene: Lesen, Addieren, Schreiben, und
// jeder der drei Schritte kann fehlschlagen und sagt es.
//
// Kein Ausweichen mehr auf eine RPC: eine atomare Inkrement-Funktion waere
// die bessere Bauform, aber sie existiert nicht, und eine Route, die auf
// eine nicht vorhandene Funktion zeigt und im Fehlerfall so tut, als haette
// sie gebucht, ist schlechter als der ehrliche Lese-Schreib-Weg. Der
// Aufrufer beansprucht den Vorgang vorher per Compare-and-Swap; damit ist
// die Buchung je Vorgang einmalig, auch ohne DB-seitiges Inkrement.
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { aufCent } from '@/lib/geld'

export interface GutschriftErgebnis {
  ok: boolean
  /** Neuer Kontostand nach der Buchung — nur bei ok:true gesetzt. */
  neuerStand?: number
  /** Klartext fuer Protokoll und Antwort — nur bei ok:false gesetzt. */
  fehler?: string
}

/**
 * Schreibt `betrag` auf das Empfehlungsguthaben eines Nutzers gut.
 *
 * FAIL-CLOSED: jeder nicht gelesene Kontostand und jeder nicht
 * geschriebene Wert ist ein Fehler, kein „dann eben 0“. Ein
 * Empfehlungsguthaben ist Geld gegenueber dem Kunden.
 */
export async function schreibeGutschrift(
  admin: SupabaseClient,
  userId: string,
  betrag: number,
): Promise<GutschriftErgebnis> {
  if (!Number.isFinite(betrag) || betrag <= 0) {
    return { ok: false, fehler: `Ungültiger Bonusbetrag: ${betrag}` }
  }

  const { data: profil, error: leseFehler } = await admin
    .from('profiles')
    .select('referral_credit')
    .eq('id', userId)
    .maybeSingle()

  if (leseFehler) {
    return { ok: false, fehler: `Guthaben nicht lesbar (${leseFehler.code ?? 'unbekannt'}).` }
  }
  // Kein Profil heisst: es gibt kein Konto, auf das gebucht werden koennte.
  // Das ist ausdruecklich ein Fehler und keine Buchung von 0.
  if (!profil) {
    return { ok: false, fehler: 'Kein Profil für die Gutschrift gefunden.' }
  }

  // `profiles.referral_credit` und `referrals.bonus_amount` sind beide
  // numeric OHNE Skala (live gelesen) — der Wert ist ein EURO-Betrag, kein
  // Cent-Betrag. `aufCent` ist deshalb die richtige Rundung, nicht
  // `centRunden`: gerundet wird auf zwei Nachkommastellen in Euro, und
  // zwar kaufmaennisch symmetrisch (lib/geld.ts).
  const alt = typeof profil.referral_credit === 'number' ? profil.referral_credit : 0
  const neu = aufCent(alt + betrag)

  const { error: schreibFehler } = await admin
    .from('profiles')
    .update({ referral_credit: neu })
    .eq('id', userId)

  if (schreibFehler) {
    return { ok: false, fehler: `Guthaben nicht schreibbar (${schreibFehler.code ?? 'unbekannt'}).` }
  }

  return { ok: true, neuerStand: neu }
}
