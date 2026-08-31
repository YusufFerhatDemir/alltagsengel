/**
 * Zusatzrechte: sagt die Oberfläche, wenn ein Teil einer Seite leer bleibt?
 *
 * BEFUND (31.08.2026, aus `npm run audit:rls-rollen`): zehn Seite/Rolle-Paare
 * liefern unter RLS eine leere Ansicht, OBWOHL die Policy richtig ist — die
 * Rolle hat das verlangte Recht schlicht nicht. Acht davon sind derselbe
 * Fall: die Buchhaltung darf laut ROLLEN_MATRIX ausdrücklich keine
 * Personalakten sehen, acht Seiten zeigen aber Betreuungskräfte.
 *
 * Das ist kein Leck — die Rolle sieht ZU WENIG. Es ist eine Falschaussage:
 * „keine Einträge" statt „dürfen Sie nicht sehen". Wer eine leere Liste
 * sieht, sucht den Fehler bei sich oder meldet einen Ausfall.
 *
 * Diese Suite prüft die Zuordnung — nicht das Aussehen. Der Hinweis selbst
 * steht einmal im Layout; hier geht es darum, dass er bei den richtigen
 * Kombinationen erscheint UND bei den anderen schweigt.
 */
import { describe, it, expect } from 'vitest'
import { fehlendeZusatzRechte, BEREICHE } from '@/lib/auth/bereiche'
import { ROLLEN_MATRIX, VERWALTUNGSROLLEN, type Rolle } from '@/lib/auth/rollen'

/** Genau die Paare, die der Live-Audit als 'recht_fehlt' gemeldet hat. */
const BEFUNDE: Array<{ pfad: string; rolle: Rolle; recht: string }> = [
  { pfad: '/admin/ausfallmanagement', rolle: 'buchhaltung', recht: 'personal.lesen' },
  { pfad: '/admin/dashboard', rolle: 'buchhaltung', recht: 'personal.lesen' },
  { pfad: '/admin/kalender', rolle: 'buchhaltung', recht: 'personal.lesen' },
  { pfad: '/admin/leistungsnachweis-digital', rolle: 'buchhaltung', recht: 'personal.lesen' },
  { pfad: '/admin/monatsabschluss-vorbereitung', rolle: 'buchhaltung', recht: 'personal.lesen' },
  { pfad: '/admin/records/new', rolle: 'buchhaltung', recht: 'personal.lesen' },
  { pfad: '/admin/schedule', rolle: 'buchhaltung', recht: 'personal.lesen' },
  { pfad: '/admin/tourenplanung', rolle: 'buchhaltung', recht: 'personal.lesen' },
  { pfad: '/admin/dashboard', rolle: 'qm', recht: 'abrechnung.lesen' },
]

describe('Jeder Live-Befund wird der Nutzerin benannt', () => {
  for (const { pfad, rolle, recht } of BEFUNDE) {
    it(`${pfad} · ${rolle} nennt ${recht}`, () => {
      expect(fehlendeZusatzRechte(pfad, rolle)).toContain(recht)
    })
  }
})

describe('…und sonst schweigt der Hinweis', () => {
  it('die Administration bekommt nie einen Hinweis', () => {
    // Sie sieht alles; ein Hinweis wäre schlicht falsch.
    for (const { pfad } of BEFUNDE) {
      expect(fehlendeZusatzRechte(pfad, 'admin')).toEqual([])
      expect(fehlendeZusatzRechte(pfad, 'superadmin')).toEqual([])
    }
  })

  it('wer das Recht HAT, bekommt keinen Hinweis', () => {
    // pdl hat personal.lesen — auf den Einsatzseiten fehlt ihr nichts.
    for (const pfad of ['/admin/schedule', '/admin/tourenplanung', '/admin/kalender']) {
      expect(fehlendeZusatzRechte(pfad, 'pdl')).toEqual([])
    }
  })

  it('ohne Rolle und auf unbekannten Pfaden bleibt es still', () => {
    expect(fehlendeZusatzRechte('/admin/schedule', null)).toEqual([])
    expect(fehlendeZusatzRechte('/admin/gibt-es-nicht', 'buchhaltung')).toEqual([])
  })

  it('Bereiche ohne zusatzRechte melden nie etwas', () => {
    // Gegenprobe gegen ein zu eifriges Ergebnis: eine Seite, die keine
    // Zusatzrechte deklariert, darf für KEINE Rolle etwas melden.
    for (const [pfad, regel] of Object.entries(BEREICHE)) {
      if (regel.zusatzRechte) continue
      for (const rolle of VERWALTUNGSROLLEN) {
        expect(fehlendeZusatzRechte(pfad, rolle), `${pfad} · ${rolle}`).toEqual([])
      }
    }
  })
})

describe('Der Katalog bleibt mit der Rollenmatrix im Takt', () => {
  it('jedes deklarierte Zusatzrecht ist ein echtes Recht', () => {
    // Ein Tippfehler wäre sonst unsichtbar: das Recht fehlt jeder Rolle,
    // und der Hinweis erschiene überall.
    const alle = new Set(Object.values(ROLLEN_MATRIX).flat())
    for (const [pfad, regel] of Object.entries(BEREICHE)) {
      for (const recht of regel.zusatzRechte ?? []) {
        expect(alle.has(recht), `${pfad}: "${recht}" kennt keine Rolle`).toBe(true)
      }
    }
  })

  it('kein Zusatzrecht wiederholt das Leserecht der Seite', () => {
    // Wer die Seite betreten darf, hat ihr Leserecht schon — es als
    // Zusatzrecht zu führen, könnte nie greifen und wäre irreführend.
    for (const [pfad, regel] of Object.entries(BEREICHE)) {
      expect(regel.zusatzRechte ?? [], pfad).not.toContain(regel.lesen)
    }
  })

  it('mindestens eine Rolle sieht jede Seite vollständig', () => {
    // Deklariert eine Seite Zusatzrechte, die KEINE Verwaltungsrolle
    // zusammen hat, wäre sie für alle unvollständig — dann stimmt die
    // Deklaration nicht.
    for (const [pfad, regel] of Object.entries(BEREICHE)) {
      if (!regel.zusatzRechte?.length) continue
      const vollstaendig = VERWALTUNGSROLLEN.filter(
        r => fehlendeZusatzRechte(pfad, r).length === 0,
      )
      expect(vollstaendig.length, `${pfad} ist für JEDE Rolle unvollständig`).toBeGreaterThan(0)
    }
  })
})
