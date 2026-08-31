#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * Die 24 Lesepolicies, live gemessen — nicht aus der Migration gelesen.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `__tests__/security/rls-lesepolicies.test.ts` prueft, dass Entscheidung
 * (lib/auth/rls-lesepolicies.ts) und Migration zusammenpassen. Das ist eine
 * Aussage ueber zwei Dateien im Repo — und sagt NICHTS darueber, ob in der
 * Datenbank irgendetwas davon steht. Genau diese Verwechslung hat hier
 * schon zweimal zu falschen „ist live"-Meldungen gefuehrt (Projekt-Memory:
 * „Pruefung driftet vom Gegenstand weg").
 *
 * Dieses Skript fragt deshalb die Datenbank selbst, in fuenf Stufen:
 *
 *   A) STEHT SIE?      Traegt die Tabelle live eine Policy `rk_<t>_lesen`
 *                      mit genau dem vorgesehenen Recht, FOR SELECT, TO
 *                      authenticated, mit Mandantenbindung?
 *   B) ENTSCHEIDET SIE RICHTIG?
 *                      `darf('<recht>')` wird unter jeder der drei
 *                      Verwaltungsrollen ausgewertet. Ergebnis muss der
 *                      ROLLEN_MATRIX entsprechen.
 *   C) SIEHT MAN WAS?  Fuer jede Tabelle mit Bestand: Zeilenzahl unter
 *                      Impersonation. Die vorgesehene Rolle muss Zeilen
 *                      sehen, die ausgeschlossene keine. Leere Tabellen
 *                      werden als „nicht messbar" ausgewiesen und NICHT
 *                      als bestanden gezaehlt.
 *   D) MANDANTENGRENZE Wo es Zeilen in mehr als einer Organisation gibt:
 *                      die berechtigte Rolle darf hoechstens die des
 *                      eigenen Mandanten sehen.
 *   E) ANON            Gegenprobe von aussen mit dem oeffentlichen
 *                      Schluessel: 0 Zeilen auf allen 24 Tabellen.
 *   F) NUR LESEN       Keine `rk_`-Policy darf etwas anderes als SELECT
 *                      erlauben.
 *
 * ── WIE IMPERSONIERT WIRD ─────────────────────────────────────────────
 * Wie in scripts/audit-rls-rollen.mjs: `SET LOCAL ROLE authenticated` plus
 * `set_config('request.jwt.claims', …)`. Das ist derselbe Weg, den
 * PostgREST geht — die Auswertung ist Zeichen fuer Zeichen dieselbe wie
 * bei einer echten Anfrage aus dem Browser.
 *
 * Live gibt es KEIN Konto mit pdl/qm/buchhaltung. Das Skript setzt einem
 * echten Konto die Rolle INNERHALB der Transaktion und nimmt sie mit dem
 * Rollback wieder weg: das Lese-Orakel `public._run_sql` endet immer mit
 * RAISE EXCEPTION, es bleibt nichts stehen.
 *
 * Aufruf:  npm run verify:rls-lesepolicies
 * Exit 0 = alles wie vorgesehen, 1 = mindestens eine Abweichung.
 */

import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'
import { RLS_LESEPOLICIES, policyName, rollenMitLeserecht } from '../lib/auth/rls-lesepolicies.ts'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
const ANON = envWert('NEXT_PUBLIC_SUPABASE_ANON_KEY')

if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Es wurde NICHTS geprueft — dieser Lauf ist kein Nachweis.')
  process.exit(2)
}

const ROLLEN = ['pdl', 'qm', 'buchhaltung']
const FELD = '<<|>>'
const SATZ = '<<||>>'

async function orakel(sql) {
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: sql }),
  })
  const text = await res.text()
  let j = null
  try { j = JSON.parse(text) } catch { /* Fehlertexte sind nicht immer JSON */ }
  const msg = j?.message ?? text
  const i = msg.indexOf('ORAKEL:')
  if (i === -1) return { fehler: `HTTP ${res.status} ${msg.slice(0, 400)}` }
  return { text: msg.slice(i + 7).replace(/\\n/g, '\n').replace(/\\"/g, '"') }
}

function q(rumpf) {
  return `DO $ora$ DECLARE r text; BEGIN ${rumpf} RAISE EXCEPTION 'ORAKEL:%', r; END $ora$;`
}

const befunde = []
const befund = (schwere, id, text) => befunde.push({ schwere, id, text })

const TABELLEN = RLS_LESEPOLICIES.map(p => p.tabelle)
const liste = TABELLEN.map(t => `'${t}'`).join(',')

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' LESEPOLICIES DER VERWALTUNGSROLLEN — live gemessen')
console.log(` ${new Date().toISOString()}`)
console.log('═══════════════════════════════════════════════════════════════════')
console.log()

// ── Vorlauf ────────────────────────────────────────────────────────────
const vorlauf = await orakel(q(`
  SELECT (SELECT id::text FROM public.profiles WHERE role='kunde' AND deleted_at IS NULL ORDER BY id LIMIT 1)
      || '${FELD}' || (SELECT count(*)::text FROM public.organizations)
  INTO r;`))
if (vorlauf.fehler) { console.error(vorlauf.fehler); process.exit(2) }
const [TESTKONTO, ORG_ANZAHL] = vorlauf.text.split(FELD)
if (!TESTKONTO) { console.error('Kein Testkonto gefunden.'); process.exit(2) }
console.log(`Testkonto (Rolle nur innerhalb der Transaktion): ${TESTKONTO}`)
console.log(`Organisationen:                                 ${ORG_ANZAHL}`)
console.log()

// ── A) Steht die Policy live? ──────────────────────────────────────────
console.log('── A) Steht die Policy? ────────────────────────────────────────────')
const polRes = await orakel(q(`
  SELECT coalesce(string_agg(
           tablename || '${FELD}' || policyname || '${FELD}' || cmd || '${FELD}' ||
           coalesce(array_to_string(roles, '+'), '') || '${FELD}' ||
           replace(coalesce(qual, ''), chr(10), ' '), '${SATZ}'), '')
    INTO r FROM pg_policies
   WHERE schemaname='public' AND tablename IN (${liste}) AND policyname LIKE 'rk\\_%';`))
if (polRes.fehler) { console.error(polRes.fehler); process.exit(2) }

const gefunden = new Map()
if (polRes.text.trim()) {
  for (const z of polRes.text.split(SATZ)) {
    const [tab, name, cmd, rollen, qual] = z.split(FELD)
    gefunden.set(tab, { name, cmd, rollen, qual })
  }
}

let stehen = 0
for (const p of RLS_LESEPOLICIES) {
  const g = gefunden.get(p.tabelle)
  if (!g) {
    befund('HOCH', `A-${p.tabelle}`,
      `${p.tabelle}: ${policyName(p.tabelle)} steht live NICHT. Die Migration `
      + '20261022000000 ist nicht angewendet.')
    continue
  }
  const maengel = []
  if (g.name !== policyName(p.tabelle)) maengel.push(`heisst ${g.name}`)
  if (g.cmd !== 'SELECT') maengel.push(`cmd=${g.cmd} statt SELECT`)
  if (g.rollen !== 'authenticated') maengel.push(`TO ${g.rollen} statt authenticated`)
  if (!g.qual.includes(`darf('${p.recht}'`)) maengel.push(`wertet nicht darf('${p.recht}') aus`)
  if (!g.qual.includes('current_org_id()')) maengel.push('ohne Mandantenbindung')
  if (maengel.length > 0) {
    befund('HOCH', `A-${p.tabelle}`, `${p.tabelle}: Policy weicht ab — ${maengel.join('; ')}`)
  } else {
    stehen++
  }
}
console.log(`   ${stehen} von ${RLS_LESEPOLICIES.length} Policies stehen wie vorgesehen.`)
if (stehen === 0) {
  console.log('   ⚠  KEINE steht. Alles Folgende misst den Zustand VOR der Migration.')
}
console.log()

// ── B) Entscheidet darf() unter der Rolle richtig? ─────────────────────
console.log('── B) Entscheidet darf() unter der Rolle richtig? ──────────────────')
const rechte = [...new Set(RLS_LESEPOLICIES.map(p => p.recht))]
for (const rolle of ROLLEN) {
  const ausdruck = rechte
    .map(re => `'${re}=' || public.darf('${re}')::text`)
    .join(" || ',' || ")
  const res = await orakel(`DO $ora$ DECLARE r text; alt text; BEGIN
    alt := current_user;
    -- Erst die Anspruchsdaten leeren, DANN die Rolle setzen. Ein Trigger
    -- auf profiles.role weist die Selbstbefoerderung sonst ab
    -- („Rollenwechsel nicht erlaubt") — er prueft den Aufrufer ueber
    -- auth.uid(), und das liest genau diesen GUC.
    PERFORM set_config('request.jwt.claims', '', true);
    UPDATE public.profiles SET role='${rolle}' WHERE id='${TESTKONTO}'::uuid;
    PERFORM set_config('request.jwt.claims', '{"sub":"${TESTKONTO}","role":"authenticated"}', true);
    SET LOCAL ROLE authenticated;
    SELECT ${ausdruck} INTO r;
    EXECUTE format('SET LOCAL ROLE %I', alt);
    RAISE EXCEPTION 'ORAKEL:%', r; END $ora$;`)
  if (res.fehler) { befund('HOCH', `B-${rolle}`, `darf() nicht messbar: ${res.fehler}`); continue }
  const gemessen = Object.fromEntries(res.text.split(',').map(s => s.split('=')))
  const abweichungen = []
  for (const re of rechte) {
    const soll = rollenMitLeserecht(re).includes(rolle)
    const ist = gemessen[re] === 'true'
    if (soll !== ist) abweichungen.push(`${re}: soll=${soll} ist=${ist}`)
  }
  if (abweichungen.length > 0) {
    befund('HOCH', `B-${rolle}`,
      `darf() weicht von ROLLEN_MATRIX ab — ${abweichungen.join(', ')}`)
  }
  const erlaubt = rechte.filter(re => gemessen[re] === 'true')
  console.log(`   ${rolle.padEnd(12)} darf lesen: ${erlaubt.join(', ') || '(nichts davon)'}`)
}
console.log()

// ── C/D) Bestand, Sichtbarkeit und Mandantengrenze ─────────────────────
console.log('── C) Sichtbarkeit und D) Mandantengrenze ──────────────────────────')
const bestandRes = await orakel(q(`
  SELECT coalesce(string_agg(x, '${SATZ}'), '') INTO r FROM (
    ${TABELLEN.map(t => `SELECT '${t}${FELD}' || count(*)::text || '${FELD}'
        || count(DISTINCT organization_id)::text AS x FROM public.${t}`).join(' UNION ALL ')}
  ) s;`))
if (bestandRes.fehler) { console.error(bestandRes.fehler); process.exit(2) }
const bestand = new Map()
for (const z of bestandRes.text.split(SATZ)) {
  const [t, n, orgs] = z.split(FELD)
  bestand.set(t, { zeilen: Number(n), orgs: Number(orgs) })
}

const messbar = TABELLEN.filter(t => bestand.get(t).zeilen > 0)
const leer = TABELLEN.filter(t => bestand.get(t).zeilen === 0)
console.log(`   messbar (Bestand > 0): ${messbar.length}   leer (nicht messbar): ${leer.length}`)
if (leer.length > 0) console.log(`   leer: ${leer.join(', ')}`)

const sicht = new Map() // rolle -> {tabelle: zahl}
for (const rolle of ROLLEN) {
  if (messbar.length === 0) break
  const ausdruck = messbar
    .map(t => `'${t}=' || (SELECT count(*) FROM public.${t})::text`)
    .join(" || ',' || ")
  const res = await orakel(`DO $ora$ DECLARE r text; alt text; BEGIN
    alt := current_user;
    -- Erst die Anspruchsdaten leeren, DANN die Rolle setzen. Ein Trigger
    -- auf profiles.role weist die Selbstbefoerderung sonst ab
    -- („Rollenwechsel nicht erlaubt") — er prueft den Aufrufer ueber
    -- auth.uid(), und das liest genau diesen GUC.
    PERFORM set_config('request.jwt.claims', '', true);
    UPDATE public.profiles SET role='${rolle}' WHERE id='${TESTKONTO}'::uuid;
    PERFORM set_config('request.jwt.claims', '{"sub":"${TESTKONTO}","role":"authenticated"}', true);
    SET LOCAL ROLE authenticated;
    SELECT ${ausdruck} INTO r;
    EXECUTE format('SET LOCAL ROLE %I', alt);
    RAISE EXCEPTION 'ORAKEL:%', r; END $ora$;`)
  if (res.fehler) { befund('HOCH', `C-${rolle}`, `Sichtbarkeit nicht messbar: ${res.fehler}`); continue }
  sicht.set(rolle, Object.fromEntries(res.text.split(',').map(s => [s.split('=')[0], Number(s.split('=')[1])])))
}

for (const rolle of ROLLEN) {
  const s = sicht.get(rolle)
  if (!s) continue
  const sollSehen = []
  const sollBlind = []
  for (const t of messbar) {
    const p = RLS_LESEPOLICIES.find(x => x.tabelle === t)
    const darf = rollenMitLeserecht(p.recht).includes(rolle)
    const zahl = s[t] ?? 0
    if (darf && zahl === 0) sollSehen.push(t)
    if (!darf && zahl > 0) sollBlind.push(`${t}(${zahl})`)
  }
  const sichtbar = messbar.filter(t => (s[t] ?? 0) > 0)
  console.log(`   ${rolle.padEnd(12)} sieht Zeilen in: ${sichtbar.join(', ') || '(nichts)'}`)
  if (sollBlind.length > 0) {
    befund('HOCH', `C-${rolle}-zuviel`,
      `${rolle} sieht Zeilen in Tabellen ohne das noetige Recht: ${sollBlind.join(', ')}`)
  }
  if (sollSehen.length > 0 && stehen > 0) {
    befund('MITTEL', `C-${rolle}-blind`,
      `${rolle} traegt das Recht, sieht aber trotz Bestand nichts in: ${sollSehen.join(', ')}`)
  }
  // D) Mandantengrenze: nie mehr als der eigene Mandant fuehrt.
  for (const t of messbar) {
    const b = bestand.get(t)
    if (b.orgs <= 1) continue
    if ((s[t] ?? 0) >= b.zeilen) {
      befund('HOCH', `D-${rolle}-${t}`,
        `${rolle} sieht in ${t} alle ${b.zeilen} Zeilen aus ${b.orgs} Organisationen — `
        + 'die Mandantengrenze greift dort nicht.')
    }
  }
}
const mehrOrg = messbar.filter(t => bestand.get(t).orgs > 1)
console.log(`   Tabellen mit Bestand in mehr als einer Organisation: `
  + `${mehrOrg.join(', ') || '(keine — D nicht messbar)'}`)
console.log()

// ── E) Gegenprobe von aussen ───────────────────────────────────────────
console.log('── E) Gegenprobe mit dem oeffentlichen Schluessel ───────────────────')
if (!ANON) {
  befund('MITTEL', 'E', 'NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt — E wurde NICHT geprueft.')
  console.log('   ⏭  uebersprungen (kein anon-Schluessel).')
} else {
  let offen = 0
  for (const t of TABELLEN) {
    const res = await fetch(`${URL_BASIS}/rest/v1/${t}?select=*&limit=1`, {
      // apiHeaders und nicht von Hand: die neuen publishable-Schluessel
      // sind keine JWTs und werden als `Bearer` mit „Invalid JWT" abgewiesen.
      headers: apiHeaders(ANON),
    })
    const txt = await res.text()
    if (res.ok && txt.trim() !== '[]') {
      offen++
      befund('HOCH', `E-${t}`, `${t} gibt dem oeffentlichen Schluessel Zeilen heraus.`)
    }
  }
  console.log(`   ${TABELLEN.length} Tabellen angefragt, ${offen} geben Zeilen heraus.`)
}
console.log()

// ── F) Nur lesen ───────────────────────────────────────────────────────
console.log('── F) Keine rk_-Policy erlaubt mehr als SELECT ──────────────────────')
// Nur die Policies DIESER Migration. Das Schema fuehrt schon laenger ein
// Paar `rk_<tabelle>_lesen` / `rk_<tabelle>_schreiben`; die
// Schreib-Haelfte ist dort FOR ALL und ausdruecklich so gewollt. Eine
// Suche ueber alle `rk_`-Policies haette 27 davon als Befund gemeldet —
// ein Fehlalarm, der die echte Frage zudeckt: ob eine der 24 NEUEN
// Policies mehr kann als lesen.
const schreibRes = await orakel(q(`
  SELECT coalesce(string_agg(tablename || '/' || policyname || '/' || cmd, ', '), '')
    INTO r FROM pg_policies
   WHERE schemaname='public' AND cmd <> 'SELECT'
     AND policyname IN (${RLS_LESEPOLICIES.map(p => `'${policyName(p.tabelle)}'`).join(',')});`))
if (schreibRes.fehler) {
  befund('MITTEL', 'F', `nicht messbar: ${schreibRes.fehler}`)
} else if (schreibRes.text.trim()) {
  befund('HOCH', 'F', `rk_-Policies mit Schreibwirkung: ${schreibRes.text}`)
  console.log(`   ❌ ${schreibRes.text}`)
} else {
  console.log('   Keine. Alle rk_-Policies sind FOR SELECT.')
}
console.log()

// ── Ergebnis ───────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════════')
if (befunde.length === 0) {
  console.log(` ✅ ${stehen}/${RLS_LESEPOLICIES.length} Policies live und wie vorgesehen.`)
  console.log('═══════════════════════════════════════════════════════════════════')
  process.exit(0)
}
console.log(` ${befunde.length} BEFUND(E):`)
for (const b of befunde) console.log(`   [${b.schwere}] ${b.id}  ${b.text}`)
console.log('═══════════════════════════════════════════════════════════════════')
process.exit(1)
