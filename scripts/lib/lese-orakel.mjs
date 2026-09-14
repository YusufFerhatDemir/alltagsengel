// ═══════════════════════════════════════════════════════════════════════
// Lese-Orakel — Messwert von Stoerung unterscheiden
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (Block 50, 14.09.2026)
//
// `public._run_sql` ist das Lese-Orakel dieses Projekts: ein DO-Block,
// der seinen Messwert per `RAISE EXCEPTION` zurueckgibt. PostgREST
// liefert das als
//
//     HTTP 400  {"code":"P0001","message":"<der Messwert>"}
//
// Ein FEHLER sieht fast genauso aus:
//
//     HTTP 401  {"message":"Invalid API key","hint":"…"}
//
// Beide tragen `message`. Wer nur `.message` liest — und das taten 43 von
// 45 Prueflaeufen —, haelt „Invalid API key" fuer einen Messwert.
//
// Gemessen am 14.09.2026 mit einem absichtlich kaputten Schluessel:
// VIER Laeufe meldeten trotzdem exit 0, darunter der in Block 47 von mir
// selbst gebaute `verify-migrationsstand.ts`. Er berichtete „alle sechs
// Migrationen OFFEN" — eine Aussage ueber eine Datenbank, die er nie
// erreicht hatte. Haette Yusuf sie zwischenzeitlich eingespielt, haette
// der Lauf das Gegenteil behauptet.
//
// DER UNTERSCHEIDENDE MERKMAL IST `code`, NICHT `message`
// `P0001` ist `raise_exception` — der Beweis, dass der DO-Block
// tatsaechlich gelaufen ist. Fehlt er, wurde nichts gemessen; dann ist
// die einzige richtige Antwort ein Abbruch, kein Messwert.
// ═══════════════════════════════════════════════════════════════════════

import { apiHeaders } from './supabase-keys.mjs'

/** Postgres-Fehlercode von `RAISE EXCEPTION` ohne eigenen SQLSTATE. */
export const ORAKEL_CODE = 'P0001'

/**
 * Deutet eine Orakel-Antwort.
 *
 * Reine Funktion, damit sie ohne Netz pruefbar ist.
 *
 * @returns {{ok: true, wert: string} | {ok: false, grund: string}}
 */
export function deuteOrakelAntwort(status, rohtext) {
  let antwort
  try {
    antwort = JSON.parse(rohtext)
  } catch {
    return {
      ok: false,
      grund: `Die Antwort war kein JSON (HTTP ${status}): ${String(rohtext).slice(0, 200)}`,
    }
  }

  if (antwort && antwort.code === ORAKEL_CODE && typeof antwort.message === 'string') {
    return { ok: true, wert: antwort.message }
  }

  // Ab hier ist es KEIN Messwert. Die Begruendung soll den haeufigsten
  // Fall beim Namen nennen, statt „unerwartete Antwort" zu sagen.
  const m = antwort && typeof antwort.message === 'string' ? antwort.message : ''
  if (status === 401 || /invalid api key/i.test(m)) {
    return {
      ok: false,
      grund:
        'Der Dienstschluessel wurde abgewiesen (HTTP 401). Es wurde NICHTS gemessen — '
        + 'SUPABASE_SECRET_KEY bzw. SUPABASE_SERVICE_ROLE_KEY pruefen.',
    }
  }
  if (antwort && antwort.code === 'PGRST202') {
    return {
      ok: false,
      grund:
        'PGRST202: `public._run_sql` wurde nicht gefunden. Haeufigste Ursache ist der '
        + 'falsche Parametername — die Funktion nimmt `p`, nicht `query`.',
    }
  }
  return {
    ok: false,
    grund:
      `Kein Messwert: HTTP ${status}, code=${antwort?.code ?? '—'}. `
      + `Das Orakel antwortet auf einen Messwert IMMER mit code=${ORAKEL_CODE}. `
      + `Antwort: ${String(rohtext).slice(0, 200)}`,
  }
}

/**
 * Fragt das Orakel und gibt den Messwert zurueck — oder wirft.
 *
 * Fail-closed: eine Stoerung darf nie als Messwert durchgehen. Genau das
 * ist der Unterschied zwischen „gemessen und nichts gefunden" und „nicht
 * nachgesehen".
 */
export async function frageOrakel(url, key, sql) {
  // apiHeaders() statt eines fest verdrahteten `Authorization: Bearer`:
  // der Header gehoert nur an einen Legacy-JWT-Schluessel. Bei den neuen
  // `sb_secret_`-Schluesseln wuerde er den Aufruf scheitern lassen — und
  // zwar STILL, als „kein Zugriff". Genau die Blindheit, gegen die dieser
  // Helfer gebaut ist. Ein Regressionstest haelt die Regel fuer alle
  // Skripte fest.
  const res = await fetch(`${url}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(key, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: sql }),
  })
  const gedeutet = deuteOrakelAntwort(res.status, await res.text())
  if (!gedeutet.ok) throw new Error(gedeutet.grund)
  return gedeutet.wert
}

// ═══════════════════════════════════════════════════════════════════════
// Positivkontrolle — beweist, dass ueberhaupt gemessen werden konnte
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (Block 50): eine NEGATIVE Sicherheitspruefung besteht trivial,
// sobald der Schluessel abgewiesen wird.
//
//     const r = await post('_run_sql', …, ANON)
//     pruefe('anon_zu', r.status >= 400)      // 401 ist auch >= 400
//
// Mit einem kaputten anon-Schluessel meldet so ein Lauf „anon abgewiesen"
// und faerbt sich gruen — ohne je einen Riegel geprueft zu haben. Genau
// so verhielten sich verify-security-p0.mjs,
// verify-phase2-3-4-stabilisierung.mjs und
// verify-sql-exec-abgesichert.mjs.
//
// Die Positivkontrolle fragt deshalb zuerst etwas ab, das anon DARF:
// `public.bundeslaender` traegt die Policy `bundeslaender_read` fuer die
// Rolle `anon` (live am 14.09.2026 aus pg_policies gelesen). Antwortet
// sie nicht mit 200, ist der Schluessel unbrauchbar — und jede folgende
// Verweigerung beweist nichts.

/** Tabelle mit anon-SELECT-Policy — die Probe, ob der Schluessel traegt. */
export const POSITIVKONTROLLE_TABELLE = 'bundeslaender'

/**
 * Traegt dieser anon-Schluessel ueberhaupt?
 *
 * @returns {Promise<{ok: true} | {ok: false, grund: string}>}
 */
export async function pruefeAnonErreichbar(url, anonKey) {
  if (!anonKey) {
    return { ok: false, grund: 'Kein oeffentlicher Schluessel gesetzt — es kann nichts geprueft werden.' }
  }
  const res = await fetch(
    `${url}/rest/v1/${POSITIVKONTROLLE_TABELLE}?select=*&limit=1`,
    { headers: apiHeaders(anonKey) },
  )
  if (res.status === 200) return { ok: true }
  return {
    ok: false,
    grund:
      `Positivkontrolle fehlgeschlagen: \`${POSITIVKONTROLLE_TABELLE}\` antwortet mit `
      + `HTTP ${res.status} statt 200. Der oeffentliche Schluessel traegt nicht — `
      + 'jede „anon wurde abgewiesen"-Feststellung dieses Laufs waere wertlos, '
      + 'weil sie auch ohne jeden Riegel zutraefe.',
  }
}
