/**
 * Eine rote Ampel mit dem falschen Grund
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 85) — aus dem Bestand, den Block 79 sichtbar gemacht hat.
 *
 * `ermittleReadiness()` beantwortet laut ihrem eigenen Kopf „eine einzige
 * Frage: Kann diese Organisation heute echt gegen die Kassen abrechnen —
 * und wenn nein, WORAN GENAU liegt es?" Der zweite Halbsatz ist der Punkt.
 *
 * Elf Abfragen, alle ungeprüft. Ihre leeren Ergebnisse werden zu ROTEN
 * Punkten. Das blockiert zwar — `pruefeVersandbereitschaft()` sperrt über
 * genau diese Punkte —, aber mit einem falschen Grund:
 *
 *   „Ohne eigene IK kann keine DTA-Datei adressiert werden — IK bei der
 *    ARGE·IK beantragen"
 *
 * obwohl die IK hinterlegt ist. Wer dieser Liste folgt, beantragt eine
 * Nummer, die er hat, oder sucht nach einem Zertifikat, das da ist.
 *
 * Dasselbe in GET /api/billing/dta/config-status. Dort steht der Schaden
 * sogar schon im Code: „`laufRes.data ?? []` schluckte den Fehler und die
 * DTA-Seite zeigte dauerhaft 'keine Laeufe'." Behoben wurde damals der
 * SPALTENNAME, nicht der stille Kanal — jede andere Störung hätte
 * denselben Ausfall bewirkt.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'
import { ermittleReadiness } from '@/lib/abrechnung/readiness'
import { pruefeVersandbereitschaft, VersandGesperrtError } from '@/lib/abrechnung/versand-guard'

const ORG = '00000000-0000-4000-8000-000460629986'
const FEHLER = { message: 'connection reset', code: '08006' }

/** Gesunder Lauf bis auf die Tabelle in `kaputt`. */
function fake(kaputt: string | null) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (kaputt && a.tabelle === kaputt) return { data: null, error: FEHLER, count: null }
    if (a.tabelle === 'organizations') {
      return { data: { name: 'Alltagsengel UG', ik_nummer: '999999999', bundesland: 'hessen' } }
    }
    if (a.head) return { data: null, count: 0 }
    return { data: [] }
  })
}

describe('Ein Lesefehler wird als solcher gemeldet', () => {
  it('erzeugt einen eigenen Punkt', async () => {
    const r = await ermittleReadiness(fake('abrechnung_zertifikate').client, ORG)
    const p = r.punkte.find(x => x.id === 'readiness_unvollstaendig')
    expect(p).toBeDefined()
    expect(p!.ampel).toBe('rot')
  })

  it('der die betroffene Abfrage nennt', async () => {
    const r = await ermittleReadiness(fake('abrechnung_zertifikate').client, ORG)
    const p = r.punkte.find(x => x.id === 'readiness_unvollstaendig')!
    expect(p.hinweis).toMatch(/Zertifikate/)
  })

  it('und davor warnt, den übrigen Begründungen zu folgen', async () => {
    const r = await ermittleReadiness(fake('state_settings').client, ORG)
    const p = r.punkte.find(x => x.id === 'readiness_unvollstaendig')!
    expect(p.hinweis).toMatch(/möglicherweise falsch/)
    expect(p.hinweis).toMatch(/bevor etwas beantragt/)
  })

  it('bei gesunden Abfragen gibt es ihn nicht', async () => {
    const r = await ermittleReadiness(fake(null).client, ORG)
    expect(r.punkte.some(x => x.id === 'readiness_unvollstaendig')).toBe(false)
  })

  it('die echten Punkte bleiben erhalten', async () => {
    // Der neue Punkt ersetzt nichts — er tritt daneben.
    const r = await ermittleReadiness(fake('abrechnung_zertifikate').client, ORG)
    expect(r.punkte.some(x => x.id === 'ik_nummer')).toBe(true)
    expect(r.punkte.length).toBeGreaterThan(5)
  })
})

describe('Der Versand bleibt gesperrt — jetzt mit dem richtigen Grund', () => {
  it('sperrt bei einem Lesefehler', async () => {
    await expect(pruefeVersandbereitschaft(fake('datenannahmestellen').client, ORG))
      .rejects.toBeInstanceOf(VersandGesperrtError)
  })

  it('und nennt die Unvollständigkeit unter den Gründen', async () => {
    try {
      await pruefeVersandbereitschaft(fake('datenannahmestellen').client, ORG)
      expect.unreachable('haette sperren muessen')
    } catch (e) {
      const gruende = (e as VersandGesperrtError).gruende.join(' | ')
      expect(gruende).toMatch(/Readiness vollständig ermittelbar/)
    }
  })
})

describe('config-status antwortet nicht mit „nichts eingerichtet"', () => {
  const ROUTE = readFileSync('app/api/billing/dta/config-status/route.ts', 'utf8')

  it('prüft alle fünf Abfragen', () => {
    const teil = ROUTE.slice(ROUTE.indexOf('const nichtLesbar = ([')).slice(0, 600)
    for (const n of ['orgRes.error', 'zertRes.error', 'dasRes.error', 'stateRes.error', 'laufRes.error']) {
      expect(teil, n).toContain(n)
    }
  })

  it('antwortet mit 503 statt mit einem leeren Stand', () => {
    const teil = ROUTE.slice(ROUTE.indexOf('if (nichtLesbar.length > 0)')).slice(0, 600)
    expect(teil).toContain('status: 503')
    // Die Meldung ist im Quelltext ueber zwei Zeilen umbrochen; gesucht
    // wird deshalb das Wort, nicht die Wendung.
    expect(teil).toMatch(/nachgesehen/)
  })

  it('und zwar vor jeder Auswertung', () => {
    expect(ROUTE.indexOf('if (nichtLesbar.length > 0)'))
      .toBeLessThan(ROUTE.indexOf('const absenderZert = zertRes.data'))
  })

  it('der Kommentar zum alten 42703 bleibt stehen', () => {
    // Er erklärt, warum diese Stelle überhaupt auffiel.
    expect(ROUTE).toMatch(/abrechnungslaeufe hat KEIN created_at/)
  })
})

describe('Der Bestand ist mitgezogen', () => {
  it('und ist weiter gesunken', async () => {
    const { BESTAND_GEBUENDELT } = await import('../../scripts/lint-leerzustand')
    expect(BESTAND_GEBUENDELT.length).toBeLessThanOrEqual(39)
    expect(BESTAND_GEBUENDELT.some(e => e.datei.includes('readiness'))).toBe(false)
    expect(BESTAND_GEBUENDELT.some(e => e.datei.includes('config-status'))).toBe(false)
  })
})
