/**
 * Cookie-Einwilligung — Kategorien
 *
 * Die Frage „darf dieses Skript laden?" wird an fünf Stellen gestellt.
 * Hier steht die einzige Antwort, und deshalb hängt an diesen Tests, ob
 * vor einer Zustimmung etwas lädt, das nicht laden darf.
 *
 * Zwei Eigenschaften sind heikel:
 *   • Ohne Entscheidung ist die Antwort NEIN — nicht „noch nicht gefragt,
 *     also erstmal ja".
 *   • Der Altbestand („accepted"/"rejected" als reine Zeichenkette) muss
 *     übersetzt werden. Ihn zu ignorieren hieße, allen Bestandsbesuchern
 *     erneut den Banner zu zeigen und eine erteilte Einwilligung
 *     wegzuwerfen.
 */

import { describe, it, expect } from 'vitest'
import {
  CONSENT_SCHLUESSEL, CONSENT_VERSION, KATEGORIEN, KATEGORIE_TEXT,
  alleAkzeptiert, auswahl, darf, gtagEinwilligung, istKategorie, lies,
  nurNotwendig, schreibe,
} from '@/lib/consent/kategorien'

const ZEIT = '2026-09-04T10:00:00.000Z'

describe('Kategorien', () => {
  it('kennt genau die drei vereinbarten', () => {
    expect(KATEGORIEN).toEqual(['notwendig', 'statistik', 'marketing'])
    expect(istKategorie('marketing')).toBe(true)
    expect(istKategorie('werbung')).toBe(false)
  })

  it('hat für jede Kategorie Titel, Erklärung und die eingesetzten Dienste', () => {
    // Ohne Nennung der Dienste ist die Einwilligung nicht informiert.
    for (const k of KATEGORIEN) {
      expect(KATEGORIE_TEXT[k].titel.length, k).toBeGreaterThan(0)
      expect(KATEGORIE_TEXT[k].kurz.length, k).toBeGreaterThan(30)
      expect(KATEGORIE_TEXT[k].dienste.length, k).toBeGreaterThan(0)
    }
  })

  it('nennt Google Ads unter Marketing und nicht unter Statistik', () => {
    expect(KATEGORIE_TEXT.marketing.dienste).toMatch(/Google Ads/)
    expect(KATEGORIE_TEXT.statistik.dienste).not.toMatch(/Google Ads/)
  })
})

describe('darf()', () => {
  it('erlaubt Notwendiges immer — auch ohne Entscheidung', () => {
    expect(darf(null, 'notwendig')).toBe(true)
    expect(darf(nurNotwendig(), 'notwendig')).toBe(true)
  })

  it('verweigert ohne Entscheidung ALLES andere', () => {
    // Der Kern: solange niemand zugestimmt hat, lädt nichts.
    expect(darf(null, 'statistik')).toBe(false)
    expect(darf(null, 'marketing')).toBe(false)
  })

  it('verweigert nach „nur Notwendige"', () => {
    const z = nurNotwendig(ZEIT)
    expect(darf(z, 'statistik')).toBe(false)
    expect(darf(z, 'marketing')).toBe(false)
  })

  it('erlaubt nach „Alle akzeptieren"', () => {
    const z = alleAkzeptiert(ZEIT)
    expect(darf(z, 'statistik')).toBe(true)
    expect(darf(z, 'marketing')).toBe(true)
  })

  it('trennt die Kategorien wirklich', () => {
    // Genau das war vorher nicht möglich: wer der Reichweitenmessung
    // zustimmen wollte, aber nicht dem Retargeting, musste alles ablehnen.
    const nurStatistik = auswahl({ statistik: true }, ZEIT)
    expect(darf(nurStatistik, 'statistik')).toBe(true)
    expect(darf(nurStatistik, 'marketing')).toBe(false)

    const nurMarketing = auswahl({ marketing: true }, ZEIT)
    expect(darf(nurMarketing, 'statistik')).toBe(false)
    expect(darf(nurMarketing, 'marketing')).toBe(true)
  })

  it('lässt notwendig nicht abwählen', () => {
    expect(auswahl({ statistik: false, marketing: false }, ZEIT).notwendig).toBe(true)
  })
})

describe('lies() — Altbestand', () => {
  it('übersetzt ein früheres „accepted" in volle Zustimmung', () => {
    const z = lies('accepted')
    expect(z?.statistik).toBe(true)
    expect(z?.marketing).toBe(true)
    expect(z?.version).toBe(1)
  })

  it('übersetzt ein früheres „rejected" in nur Notwendiges', () => {
    const z = lies('rejected')
    expect(z?.statistik).toBe(false)
    expect(z?.marketing).toBe(false)
    expect(z?.notwendig).toBe(true)
  })

  it('erfindet keinen Zeitpunkt für den Altbestand', () => {
    // Ein erfundener Nachweiszeitpunkt wäre schlechter als gar keiner.
    expect(lies('accepted')?.zeitpunkt).toBe('')
  })

  it('zeigt Bestandsbesuchern den Banner NICHT erneut', () => {
    // Der eigentliche Zweck der Übersetzung.
    expect(lies('accepted')).not.toBeNull()
    expect(lies('rejected')).not.toBeNull()
  })
})

describe('lies() — fail-closed', () => {
  it('gibt ohne Eintrag null zurück (noch nicht entschieden)', () => {
    expect(lies(null)).toBeNull()
    expect(lies(undefined)).toBeNull()
    expect(lies('')).toBeNull()
    expect(lies('   ')).toBeNull()
  })

  it('verwirft kaputtes JSON, statt es als Zustimmung zu lesen', () => {
    expect(lies('{kaputt')).toBeNull()
    expect(lies('null')).toBeNull()
    expect(lies('[]')).toBeNull()
    expect(lies('"text"')).toBeNull()
  })

  it('verwirft eine ältere Fassung', () => {
    // Eine Einwilligung zu etwas, das es damals nicht gab, ist für das
    // Neue keine.
    const alt = JSON.stringify({ ...alleAkzeptiert(ZEIT), version: CONSENT_VERSION - 1 })
    expect(lies(alt)).toBeNull()
  })

  it('liest fehlende Felder als Nein, nicht als Ja', () => {
    const z = lies(JSON.stringify({ version: CONSENT_VERSION }))
    expect(z?.statistik).toBe(false)
    expect(z?.marketing).toBe(false)
  })

  it('akzeptiert nur echtes true, keine wahrheitsähnlichen Werte', () => {
    const z = lies(JSON.stringify({ version: CONSENT_VERSION, statistik: 'ja', marketing: 1 }))
    expect(z?.statistik).toBe(false)
    expect(z?.marketing).toBe(false)
  })
})

describe('schreibe() und lies() passen zusammen', () => {
  it('überstehen einen Rundlauf', () => {
    for (const z of [nurNotwendig(ZEIT), alleAkzeptiert(ZEIT), auswahl({ statistik: true }, ZEIT)]) {
      expect(lies(schreibe(z))).toEqual(z)
    }
  })

  it('halten den Zeitpunkt als Nachweis fest', () => {
    expect(lies(schreibe(alleAkzeptiert(ZEIT)))?.zeitpunkt).toBe(ZEIT)
  })
})

describe('gtagEinwilligung', () => {
  it('setzt ohne Entscheidung alles auf denied', () => {
    expect(gtagEinwilligung(null)).toEqual({
      ad_storage: 'denied', ad_user_data: 'denied',
      ad_personalization: 'denied', analytics_storage: 'denied',
    })
  })

  it('hängt analytics_storage an der Statistik', () => {
    const g = gtagEinwilligung(auswahl({ statistik: true }, ZEIT))
    expect(g.analytics_storage).toBe('granted')
    // Wer nur der Reichweitenmessung zustimmt, hat der Werbemessung
    // nicht zugestimmt.
    expect(g.ad_storage).toBe('denied')
    expect(g.ad_user_data).toBe('denied')
    expect(g.ad_personalization).toBe('denied')
  })

  it('hängt die drei ad_*-Schalter am Marketing', () => {
    const g = gtagEinwilligung(auswahl({ marketing: true }, ZEIT))
    expect(g.ad_storage).toBe('granted')
    expect(g.ad_user_data).toBe('granted')
    expect(g.ad_personalization).toBe('granted')
    expect(g.analytics_storage).toBe('denied')
  })

  it('setzt bei voller Zustimmung alles auf granted', () => {
    expect(Object.values(gtagEinwilligung(alleAkzeptiert(ZEIT)))).toEqual(
      ['granted', 'granted', 'granted', 'granted'],
    )
  })

  it('nennt genau die vier Schalter des Consent Mode v2', () => {
    expect(Object.keys(gtagEinwilligung(null)).sort()).toEqual([
      'ad_personalization', 'ad_storage', 'ad_user_data', 'analytics_storage',
    ])
  })
})

describe('Speicherschlüssel', () => {
  it('bleibt der aus dem Bestand', () => {
    // Ein neuer Schlüssel hieße: alle Bestandsbesucher werden erneut gefragt.
    expect(CONSENT_SCHLUESSEL).toBe('ae_cookie_consent')
  })
})
