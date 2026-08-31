/**
 * Bezug Buchung → Einsatz, mit und ohne `assignments.booking_id`.
 * @see lib/bookings/assignment-bezug.ts
 * @see supabase/migrations/20261025000000_assignments_booking_id.sql
 *
 * Der Punkt dieser Suite ist die Unterscheidung, an der der Rueckfall
 * kippen kann: „diese Spalte gibt es noch nicht" ist etwas anderes als
 * „die Abfrage ist fehlgeschlagen". Wer beides gleich behandelt, macht
 * aus jeder Stoerung ein „kein Einsatz gefunden" — und der Storno laesst
 * den Einsatz stehen, waehrend der Kunde eine Erfolgsmeldung liest.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import {
  findeEinsatzZuBuchung,
  istSpalteFehltFehler,
  einsatzNotizFuerBuchung,
} from '@/lib/bookings/assignment-bezug'

const BUCHUNG = '11111111-2222-4333-8444-555555555555'

type Antwort = { data?: unknown[]; error?: { code?: string; message?: string } }

/**
 * Baut die beiden Abfrage-Funktionen und protokolliert, WELCHE gerufen
 * wurde — sonst laesst sich „hat die Spalte benutzt" nicht von „hat die
 * Notiz benutzt" unterscheiden.
 *
 * Seit die Funktion Thunks statt eines Clients nimmt, braucht der Test
 * keinen Doppelgaenger des Query-Builders mehr: der Nachbau des Clients
 * war genau die Stelle, an der TypeScript an den Generics von supabase-js
 * scheiterte (TS2345, dann zweimal TS2589).
 */
function abfragen(antworten: Antwort[]) {
  const gerufen: string[] = []
  let index = 0
  const naechste = () => {
    const a = antworten[index++] ?? { data: [] }
    return Promise.resolve({
      data: (a.data ?? null) as { id: string; status: string | null }[] | null,
      error: a.error ?? null,
    })
  }
  return {
    gerufen,
    abfragen: {
      ueberSpalte: () => { gerufen.push('spalte'); return naechste() },
      ueberNotiz: () => { gerufen.push('notiz'); return naechste() },
    },
  }
}

describe('istSpalteFehltFehler', () => {
  it('erkennt die beiden Codes fuer „Spalte unbekannt"', () => {
    expect(istSpalteFehltFehler({ code: '42703', message: 'column does not exist' })).toBe(true)
    expect(istSpalteFehltFehler({ code: 'PGRST204', message: 'not found in schema cache' })).toBe(true)
  })

  it('erkennt die Meldung auch ohne Code', () => {
    // PostgREST liefert den Code nicht in jeder Fassung mit.
    expect(istSpalteFehltFehler({ message: "column assignments.booking_id does not exist" })).toBe(true)
    expect(istSpalteFehltFehler({ message: "Could not find the 'booking_id' column in the schema cache" })).toBe(true)
  })

  it('haelt einen ECHTEN Fehler NICHT fuer eine fehlende Spalte', () => {
    // Das ist die Zeile, an der alles haengt: waere sie true, wuerde eine
    // RLS-Sperre oder ein Netzfehler in den Rueckfall laufen und dort als
    // „kein Einsatz" enden.
    expect(istSpalteFehltFehler({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(istSpalteFehltFehler({ code: '57014', message: 'canceling statement due to timeout' })).toBe(false)
    expect(istSpalteFehltFehler({ message: 'connection refused' })).toBe(false)
    expect(istSpalteFehltFehler(null)).toBe(false)
  })
})

describe('einsatzNotizFuerBuchung', () => {
  it('erzeugt genau das Muster, das die Migration zurueckliest', () => {
    const notiz = einsatzNotizFuerBuchung(BUCHUNG)
    expect(notiz).toBe(`Automatisch aus Buchung ${BUCHUNG} erzeugt.`)
    // Dieselbe Form, die der Backfill in 20261025000000 sucht. Weicht sie
    // ab, findet der Backfill den Bestand nicht.
    expect(notiz).toMatch(/^Automatisch aus Buchung [0-9a-fA-F-]{36} erzeugt\.$/)
  })
})

describe('findeEinsatzZuBuchung', () => {
  it('nimmt die Spalte, wenn es sie gibt — und fragt die Notiz gar nicht erst', async () => {
    const { gerufen, abfragen: a } = abfragen([{ data: [{ id: 'a1', status: 'GEPLANT' }] }])
    const ergebnis = await findeEinsatzZuBuchung(a)

    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.einsatz).toEqual({ id: 'a1', status: 'GEPLANT' })
    expect(ergebnis.ueberSpalte).toBe(true)
    // Der Notiz-Weg wurde gar nicht erst betreten.
    expect(gerufen).toEqual(['spalte'])
  })

  it('faellt auf die Notiz zurueck, solange die Spalte fehlt', async () => {
    const { gerufen, abfragen: a } = abfragen([
      { error: { code: '42703', message: 'column assignments.booking_id does not exist' } },
      { data: [{ id: 'a2', status: 'BESTAETIGT' }] },
    ])
    const ergebnis = await findeEinsatzZuBuchung(a)

    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.einsatz).toEqual({ id: 'a2', status: 'BESTAETIGT' })
    // Der Aufrufer muss erfahren, welcher Weg gegriffen hat — solange das
    // false ist, haengt der Bezug an einem bearbeitbaren Textfeld.
    expect(ergebnis.ueberSpalte).toBe(false)
    expect(gerufen).toEqual(['spalte', 'notiz'])
  })

  it('macht aus einem ECHTEN Fehler KEINEN fehlenden Einsatz', async () => {
    // Ohne diese Trennung endet eine RLS-Sperre als „kein Einsatz", der
    // Storno laesst den Einsatz stehen und meldet Erfolg — der Engel
    // faehrt zu einem abgesagten Termin.
    const { gerufen, abfragen: a } = abfragen([
      { error: { code: '42501', message: 'permission denied for table assignments' } },
    ])
    const ergebnis = await findeEinsatzZuBuchung(a)

    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler.code).toBe('42501')
    // Kein Rueckfall — der Notiz-Weg wurde NICHT betreten.
    expect(gerufen).toEqual(['spalte'])
  })

  it('gibt einen Fehler des Rueckfall-Wegs ebenfalls als Fehler zurueck', async () => {
    const { abfragen: a } = abfragen([
      { error: { code: 'PGRST204', message: "'booking_id' not found in schema cache" } },
      { error: { code: '57014', message: 'canceling statement due to statement timeout' } },
    ])
    const ergebnis = await findeEinsatzZuBuchung(a)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler.code).toBe('57014')
  })

  it('unterscheidet „kein Einsatz" von „nicht nachsehen koennen"', async () => {
    // Leeres Ergebnis OHNE Fehler ist eine gueltige Antwort: die Buchung
    // wurde nie angenommen, also gibt es keinen Einsatz.
    const { abfragen: a } = abfragen([{ data: [] }])
    const ergebnis = await findeEinsatzZuBuchung(a)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.einsatz).toBeNull()
  })
})

describe('Die Storno-Route baut beide Abfragen richtig', () => {
  // Seit findeEinsatzZuBuchung() Thunks statt eines Clients nimmt, stehen
  // die Filter in der Route — und waeren dort von keinem Test mehr gedeckt.
  // Diese drei Faelle halten fest, was die Umstellung sonst stillschweigend
  // aufgegeben haette. Eine Quelltextpruefung ist kein Lauf, aber sie faengt
  // genau die Aenderung, um die es geht: einen weggefallenen Filter.
  let quelle = ''
  beforeAll(async () => {
    const { readFileSync } = await import('node:fs')
    quelle = readFileSync('app/api/bookings/cancel/route.ts', 'utf-8')
  })

  it('fragt den Spaltenweg ueber booking_id ab', () => {
    expect(quelle).toMatch(/ueberSpalte:[\s\S]{0,300}\.eq\('booking_id', booking\.id\)/)
  })

  it('fragt den Notiz-Weg ueber das erzeugte Muster ab', () => {
    // Muss zu einsatzNotizFuerBuchung() passen, sonst findet der Rueckfall
    // nichts.
    expect(quelle).toMatch(/ueberNotiz:[\s\S]{0,300}\.like\('notes', `%Buchung \$\{booking\.id\}%`\)/)
  })

  it('setzt in BEIDEN Wegen den Mandantenzaun', () => {
    // Ohne organization_id liest der Dienstschluessel ueber Mandanten
    // hinweg — RLS sieht ihn nicht (siehe lib/supabase/admin.ts).
    const spalte = quelle.slice(quelle.indexOf('ueberSpalte:'), quelle.indexOf('ueberNotiz:'))
    const notiz = quelle.slice(quelle.indexOf('ueberNotiz:'), quelle.indexOf('ueberNotiz:') + 300)
    expect(spalte).toContain("eq('organization_id', orgId)")
    expect(notiz).toContain("eq('organization_id', orgId)")
  })
})

describe('Migration und Code beschreiben dasselbe Muster', () => {
  it('sucht im Backfill genau die Notiz, die der Code schreibt', async () => {
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync('supabase/migrations/20261025000000_assignments_booking_id.sql', 'utf-8')
    // Das Muster im SQL muss zur erzeugten Notiz passen — sonst laeuft der
    // Backfill durch und traegt nichts nach.
    expect(sql).toContain('Automatisch aus Buchung ([0-9a-fA-F-]{36}) erzeugt')
    expect(sql).toContain('ON DELETE SET NULL')
    // Kein NOT NULL: Einsaetze aus Dienstplan und Tour haben keine Buchung.
    expect(sql).not.toMatch(/booking_id\s+uuid\s+NOT NULL/i)
  })

  it('ist im Migrations-Pruefkatalog eingetragen', async () => {
    // Ohne Eintrag misst `npm run check:migrationen` sie nicht, und die
    // Apply-Checkliste kennt sie nicht — die Migration waere geschrieben
    // und nirgends nachgehalten. Geprueft wird der Quelltext des Katalogs:
    // ihn zu importieren zoege ein .mjs ohne Typen in den Typcheck.
    const { readFileSync } = await import('node:fs')
    const katalog = readFileSync('scripts/lib/migrationen-katalog.mjs', 'utf-8')
    expect(katalog, 'Migration fehlt in scripts/lib/migrationen-katalog.mjs')
      .toContain('20261025000000_assignments_booking_id')
    expect(katalog).toContain('assignments_booking_id_fkey')
    expect(katalog).toContain('idx_assignments_booking_id')
  })
})
