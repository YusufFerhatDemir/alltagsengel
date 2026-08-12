/**
 * P0-Security: MIS Team-Seite darf `role` NICHT im Client-Side-Update
 * an profiles senden. Rollenwechsel nur über /api/admin/manage-role
 * (Superadmin-only).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SEITE = join(process.cwd(), 'app', 'mis', 'team', 'page.tsx')

describe('MIS Team-Seite: kein role im Profile-Update', () => {
  const inhalt = readFileSync(SEITE, 'utf8')

  it('handleEditUser strippt role aus dem Update-Objekt', () => {
    expect(inhalt).toMatch(/role:\s*_role.*\.\.\.safeFields|destructur.*role/)
  })

  it('supabase.from(profiles).update() verwendet NICHT editForm direkt', () => {
    const updateZeile = inhalt
      .split('\n')
      .find(z => z.includes('.update(') && z.includes("'profiles'"))
    expect(updateZeile).toBeDefined()
    expect(updateZeile).not.toContain('.update(editForm)')
  })
})
