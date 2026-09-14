/**
 * Die Ablehnung, die keine Wiedervorlage bekam
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 92)
 *
 * `erstelleWiedervorlage()` liest die abgelehnten und gekürzten
 * Positionen eines Rückläufers — DIESE Liste entscheidet, wofür eine
 * Wiedervorlage entsteht. Ihr verworfener Lesefehler wurde zu „keine
 * abgelehnten Positionen": der Rückläufer bekäme keinen einzigen
 * Eintrag, die Funktion meldete `erstellt: 0`, und das liest sich wie
 * „nichts zu tun".
 *
 * Eine abgelehnte oder gekürzte Forderung wäre damit stillschweigend
 * abgeschrieben, ohne dass jemand darüber entschieden hat.
 *
 * Zwei Nachbarn in derselben Datei gaben falsche Auskünfte:
 *
 *   `rl`        → „gehört zu einer anderen Organisation", eine Aussage
 *                 über die Zugehörigkeit, die nie zutraf
 *   `eintraege` → „Einträge zuerst prüfen und auf korrigiert setzen",
 *                 eine Handlungsanweisung an jemanden, der genau das
 *                 schon getan haben kann
 *
 * ── EIN NACHBAR, DER BLEIBT ──────────────────────────────────────────
 * `lib/billing/matching/matching-engine.ts` liest ebenfalls ungeprüft —
 * dort tragen die Abfragen aber zu einem SCORE bei. Fällt eine aus,
 * steigt der Wert nicht, es kommt kein Treffer zustande, und die Zahlung
 * bleibt unzugeordnet: ein Mensch entscheidet. Das ist die sichere
 * Richtung und wird nicht angefasst.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const WV = readFileSync('lib/abrechnung/wiedervorlage.ts', 'utf8')
const MATCHING = readFileSync('lib/billing/matching/matching-engine.ts', 'utf8')

describe('Die Positionsliste entscheidet — und wird geprüft', () => {
  it('nimmt ihren Lesefehler entgegen', () => {
    expect(WV).toContain('const { data: positionen, error: positionenFehler }')
    expect(WV).toContain('if (positionenFehler) {')
  })

  it('bricht ab, statt null Einträge zu melden', () => {
    const ab = WV.indexOf('if (positionenFehler) {')
    const teil = WV.slice(ab, ab + 600)
    expect(teil).toContain('throw new Error(')
    expect(teil).toMatch(/KEINE Wiedervorlage angelegt/)
  })

  it('und zwar VOR der Schleife, die die Einträge baut', () => {
    expect(WV.indexOf('if (positionenFehler) {'))
      .toBeLessThan(WV.indexOf('if (positionen?.length) {'))
  })

  it('nennt die Verwechslung beim Namen', () => {
    expect(WV).toMatch(/nicht nachgesehen/)
  })
})

describe('Die beiden falschen Auskünfte sind weg', () => {
  it('der Rückläufer-Lesefehler ist kein Mandantenbefund mehr', () => {
    expect(WV).toContain('const { data: rl, error: rlFehler }')
    const ab = WV.indexOf('if (rlFehler) {')
    expect(ab).toBeGreaterThan(-1)
    // Die alte Meldung bleibt für den echten Fall bestehen.
    expect(ab).toBeLessThan(WV.indexOf("throw new Error('Rückläufer nicht gefunden"))
  })

  it('der Eintrags-Lesefehler ist keine Handlungsanweisung mehr', () => {
    expect(WV).toContain('const { data: eintraege, error: eintraegeFehler }')
    const ab = WV.indexOf('if (eintraegeFehler) {')
    expect(ab).toBeGreaterThan(-1)
    expect(ab).toBeLessThan(WV.indexOf('if (!eintraege?.length) {'))
  })

  it('und beide sagen, dass nichts geschehen ist', () => {
    expect(WV).toMatch(/Es wurde NICHTS wiedereingereicht/)
    expect(WV).toMatch(/Es wurde KEINE Wiedervorlage angelegt\./)
  })
})

describe('Der Nachbar bleibt, wie er ist', () => {
  it('die Matching-Engine liest weiterhin ohne Fehlerprüfung', () => {
    // Absicht: dort tragen die Abfragen zu einem Score bei. Ohne Treffer
    // bleibt die Zahlung unzugeordnet — ein Mensch entscheidet.
    expect(MATCHING).toContain('const { data: sepaItems } = await supabase')
    expect(MATCHING).toContain('const { data: mandateByIban } = await supabase')
  })

  it('und der Score entsteht nur aus Treffern', () => {
    expect(MATCHING).toContain('if (sepaItems && sepaItems.length > 0) {')
  })
})
