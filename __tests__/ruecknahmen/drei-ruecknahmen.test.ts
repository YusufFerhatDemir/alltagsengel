/**
 * Drei Ruecknahmen, die der Code selbst eine Familie nennt
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 61, 14.09.2026)
 *
 * Der Kommentar in app/api/referral/complete/route.ts nennt sie beim
 * Namen: „Gleiche Linie wie genehmigenAbwesenheit und
 * protokolliereSignaturAudit." Alle drei nehmen einen Vorgang zurueck,
 * wenn der Folgeschritt scheitert — und alle drei taten das UNGEPRUEFT.
 *
 *   Empfehlungsbonus  Gutschrift scheitert -> Referral zurueck auf
 *                     'pending'. Schlaegt das fehl, bleibt der Vorgang
 *                     „abgeschlossen", ohne dass Geld geflossen ist —
 *                     der Kommentar darueber beschreibt genau diesen
 *                     Schaden („verbrannt und niemand merkt es").
 *
 *   Freischaltcode    Insert scheitert -> Code zurueck auf 'ausgegeben'.
 *                     Schlaegt das fehl, bleibt er 'eingeloest': der
 *                     Nutzer kann ihn NIE wieder verwenden und hat nichts
 *                     dafuer bekommen.
 *
 *   Abwesenheit       Tagesbuchung scheitert -> Antrag zurueck auf
 *                     'beantragt'. Schlaegt das fehl, bleibt er
 *                     GENEHMIGT ohne Buchung: die Kraft hat frei, das
 *                     Urlaubskonto weiss nichts davon, und der geworfene
 *                     Fehler liess den Aufrufer das Gegenteil annehmen.
 *
 * (Die Signatur-Ruecknahme derselben Familie wurde in Block 59 behoben.)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const REFERRAL = readFileSync('app/api/referral/complete/route.ts', 'utf8')
const CODE = readFileSync('app/api/coach/freischaltung/route.ts', 'utf8')
const ABWESENHEIT = readFileSync('lib/personal/abwesenheiten.ts', 'utf8')

/**
 * Anker sind die RUECKNAHME-Ausdruecke selbst, nicht der Tabellenname:
 * `from('absences')` steht mehrfach in der Datei, und ein Griff auf das
 * letzte Vorkommen traf eine ganz andere Stelle.
 */
const bloecke: [string, string, string][] = [
  ['Empfehlungsbonus', REFERRAL, "status: 'pending',"],
  ['Freischaltcode', CODE, "status: 'ausgegeben', eingeloest_am: null"],
  ['Abwesenheit', ABWESENHEIT, "status: 'beantragt', genehmigt_von: null"],
]

describe.each(bloecke)('%s — die Ruecknahme wird geprueft', (_name, quelle, anker) => {
  const block = (() => {
    const ab = quelle.indexOf(anker)
    expect(ab, `Anker ${anker} nicht gefunden`).toBeGreaterThan(-1)
    return quelle.slice(Math.max(0, ab - 900), ab + 1800)
  })()

  it('nimmt den Fehler entgegen', () => {
    expect(block).toContain('error: ruecknahmeFehler')
  })

  it('und die getroffenen Zeilen', () => {
    // PostgREST meldet null getroffene Zeilen nicht als Fehler.
    expect(block).toMatch(/\?\.length \?\? 0\) === 0/)
  })

  it('kein blindes `await` mehr auf diesem Schreibweg', () => {
    expect(block).not.toMatch(/\n\s*await (supabase|supabaseAdmin|admin)\s*\n\s*\.from\(/)
  })
})

describe('die Meldung sagt jeweils, was zurueckblieb', () => {
  it('Empfehlung: steht weiter auf „abgeschlossen", ohne Geld', () => {
    const text = REFERRAL.replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ')
    expect(text).toContain('abgeschlossen')
    expect(text).toContain('ohne dass Geld geflossen ist')
  })

  it('Code: gilt weiter als eingeloest und ist nicht erneut verwendbar', () => {
    const text = CODE.replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ')
    expect(text).toContain('gilt weiter als eingeloest')
    expect(text).toContain('nicht erneut')
  })

  it('Abwesenheit: genehmigt ohne Buchung im Urlaubskonto', () => {
    const text = ABWESENHEIT.replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ')
    expect(text).toContain('ohne Buchung im Urlaubskonto')
  })

  it('alle drei nennen die Kennung des betroffenen Vorgangs', () => {
    expect(REFERRAL).toContain('${referral.id}')
    expect(CODE).toContain('codeId: code.id')
    expect(ABWESENHEIT).toContain('Abwesenheit ${id}')
  })

  it('und tragen den urspruenglichen Fehler mit', () => {
    // Sonst verschwindet die Ursache hinter der Folgemeldung.
    expect(REFERRAL).toContain('werber: fuerWerber.fehler')
    expect(CODE).toContain('insertFehler: insertFehler.message')
    expect(ABWESENHEIT).toContain('(fehler as Error).message')
  })
})

describe('der Erfolgsfall bleibt unveraendert', () => {
  it('Empfehlung: weiterhin 503 mit der bisherigen Meldung', () => {
    expect(REFERRAL).toContain('Der Empfehlungsbonus konnte nicht gutgeschrieben werden. Bitte später erneut versuchen.')
  })

  it('Code: weiterhin die knappe 500-Meldung', () => {
    expect(CODE).toContain("{ error: 'Die Freischaltung konnte nicht abgeschlossen werden.' }")
  })

  it('Abwesenheit: der urspruengliche Fehler wird weitergereicht', () => {
    expect(ABWESENHEIT).toContain('throw fehler')
  })
})
