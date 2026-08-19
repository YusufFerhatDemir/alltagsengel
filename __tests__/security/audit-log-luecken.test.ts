// ═══════════════════════════════════════════════════════════════════════
// Master-Final-Release-Audit 2026-08-19, Befund A-3 / I-3
//
// An 141 Stellen stand `logAuditEvent({...}).catch(() => {})`:
//   * nicht await-et → in einer Serverless-Funktion kann der Insert
//     abgeschnitten werden, bevor er die DB erreicht
//   * leerer catch → ein Fehlschlag hinterliess keinerlei Spur, obwohl
//     genau die Spur der Zweck ist (§ 630f BGB / Art. 30 DSGVO)
//
// Geprueft wird beides: das neue zentrale Muster (Verhalten) UND dass
// das alte Muster im Repo nicht wieder auftaucht (Regression).
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

let insertFehler: { code?: string; message: string } | null = null
let inserts: any[] = []
let werfeBeimClientAufbau = false

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (werfeBeimClientAufbau) throw new Error('SUPABASE_SERVICE_ROLE_KEY fehlt')
    return {
      from: () => ({
        insert: async (row: any) => {
          inserts.push(row)
          return { error: insertFehler }
        },
      }),
    }
  },
}))

import { logAuditEvent, logAuditEventOrWarn, logAuditEventOrThrow } from '@/lib/audit-log'

const EINGABE = {
  action: 'create' as const,
  actorId: '00000000-0000-4000-8000-000000000001',
  entityType: 'verordnung',
  entityId: '00000000-0000-4000-8000-000000000002',
}

beforeEach(() => {
  insertFehler = null
  inserts = []
  werfeBeimClientAufbau = false
  vi.restoreAllMocks()
})

describe('logAuditEventOrWarn', () => {
  it('schreibt den Eintrag und meldet Erfolg', async () => {
    const ok = await logAuditEventOrWarn(EINGABE)
    expect(ok).toBe(true)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].action).toBe('create')
    expect(inserts[0].actor_id).toBe(EINGABE.actorId)
  })

  it('meldet den Fehlschlag auf console.error statt ihn zu verschlucken', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    insertFehler = { code: '42501', message: 'permission denied' }

    const ok = await logAuditEventOrWarn(EINGABE)

    expect(ok).toBe(false)
    // Genau das war der Befund: der Fehlschlag muss sichtbar werden.
    const meldungen = spy.mock.calls.map(c => String(c[0]))
    expect(meldungen.some(m => m.includes('AUDIT-LUECKE'))).toBe(true)
  })

  it('nennt in der Meldung Aktion und Entity, damit die Luecke zuordenbar ist', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    insertFehler = { message: 'boom' }

    await logAuditEventOrWarn(EINGABE)

    const luecke = spy.mock.calls.find(c => String(c[0]).includes('AUDIT-LUECKE'))
    expect(luecke).toBeDefined()
    expect(luecke![1]).toMatchObject({
      action: 'create',
      entityType: 'verordnung',
      entityId: EINGABE.entityId,
      actorId: EINGABE.actorId,
    })
  })

  it('blockiert die Hauptaktion nicht — wirft nie', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    werfeBeimClientAufbau = true
    await expect(logAuditEventOrWarn(EINGABE)).resolves.toBe(false)
  })
})

describe('logAuditEventOrThrow', () => {
  it('laeuft still durch, wenn der Eintrag sitzt', async () => {
    await expect(logAuditEventOrThrow(EINGABE)).resolves.toBeUndefined()
    expect(inserts).toHaveLength(1)
  })

  it('wirft, wenn der Eintrag nicht geschrieben werden konnte', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    insertFehler = { message: 'permission denied' }
    await expect(logAuditEventOrThrow(EINGABE)).rejects.toThrow(/Audit-Eintrag/)
  })
})

describe('logAuditEvent (Basis) bleibt fail-soft', () => {
  it('gibt false zurueck statt zu werfen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    insertFehler = { message: 'boom' }
    await expect(logAuditEvent(EINGABE)).resolves.toBe(false)
  })
})

// ── Regressionsschutz: das alte Muster darf nicht zurueckkommen ──────

const WURZEL = path.join(__dirname, '..', '..')

function tsDateien(verzeichnis: string, treffer: string[] = []): string[] {
  for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
    if (eintrag.name.startsWith('.') || eintrag.name === 'node_modules') continue
    const voll = path.join(verzeichnis, eintrag.name)
    if (eintrag.isDirectory()) tsDateien(voll, treffer)
    else if (/\.tsx?$/.test(eintrag.name)) treffer.push(voll)
  }
  return treffer
}

describe('Regression A-3: keine verschluckten Audit-Fehler mehr', () => {
  const dateien = [
    ...tsDateien(path.join(WURZEL, 'app')),
    ...tsDateien(path.join(WURZEL, 'lib')),
  ]

  it('findet in app/ und lib/ keinen leeren catch auf logAuditEvent', () => {
    // Verschachtelte Klammern im Objekt-Literal (details: { … }) auf einer
    // Rekursion, sonst greift der Ausdruck zu kurz.
    const muster = /logAuditEvent\((\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})\)\s*\.\s*catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/g
    const funde: string[] = []
    for (const datei of dateien) {
      const inhalt = fs.readFileSync(datei, 'utf-8')
      if (muster.test(inhalt)) funde.push(path.relative(WURZEL, datei))
      muster.lastIndex = 0
    }
    expect(funde).toEqual([])
  })

  it('await-et jeden logAuditEvent*-Aufruf', () => {
    const funde: string[] = []
    for (const datei of dateien) {
      if (datei.endsWith(path.join('lib', 'audit-log.ts'))) continue
      const inhalt = fs.readFileSync(datei, 'utf-8')
      for (const zeile of inhalt.split('\n')) {
        // Aufrufe, Import-Zeilen und Kommentare auseinanderhalten
        const t = zeile.trim()
        if (t.startsWith('*') || t.startsWith('//') || t.startsWith('import')) continue
        if (/(?<!await\s)\blogAuditEvent(OrWarn|OrThrow)?\(/.test(zeile) && !/await\s+logAuditEvent/.test(zeile)) {
          funde.push(`${path.relative(WURZEL, datei)}: ${t}`)
        }
      }
    }
    expect(funde).toEqual([])
  })
})
