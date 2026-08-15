import type {
  IKimProvider,
  KimAddressVerification,
  KimDeliveryStatus,
  KimInboundMessage,
  KimOutboundMessage,
  KimProviderInfo,
  KimSendResult,
} from './provider-interface'

export interface MockKimProviderOptions {
  /** Anteil fehlschlagender sendMessage()-Aufrufe, 0..1. Default 0. */
  errorRate?: number
  /** Simulierte eingehende Nachrichten, die fetchInbound() einmalig ausliefert. */
  seedInbound?: KimInboundMessage[]
  /** Adressen, die verifyAddress() als ungültig zurückmelden soll. */
  invalidAddresses?: string[]
}

interface TrackedSend {
  status: KimDeliveryStatus['status']
  sentAtMs: number
}

/**
 * Simuliert einen KIM-Provider vollständig im Prozess — kein Netzwerk,
 * keine echte TI. Gedacht für lokale Entwicklung/Demo: Nachrichten
 * "altern" zeitbasiert von gesendet → zugestellt → gelesen, damit
 * Outbox/Status-UI ohne echten Konnektor getestet werden kann.
 */
export class MockKimProvider implements IKimProvider {
  private readonly errorRate: number
  private readonly invalidAddresses: Set<string>
  private inboundQueue: KimInboundMessage[]
  private readonly sent = new Map<string, TrackedSend>()
  private counter = 0

  constructor(options: MockKimProviderOptions = {}) {
    this.errorRate = Math.min(1, Math.max(0, options.errorRate ?? 0))
    this.invalidAddresses = new Set((options.invalidAddresses ?? []).map(a => a.toLowerCase()))
    this.inboundQueue = [...(options.seedInbound ?? [])]
  }

  async sendMessage(msg: KimOutboundMessage): Promise<KimSendResult> {
    if (!msg.toAddress || !msg.subject) {
      return { success: false, errorDetails: 'Empfänger-Adresse und Betreff sind Pflichtfelder.' }
    }
    if (this.errorRate > 0 && Math.random() < this.errorRate) {
      return { success: false, errorDetails: 'Simulierter Zustellfehler (Mock-Provider, konfigurierte Fehlerrate).' }
    }
    this.counter += 1
    const providerMessageId = `mock-${Date.now()}-${this.counter}`
    this.sent.set(providerMessageId, { status: 'gesendet', sentAtMs: Date.now() })
    return { success: true, providerMessageId }
  }

  async checkDeliveryStatus(providerMessageId: string): Promise<KimDeliveryStatus> {
    const tracked = this.sent.get(providerMessageId)
    if (!tracked) {
      return {
        providerMessageId,
        status: 'fehler',
        occurredAt: new Date().toISOString(),
        errorDetails: 'Unbekannte Nachrichten-ID beim Mock-Provider.',
      }
    }
    const elapsedMs = Date.now() - tracked.sentAtMs
    const status: KimDeliveryStatus['status'] = elapsedMs > 5000 ? 'gelesen' : elapsedMs > 2000 ? 'zugestellt' : 'gesendet'
    tracked.status = status
    return { providerMessageId, status, occurredAt: new Date().toISOString() }
  }

  async fetchInbound(): Promise<KimInboundMessage[]> {
    const batch = this.inboundQueue
    this.inboundQueue = []
    return batch
  }

  async verifyAddress(address: string): Promise<KimAddressVerification> {
    const isFormatValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)
    if (!isFormatValid) {
      return { address, isValid: false, reason: 'Adressformat ungültig.' }
    }
    if (this.invalidAddresses.has(address.toLowerCase())) {
      return { address, isValid: false, reason: 'Adresse beim Mock-Provider nicht bekannt.' }
    }
    return { address, isValid: true, displayName: address.split('@')[0] }
  }

  getProviderInfo(): KimProviderInfo {
    return { providerType: 'mock', displayName: 'Mock-Provider (Simulation)', isSimulated: true }
  }

  /** Nur für Tests/Demos: eine eingehende Nachricht nachträglich einreihen. */
  seedInboundMessage(msg: KimInboundMessage): void {
    this.inboundQueue.push(msg)
  }
}
