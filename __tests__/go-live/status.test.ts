/**
 * Go-Live-Status (lib/go-live/status.ts)
 *
 * Dieses Modul beantwortet eine einzige Frage — „darf das in den
 * Echtbetrieb?" — und ist damit die Stelle, an der ein zu freundlicher
 * Default am teuersten ist. Ein Bereich, der faelschlich `ready` meldet,
 * ist eine Freigabe, die niemand erteilt hat.
 *
 * Geprueft wird deshalb vor allem die Fail-closed-Eigenschaft: was
 * passiert, wenn ein Messwert NICHT erhoben werden konnte. `null` muss wie
 * „nicht erfuellt" zaehlen, nie wie „in Ordnung". Genau dieser Fehler war
 * schon einmal live — ein nicht ausfuehrbarer Testmandanten-Zaehler wurde
 * zu 0 gerechnet und gab den Bereich frei.
 *
 * `baueBereiche` ist bewusst von der Datenerhebung getrennt und nimmt
 * fertige Messwerte entgegen; diese Suite nutzt genau diese Trennung.
 */
import { describe, test, expect, afterEach, vi } from 'vitest'
import {
  baueBereiche,
  istSeedUuid,
  SEPA_PLATZHALTER_ID,
  type GoLiveMesswerte,
  type GoLiveBereich,
} from '@/lib/go-live/status'

/**
 * Fail-closed-Ausgangslage: nichts erhoben, nichts belegt.
 * Jeder Test setzt nur das, worum es ihm geht.
 */
function messwerte(teil: Partial<GoLiveMesswerte> = {}): GoLiveMesswerte {
  return {
    organisation: null,
    tarife: [],
    leistungspreise: [],
    kunden: null,
    einsaetze: null,
    rechnungen: null,
    rechnungenOhneFaelligkeit: null,
    zertifikate: [],
    bundeslaender: [],
    annahmestellen: [],
    kostentraeger: null,
    sgbVVersionen: [],
    sgbVRouting: null,
    kimKonfig: [],
    kimKarten: [],
    kimVersionen: [],
    bewertungen: [],
    testMandanten: null,
    anonBewertungen: { lesbar: null, quelle: 'nicht geprueft' },
    fehler: [],
    ...teil,
  }
}

/**
 * Der Security-Bereich prueft zusaetzlich eine Umgebungsvariable. Im
 * Testlauf ist sie nicht gesetzt — ohne diesen Helfer waere jeder
 * „ready"-Fall dort unerreichbar und die Tests wuerden am falschen Grund
 * scheitern.
 */
function mitServerKey() {
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_testlauf')
}
afterEach(() => { vi.unstubAllEnvs() })

function bereich(m: GoLiveMesswerte, id: string): GoLiveBereich {
  const treffer = baueBereiche(m).find(b => b.id === id)
  if (!treffer) throw new Error(`Bereich "${id}" existiert nicht — Test veraltet?`)
  return treffer
}

function pruefungsWert(b: GoLiveBereich, label: string) {
  return b.pruefungen.find(p => p.label.includes(label))
}

// ═══════════════════════════════════════════════════════════════
// Aufbau der Bereichsliste
// ═══════════════════════════════════════════════════════════════

describe('Bereichsliste', () => {
  test('alle elf Bereiche werden gebaut und haben eindeutige Kennungen', () => {
    const bereiche = baueBereiche(messwerte())
    expect(bereiche).toHaveLength(11)
    expect(new Set(bereiche.map(b => b.id)).size).toBe(11)
  })

  test('jeder Bereich ist vollstaendig ausgefuellt', () => {
    for (const b of baueBereiche(messwerte())) {
      expect(b.titel.length, `${b.id}: kein Titel`).toBeGreaterThan(0)
      expect(b.begruendung.length, `${b.id}: keine Begruendung`).toBeGreaterThan(0)
      expect(
        b.naechsterSchritt.length,
        `${b.id}: kein naechster Schritt. Ein blockierter Bereich ohne Handlungsanweisung `
        + 'ist fuer den Leser wertlos.',
      ).toBeGreaterThan(0)
      expect(b.pruefungen.length, `${b.id}: keine Pruefungen`).toBeGreaterThan(0)
      expect(['ready', 'blocked', 'external']).toContain(b.status)
      expect(['intern', 'extern']).toContain(b.zustaendig)
    }
  })

  test('die Statuszaehlung geht immer auf', () => {
    const bereiche = baueBereiche(messwerte())
    const summe = ['ready', 'blocked', 'external']
      .reduce((n, s) => n + bereiche.filter(b => b.status === s).length, 0)
    expect(summe).toBe(bereiche.length)
  })
})

// ═══════════════════════════════════════════════════════════════
// Fail-closed
// ═══════════════════════════════════════════════════════════════

describe('Fail-closed', () => {
  test('ohne einen einzigen erhobenen Messwert ist nur der bewusst umgekehrte Bereich ready', () => {
    const bereiche = baueBereiche(messwerte())
    const ready = bereiche.filter(b => b.status === 'ready').map(b => b.id)

    // `dipa_service` ist absichtlich invertiert: READY heisst dort, dass der
    // DiPA-Modus AUS ist — also keine unzulaessige Erstattungsaussage.
    expect(
      ready, 'Ohne Daten darf kein datengetriebener Bereich freigegeben sein.',
    ).toEqual(['dipa_service'])
  })

  test('ein nicht erhebbarer Zaehler zaehlt wie „nicht erfuellt", nicht wie 0', () => {
    const b = bereich(messwerte({ kunden: null }), 'pflege_software')
    const p = pruefungsWert(b, 'Klienten angelegt')

    expect(p?.erfuellt).not.toBe(true)
    expect(
      p?.wert, 'Der Unterschied zwischen „0 Klienten" und „nicht pruefbar" muss sichtbar bleiben.',
    ).toBe('nicht prüfbar')
    expect(b.status).not.toBe('ready')
  })

  test('ein nicht pruefbarer Testmandanten-Zaehler blockiert den Produktionsbereich', () => {
    // Das war live falsch: `null` wurde zu 0 gerechnet und die Pruefung damit
    // gruen — ein kaputter Zaehler haette den Bereich freigegeben.
    const p = pruefungsWert(bereich(messwerte({ testMandanten: null }), 'production'), 'Testmandanten')
    expect(p?.erfuellt).toBe(false)
    expect(p?.wert).toBe('nicht prüfbar')
  })

  test('erst eine leere, erfolgreich gelesene Liste erfuellt die Testmandanten-Pruefung', () => {
    const p = pruefungsWert(bereich(messwerte({ testMandanten: [] }), 'production'), 'Testmandanten')
    expect(p?.erfuellt).toBe(true)
    expect(p?.wert).toBe('0')
  })

  test('ein nicht pruefbarer Anon-Zugriff gilt nicht als „kein Leck"', () => {
    const b = bereich(messwerte({ anonBewertungen: { lesbar: null, quelle: 'Netzwerkfehler' } }), 'security')
    const p = pruefungsWert(b, 'Bewertungen nicht anonym lesbar')

    expect(p?.erfuellt).toBe(false)
    expect(p?.wert).toContain('nicht prüfbar')
    expect(p?.wert).toContain('Netzwerkfehler')
    expect(b.status).not.toBe('ready')
  })
})

// ═══════════════════════════════════════════════════════════════
// Zustaendigkeit
// ═══════════════════════════════════════════════════════════════

describe('Zustaendigkeit', () => {
  test('extern schlaegt intern: ein Bereich mit externem Blocker heisst „external"', () => {
    // § 105 haengt an ITSG-Zertifikat und SFTP-Zugang — beides extern.
    const b = bereich(messwerte(), 'dta_105')
    expect(b.status).toBe('external')
    expect(b.zustaendig).toBe('extern')
    expect(
      b.pruefungen.some(p => p.zustaendig === 'extern' && p.erfuellt !== true),
      'Der Status "external" muss durch mindestens eine offene externe Pflichtpruefung gedeckt sein.',
    ).toBe(true)
  })

  test('ein Bereich mit ausschliesslich internen Blockern heisst „blocked"', () => {
    const b = bereich(messwerte(), 'pflege_software')
    expect(b.status).toBe('blocked')
    expect(b.zustaendig).toBe('intern')
  })

  test('die DiPA-Erstattung ist dauerhaft extern und nie ready', () => {
    // Es gibt keine Datenquelle, die eine BfArM-Listung belegen koennte.
    // Ein Listing behauptet man nicht, man weist es nach.
    const b = bereich(messwerte(), 'dipa_erstattung')
    expect(b.status).not.toBe('ready')
    expect(b.zustaendig).toBe('extern')
  })

  test('Hinweis-Pruefungen blockieren einen Bereich nicht', () => {
    // MFA und Penetrationstest stehen als `relevanz: 'hinweis'` im
    // Security-Bereich — sie sind fuer den Pflegebetrieb nicht zwingend.
    mitServerKey()
    const b = bereich(messwerte({
      anonBewertungen: { lesbar: false, quelle: 'anon-Abfrage' },
      bewertungen: [],
    }), 'security')

    const hinweise = b.pruefungen.filter(p => p.relevanz === 'hinweis')
    expect(hinweise.length).toBeGreaterThan(0)
    expect(hinweise.every(p => p.erfuellt !== true)).toBe(true)
    expect(
      b.status,
      'Offene Hinweise duerfen den Bereich nicht blockieren — sonst waere die '
      + 'Unterscheidung zwischen Pflicht und Hinweis wirkungslos.',
    ).toBe('ready')
  })
})

// ═══════════════════════════════════════════════════════════════
// Tarifzaehlung
// ═══════════════════════════════════════════════════════════════

describe('Tarifzaehlung', () => {
  test('nur verifizierte Tarife zaehlen als Beleg', () => {
    const b = bereich(messwerte({
      tarife: [
        { rechtsgrundlage: 'privat', tarif_status: 'unverified', ist_aktiv: true },
        { rechtsgrundlage: 'privat', tarif_status: 'blocked', ist_aktiv: true },
      ],
    }), 'privatabrechnung')

    const p = pruefungsWert(b, 'Verifizierte Privattarife')
    expect(p?.erfuellt).toBe(false)
    expect(p?.wert).toBe('0 verifiziert')
  })

  test('ein deaktivierter Tarif zaehlt nirgends mit', () => {
    const p = pruefungsWert(bereich(messwerte({
      tarife: [{ rechtsgrundlage: 'privat', tarif_status: 'verified', ist_aktiv: false }],
    }), 'privatabrechnung'), 'Verifizierte Privattarife')

    expect(p?.erfuellt).toBe(false)
  })

  test('ist_aktiv = null gilt als aktiv', () => {
    // Die Spalte ist nullable; ein fehlender Wert darf einen echten Tarif
    // nicht unsichtbar machen.
    const p = pruefungsWert(bereich(messwerte({
      tarife: [{ rechtsgrundlage: 'privat', tarif_status: 'verified', ist_aktiv: null }],
    }), 'privatabrechnung'), 'Verifizierte Privattarife')

    expect(p?.erfuellt).toBe(true)
  })

  test('ein einzelner blockierter § 45b-Tarif verhindert die Freigabe trotz verifizierter Tarife', () => {
    const b = bereich(messwerte({
      tarife: [
        { rechtsgrundlage: '§45b', tarif_status: 'verified', ist_aktiv: true },
        { rechtsgrundlage: '§45b', tarif_status: 'blocked', ist_aktiv: true },
      ],
    }), 'entlastungsbetrag_45b')

    expect(pruefungsWert(b, 'Verifizierte § 45b-Tarife')?.erfuellt).toBe(true)
    expect(pruefungsWert(b, 'Keine blockierten')?.erfuellt).toBe(false)
    expect(b.status).toBe('blocked')
  })

  test('§ 45b und VP/KZP zaehlen nicht dieselben Tarife', () => {
    const m = messwerte({
      tarife: [
        { rechtsgrundlage: '§45b', tarif_status: 'verified', ist_aktiv: true },
        { rechtsgrundlage: '§ 39 SGB XI', tarif_status: 'verified', ist_aktiv: true },
      ],
    })

    expect(pruefungsWert(bereich(m, 'entlastungsbetrag_45b'), 'Verifizierte § 45b-Tarife')?.wert).toBe('1 von 1')
    expect(pruefungsWert(bereich(m, 'vp_kzp'), 'Verifizierte VP/KZP-Tarife')?.wert).toBe('1 von 1')
  })

  test('ein Privattarif zaehlt weder bei § 45b noch bei VP/KZP mit', () => {
    const m = messwerte({
      tarife: [{ rechtsgrundlage: 'privat', tarif_status: 'verified', ist_aktiv: true }],
    })
    expect(pruefungsWert(bereich(m, 'entlastungsbetrag_45b'), 'Verifizierte § 45b-Tarife')?.wert).toBe('0 von 0')
    expect(pruefungsWert(bereich(m, 'vp_kzp'), 'Verifizierte VP/KZP-Tarife')?.wert).toBe('0 von 0')
  })
})

// ═══════════════════════════════════════════════════════════════
// Produktionsbereich
// ═══════════════════════════════════════════════════════════════

describe('Produktionsbereich', () => {
  const org = {
    name: 'Alltagsengel UG',
    ik_nummer: '460629986',
    sepa_creditor_id: 'DE98ZZZ09999999999',
    iban: 'DE02120300000000202051',
  }

  test('die Platzhalter-Glaeubiger-ID gilt nicht als echte ID', () => {
    const b = bereich(messwerte({ organisation: { ...org, sepa_creditor_id: SEPA_PLATZHALTER_ID } }), 'production')
    const p = pruefungsWert(b, 'SEPA-Gläubiger-ID')

    expect(p?.erfuellt).toBe(false)
    expect(p?.wert).toContain('PLATZHALTER')
    expect(b.status).toBe('blocked')
    expect(
      b.begruendung,
      'Die Begruendung muss die Folge benennen, nicht nur den Zustand.',
    ).toContain('abgelehnt')
    expect(b.naechsterSchritt).toContain('Bundesbank')
  })

  test('eine echte Glaeubiger-ID erfuellt die Pruefung', () => {
    const p = pruefungsWert(bereich(messwerte({
      organisation: { ...org, sepa_creditor_id: 'DE31ZZZ00000123456' },
    }), 'production'), 'SEPA-Gläubiger-ID')

    expect(p?.erfuellt).toBe(true)
    expect(p?.wert).toBe('gesetzt')
  })

  test('eine fehlende Glaeubiger-ID wird von einem Platzhalter unterschieden', () => {
    const p = pruefungsWert(bereich(messwerte({
      organisation: { ...org, sepa_creditor_id: null },
    }), 'production'), 'SEPA-Gläubiger-ID')

    expect(p?.wert).toBe('keine hinterlegt')
  })

  test('Testmandanten werden namentlich genannt, nicht nur gezaehlt', () => {
    // „2" ist keine Handlungsanweisung. Wer aufraeumen soll, muss wissen,
    // welcher Mandant uebrig ist — zumal nicht jeder loeschbar ist.
    const b = bereich(messwerte({
      organisation: org,
      testMandanten: [
        { id: 'a', name: 'TEST Pflegedienst Nord' },
        { id: 'b', name: 'TESTMANDANT 2' },
      ],
    }), 'production')

    const p = pruefungsWert(b, 'Testmandanten')
    expect(p?.wert).toContain('TEST Pflegedienst Nord')
    expect(p?.wert).toContain('TESTMANDANT 2')
    expect(p?.wert?.startsWith('2:')).toBe(true)
  })

  test('ein namenloser Testmandant wird ueber seine Kennung benannt', () => {
    const p = pruefungsWert(bereich(messwerte({
      organisation: org,
      testMandanten: [{ id: '33333333-3333-4333-8333-333333333333', name: null }],
    }), 'production'), 'Testmandanten')

    expect(p?.wert).toContain('33333333-3333-4333-8333-333333333333')
  })
})

// ═══════════════════════════════════════════════════════════════
// Security-Bereich
// ═══════════════════════════════════════════════════════════════

describe('Security-Bereich', () => {
  test('ein anonym lesbarer Bewertungsbestand wird als LECK ausgewiesen', () => {
    const b = bereich(messwerte({
      anonBewertungen: { lesbar: true, quelle: 'PostgREST 200 mit 4 Zeilen' },
    }), 'security')

    const p = pruefungsWert(b, 'Bewertungen nicht anonym lesbar')
    expect(p?.erfuellt).toBe(false)
    expect(p?.wert).toContain('LECK')
    expect(
      p?.wert,
      'Die Quelle muss mit im Wert stehen — sonst ist im Dashboard nicht '
      + 'nachvollziehbar, WORAN das Leck erkannt wurde.',
    ).toContain('PostgREST')
    expect(b.status).toBe('blocked')
  })

  test('Seed-Bewertungen blockieren und werden in der Begruendung beziffert', () => {
    const b = bereich(messwerte({
      anonBewertungen: { lesbar: false, quelle: 'anon-Abfrage' },
      bewertungen: [
        { angel_id: '33333333-3333-4333-8333-333333333333', reviewer_id: 'c0ffee00-1234-4000-8000-000000000001' },
        { angel_id: 'c0ffee00-1234-4000-8000-000000000002', reviewer_id: '44444444-4444-4444-8444-444444444444' },
        { angel_id: 'c0ffee00-1234-4000-8000-000000000003', reviewer_id: 'c0ffee00-1234-4000-8000-000000000004' },
      ],
    }), 'security')

    expect(pruefungsWert(b, 'Demo-/Seed-Bewertungen')?.wert).toBe('2 von 3')
    expect(b.status).toBe('blocked')
    expect(b.begruendung).toContain('2')
    expect(b.naechsterSchritt).toContain('Seed')
  })

  test('ein fehlender geheimer Server-Key blockiert den Bereich', () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const b = bereich(messwerte({
      anonBewertungen: { lesbar: false, quelle: 'anon-Abfrage' },
    }), 'security')

    expect(pruefungsWert(b, 'Geheimer Server-Key')?.erfuellt).toBe(false)
    expect(b.status).toBe('blocked')
  })

  test('der Legacy-Service-Role-Key zaehlt waehrend der Migration weiter, wird aber benannt', () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'legacy-jwt-testlauf')
    const p = pruefungsWert(bereich(messwerte({
      anonBewertungen: { lesbar: false, quelle: 'anon-Abfrage' },
    }), 'security'), 'Geheimer Server-Key')

    expect(p?.erfuellt).toBe(true)
    expect(
      p?.wert,
      'Die Quelle gehoert in den Wert — sonst ist im Dashboard nicht sichtbar, '
      + 'ob das Projekt noch am Legacy-JWT haengt.',
    ).toContain('Legacy')
  })

  test('echte Bewertungen ohne Seed-Muster geben den Bereich frei', () => {
    mitServerKey()
    const b = bereich(messwerte({
      anonBewertungen: { lesbar: false, quelle: 'anon-Abfrage' },
      bewertungen: [{ angel_id: 'c0ffee00-1234-4000-8000-000000000001', reviewer_id: 'a1b2c3d4-5566-4000-8000-000000000002' }],
    }), 'security')

    expect(pruefungsWert(b, 'Demo-/Seed-Bewertungen')?.wert).toBe('0 von 1')
    expect(b.status).toBe('ready')
  })
})

// ═══════════════════════════════════════════════════════════════
// istSeedUuid
// ═══════════════════════════════════════════════════════════════

describe('istSeedUuid', () => {
  test('wiederholte-Ziffern-Kennungen aus Seed-Daten werden erkannt', () => {
    expect(istSeedUuid('33333333-3333-4333-8333-333333333333')).toBe(true)
    expect(istSeedUuid('44444444-4444-4444-8444-444444444444')).toBe(true)
    expect(istSeedUuid('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(true)
  })

  test('eine echte Kennung wird nicht als Seed-Datensatz eingestuft', () => {
    expect(istSeedUuid('c0ffee00-1234-4000-8000-000000000001')).toBe(false)
    expect(istSeedUuid('a1b2c3d4-5566-4000-8000-000000000002')).toBe(false)
    expect(
      istSeedUuid('33333333-3334-4333-8333-333333333333'),
      'Nur der zweite Block weicht ab — das reicht, es ist keine Seed-Kennung.',
    ).toBe(false)
  })

  test('alles was kein String ist, ist keine Seed-Kennung', () => {
    for (const wert of [null, undefined, 0, 42, {}, [], true]) {
      expect(istSeedUuid(wert), String(wert)).toBe(false)
    }
    expect(istSeedUuid('')).toBe(false)
  })

  test('LUECKE: eine Kennung mit acht fuehrenden Nullen gilt ebenfalls als Seed-Datensatz', () => {
    // Das Muster fragt nur „acht gleiche Zeichen, Bindestrich, vier gleiche".
    // Kennungen der Form 00000000-0000-… erfuellen es — und solche Kennungen
    // werden im Projekt tatsaechlich vergeben (die Stamm-Organisation traegt
    // 00000000-0000-4000-8000-000460629986).
    //
    // Folgenlos, solange istSeedUuid nur auf Bewertungs-IDs angewandt wird
    // (angel_id/reviewer_id sind dort echte Zufalls-UUIDs). Wer die Funktion
    // auf Organisations- oder Mandanten-IDs ausweitet — sie ist exportiert,
    // damit scripts/bereinige-testdaten.ts dieselbe Erkennung nutzt — trifft
    // damit die Stamm-Organisation.
    expect(istSeedUuid('00000000-0000-4000-8000-000460629986')).toBe(true)
  })
})
