import { describe, it, expect } from 'vitest'
import { fetchAndStoreInbound } from '@/lib/kim/inbox-service'
import { TestKimProvider } from '@/lib/kim/test-provider'
import { createFakeKimSupabase } from './_fake-supabase'

const ORG = 'org-1'

function inboundMsg(providerMessageId: string) {
  return {
    providerMessageId,
    fromAddress: 'arzt@kim.test',
    toAddress: 'pflegedienst@kim.test',
    subject: 'Befund',
    bodyText: 'Inhalt',
    receivedAt: '2026-01-01T10:00:00.000Z',
  }
}

describe('fetchAndStoreInbound', () => {
  it('speichert neue eingehende Nachrichten als "zugestellt"', async () => {
    const fake = createFakeKimSupabase()
    const provider = new TestKimProvider({ inbound: [inboundMsg('p-1')] })

    const summary = await fetchAndStoreInbound(fake as any, provider, ORG)

    expect(summary.inserted).toBe(1)
    expect(summary.duplicates).toBe(0)
    expect(summary.messages[0].status).toBe('zugestellt')
    expect(summary.messages[0].direction).toBe('inbound')
  })

  it('überspringt bereits bekannte provider_message_id (Deduplizierung)', async () => {
    const fake = createFakeKimSupabase({
      kim_messages: [{
        id: 'existing-1', organization_id: ORG, direction: 'inbound', provider_message_id: 'p-1',
        kim_address_from: 'arzt@kim.test', kim_address_to: 'pflegedienst@kim.test', subject: 'Befund', status: 'zugestellt',
      }],
    })
    const provider = new TestKimProvider({ inbound: [inboundMsg('p-1')] })

    const summary = await fetchAndStoreInbound(fake as any, provider, ORG)

    expect(summary.inserted).toBe(0)
    expect(summary.duplicates).toBe(1)
    expect(fake._table('kim_messages')).toHaveLength(1)
  })

  it('verarbeitet mehrere neue Nachrichten in einem Abruf', async () => {
    const fake = createFakeKimSupabase()
    const provider = new TestKimProvider({ inbound: [inboundMsg('p-1'), inboundMsg('p-2')] })

    const summary = await fetchAndStoreInbound(fake as any, provider, ORG)

    expect(summary.inserted).toBe(2)
    expect(fake._table('kim_audit_log').filter((r: any) => r.aktion === 'empfangen')).toHaveLength(2)
  })
})
