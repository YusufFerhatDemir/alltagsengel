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
 *
 * ── BEFUND 01.09.2026: DER ZWEITE WEG KANNTE DIE REGELN NICHT ────────────
 * Dieses Skript schrieb frueher direkt per PostgREST in die Tabelle und
 * ging damit an allem vorbei, was in lib/security/watchlist.ts steht:
 *
 *   1. Es verlangte 5 Zeichen Grund statt 40 und fragte NICHT nach den vier
 *      Pflichtangaben (Zweck, Rechtsgrundlage, Zeitraum, Transparenz). Der
 *      Riegel der Oberflaeche war ueber die Kommandozeile umgehbar — und
 *      der Bestandseintrag vom 30.08.2026 ist genau so entstanden.
 *   2. Es schrieb KEIN `watchlist_change` in die Sicherheitsspur. Live gab
 *      es deshalb zu der einen laufenden Ueberwachung keine einzige
 *      Protokollzeile: wer sie wann angeordnet hat, stand nirgends ausser
 *      in `angelegt_von` derselben Zeile, die er selbst geschrieben hat.
 *      Die Dokumentation behauptete das Gegenteil („zwei Wege, beide
 *      schreiben ein watchlist_change-Ereignis").
 *   3. Es setzte weder `created_at` noch `befristet_bis`. Ein abgelaufener
 *      Eintrag liess sich damit auch hier nicht wieder anordnen, und nach
 *      dem Anwenden von 20261024000000 waere jedes Einschalten an dessen
 *      CHECK gescheitert (23514).
 *
 * Jetzt gelten hier dieselben Regeln wie in der Oberflaeche. Sie kommen
 * aus derselben Datei — nicht als Abschrift, die auseinanderlaufen kann.
 */

import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'
import {
  pruefeAngaben, neuesFristende, befristungFuer,
  BEGRUENDUNG_VORLAGE, HOECHSTDAUER_TAGE,
} from '../lib/security/befristung.ts'

/** Dieselbe Mindestlaenge wie GRUND_MINDESTLAENGE in lib/security/watchlist.ts.
 *  Die Datei ist `server-only` und hier nicht importierbar; die Zahl steht
 *  deshalb doppelt — der Gleichstand wird in
 *  __tests__/security/watchlist-transparenz.test.ts geprueft. */
const GRUND_MINDESTLAENGE = 40

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

// ── Dieselben Huerden wie in der Oberflaeche ──────────────────────────
// Nur beim EINSCHALTEN. Eine Schranke vor dem Abschalten waere genau
// falsch herum: sie hielte eine laufende Ueberwachung am Leben.
if (!ausschalten) {
  if (!grund || grund.trim().length < GRUND_MINDESTLAENGE) {
    console.error(`--grund fehlt oder ist zu knapp (mindestens ${GRUND_MINDESTLAENGE} Zeichen).`)
    console.error('Die Ueberwachung eines einzelnen Kontos zeichnet Anmeldungen, Geraete')
    console.error('und IP-Adressen einer namentlich bekannten Person auf. Sie braucht')
    console.error('einen Grund, der aufgeschrieben ist, BEVOR sie laeuft.\n')
    console.error('Vorlage:')
    for (const z of BEGRUENDUNG_VORLAGE.split('\n')) console.error(`  ${z}`)
    process.exit(2)
  }
  const angaben = pruefeAngaben(grund)
  if (!angaben.ok) {
    console.error(angaben.meldung + '\n')
    console.error('Vorlage:')
    for (const z of BEGRUENDUNG_VORLAGE.split('\n')) console.error(`  ${z}`)
    process.exit(2)
  }
}

// ── Bestand: laeuft die Massnahme schon? ──────────────────────────────
// Davon haengt ab, ob die Frist neu startet. Bei einer LAUFENDEN
// Massnahme bleibt sie stehen — sonst liesse sie sich durch wiederholtes
// Aufrufen still verlaengern, und genau das soll die Frist verhindern.
const bestandAntwort = await rest(`security_watchlist?select=*&user_id=eq.${userId}&limit=1`)
const bestand = bestandAntwort.status === 200 ? (bestandAntwort.rumpf?.[0] ?? null) : null
const JETZT = new Date()
const laeuftBereits = !!bestand && bestand.aktiv === true
  && !befristungFuer(bestand.created_at, JETZT, bestand.befristet_bis ?? null).abgelaufen
const fristNeuGestartet = !ausschalten && !laeuftBereits

const zeile = {
  user_id: userId,
  aktiv: !ausschalten,
  grund: grund ?? bestand?.grund ?? 'Ueberwachung abgeschaltet',
  melde_email: meldeAn ?? null,
  email_kontrolle: email ?? null,
  alle_ereignisse: true,
  ohne_sperrfrist: true,
}

if (fristNeuGestartet) {
  zeile.created_at = JETZT.toISOString()
  zeile.befristet_bis = neuesFristende(JETZT)
} else if (!ausschalten) {
  zeile.befristet_bis = bestand?.befristet_bis
    ?? befristungFuer(bestand?.created_at ?? JETZT.toISOString(), JETZT).laeuftAbAm
}

const frist = befristungFuer(
  zeile.created_at ?? bestand?.created_at ?? JETZT.toISOString(),
  JETZT,
  zeile.befristet_bis ?? null,
)

console.log('── Was geschrieben wuerde ────────────────────────────')
console.log(`  ACCOUNT_SECURITY_ALERTS: ${zeile.aktiv ? 'true' : 'false'}`)
console.log(`  Meldung an:              ${zeile.melde_email ?? '(Adresse des Kontos)'}`)
console.log(`  Voller Meldesatz:        ja`)
console.log(`  Ohne Sperrfrist:         ja`)
if (!ausschalten) {
  console.log(`  Frist:                   ${frist.hinweis}`)
  console.log(`  Frist startet neu:       ${fristNeuGestartet ? 'ja' : 'nein (Massnahme laeuft bereits)'}`)
  console.log(`  Hoechstdauer:            ${HOECHSTDAUER_TAGE} Tage`)
}
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

async function schreibVersuch(nutzlast) {
  return rest('security_watchlist?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(nutzlast),
  })
}

// Dieselbe Staffel wie in lib/security/watchlist.ts: erst mit der
// Fristspalte, dann ohne. 42703 heisst „Migration 20261024000000 fehlt",
// nicht „Fehler".
let schreib = await schreibVersuch(zeile)
if (schreib.status >= 300 && schreib.rumpf?.code === '42703') {
  const ohneFrist = { ...zeile }
  delete ohneFrist.befristet_bis
  schreib = await schreibVersuch(ohneFrist)
}

if (schreib.status >= 300) {
  console.error(`\nFEHLGESCHLAGEN (HTTP ${schreib.status}):`)
  console.error(JSON.stringify(schreib.rumpf, null, 2))
  console.error('\nIst Migration 20261018000002 (Tabelle) bzw. 20261018000004 (Spalten) angewendet?')
  process.exit(1)
}

console.log('\n✓ Eintrag geschrieben.')

// ── Die Aenderung ist selbst ein Ereignis ─────────────────────────────
// Ohne diesen Schritt gaebe es zu einer angeordneten Ueberwachung keine
// Protokollzeile — nachvollziehbar waere sie dann nur aus der Zeile, die
// derjenige selbst geschrieben hat. Der erste Schritt eines Missbrauchs
// waere, die Ueberwachung still stillzulegen; genau das soll hier
// auffallen.
const ereignis = await rest('rpc/log_security_event', {
  method: 'POST',
  body: JSON.stringify({
    p_user_id: userId,
    p_event_type: 'watchlist_change',
    p_event_category: 'admin',
    p_severity: 'critical',
    p_organization_id: organizationId,
    p_user_email: kontoEmail,
    p_platform: 'server',
    p_metadata: {
      funktion: 'security_watchlist',
      weg: 'kommandozeile',
      vorher: bestand ? { aktiv: bestand.aktiv, grund: bestand.grund } : null,
      nachher: { aktiv: zeile.aktiv, grund: zeile.grund },
      befristet_bis: zeile.aktiv ? frist.laeuftAbAm : null,
      frist_neu_gestartet: fristNeuGestartet,
      adressen_abweichung: abweichung,
      ergebnis: 'SUCCESS',
    },
  }),
})

if (ereignis.status >= 300) {
  // Der Eintrag steht bereits. Ein fehlendes Protokoll ist ein Befund,
  // kein Grund, den Vorgang als gescheitert auszugeben — aber es wird
  // laut gesagt, statt still zu bleiben.
  console.error(`\nWARNUNG: Der Eintrag steht, aber das Protokollereignis`)
  console.error(`konnte NICHT geschrieben werden (HTTP ${ereignis.status}).`)
  console.error(JSON.stringify(ereignis.rumpf, null, 2))
  console.error('Diese Aenderung ist damit in der Sicherheitsspur nicht belegt.')
} else {
  console.log('  Protokolliert als watchlist_change (kritisch).')
}

console.log('  Gegenprobe: npm run security:watchlist -- --liste')
console.log('  Nachweis:   npm run verify:ueberwachung')
