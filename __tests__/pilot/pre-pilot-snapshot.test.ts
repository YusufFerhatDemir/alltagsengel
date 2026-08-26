// ═══════════════════════════════════════════════════════════════════════
// PRE-PILOT-SNAPSHOT
//
// Ein Snapshot kann auf drei Arten falsch sein, und zwei davon sieht man
// ihm nicht an:
//
//   1. Er behauptet, gemessen zu haben, was er abgeschrieben hat. Deshalb
//      trägt jeder Punkt eine `herkunft`, und die Suite prüft, dass ein
//      dokumentierter Wert NIE grün erscheint.
//   2. Er zeigt einen Ersatzwert statt einer gescheiterten Messung. Ein
//      Lesefehler muss zu `null` und einem Hinweis führen, nie zu 0.
//   3. Er ist selbst eine Nebenwirkung. Ein Snapshot, der schreibt, ist
//      kein Snapshot.
//
// Dazu die eigentliche Aussage des Auftrags: die drei Zusicherungen
// (Rechnungsversand aus, Mahnversand aus, CAMT trocken) müssen aus dem
// echten Schalter-Code kommen und nicht aus einer Kopie davon.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'

import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'
import {
  erstellePrePilotSnapshot,
  snapshotAlsText,
  projektRefAus,
  ERWARTETER_PROJEKT_REF,
  JUENGSTE_MIGRATIONEN,
  type PrePilotSnapshot,
} from '@/lib/pilot/pre-pilot-snapshot'

const ORG = '11111111-1111-4111-8111-111111111111'
const JETZT = new Date('2026-08-26T12:00:00.000Z')

/** Umgebung ohne jeden scharfen Schalter. Werte sind Platzhalter. */
const ENV_RUHEND: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: `https://${ERWARTETER_PROJEKT_REF}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: 'platzhalter',
  RESEND_API_KEY: 'platzhalter',
  CRON_SECRET: 'platzhalter',
  VERCEL_ENV: 'production',
  VERCEL_REGION: 'fra1',
  VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890',
}

function fake(
  antwort: (a: FakeAufruf) => { data?: unknown; error?: { message: string } | null; count?: number | null } | undefined = () => undefined,
) {
  return erstelleFakeSupabase(a => {
    const eigen = antwort(a)
    if (eigen) return eigen
    if (a.head) return { count: 1 }
    return { data: [] }
  })
}

async function lauf(
  f: ReturnType<typeof fake> = fake(),
  quelle = ENV_RUHEND,
  gemeldet = {},
): Promise<PrePilotSnapshot> {
  return erstellePrePilotSnapshot(f.client as unknown as SupabaseClient, {
    organizationId: ORG, quelle, gemeldet, jetzt: JETZT,
  })
}

function punkt(s: PrePilotSnapshot, schluessel: string) {
  return s.abschnitte.flatMap(a => a.punkte).find(p => p.schluessel === schluessel)
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Struktur
// ═══════════════════════════════════════════════════════════════════════

describe('Struktur', () => {
  it('liefert alle sieben Abschnitte in fester Reihenfolge', async () => {
    const s = await lauf()
    expect(s.abschnitte.map(a => a.id)).toEqual([
      'code', 'deployment', 'datenbank', 'migrationen', 'sicherheit', 'zustellung', 'schalter',
    ])
  })

  it('jeder Punkt trägt Herkunft, Ampel und einen Befund', async () => {
    const s = await lauf()
    for (const p of s.abschnitte.flatMap(a => a.punkte)) {
      expect(p.herkunft).toBeTruthy()
      expect(p.ampel).toBeTruthy()
      expect(p.befund.length).toBeGreaterThan(10)
    }
  })

  it('der Zeitstempel ist injizierbar — sonst wäre kein Lauf reproduzierbar', async () => {
    const s = await lauf()
    expect(s.erstelltAm).toBe(JETZT.toISOString())
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Keine Nebenwirkung
// ═══════════════════════════════════════════════════════════════════════

describe('Keine Nebenwirkung', () => {
  it('schreibt nichts', async () => {
    const f = fake()
    await lauf(f)
    expect(f.aufrufe.filter(a => a.operation !== 'select')).toEqual([])
  })

  it('jede Datenbankabfrage ist mandantengefenced', async () => {
    const f = fake()
    await lauf(f)
    // `organizations` wird über die id gelesen — das IST der Mandantenfilter.
    for (const a of f.aufrufe) {
      const gefenced = hatFilter(a, 'eq', 'organization_id', ORG) || hatFilter(a, 'eq', 'id', ORG)
      expect(gefenced, `${a.tabelle} ohne Mandantenfilter`).toBe(true)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Herkunft — die zentrale Eigenschaft
// ═══════════════════════════════════════════════════════════════════════

describe('Herkunft', () => {
  it('kein dokumentierter Wert erscheint grün', async () => {
    const s = await lauf()
    const dokumentiert = s.abschnitte.flatMap(a => a.punkte).filter(p => p.herkunft === 'dokumentiert')
    expect(dokumentiert.length).toBeGreaterThan(0)
    for (const p of dokumentiert) {
      // Ein abgeschriebener Wert ist kein Beleg. Wäre er grün, sähe er
      // aus wie eine bestandene Prüfung.
      expect(p.ampel, `${p.schluessel} ist dokumentiert und trotzdem grün`).not.toBe('gruen')
    }
  })

  it('kein nicht messbarer Wert erscheint grün', async () => {
    const s = await lauf()
    for (const p of s.abschnitte.flatMap(a => a.punkte).filter(p => p.herkunft === 'nicht_messbar')) {
      expect(p.ampel, `${p.schluessel}`).not.toBe('gruen')
    }
  })

  it('gemeldete Git-Werte sind als gemeldet gekennzeichnet, nie als gemessen', async () => {
    const s = await lauf(fake(), ENV_RUHEND, { gitHead: 'abcdef1234567890', originMain: 'abcdef1234567890' })
    expect(punkt(s, 'git_head')?.herkunft).toBe('gemeldet')
    expect(punkt(s, 'origin_main')?.herkunft).toBe('gemeldet')
    // Der laufende Commit ist der einzige, der wirklich messbar ist.
    expect(punkt(s, 'laufender_commit')?.herkunft).toBe('gemessen')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Commit-Abgleich
// ═══════════════════════════════════════════════════════════════════════

describe('Commit-Abgleich', () => {
  it('gleiche Stände sind grün', async () => {
    const s = await lauf(fake(), ENV_RUHEND, { gitHead: 'abcdef1234567890', originMain: 'abcdef1' })
    const p = punkt(s, 'commit_gleichstand')!
    expect(p.wert).toBe(true)
    expect(p.ampel).toBe('gruen')
  })

  it('ein abweichender origin/main ist rot — der wichtigste Punkt im Snapshot', async () => {
    const s = await lauf(fake(), ENV_RUHEND, { originMain: '9999999aaaa' })
    const p = punkt(s, 'commit_gleichstand')!
    expect(p.wert).toBe(false)
    expect(p.ampel).toBe('rot')
    expect(p.befund).toContain('abcdef1')
    expect(p.befund).toContain('9999999')
  })

  it('ohne gemeldete Werte ist der Abgleich nicht möglich — und sagt das', async () => {
    const s = await lauf()
    const p = punkt(s, 'commit_gleichstand')!
    expect(p.wert).toBeNull()
    expect(p.herkunft).toBe('nicht_messbar')
    expect(p.ampel).toBe('ungeprueft')
  })

  it('eine rot gemeldete CI färbt den Abschnitt rot', async () => {
    const s = await lauf(fake(), ENV_RUHEND, { ciStatus: 'rot', ciLauf: '123' })
    expect(punkt(s, 'ci')?.ampel).toBe('rot')
    expect(s.abschnitte.find(a => a.id === 'code')?.ampel).toBe('rot')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Datenbank
// ═══════════════════════════════════════════════════════════════════════

describe('Datenbank', () => {
  it('erkennt die erwartete Produktionsinstanz', async () => {
    const s = await lauf()
    const p = punkt(s, 'projekt_ref')!
    expect(p.wert).toBe(ERWARTETER_PROJEKT_REF)
    expect(p.ampel).toBe('gruen')
  })

  it('eine fremde Supabase-Instanz ist rot', async () => {
    const s = await lauf(fake(), { ...ENV_RUHEND, NEXT_PUBLIC_SUPABASE_URL: 'https://schatten123.supabase.co' })
    const p = punkt(s, 'projekt_ref')!
    expect(p.ampel).toBe('rot')
    expect(p.befund).toContain(ERWARTETER_PROJEKT_REF)
  })

  it('unterscheidet „Datenbank tot" von „Mandant existiert nicht"', async () => {
    const tot = await lauf(fake(a => a.tabelle === 'organizations' ? { error: { message: 'connection refused' } } : undefined))
    expect(punkt(tot, 'db_erreichbar')?.wert).toBeNull()
    expect(punkt(tot, 'db_erreichbar')?.herkunft).toBe('nicht_messbar')

    const leer = await lauf(fake(a => a.tabelle === 'organizations' ? { count: 0 } : undefined))
    expect(punkt(leer, 'db_erreichbar')?.wert).toBe(false)
    expect(punkt(leer, 'db_erreichbar')?.befund).toContain('existiert dort nicht')
  })

  it('ein Lesefehler wird zu null plus Hinweis, nie zu 0', async () => {
    const s = await lauf(fake(a => a.tabelle === 'billing_audit_trail' ? { error: { message: 'permission denied' } } : undefined))
    expect(punkt(s, 'audit_system')?.wert).toBeNull()
    expect(s.hinweise.some(h => h.includes('billing_audit_trail'))).toBe(true)
  })

  it('ein nicht erreichbarer Audit-Trail ist rot — ein Geldvorgang ohne Nachweis ist keiner', async () => {
    const s = await lauf(fake(a => a.tabelle === 'billing_audit_trail' ? { error: { message: 'permission denied' } } : undefined))
    expect(punkt(s, 'audit_system')?.ampel).toBe('rot')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. Zusicherungen — der Kern des Auftrags
// ═══════════════════════════════════════════════════════════════════════

describe('Zusicherungen', () => {
  it('ohne gesetzte Schalter ist der Zustand RUHEND', async () => {
    const s = await lauf()
    expect(s.zusicherungen).toMatchObject({
      rechnungsversandAus: true, mahnversandAus: true, camtTrocken: true, alleRuhend: true,
    })
    expect(s.zustand).toBe('RUHEND')
  })

  it('ein scharfer Rechnungsversand macht den Zustand SCHARF', async () => {
    const s = await lauf(fake(), { ...ENV_RUHEND, RECHNUNGSVERSAND_AUTOMATISCH: '1' })
    expect(s.zusicherungen.rechnungsversandAus).toBe(false)
    expect(s.zustand).toBe('SCHARF')
    expect(punkt(s, 'rechnungsversand')?.ampel).toBe('rot')
  })

  it('ein scharfer Mahnversand macht den Zustand SCHARF', async () => {
    const s = await lauf(fake(), { ...ENV_RUHEND, MAHNVERSAND_AUTOMATISCH: '1' })
    expect(s.zusicherungen.mahnversandAus).toBe(false)
    expect(s.zustand).toBe('SCHARF')
  })

  it('CAMT_IMPORT_MODE=LIVE macht den Zustand SCHARF', async () => {
    const s = await lauf(fake(), { ...ENV_RUHEND, CAMT_IMPORT_MODE: 'LIVE' })
    expect(s.zusicherungen.camtTrocken).toBe(false)
    expect(s.zustand).toBe('SCHARF')
    expect(punkt(s, 'camt_modus')?.wert).toBe('LIVE')
  })

  // Der Schalter wirkt nur im Produktionslauf — das ist die
  // Umgebungstrennung aus Phase 7, und sie muss im Snapshot sichtbar sein.
  it('ein gesetzter Schalter außerhalb der Produktion bleibt wirkungslos und damit RUHEND', async () => {
    const s = await lauf(fake(), {
      ...ENV_RUHEND, VERCEL_ENV: 'preview', RECHNUNGSVERSAND_AUTOMATISCH: '1',
    })
    expect(s.zusicherungen.rechnungsversandAus).toBe(true)
    expect(s.zustand).toBe('RUHEND')
  })

  it('ein ungültiger CAMT-Wert bleibt trocken, wird aber als Hinweis sichtbar', async () => {
    const s = await lauf(fake(), { ...ENV_RUHEND, CAMT_IMPORT_MODE: 'live' })
    expect(s.zusicherungen.camtTrocken).toBe(true)
    expect(punkt(s, 'camt_wert')?.ampel).toBe('gelb')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7. Keine Geheimnisse
// ═══════════════════════════════════════════════════════════════════════

describe('Keine Geheimnisse', () => {
  const GEHEIM = 'streng-geheimer-testwert-4711'

  it('gibt nur das Vorhandensein von Schlüsseln aus, nie ihren Wert', async () => {
    const s = await lauf(fake(), { ...ENV_RUHEND, RESEND_API_KEY: GEHEIM, CRON_SECRET: GEHEIM })
    const alles = JSON.stringify(s) + snapshotAlsText(s)
    expect(alles).not.toContain(GEHEIM)
    expect(punkt(s, 'resend')?.wert).toBe(true)
    expect(punkt(s, 'cron')?.wert).toBe(true)
  })

  it('meldet einen fehlenden Resend-Schlüssel als gelb, nicht als grün', async () => {
    const s = await lauf(fake(), { ...ENV_RUHEND, RESEND_API_KEY: undefined })
    expect(punkt(s, 'resend')?.wert).toBe(false)
    expect(punkt(s, 'resend')?.ampel).toBe('gelb')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 8. Migrationsliste gegen das echte Verzeichnis
// ═══════════════════════════════════════════════════════════════════════

describe('Migrationsliste', () => {
  it('nennt genau die fünf jüngsten Dateien in supabase/migrations', () => {
    const verzeichnis = join(process.cwd(), 'supabase', 'migrations')
    const echt = readdirSync(verzeichnis).filter(n => n.endsWith('.sql')).sort().slice(-5)
    // Schlägt dieser Test fehl, ist eine Migration hinzugekommen und die
    // Konstante nicht nachgezogen — der Snapshot bezöge sich dann auf einen
    // Stand von vorgestern. Die erwartete Liste steht in der Meldung.
    expect(
      [...JUENGSTE_MIGRATIONEN],
      `JUENGSTE_MIGRATIONEN in lib/pilot/pre-pilot-snapshot.ts nachziehen auf:\n${JSON.stringify(echt, null, 2)}`,
    ).toEqual(echt)
  })

  it('sagt ausdrücklich, dass „im Repo" nicht „angewendet" heißt', async () => {
    const s = await lauf()
    expect(punkt(s, 'angewendet')?.wert).toBeNull()
    expect(punkt(s, 'angewendet')?.herkunft).toBe('nicht_messbar')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 9. Hilfsfunktion + Textfassung
// ═══════════════════════════════════════════════════════════════════════

describe('projektRefAus', () => {
  it('liest den Ref aus einer Supabase-URL', () => {
    expect(projektRefAus('https://abc123.supabase.co')).toBe('abc123')
  })

  it('ergibt null statt eines geratenen Teilstrings', () => {
    expect(projektRefAus(undefined)).toBeNull()
    expect(projektRefAus('kein-url')).toBeNull()
    expect(projektRefAus('https://localhost')).toBeNull()
  })
})

describe('Textfassung', () => {
  it('trägt das Urteil in Zeile 1', async () => {
    const s = await lauf()
    expect(snapshotAlsText(s).split('\n')[0]).toContain('RUHEND')
  })

  it('zeigt einen fehlenden Wert als Strich, nicht als 0', async () => {
    const s = await lauf(fake(a => a.tabelle === 'billing_audit_trail' ? { error: { message: 'weg' } } : undefined))
    const text = snapshotAlsText(s)
    expect(text).toContain('Audit-System: —')
    expect(text).not.toContain('Audit-System: 0')
  })
})
