/**
 * Die letzten vier stillen Schreibwege
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 69) — Abschluss der Reihe aus den Blöcken 55–68.
 *
 * Vier UPDATE-Aufrufe verwarfen ihr Ergebnis. PostgREST meldet null
 * getroffene Zeilen nicht als Fehler; jeder dieser Wege sah damit
 * erfolgreich aus, ohne es zu sein:
 *
 *   1. lib/notifications.ts — `email_sent` auf einer Zeile, von der
 *      niemand geprüft hatte, ob sie überhaupt entstanden ist:
 *      `createNotification` meldet das mit `false`, und der Rückgabewert
 *      wurde verworfen.
 *   2. lib/marketing/versand.ts — der einzige ungeprüfte Vermerk der
 *      Versandschleife. Die beiden anderen (gesendet / Versandfehler)
 *      prüfen seit jeher Fehler UND Zeilen. Blieb dieser aus, stand der
 *      Eintrag weiter auf 'geplant', und der UNIQUE-Index verhinderte,
 *      dass ein Folgelauf die Adresse erneut aufnahm: die Person bekam
 *      die Kampagne nie.
 *   3. lib/abrechnung/fehlerprotokoll.ts — geprüft wurde nur der Fehler.
 *      Der Prüfpfad-Eintrag unmittelbar danach hätte einen Statuswechsel
 *      behauptet, den es nicht gab — genau das, wovor der Kommentar
 *      darüber warnt.
 *   4. app/api/organizations/zertifikat/route.ts — der
 *      Einrichtungsfortschritt. Das Zertifikat liegt, der Fortschritt
 *      nicht; die Einrichtung verlangt denselben Schritt erneut, ohne
 *      dass irgendwo stünde, warum.
 *
 * Danach meldet der Detektor 0.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

function quelle(pfad: string): string {
  return readFileSync(pfad, 'utf8')
}

/** Der Abschnitt von `ab` bis `bis` — beide müssen vorkommen. */
function abschnitt(text: string, ab: string, bis: string): string {
  const i = text.indexOf(ab)
  const j = text.indexOf(bis, i + ab.length)
  expect(i, `Anker "${ab}" fehlt`).toBeGreaterThan(-1)
  expect(j, `Anker "${bis}" fehlt`).toBeGreaterThan(i)
  return text.slice(i, j)
}

describe('1. Benachrichtigung: der Vermerk auf einer Zeile, die es geben muss', () => {
  const SRC = quelle('lib/notifications.ts')

  it('nimmt entgegen, ob die In-App-Zeile überhaupt entstanden ist', () => {
    expect(SRC).toContain('const inAppEntstanden = await createNotification(')
  })

  it('vermerkt nur dann — sonst wäre die Meldung die Wiederholung des Fehlers von oben', () => {
    expect(SRC).toContain('if (inAppEntstanden) {')
    const teil = abschnitt(SRC, 'if (inAppEntstanden) {', '// 3. Web Push')
    expect(teil).toContain("email_sent: true")
  })

  it('prüft Fehler UND getroffene Zeilen', () => {
    const teil = abschnitt(SRC, 'if (inAppEntstanden) {', '// 3. Web Push')
    expect(teil).toContain("const { data: vermerkt, error: vermerkFehler }")
    expect(teil).toContain(".select('id')")
    expect(teil).toMatch(/vermerkFehler \|\| \(vermerkt \?\? \[\]\)\.length === 0/)
  })

  it('kein blindes `await supabase.from(\'notifications\')` mehr', () => {
    expect(SRC).not.toMatch(/^\s*await supabase\s*\n?\s*\.?from\('notifications'\)/m)
  })
})

describe('2. Kampagnenversand: alle drei Vermerke nach demselben Maß', () => {
  const SRC = quelle('lib/marketing/versand.ts')

  it('der Abmeldelink-Fehler wird jetzt ebenfalls geprüft', () => {
    expect(SRC).toContain('const { data: fehlerVermerkt, error: fehlerVermerkFehler }')
    expect(SRC).toMatch(/fehlerVermerkFehler \|\| \(fehlerVermerkt \?\? \[\]\)\.length === 0/)
  })

  it('und benennt die Folge: der Eintrag bleibt auf „geplant"', () => {
    expect(SRC).toMatch(/bleibt auf .geplant/)
  })

  it('in der Versandschleife steht kein ungebundenes update mehr', () => {
    const schleife = abschnitt(SRC, 'for (const kontakt of lage.versandfaehig)', 'Kampagnenversand abgeschlossen')
    // Jedes `.update(` dieser Schleife gehoert zu einer Bindung.
    const updates = schleife.match(/\.update\(/g) ?? []
    const bindungen = schleife.match(/const \{ (data|error)[^}]*\} = await supabase/g) ?? []
    expect(updates.length).toBeGreaterThanOrEqual(3)
    expect(bindungen.length).toBeGreaterThanOrEqual(updates.length)
  })
})

describe('3. Fehlerprotokoll: kein Prüfpfad-Eintrag ohne Statuswechsel', () => {
  const SRC = quelle('lib/abrechnung/fehlerprotokoll.ts')

  it('das UPDATE gibt seine Zeilen zurück', () => {
    expect(SRC).toContain('const { data: geaendert, error: updateError } = await fehlerUpdate.select(\'id\')')
  })

  it('null getroffene Zeilen wirft, statt weiterzulaufen', () => {
    const teil = abschnitt(SRC, 'const { data: geaendert', 'await logBillingAction')
    expect(teil).toMatch(/\(geaendert \?\? \[\]\)\.length === 0/)
    expect(teil).toContain('throw new Error(')
    expect(teil).toMatch(/NICHT aktualisiert/)
  })

  it('und zwar VOR dem Prüfpfad-Eintrag', () => {
    // `logBillingAction` kommt in dieser Datei mehrfach vor. Gemeint ist
    // der Aufruf NACH dem Riegel, nicht der erste der Datei — ein
    // `indexOf` von vorn hätte hier eine andere Funktion getroffen.
    const riegel = SRC.indexOf('NICHT aktualisiert')
    expect(riegel).toBeGreaterThan(-1)
    expect(SRC.indexOf('await logBillingAction', riegel)).toBeGreaterThan(riegel)
  })
})

describe('4. Zertifikat: der Fortschritt, der stehen blieb', () => {
  const SRC = quelle('app/api/organizations/zertifikat/route.ts')

  it('prüft Fehler UND getroffene Zeilen', () => {
    expect(SRC).toContain('const { data: fortschritt, error: fortschrittFehler }')
    expect(SRC).toMatch(/fortschrittFehler \|\| \(fortschritt \?\? \[\]\)\.length === 0/)
  })

  it('bricht NICHT ab — das Zertifikat ist angekommen', () => {
    const teil = abschnitt(SRC, 'let fortschrittHinweis', 'return NextResponse.json({')
    expect(teil).not.toContain('status: 500')
    expect(teil).toContain('log.error(')
  })

  it('der Hinweis reist mit der Antwort, statt nur im Protokoll zu stehen', () => {
    const teil = abschnitt(SRC, 'ok: true,', 'catch (e)')
    expect(teil).toContain('...(fortschrittHinweis ? { hinweis: fortschrittHinweis } : {})')
  })

  it('ohne Fehlschlag trägt die Antwort keinen Hinweis', () => {
    // `fortschrittHinweis` bleibt null — der Spread fuegt dann nichts an.
    expect(SRC).toContain('let fortschrittHinweis: string | null = null')
  })
})

describe('Die Ausnahmeliste ist mitgezogen', () => {
  const LINT = quelle('scripts/lint-stilles-update.ts')

  it('trägt keinen Eintrag mehr für die behobene Zertifikat-Route', () => {
    expect(LINT).not.toContain("{ datei: 'app/api/organizations/zertifikat/route.ts'")
  })
})
