/**
 * PflegeCoach — die bezahlte Verlaengerung konnte still verloren gehen
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 55, 14.09.2026)
 *
 * `schalteZugangFrei()` laeuft NACH einer Zahlung (aus
 * `verbucheZahlung()`). Sie war als einzige Funktion des Moduls nicht
 * abgesichert:
 *
 *   * der Lesefehler der Bestandsabfrage wurde verworfen,
 *   * das UPDATE der Verlaengerung pruefte weder Fehler noch getroffene
 *     Zeilen — und PostgREST meldet bei null Zeilen keinen Fehler,
 *   * die Nachlese nach einem 23505 verwarf ihren Fehler ebenfalls und
 *     kehrte dann OHNE Verlaengerung zurueck.
 *
 * Folge: der Kunde hat bezahlt, `verbucheZahlung()` meldete Erfolg, und
 * `gueltig_bis` stand weiter auf dem alten Datum.
 *
 * Die Gegenfunktion `beendeZugang()` — die Zugang WEGNIMMT — prueft
 * beides seit jeher und begruendet es ausfuehrlich. Die Asymmetrie war
 * der Befund: der Weg, der etwas gibt, war laxer als der, der etwas nimmt.
 *
 * Live: coach_freischaltungen und coach_bestellungen sind leer. Kein
 * Schaden im Bestand.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const MODUL = readFileSync('lib/coach/verkauf-server.ts', 'utf8')

/** Der Rumpf von `schalteZugangFrei` bis zur naechsten Top-Level-Funktion. */
function rumpfVon(name: string): string {
  const ab = MODUL.indexOf(`export async function ${name}`)
  expect(ab, `${name} nicht gefunden`).toBeGreaterThan(-1)
  const rest = MODUL.slice(ab + 10)
  const bis = rest.indexOf('\nexport ')
  return rest.slice(0, bis === -1 ? undefined : bis)
}

describe('schalteZugangFrei — Fehler werden nicht mehr verworfen', () => {
  const rumpf = rumpfVon('schalteZugangFrei')

  it('die Bestandsabfrage nimmt ihren Fehler entgegen', () => {
    expect(rumpf).toContain('error: leseFehler')
    expect(rumpf).toContain('Es wurde NICHTS freigeschaltet')
  })

  it('das Verlaengerungs-UPDATE prueft den Fehler', () => {
    expect(rumpf).toContain('error: updateFehler')
  })

  it('und die getroffenen Zeilen — PostgREST meldet null Zeilen nicht', () => {
    // Ohne `.select('id')` und die Zeilenzahl waere ein wirkungsloses
    // UPDATE von einem erfolgreichen nicht zu unterscheiden.
    expect(rumpf).toContain('data: verlaengert')
    expect(rumpf).toContain('verlaengert.length === 0')
  })

  it('die Nachlese nach 23505 prueft ihren Fehler', () => {
    expect(rumpf).toContain('error: nachleseFehler')
    expect(rumpf).toContain('Der Zugang wurde NICHT')
  })

  it('und das Fortschreiben danach ebenfalls, inklusive Zeilenzahl', () => {
    expect(rumpf).toContain('error: nachtragFehler')
    expect(rumpf).toContain('nachgezogen.length === 0')
  })

  it('kein `await db` mehr ohne Ergebnisbindung', () => {
    // Die Form `await db.from(...).update(...)` ohne `const { … } =` ist
    // genau die, die den Fehler wegwirft.
    expect(rumpf).not.toMatch(/\n\s*await db\s*\n\s*\.from\('coach_freischaltungen'\)\s*\n\s*\.update/)
  })
})

describe('die Asymmetrie ist aufgehoben', () => {
  it('beendeZugang prueft weiterhin Fehler und Zeilenzahl', () => {
    const rumpf = rumpfVon('beendeZugang')
    expect(rumpf).toContain('beendenFehler')
    expect(rumpf).toContain('beendet.length === 0')
  })

  it('beide Wege werfen, statt still zurueckzukehren', () => {
    // `verbucheZahlung()` darf keinen Erfolg melden, wenn der Zugang nicht
    // tatsaechlich verlaengert wurde.
    for (const name of ['schalteZugangFrei', 'beendeZugang']) {
      expect(rumpfVon(name), name).toContain('throw new Error(')
    }
  })

  it('schalteZugangFrei wird nach einer Zahlung gerufen', () => {
    // Ohne diesen Bezug waere der Befund eine Stilfrage. Die Kette ist
    // Stripe-Webhook -> aktiviereBestellung -> schalteZugangFrei; die
    // aufrufende Funktion nennt sich selbst „Aktiviert eine BEZAHLTE
    // Bestellung".
    expect(rumpfVon('aktiviereBestellung')).toContain('await schalteZugangFrei(')
    expect(MODUL).toContain('Aktiviert eine bezahlte Bestellung')
    const webhook = readFileSync('app/api/coach/webhook/route.ts', 'utf8')
    expect(webhook).toContain('await aktiviereBestellung(')
  })
})
