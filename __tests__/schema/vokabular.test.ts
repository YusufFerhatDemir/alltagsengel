/**
 * Block 37 — Schreibvorgänge gegen eine verbotene Werteliste
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Dasselbe Muster hat in dieser Sitzung dreimal zugeschlagen:
 * `invoices.status` (zwei Vokabulare, zu hohe Forderung),
 * `service_type`/`leistungsart` (falscher Budgettopf),
 * `client_signer_role: 'client'` (hätte die Unterschriftskette zerrissen).
 * Jedes Mal einzeln gefunden, jedes Mal durch Zufall.
 *
 * Der Detektor fand beim ersten scharfen Lauf vier tote Schreibwege:
 *
 *   substitution_requests.status = 'failed'      → nie als gescheitert markierbar
 *   substitution_requests.status = 'filled'      → Vertretung nie zuweisbar
 *   notifications.type          = 'referral'     → Werber erfuhr nie vom Bonus
 *   ops_aufgaben.status         = 'archiviert'   → Aufgabe nie löschbar
 *
 * Alle vier scheitern mit 23514 — die Funktion dahinter ist vollständig
 * tot.
 */
import { describe, it, expect } from 'vitest'
import {
  werteliste, schluessel, objektAb, ohneKommentare, pruefeQuelle,
} from '@/lib/schema/vokabular'

describe('werteliste — die Definition lesen', () => {
  it('liest die Form OHNE ::text am Spaltennamen', () => {
    // Die häufigere Form. Ein erster Entwurf verlangte `::text` und fand
    // deshalb NULL von 421 Constraints — ein Detektor, der nichts findet,
    // sieht aus wie ein sauberes System.
    const r = werteliste('abrechnung_betriebsmodus',
      "CHECK ((modus = ANY (ARRAY['test'::text, 'produktion'::text])))")
    expect(r).toEqual({ tabelle: 'abrechnung_betriebsmodus', spalte: 'modus', werte: ['test', 'produktion'] })
  })

  it('liest die Form MIT ::text am Spaltennamen', () => {
    const r = werteliste('service_records',
      "CHECK (((client_signer_role)::text = ANY (ARRAY['KUNDE'::text, 'ANGEHOERIGER'::text, 'VERTRETER'::text])))")
    expect(r?.spalte).toBe('client_signer_role')
    expect(r?.werte).toEqual(['KUNDE', 'ANGEHOERIGER', 'VERTRETER'])
  })

  it('gibt null für einen CHECK ohne Werteliste', () => {
    expect(werteliste('invoices', 'CHECK ((total_amount >= (0)::numeric))')).toBeNull()
  })

  it('gibt null für eine leere Liste', () => {
    expect(werteliste('x', 'CHECK ((a = ANY (ARRAY[])))')).toBeNull()
  })

  it('verträgt einen Wert mit Apostroph', () => {
    const r = werteliste('x', "CHECK ((a = ANY (ARRAY['O''Brien'::text])))")
    expect(r?.werte).toEqual(["O'Brien"])
  })
})

describe('objektAb — das Objektliteral abgrenzen', () => {
  it('findet das schließende Gegenstück', () => {
    const q = "x.insert({ a: 'b', c: { d: 'e' } }).select()"
    expect(objektAb(q, q.indexOf('{'))).toBe("{ a: 'b', c: { d: 'e' } }")
  })

  it('gibt null bei unbalancierten Klammern', () => {
    expect(objektAb('{ a: 1', 0)).toBeNull()
  })

  it('bricht nach der Obergrenze ab, statt zu hängen', () => {
    expect(objektAb('{' + 'x'.repeat(50), 0, 20)).toBeNull()
  })
})

describe('ohneKommentare', () => {
  it('entfernt Blockkommentare und ganze Kommentarzeilen', () => {
    const q = "/* weg */\n// auch weg\nconst b = 2"
    const r = ohneKommentare(q)
    expect(r).not.toMatch(/weg/)
    expect(r).toMatch(/const b = 2/)
  })

  it('lässt einen nachgestellten Kommentar stehen — mit Absicht', () => {
    // Ein Ausdruck, der jedes `//` entfernt, zerschneidet auch jedes
    // `https://` im Quelltext. Der Preis dafuer ist, dass ein
    // Schreibvorgang IM nachgestellten Kommentar gemeldet wuerde — das
    // ist der seltenere und harmlosere Fall.
    const r = ohneKommentare("const url = 'https://a.test' // Notiz")
    expect(r).toMatch(/https:\/\/a\.test/)
  })
})

describe('pruefeQuelle — die Zuordnung', () => {
  const erlaubt = new Map<string, ReadonlySet<string>>([
    [schluessel('substitution_requests', 'status'), new Set(['open', 'assigned', 'cancelled'])],
    [schluessel('notifications', 'type'), new Set(['booking', 'system', 'payment'])],
  ])

  it('meldet einen Wert, den der CHECK nicht kennt', () => {
    const q = "await db.from('substitution_requests').update({ status: 'filled' })"
    const b = pruefeQuelle('a.ts', q, erlaubt)
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ tabelle: 'substitution_requests', spalte: 'status', wert: 'filled' })
    expect(b[0].erlaubt).toContain('assigned')
  })

  it('schweigt bei einem erlaubten Wert', () => {
    const q = "await db.from('substitution_requests').update({ status: 'assigned' })"
    expect(pruefeQuelle('a.ts', q, erlaubt)).toHaveLength(0)
  })

  it('schweigt bei einer Spalte ohne CHECK', () => {
    const q = "await db.from('substitution_requests').update({ notiz: 'irgendwas' })"
    expect(pruefeQuelle('a.ts', q, erlaubt)).toHaveLength(0)
  })

  it('schweigt bei einer Tabelle ohne CHECK', () => {
    const q = "await db.from('irgendwas').insert({ status: 'filled' })"
    expect(pruefeQuelle('a.ts', q, erlaubt)).toHaveLength(0)
  })

  it('ordnet NICHT über eine Anweisungsgrenze hinweg zu', () => {
    // DER Grund für die direkte Verkettung. Ein erster Entwurf suchte im
    // Umkreis von 400 Zeichen und ordnete das Objektliteral der falschen
    // Tabelle zu — 2 von 12 Treffern waren genau das.
    const q = `
      const { data } = await db.from('substitution_requests').select('id').eq('id', x)
      await db.from('notifications').insert({ status: 'filled' })
    `
    // 'filled' gehört hier zu notifications.status — die Spalte hat dort
    // keinen CHECK, also kein Befund. Früher wurde es substitution_requests
    // zugerechnet und fälschlich gemeldet.
    expect(pruefeQuelle('a.ts', q, erlaubt)).toHaveLength(0)
  })

  it('erkennt insert, update und upsert', () => {
    for (const methode of ['insert', 'update', 'upsert']) {
      const q = `db.from('notifications').${methode}({ type: 'referral' })`
      expect(pruefeQuelle('a.ts', q, erlaubt), methode).toHaveLength(1)
    }
  })

  it('greift über einen Zeilenumbruch in der Kette', () => {
    const q = "db.from('notifications')\n  .insert({\n    type: 'referral',\n  })"
    expect(pruefeQuelle('a.ts', q, erlaubt)).toHaveLength(1)
  })

  it('übersieht nichts in einem Objekt mit mehreren Feldern', () => {
    const q = "db.from('notifications').insert({ user_id: x, type: 'referral', title: 'Hallo' })"
    const b = pruefeQuelle('a.ts', q, erlaubt)
    expect(b).toHaveLength(1)
    expect(b[0].wert).toBe('referral')
  })

  it('liest keine Werte aus Kommentaren', () => {
    const q = "// db.from('notifications').insert({ type: 'referral' })\nconst a = 1"
    expect(pruefeQuelle('a.ts', q, erlaubt)).toHaveLength(0)
  })

  it('nennt die Zeilennummer des Schreibvorgangs', () => {
    const q = "\n\n\ndb.from('notifications').insert({ type: 'referral' })"
    expect(pruefeQuelle('a.ts', q, erlaubt)[0].zeile).toBe(4)
  })
})

describe('Die vier Befunde aus Block 37 — als Regression festgehalten', () => {
  const quelle = (rel: string) => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const path = require('node:path') as typeof import('node:path')
    return readFileSync(path.resolve(__dirname, '../..', rel), 'utf-8')
  }

  it('substitution_requests wird auf assigned gesetzt, nicht auf filled', () => {
    const s = ohneKommentare(quelle('app/admin/schedule/actions.ts'))
    expect(s).toMatch(/status: 'assigned'/)
    expect(s).not.toMatch(/status: 'filled'/)
  })

  it('markRequestFailed nutzt cancelled statt failed', () => {
    const s = ohneKommentare(quelle('app/admin/schedule/actions.ts'))
    expect(s).not.toMatch(/status: 'failed'/)
  })

  it('die Übersicht zählt nach dem Vokabular der Datenbank', () => {
    const s = ohneKommentare(quelle('app/admin/schedule/page.tsx'))
    expect(s).not.toMatch(/'proposed'/)
    expect(s).not.toMatch(/'external'/)
    expect(s).toMatch(/\['assigned', 'confirmed'\]/)
  })

  it('die Bonus-Nachricht nutzt payment statt referral', () => {
    const s = ohneKommentare(quelle('app/api/referral/complete/route.ts'))
    expect(s).toMatch(/type: 'payment'/)
    expect(s).not.toMatch(/type: 'referral'/)
  })

  it('Aufgaben werden storniert, nicht archiviert', () => {
    const s = ohneKommentare(quelle('lib/ops/aufgaben.ts'))
    expect(s).toMatch(/status: 'storniert'/)
    expect(s).not.toMatch(/'archiviert'/)
  })

  it('der Aufgaben-Typ kennt genau das Vokabular der Spalte', () => {
    const s = ohneKommentare(quelle('lib/ops/types.ts'))
    expect(s).toMatch(/'ueberfaellig'/)
    expect(s).not.toMatch(/AufgabenStatus =[^\n]*'archiviert'/)
  })
})
