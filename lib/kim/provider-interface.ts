import type { KimProviderType } from './types'

// ═══════════════════════════════════════════════════════════════
// Provider-Abstraktion — der Vertrag, den JEDE KIM-Anbindung
// erfüllen muss. Die Fachlogik (Services, API-Routen, UI) kennt nur
// dieses Interface, nie eine konkrete Provider-Implementierung.
//
// Ein späterer Wechsel auf einen echten TI-Konnektor (kim_plus/
// kim_basis) bedeutet: eine neue Datei implementiert IKimProvider,
// provider-factory.ts bekommt einen zusätzlichen case. Sonst ändert
// sich nichts — kein Service, keine Route, keine UI-Komponente.
// ═══════════════════════════════════════════════════════════════

export interface KimOutboundMessage {
  fromAddress: string
  toAddress: string
  subject: string
  bodyText?: string | null
  bodyHtml?: string | null
  attachments?: Array<{ filename: string; mimeType: string; content: ArrayBuffer }>
}

export interface KimSendResult {
  success: boolean
  providerMessageId?: string
  errorDetails?: string
}

export type KimProviderDeliveryStatus = 'wartend' | 'gesendet' | 'zugestellt' | 'gelesen' | 'fehler'

export interface KimDeliveryStatus {
  providerMessageId: string
  status: KimProviderDeliveryStatus
  occurredAt: string
  errorDetails?: string
}

export interface KimInboundMessage {
  providerMessageId: string
  fromAddress: string
  toAddress: string
  subject: string
  bodyText?: string | null
  bodyHtml?: string | null
  receivedAt: string
  attachments?: Array<{ filename: string; mimeType: string; content: ArrayBuffer }>
}

export interface KimAddressVerification {
  address: string
  isValid: boolean
  displayName?: string
  reason?: string
}

export interface KimProviderInfo {
  providerType: KimProviderType
  displayName: string
  isSimulated: boolean
}

/**
 * Providerunabhängige Schnittstelle. Jede Implementierung (mock, test,
 * ein späterer echter TI-Konnektor) muss ausschließlich hierüber
 * angesprochen werden — die Fachlogik kennt keine Provider-Details.
 */
export interface IKimProvider {
  sendMessage(msg: KimOutboundMessage): Promise<KimSendResult>
  checkDeliveryStatus(providerMessageId: string): Promise<KimDeliveryStatus>
  fetchInbound(): Promise<KimInboundMessage[]>
  verifyAddress(address: string): Promise<KimAddressVerification>
  getProviderInfo(): KimProviderInfo
}
