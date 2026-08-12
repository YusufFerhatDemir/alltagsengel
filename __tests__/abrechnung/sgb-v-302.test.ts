/**
 * Tests für das § 302-SGB-V-Gerüst (Block 17)
 * @see lib/abrechnung/sgb-v/
 */
import {
  loeseVersionAuf, giltAm, monatsStichtag,
  type SgbVFormatVersion,
} from '@/lib/abrechnung/sgb-v/versionen'
import { findeRouting, istGueltigeIK, type SgbVRouting } from '@/lib/abrechnung/sgb-v/routing'
import {
  bereiteHkpVor, pruefePosition, gueltigBis, HKP_VERORDNUNG_TYPE,
  type HkpVerordnung, type HkpLeistung, type HkpKlient,
} from '@/lib/abrechnung/sgb-v/positionen'
import { erzeugeSgbVDatei, exportImplementiert, SgbVSpecFehltError } from '@/lib/abrechnung/sgb-v/generator'
import { AUDIT_ENTITY_TYPES } from '@/lib/billing/core/audit'

// ── Fixtures ────────────────────────────────────────────────────

function version(over: Partial<SgbVFormatVersion> = {}): SgbVFormatVersion {
  return {
    id: 'v1',
    bezeichnung: 'Technische Anlage 1 — Version 21',
    format: 'edifact_slga_slla',
    ta_version: '21',
    gueltig_von: '2020-01-01',
    gueltig_bis: '2027-01-31',
    spec_bestaetigt: false,
    spec_quelle: null,
    hinweis: null,
    ...over,
  }
}

function verordnung(over: Partial<HkpVerordnung> = {}): HkpVerordnung {
  return {
    id: 'vo-1',
    client_id: 'c-1',
    verordnung_type: HKP_VERORDNUNG_TYPE,
    genehmigung_status: 'genehmigt',
    gueltig_von: '2026-08-01',
    gueltig_bis: '2026-08-31',
    genehmigung_bis: null,
    verordnung_nummer: 'M12-4711',
    genehmigung_aktenzeichen: 'AZ-99',
    kostentraeger_ik_nummer: '109519005',
    kostentraeger_name: 'Muster BKK',
    ...over,
  }
}

function leistung(over: Partial<HkpLeistung> = {}): HkpLeistung {
  return {
    id: 'l-1',
    client_id: 'c-1',
    verordnung_id: 'vo-1',
    date: '2026-08-10',
    duration_minutes: 30,
    service_type: 'Behandlungspflege',
    amount: 35,
    ...over,
  }
}

const klient: HkpKlient = {
  id: 'c-1',
  first_name: 'Erika',
  last_name: 'Mustermann',
  versichertennummer: 'A123456789',
  geburtsdatum: '1945-03-02',
  date_of_birth: null,
}

// ── Versionsengine ──────────────────────────────────────────────

describe('§ 302 Versionsengine', () => {
  it('monatsStichtag erzwingt JJJJ-MM', () => {
    expect(monatsStichtag('2026-08')).toBe('2026-08-01')
    expect(() => monatsStichtag('2026-8')).toThrow(/JJJJ-MM/)
    expect(() => monatsStichtag('August 2026')).toThrow(/JJJJ-MM/)
  })

  it('giltAm behandelt offenes Ende als unbegrenzt', () => {
    const offen = version({ gueltig_von: '2027-02-01', gueltig_bis: null })
    expect(giltAm(offen, '2027-02-01')).toBe(true)
    expect(giltAm(offen, '2099-01-01')).toBe(true)
    expect(giltAm(offen, '2027-01-31')).toBe(false)
  })

  it('sperrt, wenn gar keine Version hinterlegt ist', () => {
    const r = loeseVersionAuf([], '2026-08', 'edifact_slga_slla')
    expect(r.ok).toBe(false)
    expect(r.sperrgrund).toBe('keine_version_hinterlegt')
  })

  it('sperrt, wenn für den Monat keine Version gilt', () => {
    const r = loeseVersionAuf([version({ gueltig_von: '2027-02-01', gueltig_bis: null })], '2026-08', 'edifact_slga_slla')
    expect(r.ok).toBe(false)
    expect(r.sperrgrund).toBe('keine_version_gueltig')
  })

  it('sperrt fail-closed, solange die Spec nicht bestätigt ist', () => {
    const r = loeseVersionAuf([version({ spec_bestaetigt: false })], '2026-08', 'edifact_slga_slla')
    expect(r.ok).toBe(false)
    expect(r.sperrgrund).toBe('spec_nicht_bestaetigt')
    // Die Version wird trotzdem zurückgemeldet, damit die UI sie anzeigen kann.
    expect(r.version?.ta_version).toBe('21')
  })

  it('gibt frei, sobald die Spec bestätigt ist', () => {
    const r = loeseVersionAuf(
      [version({ spec_bestaetigt: true, spec_quelle: 'TA1 § 302, Stand 01/2026' })],
      '2026-08', 'edifact_slga_slla',
    )
    expect(r.ok).toBe(true)
    expect(r.sperrgrund).toBeNull()
  })

  it('nimmt beim Versionswechsel die neuere Anlage', () => {
    const alt = version({ id: 'alt', ta_version: '21', gueltig_von: '2020-01-01', gueltig_bis: null, spec_bestaetigt: true, spec_quelle: 'q' })
    const neu = version({ id: 'neu', ta_version: '22', gueltig_von: '2027-02-01', gueltig_bis: null, spec_bestaetigt: true, spec_quelle: 'q' })
    const r = loeseVersionAuf([alt, neu], '2027-03', 'edifact_slga_slla')
    expect(r.version?.ta_version).toBe('22')
  })

  it('trennt die Formate — HKP-XML erbt keine EDIFACT-Freigabe', () => {
    const edifact = version({ spec_bestaetigt: true, spec_quelle: 'q' })
    const r = loeseVersionAuf([edifact], '2026-08', 'xml_hkp')
    expect(r.ok).toBe(false)
    expect(r.sperrgrund).toBe('keine_version_hinterlegt')
  })
})

// ── Routing ─────────────────────────────────────────────────────

describe('§ 302 Kassen-Routing', () => {
  const basis: SgbVRouting = {
    id: 'r1',
    kostentraeger_ik: '109519005',
    kostentraeger_name: 'Muster BKK',
    kassenart: 'BKK',
    datenannahmestelle_ik: '660500345',
    datenannahmestelle_name: 'DAS Muster',
    annahme_format: 'edifact_slga_slla',
    gueltig_von: '2026-01-01',
    gueltig_bis: null,
    quelle: 'Kassenverzeichnis 01/2026',
  }

  it('istGueltigeIK verlangt genau 9 Ziffern', () => {
    expect(istGueltigeIK('109519005')).toBe(true)
    expect(istGueltigeIK('10951900')).toBe(false)
    expect(istGueltigeIK('1095190055')).toBe(false)
    expect(istGueltigeIK('10951900A')).toBe(false)
    expect(istGueltigeIK(null)).toBe(false)
  })

  it('meldet fehlenden Eintrag statt still zu scheitern', () => {
    const r = findeRouting([], '109519005', '2026-08-01')
    expect(r.ok).toBe(false)
    expect(r.problem).toBe('kein_eintrag')
  })

  it('meldet abgelaufenes Routing', () => {
    const r = findeRouting([{ ...basis, gueltig_bis: '2026-06-30' }], '109519005', '2026-08-01')
    expect(r.ok).toBe(false)
    expect(r.problem).toBe('nicht_gueltig')
  })

  it('meldet fehlende Datenannahmestelle', () => {
    const r = findeRouting([{ ...basis, datenannahmestelle_ik: null }], '109519005', '2026-08-01')
    expect(r.ok).toBe(false)
    expect(r.problem).toBe('annahmestelle_fehlt')
  })

  it('meldet fehlendes Annahmeformat', () => {
    const r = findeRouting([{ ...basis, annahme_format: null }], '109519005', '2026-08-01')
    expect(r.ok).toBe(false)
    expect(r.problem).toBe('format_fehlt')
  })

  it('nimmt bei Historie den jüngsten gültigen Eintrag', () => {
    const alt = { ...basis, id: 'alt', datenannahmestelle_name: 'ALT', gueltig_von: '2020-01-01', gueltig_bis: null }
    const neu = { ...basis, id: 'neu', datenannahmestelle_name: 'NEU', gueltig_von: '2026-01-01', gueltig_bis: null }
    const r = findeRouting([alt, neu], '109519005', '2026-08-01')
    expect(r.ok).toBe(true)
    expect(r.routing?.datenannahmestelle_name).toBe('NEU')
  })

  it('akzeptiert vollständiges Routing', () => {
    const r = findeRouting([basis], '109519005', '2026-08-01')
    expect(r.ok).toBe(true)
    expect(r.problem).toBeNull()
  })
})

// ── Positionsaufbereitung ───────────────────────────────────────

describe('§ 302 HKP-Positionen', () => {
  it('gueltigBis nimmt die frühere von Verordnung und Kassengenehmigung', () => {
    expect(gueltigBis(verordnung({ gueltig_bis: '2026-08-31', genehmigung_bis: '2026-08-15' }))).toBe('2026-08-15')
    expect(gueltigBis(verordnung({ gueltig_bis: '2026-08-10', genehmigung_bis: '2026-08-31' }))).toBe('2026-08-10')
    expect(gueltigBis(verordnung({ gueltig_bis: null, genehmigung_bis: null }))).toBeNull()
  })

  it('verlangt eine HKP-Verordnung (§ 37 SGB V, Muster 12)', () => {
    expect(pruefePosition(leistung(), undefined, klient)).toBe('keine_verordnung')
    // Ein anderer Verordnungstyp zählt nicht — § 45b läuft über § 105.
    expect(pruefePosition(leistung(), verordnung({ verordnung_type: 'entlastung_45b' }), klient))
      .toBe('keine_verordnung')
  })

  it('lehnt nicht genehmigte Verordnungen ab', () => {
    expect(pruefePosition(leistung(), verordnung({ genehmigung_status: 'beantragt' }), klient))
      .toBe('verordnung_nicht_genehmigt')
  })

  it('lehnt Leistungen ausserhalb des Verordnungszeitraums ab', () => {
    expect(pruefePosition(leistung({ date: '2026-07-20' }), verordnung(), klient)).toBe('verordnung_vor_beginn')
    expect(pruefePosition(leistung({ date: '2026-09-05' }), verordnung(), klient)).toBe('verordnung_abgelaufen')
  })

  it('lehnt ab, wenn die Kassengenehmigung früher endet als die Verordnung', () => {
    const vo = verordnung({ gueltig_bis: '2026-08-31', genehmigung_bis: '2026-08-05' })
    expect(pruefePosition(leistung({ date: '2026-08-10' }), vo, klient)).toBe('verordnung_abgelaufen')
  })

  it('verlangt neunstellige Krankenkassen-IK und Versichertennummer', () => {
    expect(pruefePosition(leistung(), verordnung({ kostentraeger_ik_nummer: '12345' }), klient))
      .toBe('kein_kostentraeger_ik')
    expect(pruefePosition(leistung(), verordnung(), { ...klient, versichertennummer: null }))
      .toBe('keine_versichertennummer')
  })

  it('verlangt einen positiven Betrag', () => {
    expect(pruefePosition(leistung({ amount: 0 }), verordnung(), klient)).toBe('kein_betrag')
    expect(pruefePosition(leistung({ amount: null }), verordnung(), klient)).toBe('kein_betrag')
  })

  it('akzeptiert eine vollständige Position', () => {
    expect(pruefePosition(leistung(), verordnung(), klient)).toBeNull()
  })

  it('rechnet Euro-Beträge in Cent um', () => {
    const r = bereiteHkpVor([leistung({ amount: 35 })], [verordnung()], [klient])
    expect(r.faelle[0].positionen[0].betrag_cent).toBe(3500)
    expect(r.summe_cent).toBe(3500)
  })

  it('gruppiert je Kasse UND Klient', () => {
    const klient2: HkpKlient = { ...klient, id: 'c-2', first_name: 'Hans', versichertennummer: 'B987654321' }
    const vo2 = verordnung({ id: 'vo-2', client_id: 'c-2' })
    const r = bereiteHkpVor(
      [
        leistung({ id: 'l-1', amount: 35 }),
        leistung({ id: 'l-2', amount: 35, date: '2026-08-11' }),
        leistung({ id: 'l-3', client_id: 'c-2', verordnung_id: 'vo-2', amount: 40 }),
      ],
      [verordnung(), vo2],
      [klient, klient2],
    )
    expect(r.faelle).toHaveLength(2)
    expect(r.anzahl_positionen).toBe(3)
    const fall1 = r.faelle.find(f => f.client_id === 'c-1')!
    expect(fall1.positionen).toHaveLength(2)
    expect(fall1.betrag_cent).toBe(7000)
  })

  it('liefert nicht abrechenbare Leistungen MIT Grund zurück statt sie zu verschweigen', () => {
    const r = bereiteHkpVor(
      [leistung({ id: 'ok' }), leistung({ id: 'spaet', date: '2026-12-01' })],
      [verordnung()],
      [klient],
    )
    expect(r.anzahl_positionen).toBe(1)
    expect(r.abgelehnt).toHaveLength(1)
    expect(r.abgelehnt[0].leistung_id).toBe('spaet')
    expect(r.abgelehnt[0].problem).toBe('verordnung_abgelaufen')
    expect(r.abgelehnt[0].hinweis).toMatch(/Verordnung/)
  })

  it('bleibt bei leerer Eingabe leer statt zu werfen', () => {
    const r = bereiteHkpVor([], [], [])
    expect(r.faelle).toHaveLength(0)
    expect(r.summe_cent).toBe(0)
    expect(r.abgelehnt).toHaveLength(0)
  })
})

// ── Fail-closed-Generator ───────────────────────────────────────

describe('§ 302 Generator (fail-closed)', () => {
  it('meldet den Export als nicht implementiert', () => {
    expect(exportImplementiert('edifact_slga_slla')).toBe(false)
    expect(exportImplementiert('xml_hkp')).toBe(false)
  })

  it('verweigert die Erzeugung mit erkennbarem Fehlercode', () => {
    const params = {
      aufbereitung: bereiteHkpVor([leistung()], [verordnung()], [klient]),
      version: version({ spec_bestaetigt: true, spec_quelle: 'q' }),
      absenderIk: '460629986',
      datenannahmestelleIk: '660500345',
      abrechnungsmonat: '2026-08',
      dateiindikator: '0' as const,
    }
    expect(() => erzeugeSgbVDatei(params)).toThrow(SgbVSpecFehltError)
    try {
      erzeugeSgbVDatei(params)
    } catch (e) {
      const err = e as SgbVSpecFehltError
      expect(err.code).toBe('SGB_V_SPEC_FEHLT')
      expect(err.format).toBe('edifact_slga_slla')
      expect(err.taVersion).toBe('21')
    }
  })

  it('bleibt gesperrt, auch wenn die Version fälschlich als bestätigt markiert ist', () => {
    // Doppelte Sperre: ein versehentliches spec_bestaetigt = true im Register
    // darf keine erfundene Datei erzeugen.
    expect(() => erzeugeSgbVDatei({
      aufbereitung: bereiteHkpVor([], [], []),
      version: version({ spec_bestaetigt: true, spec_quelle: 'irrtum' }),
      absenderIk: '460629986',
      datenannahmestelleIk: '660500345',
      abrechnungsmonat: '2026-08',
      dateiindikator: '2',
    })).toThrow(/gesperrt/)
  })
})

// ── Schema-Konsistenz ───────────────────────────────────────────

describe('§ 302 Audit-Entity-Typen', () => {
  it('kennt die neuen sgb_v-Typen (Migration 20260826020000)', () => {
    for (const typ of ['sgb_v_lauf', 'sgb_v_formatversion', 'sgb_v_routing']) {
      expect(AUDIT_ENTITY_TYPES as readonly string[]).toContain(typ)
    }
  })
})
