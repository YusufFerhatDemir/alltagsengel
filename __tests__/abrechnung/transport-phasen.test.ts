/**
 * SFTP-Transport an die Datenannahmestelle — Phasen und Sperren
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `lib/abrechnung/transport.ts` ist der Weg nach draussen: hier verlaesst
 * die verschluesselte EDIFACT-Datei das Haus und wird zur Forderung
 * gegenueber der Pflegekasse. Das Modul hatte keinen Test.
 *
 * Geprueft wird nicht der SFTP-Client — der ist eine Aussenschnittstelle
 * und wird ersetzt. Geprueft wird das, was ueber Geld entscheidet:
 *
 *   1. Die PHASE im Ergebnis. `RETRY_SICHERE_PHASEN` in retry.ts erlaubt
 *      eine automatische Wiederholung nur bis einschliesslich 'nutzdaten'.
 *      Ab dem Upload der Auftragsdatei kann die Annahmestelle die
 *      Verarbeitung gestartet haben — eine Wiederholung erzeugte dann
 *      eine ZWEITE Forderung. Meldet das Modul nach einem Fehlschlag
 *      beim Auftrags-Upload faelschlich 'nutzdaten', wiederholt der
 *      Aufrufer automatisch. Die Phase ist damit keine Protokollnotiz,
 *      sondern die Bremse.
 *
 *   2. Die Reihenfolge Nutzdaten VOR Auftragsdatei. Andersherum liegt bei
 *      der Annahmestelle ein Auftrag ohne Daten.
 *
 *   3. Die Dakota-Freigabe. Ohne Freischaltung des Bundeslandes darf
 *      keine Verbindung zustande kommen — nicht erst kein Upload.
 *
 * BETRAEGE/ADRESSEN: alles Testwerte innerhalb dieses Prozesses. Es wird
 * keine Verbindung aufgebaut und keine Datei uebertragen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── SFTP-Client ersetzen ────────────────────────────────────────────
//
// vi.hoisted, weil vi.mock() an den Dateianfang gezogen wird und die
// Attrappe deshalb vor jeder normalen Konstante existieren muss.
const H = vi.hoisted(() => {
  interface SftpAufruf { name: string; args: unknown[] }
  const z = {
    aufrufe: [] as SftpAufruf[],
    /** Methodenname → Fehler, den dieser Aufruf werfen soll. */
    fehlerBei: {} as Record<string, string>,
    /** Groesse, die stat() meldet; null ⇒ Groesse der hochgeladenen Nutzdaten. */
    statGroesse: null as number | null,
    letzteNutzdatenGroesse: 0,
  }

  class SftpStub {
    private buche(name: string, ...args: unknown[]) {
      z.aufrufe.push({ name, args })
      if (z.fehlerBei[name]) throw new Error(z.fehlerBei[name])
    }
    async connect(opts: unknown) { this.buche('connect', opts) }
    async exists(pfad: string) { this.buche('exists', pfad); return true }
    async mkdir(pfad: string, rekursiv: boolean) { this.buche('mkdir', pfad, rekursiv) }
    async put(daten: Buffer, pfad: string) {
      this.buche('put', pfad, daten.length)
      if (pfad.endsWith('.AUF')) return
      z.letzteNutzdatenGroesse = daten.length
    }
    async stat(pfad: string) {
      this.buche('stat', pfad)
      return { size: z.statGroesse ?? z.letzteNutzdatenGroesse }
    }
    async list(pfad: string) { this.buche('list', pfad); return [] }
    async get(pfad: string) { this.buche('get', pfad); return Buffer.from('') }
    async cwd() { this.buche('cwd'); return '/home/test' }
    async end() { z.aufrufe.push({ name: 'end', args: [] }) }
  }

  return { z, SftpStub }
})

const SftpStub = H.SftpStub

vi.mock('ssh2-sftp-client', () => ({ default: H.SftpStub }))

import { sendePerSFTP, testeVerbindung, sendePerKIM } from '@/lib/abrechnung/transport'
import { RETRY_SICHERE_PHASEN } from '@/lib/abrechnung/retry'
import type { TransportConfig, DakotaFreigabe } from '@/lib/abrechnung/transport'

const ORG = '00000000-0000-4000-8000-00000000c001'

const CONFIG: TransportConfig = {
  datenannahmestelle: 'TESTSTELLE',
  sftp_host: 'sftp.example.invalid',
  sftp_port: 22,
  sftp_user: 'testnutzer',
  sftp_key: Buffer.from('-----BEGIN TEST KEY-----'),
  sftp_verzeichnis: '/upload',
}

const FREI: DakotaFreigabe = {
  organization_id: ORG,
  bundesland: 'hessen',
  dakota_export_enabled: true,
}

const NUTZDATEN = Buffer.from('EDIFACT-VERSCHLUESSELT-TESTINHALT')
const AUFTRAG = Buffer.from('AUFTRAGSDATEI-TEST')

function namen(): string[] {
  return H.z.aufrufe.map(a => a.name)
}

beforeEach(() => {
  H.z.aufrufe = []
  H.z.fehlerBei = {}
  H.z.statGroesse = null
  H.z.letzteNutzdatenGroesse = 0
})

// ═══════════════════════════════════════════════════════════════════
describe('Dakota-Freigabe sperrt vor der Verbindung', () => {
  it('bricht ohne Freischaltung ab, ohne eine Verbindung aufzubauen', async () => {
    await expect(
      sendePerSFTP(NUTZDATEN, AUFTRAG, CONFIG, { ...FREI, dakota_export_enabled: false }),
    ).rejects.toThrow(/DAKOTA_NICHT_FREIGESCHALTET/)

    // Entscheidend ist das LEERE Protokoll: waere die Verbindung schon
    // gestanden, muesste man hinterher pruefen, ob doch etwas hochging.
    expect(H.z.aufrufe).toEqual([])
  })

  it('nennt das Bundesland im Abbruch', async () => {
    await expect(
      sendePerSFTP(NUTZDATEN, AUFTRAG, CONFIG, {
        ...FREI, bundesland: 'bayern', dakota_export_enabled: false,
      }),
    ).rejects.toThrow(/bayern/)
  })

  it('sagt ausdruecklich, dass keine Forderung entstanden ist', async () => {
    // Der Satz steht im Fehlertext, weil ihn ein Mensch im Protokoll liest
    // und sonst nicht weiss, ob er die Kasse anrufen muss.
    await expect(
      sendePerSFTP(NUTZDATEN, AUFTRAG, CONFIG, { ...FREI, dakota_export_enabled: false }),
    ).rejects.toThrow(/es entsteht keine Forderung/i)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Reihenfolge und Erfolgsfall', () => {
  it('laedt Nutzdaten VOR der Auftragsdatei hoch', async () => {
    const r = await sendePerSFTP(NUTZDATEN, AUFTRAG, CONFIG, FREI, {
      nutzdaten: 'TSOL0001',
    })

    expect(r.erfolg).toBe(true)
    const puts = H.z.aufrufe.filter(a => a.name === 'put').map(a => String(a.args[0]))
    expect(puts).toEqual(['/upload/TSOL0001', '/upload/TSOL0001.AUF'])
  })

  it('meldet im Erfolgsfall die Phase fertig und keinen Fehler', async () => {
    const r = await sendePerSFTP(NUTZDATEN, AUFTRAG, CONFIG, FREI)
    expect(r.phase).toBe('fertig')
    expect(r.fehler).toBeNull()
  })

  it('baut die Verbindung auch im Erfolgsfall wieder ab', async () => {
    await sendePerSFTP(NUTZDATEN, AUFTRAG, CONFIG, FREI)
    expect(namen().at(-1)).toBe('end')
  })

  it('haengt .AUF an, wenn kein eigener Auftragsname uebergeben wird', async () => {
    await sendePerSFTP(NUTZDATEN, AUFTRAG, CONFIG, FREI, { nutzdaten: 'TSOL0042' })
    const puts = H.z.aufrufe.filter(a => a.name === 'put').map(a => String(a.args[0]))
    expect(puts[1]).toBe('/upload/TSOL0042.AUF')
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Phase als Wiederholungsbremse', () => {
  it('meldet verbindung, wenn schon der Verbindungsaufbau scheitert', async () => {
    H.z.fehlerBei.connect = 'ECONNREFUSED'
    const r = await sendePerSFTP(NUTZDATEN, AUFTRAG, CONFIG, FREI)

    expect(r.erfolg).toBe(false)
    expect(r.phase).toBe('verbindung')
    // Nichts uebertragen ⇒ Wiederholung folgenlos.
    expect(RETRY_SICHERE_PHASEN).toContain(r.phase)
  })

  it('meldet nutzdaten, wenn der erste Upload scheitert', async () => {
    H.z.fehlerBei.put = 'EIO beim Schreiben'
    const r = await sendePerSFTP(NUTZDATEN, AUFTRAG, CONFIG, FREI)

    expect(r.phase).toBe('nutzdaten')
    // Die Auftragsdatei fehlt ⇒ die Annahmestelle hat nicht angefangen.
    expect(RETRY_SICHERE_PHASEN).toContain(r.phase)
  })

  it('meldet auftragsdatei, wenn erst der ZWEITE Upload scheitert', async () => {
    // Der eigentliche Grund fuer diesen Test: ab hier ist eine automatische
    // Wiederholung nicht mehr harmlos. Meldete das Modul hier 'nutzdaten',
    // wiederholte der Aufrufer und erzeugte eine zweite Forderung.
    let putZaehler = 0
    const originalPut = SftpStub.prototype.put
    SftpStub.prototype.put = async function (daten: Buffer, pfad: string) {
      putZaehler++
      if (putZaehler === 2) throw new Error('Verbindung waehrend Auftragsupload verloren')
      return originalPut.call(this, daten, pfad)
    }
    try {
      const r = await sendePerSFTP(NUTZDATEN, AUFTRAG, CONFIG, FREI)
      expect(r.phase).toBe('auftragsdatei')
      expect(RETRY_SICHERE_PHASEN).not.toContain(r.phase)
    } finally {
      SftpStub.prototype.put = originalPut
    }
  })

  it('meldet verifikation, wenn beide Dateien liegen und erst stat scheitert', async () => {
    H.z.fehlerBei.stat = 'Permission denied'
    const r = await sendePerSFTP(NUTZDATEN, AUFTRAG, CONFIG, FREI)

    expect(r.phase).toBe('verifikation')
    // Beide Dateien sind oben — Wiederholung waere eine zweite Forderung.
    expect(RETRY_SICHERE_PHASEN).not.toContain(r.phase)
  })

  it('meldet Misserfolg, wenn die Groesse auf dem Server abweicht', async () => {
    H.z.statGroesse = NUTZDATEN.length - 5
    const r = await sendePerSFTP(NUTZDATEN, AUFTRAG, CONFIG, FREI)

    expect(r.erfolg).toBe(false)
    expect(r.phase).toBe('verifikation')
    expect(r.fehler).toMatch(/Größe auf Server/)
    // Eine abgeschnittene Nutzdatendatei bei liegender Auftragsdatei ist der
    // gefaehrlichste Ausgang ueberhaupt: die Annahmestelle verarbeitet
    // Bruchstuecke. Er darf nie automatisch wiederholt werden.
    expect(RETRY_SICHERE_PHASEN).not.toContain(r.phase)
  })

  it('baut die Verbindung auch nach einem Fehler wieder ab', async () => {
    H.z.fehlerBei.put = 'EIO'
    await sendePerSFTP(NUTZDATEN, AUFTRAG, CONFIG, FREI)
    expect(namen().at(-1)).toBe('end')
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Zugangsdaten', () => {
  it('nimmt den SSH-Key, wenn beides hinterlegt ist', async () => {
    await sendePerSFTP(NUTZDATEN, AUFTRAG, {
      ...CONFIG, sftp_passwort: 'sollteNichtGenommenWerden',
    }, FREI)

    const opts = H.z.aufrufe.find(a => a.name === 'connect')?.args[0] as Record<string, unknown>
    expect(opts.privateKey).toBeDefined()
    expect(opts.password).toBeUndefined()
  })

  it('faellt auf das Passwort zurueck, wenn kein Key hinterlegt ist', async () => {
    await sendePerSFTP(NUTZDATEN, AUFTRAG, {
      ...CONFIG, sftp_key: undefined, sftp_passwort: 'testkennwort',
    }, FREI)

    const opts = H.z.aufrufe.find(a => a.name === 'connect')?.args[0] as Record<string, unknown>
    expect(opts.password).toBe('testkennwort')
  })

  it('behandelt einen LEEREN Key wie keinen Key', async () => {
    // Ein Buffer der Laenge 0 ist wahr im Sinne von JavaScript. Ohne die
    // Laengenpruefung ginge er als privateKey an ssh2 und der Login
    // scheiterte mit einer irrefuehrenden Schluesselmeldung, obwohl ein
    // brauchbares Passwort danebenliegt.
    await sendePerSFTP(NUTZDATEN, AUFTRAG, {
      ...CONFIG, sftp_key: Buffer.alloc(0), sftp_passwort: 'testkennwort',
    }, FREI)

    const opts = H.z.aufrufe.find(a => a.name === 'connect')?.args[0] as Record<string, unknown>
    expect(opts.password).toBe('testkennwort')
    expect(opts.privateKey).toBeUndefined()
  })

  it('wirft, wenn weder Key noch Passwort hinterlegt sind', async () => {
    // Kein stiller Fehlversuch: ohne Zugangsdaten ist die Konfiguration
    // unvollstaendig, nicht die Verbindung schlecht.
    const r = await sendePerSFTP(NUTZDATEN, AUFTRAG, {
      ...CONFIG, sftp_key: undefined, sftp_passwort: undefined,
    }, FREI)

    expect(r.erfolg).toBe(false)
    expect(r.phase).toBe('verbindung')
    expect(r.fehler).toMatch(/weder SSH-Key noch Passwort/)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('testeVerbindung', () => {
  it('uebertraegt nichts', async () => {
    const r = await testeVerbindung(CONFIG)
    expect(r.erfolg).toBe(true)
    expect(namen()).not.toContain('put')
  })

  it('meldet im Fehlerfall immer die Phase verbindung', async () => {
    // Der Test kommt nie ueber den Verbindungsaufbau hinaus — jede andere
    // Phase waere hier eine Falschaussage und wuerde eine harmlose
    // Wiederholung faelschlich sperren.
    H.z.fehlerBei.cwd = 'Timeout'
    const r = await testeVerbindung(CONFIG)
    expect(r.erfolg).toBe(false)
    expect(r.phase).toBe('verbindung')
  })

  it('braucht KEINE Dakota-Freigabe', async () => {
    // Bewusst: der Verbindungstest muss vor der Freischaltung moeglich
    // sein, sonst kann niemand die Zugangsdaten pruefen.
    expect((await testeVerbindung(CONFIG)).erfolg).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('sendePerKIM', () => {
  it('wirft, statt einen Versand vorzutaeuschen', async () => {
    // Fail-closed: das Modul ist nicht gebaut. Ein stilles { erfolg: true }
    // waere eine behauptete Uebermittlung, die nie stattgefunden hat.
    await expect(sendePerKIM(NUTZDATEN, 'kasse@kim.example')).rejects.toThrow(
      /noch nicht implementiert/,
    )
  })
})
