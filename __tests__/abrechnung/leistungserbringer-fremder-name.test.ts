/**
 * Der Nachweis trug bei jedem Aussetzer einen fremden Leistungserbringer
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 71)
 *
 * `getLeistungserbringer()` fiel auf die Konstante `LEISTUNGSERBRINGER`
 * zurück, sobald irgendetwas nicht klappte: der Lesefehler wurde verworfen
 * (`try { const { data } = … } catch { }`), ein Konto ohne Namen lief in
 * denselben Zweig, und feldweise schrieb `addr.strasse ||
 * LEISTUNGSERBRINGER.strasse` die Neue Mainzer Straße ein.
 *
 * Für die Stamm-Organisation ist das richtig: die Konstante SIND ihre
 * eigenen Daten. Für jeden anderen Mandanten ist es keine Ersatzangabe,
 * sondern ein FREMDER Name — auf einem Dokument, das der Klient
 * unterschreibt und mit dem die Leistung bei der Pflegekasse belegt wird.
 *
 * Ein Nachweis mit dem falschen Leistungserbringer ist schlechter als
 * keiner: er ist nicht als falsch zu erkennen.
 *
 * Live gemessen: sechs Organisationen, davon eine echte (die Stamm-
 * Organisation). Heute ohne Schaden im Bestand — beim siebten Eintrag
 * nicht mehr.
 */
import { describe, it, expect } from 'vitest'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'
import { getLeistungserbringer, LEISTUNGSERBRINGER } from '@/lib/abrechnung/leistungsnachweis-pdf'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import { readFileSync } from 'node:fs'

const FREMD = '99999999-9999-4999-8999-999999999999'
const VOLL = {
  name: 'Pflegedienst Sonnenschein GmbH',
  address: { strasse: 'Musterweg 3', plz: '34117', ort: 'Kassel' },
  settings: {},
}

function fake(antwort: { data?: unknown; error?: { message: string; code?: string } | null }) {
  return erstelleFakeSupabase((_a: FakeAufruf) => antwort)
}

async function hole(orgId: string, antwort: Parameters<typeof fake>[0]) {
  return getLeistungserbringer(fake(antwort).client, orgId)
}

describe('Ein fremder Mandant bekommt niemals die Stamm-Daten', () => {
  it('nicht bei einem Lesefehler', async () => {
    await expect(hole(FREMD, { data: null, error: { message: 'connection reset', code: '08006' } }))
      .rejects.toThrow(/fremden Leistungserbringer/)
  })

  it('nicht bei einer Organisation ohne Namen', async () => {
    await expect(hole(FREMD, { data: { name: null, address: VOLL.address, settings: {} } }))
      .rejects.toThrow(/kein Name hinterlegt/)
  })

  it('nicht bei fehlender Straße', async () => {
    await expect(hole(FREMD, { data: { ...VOLL, address: { plz: '34117', ort: 'Kassel' } } }))
      .rejects.toThrow(/Straße/)
  })

  it('nicht bei fehlender PLZ', async () => {
    await expect(hole(FREMD, { data: { ...VOLL, address: { strasse: 'Musterweg 3', ort: 'Kassel' } } }))
      .rejects.toThrow(/PLZ und Ort/)
  })

  it('und die Meldung nennt beide fehlenden Felder auf einmal', async () => {
    await expect(hole(FREMD, { data: { ...VOLL, address: {} } }))
      .rejects.toThrow(/Straße, PLZ und Ort/)
  })
})

describe('Mit vollständigen eigenen Daten geht der fremde Mandant durch', () => {
  it('und trägt seinen eigenen Namen', async () => {
    const le = await hole(FREMD, { data: VOLL })
    expect(le.name).toBe('Pflegedienst Sonnenschein GmbH')
    expect(le.strasse).toBe('Musterweg 3')
    expect(le.ort).toBe('34117 Kassel')
  })

  it('nirgends steht ein Stück Alltagsengel drin', async () => {
    const le = await hole(FREMD, { data: VOLL })
    const text = JSON.stringify(le)
    expect(text).not.toContain(LEISTUNGSERBRINGER.strasse)
    expect(text).not.toContain(LEISTUNGSERBRINGER.ort)
    expect(text).not.toContain(LEISTUNGSERBRINGER.email)
    expect(text).not.toContain('Alltagsengel')
  })

  it('der Kurzname entsteht aus dem eigenen Namen', async () => {
    const le = await hole(FREMD, { data: VOLL })
    expect(le.kurz).toBe('Pflegedienst Sonnenschein')
  })

  it('eine leere E-Mail bleibt leer, statt fremd zu werden', async () => {
    const le = await hole(FREMD, { data: VOLL })
    expect(le.email).toBe('')
  })
})

describe('Die Stamm-Organisation behält ihre Ersatzangaben', () => {
  it('bei einem Lesefehler — es sind ihre eigenen Daten', async () => {
    const le = await hole(DEFAULT_ORG_ID, { data: null, error: { message: 'x', code: '08006' } })
    expect(le).toEqual({ ...LEISTUNGSERBRINGER })
  })

  it('bei einer Zeile ohne Namen', async () => {
    const le = await hole(DEFAULT_ORG_ID, { data: null, error: null })
    expect(le.name).toBe(LEISTUNGSERBRINGER.name)
  })

  it('und feldweise, wenn die Anschrift leer ist (so steht sie live)', async () => {
    // Live trägt die Stamm-Organisation `{"ort":"Frankfurt am Main",
    // "plz":"","strasse":""}` — genau dieser Fall.
    const le = await hole(DEFAULT_ORG_ID, {
      data: { name: 'Alltagsengel UG (haftungsbeschränkt)', address: { ort: 'Frankfurt am Main', plz: '', strasse: '' }, settings: {} },
    })
    expect(le.strasse).toBe(LEISTUNGSERBRINGER.strasse)
    expect(le.ort).toBe(LEISTUNGSERBRINGER.ort)
  })
})

describe('Ohne Organisation entsteht gar kein Nachweis', () => {
  const SRC = readFileSync('lib/abrechnung/leistungsnachweis-pdf.ts', 'utf8')

  it('der stille Rückfall auf die Stamm-Organisation ist weg', () => {
    expect(SRC).not.toContain(': { ...LEISTUNGSERBRINGER }')
  })

  it('stattdessen bricht die Erstellung ab', () => {
    expect(SRC).toContain('if (!effectiveOrgId) {')
    expect(SRC).toMatch(/keiner Organisation zugeordnet/)
  })
})

describe('Quelltext: kein verworfener Lesefehler mehr', () => {
  const SRC = readFileSync('lib/abrechnung/leistungsnachweis-pdf.ts', 'utf8')
  const RUMPF = SRC.slice(
    SRC.indexOf('export async function getLeistungserbringer'),
    SRC.indexOf('const GOLD ='),
  )

  it('nimmt den Fehler entgegen', () => {
    expect(RUMPF).toContain('const { data, error } = await supabase')
  })

  it('und verschluckt ihn nicht in einem catch', () => {
    expect(RUMPF).not.toContain('catch')
  })

  it('die Ersatzangaben hängen an der Stamm-Organisation, nicht am Zufall', () => {
    expect(RUMPF).toContain('const istStammOrg = organizationId === DEFAULT_ORG_ID')
    expect((RUMPF.match(/istStammOrg/g) ?? []).length).toBeGreaterThanOrEqual(5)
  })
})
