/**
 * Geo-Signale der Stadtseiten (SEO-Audit 11.09.2026).
 *
 * Befund: alle Stadtseiten erbten geo.placename/geo.position/ICBM =
 * Frankfurt aus app/layout.tsx. Dieser Test ruft die ECHTEN
 * generateStaticParams/generateMetadata der fünf Stadt-Routen auf — kein
 * Quelltext-Grep — und prüft jede Stadt.
 * @see lib/seo/stadt-geo.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { STADT_GEO, stadtGeoMeta } from '@/lib/seo/stadt-geo'

// Client-Komponenten der Seiten sind für Metadaten irrelevant.
vi.mock('@/components/LeadForm', () => ({ default: () => null }))
vi.mock('@/components/EngelBewerbungForm', () => ({ default: () => null }))

const ROUTEN = {
  alltagsbegleitung: () => import('@/app/alltagsbegleitung/[stadt]/page'),
  haushaltshilfe: () => import('@/app/haushaltshilfe/[stadt]/page'),
  krankenfahrten: () => import('@/app/krankenfahrten/[stadt]/page'),
  hygienebox: () => import('@/app/hygienebox/[stadt]/page'),
  'engel-werden': () => import('@/app/engel-werden/[stadt]/page'),
} as const

/** Frankfurt-Signal aus app/layout.tsx — darf auf keiner anderen Stadtseite stehen. */
const FRANKFURT = '50.1109;8.6821'

const km = (a: [number, number], b: [number, number]) =>
  Math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 71)

describe('Stadt-Geo-Tabelle', () => {
  it('Bundesland stimmt für die Orte außerhalb Hessens', () => {
    expect(STADT_GEO.mainz.region).toBe('DE-RP')
    expect(STADT_GEO.aschaffenburg.region).toBe('DE-BY')
    for (const s of ['koeln', 'duesseldorf', 'essen', 'dortmund', 'bonn']) expect(STADT_GEO[s].region).toBe('DE-NW')
    expect(STADT_GEO.hanau.region).toBe('DE-HE')
  })

  it('alle Koordinaten liegen in Deutschland', () => {
    for (const [slug, g] of Object.entries(STADT_GEO)) {
      expect(g.lat, slug).toBeGreaterThan(47.2); expect(g.lat, slug).toBeLessThan(55.1)
      expect(g.lng, slug).toBeGreaterThan(5.8); expect(g.lng, slug).toBeLessThan(15.1)
    }
  })

  it('unbekannter Slug → keine erfundene Position', () => {
    expect(stadtGeoMeta('atlantis')).toBeUndefined()
  })
})

describe.each(Object.keys(ROUTEN) as (keyof typeof ROUTEN)[])('/%s/[stadt]', (route) => {
  it('jede Stadtseite meldet ihre eigene Position, nicht Frankfurt', async () => {
    const mod: any = await ROUTEN[route]()
    const params: { stadt: string }[] = await mod.generateStaticParams()
    expect(params.length).toBeGreaterThan(0)

    for (const { stadt } of params) {
      const meta = await mod.generateMetadata({ params: Promise.resolve({ stadt }) })
      const g = STADT_GEO[stadt]
      expect(g, `${route}/${stadt} fehlt in STADT_GEO`).toBeDefined()
      expect(meta.other, `${route}/${stadt}`).toEqual({
        'geo.region': g.region,
        'geo.placename': g.name,
        'geo.position': `${g.lat};${g.lng}`,
        ICBM: `${g.lat}, ${g.lng}`,
      })
      if (stadt !== 'frankfurt') expect(meta.other['geo.position']).not.toBe(FRANKFURT)
    }
  })
})

describe('Tabelle deckt sich mit den Stadtdaten der Routen', () => {
  it('Abweichung zum Stadt-JSON-LD der Routen unter 3 km', async () => {
    // Die Routen führen ihre Koordinaten je in eigener Form; gerendert
    // landen sie im JSON-LD. Hier wird das GERENDERTE Element geprüft.
    const { renderToStaticMarkup } = await import('react-dom/server')
    const mod: any = await ROUTEN.alltagsbegleitung()
    for (const { stadt } of await mod.generateStaticParams()) {
      const html = renderToStaticMarkup(await mod.default({ params: Promise.resolve({ stadt }) }))
      const treffer = [...html.matchAll(/"latitude":([0-9.]+),"longitude":([0-9.]+)/g)]
        .map(m => [Number(m[1]), Number(m[2])] as [number, number])
      const g = STADT_GEO[stadt]
      const naechste = Math.min(...treffer.map(t => km(t, [g.lat, g.lng])))
      expect(naechste, stadt).toBeLessThan(3)
    }
  })
})
