/**
 * Track 5 (19.08.2026) — KIM-Betriebsmodus.
 *
 * Kernaussage der Tests: eine simulierte Zustellung darf in der Datenbank
 * NIEMALS wie eine echte aussehen, und ein Simulator darf im behaupteten
 * Echtbetrieb (KIM_AKTIV=true) gar nicht erst laufen.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  ermittleVersandModus, pruefeVersandModus, simulationsMarker,
  mitSimulationsMarker, istSimulierteNachricht,
  KimBetriebsmodusError, KIM_SIMULATION_KEY,
} from '@/lib/kim/versandmodus'
import { MockKimProvider } from '@/lib/kim/mock-provider'
import { TestKimProvider } from '@/lib/kim/test-provider'
import type { IKimProvider, KimProviderInfo } from '@/lib/kim/provider-interface'

/** Ein hypothetischer echter Provider — existiert im Code noch nicht (provider-factory wirft). */
function echterProvider(): IKimProvider {
  const info: KimProviderInfo = { providerType: 'kim_plus', displayName: 'KIM-Plus (echt)', isSimulated: false }
  return {
    sendMessage: async () => ({ success: true }),
    checkDeliveryStatus: async () => ({ providerMessageId: 'x', status: 'gesendet', occurredAt: '2026-01-01T00:00:00.000Z' }),
    fetchInbound: async () => [],
    verifyAddress: async (address: string) => ({ address, isValid: true }),
    getProviderInfo: () => info,
  }
}

const ALT = process.env.KIM_AKTIV

beforeEach(() => { delete process.env.KIM_AKTIV })
afterEach(() => { if (ALT === undefined) delete process.env.KIM_AKTIV; else process.env.KIM_AKTIV = ALT })

describe('ermittleVersandModus', () => {
  it('erlaubt den Mock-Provider bei geschlossenem Gate — kennzeichnet ihn aber als Simulation', () => {
    const modus = ermittleVersandModus(new MockKimProvider())
    expect(modus.gateOffen).toBe(false)
    expect(modus.simuliert).toBe(true)
    expect(modus.erlaubt).toBe(true)
    expect(modus.providerTyp).toBe('mock')
  })

  it('verbietet einen simulierten Provider, sobald KIM_AKTIV Echtbetrieb behauptet', () => {
    process.env.KIM_AKTIV = 'true'
    const modus = ermittleVersandModus(new MockKimProvider())
    expect(modus.erlaubt).toBe(false)
    expect(modus.grund).toContain('KIM_AKTIV')
  })

  it('verbietet auch den deterministischen Test-Provider im Echtbetrieb', () => {
    process.env.KIM_AKTIV = 'true'
    expect(ermittleVersandModus(new TestKimProvider()).erlaubt).toBe(false)
  })

  it('lässt einen nicht simulierten Provider im Echtbetrieb zu', () => {
    process.env.KIM_AKTIV = 'true'
    const modus = ermittleVersandModus(echterProvider())
    expect(modus.simuliert).toBe(false)
    expect(modus.erlaubt).toBe(true)
  })
})

describe('pruefeVersandModus', () => {
  it('wirft KimBetriebsmodusError bei Simulator im Echtbetrieb', () => {
    process.env.KIM_AKTIV = 'true'
    expect(() => pruefeVersandModus(new MockKimProvider())).toThrow(KimBetriebsmodusError)
  })

  it('wirft nicht, solange das Gate geschlossen ist', () => {
    expect(() => pruefeVersandModus(new MockKimProvider())).not.toThrow()
  })
})

describe('Simulationskennzeichnung', () => {
  it('erzeugt für einen Simulator einen Marker mit Provider und Warnhinweis', () => {
    const marker = simulationsMarker(ermittleVersandModus(new MockKimProvider()), '2026-08-19T10:00:00.000Z')
    expect(marker).not.toBeNull()
    expect(marker!.simuliert).toBe(true)
    expect(marker!.provider_typ).toBe('mock')
    expect(marker!.hinweis).toContain('KEIN Zustellnachweis')
    expect(marker!.markiert_am).toBe('2026-08-19T10:00:00.000Z')
  })

  it('erzeugt für einen echten Provider keinen Marker', () => {
    process.env.KIM_AKTIV = 'true'
    expect(simulationsMarker(ermittleVersandModus(echterProvider()))).toBeNull()
  })

  it('mischt den Marker in bestehende Metadaten, ohne sie zu verlieren', () => {
    const marker = simulationsMarker(ermittleVersandModus(new MockKimProvider()))
    const metadata = mitSimulationsMarker({ fall_id: 'abc' }, marker)
    expect(metadata.fall_id).toBe('abc')
    expect(metadata[KIM_SIMULATION_KEY]).toBeDefined()
    expect(istSimulierteNachricht(metadata)).toBe(true)
  })

  it('lässt Metadaten unverändert, wenn es nichts zu kennzeichnen gibt', () => {
    const metadata = mitSimulationsMarker({ fall_id: 'abc' }, null)
    expect(metadata).toEqual({ fall_id: 'abc' })
    expect(istSimulierteNachricht(metadata)).toBe(false)
  })

  it('erkennt nicht gekennzeichnete Nachrichten korrekt als nicht simuliert', () => {
    expect(istSimulierteNachricht(null)).toBe(false)
    expect(istSimulierteNachricht(undefined)).toBe(false)
    expect(istSimulierteNachricht({})).toBe(false)
  })
})
