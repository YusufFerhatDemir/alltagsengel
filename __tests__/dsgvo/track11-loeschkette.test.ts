// ═══════════════════════════════════════════════════════════════════════
// Track 11 — Löschkette (Art. 17 DSGVO)
// ═══════════════════════════════════════════════════════════════════════
//
// Geprüft wird der Ablauf, der die Edge Function `account-hard-delete`
// ablöst: lib/dsgvo/loeschkatalog.ts (die Entscheidung) und
// lib/dsgvo/loeschung.ts (die Ausführung).
//
// Warum der filterprotokollierende Doppelgänger und nicht ein einfacher
// Stub: die interessanten Fehler dieses Ablaufs sind Fehler in den
// FILTERN und in der REIHENFOLGE — „aus welcher Tabelle wurde mit welcher
// Spalte gelöscht", „wurde vor dem ersten Delete geprüft", „wurde
// `bookings` angefasst". Ein Stub, der Filter verschluckt, kann davon
// nichts sehen.
//
// Drei der Fälle sind GEGENPROBEN: sie stellen das Verhalten der alten
// Edge Function nach und verlangen, dass der neue Ablauf es NICHT zeigt.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  LOESCHKATALOG,
  blockierendeEintraege,
  verbleibendeBereiche,
  zuBehalten,
  zuLoeschen,
} from '@/lib/dsgvo/loeschkatalog'
import {
  FRIST_TAGE,
  fuehreKontoLoeschungAus,
  loescheKonto,
  loeschStichtag,
  type LoeschClient,
  type LoeschKandidat,
  type LoeschUmgebung,
} from '@/lib/dsgvo/loeschung'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'

const USER = 'aaaaaaaa-0000-4000-8000-000000000001'

const KANDIDAT: LoeschKandidat = {
  id: USER,
  first_name: 'Maria',
  last_name: 'Beispiel',
  deleted_at: '2026-05-01T00:00:00.000Z',
}

interface Aufzeichnung {
  fake: ReturnType<typeof erstelleFakeSupabase>
  umgebung: LoeschUmgebung
  mails: Array<{ email: string; vorname: string; verbleibt: string[] }>
  protokoll: Array<{ status: string; userId: string }>
  authGeloescht: string[]
}

/**
 * Baut eine Umgebung, in der per Default alles gelingt. `antwort` darf
 * einzelne Aufrufe abweichend beantworten.
 */
function baueUmgebung(
  antwort: (aufruf: FakeAufruf) => ReturnType<Parameters<typeof erstelleFakeSupabase>[0]> = () => undefined,
  authFehler: { message: string; code?: string } | null = null,
): Aufzeichnung {
  const mails: Aufzeichnung['mails'] = []
  const protokoll: Aufzeichnung['protokoll'] = []
  const authGeloescht: string[] = []

  const fake = erstelleFakeSupabase(aufruf => {
    const eigene = antwort(aufruf)
    if (eigene) return eigene
    // Vorprüfungen sind Zählabfragen: kein Treffer.
    if (aufruf.operation === 'select' && aufruf.head) return { count: 0, error: null }
    return { data: [], error: null }
  })

  const umgebung: LoeschUmgebung = {
    client: fake.client as unknown as LoeschClient,
    async loescheAuthKonto(userId) {
      if (authFehler) return { error: authFehler }
      authGeloescht.push(userId)
      return { error: null }
    },
    async holeEmail() {
      return 'maria@example.test'
    },
    async sendeBestaetigung(email, vorname, verbleibt) {
      mails.push({ email, vorname, verbleibt })
    },
    async protokolliere(ergebnis) {
      protokoll.push({ status: ergebnis.status, userId: ergebnis.userId })
    },
  }

  return { fake, umgebung, mails, protokoll, authGeloescht }
}

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — Löschkatalog: die Entscheidung steht im Code', () => {
  it('jeder Eintrag trägt Tabelle, Spalte und eine Begründung', () => {
    for (const eintrag of LOESCHKATALOG) {
      expect(eintrag.tabelle.length, JSON.stringify(eintrag)).toBeGreaterThan(0)
      expect(eintrag.spalte.length, JSON.stringify(eintrag)).toBeGreaterThan(0)
      expect(eintrag.begruendung.length, `${eintrag.tabelle}.${eintrag.spalte} ohne Begründung`)
        .toBeGreaterThan(20)
    }
  })

  it('jede aufbewahrte Spalte nennt eine Rechtsgrundlage', () => {
    // Aufbewahren ist die Ausnahme nach Art. 17 Abs. 3 DSGVO — ohne
    // benannte Grundlage ist es schlicht Nichtlöschung.
    for (const eintrag of zuBehalten()) {
      expect(
        /§|Art\.|DSGVO|AO|HGB|BGB/.test(eintrag.begruendung),
        `${eintrag.tabelle}.${eintrag.spalte} nennt keine Rechtsgrundlage`,
      ).toBe(true)
    }
  })

  it('keine Spalte steht doppelt im Katalog', () => {
    const schluessel = LOESCHKATALOG.map(e => `${e.tabelle}.${e.spalte}`)
    expect(new Set(schluessel).size).toBe(schluessel.length)
  })

  it('profiles und auth.users stehen NICHT im Katalog — sie sind der Abschluss', () => {
    expect(LOESCHKATALOG.some(e => e.tabelle === 'profiles')).toBe(false)
    expect(LOESCHKATALOG.some(e => e.tabelle === 'auth.users')).toBe(false)
  })

  it('die eingecheckte Spaltenliste deckt sich mit dem Katalog (beide Richtungen)', () => {
    // scripts/loeschkatalog-spalten.json ist die Tatsachengrundlage für
    // die Live-Prüfung; driftet sie ab, prüft das Skript etwas anderes,
    // als der Lauf tut.
    const json = JSON.parse(
      readFileSync(path.join(__dirname, '..', '..', 'scripts', 'loeschkatalog-spalten.json'), 'utf-8'),
    ) as Array<{ tabelle: string; spalte: string; entscheidung: string; blockiert?: boolean }>

    const ausTs = LOESCHKATALOG.map(e =>
      `${e.tabelle}.${e.spalte}:${e.entscheidung}:${e.blockiert ? 'blockiert' : '-'}`).sort()
    const ausJson = json.map(e =>
      `${e.tabelle}.${e.spalte}:${e.entscheidung}:${e.blockiert ? 'blockiert' : '-'}`).sort()

    expect(ausJson).toEqual(ausTs)
  })

  it('die drei live blockierenden Spalten sind als solche markiert', () => {
    // Live gelesen mit `npm run verify:loeschkette` (Prüfung F).
    expect(blockierendeEintraege().map(e => `${e.tabelle}.${e.spalte}`).sort()).toEqual([
      'angehoerigen_audit_log.user_id',
      'bookings.angel_id',
      'signaturen.signatar_id',
    ])
  })

  it('verbleibendeBereiche() nennt jede aufbewahrte Tabelle genau einmal', () => {
    const zeilen = verbleibendeBereiche()
    const tabellen = zeilen.map(z => z.split(':')[0])
    expect(new Set(tabellen).size).toBe(tabellen.length)
    expect(tabellen).toContain('clients')
    expect(tabellen).toContain('bookings')
  })

  it('GEGENPROBE: bookings, clients und caregivers stehen auf "aufbewahren"', () => {
    // Die alte Edge Function löschte bookings — entgegen der
    // ausdrücklichen Entscheidung der Migration 20260804400000.
    const zuLoeschende = new Set(zuLoeschen().map(e => e.tabelle))
    expect(zuLoeschende.has('bookings')).toBe(false)
    expect(zuLoeschende.has('clients')).toBe(false)
    expect(zuLoeschende.has('caregivers')).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — Frist', () => {
  it('die Frist beträgt 60 Tage', () => {
    expect(FRIST_TAGE).toBe(60)
  })

  it('der Stichtag liegt exakt 60 Tage vor dem übergebenen Zeitpunkt', () => {
    const jetzt = new Date('2026-08-28T12:00:00.000Z')
    expect(loeschStichtag(jetzt).toISOString()).toBe('2026-06-29T12:00:00.000Z')
  })
})

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — Ausführung: was tatsächlich gelöscht wird', () => {
  it('löscht jede Katalogtabelle mit der im Katalog genannten Spalte', async () => {
    const { fake, umgebung } = baueUmgebung()
    const ergebnis = await loescheKonto(umgebung, KANDIDAT)

    expect(ergebnis.status).toBe('geloescht')
    for (const eintrag of zuLoeschen()) {
      // `messages` steht zweimal im Katalog (sender_id und receiver_id) —
      // gesucht ist der Aufruf mit GENAU diesem Filter, nicht der erste.
      const deletes = fake.auf(eintrag.tabelle).filter(a => a.operation === 'delete')
      expect(
        deletes.some(a => hatFilter(a, 'eq', eintrag.spalte, USER)),
        `kein Delete auf ${eintrag.tabelle} mit eq(${eintrag.spalte}, userId)`,
      ).toBe(true)
    }
  })

  it('GEGENPROBE: rührt bookings, clients und caregivers nicht an', async () => {
    // Genau das tat die Vorgängerin mit bookings — und zerstörte damit
    // abrechnungsrelevante Belege (§ 147 AO).
    const { fake, umgebung } = baueUmgebung()
    await loescheKonto(umgebung, KANDIDAT)

    for (const tabelle of ['bookings', 'clients', 'caregivers']) {
      expect(
        fake.auf(tabelle).some(a => a.operation === 'delete'),
        `${tabelle} wurde gelöscht, obwohl sie aufbewahrt werden muss`,
      ).toBe(false)
    }
  })

  it('löscht profiles erst nach dem Katalog und auth.users zuletzt', async () => {
    const { fake, umgebung, authGeloescht } = baueUmgebung()
    const ergebnis = await loescheKonto(umgebung, KANDIDAT)

    const deletes = fake.aufrufe.filter(a => a.operation === 'delete')
    expect(deletes[deletes.length - 1].tabelle).toBe('profiles')
    expect(authGeloescht).toEqual([USER])
    expect(ergebnis.geloescht[ergebnis.geloescht.length - 1]).toBe('auth.users')
  })
})

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — Vorprüfung: kein halb gelöschtes Konto', () => {
  it('bricht ab, BEVOR etwas gelöscht ist, wenn eine blockierende Zeile existiert', async () => {
    const { fake, umgebung, authGeloescht } = baueUmgebung(aufruf => {
      if (aufruf.tabelle === 'signaturen' && aufruf.head) return { count: 1, error: null }
      return undefined
    })

    const ergebnis = await loescheKonto(umgebung, KANDIDAT)

    expect(ergebnis.status).toBe('blockiert')
    expect(ergebnis.blockiertDurch).toContain('signaturen.signatar_id')
    // Der eigentliche Beweis: NICHTS wurde angefasst.
    expect(fake.aufrufe.some(a => a.operation === 'delete')).toBe(false)
    expect(authGeloescht).toEqual([])
    expect(ergebnis.geloescht).toEqual([])
  })

  it('prüft alle drei blockierenden Spalten mit dem richtigen Filter', async () => {
    const { fake, umgebung } = baueUmgebung()
    await loescheKonto(umgebung, KANDIDAT)

    for (const eintrag of blockierendeEintraege()) {
      const zaehlung = fake.auf(eintrag.tabelle).find(a => a.head)
      expect(zaehlung, `keine Zählabfrage auf ${eintrag.tabelle}`).toBeTruthy()
      expect(hatFilter(zaehlung, 'eq', eintrag.spalte, USER)).toBe(true)
    }
  })

  it('FAIL-CLOSED: ein Fehler beim Zählen gilt als blockiert, nicht als frei', async () => {
    const { fake, umgebung } = baueUmgebung(aufruf => {
      if (aufruf.tabelle === 'bookings' && aufruf.head) {
        return { count: null, error: { message: 'timeout', code: '57014' } }
      }
      return undefined
    })

    const ergebnis = await loescheKonto(umgebung, KANDIDAT)

    expect(ergebnis.status).toBe('blockiert')
    expect(ergebnis.blockiertDurch?.join(' ')).toContain('bookings.angel_id')
    expect(fake.aufrufe.some(a => a.operation === 'delete')).toBe(false)
  })

  it('eine unbekannte Tabelle in der Vorprüfung blockiert NICHT', async () => {
    // Auf einer Shadow-DB fehlen einzelne Tabellen; das ist kein Grund,
    // die Löschung zu verweigern.
    const { umgebung } = baueUmgebung(aufruf => {
      if (aufruf.tabelle === 'signaturen' && aufruf.head) {
        return { count: null, error: { message: 'relation does not exist', code: '42P01' } }
      }
      return undefined
    })

    const ergebnis = await loescheKonto(umgebung, KANDIDAT)
    expect(ergebnis.status).toBe('geloescht')
  })
})

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — Fehler werden nicht mehr verschluckt', () => {
  it('GEGENPROBE: ein fehlgeschlagenes Delete bricht den Lauf ab', async () => {
    // Die Vorgängerin prüfte nur zwei von zehn Schritten; alle übrigen
    // Fehler fielen unter den Tisch, die Bestätigungsmail ging trotzdem.
    const { fake, umgebung, mails, authGeloescht } = baueUmgebung(aufruf => {
      if (aufruf.tabelle === 'documents' && aufruf.operation === 'delete') {
        return { data: null, error: { message: 'permission denied', code: '42501' } }
      }
      return undefined
    })

    const ergebnis = await loescheKonto(umgebung, KANDIDAT)

    expect(ergebnis.status).toBe('fehler')
    expect(ergebnis.fehler).toContain('documents.user_id')
    expect(fake.auf('profiles').some(a => a.operation === 'delete')).toBe(false)
    expect(authGeloescht).toEqual([])
    expect(mails).toEqual([])
  })

  it('ein Fremdschlüsselfehler beim Löschen heißt "blockiert", nicht "fehler"', async () => {
    const { umgebung } = baueUmgebung(aufruf => {
      if (aufruf.tabelle === 'angels' && aufruf.operation === 'delete') {
        return { data: null, error: { message: 'violates foreign key constraint', code: '23503' } }
      }
      return undefined
    })

    const ergebnis = await loescheKonto(umgebung, KANDIDAT)
    expect(ergebnis.status).toBe('blockiert')
    expect(ergebnis.blockiertDurch).toEqual(['angels'])
  })

  it('eine fehlende Tabelle wird übersprungen und protokolliert, nicht verschwiegen', async () => {
    const { umgebung } = baueUmgebung(aufruf => {
      if (aufruf.tabelle === 'fcm_tokens' && aufruf.operation === 'delete') {
        return { data: null, error: { message: 'relation "fcm_tokens" does not exist', code: '42P01' } }
      }
      return undefined
    })

    const ergebnis = await loescheKonto(umgebung, KANDIDAT)

    expect(ergebnis.status).toBe('geloescht')
    expect(ergebnis.uebersprungen.map(u => u.tabelle)).toContain('fcm_tokens')
    expect(ergebnis.geloescht).not.toContain('fcm_tokens')
  })

  it('ein fehlgeschlagenes profiles-Delete löscht das Anmeldekonto NICHT', async () => {
    const { umgebung, authGeloescht, mails } = baueUmgebung(aufruf => {
      if (aufruf.tabelle === 'profiles' && aufruf.operation === 'delete') {
        return { data: null, error: { message: 'violates foreign key constraint', code: '23503' } }
      }
      return undefined
    })

    const ergebnis = await loescheKonto(umgebung, KANDIDAT)

    expect(ergebnis.status).toBe('blockiert')
    expect(authGeloescht).toEqual([])
    expect(mails).toEqual([])
  })

  it('ein Fehler beim Löschen des Anmeldekontos meldet Fehler statt Erfolg', async () => {
    const { umgebung, mails } = baueUmgebung(() => undefined, { message: 'user not found' })

    const ergebnis = await loescheKonto(umgebung, KANDIDAT)

    expect(ergebnis.status).toBe('fehler')
    expect(ergebnis.fehler).toContain('auth.users')
    expect(mails).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — Bestätigung und Protokoll', () => {
  it('die Bestätigungsmail geht nur bei vollständigem Erfolg — und nennt, was bleibt', async () => {
    const { umgebung, mails } = baueUmgebung()
    await loescheKonto(umgebung, KANDIDAT)

    expect(mails).toHaveLength(1)
    expect(mails[0].email).toBe('maria@example.test')
    expect(mails[0].vorname).toBe('Maria')
    // Die alte Mail behauptete, es sei alles gelöscht.
    expect(mails[0].verbleibt.length).toBe(zuBehalten().length)
    expect(mails[0].verbleibt.join(' ')).toContain('630f')
  })

  it('ein Fehler beim Mailversand kippt das Ergebnis nicht', async () => {
    // Sonst käme dasselbe Konto beim nächsten Lauf erneut dran und der
    // Fehlschlag wiederholte sich ewig — obwohl gelöscht ist gelöscht.
    const { umgebung } = baueUmgebung()
    umgebung.sendeBestaetigung = async () => { throw new Error('Resend down') }

    const ergebnis = await loescheKonto(umgebung, KANDIDAT)
    expect(ergebnis.status).toBe('geloescht')
  })

  it('auch ein blockiertes Konto wird protokolliert', async () => {
    const { umgebung, protokoll } = baueUmgebung(aufruf => {
      if (aufruf.tabelle === 'angehoerigen_audit_log' && aufruf.head) return { count: 3, error: null }
      return undefined
    })

    await loescheKonto(umgebung, KANDIDAT)
    expect(protokoll).toEqual([{ status: 'blockiert', userId: USER }])
  })

  it('ein Fehler beim Protokollieren kippt eine vollzogene Löschung nicht', async () => {
    const { umgebung } = baueUmgebung()
    umgebung.protokolliere = async () => { throw new Error('audit down') }

    const ergebnis = await loescheKonto(umgebung, KANDIDAT)
    expect(ergebnis.status).toBe('geloescht')
  })
})

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — Der Lauf', () => {
  it('zählt gelöschte, blockierte und fehlerhafte Konten getrennt', async () => {
    const blockiert = 'bbbbbbbb-0000-4000-8000-000000000002'
    const fehlerhaft = 'cccccccc-0000-4000-8000-000000000003'

    const { umgebung } = baueUmgebung(aufruf => {
      const gefiltert = aufruf.filter.find(f => f.methode === 'eq')?.wert
      if (gefiltert === blockiert && aufruf.head) return { count: 1, error: null }
      if (gefiltert === fehlerhaft && aufruf.operation === 'delete') {
        return { data: null, error: { message: 'boom', code: '42501' } }
      }
      return undefined
    })

    const ergebnis = await fuehreKontoLoeschungAus(umgebung, [
      KANDIDAT,
      { ...KANDIDAT, id: blockiert },
      { ...KANDIDAT, id: fehlerhaft },
    ])

    expect(ergebnis.gepruefte).toBe(3)
    expect(ergebnis.geloescht).toBe(1)
    expect(ergebnis.blockiert).toBe(1)
    expect(ergebnis.fehler).toBe(1)
  })

  it('ein blockiertes Konto hält die anderen nicht auf', async () => {
    const zweiter = 'dddddddd-0000-4000-8000-000000000004'
    const { umgebung } = baueUmgebung(aufruf => {
      const gefiltert = aufruf.filter.find(f => f.methode === 'eq')?.wert
      if (gefiltert === USER && aufruf.head) return { count: 1, error: null }
      return undefined
    })

    const ergebnis = await fuehreKontoLoeschungAus(umgebung, [KANDIDAT, { ...KANDIDAT, id: zweiter }])

    expect(ergebnis.konten[0].status).toBe('blockiert')
    expect(ergebnis.konten[1].status).toBe('geloescht')
  })

  it('ein leerer Lauf ist kein Fehler', async () => {
    const { umgebung } = baueUmgebung()
    const ergebnis = await fuehreKontoLoeschungAus(umgebung, [])
    expect(ergebnis).toMatchObject({ gepruefte: 0, geloescht: 0, blockiert: 0, fehler: 0 })
  })
})
