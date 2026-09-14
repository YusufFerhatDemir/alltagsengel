/**
 * Zwei Geldseiten, die bei einer stillen Abfrage Null zeigten
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 80) — aus dem Bestand, den Block 79 sichtbar gemacht hat.
 *
 * 1. /admin/abrechnung — DIE Kassenabrechnungsseite. Vier Quellen in einem
 *    Aufruf, alle vier als leere Liste weiterverarbeitet:
 *
 *      recRes   Leistungsnachweise → null abrechenbare Fälle. Ein ganzer
 *               Monat wäre unbemerkt nicht bei den Kassen eingereicht
 *               worden.
 *      cliRes   Klienten → die Zuordnung ist leer, JEDER Fall wird
 *               übersprungen.
 *      laufRes  Abrechnungsläufe → bestehende Läufe unsichtbar, jemand
 *               legt einen zweiten für denselben Monat an.
 *      verRes   Verordnungen → `verordnungenFuerAbrechnung()` hatte
 *               dreimal `return []`; ohne Verordnung trägt ein Fall den
 *               Kostenträger des Klienten statt den der Bewilligung.
 *
 *    Und darunter stand der Leerzustand: „Keine abrechenbaren
 *    Leistungsnachweise im gewählten Monat" — eine Aussage über einen
 *    Monat, den niemand gelesen hatte.
 *
 * 2. /admin/rechnungen/[id] — der Rechnungskopf wurde auf seinen Fehler
 *    geprüft, die drei Detailabfragen nicht. Die Seite zeigte dann eine
 *    Rechnung OHNE Positionen, OHNE Prüfpfad oder OHNE Zahlungen. Neben
 *    diesen Listen stehen „Festschreiben", „Stornieren" und „Zahlung
 *    erfassen": wer festschreibt, während die Positionsliste still leer
 *    blieb, entscheidet über etwas, das er nicht gesehen hat.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const ABRECHNUNG = readFileSync('app/admin/abrechnung/page.tsx', 'utf8')
const RECHNUNG = readFileSync('app/admin/rechnungen/[id]/page.tsx', 'utf8')
const LINT = readFileSync('scripts/lint-leerzustand.ts', 'utf8')

describe('Kassenabrechnung: alle vier Quellen werden geprüft', () => {
  it('die drei Supabase-Abfragen', () => {
    const teil = ABRECHNUNG.slice(ABRECHNUNG.indexOf('const quellen = ['))
      .slice(0, 600)
    for (const f of ['recRes.error', 'cliRes.error', 'laufRes.error']) {
      expect(teil, f).toContain(f)
    }
  })

  it('und die Verordnungen über ihren eigenen Rückgabewert', () => {
    expect(ABRECHNUNG).toContain('verRes.ok ? null : verRes.grund')
  })

  it('der Verordnungs-Helfer meldet Fehlschläge, statt [] zu liefern', () => {
    const fn = ABRECHNUNG.slice(
      ABRECHNUNG.indexOf('async function verordnungenFuerAbrechnung'),
      ABRECHNUNG.indexOf('// ── Typen'),
    )
    expect(fn).toContain('{ ok: true; zeilen: unknown[] } | { ok: false; grund: string }')
    expect(fn).not.toMatch(/return \[\]/)
  })

  it('und zwar in JEDEM Fehlerzweig — nicht nur im Typ', () => {
    // Die erste Fassung dieser Pruefung sah nur die Signatur. Eine
    // Mutation, die `{ ok: true, zeilen: [] }` zurueckgab, kam damit
    // durch — also genau der Befund in neuer Schreibweise.
    const fn = ABRECHNUNG.slice(
      ABRECHNUNG.indexOf('async function verordnungenFuerAbrechnung'),
      ABRECHNUNG.indexOf('// ── Typen'),
    )
    expect(fn).toContain("if (!res.ok) return { ok: false, grund: `HTTP ${res.status}` }")
    expect(fn).toContain("if (!Array.isArray(daten)) return { ok: false,")
    expect(fn).toContain('return { ok: false, grund: e instanceof Error')
    // Genau EIN Erfolgsausgang.
    expect((fn.match(/ok: true/g) ?? []).length).toBe(2) // Typangabe + Rueckgabe
  })

  it('bei einem Fehlschlag entstehen KEINE Fälle', () => {
    const teil = ABRECHNUNG.slice(ABRECHNUNG.indexOf('const fehlend = quellen.filter'))
      .slice(0, 900)
    expect(teil).toContain('setGruppen([])')
    expect(teil).toContain('setLaeufe([])')
    expect(teil).toContain('return')
  })

  it('und der Leerzustand behauptet nichts mehr über einen ungelesenen Monat', () => {
    expect(ABRECHNUNG).toContain('{!laden && !ladefehler && gruppen.length === 0 && (')
  })

  it('der Grund wird angezeigt, nicht nur protokolliert', () => {
    expect(ABRECHNUNG).toContain('{ladefehler && <Banner tone="danger">{ladefehler}</Banner>}')
  })
})

describe('Rechnungsdetail: keine halbe Rechnung neben „Festschreiben"', () => {
  it('prüft Positionen, Prüfpfad und Zahlungen', () => {
    const teil = RECHNUNG.slice(RECHNUNG.indexOf('const teile = [')).slice(0, 500)
    expect(teil).toContain('itemsRes')
    expect(teil).toContain('auditRes')
    expect(teil).toContain('allocRes')
    expect(teil).toContain('.filter(([, r]) => r.error)')
  })

  it('setzt bei einem Fehlschlag keine Listen', () => {
    const ab = RECHNUNG.indexOf('const gescheitert = teile.filter')
    const teil = RECHNUNG.slice(ab, RECHNUNG.indexOf('setItems((itemsRes.data', ab))
    expect(teil).toContain('setUnvollstaendig(true)')
    expect(teil).toContain('return')
  })

  it('und zeigt dann weder Listen noch Schaltflächen', () => {
    expect(RECHNUNG).toContain('if (unvollstaendig) {')
    const teil = RECHNUNG.slice(RECHNUNG.indexOf('if (unvollstaendig) {')).slice(0, 700)
    expect(teil).toContain('<Banner tone="danger">{error}</Banner>')
    expect(teil).not.toContain('handleAction')
  })

  it('der Zustand wird bei jedem Laden zurückgesetzt', () => {
    // Sonst bliebe die Seite nach einem einmaligen Fehler dauerhaft leer.
    expect(RECHNUNG).toContain('setUnvollstaendig(false)')
  })
})

describe('Der Bestand ist mitgezogen', () => {
  it('trägt keinen Eintrag mehr für die beiden Seiten', () => {
    const liste = LINT.slice(
      LINT.indexOf('const BESTAND_GEBUENDELT'),
      LINT.indexOf('function imBestand'),
    )
    expect(liste).not.toContain("datei: 'app/admin/abrechnung/page.tsx'")
    expect(liste).not.toContain("datei: 'app/admin/rechnungen/[id]/page.tsx'")
  })

  it('und ist damit kürzer geworden', async () => {
    // Die Liste selbst zaehlen, nicht ihren Quelltext: die
    // Typangabe der Deklaration (`{ datei: string; … }`) sieht wie ein
    // Eintrag aus und haette die Zahl um eins verfaelscht.
    //
    // Obergrenze statt Gleichheit: der Bestand soll SINKEN. Eine
    // Gleichheitspruefung machte jeden folgenden Block, der eine Stelle
    // behebt, faelschlich rot — sie wuerde das Aufraeumen bestrafen.
    // Block 80 hat ihn von 85 auf 79 gebracht; alles darunter ist recht.
    const { BESTAND_GEBUENDELT } = await import('../../scripts/lint-leerzustand')
    expect(BESTAND_GEBUENDELT.length).toBeLessThanOrEqual(79)
  })
})
