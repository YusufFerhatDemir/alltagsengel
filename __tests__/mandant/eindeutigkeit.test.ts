/**
 * Mandanten-Eindeutigkeit — global oder je Organisation?
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 46, 14.09.2026)
 *
 * `invoices_invoice_number_key UNIQUE (invoice_number)` steht live OHNE
 * `organization_id`. Die Nummer kommt aus `next_billing_number()`, und
 * dieser Zaehler ist JE MANDANT gefuehrt — die Nummer selbst traegt den
 * Mandanten nicht. Der zweite Mandant erzeugt als erste Rechnung erneut
 * 'RE-2026-00001', laeuft in eine Unique-Verletzung, der Zaehler faellt
 * mit der Transaktion zurueck, und der naechste Versuch erzeugt dieselbe
 * Nummer: er kann NIE eine Rechnung stellen.
 *
 * Die Bewertung steht in lib/mandant/eindeutigkeit.ts, damit sie ohne
 * Datenbank pruefbar ist; das Skript beschafft nur die Zeilen.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  bewerte, bewerteAlle, veraltet, schluessel,
  ABSICHTLICH_GLOBAL, MIGRATION_WARTET,
  type UniqueIndexZeile,
} from '@/lib/mandant/eindeutigkeit'

const zeile = (
  tabelle: string, index: string, spalten: string[],
  gebundenUeber: string[] = [], eigeneId = false,
): UniqueIndexZeile => ({ tabelle, index, spalten, gebundenUeber, eigeneId })

describe('Fremdschluessel-Bindung', () => {
  it('bindet ueber eine Spalte, die auf eine Mandanten-Tabelle zeigt', () => {
    const b = bewerte(zeile('client_budgets', 'irgendein_key', ['client_id', 'year'], ['client_id']))
    expect(b.einstufung).toBe('ueber_fremdschluessel_gebunden')
    expect(b.begruendung).toContain('client_id')
  })

  it('bindet ueber die eigene id — eine UUID kollidiert nicht', () => {
    expect(bewerte(zeile('email_campaigns', 'einmal_versendet', ['id'], [], true)).einstufung)
      .toBe('ueber_fremdschluessel_gebunden')
  })

  it('verlaesst sich NICHT auf Spaltennamen', () => {
    // Ein erster Entwurf fuehrte die bindenden Spalten als Namensliste und
    // meldete `assessment_id`, `visite_id` und `protokoll_id` als Befund —
    // alles Fremdschluessel. Ohne die gemessene Bindung ist ein
    // vielsagender Name wertlos.
    const b = bewerte(zeile('sis_themenfelder', 'sis_themenfelder_unique', ['assessment_id', 'feld_nr']))
    expect(b.einstufung).toBe('befund')
    const c = bewerte(zeile('sis_themenfelder', 'sis_themenfelder_unique', ['assessment_id', 'feld_nr'], ['assessment_id']))
    expect(c.einstufung).toBe('ueber_fremdschluessel_gebunden')
  })
})

describe('die drei bewussten Einstufungen', () => {
  it('erkennt einen absichtlich globalen Schluessel', () => {
    const b = bewerte(zeile('billing_landesregeln', 'uq_landesregel_global', ['bundesland', 'regel_key', 'gueltig_ab']))
    expect(b.einstufung).toBe('absichtlich_global')
    expect(b.begruendung).toContain('Gesetz')
  })

  it('erkennt die wartende Rechnungsnummer und sagt, was auf dem Spiel steht', () => {
    const b = bewerte(zeile('invoices', 'invoices_invoice_number_key', ['invoice_number']))
    expect(b.einstufung).toBe('migration_wartet')
    expect(b.begruendung).toContain('KEINE Rechnung')
  })

  it('meldet einen unbewerteten Schluessel als Befund', () => {
    const b = bewerte(zeile('neue_tabelle', 'neue_tabelle_nummer_key', ['nummer']))
    expect(b.einstufung).toBe('befund')
    expect(b.begruendung).toContain('Unique-Verletzung')
  })

  it('die Bindung schlaegt die Einstufungslisten — ein gebundener Schluessel ist harmlos', () => {
    // Reihenfolge zaehlt: waere es umgekehrt, muesste jede FK-gebundene
    // Zeile zusaetzlich in eine Liste eingetragen werden.
    const b = bewerte(zeile('invoices', 'invoices_invoice_number_key', ['invoice_number'], ['invoice_number']))
    expect(b.einstufung).toBe('ueber_fremdschluessel_gebunden')
  })
})

describe('veraltet — eine Warteliste, die niemand leert, wird zur Legende', () => {
  it('meldet einen Eintrag, der live nicht mehr vorkommt', () => {
    const live = Object.keys(MIGRATION_WARTET)
      .filter(k => k !== 'invoices.invoices_invoice_number_key')
      .map(k => {
        const [tabelle, ...rest] = k.split('.')
        return zeile(tabelle, rest.join('.'), ['x'])
      })
    expect(veraltet(live)).toEqual(['invoices.invoices_invoice_number_key'])
  })

  it('meldet nichts, solange alle Eintraege live stehen', () => {
    const live = Object.keys(MIGRATION_WARTET).map(k => {
      const [tabelle, ...rest] = k.split('.')
      return zeile(tabelle, rest.join('.'), ['x'])
    })
    expect(veraltet(live)).toEqual([])
  })
})

describe('bewerteAlle', () => {
  it('bewertet jede Zeile einzeln und behaelt die Reihenfolge', () => {
    const b = bewerteAlle([
      zeile('invoices', 'invoices_invoice_number_key', ['invoice_number']),
      zeile('x', 'y', ['a'], ['a']),
      zeile('neu', 'neu_key', ['wert']),
    ])
    expect(b.map(x => x.einstufung)).toEqual([
      'migration_wartet', 'ueber_fremdschluessel_gebunden', 'befund',
    ])
  })
})

describe('die Listen und die Migration sagen dasselbe', () => {
  const migration = readFileSync(
    'supabase/migrations/20261205000000_mandanten_eindeutigkeit.sql', 'utf8')
  const ruecknahme = readFileSync(
    'supabase/migrations/20261205000001_rollback_mandanten_eindeutigkeit.sql', 'utf8')

  it('jeder wartende Eintrag wird in der Migration FALLENGELASSEN', () => {
    const fehlend = Object.keys(MIGRATION_WARTET)
      .map(k => k.split('.').slice(1).join('.'))
      .filter(c => !new RegExp(`DROP CONSTRAINT IF EXISTS ${c}\\b`).test(migration))
    expect(fehlend).toEqual([])
  })

  it('und — ausser bei „ersatzlos" — durch einen mandantenbezogenen ERSETZT', () => {
    // Erst dieser Test faengt die eigentliche Gefahr: ein DROP ohne ADD
    // nimmt die Eindeutigkeit ganz weg, statt sie je Mandant zu fuehren.
    // Ein Mutationstest hat genau das durchgelassen, solange nur der alte
    // Name irgendwo in der Datei vorkam — und der steht in der DROP-Zeile.
    const ohneErsatz: string[] = []
    for (const [k, grund] of Object.entries(MIGRATION_WARTET)) {
      if (grund.includes('ersatzlos')) continue
      const tabelle = k.split('.')[0]
      // Ein ADD CONSTRAINT auf dieselbe Tabelle, dessen Spaltenliste mit
      // organization_id beginnt.
      const treffer = [...migration.matchAll(
        /ALTER TABLE public\.(\w+)\s+ADD CONSTRAINT\s+(\w+)\s+UNIQUE\s*\(([^)]*)\)/g)]
        .some(m => m[1] === tabelle && /^\s*organization_id\b/.test(m[3]))
      if (!treffer) ohneErsatz.push(k)
    }
    expect(ohneErsatz).toEqual([])
  })

  it('der ersatzlose Fall nennt den Index, der die Regel uebernimmt', () => {
    const ersatzlos = Object.entries(MIGRATION_WARTET).filter(([, g]) => g.includes('ersatzlos'))
    expect(ersatzlos.length).toBeGreaterThan(0)
    for (const [k, grund] of ersatzlos) {
      expect(grund, k).toMatch(/idx_\w+/)
      expect(migration, k).toContain(grund.match(/idx_\w+/)![0])
    }
  })

  it('jeder wartende Eintrag nennt die Migrationsnummer', () => {
    for (const [k, grund] of Object.entries(MIGRATION_WARTET)) {
      expect(grund, k).toContain('20261205000000')
    }
  })

  it('die Ruecknahme stellt jeden alten Constraint wieder her', () => {
    const fehlend = Object.keys(MIGRATION_WARTET)
      .map(k => k.split('.').slice(1).join('.'))
      .filter(constraint => !ruecknahme.includes(constraint))
    expect(fehlend).toEqual([])
  })

  it('die Migration aendert keine Daten', () => {
    // Sie beantwortet nur, wer denselben Wert noch fuehren darf.
    //
    // Geprueft werden die ANWEISUNGEN, nicht der Fliesstext: der Kopf der
    // Migration zitiert den Zaehler `INSERT INTO billing_number_sequences
    // … ON CONFLICT` als Begruendung. Wer die Kommentare mitliest, meldet
    // die Erklaerung als Befund.
    const anweisungen = migration
      .split('\n')
      .filter(z => !z.trim().startsWith('--'))
      .join('\n')
    expect(anweisungen).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b\s+(INTO|FROM|public\.)/i)
    expect(anweisungen).toContain('ALTER TABLE')
  })

  it('jede Begruendung in ABSICHTLICH_GLOBAL sagt WARUM, nicht nur DASS', () => {
    for (const [k, grund] of Object.entries(ABSICHTLICH_GLOBAL)) {
      expect(grund.length, k).toBeGreaterThan(40)
    }
  })

  it('kein Schluessel steht in beiden Listen', () => {
    const doppelt = Object.keys(ABSICHTLICH_GLOBAL).filter(k => k in MIGRATION_WARTET)
    expect(doppelt).toEqual([])
  })
})

describe('schluessel', () => {
  it('bildet Tabelle.Index', () => {
    expect(schluessel(zeile('invoices', 'invoices_invoice_number_key', ['x'])))
      .toBe('invoices.invoices_invoice_number_key')
  })
})

describe('das Skript ist verdrahtet', () => {
  it('als npm-Skript', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts['verify:mandanten-eindeutigkeit'])
      .toBe('tsx scripts/verify-mandanten-eindeutigkeit.ts')
  })

  it('wertet einen leeren Messwert als Stoerung, nicht als Freispruch', () => {
    // Null gelesene Indexe heissen eher „Zugriff fehlgeschlagen" als
    // „makelloses Schema" — ein Detektor, der bei Blindheit gruen meldet,
    // ist schlimmer als keiner.
    const quelle = readFileSync('scripts/verify-mandanten-eindeutigkeit.ts', 'utf8')
    expect(quelle).toContain('zeilen.length === 0')
    expect(quelle).toContain('kein Freispruch')
  })

  it('nutzt den Parameter `p` des Lese-Orakels, nicht `query`', () => {
    const quelle = readFileSync('scripts/verify-mandanten-eindeutigkeit.ts', 'utf8')
    expect(quelle).toContain('JSON.stringify({ p: sql })')
  })
})
