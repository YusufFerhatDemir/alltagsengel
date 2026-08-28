/**
 * P0: Mandanten-Isolation im Billing-/DTA-Modul.
 *
 * Drei Regressionen aus dem Billing-Review vom 08.08.2026:
 *
 * 1) Saemtliche Routen unter app/api/billing/ lasen die aktive Organisation aus
 *    `profiles.organization_id`. Diese Spalte existiert in Production NICHT —
 *    profiles hat nur id/role/first_name/last_name/email/avatar_url/created_at/
 *    updated_at. Der Select lieferte deshalb undefined und jede Route brach
 *    entweder mit 403 "Keine Organisation zugewiesen." ab oder filterte gegen
 *    `undefined`. Die Org haengt am organization_members-Mapping und kommt aus
 *    getActiveOrgId() (lib/organizations/server.ts) — derselbe Bug wurde zuvor
 *    in pflege/personal (2a6703c) und ops/akten (1547188) behoben.
 *
 * 2) Die Rechnungs-Mutationen (cancel/correct/credit/freeze) und der DTA-Export
 *    authentifizierten zwar den Admin, pruefen aber nie, ob die per URL-Parameter
 *    adressierte Entitaet zur eigenen Organisation gehoert. Da die Routen
 *    createAdminClient() (Service-Role, BYPASSRLS) nutzen, greift der
 *    org_fence-Policy nicht — ein Admin von Org A konnte fremde Rechnungen
 *    stornieren, korrigieren, gutschreiben, festschreiben und fremde
 *    Abrechnungslaeufe exportieren (IDOR).
 *
 * 3) POST /api/billing/tariffs reichte den Request-Body ungeprueft an den
 *    Admin-Insert durch. Ein mitgeschicktes `organization_id` landete damit
 *    unveraendert in billing_tariffs — Schreibzugriff in fremde Mandanten.
 *
 * Die Tests pruefen die Quelltexte statisch (kein DB-Zugriff) — analog
 * p0-pflege-mandanten-isolation.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { handlerRumpfOderFehler } from '../helpers/route-quelle'

const REPO_ROOT = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8')

const BILLING_DIR = 'app/api/billing'

/** Alle route.ts unterhalb von app/api/billing/ (repo-relative Pfade). */
function billingRoutes(rel: string = BILLING_DIR): string[] {
  const abs = path.join(REPO_ROOT, rel)
  return readdirSync(abs).flatMap(entry => {
    const child = path.join(rel, entry)
    if (statSync(path.join(REPO_ROOT, child)).isDirectory()) return billingRoutes(child)
    return entry === 'route.ts' ? [child] : []
  })
}

const ROUTES = billingRoutes()

/**
 * Schneidet den POST/GET/PATCH-Handler heraus, in dem `marker` vorkommt —
 * bzw. die ganze Datei, wenn der Marker nicht gefunden wird.
 */
function handlerMit(src: string, marker: string): string {
  const at = src.indexOf(marker)
  if (at === -1) return src
  // Rueckwaerts bis zum Kopf des Handlers, in dem der Marker steht.
  // Beide Export-Formen (roh und withTracking-gewrappt) beginnen mit
  // `export`; der Rumpf davor gehoert einem anderen Handler.
  const start = Math.max(
    src.lastIndexOf('export async function', at),
    src.lastIndexOf('export const', at),
  )
  return src.slice(start === -1 ? 0 : start, at)
}

describe('P0-1: keine Billing-Route liest profiles.organization_id', () => {
  it('findet ueberhaupt Billing-Routen (Schutz gegen leeres Glob)', () => {
    expect(ROUTES.length).toBeGreaterThan(15)
  })

  it.each(ROUTES)('%s selektiert organization_id nicht aus profiles', rel => {
    const src = read(rel)
    // profiles-Selects duerfen die nicht existierende Spalte nicht anfordern.
    const profileSelects = [...src.matchAll(/from\('profiles'\)[\s\S]{0,120}?\.select\(([^)]*)\)/g)]
    for (const m of profileSelects) {
      expect(m[1], `${rel}: profiles.select() fordert organization_id an`).not.toMatch(/organization_id/)
    }
  })

  it.each(ROUTES)('%s verwendet profile.organization_id nirgends als Wert', rel => {
    const src = read(rel)
    expect(src, `${rel}: liest profile.organization_id`).not.toMatch(/\bprofiles?\??\.organization_id\b/)
  })

  // Routen, die eine Org AUS DER AUTH ableiten, erkennt man an der camelCase-
  // Variable. app/api/billing/auto-invoice liest die Org dagegen vom Klienten
  // (clients.organization_id) und braucht getActiveOrgId() nicht.
  it.each(ROUTES.filter(rel => /\b(organizationId|orgId)\b/.test(read(rel))))(
    '%s bezieht die Org aus getActiveOrgId()',
    rel => {
      const src = read(rel)

      // Drei zulaessige Wege — alle enden bei getActiveOrgId():
      //   a) direkter Aufruf in der Route
      //   b) requireAdminMitOrg() aus lib/abrechnung/require-admin, das
      //      Admin-Pruefung und Org-Aufloesung zusammen erledigt und damit
      //      strenger ist als der direkte Aufruf.
      //   c) requireOpsAdmin() aus lib/ops/api-auth — derselbe Vertrag wie (b)
      //      und der Standardweg der Betriebssystem-Routen. Beide Helfer sind
      //      unten eigens dahin abgesichert, dass sie die Org selbst ueber
      //      getActiveOrgId() aufloesen.
      const direkt =
        /import\s*\{[^}]*\bgetActiveOrgId\b[^}]*\}\s*from\s*'@\/lib\/organizations\/server'/.test(src) &&
        /await\s+getActiveOrgId\(\)/.test(src)

      // Seit dem Rollenkonzept (lib/auth/rollen.ts) nehmen beide Helfer eine
      // Berechtigung entgegen. Geprueft wird weiterhin nur, DASS die Org ueber
      // den Helfer kommt — nicht, mit welchem Argument er gerufen wird.
      const ueberHelfer =
        /import\s*\{[^}]*\brequireAdminMitOrg\b[^}]*\}\s*from\s*'@\/lib\/abrechnung\/require-admin'/.test(src) &&
        /await\s+requireAdminMitOrg\([^)]*\)/.test(src)

      const ueberOpsHelfer =
        /import\s*\{[^}]*\brequireOps(Admin|User)\b[^}]*\}\s*from\s*'@\/lib\/ops\/api-auth'/.test(src) &&
        /await\s+requireOps(Admin|User)\([^)]*\)/.test(src)

      expect(
        direkt || ueberHelfer || ueberOpsHelfer,
        `${rel}: Org kommt weder aus getActiveOrgId() noch aus requireAdminMitOrg()/requireOpsAdmin()`,
      ).toBe(true)
    },
  )

  it('requireAdminMitOrg loest die Org selbst ueber getActiveOrgId() auf', () => {
    // Sonst waere der oben zugelassene Helfer-Pfad ein Schlupfloch.
    const src = read('lib/abrechnung/require-admin.ts')
    expect(src).toMatch(/import\s*\{[^}]*\bgetActiveOrgId\b[^}]*\}\s*from\s*'@\/lib\/organizations\/server'/)
    expect(src).toMatch(/await\s+getActiveOrgId\(\)/)
    // Und er darf die Org nicht aus profiles ziehen.
    expect(src).not.toMatch(/\bprofiles?\??\.organization_id\b/)
  })

  it('requireOpsAdmin loest die Org selbst ueber getActiveOrgId() auf', () => {
    // Gleiche Absicherung wie fuer requireAdminMitOrg — sonst waere der
    // Ops-Helfer-Pfad ein Schlupfloch.
    const src = read('lib/ops/api-auth.ts')
    expect(src).toMatch(/import\s*\{[^}]*\bgetActiveOrgId\b[^}]*\}\s*from\s*'@\/lib\/organizations\/server'/)
    expect(src).toMatch(/await\s+getActiveOrgId\(\)/)
    expect(src).not.toMatch(/\bprofiles?\??\.organization_id\b/)
    // Ohne Org gibt es keinen Kontext — sonst liefe die Route org-los weiter.
    expect(src).toMatch(/Keine Organisation zugewiesen/)
  })
})

describe('P0-2: Rechnungs-Mutationen pruefen die Org-Zugehoerigkeit vor dem Aufruf', () => {
  const MUTATIONEN: Array<{ rel: string; engine: string }> = [
    { rel: 'app/api/billing/invoices/[id]/cancel/route.ts', engine: 'cancelInvoice(' },
    { rel: 'app/api/billing/invoices/[id]/correct/route.ts', engine: 'correctInvoice(' },
    { rel: 'app/api/billing/invoices/[id]/credit/route.ts', engine: 'createCreditNote(' },
    { rel: 'app/api/billing/invoices/[id]/freeze/route.ts', engine: 'freezeInvoice(' },
  ]

  it.each(MUTATIONEN)('$rel laedt die Rechnung org-gefenced', ({ rel }) => {
    const src = read(rel)
    const at = src.indexOf("from('invoices')")
    expect(at, `${rel}: keine invoices-Query — Org-Zugehoerigkeit ungeprueft`).toBeGreaterThan(-1)
    const kette = src.slice(at, at + 300)
    expect(kette, `${rel}: invoices-Query ohne .eq('id', id)`).toMatch(/\.eq\('id',\s*id\)/)
    expect(kette, `${rel}: invoices-Query ohne organization_id-Filter`)
      .toMatch(/\.eq\('organization_id',\s*organizationId\)/)
  })

  it.each(MUTATIONEN)('$rel bricht mit 404 ab, wenn die Rechnung fremd ist', ({ rel }) => {
    const src = read(rel)
    const at = src.indexOf('if (!invoice)')
    expect(at, `${rel}: kein !invoice-Guard`).toBeGreaterThan(-1)
    expect(src.slice(at, at + 200)).toMatch(/status:\s*404/)
  })

  it.each(MUTATIONEN)('$rel prueft VOR dem Engine-Aufruf ($engine)', ({ rel, engine }) => {
    const src = read(rel)
    const guardAt = src.indexOf('if (!invoice)')
    const engineAt = src.indexOf(engine)
    expect(engineAt, `${rel}: Engine-Aufruf ${engine} nicht gefunden`).toBeGreaterThan(-1)
    expect(guardAt, `${rel}: Org-Check steht nach dem Engine-Aufruf`).toBeLessThan(engineAt)
  })
})

describe('Block 16: Korrektur- und Rechnungsrouten bleiben mandantengefenced', () => {
  it('der Statuswechsel laedt die Rechnung org-gefenced und bricht mit 404 ab', () => {
    const REL = 'app/api/billing/invoices/[id]/status/route.ts'
    const src = read(REL)
    const at = src.indexOf("from('invoices')")
    expect(at, `${REL}: keine invoices-Query`).toBeGreaterThan(-1)
    const kette = src.slice(at, at + 400)
    expect(kette).toMatch(/\.eq\('id',\s*id\)/)
    expect(kette).toMatch(/\.eq\('organization_id',\s*organizationId\)/)

    const guardAt = src.indexOf('!invoice')
    expect(guardAt, `${REL}: kein !invoice-Guard`).toBeGreaterThan(-1)
    expect(src.slice(guardAt, guardAt + 200)).toMatch(/status:\s*404/)

    // Storno muss ueber /cancel laufen, damit ein Stornobeleg entsteht.
    expect(src).toMatch(/target === 'storniert'/)
  })

  it('die Rechnungsliste filtert auf die Auth-Org', () => {
    const REL = 'app/api/billing/invoices/route.ts'
    const src = read(REL)
    expect(src).toMatch(/\.eq\('organization_id',\s*organizationId\)/)
    // Auch die Gutschrift-Nebenabfrage darf nicht mandantenfrei laufen.
    const credits = src.indexOf("from('invoice_corrections')")
    expect(credits, `${REL}: keine invoice_corrections-Query`).toBeGreaterThan(-1)
    expect(src.slice(credits, credits + 400)).toMatch(/\.eq\('organization_id',\s*organizationId\)/)
  })

  it('die Korrekturliste filtert auf die Auth-Org und blendet Verworfenes aus', () => {
    const REL = 'app/api/billing/corrections/route.ts'
    const src = read(REL)
    expect(src).toMatch(/\.eq\('organization_id',\s*organizationId\)/)
    expect(src).toMatch(/\.is\('deleted_at',\s*null\)/)
  })

  it('Freigabe und Verwerfen reichen die Auth-Org an die Engine durch', () => {
    for (const rel of [
      'app/api/billing/corrections/[id]/release/route.ts',
      'app/api/billing/corrections/[id]/discard/route.ts',
    ]) {
      const src = read(rel)
      // Die Engine fenced selbst — sie MUSS die Org aber bekommen.
      expect(src, `${rel}: Org wird nicht an die Engine uebergeben`)
        .toMatch(/(releaseCreditNote|discardCreditNote)\([^)]*organizationId\)/)
    }
  })

  it('die Engine prueft die Mandantenzugehoerigkeit der Korrektur selbst', () => {
    const src = read('lib/billing/core/credit-notes.ts')
    // Der Admin-Client umgeht RLS — ohne diesen Vergleich waere jede Korrektur
    // jedes Mandanten freigebbar.
    expect(src).toMatch(/organization_id\s*!==\s*expectedOrgId/)
  })

  it('das Kunden-PDF prueft den Eigentuemer statt nur die Anmeldung', () => {
    const src = read('app/api/rechnungen/[id]/pdf/route.ts')
    expect(src).toMatch(/client\?\.user_id\s*!==\s*user\.id/)
    expect(src).toMatch(/status:\s*403/)
  })
})

describe('P0-3: tariffs POST erzwingt organizationId aus der Auth', () => {
  const REL = 'app/api/billing/tariffs/route.ts'
  const src = read(REL)

  it('holt die Org ueber getActiveOrgId()', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bgetActiveOrgId\b[^}]*\}\s*from\s*'@\/lib\/organizations\/server'/)
    expect(handlerMit(src, "from('billing_tariffs')\n      .insert")).toMatch(/await\s+getActiveOrgId\(\)/)
  })

  it('setzt organization_id beim Insert NACH dem Body-Spread', () => {
    const at = src.indexOf('.insert(')
    expect(at, 'kein billing_tariffs-Insert gefunden').toBeGreaterThan(-1)
    const insert = src.slice(at, src.indexOf('\n', at))
    // Der Body darf nicht mehr roh durchgereicht werden — auch nicht als
    // vollstaendiger Spread. Seit dem Tarif-Verifizierungs-Fail-Closed-Fix
    // wird zuerst tarif_status/verifiziert_* aus dem Body herausdestrukturiert
    // (tarifDaten = body OHNE diese Felder), erst DANN gespreadet.
    expect(insert, 'Body wird ungeprueft eingefuegt (.insert(body))').not.toMatch(/\.insert\(body\)/)
    expect(insert, 'roher ...body-Spread statt gefilterter ...tarifDaten').not.toMatch(/\.\.\.body\b/)
    expect(insert).toMatch(/organization_id:\s*organizationId/)
    // Reihenfolge: Spread zuerst, Auth-Wert gewinnt.
    const spreadAt = insert.indexOf('...tarifDaten')
    const orgAt = insert.indexOf('organization_id:')
    expect(spreadAt, 'kein ...tarifDaten-Spread im Insert').toBeGreaterThan(-1)
    expect(spreadAt, 'organization_id muss NACH dem ...tarifDaten-Spread stehen').toBeLessThan(orgAt)
  })

  it('tarifDaten entsteht durch Destrukturierung aus body, ist kein neues, ungeprueftes Objekt', () => {
    expect(src).toMatch(/const\s*\{[\s\S]*?\.\.\.tarifDaten\s*\}\s*=\s*body\s+as\s+Record<string,\s*unknown>/)
  })
})

describe('P0-4: DTA-Export prueft die Org-Zugehoerigkeit des Laufs', () => {
  const REL = 'app/api/billing/dta/[id]/export/route.ts'
  const src = read(REL)

  it('laedt den Lauf org-gefenced', () => {
    const at = src.indexOf("from('abrechnungslaeufe')")
    expect(at, `${REL}: keine abrechnungslaeufe-Query`).toBeGreaterThan(-1)
    const kette = src.slice(at, at + 300)
    expect(kette).toMatch(/\.eq\('id',\s*id\)/)
    expect(kette).toMatch(/\.eq\('organization_id',\s*organizationId\)/)
  })

  it('bricht mit 404 ab und exportiert erst danach', () => {
    const guardAt = src.indexOf('if (!lauf)')
    expect(guardAt, `${REL}: kein !lauf-Guard`).toBeGreaterThan(-1)
    expect(src.slice(guardAt, guardAt + 200)).toMatch(/status:\s*404/)

    const exportAt = src.indexOf('exportiereLauf(')
    expect(exportAt).toBeGreaterThan(-1)
    expect(guardAt, 'Org-Check steht nach dem Export').toBeLessThan(exportAt)
  })

  it('nutzt die Auth-Org auch fuer die Absender-IK', () => {
    expect(src).toMatch(/getOrgIK\(admin,\s*organizationId\)/)
  })
})

describe('P0-5: tariffs GET erzwingt Rollen-Pruefung (MITTEL-Befund Finale Abnahme)', () => {
  const REL = 'app/api/billing/tariffs/route.ts'
  const src = read(REL)
  const get = handlerRumpfOderFehler(src, 'GET', REL)

  it('lehnt unauthentifizierte Requests mit 401 ab, bevor Tarife geladen werden', () => {
    const authAt = get.indexOf('if (!user)')
    const loadAt = get.indexOf("from('billing_tariffs')")
    expect(authAt, `${REL}: kein !user-Guard im GET`).toBeGreaterThan(-1)
    expect(get.slice(authAt, authAt + 120)).toMatch(/status:\s*401/)
    expect(authAt, 'Auth-Guard muss vor dem Tarif-Load stehen').toBeLessThan(loadAt)
  })

  // Track 7 (28.08.2026): die Route las die Rolle mit
  // `.from('profiles').select('role')` und entschied mit
  // `rolleDarf(profile.role, …)` — also aus EINER der beiden autoritativen
  // Quellen. Eine Herabstufung, die nur in app_metadata steht, blieb damit
  // wirkungslos. Der Test wird auf die neue, strengere Form gezogen; seine
  // Aussage bleibt unveraendert: die Rolle wird VOR dem Tarif-Load geprueft
  // und Kunden/Engel bekommen 403.
  const ROLLENPRUEFUNG = /if\s*\(!quellenDuerfen\(/

  it('prueft die Rolle gegen internes Personal, nicht nur die Anmeldung', () => {
    expect(get).toMatch(/holeRollenQuellenFuer\(supabase, user\)/)
    expect(get).toMatch(/quellenDuerfen\(quellen, 'tarife\.lesen'\)/)
    const roleCheckAt = get.search(ROLLENPRUEFUNG)
    const loadAt = get.indexOf("from('billing_tariffs')")
    expect(roleCheckAt, `${REL}: keine Rollen-Pruefung vor dem Tarif-Load`).toBeGreaterThan(-1)
    expect(roleCheckAt).toBeLessThan(loadAt)
  })

  it('lehnt Kunden/Engel (keine interne Rolle) mit 403 ab', () => {
    const roleCheckAt = get.search(ROLLENPRUEFUNG)
    expect(get.slice(roleCheckAt, roleCheckAt + 200)).toMatch(/status:\s*403/)
  })
})
