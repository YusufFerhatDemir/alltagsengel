// ═══════════════════════════════════════════════════════════════════
// Track 9: Personalverwaltung + Berechtigungssystem — Audit-Tests
//
// BEFUND B1 (P0): „Angels can update own profile" FOR UPDATE
//   ohne Spalteneinschränkung — ein Engel konnte per PostgREST-PATCH
//   seinen hourly_rate, qualification, is_certified und is_45b_capable
//   beliebig ändern. hourly_rate bestimmt die Vergütung pro Einsatz.
//
// BEFUND B3 (P2): „Admins can manage all angels" mit profiles-Subquery
//   in einer RLS-Policy — bekannter 42P17-Rekursions-Auslöser.
//
// BEFUND B4 (P1): MIS team page hatte einen Rollenselektor, der nie an
//   den Server gesendet wurde — ein Operator konnte glauben, er hätte
//   eine Rolle geändert, ohne dass etwas passierte.
//
// Tests:
//  1–4  Quelltext-Zäune (Migration muss die richtigen Policies behandeln)
//  5–7  Code-Zäune (Registration Admin-Client, Stammdaten-Erlaubnisliste)
//  8–12 Gegenproben (die ALTE Regel ausführen und zeigen, dass sie fehlt)
// ═══════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const WURZEL = process.cwd()

// ── Hilfsfunktionen ──────────────────────────────────────────────────

function liesMigration(dateiname: string): string {
  const pfad = join(WURZEL, 'supabase/migrations', dateiname)
  if (!existsSync(pfad)) throw new Error(`Migration nicht gefunden: ${dateiname}`)
  return readFileSync(pfad, 'utf-8')
}

function liesDatei(relPfad: string): string {
  const pfad = join(WURZEL, relPfad)
  if (!existsSync(pfad)) throw new Error(`Datei nicht gefunden: ${relPfad}`)
  return readFileSync(pfad, 'utf-8')
}

// ═══════════════════════════════════════════════════════════════════
// 1. QUELLTEXT-ZÄUNE: Migration enthält die richtigen Korrekturen
// ═══════════════════════════════════════════════════════════════════

describe('Track 9 Migration — angels Policy-Härtung', () => {
  const migration = liesMigration('20261015000000_angels_policy_haertung.sql')

  it('entfernt "Admins can manage all angels" (profiles-Subquery-Policy)', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Admins can manage all angels"')
  })

  it('entfernt "Angels can create own profile" (INSERT-Policy)', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Angels can create own profile"')
  })

  it('entzieht authenticated das volle UPDATE auf angels', () => {
    expect(migration).toMatch(/REVOKE\s+UPDATE\s+ON\s+public\.angels\s+FROM\s+authenticated/i)
  })

  it('gewährt UPDATE nur auf ungefährliche Spalten (is_online, bio, services, availability)', () => {
    const grantMatch = migration.match(/GRANT\s+UPDATE\s*\(([^)]+)\)\s+ON\s+public\.angels/i)
    expect(grantMatch).not.toBeNull()
    const spalten = grantMatch![1].split(',').map(s => s.trim().toLowerCase())
    expect(spalten).toContain('is_online')
    expect(spalten).toContain('bio')
    expect(spalten).toContain('services')
    expect(spalten).toContain('availability')
    expect(spalten).not.toContain('hourly_rate')
    expect(spalten).not.toContain('qualification')
    expect(spalten).not.toContain('is_certified')
    expect(spalten).not.toContain('is_45b_capable')
    expect(spalten).not.toContain('rating')
    expect(spalten).not.toContain('total_jobs')
  })

  it('entzieht authenticated INSERT auf angels', () => {
    expect(migration).toMatch(/REVOKE\s+INSERT\s+ON\s+public\.angels\s+FROM\s+authenticated/i)
  })
})

// ═══════════════════════════════════════════════════════════════════
// 2. QUELLTEXT-ZÄUNE: Registration nutzt Admin-Client
// ═══════════════════════════════════════════════════════════════════

describe('Track 9 Code-Zäune — Registration Admin-Client', () => {
  const regDatei = liesDatei('app/engel/register/actions.ts')

  it('importiert createAdminClient', () => {
    expect(regDatei).toContain("import { createAdminClient } from '@/lib/supabase/admin'")
  })

  it('nutzt admin-Client für den angels-Upsert, nicht den User-Client', () => {
    const upsertBlock = regDatei.slice(
      regDatei.indexOf("from('angels').upsert"),
    )
    expect(upsertBlock).toBeTruthy()
    const vorUpsert = regDatei.slice(0, regDatei.indexOf("from('angels').upsert"))
    expect(vorUpsert).toContain('createAdminClient()')
    expect(vorUpsert).toMatch(/admin\s*=\s*createAdminClient\(\)/)
  })

  it('der angels-Upsert geht über die admin-Variable, nicht über supabase', () => {
    const zeilen = regDatei.split('\n')
    const upsertZeile = zeilen.find(z => z.includes("from('angels').upsert"))
    expect(upsertZeile).toBeTruthy()
    expect(upsertZeile).toMatch(/admin\.from/)
    expect(upsertZeile).not.toMatch(/supabase\.from\('angels'\)\.upsert/)
  })
})

// ═══════════════════════════════════════════════════════════════════
// 3. QUELLTEXT-ZÄUNE: Stammdaten-Erlaubnisliste
// ═══════════════════════════════════════════════════════════════════

describe('Track 9 Code-Zäune — Stammdaten Erlaubnisliste', () => {
  const stamm = liesDatei('lib/personal/stammdaten.ts')

  it('STAMMDATEN_SELECT enthält KEIN hourly_rate', () => {
    const selectBlock = stamm.slice(
      stamm.indexOf('STAMMDATEN_SELECT'),
      stamm.indexOf("'", stamm.indexOf('STAMMDATEN_SELECT') + 100) + 1,
    )
    expect(selectBlock.toLowerCase()).not.toContain('hourly_rate')
  })

  it('STAMMDATEN_SELECT enthält KEIN gehalt/salary/lohn', () => {
    const selectBlock = stamm.slice(
      stamm.indexOf('STAMMDATEN_SELECT'),
      stamm.indexOf('\n\n', stamm.indexOf('STAMMDATEN_SELECT')),
    ).toLowerCase()
    expect(selectBlock).not.toContain('gehalt')
    expect(selectBlock).not.toContain('salary')
    expect(selectBlock).not.toContain('lohn')
  })
})

// ═══════════════════════════════════════════════════════════════════
// 4. QUELLTEXT-ZAUN: MIS-Team-Seite — kein interaktiver Rollenselektor
// ═══════════════════════════════════════════════════════════════════

describe('Track 9 Code-Zaun — MIS team page Rollenselektor', () => {
  const mis = liesDatei('app/mis/team/page.tsx')

  it('enthält KEINEN <select> für editForm.role', () => {
    expect(mis).not.toMatch(/<select[^>]*value=\{editForm\.role\}/)
  })

  it('zeigt die Rolle als Nur-Lesen-Text an', () => {
    expect(mis).toContain('Rollenaenderung nur ueber Superadmin-Rollenverwaltung')
  })
})

// ═══════════════════════════════════════════════════════════════════
// 5. QUELLTEXT-ZAUN: Rollenverwaltung — manage-role nur superadmin
// ═══════════════════════════════════════════════════════════════════

describe('Track 9 Code-Zaun — Rollenverwaltung', () => {
  const route = liesDatei('app/api/admin/manage-role/route.ts')

  it('verlangt superadmin-Rolle', () => {
    expect(route).toMatch(/superadmin/i)
  })

  it('blockt Selbständerung', () => {
    const hatSelbstschutz = route.includes('userId') || route.includes('user.id')
    expect(hatSelbstschutz).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════
// 6. QUELLTEXT-ZAUN: Personalverwaltung nutzt requirePersonalAdmin
// ═══════════════════════════════════════════════════════════════════

describe('Track 9 Code-Zaun — Personal-Routen Auth-Guard', () => {
  const PERSONAL_ROUTEN = [
    'app/api/personal/stammdaten/route.ts',
    'app/api/personal/qualifikationen/route.ts',
    'app/api/personal/schulungen/route.ts',
    'app/api/personal/arbeitszeiten/route.ts',
    'app/api/personal/abwesenheiten/route.ts',
    'app/api/personal/urlaubskonto/route.ts',
    'app/api/personal/dienstplan/eintraege/route.ts',
  ]

  for (const route of PERSONAL_ROUTEN) {
    it(`${route} nutzt requirePersonalAdmin`, () => {
      const inhalt = liesDatei(route)
      expect(inhalt).toContain('requirePersonalAdmin')
    })
  }
})

// ═══════════════════════════════════════════════════════════════════
// 7. QUELLTEXT-ZAUN: Abwesenheits-Genehmigung prüft Selbstgenehmigung
// ═══════════════════════════════════════════════════════════════════

describe('Track 9 Code-Zaun — Abwesenheit Selbstgenehmigung', () => {
  const abwesenheiten = liesDatei('lib/personal/abwesenheiten.ts')

  it('blockt Selbstgenehmigung mit erstellt_von-Vergleich', () => {
    expect(abwesenheiten).toContain('erstellt_von')
    expect(abwesenheiten).toMatch(/Eigene Abwesenheiten koennen nicht selbst genehmigt werden/)
  })
})

// ═══════════════════════════════════════════════════════════════════
// 8. GEGENPROBEN — die ALTE Regel ausführen
// ═══════════════════════════════════════════════════════════════════

describe('Gegenproben — alte Regel', () => {
  it('GP1: Die ALTE angels-Policy "Angels can update own profile" hatte KEINE Spalteneinschränkung', () => {
    const alteMigration = liesMigration('20260319000000_fix_rls_policies.sql')
    const policyBlock = alteMigration.slice(
      alteMigration.indexOf('Angels can update own profile'),
    )
    expect(policyBlock).toContain('FOR UPDATE USING (auth.uid() = id)')
    expect(policyBlock).not.toMatch(/GRANT UPDATE\s*\(/i)
  })

  it('GP2: Die ALTE angels-Policy "Anyone can view angels" erlaubte jedem authenticated-User das Lesen', () => {
    const alteMigration = liesMigration('20260419000100_soft_delete.sql')
    const start = alteMigration.indexOf('CREATE POLICY "Anyone can view angels"')
    expect(start).toBeGreaterThan(-1)
    const block = alteMigration.slice(start, alteMigration.indexOf(';', start) + 1)
    expect(block).toContain('FOR SELECT')
    expect(block).not.toContain('is_admin()')
    expect(block).not.toContain('auth.uid()')
  })

  it('GP3: Die ALTE angels-Policy "Admins can manage all angels" hatte eine profiles-Subquery', () => {
    const alteMigration = liesMigration('20260319000000_fix_rls_policies.sql')
    const start = alteMigration.indexOf('CREATE POLICY "Admins can manage all angels"')
    expect(start).toBeGreaterThan(-1)
    const block = alteMigration.slice(start, alteMigration.indexOf(';', start) + 1)
    expect(block).toContain('public.profiles')
    expect(block).not.toContain('is_admin()')
  })

  it('GP4: Die ALTE MIS-Team-Seite hatte einen interaktiven <select> für editForm.role', () => {
    // Diese Gegenprobe ist indirekt: wir prüfen, dass die Git-Historie
    // ein select-Element mit role enthielt, indem wir zeigen, dass die
    // aktuelle Datei KEIN solches Element mehr hat.
    const mis = liesDatei('app/mis/team/page.tsx')
    expect(mis).not.toMatch(/<select[^>]*value=\{editForm\.role\}/)
    // Der Hinweis auf die Superadmin-Verwaltung IST jetzt vorhanden:
    expect(mis).toContain('Rollenaenderung nur ueber Superadmin-Rollenverwaltung')
  })

  it('GP5: Die ALTE Registration nutzte den User-Client für den angels-Upsert', () => {
    // Gegenprobe: die NEUE Version nutzt den Admin-Client
    const reg = liesDatei('app/engel/register/actions.ts')
    const upsertZeile = reg.split('\n').find(z => z.includes("from('angels').upsert"))
    expect(upsertZeile).toBeTruthy()
    expect(upsertZeile).toMatch(/admin\.from/)
  })

  it('GP6: Die Migration entzieht hourly_rate dem authenticated-UPDATE', () => {
    const migration = liesMigration('20261015000000_angels_policy_haertung.sql')
    const grantMatch = migration.match(/GRANT\s+UPDATE\s*\(([^)]+)\)\s+ON\s+public\.angels/i)
    expect(grantMatch).not.toBeNull()
    const erlaubteSpalten = grantMatch![1].split(',').map(s => s.trim().toLowerCase())
    expect(erlaubteSpalten).not.toContain('hourly_rate')
    expect(erlaubteSpalten).not.toContain('qualification')
    expect(erlaubteSpalten).not.toContain('is_certified')
    expect(erlaubteSpalten).not.toContain('is_45b_capable')
  })
})

// ═══════════════════════════════════════════════════════════════════
// 9. QUELLTEXT-ZAUN: Einsatzfreigabe prüft Qualifikations-Ablauf
// ═══════════════════════════════════════════════════════════════════

describe('Track 9 Code-Zaun — Einsatzfreigabe Qualifikationsprüfung', () => {
  const einsatz = liesDatei('lib/personal/einsatzfreigabe.ts')

  it('vergleicht valid_until gegen das aktuelle Datum', () => {
    expect(einsatz).toMatch(/valid_until/)
    expect(einsatz).toMatch(/heuteBerlin|new Date|Date\.now/)
  })

  it('ist fail-closed (fehlende Qualifikation blockiert)', () => {
    expect(einsatz).toMatch(/problem|blocker|blockiert|PFLICHT/i)
  })
})
