// ═══════════════════════════════════════════════════════════════════════
// Empfänger der Automatisierungsketten (Befund 28.08.2026)
// ═══════════════════════════════════════════════════════════════════════
//
// Saemtliche Ketten in lib/automation riefen `['admin','superadmin']` —
// die Rolle `pdl` war NIRGENDS Empfängerin, obwohl die Variablen `pdlId`
// bzw. `pdlIds` heissen, die Kommentare „an PDL/Admin" sagen und eine
// ganze Kette `vitalwerte-pdl.ts` heisst. In einer Organisation mit
// Pflegedienstleitung, aber ohne im Tagesbetrieb taetige Administration
// gingen Fristablauf, fehlender Nachweis, Budgetgrenze und kritischer
// Vitalwert damit ins Leere.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  rollentraegerDerOrg,
  ersterPdlDerOrg,
  BETRIEBS_EMPFAENGER_ROLLEN,
} from '@/lib/automation/org-empfaenger'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = 'org-1'

/** Mitglieder der Org und ihre Rollen; profiles filtert wie live per .in('role', …). */
function mitRollen(zuordnung: Record<string, string>) {
  return (a: FakeAufruf) => {
    if (a.tabelle === 'organization_members') {
      return { data: Object.keys(zuordnung).map(user_id => ({ user_id })) }
    }
    if (a.tabelle === 'profiles') {
      const gesucht = (a.filter.find(f => f.methode === 'in' && f.spalte === 'role')?.wert ?? []) as string[]
      return {
        data: Object.entries(zuordnung)
          .filter(([, rolle]) => gesucht.includes(rolle))
          .map(([id]) => ({ id })),
      }
    }
    return {}
  }
}

describe('Betriebs-Empfänger schliessen die Pflegedienstleitung ein', () => {
  it('führt admin, superadmin UND pdl', () => {
    expect([...BETRIEBS_EMPFAENGER_ROLLEN].sort()).toEqual(['admin', 'pdl', 'superadmin'])
  })

  it('führt qm NICHT — das Qualitätsmanagement prüft, es disponiert nicht', () => {
    expect([...BETRIEBS_EMPFAENGER_ROLLEN]).not.toContain('qm')
  })

  it('liefert die PDL als Empfängerin', async () => {
    const fake = erstelleFakeSupabase(mitRollen({ 'u-pdl': 'pdl', 'u-admin': 'admin' }))
    const ids = await rollentraegerDerOrg(fake.client, ORG, [...BETRIEBS_EMPFAENGER_ROLLEN])
    // Am alten Stand: nur 'u-admin'.
    expect(ids.sort()).toEqual(['u-admin', 'u-pdl'])
  })

  it('fragt profiles ausdrücklich auf die drei Rollen ein und lässt gelöschte aus', async () => {
    const fake = erstelleFakeSupabase(mitRollen({ 'u-pdl': 'pdl' }))
    await rollentraegerDerOrg(fake.client, ORG, [...BETRIEBS_EMPFAENGER_ROLLEN])
    const profil = fake.ersterAuf('profiles')
    expect(hatFilter(profil, 'in', 'role', ['admin', 'superadmin', 'pdl'])).toBe(true)
    expect(hatFilter(profil, 'is', 'deleted_at', null)).toBe(true)
  })

  it('grenzt die Mitgliederabfrage auf die Organisation ein', async () => {
    const fake = erstelleFakeSupabase(mitRollen({ 'u-pdl': 'pdl' }))
    await rollentraegerDerOrg(fake.client, ORG, [...BETRIEBS_EMPFAENGER_ROLLEN])
    expect(hatFilter(fake.ersterAuf('organization_members'), 'eq', 'organization_id', ORG)).toBe(true)
  })
})

describe('Verantwortlicher automatisch erzeugter Aufgaben', () => {
  it('ist die PDL, wenn es eine gibt', async () => {
    const fake = erstelleFakeSupabase(mitRollen({ 'u-admin': 'admin', 'u-pdl': 'pdl' }))
    // Am alten Stand landete JEDE automatisch erzeugte Aufgabe bei der
    // Administration, auch wo eine PDL vorhanden war.
    expect(await ersterPdlDerOrg(fake.client, ORG)).toBe('u-pdl')
  })

  it('fällt auf die Administration zurück, wenn keine PDL eingerichtet ist', async () => {
    const fake = erstelleFakeSupabase(mitRollen({ 'u-admin': 'admin' }))
    expect(await ersterPdlDerOrg(fake.client, ORG)).toBe('u-admin')
  })

  it('gibt null zurück, wenn die Organisation weder PDL noch Administration hat', async () => {
    const fake = erstelleFakeSupabase(mitRollen({ 'u-engel': 'engel' }))
    expect(await ersterPdlDerOrg(fake.client, ORG)).toBeNull()
  })

  it('fragt gar nicht erst nach der Administration, wenn eine PDL gefunden wurde', async () => {
    const fake = erstelleFakeSupabase(mitRollen({ 'u-pdl': 'pdl' }))
    await ersterPdlDerOrg(fake.client, ORG)
    expect(fake.auf('profiles')).toHaveLength(1)
  })
})

describe('Fail-closed bei Lesefehlern', () => {
  it('gibt bei einem Fehler auf organization_members eine leere Liste zurück', async () => {
    const fake = erstelleFakeSupabase(a =>
      a.tabelle === 'organization_members' ? { error: { message: 'connection reset' } } : {})
    expect(await rollentraegerDerOrg(fake.client, ORG, [...BETRIEBS_EMPFAENGER_ROLLEN])).toEqual([])
  })

  it('gibt bei einem Fehler auf profiles eine leere Liste zurück', async () => {
    const fake = erstelleFakeSupabase(a => {
      if (a.tabelle === 'organization_members') return { data: [{ user_id: 'u1' }] }
      return { error: { message: 'permission denied' } }
    })
    expect(await rollentraegerDerOrg(fake.client, ORG, [...BETRIEBS_EMPFAENGER_ROLLEN])).toEqual([])
  })
})
