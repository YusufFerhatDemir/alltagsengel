/**
 * PflegeCoach — bezahlt, aber kein Zugang
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 65)
 *
 * Die Kette: Checkout-Route legt die Bestellung an ('offen'), erzeugt die
 * Stripe-Sitzung und vermerkt deren Kennung an der Bestellung. Bezahlt der
 * Kunde, schaltet `checkout.session.completed` den Zugang frei — und fand
 * die Bestellung AUSSCHLIESSLICH über `stripe_checkout_id`.
 *
 * Genau dieser Vermerk war der einzige ungeprüfte Schreibvorgang der Kette:
 *
 *     await db.from('coach_bestellungen')
 *       .update({ stripe_checkout_id: sitzung.id })
 *       .eq('id', bestellung.id)
 *
 * Blieb er aus, endete alles Weitere: `bestellungPerCheckout` fand nichts,
 * das Ereignis wurde mit 200 quittiert (bewusste Entscheidung des
 * Endpunkts) und nie wiederholt. Der Kunde hatte bezahlt — kein Zugang,
 * keine Bestätigungsmail, Bestellung dauerhaft auf 'offen'.
 *
 * Dieselbe Datei kannte den besseren Weg bereits: `bestellungZuRechnung`
 * für `invoice.paid` liest die Metadaten ZUERST und nimmt die Abo-Kennung
 * nur als Rückfallweg, ausdrücklich begründet mit „keiner allein ist
 * zuverlässig". Der Weg, der den Zugang freischaltet, hatte diesen zweiten
 * Weg nicht.
 *
 * Dazu: alle drei Suchfunktionen verwarfen ihren Lesefehler. `null` heißt
 * beim Aufrufer „gibt es nicht" — ein Verbindungsabbruch sah damit aus wie
 * eine unbekannte Zahlung.
 *
 * Live gemessen: coach_bestellungen ist leer, kein Schaden im Bestand.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

const BESTELLUNG = 'best-1'
const SITZUNG = 'cs_test_1'

const H = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  subscriptionsRetrieve: vi.fn(),
  bestellungPerId: vi.fn(),
  bestellungPerCheckout: vi.fn(),
  bestellungPerSubscription: vi.fn(),
  vermerkeCheckoutId: vi.fn(),
  aktiviereBestellung: vi.fn(),
  sendeBestellbestaetigung: vi.fn(),
}))

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    webhooks: { constructEvent: H.constructEvent },
    subscriptions: { retrieve: H.subscriptionsRetrieve },
  },
}))
vi.mock('@/lib/coach/verkauf-server', () => ({
  bestellungPerId: H.bestellungPerId,
  bestellungPerCheckout: H.bestellungPerCheckout,
  bestellungPerSubscription: H.bestellungPerSubscription,
  vermerkeCheckoutId: H.vermerkeCheckoutId,
  aktiviereBestellung: H.aktiviereBestellung,
  beendeZugang: vi.fn(),
  setzeStatus: vi.fn(),
  stelleRechnungAus: vi.fn(),
  verbucheZahlung: vi.fn(),
}))
vi.mock('@/lib/emails/coach-bestellung', () => ({
  sendeBestellbestaetigung: H.sendeBestellbestaetigung,
  sendeZahlungFehlgeschlagen: vi.fn(),
}))
vi.mock('@/lib/monitoring/tracker', () => ({ withTracking: (f: unknown) => f }))

import { POST } from '@/app/api/coach/webhook/route'

function bestellung(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: BESTELLUNG, status: 'offen', tarif: 'monatlich', betrag_cent: 4900,
    rechnung_email: 'kunde@example.org', rechnung_name: 'Frau Beispiel',
    bestellt_am: '2026-09-01', stripe_checkout_id: null, ...over,
  }
}

async function bezahlt(metadaten: Record<string, string>) {
  H.constructEvent.mockReturnValue({
    type: 'checkout.session.completed',
    data: { object: { id: SITZUNG, mode: 'subscription', metadata: metadaten, subscription: null } },
  })
  const req = new Request('http://test/api/coach/webhook', {
    method: 'POST', body: '{}', headers: { 'stripe-signature': 'sig' },
  })
  const res = await POST(req as never)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.COACH_STRIPE_WEBHOOK_SECRET = 'whsec_test'
  H.aktiviereBestellung.mockResolvedValue('2026-10-01')
  H.sendeBestellbestaetigung.mockResolvedValue(undefined)
  H.vermerkeCheckoutId.mockResolvedValue({ ok: true })
})

describe('checkout.session.completed findet die Bestellung auch ohne Vermerk', () => {
  it('nimmt die Bestellkennung aus den Metadaten', async () => {
    // Der Kern des Befunds: stripe_checkout_id wurde nie geschrieben,
    // bestellungPerCheckout findet nichts — der Zugang muss trotzdem kommen.
    H.bestellungPerId.mockResolvedValue(bestellung())
    H.bestellungPerCheckout.mockResolvedValue(null)

    const res = await bezahlt({ produkt: 'pflegecoach', coach_bestellung_id: BESTELLUNG })

    expect(res.status).toBe(200)
    expect(H.bestellungPerId).toHaveBeenCalledWith(BESTELLUNG)
    expect(H.aktiviereBestellung).toHaveBeenCalledTimes(1)
    expect(H.sendeBestellbestaetigung).toHaveBeenCalledTimes(1)
  })

  it('fragt gar nicht erst über die Checkout-Kennung, wenn die Metadaten tragen', async () => {
    H.bestellungPerId.mockResolvedValue(bestellung())
    await bezahlt({ produkt: 'pflegecoach', coach_bestellung_id: BESTELLUNG })
    expect(H.bestellungPerCheckout).not.toHaveBeenCalled()
  })

  it('trägt die fehlende Checkout-Kennung nach', async () => {
    H.bestellungPerId.mockResolvedValue(bestellung({ stripe_checkout_id: null }))
    await bezahlt({ produkt: 'pflegecoach', coach_bestellung_id: BESTELLUNG })
    expect(H.vermerkeCheckoutId).toHaveBeenCalledWith(BESTELLUNG, SITZUNG)
  })

  it('rührt eine vorhandene Kennung nicht an', async () => {
    H.bestellungPerId.mockResolvedValue(bestellung({ stripe_checkout_id: SITZUNG }))
    await bezahlt({ produkt: 'pflegecoach', coach_bestellung_id: BESTELLUNG })
    expect(H.vermerkeCheckoutId).not.toHaveBeenCalled()
  })

  it('schaltet trotzdem frei, wenn das Nachtragen scheitert', async () => {
    // Der Vermerk ist Bequemlichkeit, nicht Voraussetzung.
    H.bestellungPerId.mockResolvedValue(bestellung())
    H.vermerkeCheckoutId.mockResolvedValue({ ok: false, grund: 'Schreibfehler: x' })
    await bezahlt({ produkt: 'pflegecoach', coach_bestellung_id: BESTELLUNG })
    expect(H.aktiviereBestellung).toHaveBeenCalledTimes(1)
  })

  it('fällt auf die Checkout-Kennung zurück, wenn die Metadaten fehlen', async () => {
    H.bestellungPerCheckout.mockResolvedValue(bestellung({ stripe_checkout_id: SITZUNG }))
    await bezahlt({ produkt: 'pflegecoach' })
    expect(H.bestellungPerId).not.toHaveBeenCalled()
    expect(H.bestellungPerCheckout).toHaveBeenCalledWith(SITZUNG)
    expect(H.aktiviereBestellung).toHaveBeenCalledTimes(1)
  })

  it('fällt auch zurück, wenn die Metadaten auf nichts zeigen', async () => {
    H.bestellungPerId.mockResolvedValue(null)
    H.bestellungPerCheckout.mockResolvedValue(bestellung({ stripe_checkout_id: SITZUNG }))
    await bezahlt({ produkt: 'pflegecoach', coach_bestellung_id: 'weg' })
    expect(H.bestellungPerCheckout).toHaveBeenCalledWith(SITZUNG)
    expect(H.aktiviereBestellung).toHaveBeenCalledTimes(1)
  })

  it('schaltet nichts frei, wenn beide Wege nichts finden', async () => {
    H.bestellungPerId.mockResolvedValue(null)
    H.bestellungPerCheckout.mockResolvedValue(null)
    const res = await bezahlt({ produkt: 'pflegecoach', coach_bestellung_id: 'weg' })
    expect(res.status).toBe(200)
    expect(H.aktiviereBestellung).not.toHaveBeenCalled()
  })

  it('lässt einen Lesefehler nicht zu einer Freischaltung werden', async () => {
    H.bestellungPerId.mockRejectedValue(new Error('connection reset'))
    const res = await bezahlt({ produkt: 'pflegecoach', coach_bestellung_id: BESTELLUNG })
    // Der Endpunkt quittiert bewusst mit 200 (siehe Dateikopf) — aber er
    // darf den Fehler nicht als „Bestellung unbekannt" verbuchen.
    expect(res.status).toBe(200)
    expect(H.aktiviereBestellung).not.toHaveBeenCalled()
    expect(H.bestellungPerCheckout).not.toHaveBeenCalled()
  })

  it('geht fremde Produkte gar nicht erst an', async () => {
    await bezahlt({ produkt: 'etwas-anderes', coach_bestellung_id: BESTELLUNG })
    expect(H.bestellungPerId).not.toHaveBeenCalled()
    expect(H.bestellungPerCheckout).not.toHaveBeenCalled()
  })
})

describe('Quelltext: die Suchwege und der Vermerk', () => {
  const SERVER = readFileSync('lib/coach/verkauf-server.ts', 'utf8')
  const CHECKOUT = readFileSync('app/api/coach/checkout/route.ts', 'utf8')

  it('jede Bestellsuche nimmt ihren Lesefehler entgegen', () => {
    const rumpf = SERVER.slice(
      SERVER.indexOf('async function bestellungUeber'),
      SERVER.indexOf('export async function bestellungPerCheckout'),
    )
    expect(rumpf).toContain('const { data, error }')
    expect(rumpf).toContain('if (error) {')
    expect(rumpf).toMatch(/throw new Error\(/)
  })

  it('keine Suche umgeht den gemeinsamen Weg', () => {
    // Sonst käme das Verwerfen durch die Hintertür zurück.
    const suchen = SERVER.slice(
      SERVER.indexOf('export async function bestellungPerCheckout'),
      SERVER.indexOf('export async function vermerkeCheckoutId'),
    )
    expect(suchen).not.toContain("from('coach_bestellungen')")
  })

  it('der Vermerk schreibt nur auf eine leere Kennung', () => {
    const rumpf = SERVER.slice(SERVER.indexOf('export async function vermerkeCheckoutId'))
      .slice(0, 1200)
    expect(rumpf).toContain(".is('stripe_checkout_id', null)")
    expect(rumpf).toContain(".select('id')")
    expect(rumpf).toMatch(/\(data \?\? \[\]\)\.length === 0/)
  })

  it('die Checkout-Route wertet ihren Vermerk aus', () => {
    expect(CHECKOUT).toContain('const { data: vermerkt, error: vermerkFehler }')
    expect(CHECKOUT).toMatch(/vermerkFehler \|\| \(vermerkt \?\? \[\]\)\.length === 0/)
    expect(CHECKOUT).toContain('Checkout-Kennung nicht an der Bestellung vermerkt')
  })

  it('kein blindes `await db` mehr auf coach_bestellungen in der Route', () => {
    // Zeilenanfang ist der Unterschied: `= await db` ist gebunden und in
    // Ordnung, ein `await db` allein auf der Zeile verwirft sein Ergebnis.
    expect(CHECKOUT).not.toMatch(/^\s*await db\s*\n\s*\.from\('coach_bestellungen'\)/m)
  })
})
