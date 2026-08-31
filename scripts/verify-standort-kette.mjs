#!/usr/bin/env node
/**
 * Die Standortfreigabe gegen die PRODUKTIONSDATENBANK — geprueft INNERHALB
 * des Einwilligungsmodells.
 *
 * Die Frage, die dieses Skript beantwortet, ist nicht „funktioniert die
 * Erfassung", sondern:
 *
 *     KANN DER BETRIEB EINE ERFASSUNG ERZWINGEN, DIE NIEMAND ERLAUBT HAT?
 *
 * Sie wird an vier Stellen gestellt, weil es vier Wege gaebe:
 *
 *   S1  ueber die Datenbank      — Insert ohne Freigabe
 *   S2  ueber einen Moduswechsel — Punkt im falschen Modus
 *   S3  ueber die Anwendung      — gibt es einen Einschaltweg fuer die
 *                                  Verwaltung?
 *   S4  nachtraeglich            — laesst sich ein Punkt aendern?
 *
 * ── WARUM DIE SCHREIBVERSUCHE UNGEFAEHRLICH SIND ──────────────────────────
 *
 * S1, S2 und S4 versuchen WIRKLICH zu schreiben — eine Pruefung, die nur
 * den Triggerquelltext liest, belegt nicht, dass der Trigger auch haengt.
 * Der Versuch laeuft aber im Lese-Orakel `public._run_sql`, und das endet
 * IMMER mit RAISE EXCEPTION: die Transaktion wird in jedem Fall
 * zurueckgerollt, ob der Insert nun abgewiesen wurde oder durchging.
 * Es bleibt also auch dann keine Zeile stehen, wenn der Riegel fehlt —
 * und genau dann meldet das Skript ein Leck.
 *
 * Nur lesend im Ergebnis. Kein DDL, keine bleibende Aenderung.
 *
 * Aufruf:  npm run verify:standort
 * Exit 0 = alle Pruefungen bestanden, Exit 1 = mindestens eine offen.
 */

import { readFileSync } from 'node:fs'
import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'
import { MODI, erfasstStandort, brauchtBetriebssystemFreigabe } from '../lib/standort/modi.ts'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

async function orakel(sql) {
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      p: `DO $S$ DECLARE r text; BEGIN `
        + `SELECT coalesce(string_agg(z::text, chr(10)), '(leer)') INTO r FROM (${sql.replace(/\s+/g, ' ')}) t(z); `
        + `RAISE EXCEPTION 'STANDORT:%', r; END $S$;`,
    }),
  })
  return auslesen(await res.text(), res.status)
}

/**
 * Ein Schreibversuch. Der Insert steht in einem eigenen BEGIN/EXCEPTION —
 * so laesst sich UNTERSCHEIDEN, ob der Riegel gegriffen hat oder ob der
 * Insert durchging. Die aeussere RAISE rollt beides zurueck.
 */
async function schreibversuch(insertSql) {
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      p: `DO $S$ DECLARE r text; BEGIN `
        + `BEGIN ${insertSql.replace(/\s+/g, ' ')} `
        + `r := 'DURCHGELASSEN'; `
        + `EXCEPTION WHEN others THEN r := 'ABGEWIESEN: ' || SQLERRM; END; `
        + `RAISE EXCEPTION 'STANDORT:%', r; END $S$;`,
    }),
  })
  return auslesen(await res.text(), res.status)
}

function auslesen(text, status) {
  const t = text.match(/STANDORT:([\s\S]*?)","/) || text.match(/STANDORT:([\s\S]*?)"\}/)
    || text.match(/STANDORT:([\s\S]*?)"/)
  if (t) return t[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
  return `(kein Treffer) HTTP ${status} ${text.slice(0, 300)}`
}

const ergebnisse = []
function pruefe(id, titel, bestanden, gemessen, erwartet) {
  ergebnisse.push({ id, bestanden })
  console.log(`\n[${id}] ${bestanden ? 'OK     ' : 'OFFEN  '} ${titel}`)
  if (erwartet) console.log(`  erwartet: ${erwartet}`)
  console.log(`  gemessen: ${String(gemessen).split('\n').join('\n            ')}`)
}
function bericht(id, titel, gemessen) {
  console.log(`\n[${id}] BERICHT  ${titel}`)
  console.log(`  ${String(gemessen).split('\n').join('\n  ')}`)
}

console.log('═══════════════════════════════════════════════════════════════')
console.log(' Standortfreigabe — Live-Pruefung im Einwilligungsmodell')
console.log('═══════════════════════════════════════════════════════════════')

// Ein echtes Konto OHNE Freigabe. Genau der Fall, um den es geht.
const probe = await orakel(
  `select p.id::text || '|' || coalesce(om.organization_id::text,'')
     from public.profiles p
     left join public.organization_members om on om.user_id = p.id
    where not exists (select 1 from public.location_sharing_settings s where s.user_id = p.id)
    limit 1`,
)
const [probeUser, probeOrg] = probe.includes('|') ? probe.trim().split('|') : [null, null]

// ── S1) Erfassung ohne jede Freigabe ──────────────────────────────────────
if (probeUser) {
  const org = probeOrg ? `'${probeOrg}'::uuid` : 'NULL'
  const s1 = await schreibversuch(
    `INSERT INTO public.location_updates
       (user_id, organization_id, latitude, longitude, timestamp_utc, erfasst_im_modus, device_info)
     VALUES ('${probeUser}'::uuid, ${org}, 50.1109, 8.6821, now(), 'always', '{}'::jsonb);`,
  )
  pruefe('S1', 'Ohne Freigabe entsteht KEIN Punkt — auch nicht mit dem Dienstschluessel',
    s1.startsWith('ABGEWIESEN'), s1,
    'ABGEWIESEN — der Trigger location_update_pruefe_freigabe muss greifen')

  // ── S2) Punkt in einem Modus, den die Freigabe nicht deckt ──────────────
  const s2 = await schreibversuch(
    `INSERT INTO public.location_updates
       (user_id, organization_id, latitude, longitude, timestamp_utc, erfasst_im_modus, device_info)
     VALUES ('${probeUser}'::uuid, ${org}, 50.1109, 8.6821, now(), 'during_service', '{}'::jsonb);`,
  )
  pruefe('S2', 'Auch der Einsatzmodus braucht eine Freigabe',
    s2.startsWith('ABGEWIESEN'), s2, 'ABGEWIESEN')
} else {
  pruefe('S1', 'Ohne Freigabe entsteht KEIN Punkt', false,
    'kein Konto ohne Freigabe gefunden — nicht pruefbar', 'ein Konto ohne Eintrag')
}

// ── S3) Gibt es einen Einschaltweg fuer die Verwaltung? ───────────────────
//
// Das ist der eigentliche Kern des Modells: die Freigabe ist eine
// Erklaerung der betroffenen Person, keine Einstellung des Betriebs. Ein
// POST/PUT/PATCH unter /api/admin/location waere ihr Bruch.
const admin = 'app/api/admin/location'
let adminSchreibend = []
try {
  const { readdirSync, statSync } = await import('node:fs')
  const suche = (pfad) => {
    for (const eintrag of readdirSync(pfad)) {
      const voll = `${pfad}/${eintrag}`
      if (statSync(voll).isDirectory()) suche(voll)
      else if (eintrag === 'route.ts') {
        const src = readFileSync(voll, 'utf8')
        const verben = ['POST', 'PUT', 'PATCH', 'DELETE']
          .filter(v => new RegExp(`export const ${v}\\b`).test(src))
        if (verben.length > 0) adminSchreibend.push(`${voll}: ${verben.join(', ')}`)
      }
    }
  }
  suche(admin)
} catch {
  adminSchreibend = ['(kein Verzeichnis app/api/admin/location)']
}
const nurLesend = adminSchreibend.length === 0 || adminSchreibend[0].startsWith('(kein')
pruefe('S3', 'Die Verwaltung hat KEINEN Weg, eine Freigabe einzuschalten',
  nurLesend,
  nurLesend
    ? 'unter app/api/admin/location gibt es nur lesende Handler'
    : `schreibende Handler gefunden:\n${adminSchreibend.join('\n')}`,
  'kein POST/PUT/PATCH/DELETE unter app/api/admin/location')

// ── S4) Ein gesetzter Punkt bleibt, wie er ist ────────────────────────────
const s4 = await schreibversuch(
  `UPDATE public.location_updates SET latitude = 0 WHERE id = (select id from public.location_updates limit 1);`,
)
const keinePunkte = await orakel('select count(*)::text from public.location_updates')
pruefe('S4', 'Standortpunkte sind unveraenderlich',
  s4.startsWith('ABGEWIESEN') || keinePunkte.trim() === '0',
  keinePunkte.trim() === '0'
    ? 'noch kein Punkt vorhanden — der Trigger ist damit nicht am Bestand belegbar, '
      + 'nur an seiner Existenz (siehe S5)'
    : s4,
  'ABGEWIESEN, oder es gibt noch keinen Punkt')

// ── S5) Haengen die Trigger ueberhaupt? ───────────────────────────────────
const trigger = await orakel(
  `select t.tgname || ' auf ' || c.relname || ' enabled=' || t.tgenabled::text
     from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal
      and c.relname in ('location_updates','location_sharing_settings')
    order by t.tgname`,
)
const noetig = [
  'trg_location_update_pruefe_freigabe',
  'trg_location_update_unveraenderlich',
  'trg_location_sharing_stempel',
]
pruefe('S5', 'Alle drei Riegel haengen live',
  noetig.every(n => trigger.includes(n)), trigger, noetig.join(', '))

// ── S6) Die Selbst-Abschaltung ist immer moeglich ─────────────────────────
const abschalten = await orakel(
  `select policyname || ' | ' || cmd || ' | roles=' || roles::text
     || ' | check=' || coalesce(with_check,'-')
     from pg_policies
    where tablename='location_sharing_settings'
      and policyname='standort_freigabe_selbst_abschalten'`,
)
pruefe('S6', 'Jede Person kann ihre Freigabe selbst abschalten — an der Route vorbei',
  abschalten.includes('standort_freigabe_selbst_abschalten'), abschalten,
  "Policy standort_freigabe_selbst_abschalten auf location_sharing_settings")

// ── S7) Die Modi des Codes und die des CHECK stimmen ueberein ─────────────
//
// Gezielt ueber den CONSTRAINT-NAMEN, nicht ueber „irgendeiner, in dem
// 'mode' vorkommt": die Tabelle traegt DREI CHECKs mit dem Wort, und der
// erstbeste war der falsche — die Pruefung meldete dadurch OFFEN, obwohl
// der Wertebereich stimmt.
const dbModi = await orakel(
  `select coalesce((select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.location_sharing_settings'::regclass
        and conname = 'location_sharing_settings_mode_check'),'(kein CHECK)')`,
)
const alleDrin = MODI.every(m => dbModi.includes(`'${m}'`))
pruefe('S7', 'Der Code kennt genau die Modi, die der CHECK erlaubt',
  alleDrin, `Code: ${MODI.join(', ')}\nDB:   ${dbModi}`,
  'jeder Modus aus lib/standort/modi.ts steht im CHECK')

// ── S10) Das Einwilligungsmodell steht als CHECK in der Tabelle ───────────
//
// Die WICHTIGSTE Pruefung dieses Skripts. `_eigene_freigabe` sagt: ein
// anderer Modus als 'off' ist nur zulaessig, wenn enabled_by_user wahr
// ist. Damit ist die Einwilligung keine Regel des Anwendungscodes mehr,
// sondern eine Bedingung der Tabelle — auch ein Insert mit dem
// Dienstschluessel, auch ein Skript, auch ein Versehen scheitert daran.
//
// `_os_freigabe` haelt dieselbe Linie fuer den Dauermodus: ohne
// Betriebssystem-Berechtigung kein 'always'.
const modell = await orakel(
  `select conname || ' :: ' || pg_get_constraintdef(oid)
     from pg_constraint
    where conrelid='public.location_sharing_settings'::regclass
      and conname in ('location_sharing_settings_eigene_freigabe',
                      'location_sharing_settings_os_freigabe')
    order by conname`,
)
pruefe('S10', 'Die Einwilligung ist eine Bedingung der TABELLE, nicht nur des Codes',
  modell.includes('eigene_freigabe') && modell.includes('os_freigabe'),
  modell,
  'location_sharing_settings_eigene_freigabe (mode<>off ⇒ enabled_by_user) '
  + 'UND location_sharing_settings_os_freigabe (always ⇒ os_permission_granted)')

// Gegenprobe mit einem echten Schreibversuch: eine Freigabe einschalten,
// ohne dass die Person sie selbst erteilt hat.
if (probeUser) {
  const org = probeOrg ? `'${probeOrg}'::uuid` : 'NULL'
  const s11 = await schreibversuch(
    `INSERT INTO public.location_sharing_settings
       (user_id, organization_id, mode, enabled_by_user, os_permission_granted)
     VALUES ('${probeUser}'::uuid, ${org}, 'always', false, true);`,
  )
  pruefe('S11', 'Eine Freigabe OHNE eigene Aktivierung laesst sich nicht eintragen',
    s11.startsWith('ABGEWIESEN'), s11,
    'ABGEWIESEN — sonst koennte der Betrieb die Erfassung von aussen einschalten')
}

// ── Berichte ──────────────────────────────────────────────────────────────
bericht('S8', 'Bestand',
  await orakel(
    `select 'freigaben=' || (select count(*)::text from public.location_sharing_settings)
         || ' | davon_aktiv=' || (select count(*)::text from public.location_sharing_settings
              where enabled_by_user and mode <> 'off')
         || ' | punkte=' || (select count(*)::text from public.location_updates)`,
  ))

bericht('S9', 'Das Modell in Worten',
  MODI.map(m =>
    `${m.padEnd(15)} erfasst=${erfasstStandort(m) ? 'ja ' : 'nein'} `
    + `braucht_OS_Freigabe=${brauchtBetriebssystemFreigabe(m) ? 'ja' : 'nein'}`,
  ).join('\n'))

const offen = ergebnisse.filter(e => !e.bestanden).length
console.log('\n───────────────────────────────────────────────────────────────')
console.log(` ${ergebnisse.length - offen} von ${ergebnisse.length} Pruefungen bestanden.`)
if (offen > 0) console.log(' Offene Punkte sind oben mit OFFEN markiert.')
console.log('───────────────────────────────────────────────────────────────')
process.exit(offen > 0 ? 1 : 0)
