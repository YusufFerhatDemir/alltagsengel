/**
 * Versand-Schalter — die zwei Flags, die echte Post auslösen
 *
 * Warum diese Suite ausführlicher ist, als ein Boolean es nahelegt:
 * jeder hier geprüfte Fall entscheidet, ob eine Rechnung oder eine Mahnung
 * das Haus verlässt. Ein „true statt 1" ist kein Tippfehler, sondern der
 * Unterschied zwischen einem stillen System und einem, das versendet.
 *
 * Die drei Achsen, die zusammenspielen:
 *   1. Der WERT ('1' / '0' / fehlt / Unsinn)
 *   2. Die UMGEBUNG (Produktion / Preview / Entwicklung / Build)
 *   3. Die AUSNAHME (VERSAND_NICHT_PRODUKTION_ERLAUBT)
 */

import { describe, it, expect, vi } from 'vitest'
import {
  leseVersandFlag,
  versandFlagsStand,
  rechnungsversandAktiv,
  mahnversandAktiv,
  pruefeVersandFlagsBeimStart,
  auditZustand,
  standGeaendert,
  VERSAND_FLAGS,
  NICHT_PRODUKTION_ERLAUBT,
  type VersandFlagAuditZustand,
} from '@/lib/config/versand-flags'

/** Produktionsumgebung, wie Vercel sie setzt. */
const PROD = { VERCEL_ENV: 'production' } as Record<string, string | undefined>
/** Branch-Preview — dieselben Variablen, andere Umgebung. */
const PREVIEW = { VERCEL_ENV: 'preview' } as Record<string, string | undefined>
/** Lokal, ohne Vercel. */
const LOKAL = { NODE_ENV: 'development' } as Record<string, string | undefined>

describe('leseVersandFlag — Wertlage', () => {
  it('fehlende Variable ist aus, und zwar als "aus_fehlt"', () => {
    const s = leseVersandFlag('RECHNUNGSVERSAND_AUTOMATISCH', { ...PROD })
    expect(s.aktiv).toBe(false)
    expect(s.befund).toBe('aus_fehlt')
    expect(s.gesetzt).toBe(false)
    expect(s.wertGueltig).toBe(true)
  })

  it('leerer String zählt als nicht gesetzt', () => {
    const s = leseVersandFlag('RECHNUNGSVERSAND_AUTOMATISCH', {
      ...PROD, RECHNUNGSVERSAND_AUTOMATISCH: '',
    })
    expect(s.aktiv).toBe(false)
    expect(s.befund).toBe('aus_fehlt')
  })

  it("'0' ist ausdrücklich aus — unterscheidbar von 'nicht gesetzt'", () => {
    const s = leseVersandFlag('MAHNVERSAND_AUTOMATISCH', {
      ...PROD, MAHNVERSAND_AUTOMATISCH: '0',
    })
    expect(s.aktiv).toBe(false)
    expect(s.befund).toBe('aus_explizit')
    expect(s.wertGueltig).toBe(true)
  })

  it("'1' in der Produktion schaltet scharf", () => {
    const s = leseVersandFlag('RECHNUNGSVERSAND_AUTOMATISCH', {
      ...PROD, RECHNUNGSVERSAND_AUTOMATISCH: '1',
    })
    expect(s.aktiv).toBe(true)
    expect(s.befund).toBe('an')
  })

  // Der eigentliche Grund für dieses Modul: früher waren alle folgenden
  // Werte von "nicht gesetzt" nicht unterscheidbar.
  for (const wert of ['true', 'TRUE', 'yes', 'ja', 'on', 'an', '2', '01', '1.0', 'null']) {
    it(`'${wert}' ist aus UND als ungültig markiert`, () => {
      const s = leseVersandFlag('RECHNUNGSVERSAND_AUTOMATISCH', {
        ...PROD, RECHNUNGSVERSAND_AUTOMATISCH: wert,
      })
      expect(s.aktiv).toBe(false)
      expect(s.befund).toBe('aus_ungueltig')
      expect(s.wertGueltig).toBe(false)
    })
  }

  // Leerraum ist der gefährlichste Fall: `vercel env add` über stdin nimmt
  // gern ein Newline mit. Bewusst NICHT getrimmt — ein Wert, bei dem unklar
  // ist, ob er so gemeint war, darf keine Post auslösen. Er wird aber als
  // ungültig gemeldet, damit die Ursache sichtbar ist.
  for (const [name, wert] of [['führendes Leerzeichen', ' 1'], ['Newline', '1\n'], ['Tab', '1\t']] as const) {
    it(`${name} schaltet NICHT ein, wird aber als ungültig gemeldet`, () => {
      const s = leseVersandFlag('MAHNVERSAND_AUTOMATISCH', {
        ...PROD, MAHNVERSAND_AUTOMATISCH: wert,
      })
      expect(s.aktiv).toBe(false)
      expect(s.befund).toBe('aus_ungueltig')
      expect(s.grund).toContain('Leerraum')
    })
  }

  it('der Rohwert taucht im Grund nicht auf — er wandert in Protokolle', () => {
    const s = leseVersandFlag('RECHNUNGSVERSAND_AUTOMATISCH', {
      ...PROD, RECHNUNGSVERSAND_AUTOMATISCH: 'geheimnisvoller-unsinn',
    })
    expect(s.grund).not.toContain('geheimnisvoller-unsinn')
  })
})

describe('leseVersandFlag — Umgebungstrennung', () => {
  // Der Fall, den es zu verhindern gilt: eine Vercel-Variable, die für
  // „All Environments" angelegt wurde, steht auch in jedem Branch-Preview.
  it("'1' im Preview schaltet NICHT ein", () => {
    const s = leseVersandFlag('RECHNUNGSVERSAND_AUTOMATISCH', {
      ...PREVIEW, RECHNUNGSVERSAND_AUTOMATISCH: '1',
    })
    expect(s.aktiv).toBe(false)
    expect(s.befund).toBe('aus_umgebung')
    expect(s.grund).toContain(NICHT_PRODUKTION_ERLAUBT)
  })

  it("'1' lokal schaltet NICHT ein", () => {
    const s = leseVersandFlag('MAHNVERSAND_AUTOMATISCH', {
      ...LOKAL, MAHNVERSAND_AUTOMATISCH: '1',
    })
    expect(s.aktiv).toBe(false)
    expect(s.befund).toBe('aus_umgebung')
  })

  it('mit der Ausnahme wirkt der Schalter auch im Preview', () => {
    const s = leseVersandFlag('MAHNVERSAND_AUTOMATISCH', {
      ...PREVIEW, MAHNVERSAND_AUTOMATISCH: '1', [NICHT_PRODUKTION_ERLAUBT]: '1',
    })
    expect(s.aktiv).toBe(true)
    expect(s.grund).toContain('außerhalb der Produktion')
  })

  it('die Ausnahme allein schaltet nichts ein', () => {
    const s = leseVersandFlag('MAHNVERSAND_AUTOMATISCH', {
      ...PREVIEW, [NICHT_PRODUKTION_ERLAUBT]: '1',
    })
    expect(s.aktiv).toBe(false)
    expect(s.befund).toBe('aus_fehlt')
  })

  it("die Ausnahme akzeptiert ihrerseits nur '1'", () => {
    const s = leseVersandFlag('MAHNVERSAND_AUTOMATISCH', {
      ...PREVIEW, MAHNVERSAND_AUTOMATISCH: '1', [NICHT_PRODUKTION_ERLAUBT]: 'true',
    })
    expect(s.aktiv).toBe(false)
    expect(s.befund).toBe('aus_umgebung')
  })

  it('ein CI-Lauf mit NODE_ENV=production gilt nicht als Produktion', () => {
    const s = leseVersandFlag('RECHNUNGSVERSAND_AUTOMATISCH', {
      NODE_ENV: 'production', CI: 'true', RECHNUNGSVERSAND_AUTOMATISCH: '1',
    })
    expect(s.aktiv).toBe(false)
    expect(s.befund).toBe('aus_umgebung')
  })
})

describe('versandFlagsStand', () => {
  it('trägt beide Schalter und die Umgebungslage', () => {
    const stand = versandFlagsStand({
      ...PROD, RECHNUNGSVERSAND_AUTOMATISCH: '1', MAHNVERSAND_AUTOMATISCH: '0',
    })
    expect(stand.rechnung.aktiv).toBe(true)
    expect(stand.mahnung.aktiv).toBe(false)
    expect(stand.produktion).toBe(true)
    expect(stand.warnungen).toHaveLength(0)
  })

  it('meldet einen ungültigen Wert als Warnung', () => {
    const stand = versandFlagsStand({ ...PROD, MAHNVERSAND_AUTOMATISCH: 'true' })
    expect(stand.warnungen.join(' ')).toContain('MAHNVERSAND_AUTOMATISCH')
  })

  it('meldet die Ausnahme in der Produktion als überflüssig', () => {
    const stand = versandFlagsStand({ ...PROD, [NICHT_PRODUKTION_ERLAUBT]: '1' })
    expect(stand.ausnahmeAktiv).toBe(true)
    expect(stand.warnungen.join(' ')).toContain('wirkungslos')
  })

  it('rechnungsversandAktiv/mahnversandAktiv sind die Kurzform derselben Auswertung', () => {
    const quelle = { ...PROD, RECHNUNGSVERSAND_AUTOMATISCH: '1' }
    expect(rechnungsversandAktiv(quelle)).toBe(true)
    expect(mahnversandAktiv(quelle)).toBe(false)
  })

  it('kennt genau zwei Schalter', () => {
    expect([...VERSAND_FLAGS]).toEqual([
      'RECHNUNGSVERSAND_AUTOMATISCH',
      'MAHNVERSAND_AUTOMATISCH',
    ])
  })
})

describe('pruefeVersandFlagsBeimStart', () => {
  it('protokolliert die Lage, ohne zu werfen', () => {
    const protokoll = { log: vi.fn(), warn: vi.fn() }
    const stand = pruefeVersandFlagsBeimStart(
      { ...PROD, RECHNUNGSVERSAND_AUTOMATISCH: '1' }, protokoll,
    )
    expect(stand.rechnung.aktiv).toBe(true)
    expect(protokoll.log).toHaveBeenCalledOnce()
    expect(protokoll.warn).not.toHaveBeenCalled()
  })

  it('warnt laut bei einem ungültigen Wert', () => {
    const protokoll = { log: vi.fn(), warn: vi.fn() }
    pruefeVersandFlagsBeimStart({ ...PROD, MAHNVERSAND_AUTOMATISCH: 'yes' }, protokoll)
    expect(protokoll.warn).toHaveBeenCalledOnce()
  })

  // Im CI stehen nur Platzhalter (.github/workflows/ci.yml) — ein Befund
  // dort wäre bedeutungslos und würde jeden Build mit Rauschen füllen.
  it('schweigt im Build-Lauf', () => {
    const protokoll = { log: vi.fn(), warn: vi.fn() }
    pruefeVersandFlagsBeimStart(
      { NEXT_PHASE: 'phase-production-build', MAHNVERSAND_AUTOMATISCH: 'yes' }, protokoll,
    )
    expect(protokoll.log).not.toHaveBeenCalled()
    expect(protokoll.warn).not.toHaveBeenCalled()
  })
})

describe('Audit-Zustand', () => {
  const zustand = (r: string, m: string, p = true) =>
    ({ rechnungsversand: r, mahnversand: m, produktion: p }) as VersandFlagAuditZustand

  it('nimmt nur Befunde auf, nie Rohwerte', () => {
    const z = auditZustand(versandFlagsStand({
      ...PROD, RECHNUNGSVERSAND_AUTOMATISCH: '1', MAHNVERSAND_AUTOMATISCH: 'unsinn',
    }))
    expect(z).toEqual({ rechnungsversand: 'an', mahnversand: 'aus_ungueltig', produktion: true })
    expect(JSON.stringify(z)).not.toContain('unsinn')
  })

  it('der erste Eintrag gilt immer als Änderung', () => {
    expect(standGeaendert(null, zustand('aus_fehlt', 'aus_fehlt'))).toBe(true)
  })

  it('gleiche Lage ist keine Änderung — sonst eine Zeile je Rechnung', () => {
    expect(standGeaendert(zustand('an', 'aus_fehlt'), zustand('an', 'aus_fehlt'))).toBe(false)
  })

  it('Einschalten ist eine Änderung', () => {
    expect(standGeaendert(zustand('aus_fehlt', 'aus_fehlt'), zustand('an', 'aus_fehlt'))).toBe(true)
  })

  it('Abschalten ist eine Änderung', () => {
    expect(standGeaendert(zustand('an', 'an'), zustand('an', 'aus_explizit'))).toBe(true)
  })

  // 'aus_fehlt' → 'aus_ungueltig' ist beides „aus", aber der Übergang sagt:
  // jemand hat den Schalter angefasst und sich vertan. Das gehört in die Spur.
  it('ein Wechsel zwischen zwei Aus-Gründen ist eine Änderung', () => {
    expect(standGeaendert(zustand('aus_fehlt', 'aus_fehlt'), zustand('aus_ungueltig', 'aus_fehlt'))).toBe(true)
  })

  it('ein Umgebungswechsel allein ist eine Änderung', () => {
    expect(standGeaendert(zustand('an', 'an', false), zustand('an', 'an', true))).toBe(true)
  })
})
