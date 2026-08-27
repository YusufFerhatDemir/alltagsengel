/**
 * Leistungserfassung — was bei alten Check-Constraints passieren darf
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `lib/admin/service-records.ts` ist der gemeinsame Einstieg fuer jeden
 * neu erfassten Leistungsnachweis: das Admin-Formular, die Tourenplanung
 * und die Team-Erfassung schreiben alle hierueber. Das Modul hatte keinen
 * Test.
 *
 * Es existiert, weil die Live-Datenbank noch die alten CHECK-Constraints
 * traegt (service_records_status_check, service_records_budget_type_check)
 * und Werte ablehnt, die die Anwendung laengst kennt. Statt den erfassten
 * Einsatz zu verwerfen, versucht das Modul einen zweiten Weg.
 *
 * ── BEFUND SR-1 ────────────────────────────────────────────────────────
 * Der dritte Versuch stellte zusaetzlich `budget_type` auf 'entlastung'
 * zurueck. Das ist keine Abwertung, das ist eine Umbuchung: eine Leistung
 * auf Verhinderungspflege (§ 39) oder auf Privatzahlung verbrauchte dann
 * den Entlastungsbetrag nach § 45b. Der Datensatz sah vollstaendig aus,
 * die Abrechnung lief durch — nur aus dem falschen Topf des Kunden.
 *
 * Zwei von drei Aufrufern werteten `degraded` ausserdem gar nicht aus, und
 * der dritte meldete nur die Statusabwertung. Die Umbuchung war also
 * nirgends sichtbar.
 *
 * Der Status bleibt abwertbar: 'draft' ist sichtbar unfertig und nicht
 * abrechenbar — die erfasste Arbeit wartet, statt still falsch zu buchen.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { saveServiceRecord } from '@/lib/admin/service-records'

const KLIENT = '00000000-0000-4000-8000-00000000f001'
const ENGEL = '00000000-0000-4000-8000-00000000f002'

const EINGABE = {
  client_id: KLIENT,
  caregiver_id: ENGEL,
  date: '2026-08-20',
  start_time: '09:00',
  end_time: '11:00',
  service_type: 'Alltagsbegleitung',
  budget_type: 'verhinderung',
  caregiver_initials: 'M.S.',
  status: 'signed',
}

/**
 * Attrappe der Live-Datenbank mit den ALTEN Constraints.
 * `erlaubteStatus`/`erlaubteTopfe` bilden nach, was der Constraint zulaesst.
 */
function alteDatenbank(opts: {
  erlaubteStatus: string[]
  erlaubteTopfe: string[]
}) {
  const versuche: Array<{ status: string; budget_type: string }> = []
  const client = {
    from(tabelle: string) {
      if (tabelle !== 'service_records') throw new Error(`Unerwartete Tabelle: ${tabelle}`)
      return {
        insert: (werte: Record<string, unknown>) => {
          const status = String(werte.status)
          const topf = String(werte.budget_type)
          versuche.push({ status, budget_type: topf })
          const statusOk = opts.erlaubteStatus.includes(status)
          const topfOk = opts.erlaubteTopfe.includes(topf)
          return {
            select: () => ({
              single: async () => {
                if (statusOk && topfOk) {
                  return { data: { id: 'neue-id' }, error: null }
                }
                const spalte = !topfOk ? 'budget_type' : 'status'
                return {
                  data: null,
                  error: {
                    code: '23514',
                    message: `new row violates check constraint "service_records_${spalte}_check"`,
                  },
                }
              },
            }),
          }
        },
      }
    },
  }
  return { client: client as never, versuche }
}

/** Datenbank mit angewendeter Migration — alles erlaubt. */
const NEU = {
  erlaubteStatus: ['draft', 'incomplete', 'complete', 'signed', 'invoiced', 'billed', 'paid', 'disputed'],
  erlaubteTopfe: ['entlastung', 'verhinderung', 'carryover', 'private'],
}

/** Live-Stand vor der Migration. */
const ALT = {
  erlaubteStatus: ['draft', 'billed', 'paid', 'disputed'],
  erlaubteTopfe: ['entlastung'],
}

// ═══════════════════════════════════════════════════════════════════
describe('Normalfall (Migration angewendet)', () => {
  it('speichert Status und Budget-Topf unveraendert', async () => {
    const { client, versuche } = alteDatenbank(NEU)
    const r = await saveServiceRecord(client, EINGABE)

    expect(r.id).toBe('neue-id')
    expect(r.error).toBeNull()
    expect(r.degraded).toBe(false)
    // Genau EIN Versuch — kein Rückfall angefasst.
    expect(versuche).toEqual([{ status: 'signed', budget_type: 'verhinderung' }])
  })

  it('schickt duration_minutes nicht mit', async () => {
    // Die Spalte ist in der DB GENERATED. Ein mitgeschickter Wert laesst
    // Postgres den ganzen Insert ablehnen.
    let geschrieben: Record<string, unknown> = {}
    const client = {
      from: () => ({
        insert: (w: Record<string, unknown>) => {
          geschrieben = w
          return { select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) }
        },
      }),
    }
    await saveServiceRecord(client as never, EINGABE)
    expect(geschrieben).not.toHaveProperty('duration_minutes')
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Statusabwertung bleibt erlaubt', () => {
  it('faellt auf draft zurueck, wenn nur der Status abgelehnt wird', async () => {
    const { client, versuche } = alteDatenbank({
      erlaubteStatus: ALT.erlaubteStatus, erlaubteTopfe: NEU.erlaubteTopfe,
    })
    const r = await saveServiceRecord(client, EINGABE)

    expect(r.id).toBe('neue-id')
    expect(r.degraded).toBe(true)
    expect(versuche).toEqual([
      { status: 'signed', budget_type: 'verhinderung' },
      { status: 'draft', budget_type: 'verhinderung' },
    ])
    // Entscheidend: der Topf ist auch im zweiten Versuch unveraendert.
    expect(versuche.every(v => v.budget_type === 'verhinderung')).toBe(true)
  })

  it('meldet degraded=false, wenn der Status ohnehin draft war', async () => {
    const { client, versuche } = alteDatenbank({
      erlaubteStatus: ALT.erlaubteStatus, erlaubteTopfe: NEU.erlaubteTopfe,
    })
    const r = await saveServiceRecord(client, { ...EINGABE, status: 'draft' })
    expect(r.degraded).toBe(false)
    expect(versuche).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('SR-1: der Budget-Topf wird nie umgebucht', () => {
  it('versucht KEINEN Rueckfall auf entlastung', async () => {
    const { client, versuche } = alteDatenbank(ALT)
    await saveServiceRecord(client, EINGABE)

    // Frueher stand hier ein dritter Versuch mit 'entlastung'.
    expect(versuche.some(v => v.budget_type === 'entlastung')).toBe(false)
  })

  it('speichert gar nichts, statt in den falschen Topf zu buchen', async () => {
    const { client } = alteDatenbank(ALT)
    const r = await saveServiceRecord(client, EINGABE)

    expect(r.id).toBeNull()
    expect(r.degraded).toBe(false)
  })

  it('nennt den Topf und sagt, dass NICHT umgebucht wurde', async () => {
    const { client } = alteDatenbank(ALT)
    const r = await saveServiceRecord(client, EINGABE)

    expect(r.error).toContain('verhinderung')
    expect(r.error).toContain('NICHT gespeichert')
    expect(r.error).toMatch(/nicht auf den Entlastungsbetrag/)
  })

  it('gilt genauso fuer den Privattopf', async () => {
    // Privat gezahlte Leistung auf § 45b umzubuchen heisst: der Kunde
    // zahlt sie doppelt — einmal aus seinem Entlastungsbetrag, einmal
    // aus der Tasche.
    const { client, versuche } = alteDatenbank(ALT)
    const r = await saveServiceRecord(client, { ...EINGABE, budget_type: 'private' })

    expect(r.id).toBeNull()
    expect(versuche.some(v => v.budget_type === 'entlastung')).toBe(false)
    expect(r.error).toContain('private')
  })

  it('laesst entlastung selbst unveraendert durch', async () => {
    // Gegenprobe: wer ohnehin auf § 45b bucht, wird nicht ausgesperrt.
    const { client } = alteDatenbank(ALT)
    const r = await saveServiceRecord(client, {
      ...EINGABE, budget_type: 'entlastung', status: 'draft',
    })
    expect(r.id).toBe('neue-id')
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Andere Fehler brechen sofort ab', () => {
  it('wiederholt bei RLS-Verweigerung nicht', async () => {
    const versuche: unknown[] = []
    const client = {
      from: () => ({
        insert: (w: unknown) => {
          versuche.push(w)
          return {
            select: () => ({
              single: async () => ({
                data: null,
                error: { code: '42501', message: 'permission denied for table service_records' },
              }),
            }),
          }
        },
      }),
    }
    const r = await saveServiceRecord(client as never, EINGABE)

    expect(versuche).toHaveLength(1)
    expect(r.id).toBeNull()
    // Die Rohmeldung bleibt stehen — es ist kein Budget-Topf-Problem.
    expect(r.error).toContain('permission denied')
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Aufrufer', () => {
  const WURZEL = path.resolve(__dirname, '../..')

  it('die Team-Erfassung erklaert die Abwertung vollstaendig', () => {
    // Der Hinweistext nannte nur den Status. Wer ihn las, konnte nicht
    // wissen, ob auch der Budget-Topf betroffen war.
    const src = readFileSync(path.join(WURZEL, 'app/mis/team/page.tsx'), 'utf-8')
    const stelle = src.slice(src.indexOf('if (degraded)'), src.indexOf('if (degraded)') + 600)
    expect(stelle).toMatch(/nicht abrechenbar/)
    expect(stelle).toMatch(/Budget-Topf wurde NICHT/)
  })
})
