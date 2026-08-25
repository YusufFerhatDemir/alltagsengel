// ═══════════════════════════════════════════════════════════════════════
// MAHN-SAFETY-GATE — jede der zehn Sperren einzeln
//
// Eine Mahnung an jemanden, der bezahlt hat, ist ein Vorwurf. Eine an
// jemanden, dessen Rechnung storniert wurde, ist eine Forderung ohne
// Grundlage. Beides sind Vorgänge, die man nachträglich erklären können
// muss — deshalb bekommt hier jede Sperre ihren eigenen Fall UND die
// Gegenprobe, dass sie im Normalfall offen ist.
//
// Der wichtigste Test der Datei ist der erste: dass eine ganz normale,
// überfällige, unbezahlte Rechnung MAHNBAR ist. Ohne ihn wäre nicht
// unterscheidbar, ob eine Sperre greift oder ob das Gate immer schließt.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  pruefeMahnbarkeit,
  MahnungGesperrtError,
  GESPERRTE_STATUS,
  type MahnSperre,
  type MahnGateErgebnis,
} from '@/lib/billing/dunning/mahn-safety-gate'
import { DUNNING_DAYS } from '@/lib/billing/core/dunning'
import { heuteBerlin } from '@/lib/utils/timezone'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000000000042'
const INV = '00000000-0000-4000-8000-0000000000cc'

/**
 * Ein Datum n Tage vor „heute".
 *
 * Rechnet bewusst ab heuteBerlin() und nicht ab `new Date().toISOString()`:
 * das Gate misst den Verzug gegen die Berliner Kalenderwoche, und ein Lauf
 * kurz nach Mitternacht liegt in UTC noch im Vortag. Der Test wäre sonst je
 * nach Uhrzeit um einen Tag daneben — ein Fehlalarm, der wie ein
 * Rechenfehler im Prüfling aussieht.
 */
function vorTagen(n: number): string {
  const heute = new Date(heuteBerlin() + 'T12:00:00Z')
  heute.setUTCDate(heute.getUTCDate() - n)
  return heute.toISOString().slice(0, 10)
}
function inTagen(n: number): string {
  return vorTagen(-n)
}

const RECHNUNG_OK = {
  id: INV,
  invoice_number: 'RE-2026-0001',
  invoice_number_formatted: 'RE-2026-0001',
  status: 'freigegeben',
  total_amount: 150.5,
  paid_amount: 0,
  // 20 Tage überfällig → über der 14-Tage-Frist der Zahlungserinnerung.
  due_date: vorTagen(20),
  deleted_at: null,
  organization_id: ORG,
}

const EINTRAG_OK = {
  id: 'dunning-1',
  dunning_level: 'offen',
  block_dunning: false,
  block_reason: null,
  next_dunning_at: null,
}

interface Lage {
  rechnung?: Record<string, unknown> | null
  rechnungFehler?: string
  eintrag?: Record<string, unknown> | null
  korrekturen?: { id: string; status: string }[]
  korrekturenFehler?: string
  beanstandungen?: { id: string }[]
  differenzen?: { id: string }[]
  queue?: { id: string; status: string }[]
  queueFehler?: string
}

function db(lage: Lage = {}) {
  return (a: FakeAufruf) => {
    switch (a.tabelle) {
      case 'invoices':
        if (lage.rechnungFehler) return { error: { message: lage.rechnungFehler } }
        return { data: lage.rechnung === undefined ? RECHNUNG_OK : lage.rechnung }
      case 'invoice_corrections':
        return lage.korrekturenFehler
          ? { error: { message: lage.korrekturenFehler } }
          : { data: lage.korrekturen ?? [] }
      case 'invoice_disputes':
        return { data: lage.beanstandungen ?? [] }
      case 'payment_differences':
        return { data: lage.differenzen ?? [] }
      case 'dunning_entries':
        return { data: lage.eintrag === undefined ? EINTRAG_OK : lage.eintrag }
      case 'dunning_email_queue':
        return lage.queueFehler
          ? { error: { message: lage.queueFehler } }
          : { data: lage.queue ?? [] }
      default:
        return { data: [] }
    }
  }
}

async function gate(lage: Lage = {}) {
  const fake = erstelleFakeSupabase(db(lage))
  const ergebnis = await pruefeMahnbarkeit(fake.client, { invoiceId: INV, organizationId: ORG })
  return { ergebnis, fake }
}

function punkt(e: MahnGateErgebnis, sperre: MahnSperre) {
  return e.punkte.find(p => p.sperre === sperre)!
}

// ---------------------------------------------------------------------------

describe('Grundlage', () => {
  it('eine überfällige, unbezahlte Rechnung ist MAHNBAR', async () => {
    const { ergebnis } = await gate()
    expect(ergebnis.sperren).toEqual([])
    expect(ergebnis.status).toBe('MAHNBAR')
    expect(ergebnis.darfMahnen).toBe(true)
    expect(ergebnis.naechsteStufe).toBe('erinnerung')
  })

  it('liefert alle zehn Punkte', async () => {
    const { ergebnis } = await gate()
    expect(ergebnis.punkte).toHaveLength(10)
    expect(ergebnis.punkte.map(p => p.nummer)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('schreibt nichts', async () => {
    const { fake } = await gate()
    expect(fake.aufrufe.filter(a => a.operation !== 'select')).toEqual([])
  })

  it('rechnet den offenen Betrag aus Gesamt minus Gezahlt', async () => {
    const { ergebnis } = await gate()
    expect(ergebnis.gesamtCent).toBe(15050)
    expect(ergebnis.bezahltCent).toBe(0)
    expect(ergebnis.offenCent).toBe(15050)
  })

  // Der gefährlichste Fehler wäre, aus Versehen mandantenblind zu lesen:
  // dann mahnte man auf Grundlage fremder Daten.
  it('liest jede Tabelle org-gefenced', async () => {
    const { fake } = await gate()
    for (const tabelle of ['invoices', 'dunning_entries', 'dunning_email_queue']) {
      const aufruf = fake.ersterAuf(tabelle)
      expect(hatFilter(aufruf, 'eq', 'organization_id', ORG), `${tabelle} ohne org-Fence`).toBe(true)
    }
  })
})

describe('1./2. Rechnung', () => {
  it('sperrt vollständig, wenn die Rechnung einem anderen Mandanten gehört', async () => {
    const { ergebnis } = await gate({ rechnung: null })
    expect(ergebnis.status).toBe('GESPERRT')
    expect(ergebnis.punkte.every(p => p.stand === 'gesperrt')).toBe(true)
  })

  // Fail-closed: „nicht lesbar" ist nicht „mahnbar".
  it('sperrt, wenn die Rechnung nicht lesbar ist', async () => {
    const { ergebnis } = await gate({ rechnungFehler: 'connection reset' })
    expect(ergebnis.darfMahnen).toBe(false)
  })

  it('sperrt eine gelöschte Rechnung', async () => {
    const { ergebnis } = await gate({ rechnung: { ...RECHNUNG_OK, deleted_at: '2026-08-01' } })
    expect(punkt(ergebnis, 'geloescht').stand).toBe('gesperrt')
  })
})

describe('3. Status', () => {
  // Der Kernfall des ganzen Tracks: eine bezahlte Rechnung wird NIE gemahnt.
  it('sperrt eine bezahlte Rechnung', async () => {
    const { ergebnis } = await gate({ rechnung: { ...RECHNUNG_OK, status: 'bezahlt' } })
    const p = punkt(ergebnis, 'status')
    expect(p.stand).toBe('gesperrt')
    expect(p.befund).toContain('bezahlt')
  })

  it('sperrt eine stornierte Rechnung', async () => {
    const { ergebnis } = await gate({ rechnung: { ...RECHNUNG_OK, status: 'storniert' } })
    expect(punkt(ergebnis, 'status').befund).toContain('storniert')
  })

  it('sperrt eine strittige Rechnung', async () => {
    const { ergebnis } = await gate({ rechnung: { ...RECHNUNG_OK, status: 'strittig' } })
    expect(punkt(ergebnis, 'status').stand).toBe('gesperrt')
  })

  it('sperrt einen Entwurf — der war nie beim Kunden', async () => {
    const { ergebnis } = await gate({ rechnung: { ...RECHNUNG_OK, status: 'entwurf' } })
    expect(punkt(ergebnis, 'status').befund).toContain('nie beim Kunden')
  })

  it('sperrt eine abgeschriebene Forderung', async () => {
    const { ergebnis } = await gate({ rechnung: { ...RECHNUNG_OK, status: 'abgeschrieben' } })
    expect(punkt(ergebnis, 'status').stand).toBe('gesperrt')
  })

  // Die Liste lebt an zwei Orten. Läuft sie auseinander, mahnt der eine Weg,
  // was der andere sperrt.
  it('die Sperrliste deckt sich mit NICHT_MAHNFAEHIG im Mahnlauf', async () => {
    const quelle = await import('node:fs').then(fs =>
      fs.readFileSync('lib/billing/core/dunning.ts', 'utf-8'))
    const block = quelle.slice(
      quelle.indexOf('const NICHT_MAHNFAEHIG'),
      quelle.indexOf('export interface DunningRunEscalation'))
    for (const status of GESPERRTE_STATUS) {
      expect(block, `${status} fehlt in NICHT_MAHNFAEHIG`).toContain(`'${status}'`)
    }
  })
})

describe('4. Offener Betrag — Teilzahlung', () => {
  it('sperrt eine vollständig bezahlte Rechnung, auch ohne Statuswechsel', async () => {
    // Der Fall, den der Status allein nicht fängt: das Geld ist da, der
    // Status hinkt hinterher.
    const { ergebnis } = await gate({ rechnung: { ...RECHNUNG_OK, paid_amount: 150.5 } })
    const p = punkt(ergebnis, 'offener_betrag')
    expect(p.stand).toBe('gesperrt')
    expect(p.befund).toContain('ausgeglichen')
  })

  it('mahnt bei Teilzahlung weiter — aber nur über den Rest', async () => {
    const { ergebnis } = await gate({ rechnung: { ...RECHNUNG_OK, paid_amount: 100 } })
    const p = punkt(ergebnis, 'offener_betrag')
    expect(p.stand).toBe('frei')
    expect(ergebnis.offenCent).toBe(5050)
    // Der Restbetrag muss im Befund stehen — sonst mahnt jemand den vollen.
    expect(p.befund).toContain('50,50')
    expect(ergebnis.darfMahnen).toBe(true)
  })

  it('sperrt bei Überzahlung und nennt die Rückzahlung', async () => {
    const { ergebnis } = await gate({ rechnung: { ...RECHNUNG_OK, paid_amount: 200 } })
    expect(punkt(ergebnis, 'offener_betrag').befund).toContain('Rückzahlung')
  })

  it('ein Cent Rest genügt für die Mahnfähigkeit', async () => {
    const { ergebnis } = await gate({ rechnung: { ...RECHNUNG_OK, paid_amount: 150.49 } })
    expect(ergebnis.offenCent).toBe(1)
    expect(punkt(ergebnis, 'offener_betrag').stand).toBe('frei')
  })
})

describe('5. Fälligkeit', () => {
  it('sperrt ohne Fälligkeitsdatum — ohne Fälligkeit kein Verzug', async () => {
    const { ergebnis } = await gate({ rechnung: { ...RECHNUNG_OK, due_date: null } })
    const p = punkt(ergebnis, 'faelligkeit')
    expect(p.stand).toBe('gesperrt')
    expect(p.befund).toContain('Verzug')
  })

  it('meldet NOCH_NICHT_FAELLIG, solange die Frist läuft', async () => {
    const { ergebnis } = await gate({ rechnung: { ...RECHNUNG_OK, due_date: inTagen(5) } })
    expect(punkt(ergebnis, 'faelligkeit').stand).toBe('noch_nicht')
    expect(ergebnis.status).toBe('NOCH_NICHT_FAELLIG')
    expect(ergebnis.darfMahnen).toBe(false)
  })

  it('zählt die überfälligen Tage', async () => {
    const { ergebnis } = await gate({ rechnung: { ...RECHNUNG_OK, due_date: vorTagen(33) } })
    expect(ergebnis.tageUeberfaellig).toBe(33)
  })
})

describe('6. Gutschrift', () => {
  it('sperrt bei offener Gutschrift', async () => {
    const { ergebnis } = await gate({ korrekturen: [{ id: 'k1', status: 'entwurf' }] })
    expect(punkt(ergebnis, 'gutschrift').stand).toBe('gesperrt')
  })

  it('fragt Gutschriften nur ungelöscht ab', async () => {
    // Der Befund aus diesem Track: verwerfeGutschrift() setzt nur
    // deleted_at und lässt status='entwurf' stehen. Ohne den is-Filter
    // blockierte eine verworfene Gutschrift die Mahnung für immer.
    const { fake } = await gate()
    const abfrage = fake.ersterAuf('invoice_corrections')
    expect(hatFilter(abfrage, 'is', 'deleted_at', null)).toBe(true)
  })

  it('sperrt, wenn Gutschriften nicht prüfbar sind', async () => {
    const { ergebnis } = await gate({ korrekturenFehler: 'timeout' })
    expect(punkt(ergebnis, 'gutschrift').stand).toBe('gesperrt')
  })
})

describe('7. Beanstandung', () => {
  it('sperrt bei offener Beanstandung', async () => {
    const { ergebnis } = await gate({ beanstandungen: [{ id: 'd1' }] })
    const p = punkt(ergebnis, 'beanstandung')
    expect(p.stand).toBe('gesperrt')
    expect(p.befund).toContain('bestrittene Forderung')
  })

  it('sperrt bei offenem Widerspruch gegen eine Kürzung', async () => {
    const { ergebnis } = await gate({ differenzen: [{ id: 'p1' }] })
    expect(punkt(ergebnis, 'beanstandung').stand).toBe('gesperrt')
  })
})

describe('8. Manuelle Sperre', () => {
  it('sperrt bei block_dunning und nennt den Grund', async () => {
    const { ergebnis } = await gate({
      eintrag: { ...EINTRAG_OK, block_dunning: true, block_reason: 'Ratenzahlung vereinbart' },
    })
    const p = punkt(ergebnis, 'manuelle_sperre')
    expect(p.stand).toBe('gesperrt')
    expect(p.befund).toContain('Ratenzahlung vereinbart')
  })

  it('nennt „kein Grund hinterlegt", wenn keiner gesetzt ist', async () => {
    const { ergebnis } = await gate({ eintrag: { ...EINTRAG_OK, block_dunning: true, block_reason: null } })
    expect(punkt(ergebnis, 'manuelle_sperre').befund).toContain('kein Grund hinterlegt')
  })
})

describe('9. Eine Stufe je Zeitraum', () => {
  it('meldet NOCH_NICHT, solange der Verzug für die nächste Stufe fehlt', async () => {
    // 20 Tage Verzug auf Stufe 'erinnerung' — die 1. Mahnung braucht 28.
    const { ergebnis } = await gate({ eintrag: { ...EINTRAG_OK, dunning_level: 'erinnerung' } })
    const p = punkt(ergebnis, 'stufenabstand')
    expect(p.stand).toBe('noch_nicht')
    expect(p.befund).toContain(String(DUNNING_DAYS.mahnung_1))
    expect(ergebnis.darfMahnen).toBe(false)
  })

  // Die eigentliche Sperre gegen zwei Stufen im selben Zeitraum.
  it('meldet NOCH_NICHT, solange die Wiedervorlage läuft', async () => {
    const { ergebnis } = await gate({
      rechnung: { ...RECHNUNG_OK, due_date: vorTagen(60) },
      eintrag: { ...EINTRAG_OK, dunning_level: 'erinnerung', next_dunning_at: inTagen(7) },
    })
    const p = punkt(ergebnis, 'stufenabstand')
    expect(p.stand).toBe('noch_nicht')
    expect(p.befund).toContain('Wiedervorlage')
  })

  it('gibt frei, sobald Frist und Wiedervorlage erreicht sind', async () => {
    const { ergebnis } = await gate({
      rechnung: { ...RECHNUNG_OK, due_date: vorTagen(30) },
      eintrag: { ...EINTRAG_OK, dunning_level: 'erinnerung', next_dunning_at: vorTagen(1) },
    })
    expect(punkt(ergebnis, 'stufenabstand').stand).toBe('frei')
    expect(ergebnis.naechsteStufe).toBe('mahnung_1')
  })

  it('sperrt auf der höchsten automatischen Stufe', async () => {
    const { ergebnis } = await gate({
      rechnung: { ...RECHNUNG_OK, due_date: vorTagen(200) },
      eintrag: { ...EINTRAG_OK, dunning_level: 'inkasso_vorbereitung' },
    })
    const p = punkt(ergebnis, 'stufenabstand')
    expect(p.stand).toBe('gesperrt')
    expect(p.befund).toContain('höchste automatisch erreichbare')
    expect(ergebnis.naechsteStufe).toBeNull()
  })

  it('ohne Mahneintrag beginnt die Leiter bei „offen"', async () => {
    const { ergebnis } = await gate({ eintrag: null })
    expect(ergebnis.aktuelleStufe).toBe('offen')
    expect(ergebnis.naechsteStufe).toBe('erinnerung')
  })
})

describe('10. Keine Doppelmahnung', () => {
  it('sperrt, wenn noch ein Mahnschreiben auf den Versand wartet', async () => {
    const { ergebnis } = await gate({ queue: [{ id: 'q1', status: 'wartend' }] })
    const p = punkt(ergebnis, 'doppelmahnung')
    expect(p.stand).toBe('gesperrt')
    expect(p.befund).toContain('zwei Mahnungen in einer Zustellung')
  })

  it('sperrt auch bei einem fehlgeschlagenen Versuch, der noch wiederholt wird', async () => {
    const { ergebnis } = await gate({ queue: [{ id: 'q1', status: 'fehlgeschlagen' }] })
    expect(punkt(ergebnis, 'doppelmahnung').stand).toBe('gesperrt')
  })

  it('bereits versendete oder aufgegebene Zeilen sperren nicht', async () => {
    const { ergebnis } = await gate({
      queue: [
        { id: 'q1', status: 'versendet' },
        { id: 'q2', status: 'aufgegeben' },
        { id: 'q3', status: 'storniert' },
      ],
    })
    expect(punkt(ergebnis, 'doppelmahnung').stand).toBe('frei')
    expect(ergebnis.darfMahnen).toBe(true)
  })

  // Hier bewusst NICHT fail-closed: der Consumer prüft unmittelbar vor
  // jedem Versand erneut. Eine unlesbare Warteschlange den ganzen Mahnlauf
  // anhalten zu lassen wäre der größere Schaden.
  it('eine unlesbare Warteschlange hält den Lauf nicht an', async () => {
    const { ergebnis } = await gate({ queueFehler: 'timeout' })
    expect(punkt(ergebnis, 'doppelmahnung').stand).toBe('frei')
    expect(punkt(ergebnis, 'doppelmahnung').befund).toContain('Consumer prüft')
  })
})

describe('MahnungGesperrtError', () => {
  it('trägt das ganze Ergebnis, nicht nur den Text', async () => {
    const { ergebnis } = await gate({ rechnung: { ...RECHNUNG_OK, status: 'bezahlt' } })
    const fehler = new MahnungGesperrtError(ergebnis)
    expect(fehler.ergebnis.status).toBe('GESPERRT')
    expect(fehler.message).toContain('bezahlt')
  })

  // Bei NOCH_NICHT_FAELLIG ist `sperren` leer — der Fehler müsste sonst
  // „Mahnung blockiert: " ohne Grund melden.
  it('nennt auch bei NOCH_NICHT_FAELLIG einen Grund', async () => {
    const { ergebnis } = await gate({ rechnung: { ...RECHNUNG_OK, due_date: inTagen(5) } })
    const fehler = new MahnungGesperrtError(ergebnis)
    expect(fehler.message).not.toBe('Mahnung blockiert: ')
    expect(fehler.message).toContain('noch nicht überschritten')
  })
})
