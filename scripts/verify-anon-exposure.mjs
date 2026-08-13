#!/usr/bin/env node
/**
 * Regressionswaechter: Was kann ein UNAUTHENTIFIZIERTER Client lesen?
 *
 * Hintergrund: Views ohne `security_invoker` laufen mit den Rechten ihres
 * Eigentuemers und umgehen die RLS der Basistabellen vollstaendig. Dieser
 * Fehler ist zweimal aufgetreten (20260808150000 fuer zwei Views behoben,
 * danach von neuen Views wieder eingebaut). Ein Einzelfix reicht deshalb
 * nicht — dieser Lauf prueft den Zustand als Ganzes.
 *
 * Aufruf:  node scripts/verify-anon-exposure.mjs
 * Exit 1, sobald anon Zeilen aus einer nicht freigegebenen Relation liest.
 *
 * Liest ausschliesslich. Keine Schreiboperationen.
 */
import fs from 'node:fs';

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const env = read('.env') + '\n' + read('.env.local');
const get = (k) => process.env[k] || (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim();

const URL_ = get('NEXT_PUBLIC_SUPABASE_URL');
const ANON = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SR = get('SUPABASE_SERVICE_ROLE_KEY');

if (!URL_ || !ANON || !SR) {
  console.error('FEHLT: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

/**
 * Bewusst oeffentlich. Jede Aufnahme hier ist eine Sicherheitsentscheidung
 * und braucht eine Begruendung.
 */
const OEFFENTLICH_ERLAUBT = new Set([
  'state_settings_public',   // oeffentlicher Bundesland-Status (Kundenseite)
  'angels',                  // Marktplatz-Profile, keine Namen/Kontaktdaten
  'bundeslaender',           // Stammdaten
  'plz_bundesland_regeln',   // Stammdaten (PLZ-Zuordnung)
  'billing_leistungsarten',  // Leistungskatalog, keine Preise
  'content_blocks',          // redaktionelle Website-Inhalte
]);

const req = (t, key, extra = {}) =>
  fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', ...extra },
  });

const spec = await (await fetch(`${URL_}/rest/v1/`, {
  headers: { apikey: SR, Authorization: `Bearer ${SR}` },
})).json();

const relationen = Object.keys(spec.paths)
  .filter((p) => p !== '/' && !p.startsWith('/rpc/'))
  .map((p) => p.slice(1));

const lecks = [];
for (let i = 0; i < relationen.length; i += 10) {
  const batch = relationen.slice(i, i + 10);
  await Promise.all(
    batch.map(async (t) => {
      let r;
      try { r = await req(t, ANON); } catch { return; }
      if (r.status !== 200 && r.status !== 206) return; // abgewiesen = gut
      const body = await r.text();
      if (body === '[]') return;                        // keine Zeilen = gut
      if (OEFFENTLICH_ERLAUBT.has(t)) return;
      lecks.push(t);
    })
  );
}

if (lecks.length === 0) {
  console.log('OK — anon liest aus keiner nicht freigegebenen Relation Zeilen.');
  console.log(`Geprueft: ${relationen.length} Relationen, ${OEFFENTLICH_ERLAUBT.size} bewusst oeffentlich.`);
  process.exit(0);
}

console.error(`FEHLER — anon liest Zeilen aus ${lecks.length} nicht freigegebenen Relationen:\n`);
for (const t of lecks) console.error('  - ' + t);
console.error('\nUrsache ist fast immer eine View ohne `security_invoker = true`');
console.error('oder ein verbliebenes GRANT an anon. Siehe Migration 20260906000000.');
process.exit(1);
