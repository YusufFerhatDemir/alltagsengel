// ═══════════════════════════════════════════════════════════════════════
// DATEV-Export-Service (lib/billing/datev/export-service.ts)
//
// Der Service hatte bis hierher keinen Verhaltenstest — die einzige
// Erwähnung im Testbestand war ein Quelltext-Grep in
// __tests__/security/produktions-readiness.test.ts. Getestet waren nur
// seine Bausteine (datev-format), nicht die Orchestrierung, und genau dort
// sitzen die Entscheidungen, die Geld betreffen:
//
//   · Läuft der Export ohne vollständige Steuerberater-Konfiguration?
//   · Kann derselbe Zeitraum zweimal exportiert werden (Doppelbuchung
//     beim Steuerberater)?
//   · Landet bei FEHLGESCHLAGENER Prüfung trotzdem eine Datei im Storage?
//   · Sieht ein anderer Mandant die Exporte oder lädt er sie herunter?
//
// Bewusst ECHT gelassen: datev-format, datev-validator, kontenrahmen.
// Ein Test, der die Prüfung wegmockt, könnte über den fail-closed-Pfad
// gar nichts aussagen. Gemockt sind nur die beiden DB-Bausteine
// (getDatevConfig, generateBuchungssaetze) und der Audit-Schreiber.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'
import type { DatevBuchungssatz } from '@/lib/billing/datev/datev-format'
import type { DatevConfig } from '@/lib/billing/datev/datev-config'

const ORG = '00000000-0000-4000-8000-000460629986'
const FREMDE_ORG = '00000000-0000-4000-8000-000000000999'
const AKTEUR = '00000000-0000-4000-8000-00000000a001'
const VON = '2026-07-01'
const BIS = '2026-07-31'

const getDatevConfig = vi.fn()
const generateBuchungssaetze = vi.fn()
const logBillingAction = vi.fn()

vi.mock('@/lib/billing/datev/datev-config', async (importOriginal) => ({
  // isDatevConfigComplete bleibt echt — es IST die geprüfte Regel.
  ...(await importOriginal<typeof import('@/lib/billing/datev/datev-config')>()),
  getDatevConfig: (...a: unknown[]) => getDatevConfig(...a),
}))
vi.mock('@/lib/billing/datev/buchungssatz-generator', () => ({
  generateBuchungssaetze: (...a: unknown[]) => generateBuchungssaetze(...a),
}))
vi.mock('@/lib/billing/core/audit', () => ({
  logBillingAction: (...a: unknown[]) => logBillingAction(...a),
}))

const {
  erstelleDatevExport,
  getDatevExportListe,
  downloadDatevExport,
  DatevPruefungFehlgeschlagen,
} = await import('@/lib/billing/datev/export-service')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONFIG_VOLLSTAENDIG: DatevConfig = {
  beraternummer: '1234567',
  mandantennummer: '54321',
  kontenrahmen: 'SKR03',
  wjBeginn: '01-01',
  sachkontenlaenge: 4,
  naechsteDebitorennummer: 10001,
  erzeugerKuerzel: 'AE',
}

/** Eine Buchung, die die echte Prüfung besteht. */
function buchung(ueberschreibung: Partial<DatevBuchungssatz> = {}): DatevBuchungssatz {
  return {
    umsatz: 100,
    sollHaben: 'S',
    konto: '10000',      // Debitor
    gegenkonto: '8120',  // SKR03: Steuerfreie Erloese Pflege
    belegdatum: '3107',
    belegnummer: 'RE-2026-0001',
    buchungstext: 'Pflegeleistungen Juli 2026',
    ustSchluessel: 0,
    ...ueberschreibung,
  }
}

function generatorErgebnis(buchungen: DatevBuchungssatz[]) {
  return {
    buchungen,
    statistik: {
      rechnungen: buchungen.length, zahlungen: 0, gutschriften: 0,
      mahngebuehren: 0, ruecklastschriften: 0, gesamt: buchungen.length,
    },
  }
}

const PARAMS = { organizationId: ORG, zeitraumVon: VON, zeitraumBis: BIS, actorId: AKTEUR }

/** Antwortgeber: kein bestehender Export, Insert liefert eine ID. */
function standardAntworten(aufruf: FakeAufruf) {
  if (aufruf.tabelle === 'datev_exports') {
    if (aufruf.operation === 'insert') return { data: { id: 'export-1' } }
    return { data: [] }
  }
  return {}
}

beforeEach(() => {
  getDatevConfig.mockReset().mockResolvedValue(CONFIG_VOLLSTAENDIG)
  generateBuchungssaetze.mockReset().mockResolvedValue(generatorErgebnis([buchung()]))
  logBillingAction.mockReset().mockResolvedValue(undefined)
})

// ═══════════════════════════════════════════════════════════════════════
// Konfigurations-Gate
// ═══════════════════════════════════════════════════════════════════════

describe('erstelleDatevExport — unvollständige Steuerberater-Konfiguration', () => {
  it('bricht ab und nennt die fehlenden Felder', async () => {
    getDatevConfig.mockResolvedValue({ ...CONFIG_VOLLSTAENDIG, beraternummer: '', mandantennummer: '' })
    const fake = erstelleFakeSupabase(standardAntworten)

    await expect(erstelleDatevExport(fake.client, PARAMS))
      .rejects.toThrow(/DATEV-Konfiguration unvollstaendig.*Beraternummer.*Mandantennummer/s)
  })

  it('schreibt dabei weder eine Datei noch einen Export-Datensatz', async () => {
    getDatevConfig.mockResolvedValue({ ...CONFIG_VOLLSTAENDIG, beraternummer: '' })
    const fake = erstelleFakeSupabase(standardAntworten)

    await erstelleDatevExport(fake.client, PARAMS).catch(() => undefined)

    expect(fake.speicherAufrufe).toEqual([])
    expect(fake.auf('datev_exports')).toEqual([])
    expect(generateBuchungssaetze).not.toHaveBeenCalled()
  })

  it('lehnt eine Beraternummer mit falschem Format ab, nicht nur eine leere', async () => {
    getDatevConfig.mockResolvedValue({ ...CONFIG_VOLLSTAENDIG, beraternummer: 'ABC' })
    const fake = erstelleFakeSupabase(standardAntworten)

    await expect(erstelleDatevExport(fake.client, PARAMS))
      .rejects.toThrow(/Beraternummer \(Format: 1-7 Ziffern\)/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Duplikat-Gate
// ═══════════════════════════════════════════════════════════════════════

describe('erstelleDatevExport — derselbe Zeitraum zweimal', () => {
  it('bricht ab, wenn für den Zeitraum bereits ein Export existiert', async () => {
    const fake = erstelleFakeSupabase(a =>
      a.tabelle === 'datev_exports' && a.operation === 'select'
        ? { data: [{ id: 'alt', status: 'erstellt' }] }
        : standardAntworten(a))

    await expect(erstelleDatevExport(fake.client, PARAMS))
      .rejects.toThrow(/existiert bereits ein Export/)
  })

  it('sucht den Duplikat-Kandidaten mit Mandanten-Fence und beiden Zeitraumgrenzen', async () => {
    const fake = erstelleFakeSupabase(standardAntworten)
    await erstelleDatevExport(fake.client, PARAMS)

    const suche = fake.auf('datev_exports').find(a => a.operation === 'select')
    expect(hatFilter(suche, 'eq', 'organization_id', ORG)).toBe(true)
    expect(hatFilter(suche, 'eq', 'zeitraum_von', VON)).toBe(true)
    expect(hatFilter(suche, 'eq', 'zeitraum_bis', BIS)).toBe(true)
    // Ein fehlgeschlagener Lauf darf einen erneuten Versuch nicht sperren.
    expect(hatFilter(suche, 'neq', 'status', 'fehler')).toBe(true)
  })

  it('überspringt die Prüfung nur mit force=true', async () => {
    const fake = erstelleFakeSupabase(a =>
      a.tabelle === 'datev_exports' && a.operation === 'select'
        ? { data: [{ id: 'alt', status: 'erstellt' }] }
        : standardAntworten(a))

    await expect(erstelleDatevExport(fake.client, { ...PARAMS, force: true })).resolves.toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Leerer Zeitraum
// ═══════════════════════════════════════════════════════════════════════

describe('erstelleDatevExport — nichts zu buchen', () => {
  it('erzeugt keine leere Datei, sondern bricht ab', async () => {
    generateBuchungssaetze.mockResolvedValue(generatorErgebnis([]))
    const fake = erstelleFakeSupabase(standardAntworten)

    await expect(erstelleDatevExport(fake.client, PARAMS))
      .rejects.toThrow(/Keine Buchungsvorfaelle im Zeitraum/)
    expect(fake.speicherAuf('upload')).toEqual([])
  })

  it('protokolliert einen Generator-Absturz als fehlgeschlagenen Lauf', async () => {
    generateBuchungssaetze.mockRejectedValue(new Error('Rechnungen nicht lesbar'))
    const fake = erstelleFakeSupabase(standardAntworten)

    await expect(erstelleDatevExport(fake.client, PARAMS)).rejects.toThrow('Rechnungen nicht lesbar')

    const insert = fake.auf('datev_exports').find(a => a.operation === 'insert')
    const nutzlast = insert?.payload as Record<string, unknown>
    expect(nutzlast.status).toBe('fehler')
    expect(nutzlast.organization_id).toBe(ORG)
    expect(nutzlast.fehler_details).toContain('Rechnungen nicht lesbar')
    expect(fake.speicherAuf('upload')).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Fail-Closed bei fehlgeschlagener Prüfung — der wichtigste Fall
// ═══════════════════════════════════════════════════════════════════════

describe('erstelleDatevExport — der Buchungsstapel besteht die Prüfung nicht', () => {
  // Konto und Gegenkonto identisch: die echte Stapelprüfung meldet dafür
  // KONTO_GLEICH_GEGENKONTO als Fehler.
  const kaputt = buchung({ konto: '8120', gegenkonto: '8120' })

  it('wirft DatevPruefungFehlgeschlagen mit den Befunden am Fehler', async () => {
    generateBuchungssaetze.mockResolvedValue(generatorErgebnis([kaputt]))
    const fake = erstelleFakeSupabase(standardAntworten)

    const fehler = await erstelleDatevExport(fake.client, PARAMS).catch(e => e)
    expect(fehler).toBeInstanceOf(DatevPruefungFehlgeschlagen)
    expect(fehler.ergebnis.ok).toBe(false)
    expect(fehler.ergebnis.fehler.map((f: { code: string }) => f.code)).toContain('KONTO_GLEICH_GEGENKONTO')
  })

  it('legt NICHTS im Storage ab — weder CSV noch Protokoll', async () => {
    generateBuchungssaetze.mockResolvedValue(generatorErgebnis([kaputt]))
    const fake = erstelleFakeSupabase(standardAntworten)

    await erstelleDatevExport(fake.client, PARAMS).catch(() => undefined)
    expect(fake.speicherAufrufe).toEqual([])
  })

  it('legt keinen "erstellt"-Datensatz an, sondern genau einen mit status=fehler', async () => {
    generateBuchungssaetze.mockResolvedValue(generatorErgebnis([kaputt]))
    const fake = erstelleFakeSupabase(standardAntworten)

    await erstelleDatevExport(fake.client, PARAMS).catch(() => undefined)

    const inserts = fake.auf('datev_exports').filter(a => a.operation === 'insert')
    expect(inserts).toHaveLength(1)
    const nutzlast = inserts[0].payload as Record<string, unknown>
    expect(nutzlast.status).toBe('fehler')
    expect(nutzlast.datei_pfad).toBeUndefined()
    expect(String(nutzlast.fehler_details)).toContain('KONTO_GLEICH_GEGENKONTO')
  })

  it('schreibt keinen Audit-Eintrag über einen erzeugten Export', async () => {
    generateBuchungssaetze.mockResolvedValue(generatorErgebnis([kaputt]))
    const fake = erstelleFakeSupabase(standardAntworten)

    await erstelleDatevExport(fake.client, PARAMS).catch(() => undefined)
    expect(logBillingAction).not.toHaveBeenCalled()
  })

  it('greift auch bei einem Buchungsdatum außerhalb des Exportzeitraums', async () => {
    // Klassischer Periodenfehler: Augustbeleg im Juli-Export.
    generateBuchungssaetze.mockResolvedValue(generatorErgebnis([buchung({ belegdatum: '1508' })]))
    const fake = erstelleFakeSupabase(standardAntworten)

    const fehler = await erstelleDatevExport(fake.client, PARAMS).catch(e => e)
    expect(fehler).toBeInstanceOf(DatevPruefungFehlgeschlagen)
    expect(fehler.ergebnis.fehler.map((f: { code: string }) => f.code)).toContain('DATUM_AUSSERHALB_ZEITRAUM')
    expect(fake.speicherAufrufe).toEqual([])
  })

  it('greift bei einem negativen Umsatz (DATEV trägt das Vorzeichen im S/H)', async () => {
    generateBuchungssaetze.mockResolvedValue(generatorErgebnis([buchung({ umsatz: -100 })]))
    const fake = erstelleFakeSupabase(standardAntworten)

    const fehler = await erstelleDatevExport(fake.client, PARAMS).catch(e => e)
    expect(fehler.ergebnis.fehler.map((f: { code: string }) => f.code)).toContain('BETRAG_NICHT_POSITIV')
    expect(fake.speicherAufrufe).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Erfolgsfall
// ═══════════════════════════════════════════════════════════════════════

describe('erstelleDatevExport — sauberer Lauf', () => {
  it('liefert CSV, Protokoll und die ID des Export-Datensatzes', async () => {
    const fake = erstelleFakeSupabase(standardAntworten)
    const ergebnis = await erstelleDatevExport(fake.client, PARAMS)

    expect(ergebnis.exportId).toBe('export-1')
    expect(ergebnis.buchungenAnzahl).toBe(1)
    expect(ergebnis.pruefung.ok).toBe(true)
    expect(ergebnis.csvContent).toContain('EXTF')
    expect(ergebnis.csvContent).toContain('RE-2026-0001')
    expect(ergebnis.protokoll).toContain('DATEV-Export Protokoll')
  })

  it('legt CSV und Protokoll unter mandantenbezogenen Pfaden ab', async () => {
    const fake = erstelleFakeSupabase(standardAntworten)
    await erstelleDatevExport(fake.client, PARAMS)

    const uploads = fake.speicherAuf('upload')
    expect(uploads.map(u => u.pfad)).toEqual([
      `datev/${ORG}/${VON}_${BIS}.csv`,
      `datev/${ORG}/${VON}_${BIS}_protokoll.txt`,
    ])
    expect(uploads.every(u => u.bucket === 'dta-dateien')).toBe(true)
    // DATEV liest Windows-1252, nicht UTF-8 — Umlaute kämen sonst falsch an.
    expect((uploads[0].optionen as { contentType: string }).contentType).toMatch(/windows-1252/)
  })

  it('schreibt den Export-Datensatz mit Mandant, Zeitraum und Dateipfad', async () => {
    const fake = erstelleFakeSupabase(standardAntworten)
    await erstelleDatevExport(fake.client, PARAMS)

    const nutzlast = fake.auf('datev_exports').find(a => a.operation === 'insert')!.payload as Record<string, unknown>
    expect(nutzlast).toMatchObject({
      organization_id: ORG,
      zeitraum_von: VON,
      zeitraum_bis: BIS,
      status: 'erstellt',
      buchungen_anzahl: 1,
      datei_pfad: `datev/${ORG}/${VON}_${BIS}.csv`,
      created_by: AKTEUR,
    })
  })

  it('schreibt einen Audit-Eintrag mit Mandant und Export-ID', async () => {
    const fake = erstelleFakeSupabase(standardAntworten)
    await erstelleDatevExport(fake.client, PARAMS)

    expect(logBillingAction).toHaveBeenCalledTimes(1)
    expect(logBillingAction.mock.calls[0][1]).toMatchObject({
      entityType: 'datev_export',
      organizationId: ORG,
      entityId: 'export-1',
      action: 'created',
      actorId: AKTEUR,
    })
  })

  it('scheitert laut, wenn der Export-Datensatz nicht geschrieben werden kann', async () => {
    const fake = erstelleFakeSupabase(a =>
      a.tabelle === 'datev_exports' && a.operation === 'insert'
        ? { error: { message: 'RLS verweigert' } }
        : standardAntworten(a))

    await expect(erstelleDatevExport(fake.client, PARAMS))
      .rejects.toThrow(/Export-Datensatz konnte nicht erstellt werden.*RLS verweigert/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Liste und Download — Mandantentrennung
// ═══════════════════════════════════════════════════════════════════════

describe('getDatevExportListe', () => {
  it('liest ausschließlich mit Mandanten-Fence, neueste zuerst', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    await getDatevExportListe(fake.client, ORG)

    const abfrage = fake.ersterAuf('datev_exports', 'select')
    expect(hatFilter(abfrage, 'eq', 'organization_id', ORG)).toBe(true)
    expect(hatFilter(abfrage, 'order', 'export_datum')).toBe(true)
  })

  it('meldet einen Lesefehler, statt eine leere Liste zurückzugeben', async () => {
    // Eine still geschluckte Fehlermeldung sähe aus wie "noch keine Exporte".
    const fake = erstelleFakeSupabase(() => ({ error: { message: 'Spalte fehlt' } }))
    await expect(getDatevExportListe(fake.client, ORG)).rejects.toThrow(/Export-Liste konnte nicht geladen werden/)
  })
})

describe('downloadDatevExport', () => {
  const EXPORT_ZEILE = {
    id: 'export-1',
    datei_pfad: `datev/${ORG}/${VON}_${BIS}.csv`,
    zeitraum_von: VON,
    zeitraum_bis: BIS,
    status: 'erstellt',
  }

  const inhalt = (text: string) => ({
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  })

  it('sucht den Export mit ID UND Mandanten-Fence', async () => {
    const fake = erstelleFakeSupabase(
      a => (a.tabelle === 'datev_exports' && a.operation === 'select' ? { data: EXPORT_ZEILE } : {}),
      s => (s.operation === 'download' ? { data: inhalt('EXTF;…') } : {}),
    )
    await downloadDatevExport(fake.client, ORG, 'export-1')

    const abfrage = fake.ersterAuf('datev_exports', 'select')
    expect(hatFilter(abfrage, 'eq', 'id', 'export-1')).toBe(true)
    expect(hatFilter(abfrage, 'eq', 'organization_id', ORG)).toBe(true)
  })

  it('gibt einem fremden Mandanten nichts heraus', async () => {
    // Der Fence sitzt im Filter; die DB antwortet dann leer. Der Service
    // muss daraus einen Fehler machen, nicht eine leere Datei.
    const fake = erstelleFakeSupabase(
      a => (a.tabelle === 'datev_exports' ? { data: null } : {}),
      () => ({}),
    )
    await expect(downloadDatevExport(fake.client, FREMDE_ORG, 'export-1'))
      .rejects.toThrow(/Export nicht gefunden/)
    expect(fake.speicherAufrufe).toEqual([])
  })

  it('meldet eine fehlende Storage-Datei, statt eine leere CSV zu liefern', async () => {
    const fake = erstelleFakeSupabase(
      a => (a.tabelle === 'datev_exports' ? { data: EXPORT_ZEILE } : {}),
      s => (s.pfad.endsWith('.csv') ? { error: { message: 'Object not found' } } : {}),
    )
    await expect(downloadDatevExport(fake.client, ORG, 'export-1'))
      .rejects.toThrow(/CSV-Datei konnte nicht geladen werden/)
  })

  it('liefert einen Platzhalter, wenn nur das Protokoll fehlt', async () => {
    const fake = erstelleFakeSupabase(
      a => (a.tabelle === 'datev_exports' && a.operation === 'select' ? { data: EXPORT_ZEILE } : {}),
      s => (s.pfad.endsWith('.csv') ? { data: inhalt('EXTF;…') } : { data: null }),
    )
    const ergebnis = await downloadDatevExport(fake.client, ORG, 'export-1')
    expect(new TextDecoder().decode(ergebnis.protokoll)).toBe('Kein Protokoll vorhanden.')
    expect(new TextDecoder().decode(ergebnis.csv)).toBe('EXTF;…')
    expect(ergebnis.dateiname).toBe(`DATEV_${VON}_${BIS}`)
  })

  it('setzt den Status nur um, solange er "erstellt" ist', async () => {
    // Ohne diesen Filter würde ein zweiter Download einen bereits
    // abgeschlossenen Export erneut umschreiben.
    const fake = erstelleFakeSupabase(
      a => (a.tabelle === 'datev_exports' && a.operation === 'select' ? { data: EXPORT_ZEILE } : {}),
      s => (s.operation === 'download' ? { data: inhalt('EXTF;…') } : {}),
    )
    await downloadDatevExport(fake.client, ORG, 'export-1')

    const update = fake.auf('datev_exports').find(a => a.operation === 'update')
    expect(update?.payload).toEqual({ status: 'heruntergeladen' })
    expect(hatFilter(update, 'eq', 'id', 'export-1')).toBe(true)
    expect(hatFilter(update, 'eq', 'status', 'erstellt')).toBe(true)
  })
})
