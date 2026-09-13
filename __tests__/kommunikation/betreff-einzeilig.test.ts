/**
 * Betreffzeilen sind einzeilig, Feldwerte tragen keine Steuerzeichen.
 * @see lib/email/templates.ts
 *
 * ── DER BEFUND VOM 13.09.2026 ─────────────────────────────────────────
 * Ein Zeilenumbruch in einem Vorlagenfeld landete unverändert im Betreff:
 * aus dem Vornamen „Anna" plus Umbruch plus „Bcc: …" wurde ein Betreff mit
 * einem Umbruch mittendrin. Ob daraus beim Versand ein eigener Header
 * wird, hing danach allein daran, wie das SDK des Anbieters kodiert.
 *
 * Ein Riegel, der von einer fremden Bibliothek abhängt, ist keiner. Und
 * ein mehrzeiliger Betreff ist auch ohne Angriff schon kaputt.
 *
 * Der HTML-Rumpf ist NICHT Gegenstand dieses Tests: dort wird jeder
 * Feldwert durch `esc()` geführt, und Umbrüche sind dort erwünscht.
 */
import { describe, it, expect } from 'vitest'
import { EMAIL_VORLAGEN, vorlageRendern, einzeiligerBetreff } from '@/lib/email/templates'

const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)
const NUL = String.fromCharCode(0)
const U2028 = String.fromCharCode(0x2028)

describe('einzeiligerBetreff', () => {
  it.each([
    ['CR + LF', CR + LF],
    ['nur LF', LF],
    ['nur CR', CR],
    ['Tabulator', String.fromCharCode(9)],
    ['Zeilentrenner U+2028', U2028],
    ['Absatztrenner U+2029', String.fromCharCode(0x2029)],
    ['NEL U+0085', String.fromCharCode(0x85)],
  ])('ersetzt %s durch ein Leerzeichen', (_name, zeichen) => {
    const raus = einzeiligerBetreff(`Anna${zeichen}Bcc: opfer@example.org`)
    expect(raus).toBe('Anna Bcc: opfer@example.org')
    expect(/[\r\n]/.test(raus)).toBe(false)
  })

  it('fasst Mehrfach-Leerzeichen zusammen und trimmt', () => {
    expect(einzeiligerBetreff(`  Ihr${LF}${LF}  Termin  `)).toBe('Ihr Termin')
  })

  it('lässt eine saubere Zeile unverändert', () => {
    const gut = 'Ihr Alltagsbegleiter steht fest — lernen Sie Anna kennen'
    expect(einzeiligerBetreff(gut)).toBe(gut)
  })

  it('fasst Umlaute und Gedankenstriche nicht an', () => {
    expect(einzeiligerBetreff('Grüße — 131 €/Monat')).toBe('Grüße — 131 €/Monat')
  })
})

describe('vorlageRendern', () => {
  /** Füllt jede Pflichtangabe einer Vorlage mit einem Testwert. */
  function werteFuer(vorlage: (typeof EMAIL_VORLAGEN)[number], wert: string) {
    const w: Record<string, string> = {}
    for (const f of vorlage.felder) w[f.key] = wert
    return w
  }

  it('KEINE Vorlage erzeugt einen mehrzeiligen Betreff', () => {
    // Über alle Vorlagen, nicht nur die eine, in der es aufgefallen ist.
    const kaputt: string[] = []
    for (const v of EMAIL_VORLAGEN) {
      const g = vorlageRendern(v, werteFuer(v, `Anna${CR}${LF}Bcc: opfer@example.org`))
      if (/[\r\n]/.test(g.betreff)) kaputt.push(v.id)
    }
    expect(kaputt).toEqual([])
  })

  it('entfernt Steuerzeichen aus den Feldwerten', () => {
    const v = EMAIL_VORLAGEN[0]
    const g = vorlageRendern(v, werteFuer(v, `A${NUL}B`))
    expect(g.betreff).not.toContain(NUL)
    expect(g.rumpfHtml).not.toContain(NUL)
  })

  it('lässt legitime Umbrüche im RUMPF stehen', () => {
    // Eine Kurzvorstellung mit zwei Absätzen ist erwünscht — nur der
    // Betreff muss einzeilig sein.
    const v = EMAIL_VORLAGEN.find(x => x.felder.some(f => f.key === 'begleiter_text'))
    expect(v, 'Vorlage mit begleiter_text nicht gefunden').toBeDefined()
    const w = werteFuer(v!, 'x')
    w.begleiter_text = `Erster Absatz.${LF}Zweiter Absatz.`
    const g = vorlageRendern(v!, w)
    expect(g.rumpfHtml).toContain('Erster Absatz.')
    expect(g.rumpfHtml).toContain('Zweiter Absatz.')
  })

  it('KEINE Vorlage laesst rohes HTML aus einem Feldwert durch', () => {
    // Ueber alle Vorlagen statt einer: die erste setzt gar keinen Feldwert
    // in den Rumpf, dort waere nichts zu escapen und der Test bewiese
    // nichts. Geprueft wird nur, was tatsaechlich einen Wert einsetzt.
    const durchgelassen: string[] = []
    let mitInterpolation = 0
    for (const v of EMAIL_VORLAGEN) {
      const g = vorlageRendern(v, werteFuer(v, '<script>alert(1)</script>'))
      if (g.rumpfHtml.includes('&lt;script&gt;')) mitInterpolation++
      if (g.rumpfHtml.includes('<script>')) durchgelassen.push(v.id)
    }
    expect(durchgelassen).toEqual([])
    // Beweist, dass ueberhaupt irgendwo interpoliert wird — sonst waere
    // die leere Liste oben ein Ergebnis ueber nichts.
    expect(mitInterpolation).toBeGreaterThan(0)
  })
})
