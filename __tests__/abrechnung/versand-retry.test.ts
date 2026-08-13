// ═══════════════════════════════════════════════════════════════
// Wiederholversuche beim Versand an die Datenannahmestelle
// ═══════════════════════════════════════════════════════════════
// Ein SFTP-Versand ist nicht idempotent, sobald die Auftragsdatei oben liegt:
// viele Annahmestellen starten die Verarbeitung genau dann. Eine blinde
// Wiederholung nach einem Abbruch in dieser Phase kann dieselbe Abrechnung ein
// zweites Mal in Verarbeitung geben — bei der Kasse eine doppelte Forderung.
//
// Deshalb entscheidet nicht nur die Fehlerart, sondern auch die erreichte
// Phase. Diese Tests halten beide Bedingungen fest.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  istTransienterFehler, retryErlaubt, wartezeitMs, mitWiederholung,
  MAX_VERSUCHE, BASIS_WARTEZEIT_MS, MAX_WARTEZEIT_MS, RETRY_SICHERE_PHASEN,
  type TransportPhase,
} from '@/lib/abrechnung/retry'

/** Wartet nicht wirklich — sonst dauert der Test so lang wie der Backoff. */
const nichtWarten = async () => {}

describe('Fehlerklassifizierung', () => {
  it('erkennt Netzfehler als vorübergehend', () => {
    for (const meldung of [
      'connect ETIMEDOUT 10.0.0.1:22',
      'read ECONNRESET',
      'connect ECONNREFUSED',
      'Timed out while waiting for handshake',
      'socket hang up',
      'Connection lost before handshake',
    ]) {
      expect(istTransienterFehler(meldung), meldung).toBe(true)
    }
  })

  it('behandelt Konfigurationsfehler als dauerhaft', () => {
    for (const meldung of [
      'All configured authentication methods failed',
      'Permission denied (publickey)',
      'getaddrinfo ENOTFOUND sftp.beispiel.de',
      'No such file or directory',
      'Disk quota exceeded',
    ]) {
      expect(istTransienterFehler(meldung), meldung).toBe(false)
    }
  })

  it('lässt ein dauerhaftes Muster ein transientes überstimmen', () => {
    // Sonst würde "Permission denied after timeout" dreimal wiederholt.
    expect(istTransienterFehler('Permission denied after timeout')).toBe(false)
  })

  it('behandelt Unbekanntes als nicht wiederholbar', () => {
    expect(istTransienterFehler('Irgendetwas ist schiefgelaufen')).toBe(false)
    expect(istTransienterFehler(null)).toBe(false)
    expect(istTransienterFehler(undefined)).toBe(false)
  })
})

describe('Phasenabhängige Wiederholung', () => {
  it('erlaubt Wiederholung nur vor dem Upload der Auftragsdatei', () => {
    const phasen: TransportPhase[] = ['verbindung', 'nutzdaten', 'auftragsdatei', 'verifikation']
    for (const phase of phasen) {
      const bewertung = retryErlaubt(phase, 'connect ETIMEDOUT')
      expect(bewertung.erlaubt, phase).toBe(RETRY_SICHERE_PHASEN.includes(phase))
    }
  })

  it('nennt bei einem Abbruch nach der Auftragsdatei die doppelte Verarbeitung als Grund', () => {
    const bewertung = retryErlaubt('auftragsdatei', 'connect ETIMEDOUT')
    expect(bewertung.erlaubt).toBe(false)
    expect(bewertung.grund).toContain('zweite Verarbeitung')
  })

  it('wiederholt auch in sicherer Phase nicht bei dauerhaftem Fehler', () => {
    const bewertung = retryErlaubt('verbindung', 'All configured authentication methods failed')
    expect(bewertung.erlaubt).toBe(false)
    expect(bewertung.grund).toContain('Konfiguration')
  })
})

describe('Backoff', () => {
  it('wartet vor dem ersten Versuch nicht', () => {
    expect(wartezeitMs(1)).toBe(0)
  })

  it('verdoppelt die Wartezeit', () => {
    expect(wartezeitMs(2)).toBe(BASIS_WARTEZEIT_MS)
    expect(wartezeitMs(3)).toBe(BASIS_WARTEZEIT_MS * 2)
    expect(wartezeitMs(4)).toBe(BASIS_WARTEZEIT_MS * 4)
  })

  it('deckelt die Wartezeit, damit ein Aufruf nicht am Timeout stirbt', () => {
    expect(wartezeitMs(20)).toBe(MAX_WARTEZEIT_MS)
  })
})

describe('mitWiederholung', () => {
  const bewerte = (e: { erfolg: boolean; phase: TransportPhase; fehler: string | null }) => e

  it('gibt beim ersten Erfolg sofort zurück', async () => {
    let aufrufe = 0
    const ergebnis = await mitWiederholung(
      async () => { aufrufe++; return { erfolg: true, phase: 'fertig' as TransportPhase, fehler: null } },
      { bewerte, warte: nichtWarten },
    )
    expect(aufrufe).toBe(1)
    expect(ergebnis.erfolg).toBe(true)
    expect(ergebnis.versuche).toBe(1)
    expect(ergebnis.aufgegeben).toBeNull()
  })

  it('wiederholt einen Netzfehler und meldet Erfolg beim zweiten Versuch', async () => {
    let aufrufe = 0
    const ergebnis = await mitWiederholung(
      async () => {
        aufrufe++
        return aufrufe === 1
          ? { erfolg: false, phase: 'verbindung' as TransportPhase, fehler: 'connect ETIMEDOUT' }
          : { erfolg: true, phase: 'fertig' as TransportPhase, fehler: null }
      },
      { bewerte, warte: nichtWarten },
    )
    expect(aufrufe).toBe(2)
    expect(ergebnis.erfolg).toBe(true)
    expect(ergebnis.protokoll).toHaveLength(2)
  })

  it('gibt nach MAX_VERSUCHE auf und meldet "versuche_erschoepft"', async () => {
    let aufrufe = 0
    const ergebnis = await mitWiederholung(
      async () => {
        aufrufe++
        return { erfolg: false, phase: 'verbindung' as TransportPhase, fehler: 'connect ETIMEDOUT' }
      },
      { bewerte, warte: nichtWarten },
    )
    expect(aufrufe).toBe(MAX_VERSUCHE)
    expect(ergebnis.erfolg).toBe(false)
    expect(ergebnis.aufgegeben?.grund).toBe('versuche_erschoepft')
  })

  it('bricht nach dem Upload der Auftragsdatei SOFORT ab — kein zweiter Versuch', async () => {
    let aufrufe = 0
    const ergebnis = await mitWiederholung(
      async () => {
        aufrufe++
        return { erfolg: false, phase: 'auftragsdatei' as TransportPhase, fehler: 'connect ETIMEDOUT' }
      },
      { bewerte, warte: nichtWarten },
    )
    expect(aufrufe).toBe(1)
    expect(ergebnis.aufgegeben?.grund).toBe('nicht_wiederholbar')
  })

  it('wiederholt einen Authentifizierungsfehler nicht', async () => {
    let aufrufe = 0
    await mitWiederholung(
      async () => {
        aufrufe++
        return {
          erfolg: false,
          phase: 'verbindung' as TransportPhase,
          fehler: 'All configured authentication methods failed',
        }
      },
      { bewerte, warte: nichtWarten },
    )
    expect(aufrufe).toBe(1)
  })

  it('protokolliert jeden Versuch mit Phase und Wartezeit', async () => {
    const gewartet: number[] = []
    const ergebnis = await mitWiederholung(
      async () => ({ erfolg: false, phase: 'nutzdaten' as TransportPhase, fehler: 'ECONNRESET' }),
      { bewerte, warte: async (ms) => { gewartet.push(ms) } },
    )
    expect(ergebnis.protokoll.map(p => p.versuch)).toEqual([1, 2, 3])
    expect(gewartet).toEqual([BASIS_WARTEZEIT_MS, BASIS_WARTEZEIT_MS * 2])
    expect(ergebnis.protokoll[2].abbruchgrund).toContain('erschöpft')
  })
})
