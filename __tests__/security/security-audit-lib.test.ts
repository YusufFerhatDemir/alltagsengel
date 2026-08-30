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
} from '@/lib/security/ereignisse'
import {
  geraeteMerkmale, geraeteHash, normalisierterUserAgent, ipAus, istIp,
  plattformAus, MAC_NICHT_VERFUEGBAR,
} from '@/lib/security/geraet'
import { bereinigeMetadaten, VERBOTENE_SCHLUESSEL, ENTFERNT } from '@/lib/security/audit'
import { baueMeldung, PRIVILEGIERTE_ROLLEN } from '@/lib/security/benachrichtigung'

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
