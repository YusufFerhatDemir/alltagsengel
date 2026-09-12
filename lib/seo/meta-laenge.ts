/**
 * Titel und Beschreibungen in die SERP-Grenzen bringen — ohne alle Seiten
 * auf den kleinsten gemeinsamen Nenner zu kürzen.
 *
 * DAS PROBLEM: Ein Textbaustein mit eingesetztem Ortsnamen ist mal 41 und mal
 * 61 Zeichen lang — „Mainz" gegen „Friedberg (Wetterau)". Wer für den
 * längsten Namen kürzt, verschenkt den Platz auf allen anderen Seiten; wer es
 * nicht tut, lässt ein Dutzend Titel im Suchergebnis abschneiden. Am
 * 12.09.2026 waren es 76 zu lange Titel und 55 zu lange Beschreibungen.
 *
 * DIE LÖSUNG: Die Seite gibt mehrere Fassungen an, von ausführlich nach knapp.
 * Genommen wird die erste, die passt. Kurze Ortsnamen behalten damit den
 * vollen Text, lange bekommen die gekürzte Fassung — und niemand wird
 * abgeschnitten.
 *
 * WICHTIG für die Autoren der Fassungen: Auch die kürzeste muss den lokalen
 * Bezug behalten (Stadtteil, Klinik). Sonst löst sie zwar das Längenproblem
 * und erzeugt dafür das Near-Duplicate-Problem zurück, gegen das
 * `__tests__/seo/stadtseiten-metadaten.test.ts` steht.
 */

/** Aus `title.template` in app/layout.tsx — hängt an JEDEM Seitentitel. */
export const MARKEN_SUFFIX = ' | Alltagsengel'
export const TITEL_MAX = 60
export const BESCHREIBUNG_MAX = 160

/**
 * Erste Fassung, die mit `zuschlag` in `max` passt. Passt keine, wird die
 * letzte (kürzeste) genommen — lieber knapp zu lang als gar kein Text.
 */
export function ersteDiePasst(fassungen: readonly string[], max: number, zuschlag = 0): string {
  for (const f of fassungen) {
    if (f.length + zuschlag <= max) return f
  }
  return fassungen[fassungen.length - 1] ?? ''
}

/** Seitentitel — der Markensuffix aus dem Layout wird mitgerechnet. */
export function seitenTitel(...fassungen: string[]): string {
  return ersteDiePasst(fassungen, TITEL_MAX, MARKEN_SUFFIX.length)
}

/** Meta-Description. */
export function seitenBeschreibung(...fassungen: string[]): string {
  return ersteDiePasst(fassungen, BESCHREIBUNG_MAX)
}
