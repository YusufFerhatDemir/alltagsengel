// ═══════════════════════════════════════════════════════════════
// Supabase-Client-Attrappe fuer lib/automation-Tests
// ═══════════════════════════════════════════════════════════════
// Anders als __tests__/ops/_supabase-mock.ts unterscheidet diese Attrappe
// pro TABELLE und pro OPERATION (select/insert/...), weil die
// Automatisierungsketten mehrere Tabellen in einem Aufruf abfragen (z. B.
// Dublettenprüfung auf ops_aufgaben, dann Insert auf ops_aufgaben, dann
// eine dritte Tabelle für den Empfänger).
// ═══════════════════════════════════════════════════════════════

import { vi } from 'vitest'

type Resolver = () => { data: any; error: any } | Promise<{ data: any; error: any }>

export function createAutomationMock() {
  const antworten = new Map<string, Resolver[]>()
  const inserts: { table: string; payload: any }[] = []
  const aufrufe: { table: string; op: string }[] = []

  function schlüssel(table: string, op: string) {
    return `${table}:${op}`
  }

  /**
   * Antwort für `supabase.from(table).<op>(...)` festlegen (op: 'select' | 'insert').
   * Mehrfacher Aufruf für denselben Schlüssel queued die Antworten — die
   * n-te Abfrage auf dieselbe (Tabelle, Operation) bekommt die n-te Antwort,
   * die letzte gesetzte wird danach wiederholt.
   */
  function setzeAntwort(table: string, op: 'select' | 'insert', data: any, error: any = null) {
    const key = schlüssel(table, op)
    const liste = antworten.get(key) ?? []
    liste.push(() => ({ data, error }))
    antworten.set(key, liste)
  }

  function chain(table: string, op: string): any {
    aufrufe.push({ table, op })
    const liste = antworten.get(schlüssel(table, op))
    const resolver = liste ? (liste.length > 1 ? liste.shift()! : liste[0]) : () => ({ data: null, error: null })
    const self: any = {
      select: vi.fn(() => self),
      eq: vi.fn(() => self),
      neq: vi.fn(() => self),
      in: vi.fn(() => self),
      not: vi.fn(() => self),
      or: vi.fn(() => self),
      is: vi.fn(() => self),
      ilike: vi.fn(() => self),
      order: vi.fn(() => self),
      limit: vi.fn(() => self),
      gte: vi.fn(() => self),
      lte: vi.fn(() => self),
      lt: vi.fn(() => self),
      maybeSingle: vi.fn(async () => resolver()),
      single: vi.fn(async () => resolver()),
      then: (resolve: any) => Promise.resolve(resolver()).then(resolve),
    }
    return self
  }

  const client = {
    from: vi.fn((table: string) => ({
      select: vi.fn((..._args: any[]) => chain(table, 'select')),
      insert: vi.fn((payload: any) => {
        inserts.push({ table, payload })
        return chain(table, 'insert')
      }),
      update: vi.fn((..._args: any[]) => chain(table, 'update')),
    })),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  }

  return { client, setzeAntwort, inserts, aufrufe }
}
