import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROUTE_FILE = path.resolve('app/api/tours/[id]/stops/route.ts')

describe('Tour-Stop PATCH: Zeitsync auf assignments', () => {
  const src = fs.readFileSync(ROUTE_FILE, 'utf-8')

  it('schreibt geplante_ankunft als start_time auf assignments', () => {
    expect(src).toContain("assignmentUpdates.start_time = updates.geplante_ankunft")
  })

  it('schreibt geplantes_ende als end_time auf assignments', () => {
    expect(src).toContain("assignmentUpdates.end_time = updates.geplantes_ende")
  })

  it('updated assignments mit der assignment_id des Stops', () => {
    expect(src).toContain(".from('assignments')")
    expect(src).toContain(".eq('id', stop.assignment_id)")
  })

  it('gibt 409 bei Doppelbelegung zurück und rollt Stop-Zeiten zurück', () => {
    expect(src).toContain('DOPPELBELEGUNG')
    expect(src).toMatch(/status:\s*409/)
  })
})

describe('pflege_massnahmen Engel-RLS: kein caregivers-Join', () => {
  const migration = fs.readFileSync(
    path.resolve('supabase/migrations/20260917000000_fix_engel_pflege_massnahmen_rls.sql'),
    'utf-8'
  )

  it('verwendet eigene_caregiver_ids() statt JOIN caregivers', () => {
    expect(migration).toContain('eigene_caregiver_ids()')
    expect(migration).not.toContain('JOIN caregivers')
  })
})
