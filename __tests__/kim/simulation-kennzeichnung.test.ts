/**
 * Track 5 (19.08.2026) — Integrationstest: die Simulationskennzeichnung
 * landet tatsächlich an der gespeicherten Nachricht.
 *
 * Der Unit-Test in versandmodus.test.ts prüft die Marker-Erzeugung. Hier geht
 * es um die Frage, die im Betrieb zählt: steht die Kennzeichnung nach einem
 * Durchlauf durch outbox-/inbox-Service in der Zeile — und zwar in derselben
 * Zeile, die den Status 'gesendet'/'zugestellt' trägt.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { sendQueuedMessage, pollDeliveryStatuses, processOutbox } from '@/lib/kim/outbox-service'
import { fetchAndStoreInbound } from '@/lib/kim/inbox-service'
import { createDraftMessage, queueForSending } from '@/lib/kim/message-service'
import { TestKimProvider } from '@/lib/kim/test-provider'
import { istSimulierteNachricht, KimBetriebsmodusError } from '@/lib/kim/versandmodus'
import { createFakeKimSupabase } from './_fake-supabase'

const ORG = 'org-1'
const USER = 'user-1'
const ALT = process.env.KIM_AKTIV

beforeEach(() => { delete process.env.KIM_AKTIV })
afterEach(() => { if (ALT === undefined) delete process.env.KIM_AKTIV; else process.env.KIM_AKTIV = ALT })

function entwurf() {
  return { kim_address_from: 'pflege@kim.test', kim_address_to: 'praxis@kim.test', subject: 'Arztbrief', body_text: 'Text' }
}

async function eingereihteNachricht(fake: ReturnType<typeof createFakeKimSupabase>) {
  const created = await createDraftMessage(fake as never, ORG, USER, entwurf())
  return queueForSending(fake as never, ORG, created.id, USER)
}

describe('Ausgang — simulierter Versand ist an der Zeile erkennbar', () => {
  it('kennzeichnet eine erfolgreich "gesendete" Nachricht als simuliert', async () => {
    const fake = createFakeKimSupabase()
    const message = await eingereihteNachricht(fake)

    const ergebnis = await sendQueuedMessage(fake as never, new TestKimProvider(), ORG, message, USER)
    expect(ergebnis.outcome).toBe('gesendet')

    const zeile = fake._table('kim_messages').find(r => r.id === message.id)!
    expect(zeile.status).toBe('gesendet')
    expect(istSimulierteNachricht(zeile.metadata)).toBe(true)
    expect(zeile.metadata.kim_simulation.provider_typ).toBe('test')
  })

  it('kennzeichnet auch den Fehlschlag — ein simulierter Fehler ist kein echter Zustellfehler', async () => {
    const fake = createFakeKimSupabase()
    const message = await eingereihteNachricht(fake)
    const provider = new TestKimProvider({ sendResults: [{ success: false, errorDetails: 'simuliert' }] })

    await sendQueuedMessage(fake as never, provider, ORG, message, USER)

    const zeile = fake._table('kim_messages').find(r => r.id === message.id)!
    expect(zeile.status).toBe('fehler')
    expect(istSimulierteNachricht(zeile.metadata)).toBe(true)
  })

  it('kennzeichnet den Zustellstatus, der als Zustellnachweis gelesen würde', async () => {
    const fake = createFakeKimSupabase()
    const message = await eingereihteNachricht(fake)
    const provider = new TestKimProvider({
      sendResults: [{ success: true, providerMessageId: 'test-msg-1' }],
      deliveryStatuses: { 'test-msg-1': { providerMessageId: 'test-msg-1', status: 'zugestellt', occurredAt: '2026-08-19T09:00:00.000Z' } },
    })

    await sendQueuedMessage(fake as never, provider, ORG, message, USER)
    const aktualisiert = await pollDeliveryStatuses(fake as never, provider, ORG, USER)
    expect(aktualisiert).toBe(1)

    const zeile = fake._table('kim_messages').find(r => r.id === message.id)!
    expect(zeile.status).toBe('zugestellt')
    expect(istSimulierteNachricht(zeile.metadata)).toBe(true)
  })

  it('bricht die gesamte Warteschlangenverarbeitung ab, wenn KIM_AKTIV Echtbetrieb behauptet', async () => {
    const fake = createFakeKimSupabase()
    const message = await eingereihteNachricht(fake)
    process.env.KIM_AKTIV = 'true'

    await expect(processOutbox(fake as never, new TestKimProvider(), ORG, USER)).rejects.toThrow(KimBetriebsmodusError)

    // Entscheidend: die Nachricht wurde NICHT angefasst.
    const zeile = fake._table('kim_messages').find(r => r.id === message.id)!
    expect(zeile.status).toBe('wartend')
    expect(zeile.sent_at ?? null).toBeNull()
  })
})

describe('Eingang — simuliert abgeholte Nachrichten sind erkennbar', () => {
  it('kennzeichnet eine über den Simulator abgeholte Eingangsnachricht', async () => {
    const fake = createFakeKimSupabase()
    const provider = new TestKimProvider({
      inbound: [{
        providerMessageId: 'in-1', fromAddress: 'praxis@kim.test', toAddress: 'pflege@kim.test',
        subject: 'Befund', bodyText: 'Inhalt', receivedAt: '2026-08-19T08:00:00.000Z',
      }],
    })

    const summary = await fetchAndStoreInbound(fake as never, provider, ORG)
    expect(summary.inserted).toBe(1)

    const zeile = fake._table('kim_messages').find(r => r.provider_message_id === 'in-1')!
    expect(zeile.status).toBe('zugestellt')
    expect(istSimulierteNachricht(zeile.metadata)).toBe(true)
  })

  it('ruft im behaupteten Echtbetrieb gar nicht erst ab', async () => {
    process.env.KIM_AKTIV = 'true'
    const fake = createFakeKimSupabase()
    await expect(fetchAndStoreInbound(fake as never, new TestKimProvider(), ORG)).rejects.toThrow(KimBetriebsmodusError)
    expect(fake._table('kim_messages')).toHaveLength(0)
  })
})
