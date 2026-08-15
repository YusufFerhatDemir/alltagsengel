import type {
  IKimProvider,
  KimAddressVerification,
  KimDeliveryStatus,
  KimInboundMessage,
  KimOutboundMessage,
  KimProviderInfo,
  KimSendResult,
} from './provider-interface'

export interface TestKimProviderOptions {
  /** Ergebnisse für sendMessage(), der Reihe nach abgerufen (letztes wird bei Überlauf wiederholt). */
  sendResults?: KimSendResult[]
  /** Feste Zustellstatus je providerMessageId. */
  deliveryStatuses?: Record<string, KimDeliveryStatus>
  /** Feste Liste eingehender Nachrichten für fetchInbound(). */
  inbound?: KimInboundMessage[]
  /** Adressen, die als ungültig gelten sollen. */
  invalidAddresses?: string[]
}

/**
 * Vollständig deterministischer Provider für Unit-/Integrationstests.
 * Kein Math.random(), kein Date.now() als Entscheidungsgrundlage —
 * jedes Ergebnis kommt entweder aus der Konfiguration oder aus einem
 * simplen, vorhersagbaren Zähler.
 */
export class TestKimProvider implements IKimProvider {
  private sendCallIndex = 0
  private idCounter = 0
  readonly sendCalls: KimOutboundMessage[] = []
  readonly verifyCalls: string[] = []

  constructor(private readonly options: TestKimProviderOptions = {}) {}

  async sendMessage(msg: KimOutboundMessage): Promise<KimSendResult> {
    this.sendCalls.push(msg)
    const results = this.options.sendResults
    if (results && results.length > 0) {
      const idx = Math.min(this.sendCallIndex, results.length - 1)
      this.sendCallIndex += 1
      return results[idx]
    }
    this.idCounter += 1
    return { success: true, providerMessageId: `test-msg-${this.idCounter}` }
  }

  async checkDeliveryStatus(providerMessageId: string): Promise<KimDeliveryStatus> {
    const fixed = this.options.deliveryStatuses?.[providerMessageId]
    if (fixed) return fixed
    return { providerMessageId, status: 'gesendet', occurredAt: '2026-01-01T00:00:00.000Z' }
  }

  async fetchInbound(): Promise<KimInboundMessage[]> {
    return this.options.inbound ?? []
  }

  async verifyAddress(address: string): Promise<KimAddressVerification> {
    this.verifyCalls.push(address)
    if ((this.options.invalidAddresses ?? []).includes(address)) {
      return { address, isValid: false, reason: 'Als ungültig konfiguriert (Test-Provider).' }
    }
    return { address, isValid: true, displayName: address.split('@')[0] }
  }

  getProviderInfo(): KimProviderInfo {
    return { providerType: 'test', displayName: 'Test-Provider (deterministisch)', isSimulated: true }
  }
}
