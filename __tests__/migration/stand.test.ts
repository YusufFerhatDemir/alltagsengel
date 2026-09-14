/**
 * Wartende Migrationen — Stand messen statt behaupten
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 47, 14.09.2026)
 *
 * Sechs Migrationen liegen im Repo und sind nicht angewendet. Bis hierher
 * liess sich nicht MESSEN, ob das noch stimmt:
 *
 *   * `supabase_migrations.schema_migrations` liegt in einem Schema, das
 *     PostgREST nicht ausliefert.
 *   * Ein Apply ueber den Dienstschluessel meldet HTTP 204 auch dann,
 *     wenn ihm die Rechte fehlten.
 *   * Zweimal stellte sich in diesem Projekt heraus, dass eine als
 *     „offen" gefuehrte Migration laengst live war — und einmal das
 *     Gegenteil.
 *
 * Deshalb fragt der Katalog nach der WIRKUNG, nicht nach dem Eintrag.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import {
  WARTENDE_MIGRATIONEN, wirkungVorhanden, standVon, fehlendeWirkungen,
  wirkungsSchluessel, dispatchText,
  type LiveWirkung, type Wirkung,
} from '@/lib/migration/stand'

const liveAus = (...w: LiveWirkung[]) =>
  new Map(w.map(x => [wirkungsSchluessel(x), x]))

const POLICY: Wirkung = {
  art: 'policy', tabelle: 't', name: 't_org_fence', restriktiv: true, zweck: 'Zaun.',
}
const CHECK: Wirkung = {
  art: 'constraint', tabelle: 't', name: 't_action_check', enthaelt: 'neu_wert', zweck: 'CHECK.',
}

describe('wirkungVorhanden — „vorhanden" allein genuegt nicht', () => {
  it('fehlt ganz', () => {
    expect(wirkungVorhanden(POLICY, liveAus())).toBe(false)
  })

  it('vorhanden und RESTRICTIVE', () => {
    expect(wirkungVorhanden(POLICY, liveAus(
      { art: 'policy', tabelle: 't', name: 't_org_fence', restriktiv: true },
    ))).toBe(true)
  })

  it('vorhanden, aber PERMISSIVE — das ist KEINE Wirkung', () => {
    // Permissive Policies sind ODER-verknuepft. Ein permissiver
    // Mandantenzaun neben is_admin() bewirkt nichts; wer nur nach dem
    // Namen fragt, setzt ein Haekchen unter einen wirkungslosen Zaun.
    expect(wirkungVorhanden(POLICY, liveAus(
      { art: 'policy', tabelle: 't', name: 't_org_fence', restriktiv: false },
    ))).toBe(false)
  })

  it('eine Policy ohne Restriktiv-Anspruch nimmt beides', () => {
    const p: Wirkung = { art: 'policy', tabelle: 't', name: 't_select', zweck: 'Lesen.' }
    expect(wirkungVorhanden(p, liveAus(
      { art: 'policy', tabelle: 't', name: 't_select', restriktiv: false },
    ))).toBe(true)
  })

  it('CHECK steht, laesst den neuen Wert aber nicht zu', () => {
    expect(wirkungVorhanden(CHECK, liveAus(
      { art: 'constraint', tabelle: 't', name: 't_action_check', definition: "CHECK (action IN ('alt'))" },
    ))).toBe(false)
  })

  it('CHECK steht und laesst ihn zu', () => {
    expect(wirkungVorhanden(CHECK, liveAus(
      { art: 'constraint', tabelle: 't', name: 't_action_check', definition: "CHECK (action IN ('alt','neu_wert'))" },
    ))).toBe(true)
  })

  it('Policy und Constraint gleichen Namens werden nicht verwechselt', () => {
    expect(wirkungVorhanden(
      { art: 'constraint', tabelle: 't', name: 't_org_fence', zweck: 'x' },
      liveAus({ art: 'policy', tabelle: 't', name: 't_org_fence', restriktiv: true }),
    )).toBe(false)
  })
})

describe('standVon — teilweise ist ein eigener Zustand', () => {
  const m = {
    datei: 'x.sql', ruecknahme: 'y.sql', titel: 't', ohneSie: 'o',
    wirkungen: [POLICY, CHECK],
  }

  it('offen, wenn keine Wirkung da ist', () => {
    expect(standVon(m, liveAus())).toBe('offen')
  })

  it('teilweise, wenn nur eine da ist — der gefaehrliche Fall', () => {
    expect(standVon(m, liveAus(
      { art: 'policy', tabelle: 't', name: 't_org_fence', restriktiv: true },
    ))).toBe('teilweise')
  })

  it('angewendet, wenn jede da ist', () => {
    expect(standVon(m, liveAus(
      { art: 'policy', tabelle: 't', name: 't_org_fence', restriktiv: true },
      { art: 'constraint', tabelle: 't', name: 't_action_check', definition: "IN ('neu_wert')" },
    ))).toBe('angewendet')
  })

  it('fehlendeWirkungen nennt genau die fehlenden', () => {
    const fehlt = fehlendeWirkungen(m, liveAus(
      { art: 'policy', tabelle: 't', name: 't_org_fence', restriktiv: true },
    ))
    expect(fehlt.map(f => f.name)).toEqual(['t_action_check'])
  })
})

describe('der Katalog', () => {
  it('fuehrt sechs wartende Migrationen', () => {
    expect(WARTENDE_MIGRATIONEN).toHaveLength(6)
  })

  it('jede Datei und jede Ruecknahme existiert im Repo', () => {
    const fehlend: string[] = []
    for (const m of WARTENDE_MIGRATIONEN) {
      for (const d of [m.datei, m.ruecknahme]) {
        if (!existsSync(`supabase/migrations/${d}`)) fehlend.push(d)
      }
    }
    expect(fehlend).toEqual([])
  })

  it('jede erwartete Wirkung kommt in ihrer Migrationsdatei vor', () => {
    // Sonst prueft der Lauf auf einen Namen, den die Migration gar nicht
    // anlegt — und meldete sie auf ewig als offen.
    const fehlend: string[] = []
    for (const m of WARTENDE_MIGRATIONEN) {
      const sql = readFileSync(`supabase/migrations/${m.datei}`, 'utf8')
      for (const w of m.wirkungen) {
        if (!sql.includes(w.name)) fehlend.push(`${m.datei}: ${w.name}`)
        if (w.enthaelt && !sql.includes(w.enthaelt)) fehlend.push(`${m.datei}: ${w.enthaelt}`)
      }
    }
    expect(fehlend).toEqual([])
  })

  it('eine RESTRICTIVE-Erwartung steht auch so in der Migration', () => {
    for (const m of WARTENDE_MIGRATIONEN) {
      const sql = readFileSync(`supabase/migrations/${m.datei}`, 'utf8')
      for (const w of m.wirkungen) {
        if (!w.restriktiv) continue
        expect(sql, `${m.datei}/${w.name}`).toMatch(/AS RESTRICTIVE/)
      }
    }
  })

  it('jede Migration sagt, was ohne sie NICHT geht', () => {
    for (const m of WARTENDE_MIGRATIONEN) {
      expect(m.ohneSie.length, m.datei).toBeGreaterThan(80)
    }
  })

  it('jede Wirkung nennt ihren Zweck', () => {
    for (const m of WARTENDE_MIGRATIONEN) {
      for (const w of m.wirkungen) {
        expect(w.zweck.length, `${m.datei}/${w.name}`).toBeGreaterThan(20)
      }
    }
  })

  it('ist nach Migrationsnummer sortiert — das ist die Anwendungsreihenfolge', () => {
    const nummern = WARTENDE_MIGRATIONEN.map(m => m.datei.slice(0, 14))
    expect([...nummern].sort()).toEqual(nummern)
  })

  it('kein Eintrag doppelt', () => {
    const dateien = WARTENDE_MIGRATIONEN.map(m => m.datei)
    expect(new Set(dateien).size).toBe(dateien.length)
  })
})

describe('die Dispatch-Datei ist erzeugt, nicht gepflegt', () => {
  it('stimmt mit dem Katalog ueberein', () => {
    // Getrennt gepflegt waeren es zwei Wahrheiten, und die zweite waere
    // nach der ersten Aenderung falsch.
    const datei = readFileSync('docs/migrations/DISPATCH.md', 'utf8')
    expect(datei).toBe(dispatchText())
  })

  it('nennt jede Migration und jede Ruecknahme', () => {
    const t = dispatchText()
    for (const m of WARTENDE_MIGRATIONEN) {
      expect(t, m.datei).toContain(m.datei)
      expect(t, m.ruecknahme).toContain(m.ruecknahme)
    }
  })

  it('nennt den Prueflauf, mit dem man die Wirkung misst', () => {
    expect(dispatchText()).toContain('npm run verify:migrationsstand')
  })

  it('erklaert den Zustand „teilweise" — sonst liest ihn niemand als Warnung', () => {
    expect(dispatchText()).toContain('teilweise')
    expect(dispatchText()).toContain('sieht er aus wie Erfolg')
  })

  it('sagt, dass eine Ruecknahme scheitern KANN', () => {
    expect(dispatchText()).toContain('scheitern')
  })
})

describe('die Skripte sind verdrahtet', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

  it('verify:migrationsstand', () => {
    expect(pkg.scripts['verify:migrationsstand']).toBe('tsx scripts/verify-migrationsstand.ts')
  })

  it('migrations:dispatch', () => {
    expect(pkg.scripts['migrations:dispatch']).toBe('tsx scripts/generate-migrations-dispatch.ts')
  })

  it('der Lauf wertet einen leeren Messwert als Stoerung, nicht als Freispruch', () => {
    const quelle = readFileSync('scripts/verify-migrationsstand.ts', 'utf8')
    expect(quelle).toContain('live.size === 0')
    expect(quelle).toContain('kein Freispruch')
  })

  it('der Lauf liest `permissive` mit — ohne das waere die RESTRICTIVE-Pruefung tot', () => {
    const quelle = readFileSync('scripts/verify-migrationsstand.ts', 'utf8')
    expect(quelle).toContain('permissive')
    expect(quelle).toContain("permissive === 'RESTRICTIVE'")
  })

  it('der Lauf nutzt den Parameter `p` des Lese-Orakels, nicht `query`', () => {
    expect(readFileSync('scripts/verify-migrationsstand.ts', 'utf8')).toContain('p: `DO $$')
  })
})
