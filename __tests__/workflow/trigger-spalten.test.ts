/**
 * Workflow-Emitter-Trigger — Spaltenabgleich gegen die Quelltabelle
 *
 * HINTERGRUND (Live-Befund vom 14.08.2026, Pilot-E2E):
 *   INSERT INTO public.payments … → 42703 „record 'new' has no field 'invoice_id'"
 *
 *   public.wf_trigger_zahlung() las NEW.invoice_id. Auf public.payments gibt
 *   es diese Spalte nicht — eine Zahlung ist n:m mit Rechnungen verknüpft,
 *   über public.payment_allocations. Der AFTER-INSERT-Trigger rollte damit
 *   JEDEN Zahlungseingang zurück: OPOS, Mahnwesen und der DATEV-Weg standen
 *   still, ohne dass irgendwo ein Fehler sichtbar wurde.
 *
 * Diese Suite liest die Migrationen und hält fest, dass ein Emitter-Trigger
 * nur Spalten liest, die seine Quelltabelle laut Migration wirklich hat.
 * Rein statisch, keine Datenbankverbindung.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONEN = join(process.cwd(), 'supabase', 'migrations')

/** Alle Migrationsdateien in Anwendungsreihenfolge. */
function migrationsDateien(): string[] {
  return readdirSync(MIGRATIONEN).filter(d => d.endsWith('.sql')).sort()
}

/**
 * Letzte Fassung einer Funktion über ALLE Migrationen hinweg.
 * Entscheidend ist der zuletzt angewendete Rumpf, nicht der erste —
 * genau das unterscheidet einen behobenen von einem offenen Defekt.
 * Rollback-Dateien zählen nicht, sie werden nur im Notfall angewendet.
 */
function letzterFunktionsrumpf(funktion: string): { datei: string; rumpf: string } | null {
  let treffer: { datei: string; rumpf: string } | null = null
  for (const datei of migrationsDateien()) {
    if (datei.includes('_rollback_')) continue
    const inhalt = readFileSync(join(MIGRATIONEN, datei), 'utf8')
    const start = inhalt.indexOf(`CREATE OR REPLACE FUNCTION public.${funktion}(`)
    if (start === -1) continue
    // Rumpf bis zum abschliessenden $$; der Dollar-Quote-Blöcke.
    const ende = inhalt.indexOf('$$;', start)
    treffer = { datei, rumpf: inhalt.slice(start, ende === -1 ? undefined : ende) }
  }
  return treffer
}

/** Alle NEW.<spalte>-Zugriffe eines Funktionsrumpfs. */
function geleseneSpalten(rumpf: string): string[] {
  return [...new Set([...rumpf.matchAll(/NEW\.([a-z_][a-z0-9_]*)/gi)].map(m => m[1].toLowerCase()))]
}

describe('wf_trigger_zahlung', () => {
  it('wird zuletzt von der Fix-Migration definiert', () => {
    const treffer = letzterFunktionsrumpf('wf_trigger_zahlung')
    expect(treffer).not.toBeNull()
    // Belegt zugleich, dass die Reihenfolge greift: die Erstfassung aus
    // 20260813010000 ist die defekte, sie darf nicht das letzte Wort haben.
    expect(treffer!.datei).toBe('20260905000000_fix_wf_trigger_zahlung.sql')
  })

  it('liest KEIN NEW.invoice_id — payments hat keine solche Spalte', () => {
    const treffer = letzterFunktionsrumpf('wf_trigger_zahlung')!
    const spalten = geleseneSpalten(treffer.rumpf)
    expect(
      spalten,
      `Die zuletzt angewendete Fassung steht in ${treffer.datei}. ` +
      'Die Verknüpfung Zahlung→Rechnung liegt in payment_allocations, nicht auf payments.',
    ).not.toContain('invoice_id')
  })

  it('liest nur Spalten, die public.payments laut Migration besitzt', () => {
    const treffer = letzterFunktionsrumpf('wf_trigger_zahlung')!
    // Spaltenliste aus der Tabellendefinition (20260808210000) ableiten.
    const schema = readFileSync(
      join(MIGRATIONEN, '20260808210000_zahlungen_forderungen_monatsabschluss.sql'),
      'utf8',
    )
    const tabelle = schema.slice(
      schema.indexOf('CREATE TABLE IF NOT EXISTS public.payments'),
      schema.indexOf('CREATE INDEX IF NOT EXISTS idx_payments_org'),
    )
    expect(tabelle.length).toBeGreaterThan(0)

    for (const spalte of geleseneSpalten(treffer.rumpf)) {
      expect(
        new RegExp(`^\\s+${spalte}\\b`, 'mi').test(tabelle),
        `wf_trigger_zahlung liest NEW.${spalte}, aber public.payments hat diese Spalte nicht. ` +
        'Ein AFTER-INSERT-Trigger mit unbekannter Spalte rollt jeden Zahlungseingang zurück.',
      ).toBe(true)
    }
  })
})
