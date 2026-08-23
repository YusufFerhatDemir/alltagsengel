/**
 * Tests für die § 302-Pipeline-Erweiterung (WS2): Prüf-Export, Transport-
 * Adapter, Regelwerk-Hinweise, Leistungsart-Vokabular. Reine Funktionstests
 * ohne DB, analog zu __tests__/abrechnung/sgb-v-302.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { erzeugePruefExport, pruefExportAlsCsv, pruefExportAlsJson, PRUEF_EXPORT_HINWEIS } from '@/lib/abrechnung/sgb-v/export-generator'
import { MockAdapter, DakotaAdapter, KimAdapter, FileExportAdapter } from '@/lib/abrechnung/sgb-v/transport-adapter'
import { SGB_V_LEISTUNGSARTEN } from '@/lib/abrechnung/sgb-v/leistungsnachweis-service'
import { pruefeRegelwerk } from '@/lib/abrechnung/sgb-v/validierung'
import type { HkpAufbereitung, HkpFall } from '@/lib/abrechnung/sgb-v/positionen'

function fall(over: Partial<HkpFall> = {}): HkpFall {
  return {
    kostentraeger_ik: '123456789',
    kostentraeger_name: 'Testkasse',
    client_id: 'client-1',
    klient_name: 'Max Mustermann',
    versichertennummer: 'A123456789',
    positionen: [{
      leistung_id: 'leistung-1', client_id: 'client-1', klient_name: 'Max Mustermann',
      versichertennummer: 'A123456789', verordnung_id: 'v-1', verordnung_nummer: null,
      aktenzeichen: null, kostentraeger_ik: '123456789', kostentraeger_name: 'Testkasse',
      datum: '2026-08-05', dauer_minuten: 30, leistungsart: 'behandlungspflege', betrag_cent: 5000,
    }],
    betrag_cent: 5000,
    ...over,
  }
}

function aufbereitung(faelle: HkpFall[]): HkpAufbereitung {
  return {
    faelle,
    abgelehnt: [],
    summe_cent: faelle.reduce((s, f) => s + f.betrag_cent, 0),
    anzahl_positionen: faelle.reduce((s, f) => s + f.positionen.length, 0),
  }
}

describe('export-generator — Prüf-Export', () => {
  it('markiert den Export unmissverständlich als nicht amtlich', () => {
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung([fall()]), '2026-08-15T10:00:00.000Z')
    expect(exp.hinweis).toBe(PRUEF_EXPORT_HINWEIS)
    expect(exp.hinweis.toLowerCase()).toContain('kein amtlicher')
  })

  it('JSON-Export ist valides JSON mit den Kernfeldern', () => {
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung([fall()]), '2026-08-15T10:00:00.000Z')
    const parsed = JSON.parse(pruefExportAlsJson(exp))
    expect(parsed.anzahlFaelle).toBe(1)
    expect(parsed.gesamtbetragCent).toBe(5000)
  })

  it('CSV-Export trägt den Hinweis als Kommentarzeile und eine Zeile je Position', () => {
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung([fall()]), '2026-08-15T10:00:00.000Z')
    const csv = pruefExportAlsCsv(exp)
    const zeilen = csv.split('\n')
    expect(zeilen[0]).toContain('KEIN AMTLICHER')
    expect(zeilen).toHaveLength(3) // Kommentar + Kopfzeile + 1 Position
    expect(zeilen[2]).toContain('123456789')
  })

  // ── CSV-Injection (Delta Phase 4) ────────────────────────────────────
  // Der Klientenname stammt aus kundenseitigen Formularen. Ohne Entschärfung
  // führt Excel ihn beim Öffnen des Prüf-Exports als Formel aus.
  it('entschärft Formelzeichen im Klientennamen', () => {
    const boese = fall({ klient_name: '=HYPERLINK("http://example.invalid","hier")' })
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung([boese]), '2026-08-15T10:00:00.000Z')
    const zeile = pruefExportAlsCsv(exp).split('\n')[2]

    // Vorangestelltes Apostroph innerhalb der Zelle: Excel sieht Text.
    expect(zeile).toContain(`"'=HYPERLINK`)
    // Keine Zelle darf mit einem nackten = beginnen.
    for (const zelle of zeile.split(';')) {
      expect(zelle.startsWith('=')).toBe(false)
    }
  })

  it.each(['+49 170 1234', '-Rabatt', '@Sammelruf'])(
    'entschärft führendes Sonderzeichen: %s',
    (name) => {
      const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung([fall({ klient_name: name })]), '2026-08-15T10:00:00.000Z')
      expect(pruefExportAlsCsv(exp).split('\n')[2]).toContain(`"'${name}"`)
    },
  )

  it('hält die Spaltenzahl auch bei Semikolon, Anführungszeichen und Zeilenumbruch im Namen', () => {
    const exp = erzeugePruefExport(
      'lauf-1', '2026-08',
      aufbereitung([fall({ klient_name: 'Muster;mann "der\nZweite"' })]),
      '2026-08-15T10:00:00.000Z',
    )
    const csv = pruefExportAlsCsv(exp)
    // Der Zeilenumbruch steckt in einer quotierten Zelle und darf die
    // Datensatzstruktur nicht verschieben: Kommentar + Kopf + 1 Datensatz.
    // Zählung über Semikolons ausserhalb von Quotes ist hier unnötig — es
    // genügt, dass der Name vollständig in EINER Zelle steht.
    expect(csv).toContain('"Muster;mann ""der\nZweite"""')
  })
})

describe('transport-adapter — MockAdapter', () => {
  it('simuliert Erfolg ohne externe Wirkung', async () => {
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung([fall()]), '2026-08-15T10:00:00.000Z')
    const ergebnis = await new MockAdapter().send(exp)
    expect(ergebnis.erfolg).toBe(true)
    expect(ergebnis.zielReferenz).toBe('mock:lauf-1')
  })

  it('kann einen Fehlschlag simulieren', async () => {
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung([fall()]), '2026-08-15T10:00:00.000Z')
    const ergebnis = await new MockAdapter(true).send(exp)
    expect(ergebnis.erfolg).toBe(false)
  })
})

describe('transport-adapter — FileExportAdapter', () => {
  it('ruft die übergebene Speicherfunktion mit dem JSON-Export auf', async () => {
    const gespeichert: Array<{ dateiname: string; inhalt: string }> = []
    const adapter = new FileExportAdapter(async (dateiname, inhalt) => {
      gespeichert.push({ dateiname, inhalt })
      return `storage://${dateiname}`
    })
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung([fall()]), '2026-08-15T10:00:00.000Z')
    const ergebnis = await adapter.send(exp)
    expect(ergebnis.erfolg).toBe(true)
    expect(ergebnis.zielReferenz).toBe('storage://sgb-v-pruefexport_lauf-1.json')
    expect(gespeichert).toHaveLength(1)
    expect(JSON.parse(gespeichert[0].inhalt).laufId).toBe('lauf-1')
  })
})

describe('transport-adapter — Dakota/KIM sind fail-closed', () => {
  const ENV_VAR = 'SGB_V_302_FREIGABE'
  let vorher: string | undefined

  beforeEach(() => { vorher = process.env[ENV_VAR] })
  afterEach(() => {
    if (vorher === undefined) delete process.env[ENV_VAR]
    else process.env[ENV_VAR] = vorher
  })

  it('DakotaAdapter scheitert, wenn das Gate zu ist', async () => {
    delete process.env[ENV_VAR]
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung([fall()]), '2026-08-15T10:00:00.000Z')
    const ergebnis = await new DakotaAdapter().send(exp)
    expect(ergebnis.erfolg).toBe(false)
  })

  it('DakotaAdapter scheitert auch bei offenem Gate, weil der Generator nicht implementiert ist', async () => {
    process.env[ENV_VAR] = 'true'
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung([fall()]), '2026-08-15T10:00:00.000Z')
    const ergebnis = await new DakotaAdapter().send(exp)
    expect(ergebnis.erfolg).toBe(false)
    expect(ergebnis.meldung).toContain('nicht implementiert')
  })

  it('KimAdapter verhält sich identisch fail-closed', async () => {
    delete process.env[ENV_VAR]
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung([fall()]), '2026-08-15T10:00:00.000Z')
    const ergebnis = await new KimAdapter().send(exp)
    expect(ergebnis.erfolg).toBe(false)
  })
})

describe('leistungsnachweis-service — SGB-V-Leistungsarten', () => {
  it('enthält nur die im Schema etablierten § 37-Kategorien', () => {
    expect(SGB_V_LEISTUNGSARTEN).toEqual([
      'behandlungspflege', 'medikamentengabe', 'injektionen', 'wundversorgung',
      'kompressionsstruempfe', 'blutzuckermessung', 'katheter', 'stomaversorgung',
    ])
  })
})

describe('validierung — pruefeRegelwerk', () => {
  it('meldet fehlende Verordnung als Blocker, ohne die DB anzufassen', async () => {
    const leistung = { id: 'l1', client_id: 'c1', verordnung_id: null, date: '2026-08-05', duration_minutes: 30, service_type: 'behandlungspflege', amount: 50 }
    const ergebnis = await pruefeRegelwerk({} as any, 'org-1', leistung, undefined, undefined)
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.blocker.length).toBeGreaterThan(0)
  })

  it('meldet einen unplausiblen Pflegegrad nur als Hinweis, nicht als Blocker', async () => {
    const leistung = { id: 'l1', client_id: 'c1', verordnung_id: null, date: '2026-08-05', duration_minutes: 30, service_type: 'behandlungspflege', amount: 50 }
    const klient = { id: 'c1', first_name: 'Max', last_name: 'Mustermann', versichertennummer: 'A1', geburtsdatum: null, date_of_birth: null, care_level: 9 }
    const ergebnis = await pruefeRegelwerk({} as any, 'org-1', leistung, undefined, klient)
    expect(ergebnis.hinweise.some(h => h.includes('Pflegegrad'))).toBe(true)
    // Pflegegrad ist § 302 kein Blocker — nur die fehlende Verordnung ist einer.
    expect(ergebnis.blocker.every(b => !b.includes('Pflegegrad'))).toBe(true)
  })
})
