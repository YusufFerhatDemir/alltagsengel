/**
 * Provenienz — echte Nutzeraktivitaet von Nachgestelltem trennen
 *
 * DER VORFALL DAHINTER (31.08.2026)
 * Ein Funktionstest stand als `security_action` in der Spur, die Mail
 * hiess „Sicherheitshinweis: Sicherheitskritische Aktion — Rukiye
 * Karakaya", und daraus wurde geschlossen, das Konto sei um 06:01
 * angemeldet gewesen. Es gab an dem Tag ueberhaupt keine Anmeldung.
 * Dass es ein Test war, stand nur im Fliesstext eines Metadatenfeldes.
 *
 * Die Pruefungen zielen deshalb auf genau die Wege, auf denen etwas
 * Nachgestelltes wieder als echt durchgehen koennte.
 */

import { describe, it, expect } from 'vitest'
import {
  PROVENIENZEN, ECHTE_PROVENIENZEN, TEST_EREIGNISSE,
  istProvenienz, istEchteNutzeraktivitaet, provenienzAus,
  leiteProvenienzAb, betreffZusatz, BEZEICHNUNG_PROVENIENZ,
  PROVENIENZ_SCHLUESSEL,
} from '@/lib/security/herkunft'
import { EREIGNISSE, UEBERWACHUNGS_EREIGNISSE, regelFuer } from '@/lib/security/ereignisse'
import { baueMeldung } from '@/lib/security/benachrichtigung'

describe('Provenienz — das Vokabular', () => {
  it('kennt genau die sechs vorgegebenen Werte', () => {
    expect([...PROVENIENZEN]).toEqual([
      'REAL_USER_LOGIN', 'APP_START', 'SESSION_REFRESH',
      'TEST_ALERT', 'ADMIN_TEST', 'SYNTHETIC_EVENT',
    ])
  })

  it('genau drei davon gelten als echte Nutzeraktivitaet', () => {
    expect([...ECHTE_PROVENIENZEN]).toEqual(['REAL_USER_LOGIN', 'APP_START', 'SESSION_REFRESH'])
    for (const p of PROVENIENZEN) {
      expect(istEchteNutzeraktivitaet(p)).toBe(ECHTE_PROVENIENZEN.includes(p))
    }
  })

  it('jede Provenienz hat einen Klartext, und die drei Nicht-Echten sagen es deutlich', () => {
    for (const p of PROVENIENZEN) expect(BEZEICHNUNG_PROVENIENZ[p]).toBeTruthy()
    expect(BEZEICHNUNG_PROVENIENZ.TEST_ALERT).toMatch(/TESTALARM/)
    expect(BEZEICHNUNG_PROVENIENZ.ADMIN_TEST).toMatch(/VERWALTUNGSTEST/)
    expect(BEZEICHNUNG_PROVENIENZ.SYNTHETIC_EVENT).toMatch(/SYNTHETISCH/)
  })
})

describe('istEchteNutzeraktivitaet — fail-closed', () => {
  it('unbekannte, fehlende und falsch getippte Werte sind NICHT echt', () => {
    for (const wert of [
      null, undefined, '', 'echt', 'real_user_login', 'REAL_USER_LOGIN ',
      'LOGIN', 42, {}, [], true,
    ]) {
      expect(istEchteNutzeraktivitaet(wert)).toBe(false)
    }
  })

  it('Bestandszeilen ohne Provenienz gelten nicht als echt', () => {
    // Alles vor dem 31.08.2026 traegt keine. Ueber diese Zeilen ist
    // nichts belegt — „nicht belegt" als „echt" zu lesen war der Fehler.
    expect(provenienzAus({ hinweis: 'irgendwas' })).toBeNull()
    expect(istEchteNutzeraktivitaet(provenienzAus({}))).toBe(false)
    expect(istEchteNutzeraktivitaet(provenienzAus(null))).toBe(false)
  })

  it('der Schluessel ist NICHT `herkunft` — der ist vom Nachzuegler belegt', () => {
    // Der Nachzuegler schreibt dort seit jeher die Quelltabelle
    // ('auth.users.last_sign_in_at'). Ein zweiter Sinn auf demselben
    // Schluessel haette beide Aussagen unbrauchbar gemacht.
    expect(PROVENIENZ_SCHLUESSEL).toBe('provenienz')
    expect(provenienzAus({ herkunft: 'auth.users.last_sign_in_at' })).toBeNull()
  })
})

describe('leiteProvenienzAb — der Aufrufer kann sich nicht als echt ausgeben', () => {
  it('eine Anmeldung aus echtem Aufruf ist REAL_USER_LOGIN', () => {
    expect(leiteProvenienzAb('login_success', { ausEchtemAufruf: true })).toBe('REAL_USER_LOGIN')
    expect(leiteProvenienzAb('app_start', { ausEchtemAufruf: true })).toBe('APP_START')
    expect(leiteProvenienzAb('session_start', { ausEchtemAufruf: true })).toBe('SESSION_REFRESH')
    expect(leiteProvenienzAb('session_refresh', { ausEchtemAufruf: true })).toBe('SESSION_REFRESH')
  })

  it('DIESELBE Anmeldung OHNE echten Aufruf ist synthetisch', () => {
    // Der Nachzuegler-Lauf traegt Anmeldungen aus auth.users nach. Sie
    // sind protokollierenswert, aber sie belegen an dieser Zeile keinen
    // Menschen am Geraet.
    expect(leiteProvenienzAb('login_success', { ausEchtemAufruf: false })).toBe('SYNTHETIC_EVENT')
    expect(leiteProvenienzAb('app_start', { ausEchtemAufruf: false })).toBe('SYNTHETIC_EVENT')
  })

  it('eine Testerklaerung stuft HERAB — auch bei echtem Aufruf', () => {
    expect(leiteProvenienzAb('login_success', {
      ausEchtemAufruf: true, alsTestErklaert: 'TEST_ALERT',
    })).toBe('TEST_ALERT')
    expect(leiteProvenienzAb('login_success', {
      ausEchtemAufruf: true, alsTestErklaert: 'ADMIN_TEST',
    })).toBe('ADMIN_TEST')
  })

  it('eine Testerklaerung kann NIE hochstufen', () => {
    // Der entscheidende Riegel: kein Wert, den ein Aufrufer mitgibt,
    // macht aus einem Skriptaufruf eine echte Anmeldung.
    for (const versuch of ECHTE_PROVENIENZEN) {
      expect(leiteProvenienzAb('security_action', {
        ausEchtemAufruf: false, alsTestErklaert: versuch,
      })).toBe('SYNTHETIC_EVENT')
      expect(leiteProvenienzAb('login_success', {
        ausEchtemAufruf: false, alsTestErklaert: versuch,
      })).toBe('SYNTHETIC_EVENT')
    }
  })

  it('die Test-Ereignistypen sind IMMER nicht-echt, egal wie geschrieben', () => {
    expect(leiteProvenienzAb('test_alert', { ausEchtemAufruf: true })).toBe('TEST_ALERT')
    expect(leiteProvenienzAb('admin_test', { ausEchtemAufruf: true })).toBe('ADMIN_TEST')
    for (const typ of TEST_EREIGNISSE) {
      expect(istEchteNutzeraktivitaet(
        leiteProvenienzAb(typ, { ausEchtemAufruf: true, alsTestErklaert: 'REAL_USER_LOGIN' }),
      )).toBe(false)
    }
  })

  it('eine echte Rechteaenderung ist synthetisch — sie IST kein Anmeldeverhalten', () => {
    // Absicht, kein Versehen: die Angabe beantwortet „hat sich jemand
    // angemeldet?", nicht „ist das echt passiert?".
    expect(leiteProvenienzAb('role_change', { ausEchtemAufruf: true })).toBe('SYNTHETIC_EVENT')
  })
})

describe('Ereigniskatalog — Test und Anmeldung sind getrennte Typen', () => {
  it('test_alert und admin_test existieren und heissen im Klartext nach Test', () => {
    expect(EREIGNISSE.test_alert).toBeDefined()
    expect(EREIGNISSE.admin_test).toBeDefined()
    expect(regelFuer('test_alert').bezeichnung).toMatch(/TESTALARM/)
    expect(regelFuer('admin_test').bezeichnung).toMatch(/VERWALTUNGSTEST/)
  })

  it('ein Testalarm ist meldepflichtig — sonst testet er nichts', () => {
    expect(EREIGNISSE.test_alert.meldepflichtig).toBe(true)
    expect(EREIGNISSE.admin_test.meldepflichtig).toBe(true)
    expect(UEBERWACHUNGS_EREIGNISSE).toContain('test_alert')
    expect(UEBERWACHUNGS_EREIGNISSE).toContain('admin_test')
  })

  it('session_refresh ist ein eigener Typ und keine Anmeldung', () => {
    expect(EREIGNISSE.session_refresh).toBeDefined()
    expect(EREIGNISSE.session_refresh.kategorie).toBe('session')
    expect(regelFuer('session_refresh').bezeichnung).not.toMatch(/Anmeldung/)
  })

  it('kein Test-Ereignistyp traegt die Kategorie auth', () => {
    for (const typ of TEST_EREIGNISSE) {
      expect(EREIGNISSE[typ]?.kategorie).not.toBe('auth')
    }
  })
})

describe('Meldemail — die Herkunft steht im Betreff, nicht im Kleingedruckten', () => {
  const basis = {
    ereignisId: 'aaaaaaaa-1111-4111-8111-111111111111',
    eventType: 'test_alert',
    severity: 'info' as const,
    userId: 'bbbbbbbb-2222-4222-8222-222222222222',
    userEmail: 'jemand@example.de',
    organizationId: null,
    ip: '1.2.3.4',
    userAgent: 'Mozilla/5.0',
    plattform: 'web',
    geraet: 'Chrome auf macOS',
    zeitpunkt: new Date('2026-08-31T04:01:14.000Z'),
    benutzerName: 'Rukiye Karakaya',
  }

  it('markiert einen Testalarm im Betreff', () => {
    const { betreff } = baueMeldung(
      { ...basis, metadata: { provenienz: 'TEST_ALERT' } }, null,
    )
    expect(betreff).toContain('[TESTALARM]')
  })

  it('sagt im Text ausdruecklich, dass NICHTS passiert ist', () => {
    const { html, text } = baueMeldung(
      { ...basis, metadata: { provenienz: 'TEST_ALERT' } }, null,
    )
    expect(text).toMatch(/BELEGT KEINE AKTIVITÄT/)
    expect(html).toMatch(/KEINE Aktivität des Kontoinhabers/)
    // Der Satz, der zum Missverstaendnis gefuehrt haette, darf hier NICHT stehen.
    expect(text).not.toMatch(/sperren Sie das Konto/)
  })

  it('eine echte Anmeldung bekommt KEINE Testmarkierung und die Handlungsaufforderung', () => {
    const { betreff, text } = baueMeldung(
      { ...basis, eventType: 'login_success', metadata: { provenienz: 'REAL_USER_LOGIN' } }, null,
    )
    expect(betreff).not.toMatch(/\[/)
    expect(text).toMatch(/sperren Sie das Konto/)
  })

  it('eine Zeile OHNE Provenienz wird als unbelegt markiert, nicht als echt', () => {
    const { betreff, text } = baueMeldung({ ...basis, metadata: {} }, null)
    expect(betreff).toContain('[HERKUNFT UNBELEGT]')
    expect(text).toMatch(/BELEGT KEINE AKTIVITÄT/)
  })

  it('traegt alle geforderten Angaben: Nutzer, Typ, Zeit, Audit-ID, Herkunft, Zustellbezug', () => {
    const { text } = baueMeldung(
      { ...basis, metadata: { provenienz: 'TEST_ALERT' } }, null,
    )
    expect(text).toContain('Rukiye Karakaya')
    expect(text).toContain('jemand@example.de')
    expect(text).toContain('test_alert')
    expect(text).toContain('2026-08-31T04:01:14.000Z')
    expect(text).toContain(basis.ereignisId)
    expect(text).toMatch(/Herkunft: *TEST_ALERT/)
    expect(text).toMatch(/Zustellbezug/)
    // Die Provider-ID DIESER Mail kann nicht drinstehen — sie entsteht
    // erst bei der Uebergabe. Stattdessen der Weg, sie nachzuschlagen.
    expect(text).toMatch(/Provider-ID und Zustellstatus/)
  })
})

describe('betreffZusatz', () => {
  it('markiert jede nicht-echte Herkunft und keine echte', () => {
    expect(betreffZusatz('TEST_ALERT')).toBe(' [TESTALARM]')
    expect(betreffZusatz('ADMIN_TEST')).toBe(' [VERWALTUNGSTEST]')
    expect(betreffZusatz('SYNTHETIC_EVENT')).toBe(' [SYNTHETISCH]')
    expect(betreffZusatz(null)).toBe(' [HERKUNFT UNBELEGT]')
    for (const p of ECHTE_PROVENIENZEN) expect(betreffZusatz(p)).toBe('')
  })
})

describe('istProvenienz', () => {
  it('nimmt nur exakte Werte an', () => {
    for (const p of PROVENIENZEN) expect(istProvenienz(p)).toBe(true)
    for (const w of ['test_alert', 'Real_User_Login', '', null, 0]) {
      expect(istProvenienz(w)).toBe(false)
    }
  })
})
