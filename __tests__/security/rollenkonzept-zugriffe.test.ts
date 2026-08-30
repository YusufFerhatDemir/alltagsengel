// ═══════════════════════════════════════════════════════════════════════
// Rollenkonzept — unerlaubte Zugriffe
// ═══════════════════════════════════════════════════════════════════════
// Zwei Ebenen:
//   1. VERHALTEN: requireBerechtigung() gegen eine gemockte Sitzung —
//      welche Rolle bekommt 401, welche 403, welche kommt durch.
//   2. BESTAND: kein Guard und keine Route darf wieder auf eine
//      hartkodierte Rollenliste zurueckfallen. Das ist die Regression,
//      die das ganze Modell aushebeln wuerde, ohne einen Test rot zu
//      machen, der nur Verhalten prueft.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const WURZEL = path.join(__dirname, '..', '..')

// ── Gemockte Sitzung ──────────────────────────────────────────────────
let aktuelleRolle: string | null = 'admin'
let angemeldet = true

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: angemeldet ? { id: 'u1', app_metadata: {} } : null },
      }),
      mfa: {
        // Kein zweiter Faktor eingerichtet → keine AAL2-Pflicht.
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal1', nextLevel: 'aal1' },
        }),
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: aktuelleRolle ? { role: aktuelleRolle, first_name: 'Test', last_name: 'Person' } : null,
          }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: async () => '00000000-0000-4000-8000-0000000000aa',
}))

import { requireBerechtigung, requireAdministration } from '@/lib/auth/guard'

async function status(
  rolle: string | null,
  aufruf: () => Promise<{ ok: boolean; response?: { status: number } }>,
): Promise<number> {
  aktuelleRolle = rolle
  angemeldet = rolle !== null
  const r = await aufruf()
  return r.ok ? 200 : (r.response?.status ?? 0)
}

beforeEach(() => {
  aktuelleRolle = 'admin'
  angemeldet = true
})

describe('requireBerechtigung', () => {
  it('antwortet ohne Anmeldung mit 401', async () => {
    expect(await status(null, () => requireBerechtigung('stammdaten.lesen'))).toBe(401)
  })

  it('laesst die Administration durch', async () => {
    expect(await status('admin', () => requireBerechtigung('bankdaten.schreiben'))).toBe(200)
    expect(await status('superadmin', () => requireBerechtigung('tarife.schreiben'))).toBe(200)
  })

  it('weist die Buchhaltung an Gesundheitsdaten mit 403 ab', async () => {
    expect(await status('buchhaltung', () => requireBerechtigung('pflege.lesen'))).toBe(403)
    expect(await status('buchhaltung', () => requireBerechtigung('pflege.schreiben'))).toBe(403)
  })

  it('weist die PDL an Bankdaten mit 403 ab', async () => {
    expect(await status('pdl', () => requireBerechtigung('bankdaten.lesen'))).toBe(403)
  })

  it('weist das QM an der Abrechnung mit 403 ab', async () => {
    expect(await status('qm', () => requireBerechtigung('abrechnung.lesen'))).toBe(403)
  })

  it('weist jede Fachrolle an der Benutzerverwaltung mit 403 ab', async () => {
    for (const r of ['pdl', 'qm', 'buchhaltung']) {
      expect(await status(r, () => requireBerechtigung('benutzer.verwalten')), r).toBe(403)
    }
  })

  it('weist jede Fachrolle an Tarifaenderungen mit 403 ab', async () => {
    for (const r of ['pdl', 'qm', 'buchhaltung']) {
      expect(await status(r, () => requireBerechtigung('tarife.schreiben')), r).toBe(403)
    }
  })

  it('weist Kundschaft und Engel ueberall mit 403 ab', async () => {
    for (const r of ['kunde', 'engel', 'fahrer', 'angehoerige']) {
      expect(await status(r, () => requireBerechtigung('stammdaten.lesen')), r).toBe(403)
    }
  })

  it('verlangt ALLE genannten Berechtigungen, nicht eine davon', async () => {
    // Buchhaltung hat abrechnung.lesen, aber nicht pflege.lesen.
    expect(await status('buchhaltung', () =>
      requireBerechtigung(['abrechnung.lesen', 'pflege.lesen']))).toBe(403)
    expect(await status('buchhaltung', () =>
      requireBerechtigung(['abrechnung.lesen', 'bankdaten.lesen']))).toBe(200)
  })

  it('weist eine unbekannte Rolle ab, statt sie durchzuwinken', async () => {
    expect(await status('hausmeister', () => requireBerechtigung('berichte.lesen'))).toBe(403)
  })

  it('weist ein Konto ohne Profilzeile mit 401 ab', async () => {
    aktuelleRolle = null
    angemeldet = true
    const r = await requireBerechtigung('berichte.lesen')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.response.status).toBe(401)
  })
})

describe('requireAdministration', () => {
  it('laesst nur admin und superadmin durch', async () => {
    expect(await status('admin', () => requireAdministration())).toBe(200)
    expect(await status('superadmin', () => requireAdministration())).toBe(200)
    for (const r of ['pdl', 'qm', 'buchhaltung', 'engel', 'kunde']) {
      expect(await status(r, () => requireAdministration()), r).toBe(403)
    }
  })
})

// ── Bestandsschutz ────────────────────────────────────────────────────

function dateien(muster: string): string[] {
  return execSync(muster, { cwd: WURZEL, encoding: 'utf-8' }).split('\n').filter(Boolean)
}

function lies(rel: string): string {
  return fs.readFileSync(path.join(WURZEL, rel), 'utf-8')
}

describe('Bestandsschutz: keine hartkodierten Rollenlisten', () => {
  /**
   * Ausnahmen mit Begruendung. Beides sind Pruefungen, die STRENGER sind
   * als die Matrix und deshalb bewusst nicht darauf umgestellt wurden:
   *   - reset-password: nur ein Superadmin darf das Passwort eines
   *     Administrators zuruecksetzen.
   *   - ai-chat: interner Admin-Chat, bewusst ohne Fachrollen.
   */
  const AUSNAHMEN = new Set([
    'app/api/admin/reset-password/route.ts',
    'app/api/ai-chat/route.ts',
  ])

  /**
   * lib/coach/api-auth.ts kennt bewusst gar keine Rollen: der PflegeCoach
   * ist ein Endnutzer-Produkt, in dem jeder Angemeldete nur die EIGENEN
   * Daten sieht (DiPAV-Produktgrenze). Ein Verwaltungs-Guard waere dort
   * eine Erweiterung, keine Einschraenkung.
   */
  const GUARDS_OHNE_ROLLEN = new Set(['lib/coach/api-auth.ts'])

  /**
   * Wie ein Guard die Berechtigungsfrage stellt.
   *
   * Bis zum 28.08.2026 war das ueberall `rolleDarf(profile.role, …)` —
   * also gegen EINE Rollenquelle. Seitdem laeuft die Frage ueber
   * quellenDuerfen() (lib/auth/rollen-quelle.ts) und damit gegen BEIDE
   * autoritativen Quellen (app_metadata.role und profiles.role).
   * lib/signaturen stellt sie ueber sichtbareDokumenttypen(), weil dort
   * die Dokumentart den Fachbereich bestimmt.
   *
   * Wichtig bleibt die urspruengliche Aussage des Tests: gefragt wird nach
   * einer BERECHTIGUNG, nicht nach einer Rollenliste.
   *
   * Nachtrag 30.08.2026: `requireBerechtigung(` zaehlt ebenfalls. Es ist
   * der allgemeine Guard aus lib/auth/guard.ts und ruft intern
   * wirksamDarfAlle() — also dieselbe Frage gegen BEIDE autoritativen
   * Quellen, plus MFA und Organisationsaufloesung. Ein Fach-Guard, der
   * nur eine duenne Huelle darum ist (lib/marketing/api-auth.ts:
   * requireBerechtigung('marketing.verwalten')), stellt die
   * Berechtigungsfrage damit strenger als rolleDarf() und nicht
   * schwaecher — er reicht sie nur eine Ebene weiter.
   */
  const BERECHTIGUNGSFRAGE =
    /rolleDarf\(|quellenDuerfen\(|wirksamDarf\(|sichtbareDokumenttypen\(|requireBerechtigung\(/

  it('kein Fach-Guard prueft noch gegen eine Rollenliste', () => {
    const guards = dateien("find lib -name 'api-auth.ts'; echo lib/abrechnung/require-admin.ts")
    expect(guards.length).toBeGreaterThan(10)
    for (const g of guards) {
      const src = lies(g)
      expect(src, `${g}: prueft noch gegen eine Rollenliste`).not.toMatch(
        /\['admin',\s*'superadmin'\]\.includes/,
      )
      if (!GUARDS_OHNE_ROLLEN.has(g)) {
        expect(src, `${g}: stellt keine Berechtigungsfrage`).toMatch(BERECHTIGUNGSFRAGE)
      }
    }
  })

  it('keine API-Route prueft noch gegen eine Rollenliste', () => {
    const routen = dateien("find app/api -name route.ts")
    const treffer = routen.filter(
      r => !AUSNAHMEN.has(r) && /\['admin',\s*'superadmin'\]\.includes/.test(lies(r)),
    )
    expect(treffer, `Routen mit hartkodierter Rollenliste: ${treffer.join(', ')}`).toEqual([])
  })

  it('nutzt nur Berechtigungen, die es im Katalog gibt', async () => {
    const { BERECHTIGUNGEN } = await import('@/lib/auth/rollen')
    const quellen = dateien("find app lib -name '*.ts' -not -path '*/node_modules/*'")
    const unbekannt = new Set<string>()
    for (const q of quellen) {
      const src = lies(q)
      for (const m of src.matchAll(
        /(?:rolleDarf|requireBerechtigung|require\w*Admin|hatBerechtigung)\([^)]*?'([a-z]+\.[a-z]+)'/g,
      )) {
        if (!(BERECHTIGUNGEN as readonly string[]).includes(m[1])) unbekannt.add(`${q}: ${m[1]}`)
      }
    }
    expect([...unbekannt]).toEqual([])
  })
})

describe('Bestandsschutz: sensible Bereiche tragen die richtige Berechtigung', () => {
  it('Bankdaten-Routen verlangen bankdaten.*', () => {
    for (const r of dateien("find app/api/billing/sepa -name route.ts")) {
      const src = lies(r)
      expect(src, `${r}: keine Bankdaten-Berechtigung`).toMatch(/'bankdaten\.(lesen|schreiben)'/)
      expect(src, `${r}: haengt noch an der Abrechnung`).not.toMatch(/'abrechnung\.(lesen|schreiben)'/)
    }
  })

  it('Pflege-Routen tragen nie eine Abrechnungs- oder Bankberechtigung', () => {
    const routen = dateien(
      "find app/api/pflege app/api/wounds app/api/vitals app/api/sis app/api/medikamente -name route.ts",
    )
    expect(routen.length).toBeGreaterThan(20)
    for (const r of routen) {
      const src = lies(r)
      expect(src, `${r}: Abrechnungsberechtigung an Gesundheitsdaten`).not.toMatch(
        /'(abrechnung|bankdaten|tarife)\.(lesen|schreiben)'/,
      )
    }
  })

  it('jede Pflege-Route mit Verwaltungs-Guard verlangt pflege.*', () => {
    const routen = dateien(
      "find app/api/pflege app/api/wounds app/api/vitals app/api/sis app/api/medikamente -name route.ts",
    )
    // Routen, die nur require*User() nutzen, pruefen den angemeldeten
    // Nutzer und nicht eine Verwaltungsrolle — dort gehoert keine
    // Berechtigung hin, die Grenze zieht RLS ueber die Einsatzzuordnung.
    const mitVerwaltungsGuard = routen.filter(r =>
      /require(Pflege|Wunden|Med|Sig|Ops)Admin\(/.test(lies(r)),
    )
    expect(mitVerwaltungsGuard.length).toBeGreaterThan(15)
    for (const r of mitVerwaltungsGuard) {
      expect(lies(r), `${r}: keine Pflege-Berechtigung`).toMatch(/'pflege\.(lesen|schreiben)'/)
    }
  })

  it('Tarif-Freigabe verlangt tarife.schreiben', () => {
    const src = lies('lib/billing/tarif-verifizierung-service.ts')
    expect(src).toContain("requireOpsAdmin('tarife.schreiben')")
  })

  it('Benutzerverwaltung verlangt benutzer.verwalten', () => {
    expect(lies('app/api/admin/reset-password/route.ts')).toContain("'benutzer.verwalten'")
    // Track 7 (28.08.2026): die Rollenverwaltung fragte
    // `callerProfile.role !== 'superadmin'` — also nur profiles. Eine
    // Herabstufung, die nur im Token steht, liess den Vorgang damit
    // weiterlaufen. Gefordert wird jetzt, dass BEIDE Quellen superadmin
    // sagen; die Aussage des Tests (nur superadmin darf hier hinein)
    // bleibt dieselbe, sie wird nur strenger geprueft.
    expect(lies('app/api/admin/manage-role/route.ts'))
      .toContain("quellenSindRolle(callerProfileQuellen, 'superadmin')")
  })
})
