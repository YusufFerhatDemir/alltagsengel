/**
 * Audit der Versand-Schalter
 *
 * Geprüft wird nicht „wird geloggt", sondern die drei Eigenschaften, an denen
 * eine solche Spur scheitern kann:
 *
 *   1. Sie darf nur bei ÄNDERUNG schreiben — sonst eine Zeile je Rechnung.
 *   2. Sie darf den Versand NIE kippen — ein Audit-Fehler ist kein Grund,
 *      eine korrekt festgeschriebene Rechnung nicht zu verschicken.
 *   3. Sie muss org-gefenced lesen. Der Trail einer service-role-Abfrage
 *      ohne organization_id-Filter läse den Zustand eines fremden Mandanten
 *      und schwiege deshalb, wenn der eigene sich geändert hat.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  protokolliereVersandFlags,
  letzterFlagZustand,
  VERSAND_FLAG_ACTION,
} from '@/lib/config/versand-flags-audit'
import { versandFlagsStand } from '@/lib/config/versand-flags'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000000000042'
const ANDERE_ORG = '00000000-0000-4000-8000-000000000099'
const ACTOR = '00000000-0000-4000-8000-0000000000aa'

const PROD_AN = { VERCEL_ENV: 'production', RECHNUNGSVERSAND_AUTOMATISCH: '1' }
const PROD_AUS = { VERCEL_ENV: 'production' }

/** Antwortgeber: liefert für den Lesezugriff den angegebenen Zustand. */
function db(letzterZustand: unknown, schreibFehler?: string) {
  return (aufruf: FakeAufruf) => {
    if (aufruf.tabelle !== 'billing_audit_trail') return {}
    if (aufruf.operation === 'insert') {
      return schreibFehler ? { error: { message: schreibFehler } } : { data: null }
    }
    return { data: letzterZustand === undefined ? [] : [{ new_state: letzterZustand }] }
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('letzterFlagZustand', () => {
  it('liest org-gefenced und auf die richtige Aktion gefiltert', async () => {
    const fake = erstelleFakeSupabase(db({ rechnungsversand: 'an', mahnversand: 'aus_fehlt', produktion: true }))
    const z = await letzterFlagZustand(fake.client, ORG)

    expect(z).toEqual({ rechnungsversand: 'an', mahnversand: 'aus_fehlt', produktion: true })

    const lesen = fake.ersterAuf('billing_audit_trail', 'select')
    expect(hatFilter(lesen, 'eq', 'organization_id', ORG)).toBe(true)
    expect(hatFilter(lesen, 'eq', 'action', VERSAND_FLAG_ACTION)).toBe(true)
    // Ohne die Sortierung läse man irgendeine, nicht die letzte Zeile.
    expect(hatFilter(lesen, 'order', 'created_at')).toBe(true)
  })

  it('liefert null, wenn es keinen Eintrag gibt', async () => {
    const fake = erstelleFakeSupabase(db(undefined))
    expect(await letzterFlagZustand(fake.client, ORG)).toBeNull()
  })

  // Fail-offen wäre hier richtig: „nicht lesbar" führt zu einem zusätzlichen
  // Eintrag. Ein doppelter Eintrag ist harmlos, ein fehlender wäre die Lücke.
  it('liefert null, wenn der Trail nicht lesbar ist', async () => {
    const fake = erstelleFakeSupabase(() => ({ error: { message: 'permission denied' } }))
    expect(await letzterFlagZustand(fake.client, ORG)).toBeNull()
  })

  it('liefert null bei einer beschädigten Zeile statt sie zu glauben', async () => {
    const fake = erstelleFakeSupabase(db({ irgendwas: 'anderes' }))
    expect(await letzterFlagZustand(fake.client, ORG)).toBeNull()
  })
})

describe('protokolliereVersandFlags', () => {
  it('schreibt beim ersten Mal', async () => {
    const fake = erstelleFakeSupabase(db(undefined))
    const e = await protokolliereVersandFlags(fake.client, {
      organizationId: ORG, actorId: ACTOR, quelle: PROD_AN,
    })

    expect(e.geaendert).toBe(true)
    expect(e.geschrieben).toBe(true)

    const zeile = fake.auf('billing_audit_trail').find(a => a.operation === 'insert')
    const payload = zeile?.payload as Record<string, unknown>
    expect(payload.organization_id).toBe(ORG)
    expect(payload.action).toBe(VERSAND_FLAG_ACTION)
    expect(payload.new_state).toEqual({
      rechnungsversand: 'an', mahnversand: 'aus_fehlt', produktion: true,
    })
  })

  it('schreibt NICHT, wenn sich nichts geändert hat', async () => {
    const fake = erstelleFakeSupabase(
      db({ rechnungsversand: 'an', mahnversand: 'aus_fehlt', produktion: true }),
    )
    const e = await protokolliereVersandFlags(fake.client, {
      organizationId: ORG, actorId: ACTOR, quelle: PROD_AN,
    })

    expect(e.geaendert).toBe(false)
    expect(e.geschrieben).toBe(false)
    expect(fake.auf('billing_audit_trail').some(a => a.operation === 'insert')).toBe(false)
  })

  it('schreibt beim Abschalten — mit dem vorherigen Zustand daneben', async () => {
    const fake = erstelleFakeSupabase(
      db({ rechnungsversand: 'an', mahnversand: 'aus_fehlt', produktion: true }),
    )
    const e = await protokolliereVersandFlags(fake.client, {
      organizationId: ORG, actorId: ACTOR, quelle: PROD_AUS,
    })

    expect(e.geschrieben).toBe(true)
    const payload = fake.auf('billing_audit_trail')
      .find(a => a.operation === 'insert')?.payload as Record<string, unknown>
    expect(payload.previous_state).toEqual({
      rechnungsversand: 'an', mahnversand: 'aus_fehlt', produktion: true,
    })
    expect((payload.new_state as Record<string, unknown>).rechnungsversand).toBe('aus_fehlt')
  })

  // Der Kern: diese Funktion steht VOR dem Versand. Wirft sie, geht eine
  // festgeschriebene Rechnung nicht raus — wegen eines Protokolleintrags.
  it('wirft nicht, wenn der Trail-Insert scheitert', async () => {
    const fake = erstelleFakeSupabase(db(undefined, 'insert denied'))
    const e = await protokolliereVersandFlags(fake.client, {
      organizationId: ORG, actorId: ACTOR, quelle: PROD_AN,
    })
    expect(e.geschrieben).toBe(false)
    expect(e.geaendert).toBe(true)
  })

  it('wirft nicht, wenn die Datenbank komplett wegbricht', async () => {
    const fake = erstelleFakeSupabase(() => { throw new Error('Verbindung weg') })
    await expect(
      protokolliereVersandFlags(fake.client, {
        organizationId: ORG, actorId: ACTOR, quelle: PROD_AN,
      }),
    ).resolves.toMatchObject({ geschrieben: false })
  })

  it('führt für jeden Mandanten eine eigene Spur', async () => {
    const gelesen: string[] = []
    const fake = erstelleFakeSupabase((aufruf) => {
      if (aufruf.operation === 'select') {
        const org = aufruf.filter.find(f => f.spalte === 'organization_id')?.wert as string
        gelesen.push(org)
        // Nur der zweite Mandant hat schon denselben Zustand festgehalten.
        return org === ANDERE_ORG
          ? { data: [{ new_state: { rechnungsversand: 'an', mahnversand: 'aus_fehlt', produktion: true } }] }
          : { data: [] }
      }
      return { data: null }
    })

    const a = await protokolliereVersandFlags(fake.client, {
      organizationId: ORG, actorId: ACTOR, quelle: PROD_AN,
    })
    const b = await protokolliereVersandFlags(fake.client, {
      organizationId: ANDERE_ORG, actorId: ACTOR, quelle: PROD_AN,
    })

    expect(gelesen).toEqual([ORG, ANDERE_ORG])
    expect(a.geschrieben).toBe(true)
    expect(b.geschrieben).toBe(false)
  })

  it('nimmt einen vorab gelesenen Stand entgegen, statt ihn neu zu lesen', async () => {
    const fake = erstelleFakeSupabase(db(undefined))
    const stand = versandFlagsStand(PROD_AN)
    const e = await protokolliereVersandFlags(fake.client, {
      organizationId: ORG, actorId: ACTOR, stand,
    })
    expect(e.jetzt.rechnungsversand).toBe('an')
  })

  it('legt den Rohwert eines ungültigen Schalters nicht in den Trail', async () => {
    const fake = erstelleFakeSupabase(db(undefined))
    await protokolliereVersandFlags(fake.client, {
      organizationId: ORG, actorId: ACTOR,
      quelle: { VERCEL_ENV: 'production', MAHNVERSAND_AUTOMATISCH: 'geheim-unsinn' },
    })
    const payload = fake.auf('billing_audit_trail')
      .find(a => a.operation === 'insert')?.payload as Record<string, unknown>
    expect(JSON.stringify(payload)).not.toContain('geheim-unsinn')
    expect((payload.new_state as Record<string, unknown>).mahnversand).toBe('aus_ungueltig')
  })
})
