#!/usr/bin/env node
/**
 * Marketing-/CRM-Schicht: Live-Prüfung.
 *
 * Beantwortet fünf Fragen gegen die PRODUKTION — nicht gegen eine
 * Nachbildung:
 *
 *   A) Sind die sechs Tabellen aus 20261019000000 angewendet?
 *   B) Ist `anon` überall ausgesperrt?
 *   C) Wie viele Einwilligungen, Sperren, Kampagnen gibt es wirklich?
 *   D) Steht der Werbeversand-Schalter?
 *   E) Wie groß ist der adressierbare Bestand — und wie viele davon
 *      dürften angeschrieben werden?
 *
 * WARUM DIESE PRÜFUNG NÖTIG IST
 * DDL lässt sich mit dem Dienstschlüssel nicht anwenden (42501); die
 * Migration legt Yusuf im SQL-Editor ein. Bis dahin ist der Code
 * vollständig und die Tabellen fehlen — und genau das darf nicht wie
 * „läuft" aussehen. Ein Aufruf, der ohne Tabellen grün meldet, wäre
 * schlimmer als gar keiner.
 *
 * Aufruf:  node scripts/verify-marketing.mjs
 *          npm run verify:marketing
 *
 * Exit 1, sobald etwas nicht stimmt. Die Prüfung endet NIE auf einer
 * Pipeline — sonst sähe rot wie grün aus.
 */
import { apiHeaders, envWert, publishableKey, secretKey } from './lib/supabase-keys.mjs'

const URL_ = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SECRET = secretKey()
const PUBLIC = publishableKey()

if (!URL_ || !SECRET) {
  console.error('❌ ÜBERSPRUNGEN: keine Zugangsdaten (NEXT_PUBLIC_SUPABASE_URL / Secret-Key).')
  console.error('   Eine nicht durchgeführte Prüfung ist ein Fehler, kein Erfolg.')
  process.exit(1)
}

const H = apiHeaders(SECRET)
const TABELLEN = [
  'marketing_consents',
  'email_suppression_list',
  'email_templates',
  'email_campaigns',
  'email_campaign_logs',
  'marketing_automations',
]

let fehler = 0
const melde = (ok, text) => {
  console.log(`${ok ? '✅' : '❌'} ${text}`)
  if (!ok) fehler += 1
}

/**
 * Zählt Zeilen. Gibt `null` zurück, wenn die Tabelle nicht existiert.
 *
 * 206 ist Erfolg mit Teilinhalt, 200 mit leerem Array ist mehrdeutig —
 * deshalb wird der content-range ausgewertet und nicht die Länge des
 * Arrays.
 */
async function zaehle(tabelle) {
  const r = await fetch(`${URL_}/rest/v1/${tabelle}?select=*&limit=1`, {
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
  })
  if (r.status === 404) return null
  if (!r.ok) {
    const text = await r.text()
    if (/does not exist|schema cache/i.test(text)) return null
    throw new Error(`${tabelle}: HTTP ${r.status} ${text.slice(0, 160)}`)
  }
  const bereich = r.headers.get('content-range') || ''
  return Number(bereich.split('/')[1] ?? 0)
}

console.log('═══ A) Sind die Tabellen angewendet? ═══')
const stand = {}
for (const t of TABELLEN) {
  const n = await zaehle(t)
  stand[t] = n
  melde(n !== null, n === null ? `${t} FEHLT — Migration 20261019000000 ist nicht angewendet` : `${t}: ${n} Zeilen`)
}

const alleDa = TABELLEN.every((t) => stand[t] !== null)

if (alleDa && PUBLIC) {
  console.log('\n═══ B) Ist anon ausgesperrt? ═══')
  const AH = apiHeaders(PUBLIC)
  for (const t of TABELLEN) {
    const r = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: AH })
    // 200 mit leerem Array wäre mehrdeutig (RLS filtert zeilenweise);
    // erwartet wird eine ABWEISUNG, weil anon gar kein SELECT-Recht hat.
    const zu = r.status === 401 || r.status === 403 || r.status === 404
    melde(zu, `${t}: anon → HTTP ${r.status}${zu ? '' : ' — LECK, anon darf lesen'}`)
  }
} else if (alleDa) {
  console.log('\n⚠️  B) übersprungen: kein öffentlicher Schlüssel gefunden.')
}

if (alleDa) {
  console.log('\n═══ C) Bestand ═══')
  console.log(`   Einwilligungen gesamt: ${stand.marketing_consents}`)
  const offen = await fetch(
    `${URL_}/rest/v1/marketing_consents?select=*&revoked_at=is.null&limit=1`,
    { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } },
  ).then((r) => Number((r.headers.get('content-range') || '').split('/')[1] ?? 0))
  console.log(`   davon offen (versandfähig machend): ${offen}`)
  console.log(`   Sperrliste: ${stand.email_suppression_list}`)
  console.log(`   Kampagnen: ${stand.email_campaigns}`)
  console.log(`   Zustellspur: ${stand.email_campaign_logs}`)
  console.log(`   Automationen: ${stand.marketing_automations}`)

  const aktive = await fetch(
    `${URL_}/rest/v1/marketing_automations?select=automation_key&aktiv=is.true`,
    { headers: H },
  ).then((r) => (r.ok ? r.json() : []))
  melde(
    aktive.length === 0,
    aktive.length === 0
      ? 'Keine Automation ist scharf geschaltet — so soll es sein.'
      : `${aktive.length} Automation(en) SCHARF: ${aktive.map((a) => a.automation_key).join(', ')}`,
  )

  if (offen === 0) {
    console.log('\n   ℹ️  Ohne offene Einwilligung ist JEDER Trockenlauf 0 versandfähig.')
    console.log('      Das ist die richtige Antwort auf die Datenlage, kein Fehler.')
  }
}

console.log('\n═══ D) Werbeversand-Schalter ═══')
const flagRoh = envWert('MARKETINGVERSAND_FREIGEGEBEN')
// Der Rohwert wird NICHT ausgegeben — nur die Einordnung.
if (!flagRoh) {
  console.log('🔒 MARKETINGVERSAND_FREIGEGEBEN ist lokal nicht gesetzt: Versand gesperrt.')
  console.log('   (Maßgeblich ist die Vercel-Umgebung, nicht diese Datei.)')
} else if (flagRoh === '1') {
  console.log('⚠️  MARKETINGVERSAND_FREIGEGEBEN steht lokal auf 1 — in einem Produktionslauf SCHARF.')
} else {
  console.log('🔒 MARKETINGVERSAND_FREIGEGEBEN trägt einen Wert, der nicht 1 ist: Versand gesperrt.')
}

console.log('\n═══ E) Adressierbarer Bestand ═══')
const profile = await fetch(
  `${URL_}/rest/v1/profiles?select=id,role,email,is_test,deleted_at&role=in.(kunde,engel)`,
  { headers: H },
).then((r) => (r.ok ? r.json() : []))

const echt = profile.filter((p) => !p.is_test && !p.deleted_at && p.email)
console.log(`   profiles (kunde/engel): ${profile.length}`)
console.log(`   davon echt und mit Adresse: ${echt.length}`)
console.log(`     Kundschaft: ${echt.filter((p) => p.role === 'kunde').length}`)
console.log(`     Engel:      ${echt.filter((p) => p.role === 'engel').length}`)

// lead_inquiries: die E-Mail-Lücke sichtbar halten, damit sie nicht in
// Vergessenheit gerät und jemand später „34 Leads" als Empfänger einplant.
const leadSpalten = await fetch(`${URL_}/rest/v1/`, { headers: H })
  .then((r) => r.json())
  .then((s) => Object.keys(s.definitions?.lead_inquiries?.properties ?? {}))
const hatLeadMail = leadSpalten.includes('email')
console.log(
  `   lead_inquiries: ${hatLeadMail ? 'hat eine E-Mail-Spalte' : 'KEINE E-Mail-Spalte — per Mail nicht erreichbar'}`,
)

console.log('\n' + '═'.repeat(60))
if (fehler === 0) {
  console.log('✅ verify-marketing OK')
  process.exit(0)
}
console.log(`❌ verify-marketing: ${fehler} Befund(e)`)
process.exit(1)
