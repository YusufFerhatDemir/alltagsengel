/**
 * Ein hängengebliebener Abrechnungslauf war in keiner einzigen Zahl
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 73)
 *
 * Drei Zustände beschreiben keinen Wartezustand, sondern einen laufenden
 * Vorgang: `validierung_laeuft`, `export_laeuft`, `uebermittlung_laeuft`.
 * In der Pipeline-Übersicht kamen sie nirgends vor:
 *
 *   - `naechsterSchrittText` kannte sie nicht → `null` → die Spalte
 *     „Nächster Schritt" zeigte „—",
 *   - `laufStatusZuSchritt` ordnete sie dem VORIGEN Meilenstein zu, ein
 *     Lauf im Export erschien also unter „Freigegeben",
 *   - und in der Zusammenfassung zählten sie in KEINER Kennzahl:
 *     `wartendAufFreigabe`, `wartendAufAntwort`, `fehlerhaft`,
 *     `abgeschlossen` — an keiner Stelle.
 *
 * Ein festhängender Lauf sah damit aus wie einer, der gerade eben
 * gestartet ist. Dauerhaft.
 *
 * Block 72 hat die Ursache im Export geschlossen: jeder Abbruch holt den
 * Lauf wieder heraus. Das deckt nur Abbrüche, bei denen überhaupt noch
 * Code läuft. Ein abgebrochener Serverless-Aufruf, ein Zeitlimit der
 * Plattform, ein Neustart mitten im Export — dort greift kein catch.
 * Dagegen hilft nur, dass es auffällt.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  stehtStill, STILLSTAND_MINUTEN, ZWISCHENZUSTAENDE, holePipelineStatus,
} from '@/lib/abrechnung/pipeline-orchestrator'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'

const JETZT = new Date('2026-09-14T12:00:00.000Z')
const vorMinuten = (n: number) => new Date(JETZT.getTime() - n * 60_000).toISOString()

describe('stehtStill — was als Stillstand gilt', () => {
  it('kennt genau die drei Zwischenzustände', () => {
    expect([...ZWISCHENZUSTAENDE]).toEqual([
      'validierung_laeuft', 'export_laeuft', 'uebermittlung_laeuft',
    ])
  })

  it('meldet einen Lauf, der länger als die Schwelle dort steht', () => {
    expect(stehtStill('export_laeuft', vorMinuten(STILLSTAND_MINUTEN + 1), JETZT)).toBe(true)
  })

  it('lässt einen laufenden Vorgang in Ruhe', () => {
    expect(stehtStill('export_laeuft', vorMinuten(2), JETZT)).toBe(false)
  })

  it('genau auf der Schwelle noch nicht', () => {
    expect(stehtStill('export_laeuft', vorMinuten(STILLSTAND_MINUTEN), JETZT)).toBe(false)
  })

  it('gilt für alle drei Zustände', () => {
    for (const z of ZWISCHENZUSTAENDE) {
      expect(stehtStill(z, vorMinuten(120), JETZT), z).toBe(true)
    }
  })

  it('nicht für einen Wartezustand — dort ist Warten der Zweck', () => {
    for (const z of ['freigegeben', 'geprueft', 'uebermittelt', 'quittiert', 'erstellt']) {
      expect(stehtStill(z, vorMinuten(10_000), JETZT), z).toBe(false)
    }
  })
})

describe('Ohne Zeitstempel wird nichts behauptet', () => {
  it('null ist keine Aussage über die Dauer', () => {
    expect(stehtStill('export_laeuft', null, JETZT)).toBe(false)
  })

  it('und ein unlesbarer Zeitstempel auch nicht', () => {
    expect(stehtStill('export_laeuft', 'irgendwann', JETZT)).toBe(false)
  })

  it('undefined ebenso', () => {
    expect(stehtStill('export_laeuft', undefined, JETZT)).toBe(false)
  })
})

describe('Quelltext: die Übersicht zeigt den Stillstand', () => {
  const SRC = readFileSync('lib/abrechnung/pipeline-orchestrator.ts', 'utf8')

  it('jeder Zwischenzustand hat jetzt einen nächsten Schritt', () => {
    for (const z of ZWISCHENZUSTAENDE) {
      expect(SRC, z).toContain(`case '${z}': return '`)
    }
  })

  it('und im Stillstand einen anderen als im Lauf', () => {
    expect(SRC).toContain('const STILLSTAND_TEXT: Record<string, string>')
    for (const z of ZWISCHENZUSTAENDE) {
      expect(SRC, z).toMatch(new RegExp(`${z}:\\s*\\n?\\s*'Steht seit`))
    }
  })

  it('der Stillstandstext geht dem regulären vor', () => {
    const fn = SRC.slice(SRC.indexOf('function naechsterSchrittText'))
    const riegel = fn.indexOf('if (stillstand && STILLSTAND_TEXT[status])')
    // Erst die Anwesenheit, dann die Reihenfolge: ein fehlender Riegel
    // ergibt -1 und waere „kleiner als" — die Zusicherung waere blind.
    expect(riegel).toBeGreaterThan(-1)
    expect(riegel).toBeLessThan(fn.indexOf('switch (status)'))
  })

  it('die Zusammenfassung hat eine eigene Zahl dafür', () => {
    expect(SRC).toContain('haengengeblieben: pipelineLaeufe.filter(l => l.haengengeblieben).length')
  })

  it('sie erweitert NICHT „fehlerhaft" — das ist etwas anderes', () => {
    const zus = SRC.slice(SRC.indexOf('const zusammenfassung = {'))
      .slice(0, SRC.slice(SRC.indexOf('const zusammenfassung = {')).indexOf('}\n'))
    expect(zus).toContain("'validierung_fehlgeschlagen'")
    expect(zus.slice(zus.indexOf('fehlerhaft:'), zus.indexOf('abgeschlossen:')))
      .not.toContain('haengengeblieben')
  })

  it('alle Läufe werden gegen denselben Zeitpunkt gemessen', () => {
    // Sonst könnten zwei Läufe mit demselben Zeitstempel verschieden
    // beurteilt werden.
    expect(SRC).toContain('const jetztPruefung = new Date()')
    expect(SRC).toContain('stehtStill(status, l.updated_at, jetztPruefung)')
  })
})

describe('Quelltext: und die Tabelle zeigt ihn auch', () => {
  const SEITE = readFileSync('app/admin/ruecklaeufer/page.tsx', 'utf8')

  it('die Zeile kennt das Merkmal', () => {
    expect(SEITE).toContain('haengengeblieben?: boolean')
  })

  it('und hebt die Spalte „Nächster Schritt" hervor', () => {
    const zelle = SEITE.slice(SEITE.indexOf('{l.haengengeblieben &&') - 400)
      .slice(0, 600)
    expect(zelle).toContain('l.haengengeblieben')
    expect(zelle).toMatch(/color: l\.haengengeblieben \?/)
  })
})


// ════════════════════════════════════════════════════════════════════
// Im Lauf: die Uebersicht selbst
// ════════════════════════════════════════════════════════════════════

const ORG = '11111111-1111-4111-8111-111111111111'

/** Minuten in der Vergangenheit, relativ zu JETZT (echte Uhr). */
function vorMin(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString()
}

async function uebersicht(laeufe: { id: string; status: string; updated_at: string | null }[]) {
  const fake = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === 'abrechnungslaeufe') {
      return {
        data: laeufe.map(l => ({
          id: l.id, abrechnungsmonat: '2026-08', kostentraeger_name: 'AOK',
          kostentraeger_ik: '999999999', status: l.status, updated_at: l.updated_at,
        })),
      }
    }
    if (a.tabelle === 'dta_ruecklaeufer') return { data: [], count: 0 }
    return {}
  })
  return holePipelineStatus(fake.client, ORG)
}

describe('Die Uebersicht zaehlt den Stillstand', () => {
  it('ein feststehender Export taucht in der eigenen Zahl auf', async () => {
    const st = await uebersicht([{ id: 'l1', status: 'export_laeuft', updated_at: vorMin(90) }])
    expect(st.zusammenfassung.haengengeblieben).toBe(1)
  })

  it('ein gerade laufender Export nicht', async () => {
    const st = await uebersicht([{ id: 'l1', status: 'export_laeuft', updated_at: vorMin(1) }])
    expect(st.zusammenfassung.haengengeblieben).toBe(0)
  })

  it('und der Lauf traegt das Merkmal', async () => {
    const st = await uebersicht([{ id: 'l1', status: 'export_laeuft', updated_at: vorMin(90) }])
    expect(st.laeufe[0].haengengeblieben).toBe(true)
  })

  it('der naechste Schritt sagt, was zu tun ist — nicht mehr „—"', async () => {
    const st = await uebersicht([{ id: 'l1', status: 'export_laeuft', updated_at: vorMin(90) }])
    expect(st.laeufe[0].naechsterSchritt).toMatch(/Steht seit/)
    expect(st.laeufe[0].naechsterSchritt).toMatch(/Validierung fehlgeschlagen/)
  })

  it('und im laufenden Vorgang, dass er laeuft', async () => {
    const st = await uebersicht([{ id: 'l1', status: 'export_laeuft', updated_at: vorMin(1) }])
    expect(st.laeufe[0].naechsterSchritt).toBe('Export läuft …')
  })

  it('„fehlerhaft" bleibt, was es war', async () => {
    const st = await uebersicht([
      { id: 'l1', status: 'export_laeuft', updated_at: vorMin(90) },
      { id: 'l2', status: 'validierung_fehlgeschlagen', updated_at: vorMin(90) },
    ])
    expect(st.zusammenfassung.fehlerhaft).toBe(1)
    expect(st.zusammenfassung.haengengeblieben).toBe(1)
  })

  it('alle drei Zwischenzustaende zaehlen mit', async () => {
    const st = await uebersicht(
      [...ZWISCHENZUSTAENDE].map((z, i) => ({ id: `l${i}`, status: z, updated_at: vorMin(90) })),
    )
    expect(st.zusammenfassung.haengengeblieben).toBe(3)
  })

  it('ein Lauf ohne Zeitstempel wird nicht beschuldigt', async () => {
    const st = await uebersicht([{ id: 'l1', status: 'export_laeuft', updated_at: null }])
    expect(st.zusammenfassung.haengengeblieben).toBe(0)
    expect(st.laeufe[0].naechsterSchritt).toBe('Export läuft …')
  })
})
