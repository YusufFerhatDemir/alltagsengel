/**
 * Welcher Statuswechsel benachrichtigt — und welcher bewusst nicht.
 * @see lib/email/templates.ts, app/admin/applications/actions.ts
 *
 * ── DER BEFUND, DER DAZU GEFÜHRT HAT (14.09.2026) ─────────────────
 * Es gibt 23 gepflegte Vorlagen für die Kundenkommunikation — mit
 * Zielgruppe, Betreff, Pflichtfeldern und gemeinsamer Gestaltung. Genau
 * EIN Statuswechsel versendet automatisch: die Freigabe einer Bewerbung
 * („einsatzbereit"). Und ausgerechnet der lief an den Vorlagen vorbei:
 * sein Text stand als fest verdrahtetes HTML mitten in der
 * Server-Action.
 *
 * Wer die Kundenkommunikation überarbeitet, öffnet die Vorlagen. Diesen
 * Text hätte er dort nicht gefunden — und eine Änderung an der Vorlage
 * `bewerber_zusage` hätte am tatsächlich versendeten Schreiben nichts
 * geändert.
 *
 * ── WAS DIESE TESTS FESTHALTEN ────────────────────────────────────
 * Nicht „es wird eine Mail verschickt", sondern: der Text steht an der
 * Stelle, an der ihn jemand sucht. Und die Übersicht darüber, welche
 * Übergänge automatisch schreiben, bleibt sichtbar — die übrigen
 * Vorlagen sind für den Versand von Hand gedacht (/api/email/send), und
 * das ist bei einer Absage eine bewusste Entscheidung, kein Versäumnis.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EMAIL_VORLAGEN, vorlageFinden, vorlageRendern } from '@/lib/email/templates'

const aktionen = readFileSync(
  join(process.cwd(), 'app/admin/applications/actions.ts'), 'utf8')

describe('Die Freigabe-Vorlage', () => {
  it('existiert', () => {
    expect(vorlageFinden('bewerber_freigabe')).not.toBeNull()
  })

  it('rendert mit dem Vornamen und verlangt ihn als Pflichtfeld', () => {
    const v = vorlageFinden('bewerber_freigabe')!
    const g = vorlageRendern(v, { vorname: 'Marek' })
    expect(g.fehlendeFelder).toEqual([])
    expect(g.betreff).toMatch(/freigegeben/i)
    expect(g.rumpfHtml).toMatch(/freigeschaltet/i)
  })

  it('meldet den fehlenden Vornamen, statt „Hallo ," zu schreiben', () => {
    const v = vorlageFinden('bewerber_freigabe')!
    expect(vorlageRendern(v, {}).fehlendeFelder).toContain('Vorname')
  })

  it('ist nicht dasselbe wie die Zusage nach dem Gespräch', () => {
    // `bewerber_zusage` steht VOR dem Vertrag („wir senden Ihnen die
    // Unterlagen zu"), die Freigabe danach. Würden beide denselben Text
    // tragen, bekäme die Person zweimal dieselbe Nachricht.
    const zusage = vorlageRendern(vorlageFinden('bewerber_zusage')!, { vorname: 'M' })
    const freigabe = vorlageRendern(vorlageFinden('bewerber_freigabe')!, { vorname: 'M' })
    expect(freigabe.rumpfHtml).not.toBe(zusage.rumpfHtml)
    expect(zusage.rumpfHtml).toMatch(/Vertragsunterlagen/)
  })
})

describe('Die Server-Action nutzt die Vorlage', () => {
  it('ruft vorlageFinden und vorlageRendern auf', () => {
    expect(aktionen).toMatch(/vorlageFinden\('bewerber_freigabe'\)/)
    expect(aktionen).toMatch(/vorlageRendern\(/)
  })

  it('trägt den Text NICHT mehr selbst', () => {
    // Der alte Block stand als mehrzeiliges HTML in der Aktion. Kommt er
    // zurück, laufen Vorlage und Versand wieder auseinander.
    expect(aktionen).not.toMatch(/JETZT EINLOGGEN/)
    expect(aktionen).not.toMatch(/Herzlichen Glückwunsch — Sie sind freigeschaltet/)
  })

  it('versendet nur beim ÜBERGANG, nicht bei jedem Speichern', () => {
    // Ein erneutes Setzen derselben Stufe darf keine zweite Freigabe-Mail
    // auslösen.
    expect(aktionen).toMatch(/!warSchonFreigegeben/)
  })

  it('eine fehlende Vorlage wird protokolliert, nicht verschluckt', () => {
    expect(aktionen).toMatch(/nicht gefunden — keine Freigabe-Mail/)
  })
})

describe('Übersicht: was automatisch schreibt', () => {
  /**
   * Diese Liste ist der Gegenstand, nicht ihr Inhalt. Kommt ein
   * automatischer Versand dazu, gehört er hier hinein — damit sichtbar
   * bleibt, wem die Plattform ungefragt schreibt.
   */
  const AUTOMATISCH = ['bewerber_eingang', 'warteliste_welcome', 'bewerber_freigabe']

  it('genau diese Vorlagen werden ohne menschliches Zutun versendet', () => {
    const quellen = [
      readFileSync(join(process.cwd(), 'app/api/apply/route.ts'), 'utf8'),
      aktionen,
      readFileSync(join(process.cwd(), 'app/api/waitlist/route.ts'), 'utf8'),
    ].join('\n')
    for (const id of AUTOMATISCH) {
      expect(quellen, `${id} wird nirgends automatisch versendet`).toContain(id)
    }
  })

  it('jede automatisch versendete Vorlage existiert auch', () => {
    for (const id of AUTOMATISCH) {
      expect(vorlageFinden(id), `${id} fehlt in EMAIL_VORLAGEN`).not.toBeNull()
    }
  })

  it('die übrigen Vorlagen sind für den Versand von Hand da', () => {
    // Absage, Einladung, Angebot: dass dort ein Mensch entscheidet, ist
    // Absicht. Der Test hält nur fest, dass es sie gibt — verschwindet
    // eine, fällt es auf.
    for (const id of ['bewerber_einladung', 'bewerber_absage', 'kunde_angebot',
                      'kunde_vertrag', 'kunde_absage', 'kunde_erstgespraech_termin']) {
      expect(vorlageFinden(id), `${id} fehlt`).not.toBeNull()
    }
  })
})

describe('Kundenkommunikation', () => {
  it('keine Vorlage zeichnet mit einem persönlichen Namen', () => {
    for (const v of EMAIL_VORLAGEN) {
      const text = v.rumpf({ vorname: 'Test', entlastungsbetrag: '131 €' })
      expect(text, `${v.id} nennt einen persönlichen Namen`)
        .not.toMatch(/Yusuf|Demir|Abdullah/i)
    }
  })

  it('keine Vorlage nennt den Entlastungsbetrag mit 125 €', () => {
    for (const v of EMAIL_VORLAGEN) {
      const text = v.rumpf({ vorname: 'Test', entlastungsbetrag: '131 €' })
      expect(text, `${v.id} nennt 125 €`).not.toMatch(/125\s*€/)
    }
  })
})
