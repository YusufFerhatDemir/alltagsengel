/**
 * Der Wiederholungslauf, der Zugestelltes noch einmal schickte
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 93)
 *
 * Der Retry-Worker sammelt zuerst die offenen Zustellungen und zieht
 * davon ab, was BEREITS angekommen ist. Genau diese zweite Abfrage
 * verwarf ihren Lesefehler: `erledigt` blieb leer, und der Lauf schickte
 * Nachrichten ERNEUT, die schon zugestellt sind — an Kunden und Engel.
 *
 * Die Abfrage unmittelbar darunter — die Dead-Letter-Zeilen — prüft ihren
 * Fehler (`if (!totFehler)`). Dieselbe Funktion, zwei Maßstäbe.
 *
 * Eine doppelte Nachricht lässt sich nicht zurücknehmen; ein
 * übersprungener Takt schon. Deshalb: leere Rückgabe statt halber Menge.
 *
 * ── UND EINE FALSCHE BEGRÜNDUNG ──────────────────────────────────────
 * `sammleVoraussetzungenKlient()` prüft vor der Einsatzfreigabe, ob ein
 * gültiger Vertrag besteht. Der verworfene Lesefehler wurde zu „Kein
 * aktiver Vertrag vorhanden" — fail-closed, der Einsatz wird also nicht
 * freigegeben, das ist richtig. Falsch war die Aussage ÜBER den
 * Vertragsbestand: wer ihr folgt, sucht nach einem Vertrag, der da ist.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const RETRY = readFileSync('lib/notifications/retry.ts', 'utf8')
const FREIGABE = readFileSync('lib/personal/einsatzfreigabe.ts', 'utf8')

describe('Der Retry-Worker wiederholt nichts Zugestelltes', () => {
  it('nimmt den Lesefehler der Erfolgsliste entgegen', () => {
    expect(RETRY).toContain('const { data: erfolge, error: erfolgeFehler }')
    expect(RETRY).toContain('if (erfolgeFehler) {')
  })

  it('und überspringt dann den ganzen Takt', () => {
    const ab = RETRY.indexOf('if (erfolgeFehler) {')
    const teil = RETRY.slice(ab, ab + 500)
    expect(teil).toContain('return []')
    expect(teil).toMatch(/wiederholt nichts/)
  })

  it('der Riegel steht VOR dem Aufbau von `erledigt`', () => {
    expect(RETRY.indexOf('if (erfolgeFehler) {'))
      .toBeLessThan(RETRY.indexOf('for (const e of erfolge ?? []) {'))
  })

  it('die Dead-Letter-Prüfung daneben bleibt, wie sie war', () => {
    expect(RETRY).toContain('if (!totFehler) {')
  })

  it('die Begründung nennt den Unterschied', () => {
    expect(RETRY).toMatch(/laesst sich nicht zuruecknehmen/)
  })
})

describe('Die Einsatzfreigabe sagt, was sie NICHT geprüft hat', () => {
  it('nimmt den Lesefehler entgegen', () => {
    expect(FREIGABE).toContain('const { data: vertraege, error: vertraegeFehler }')
    expect(FREIGABE).toContain('if (vertraegeFehler) {')
  })

  it('bleibt fail-closed — der Einsatz wird nicht freigegeben', () => {
    const ab = FREIGABE.indexOf('if (vertraegeFehler) {')
    const teil = FREIGABE.slice(ab, ab + 500)
    expect(teil).toContain('probleme.push(')
    expect(teil).toMatch(/nicht freigegeben/)
  })

  it('behauptet aber nichts über den Vertragsbestand', () => {
    const ab = FREIGABE.indexOf('if (vertraegeFehler) {')
    // Nur den Fehlerzweig, nicht den `else if` dahinter: dort steht die
    // alte Meldung zu Recht, und ein zu breites Fenster traefe sie.
    const teil = FREIGABE.slice(ab, FREIGABE.indexOf('} else if (!vertraege', ab))
    expect(teil).toMatch(/NICHT festgestellt/)
    expect(teil).not.toContain('Kein aktiver Vertrag vorhanden')
  })

  it('die alte Meldung bleibt für ihren echten Fall', () => {
    expect(FREIGABE).toContain("probleme.push('Kein aktiver Vertrag vorhanden')")
    expect(FREIGABE).toContain('} else if (!vertraege || vertraege.length === 0) {')
  })
})
