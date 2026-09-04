/**
 * Resend-Webhook — Antwortverhalten
 *
 * Ein Webhook antwortet nicht für Menschen, sondern für eine Maschine,
 * die daraus ableitet, ob sie es nochmal versuchen soll. Ein falscher
 * Status ist deshalb kein Schönheitsfehler:
 *
 *   • 401 statt 503 bei fehlendem Schlüssel → Resend gibt auf, und das
 *     Ereignis ist endgültig weg, obwohl es nur an einer nicht gesetzten
 *     Variable lag.
 *   • 503 statt 401 bei falscher Signatur → jeder Angreifer bekommt
 *     „versuch's gleich nochmal" gesagt.
 *
 * Und: in KEINER Antwort darf ein Geheimnis stehen. Weder der erwartete
 * noch der erhaltene Signaturwert — wer beliebig oft probieren und die
 * Differenz lesen kann, braucht den Schlüssel nicht mehr.
 */

import { describe, it, expect } from 'vitest'
import {
  WIEDERHOLUNG_NACH_SEKUNDEN, signaturAbweisung, type AbweisungsGrund,
} from '@/lib/marketing/webhook-antwort'
import { pruefeSvixSignatur, TOLERANZ_MS } from '@/lib/marketing/webhook-signatur'

const ALLE_GRUENDE: AbweisungsGrund[] = ['kein_geheimnis', 'kopfzeilen', 'zeitstempel', 'signatur']

describe('Fehlender Schlüssel — 503, aber wiederholbar', () => {
  const a = signaturAbweisung('kein_geheimnis')

  it('antwortet mit 503', () => {
    // Die Nachricht ist womöglich echt — wir können es nur nicht prüfen.
    expect(a.status).toBe(503)
  })

  it('nennt die fehlende Variable beim NAMEN', () => {
    // Ein Variablenname ist kein Geheimnis. Ohne ihn steht bei der
    // Fehlersuche nur „nicht konfiguriert" da.
    expect(a.rumpf.fehlend).toBe('RESEND_WEBHOOK_SECRET')
  })

  it('sagt, was zu tun ist', () => {
    expect(String(a.rumpf.hinweis)).toMatch(/Resend-Dashboard/)
    expect(String(a.rumpf.hinweis)).toMatch(/whsec_/)
    expect(String(a.rumpf.hinweis)).toMatch(/base64/)
  })

  it('bittet ausdrücklich um Wiederholung — mit Wartezeit', () => {
    // Ohne Retry-After wählt Resend seinen eigenen Takt und schickt in
    // der Zwischenzeit deutlich mehr Anfragen als nötig.
    expect(a.rumpf.wiederholen).toBe(true)
    expect(a.kopfzeilen?.['Retry-After']).toBe(String(WIEDERHOLUNG_NACH_SEKUNDEN))
    expect(WIEDERHOLUNG_NACH_SEKUNDEN).toBeGreaterThan(0)
  })

  it('protokolliert als Fehler, nicht als Warnung', () => {
    // Ein Betriebsfehler, der still bleibt, lässt die Zustellspur
    // wochenlang ins Leere laufen.
    expect(a.protokoll.schwere).toBe('error')
  })
})

describe('Fehlende Kopfzeilen — 400, nicht 401', () => {
  const a = signaturAbweisung('kopfzeilen')

  it('antwortet mit 400', () => {
    // Fehlerhaft aufgebaute Anfrage, keine fehlgeschlagene
    // Authentifizierung. Ein 401 zeigte bei der Fehlersuche auf den
    // Schlüssel, wo in Wirklichkeit die Kopfzeilen fehlen.
    expect(a.status).toBe(400)
  })

  it('nennt die erwarteten Kopfzeilen', () => {
    for (const kopf of ['svix-id', 'svix-timestamp', 'svix-signature']) {
      expect(String(a.rumpf.hinweis)).toContain(kopf)
    }
  })

  it('bittet NICHT um Wiederholung', () => {
    expect(a.rumpf.wiederholen).toBe(false)
    expect(a.kopfzeilen?.['Retry-After']).toBeUndefined()
  })
})

describe('Ungültige Signatur — 401', () => {
  it('antwortet bei falscher Signatur mit 401', () => {
    expect(signaturAbweisung('signatur').status).toBe(401)
  })

  it('antwortet bei altem Zeitstempel mit 401', () => {
    expect(signaturAbweisung('zeitstempel').status).toBe(401)
  })

  it('unterscheidet beide Gründe im Rumpf', () => {
    // Hilft bei einem Uhrenversatz sofort weiter und verrät nichts über
    // den Schlüssel.
    expect(signaturAbweisung('zeitstempel').rumpf.grund).toBe('zeitstempel_ausserhalb_toleranz')
    expect(signaturAbweisung('signatur').rumpf.grund).toBe('signatur_passt_nicht')
  })

  it('lädt nicht zum erneuten Versuch ein', () => {
    for (const grund of ['zeitstempel', 'signatur'] as const) {
      expect(signaturAbweisung(grund).rumpf.wiederholen).toBe(false)
      expect(signaturAbweisung(grund).kopfzeilen?.['Retry-After']).toBeUndefined()
    }
  })
})

describe('Kein Geheimnis in Antwort oder Log', () => {
  const GEHEIM = 'whsec_c3VwZXJnZWhlaW1lcnNjaGx1ZXNzZWw='

  it('keine Antwort enthält den Schlüssel', () => {
    for (const grund of ALLE_GRUENDE) {
      const a = signaturAbweisung(grund)
      const text = JSON.stringify(a)
      expect(text, grund).not.toContain(GEHEIM)
      expect(text, grund).not.toContain('whsec_c3V')
    }
  })

  it('keine Antwort enthält einen Signaturwert', () => {
    for (const grund of ALLE_GRUENDE) {
      const text = JSON.stringify(signaturAbweisung(grund))
      // Kein base64-Block, der als Signatur durchgehen könnte.
      expect(text, grund).not.toMatch(/"[A-Za-z0-9+/]{40,}={0,2}"/)
    }
  })

  it('kein Protokolltext enthält einen Wert', () => {
    for (const grund of ALLE_GRUENDE) {
      const p = signaturAbweisung(grund).protokoll
      expect(p.text, grund).not.toContain(GEHEIM)
      expect(JSON.stringify(p.details ?? {}), grund).not.toContain(GEHEIM)
    }
  })

  it('nennt den Variablennamen nur dort, wo er hilft', () => {
    // Beim 503 ist er die Abhilfe; bei 400/401 wäre er ein Fingerzeig
    // auf die Serverkonfiguration, der niemandem hilft.
    expect(JSON.stringify(signaturAbweisung('kein_geheimnis'))).toContain('RESEND_WEBHOOK_SECRET')
    for (const grund of ['kopfzeilen', 'zeitstempel', 'signatur'] as const) {
      expect(JSON.stringify(signaturAbweisung(grund)), grund).not.toContain('RESEND_WEBHOOK_SECRET')
    }
  })
})

describe('Jeder Grund ist abgedeckt', () => {
  it('liefert für jeden möglichen Grund eine vollständige Antwort', () => {
    for (const grund of ALLE_GRUENDE) {
      const a = signaturAbweisung(grund)
      expect(a.status, grund).toBeGreaterThanOrEqual(400)
      expect(String(a.rumpf.error ?? ''), grund).not.toBe('')
      expect(a.protokoll.text.length, grund).toBeGreaterThan(10)
    }
  })

  it('nur der fehlende Schlüssel führt zu einem 5xx', () => {
    // 5xx heißt „unser Fehler". Bei Kopfzeilen und Signatur liegt der
    // Fehler beim Absender.
    for (const grund of ALLE_GRUENDE) {
      const erwartet5xx = grund === 'kein_geheimnis'
      expect(signaturAbweisung(grund).status >= 500, grund).toBe(erwartet5xx)
    }
  })
})

describe('Die Gründe passen zur Signaturprüfung', () => {
  const kopf = { id: 'msg_1', timestamp: String(Math.floor(Date.now() / 1000)), signature: 'v1,AAAA' }

  it('ohne Geheimnis: kein_geheimnis', () => {
    const e = pruefeSvixSignatur('{}', kopf, undefined)
    expect(e.ok).toBe(false)
    if (!e.ok) expect(e.grund).toBe('kein_geheimnis')
  })

  it('ohne Kopfzeilen: kopfzeilen', () => {
    const e = pruefeSvixSignatur('{}', { id: null, timestamp: null, signature: null }, 'whsec_AAAA')
    expect(e.ok).toBe(false)
    if (!e.ok) expect(e.grund).toBe('kopfzeilen')
  })

  it('zu alter Zeitstempel: zeitstempel', () => {
    const alt = String(Math.floor((Date.now() - TOLERANZ_MS - 60_000) / 1000))
    const e = pruefeSvixSignatur('{}', { ...kopf, timestamp: alt }, 'whsec_AAAA')
    expect(e.ok).toBe(false)
    if (!e.ok) expect(e.grund).toBe('zeitstempel')
  })

  it('falsche Signatur: signatur', () => {
    const e = pruefeSvixSignatur('{}', kopf, 'whsec_QUJDREVGR0hJSktMTU5PUA==')
    expect(e.ok).toBe(false)
    if (!e.ok) expect(e.grund).toBe('signatur')
  })
})
