/**
 * Der Bestand ist abgearbeitet — die Liste ist leer
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 89) — die letzten elf Stellen, und damit der Abschluss
 * der Reihe aus den Blöcken 79–89.
 *
 * 1. GET /api/ai-chat baut einen Textblock mit der Überschrift „LIVE
 *    DATEN AUS DER DATENBANK", der an ein Sprachmodell geht. Sechs
 *    Abfragen, alle ungeprüft. Fiel eine aus, bekam das Modell 0 Nutzer,
 *    0 Buchungen und 0,00 € Umsatz ALS TATSACHE — und antwortete der
 *    Geschäftsführung darauf mit voller Überzeugung. Nullen, die als
 *    Messwert ausgegeben werden, sind hier schlimmer als eine
 *    Fehlermeldung: das Modell kann sie nicht als Ausfall erkennen.
 *
 * 2. /mis/crm — der Vertriebstrichter. Ohne `leadsRes` gibt es keine
 *    offenen Anfragen, und niemand ruft zurück.
 *
 * 3. /admin/bonuses — ohne Prämienliste hat niemand eine erhalten, und
 *    wer das liest, vergibt sie ein zweites Mal.
 *
 * 4. /admin/partners — ohne Besuchsliste hat kein Partner je einen Besuch
 *    bekommen, und die Seite, die genau daran erinnern soll, erinnert an
 *    nichts.
 *
 * Danach ist BESTAND_GEBUENDELT leer: die Regel blockiert von hier an
 * ohne Ausnahme.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const AICHAT = readFileSync('app/api/ai-chat/route.ts', 'utf8')
const CRM = readFileSync('app/mis/crm/page.tsx', 'utf8')
const BONUS = readFileSync('app/admin/bonuses/page.tsx', 'utf8')
const PARTNER = readFileSync('app/admin/partners/page.tsx', 'utf8')

const FLAECHEN: Array<[string, string, string[]]> = [
  ['AI-Chat', AICHAT, ['usersRes.error', 'bookingsRes.error', 'visitorsRes.error', 'engelsRes.error', 'kundenRes.error', 'fahrerRes.error']],
  ['CRM', CRM, ['clientsRes.error', 'leadsRes.error', 'partnersRes.error', 'satisfactionRes.error', 'activitiesRes.error']],
  ['Prämien', BONUS, ['cgRes.error', 'boRes.error']],
  ['Partner', PARTNER, ['pRes.error', 'vRes.error']],
]

describe('Alle vier prüfen ihre Quellen', () => {
  for (const [name, quelle, felder] of FLAECHEN) {
    it(`${name}: alle ${felder.length} Abfragen`, () => {
      const teil = quelle.slice(quelle.indexOf('const nichtLesbar = ([')).slice(0, 900)
      for (const f of felder) expect(teil, f).toContain(f)
    })

    it(`${name}: die Fehlerliste entsteht aus den Fehlern`, () => {
      expect(quelle).toContain('] as const).filter(([, fehler]) => fehler != null).map(([name]) => name)')
    })
  }
})

describe('Das Sprachmodell bekommt keine Nullen als Messwert', () => {
  it('der Block heißt dann anders', () => {
    expect(AICHAT).toContain('=== KEINE LIVE-DATEN VERFUEGBAR')
  })

  it('und sagt dem Modell ausdrücklich, was es nicht tun soll', () => {
    const teil = AICHAT.slice(AICHAT.indexOf('=== KEINE LIVE-DATEN VERFUEGBAR')).slice(0, 600)
    expect(teil).toMatch(/Nenne keine Kennzahlen/)
    expect(teil).toMatch(/schaetze keine/)
  })

  it('der Ausstieg kommt vor jeder Auswertung', () => {
    expect(AICHAT.indexOf('if (nichtLesbar.length > 0)'))
      .toBeLessThan(AICHAT.indexOf('const users = usersRes.data || []'))
  })
})

describe('Die drei Seiten zeigen nichts Halbes', () => {
  it('CRM: leert alle fünf Listen und zeigt den Grund', () => {
    const ab = CRM.indexOf('if (nichtLesbar.length > 0)')
    const teil = CRM.slice(ab, ab + 900)
    for (const setzer of ['setClients([])', 'setLeads([])', 'setPartners([])']) {
      expect(teil, setzer).toContain(setzer)
    }
    expect(CRM).toContain('if (ladefehler) {')
  })

  it('Prämien: keine Liste, sondern der Grund', () => {
    expect(BONUS).toContain('{ladefehler && <Banner tone="danger">{ladefehler}</Banner>}')
    expect(BONUS).toContain('ladefehler ? null : (')
    expect(BONUS).toMatch(/ein zweites Mal zu vergeben/)
  })

  it('Partner: ebenso', () => {
    expect(PARTNER).toContain('if (ladefehler) return (')
    expect(PARTNER).toMatch(/von „nicht nachgesehen" nicht zu unterscheiden/)
  })
})

describe('Der Bestand ist leer', () => {
  it('keine einzige Ausnahme mehr', async () => {
    const { BESTAND_GEBUENDELT } = await import('../../scripts/lint-leerzustand')
    expect(BESTAND_GEBUENDELT).toEqual([])
  })

  it('und die Selbstprüfung hat dann nichts zu melden', async () => {
    const { veraltet } = await import('../../scripts/lint-leerzustand')
    expect(veraltet([], ['app/irgendwas/page.tsx'])).toEqual([])
  })

  it('die Regel selbst bleibt scharf', () => {
    const LINT = readFileSync('scripts/lint-leerzustand.ts', 'utf8')
    expect(LINT).toContain('function pruefeGebuendelt(')
    expect(LINT).toContain('const befunde = alle.filter(b => !imBestand(b))')
  })
})
