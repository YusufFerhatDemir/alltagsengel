/**
 * Tour-Stop PATCH — Zeitsync auf assignments
 *
 * Die frueheren Pruefungen hier waren Quelltext-Greps ("enthaelt die Datei
 * diese Zeile?"). Sie sagten nichts darueber, ob der Sync tatsaechlich
 * stattfindet, und wurden von der Umstellung (erst Einsatz, dann Stop)
 * hinfaellig. Das Verhalten prueft jetzt __tests__/touren/stops-patch-route.test.ts
 * gegen den echten Route-Handler; hier bleibt nur, was sonst nirgends steht.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

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
