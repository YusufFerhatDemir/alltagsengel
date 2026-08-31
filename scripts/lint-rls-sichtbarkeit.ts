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

/**
 * Obergrenze fuer die Zahl blinder Seite/Rolle-Paare (`--hoechstens <n>`).
 *
 * WARUM EINE OBERGRENZE UND NICHT `--strict`
 * Am 31.08.2026 standen 52 Paare offen. Sie sind kein Datenleck — die
 * Seite zeigt der Rolle NICHTS statt zu viel —, aber jedes einzelne ist
 * eine stille Falschaussage gegenueber der Nutzerin: die Seite ist
 * freigegeben und bleibt leer, ohne zu sagen warum. Jedes Paar zu
 * schliessen heisst, je Tabelle zu entscheiden, WELCHE Rolle sie sehen
 * darf; das ist eine Sicherheitsentscheidung und keine Sammelaktion.
 *
 * `--strict` haette den Bau ab sofort blockiert und waere binnen einer
 * Woche mit `|| true` entschaerft worden — dann prueft die CI wieder
 * nichts. Die Obergrenze haelt stattdessen den Stand fest: bestehende
 * Paare stoeren nicht, ein NEUES bricht den Lauf. Wer eines schliesst,
 * setzt die Zahl in .github/workflows/ci.yml herunter.
 */
const grenzeArg = process.argv.indexOf('--hoechstens')
const HOECHSTENS = grenzeArg !== -1 ? Number(process.argv[grenzeArg + 1]) : null

/** Feld- und Satztrenner für die Antwort des Lese-Orakels. */
const FELD = '<<|>>'
const SATZ = '<<||>>'

/**
 * Zugangsdaten: erst die Prozessumgebung, dann `.env.local`.
 *
 * Die Reihenfolge ist wichtig geworden, seit dieser Lint in der CI laeuft
 * (31.08.2026). Dort gibt es KEINE `.env.local` — die alte Fassung las die
 * Datei unbedingt und waere mit ENOENT abgestuerzt, also mit einem roten
 * Lauf, der nichts ueber RLS aussagt.
 *
 * Fehlt die Datei, ist das deshalb kein Fehler, sondern der Normalfall auf
 * einem Bauknecht. Fehlen dagegen BEIDE Quellen, sagt main() das laut und
 * endet — es tut NICHT so, als haette es geprueft.
 */
function envWert(name: string): string | undefined {
  const ausProzess = process.env[name]
  if (ausProzess && ausProzess.trim()) return ausProzess.trim()

  let zeilen: string[]
  try {
    zeilen = readFileSync(join(WURZEL, '.env.local'), 'utf8').split('\n')
  } catch {
    return undefined
  }
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
  // Beide Schreibweisen: die CI reicht SUPABASE_SECRET_KEY durch und setzt
  // SUPABASE_SERVICE_ROLE_KEY bewusst leer (siehe ci.yml).
  const key = envWert('SUPABASE_SERVICE_ROLE_KEY') ?? envWert('SUPABASE_SECRET_KEY')
  if (!basis || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY fehlen '
      + '— weder in der Prozessumgebung noch in .env.local.',
    )
  }

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
      const roh = readFileSync(pfad, 'utf8')
      if (!roh.includes('@/lib/supabase/client')) continue
      // FEHLBEFUND 31.08.2026: `supabase.storage.from('documents')` sieht
      // im Quelltext aus wie ein Tabellenzugriff und ist keiner — das ist
      // der SPEICHER-Eimer. /admin/sepa laedt darueber die SEPA-XML
      // herunter und wurde deshalb als „liest die Tabelle documents"
      // gefuehrt. Die Meldung war falsch, und eine rk_-Policy auf
      // `documents` haette der Buchhaltung die Fuehrungszeugnisse der
      // Mitarbeitenden geoeffnet, die dort live liegen. Der Speicherpfad
      // faellt deshalb VOR der Tabellensuche weg; RLS auf Storage ist eine
      // andere Frage (storage.objects) und gehoert nicht in diese Pruefung.
      const inhalt = roh.replace(/\.storage\s*\.from\('[a-z_0-9-]+'\)/g, '.storage.BUCKET')
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
  // Ohne Zugang wird NICHT geprueft — und das muss dranstehen. Ein Lauf,
  // der mangels Schluessel 0 Befunde meldet, saehe aus wie ein sauberes
  // Ergebnis (Befund „CRON_SECRET: gruener Lauf kein Beweis").
  const basis = envWert('NEXT_PUBLIC_SUPABASE_URL')
  const key = envWert('SUPABASE_SERVICE_ROLE_KEY') ?? envWert('SUPABASE_SECRET_KEY')
  if (!basis || !key) {
    console.log('── RLS-Sichtbarkeit ────────────────────────────────────────')
    console.log('⏭  UEBERSPRUNGEN: NEXT_PUBLIC_SUPABASE_URL und/oder')
    console.log('   SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY fehlen.')
    console.log('   Es wurde NICHTS geprueft — dieser Lauf ist kein Nachweis.')
    process.exit(0)
  }

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

  // Getrennt ausgeben. Eine fehlende Policy ist ein Fehler; ein fehlendes
  // Recht ist meistens eine Entscheidung. In einer gemeinsamen Liste geht
  // das eine im anderen unter.
  const luecken = befunde
    .map(b => ({ ...b, einzeln: b.einzeln.filter(e => e.grund === 'policy_fehlt') }))
    .filter(b => b.einzeln.length > 0)
  const gewollt = befunde
    .map(b => ({ ...b, einzeln: b.einzeln.filter(e => e.grund === 'recht_fehlt') }))
    .filter(b => b.einzeln.length > 0)

  console.log(`❌ ${befunde.length} Seite/Rolle-Paare sehen unter RLS NICHTS.`)
  console.log()

  if (luecken.length > 0) {
    console.log(`── A) ${luecken.length} × POLICY FEHLT — echte Luecke ────────────────────`)
    console.log('   Die Tabelle traegt keine Policy, die eine Berechtigung auswertet.')
    console.log('   Wer sie lesen darf, ist damit nirgends entschieden.')
    console.log()
    for (const b of luecken) {
      console.log(`   ${b.seite}  ·  Rolle "${b.rolle}"`)
      console.log(`      ${b.einzeln.map(e => e.tabelle).join(', ')}`)
    }
    console.log()
    console.log("   Abhilfe: rk_<tabelle>_lesen mit  darf('bereich.lesen')")
    console.log('            AND organization_id = current_org_id()')
    console.log()
  }

  if (gewollt.length > 0) {
    console.log(`── B) ${gewollt.length} × RECHT FEHLT — Entscheidung aus ROLLEN_MATRIX ────`)
    console.log('   Die Tabelle traegt sehr wohl Policies; diese Rolle hat das verlangte')
    console.log('   Recht nur nicht. Meistens ist das gewollt (die Buchhaltung sieht')
    console.log('   bewusst keine Personalakten). Der Fehler liegt dann NICHT bei der')
    console.log('   Policy, sondern daran, dass die Seite dieser Rolle angeboten wird')
    console.log('   und leer bleibt, statt zu sagen, dass sie nichts sehen darf.')
    console.log()
    for (const b of gewollt) {
      console.log(`   ${b.seite}  ·  Rolle "${b.rolle}"`)
      for (const e of b.einzeln) {
        console.log(`      ${e.tabelle}  —  verlangt: ${e.verlangteRechte.join(' oder ')}`)
      }
    }
    console.log()
    console.log('   Abhilfe: entweder das Recht in ROLLEN_MATRIX ergaenzen (bewusste')
    console.log('            Entscheidung), oder die Seite fuer diese Rolle sperren bzw.')
    console.log('            einen Hinweis statt einer leeren Tabelle zeigen.')
  }

  if (HOECHSTENS !== null && Number.isFinite(HOECHSTENS)) {
    if (befunde.length > HOECHSTENS) {
      console.log()
      console.log(`❌ Obergrenze ueberschritten: ${befunde.length} blinde Paare, erlaubt sind ${HOECHSTENS}.`)
      console.log('   Es ist mindestens eines dazugekommen. Entweder die neue Seite ueber eine')
      console.log('   API-Route lesen lassen, oder der Tabelle eine rk_-Policy geben.')
      process.exit(1)
    }
    if (befunde.length < HOECHSTENS) {
      console.log()
      console.log(`ℹ️  Nur noch ${befunde.length} blinde Paare (Obergrenze ${HOECHSTENS}).`)
      console.log(`   Bitte die Zahl in .github/workflows/ci.yml auf ${befunde.length} senken —`)
      console.log('   sonst duerfte unbemerkt wieder eines dazukommen.')
    }
    process.exit(0)
  }

  process.exit(STRENG ? 1 : 0)
}

main().catch(err => { console.error(err); process.exit(2) })
