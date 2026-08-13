/**
 * Bereinigt Test- und Demodaten aus der Produktions-Datenbank.
 *
 *   npx tsx scripts/bereinige-testdaten.ts            # Trockenlauf, ändert nichts
 *   npx tsx scripts/bereinige-testdaten.ts --apply     # löscht
 *
 * Zweck: die zwei Datenhygiene-Punkte schliessen, die /admin/go-live als
 * BLOCKED zählt — Demo-Bewertungen (Bereich „Security") und Testmandanten
 * (Bereich „Production").
 *
 * ── WAS DIESES SKRIPT NICHT TUT ────────────────────────────────────────────
 * Es rät nicht, was Testdaten sind. Gelöscht wird ausschliesslich, was sich
 * technisch als Fixture ausweist:
 *
 *   1. Bewertungen, deren angel_id oder reviewer_id eine Wiederholziffern-UUID
 *      ist (33333333-…). Erkennung über `istSeedUuid` aus lib/go-live/status —
 *      dieselbe Funktion, die das Dashboard zum Zählen benutzt.
 *   2. Organisationen mit „TEST" im Namen — dieselbe Bedingung, die das
 *      Dashboard zählt — ausser der Stamm-Organisation.
 *
 * ── FAIL-CLOSED ────────────────────────────────────────────────────────────
 * Vor dem Löschen einer Organisation wird geprüft, ob Nutzdaten daran hängen
 * (Klienten, Einsätze, Rechnungen, Buchungen, Mitarbeitende, Abrechnungen).
 * Findet sich auch nur eine Zeile, wird die Organisation NICHT gelöscht und
 * der Fund gemeldet. Lieber ein Blocker bleibt stehen, als dass echte Daten
 * verschwinden, weil jemand einen Mandanten „Testpflege GmbH" genannt hat.
 *
 * Mitgelöscht werden nur reine Konfigurationszeilen der Testmandanten
 * (`state_settings` — pro Mandant 16 Bundesland-Schalter). Sie enthalten keine
 * Personen- oder Leistungsdaten und blockieren sonst per Fremdschlüssel.
 *
 * ── BEKANNTE GRENZE: UNLÖSCHBARE MANDANTEN ─────────────────────────────────
 * `wf_audit_log` ist absichtlich unveränderlich (BEFORE-DELETE-Trigger aus
 * 20260813010000_workflow_engine.sql) und referenziert `organizations` per
 * Fremdschlüssel. Hat der tägliche Fristen-Cron für einen Testmandanten auch
 * nur eine Zeile geschrieben, ist dieser Mandant nicht mehr löschbar — der
 * Lauf meldet ihn dann unter „Bewusst stehen gelassen".
 *
 * Das ist kein Fehler, sondern der Preis der Audit-Unveränderlichkeit. Der
 * Trigger wird NICHT abgeschaltet und die Audit-Zeilen werden NICHT gelöscht;
 * ein Audit-Log, das man zum Aufräumen kurz deaktiviert, ist keins. Betroffen
 * ist derzeit E2E_TEST_DEL_ORG_A (6 Zeilen `fristen_check` vom 08.–13.08.2026).
 * Wer das auflösen will, braucht eine Migration, die den Fremdschlüssel auf
 * ON DELETE SET NULL umstellt — das ist eine Schema-Entscheidung, keine
 * Aufräumaktion, und gehört nicht in dieses Skript.
 */

import { config } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { istSeedUuid } from '../lib/go-live/status'
import { DEFAULT_ORG_ID } from '../lib/organizations/types'

config({ path: '.env.local' })
config({ path: '.env' })

/** Tabellen, deren Existenz an einem Mandanten beweist: das sind keine reinen Fixtures. */
const NUTZDATEN_TABELLEN = [
  'clients',
  'service_records',
  'invoices',
  'bookings',
  'caregivers',
  'billing_tariffs',
  'abrechnungslaeufe',
  'documents',
  'assignments',
] as const

/** Reine Konfigurationszeilen ohne Personenbezug, die mit dem Mandanten weggehen. */
const KONFIG_TABELLEN = ['state_settings'] as const

const ANWENDEN = process.argv.includes('--apply')

function log(zeile: string) {
  console.log(zeile)
}

/**
 * Zählt Zeilen. Ein Fehler (Tabelle fehlt, Spalte fehlt) liefert `null` und
 * gilt als „nicht auszuschliessen" — der Aufrufer behandelt das wie Nutzdaten.
 */
async function zaehle(sb: SupabaseClient, tabelle: string, orgId: string): Promise<number | null> {
  const res = await sb.from(tabelle).select('id', { count: 'exact', head: true }).eq('organization_id', orgId)
  if (res.error) {
    // Spalte/Tabelle gibt es nicht → dieser Mandant kann dort nichts haben.
    const msg = res.error.message.toLowerCase()
    if (msg.includes('does not exist') || msg.includes('could not find')) return 0
    return null
  }
  return res.count ?? 0
}

async function bereinigeBewertungen(sb: SupabaseClient): Promise<{ gefunden: number; geloescht: number }> {
  log('\n── Demo-Bewertungen ────────────────────────────────────────────')
  const { data, error } = await sb.from('reviews').select('id, angel_id, reviewer_id, rating, comment')
  if (error) {
    log(`  ✕ reviews nicht lesbar: ${error.message}`)
    return { gefunden: 0, geloescht: 0 }
  }

  const alle = data ?? []
  const seeds = alle.filter(r => istSeedUuid(r.angel_id) || istSeedUuid(r.reviewer_id))
  log(`  ${alle.length} Bewertung(en) gesamt, davon ${seeds.length} mit Seed-UUID.`)

  for (const r of seeds) {
    log(`    · ${r.id} — ${r.rating}★ „${String(r.comment ?? '').slice(0, 60)}" (angel ${r.angel_id}, reviewer ${r.reviewer_id})`)
  }
  if (seeds.length === 0) return { gefunden: 0, geloescht: 0 }
  if (!ANWENDEN) {
    log(`  → Trockenlauf: ${seeds.length} Zeile(n) würden gelöscht.`)
    return { gefunden: seeds.length, geloescht: 0 }
  }

  const del = await sb.from('reviews').delete().in('id', seeds.map(r => r.id))
  if (del.error) {
    log(`  ✕ Löschen fehlgeschlagen: ${del.error.message}`)
    return { gefunden: seeds.length, geloescht: 0 }
  }
  log(`  ✓ ${seeds.length} Demo-Bewertung(en) gelöscht.`)
  return { gefunden: seeds.length, geloescht: seeds.length }
}

async function bereinigeTestmandanten(sb: SupabaseClient): Promise<{ gefunden: number; geloescht: number; behalten: string[] }> {
  log('\n── Testmandanten ───────────────────────────────────────────────')
  const { data, error } = await sb.from('organizations').select('id, name, created_at').ilike('name', '%TEST%')
  if (error) {
    log(`  ✕ organizations nicht lesbar: ${error.message}`)
    return { gefunden: 0, geloescht: 0, behalten: [] }
  }

  const kandidaten = (data ?? []).filter(o => o.id !== DEFAULT_ORG_ID)
  log(`  ${kandidaten.length} Organisation(en) mit „TEST" im Namen (Stamm-Organisation ausgenommen).`)

  let geloescht = 0
  const behalten: string[] = []

  for (const org of kandidaten) {
    log(`\n  Mandant „${org.name}" (${org.id}, angelegt ${String(org.created_at).slice(0, 10)})`)

    // Fail-closed-Prüfung: hängen Nutzdaten dran?
    const belegt: string[] = []
    for (const t of NUTZDATEN_TABELLEN) {
      const n = await zaehle(sb, t, org.id)
      if (n === null) { belegt.push(`${t}: nicht prüfbar`); continue }
      if (n > 0) belegt.push(`${t}: ${n}`)
    }
    if (belegt.length > 0) {
      log(`    ✕ NICHT gelöscht — Nutzdaten vorhanden: ${belegt.join(', ')}`)
      behalten.push(`${org.name} (${belegt.join(', ')})`)
      continue
    }
    log('    ✓ keine Nutzdaten (Klienten, Einsätze, Rechnungen, Buchungen, Mitarbeitende, Tarife, Abrechnungen, Dokumente).')

    for (const t of KONFIG_TABELLEN) {
      const n = await zaehle(sb, t, org.id)
      log(`    · ${t}: ${n ?? '?'} Konfigurationszeile(n) — gehen mit`)
    }

    if (!ANWENDEN) {
      log('    → Trockenlauf: würde gelöscht.')
      continue
    }

    for (const t of KONFIG_TABELLEN) {
      const del = await sb.from(t).delete().eq('organization_id', org.id)
      if (del.error) log(`    ✕ ${t}: ${del.error.message}`)
    }
    const del = await sb.from('organizations').delete().eq('id', org.id)
    if (del.error) {
      log(`    ✕ Löschen fehlgeschlagen: ${del.error.message}`)
      behalten.push(`${org.name} (${del.error.message})`)
      continue
    }
    log('    ✓ gelöscht.')
    geloescht++
  }

  return { gefunden: kandidaten.length, geloescht, behalten }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.')
    process.exit(2)
  }

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  log(ANWENDEN ? 'Testdaten-Bereinigung — ANWENDEN (löscht)' : 'Testdaten-Bereinigung — Trockenlauf (ändert nichts)')

  const bewertungen = await bereinigeBewertungen(sb)
  const mandanten = await bereinigeTestmandanten(sb)

  log('\n── Ergebnis ────────────────────────────────────────────────────')
  log(`  Demo-Bewertungen: ${bewertungen.geloescht} von ${bewertungen.gefunden} gelöscht`)
  log(`  Testmandanten:    ${mandanten.geloescht} von ${mandanten.gefunden} gelöscht`)
  if (mandanten.behalten.length > 0) {
    log('\n  Bewusst stehen gelassen:')
    for (const b of mandanten.behalten) log(`    - ${b}`)
  }
  if (!ANWENDEN) log('\n  Nichts geändert. Mit --apply ausführen.')
  log('\n  Danach: npx tsx scripts/go-live-check.ts')
}

main().catch(err => {
  console.error(err)
  process.exit(2)
})
