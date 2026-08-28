#!/usr/bin/env node
/**
 * Track 11 — Live-Tatsachen zur Loeschkette (DSGVO Art. 17) und zur
 * Auskunft (Art. 15).
 *
 * Prueft NUR LESEND gegen die Produktionsdatenbank. Das Lese-Orakel
 * (`public._run_sql` + `RAISE EXCEPTION`) rollt seine Transaktion immer
 * zurueck — es kann per Konstruktion nichts schreiben und kein DDL
 * ausfuehren.
 *
 * Geprueft werden die Tatsachen, auf denen die Befunde des Tracks stehen:
 *
 *   A) Weich geloeschte Profile insgesamt — und wie viele davon die
 *      60-Tage-Frist ueberschritten haben. Jede ueberfaellige Zeile ist
 *      ein Beleg dafuer, dass die endgueltige Loeschung nicht laeuft.
 *   B) Ist der pg_cron-Job 'account-hard-delete-daily' eingeplant, und
 *      ist die GUC `app.settings.supabase_url` ueberhaupt gesetzt? Ohne
 *      sie baut der Job eine NULL-URL und der Aufruf verpufft.
 *   C) Welche Tabellen haengen per Fremdschluessel an auth.users bzw.
 *      public.profiles, und mit welcher ON-DELETE-Regel? Daraus folgt,
 *      was eine endgueltige Loeschung wirklich entfernt — und was als
 *      verwaiste personenbezogene Zeile stehen bleibt.
 *   D) Traegt `account_deletion_tokens` RLS, und wer darf sie lesen?
 *      Der Token reaktiviert ein geloeschtes Konto.
 *   E) Existiert jeder Eintrag des Loeschkatalogs live? Ein Eintrag auf
 *      eine Tabelle oder Spalte, die es nicht gibt, wuerde im Lauf still
 *      uebersprungen.
 *   F) Tragen die als `aufbewahren` entschiedenen Spalten wirklich
 *      ON DELETE SET NULL? Nur dann faellt der Personenbezug beim
 *      Loeschen von selbst weg. Der Abgleich laeuft in BEIDE Richtungen
 *      gegen die `blockiert`-Marken des Katalogs.
 *   G) Welche `action`-Werte laesst `mis_audit_log` zu? Davon haengt ab,
 *      ob ein Protokolleintrag ueberhaupt geschrieben werden kann.
 *   H) Haengt `organization_members` per CASCADE am Konto? Sonst
 *      blockiert die Mitgliedschaft die Loeschung.
 *
 * Aufruf:  node scripts/verify-loeschkette-live.mjs
 * Exit 0 = alle Pruefungen bestanden, Exit 1 = mindestens eine offen.
 */

import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

/** Lese-Orakel: Ergebnis kommt ueber die RAISE-Meldung zurueck. */
async function orakel(sql) {
  const wrapped =
    `DO $ORK$ DECLARE r text; BEGIN `
    + `SELECT coalesce(string_agg(z::text, chr(10)), '(leer)') INTO r FROM (${sql}) t(z); `
    + `RAISE EXCEPTION 'ORAKEL:%', r; END $ORK$;`
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: wrapped }),
  })
  const text = await res.text()
  let j = null
  try { j = JSON.parse(text) } catch { /* Fehlertexte sind nicht immer JSON */ }
  const msg = j?.message ?? text
  const i = msg.indexOf('ORAKEL:')
  if (i === -1) throw new Error(`Orakel unerwartet (HTTP ${res.status}): ${msg.slice(0, 600)}`)
  return msg.slice(i + 7).trim()
}

/**
 * Wie {@link orakel}, aber ein Rechtefehler ist kein Abbruch.
 *
 * Das Schema `cron` gehoert `postgres`; der Dienstschluessel hat darauf
 * keine USAGE. Eine nicht lesbare Tatsache ist nicht dasselbe wie eine
 * widerlegte — sie wird als solche gemeldet, nie als „in Ordnung".
 */
async function versuche(sql) {
  try {
    return { lesbar: true, wert: await orakel(sql) }
  } catch (err) {
    return { lesbar: false, wert: String(err.message).replace(/^Orakel unerwartet \(HTTP \d+\): /, '') }
  }
}

const ergebnisse = []
const pruefe = (id, ok, meldung) => ergebnisse.push({ id, ok, meldung })

console.log(`Loeschkette gegen ${new URL(URL_BASIS).host}\n`)

// ── A) Weich geloeschte Profile ────────────────────────────────
const weich = await orakel(
  `SELECT count(*) FILTER (WHERE deleted_at IS NOT NULL) || '|'
       || count(*) FILTER (WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '60 days')
   FROM public.profiles`)
const [weichGesamt, ueberfaellig] = weich.split('|').map(Number)
console.log(`A) weich geloescht: ${weichGesamt}, davon ueber 60 Tage alt: ${ueberfaellig}`)
pruefe('A_keine_ueberfaelligen', ueberfaellig === 0,
  ueberfaellig === 0
    ? `keine ueberfaellige Zeile (weich geloescht insgesamt: ${weichGesamt})`
    : `${ueberfaellig} Konten stehen laenger als 60 Tage auf deleted_at — die endgueltige Loeschung laeuft nicht`)

// ── B) pg_cron-Job und seine Voraussetzungen ───────────────────
const erweiterung = await orakel(
  `SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron')
          THEN 'vorhanden' ELSE 'fehlt' END`)
const job = await versuche(
  `SELECT CASE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname='account-hard-delete-daily')
          THEN 'eingeplant' ELSE 'nicht-eingeplant' END`)
const guc = await orakel(
  `SELECT coalesce(nullif(current_setting('app.settings.supabase_url', true), ''), '(nicht gesetzt)')`)
console.log(`B) pg_cron: ${erweiterung} | Job: ${job.lesbar ? job.wert : `nicht lesbar (${job.wert})`}`)
console.log(`   app.settings.supabase_url: ${guc}`)
pruefe('B_cron_erweiterung', erweiterung === 'vorhanden', `pg_cron-Erweiterung: ${erweiterung}`)
pruefe('B_cron_url_gesetzt', guc !== '(nicht gesetzt)',
  guc === '(nicht gesetzt)'
    ? 'app.settings.supabase_url ist NICHT gesetzt — der eingeplante Aufruf baut damit eine NULL-URL'
    : 'app.settings.supabase_url ist gesetzt')

// ── C) Was haengt an auth.users / profiles, und wie ────────────
// Die Edge Function loescht ausdruecklich nur neun Tabellen. Alles
// weitere haengt an der ON-DELETE-Regel des Fremdschluessels.
const fks = await orakel(
  `SELECT c.conrelid::regclass::text || '.' || a.attname || ' -> ' || c.confrelid::regclass::text
        || ' | ' || CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
                    WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END
   FROM pg_constraint c
   JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
   WHERE c.contype='f'
     AND c.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
     AND c.connamespace = 'public'::regnamespace
   ORDER BY 1`)
const zeilen = fks === '(leer)' ? [] : fks.split('\n')
const bleibend = zeilen.filter(z => / \| (NO ACTION|RESTRICT|SET NULL|SET DEFAULT)$/.test(z))
console.log(`C) ${zeilen.length} Fremdschluessel auf auth.users/profiles, davon ${bleibend.length} ohne CASCADE:`)
for (const z of bleibend) console.log(`     ${z}`)
pruefe('C_fks_erhoben', zeilen.length > 0, `${zeilen.length} Fremdschluessel gelesen`)

// ── D) account_deletion_tokens ─────────────────────────────────
const tokenRls = await orakel(
  `SELECT CASE WHEN c.relrowsecurity THEN 'rls-an' ELSE 'RLS-AUS' END
        || ' | policies=' || (SELECT count(*) FROM pg_policies p
                              WHERE p.schemaname='public' AND p.tablename='account_deletion_tokens')
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='account_deletion_tokens'`)
const tokenGrants = await orakel(
  `SELECT coalesce(string_agg(grantee || ':' || privilege_type, ', ' ORDER BY grantee, privilege_type), 'keine')
   FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='account_deletion_tokens'
     AND grantee IN ('anon','authenticated')`)
console.log(`D) account_deletion_tokens: ${tokenRls} | Grants anon/authenticated: ${tokenGrants}`)
pruefe('D_token_rls', tokenRls.startsWith('rls-an'), `account_deletion_tokens: ${tokenRls}`)
pruefe('D_token_kein_select', !/anon:SELECT|authenticated:SELECT/.test(tokenGrants),
  `Grants auf account_deletion_tokens: ${tokenGrants}`)

// ── E) Der Loeschkatalog gegen das Live-Schema ─────────────────
// Ein Eintrag auf eine Tabelle oder Spalte, die es nicht gibt, wuerde im
// Lauf still uebersprungen. Hier faellt er auf.
const KATALOG = JSON.parse(
  (await import('node:fs')).readFileSync(new URL('./loeschkatalog-spalten.json', import.meta.url), 'utf8'))
const paare = KATALOG.map(e => `('${e.tabelle}','${e.spalte}')`).join(',')
const fehlend = await orakel(
  `SELECT k.t || '.' || k.s
   FROM (VALUES ${paare}) AS k(t, s)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
     WHERE c.table_schema='public' AND c.table_name = k.t AND c.column_name = k.s)`)
console.log(`E) Loeschkatalog: ${KATALOG.length} Eintraege, nicht im Schema: ${fehlend === '(leer)' ? 'keine' : fehlend.replace(/\n/g, ', ')}`)
pruefe('E_katalog_vollstaendig', fehlend === '(leer)',
  fehlend === '(leer)' ? 'jeder Katalogeintrag existiert live' : `nicht im Schema: ${fehlend.replace(/\n/g, ', ')}`)

// ── F) Tragen die 'aufbewahren'-Spalten wirklich SET NULL? ─────
// Nur dann faellt der Personenbezug beim Loeschen von selbst weg. Steht
// dort NO ACTION, blockiert die Zeile die Loeschung.
const behalten = KATALOG.filter(e => e.entscheidung === 'aufbewahren')
const paareB = behalten.map(e => `('${e.tabelle}','${e.spalte}')`).join(',')
const ohneSetNull = await orakel(
  `SELECT k.t || '.' || k.s || ' | ' || coalesce((
     SELECT CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END
     FROM pg_constraint c
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype='f' AND c.conrelid = ('public.' || k.t)::regclass AND a.attname = k.s
     LIMIT 1), 'kein Fremdschluessel')
   FROM (VALUES ${paareB}) AS k(t, s)
   WHERE coalesce((
     SELECT c.confdeltype FROM pg_constraint c
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype='f' AND c.conrelid = ('public.' || k.t)::regclass AND a.attname = k.s
     LIMIT 1), 'x') <> 'n'`)
console.log(`F) 'aufbewahren' ohne SET NULL: ${ohneSetNull === '(leer)' ? 'keine' : ''}`)
if (ohneSetNull !== '(leer)') for (const z of ohneSetNull.split('\n')) console.log(`     ${z}`)

// Zwei-Wege-Abgleich: die im Katalog gesetzten `blockiert`-Marken muessen
// GENAU den live blockierenden Spalten entsprechen. Eine fehlende Marke
// heisst, der Lauf startet und bricht mitten in der Loeschung ab; eine
// ueberfluessige heisst, er verweigert eine Loeschung, die laengst ginge.
const livBlocker = new Set(
  ohneSetNull === '(leer)' ? [] : ohneSetNull.split('\n').map(z => z.split(' | ')[0].trim()))
const markiert = new Set(KATALOG.filter(e => e.blockiert).map(e => `${e.tabelle}.${e.spalte}`))
const nurLive = [...livBlocker].filter(x => !markiert.has(x))
const nurKatalog = [...markiert].filter(x => !livBlocker.has(x))
pruefe('F_blockiert_marken_stimmen', nurLive.length === 0 && nurKatalog.length === 0,
  nurLive.length === 0 && nurKatalog.length === 0
    ? `${markiert.size} blockierende Spalten, Katalog und Live-Schema decken sich`
    : `nur live: [${nurLive.join(', ')}] — nur im Katalog: [${nurKatalog.join(', ')}]`)

// ── G) Welche action-Werte laesst mis_audit_log zu? ────────────
// Die TS-Union in lib/audit-log.ts ist als „synchron mit DB-CHECK"
// beschrieben. Ob es diesen CHECK live ueberhaupt gibt, entscheidet, ob
// ein neuer Wert einfach durchgeht oder den Insert scheitern laesst.
const actionCheck = await orakel(
  `SELECT coalesce((
     SELECT string_agg(pg_get_constraintdef(c.oid), ' | ')
     FROM pg_constraint c
     WHERE c.conrelid = 'public.mis_audit_log'::regclass AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%action%'), 'kein CHECK auf action')`)
console.log(`G) mis_audit_log.action: ${actionCheck.slice(0, 300)}`)
pruefe('G_action_check_gelesen', true, `mis_audit_log.action — ${actionCheck === 'kein CHECK auf action' ? 'kein CHECK' : 'CHECK vorhanden'}`)

// ── H) organization_members: haengt der Zugang am Konto? ───────
// Die Mitgliedschaft steht nicht im Katalog — sie muss per CASCADE mit
// dem Konto verschwinden, sonst blockiert sie die Loeschung.
const mitglied = await orakel(
  `SELECT a.attname || ' | ' || CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
          WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END
   FROM pg_constraint c
   JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
   WHERE c.contype='f' AND c.conrelid = 'public.organization_members'::regclass
     AND c.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)`)
console.log(`H) organization_members: ${mitglied.replace(/\n/g, ', ')}`)
pruefe('H_mitgliedschaft_cascade', /CASCADE/.test(mitglied),
  `organization_members -> ${mitglied.replace(/\n/g, ', ')}`)

// ── Ergebnis ───────────────────────────────────────────────────
console.log('')
for (const e of ergebnisse) console.log(`  ${e.ok ? ' OK ' : 'FEHL'}  ${e.id.padEnd(26)} ${e.meldung}`)
const bestanden = ergebnisse.filter(e => e.ok).length
console.log(`\n${bestanden}/${ergebnisse.length} bestanden`)
process.exit(bestanden === ergebnisse.length ? 0 : 1)
