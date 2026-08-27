/**
 * Verfügbarkeits- und Vertretungsprüfung — Fail-Closed und Statuswerte
 *
 * Drei Befunde dieser Runde:
 *
 *  1. `pruefeCaregiverVerfuegbarkeit()` verschluckte den Lesefehler der
 *     `absences`-Abfrage (`const { data } = await …`). Eine leere Liste
 *     bedeutete "nicht abwesend" — ein Datenbankfehler hob damit still die
 *     einzige Sperre auf, die einen Einsatz im genehmigten Urlaub
 *     verhindert.
 *
 *  2. Gefiltert wurde gegen `'ABGELEHNT'` und `'rejected'`. Der
 *     CHECK-Constraint `absences_status_check` (20260811010000) kennt aber
 *     nur KLEINGESCHRIEBENE Werte: 'beantragt', 'genehmigt', 'abgelehnt',
 *     'storniert'. Jede abgelehnte und jede zurückgezogene Abwesenheit galt
 *     deshalb weiter als Abwesenheit — der Mitarbeiter liess sich für den
 *     Tag nicht mehr einplanen.
 *
 *  3. Das Datum wanderte unmaskiert in einen PostgREST-`or()`-Ausdruck.
 *
 * Zusätzlich: `findeVertretungsKandidaten()` las `absences` und
 * `client_preferred_substitutes` ohne jeden Mandantenbezug — mit dem
 * service-role-Client, an dem RLS nicht greift.
 */

import { describe, it, expect } from 'vitest'
import {
  abwesenheitBlockiert,
  findeVertretungsKandidaten,
  pruefeCaregiverVerfuegbarkeit,
  BLOCKIERENDE_ABWESENHEITS_STATUS,
} from '@/lib/touren/server'
import { erstelleFakeSupabase, hatFilter } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-00000000a001'
const CG_A = '00000000-0000-4000-8000-0000000000c1'
const CG_B = '00000000-0000-4000-8000-0000000000c2'
const TAG = '2026-09-10'

describe('abwesenheitBlockiert — Wertesatz des CHECK-Constraints', () => {
  it('blockiert genehmigte Abwesenheit', () => expect(abwesenheitBlockiert('genehmigt')).toBe(true))
  it('blockiert beantragte Abwesenheit', () => expect(abwesenheitBlockiert('beantragt')).toBe(true))
  it('blockiert Altbestand ohne Status (NULL)', () => expect(abwesenheitBlockiert(null)).toBe(true))
  it('blockiert Altbestand mit leerem Status', () => expect(abwesenheitBlockiert('  ')).toBe(true))
  it('blockiert NICHT bei abgelehnt', () => expect(abwesenheitBlockiert('abgelehnt')).toBe(false))
  it('blockiert NICHT bei storniert', () => expect(abwesenheitBlockiert('storniert')).toBe(false))
  it('ist gegen Grossschreibung robust', () => expect(abwesenheitBlockiert('Genehmigt')).toBe(true))
  it('kennt genau die Werte des DB-Triggers', () => {
    expect([...BLOCKIERENDE_ABWESENHEITS_STATUS]).toEqual(['beantragt', 'genehmigt'])
  })
})

describe('pruefeCaregiverVerfuegbarkeit', () => {
  it('meldet eine genehmigte Abwesenheit', async () => {
    const fake = erstelleFakeSupabase(a =>
      a.tabelle === 'absences'
        ? { data: [{ absence_type: 'vacation', status: 'genehmigt', start_date: TAG, end_date: TAG }] }
        : { data: null },
    )
    const befund = await pruefeCaregiverVerfuegbarkeit(fake.client, CG_A, TAG, null, null)
    expect(befund.abwesend).toBe(true)
    expect(befund.abwesenheitsGrund).toBe('vacation')
  })

  it('meldet KEINE Abwesenheit, wenn der Antrag abgelehnt wurde', async () => {
    const fake = erstelleFakeSupabase(a =>
      a.tabelle === 'absences'
        ? { data: [{ absence_type: 'vacation', status: 'abgelehnt', start_date: TAG, end_date: TAG }] }
        : { data: null },
    )
    const befund = await pruefeCaregiverVerfuegbarkeit(fake.client, CG_A, TAG, null, null)
    expect(befund.abwesend).toBe(false)
  })

  it('meldet KEINE Abwesenheit, wenn der Antrag storniert wurde', async () => {
    const fake = erstelleFakeSupabase(a =>
      a.tabelle === 'absences'
        ? { data: [{ absence_type: 'sick', status: 'storniert', start_date: TAG, end_date: TAG }] }
        : { data: null },
    )
    expect((await pruefeCaregiverVerfuegbarkeit(fake.client, CG_A, TAG, null, null)).abwesend).toBe(false)
  })

  it('wirft, wenn die Abwesenheitsliste nicht lesbar ist (fail-closed)', async () => {
    const fake = erstelleFakeSupabase(a =>
      a.tabelle === 'absences' ? { error: { message: 'connection reset' } } : { data: null },
    )
    await expect(pruefeCaregiverVerfuegbarkeit(fake.client, CG_A, TAG, null, null))
      .rejects.toThrow(/nicht geprüft werden/)
  })

  it('wirft bei einem Datum, das kein Datum ist — bevor es in den Filter geht', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    await expect(pruefeCaregiverVerfuegbarkeit(fake.client, CG_A, '10.09.2026', null, null))
      .rejects.toThrow(/YYYY-MM-DD/)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('lässt keinen Filterausdruck aus dem Datum entstehen', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    await expect(
      pruefeCaregiverVerfuegbarkeit(fake.client, CG_A, `${TAG},status.eq.abgelehnt`, null, null),
    ).rejects.toThrow()
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('filtert auf den angefragten Mitarbeiter', async () => {
    const fake = erstelleFakeSupabase(a => (a.tabelle === 'absences' ? { data: [] } : { data: null }))
    await pruefeCaregiverVerfuegbarkeit(fake.client, CG_A, TAG, null, null)
    expect(hatFilter(fake.ersterAuf('absences'), 'eq', 'caregiver_id', CG_A)).toBe(true)
  })

  it('wertet die Zeitfenster auch bei einstelliger Stundenangabe aus', async () => {
    // Frueher per slice(0,2)/slice(3,5) zerlegt: '9:00' ergab NaN und die
    // Fensterpruefung fiel still aus.
    const fake = erstelleFakeSupabase(a => {
      if (a.tabelle === 'absences') return { data: [] }
      if (a.tabelle === 'caregivers') return { data: { user_id: '00000000-0000-4000-8000-0000000000u1' } }
      if (a.tabelle === 'angel_availability') return { data: [{ weekday: 4, start_time: '08:00', end_time: '12:00' }] }
      return { data: null }
    })
    const befund = await pruefeCaregiverVerfuegbarkeit(fake.client, CG_A, TAG, '9:00', '11:00')
    // 2026-09-10 ist ein Donnerstag (ISO 4); 09:00–11:00 liegt IM Fenster.
    expect(befund.ausserhalbZeitfenster).toBe(false)
    expect(fake.auf('angel_availability')).toHaveLength(1)
  })

  it('meldet einen Termin ausserhalb der gepflegten Zeitfenster', async () => {
    const fake = erstelleFakeSupabase(a => {
      if (a.tabelle === 'absences') return { data: [] }
      if (a.tabelle === 'caregivers') return { data: { user_id: '00000000-0000-4000-8000-0000000000u1' } }
      if (a.tabelle === 'angel_availability') return { data: [{ weekday: 4, start_time: '08:00', end_time: '12:00' }] }
      return { data: null }
    })
    const befund = await pruefeCaregiverVerfuegbarkeit(fake.client, CG_A, TAG, '18:00', '20:00')
    expect(befund.ausserhalbZeitfenster).toBe(true)
  })
})

describe('findeVertretungsKandidaten', () => {
  function fakeMit(abwesenheiten: unknown[], fehler?: { message: string }) {
    return erstelleFakeSupabase(a => {
      if (a.tabelle === 'caregivers') {
        return {
          data: [
            { id: CG_B, first_name: 'Bea', last_name: 'B', status: 'active', einsatzfreigabe: true, has_vehicle: true },
          ],
        }
      }
      if (a.tabelle === 'client_preferred_substitutes') return { data: [] }
      if (a.tabelle === 'absences') return fehler ? { error: fehler } : { data: abwesenheiten }
      return { data: null }
    })
  }

  it('schränkt die Abwesenheitsabfrage auf die eigenen Mitarbeiter ein', async () => {
    const fake = fakeMit([])
    await findeVertretungsKandidaten(fake.client, {
      organizationId: ORG, tourDate: TAG, ausgeschlossenCaregiverId: CG_A, clientIds: [],
    })
    expect(hatFilter(fake.ersterAuf('absences'), 'in', 'caregiver_id', [CG_B])).toBe(true)
  })

  it('setzt den Mandanten-Fence auf die bevorzugten Vertretungen', async () => {
    const fake = erstelleFakeSupabase(a => {
      if (a.tabelle === 'caregivers') {
        return { data: [{ id: CG_B, first_name: 'Bea', last_name: 'B', status: 'active', einsatzfreigabe: true, has_vehicle: false }] }
      }
      if (a.tabelle === 'client_preferred_substitutes') return { data: [{ caregiver_id: CG_B, priority: 1 }] }
      if (a.tabelle === 'absences') return { data: [] }
      return { data: null }
    })
    await findeVertretungsKandidaten(fake.client, {
      organizationId: ORG, tourDate: TAG, ausgeschlossenCaregiverId: CG_A,
      clientIds: ['00000000-0000-4000-8000-0000000000d1'],
    })
    expect(hatFilter(fake.ersterAuf('client_preferred_substitutes'), 'eq', 'organization_id', ORG)).toBe(true)
  })

  it('markiert eine genehmigte Abwesenheit', async () => {
    const fake = fakeMit([{ caregiver_id: CG_B, status: 'genehmigt' }])
    const kandidaten = await findeVertretungsKandidaten(fake.client, {
      organizationId: ORG, tourDate: TAG, ausgeschlossenCaregiverId: CG_A, clientIds: [],
    })
    expect(kandidaten[0].abwesend).toBe(true)
  })

  it('markiert eine ABGELEHNTE Abwesenheit NICHT als abwesend', async () => {
    const fake = fakeMit([{ caregiver_id: CG_B, status: 'abgelehnt' }])
    const kandidaten = await findeVertretungsKandidaten(fake.client, {
      organizationId: ORG, tourDate: TAG, ausgeschlossenCaregiverId: CG_A, clientIds: [],
    })
    expect(kandidaten[0].abwesend).toBe(false)
  })

  it('wirft, wenn die Abwesenheiten nicht lesbar sind (fail-closed)', async () => {
    const fake = fakeMit([], { message: 'timeout' })
    await expect(findeVertretungsKandidaten(fake.client, {
      organizationId: ORG, tourDate: TAG, ausgeschlossenCaregiverId: CG_A, clientIds: [],
    })).rejects.toThrow(/nicht lesbar/)
  })

  it('wirft bei einem Datum, das kein Datum ist', async () => {
    const fake = fakeMit([])
    await expect(findeVertretungsKandidaten(fake.client, {
      organizationId: ORG, tourDate: 'gestern', ausgeschlossenCaregiverId: CG_A, clientIds: [],
    })).rejects.toThrow(/YYYY-MM-DD/)
  })

  it('gibt eine leere Liste zurück, wenn es keine Mitarbeiter gibt', async () => {
    const fake = erstelleFakeSupabase(a => (a.tabelle === 'caregivers' ? { data: [] } : { data: null }))
    expect(await findeVertretungsKandidaten(fake.client, {
      organizationId: ORG, tourDate: TAG, ausgeschlossenCaregiverId: CG_A, clientIds: [],
    })).toEqual([])
  })
})
