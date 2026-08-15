import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

describe('Arbeitszeiten-Route: Dual-Auth (Admin + Engel)', () => {
  const code = fs.readFileSync(
    path.resolve('app/api/personal/arbeitszeiten/route.ts'),
    'utf-8'
  )

  it('importiert requirePersonalUser', () => {
    expect(code).toContain('requirePersonalUser')
  })

  it('erlaubt Engel-Zugang via requirePersonalUser-Fallback', () => {
    expect(code).toContain('const user = await requirePersonalUser()')
    expect(code).toContain('user.caregiverId')
  })

  it('erzwingt caregiverId bei Engel-POST (kein Mandanten-Override)', () => {
    expect(code).toContain('caregiverId: user.caregiverId')
  })

  it('gibt 403 wenn kein Mitarbeiterprofil', () => {
    expect(code).toContain('Kein Mitarbeiterprofil vorhanden.')
  })
})
