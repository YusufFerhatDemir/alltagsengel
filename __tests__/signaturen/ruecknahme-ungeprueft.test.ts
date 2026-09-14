/**
 * Signaturkette — die Ruecknahme war selbst ungeprueft
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 59, 14.09.2026)
 *
 * Signaturdokument und Signaturanforderung werden fail-closed angelegt:
 * erst die Zeile, dann der Protokolleintrag — schlaegt der fehl, wird die
 * Zeile wieder geloescht und die Ausnahme weitergereicht. Der Kommentar
 * nannte das „die Ruecknahme also sauber".
 *
 * Die Ruecknahme selbst war UNGEPRUEFT: `await dienst.from(...).delete()`
 * ohne Fehler- und ohne Zeilenpruefung. Schlug sie fehl, blieb die Zeile
 * stehen — und der Aufrufer bekam eine Ausnahme, die ihn annehmen liess,
 * es sei nichts entstanden.
 *
 * Bei der Signaturanforderung wiegt das schwerer als beim Dokument: sie
 * taucht in der Liste der Signatarin auf und laesst sich unterschreiben,
 * obwohl ihre Anforderung nie protokolliert wurde.
 *
 * Dieselbe Form wie Block 57 (SEPA-Ruecknahme mit falscher Zusage).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const MODUL = readFileSync('lib/signaturen/signaturen.ts', 'utf8')

function catchBlockNach(anker: string): string {
  const ab = MODUL.indexOf(anker)
  expect(ab, `Anker nicht gefunden: ${anker}`).toBeGreaterThan(-1)
  const c = MODUL.indexOf('} catch (err) {', ab)
  expect(c).toBeGreaterThan(ab)
  return MODUL.slice(c, c + 1400)
}

const DOKUMENT = catchBlockNach("aktion: 'dokument_erstellt'")
const ANFORDERUNG = catchBlockNach("aktion: 'signatur_angefordert'")

describe.each([
  ['Signaturdokument', DOKUMENT, 'signatur_dokumente'],
  ['Signaturanforderung', ANFORDERUNG, 'signaturen'],
])('%s — die Ruecknahme wird geprueft', (_name, block, tabelle) => {
  it('nimmt den Fehler entgegen', () => {
    expect(block).toContain('error: ruecknahmeFehler')
  })

  it('und die getroffenen Zeilen', () => {
    // PostgREST meldet null getroffene Zeilen nicht als Fehler — ein
    // wirkungsloses DELETE saehe aus wie ein erfolgreiches.
    expect(block).toContain('data: zurueckgenommen')
    expect(block).toContain("zurueckgenommen?.length ?? 0) === 0")
  })

  it('loescht aus der richtigen Tabelle', () => {
    expect(block).toContain(`.from('${tabelle}')`)
  })

  it('kein blindes `await dienst.from(...).delete()` mehr', () => {
    expect(block).not.toMatch(/await dienst\.from\('[a-z_]+'\)\.delete\(\)/)
  })
})

describe('die Ausnahme sagt, was zurueckblieb', () => {
  it('beim Dokument: es steht NOCH in der Datenbank', () => {
    // Whitespace-unabhaengig: die Meldung ist ueber mehrere Zeilen
    // zusammengesetzt, und an Einrueckung zu pruefen waere sproede.
    const text = DOKUMENT.replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ')
    expect(text).toContain('NOCH in der Datenbank')
    expect(text).toContain('ohne Protokolleintrag')
  })

  it('bei der Anforderung zusaetzlich: sie ist unterschreibbar', () => {
    // Das ist der Unterschied im Gewicht — und der Grund, warum die
    // Meldung ihn nennen muss.
    const text = ANFORDERUNG.replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ')
    expect(text).toContain('NOCH in der Datenbank')
    expect(text).toContain('unterschreibbar')
  })

  it('beide nennen den urspruenglichen Fehler mit', () => {
    // Sonst verschwindet die Ursache hinter der Folgemeldung.
    for (const block of [DOKUMENT, ANFORDERUNG]) {
      expect(block).toContain('(err as Error).message')
    }
  })

  it('im Erfolgsfall bleibt die urspruengliche Ausnahme unveraendert', () => {
    // Der Aufrufer soll den echten Grund sehen, nicht eine Umhuellung.
    for (const block of [DOKUMENT, ANFORDERUNG]) {
      expect(block).toContain('throw err')
    }
  })
})

describe('das fail-closed bleibt', () => {
  it('der Protokolleintrag steht weiterhin VOR der Rueckgabe', () => {
    expect(MODUL).toContain('protokolliereSignaturAudit(')
    const ab = MODUL.indexOf("aktion: 'dokument_erstellt'")
    expect(MODUL.indexOf('return dokument', ab)).toBeGreaterThan(ab)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Verhalten, nicht nur Quelltext
// ═══════════════════════════════════════════════════════════════════════
import { erstelleDokument } from '@/lib/signaturen/signaturen'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const NUTZER = '00000000-0000-4000-8000-0000000000bb'
const DOK = '00000000-0000-4000-8000-0000000000cc'

/** Minimaler Doppelgaenger: protokolliert die Aufrufe und antwortet nach Plan. */
function fakeClient(antwort: (a: { tabelle: string; operation: string }) => unknown) {
  const kette = (tabelle: string) => {
    let operation = 'select'
    const k: Record<string, unknown> = {}
    for (const name of ['select', 'eq', 'limit', 'order']) k[name] = () => k
    k.insert = () => { operation = 'insert'; return k }
    k.delete = () => { operation = 'delete'; return k }
    k.single = async () => antwort({ tabelle, operation })
    k.maybeSingle = async () => antwort({ tabelle, operation })
    k.then = (aufl: (w: unknown) => unknown) => aufl(antwort({ tabelle, operation }))
    return k
  }
  return { from: (t: string) => kette(t) } as never
}

describe('Verhalten: die Ruecknahme scheitert', () => {
  it('meldet, dass das Dokument NOCH steht — mit Status 500', async () => {
    const client = fakeClient(a => {
      if (a.tabelle === 'signatur_dokumente' && a.operation === 'insert') {
        return { data: { id: DOK }, error: null }
      }
      if (a.tabelle === 'signatur_audit_log') {
        return { data: null, error: { message: 'rls', code: '42501' } }
      }
      // Die Ruecknahme trifft KEINE Zeile.
      return { data: [], error: null }
    })

    await expect(erstelleDokument(client, ORG, NUTZER, {
      titel: 'Vertrag', dokument_typ: 'vertrag',
      dokument_hash_sha256: 'c'.repeat(64),
    } as never, ['vertrag'] as never)).rejects.toMatchObject({ status: 500 })
  })

  it('und der urspruengliche Fehler steht in der Meldung', async () => {
    const client = fakeClient(a => {
      if (a.tabelle === 'signatur_dokumente' && a.operation === 'insert') {
        return { data: { id: DOK }, error: null }
      }
      if (a.tabelle === 'signatur_audit_log') {
        return { data: null, error: { message: 'rls', code: '42501' } }
      }
      return { data: [], error: null }
    })

    await expect(erstelleDokument(client, ORG, NUTZER, {
      titel: 'Vertrag', dokument_typ: 'vertrag',
      dokument_hash_sha256: 'c'.repeat(64),
    } as never, ['vertrag'] as never)).rejects.toThrow(/NOCH in der Datenbank/)
  })
})
