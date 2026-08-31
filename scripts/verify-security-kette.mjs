#!/usr/bin/env node
/**
 * Die Sicherheitskette gegen die PRODUKTIONSDATENBANK:
 *
 *   Ereignis → Spur → Regel → Alarm → Mail → Zustellstatus → Wiederholung
 *
 * ── WAS DIESES SKRIPT BEWUSST NICHT TUT ───────────────────────────────────
 *
 * Es loest KEIN Ereignis aus. Die naheliegende Art, eine Alarmkette zu
 * pruefen, waere ein synthetischer Eintrag in security_audit_log — und
 * genau das ist hier verboten:
 *
 *   • Die Tabelle ist UNVERAENDERLICH (Trigger
 *     security_audit_log_unveraenderlich). Ein Testeintrag liesse sich
 *     nicht mehr entfernen.
 *   • Sie ist der Art.-32-Nachweis. Eine erfundene Anmeldung darin ist
 *     eine Falschaussage in einem Protokoll, das im Ernstfall vorgelegt
 *     wird.
 *   • Ein ausgeloester Alarm verschickt echte Post.
 *
 * Statt die Kette anzustossen, wird jedes Glied EINZELN an der Wirklichkeit
 * gemessen: der Bestand der Spur, die LIVE gelesene Ueberwachungsliste, die
 * echte Entscheidungsfunktion gegen diese Konfiguration, das
 * Wiederherstellungs-Register des laufenden Prozesses und der CHECK der
 * Zustellspur. Was am Ende offenbleibt — ob Resend die Mail tatsaechlich
 * annimmt —, sagt das Skript ausdruecklich, statt es zu behaupten.
 *
 * Nur lesend. Kein Schreibvorgang, kein DDL, kein Mailversand.
 *
 * Aufruf:  npm run verify:security-kette
 * Exit 0 = alle Pruefungen bestanden, Exit 1 = mindestens eine offen.
 */

import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'
import { meldetFuer } from '../lib/security/benachrichtigung.ts'
import { UEBERWACHUNGS_EREIGNISSE, EREIGNISSE } from '../lib/security/ereignisse.ts'
import { registrierteVorgaenge } from '../lib/notifications/wiederherstellung.ts'
import '../lib/notifications/vorgaenge/index.ts'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

/** Lese-Orakel. Rollt seine Transaktion immer zurueck (RAISE EXCEPTION). */
async function orakel(sql) {
  const res = await fetch(`${URL_BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      p: `DO $K$ DECLARE r text; BEGIN `
        + `SELECT coalesce(string_agg(z::text, chr(10)), '(leer)') INTO r FROM (${sql.replace(/\s+/g, ' ')}) t(z); `
        + `RAISE EXCEPTION 'KETTE:%', r; END $K$;`,
    }),
  })
  const text = await res.text()
  const t = text.match(/KETTE:([\s\S]*?)","/) || text.match(/KETTE:([\s\S]*?)"\}/) || text.match(/KETTE:([\s\S]*?)"/)
  if (t) return t[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
  return `(kein Treffer) HTTP ${res.status} ${text.slice(0, 300)}`
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
console.log(' Sicherheitskette — Live-Pruefung (nur lesend, kein Versand)')
console.log('═══════════════════════════════════════════════════════════════')

// ── 1) Ereignis → Spur ────────────────────────────────────────────────────
// Nicht „ist die Tabelle da", sondern „kommt dort etwas an". Eine leere
// Spur waere von einer nicht schreibenden Anwendung nicht zu unterscheiden.
const bestand = await orakel(
  `select 'zeilen=' || count(*)::text
     || ' | juengstes=' || coalesce(max(created_at)::text,'-')
     || ' | arten=' || coalesce((select count(distinct event_type)::text from public.security_audit_log),'0')
     from public.security_audit_log`,
)
pruefe('K1', 'Ereignisse erreichen die Sicherheitsspur',
  /zeilen=[1-9]/.test(bestand), bestand,
  'mindestens eine Zeile — sonst schreibt der Erfassungsweg nicht')

// ── 2) Die Ueberwachungsliste, live gelesen ───────────────────────────────
const wl = await orakel(
  `select w.user_id::text || '|' || w.aktiv::text || '|' || w.alle_ereignisse::text
     || '|' || w.ohne_sperrfrist::text || '|' || coalesce(w.melde_email,'(Konto-Adresse)')
     || '|' || coalesce(p.role,'?')
     from public.security_watchlist w
     left join public.profiles p on p.id = w.user_id
    where w.aktiv`,
)
const eintraege = wl === '(leer)' || wl.startsWith('(kein Treffer)')
  ? []
  : wl.split('\n').map((z) => {
      const [userId, aktiv, alle, ohneSperrfrist, melde, rolle] = z.trim().split('|')
      return {
        userId,
        aktiv: aktiv === 'true',
        alleEreignisse: alle === 'true',
        ohneSperrfrist: ohneSperrfrist === 'true',
        meldeEmail: melde,
        rolle,
      }
    })

pruefe('K2', 'Mindestens ein Konto wird ueberwacht',
  eintraege.length > 0,
  eintraege.length === 0
    ? 'keine aktive Ueberwachung — die Kette hat kein Ziel'
    : eintraege.map(e => `${e.userId} rolle=${e.rolle} alleEreignisse=${e.alleEreignisse} ohneSperrfrist=${e.ohneSperrfrist} melde_an=${e.meldeEmail}`).join('\n'),
  'ein aktiver Eintrag in security_watchlist')

// ── 3) Die REGEL gegen die LIVE-Konfiguration ─────────────────────────────
//
// Hier liegt der Kern: `meldetFuer` ist dieselbe reine Funktion, die im
// Betrieb entscheidet. Sie bekommt hier die Konfiguration, die WIRKLICH in
// der Datenbank steht — nicht eine ausgedachte. Damit ist die Aussage
// „bei einer Anmeldung dieses Kontos geht eine Mail raus" gemessen und
// nicht behauptet.
const PROBEN = [
  'login_success', 'login_failed', 'password_changed', 'email_change',
  'role_change', 'unknown_device', 'data_export', 'location_sharing_enabled',
]

if (eintraege.length > 0) {
  const e = eintraege[0]
  const lage = {
    privilegiert: ['admin', 'superadmin'].includes(e.rolle),
    ueberwachung: {
      aktiv: e.aktiv,
      alleEreignisse: e.alleEreignisse,
      ohneSperrfrist: e.ohneSperrfrist,
      meldeEmail: e.meldeEmail === '(Konto-Adresse)' ? null : e.meldeEmail,
    },
  }
  const zeilen = PROBEN.map((typ) => {
    const { melden, grund } = meldetFuer(typ, lage)
    return `${typ.padEnd(26)} ${melden ? 'MELDET  ' : 'still   '} ${grund}`
  })
  const gemeldet = PROBEN.filter(t => meldetFuer(t, lage).melden).length

  pruefe('K3', `Regel greift fuer das ueberwachte Konto (${e.userId.slice(0, 8)}…)`,
    gemeldet > 0, `${gemeldet} von ${PROBEN.length} Proben loesen aus\n${zeilen.join('\n')}`,
    'mindestens eine der Proben loest eine Meldung aus')

  // Gegenprobe: ein NICHT ueberwachtes, nicht privilegiertes Konto darf
  // gerade NICHT melden. Ohne diese Richtung waere K3 auch dann gruen,
  // wenn die Funktion immer „ja" sagte.
  const still = { privilegiert: false, ueberwachung: null }
  const faelschlich = PROBEN.filter(t => meldetFuer(t, still).melden)
  pruefe('K4', 'Gegenprobe: gewoehnliches Konto loest KEINEN Alarm aus',
    faelschlich.length === 0,
    faelschlich.length === 0
      ? 'keine der Proben meldet — die Regel unterscheidet wirklich'
      : `FEHLER: ${faelschlich.join(', ')} melden auch ohne Ueberwachung`,
    'keine Probe meldet')
} else {
  pruefe('K3', 'Regel greift fuer das ueberwachte Konto', false,
    'nicht pruefbar — kein aktiver Watchlist-Eintrag', 'siehe K2')
}

// ── 4) Der Meldesatz deckt die Anmeldung ab ───────────────────────────────
const fehlend = ['login_success', 'unknown_device', 'password_changed', 'email_change']
  .filter(t => !UEBERWACHUNGS_EREIGNISSE.includes(t))
pruefe('K5', 'Der Ueberwachungssatz enthaelt die Anmelde- und Kontoereignisse',
  fehlend.length === 0,
  fehlend.length === 0
    ? `${UEBERWACHUNGS_EREIGNISSE.length} Ereignisarten im Satz, alle Proben enthalten`
    : `fehlen im Satz: ${fehlend.join(', ')}`,
  'login_success, unknown_device, password_changed, email_change')

// ── 5) Mail → Zustellstatus → Wiederholung ────────────────────────────────
//
// Ohne Registereintrag ist eine fehlgeschlagene Meldung NICHT wiederholbar
// — sie landet im Dead Letter, und niemand erfaehrt vom Vorfall.
const arten = registrierteVorgaenge()
const sicher = arten.find(a => a.art === 'sicherheitsmeldung')
pruefe('K6', 'Sicherheitsmeldungen sind im Wiederherstellungs-Register',
  !!sicher && sicher.kanaele.includes('email'),
  sicher
    ? `sicherheitsmeldung → Kanaele: ${sicher.kanaele.join(', ')}`
    : `NICHT registriert. Bekannt sind: ${arten.map(a => a.art).join(', ') || '(keine)'}`,
  "Vorgangsart 'sicherheitsmeldung' mit Kanal 'email'")

const check = await orakel(
  `select coalesce((select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.notification_delivery_log'::regclass
        and conname like '%vorgang_art%' limit 1),'(kein CHECK)')`,
)
pruefe('K7', "Die Zustellspur nimmt den Bezeichner 'sicherheitsmeldung' an",
  /a-z/.test(check) && !check.includes('(kein CHECK)'),
  check, 'ein Slug-CHECK, der ^[a-z][a-z0-9-]{2,39}$ erlaubt')

// ── 6) Berichte — der Bestand, ohne Wertung ───────────────────────────────
bericht('K8', 'Ereignisse in der Spur, nach Art',
  await orakel(
    `select event_type || ': ' || count(*)::text || ' (juengstes ' || max(created_at)::date::text || ')'
       from public.security_audit_log group by event_type order by count(*) desc`,
  ))

bericht('K9', 'Ausgeloeste Meldungen und ihre Zustellzeilen',
  await orakel(
    `select 'meldungen_gesamt=' || (select count(*)::text from public.security_audit_log
              where event_type='security_notification_sent')
         || ' | zustellzeilen=' || (select count(*)::text from public.notification_delivery_log
              where vorgang_art='sicherheitsmeldung')
         || ' | davon_erfolgreich=' || (select count(*)::text from public.notification_delivery_log
              where vorgang_art='sicherheitsmeldung' and status='sent')`,
  ))

bericht('K10', 'Was NOCH offen bleibt (von hier aus nicht messbar)',
  'Ob Resend die Mail tatsaechlich annimmt, entscheidet sich erst beim\n'
  + 'ersten echten Alarm — dieses Skript verschickt bewusst nichts. Der\n'
  + 'Beweis waere eine Zeile in notification_delivery_log mit\n'
  + "vorgang_art='sicherheitsmeldung' und status='sent' (siehe K9).\n"
  + 'Steht dort 0, ist die Kette bis zum Versanddienst geprueft — und ab\n'
  + 'dort unbelegt.')

// ── Ergebnis ──────────────────────────────────────────────────────────────
const offen = ergebnisse.filter(e => !e.bestanden).length
console.log('\n───────────────────────────────────────────────────────────────')
console.log(` ${ergebnisse.length - offen} von ${ergebnisse.length} Pruefungen bestanden.`)
if (offen > 0) console.log(' Offene Punkte sind oben mit OFFEN markiert.')
console.log('───────────────────────────────────────────────────────────────')
process.exit(offen > 0 ? 1 : 0)
