/**
 * VP/KZP — TypeScript und SQL muessen dasselbe Kontingent kennen.
 *
 * Die Tagekontingente stehen absichtlich doppelt: in
 * lib/billing/vpkzp/konstanten.ts (verstaendliche Meldungen im
 * Anwendungsweg) und in public.vpkzp_max_tage() (nicht umgehbar, greift
 * auch bei direktem PostgREST-Schreibzugriff). Doppelt gefuehrte Regeln
 * laufen ohne Test auseinander — dann erlaubt die Oberflaeche, was die
 * Datenbank ablehnt, oder schlimmer: umgekehrt.
 *
 * Gleiches Muster wie __tests__/billing/leistungsart-mapping.test.ts fuer
 * public.tarif_leistungsart().
 */

import { describe, it, expect } from 'vitest'
import { liesMigration } from '../helpers/sql-extract'
import {
  VPKZP_ZEIT_VERSIONEN,
  FRUEHESTES_ZEITJAHR,
  maxTageFuer,
} from '@/lib/billing/vpkzp/konstanten'

const MIGRATION = '20260926000000_vpkzp_zeitraum_budget.sql'

const sql = liesMigration(MIGRATION)

function sqlWert(art: string): number {
  const treffer = new RegExp(
    `WHEN lower\\(p_art\\) = '${art}' THEN (\\d+)`,
  ).exec(sql)
  if (!treffer) throw new Error(`Kein SQL-Zweig fuer "${art}" in ${MIGRATION}`)
  return Number(treffer[1])
}

function sqlFruehestesJahr(): number {
  const treffer = /p_jahr < (\d{4}) THEN NULL/.exec(sql)
  if (!treffer) throw new Error(`Keine Jahresuntergrenze in ${MIGRATION}`)
  return Number(treffer[1])
}

describe('vpkzp_max_tage() ist deckungsgleich mit VPKZP_ZEIT_VERSIONEN', () => {
  const aktuell = VPKZP_ZEIT_VERSIONEN[VPKZP_ZEIT_VERSIONEN.length - 1]

  it('Verhinderungspflege', () => {
    expect(sqlWert('verhinderungspflege')).toBe(aktuell.vpMaxTage)
    expect(maxTageFuer('verhinderungspflege', 2026)).toBe(sqlWert('verhinderungspflege'))
  })

  it('Kurzzeitpflege', () => {
    expect(sqlWert('kurzzeitpflege')).toBe(aktuell.kzpMaxTage)
    expect(maxTageFuer('kurzzeitpflege', 2026)).toBe(sqlWert('kurzzeitpflege'))
  })

  it('Jahresuntergrenze', () => {
    expect(sqlFruehestesJahr()).toBe(FRUEHESTES_ZEITJAHR)
  })

  it('kennt keine weitere Leistungsart als die beiden', () => {
    const zweige = [...sql.matchAll(/WHEN lower\(p_art\) = '([a-z_]+)' THEN/g)]
      .map(m => m[1])
    expect(zweige.sort()).toEqual(['kurzzeitpflege', 'verhinderungspflege'])
  })
})

describe('Mehrere Rechtsstaende', () => {
  it('ueberschneiden sich nicht', () => {
    for (let i = 1; i < VPKZP_ZEIT_VERSIONEN.length; i++) {
      expect(VPKZP_ZEIT_VERSIONEN[i].gueltigAb > VPKZP_ZEIT_VERSIONEN[i - 1].gueltigBis).toBe(true)
    }
  })

  it('haben genau einen offenen Eintrag am Ende', () => {
    const offen = VPKZP_ZEIT_VERSIONEN.filter(v => v.gueltigBis === '9999-12-31')
    expect(offen).toHaveLength(1)
    expect(offen[0]).toBe(VPKZP_ZEIT_VERSIONEN[VPKZP_ZEIT_VERSIONEN.length - 1])
  })

  it('sind auf Jahresgrenzen ausgerichtet', () => {
    // zeitVersionFuerJahr() deckt ein Jahr nur ab, wenn der Eintrag am
    // 01.01. gilt und am 31.12. noch gilt. Ein unterjaehriger Wechsel
    // waere so nicht darstellbar und muesste eigens gebaut werden.
    for (const v of VPKZP_ZEIT_VERSIONEN) {
      expect(v.gueltigAb.endsWith('-01-01')).toBe(true)
      expect(v.gueltigBis === '9999-12-31' || v.gueltigBis.endsWith('-12-31')).toBe(true)
    }
  })
})
