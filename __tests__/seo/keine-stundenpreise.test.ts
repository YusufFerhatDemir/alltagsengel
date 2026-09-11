/**
 * Keine konkreten Stundenpreise in Kundentexten — und keine unbelegte
 * „150+ Begleiter“-Zahl.
 *
 * Die Kundenpreise sind eine offene Geschäftsentscheidung
 * (BUSINESS_DECISION_REQUIRED). Bis 11.09.2026 standen nebeneinander
 * „ab 32 €“, „18–22 €“, „25–45 €“, „30–40 €“ und „15–25 €“ pro Stunde —
 * widersprüchlich und nirgends beschlossen. Bis zur Entscheidung gilt:
 * „individuelle Preisgestaltung — Preis auf Anfrage“.
 *
 * NICHT betroffen: gesetzliche Beträge (131 €, 42 €, 3.539 € …), die
 * Vergütung von Engeln (Lohn, kein Kundenpreis) und die Buchungsstrecke der
 * App, die vor einer verbindlichen Buchung den berechneten Preis zeigen MUSS
 * (lib/pricing/b2c-constants.ts).
 */
import { describe, it, expect, vi } from 'vitest'
import { SEITEN, saetze, rendere } from './_seiten'

vi.mock('@/components/LeadForm', () => ({ default: () => null }))
vi.mock('@/components/EngelBewerbungForm', () => ({ default: () => null }))
vi.mock('@/components/VisitTracker', () => ({ default: () => null }))

/** Euro je Stunde, auch als Spanne: „32 €/Std.“, „18-22 Euro pro Stunde“, „€40/Std“. */
const STUNDENPREIS = /\d+(?:[.,]\d+)?\s?(?:–|-|bis)?\s?\d*(?:[.,]\d+)?\s?(?:€|Euro|EUR)\s?(?:\/|pro|je)\s?(?:Stunde|Std\b|h\b)|€\s?\d+(?:[.,]\d+)?\s?\/\s?(?:Std|h)\b/i
/** Lohn von Engeln/Alltagsbegleitern ist kein Kundenpreis. */
const LOHN = /Engel|Verdienst|verdien|Vergütung|Gehalt|Lohn|Nebenjob|Bewerb|Alltagsbegleiter werden|Aufwandsentschädigung/i
const HUNDERTFUENFZIG = /\b150\s?\+?\s*(?:zertifizierte|geprüfte|geschulte|qualifizierte)?\s*(?:Begleiter|Engel|Alltagsbegleiter)|über 150\b/i

const STADT_ROUTEN: Record<string, () => Promise<any>> = {
  alltagsbegleitung: () => import('@/app/alltagsbegleitung/[stadt]/page'),
  haushaltshilfe: () => import('@/app/haushaltshilfe/[stadt]/page'),
}

/** Lohnkontext über zwei Vorsätze + Satz: die Überschrift („Stundenlohn …“) steht in Listen davor. */
function preisBefunde(html: string): string[] {
  const alle = saetze(html)
  return alle.filter((s, i) => STUNDENPREIS.test(s) && !LOHN.test(`${alle[i - 2] ?? ''} ${alle[i - 1] ?? ''} ${s}`))
}

/** JSON-LD: kein Offer mit Preis > 0, keine Preisangabe je Stunde. */
function jsonLdPreise(html: string): string[] {
  const funde: string[] = []
  const pruefe = (x: any) => {
    if (!x || typeof x !== 'object') return
    if (Array.isArray(x)) { x.forEach(pruefe); return }
    if (x['@type'] === 'UnitPriceSpecification' && /Stunde|hour|HUR/i.test(String(x.unitText ?? x.unitCode ?? ''))) {
      funde.push(`UnitPriceSpecification ${x.price} je ${x.unitText ?? x.unitCode}`)
    }
    if (x['@type'] === 'Offer' && x.price !== undefined && Number(x.price) > 0) funde.push(`Offer price ${x.price}`)
    Object.values(x).forEach(pruefe)
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) pruefe(JSON.parse(m[1]))
  return funde
}

describe.each(Object.keys(SEITEN))('%s', (pfad) => {
  it('nennt keinen konkreten Stundenpreis und keine „150+ Begleiter“', async () => {
    const html = await rendere(SEITEN[pfad])
    const funde = [...preisBefunde(html), ...saetze(html).filter(s => HUNDERTFUENFZIG.test(s)), ...jsonLdPreise(html)]
    expect(funde, `${pfad}:\n  ${funde.join('\n  ')}`).toEqual([])
  })
})

describe.each(Object.keys(STADT_ROUTEN))('/%s/[stadt]', (route) => {
  it('keine Stadtseite nennt einen Stundenpreis (Text und JSON-LD)', async () => {
    const mod: any = await STADT_ROUTEN[route]()
    const params: { stadt: string }[] = await mod.generateStaticParams()
    for (const { stadt } of params) {
      const { renderToStaticMarkup } = await import('react-dom/server')
      const html = renderToStaticMarkup(await mod.default({ params: Promise.resolve({ stadt }) }))
      const funde = [...preisBefunde(html), ...jsonLdPreise(html)]
      expect(funde, `${route}/${stadt}:\n  ${funde.join('\n  ')}`).toEqual([])
    }
  })
})

describe('Detektor', () => {
  it.each([
    'Alltagsbegleitung kostet ab 32 € pro Stunde.',
    'Kosten: etwa 18-22 Euro pro Stunde für einen Alltagsbegleiter.',
    'Haushaltshilfe: 15–25 €/Stunde',
    'Bei rund 35 € pro Stunde sind das etwa 140 € pro Woche.',
    'Preis: Ab 25€/Stunde, für 24-Stunden-Betreuung deutlich höher',
  ])('fängt: %s', (satz) => {
    expect(preisBefunde(`<p>${satz}</p>`)).toHaveLength(1)
  })

  it.each([
    'Als Engel verdienst du 20 € pro Stunde.',
    'Der Entlastungsbetrag beträgt 131 € pro Monat.',
    'Individuelle Preisgestaltung — Preis auf Anfrage.',
  ])('lässt stehen: %s', (satz) => {
    expect(preisBefunde(`<p>${satz}</p>`)).toEqual([])
  })

  it('JSON-LD: Offer mit Stundenpreis wird gefunden, Offer ohne Preis nicht', () => {
    const mit = '<script type="application/ld+json">{"@type":"Offer","price":"32.00","priceSpecification":{"@type":"UnitPriceSpecification","price":"32.00","unitText":"Stunde"}}</script>'
    const ohne = '<script type="application/ld+json">{"@type":"Offer","priceCurrency":"EUR","description":"Preis auf Anfrage"}</script>'
    expect(jsonLdPreise(mit).length).toBeGreaterThan(0)
    expect(jsonLdPreise(ohne)).toEqual([])
  })

  it('„150+ Begleiter“ wird gefunden', () => {
    expect(HUNDERTFUENFZIG.test('Über 150 zertifizierte Begleiter in Frankfurt')).toBe(true)
    expect(HUNDERTFUENFZIG.test('150+ geprüfte Begleiter')).toBe(true)
    expect(HUNDERTFUENFZIG.test('Unser wachsendes Team qualifizierter Alltagsbegleiter')).toBe(false)
  })
})
