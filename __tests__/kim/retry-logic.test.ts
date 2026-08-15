import { describe, it, expect } from 'vitest'
import { computeBackoffMs, RETRY_BACKOFF_BASE_MS, RETRY_BACKOFF_MAX_MS, sendQueuedMessage, processOutbox } from '@/lib/kim/outbox-service'
import { createDraftMessage, queueForSending } from '@/lib/kim/message-service'
import { TestKimProvider } from '@/lib/kim/test-provider'
import { createFakeKimSupabase } from './_fake-supabase'

const ORG = 'org-1'
const USER = 'user-1'

function baseInput() {
  return {
    kim_address_from: 'praxis@kim.test',
    kim_address_to: 'kasse@kim.test',
    subject: 'Arztbrief',
    body_text: 'Text',
  }
}

describe('computeBackoffMs', () => {
  it('startet bei der Basiszeit für den ersten Versuch', () => {
    expect(computeBackoffMs(1)).toBe(RETRY_BACKOFF_BASE_MS * 2)
  })

  it('verdoppelt sich mit jedem Versuch', () => {
    expect(computeBackoffMs(2)).toBe(RETRY_BACKOFF_BASE_MS * 4)
    expect(computeBackoffMs(3)).toBe(RETRY_BACKOFF_BASE_MS * 8)
  })

  it('deckelt bei 24 Stunden', () => {
    expect(computeBackoffMs(20)).toBe(RETRY_BACKOFF_MAX_MS)
  })
})

describe('sendQueuedMessage — Retry-Verhalten', () => {
  async function seedQueuedMessage(fake: ReturnType<typeof createFakeKimSupabase>) {
    const created = await createDraftMessage(fake as any, ORG, USER, baseInput())
    return queueForSending(fake as any, ORG, created.id, USER)
  }

  it('markiert erfolgreich gesendete Nachrichten als "gesendet"', async () => {
    const fake = createFakeKimSupabase()
    const message = await seedQueuedMessage(fake)
    const provider = new TestKimProvider({ sendResults: [{ success: true, providerMessageId: 'p-1' }] })

    const result = await sendQueuedMessage(fake as any, provider, ORG, message, USER)

    expect(result.outcome).toBe('gesendet')
    const stored = fake._table('kim_messages').find(r => r.id === message.id)
    expect(stored.status).toBe('gesendet')
    expect(stored.provider_message_id).toBe('p-1')
  })

  it('plant einen Retry mit steigendem retry_count bei Fehlschlag', async () => {
    const fake = createFakeKimSupabase()
    const message = await seedQueuedMessage(fake)
    const provider = new TestKimProvider({ sendResults: [{ success: false, errorDetails: 'Postfach voll' }] })

    const result = await sendQueuedMessage(fake as any, provider, ORG, message, USER)

    expect(result.outcome).toBe('wird_wiederholt')
    const stored = fake._table('kim_messages').find(r => r.id === message.id)
    expect(stored.status).toBe('fehler')
    expect(stored.retry_count).toBe(1)
    expect(stored.next_retry_at).toBeTruthy()
  })

  it('gibt nach Erreichen von max_retries endgültig auf (kein weiterer Retry)', async () => {
    const fake = createFakeKimSupabase()
    const message = await seedQueuedMessage(fake)
    fake._table('kim_messages').find((r: any) => r.id === message.id).retry_count = message.max_retries
    const provider = new TestKimProvider({ sendResults: [{ success: false, errorDetails: 'Dauerhafter Fehler' }] })

    const stored = fake._table('kim_messages').find((r: any) => r.id === message.id)
    const result = await sendQueuedMessage(fake as any, provider, ORG, stored, USER)

    expect(result.outcome).toBe('endgueltig_fehlgeschlagen')
    const final = fake._table('kim_messages').find((r: any) => r.id === message.id)
    expect(final.next_retry_at).toBeNull()
  })
})

describe('processOutbox', () => {
  it('verarbeitet alle wartenden Nachrichten und zählt Ergebnisse korrekt', async () => {
    const fake = createFakeKimSupabase()
    const m1 = await createDraftMessage(fake as any, ORG, USER, baseInput())
    await queueForSending(fake as any, ORG, m1.id, USER)
    const m2 = await createDraftMessage(fake as any, ORG, USER, { ...baseInput(), subject: 'Zweite' })
    await queueForSending(fake as any, ORG, m2.id, USER)

    const provider = new TestKimProvider({
      sendResults: [
        { success: true, providerMessageId: 'ok-1' },
        { success: false, errorDetails: 'Fehler' },
      ],
    })

    const summary = await processOutbox(fake as any, provider, ORG, USER)

    expect(summary.gesendet).toBe(1)
    expect(summary.wirdWiederholt).toBe(1)
    expect(summary.endgueltigFehlgeschlagen).toBe(0)
  })

  it('lässt fremde Organisationen unberührt', async () => {
    const fake = createFakeKimSupabase()
    const m1 = await createDraftMessage(fake as any, ORG, USER, baseInput())
    await queueForSending(fake as any, ORG, m1.id, USER)
    const provider = new TestKimProvider()

    const summary = await processOutbox(fake as any, provider, 'andere-org', USER)

    expect(summary.gesendet).toBe(0)
    expect(summary.results).toHaveLength(0)
  })
})
