/**
 * Alarmspur — wurde gemeldet, und was sagt die Zustellspur?
 *
 * WARUM DIESE PRUEFUNGEN UND NICHT ANDERE
 * Der Fall, aus dem dieses Modul entstanden ist, sah in jeder einzelnen
 * Tabelle richtig aus und war trotzdem nicht beantwortbar. Die Pruefungen
 * zielen deshalb genau auf die Stellen, an denen ein Beobachter zu einer
 * FALSCHEN Zuversicht kommt:
 *
 *   1. Gemeldet ohne Zustellvorgang wird NICHT als „nicht gemeldet"
 *      gelesen (Ereignis ohne Organisation).
 *   2. „an Provider uebergeben" wird nirgends „zugestellt" genannt.
 *   3. Eine Zustellzeile ohne Versandnachweis geht nicht verloren.
 *   4. Eine gescheiterte Zustellung ueberstimmt die Ampel.
 *   5. Die Seite kostet zwei Abfragen, nicht zwei je Zeile.
 *   6. Faellt eine Abfrage aus, gibt es trotzdem eine Liste.
 */

import { describe, it, expect } from 'vitest'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'
import {
  alarmZustaende, alarmKurzfassung, LEERER_ALARM, type Alarmzustand,
} from '@/lib/security/alarmspur'

const E1 = '11111111-1111-4111-8111-111111111111'
const E2 = '22222222-2222-4222-8222-222222222222'
const E3 = '33333333-3333-4333-8333-333333333333'

type Client = Parameters<typeof alarmZustaende>[0]

function fake(
  nachweise: unknown[],
  zustellungen: unknown[],
  opts: { nachweisFehler?: boolean; zustellFehler?: boolean } = {},
) {
  const aufrufe: FakeAufruf[] = []
  const f = erstelleFakeSupabase((a) => {
    aufrufe.push(a)
    if (a.tabelle === 'security_audit_log') {
      return opts.nachweisFehler
        ? { data: null, error: { message: 'kaputt', code: '42P01' } }
        : { data: nachweise }
    }
    if (a.tabelle === 'notification_delivery_log') {
      return opts.zustellFehler
        ? { data: null, error: { message: 'kaputt', code: '42P01' } }
        : { data: zustellungen }
    }
    return { data: [] }
  })
  return { client: f.client as unknown as Client, aufrufe: f.aufrufe }
}

const NACHWEIS = (bezug: string) => ({
  id: `nachweis-${bezug}`,
  created_at: '2026-08-31T04:01:15.000Z',
  metadata: {
    bezug_ereignis: bezug,
    bezug_event_type: 'login_success',
    melde_grund: 'Konto ueberwacht (voller Meldesatz)',
    empfaenger_anzahl: 1,
  },
})

const ZUSTELLUNG = (bezug: string, felder: Record<string, unknown> = {}) => ({
  vorgang_ref: bezug,
  status: 'sent',
  recipient: 'info@alltagsengel.care',
  provider: 'resend',
  provider_message_id: '02eebce1-f0ce-42c0-a862-de60c50de412',
  attempt_count: 1,
  attempted_at: '2026-08-31T04:01:15.000Z',
  delivered_at: '2026-08-31T04:01:15.000Z',
  failed_at: null,
  sanitized_error: null,
  grund: null,
  ...felder,
})

describe('alarmZustaende', () => {
  it('1 · gemeldet OHNE Zustellvorgang bleibt „ausgeloest" und wird als solches markiert', async () => {
    // Genau der Fall eines Ereignisses ohne Organisation: benachrichtigung.ts
    // haengt dann KEINEN Zustellkontext an. Wer nur die Zustellspur liest,
    // haelt das faelschlich fuer „nie gemeldet".
    const { client } = fake([NACHWEIS(E1)], [])
    const m = await alarmZustaende(client, [E1])

    expect(m.get(E1)?.ausgeloest).toBe(true)
    expect(m.get(E1)?.ohneWiederholung).toBe(true)
    expect(m.get(E1)?.zustellungen).toEqual([])
    expect(alarmKurzfassung(m.get(E1)!)).toMatch(/kein Zustellvorgang/)
  })

  it('2 · eine uebergebene Mail wird NIRGENDS „zugestellt" genannt', async () => {
    // delivered_at in notification_delivery_log heisst „dem Provider
    // uebergeben". Die Kurzfassung darf daraus keine Zustellung machen —
    // sonst ist die Ansicht gruen, obwohl niemand die Mail hat.
    const { client } = fake([NACHWEIS(E1)], [ZUSTELLUNG(E1)])
    const m = await alarmZustaende(client, [E1])
    const satz = alarmKurzfassung(m.get(E1)!)

    expect(satz).toContain('uebergeben')
    expect(satz).not.toMatch(/zugestellt/i)
    expect(satz).toMatch(/Provider pruefen/)
  })

  it('3 · Zustellzeile ohne Versandnachweis geht nicht verloren', async () => {
    // Scheitert der Sofortversuch, schreibt benachrichtigung.ts keinen
    // Nachweis — die Zeile des Wiederholungslaufs ist dann das Einzige,
    // was es gibt. Sie muss am Ereignis haengen.
    const { client } = fake([], [ZUSTELLUNG(E2, { status: 'failed', delivered_at: null })])
    const m = await alarmZustaende(client, [E2])

    expect(m.has(E2)).toBe(true)
    expect(m.get(E2)?.ausgeloest).toBe(false)
    expect(m.get(E2)?.zustellungen).toHaveLength(1)
    // ohneWiederholung setzt „ausgeloest" voraus — hier also ausdruecklich nicht.
    expect(m.get(E2)?.ohneWiederholung).toBe(false)
  })

  it('4 · eine gescheiterte Zustellung ueberstimmt die Ampel', async () => {
    const { client } = fake(
      [NACHWEIS(E3)],
      [ZUSTELLUNG(E3, {
        status: 'failed', delivered_at: null,
        failed_at: '2026-08-31T04:02:00.000Z',
        sanitized_error: 'Empfaenger unbekannt',
      })],
    )
    const m = await alarmZustaende(client, [E3])

    expect(alarmKurzfassung(m.get(E3)!)).toMatch(/GESCHEITERT/)
    expect(m.get(E3)?.zustellungen[0].fehlergrund).toBe('Empfaenger unbekannt')
  })

  it('5 · drei Ereignisse kosten ZWEI Abfragen, nicht sechs', async () => {
    const { client, aufrufe } = fake(
      [NACHWEIS(E1), NACHWEIS(E2)],
      [ZUSTELLUNG(E1), ZUSTELLUNG(E2)],
    )
    await alarmZustaende(client, [E1, E2, E3])

    expect(aufrufe).toHaveLength(2)
    expect(hatFilter(aufrufe[0], 'in', 'metadata->>bezug_ereignis', [E1, E2, E3])).toBe(true)
    expect(hatFilter(aufrufe[1], 'eq', 'vorgang_art', 'sicherheitsmeldung')).toBe(true)
    expect(hatFilter(aufrufe[1], 'in', 'vorgang_ref', [E1, E2, E3])).toBe(true)
  })

  it('5b · leere Eingabe fragt gar nicht', async () => {
    const { client, aufrufe } = fake([], [])
    expect((await alarmZustaende(client, [])).size).toBe(0)
    expect(aufrufe).toHaveLength(0)
  })

  it('6 · faellt die Zustellabfrage aus, bleibt der Versandnachweis stehen', async () => {
    // Fail-soft: eine Sicherheitsansicht, die wegen einer Zusatzspalte
    // komplett leer bleibt, ist schlechter als eine mit einer Luecke.
    const { client } = fake([NACHWEIS(E1)], [], { zustellFehler: true })
    const m = await alarmZustaende(client, [E1])

    expect(m.get(E1)?.ausgeloest).toBe(true)
    expect(m.get(E1)?.zustellungen).toEqual([])
  })

  it('6b · faellt die Nachweisabfrage aus, bleibt die Zustellzeile stehen', async () => {
    const { client } = fake([], [ZUSTELLUNG(E1)], { nachweisFehler: true })
    const m = await alarmZustaende(client, [E1])

    expect(m.get(E1)?.zustellungen).toHaveLength(1)
  })
})

describe('alarmKurzfassung', () => {
  it('ohne Alarm sagt sie das auch', () => {
    expect(alarmKurzfassung(LEERER_ALARM)).toBe('kein Alarm')
  })

  it('eine teils gescheiterte, teils uebergebene Meldung gilt nicht als gescheitert', () => {
    // Zwei Empfaenger, einer erreicht: die Meldung ist rausgegangen. Der
    // Fehlschlag steht in der Detailansicht, nicht in der Ampel.
    const a: Alarmzustand = {
      ...LEERER_ALARM,
      ausgeloest: true,
      zustellungen: [
        { status: 'sent', empfaenger: 'a@x.de', provider: 'resend', providerNachrichtId: 'x', versuche: 1, letzterVersuch: null, zugestelltAm: '2026-08-31T04:00:00Z', gescheitertAm: null, fehlergrund: null },
        { status: 'failed', empfaenger: 'b@x.de', provider: 'resend', providerNachrichtId: null, versuche: 3, letzterVersuch: null, zugestelltAm: null, gescheitertAm: '2026-08-31T04:00:00Z', fehlergrund: 'bounce' },
      ],
    }
    expect(alarmKurzfassung(a)).toMatch(/uebergeben/)
    expect(alarmKurzfassung(a)).not.toMatch(/GESCHEITERT/)
  })
})
