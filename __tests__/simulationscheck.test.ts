/**
 * Simulationscheck — Regressionswächter (19.08.2026)
 *
 * ZWECK
 * An fünf Stellen kann dieses System etwas tun, das wie Produktivbetrieb
 * aussieht, ohne es zu sein: eine EDIFACT-Datei mit Echtdatei-Indikator, eine
 * simulierte KIM-Zustellung, ein § 302-Lauf ohne verifizierte Tarife, ein
 * DTA-Transport ohne Gegenstelle, ein Zertifikat ohne ITSG. Für jede dieser
 * Stellen ist eine Sicherung gebaut. Diese Suite hält sie fest.
 *
 * WARUM ZUM TEIL ÜBER DEN QUELLTEXT
 * Manche Sicherungen sind keine Funktion, sondern eine Abwesenheit — dass
 * `sendePerSFTP` KEINEN Erfolgspfad ohne Verbindung hat, lässt sich nicht
 * aufrufen. Solche Punkte werden am Quelltext geprüft. Das ist gröber als ein
 * Verhaltenstest, aber besser als eine Prüfung, die es nur einmal gab.
 *
 * Läuft mit: npx vitest run __tests__/simulationscheck.test.ts
 */
import { describe, expect, test, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

import { DATEIINDIKATOR } from '@/lib/abrechnung/betriebsmodus'
import { generateEDIFACT, physikalischerDateiname, type AbrechnungsFall, type GeneratorOptionen } from '@/lib/abrechnung/edifact-generator'
import { ermittleVersandModus, istSimulierteNachricht, mitSimulationsMarker, pruefeVersandModus, simulationsMarker } from '@/lib/kim/versandmodus'
import { MockKimProvider } from '@/lib/kim/mock-provider'

const quelle = (pfad: string) => readFileSync(pfad, 'utf-8')

// ═══ 1. EDIFACT — Testlieferung ist erkennbar ═══════════════════

describe('1. EDIFACT-Testlieferung', () => {
  // Feldnamen und Prüfziffern wie in lib/abrechnung/__tests__/edifact-generator.test.ts —
  // eine erfundene IK ohne gültige Prüfziffer scheitert am Validator statt an der Sache.
  const FALL: AbrechnungsFall = {
    verordnung_id: 'v-1',
    client: {
      versichertennummer: 'A123456780',
      geburtsdatum: '1948-03-12',
      nachname: 'Müller',
      vorname: 'Erika',
      pflegegrad: 3,
      strasse: 'Hauptstraße',
      hausnummer: '12',
      plz: '60311',
      ort: 'Frankfurt',
    },
    kostentraeger: {
      ik_nummer: '182171012',
      pflegekasse_ik: '182171012',
      name: 'KKH Kaufmännische Krankenkasse',
    },
    leistungen: [{
      datum: '2026-08-05',
      leistungsart: 'entlastung_45b',
      menge: 1,
      einzelpreis_cent: 13100,
      pflegekraft_name: 'A. Engel',
      beschaeftigtennummer: '123456789',
    }],
    abrechnungsmonat: '202608',
  } as unknown as AbrechnungsFall

  const OPTIONEN: GeneratorOptionen = {
    bundesland: 'hessen',
    rechnungsdatum: new Date('2026-08-19T08:00:00Z'),
  }

  test('der Dateiindikator trennt Test von Echt', () => {
    expect(DATEIINDIKATOR.test).toBe('0')
    expect(DATEIINDIKATOR.produktion).toBe('2')
  })

  test('ohne ausdrückliche Angabe entsteht eine Testdatei', () => {
    const datei = generateEDIFACT([FALL], '460629986', OPTIONEN)
    const unb = datei.inhalt.split('\n').find(z => z.startsWith('UNB+'))!
    expect(unb.endsWith("+0'")).toBe(true)
  })

  test('der physikalische Dateiname folgt dem Indikator (T… statt E…)', () => {
    expect(physikalischerDateiname(1, true).startsWith('T')).toBe(true)
    expect(physikalischerDateiname(1, false).startsWith('E')).toBe(true)

    const test0 = generateEDIFACT([FALL], '460629986', { ...OPTIONEN, dateiindikator: '0' })
    expect(test0.physikalischer_dateiname.startsWith('T')).toBe(true)
    const echt = generateEDIFACT([FALL], '460629986', { ...OPTIONEN, dateiindikator: '2' })
    expect(echt.physikalischer_dateiname.startsWith('E')).toBe(true)
  })

  test('die Verfahrenskennung der Auftragsdatei hängt am Dateiindikator', () => {
    // Die Auftragsdatei kündigt die Lieferung an. Stünde dort EPFL0 (Echt),
    // während die Nutzdaten als TPFL0nnn erzeugt werden, kündigte eine
    // Testlieferung sich als Echtabrechnung an.
    const engine = quelle('lib/abrechnung/kassenabrechnung-engine.ts')
    expect(engine).toMatch(/const istTestlieferung = dateiindikator === '0'/)
    expect(engine).toMatch(/test: istTestlieferung/)
  })

  test('der Indikator kommt aus dem Betriebsmodus, nicht vom Aufrufer', () => {
    const engine = quelle('lib/abrechnung/kassenabrechnung-engine.ts')
    expect(engine).toMatch(/await dateiindikatorFuer\(supabase, lauf\.organization_id, 'sftp_105'\)/)
    expect(engine).not.toMatch(/dateiindikator: '2'/)

    // § 302 darf herunterstufen, aber nie heraufstufen.
    const versand302 = quelle('lib/abrechnung/sgb-v/versand.ts')
    expect(versand302).toMatch(/dateiindikatorFuer\(supabase, organizationId, 'sftp_302'\)/)
    expect(versand302).toMatch(/betriebsIndikator === '2' && params\.dateiindikator !== '0' \? '2' : '0'/)
  })
})

// ═══ 2. KIM — simulierte Zustellung ist gekennzeichnet ══════════

describe('2. KIM-Simulationskennzeichnung', () => {
  const vorher = process.env.KIM_AKTIV
  afterEach(() => {
    if (vorher === undefined) delete process.env.KIM_AKTIV
    else process.env.KIM_AKTIV = vorher
  })

  test('der Mock-Provider bekennt sich als Simulation', () => {
    const info = new MockKimProvider().getProviderInfo()
    expect(info.isSimulated).toBe(true)
  })

  test('bei geschlossenem Gate ist der Versand erlaubt, aber gekennzeichnet', () => {
    delete process.env.KIM_AKTIV
    const modus = ermittleVersandModus(new MockKimProvider())
    expect(modus.erlaubt).toBe(true)
    expect(modus.simuliert).toBe(true)

    const marker = simulationsMarker(modus)
    expect(marker).not.toBeNull()
    expect(marker!.simuliert).toBe(true)
    expect(marker!.hinweis).toMatch(/KEIN Zustellnachweis/)

    const metadata = mitSimulationsMarker({ vorhandenes: 'feld' }, marker)
    expect(metadata.vorhandenes).toBe('feld')
    expect(istSimulierteNachricht(metadata)).toBe(true)
  })

  test('bei offenem Gate wird ein Simulator hart abgewiesen', () => {
    process.env.KIM_AKTIV = 'true'
    const provider = new MockKimProvider()
    expect(ermittleVersandModus(provider).erlaubt).toBe(false)
    expect(() => pruefeVersandModus(provider)).toThrow(/KIM_AKTIV steht auf true/)
  })

  test('eine unmarkierte Nachricht gilt nicht als simuliert', () => {
    expect(istSimulierteNachricht(null)).toBe(false)
    expect(istSimulierteNachricht({})).toBe(false)
  })

  test('Ein- und Ausgang kennzeichnen an derselben Stelle, an der sie den Status setzen', () => {
    for (const pfad of ['lib/kim/outbox-service.ts', 'lib/kim/inbox-service.ts']) {
      const code = quelle(pfad)
      expect(code, pfad).toMatch(/pruefeVersandModus\(provider\)/)
      expect(code, pfad).toMatch(/mitSimulationsMarker\(/)
    }
  })

  test('der Block-18-Versandpfad wirft weiterhin bedingungslos', () => {
    expect(quelle('lib/kim/versand.ts')).toMatch(/throw/)
  })
})

// ═══ 3. § 302 SGB V — Tarifprüfung hält den Lauf an ═════════════

describe('3. SGB-V-Tarifprüfung', () => {
  const versand = quelle('lib/abrechnung/sgb-v/versand.ts')

  test('ein Lauf ohne verifizierte Tarife wird gestoppt, nicht gekürzt', () => {
    expect(versand).toMatch(/if \(!tarifPruefung\.ok\) \{/)
    expect(versand).toMatch(/return stoppe\(\s*'tarif'/)
    expect(versand).toMatch(/verifizierten § 37-Tarif/)
  })

  test('es gibt keine Teilabrechnung an der Tarifprüfung vorbei', () => {
    // Der gefährliche Weg wäre, die betroffenen Positionen still wegzulassen:
    // die Kasse bekäme eine unvollständige Abrechnung, die vollständig aussieht.
    expect(versand).toMatch(/ohne Teilabrechnung/)
  })

  test('der Generator wirft, solange die Technische Anlage fehlt', () => {
    expect(quelle('lib/abrechnung/sgb-v/generator.ts')).toMatch(/throw new SgbVSpecFehltError/)
  })
})

// ═══ 4. DAKOTA / DTA — keine vorgetäuschte Verbindung ═══════════

describe('4. DAKOTA/DTA-Transport', () => {
  const transport = quelle('lib/abrechnung/transport.ts')

  test('der Transport nutzt einen echten SFTP-Client, keinen Stub', () => {
    expect(transport).toMatch(/import SftpClient from 'ssh2-sftp-client'/)
    expect(transport).not.toMatch(/simuliert|Simulation|mockUpload|fakeUpload/i)
  })

  test('ohne Schlüsselmaterial wird die Verbindung nicht aufgebaut', () => {
    expect(transport).toMatch(/weder SSH-Key noch Passwort konfiguriert/)
  })

  test('ohne Bundesland-Freischaltung bricht die Übermittlung ab', () => {
    expect(transport).toMatch(/DAKOTA_NICHT_FREIGESCHALTET/)
    expect(transport).toMatch(/es entsteht keine Forderung/)
  })

  test('der KIM-Transportweg meldet keinen Erfolg, sondern wirft', () => {
    expect(transport).toMatch(/ist noch nicht implementiert/)
  })
})

// ═══ 5. ITSG — kein Fake-Zertifikat ═════════════════════════════

describe('5. ITSG-Zertifikat', () => {
  const zert = quelle('lib/abrechnung/zertifikate.ts')

  test('es wird kein Zertifikat erzeugt, nur gelesen und geprüft', () => {
    expect(zert).not.toMatch(/createCertificate|selfSigned|setSubject\(/)
    expect(zert).toMatch(/forge\.pki\.certificateFromPem|forge\.pki\.certificateFromAsn1/)
  })

  test('ohne hinterlegtes Zertifikat gibt es keinen Ersatzweg', () => {
    expect(zert).toMatch(/Kein gueltiges Absender-Zertifikat/)
    expect(zert).toMatch(/SECON_ZERT_PASSWORT ist nicht als Env-Variable gesetzt/)
  })

  test('das Gate hängt an einer Umgebungsvariable, nicht an einem Admin-Klick', () => {
    const freigaben = quelle('lib/abrechnung/externe-freigaben.ts')
    expect(freigaben).toMatch(/envVariable: 'ITSG_ZERTIFIZIERT'/)
    expect(freigaben).toMatch(/process\.env\[EXTERNE_FREIGABEN\[freigabe\]\.envVariable\] === 'true'/)
  })
})
