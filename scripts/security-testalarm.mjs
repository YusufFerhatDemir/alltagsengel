#!/usr/bin/env node
/**
 * EINEN echten Testalarm ausloesen — ueber die vorgesehene Funktion,
 * und dann bis zum Zustellnachweis des Providers nachverfolgen.
 *
 * ═══ WAS HIER AUF DEM SPIEL STEHT ════════════════════════════════════════
 *
 * security_audit_log ist UNVERAENDERLICH (Trigger
 * security_audit_log_unveraenderlich) und ist der Art.-32-Nachweis. Was
 * dieses Skript schreibt, bleibt fuer immer drin und kann im Ernstfall
 * vorgelegt werden. Daraus folgen drei Regeln, an die es sich haelt:
 *
 *  1. KEINE ERFUNDENE ANMELDUNG. Es wird NIE 'login_success' geschrieben.
 *     Eine erfundene Anmeldung waere eine Falschaussage in genau dem
 *     Protokoll, das eine Falschaussage ausschliessen soll.
 *  2. EIGENER EREIGNISTYP. Geschrieben wird 'test_alert', nicht
 *     'security_action'. Der erste Lauf am 31.08.2026 nahm noch
 *     'security_action' — „sicherheitskritische Aktion" —, und genau
 *     daraus wurde geschlossen, das Konto sei zu dieser Zeit angemeldet
 *     gewesen. Es gab an dem Tag keine Anmeldung. Ein Test, der wie ein
 *     Vorfall aussieht, ist ein Fehler im Werkzeug, nicht im Leser.
 *     Zusaetzlich traegt die Zeile die Provenienz TEST_ALERT — eine
 *     auswertbare Angabe, kein Fliesstext — und der Betreff der Mail
 *     bekommt daraus ein sichtbares [TESTALARM].
 *  3. GENAU EINE ZEILE, NUR MIT --doit. Ohne die Bestaetigung laeuft ein
 *     Trockenlauf. Es geht eine echte Mail raus — an die Adresse, die in
 *     der Ueberwachungsliste steht, an niemanden sonst.
 *
 * Aufruf:
 *   node --import tsx scripts/security-testalarm.mjs <user-id> [--doit]
 * Bequemer ueber npm run security:testalarm -- <user-id> --doit
 */
import { readFileSync, existsSync } from 'node:fs'
import { apiHeaders, secretKey, envWert } from './lib/supabase-keys.mjs'

// lib/supabase/admin.ts liest process.env, nicht die .env-Dateien. Ohne
// diesen Schritt scheitert createAdminClient() mit „supabaseUrl is
// required" — und zwar FAIL-SOFT, also lautlos genug, dass man es fuer
// „nichts zu melden" halten koennte. Deshalb hier vor dem Import.
for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const { erfasseSicherheitsereignis } = await import('../lib/security/index.ts')

const BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const KEY = secretKey()
const RESEND = envWert('RESEND_API_KEY')
const userId = process.argv[2]
const scharf = process.argv.includes('--doit')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!userId || !UUID.test(userId)) {
  console.error('Aufruf: node --import tsx scripts/security-testalarm.mjs <user-id> [--doit]')
  process.exit(2)
}

const zeit = (s) => s ? new Date(s).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'medium' }) : '—'
async function db(pfad) {
  const res = await fetch(`${BASIS}/rest/v1/${pfad}`, { headers: apiHeaders(KEY) })
  return res.ok ? res.json() : []
}
const warte = (ms) => new Promise(r => setTimeout(r, ms))

// ── Vorher: wen trifft es, und ist das Konto ueberhaupt gemeldet? ────────
const [profil] = await db(`profiles?id=eq.${userId}&select=first_name,last_name,email,role`)
const [wl] = await db(`security_watchlist?user_id=eq.${userId}&select=*`)

console.log('\n═══ TESTALARM ═══')
console.log(`Konto        : ${profil ? `${profil.first_name ?? ''} ${profil.last_name ?? ''}`.trim() : 'UNBEKANNT'} <${profil?.email ?? '—'}> (${profil?.role ?? '—'})`)
console.log(`Ueberwachung : ${wl ? `aktiv=${wl.aktiv}, alle_ereignisse=${wl.alle_ereignisse}, ohne_sperrfrist=${wl.ohne_sperrfrist}` : 'KEIN EINTRAG'}`)
console.log(`Mail geht an : ${wl?.melde_email ?? profil?.email ?? '— keine Adresse bekannt'}`)
console.log(`Ereignistyp  : test_alert  (NICHT login_success, NICHT security_action)`)
console.log(`Provenienz   : TEST_ALERT  → Betreff traegt [TESTALARM]`)
console.log(`Modus        : ${scharf ? 'SCHARF — eine unloeschbare Zeile + eine echte Mail' : 'Trockenlauf'}`)

if (!wl?.aktiv && !['superadmin', 'admin', 'pdl', 'qm', 'buchhaltung'].includes(profil?.role)) {
  console.log('\nHINWEIS: Konto ist weder ueberwacht noch privilegiert — es wuerde NICHTS gemeldet.')
}
if (!scharf) {
  console.log('\nTrockenlauf beendet. Mit --doit wiederholen.')
  process.exit(0)
}

// ── Ausloesen ueber die vorgesehene Funktion ────────────────────────────
const stempel = new Date().toISOString()
const ergebnis = await erfasseSicherheitsereignis({
  eventType: 'test_alert',
  userId,
  alsTest: 'TEST_ALERT',
  metadata: {
    pruefung: 'Alarmkette Ereignis -> Regel -> Alarm -> Mail -> Zustellstatus beim Provider',
    hinweis: 'KEINE Anmeldung und KEIN Vorfall. Diese Zeile belegt einen Funktionstest der Meldekette.',
    ausgeloest_von: 'scripts/security-testalarm.mjs',
    ausgeloest_am: stempel,
  },
})

console.log(`\nEreignis geschrieben : ${ergebnis.geschrieben}`)
console.log(`Ereignis-ID          : ${ergebnis.ereignisId}`)
console.log(`Gemeldet             : ${ergebnis.gemeldet}`)
console.log(`Meldegrund           : ${ergebnis.meldeGrund}`)
console.log(`Organisation         : ${ergebnis.organizationId ?? '— (dann KEIN Zustellvorgang, keine Wiederholung)'}`)

if (!ergebnis.ereignisId) process.exit(1)

// ── Zustellspur ─────────────────────────────────────────────────────────
console.log('\n── Zustellspur ──')
let spur = []
for (let i = 0; i < 6 && spur.length === 0; i++) {
  if (i) await warte(2000)
  spur = await db(`notification_delivery_log?vorgang_ref=eq.${ergebnis.ereignisId}&select=*`)
}
if (!spur.length) console.log('  KEINE Zeile — es gab nur den Sofortversuch, keine Wiederholung moeglich.')
for (const s of spur) {
  console.log(`  ${s.status}  →  ${s.recipient}`)
  console.log(`      Provider-ID   : ${s.provider_message_id ?? '— FEHLT'}`)
  console.log(`      uebergeben am : ${zeit(s.delivered_at)}`)
  console.log(`      Fehlergrund   : ${s.sanitized_error ?? '—'}`)
}

// ── Der externe Nachweis ────────────────────────────────────────────────
console.log('\n── Was der Provider sagt (der EINZIGE Zustellnachweis) ──')
if (!RESEND) console.log('  RESEND_API_KEY nicht gesetzt — kein externer Nachweis moeglich.')
for (const s of spur) {
  if (!s.provider_message_id) continue
  // Resend braucht einen Moment, bis last_event auf 'delivered' steht.
  for (let i = 0; i < 8; i++) {
    const res = await fetch(`https://api.resend.com/emails/${s.provider_message_id}`, {
      headers: { Authorization: `Bearer ${RESEND}` },
    })
    if (!res.ok) { console.log(`  ${s.provider_message_id}: HTTP ${res.status}`); break }
    const d = await res.json()
    console.log(`  ${s.provider_message_id}  an ${(d.to || []).join(', ')}  →  last_event = ${d.last_event ?? '—'}`)
    if (d.last_event === 'delivered' || d.last_event === 'bounced' || d.last_event === 'complained') break
    await warte(4000)
  }
}
console.log('')
