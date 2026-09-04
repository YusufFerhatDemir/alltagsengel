/**
 * KIM — Provider-Konfiguration
 *
 * KIM ist der Nachrichtenweg in die Telematikinfrastruktur; darüber gehen
 * Arztbriefe und Verordnungen. Wer den aktiven Provider setzt, bestimmt,
 * wohin diese Nachrichten laufen. Entsprechend liegt der Schwerpunkt:
 *
 *   • Genau EIN Provider ist aktiv. Bleiben zwei aktiv, entscheidet
 *     `maybeSingle()` beim nächsten Lesen zufällig — oder wirft, weil es
 *     zwei Zeilen findet. Beides ist ein Ausfall des Versandwegs.
 *   • Erst deaktivieren, DANN aktivieren. Andersherum gäbe es einen
 *     Moment mit zwei aktiven Konfigurationen.
 *   • Der Mandantenfilter. Ohne ihn deaktiviert eine Organisation die
 *     Konfiguration einer anderen — und deren Arztbriefe stehen still.
 *   • Ohne Konfiguration der Mock-Provider, NICHT ein echter. Ein
 *     Vorgabe-Provider mit echtem Versand wäre ein Weg nach draußen, den
 *     niemand eingerichtet hat.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '../helpers/supabase-fake'

const writeKimAuditLog = vi.fn(async () => undefined)
vi.mock('@/lib/kim/audit-service', () => ({
  writeKimAuditLog: (...a: unknown[]) => writeKimAuditLog(...(a as [])),
}))

const createKimProvider = vi.fn((k: { provider_type: string }) => ({ art: k.provider_type }))
vi.mock('@/lib/kim/provider-factory', () => ({
  createKimProvider: (k: unknown) => createKimProvider(k as never),
}))

const {
  getActiveProviderConfig, listProviderConfigs, setActiveProviderConfig, resolveOrgProvider,
} = await import('@/lib/kim/provider-config-service')

type Client = Parameters<typeof getActiveProviderConfig>[0]

const ORG = '00000000-0000-4000-8000-000460629986'

function fake(antwort: { data?: unknown; error?: { message: string } }) {
  const f = erstelleFakeSupabase((a: FakeAufruf) =>
    a.tabelle === 'kim_provider_config' ? antwort : { data: null })
  return { client: f.client as unknown as Client, aufrufe: f.aufrufe }
}

beforeEach(() => {
  writeKimAuditLog.mockClear()
  createKimProvider.mockClear()
})

describe('getActiveProviderConfig', () => {
  it('sucht nur die aktive Konfiguration des eigenen Mandanten', async () => {
    const { client, aufrufe } = fake({ data: null })
    await getActiveProviderConfig(client, ORG)
    expect(hatOrgFence(aufrufe[0], ORG)).toBe(true)
    expect(hatFilter(aufrufe[0], 'eq', 'is_active', true)).toBe(true)
  })

  it('liefert null, wenn nichts eingerichtet ist', async () => {
    expect(await getActiveProviderConfig(fake({ data: null }).client, ORG)).toBeNull()
  })

  it('wirft bei einem Lesefehler, statt null zu liefern', async () => {
    // null hieße „nicht eingerichtet" — und resolveOrgProvider fiele
    // dann still auf den Mock zurück, obwohl ein echter Provider gesetzt ist.
    const { client } = fake({ error: { message: 'weg' } })
    await expect(getActiveProviderConfig(client, ORG)).rejects.toThrow(/nicht geladen/)
  })
})

describe('listProviderConfigs', () => {
  it('grenzt auf den Mandanten ein und sortiert neueste zuerst', async () => {
    const { client, aufrufe } = fake({ data: [] })
    await listProviderConfigs(client, ORG)
    expect(hatOrgFence(aufrufe[0], ORG)).toBe(true)
    expect(hatFilter(aufrufe[0], 'order', 'created_at')).toBe(true)
  })

  it('liefert bei null-Daten eine leere Liste', async () => {
    expect(await listProviderConfigs(fake({ data: null }).client, ORG)).toEqual([])
  })

  it('wirft bei einem Lesefehler', async () => {
    const { client } = fake({ error: { message: 'weg' } })
    await expect(listProviderConfigs(client, ORG)).rejects.toThrow(/nicht geladen/)
  })
})

describe('setActiveProviderConfig', () => {
  const gespeichert = { id: 'k1', provider_type: 'kim_ref', is_active: true }

  it('deaktiviert Bestehendes ZUERST, dann wird gesetzt', async () => {
    // Andersherum gäbe es einen Moment mit zwei aktiven Konfigurationen.
    const { client, aufrufe } = fake({ data: gespeichert })
    await setActiveProviderConfig(client, ORG, 'actor', { provider_type: 'kim_ref' } as never)

    const deaktivieren = aufrufe.findIndex(a => a.operation === 'update')
    const setzen = aufrufe.findIndex(a => a.operation === 'insert')
    expect(deaktivieren).toBeGreaterThanOrEqual(0)
    expect(setzen).toBeGreaterThan(deaktivieren)
    expect(aufrufe[deaktivieren].payload).toMatchObject({ is_active: false })
  })

  it('deaktiviert nur im eigenen Mandanten und nur Aktives', async () => {
    // Ohne den Mandantenfilter stünde der Versandweg einer fremden
    // Organisation still.
    const { client, aufrufe } = fake({ data: gespeichert })
    await setActiveProviderConfig(client, ORG, 'actor', { provider_type: 'kim_ref' } as never)
    const deaktivieren = aufrufe.find(a => a.operation === 'update')
    expect(hatOrgFence(deaktivieren, ORG)).toBe(true)
    expect(hatFilter(deaktivieren, 'eq', 'is_active', true)).toBe(true)
  })

  it('schreibt die neue Konfiguration als aktiv und mandantengebunden', async () => {
    const { client, aufrufe } = fake({ data: gespeichert })
    await setActiveProviderConfig(client, ORG, 'actor', {
      provider_type: 'kim_ref', config: { host: 'x' },
    } as never)
    const setzen = aufrufe.find(a => a.operation === 'insert')
    expect(setzen?.payload).toMatchObject({
      organization_id: ORG, provider_type: 'kim_ref', is_active: true, config: { host: 'x' },
    })
  })

  it('setzt fehlende Angaben auf leere Vorgaben statt undefined', async () => {
    const { client, aufrufe } = fake({ data: gespeichert })
    await setActiveProviderConfig(client, ORG, 'actor', { provider_type: 'mock' } as never)
    const setzen = aufrufe.find(a => a.operation === 'insert')
    expect(setzen?.payload).toMatchObject({ config: {}, konfiguration_id: null })
  })

  it('protokolliert die Änderung mit Mandant und Handelndem', async () => {
    // Wer den Versandweg umstellt, muss nachvollziehbar sein.
    const { client } = fake({ data: gespeichert })
    await setActiveProviderConfig(client, ORG, 'actor-7', { provider_type: 'kim_ref' } as never)
    expect(writeKimAuditLog).toHaveBeenCalledTimes(1)
    expect(writeKimAuditLog.mock.calls[0][1]).toMatchObject({
      organizationId: ORG, actorId: 'actor-7', aktion: 'provider_konfiguriert',
    })
  })

  it('protokolliert NICHT, wenn das Speichern scheitert', async () => {
    const { client } = fake({ error: { message: 'kaputt' } })
    await expect(setActiveProviderConfig(client, ORG, 'actor', { provider_type: 'mock' } as never))
      .rejects.toThrow()
    expect(writeKimAuditLog).not.toHaveBeenCalled()
  })

  it('wirft, wenn das Deaktivieren scheitert — und setzt nichts', async () => {
    // Sonst entstünde eine zweite aktive Konfiguration.
    const { client, aufrufe } = fake({ error: { message: 'weg' } })
    await expect(setActiveProviderConfig(client, ORG, 'actor', { provider_type: 'mock' } as never))
      .rejects.toThrow(/deaktiviert/)
    expect(aufrufe.some(a => a.operation === 'insert')).toBe(false)
  })
})

describe('resolveOrgProvider', () => {
  it('nimmt ohne Einrichtung den Mock-Provider', async () => {
    // Ein echter Vorgabe-Provider wäre ein Weg nach draußen, den niemand
    // eingerichtet hat.
    const provider = await resolveOrgProvider(fake({ data: null }).client, ORG)
    expect(createKimProvider).toHaveBeenCalledWith({ provider_type: 'mock', config: {} })
    expect(provider).toEqual({ art: 'mock' })
  })

  it('nimmt den eingerichteten Provider samt Konfiguration', async () => {
    const { client } = fake({ data: { provider_type: 'kim_ref', config: { host: 'ti.example' } } })
    await resolveOrgProvider(client, ORG)
    expect(createKimProvider).toHaveBeenCalledWith({
      provider_type: 'kim_ref', config: { host: 'ti.example' },
    })
  })

  it('fällt bei einem Lesefehler NICHT auf den Mock zurück, sondern wirft', async () => {
    // Ein stiller Mock-Rückfall hieße: Arztbriefe verschwinden ins Nichts,
    // und die Oberfläche meldet Erfolg.
    const { client } = fake({ error: { message: 'weg' } })
    await expect(resolveOrgProvider(client, ORG)).rejects.toThrow(/nicht geladen/)
    expect(createKimProvider).not.toHaveBeenCalled()
  })
})
