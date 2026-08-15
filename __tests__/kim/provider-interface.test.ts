import { describe, it, expect } from 'vitest'
import { MockKimProvider } from '@/lib/kim/mock-provider'
import { TestKimProvider } from '@/lib/kim/test-provider'
import { createKimProvider } from '@/lib/kim/provider-factory'

describe('MockKimProvider', () => {
  it('sendet erfolgreich ohne konfigurierte Fehlerrate', async () => {
    const provider = new MockKimProvider()
    const result = await provider.sendMessage({ fromAddress: 'a@kim.test', toAddress: 'b@kim.test', subject: 'Hallo' })
    expect(result.success).toBe(true)
    expect(result.providerMessageId).toBeTruthy()
  })

  it('lehnt Nachrichten ohne Betreff ab', async () => {
    const provider = new MockKimProvider()
    const result = await provider.sendMessage({ fromAddress: 'a@kim.test', toAddress: 'b@kim.test', subject: '' })
    expect(result.success).toBe(false)
  })

  it('schlägt bei Fehlerrate 1 immer fehl', async () => {
    const provider = new MockKimProvider({ errorRate: 1 })
    const result = await provider.sendMessage({ fromAddress: 'a@kim.test', toAddress: 'b@kim.test', subject: 'Hallo' })
    expect(result.success).toBe(false)
    expect(result.errorDetails).toBeTruthy()
  })

  it('verifyAddress lehnt ungültiges Format ab', async () => {
    const provider = new MockKimProvider()
    const result = await provider.verifyAddress('keine-email')
    expect(result.isValid).toBe(false)
  })

  it('verifyAddress lehnt konfigurierte invalide Adressen ab', async () => {
    const provider = new MockKimProvider({ invalidAddresses: ['boese@kim.test'] })
    const result = await provider.verifyAddress('boese@kim.test')
    expect(result.isValid).toBe(false)
  })

  it('fetchInbound liefert Seed-Nachrichten genau einmal', async () => {
    const provider = new MockKimProvider({
      seedInbound: [{
        providerMessageId: 'p1', fromAddress: 'arzt@kim.test', toAddress: 'a@kim.test',
        subject: 'Befund', receivedAt: '2026-01-01T00:00:00.000Z',
      }],
    })
    const first = await provider.fetchInbound()
    expect(first).toHaveLength(1)
    const second = await provider.fetchInbound()
    expect(second).toHaveLength(0)
  })

  it('getProviderInfo meldet sich als simuliert', () => {
    const info = new MockKimProvider().getProviderInfo()
    expect(info.isSimulated).toBe(true)
    expect(info.providerType).toBe('mock')
  })
})

describe('TestKimProvider', () => {
  it('ist deterministisch: gleiche Konfiguration liefert gleiches Ergebnis', async () => {
    const provider = new TestKimProvider({ sendResults: [{ success: true, providerMessageId: 'fixed-1' }] })
    const r1 = await provider.sendMessage({ fromAddress: 'a@kim.test', toAddress: 'b@kim.test', subject: 'X' })
    expect(r1.providerMessageId).toBe('fixed-1')
  })

  it('wiederholt das letzte konfigurierte Ergebnis bei Überlauf', async () => {
    const provider = new TestKimProvider({ sendResults: [{ success: true, providerMessageId: 'only-one' }] })
    await provider.sendMessage({ fromAddress: 'a', toAddress: 'b', subject: 'X' })
    const second = await provider.sendMessage({ fromAddress: 'a', toAddress: 'b', subject: 'Y' })
    expect(second.providerMessageId).toBe('only-one')
  })

  it('protokolliert alle sendMessage-Aufrufe', async () => {
    const provider = new TestKimProvider()
    await provider.sendMessage({ fromAddress: 'a', toAddress: 'b', subject: 'X' })
    await provider.sendMessage({ fromAddress: 'a', toAddress: 'c', subject: 'Y' })
    expect(provider.sendCalls).toHaveLength(2)
  })

  it('checkDeliveryStatus liefert feste Statuswerte', async () => {
    const provider = new TestKimProvider({
      deliveryStatuses: { 'msg-1': { providerMessageId: 'msg-1', status: 'zugestellt', occurredAt: '2026-01-01T00:00:00.000Z' } },
    })
    const status = await provider.checkDeliveryStatus('msg-1')
    expect(status.status).toBe('zugestellt')
  })
})

describe('createKimProvider (Factory)', () => {
  it('baut einen Mock-Provider', () => {
    const provider = createKimProvider({ provider_type: 'mock', config: {} })
    expect(provider.getProviderInfo().providerType).toBe('mock')
  })

  it('baut einen Test-Provider', () => {
    const provider = createKimProvider({ provider_type: 'test', config: {} })
    expect(provider.getProviderInfo().providerType).toBe('test')
  })

  it('wirft für kim_plus (echter Konnektor nicht implementiert)', () => {
    expect(() => createKimProvider({ provider_type: 'kim_plus', config: {} })).toThrow(/nicht implementiert/)
  })

  it('wirft für kim_basis (echter Konnektor nicht implementiert)', () => {
    expect(() => createKimProvider({ provider_type: 'kim_basis', config: {} })).toThrow(/nicht implementiert/)
  })
})
