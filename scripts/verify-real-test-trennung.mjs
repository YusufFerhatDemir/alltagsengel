#!/usr/bin/env node
/**
 * REAL ODER TEST — ist die Trennung an der Wirklichkeit belegt?
 *
 * ── DIE FRAGE ─────────────────────────────────────────────────────────────
 * Die Sicherheitsspur ist der Nachweis nach Art. 32 DSGVO. Sie taugt nur
 * dann dazu, wenn sich an jeder Zeile sagen laesst, ob ein MENSCH gehandelt
 * hat oder ob sie nachgestellt ist. Drei Behauptungen muessen dafuer
 * stimmen, und dieses Skript prueft sie einzeln gegen Produktion:
 *
 *   1. Eine echte Anmeldung wird als echt gefuehrt — is_test=false,
 *      source=real_user, provenienz=REAL_USER_LOGIN.
 *   2. Ein synthetisches Ereignis erscheint NIE als echte Anmeldung —
 *      weder in der Anzeige noch im Datenbankfilter.
 *   3. Was nicht erhoben wurde, steht als NULL da. Nicht geschaetzt,
 *      nicht mit „unbekannt" aufgefuellt, nicht erfunden.
 *
 * ── WORAN GEMESSEN WIRD: AN ECHTEN ANMELDUNGEN ────────────────────────────
 * Nicht an nachgestellten. In der Spur stehen bereits Zeilen aus
 * WIRKLICHEN Anmeldungen von Menschen — erkennbar an
 * `device_info.quelle = 'db_trigger'`, gesetzt vom Trigger auf
 * `auth.users.last_sign_in_at`. Diese Zeilen sind der beste verfuegbare
 * Pruefgegenstand: sie SIND das, was das Skript belegen soll, und nicht
 * eine Nachbildung davon.
 *
 * Zwei andere Wege wurden geprueft und verworfen:
 *
 *   Ein Testeintrag in security_audit_log — die Tabelle ist
 *     unveraenderlich (trg_security_audit_log_unveraenderlich), und eine
 *     erfundene Anmeldung darin waere eine Falschaussage in genau dem
 *     Protokoll, das im Ernstfall vorgelegt wird.
 *
 *   Ein UPDATE auf auth.users.last_sign_in_at in einer zurueckrollenden
 *     Transaktion — der technisch sauberste Ausloeser, aber nicht
 *     moeglich: der Dienstschluessel hat auf auth.users kein Recht
 *     (HTTP 403 „permission denied for table users", geprueft am
 *     31.08.2026). Das ist eine gute Sperre und bleibt, wie sie ist.
 *
 * Dieses Skript ist daher REIN LESEND. Es schreibt nichts, loest kein
 * Ereignis aus, verschickt keine Mail — RT8 misst das nach.
 *
 * Aufruf:  npm run verify:real-test
 * Exit 0 = alle Pruefungen bestanden, Exit 1 = mindestens eine offen.
 */

import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'
import {
  provenienzFuerZeile, istEchteNutzeraktivitaet, istTest, quelleFuer,
  herkunftFilterAusdruck, AUTH_TRIGGER_QUELLE,
} from '../lib/security/herkunft.ts'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Es wurde NICHTS geprueft — dieser Lauf ist kein Nachweis.')
  process.exit(2)
}

const FELD = '<<|>>'

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
  if (i === -1) throw new Error(`HTTP ${res.status}: ${msg.slice(0, 600)}`)
  return msg.slice(i + 7).replace(/\\n/g, '\n')
}

const wert = (ausdruck) =>
  orakel(`DO $o$ DECLARE r text; BEGIN SELECT (${ausdruck})::text INTO r; RAISE EXCEPTION 'ORAKEL:%', r; END $o$;`)

const ergebnisse = []
function pruefe(id, titel, bestanden, text) {
  ergebnisse.push({ id, bestanden })
  console.log(`\n[${id}] ${bestanden ? 'OK     ' : 'OFFEN  '} ${titel}`)
  for (const z of String(text).split('\n')) console.log(`  ${z}`)
}

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' REAL ODER TEST — ist die Trennung belegt?')
console.log(` ${new Date().toISOString()}`)
console.log('═══════════════════════════════════════════════════════════════════')

const zeilenVorher = Number(await wert('(SELECT count(*) FROM public.security_audit_log)'))
console.log(`\nBestand: ${zeilenVorher} Zeilen in security_audit_log.`)

// ── RT1) Steht der Weg ueberhaupt? ────────────────────────────────────
const triggerDef = await wert(`(SELECT coalesce(pg_get_triggerdef(oid),'FEHLT') FROM pg_trigger
  WHERE tgrelid='auth.users'::regclass AND tgname='trg_security_audit_auth_anmeldung' AND NOT tgisinternal)`)

pruefe('RT1', 'Der Auth-Trigger haengt an last_sign_in_at',
  /UPDATE OF last_sign_in_at/.test(triggerDef),
  `${triggerDef}\n`
  + 'Ohne ihn entstuende zu einer echten Anmeldung keine Zeile aus dem\n'
  + 'Auth-System, und jede Aussage ueber „echt" haetten allein die\n'
  + 'Anwendungszeilen zu tragen.')

// ── RT2–RT4) Die ECHTEN Anmeldungen im Bestand nachmessen ─────────────
const echteRoh = await orakel(`DO $o$ DECLARE r text; BEGIN
  SELECT coalesce(string_agg(
    id::text || '${FELD}' || event_type || '${FELD}'
      || coalesce(device_info::text,'null') || '${FELD}'
      || coalesce(metadata::text,'null') || '${FELD}'
      || coalesce(ip_address::text,'NULL') || '${FELD}'
      || coalesce(user_agent,'NULL') || '${FELD}'
      || coalesce(platform,'NULL') || '${FELD}'
      || coalesce(session_reference,'NULL') || '${FELD}'
      || coalesce(app_version,'NULL'), chr(10)), '')
    INTO r FROM public.security_audit_log
   WHERE device_info->>'quelle' = '${AUTH_TRIGGER_QUELLE}';
  RAISE EXCEPTION 'ORAKEL:%', r; END $o$;`)

const ausAuth = echteRoh.split('\n').filter(Boolean).map(z => {
  const [id, eventType, dev, meta, ip, ua, plattform, sess, appVersion] = z.split(FELD)
  return {
    id, eventType, ip, ua, plattform, sess, appVersion,
    deviceInfo: dev === 'null' ? null : JSON.parse(dev),
    metadata: meta === 'null' ? null : JSON.parse(meta),
  }
})

pruefe('RT2', 'Es gibt echte Anmeldungen aus dem Auth-System, und sie sind erkennbar',
  ausAuth.length > 0 && ausAuth.every(z => z.eventType === 'login_success'),
  `${ausAuth.length} Zeile(n) mit device_info.quelle='${AUTH_TRIGGER_QUELLE}'\n`
  + `Ereignistypen: ${[...new Set(ausAuth.map(z => z.eventType))].join(', ') || '(keine)'}\n`
  + 'Diese Zeilen stammen aus wirklichen Anmeldungen — geschrieben vom Trigger\n'
  + 'auf auth.users.last_sign_in_at, nicht von der Anwendung.')

const falschEingeordnet = ausAuth.filter(z => {
  const p = provenienzFuerZeile(z.metadata, z.deviceInfo, z.eventType)
  return !(p === 'REAL_USER_LOGIN' && istEchteNutzeraktivitaet(p)
    && istTest(p) === false && quelleFuer(p) === 'real_user')
})

pruefe('RT3', 'Jede echte Anmeldung wird als echt gefuehrt — is_test=false, source=real_user',
  ausAuth.length > 0 && falschEingeordnet.length === 0,
  ausAuth.slice(0, 3).map(z => {
    const p = provenienzFuerZeile(z.metadata, z.deviceInfo, z.eventType)
    return `${z.id.slice(0, 8)}… ⇒ provenienz=${p} | echt=${istEchteNutzeraktivitaet(p)} `
      + `| is_test=${istTest(p)} | source=${quelleFuer(p)}`
  }).join('\n')
  + `\n${ausAuth.length} Zeile(n) geprueft, ${falschEingeordnet.length} falsch eingeordnet\n`
  + 'Die Provenienz steht bei diesen Zeilen NICHT in der Zeile — sie wird beim\n'
  + 'Lesen aus device_info.quelle und dem Ereignistyp hergeleitet, mit demselben\n'
  + 'Code, den die Ansicht benutzt.')

const geraten = ausAuth.filter(z =>
  z.ip !== 'NULL' || z.ua !== 'NULL' || z.sess !== 'NULL' || z.appVersion !== 'NULL')

pruefe('RT4', 'Was nicht erhoben wurde, steht als NULL da — nichts wird geschaetzt',
  ausAuth.length > 0 && geraten.length === 0,
  `${ausAuth.length} Zeile(n) aus dem Auth-System, davon mit einem gefuellten Feld: ${geraten.length}\n`
  + `ip_address / user_agent / session_reference / app_version: `
  + `${geraten.length === 0 ? 'durchgehend NULL' : 'NICHT durchgehend NULL'}\n`
  + `platform: ${[...new Set(ausAuth.map(z => z.plattform))].join(', ')}  ← 'server' ist eine\n`
  + '  AUSSAGE, keine Schaetzung: die Zeile stammt aus der Datenbank, nicht aus\n'
  + '  einem Browser.\n'
  + 'Der Datenbank-Trigger sieht keinen HTTP-Aufruf. Er koennte IP und Geraet\n'
  + 'also nur raten — und tut es nicht.')

// ── RT5) Ein Testereignis ist NIE eine echte Anmeldung ────────────────
const testProv = provenienzFuerZeile({ provenienz: 'TEST_ALERT' }, null, 'login_success')
const adminProv = provenienzFuerZeile({ provenienz: 'ADMIN_TEST' }, null, 'login_success')
const synthProv = provenienzFuerZeile({ provenienz: 'SYNTHETIC_EVENT' }, null, 'login_success')

pruefe('RT5', 'Ein Testereignis erscheint NIE als echte Anmeldung',
  !istEchteNutzeraktivitaet(testProv) && !istEchteNutzeraktivitaet(adminProv)
    && !istEchteNutzeraktivitaet(synthProv)
    && istTest(testProv) && istTest(adminProv) && !istTest(synthProv),
  `TEST_ALERT      als login_success ⇒ echt=${istEchteNutzeraktivitaet(testProv)}, test=${istTest(testProv)}, source=${quelleFuer(testProv)}\n`
  + `ADMIN_TEST      als login_success ⇒ echt=${istEchteNutzeraktivitaet(adminProv)}, test=${istTest(adminProv)}, source=${quelleFuer(adminProv)}\n`
  + `SYNTHETIC_EVENT als login_success ⇒ echt=${istEchteNutzeraktivitaet(synthProv)}, test=${istTest(synthProv)}, source=${quelleFuer(synthProv)}\n`
  + 'Der Ereignistyp allein macht nichts echt. Selbst mit event_type=login_success\n'
  + 'bleibt eine gekennzeichnete Zeile nicht-echt — die Kennzeichnung schlaegt den\n'
  + 'Typ, nicht umgekehrt.')

// ── RT6) Sagt der Datenbankfilter dasselbe wie die Anzeige? ───────────
const alle = await orakel(`DO $o$ DECLARE r text; BEGIN
  SELECT coalesce(string_agg(
    id::text || '${FELD}' || event_type || '${FELD}'
      || coalesce(metadata->>'provenienz','-') || '${FELD}'
      || coalesce(device_info->>'quelle','-'), chr(10)), '')
    INTO r FROM public.security_audit_log;
  RAISE EXCEPTION 'ORAKEL:%', r; END $o$;`)

const bestand = alle.split('\n').filter(Boolean).map(z => {
  const [id, eventType, prov, quelle] = z.split(FELD)
  return {
    id, eventType,
    metadata: prov === '-' ? null : { provenienz: prov },
    deviceInfo: quelle === '-' ? null : { quelle },
  }
})

const echtLautAnzeige = new Set(
  bestand
    .filter(z => istEchteNutzeraktivitaet(provenienzFuerZeile(z.metadata, z.deviceInfo, z.eventType)))
    .map(z => z.id),
)

const filter = herkunftFilterAusdruck('echt')
const antwort = await fetch(
  `${URL_BASIS}/rest/v1/security_audit_log?select=id&or=(${encodeURIComponent(filter)})&limit=1000`,
  { headers: apiHeaders(SERVICE) },
)
const echtLautFilter = new Set((await antwort.json()).map(z => z.id))

const nurAnzeige = [...echtLautAnzeige].filter(id => !echtLautFilter.has(id))
const nurFilter = [...echtLautFilter].filter(id => !echtLautAnzeige.has(id))

pruefe('RT6', 'Der Datenbankfilter meint dieselben Zeilen wie die Anzeige',
  nurAnzeige.length === 0 && nurFilter.length === 0,
  `Bestand: ${bestand.length} Zeilen\n`
  + `echt laut Anzeige : ${echtLautAnzeige.size}\n`
  + `echt laut Filter  : ${echtLautFilter.size}\n`
  + `nur in der Anzeige: ${nurAnzeige.length}${nurAnzeige.length ? ' → ' + nurAnzeige.join(', ') : ''}\n`
  + `nur im Filter     : ${nurFilter.length}${nurFilter.length ? ' → ' + nurFilter.join(', ') : ''}\n`
  + 'Ein Filter, der etwas anderes sagt als die Liste, ist schlimmer als kein\n'
  + 'Filter: er erzeugt Vertrauen in eine Auswahl, die niemand geprueft hat.')

// ── RT6b) Der Testfilter trifft genau die Testereignisse ──────────────
//
// „Test" ist KEIN Gegenstueck zu „Real": in `nicht_echt` stecken auch
// SYNTHETIC_EVENT und alles Unbelegte. Der Schnellfilter „Test" der
// Admin-Ansicht muss deshalb eine eigene, engere Menge treffen.
const testLautAnzeige = new Set(
  bestand
    .filter(z => istTest(provenienzFuerZeile(z.metadata, z.deviceInfo, z.eventType)))
    .map(z => z.id),
)
const testAntwort = await fetch(
  `${URL_BASIS}/rest/v1/security_audit_log?select=id&or=(${encodeURIComponent(herkunftFilterAusdruck('test'))})&limit=1000`,
  { headers: apiHeaders(SERVICE) },
)
const testLautFilter = new Set((await testAntwort.json()).map(z => z.id))
const testNurAnzeige = [...testLautAnzeige].filter(id => !testLautFilter.has(id))
const testNurFilter = [...testLautFilter].filter(id => !testLautAnzeige.has(id))

pruefe('RT6b', 'Der Testfilter trifft genau die ausdruecklichen Testereignisse',
  testNurAnzeige.length === 0 && testNurFilter.length === 0
    && testLautFilter.size < echtLautFilter.size + testLautFilter.size + 1,
  `Test laut Anzeige: ${testLautAnzeige.size} | laut Filter: ${testLautFilter.size}\n`
  + `nur Anzeige: ${testNurAnzeige.length} | nur Filter: ${testNurFilter.length}\n`
  + `Zum Vergleich: „echt" trifft ${echtLautFilter.size}, der Bestand hat ${bestand.length}.\n`
  + 'Die Differenz sind Zeilen, ueber deren Herkunft nichts bekannt ist. Die\n'
  + 'gehoeren weder unter „Real" noch unter „Test" — und stehen in keiner der\n'
  + 'beiden Ansichten.')

// ── RT7) Keine erfundenen Werte im Bestand ────────────────────────────
const platzhalter = await wert(`(SELECT count(*) FROM public.security_audit_log
  WHERE lower(coalesce(user_agent,'')) IN ('unknown','unbekannt','n/a','-','none','null')
     OR (ip_address IS NOT NULL AND host(ip_address) IN ('0.0.0.0','127.0.0.1','::1'))
     OR lower(coalesce(platform,'')) IN ('unknown','n/a','-'))`)

pruefe('RT7', 'Kein Feld ist mit einem Platzhalter aufgefuellt',
  Number(platzhalter) === 0,
  `Zeilen mit Platzhalterwerten in ip/user_agent/platform: ${platzhalter} (erwartet 0)\n`
  + 'Geprueft auf: unknown, unbekannt, n/a, -, none, null, 0.0.0.0, 127.0.0.1, ::1.\n'
  + 'Ein aufgefuelltes Feld sieht aus wie eine Erhebung und ist eine Erfindung.\n'
  + "HINWEIS: platform='unbekannt' ist ausgenommen — das ist ein Wert des\n"
  + 'Vokabulars (lib/security/geraet.ts), also die ausdrueckliche Aussage „nicht\n'
  + 'bestimmbar", und steht nur dort, wo wirklich kein Hinweis vorlag.')

// ── RT8) Gegenprobe: der Lauf hat nichts geschrieben ──────────────────
const zeilenNachher = Number(await wert('(SELECT count(*) FROM public.security_audit_log)'))
pruefe('RT8', 'Der Lauf hat die Spur nicht veraendert',
  zeilenNachher === zeilenVorher,
  `vorher: ${zeilenVorher} | nachher: ${zeilenNachher}\n`
  + 'Dieses Skript ist rein lesend. Ohne diese Gegenprobe waere das eine\n'
  + 'Behauptung — und Behauptungen sind in diesem Projekt schon falsch gewesen.')

// ── Bericht: eine Anmeldung, wie viele Zeilen? ────────────────────────
const jeMinute = await wert(`(SELECT coalesce(string_agg(z, E'\\n' ORDER BY z), '(keine)') FROM (
  SELECT to_char(m,'MM-DD HH24:MI')||'  '||coalesce(mail,'-')||'  '||n::text
      ||' Zeilen ('||plattformen||')' AS z
    FROM (
      SELECT date_trunc('minute', created_at) AS m, user_email AS mail,
             count(*) AS n,
             string_agg(coalesce(platform,'-'), '+' ORDER BY platform) AS plattformen
        FROM public.security_audit_log
       WHERE event_type = 'login_success'
       GROUP BY date_trunc('minute', created_at), user_email
      HAVING count(*) > 1
    ) g) s)`)

console.log('\n── BERICHT: eine Anmeldung, wie viele Zeilen? ────────────────────')
console.log(jeMinute.split('\n').map(z => '  ' + z).join('\n'))
console.log('  Zwei Zeilen je Anmeldung sind KEIN Fehler: die eine kommt aus der')
console.log('  Anwendung (mit IP und Geraet), die andere aus dem Auth-System (ohne).')
console.log('  Wer Anmeldungen ZAEHLT, muss das wissen — sonst meldet eine Ansicht')
console.log('  die doppelte Zahl. Die Admin-Ansicht weist es deshalb aus.')

const offen = ergebnisse.filter(e => !e.bestanden)
console.log('\n═══════════════════════════════════════════════════════════════════')
console.log(` ${ergebnisse.length - offen.length} von ${ergebnisse.length} Pruefungen bestanden.`)
if (offen.length > 0) console.log(` OFFEN: ${offen.map(e => e.id).join(', ')}`)
console.log('═══════════════════════════════════════════════════════════════════')
process.exit(offen.length > 0 ? 1 : 0)
