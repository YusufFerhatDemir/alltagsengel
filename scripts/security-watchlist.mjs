#!/usr/bin/env node
/**
 * ACCOUNT_SECURITY_ALERTS fuer ein Konto ein- oder ausschalten.
 *
 * WARUM ALS SKRIPT UND NICHT ALS MIGRATION
 * Wer ueberwacht wird, ist eine Betriebsentscheidung und gehoert in die
 * Datenbank — nicht in die Versionsgeschichte. Eine Migration mit einer
 * E-Mail-Adresse waere ein Personendatum, das sich nie mehr loeschen
 * laesst. Dieses Skript nimmt die Adresse als ARGUMENT entgegen und
 * schreibt nichts ins Repository.
 *
 * WIE DAS KONTO GEFUNDEN WIRD
 * Ueber die Adresse in public.profiles — aber NUR, um die
 * Konto-Kennung zu ermitteln. Eingetragen wird die Kennung; die Adresse
 * landet zusaetzlich als `email_kontrolle` in der Zeile, damit spaeter
 * nachvollziehbar bleibt, welche Adresse beim Einrichten gemeint war.
 * Weicht sie von der Adresse des Kontos ab, sagt das Skript das laut.
 *
 * Aufruf:
 *   npm run security:watchlist -- --email <adresse> --grund "<text>" [--melde-an <adresse>]
 *   npm run security:watchlist -- --user-id <uuid> --grund "<text>"
 *   npm run security:watchlist -- --email <adresse> --aus
 *   npm run security:watchlist -- --liste
 *
 * Ohne --ja laeuft das Skript als TROCKENLAUF: es zeigt, was es taete,
 * und schreibt nichts.
 */

import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()

if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

// ── Argumente ─────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
function wert(name) {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}
const hat = (name) => argv.includes(name)

const email = wert('--email')
const userIdArg = wert('--user-id')
const grund = wert('--grund')
const meldeAn = wert('--melde-an')
const ausschalten = hat('--aus')
const schreiben = hat('--ja')
const nurListe = hat('--liste')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function rest(pfad, optionen = {}) {
  const res = await fetch(`${URL_BASIS}/rest/v1/${pfad}`, {
    ...optionen,
    headers: apiHeaders(SERVICE, { 'Content-Type': 'application/json', ...(optionen.headers ?? {}) }),
  })
  const text = await res.text()
  let rumpf = null
  try { rumpf = text ? JSON.parse(text) : null } catch { rumpf = text }
  return { status: res.status, rumpf }
}

// ── Liste ─────────────────────────────────────────────────────────────
if (nurListe) {
  const { status, rumpf } = await rest('security_watchlist?select=*&order=created_at.desc')
  if (status !== 200) {
    console.error(`Liste nicht lesbar (HTTP ${status}). Ist Migration 20261018000002 angewendet?`)
    process.exit(1)
  }
  if (!rumpf?.length) {
    console.log('Kein Konto ausdruecklich ueberwacht.')
    process.exit(0)
  }
  for (const e of rumpf) {
    console.log(`${e.aktiv ? 'AKTIV' : 'aus  '}  ${e.user_id}  melde_an=${e.melde_email ?? '(Konto)'}  grund=${e.grund}`)
  }
  process.exit(0)
}

if (!email && !userIdArg) {
  console.error('Nutzung: npm run security:watchlist -- --email <adresse> --grund "<text>" [--melde-an <adresse>] [--aus] [--ja]')
  console.error('     oder: npm run security:watchlist -- --liste')
  process.exit(2)
}

// ── Konto aufloesen ───────────────────────────────────────────────────
let userId = userIdArg
let kontoEmail = null
let name = null
let rolle = null

if (userId && !UUID_RE.test(userId)) {
  console.error('--user-id ist keine gueltige UUID.')
  process.exit(2)
}

const filter = userId
  ? `id=eq.${userId}`
  : `email=eq.${encodeURIComponent(email.trim().toLowerCase())}`

const profil = await rest(`profiles?select=id,email,first_name,last_name,role&${filter}&limit=1`)
if (profil.status !== 200) {
  console.error(`profiles nicht lesbar (HTTP ${profil.status}).`)
  process.exit(1)
}
if (!profil.rumpf?.length) {
  console.error(`Kein Konto gefunden fuer ${userId ?? email}.`)
  console.error('Pruefen Sie die Schreibweise — eine Adresse mit einem Zeichen zu viel findet nichts.')
  process.exit(1)
}

const p = profil.rumpf[0]
userId = p.id
kontoEmail = p.email ?? null
name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || null
rolle = p.role ?? null

const abweichung = !!email && !!kontoEmail
  && email.trim().toLowerCase() !== kontoEmail.trim().toLowerCase()

console.log('── Konto ─────────────────────────────────────────────')
console.log(`  Kennung (user_id): ${userId}`)
console.log(`  Name:              ${name ?? '—'}`)
console.log(`  Adresse (Konto):   ${kontoEmail ?? '—'}`)
console.log(`  Rolle:             ${rolle ?? '—'}`)
if (email) console.log(`  Adresse (Eingabe): ${email}${abweichung ? '   ← WEICHT AB' : ''}`)
console.log('')

if (abweichung) {
  console.log('  ACHTUNG: die angegebene Adresse ist NICHT die des Kontos.')
  console.log('  Die Ueberwachung haengt an der Kennung, nicht an der Adresse —')
  console.log('  pruefen Sie, ob das richtige Konto gemeint ist.\n')
}

if (!ausschalten && (!grund || grund.trim().length < 5)) {
  console.error('--grund fehlt (mindestens 5 Zeichen). Ein Eintrag ohne Grund ist')
  console.error('in einem halben Jahr nicht mehr erklaerbar.')
  process.exit(2)
}

const zeile = {
  user_id: userId,
  aktiv: !ausschalten,
  grund: grund ?? 'Ueberwachung abgeschaltet',
  melde_email: meldeAn ?? null,
  email_kontrolle: email ?? null,
  alle_ereignisse: true,
  ohne_sperrfrist: true,
}

console.log('── Was geschrieben wuerde ────────────────────────────')
console.log(`  ACCOUNT_SECURITY_ALERTS: ${zeile.aktiv ? 'true' : 'false'}`)
console.log(`  Meldung an:              ${zeile.melde_email ?? '(Adresse des Kontos)'}`)
console.log(`  Voller Meldesatz:        ja`)
console.log(`  Ohne Sperrfrist:         ja`)
console.log(`  Grund:                   ${zeile.grund}`)
console.log('')

if (!schreiben) {
  console.log('TROCKENLAUF — nichts geschrieben. Mit --ja ausfuehren.')
  process.exit(0)
}

// ── Organisation ermitteln (fail-soft: null ist erlaubt) ──────────────
let organizationId = null
for (const [tabelle, spalte] of [['organization_members', 'user_id'], ['caregivers', 'user_id'], ['clients', 'user_id']]) {
  const r = await rest(`${tabelle}?select=organization_id&${spalte}=eq.${userId}&limit=1`)
  if (r.status === 200 && r.rumpf?.[0]?.organization_id) {
    organizationId = r.rumpf[0].organization_id
    break
  }
}
zeile.organization_id = organizationId
console.log(`  Organisation:            ${organizationId ?? '(keine gefunden)'}`)

const schreib = await rest('security_watchlist?on_conflict=user_id', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify(zeile),
})

if (schreib.status >= 300) {
  console.error(`\nFEHLGESCHLAGEN (HTTP ${schreib.status}):`)
  console.error(JSON.stringify(schreib.rumpf, null, 2))
  console.error('\nIst Migration 20261018000002 (Tabelle) bzw. 20261018000004 (Spalten) angewendet?')
  process.exit(1)
}

console.log('\n✓ Eintrag geschrieben.')
console.log('  Gegenprobe: npm run security:watchlist -- --liste')
