/**
 * lint-bucket-policy — findet Buckets, die unter RLS gelesen oder
 * beschrieben werden, ohne dass es dafuer eine Policy gibt.
 *
 * ── DAS MUSTER ────────────────────────────────────────────────────────
 * `storage.objects` traegt RLS (live am 14.09.2026: relrowsecurity=true).
 * Jede der fuenfzehn Policies nennt ausdruecklich ihren `bucket_id` —
 * eine bucket-uebergreifende gibt es nicht. Ein Bucket OHNE Policy ist
 * damit fuer `anon` und `authenticated` vollstaendig zu.
 *
 * Das ist fail-closed und insofern richtig. Es wird erst dann zum Fehler,
 * wenn der ZUGRIFF ueber einen Client laeuft, den RLS regiert — den
 * Browser-Client oder den Server-Client der Sitzung. Dann schlaegt jeder
 * Upload und jede signierte URL fehl, und zwar leise:
 * `supabase.storage.…upload()` wirft nicht, es gibt `error` zurueck.
 *
 * SO GESCHEHEN (Block 103): `app/mis/documents/page.tsx` laedt mit dem
 * Browser-Client in `mis-documents` hoch und verwarf das Ergebnis. Der
 * Datenbankeintrag wurde trotzdem angelegt. Live nachgemessen: eine Zeile
 * in `mis_documents` mit `file_path`, NULL Objekte im Bucket — der
 * Eintrag zeigt auf eine Datei, die es nie gegeben hat.
 *
 * ── WAS DIESE PRUEFUNG TUT UND WAS NICHT ──────────────────────────────
 * Sie liest KEINE Datenbank. Sie vergleicht zwei Listen, die beide im
 * Repository stehen: die Buckets, die mit einem RLS-gebundenen Client
 * angefasst werden (aus dem Quelltext), und die Buckets, fuer die eine
 * Policy existiert (aus den Migrationen). Damit laeuft sie in CI ohne
 * Zugangsdaten — und faellt auf, sobald jemand einen Bucket in einer
 * Oberflaeche benutzt, fuer den nie eine Policy geschrieben wurde.
 *
 * Ein Bucket, der NUR ueber den Dienstschluessel angefasst wird, braucht
 * keine Policy: dort ist die Route der Riegel (siehe die Notiz
 * „Perimeter: der Riegel ist die Route"). Solche Buckets meldet diese
 * Pruefung deshalb nicht.
 *
 *     npm run lint:bucket-policy
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const REPO = process.cwd()
const AUS = new Set(['node_modules', '.next', 'dist', 'build', '__mocks__', 'out'])

export interface Befund {
  datei: string
  zeile: number
  bucket: string
}

function dateien(verzeichnis: string, raus: string[] = [], nurTs = true): string[] {
  let eintraege: string[]
  try {
    eintraege = readdirSync(verzeichnis)
  } catch {
    return raus
  }
  for (const e of eintraege) {
    if (AUS.has(e)) continue
    const p = join(verzeichnis, e)
    if (statSync(p).isDirectory()) dateien(p, raus, nurTs)
    else if (nurTs
      ? ((e.endsWith('.ts') || e.endsWith('.tsx')) && !e.includes('.test.'))
      : e.endsWith('.sql')) raus.push(p)
  }
  return raus
}

/**
 * Buckets, fuer die in den Migrationen eine Policy auf `storage.objects`
 * geschrieben wurde.
 *
 * Gelesen wird der Bucket-Name aus der Bedingung `bucket_id = '…'` — das
 * ist genau die Form, die live in allen fuenfzehn Policies steht.
 */
export function bucketsMitPolicy(sqlTexte: string[]): Set<string> {
  const raus = new Set<string>()
  for (const text of sqlTexte) {
    // Nur SQL, das ueberhaupt eine Policy auf storage.objects anlegt.
    if (!/CREATE\s+POLICY/i.test(text) || !/storage\.objects/i.test(text)) continue
    for (const m of text.matchAll(/bucket_id\s*=\s*'([a-z0-9-]+)'/gi)) raus.add(m[1])
  }
  return raus
}

/** Wird diese Datei mit einem RLS-gebundenen Client ausgefuehrt? */
export function unterRls(text: string): boolean {
  // Der Dienstschluessel umgeht RLS — eine Datei, die ihn benutzt, ist
  // nicht gemeint.
  if (/createAdminClient/.test(text)) return false
  // Module, die ihren Client als Parameter bekommen, sind von hier aus
  // nicht entscheidbar; sie tragen den Namen `admin` per Konvention.
  if (/\badmin\s*:\s*(Supabase|Kim)Client/.test(text)) return false
  return /from '@\/lib\/supabase\/(client|server)'/.test(text)
}

export function pruefeQuelle(text: string, datei: string): Befund[] {
  if (!unterRls(text)) return []
  const befunde: Befund[] = []
  const muster = /storage\s*\n?\s*\.from\(\s*['"`]([a-z0-9-]+)['"`]\s*\)/g
  let m: RegExpExecArray | null
  while ((m = muster.exec(text)) !== null) {
    befunde.push({ datei, zeile: text.slice(0, m.index).split('\n').length, bucket: m[1] })
  }
  return befunde
}

/**
 * Eine einzelne `CREATE POLICY …` auf `storage.objects`, so wie sie in
 * einer Migration steht.
 */
export interface PolicyText {
  name: string
  bucket: string
  text: string
}

/**
 * Zerlegt Migrations-SQL in die Storage-Policies, die es anlegt.
 *
 * RUECKNAHMEDATEIEN GEHOEREN NICHT HINEIN. Eine Ruecknahme stellt den
 * alten, schwaecheren Zustand wieder her — das ist ihr Zweck. Wer sie
 * mitliest, bekommt fuer JEDE gehaertete Policy sofort wieder einen
 * Befund und schaltet das Tor nach der ersten Ruecknahme ab. Der
 * Aufrufer siebt sie deshalb ueber den Dateinamen aus; diese Funktion
 * bekommt nur die Vorwaertsmigrationen zu sehen.
 */
export function storagePolicies(sqlTexte: string[]): PolicyText[] {
  const raus: PolicyText[] = []
  for (const text of sqlTexte) {
    for (const m of text.matchAll(
      /CREATE\s+POLICY\s+"?([A-Za-z0-9_]+)"?\s+ON\s+storage\.objects([\s\S]*?);/gi,
    )) {
      const rumpf = m[2]
      const bucket = /bucket_id\s*=\s*'([a-z0-9-]+)'/i.exec(rumpf)
      if (!bucket) continue
      raus.push({ name: m[1], bucket: bucket[1], text: rumpf })
    }
  }
  return raus
}

/**
 * Traegt die Policy eine Mandantenbedingung?
 *
 * Gelten gelassen wird dreierlei:
 *   `current_org_id()`   der Mandantenzaun
 *   `auth.uid()`         die Bindung an das eigene Konto — enger als der
 *                        Mandant, also ausreichend
 *   `TO service_role`    der Dienstschluessel umgeht RLS ohnehin; eine
 *                        Bedingung dort waere Zierde
 */
export function hatMandantenbedingung(policy: PolicyText): boolean {
  if (/TO\s+service_role/i.test(policy.text)) return true
  return /current_org_id\(\)/.test(policy.text) || /auth\.uid\(\)/.test(policy.text)
}

/**
 * Policies, die HEUTE noch ohne Mandantenbedingung stehen.
 *
 * KEINE FREIGABE. Bei allen dreien steht der Mandant NICHT im Pfad — der
 * Zaun braucht dort zuerst eine Aenderung am Ablageort, und die macht
 * bestehende Dateien unauffindbar. Das ist je Bucket zu entscheiden, nicht
 * in einem Durchlauf.
 *
 *   service-proofs   Pfad `<service_record_id>/…`  (lib/upload-service-proof.ts)
 *   verordnungen     Pfad `<client_id>/…`          (app/admin/verordnungen)
 *   documents        Pfad `<user_id>/…` — die EIGENEN Dateien sind ueber
 *                    auth.uid() gebunden; nur die zusaetzliche
 *                    Admin-Policy ist mandantenblind.
 */
export const OHNE_MANDANT_BESTAND: readonly string[] = [
  'service_proofs_admin_all',
  'verordnungen_scans_admin_all',
  'documents_admin_storage',
]

function main() {
  const migrationsDateien = dateien(join(REPO, 'supabase', 'migrations'), [], false)
  const sql = migrationsDateien.map(d => readFileSync(d, 'utf8'))
  const versorgt = bucketsMitPolicy(sql)

  // Ohne Ruecknahmen — siehe storagePolicies().
  const vorwaerts = migrationsDateien
    .filter(d => !/rollback/i.test(d))
    .map(d => readFileSync(d, 'utf8'))

  const alle: Befund[] = []
  for (const w of ['lib', 'app', 'components']) {
    for (const d of dateien(join(REPO, w))) {
      alle.push(...pruefeQuelle(readFileSync(d, 'utf8'), relative(REPO, d)))
    }
  }
  const offen = alle.filter(b => !versorgt.has(b.bucket))

  console.log('── Buckets unter RLS ohne Policy ───────────────────────────')
  console.log(`   Buckets mit Policy in den Migrationen: ${[...versorgt].sort().join(', ') || '—'}`)
  console.log(`   Zugriffe unter RLS:                    ${alle.length}`)
  console.log(`   davon ohne Policy:                     ${offen.length}`)
  console.log('')

  const policies = storagePolicies(vorwaerts)
  const blind = policies.filter(
    p => !hatMandantenbedingung(p) && !OHNE_MANDANT_BESTAND.includes(p.name),
  )
  const tote = OHNE_MANDANT_BESTAND.filter(
    n => !policies.some(p => p.name === n && !hatMandantenbedingung(p)),
  )

  console.log(`   Storage-Policies:                      ${policies.length}`)
  console.log(`   davon ohne Mandantenbedingung:         ${blind.length + OHNE_MANDANT_BESTAND.length - tote.length}`)
  console.log(`   Ausnahmen:                             ${OHNE_MANDANT_BESTAND.length}${tote.length > 0 ? `, davon ${tote.length} veraltet` : ''}`)
  console.log('')

  if (tote.length > 0) {
    console.log(`❌ ${tote.length} Ausnahme(n) decken keine mandantenblinde Policy mehr:\n`)
    for (const n of tote) console.log(`   ${n}`)
    console.log('')
    console.log('   Diese Namen gehören aus OHNE_MANDANT_BESTAND heraus. Solange sie')
    console.log('   stehen, käme ein Rückfall auf dieselbe Policy durch.')
    console.log('')
    process.exit(1)
  }

  if (blind.length > 0) {
    console.log(`❌ ${blind.length} Policy/Policies ohne Mandantenbedingung:\n`)
    for (const p of blind) console.log(`   ${p.name}  [${p.bucket}]`)
    console.log('')
    console.log('   `is_admin()` ist MANDANTENBLIND — es prüft nur profiles.role. Eine')
    console.log('   Policy, die nur daran hängt, gibt der Administration JEDER')
    console.log('   Organisation die Dateien JEDER anderen.')
    console.log('')
    console.log('   Abhilfe: `(storage.foldername(name))[n] = (current_org_id())::text`')
    console.log('   wie bei `dta-dateien` und `abrechnung` — oder `auth.uid()`, wenn die')
    console.log('   Datei an ein Konto gebunden ist.')
    process.exit(1)
  }

  if (offen.length === 0) {
    console.log('✓ Kein Befund.')
    return
  }

  console.log(`❌ ${offen.length} Zugriff(e) auf einen Bucket ohne Policy:\n`)
  for (const b of offen) console.log(`   ${b.datei}:${b.zeile}  [${b.bucket}]`)
  console.log('')
  console.log('   `storage.objects` traegt RLS, und jede Policy nennt ihren bucket_id.')
  console.log('   Ohne Policy ist der Bucket für anon und authenticated ZU — jeder')
  console.log('   Upload und jede signierte URL scheitert, und zwar leise: die')
  console.log('   Storage-Aufrufe werfen nicht, sie geben `error` zurück.')
  console.log('')
  console.log('   Abhilfe: entweder eine Policy in einer Migration anlegen, oder den')
  console.log('   Zugriff über den Dienstschlüssel führen und die Route zum Riegel')
  console.log('   machen. Beides ist eine Entscheidung — kein Zustand.')
  process.exit(1)
}

if (process.argv[1] && process.argv[1].endsWith('lint-bucket-policy.ts')) main()
