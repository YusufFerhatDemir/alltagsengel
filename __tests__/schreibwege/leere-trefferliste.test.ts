/**
 * Vier Schreibwege, bei denen „null Zeilen" eine Lüge wäre.
 * @see scripts/lint-stilles-update.ts
 *
 * ── ARBEITSTEILUNG ────────────────────────────────────────────────
 * `lint:stilles-update` findet Ketten OHNE `.select(…)` — dort ist eine
 * Prüfung gar nicht möglich. Ob der Aufrufer die zurückgegebene Liste
 * dann auch auswertet, sieht das Skript ausdrücklich nicht („dafür sind
 * die Tests da"). Diese Datei schließt genau diese Lücke, und zwar nur
 * für die vier Wege, bei denen ein stiller Fehlschlag belegbar Schaden
 * anrichtet.
 *
 * ── WARUM AM QUELLTEXT UND NICHT AM VERHALTEN ─────────────────────
 * Ein Verhaltenstest müsste die Next-Route mit Auth, Kontext und
 * Mandantenzaun nachbauen; er würde vor allem die Nachbildung prüfen.
 * Gegenstand hier ist eine andere, engere Frage: dass diese vier Stellen
 * nicht wieder auf „nur error prüfen" zurückfallen. Dafür ist der
 * Quelltext die richtige Ebene — und der Test nennt je Stelle den
 * konkreten Schaden, damit niemand ihn kommentarlos anpasst.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = process.cwd()
const lies = (p: string) => readFileSync(join(REPO, p), 'utf8')

/**
 * Die Stellen, die nach einem update/delete die Trefferzahl auswerten
 * müssen — mit dem Schaden, der sonst entsteht.
 */
const WEGE = [
  {
    datei: 'app/api/user/delete/route.ts',
    was: 'Kontolöschung (Art. 17 DSGVO)',
    schaden: 'Der Nutzer bekommt „Konto gelöscht", das Profil steht unverändert.',
    tabelle: 'profiles',
  },
  {
    datei: 'app/api/bookings/cancel/route.ts',
    was: 'Storno des Leistungsnachweises',
    schaden: 'Die widerrufene Leistung bleibt abrechenbar und landet auf der nächsten Rechnung.',
    tabelle: 'service_records',
  },
  {
    datei: 'app/api/admin/manage-role/route.ts',
    was: 'Rollenwechsel',
    schaden: 'app_metadata trägt die neue, profiles die alte Rolle — zwei autoritative Quellen, zwei Antworten.',
    tabelle: 'profiles',
  },
  {
    datei: 'app/api/tours/[id]/vertretung/route.ts',
    was: 'Tour-Vertretung',
    schaden: 'Die Tour gilt als übertragen, während Einsätze beim Erkrankten stehen bleiben.',
    tabelle: 'assignments',
  },
] as const

describe('Schreibwege werten die Trefferliste aus', () => {
  it.each(WEGE)('$was: $datei holt die betroffenen Zeilen zurück', ({ datei, tabelle }) => {
    const text = lies(datei)
    // Es muss mindestens eine update/delete-Kette auf dieser Tabelle mit
    // `.select(` geben — sonst ist eine Prüfung gar nicht möglich.
    const stelle = text.indexOf(`.from('${tabelle}')`)
    expect(stelle, `${datei}: kein Zugriff auf ${tabelle}`).toBeGreaterThan(-1)
    const kette = text.slice(stelle, stelle + 1200)
    expect(kette, `${datei}: update/delete auf ${tabelle} ohne .select()`).toMatch(/\.select\s*\(/)
  })

  it.each(WEGE)('$was prüft auf eine LEERE Trefferliste — $schaden', ({ datei }) => {
    const text = lies(datei)
    // `?.length ?? 0) === 0` bzw. `.length === 0` — die Prüfung, die aus
    // der zurückgegebenen Liste eine Entscheidung macht.
    expect(text, `${datei}: Trefferliste wird geholt, aber nicht auf leer geprüft`)
      .toMatch(/\.length\s*\?\?\s*0\)\s*===\s*0|\.length\s*===\s*0/)
  })
})

describe('Die Begründung steht bei der Prüfung', () => {
  it.each(WEGE)('$datei erklärt, warum die Trefferzahl zählt', ({ datei }) => {
    const text = lies(datei)
    // Eine Prüfung ohne Begründung wird beim nächsten Umbau wegoptimiert.
    expect(text).toMatch(/null Zeilen|keine Zeile|Trefferzahl|getroffene[rn]? Zeile/i)
  })
})
