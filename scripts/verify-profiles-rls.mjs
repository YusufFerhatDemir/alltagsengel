#!/usr/bin/env node
/**
 * Verifiziert den RLS-Zustand von public.profiles gegen die LIVE-Datenbank.
 *
 * Prüft die drei Zusagen der Migration
 * 20260815010000_profiles_rls_rekursion_und_anon_leck.sql:
 *
 *   A) Keine 42P17-Rekursion mehr — profiles ist ueberhaupt lesbar.
 *   B) Kein anon-Leseleck — ein unangemeldeter Aufrufer bekommt 0 Zeilen.
 *   C) Datenbestand unveraendert — die Zeilenzahl stimmt mit der Baseline.
 *
 * Nur lesend. Es wird nichts geschrieben, nichts geloescht, kein DDL.
 *
 * Aufruf:
 *   node scripts/verify-profiles-rls.mjs            # Baseline 59 Profile
 *   node scripts/verify-profiles-rls.mjs --erwartet 61
 *
 * Exit 0 = alle Pruefungen bestanden, Exit 1 = mindestens eine offen.
 * Vor dem Apply der Migration schlaegt (A) erwartungsgemaess fehl.
 */

import { readFileSync, existsSync } from 'node:fs'

// ── Env laden (.env.local hat Vorrang, wie in Next.js) ──────────
for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const wert = m[2].replace(/^["']|["']$/g, '')
    if (!process.env[m[1]]) process.env[m[1]] = wert
  }
}

const URL_BASIS = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_BASIS || !ANON || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY oder SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const argErwartet = process.argv.indexOf('--erwartet')
const ERWARTETE_ZEILEN = argErwartet !== -1 ? Number(process.argv[argErwartet + 1]) : 59

async function hole(pfad, schluessel, extraHeader = {}) {
  const res = await fetch(`${URL_BASIS}/rest/v1/${pfad}`, {
    headers: { apikey: schluessel, Authorization: `Bearer ${schluessel}`, ...extraHeader },
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* Fehlertexte sind nicht immer JSON */ }
  return { status: res.status, json, text, headers: res.headers }
}

const ergebnisse = []
function pruefe(id, bestanden, meldung) {
  ergebnisse.push({ id, bestanden, meldung })
  console.log(`${bestanden ? '  OK  ' : ' FEHL '} ${id.padEnd(28)} ${meldung}`)
}

console.log(`\nprofiles-RLS gegen ${URL_BASIS.replace(/^https:\/\//, '')}\n`)

// ── A) + B) beide aus EINER anon-Anfrage ────────────────────────
//
// Bewusst NICHT mit dem service_role-Key geprueft: service_role umgeht RLS
// vollstaendig und liefert auch bei kaputten Policies HTTP 200. Die
// 42P17-Rekursion zeigt sich ausschliesslich fuer Rollen, die die Policies
// tatsaechlich durchlaufen — anon und authenticated.
const anon = await hole('profiles?select=id,email&limit=5', ANON)

if (anon.status === 500 && anon.json?.code === '42P17') {
  pruefe('A_keine_rekursion', false, '42P17 — Migration 20260815010000 ist NICHT angewendet')
  pruefe('B_kein_anon_leck', false, 'durch die Rekursion verdeckt — erst nach (A) bewertbar')
} else if (Array.isArray(anon.json)) {
  pruefe('A_keine_rekursion', true, 'anon durchlaeuft die Policies ohne 42P17')
  if (anon.json.length === 0) {
    pruefe('B_kein_anon_leck', true, 'anon liest 0 Zeilen')
  } else {
    pruefe('B_kein_anon_leck', false, `LECK: anon liest ${anon.json.length} Profil(e) inkl. E-Mail`)
  }
} else if (anon.status === 401 || anon.status === 403) {
  pruefe('A_keine_rekursion', true, `anon abgewiesen (HTTP ${anon.status}) — keine Rekursion`)
  pruefe('B_kein_anon_leck', true, `anon hat keinen Zugriff (HTTP ${anon.status})`)
} else {
  pruefe('A_keine_rekursion', false, `unerwartet HTTP ${anon.status}: ${anon.text.slice(0, 160)}`)
  pruefe('B_kein_anon_leck', false, 'nicht bewertbar')
}

// ── C) Datenbestand ─────────────────────────────────────────────
const zaehlung = await hole('profiles?select=id', SERVICE, { Prefer: 'count=exact' })
const bereich = zaehlung.headers.get('content-range')
const anzahl = bereich ? Number(bereich.split('/')[1]) : null
if (anzahl === null) {
  pruefe('C_datenbestand', false, `Zeilenzahl nicht ermittelbar (HTTP ${zaehlung.status})`)
} else {
  pruefe('C_datenbestand', anzahl === ERWARTETE_ZEILEN, `${anzahl} Profile (erwartet ${ERWARTETE_ZEILEN})`)
}

// ── Ergebnis ────────────────────────────────────────────────────
const offen = ergebnisse.filter(e => !e.bestanden)
console.log(`\n${ergebnisse.length - offen.length}/${ergebnisse.length} bestanden\n`)

if (offen.length > 0) {
  console.log('Offen:')
  for (const e of offen) console.log(`  - ${e.id}: ${e.meldung}`)
  console.log('\nApply-Weg (DDL ist ueber PostgREST nicht moeglich):')
  console.log('  Supabase Dashboard → SQL Editor → Inhalt von')
  console.log('  supabase/migrations/20260815010000_profiles_rls_rekursion_und_anon_leck.sql')
  console.log('  einfuegen und ausfuehren. Danach dieses Skript erneut starten.\n')
  process.exit(1)
}

process.exit(0)
