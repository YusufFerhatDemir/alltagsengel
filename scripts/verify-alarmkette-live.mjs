#!/usr/bin/env node
/**
 * Alarmkette eines Kontos LIVE nachverfolgen — von der Anmeldung bis zum
 * Zustellnachweis des Mailproviders.
 *
 * WARUM DIESES SKRIPT
 * „sendRawEmail() wurde aufgerufen" ist kein Zustellnachweis. „status=sent"
 * in der eigenen Tabelle ist auch keiner — das ist nur die eigene Behauptung,
 * die Mail uebergeben zu haben. Der einzige Beleg, dass eine Mail wirklich
 * beim Empfaenger ankam, kommt VON AUSSEN: von Resend. Dieses Skript geht
 * deshalb die ganze Kette ab und fragt am Ende Resend selbst.
 *
 * DIE KETTE (jeder Schritt kann reissen — genau das soll sichtbar werden)
 *   1  Konto             profiles / auth.users
 *   2  Ereignis          security_audit_log (Anmeldung, App-Start, …)
 *   3  Meldeentscheidung security_watchlist + Rolle (lib/security/benachrichtigung.ts)
 *   4  Versandnachweis   security_audit_log, event_type='security_notification_sent'
 *   5  Zustellspur       notification_delivery_log (vorgang_art='sicherheitsmeldung')
 *   6  Provider-ID       notification_delivery_log.provider_message_id
 *   7  Provider-Status   Resend GET /emails/{id}  ← der externe Nachweis
 *
 * NUR LESEND. Es wird nichts angelegt, nichts versendet, nichts geaendert.
 *
 * Aufruf:
 *   node scripts/verify-alarmkette-live.mjs "Karakaya"
 *   node scripts/verify-alarmkette-live.mjs --alle        (letzte Meldungen aller Konten)
 */
import { apiHeaders, secretKey, envWert } from './lib/supabase-keys.mjs'

const BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const KEY = secretKey()
const RESEND = envWert('RESEND_API_KEY')
const suche = process.argv[2]

if (!BASIS || !KEY) { console.error('Supabase-Zugang fehlt'); process.exit(1) }
if (!suche) { console.error('Aufruf: node scripts/verify-alarmkette-live.mjs "<Nachname|E-Mail>" | --alle'); process.exit(1) }

const kopf = (t) => console.log(`\n${'─'.repeat(72)}\n${t}\n${'─'.repeat(72)}`)
const zeit = (s) => s ? new Date(s).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'medium' }) + ' (Berlin)' : '—'

async function db(pfad) {
  const res = await fetch(`${BASIS}/rest/v1/${pfad}`, { headers: apiHeaders(KEY) })
  if (!res.ok) return { fehler: `HTTP ${res.status} ${(await res.text()).slice(0, 200)}` }
  return { zeilen: await res.json() }
}

/** Resend selbst fragen. DAS ist der externe Nachweis. */
async function resendStatus(id) {
  if (!RESEND) return { fehler: 'RESEND_API_KEY nicht gesetzt — kein externer Nachweis moeglich' }
  const res = await fetch(`https://api.resend.com/emails/${id}`, {
    headers: { Authorization: `Bearer ${RESEND}` },
  })
  const txt = await res.text()
  if (!res.ok) return { fehler: `HTTP ${res.status}: ${txt.slice(0, 300)}` }
  try { return { daten: JSON.parse(txt) } } catch { return { fehler: txt.slice(0, 300) } }
}

console.log('\n╔══════════════════════════════════════════════════════════════════════╗')
console.log('║  ALARMKETTE — live gemessen, nur lesend                              ║')
console.log('╚══════════════════════════════════════════════════════════════════════╝')
console.log(`Ziel   : ${BASIS.replace(/^https:\/\//, '')}`)
console.log(`Resend : ${RESEND ? 'Schluessel vorhanden' : 'KEIN SCHLUESSEL — Schritt 7 nicht pruefbar'}`)
console.log(`Suche  : ${suche}`)

// ── 1 · Konto ──────────────────────────────────────────────────────────
kopf('1 · KONTO')
let konten = []
if (suche === '--alle') {
  console.log('Modus --alle: kein einzelnes Konto, es werden die letzten Meldungen gezeigt.')
} else {
  const q = encodeURIComponent(`%${suche}%`)
  const r = await db(`profiles?or=(last_name.ilike.${q},first_name.ilike.${q},email.ilike.${q})&select=id,first_name,last_name,email,role,created_at`)
  if (r.fehler) console.log('  FEHLER:', r.fehler)
  else {
    konten = r.zeilen
    if (konten.length === 0) console.log('  KEIN Konto gefunden, das auf diesen Namen passt.')
    for (const k of konten) {
      console.log(`  ${(k.first_name || '') + ' ' + (k.last_name || '')}`.trimEnd())
      console.log(`    id      : ${k.id}`)
      console.log(`    E-Mail  : ${k.email ?? '— (leer in profiles)'}`)
      console.log(`    Rolle   : ${k.role}`)
      console.log(`    angelegt: ${zeit(k.created_at)}`)
    }
  }
}
const ids = konten.map(k => k.id)
const inListe = ids.length ? `(${ids.join(',')})` : null

// ── 2 · Ereignisse ─────────────────────────────────────────────────────
kopf('2 · EREIGNISSE in security_audit_log')
let ereignisse = []
{
  const pfad = inListe
    ? `security_audit_log?user_id=in.${inListe}&select=id,created_at,event_type,severity,platform,ip_address,user_agent,app_version,session_reference,user_email,organization_id,metadata&order=created_at.desc&limit=40`
    : `security_audit_log?select=id,created_at,event_type,severity,platform,user_email,user_id,metadata&order=created_at.desc&limit=40`
  const r = await db(pfad)
  if (r.fehler) console.log('  FEHLER:', r.fehler)
  else {
    ereignisse = r.zeilen
    if (!ereignisse.length) console.log('  KEINE Zeile. Es gibt kein aufgezeichnetes Ereignis fuer dieses Konto.')
    for (const e of ereignisse) {
      console.log(`  ${zeit(e.created_at)}  ${e.event_type}  [${e.severity}]  ${e.platform ?? '—'}`)
      console.log(`      Audit-ID: ${e.id}`)
      if (e.ip_address) console.log(`      IP      : ${e.ip_address}`)
      if (e.user_agent) console.log(`      Agent   : ${String(e.user_agent).slice(0, 90)}`)
      if (e.metadata && Object.keys(e.metadata).length) console.log(`      Metadaten: ${JSON.stringify(e.metadata).slice(0, 200)}`)
    }
  }
}

// ── 3 · Meldeentscheidung ──────────────────────────────────────────────
kopf('3 · MELDEENTSCHEIDUNG — Ueberwachungsliste und Rolle')
{
  const pfad = inListe
    ? `security_watchlist?user_id=in.${inListe}&select=*`
    : `security_watchlist?select=*&order=created_at.desc&limit=20`
  const r = await db(pfad)
  if (r.fehler) console.log('  FEHLER:', r.fehler)
  else if (!r.zeilen.length) {
    console.log('  KEIN Eintrag in security_watchlist.')
    const priv = ['superadmin', 'admin', 'pdl', 'qm', 'buchhaltung']
    for (const k of konten) {
      console.log(`  → ${k.last_name}: Rolle "${k.role}" ist ${priv.includes(k.role) ? 'PRIVILEGIERT (meldet nach Katalogsatz)' : 'NICHT privilegiert — es meldet dann NICHTS'}`)
    }
  } else for (const w of r.zeilen) {
    console.log(`  user_id        : ${w.user_id}`)
    console.log(`  aktiv          : ${w.aktiv}`)
    console.log(`  melde_email    : ${w.melde_email ?? '— (dann Kontoadresse)'}`)
    console.log(`  alle_ereignisse: ${w.alle_ereignisse}`)
    console.log(`  ohne_sperrfrist: ${w.ohne_sperrfrist}`)
    console.log(`  grund          : ${w.grund ?? '—'}`)
    console.log(`  angelegt       : ${zeit(w.created_at)}`)
  }
}

// ── 4 · Versandnachweis ────────────────────────────────────────────────
kopf('4 · VERSANDNACHWEIS — security_notification_sent')
let nachweise = []
{
  const pfad = inListe
    ? `security_audit_log?user_id=in.${inListe}&event_type=eq.security_notification_sent&select=id,created_at,user_email,metadata&order=created_at.desc&limit=20`
    : `security_audit_log?event_type=eq.security_notification_sent&select=id,created_at,user_email,user_id,metadata&order=created_at.desc&limit=20`
  const r = await db(pfad)
  if (r.fehler) console.log('  FEHLER:', r.fehler)
  else {
    nachweise = r.zeilen
    if (!nachweise.length) console.log('  KEINE Zeile. Es wurde nie eine Sicherheitsmeldung als versendet vermerkt.')
    for (const n of nachweise) {
      console.log(`  ${zeit(n.created_at)}  Nachweis-ID ${n.id}`)
      console.log(`      Empfaengerkonto: ${n.user_email ?? '—'}`)
      console.log(`      bezug          : ${n.metadata?.bezug_event_type} / ${n.metadata?.bezug_ereignis}`)
      console.log(`      Grund          : ${n.metadata?.melde_grund}`)
      console.log(`      Empfaengerzahl : ${n.metadata?.empfaenger_anzahl}`)
    }
  }
}

// ── 5+6 · Zustellspur ──────────────────────────────────────────────────
kopf('5+6 · ZUSTELLSPUR — notification_delivery_log (vorgang_art=sicherheitsmeldung)')
let spuren = []
{
  const r = await db(`notification_delivery_log?vorgang_art=eq.sicherheitsmeldung&select=*&order=created_at.desc&limit=30`)
  if (r.fehler) console.log('  FEHLER:', r.fehler)
  else {
    spuren = r.zeilen
    if (!spuren.length) console.log('  KEINE Zeile. Es wurde nie ein Sicherheits-Zustellvorgang registriert.')
    for (const s of spuren) {
      console.log(`  ${zeit(s.created_at)}  ${s.status}  →  ${s.recipient}`)
      console.log(`      Kanal/Provider : ${s.channel} / ${s.provider ?? '—'}`)
      console.log(`      Provider-ID    : ${s.provider_message_id ?? '— FEHLT'}`)
      console.log(`      Versuche       : ${s.attempt_count}`)
      console.log(`      versucht       : ${zeit(s.attempted_at)}`)
      console.log(`      zugestellt     : ${zeit(s.delivered_at)}`)
      console.log(`      gescheitert    : ${zeit(s.failed_at)}`)
      console.log(`      Fehlergrund    : ${s.sanitized_error ?? s.grund ?? '—'}`)
      console.log(`      Vorgangsbezug  : ${s.vorgang_ref}`)
    }
  }
}

// ── 7 · Provider ───────────────────────────────────────────────────────
kopf('7 · EXTERNER NACHWEIS — Resend selbst gefragt')
{
  const idsProv = [...new Set(spuren.map(s => s.provider_message_id).filter(Boolean))]
  if (!idsProv.length) {
    console.log('  Keine Provider-Nachrichten-ID vorhanden — es gibt NICHTS, was Resend')
    console.log('  bestaetigen koennte. Ohne diese ID ist keine Zustellung belegbar.')
  }
  for (const id of idsProv) {
    const r = await resendStatus(id)
    if (r.fehler) { console.log(`  ${id}: ${r.fehler}`); continue }
    const d = r.daten
    console.log(`  ${id}`)
    console.log(`      an          : ${(d.to || []).join(', ')}`)
    console.log(`      Betreff     : ${d.subject}`)
    console.log(`      last_event  : ${d.last_event ?? '—'}   ← Zustellstatus des Providers`)
    console.log(`      created_at  : ${d.created_at}`)
  }
}

// ── Auswertung ─────────────────────────────────────────────────────────
kopf('AUSWERTUNG — wo genau die Kette reisst')
const anmeldungen = ereignisse.filter(e => /login|app_start|sign_in|anmeld/i.test(e.event_type))
const schritte = [
  ['1 Konto gefunden', konten.length > 0],
  ['2 Ereignis aufgezeichnet', anmeldungen.length > 0],
  ['4 Versandnachweis geschrieben', nachweise.length > 0],
  ['5 Zustellvorgang registriert', spuren.length > 0],
  ['6 Provider-ID vorhanden', spuren.some(s => s.provider_message_id)],
  ['7 Provider meldet Zustellung', spuren.some(s => s.delivered_at)],
]
for (const [name, ok] of schritte) console.log(`  ${ok ? '  JA ' : ' NEIN'}  ${name}`)
const erster = schritte.find(([, ok]) => !ok)
console.log('')
console.log(erster
  ? `  ERSTER RISS: ${erster[0]} — alles danach kann gar nicht stattgefunden haben.`
  : '  Kette vollstaendig — bis zum externen Zustellnachweis.')
console.log('')
