// ═══════════════════════════════════════════════════════════════
// Externe Freigaben — die drei Schalter, die nicht im Code liegen
// ═══════════════════════════════════════════════════════════════
// Was hier geprüft wird, ist genau eine Eigenschaft: dass eine Sperre auch
// dann hält, wenn jemand sie versehentlich zu öffnen versucht. Ein '1' statt
// 'true', ein 'TRUE' aus einer anderen Konvention, ein leerer String aus einem
// vergessenen Vercel-Feld — nichts davon darf einen Kanal öffnen, über den
// echte Forderungen an Kostenträger gehen.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  EXTERNE_FREIGABEN, ExternGesperrtError,
  istFreigegeben, pruefeFreigabe, freigabeUebersicht,
  type ExterneFreigabeId,
} from '@/lib/abrechnung/externe-freigaben'
import { sgbVKanalStatus } from '@/lib/abrechnung/sgb-v/versand'
import {
  kimKanalStatus, holeKimAdapter, holeAktivenKimAdapter, registriereKimAdapter,
  setzeKimAdapterZurueck, versucheKimOperation, NULL_ADAPTER, KimAdapterFehltError,
} from '@/lib/kim/adapter'
import { entferneZugangsdaten } from '@/lib/abrechnung/versand-protokoll'

const ALLE: ExterneFreigabeId[] = ['itsg_zertifiziert', 'sgb_v_302_freigabe', 'kim_aktiv']
const ENV_NAMEN = ALLE.map(id => EXTERNE_FREIGABEN[id].envVariable)

let gesichert: Record<string, string | undefined> = {}

beforeEach(() => {
  gesichert = Object.fromEntries(ENV_NAMEN.map(n => [n, process.env[n]]))
  for (const n of ENV_NAMEN) delete process.env[n]
  setzeKimAdapterZurueck()
})

afterEach(() => {
  for (const [n, wert] of Object.entries(gesichert)) {
    if (wert === undefined) delete process.env[n]
    else process.env[n] = wert
  }
  setzeKimAdapterZurueck()
})

describe('Feature-Gates: fail-closed', () => {
  it('ist ohne gesetzte Env-Variable gesperrt', () => {
    for (const id of ALLE) {
      expect(istFreigegeben(id), `${id} darf ohne Env nicht offen sein`).toBe(false)
    }
  })

  it.each(['1', 'TRUE', 'True', 'yes', 'ja', 'on', '', ' true', 'true ', 'truee'])(
    'öffnet NICHT bei Wert %o',
    (wert) => {
      for (const id of ALLE) {
        process.env[EXTERNE_FREIGABEN[id].envVariable] = wert
        expect(istFreigegeben(id), `${id} öffnete bei "${wert}"`).toBe(false)
      }
    },
  )

  it('öffnet ausschliesslich bei exakt "true"', () => {
    for (const id of ALLE) {
      process.env[EXTERNE_FREIGABEN[id].envVariable] = 'true'
      expect(istFreigegeben(id)).toBe(true)
    }
  })

  it('liest den Wert bei jedem Aufruf frisch (kein Modul-Cache)', () => {
    expect(istFreigegeben('itsg_zertifiziert')).toBe(false)
    process.env.ITSG_ZERTIFIZIERT = 'true'
    expect(istFreigegeben('itsg_zertifiziert')).toBe(true)
    process.env.ITSG_ZERTIFIZIERT = 'false'
    expect(istFreigegeben('itsg_zertifiziert')).toBe(false)
  })

  it('schaltet jeden Kanal einzeln — ein offenes Gate öffnet die anderen nicht', () => {
    process.env.ITSG_ZERTIFIZIERT = 'true'
    expect(istFreigegeben('itsg_zertifiziert')).toBe(true)
    expect(istFreigegeben('sgb_v_302_freigabe')).toBe(false)
    expect(istFreigegeben('kim_aktiv')).toBe(false)
  })
})

describe('pruefeFreigabe', () => {
  it('wirft statt einen Wahrheitswert zurückzugeben', () => {
    expect(() => pruefeFreigabe('itsg_zertifiziert')).toThrow(ExternGesperrtError)
  })

  it('nennt die Env-Variable und benennt, dass nichts übermittelt wurde', () => {
    try {
      pruefeFreigabe('itsg_zertifiziert', 'Auftrag 4711')
      expect.unreachable('hätte werfen müssen')
    } catch (err) {
      const e = err as ExternGesperrtError
      expect(e.code).toBe('EXTERN_GESPERRT')
      expect(e.envVariable).toBe('ITSG_ZERTIFIZIERT')
      expect(e.message).toContain('Auftrag 4711')
      expect(e.message).toContain('keine Forderung')
      expect(e.schritte.length).toBeGreaterThan(0)
    }
  })

  it('lässt bei offenem Gate durch', () => {
    process.env.SGB_V_302_FREIGABE = 'true'
    expect(() => pruefeFreigabe('sgb_v_302_freigabe')).not.toThrow()
  })
})

describe('freigabeUebersicht', () => {
  it('meldet alle drei Kanäle als gesperrt und nennt keine Secrets', () => {
    const u = freigabeUebersicht()
    expect(u.freigaben).toHaveLength(3)
    expect(u.alleFreigegeben).toBe(false)
    expect(u.gesperrt).toHaveLength(3)

    const serialisiert = JSON.stringify(u)
    for (const verboten of ['SECON_ZERT_PASSWORT=', 'PRIVATE KEY', 'password']) {
      expect(serialisiert).not.toContain(verboten)
    }
  })

  it('liefert je Kanal eine Eintragsliste für den Tag X', () => {
    for (const f of freigabeUebersicht().freigaben) {
      expect(f.eintragen.length, `${f.id} ohne Eintragsliste`).toBeGreaterThan(0)
      expect(f.schritte.length, `${f.id} ohne Schrittliste`).toBeGreaterThan(0)
      expect(f.stelle.length).toBeGreaterThan(0)
    }
  })
})

describe('§ 302: doppelte Sperre', () => {
  it('bleibt auch bei offenem Gate zu, solange der Generator fehlt', () => {
    process.env.SGB_V_302_FREIGABE = 'true'
    const status = sgbVKanalStatus()
    expect(status.freigegeben).toBe(true)
    expect(status.generatorImplementiert).toBe(false)
    expect(status.versandMoeglich).toBe(false)
    expect(status.blocker.join(' ')).toContain('Technische Anlage 1')
  })

  it('nennt bei geschlossenem Gate beide Blocker', () => {
    const status = sgbVKanalStatus()
    expect(status.versandMoeglich).toBe(false)
    expect(status.blocker).toHaveLength(2)
  })
})

describe('KIM-Adapter', () => {
  it('liefert ohne Registrierung den fail-closed Null-Adapter', () => {
    expect(holeKimAdapter()).toBe(NULL_ADAPTER)
  })

  it('wirft bei jeder Operation des Null-Adapters — auch bei status()', async () => {
    await expect(NULL_ADAPTER.senden({} as never)).rejects.toThrow(KimAdapterFehltError)
    await expect(NULL_ADAPTER.empfangen({} as never)).rejects.toThrow(KimAdapterFehltError)
    await expect(NULL_ADAPTER.status({} as never)).rejects.toThrow(KimAdapterFehltError)
  })

  it('verweigert den aktiven Adapter bei geschlossenem Gate', () => {
    registriereKimAdapter({
      name: 'test',
      senden: async () => ({ providerNachrichtId: 'x', angenommenAm: '' }),
      empfangen: async () => [],
      status: async () => ({ providerNachrichtId: 'x', status: 'unbekannt', zeitpunkt: null }),
    })
    expect(() => holeAktivenKimAdapter()).toThrow(ExternGesperrtError)
  })

  it('verweigert den aktiven Adapter bei offenem Gate ohne Provider', () => {
    process.env.KIM_AKTIV = 'true'
    expect(() => holeAktivenKimAdapter()).toThrow(KimAdapterFehltError)
  })

  it('bleibt zu, solange der Versandpfad gesperrt ist — auch mit Gate UND Provider', () => {
    process.env.KIM_AKTIV = 'true'
    registriereKimAdapter({
      name: 'test',
      senden: async () => ({ providerNachrichtId: 'x', angenommenAm: '' }),
      empfangen: async () => [],
      status: async () => ({ providerNachrichtId: 'x', status: 'zugestellt', zeitpunkt: null }),
    })
    const status = kimKanalStatus()
    expect(status.freigegeben).toBe(true)
    expect(status.adapterRegistriert).toBe(true)
    expect(status.versandImplementiert).toBe(false)
    expect(status.versandMoeglich).toBe(false)
    expect(() => holeAktivenKimAdapter()).toThrow(KimAdapterFehltError)
  })

  it('weist ungültige Adapter zurück', () => {
    expect(() => registriereKimAdapter({ name: 'kaputt' } as never)).toThrow()
  })

  it('versucheKimOperation liefert eine erklärte Sperre statt einer Ausnahme', async () => {
    const ergebnis = await versucheKimOperation('status', a => a.status({} as never))
    expect(ergebnis.ok).toBe(false)
    if (!ergebnis.ok) {
      expect(ergebnis.code).toBe('EXTERN_GESPERRT')
      expect(ergebnis.grund).toContain('KIM_AKTIV')
    }
  })
})

describe('Versandprotokoll: keine Zugangsdaten', () => {
  it('entfernt Benutzernamen aus dem Transportprotokoll', () => {
    const roh = [
      '[2026-09-01T10:00:00Z] Verbinde zu sftp.example.de:22 (DAVASO)',
      '[2026-09-01T10:00:01Z] Verbunden als abrechnung-kunde-4711',
      '[2026-09-01T10:00:02Z] Login als abrechnung-kunde-4711 erfolgreich',
    ].join('\n')

    const bereinigt = entferneZugangsdaten(roh)!
    expect(bereinigt).not.toContain('abrechnung-kunde-4711')
    expect(bereinigt).toContain('«Benutzer»')
    // Der Host bleibt: er wird für die Fehlersuche gebraucht und ist kein Geheimnis.
    expect(bereinigt).toContain('sftp.example.de')
  })

  it('entfernt versehentlich durchgereichte Schlüssel und Passwörter', () => {
    const roh = 'FEHLER: key=-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\npasswort: geheim123'
    const bereinigt = entferneZugangsdaten(roh)!
    expect(bereinigt).not.toContain('PRIVATE KEY-----\nabc')
    expect(bereinigt).not.toContain('geheim123')
    expect(bereinigt).toContain('«Private Key entfernt»')
  })

  it('verträgt leere Eingaben', () => {
    expect(entferneZugangsdaten(null)).toBeNull()
    expect(entferneZugangsdaten(undefined)).toBeNull()
    expect(entferneZugangsdaten('')).toBeNull()
  })
})
