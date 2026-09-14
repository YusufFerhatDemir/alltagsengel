/**
 * Die Übernahme, die sich gegen ihren eigenen Auftrag richtete
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 74)
 *
 * Vor der Übertragung übernimmt `versendeDakotaAuftrag()` den Auftrag:
 *
 *     .update({ status: 'uebermittlung_laeuft' })
 *     .neq('status', 'uebermittlung_laeuft')
 *
 * Das ist Absicht und richtig — zwei gleichzeitige Läufe dürfen dieselbe
 * Auftragsdatei nicht zweimal an die Annahmestelle schicken.
 *
 * Entkam aus dem Übertragungsblock aber eine Ausnahme, blieb der Auftrag
 * genau dort stehen. Von da an richtete sich die Sperre gegen ihren
 * eigenen Auftrag: jeder weitere Anlauf endete mit „steht bereits auf
 * uebermittlung_laeuft — es wurde NICHTS uebertragen". Dauerhaft, ohne
 * Eingriff in der Datenbank.
 *
 * Dass `sendePerSFTP` ein eigenes try/catch hat, deckt das nicht ab:
 * `pruefeDakotaFreigabe()` steht dort VOR dem try, und `mitWiederholung`
 * umschließt `aktion` nicht — eine Ausnahme aus der Aktion reicht bis zum
 * Aufrufer durch. Der erste Test unten hält genau diese Voraussetzung
 * fest.
 *
 * WOHIN DER AUFTRAG GELÖST WIRD: `technischer_fehler`, nicht zurück auf
 * den alten Stand. Nach einer entkommenen Ausnahme ist UNBEKANNT, ob
 * Daten hinausgegangen sind; ein automatisch freigegebener zweiter Versand
 * wäre die doppelt eingereichte Kassenabrechnung — der schlimmere Schaden.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { mitWiederholung } from '@/lib/abrechnung/retry'

const MODUL = readFileSync('lib/abrechnung/versand.ts', 'utf8')
const RETRY = readFileSync('lib/abrechnung/retry.ts', 'utf8')

describe('Die Voraussetzung: eine Ausnahme kommt beim Aufrufer an', () => {
  it('mitWiederholung fängt die Aktion nicht ab', async () => {
    await expect(mitWiederholung(
      async () => { throw new Error('Gate zu') },
      { bewerte: () => ({ erfolg: false, phase: 'verbindung', fehler: null }) },
    )).rejects.toThrow('Gate zu')
  })

  it('und wiederholt sie dabei auch nicht', async () => {
    let versuche = 0
    await expect(mitWiederholung(
      async () => { versuche++; throw new Error('Gate zu') },
      { bewerte: () => ({ erfolg: false, phase: 'verbindung', fehler: null }) },
    )).rejects.toThrow()
    expect(versuche).toBe(1)
  })

  it('der Rumpf umschließt `aktion` weiterhin nicht', () => {
    // Wird das eines Tages geändert, gehört der Riegel im Aufrufer noch
    // einmal angesehen — deshalb steht die Annahme hier und nicht nur im
    // Kommentar.
    const schleife = RETRY.slice(RETRY.indexOf('for (let versuch = 1'))
    expect(schleife).toContain('letztes = await aktion(versuch)')
    expect(schleife.slice(0, schleife.indexOf('letztes = await aktion')))
      .not.toContain('try {')
  })
})

describe('Der Übertragungsblock steht unter einem Riegel', () => {
  const STELLE = MODUL.slice(
    MODUL.indexOf('const versandStart = new Date().toISOString()'),
    MODUL.indexOf('const ergebnis = wiederholung.ergebnis'),
  )

  it('die Übertragung läuft in einem try', () => {
    expect(STELLE).toContain('wiederholung = await uebertrage()')
    expect(STELLE).toContain('} catch (err) {')
  })

  it('und der catch löst die Übernahme', () => {
    expect(STELLE).toContain('const freigabeVermerk = await zaehleVersuch(')
    expect(STELLE).toContain("status: 'technischer_fehler'")
  })

  it('NICHT zurück auf den alten Stand — der Ausgang ist unbekannt', () => {
    const catchTeil = STELLE.slice(STELLE.indexOf('} catch (err) {'))
    expect(catchTeil).not.toContain('auftrag.status')
    expect(catchTeil).toMatch(/UNBEKANNT/)
  })

  it('der Versuchszähler wächst auch hier', () => {
    // Sonst fehlte gerade der Versuch in der Zahl, an der ein
    // systematisches Problem auffallen soll.
    const catchTeil = STELLE.slice(STELLE.indexOf('} catch (err) {'))
    expect(catchTeil).toContain('auftrag.versand_versuche ?? 0')
  })

  it('der Fehlercode unterscheidet ihn vom Transportfehler', () => {
    const catchTeil = STELLE.slice(STELLE.indexOf('} catch (err) {'))
    expect(catchTeil).toContain("fehler_code: 'UNERWARTET'")
  })
})

describe('Scheitert auch die Lösung, sagt die Meldung es', () => {
  const CATCH = MODUL.slice(
    MODUL.indexOf('} catch (err) {', MODUL.indexOf('wiederholung = await uebertrage()')),
    MODUL.indexOf('const ergebnis = wiederholung.ergebnis'),
  )

  it('sie nennt beide Fälle getrennt', () => {
    expect(CATCH).toContain('freigabeVermerk.ok')
    expect(CATCH).toMatch(/nicht aus "uebermittlung_laeuft" geloest/)
  })

  it('und die Folge: gar nicht mehr versendbar', () => {
    expect(CATCH).toMatch(/gar nicht mehr versenden/)
  })

  it('die ursprüngliche Ausnahme bleibt in der Meldung', () => {
    expect(CATCH).toMatch(/unerwartet abgebrochen: \$\{meldung\}/)
  })
})

describe('Die Übernahme selbst bleibt, wie sie war', () => {
  it('sperrt weiterhin gegen den doppelten Versand', () => {
    expect(MODUL).toContain(".neq('status', 'uebermittlung_laeuft')")
  })

  it('und prüft Fehler wie getroffene Zeilen', () => {
    const teil = MODUL.slice(MODUL.indexOf("const { data: uebernommen, error: uebernahmeFehler }"))
      .slice(0, 900)
    expect(teil).toContain('if (uebernahmeFehler) {')
    expect(teil).toContain('uebernommen.length === 0')
  })
})
