/**
 * P0-Security: MIS Team-Seite darf `role` NICHT im Profile-Update senden.
 * Rollenwechsel nur über /api/admin/manage-role (Superadmin-only).
 *
 * V6: Profile-Updates laufen über Server Action `updateProfile` (app/mis/team/actions.ts).
 * Die Server Action hat einen strikten TypeScript-Typ ohne `role`-Feld.
 * Der Client (page.tsx) übergibt `role` NICHT an die Server Action.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SEITE = join(process.cwd(), 'app', 'mis', 'team', 'page.tsx')
const ACTION = join(process.cwd(), 'app', 'mis', 'team', 'actions.ts')

describe('MIS Team-Seite: kein role im Profile-Update', () => {
  const seitenInhalt = readFileSync(SEITE, 'utf8')
  const actionInhalt = readFileSync(ACTION, 'utf8')

  it('handleEditUser übergibt role NICHT an die Server Action', () => {
    // Finde den handleEditUser-Block im Client-Code
    const handleBlock = seitenInhalt.slice(
      seitenInhalt.indexOf('async function handleEditUser'),
      seitenInhalt.indexOf('}', seitenInhalt.indexOf('catch', seitenInhalt.indexOf('handleEditUser'))) + 1
    )
    // role darf NICHT im updateProfile-Aufruf vorkommen
    expect(handleBlock).toContain('updateProfile')
    expect(handleBlock).not.toMatch(/updateProfile\([^)]*role/)
  })

  it('Server Action updateProfile akzeptiert kein role-Feld im Typ', () => {
    // Die Funktionssignatur darf role nicht enthalten
    const sigBlock = actionInhalt.slice(
      actionInhalt.indexOf('export async function updateProfile'),
      actionInhalt.indexOf(')', actionInhalt.indexOf('export async function updateProfile')) + 1
    )
    expect(sigBlock).not.toContain('role')
  })

  it('Server Action schreibt kein role ins .update()', () => {
    // Finde den .update()-Block in der Server Action
    const updateBlock = actionInhalt.slice(
      actionInhalt.indexOf('.update({', actionInhalt.indexOf('updateProfile')),
      actionInhalt.indexOf('})', actionInhalt.indexOf('.update({', actionInhalt.indexOf('updateProfile'))) + 2
    )
    expect(updateBlock).not.toContain('role')
  })

  it('Client-Seite hat KEINEN direkten supabase.update auf profiles', () => {
    // Nach Migration auf Server Actions darf kein direkter .update() auf profiles im Client sein
    const clientUpdateLine = seitenInhalt
      .split('\n')
      .find(z => z.includes('.update(') && z.includes("'profiles'"))
    expect(clientUpdateLine).toBeUndefined()
  })
})
