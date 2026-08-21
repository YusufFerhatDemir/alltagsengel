#!/usr/bin/env node
/**
 * Rauchtest fuer die neuen Supabase-API-Keys (`sb_publishable_…` / `sb_secret_…`).
 *
 * WOFUER: Bevor in Vercel von den Legacy-Keys auf die neuen umgestellt wird,
 * muss belegt sein, dass die neuen Keys auf diesem Projekt tatsaechlich
 * funktionieren — und zwar in genau den Aufrufformen, die der Code benutzt.
 * Die Supabase-Doku nennt eine Bruchstelle, die man sonst erst im
 * Wartungsfenster findet:
 *
 *   „You can't send a publishable or secret key in the Authorization: Bearer …
 *    header. Send it on the apikey header instead."
 *
 * `@supabase/supabase-js` setzt ohne aktive Session aber genau diesen Header
 * (SupabaseClient: `access_token ?? supabaseKey`). Ob die API das akzeptiert,
 * weil apikey und Authorization identisch sind, entscheidet dieser Lauf —
 * geraten wird hier nichts.
 *
 * Aufruf:
 *   NEXT_PUBLIC_SUPABASE_URL=… \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_… \
 *   node scripts/verify-publishable-key.mjs
 *
 * Exit 0 = neuer Key nutzbar · Exit 1 = Befund · Exit 2 = nicht ausfuehrbar.
 *
 * Der Lauf ist rein lesend und schreibt keine Key-Werte ins Protokoll —
 * nur Praefix und Laenge.
 */
import { createClient } from '@supabase/supabase-js'
import { envWert, istLegacyJwtKey } from './lib/supabase-keys.mjs'

const BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const PUB = envWert('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')

if (!BASIS) {
  console.error('NICHT AUSFUEHRBAR: NEXT_PUBLIC_SUPABASE_URL fehlt.')
  process.exit(2)
}
if (!PUB) {
  console.error(
    'NICHT AUSFUEHRBAR: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ist nicht gesetzt.\n' +
    'Der Key entsteht im Dashboard unter Settings > API Keys > „Publishable and secret API keys".\n' +
    'Ohne ihn ist dieser Test nicht durchfuehrbar — er gilt bewusst NICHT als bestanden.'
  )
  process.exit(2)
}
if (istLegacyJwtKey(PUB)) {
  console.error(
    'NICHT AUSFUEHRBAR: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY enthaelt ein Legacy-JWT (`eyJ…`).\n' +
    'Erwartet wird ein Key mit Praefix `sb_publishable_`.'
  )
  process.exit(2)
}

console.log(`Projekt: ${BASIS}`)
console.log(`Key:     ${PUB.slice(0, 16)}… (${PUB.length} Zeichen)\n`)

/**
 * Eine oeffentlich lesbare Relation. `bundeslaender` ist laut
 * scripts/verify-anon-exposure.mjs bewusst fuer anon freigegeben — ein
 * erfolgreicher Lesezugriff belegt hier also den Transportweg, nicht ein Leck.
 */
const TABELLE = 'bundeslaender'

const befunde = []
const pruefe = (name, ok, detail) => {
  befunde.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ── 1. apikey allein (die von Supabase dokumentierte Form) ────────────────
{
  const res = await fetch(`${BASIS}/rest/v1/${TABELLE}?select=id&limit=1`, {
    headers: { apikey: PUB },
  })
  pruefe('REST mit `apikey` allein', res.ok, `HTTP ${res.status}`)
}

// ── 2. apikey + identischer Authorization-Header ──────────────────────────
// Genau das schickt supabase-js ohne aktive Session. Schlaegt dieser Test
// fehl, waehrend Test 1 gruen ist, darf der Publishable-Key NICHT in
// `createClient()` gegeben werden, ohne den Header vorher zu ueberschreiben.
{
  const res = await fetch(`${BASIS}/rest/v1/${TABELLE}?select=id&limit=1`, {
    headers: { apikey: PUB, Authorization: `Bearer ${PUB}` },
  })
  pruefe(
    'REST mit `apikey` + identischem `Authorization: Bearer` (so ruft supabase-js)',
    res.ok,
    `HTTP ${res.status}${res.ok ? '' : ` — ${(await res.text()).slice(0, 160)}`}`
  )
}

// ── 3. Der echte Client-Pfad ──────────────────────────────────────────────
{
  const client = createClient(BASIS, PUB, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await client.from(TABELLE).select('id').limit(1)
  pruefe(
    '@supabase/supabase-js `createClient(url, publishableKey)`',
    !error,
    error ? `${error.code ?? ''} ${error.message}`.trim() : 'Lesezugriff ok'
  )
}

// ── 4. Auth-Endpunkt (Login-Weg der App) ──────────────────────────────────
// Ohne gueltige Zugangsdaten wird 400 erwartet — entscheidend ist, dass die
// Antwort NICHT 401 „Invalid API key" lautet.
{
  const res = await fetch(`${BASIS}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUB, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'rauchtest@invalid.invalid', password: 'x'.repeat(12) }),
  })
  const text = (await res.text()).slice(0, 200)
  const keyAbgelehnt = res.status === 401 || /invalid api key|invalid jwt/i.test(text)
  pruefe(
    'Auth-Endpunkt akzeptiert den Key',
    !keyAbgelehnt,
    `HTTP ${res.status}${keyAbgelehnt ? ` — ${text}` : ' (Anmeldung erwartungsgemaess abgelehnt, Key aber akzeptiert)'}`
  )
}

const fehler = befunde.filter(b => !b.ok)
console.log(`\n${befunde.length - fehler.length}/${befunde.length} bestanden`)
if (fehler.length) {
  console.error('\nBEFUND: Der Publishable-Key ist noch nicht ohne Anpassung einsetzbar:')
  for (const f of fehler) console.error(`  · ${f.name} — ${f.detail}`)
  process.exit(1)
}
console.log('Publishable-Key auf allen vier Wegen nutzbar.')
