#!/usr/bin/env node
/**
 * Live-Verifikation des Registrierungs-Flows gegen die Production-DB.
 *
 * Vorfall 2026-08-11: BEFORE-INSERT-Trigger auf public.profiles
 * (trg_prevent_role_escalation_insert → prevent_role_escalation(), fuer
 * UPDATE geschrieben, referenziert OLD.role) blockierte JEDE Registrierung
 * (kunde/engel/fahrer) mit "Database error saving new user". Fix:
 * supabase/migrations/20260808170000_role_guard_insert_fix.sql
 * (prevent_privileged_role_insert, blockiert nur admin/superadmin).
 *
 * Dieses Skript reproduziert exakt den Browser-Flow: legt fuer 'kunde' und
 * 'engel' je ein Wegwerfkonto per public signUp() an (kein Service-Role-Weg,
 * damit derselbe Pfad wie ein echter Bewerber getestet wird), prueft ob ein
 * Datenbankfehler auftritt, und loescht das Konto sofort wieder per
 * Service-Role admin.deleteUser(). Siehe audit/PR33_AUTH_PRODUCTION_ABNAHME.md
 * fuer das Vorbild dieses Verfahrens.
 *
 * Exit 0 = Registrierung funktioniert fuer alle getesteten Rollen.
 * Exit 1 = mindestens eine Rolle scheitert.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !ANON) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen.')
  process.exit(1)
}
if (!SVC) {
  console.error('SUPABASE_SERVICE_ROLE_KEY fehlt — Cleanup nicht moeglich, breche ab statt Testkonten liegenzulassen.')
  process.exit(1)
}

const anon = createClient(URL, ANON)
const admin = createClient(URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } })

async function testRolle(role) {
  const email = `verify-reg-${role}-${Date.now()}@alltagsengel-test.local`
  const password = 'VerifyTest_' + Math.random().toString(36).slice(2) + 'Aa1!'

  const { data, error } = await anon.auth.signUp({
    email,
    password,
    options: { data: { first_name: 'Verify', last_name: 'Test', role } },
  })

  if (error) {
    console.log(`FAIL  role=${role}  ${error.message} (status=${error.status}, code=${error.code})`)
    return false
  }

  const userId = data.user?.id
  let ok = true

  if (userId) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle()
    if (!profile) {
      console.log(`FAIL  role=${role}  signUp OK, aber kein profiles-Datensatz angelegt`)
      ok = false
    } else {
      console.log(`OK    role=${role}  signUp + profiles-Datensatz vorhanden`)
    }
    const { error: delErr } = await admin.auth.admin.deleteUser(userId)
    if (delErr) console.log(`  Cleanup-Warnung fuer ${email}: ${delErr.message}`)
  } else {
    console.log(`FAIL  role=${role}  kein Fehler, aber auch kein user zurueckgegeben`)
    ok = false
  }

  return ok
}

const rollen = ['kunde', 'engel']
const ergebnisse = await Promise.all(rollen.map(testRolle))
const alleOk = ergebnisse.every(Boolean)

console.log(alleOk ? '\nAlle Rollen: Registrierung funktioniert.' : '\nMindestens eine Rolle scheitert — Registrierung ist NICHT funktionsfaehig.')
process.exit(alleOk ? 0 : 1)
