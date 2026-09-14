/**
 * Trockenlauf-Proxy: Lesen durch, Schreiben abgefangen.
 * @see lib/automation/trockenlauf.ts
 *
 * ── WARUM DIESE TESTS SCHARF SEIN MÜSSEN ──────────────────────────
 * Der Proxy ist der einzige Riegel zwischen einem „Probelauf" und
 * echten Schreibvorgängen in der Produktionsdatenbank. Leckt er an einer
 * Methode, schreibt der Trockenlauf — und niemand merkt es, weil er ja
 * „nur ein Trockenlauf" war.
 *
 * Deshalb wird hier nicht geprüft, ob der Proxy im Normalfall
 * funktioniert, sondern ob er in jedem Fall DICHT ist.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  nurLesenderClient, trockenlaufGefahr, SCHREIB_METHODEN, TROCKENLAUF_ID,
} from '@/lib/automation/trockenlauf'

/** Minimaler Stub, der wie ein Supabase-Client aussieht und mitzählt. */
function stub() {
  const echtGeschrieben: string[] = []
  const gelesen: string[] = []
  const kette = (tabelle: string): Record<string, unknown> => {
    const k: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'gte', 'lte', 'neq', 'or']) {
      k[m] = () => { gelesen.push(`${tabelle}.${m}`); return k }
    }
    for (const m of SCHREIB_METHODEN) {
      k[m] = () => { echtGeschrieben.push(`${tabelle}.${m}`); return k }
    }
    k.single = async () => ({ data: { id: 'echt' }, error: null })
    k.maybeSingle = async () => ({ data: { id: 'echt' }, error: null })
    k.then = (f: (w: unknown) => unknown) => Promise.resolve({ data: [{ id: 'echt' }], error: null }).then(f)
    return k
  }
  const client = {
    from: (t: string) => kette(t),
    rpc: (name: string) => { echtGeschrieben.push(`rpc:${name}`); return kette(name) },
  }
  return { client: client as never, echtGeschrieben, gelesen }
}

describe('Schreibvorgänge kommen nicht durch', () => {
  it.each(SCHREIB_METHODEN)('%s wird abgefangen, nicht ausgeführt', async (methode) => {
    const s = stub()
    const { client, protokoll } = nurLesenderClient(s.client)
    await (client.from('ops_aufgaben') as never as Record<string, (n: unknown) => unknown>)[methode]({ titel: 'x' })
    expect(s.echtGeschrieben).toEqual([])
    expect(protokoll.vorgaenge).toHaveLength(1)
    expect(protokoll.vorgaenge[0].methode).toBe(methode)
    expect(protokoll.vorgaenge[0].tabelle).toBe('ops_aufgaben')
  })

  it('rpc wird abgefangen — eine RPC kann schreiben, von außen nicht erkennbar', async () => {
    const s = stub()
    const { client, protokoll } = nurLesenderClient(s.client)
    await (client as never as { rpc: (n: string, a: unknown) => unknown }).rpc('create_invoice_draft_atomic', { x: 1 })
    expect(s.echtGeschrieben).toEqual([])
    expect(protokoll.vorgaenge[0].tabelle).toBe('rpc:create_invoice_draft_atomic')
  })

  it('auch die Kette NACH einem insert schreibt nicht mehr', async () => {
    const s = stub()
    const { client } = nurLesenderClient(s.client)
    const k = (client.from('notifications') as never as Record<string, (n?: unknown) => Record<string, () => unknown>>)
    await (k.insert({ a: 1 }).select() as never as { single: () => Promise<unknown> }).single()
    expect(s.echtGeschrieben).toEqual([])
  })
})

describe('Lesen geht unverändert durch', () => {
  it('select erreicht den echten Client', async () => {
    const s = stub()
    const { client, protokoll } = nurLesenderClient(s.client)
    await (client.from('service_records') as never as Record<string, () => unknown>).select()
    expect(s.gelesen).toContain('service_records.select')
    expect(protokoll.vorgaenge).toEqual([])
  })

  it('eine Lesekette liefert die echten Daten — sonst sähen die Ketten andere Mengen', async () => {
    const s = stub()
    const { client } = nurLesenderClient(s.client)
    const k = client.from('clients') as never as Record<string, () => Record<string, () => Promise<unknown>>>
    const ergebnis = await k.select().single()
    expect(ergebnis).toEqual({ data: { id: 'echt' }, error: null })
  })
})

describe('Das abgefangene Ergebnis bringt die Kette nicht zum Absturz', () => {
  it('insert().select().single() liefert eine ZEILE, nicht null', async () => {
    // Mit `null` melden Ketten, die die angelegte Zeile zurücklesen,
    // einen Fehlschlag, den es scharf nicht gibt — am 14.09.2026 bei
    // `nachweis-fehlt` beobachtet („Aufgabe konnte nicht angelegt
    // werden"). Solche Scheinfehler decken die echten Befunde zu.
    const s = stub()
    const { client } = nurLesenderClient(s.client)
    const k = client.from('ops_aufgaben') as never as Record<string, (n?: unknown) => Record<string, () => Record<string, () => Promise<{ data: { id: string } | null; error: unknown }>>>>
    const r = await k.insert({}).select().single()
    expect(r.error).toBeNull()
    expect(r.data?.id).toBe(TROCKENLAUF_ID)
  })

  it('die Kennung ist eine gültige UUID — Ketten reichen sie weiter', () => {
    expect(TROCKENLAUF_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('ein blankes await auf den Schreibvorgang ergibt data/error', async () => {
    const s = stub()
    const { client } = nurLesenderClient(s.client)
    const r = await (client.from('x') as never as Record<string, (n?: unknown) => Promise<{ error: unknown }>>).update({})
    expect(r.error).toBeNull()
  })

  it('update().eq() bleibt awaitbar — das häufigste Muster im Bestand', async () => {
    const s = stub()
    const { client } = nurLesenderClient(s.client)
    const k = client.from('x') as never as Record<string, (n?: unknown) => Record<string, (a?: unknown, b?: unknown) => Promise<{ error: unknown }>>>
    const r = await k.update({ a: 1 }).eq('id', '1')
    expect(r.error).toBeNull()
    expect(s.echtGeschrieben).toEqual([])
  })
})

describe('Protokoll', () => {
  it('zählt je Tabelle und je Methode', async () => {
    const s = stub()
    const { client, protokoll } = nurLesenderClient(s.client)
    const f = (t: string) => client.from(t) as never as Record<string, (n?: unknown) => unknown>
    await f('ops_aufgaben').insert({ a: 1 })
    await f('ops_aufgaben').insert({ a: 2 })
    await f('notifications').insert({ b: 1 })
    expect(protokoll.jeTabelle()).toEqual({ ops_aufgaben: 2, notifications: 1 })
    expect(protokoll.jeMethode()).toEqual({ insert: 3 })
  })

  it('kürzt lange Nutzlasten, damit das Protokoll lesbar bleibt', async () => {
    const s = stub()
    const { client, protokoll } = nurLesenderClient(s.client)
    await (client.from('x') as never as Record<string, (n: unknown) => unknown>)
      .insert({ text: 'a'.repeat(500), liste: Array.from({ length: 50 }, (_, i) => i) })
    const n = protokoll.vorgaenge[0].nutzlast as Record<string, unknown>
    expect(String(n.text)).toHaveLength(81)
    expect(n.liste).toBe('[50 Eintraege]')
  })
})

describe('Nutzlasten aus fremdem Code', () => {
  it('ein Zyklus bringt den Trockenlauf nicht zum Absturz', async () => {
    const s = stub()
    const { client, protokoll } = nurLesenderClient(s.client)
    const zyklisch: Record<string, unknown> = { name: 'x' }
    zyklisch.selbst = zyklisch
    expect(() =>
      (client.from('x') as never as Record<string, (n: unknown) => unknown>).insert(zyklisch),
    ).not.toThrow()
    expect(protokoll.vorgaenge).toHaveLength(1)
  })
})

describe('Die zweite Tür: E-Mail', () => {
  it('meldet Gefahr, solange ein Resend-Schlüssel gesetzt ist', () => {
    expect(trockenlaufGefahr({ RESEND_API_KEY: 're_abc' } as never)).toMatch(/RESEND_API_KEY/)
  })

  it('ohne Schlüssel ist der Lauf gefahrlos', () => {
    expect(trockenlaufGefahr({} as never)).toBeNull()
  })

  it('ein leerer Schlüssel zählt als nicht gesetzt', () => {
    expect(trockenlaufGefahr({ RESEND_API_KEY: '' } as never)).toBeNull()
  })
})
