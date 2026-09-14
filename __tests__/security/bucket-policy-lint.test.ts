/**
 * Der Bucket, den niemand aufgeschlossen hat
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 103, 14.09.2026)
 *
 * `storage.objects` traegt RLS (live: relrowsecurity=true). Jede der
 * fuenfzehn Policies nennt ausdruecklich ihren `bucket_id`; eine
 * bucket-uebergreifende gibt es nicht. Versorgt waren damit genau fuenf
 * von dreizehn Buckets.
 *
 * Das ist fail-closed und insofern richtig. Zum Fehler wird es, wenn der
 * ZUGRIFF ueber einen Client laeuft, den RLS regiert. Genau das tat
 * `app/mis/documents/page.tsx`: Upload und signierte URL mit dem
 * BROWSER-Client in `mis-documents` — einen Bucket ohne Policy.
 *
 * Und der Upload verwarf sein Ergebnis. `supabase.storage.…upload()`
 * wirft nicht, es gibt `error` zurueck. Der Datenbankeintrag wurde
 * trotzdem angelegt.
 *
 * LIVE NACHGEMESSEN:
 *     mis_documents mit file_path : 1
 *     Objekte in mis-documents    : 0
 *     Zeilen ohne ihre Datei      : 1
 *
 * Der eine vorhandene Eintrag zeigt auf eine Datei, die es nie gegeben
 * hat — und die Oberflaeche hat beim Anlegen Erfolg gemeldet. Beim
 * Herunterladen passiert seither GAR NICHTS: `if (data?.signedUrl)` ohne
 * Gegenzweig.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  bucketsMitPolicy, unterRls, pruefeQuelle,
  storagePolicies, hatMandantenbedingung, OHNE_MANDANT_BESTAND,
} from '../../scripts/lint-bucket-policy'

const DATEI = 'app/beispiel/page.tsx'

const RLS_CLIENT = "import { createClient } from '@/lib/supabase/client'\n"
const ADMIN_CLIENT = "import { createAdminClient } from '@/lib/supabase/admin'\n"

describe('bucketsMitPolicy liest die Bedingung, nicht den Namen', () => {
  it('findet den Bucket aus der USING-Bedingung', () => {
    const sql = `CREATE POLICY irgendwas ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'mis-documents' AND is_admin());`
    expect([...bucketsMitPolicy([sql])]).toEqual(['mis-documents'])
  })

  it('ignoriert SQL, das gar keine Storage-Policy anlegt', () => {
    // Ein `bucket_id = '…'` in einem Kommentar oder in einer Abfrage ist
    // keine Policy. Sonst genuegte es, den Namen irgendwo zu erwaehnen.
    expect(bucketsMitPolicy([`SELECT * FROM storage.objects WHERE bucket_id = 'mis-documents';`]).size).toBe(0)
    expect(bucketsMitPolicy([`CREATE POLICY p ON public.clients USING (bucket_id = 'x');`]).size).toBe(0)
  })

  it('sammelt ueber mehrere Migrationen', () => {
    const a = `CREATE POLICY a ON storage.objects USING (bucket_id = 'documents');`
    const b = `CREATE POLICY b ON storage.objects USING (bucket_id = 'verordnungen');`
    expect([...bucketsMitPolicy([a, b])].sort()).toEqual(['documents', 'verordnungen'])
  })
})

describe('unterRls unterscheidet die Clients', () => {
  it('Browser- und Server-Client zaehlen', () => {
    expect(unterRls("import { createClient } from '@/lib/supabase/client'")).toBe(true)
    expect(unterRls("import { createClient } from '@/lib/supabase/server'")).toBe(true)
  })

  it('der Dienstschluessel nicht — dort ist die Route der Riegel', () => {
    expect(unterRls(ADMIN_CLIENT + RLS_CLIENT)).toBe(false)
  })

  it('und ein Modul, das seinen admin-Client uebergeben bekommt, auch nicht', () => {
    // lib/wunden/fotos.ts, lib/kim/attachment-service.ts und
    // lib/billing/core/tarif-belege.ts nehmen alle `admin: SupabaseClient`
    // entgegen. Ohne diese Unterscheidung meldete die Pruefung drei
    // Falschbefunde und waere nach einer Woche abgeschaltet.
    expect(unterRls("export async function x(admin: SupabaseClient) {}\nimport { createClient } from '@/lib/supabase/server'")).toBe(false)
    expect(unterRls("export async function x(admin: KimClient) {}\nimport { createClient } from '@/lib/supabase/server'")).toBe(false)
  })
})

describe('Die Regel trifft den Zugriff unter RLS', () => {
  it('findet den Bucket im Aufruf', () => {
    const q = RLS_CLIENT + `
  const { data } = await supabase.storage.from('mis-documents').createSignedUrl(p, 3600)
`
    expect(pruefeQuelle(q, DATEI).map(b => b.bucket)).toEqual(['mis-documents'])
  })

  it('auch ueber mehrere Zeilen', () => {
    const q = RLS_CLIENT + `
  await supabase.storage
    .from('wound-photos')
    .upload(p, f)
`
    expect(pruefeQuelle(q, DATEI).map(b => b.bucket)).toEqual(['wound-photos'])
  })

  it('und schweigt bei einem Modul mit Dienstschluessel', () => {
    const q = ADMIN_CLIENT + `
  await admin.storage.from('sgb-v-pruefexporte').upload(p, f)
`
    expect(pruefeQuelle(q, DATEI)).toHaveLength(0)
  })
})

describe('Der behobene Fall bleibt behoben', () => {
  const SEITE = readFileSync('app/mis/documents/page.tsx', 'utf8')

  it('mis-documents hat jetzt eine Policy in den Migrationen', () => {
    const sql = readFileSync('supabase/migrations/20261210000000_mis_documents_storage_policy.sql', 'utf8')
    expect(bucketsMitPolicy([sql]).has('mis-documents')).toBe(true)
  })

  it('die Policy prueft den Mandanten im ersten Pfadsegment', () => {
    // Der Speicher kennt keine organization_id-Spalte — der Mandant steht
    // im Pfad. Ohne diese Bedingung waere der Bucket zwar offen, aber
    // mandantenblind.
    const sql = readFileSync('supabase/migrations/20261210000000_mis_documents_storage_policy.sql', 'utf8')
    // JEDE der vier Policies, nicht irgendeine: `toContain` waere schon
    // erfuellt, wenn nur eine von vieren den Mandanten prueft — und die
    // uebrigen drei waeren mandantenblind. Genau das ueberlebte den
    // ersten Mutationslauf.
    const proPolicy = (sql.match(/\(storage\.foldername\(name\)\)\[1\] = \(current_org_id\(\)\)::text/g) ?? []).length
    const policies = (sql.match(/CREATE POLICY/g) ?? []).length
    expect(policies).toBe(4)
    expect(proPolicy).toBe(policies)
    // Und Aendern/Loeschen bleiben der Administration vorbehalten.
    for (const teil of ['FOR UPDATE', 'FOR DELETE']) {
      const ab = sql.indexOf(teil)
      expect(ab, teil).toBeGreaterThan(-1)
      expect(sql.slice(ab, ab + 300)).toContain('is_admin()')
    }
  })

  it('der Upload wertet sein Ergebnis aus und legt sonst NICHTS an', () => {
    // Anker auf dem AUSGEFUEHRTEN Aufruf: der Befund selbst steht als
    // Zitat im Kommentar darueber, und ein Fenster ab dem ersten
    // Vorkommen von `.from('mis-documents')` faengt den Kommentar.
    const ab = SEITE.indexOf('const { error: uploadFehler } = await supabase.storage')
    expect(ab, 'Upload-Aufruf nicht gefunden').toBeGreaterThan(-1)
    const stelle = SEITE.slice(ab, ab + 900)
    expect(stelle).toContain(".from('mis-documents')")
    expect(stelle).toContain('if (uploadFehler) {')
    // Der Abbruch steht VOR createDocument — sonst entstuende wieder ein
    // Eintrag ohne Datei.
    expect(SEITE.indexOf('if (uploadFehler) {')).toBeLessThan(SEITE.indexOf('const result = await createDocument('))
    expect(SEITE.slice(SEITE.indexOf('if (uploadFehler) {'), SEITE.indexOf('const result = await createDocument('))).toContain('return')
  })

  it('der Pfad kommt vom Server und traegt den Mandanten', () => {
    expect(SEITE).toContain('await ablagePfad(')
    const actions = readFileSync('app/mis/documents/actions.ts', 'utf8')
    expect(actions).toContain('${organizationId}/documents/')
    // Die Oberflaeche baut ihn NICHT mehr selbst.
    expect(SEITE).not.toContain('`documents/${Date.now()}')
  })

  it('der Download schweigt nicht mehr', () => {
    const ab = SEITE.indexOf('async function handleDownload')
    const stelle = SEITE.slice(ab, ab + 1200)
    expect(stelle).toContain('if (error || !data?.signedUrl) {')
    expect(stelle).toContain('log.errorWithException(')
  })
})

describe('Block 104: Policies ohne Mandantenbedingung', () => {
  // BEFUND: `is_admin()` ist MANDANTENBLIND. Live aus pg_proc gelesen —
  // es prueft `profiles.role IN ('admin','superadmin')` und sonst nichts.
  // Die vier Policies auf `abrechnung` hingen NUR daran: die
  // Administration jeder Organisation las, schrieb, aenderte und loeschte
  // die DTA-Dateien jeder anderen. `dta-dateien` nebenan macht es seit
  // jeher richtig.

  it('zerlegt eine Policy in Name, Bucket und Rumpf', () => {
    const sql = `CREATE POLICY p_eins ON storage.objects
      FOR SELECT USING (bucket_id = 'abrechnung' AND is_admin());`
    const p = storagePolicies([sql])
    expect(p).toHaveLength(1)
    expect(p[0].name).toBe('p_eins')
    expect(p[0].bucket).toBe('abrechnung')
  })

  it('erkennt den Mandantenzaun', () => {
    const mit = storagePolicies([`CREATE POLICY a ON storage.objects
      USING (bucket_id = 'x' AND is_admin()
             AND (storage.foldername(name))[2] = (current_org_id())::text);`])[0]
    expect(hatMandantenbedingung(mit)).toBe(true)
  })

  it('laesst auch die Bindung an das eigene Konto gelten', () => {
    // `auth.uid()` ist ENGER als der Mandant — wer nur an seine eigenen
    // Dateien kommt, kommt erst recht nicht an die des Nachbarn.
    const p = storagePolicies([`CREATE POLICY a ON storage.objects
      USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = (auth.uid())::text);`])[0]
    expect(hatMandantenbedingung(p)).toBe(true)
  })

  it('und den Dienstschluessel — dort umgeht RLS ohnehin', () => {
    const p = storagePolicies([`CREATE POLICY a ON storage.objects
      TO service_role USING (bucket_id = 'x');`])[0]
    expect(hatMandantenbedingung(p)).toBe(true)
  })

  it('meldet is_admin() ALLEIN als mandantenblind', () => {
    const p = storagePolicies([`CREATE POLICY a ON storage.objects
      FOR SELECT USING (bucket_id = 'abrechnung' AND is_admin());`])[0]
    expect(hatMandantenbedingung(p)).toBe(false)
  })

  it('Ruecknahmedateien werden ausgesiebt — sonst waere das Tor nach der ersten rot', () => {
    // Eine Ruecknahme stellt den alten, schwaecheren Zustand wieder her.
    // Das ist ihr Zweck; sie als Befund zu zaehlen hiesse, keine
    // Ruecknahme mehr schreiben zu duerfen. Der Lauf siebt sie ueber den
    // Dateinamen aus — hier festgehalten, weil genau das im ersten
    // Anlauf gefehlt hat und das Tor rot war.
    const quelle = readFileSync('scripts/lint-bucket-policy.ts', 'utf8')
    expect(quelle).toContain("filter(d => !/rollback/i.test(d))")
    expect(quelle).toContain('storagePolicies(vorwaerts)')
  })

  it('die drei Ausnahmen sind benannt und begruendet', () => {
    expect([...OHNE_MANDANT_BESTAND].sort()).toEqual([
      'documents_admin_storage',
      'service_proofs_admin_all',
      'verordnungen_scans_admin_all',
    ])
    const quelle = readFileSync('scripts/lint-bucket-policy.ts', 'utf8')
    const block = quelle.slice(
      quelle.indexOf('Policies, die HEUTE noch ohne Mandantenbedingung'),
      quelle.indexOf('export const OHNE_MANDANT_BESTAND'),
    )
    // Der Grund ist derselbe fuer alle drei: der Mandant steht nicht im
    // Pfad. Ohne diesen Satz waere die Liste eine Freigabe.
    expect(block).toContain('KEINE FREIGABE')
    expect(block).toContain('NICHT im Pfad')
  })
})

describe('Block 104: der Zaun fuer abrechnung', () => {
  const ROH = readFileSync(
    'supabase/migrations/20261215000000_abrechnung_storage_mandantenzaun.sql', 'utf8')
  /**
   * Nur das AUSGEFUEHRTE SQL.
   *
   * Der Kopf der Migration zitiert den Befund — samt der Bedingung, um
   * die es geht. Wer den Rohtext zaehlt, zaehlt die Begruendung mit und
   * bekommt fuenf statt vier. Genau so stand der erste Anlauf hier.
   */
  const MIG = ROH.split('\n').filter(z => !z.trim().startsWith('--')).join('\n')

  it('haertet alle vier Policies', () => {
    const policies = storagePolicies([MIG])
    expect(policies).toHaveLength(4)
    for (const p of policies) {
      expect(p.bucket, p.name).toBe('abrechnung')
      expect(hatMandantenbedingung(p), p.name).toBe(true)
    }
  })

  it('liest den Mandanten aus dem ZWEITEN Pfadsegment', () => {
    // Der Ablageort ist `dta/<organization_id>/<laufId>/<datei>` —
    // Segment 1 ist `dta`, Segment 2 der Mandant. Ein Zaun auf Segment 1
    // vergliche die Zeichenkette `dta` mit einer UUID und sperrte alles.
    const treffer = (MIG.match(/\(storage\.foldername\(name\)\)\[2\] = \(current_org_id\(\)\)::text/g) ?? []).length
    expect(treffer).toBe(4)
    expect(MIG).not.toContain('(storage.foldername(name))[1]')
  })

  it('und der Code legt auch wirklich so ab', () => {
    // Die Policy und der Ablagepfad muessen zusammenpassen; sonst ist der
    // Zaun eine Sperre statt eines Zauns.
    const engine = readFileSync('lib/abrechnung/kassenabrechnung-engine.ts', 'utf8')
    expect(engine).toContain('`dta/${lauf.organization_id}/${laufId}/')
  })

  it('behaelt is_admin() — der Zaun ERSETZT die Rolle nicht', () => {
    // Ohne `is_admin()` duerfte jedes Mitglied des Mandanten an die
    // DTA-Dateien. Der Zaun kommt HINZU.
    expect((MIG.match(/is_admin\(\)/g) ?? []).length).toBe(4)
  })

  it('haltet den Kopf der Migration bei der Wahrheit', () => {
    // Der Befund gehoert in die Datei — aber er muss im Kommentar stehen,
    // nicht im ausgefuehrten Teil.
    expect(ROH).toContain('is_admin()` ist MANDANTENBLIND')
    expect(ROH).toContain('dta-dateien')
  })

  it('die Ruecknahme stellt den alten Zustand her und sagt, dass er schlecht ist', () => {
    const zurueck = readFileSync(
      'supabase/migrations/20261215000001_rollback_abrechnung_storage_mandantenzaun.sql', 'utf8')
    expect(storagePolicies([zurueck])).toHaveLength(4)
    expect(zurueck.split('\n').filter(z => !z.trim().startsWith('--')).join('\n'))
      .not.toContain('current_org_id()')
    expect(zurueck).toContain('kein guter')
  })
})

describe('Das Tor haengt in CI', () => {
  it('als eigener Schritt', () => {
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain('npm run lint:bucket-policy')
  })

  it('und ist als npm-Skript erreichbar', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts['lint:bucket-policy']).toBe('tsx scripts/lint-bucket-policy.ts')
  })
})
