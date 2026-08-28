// ═══════════════════════════════════════════════════════════════════════
// Track 10 — Subjekt- und Objektbindung INNERHALB des Mandanten
//
// Der org_fence trennt Mandanten, NIE Rollen (siehe die Begruendung in
// lib/organizations/server.ts und Track 6). Innerhalb einer Organisation
// entscheidet allein der Routen-/Modulcode, WER auf WELCHES Objekt
// zugreifen darf. Genau diese Ebene pruefen die folgenden Tests.
//
// Jede der fuenf Regeln hat mindestens eine GEGENPROBE, die den ALTEN
// Zustand nachstellt: der Aufruf, der vorher durchging, muss jetzt
// scheitern UND darf nichts geschrieben haben. Ein gruener Test, der nur
// den erlaubten Weg abgeht, belegt nicht, dass der verbotene gesperrt ist.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'
import { istThreadTeilnehmer, createAntwort } from '@/lib/ops/nachrichten'
import { createAnhang } from '@/lib/ops/anhaenge'
import { OPS_POSTFACH_ROLLEN, hatOpsPostfach } from '@/lib/ops/postfach-rollen'
import { ROLLEN } from '@/lib/auth/rollen'
import { benutzerGehoertZuOrg, assertBenutzerInOrg } from '@/lib/organizations/benutzer-guard'
import { assertZuordnungInOrg } from '@/lib/akten/zuordnung-guard'
import { createAssessment } from '@/lib/sis/assessments'
import { createAufnahme } from '@/lib/pflege/aufnahmen'

const ORG = '00000000-0000-4000-8000-0000000000a1'
const FREMD_ORG = '00000000-0000-4000-8000-0000000000b2'

const WURZEL = 'n-wurzel'
const ANTWORT = 'n-antwort'

const PDL = 'u-pdl'          // Absender der Wurzel
const ENGEL = 'u-engel'      // Empfaenger der Wurzel
const QM = 'u-qm'            // Absender einer Antwort im Verlauf
const KUNDE = 'u-kunde'      // unbeteiligtes Konto derselben Organisation

// ── Doppelgaenger fuer den Nachrichten-Verlauf ─────────────────────────
//
// Ein Verlauf: WURZEL (Absender PDL, Empfaenger ENGEL) mit einer Antwort
// ANTWORT (Absender QM). KUNDE kommt darin nicht vor.
function threadFake(optionen: { empfaengerTreffer?: string[]; fehlerAuf?: string } = {}) {
  const empfaenger = optionen.empfaengerTreffer ?? [ENGEL]

  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (optionen.fehlerAuf === a.tabelle) {
      return { error: { message: 'Verbindung unterbrochen' } }
    }

    if (a.tabelle === 'ops_nachrichten') {
      if (a.operation === 'insert') {
        return { data: { id: 'n-neu', eltern_id: WURZEL, organization_id: ORG } }
      }
      // Mandantenfence: eine LESENDE Abfrage ohne org-Filter liefert nichts —
      // damit faellt ein vergessener Fence im Pruefling als Test auf.
      if (!hatFilter(a, 'eq', 'organization_id', ORG)) return { data: null }

      if (hatFilter(a, 'eq', 'eltern_id', WURZEL)) {
        return { data: [{ id: ANTWORT, absender_id: QM }] }
      }
      if (hatFilter(a, 'eq', 'id', WURZEL)) {
        return { data: { id: WURZEL, absender_id: PDL, eltern_id: null } }
      }
      if (hatFilter(a, 'eq', 'id', ANTWORT)) {
        return { data: { id: ANTWORT, absender_id: QM, eltern_id: WURZEL } }
      }
      return { data: null }
    }

    if (a.tabelle === 'ops_nachrichten_empfaenger') {
      if (a.operation === 'insert') return { data: [] }
      const gesucht = a.filter.find(f => f.methode === 'eq' && f.spalte === 'empfaenger_id')?.wert
      return { data: empfaenger.includes(String(gesucht)) ? [{ nachricht_id: WURZEL }] : [] }
    }

    // Empfaengerpruefung in createNachricht/createAntwort.
    if (a.tabelle === 'organization_members' || a.tabelle === 'caregivers') {
      return { data: [{ user_id: ENGEL }, { user_id: PDL }, { user_id: QM }, { user_id: KUNDE }] }
    }

    return { data: null }
  })
}

// ═══════════════════════════════════════════════════════════════════════
// 1) istThreadTeilnehmer
// ═══════════════════════════════════════════════════════════════════════

describe('Track 10 / istThreadTeilnehmer', () => {
  it('Absender der Wurzel ist beteiligt', async () => {
    const fake = threadFake()
    await expect(
      istThreadTeilnehmer(fake.client, { organizationId: ORG, nachrichtId: WURZEL, userId: PDL }),
    ).resolves.toBe(true)
  })

  it('Empfaenger der Wurzel ist beteiligt', async () => {
    const fake = threadFake()
    await expect(
      istThreadTeilnehmer(fake.client, { organizationId: ORG, nachrichtId: WURZEL, userId: ENGEL }),
    ).resolves.toBe(true)
  })

  it('Absender einer Antwort im Verlauf ist beteiligt', async () => {
    const fake = threadFake()
    await expect(
      istThreadTeilnehmer(fake.client, { organizationId: ORG, nachrichtId: WURZEL, userId: QM }),
    ).resolves.toBe(true)
  })

  it('Beteiligung gilt auch, wenn auf eine ANTWORT geantwortet wird (Wurzel wird aufgeloest)', async () => {
    const fake = threadFake()
    await expect(
      istThreadTeilnehmer(fake.client, { organizationId: ORG, nachrichtId: ANTWORT, userId: ENGEL }),
    ).resolves.toBe(true)
  })

  it('unbeteiligtes Konto derselben Organisation ist NICHT beteiligt', async () => {
    const fake = threadFake()
    await expect(
      istThreadTeilnehmer(fake.client, { organizationId: ORG, nachrichtId: WURZEL, userId: KUNDE }),
    ).resolves.toBe(false)
  })

  it('Nachricht eines fremden Mandanten ist nicht beteiligungsfaehig', async () => {
    const fake = threadFake()
    await expect(
      istThreadTeilnehmer(fake.client, { organizationId: FREMD_ORG, nachrichtId: WURZEL, userId: PDL }),
    ).resolves.toBe(false)
  })

  it('leere userId ist ein Nein, kein „egal"', async () => {
    const fake = threadFake()
    await expect(
      istThreadTeilnehmer(fake.client, { organizationId: ORG, nachrichtId: WURZEL, userId: '   ' }),
    ).resolves.toBe(false)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('fail-closed: ein Datenbankfehler wird geworfen, nicht als „beteiligt" gedeutet', async () => {
    const fake = threadFake({ fehlerAuf: 'ops_nachrichten' })
    await expect(
      istThreadTeilnehmer(fake.client, { organizationId: ORG, nachrichtId: WURZEL, userId: PDL }),
    ).rejects.toThrow('Nachrichtenverlauf konnte nicht geprueft werden')
  })

  it('jede Abfrage traegt den Mandantenfence', async () => {
    const fake = threadFake()
    await istThreadTeilnehmer(fake.client, { organizationId: ORG, nachrichtId: WURZEL, userId: KUNDE })
    expect(fake.aufrufe.length).toBeGreaterThan(0)
    for (const a of fake.aufrufe) {
      expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(true)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2) createAntwort — GEGENPROBEN zur alten Regel
// ═══════════════════════════════════════════════════════════════════════

const ANTWORT_DATEN = {
  betreff: 'Re: Einsatzplanung',
  inhalt: 'Bitte den Einsatz bei Frau M. streichen.',
  prioritaet: 'normal' as const,
  kategorie: 'einsatz' as const,
  bezug_typ: null,
  bezug_id: null,
}

describe('Track 10 / createAntwort', () => {
  it('Beteiligter darf antworten', async () => {
    const fake = threadFake()
    const antwort = await createAntwort(fake.client, {
      organizationId: ORG,
      elternId: WURZEL,
      data: { ...ANTWORT_DATEN, absender_id: ENGEL },
      empfaengerIds: [PDL],
    })
    expect(antwort.eltern_id).toBe(WURZEL)
    expect(fake.auf('ops_nachrichten').some(a => a.operation === 'insert')).toBe(true)
  })

  it('GEGENPROBE: Unbeteiligter wird abgewiesen — die ALTE Regel (nur „Eltern existiert in der Org") liess ihn durch', async () => {
    const fake = threadFake()
    await expect(
      createAntwort(fake.client, {
        organizationId: ORG,
        elternId: WURZEL,
        data: { ...ANTWORT_DATEN, absender_id: KUNDE },
        empfaengerIds: [],
      }),
    ).rejects.toThrow('nicht beteiligt')
  })

  it('GEGENPROBE: nach der Abweisung wurde KEINE Nachricht geschrieben', async () => {
    const fake = threadFake()
    await expect(
      createAntwort(fake.client, {
        organizationId: ORG,
        elternId: WURZEL,
        data: { ...ANTWORT_DATEN, absender_id: KUNDE },
        empfaengerIds: [],
      }),
    ).rejects.toThrow()
    expect(fake.aufrufe.filter(a => a.operation === 'insert')).toHaveLength(0)
  })

  it('GEGENPROBE: ein Unbeteiligter kann die Antwort auch nicht in fremde Postfaecher legen', async () => {
    const fake = threadFake()
    await expect(
      createAntwort(fake.client, {
        organizationId: ORG,
        elternId: WURZEL,
        // Genau der interessante Fall: die Empfaenger gehoeren zur
        // Organisation, die Empfaengerpruefung allein haette sie also
        // durchgelassen.
        data: { ...ANTWORT_DATEN, absender_id: KUNDE },
        empfaengerIds: [PDL, ENGEL, QM],
      }),
    ).rejects.toThrow('nicht beteiligt')
    expect(fake.auf('ops_nachrichten_empfaenger').filter(a => a.operation === 'insert')).toHaveLength(0)
  })

  it('Eltern-Nachricht eines fremden Mandanten bleibt „nicht gefunden"', async () => {
    const fake = threadFake()
    await expect(
      createAntwort(fake.client, {
        organizationId: FREMD_ORG,
        elternId: WURZEL,
        data: { ...ANTWORT_DATEN, absender_id: PDL },
        empfaengerIds: [],
      }),
    ).rejects.toThrow('Eltern-Nachricht nicht gefunden')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3) Postfach-Erlaubnisliste
// ═══════════════════════════════════════════════════════════════════════

describe('Track 10 / Postfach-Erlaubnisliste', () => {
  it('kunde hat kein internes Postfach', () => {
    expect(OPS_POSTFACH_ROLLEN).not.toContain('kunde')
    expect(hatOpsPostfach('', 'kunde')).toBe(false)
  })

  it('angehoerige hat kein internes Postfach', () => {
    expect(OPS_POSTFACH_ROLLEN).not.toContain('angehoerige')
    expect(hatOpsPostfach('', 'angehoerige')).toBe(false)
  })

  it('die Betriebsrollen haben eines', () => {
    for (const rolle of ['superadmin', 'admin', 'pdl', 'qm', 'buchhaltung', 'engel', 'fahrer']) {
      expect(hatOpsPostfach('', rolle)).toBe(true)
    }
  })

  it('die Erlaubnisliste enthaelt nur Rollen, die es wirklich gibt', () => {
    for (const rolle of OPS_POSTFACH_ROLLEN) {
      expect(ROLLEN as readonly string[]).toContain(rolle)
    }
  })

  it('leere Profilrolle ist ein Nein', () => {
    expect(hatOpsPostfach('', '')).toBe(false)
  })

  it('leere app_metadata-Rolle schraenkt nicht ein', () => {
    expect(hatOpsPostfach('', 'pdl')).toBe(true)
  })

  it('widersprechende Quellen: die engere entscheidet', () => {
    expect(hatOpsPostfach('kunde', 'pdl')).toBe(false)
    expect(hatOpsPostfach('pdl', 'kunde')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4) benutzerGehoertZuOrg — Urheberschaft
// ═══════════════════════════════════════════════════════════════════════

function benutzerFake(treffer: { tabelle: string; userId: string; org: string }[], fehlerAuf?: string) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (fehlerAuf === a.tabelle) return { error: { message: 'Zeitueberschreitung' } }
    const userId = a.filter.find(f => f.methode === 'eq' && f.spalte === 'user_id')?.wert
    const org = a.filter.find(f => f.methode === 'eq' && f.spalte === 'organization_id')?.wert
    const gefunden = treffer.some(t => t.tabelle === a.tabelle && t.userId === userId && t.org === org)
    return { data: gefunden ? { user_id: userId } : null }
  })
}

describe('Track 10 / benutzerGehoertZuOrg', () => {
  it('erkennt ein Buerokonto ueber organization_members', async () => {
    const fake = benutzerFake([{ tabelle: 'organization_members', userId: PDL, org: ORG }])
    await expect(benutzerGehoertZuOrg(fake.client, PDL, ORG)).resolves.toBe(true)
  })

  it('erkennt einen Engel ueber caregivers', async () => {
    const fake = benutzerFake([{ tabelle: 'caregivers', userId: ENGEL, org: ORG }])
    await expect(benutzerGehoertZuOrg(fake.client, ENGEL, ORG)).resolves.toBe(true)
  })

  it('erkennt ein Kundenkonto ueber clients', async () => {
    const fake = benutzerFake([{ tabelle: 'clients', userId: KUNDE, org: ORG }])
    await expect(benutzerGehoertZuOrg(fake.client, KUNDE, ORG)).resolves.toBe(true)
  })

  it('ein Konto der FREMDEN Organisation gehoert nicht dazu', async () => {
    const fake = benutzerFake([{ tabelle: 'organization_members', userId: PDL, org: FREMD_ORG }])
    await expect(benutzerGehoertZuOrg(fake.client, PDL, ORG)).resolves.toBe(false)
  })

  it('leere Benutzer-ID ist ein Nein — und fragt die Datenbank gar nicht erst', async () => {
    const fake = benutzerFake([])
    await expect(benutzerGehoertZuOrg(fake.client, '  ', ORG)).resolves.toBe(false)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('fail-closed: ein Datenbankfehler wird geworfen, nicht als „gehoert dazu" gedeutet', async () => {
    const fake = benutzerFake([], 'organization_members')
    await expect(benutzerGehoertZuOrg(fake.client, PDL, ORG)).rejects.toThrow('Benutzer konnte nicht geprueft werden')
  })

  it('assertBenutzerInOrg wirft 404 mit dem Feldnamen im Text', async () => {
    const fake = benutzerFake([])
    await expect(
      assertBenutzerInOrg(fake.client, PDL, ORG, 'Erhoben von'),
    ).rejects.toMatchObject({ status: 404, message: expect.stringContaining('Erhoben von') })
  })

  it('alle drei Abfragen tragen den Mandantenfence', async () => {
    const fake = benutzerFake([])
    await benutzerGehoertZuOrg(fake.client, PDL, ORG)
    expect(fake.aufrufe.map(a => a.tabelle)).toEqual(['organization_members', 'caregivers', 'clients'])
    for (const a of fake.aufrufe) {
      expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(true)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5) Urheberschaft in der Pflegedokumentation
// ═══════════════════════════════════════════════════════════════════════

/** Doppelgaenger, bei dem NUR `erlaubt` zur Organisation gehoert. */
function urheberFake(erlaubt: string[]) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (['organization_members', 'caregivers', 'clients'].includes(a.tabelle)) {
      const userId = String(a.filter.find(f => f.methode === 'eq' && f.spalte === 'user_id')?.wert)
      const org = a.filter.find(f => f.methode === 'eq' && f.spalte === 'organization_id')?.wert
      return { data: erlaubt.includes(userId) && org === ORG ? { user_id: userId } : null }
    }
    if (a.operation === 'insert') {
      return { data: { id: 'neu', organization_id: ORG, client_id: 'c-1' } }
    }
    return { data: [] }
  })
}

describe('Track 10 / Urheberschaft SIS + Aufnahme', () => {
  it('GEGENPROBE: SIS mit einem FREMDEN erhoben_von wird abgewiesen', async () => {
    const fake = urheberFake([PDL])
    await expect(
      createAssessment(fake.client, {
        organizationId: ORG,
        clientId: 'c-1',
        erhobenVon: 'u-fremd',
        erstelltVon: PDL,
      } as never),
    ).rejects.toThrow('Erhoben von')
  })

  it('GEGENPROBE: nach der Abweisung wurde KEINE SIS angelegt', async () => {
    const fake = urheberFake([PDL])
    await expect(
      createAssessment(fake.client, {
        organizationId: ORG,
        clientId: 'c-1',
        erhobenVon: 'u-fremd',
        erstelltVon: PDL,
      } as never),
    ).rejects.toThrow()
    expect(fake.auf('sis_assessments')).toHaveLength(0)
  })

  it('SIS mit eigenem erhoben_von wird angelegt', async () => {
    const fake = urheberFake([PDL])
    await createAssessment(fake.client, {
      organizationId: ORG,
      clientId: 'c-1',
      erhobenVon: PDL,
      erstelltVon: PDL,
    } as never)
    expect(fake.auf('sis_assessments').some(a => a.operation === 'insert')).toBe(true)
  })

  it('GEGENPROBE: Aufnahme mit einem FREMDEN aufgenommen_von wird abgewiesen und schreibt nichts', async () => {
    const fake = urheberFake([PDL])
    await expect(
      createAufnahme(fake.client, {
        organizationId: ORG,
        clientId: 'c-1',
        aufgenommenVon: 'u-fremd',
        erstelltVon: PDL,
      } as never),
    ).rejects.toThrow('Aufgenommen von')
    expect(fake.auf('pflege_aufnahmen')).toHaveLength(0)
  })

  it('Aufnahme mit eigenem aufgenommen_von wird angelegt', async () => {
    const fake = urheberFake([PDL])
    await createAufnahme(fake.client, {
      organizationId: ORG,
      clientId: 'c-1',
      aufgenommenVon: PDL,
      erstelltVon: PDL,
    } as never)
    expect(fake.auf('pflege_aufnahmen').some(a => a.operation === 'insert')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6) Akten-Zuordnung
// ═══════════════════════════════════════════════════════════════════════

function aktenFake(eigene: { clients?: string[]; caregivers?: string[] } = {}) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    const id = a.filter.find(f => f.methode === 'eq' && f.spalte === 'id')?.wert
    const org = a.filter.find(f => f.methode === 'eq' && f.spalte === 'organization_id')?.wert
    if (a.tabelle === 'clients') {
      return { data: org === ORG && (eigene.clients ?? []).includes(String(id)) ? { id } : null }
    }
    if (a.tabelle === 'caregivers') {
      return { data: org === ORG && (eigene.caregivers ?? []).includes(String(id)) ? { id } : null }
    }
    return { data: null }
  })
}

describe('Track 10 / Akten-Zuordnung', () => {
  it('GEGENPROBE: ein FREMDER Klient wird abgewiesen — vorher lief die Zuordnung ungeprueft durch', async () => {
    const fake = aktenFake({ clients: ['c-eigen'] })
    await expect(
      assertZuordnungInOrg(fake.client, { clientId: 'c-fremd', organizationId: ORG }),
    ).rejects.toThrow('Klient nicht gefunden')
  })

  it('GEGENPROBE: eine FREMDE Betreuungskraft wird abgewiesen', async () => {
    const fake = aktenFake({ caregivers: ['cg-eigen'] })
    await expect(
      assertZuordnungInOrg(fake.client, { caregiverId: 'cg-fremd', organizationId: ORG }),
    ).rejects.toThrow('Mitarbeiter nicht gefunden')
  })

  it('eigener Klient wird durchgelassen', async () => {
    const fake = aktenFake({ clients: ['c-eigen'] })
    await expect(
      assertZuordnungInOrg(fake.client, { clientId: 'c-eigen', organizationId: ORG }),
    ).resolves.toBeUndefined()
  })

  it('eigene Betreuungskraft wird durchgelassen', async () => {
    const fake = aktenFake({ caregivers: ['cg-eigen'] })
    await expect(
      assertZuordnungInOrg(fake.client, { caregiverId: 'cg-eigen', organizationId: ORG }),
    ).resolves.toBeUndefined()
  })

  it('ohne Zuordnung (Organisationsablage) ist nichts zu pruefen', async () => {
    const fake = aktenFake()
    await expect(
      assertZuordnungInOrg(fake.client, { clientId: null, caregiverId: null, organizationId: ORG }),
    ).resolves.toBeUndefined()
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('Kunde UND Mitarbeiter gleichzeitig ist ein 400, kein stiller Vorrang', async () => {
    const fake = aktenFake({ clients: ['c-eigen'], caregivers: ['cg-eigen'] })
    await expect(
      assertZuordnungInOrg(fake.client, { clientId: 'c-eigen', caregiverId: 'cg-eigen', organizationId: ORG }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7) Aufgaben-Anhang
// ═══════════════════════════════════════════════════════════════════════

function anhangFake(optionen: { dokument?: string; aufgabe?: string; urheber?: string[] } = {}) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    const id = a.filter.find(f => f.methode === 'eq' && f.spalte === 'id')?.wert
    const org = a.filter.find(f => f.methode === 'eq' && f.spalte === 'organization_id')?.wert
    if (a.tabelle === 'akten_dokumente') {
      return { data: org === ORG && id === optionen.dokument ? { id, organization_id: ORG } : null }
    }
    if (a.tabelle === 'ops_aufgaben') {
      return { data: org === ORG && id === optionen.aufgabe ? { id } : null }
    }
    if (['organization_members', 'caregivers', 'clients'].includes(a.tabelle)) {
      const userId = String(a.filter.find(f => f.methode === 'eq' && f.spalte === 'user_id')?.wert)
      return { data: org === ORG && (optionen.urheber ?? []).includes(userId) ? { user_id: userId } : null }
    }
    if (a.tabelle === 'ops_aufgaben_anhaenge' && a.operation === 'insert') {
      return { data: { id: 'anhang-1', organization_id: ORG } }
    }
    return { data: null }
  })
}

describe('Track 10 / Aufgaben-Anhang', () => {
  it('GEGENPROBE: eine FREMDE Aufgaben-ID wird abgewiesen — vorher kam sie ungeprueft aus dem Pfad', async () => {
    const fake = anhangFake({ dokument: 'd-1', aufgabe: 'a-eigen', urheber: [PDL] })
    await expect(
      createAnhang(fake.client, {
        organizationId: ORG,
        aufgabeId: 'a-fremd',
        dokumentId: 'd-1',
        hinzugefuegtVon: PDL,
      }),
    ).rejects.toThrow('Aufgabe nicht gefunden')
    expect(fake.auf('ops_aufgaben_anhaenge')).toHaveLength(0)
  })

  it('GEGENPROBE: ein FREMDES „hinzugefuegt von" wird abgewiesen', async () => {
    const fake = anhangFake({ dokument: 'd-1', aufgabe: 'a-eigen', urheber: [PDL] })
    await expect(
      createAnhang(fake.client, {
        organizationId: ORG,
        aufgabeId: 'a-eigen',
        dokumentId: 'd-1',
        hinzugefuegtVon: 'u-fremd',
      }),
    ).rejects.toThrow('Hinzugefuegt von')
    expect(fake.auf('ops_aufgaben_anhaenge')).toHaveLength(0)
  })

  it('der Bestandsschutz fuer die Dokument-ID bleibt bestehen', async () => {
    const fake = anhangFake({ dokument: 'd-1', aufgabe: 'a-eigen', urheber: [PDL] })
    await expect(
      createAnhang(fake.client, {
        organizationId: ORG,
        aufgabeId: 'a-eigen',
        dokumentId: 'd-fremd',
        hinzugefuegtVon: PDL,
      }),
    ).rejects.toThrow('Dokument nicht gefunden')
  })

  it('vollstaendig eigener Anhang wird angelegt', async () => {
    const fake = anhangFake({ dokument: 'd-1', aufgabe: 'a-eigen', urheber: [PDL] })
    const anhang = await createAnhang(fake.client, {
      organizationId: ORG,
      aufgabeId: 'a-eigen',
      dokumentId: 'd-1',
      hinzugefuegtVon: PDL,
    })
    expect(anhang.id).toBe('anhang-1')
    expect(fake.auf('ops_aufgaben_anhaenge').some(a => a.operation === 'insert')).toBe(true)
  })
})
