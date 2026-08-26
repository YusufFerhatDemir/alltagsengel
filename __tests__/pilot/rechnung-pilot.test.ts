// ═══════════════════════════════════════════════════════════════════════
// RECHNUNGS-PILOT — der Trockenlauf vor dem ersten echten Versand
//
// Der 16-Punkte-Preflight hat eine eigene Suite
// (__tests__/billing/rechnung-preflight.test.ts) — die wird hier NICHT
// wiederholt. Geprüft wird ausschließlich, was der Pilot HINZUFÜGT:
//
//   1. Die drei Urteile kommen richtig zustande, auch wenn Preflight und
//      Pilot-Sperren zu verschiedenen Ergebnissen kämen.
//   2. Die drei unabhängigen Doppelversand-Beine greifen einzeln.
//   3. Fail-closed: eine nicht lesbare Quelle BLOCKIERT, sie beruhigt nicht.
//   4. Der Pilot versendet und schreibt nichts.
//   5. Die Auftragsliste des Auftraggebers deckt den Katalog vollständig ab
//      — in beide Richtungen.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'
import {
  pruefeRechnungFuerPilot,
  pilotBerichtAlsText,
  verdeckeEmail,
  AUFTRAGS_KATALOG,
  type RechnungPilotBericht,
} from '@/lib/pilot/rechnung-pilot'

const ORG = '00000000-0000-4000-8000-000000000042'
const INV = '00000000-0000-4000-8000-0000000000cc'
const JETZT = new Date('2026-08-26T12:00:00.000Z')

// ---------------------------------------------------------------------------
// Eine Rechnung, an der alle 16 Punkte erfüllt sind
// ---------------------------------------------------------------------------

const RECHNUNG_OK = {
  id: INV,
  organization_id: ORG,
  client_id: 'client-1',
  invoice_number: 'RE-2026-0001',
  invoice_number_formatted: 'RE-2026-0001',
  status: 'freigegeben',
  correction_type: null,
  correction_of: null,
  total_amount: 150.5,
  period_start: '2026-07-01',
  period_end: '2026-07-31',
  due_date: '2026-08-14',
  sent_at: null,
  frozen_at: '2026-08-01T10:00:00Z',
  deleted_at: null,
}

const KLIENT_OK = {
  id: 'client-1',
  organization_id: ORG,
  first_name: 'Erika',
  last_name: 'Schmidt',
  email: 'erika.schmidt@web.de',
  address: 'Hauptstraße 1',
  city: 'Frankfurt',
  zip_code: '60311',
  insurance_name: null,
  status: 'active',
}

const POSITION_OK = {
  id: 'item-1',
  invoice_id: INV,
  description: 'Alltagsbegleitung',
  date: '2026-07-05',
  duration_minutes: 120,
  amount: 150.5,
  budget_type: 'private',
  tariff_preis_cent: 7525,
}

const ORG_OK = {
  id: ORG,
  name: 'Alltagsengel UG (haftungsbeschränkt)',
  iban: 'DE02120300000000202051',
  bic: 'BYLADEM1001',
  bank_name: 'Deutsche Kreditbank',
  settings: {},
}

interface Lage {
  rechnung?: Record<string, unknown> | null
  klient?: Record<string, unknown> | null
  org?: Record<string, unknown> | null
  positionen?: Record<string, unknown>[]
  /** Erfolgszeilen in invoice_email_log. */
  emailLogTreffer?: number
  emailLogFehler?: string
  /** Erfolgszeilen in notification_delivery_log. */
  zustellspurTreffer?: number
  zustellspurFehler?: string
  /** Offene Sperren. */
  sperren?: { schwere: string; grund: string; invoice_id: string | null; gesetzt_am: string }[]
  sperreFehler?: string
}

function db(lage: Lage = {}) {
  const rechnung = lage.rechnung === undefined ? RECHNUNG_OK : lage.rechnung
  return (a: FakeAufruf) => {
    switch (a.tabelle) {
      case 'invoices': {
        const idFilter = a.filter.find(f => f.methode === 'eq' && f.spalte === 'id')?.wert
        if (a.filter.some(f => f.spalte === 'invoice_number_formatted')) return { data: [{ id: INV }] }
        if (idFilter === INV) return { data: rechnung }
        return { data: { id: idFilter } }
      }
      case 'clients':
        return { data: lage.klient === undefined ? KLIENT_OK : lage.klient }
      case 'organizations':
        return { data: lage.org === undefined ? ORG_OK : lage.org }
      case 'invoice_items':
        return { data: lage.positionen ?? [POSITION_OK] }
      case 'invoice_packages':
        return { data: { pdf_url: 'https://storage.example/paket.pdf', page_count: 2 } }
      case 'billing_audit_trail':
        return { data: [], count: 3 }
      case 'invoice_email_log':
        return lage.emailLogFehler
          ? { error: { message: lage.emailLogFehler } }
          : { count: lage.emailLogTreffer ?? 0 }
      case 'notification_delivery_log':
        return lage.zustellspurFehler
          ? { error: { message: lage.zustellspurFehler } }
          : { count: lage.zustellspurTreffer ?? 0 }
      case 'pilot_versand_sperre':
        return lage.sperreFehler
          ? { error: { message: lage.sperreFehler } }
          : { data: lage.sperren ?? [] }
      default:
        return { data: [] }
    }
  }
}

async function pilot(lage: Lage = {}) {
  const fake = erstelleFakeSupabase(db(lage))
  const bericht = await pruefeRechnungFuerPilot(fake.client, {
    invoiceId: INV, organizationId: ORG, jetzt: JETZT,
  })
  return { bericht, fake }
}

function pilotBefund(b: RechnungPilotBericht, art: string) {
  return b.pilotBefunde.find(x => x.art === art)
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Die drei Urteile
// ═══════════════════════════════════════════════════════════════════════

describe('Urteile', () => {
  it('eine vollständige Rechnung ohne Sperre ist READY_FOR_SEND', async () => {
    const { bericht } = await pilot()
    // Fällt dieser Test, blockiert etwas grundlos und alle folgenden
    // Auslöse-Tests sind wertlos.
    expect(bericht.blocker).toEqual([])
    expect(bericht.zuPruefen).toEqual([])
    expect(bericht.urteil).toBe('READY_FOR_SEND')
    expect(bericht.preflightStatus).toBe('READY_FOR_SEND')
  })

  it('eine Rechnung mit fehlenden Daten ist BLOCKED', async () => {
    // Kein Klient, keine Positionen, keine Bankdaten: mehrere Punkte
    // gleichzeitig verletzt.
    const { bericht } = await pilot({
      rechnung: { ...RECHNUNG_OK, client_id: null },
      klient: null,
      positionen: [],
      org: { ...ORG_OK, iban: null, bic: null },
    })
    expect(bericht.urteil).toBe('BLOCKED')
    expect(bericht.blocker.length).toBeGreaterThan(1)
  })

  it('erkannte Testdaten führen zu BLOCKED', async () => {
    const { bericht } = await pilot({
      klient: { ...KLIENT_OK, email: 'erika@example.org' },
    })
    expect(bericht.urteil).toBe('BLOCKED')
    expect(bericht.punkte.find(p => p.schluessel === 'testdaten')?.stand).toBe('blockiert')
  })

  it('ein Testmandant führt zu BLOCKED', async () => {
    const { bericht } = await pilot({ org: { ...ORG_OK, name: 'Testmandant Nord' } })
    expect(bericht.urteil).toBe('BLOCKED')
  })

  it('eine unsichere, aber nicht falsche Lage ist NEEDS_REVIEW', async () => {
    // Ein inaktiver Klient ist kein Beweis für einen Fehler — er ist ein
    // Grund hinzusehen. Der Preflight stellt das zur Sichtung.
    const { bericht } = await pilot({ klient: { ...KLIENT_OK, status: 'inactive' } })
    expect(bericht.urteil).toBe('NEEDS_REVIEW')
    expect(bericht.zuPruefen.length).toBeGreaterThan(0)
  })

  it('eine Pilot-Sperre schlägt ein grünes Preflight-Ergebnis', async () => {
    const { bericht } = await pilot({ emailLogTreffer: 1 })
    expect(bericht.preflightStatus).toBe('READY_FOR_SEND')
    expect(bericht.urteil).toBe('BLOCKED')
    // Beide Urteile stehen im Bericht — die Differenz ist kein Fehler.
    expect(bericht.blocker.length).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Die drei Doppelversand-Beine
// ═══════════════════════════════════════════════════════════════════════

describe('Doppelversand-Beine', () => {
  it('Bein 2: eine Erfolgszeile im Versandprotokoll blockiert, auch bei leerem sent_at', async () => {
    const { bericht } = await pilot({ emailLogTreffer: 1 })
    expect(pilotBefund(bericht, 'protokoll_dublette')?.sperrt).toBe(true)
    // sent_at ist leer — Punkt 15 des Preflights sieht deshalb nichts.
    expect(bericht.punkte.find(p => p.schluessel === 'kein_doppelversand')?.stand).toBe('erfuellt')
    expect(bericht.urteil).toBe('BLOCKED')
  })

  it('Bein 3: eine Erfolgszeile in der Zustellspur blockiert', async () => {
    const { bericht } = await pilot({ zustellspurTreffer: 1 })
    expect(pilotBefund(bericht, 'zustellspur_dublette')?.sperrt).toBe(true)
    expect(bericht.urteil).toBe('BLOCKED')
  })

  it('das Versandprotokoll wird org-gefenced und auf Erfolg gefiltert gelesen', async () => {
    const { fake } = await pilot()
    const a = fake.ersterAuf('invoice_email_log')
    expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(true)
    expect(hatFilter(a, 'eq', 'invoice_id', INV)).toBe(true)
    // Ohne den Statusfilter zählte ein FEHLGESCHLAGENER Versuch als
    // erfolgter Versand und blockierte den Erstversand dauerhaft.
    expect(hatFilter(a, 'eq', 'status', 'versendet')).toBe(true)
  })

  it('die Zustellspur wird auf Kanal und Erfolgsstatus gefiltert', async () => {
    const { fake } = await pilot()
    const a = fake.ersterAuf('notification_delivery_log')
    expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(true)
    expect(hatFilter(a, 'eq', 'correlation_id', INV)).toBe(true)
    expect(hatFilter(a, 'eq', 'channel', 'email')).toBe(true)
    expect(hatFilter(a, 'in', 'status', ['sent', 'delivered'])).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Versandsperre
// ═══════════════════════════════════════════════════════════════════════

describe('Versandsperre', () => {
  it('eine Sperre auf diese Rechnung blockiert', async () => {
    const { bericht } = await pilot({
      sperren: [{ schwere: 'P0', grund: 'Nachprüfung ergab zwei Protokollzeilen.', invoice_id: INV, gesetzt_am: '2026-08-25T09:00:00Z' }],
    })
    expect(pilotBefund(bericht, 'versandsperre')?.sperrt).toBe(true)
    expect(bericht.urteil).toBe('BLOCKED')
  })

  it('eine mandantenweite Sperre (invoice_id NULL) blockiert ebenfalls', async () => {
    const { bericht } = await pilot({
      sperren: [{ schwere: 'P0', grund: 'Fremde Organisation im Protokoll.', invoice_id: null, gesetzt_am: '2026-08-25T09:00:00Z' }],
    })
    expect(pilotBefund(bericht, 'versandsperre')?.befund).toContain('mandantenweit')
    expect(bericht.urteil).toBe('BLOCKED')
  })

  it('eine Sperre auf eine ANDERE Rechnung blockiert diese hier nicht', async () => {
    const { bericht } = await pilot({
      sperren: [{ schwere: 'P0', grund: 'Anderer Beleg.', invoice_id: 'andere-rechnung', gesetzt_am: '2026-08-25T09:00:00Z' }],
    })
    expect(pilotBefund(bericht, 'versandsperre')).toBeUndefined()
    expect(bericht.urteil).toBe('READY_FOR_SEND')
  })

  it('nur offene Sperren werden gelesen — aufgehobene halten nichts auf', async () => {
    const { fake } = await pilot()
    expect(hatFilter(fake.ersterAuf('pilot_versand_sperre'), 'is', 'aufgehoben_am', null)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Fail-closed
// ═══════════════════════════════════════════════════════════════════════

describe('Fail-closed', () => {
  it('ein unlesbares Versandprotokoll blockiert, statt zu beruhigen', async () => {
    const { bericht } = await pilot({ emailLogFehler: 'permission denied for table invoice_email_log' })
    expect(pilotBefund(bericht, 'quelle_unlesbar')?.sperrt).toBe(true)
    expect(bericht.urteil).toBe('BLOCKED')
  })

  it('eine unlesbare Zustellspur blockiert', async () => {
    const { bericht } = await pilot({ zustellspurFehler: 'connection reset' })
    expect(bericht.urteil).toBe('BLOCKED')
  })

  it('eine unlesbare Sperrtabelle gilt als gesetzte Sperre', async () => {
    const { bericht } = await pilot({ sperreFehler: 'relation "pilot_versand_sperre" does not exist' })
    expect(bericht.urteil).toBe('BLOCKED')
    expect(bericht.blocker.join(' ')).toContain('gilt als gesetzt')
  })

  it('eine geworfene Ausnahme blockiert genauso wie ein Fehlerfeld', async () => {
    // Der PostgREST-Client meldet einen Verbindungsabbruch als Ausnahme,
    // nicht als `error` — genau der Befund F-1 aus Phase 7.
    const fake = erstelleFakeSupabase(a => {
      if (a.tabelle === 'invoice_email_log') throw new Error('fetch failed')
      return db()(a)
    })
    const bericht = await pruefeRechnungFuerPilot(fake.client, { invoiceId: INV, organizationId: ORG })
    expect(bericht.urteil).toBe('BLOCKED')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Keine Nebenwirkung
// ═══════════════════════════════════════════════════════════════════════

describe('Keine Nebenwirkung', () => {
  it('schreibt nichts', async () => {
    const { fake } = await pilot()
    expect(fake.aufrufe.filter(a => a.operation !== 'select')).toEqual([])
  })

  it('schreibt auch im Blockierfall nichts', async () => {
    const { fake } = await pilot({ emailLogTreffer: 2, sperren: [{ schwere: 'P0', grund: 'x', invoice_id: null, gesetzt_am: '2026-08-25T09:00:00Z' }] })
    expect(fake.aufrufe.filter(a => a.operation !== 'select')).toEqual([])
  })

  // Geprüft werden die IMPORT-Zeilen, nicht der Dateiinhalt: der Modulkopf
  // nennt den Versandweg in Prosa (er grenzt sich ja gerade von ihm ab), und
  // ein Textscan über die ganze Datei fände genau diese Erklärung.
  it('importiert den Versandweg nicht — sonst könnte ein Trockenlauf senden', () => {
    const quelle = readFileSync(join(process.cwd(), 'lib', 'pilot', 'rechnung-pilot.ts'), 'utf8')
    const importe = quelle.split('\n').filter(z => /^\s*(import|export)\b.*\bfrom\b/.test(z) || /\bawait import\(/.test(z))
    const verboten = ['rechnung-versand', 'sendRawEmail', 'rechnung-paket', 'notifications', 'mahn-versand']
    for (const v of verboten) {
      expect(importe.join('\n'), `Import von ${v} würde einen Versandweg in den Trockenlauf holen`).not.toContain(v)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. Auftragskatalog
// ═══════════════════════════════════════════════════════════════════════

describe('Auftragskatalog', () => {
  it('nennt die siebzehn Gegenstände des Auftrags', () => {
    expect(AUFTRAGS_KATALOG.map(a => a.name)).toEqual([
      'Organisation', 'Kunde', 'Rechnungsnummer', 'Empfänger', 'Leistungszeitraum',
      'Positionen', 'Preise', 'Steuern', 'Betrag', 'IBAN', 'Rechnungssteller',
      'PDF', 'ZUGFeRD', 'Audit', 'Duplikat-Schutz', 'Cross-Tenant', 'Testdaten',
    ])
  })

  it('jeder Auftragsname trifft einen existierenden Punkt', async () => {
    const { bericht } = await pilot()
    const vorhanden = new Set(bericht.punkte.map(p => p.schluessel))
    for (const a of AUFTRAGS_KATALOG) {
      expect(vorhanden.has(a.schluessel), `${a.name} → ${a.schluessel} fehlt im Katalog`).toBe(true)
    }
  })

  it('kein Katalogpunkt bleibt ohne Auftragsnamen', async () => {
    const { bericht } = await pilot()
    const abgedeckt = new Set(AUFTRAGS_KATALOG.map(a => a.schluessel))
    for (const p of bericht.punkte) {
      expect(abgedeckt.has(p.schluessel), `Punkt ${p.nummer} (${p.schluessel}) ist keinem Auftragsnamen zugeordnet`).toBe(true)
    }
  })

  it('die Auftragspunkte tragen den Stand des jeweiligen Katalogpunkts', async () => {
    const { bericht } = await pilot({ org: { ...ORG_OK, iban: null } })
    const iban = bericht.auftragspunkte.find(a => a.name === 'IBAN')!
    expect(iban.stand).toBe('blockiert')
    // „Organisation" und „Rechnungssteller" sind derselbe Punkt.
    const org = bericht.auftragspunkte.find(a => a.name === 'Organisation')!
    const steller = bericht.auftragspunkte.find(a => a.name === 'Rechnungssteller')!
    expect(org.befund).toBe(steller.befund)
  })

  it('liefert immer alle 16 Punkte', async () => {
    const { bericht } = await pilot()
    expect(bericht.punkte).toHaveLength(16)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7. Betrag und Bericht
// ═══════════════════════════════════════════════════════════════════════

describe('Betrag', () => {
  it('gibt den Betrag zusätzlich in Cent aus — das ist der Wert, gegen den das Token bindet', async () => {
    const { bericht } = await pilot()
    expect(bericht.betragEuro).toBe(150.5)
    expect(bericht.betragCent).toBe(15050)
  })
})

describe('Textfassung', () => {
  it('trägt das Urteil in Zeile 1', async () => {
    const { bericht } = await pilot()
    expect(pilotBerichtAlsText(bericht).split('\n')[0]).toContain('READY_FOR_SEND')
  })

  it('gibt die vollständige E-Mail-Adresse nicht aus', async () => {
    const { bericht } = await pilot()
    const text = pilotBerichtAlsText(bericht)
    expect(text).not.toContain('erika.schmidt@web.de')
    expect(text).toContain('@web.de')
  })

  it('nennt alle 16 Punkte', async () => {
    const { bericht } = await pilot()
    const text = pilotBerichtAlsText(bericht)
    for (const p of bericht.punkte) expect(text).toContain(p.titel)
  })
})

describe('verdeckeEmail', () => {
  it('behält die Domain, verdeckt den lokalen Teil', () => {
    expect(verdeckeEmail('max.mustermann@example.org')).toBe('m***@example.org')
  })

  it('gibt bei fehlender Adresse einen Strich aus', () => {
    expect(verdeckeEmail(null)).toBe('—')
  })

  it('verdeckt eine kaputte Adresse vollständig, statt sie durchzureichen', () => {
    expect(verdeckeEmail('keine-adresse')).toBe('***')
    expect(verdeckeEmail('@nurdomain')).toBe('***')
  })
})
