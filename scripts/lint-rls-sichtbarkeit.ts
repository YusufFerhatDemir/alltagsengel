#!/usr/bin/env tsx
/**
 * ═══════════════════════════════════════════════════════════════════════
 * Sieht die Rolle, für die eine Seite gebaut ist, dort überhaupt etwas?
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (29.08.2026), der zu dieser Prüfung geführt hat:
 *
 * `/admin/nachweise` steht in der Navigation und ist über `BEREICHE` für
 * `personal.lesen` freigegeben — also für `pdl` und `qm`. Die Seite liest
 * `caregiver_qualifications` und `caregivers` mit dem BROWSER-Client, also
 * unter RLS. Auf `caregiver_qualifications` steht live genau eine
 * verwaltende Policy: `is_admin()`, und `is_admin()` ist auf
 * `admin`/`superadmin` beschränkt.
 *
 * Für die Pflegedienstleitung kommt damit eine LEERE Liste zurück. Kein
 * Fehler, keine Meldung — „Keine Nachweise vorhanden". Eine Seite, die
 * Ablaufwarnungen zu Führungszeugnissen zeigen soll, sagt der Rolle, die
 * sie braucht, dass alles in Ordnung ist.
 *
 * Das ist keine Einzelfrage der einen Seite, sondern eine Klasse. Wer eine
 * Admin-Seite über den Browser-Client lesen lässt, verlässt sich auf RLS —
 * und die RLS dieses Schemas kennt drei verschiedene Wege für
 * Verwaltungsrollen:
 *
 *   is_admin()            → nur admin, superadmin
 *   is_internal_staff()   → admin, superadmin, pdl, buero
 *   darf('bereich.recht') → jede Rolle, deren Matrix dieses Recht führt
 *
 * Fehlt für eine Tabelle der dritte Weg, sieht jede Rolle ausser der
 * Administration nichts — obwohl der Seiten-Guard sie durchgelassen hat.
 *
 * ── WAS DIESE PRÜFUNG TUT ────────────────────────────────────────────
 * Sie liest die Policies LIVE aus `pg_policies` (nicht aus Migrationen —
 * die sagen, was gelten sollte, nicht was gilt), bestimmt je Seite die
 * Rollen, die der Guard durchlässt, und meldet jede Kombination aus Seite,
 * Rolle und Tabelle, bei der die Rolle keinen einzigen Lesepfad hat.
 *
 * ── WAS SIE NICHT TUT ────────────────────────────────────────────────
 * Sie wertet Policy-Ausdrücke nicht aus, sie ERKENNT die drei bekannten
 * Muster. Alles andere (Eigene-Zeilen-Pfade wie `eigene_caregiver_ids()`
 * oder `clients.user_id = auth.uid()`) zählt bewusst NICHT als Lesepfad
 * für eine Verwaltungsrolle — das ist die richtige Richtung des Zweifels:
 * ein übersehener Pfad erzeugt eine zu prüfende Meldung, ein zu
 * grosszügiger Schluss eine übersehene leere Seite.
 *
 * Exit-Code 0 = keine Befunde. Mit `--strict` wird jeder Befund zum Fehler.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  werteAus, IS_ADMIN_ROLLEN, IS_STAFF_ROLLEN, type Policy,
} from '../lib/auth/rls-sichtbarkeit'

const WURZEL = process.cwd()
const STRENG = process.argv.includes('--strict')

/** Feld- und Satztrenner für die Antwort des Lese-Orakels. */
const FELD = '<<|>>'
const SATZ = '<<||>>'

function envWert(name: string): string | undefined {
  const zeilen = readFileSync(join(WURZEL, '.env.local'), 'utf8').split('\n')
  for (const z of zeilen) {
    const i = z.indexOf('=')
    if (i > 0 && z.slice(0, i).trim() === name) return z.slice(i + 1).trim()
  }
  return undefined
}

/**
 * Lese-Orakel `public._run_sql`: der Block endet IMMER mit RAISE, die
 * Transaktion rollt also zurück. Es wird ausschliesslich gelesen.
 */
async function orakel(sql: string): Promise<string> {
  const basis = envWert('NEXT_PUBLIC_SUPABASE_URL')
  const key = envWert('SUPABASE_SERVICE_ROLE_KEY')
  if (!basis || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in .env.local')

  const res = await fetch(`${basis}/rest/v1/rpc/_run_sql`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p: sql }),
  })
  const text = await res.text()
  let j: { message?: string } | null = null
  try { j = JSON.parse(text) } catch { /* Fehlertexte sind nicht immer JSON */ }
  const msg = j?.message ?? text
  const i = msg.indexOf('ORAKEL:')
  if (i === -1) throw new Error(`Orakel unerwartet (HTTP ${res.status}): ${msg.slice(0, 400)}`)
  return msg.slice(i + 7)
}

/** Alle permissiven Lese-Policies der genannten Tabellen. */
async function ladePolicies(tabellen: string[]): Promise<Policy[]> {
  const liste = tabellen.map(t => `'${t}'`).join(',')
  const sql = `DO $ora$ DECLARE r text; BEGIN
    SELECT coalesce(string_agg(
             tablename || '${FELD}' || policyname || '${FELD}' ||
             replace(replace(coalesce(qual, ''), chr(10), ' '), chr(13), ' '),
             '${SATZ}'), '')
      INTO r FROM pg_policies
     WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
       AND cmd IN ('ALL','SELECT') AND tablename IN (${liste});
    RAISE EXCEPTION 'ORAKEL:%', r; END $ora$;`
  const roh = await orakel(sql)
  if (!roh.trim()) return []
  return roh.split(SATZ).map(z => {
    const [tabelle, name, qual] = z.split(FELD)
    return { tabelle, name, qual: qual ?? '' }
  })
}

/** Prüft, ob die hier abgebildeten Helferrollen der Live-Fassung entsprechen. */
async function pruefeHelferAnnahme(): Promise<string[]> {
  const abweichungen: string[] = []
  const defs = await orakel(
    `DO $ora$ DECLARE r text; BEGIN
       SELECT coalesce(string_agg(
                proname || '${FELD}' || replace(pg_get_functiondef(oid), chr(10), ' '),
                '${SATZ}'), '')
         INTO r FROM pg_proc WHERE proname IN ('is_admin','is_internal_staff');
       RAISE EXCEPTION 'ORAKEL:%', r; END $ora$;`,
  )
  for (const eintrag of defs.split(SATZ)) {
    const [name, def] = eintrag.split(FELD)
    if (!name) continue
    const erwartet = name === 'is_admin' ? IS_ADMIN_ROLLEN : IS_STAFF_ROLLEN
    for (const rolle of erwartet) {
      if (!def?.includes(`'${rolle}'`)) {
        abweichungen.push(`${name}() nennt live NICHT '${rolle}' — die Annahme dieser Prüfung ist überholt.`)
      }
    }
  }
  return abweichungen
}

/** Alle Admin-Seiten, die direkt über den Browser-Client lesen. */
function seitenMitDirektzugriff(): Map<string, string[]> {
  const treffer = new Map<string, string[]>()
  const lauf = (verzeichnis: string) => {
    for (const eintrag of readdirSync(verzeichnis)) {
      const pfad = join(verzeichnis, eintrag)
      if (statSync(pfad).isDirectory()) { lauf(pfad); continue }
      if (eintrag !== 'page.tsx') continue
      const inhalt = readFileSync(pfad, 'utf8')
      if (!inhalt.includes('@/lib/supabase/client')) continue
      const tabellen = [...new Set([...inhalt.matchAll(/\.from\('([a-z_0-9]+)'\)/g)].map(m => m[1]))]
      if (tabellen.length === 0) continue
      const route = pfad.slice(WURZEL.length).replace(/^\/?app/, '').replace(/\/page\.tsx$/, '')
      treffer.set(route, tabellen)
    }
  }
  lauf(join(WURZEL, 'app', 'admin'))
  return treffer
}

async function main() {
  const seiten = seitenMitDirektzugriff()
  const tabellen = [...new Set([...seiten.values()].flat())]

  const abweichungen = await pruefeHelferAnnahme()
  const policies = await ladePolicies(tabellen)
  const { befunde, ohnePolicy } = werteAus(seiten, policies)

  console.log('── RLS-Sichtbarkeit von Admin-Seiten ───────────────────────')
  console.log(`   Seiten mit Direktzugriff über den Browser-Client: ${seiten.size}`)
  console.log(`   dabei gelesene Tabellen:                          ${tabellen.length}`)
  console.log(`   live gelesene permissive Lese-Policies:           ${policies.length}`)
  console.log()

  if (abweichungen.length > 0) {
    console.log('⚠  Annahme über die Helferfunktionen weicht ab:')
    abweichungen.forEach(a => console.log(`   ${a}`))
    console.log()
  }

  if (ohnePolicy.length > 0) {
    console.log('ℹ  Ohne jede permissive Lese-Policy (nicht bewertet):')
    ohnePolicy.forEach(z => console.log(`   ${z}`))
    console.log()
  }

  if (befunde.length === 0) {
    console.log('✅ Keine Seite ist für eine zugelassene Rolle blind.')
    process.exit(0)
  }

  console.log(`❌ ${befunde.length} Seite/Rolle-Paare sehen unter RLS NICHTS:`)
  console.log()
  for (const b of befunde) {
    console.log(`   ${b.seite}  ·  Rolle "${b.rolle}"`)
    console.log(`      blind auf: ${b.tabellen.join(', ')}`)
  }
  console.log()
  console.log('   Bedeutung: die Seite ist für diese Rolle freigegeben, liefert ihr aber eine')
  console.log('   LEERE Ansicht statt einer Fehlermeldung. Zwei Wege heraus — die Seite über')
  console.log('   eine API-Route lesen lassen (Dienstschlüssel hinter einem Guard), oder der')
  console.log("   Tabelle eine rk_-Policy mit darf('…') geben.")

  process.exit(STRENG ? 1 : 0)
}

main().catch(err => { console.error(err); process.exit(2) })
