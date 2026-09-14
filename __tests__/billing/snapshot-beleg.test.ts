/**
 * Der Beleg, der blind geschrieben wurde
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 98, 14.09.2026)
 *
 * `invoice_snapshots` ist die Unveraenderlichkeits-Spur der Abrechnung:
 * jede Zeile traegt den vollstaendigen Inhalt eines Vorgangs und eine
 * Pruefsumme darueber. Storno, Korrektur und Gutschrift schreiben sie —
 * an vier Stellen, und an allen vieren so:
 *
 *     await supabase.from('invoice_snapshots').insert({ … })
 *
 * Kein `error`, keine Zerlegung. PostgREST wirft nicht. Der Ablauf lief
 * danach weiter und stornierte, korrigierte oder gutschrieb — ohne den
 * Beleg, der spaeter beweisen soll, WAS storniert wurde und dass es
 * seither unveraendert ist.
 *
 * Die Tabelle kann den INSERT auf mehreren Wegen abweisen (live am
 * 14.09.2026 gelesen):
 *     invoice_snapshots_org_fence   RESTRICTIVE
 *     snapshot_type CHECK           festschreibung|storno|korrektur|gutschrift
 *     unique_invoice_version        UNIQUE (invoice_id, version)
 *     checksum                      NOT NULL
 *
 * WAS DARAN AUFFAELLT: in denselben drei Funktionen steht der
 * Ruecknahme-Weg bereits ausformuliert und begruendet. Der
 * Snapshot-Schritt war in jeder dieser Folgen der EINZIGE, der nicht
 * nachsah — derselbe Satz wie in den Bloecken 55 bis 97.
 *
 * LIVE: 0 Snapshot-Zeilen bei 3 Rechnungen, keine davon storniert oder
 * korrigiert. Die vier Wege sind in Produktion noch nie gelaufen. Das ist
 * der richtige Zeitpunkt.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { schreibeSnapshot } from '../../lib/billing/core/snapshot-schreiben'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'
import type { SupabaseClient } from '@supabase/supabase-js'

const ORG = '00000000-0000-4000-8000-000460629986'

const EINTRAG = {
  invoice_id: 'inv-1',
  version: 1,
  snapshot: { type: 'storno' },
  snapshot_type: 'storno' as const,
  checksum: 'abc123',
  created_by: 'actor-1',
  organization_id: ORG,
}

function fake(geber: (a: FakeAufruf) => { data?: unknown; error?: { message: string; code?: string } | null } | undefined) {
  const f = erstelleFakeSupabase(geber)
  return { client: f.client as unknown as SupabaseClient, f }
}

describe('schreibeSnapshot meldet seinen Ausgang', () => {
  it('meldet Erfolg, wenn eine Zeile entstanden ist', async () => {
    const { client } = fake(() => ({ data: [{ id: 's-1' }], error: null }))
    expect(await schreibeSnapshot(client, EINTRAG)).toEqual({ ok: true })
  })

  it('meldet den Fehler, wenn der org_fence den INSERT abweist', async () => {
    const { client } = fake(() => ({ data: null, error: { message: 'new row violates row-level security policy', code: '42501' } }))
    expect(await schreibeSnapshot(client, EINTRAG)).toEqual({
      ok: false,
      grund: 'new row violates row-level security policy',
    })
  })

  it('meldet den Fehler bei einem Verstoss gegen unique_invoice_version', async () => {
    const { client } = fake(() => ({ data: null, error: { message: 'duplicate key value violates unique constraint "unique_invoice_version"', code: '23505' } }))
    const r = await schreibeSnapshot(client, EINTRAG)
    expect(r.ok).toBe(false)
    // 23505 ist hier KEIN Normalfall: derselbe Vorgang zweimal zu
    // belegen hiesse, dass er zweimal gelaufen ist.
    expect(r.ok === false && r.grund).toMatch(/unique_invoice_version/)
  })

  it('meldet Fehlschlag auch OHNE Fehler, wenn keine Zeile zurueckkam', async () => {
    // Null getroffene Zeilen ist bei PostgREST kein Fehler — ein Beleg,
    // den es nicht gibt, belegt aber nichts.
    const { client } = fake(() => ({ data: [], error: null }))
    expect(await schreibeSnapshot(client, EINTRAG)).toEqual({ ok: false, grund: 'keine Zeile angelegt' })
  })

  it('verlangt die Zeile zurueck', async () => {
    const { client, f } = fake(() => ({ data: [{ id: 's-1' }], error: null }))
    await schreibeSnapshot(client, EINTRAG)
    expect(f.aufrufe[0].tabelle).toBe('invoice_snapshots')
    expect(f.aufrufe[0].operation).toBe('insert')
    expect(f.aufrufe[0].roh).toBe('insert')
    expect(f.aufrufe[0].spalten).toBe('id')
  })

  it('reicht die Pruefsumme und den Mandanten mit durch', async () => {
    // `checksum` ist NOT NULL und der ganze Zweck der Zeile;
    // `organization_id` entscheidet ueber den RESTRICTIVE org_fence.
    const { client, f } = fake(() => ({ data: [{ id: 's-1' }], error: null }))
    await schreibeSnapshot(client, EINTRAG)
    const p = f.aufrufe[0].payload as Record<string, unknown>
    expect(p.checksum).toBe('abc123')
    expect(p.organization_id).toBe(ORG)
  })
})

describe('Kein Vorgang ohne Beleg — die vier Stellen', () => {
  const ENGINE = readFileSync('lib/billing/core/invoice-engine.ts', 'utf8')
  const CREDIT = readFileSync('lib/billing/core/credit-notes.ts', 'utf8')

  function ausgefuehrt(text: string): string {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter(z => !z.trim().startsWith('//')).join('\n')
  }

  it('kein blindes insert auf invoice_snapshots mehr', () => {
    // BLIND heisst: `await` steht am Zeilenanfang, das Ergebnis wird
    // also nirgends gebunden. Die Festschreibung unten schreibt
    // dieselbe Tabelle und ist NICHT gemeint — sie zerlegt ihr Ergebnis
    // seit jeher.
    const blind = /^[ \t]*await supabase[\s\S]{0,60}?\.from\('invoice_snapshots'\)[\s\S]{0,20}?\.insert\(/m
    for (const [name, quelle] of [['invoice-engine', ENGINE], ['credit-notes', CREDIT]] as const) {
      expect(ausgefuehrt(quelle), name).not.toMatch(blind)
      expect(ausgefuehrt(quelle), name).not.toContain("await supabase.from('invoice_snapshots').insert(")
    }
  })

  it('die Festschreibung war die ganze Zeit das richtige Gegenstueck', () => {
    // Von fuenf Schreibwegen auf diese Tabelle sah EINER nach. Genau
    // dieser Satz ist der Befund — und er bleibt nur wahr, solange das
    // Gegenstueck nicht selbst verwaessert wird.
    const ab = ENGINE.indexOf("snapshot_type: 'festschreibung'")
    expect(ab).toBeGreaterThan(-1)
    const stelle = ENGINE.slice(ENGINE.lastIndexOf('const {', ab), ENGINE.indexOf('// Line-Snapshots', ab))
    expect(stelle).toContain('error: snapError')
    expect(stelle).toContain('throw new Error(')
  })

  it('alle vier gehen ueber schreibeSnapshot', () => {
    const treffer =
      (ausgefuehrt(ENGINE).match(/schreibeSnapshot\(/g) ?? []).length
      + (ausgefuehrt(CREDIT).match(/schreibeSnapshot\(/g) ?? []).length
    // 3 in der Engine (Storno, Korrektur, Gutschrift) + 1 in der Freigabe.
    expect(treffer).toBe(4)
  })

  it('und jede wertet das Ergebnis aus', () => {
    // Ein Aufruf, dessen Rueckgabe niemand ansieht, waere derselbe Befund
    // mit einem laengeren Namen.
    const auswertungen =
      (ausgefuehrt(ENGINE).match(/if \(!beleg\w*\.ok\)/g) ?? []).length
      + (ausgefuehrt(CREDIT).match(/if \(!beleg\w*\.ok\)/g) ?? []).length
    expect(auswertungen).toBe(4)
  })
})

describe('Die drei ruecknehmbaren Wege nehmen zurueck', () => {
  const ENGINE = readFileSync('lib/billing/core/invoice-engine.ts', 'utf8')

  /** Der Abschnitt vom Beleg bis zum Wurf. */
  function zweig(name: string): string {
    const ab = ENGINE.indexOf(`if (!${name}.ok) {`)
    expect(ab, `${name} nicht gefunden`).toBeGreaterThan(-1)
    return ENGINE.slice(ab, ENGINE.indexOf('throw new Error(', ab) + 400)
  }

  it('Storno nimmt die Stornorechnung zurueck', () => {
    const t = zweig('belegStorno')
    expect(t).toContain(".from('invoices').delete().eq('id', stornoInvoice.id)")
    expect(t).toContain('throw new Error(')
  })

  it('Korrektur nimmt Korrektur, Positionen und Rechnung zurueck', () => {
    const t = zweig('belegKorrektur')
    for (const tabelle of ['invoice_corrections', 'invoice_items', 'invoices']) {
      expect(t, tabelle).toContain(`.from('${tabelle}').delete()`)
    }
  })

  it('Gutschrift nimmt Korrektur und Gutschrift zurueck', () => {
    const t = zweig('belegGutschrift')
    expect(t).toContain(".from('invoice_corrections').delete()")
    expect(t).toContain(".from('invoices').delete().eq('id', creditInvoice.id)")
  })

  it('eine gescheiterte Ruecknahme bleibt nicht stumm', () => {
    // Bleibt eine halbe Korrekturrechnung stehen, muss es irgendwo
    // stehen — sonst ist der Rollback selbst der naechste stille Weg.
    for (const name of ['belegStorno', 'belegKorrektur', 'belegGutschrift']) {
      expect(zweig(name), name).toContain('log.error(')
    }
  })
})

describe('Die Freigabe kann nichts zuruecknehmen — und sagt das', () => {
  const CREDIT = readFileSync('lib/billing/core/credit-notes.ts', 'utf8')

  it('wirft, statt die Freigabe abzuschliessen', () => {
    const ab = CREDIT.indexOf('if (!belegFreigabe.ok) {')
    expect(ab).toBeGreaterThan(-1)
    const t = CREDIT.slice(ab, ab + 600)
    expect(t).toContain('throw new Error(')
    // Kein Rollback: `frozen_at` ist eine Zeile hoeher gesetzt worden und
    // ausdruecklich einmalig.
    expect(t).not.toContain('.delete()')
  })

  it('die Meldung nennt beide Halbzustaende', () => {
    const ab = CREDIT.indexOf('if (!belegFreigabe.ok) {')
    const t = CREDIT.slice(ab, ab + 600).replace(/`\s*\+\s*`/g, '').replace(/\s+/g, ' ')
    expect(t).toContain('bereits festgeschrieben')
    expect(t).toContain('bleibt im Entwurf')
  })

  it('der Beleg wird VOR der Statusaenderung der Korrektur geschrieben', () => {
    // Andersherum waere die Korrektur freigegeben und der Wurf zu spaet.
    expect(CREDIT.indexOf('if (!belegFreigabe.ok) {'))
      .toBeLessThan(CREDIT.indexOf("status: 'freigegeben',"))
  })
})
