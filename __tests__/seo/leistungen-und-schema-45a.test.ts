/**
 * /leistungen (war 404) und §45a-konformes Schema auf Startseite und
 * /alltagsbegleitung. Gerendert, nicht gegrept: geprüft wird das JSON-LD,
 * das tatsächlich ausgeliefert wird.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/LeadForm', () => ({ default: () => null }))
vi.mock('@/components/VisitTracker', () => ({ default: () => null }))

function jsonLdAus(html: string): any[] {
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
    .map(m => JSON.parse(m[1]))
}
const flach = (x: any): any[] => (x?.['@graph'] ? x['@graph'] : [x])

/** Aussagen, die vor der §45a-Anerkennung nicht unbedingt stehen dürfen. */
const UNBEDINGT = [
  /direkt mit (der|Ihrer) Pflegekasse abgerechnet/i,
  /rechnen direkt mit Ihrer Pflegekasse/i,
  /Eigenanteil: 0 €/,
  /0 € Eigenanteil bei Pflegegrad/,
  /ohne eigene Zuzahlung/i,
  /über den Entlastungsbetrag §45b SGB XI abrechenbar/i,
]

async function rendern(pfad: string): Promise<string> {
  const mod: any = await import(pfad)
  return renderToStaticMarkup(await mod.default({}))
}

describe('/leistungen', () => {
  it('liefert Inhalt mit allen sechs beauftragten Leistungen', async () => {
    const html = await rendern('@/app/leistungen/page')
    for (const t of ['Alltagsbegleitung', 'Haushaltshilfe', 'Einkaufshilfe', 'Begleitung zu Terminen',
      'Freizeitgestaltung', 'Entlastung pflegender Angehöriger']) {
      expect(html).toContain(t)
    }
  })

  it('JSON-LD: OfferCatalog mit 6 Services, FAQPage, BreadcrumbList', async () => {
    const teile = jsonLdAus(await rendern('@/app/leistungen/page')).flatMap(flach)
    const katalog = teile.find(t => t['@type'] === 'OfferCatalog')
    expect(katalog.itemListElement).toHaveLength(6)
    expect(katalog.itemListElement.every((o: any) => o.itemOffered['@type'] === 'Service')).toBe(true)
    expect(teile.some(t => t['@type'] === 'FAQPage')).toBe(true)
    const bc = teile.find(t => t['@type'] === 'BreadcrumbList')
    expect(bc.itemListElement.map((i: any) => i.name)).toEqual(['Startseite', 'Leistungen'])
  })

  it('131 €, nie 125 €; §45a als Anerkennungsverfahren', async () => {
    const html = await rendern('@/app/leistungen/page')
    expect(html).toContain('131 €')
    expect(html).not.toMatch(/125\s?€/)
    expect(html).toContain('Anerkennungsverfahren')
    for (const re of UNBEDINGT) expect(html).not.toMatch(re)
  })

  it('Metadaten: Canonical /leistungen', async () => {
    const { metadata } = await import('@/app/leistungen/page')
    expect(metadata.alternates?.canonical).toBe('https://alltagsengel.care/leistungen')
  })
})

describe.each([
  ['Startseite', '@/app/page'],
  ['/alltagsbegleitung', '@/app/alltagsbegleitung/page'],
])('§45a im Schema — %s', (_name, pfad) => {
  it('Service-/FAQ-/HowTo-Schema verspricht keine Kassenabrechnung vor der Anerkennung', async () => {
    // Nur die Knoten zur Alltagsbegleitung: Pflegebox (§ 40) und
    // Krankenfahrt (§ 60) hängen nicht an § 45a und dürfen „0 € Eigenanteil"
    // weiter sagen.
    const knoten = jsonLdAus(await rendern(pfad)).flatMap(flach).flatMap((t: any) => {
      if (t['@type'] === 'FAQPage') {
        return t.mainEntity.filter((q: any) => /Alltagsbegleit|Entlastungsbetrag|Pflegegrad 1/i.test(q.name))
      }
      if (t['@type'] === 'Service') return /Alltagsbegleitung/i.test(t.name) ? [t] : []
      if (t['@type'] === 'HowTo') return [t]
      return []
    })
    expect(knoten.length).toBeGreaterThan(0)
    const text = JSON.stringify(knoten)
    for (const re of UNBEDINGT) expect(text, String(re)).not.toMatch(re)
    expect(text).toMatch(/Anerkennungsverfahren|im Verfahren/)
    expect(text).not.toMatch(/125\s?€/)
  })
})
