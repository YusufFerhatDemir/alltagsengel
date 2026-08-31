#!/usr/bin/env node
/**
 * Sammelt die Rohdaten fuer die Beleg-Screenshots (nur lesend).
 *
 * Schreibt je Abfrage eine JSON-Datei nach docs/security/belege/roh/.
 * KEINE Zugangsdaten in der Ausgabe: gedruckt werden nur Ergebnisse.
 */
import fs from 'node:fs'
import { apiHeaders, secretKey, envWert } from './lib/supabase-keys.mjs'

const BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const KEY = secretKey()
if (!BASIS || !KEY) { console.error('Supabase-URL/Dienstschluessel fehlen'); process.exit(1) }

const ZIEL = 'docs/security/belege/roh'
fs.mkdirSync(ZIEL, { recursive: true })

const EVENT_A = '8dfd95d7-f64a-43bc-98c6-0f6b5471fef1'
const EVENT_B = 'cf56c43b-ed70-42c7-b8e5-686d4875761e'
const WATCHLIST_ID = '12db4b18-4b8b-4153-8752-b628d0e1ba12'
const RUKIYE = '5fa1df42-8eb5-416b-abb5-0c85a057e957'

async function hole(name, pfad) {
  const res = await fetch(`${BASIS}/rest/v1/${pfad}`, { headers: apiHeaders(KEY) })
  const txt = await res.text()
  let daten = null
  try { daten = JSON.parse(txt) } catch { /* Klartext */ }
  const eintrag = { name, pfad, status: res.status, zeilen: Array.isArray(daten) ? daten.length : null, daten: daten ?? txt }
  fs.writeFileSync(`${ZIEL}/${name}.json`, JSON.stringify(eintrag, null, 2))
  console.log(`${String(res.status).padEnd(4)} ${String(eintrag.zeilen ?? '-').padStart(3)} Zeilen  ${name}`)
  return eintrag
}

/** schema_migrations liegt ausserhalb von PostgREST — Lesen ueber den RAISE-Umweg. */
async function orakel(name, ausdruck) {
  const res = await fetch(`${BASIS}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: apiHeaders(KEY, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p: `DO $q$ BEGIN RAISE EXCEPTION 'ORAKEL=%', (${ausdruck}); END $q$;` }),
  })
  const txt = await res.text()
  let json = null; try { json = JSON.parse(txt) } catch { /* egal */ }
  const roh = json?.message || txt || ''
  const m = roh.match(/ORAKEL=([\s\S]*)/)
  const wert = m ? m[1].replace(/"\s*[,}]?\s*$/, '').trim() : `?? HTTP ${res.status}: ${roh.slice(0, 200)}`
  fs.writeFileSync(`${ZIEL}/${name}.json`, JSON.stringify({ name, ausdruck, wert }, null, 2))
  console.log(`ORAKEL  ${name}: ${wert.slice(0, 120)}`)
  return wert
}

console.log('\n=== 1 · security_audit_log — die beiden Test-Alarm-Ereignisse (alle Spalten) ===')
await hole('01_audit_events', `security_audit_log?id=in.(${EVENT_A},${EVENT_B})&select=*&order=created_at.asc`)

console.log('\n=== 1b · zugehoerige Meldezeilen (bezug_ereignis) ===')
await hole('02_audit_meldungen', `security_audit_log?event_type=eq.security_notification_sent&user_id=eq.${RUKIYE}&select=*&order=created_at.desc&limit=20`)

console.log('\n=== 2 · Watchlist-Eintrag Rukiye Karakaya ===')
await hole('03_watchlist', `security_watchlist?id=eq.${WATCHLIST_ID}&select=*`)

console.log('\n=== 3 · Zustellspur ===')
await hole('04_delivery_log', `notification_delivery_log?select=*&order=created_at.desc&limit=25`)

console.log('\n=== 4 · Migrationsstand ===')
await orakel('05_migrationen_anzahl', `SELECT count(*)::text FROM supabase_migrations.schema_migrations`)
await orakel('05_migrationen_letzte', `SELECT string_agg(version, ', ' ORDER BY version DESC) FROM (SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 15) t`)
await orakel('05_migrationen_max', `SELECT max(version) FROM supabase_migrations.schema_migrations`)
console.log('\nfertig — Rohdaten unter ' + ZIEL)
