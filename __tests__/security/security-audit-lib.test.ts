/**
 * Sicherheits-Audit — die Regeln im Anwendungscode
 *
 * Geprueft wird das, was NICHT die Datenbank entscheidet:
 *
 *   1. Geheimnisse kommen nicht in die Spur (bereinigeMetadaten)
 *   2. Der Ereigniskatalog ist in sich stimmig und bleibt durchlaessig
 *      fuer unbekannte Typen
 *   3. Geraetemerkmale: MAC ist immer 'not_available', kein
 *      Fingerprinting, Plattform-Erkennung, IP-Pruefung
 *   4. Der Geraete-Hash bleibt ueber Browser-Updates stabil und ist je
 *      Konto verschieden
 *   5. Die Meldemail traegt die geforderten Angaben und escapt HTML
 */

import { describe, it, expect } from 'vitest'
import {
  EREIGNISSE, KATEGORIEN, SCHWEREGRADE, regelFuer, UNBEKANNTE_REGEL,
  hoechsterSchweregrad, istKategorie, istSchweregrad,
  UEBERWACHUNGS_EREIGNISSE, ueberwachungspflichtig,
} from '@/lib/security/ereignisse'
import {
  geraeteMerkmale, geraeteHash, normalisierterUserAgent, ipAus, istIp,
  plattformAus, MAC_NICHT_VERFUEGBAR,
} from '@/lib/security/geraet'
import { bereinigeMetadaten, VERBOTENE_SCHLUESSEL, ENTFERNT } from '@/lib/security/audit'
import {
  baueMeldung, PRIVILEGIERTE_ROLLEN, meldetFuer, ergebnisAus, MELDE_NACHWEIS,
} from '@/lib/security/benachrichtigung'

const UA_CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const UA_SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

function kopfzeilen(werte: Record<string, string>): Headers {
  return new Headers(werte)
}

// ═══════════════════════════════════════════════════════════════════════
describe('Geheimnisse landen nicht in der Spur', () => {
  it('entfernt jeden verbotenen Schluessel, gross wie klein geschrieben', () => {
    const roh = {
      password: 'hunter2', PASSWORT: 'x', neuesPasswort: 'y',
      access_token: 'a', Authorization: 'Bearer x', cookie: 'sid=1',
      apiKey: 'k', mfa_secret: 's', iban: 'DE12', grund: 'bleibt',
    }
    const sauber = bereinigeMetadaten(roh) as Record<string, unknown>
    for (const [k, v] of Object.entries(sauber)) {
      if (k === 'grund') continue
      expect(v, `${k} wurde nicht entfernt`).toBe(ENTFERNT)
    }
    expect(sauber.grund).toBe('bleibt')
  })

  it('greift auch verschachtelt und in Listen', () => {
    const sauber = bereinigeMetadaten({
      aussen: { innen: { token: 'geheim', ok: 1 } },
      liste: [{ cookie: 'c' }, { ok: 2 }],
    }) as Record<string, any>
    expect(sauber.aussen.innen.token).toBe(ENTFERNT)
    expect(sauber.aussen.innen.ok).toBe(1)
    expect(sauber.liste[0].cookie).toBe(ENTFERNT)
    expect(sauber.liste[1].ok).toBe(2)
  })

  it('deckelt Tiefe, Laenge und Anzahl', () => {
    let tief: Record<string, unknown> = { ende: 'da' }
    for (let i = 0; i < 12; i++) tief = { stufe: tief }
    expect(JSON.stringify(bereinigeMetadaten(tief))).toContain('[zu tief]')

    const lang = bereinigeMetadaten({ t: 'x'.repeat(5000) }) as Record<string, string>
    expect(lang.t.length).toBeLessThanOrEqual(2001)

    const viele: Record<string, number> = {}
    for (let i = 0; i < 250; i++) viele[`f${i}`] = i
    expect(Object.keys(bereinigeMetadaten(viele) as object).length).toBeLessThanOrEqual(101)
  })

  it('fuehrt keinen Schluessel, der ein Geheimnis durchliesse', () => {
    // Gegenprobe zur Liste selbst: sie muss die Begriffe abdecken, die in
    // der Aufgabenstellung ausdruecklich verboten sind.
    for (const begriff of ['passwor', 'token', 'cookie', 'secret']) {
      expect(VERBOTENE_SCHLUESSEL).toContain(begriff)
    }
  })

  it('macht aus einer Funktion keinen Datensatz', () => {
    const sauber = bereinigeMetadaten({ f: () => 'x' }) as Record<string, unknown>
    expect(typeof sauber.f).toBe('string')
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Ereigniskatalog', () => {
  it('vergibt nur bekannte Kategorien und Schweregrade', () => {
    for (const [typ, regel] of Object.entries(EREIGNISSE)) {
      expect(KATEGORIEN, `${typ}: Kategorie`).toContain(regel.kategorie)
      expect(SCHWEREGRADE, `${typ}: Schweregrad`).toContain(regel.schweregrad)
      expect(regel.bezeichnung.length, `${typ}: Bezeichnung fehlt`).toBeGreaterThan(2)
    }
  })

  it('deckt jeden in der Aufgabenstellung genannten Ereignistyp ab', () => {
    for (const typ of [
      'login_success', 'login_failed', 'logout', 'session_start', 'session_end',
      'unknown_device', 'role_change', 'profile_change', 'org_change',
      'customer_change', 'employee_change', 'permission_change',
      'security_action', 'admin_action', 'blocked_action', 'security_error',
    ]) {
      expect(Object.keys(EREIGNISSE), `${typ} fehlt im Katalog`).toContain(typ)
    }
  })

  it('laesst einen unbekannten Typ durch, statt ihn zu verwerfen', () => {
    const regel = regelFuer('irgendwas_neues')
    expect(regel).toEqual(UNBEKANNTE_REGEL)
    expect(regel.schweregrad).toBe('warning')   // sichtbar
    expect(regel.meldepflichtig).toBe(false)    // aber nicht meldepflichtig
  })

  it('meldet die Ereignisse, die die Aufgabenstellung verlangt', () => {
    for (const typ of [
      'login_success', 'session_start', 'unknown_device',
      'role_change', 'permission_change', 'security_action',
      'unusual_login_series', 'critical_data_change',
    ]) {
      expect(EREIGNISSE[typ].meldepflichtig, `${typ} sollte melden`).toBe(true)
    }
  })

  it('meldet gerade NICHT, was das Postfach fluten wuerde', () => {
    for (const typ of ['logout', 'session_end', 'profile_change', 'blocked_action', 'rate_limit_exceeded']) {
      expect(EREIGNISSE[typ].meldepflichtig, `${typ} sollte nicht melden`).toBe(false)
    }
  })

  it('laesst einen Aufrufer hochstufen, aber nicht herunterstufen', () => {
    expect(hoechsterSchweregrad('info', 'critical')).toBe('critical')
    expect(hoechsterSchweregrad('critical', 'info')).toBe('critical')
    expect(hoechsterSchweregrad('warning', 'info')).toBe('warning')
  })

  it('erkennt Unfug nicht als Kategorie oder Schweregrad', () => {
    for (const wert of ['Auth', '', null, undefined, 42, {}]) {
      expect(istKategorie(wert)).toBe(false)
      expect(istSchweregrad(wert)).toBe(false)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Geraetemerkmale', () => {
  it('fuehrt die MAC-Adresse immer als nicht verfuegbar', () => {
    for (const ua of [UA_CHROME_MAC, UA_SAFARI_IPHONE, '']) {
      const m = geraeteMerkmale(kopfzeilen(ua ? { 'user-agent': ua } : {}))
      expect(m.deviceInfo.mac_address).toBe(MAC_NICHT_VERFUEGBAR)
      expect(m.deviceInfo.mac_address).toBe('not_available')
    }
  })

  it('erhebt nichts ausser dem, was die Kopfzeilen mitbringen', () => {
    const m = geraeteMerkmale(kopfzeilen({ 'user-agent': UA_CHROME_MAC }))
    // Kein Canvas-Hash, keine Aufloesung, keine Schriftenliste, keine Zeitzone.
    expect(Object.keys(m.deviceInfo).sort()).toEqual(
      ['betriebssystem', 'browser', 'mac_address', 'plattform'],
    )
  })

  it('erkennt Browser und Betriebssystem', () => {
    const mac = geraeteMerkmale(kopfzeilen({ 'user-agent': UA_CHROME_MAC }))
    expect(mac.deviceInfo.browser).toBe('Chrome')
    expect(mac.deviceInfo.betriebssystem).toBe('macOS')
    expect(mac.bezeichnung).toBe('Chrome auf macOS')

    const iphone = geraeteMerkmale(kopfzeilen({ 'user-agent': UA_SAFARI_IPHONE }))
    expect(iphone.deviceInfo.betriebssystem).toBe('iPhone')
  })

  it('laesst die Kopfzeile der nativen Huelle vorgehen', () => {
    expect(plattformAus(UA_SAFARI_IPHONE, null)).toBe('web')
    expect(plattformAus(UA_SAFARI_IPHONE, 'ios')).toBe('ios')
    expect(plattformAus(UA_CHROME_MAC, 'android')).toBe('android')
    expect(plattformAus(UA_CHROME_MAC, 'unfug')).toBe('web')
    expect(plattformAus(null, null)).toBe('unbekannt')
  })

  it('nimmt die App-Version nur aus der dafuer vorgesehenen Kopfzeile', () => {
    const m = geraeteMerkmale(kopfzeilen({
      'user-agent': UA_SAFARI_IPHONE, 'x-app-plattform': 'ios', 'x-app-version': '3.2.1',
    }))
    expect(m.appVersion).toBe('3.2.1')
    expect(m.plattform).toBe('ios')
    expect(m.deviceInfo.app_version).toBe('3.2.1')
  })

  it('liest die IP aus der Proxy-Kette und nur von dort', () => {
    expect(ipAus(kopfzeilen({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9')
    expect(ipAus(kopfzeilen({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4')
    expect(ipAus(kopfzeilen({}))).toBeNull()
  })

  it('verwirft, was keine Adresse ist — sonst scheitert der ganze Eintrag', () => {
    // ip_address ist vom Typ `inet`. Ein Proxy, der Unsinn setzt, darf
    // nicht das ganze Sicherheitsereignis kosten.
    expect(ipAus(kopfzeilen({ 'x-forwarded-for': 'unknown' }))).toBeNull()
    expect(ipAus(kopfzeilen({ 'x-forwarded-for': '999.1.1.1' }))).toBeNull()
    expect(istIp('2001:db8::1')).toBe(true)
    expect(istIp('192.168.1.1')).toBe(true)
    expect(istIp('nicht; eine ip')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Geraete-Kennung', () => {
  const KONTO_A = '11111111-1111-4111-8111-111111111111'
  const KONTO_B = '22222222-2222-4222-8222-222222222222'

  it('bleibt ueber ein Browser-Update stabil', () => {
    const alt = UA_CHROME_MAC
    const neu = alt.replace('128.0.0.0', '131.0.0.0').replace('537.36', '537.40')
    expect(normalisierterUserAgent(alt)).toBe(normalisierterUserAgent(neu))
    expect(geraeteHash(KONTO_A, 'web', alt)).toBe(geraeteHash(KONTO_A, 'web', neu))
  })

  it('unterscheidet Geraeteklassen', () => {
    expect(geraeteHash(KONTO_A, 'web', UA_CHROME_MAC))
      .not.toBe(geraeteHash(KONTO_A, 'ios', UA_SAFARI_IPHONE))
  })

  it('erlaubt kein kontouebergreifendes Wiedererkennen', () => {
    expect(geraeteHash(KONTO_A, 'web', UA_CHROME_MAC))
      .not.toBe(geraeteHash(KONTO_B, 'web', UA_CHROME_MAC))
  })

  it('gibt einen Hash zurueck, aus dem sich der User-Agent nicht ablesen laesst', () => {
    const h = geraeteHash(KONTO_A, 'web', UA_CHROME_MAC)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain('Chrome')
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Meldemail', () => {
  const basis = {
    ereignisId: 'e1e1e1e1-0000-4000-8000-000000000001',
    eventType: 'unknown_device',
    severity: 'warning' as const,
    userId: '11111111-1111-4111-8111-111111111111',
    userEmail: 'pflege@example.test',
    organizationId: 'aaaaaaaa-0000-4000-8000-000000000001',
    ip: '203.0.113.9',
    userAgent: UA_CHROME_MAC,
    plattform: 'web',
    geraet: 'Chrome auf macOS',
    zeitpunkt: new Date('2026-08-30T09:15:00Z'),
  }

  it('traegt alle geforderten Angaben', () => {
    const { html, text, betreff } = baueMeldung(basis, 'Alltagsengel UG')
    expect(betreff).toContain('Unbekanntes Geraet')
    for (const inhalt of [
      'pflege@example.test', 'unknown_device', '203.0.113.9',
      'Chrome auf macOS', 'Alltagsengel UG', basis.ereignisId,
    ]) {
      expect(html, `HTML ohne ${inhalt}`).toContain(inhalt)
      expect(text, `Text ohne ${inhalt}`).toContain(inhalt)
    }
    // Datum und Uhrzeit in deutscher Schreibweise.
    expect(text).toMatch(/\d{1,2}:\d{2}:\d{2}/)
  })

  it('unterschreibt mit Alltagsengel und ohne persoenlichen Namen', () => {
    const { html, text } = baueMeldung(basis, null)
    expect(html).toContain('Ihr Team von Alltagsengel')
    expect(text).toContain('Ihr Team von Alltagsengel')
    expect(html).not.toMatch(/Yusuf|Cilcioglu/i)
  })

  it('escapt HTML aus Werten, die von aussen kommen', () => {
    const { html } = baueMeldung(
      { ...basis, userAgent: '<img src=x onerror=alert(1)>', userEmail: 'a<b>@x.test' },
      '<script>böse</script>',
    )
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>böse')
    expect(html).toContain('&lt;img')
  })

  it('sagt in der Mail selbst, dass keine MAC-Adresse erhoben wird', () => {
    const { html } = baueMeldung(basis, null)
    expect(html).toContain('MAC-Adresse')
  })

  it('fuehrt genau die Rollen als privilegiert, die Verwaltungsrechte haben', () => {
    expect([...PRIVILEGIERTE_ROLLEN].sort()).toEqual(
      ['admin', 'buchhaltung', 'pdl', 'qm', 'superadmin'],
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Kontobezogener Alarm (ACCOUNT_SECURITY_ALERTS)
// ═══════════════════════════════════════════════════════════════════════

const OHNE = { privilegiert: false, ueberwachung: null }
const PRIVILEGIERT = { privilegiert: true, ueberwachung: null }

function ueberwacht(opts: Partial<{ alleEreignisse: boolean; aktiv: boolean }> = {}) {
  return {
    privilegiert: false,
    ueberwachung: {
      id: 'w1', userId: 'u1', organizationId: null,
      aktiv: opts.aktiv ?? true,
      alleEreignisse: opts.alleEreignisse ?? true,
      ohneSperrfrist: true, meldeEmail: null, emailKontrolle: null,
      grund: 'Test', angelegtVon: null, createdAt: '2026-08-30T00:00:00Z',
    },
  }
}

describe('Ueberwachungssatz', () => {
  it('nennt nur Ereignisse, die es im Katalog gibt', () => {
    for (const typ of UEBERWACHUNGS_EREIGNISSE) {
      expect(Object.keys(EREIGNISSE), `${typ} steht nicht im Katalog`).toContain(typ)
    }
  })

  it('ist eine OBERMENGE der meldepflichtigen Ereignisse', () => {
    // Sonst bekaeme ein ausdruecklich ueberwachtes Konto WENIGER Meldungen
    // als ein privilegiertes — genau umgekehrt zur Absicht.
    for (const [typ, regel] of Object.entries(EREIGNISSE)) {
      if (!regel.meldepflichtig) continue
      if (typ === MELDE_NACHWEIS) continue
      expect(UEBERWACHUNGS_EREIGNISSE, `${typ} fehlt im Ueberwachungssatz`).toContain(typ)
    }
  })

  it('deckt jeden in der Anforderung genannten Vorgang ab', () => {
    for (const typ of [
      'login_success', 'login_failed', 'session_start', 'session_end',
      'app_start', 'unknown_device', 'logout',
      'password_changed', 'password_reset_requested',
      'email_change', 'phone_change', 'account_data_change',
      'role_change', 'permission_change',
      'security_action', 'admin_action',
    ]) {
      expect(ueberwachungspflichtig(typ), `${typ} wird nicht ueberwacht`).toBe(true)
    }
  })

  it('nimmt den Versandnachweis ausdruecklich AUS', () => {
    // Sonst schriebe jede Mail eine Nachweiszeile, die die naechste Mail
    // ausloest — eine Endlosschleife mit Postversand.
    expect(UEBERWACHUNGS_EREIGNISSE).not.toContain(MELDE_NACHWEIS)
    expect(ueberwachungspflichtig(MELDE_NACHWEIS)).toBe(false)
  })

  it('kennt einen unbekannten Typ nicht', () => {
    expect(ueberwachungspflichtig('irgendwas_neues')).toBe(false)
  })
})

describe('Wer bekommt wofuer eine Meldung', () => {
  it('gibt einem gewoehnlichen Konto gar nichts', () => {
    for (const typ of ['login_success', 'role_change', 'logout', 'app_start']) {
      expect(meldetFuer(typ, OHNE).melden, typ).toBe(false)
    }
  })

  it('gibt einem privilegierten Konto die meldepflichtigen Ereignisse', () => {
    expect(meldetFuer('login_success', PRIVILEGIERT).melden).toBe(true)
    expect(meldetFuer('role_change', PRIVILEGIERT).melden).toBe(true)
  })

  it('laesst das Alltaegliche beim privilegierten Konto weg', () => {
    // Sonst bekaeme jede Verwaltungskraft jede eigene Abmeldung per Mail.
    expect(meldetFuer('logout', PRIVILEGIERT).melden).toBe(false)
    expect(meldetFuer('app_start', PRIVILEGIERT).melden).toBe(false)
    expect(meldetFuer('login_failed', PRIVILEGIERT).melden).toBe(false)
  })

  it('gibt einem ueberwachten Konto AUCH das Alltaegliche', () => {
    for (const typ of ['logout', 'app_start', 'login_failed', 'session_end', 'profile_change']) {
      expect(meldetFuer(typ, ueberwacht()).melden, typ).toBe(true)
    }
  })

  it('meldet niemals den Versandnachweis', () => {
    for (const lage of [OHNE, PRIVILEGIERT, ueberwacht()]) {
      expect(meldetFuer(MELDE_NACHWEIS, lage).melden).toBe(false)
    }
  })

  it('faellt mit alle_ereignisse = false auf den Katalogsatz zurueck', () => {
    const eng = ueberwacht({ alleEreignisse: false })
    expect(meldetFuer('login_success', eng).melden).toBe(true)
    expect(meldetFuer('logout', eng).melden).toBe(false)
  })

  it('schweigt bei einem abgeschalteten Eintrag', () => {
    const aus = ueberwacht({ aktiv: false })
    expect(meldetFuer('logout', aus).melden).toBe(false)
    expect(meldetFuer('login_success', aus).melden).toBe(false)
  })

  it('nennt in jedem Fall einen Grund', () => {
    for (const lage of [OHNE, PRIVILEGIERT, ueberwacht()]) {
      expect(meldetFuer('login_success', lage).grund.length).toBeGreaterThan(5)
    }
  })
})

describe('SUCCESS / FAILED', () => {
  const basis = {
    ereignisId: 'e1', severity: 'info' as const, userId: 'u1',
    userEmail: 'a@b.test', organizationId: null, ip: null, userAgent: null,
    plattform: 'web', geraet: null, zeitpunkt: new Date('2026-08-30T09:15:00Z'),
  }

  it('nennt Fehlversuche FAILED', () => {
    for (const typ of ['login_failed', 'mfa_challenge_failed', 'blocked_action', 'security_error']) {
      expect(ergebnisAus({ ...basis, eventType: typ }), typ).toBe('FAILED')
    }
  })

  it('nennt alles andere SUCCESS', () => {
    for (const typ of ['login_success', 'role_change', 'email_change', 'app_start']) {
      expect(ergebnisAus({ ...basis, eventType: typ }), typ).toBe('SUCCESS')
    }
  })

  it('laesst den Aufrufer widersprechen', () => {
    expect(ergebnisAus({ ...basis, eventType: 'role_change', metadata: { ergebnis: 'FAILED' } }))
      .toBe('FAILED')
  })
})

describe('Meldemail eines ueberwachten Kontos', () => {
  const k = {
    ereignisId: 'e1e1e1e1-0000-4000-8000-000000000001',
    eventType: 'email_change',
    severity: 'critical' as const,
    userId: '5fa1df42-0000-4000-8000-000000000001',
    userEmail: 'konto@example.test',
    organizationId: 'aaaaaaaa-0000-4000-8000-000000000001',
    ip: '203.0.113.9',
    userAgent: UA_CHROME_MAC,
    plattform: 'ios',
    geraet: 'Safari auf iPhone',
    zeitpunkt: new Date('2026-08-30T09:15:00Z'),
    benutzerName: 'Vorname Nachname',
    rolle: 'engel',
    appVersion: '3.2.1',
    browser: 'Safari',
    betriebssystem: 'iPhone',
    sessionReference: 'sess-abc',
    metadata: { funktion: 'profiles.email', vorher: 'alt@x.test', nachher: 'neu@x.test' },
  }

  it('traegt jede in der Anforderung genannte Angabe', () => {
    const { html, text } = baueMeldung(k, 'Alltagsengel UG')
    for (const inhalt of [
      'Vorname Nachname', k.userId, 'konto@example.test', 'engel',
      'email_change', '2026-08-30T09:15:00.000Z', 'SUCCESS',
      'profiles.email', 'alt@x.test', 'neu@x.test',
      '3.2.1', 'Safari', 'iPhone', '203.0.113.9',
      'sess-abc', k.ereignisId, 'Alltagsengel UG',
    ]) {
      expect(html, `HTML ohne ${inhalt}`).toContain(inhalt)
      expect(text, `Text ohne ${inhalt}`).toContain(inhalt)
    }
  })

  it('nennt UTC und lokale Zeit getrennt', () => {
    const { text } = baueMeldung(k, null)
    expect(text).toContain('Zeit (UTC)')
    expect(text).toContain('Zeit (lokal)')
    expect(text).toContain('2026-08-30T09:15:00.000Z')
    // Europe/Berlin liegt im August zwei Stunden vor UTC.
    expect(text).toMatch(/11:15:00/)
  })

  it('markiert einen Fehlversuch schon im Betreff', () => {
    const { betreff } = baueMeldung({ ...k, eventType: 'login_failed', severity: 'warning' }, null)
    expect(betreff).toContain('FEHLGESCHLAGEN')
  })

  it('nennt den Namen im Betreff — die Mail geht an die Verwaltung', () => {
    expect(baueMeldung(k, null).betreff).toContain('Vorname Nachname')
  })

  it('traegt weder Passwort noch Token, auch wenn es in den Metadaten steht', () => {
    const { html, text } = baueMeldung(
      { ...k, metadata: { ...k.metadata, password: 'hunter2', access_token: 'geheim' } },
      null,
    )
    expect(html).not.toContain('hunter2')
    expect(html).not.toContain('geheim')
    expect(text).not.toContain('hunter2')
    expect(text).not.toContain('geheim')
  })
})
