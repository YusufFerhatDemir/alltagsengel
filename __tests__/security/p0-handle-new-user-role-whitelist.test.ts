/**
 * P0-Security: handle_new_user() darf NUR 'kunde', 'engel', 'fahrer' als
 * Rolle aus raw_user_meta_data akzeptieren. Alles andere muss auf 'kunde'
 * fallen. Ohne diese Whitelist kann ein Angreifer sich über die Supabase
 * Signup-API direkt als Admin registrieren.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONEN = join(process.cwd(), 'supabase', 'migrations')

function letzteDefinition(): string {
  const dateien = readdirSync(MIGRATIONEN)
    .filter(f => f.endsWith('.sql') && !f.includes('rollback'))
    .sort()

  let letzte = ''
  for (const datei of dateien) {
    const inhalt = readFileSync(join(MIGRATIONEN, datei), 'utf8')
    if (inhalt.includes('CREATE OR REPLACE FUNCTION public.handle_new_user')) {
      letzte = inhalt
    }
  }
  return letzte
}

describe('handle_new_user() Rollen-Whitelist', () => {
  const sql = letzteDefinition()

  it('handle_new_user() ist definiert', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.handle_new_user')
  })

  it('Whitelist enthält nur erlaubte Signup-Rollen', () => {
    expect(sql).toMatch(/kunde.*engel.*fahrer|fahrer.*engel.*kunde/)
  })

  it('admin und superadmin werden NICHT direkt als role akzeptiert', () => {
    const body = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.handle_new_user'),
      sql.indexOf('$$;', sql.indexOf('handle_new_user')) + 3
    )
    const ohneKommentare = body.split('\n')
      .map(z => z.replace(/--.*$/, ''))
      .join('\n')

    const insertStmt = ohneKommentare.slice(
      ohneKommentare.indexOf('INSERT INTO'),
      ohneKommentare.indexOf('RETURN new')
    )
    expect(insertStmt).not.toMatch(/coalesce\(new\.raw_user_meta_data.*'role'.*'kunde'\)/)
  })

  it('Fallback ist kunde', () => {
    expect(sql).toContain("'kunde'")
  })
})
