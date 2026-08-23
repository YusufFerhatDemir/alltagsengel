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

const MIGRATION = '20260928000000_vpkzp_vp_56_tage.sql'

const sql = liesMigration(MIGRATION)

/**
 * Liest den Tagewert aus dem SQL-Zweig einer Leistungsart.
 *
 * Die Funktion ist seit 20260928000000 nach Rechtsstand getrennt: Zweige
 * mit `p_jahr <= JJJJ AND ...` gelten bis einschliesslich diesem Jahr, der
 * Zweig ohne Jahresbedingung ist der offene, aktuelle Rechtsstand. Genau
 * so ist auch VPKZP_ZEIT_VERSIONEN aufgebaut.
 */
function sqlWert(art: string, bisJahr: number | null = null): number {
  const muster = bisJahr === null
    ? new RegExp(`WHEN lower\\(p_art\\) = '${art}' THEN (\\d+)`)
    : new RegExp(`WHEN p_jahr <= ${bisJahr} AND lower\\(p_art\\) = '${art}' THEN (\\d+)`)
  const treffer = muster.exec(sql)
  if (!treffer) {
    throw new Error(
      `Kein SQL-Zweig fuer "${art}"${bisJahr === null ? ' (offener Rechtsstand)' : ` bis ${bisJahr}`} in ${MIGRATION}`,
    )
  }
  return Number(treffer[1])
}

function sqlFruehestesJahr(): number {
  const treffer = /p_jahr < (\d{4}) THEN NULL/.exec(sql)
  if (!treffer) throw new Error(`Keine Jahresuntergrenze in ${MIGRATION}`)
  return Number(treffer[1])
}

/** Letztes Jahr eines geschlossenen Eintrags, z. B. 2024. */
function bisJahr(v: { gueltigBis: string }): number {
  return Number(v.gueltigBis.slice(0, 4))
}

describe('vpkzp_max_tage() ist deckungsgleich mit VPKZP_ZEIT_VERSIONEN', () => {
  const aktuell = VPKZP_ZEIT_VERSIONEN[VPKZP_ZEIT_VERSIONEN.length - 1]
  const geschlossen = VPKZP_ZEIT_VERSIONEN.slice(0, -1)

  it('Verhinderungspflege im offenen Rechtsstand', () => {
    // 8 Wochen — BMG: "fuer laengstens acht Wochen je Kalenderjahr".
    expect(aktuell.vpMaxTage).toBe(56)
    expect(sqlWert('verhinderungspflege')).toBe(aktuell.vpMaxTage)
    expect(maxTageFuer('verhinderungspflege', 2026)).toBe(sqlWert('verhinderungspflege'))
  })

  it('Kurzzeitpflege im offenen Rechtsstand', () => {
    expect(sqlWert('kurzzeitpflege')).toBe(aktuell.kzpMaxTage)
    expect(maxTageFuer('kurzzeitpflege', 2026)).toBe(sqlWert('kurzzeitpflege'))
  })

  it('haelt auch die abgeschlossenen Rechtsstaende deckungsgleich', () => {
    // Ohne diese Pruefung koennte ein vergangenes Jahr in TypeScript und
    // in der Datenbank verschiedene Kontingente haben — eine Nacherfassung
    // fuer 2024 wuerde dann in der Oberflaeche passen und im Trigger
    // scheitern, oder umgekehrt.
    expect(geschlossen.length).toBeGreaterThan(0)
    for (const v of geschlossen) {
      const jahr = bisJahr(v)
      expect(sqlWert('verhinderungspflege', jahr)).toBe(v.vpMaxTage)
      expect(sqlWert('kurzzeitpflege', jahr)).toBe(v.kzpMaxTage)
      expect(maxTageFuer('verhinderungspflege', jahr)).toBe(v.vpMaxTage)
      expect(maxTageFuer('kurzzeitpflege', jahr)).toBe(v.kzpMaxTage)
    }
  })

  it('Jahresuntergrenze', () => {
    expect(sqlFruehestesJahr()).toBe(FRUEHESTES_ZEITJAHR)
  })

  it('kennt keine weitere Leistungsart als die beiden', () => {
    const zweige = [...sql.matchAll(/WHEN (?:p_jahr <= \d{4} AND )?lower\(p_art\) = '([a-z_]+)' THEN/g)]
      .map(m => m[1])
    expect([...new Set(zweige)].sort()).toEqual(['kurzzeitpflege', 'verhinderungspflege'])
  })

  it('hat fuer jeden Rechtsstand einen SQL-Zweig', () => {
    // Ein neuer Eintrag in VPKZP_ZEIT_VERSIONEN ohne passenden SQL-Zweig
    // faellt sonst erst auf, wenn ein Trigger live ablehnt.
    const jahresZweige = [...sql.matchAll(/WHEN p_jahr <= (\d{4}) AND lower\(p_art\)/g)]
      .map(m => Number(m[1]))
    expect([...new Set(jahresZweige)].sort()).toEqual(geschlossen.map(bisJahr).sort())
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
