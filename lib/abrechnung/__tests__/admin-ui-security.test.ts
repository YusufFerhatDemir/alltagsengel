/**
 * Security-Tests: Admin-UI + DTA API Routes
 *
 * Prüft:
 * - Org-Isolation auf allen DTA-API-Routen
 * - Mass-Assignment-Schutz (Allowlists)
 * - Auth-Guard-Konsistenz
 * - State-Transition-Guards
 * - PreFlight-Erweiterungen (SECON, SFTP, Routing)
 * - Leistungsnachweis CRUD Security
 *
 * Läuft mit: npm run test:unit (node:test)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')

function readRoute(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

/**
 * Prueft, dass eine Route ihre Organisation aus der Auth ableitet.
 *
 * Zulaessig sind drei Wege — alle enden bei getActiveOrgId():
 *   a) direkter Aufruf
 *   b) requireAdminMitOrg() aus lib/abrechnung/require-admin
 *   c) requireOpsAdmin()/requireOpsUser() aus lib/ops/api-auth
 *
 * Die reine Textsuche nach 'getActiveOrgId' hat (b) und (c) uebersehen und
 * dadurch korrekt abgesicherte Routen als Fehler gemeldet.
 */
function hatOrgAusAuth(code: string): boolean {
  return code.includes('getActiveOrgId')
    || code.includes('requireAdminMitOrg')
    || code.includes('requireOpsAdmin')
    || code.includes('requireOpsUser')
}

// ── Org-Isolation: Alle DTA-Routen müssen getActiveOrgId() aufrufen ──

const DTA_ROUTES = [
  'app/api/billing/dta/create/route.ts',
  'app/api/billing/dta/dashboard/route.ts',
  'app/api/billing/dta/[id]/route.ts',
  'app/api/billing/dta/[id]/validate/route.ts',
  'app/api/billing/dta/[id]/export/route.ts',
  'app/api/billing/dta/[id]/freigabe/route.ts',
  'app/api/billing/dta/[id]/storno/route.ts',
  'app/api/billing/dta/fehler/route.ts',
  'app/api/billing/dta/ruecklaeufer/route.ts',
  'app/api/billing/dta/korrektur/route.ts',
  'app/api/billing/dta/preflight/route.ts',
  'app/api/billing/dta/config-status/route.ts',
  'app/api/billing/dta/dry-run/route.ts',
]

for (const route of DTA_ROUTES) {
  test(`DTA Route ${route} verwendet getActiveOrgId()`, () => {
    const code = readRoute(route)
    assert.ok(
      hatOrgAusAuth(code),
      `${route}: MUSS die Org aus der Auth ableiten (getActiveOrgId/requireAdminMitOrg/requireOpsAdmin)`,
    )
  })

  test(`DTA Route ${route} prüft eine Abrechnungs-Berechtigung`, () => {
    const code = readRoute(route)
    // Seit dem Rollenkonzept (lib/auth/rollen.ts) pruefen die Routen nicht
    // mehr auf die Rolle, sondern auf eine Berechtigung. Fuer den
    // DTA-Versand ist das 'abrechnung.*' bzw. 'system.verwalten' bei den
    // Zugangsdaten-Routen — beides schliesst Kundschaft, Engel, PDL und QM
    // aus. Die alte Schreibweise bleibt zulaessig, damit dieser Test nicht
    // die einzige Fassung erzwingt.
    assert.ok(
      /'(abrechnung|system|tarife)\.(lesen|schreiben|verwalten)'/.test(code) ||
        code.includes('rolleDarf(') ||
        code.includes('requireAdmin') ||
        code.includes("'superadmin'"),
      `${route}: MUSS eine Berechtigung prüfen`,
    )
  })
}

// ── Leistungsnachweis CRUD: Org-Isolation + Allowlist ──

test('Leistungsnachweis CRUD hat getActiveOrgId()', () => {
  const code = readRoute('app/api/leistungsnachweis/crud/route.ts')
  assert.ok(hatOrgAusAuth(code))
})

test('Leistungsnachweis CRUD hat organization_id Filter auf Queries', () => {
  const code = readRoute('app/api/leistungsnachweis/crud/route.ts')
  const orgIdMatches = code.match(/organization_id/g) ?? []
  assert.ok(orgIdMatches.length >= 5, `Erwartet >= 5 org-Referenzen, gefunden: ${orgIdMatches.length}`)
})

test('Leistungsnachweis CRUD POST prüft Admin-Rolle', () => {
  const code = readRoute('app/api/leistungsnachweis/crud/route.ts')
  assert.ok(code.includes('requireAdmin(auth)'))
})

test('Leistungsnachweis CRUD PATCH hat Feld-Allowlist', () => {
  const code = readRoute('app/api/leistungsnachweis/crud/route.ts')
  assert.ok(code.includes('ERLAUBTE_PATCH_FELDER'))
  assert.ok(!code.includes('...updates'), 'Spread von ungefiltertem Body MUSS entfernt sein')
})

test('Leistungsnachweis CRUD PATCH hat State-Transition-Guards', () => {
  const code = readRoute('app/api/leistungsnachweis/crud/route.ts')
  assert.ok(code.includes("proof_status !== 'ABGESCHLOSSEN'"), 'sign-Action MUSS ABGESCHLOSSEN prüfen')
  assert.ok(code.includes("proof_status !== 'ENTWURF'"), 'confirm-Action MUSS ENTWURF prüfen')
})

// ── Mass-Assignment-Schutz ──

test('DTA Fehler-Route hat kein Body-Spread mehr', () => {
  const code = readRoute('app/api/billing/dta/fehler/route.ts')
  assert.ok(!code.includes('...body'), 'Body darf nicht gespreizt werden')
})

test('DTA Ruecklaeufer-Route hat kein Body-Spread mehr', () => {
  const code = readRoute('app/api/billing/dta/ruecklaeufer/route.ts')
  assert.ok(!code.includes('...body'), 'Body darf nicht gespreizt werden')
})

// ── SFTP/Zertifikat-Routen: Org-Fence ──

test('SFTP-Test Route hat getActiveOrgId()', () => {
  const code = readRoute('app/api/admin/abrechnung/sftp-test/route.ts')
  assert.ok(hatOrgAusAuth(code))
  assert.ok(code.includes('organization_id'))
})

test('SFTP-Key Route hat getActiveOrgId()', () => {
  const code = readRoute('app/api/admin/abrechnung/sftp-key/route.ts')
  assert.ok(hatOrgAusAuth(code))
  assert.ok(code.includes('organization_id'))
})

// ── Benachrichtigungen: Korrekte API-Endpunkte ──

test('Benachrichtigungen markAsRead ruft korrekten Endpoint auf', () => {
  const code = readRoute('app/admin/benachrichtigungen/page.tsx')
  assert.ok(code.includes('/api/ops/benachrichtigungen/gelesen'))
  assert.ok(!code.includes('/api/ops/benachrichtigungen/${id}'), 'Alter falscher Endpoint MUSS entfernt sein')
  assert.ok(!code.includes('/api/ops/benachrichtigungen/alle-gelesen'), 'Alter falscher Endpoint MUSS entfernt sein')
})

// ── PreFlight: Neue Prüfpunkte vorhanden ──

test('PreFlight hat SECON-Absenderzertifikat-Check', () => {
  const code = readRoute('lib/abrechnung/kassenabrechnung-engine.ts')
  assert.ok(code.includes("id: 'secon_absender'"))
})

test('PreFlight hat SFTP-Konfiguration-Check', () => {
  const code = readRoute('lib/abrechnung/kassenabrechnung-engine.ts')
  assert.ok(code.includes("id: 'sftp_config'"))
})

test('PreFlight hat Routing-Check', () => {
  const code = readRoute('lib/abrechnung/kassenabrechnung-engine.ts')
  assert.ok(code.includes("id: 'routing'"))
})

// ── DTA Config-Status API ──

test('Config-Status API existiert und hat Auth', () => {
  const code = readRoute('app/api/billing/dta/config-status/route.ts')
  assert.ok(hatOrgAusAuth(code))
  assert.ok(code.includes('SECON_ZERT_PASSWORT'))
  assert.ok(code.includes('EXTERNE KONFIGURATION ERFORDERLICH'))
})

// ── Dry-Run API ──

test('Dry-Run API schreibt nicht in die Datenbank', () => {
  const code = readRoute('app/api/billing/dta/dry-run/route.ts')
  assert.ok(!code.includes('.insert('), 'Dry-Run darf NICHT in DB inserieren')
  assert.ok(!code.includes('.update('), 'Dry-Run darf NICHT in DB updaten')
  assert.ok(code.includes("dateiindikator: '0'"), 'Testindikator MUSS 0 sein (nicht 2/Produktion)')
})

test('Dry-Run API hat 10-Schritte-Workflow', () => {
  const code = readRoute('app/api/billing/dta/dry-run/route.ts')
  assert.ok(code.includes('1. Pre-Flight'))
  assert.ok(code.includes('5. EDIFACT-Generierung'))
  assert.ok(code.includes('6. EDIFACT-Validierung'))
  assert.ok(code.includes('9. SECON-Verschlüsselung'))
  assert.ok(code.includes('10. DAKOTA/SFTP-Übermittlung'))
  assert.ok(code.includes('uebersprungen'), 'Externe Übermittlung MUSS übersprungen werden')
})

// ── Keine hardcodierten Credentials ──

test('Keine hartcodierten API-Keys oder Passwörter in DTA-Routen', () => {
  for (const route of DTA_ROUTES) {
    const code = readRoute(route)
    assert.ok(!code.includes('eyJhbGc'), `${route} darf keine JWT-Tokens enthalten`)
    assert.ok(!code.includes('sk_live'), `${route} darf keine Stripe-Keys enthalten`)
    assert.ok(!/password\s*[:=]\s*['"][^'"]/.test(code), `${route} darf keine hardcodierten Passwörter enthalten`)
  }
})
