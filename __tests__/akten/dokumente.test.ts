/**
 * Zentrales Dokumentenmanagement (lib/akten/dokumente.ts)
 *
 * Hier liegen Verträge, Führungszeugnisse, Pflegegradbescheide und
 * ärztliche Unterlagen — der Bestand mit dem höchsten Schutzbedarf im
 * ganzen System. Zwei Eigenschaften machen diese Datei besonders
 * empfindlich:
 *
 *   1. ALLE Aufrufer benutzen createAdminClient() (Service-Role). Die
 *      Buckets haben keine clientseitigen Storage-Policies, RLS greift
 *      nicht — die Mandantengrenze existiert NUR als eq('organization_id')
 *      in diesen Funktionen. Fehlt sie an einer Stelle, fehlt sie ganz.
 *
 *   2. Der Suchbegriff kommt ungefiltert aus der URL (?suche=) und landete
 *      als Zeichenkette in einer PostgREST-`or()`-Gruppe. Diese Zeichenkette
 *      wird serverseitig zerlegt: Komma und Punkt sind dort Syntax, nicht
 *      Text.
 *
 * Die Sperre ist die dritte geprüfte Achse: sie ist der Aufbewahrungs-
 * schutz (Löschmoratorium). Was sich trotz Sperre ändern lässt, ist keine
 * Sperre.
 */

import { describe, it, expect } from 'vitest'
import {
  computeSha256Hex,
  uploadDokumentDatei,
  getSignedDokumentUrl,
  createDokument,
  listDokumente,
  getDokument,
  updateDokument,
  softDeleteDokument,
  lockDokument,
  unlockDokument,
  addDokumentVersion,
  listDokumentVersionen,
} from '@/lib/akten/dokumente'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf, type FakeAntwort } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const FREMDE_ORG = '99999999-9999-4999-8999-999999999999'
const ACTOR = '11111111-1111-4111-8111-111111111111'
const DOK = '22222222-2222-4222-8222-222222222222'
const CLIENT = '33333333-3333-4333-8333-333333333333'
const CAREGIVER = '44444444-4444-4444-8444-444444444444'

const BESTAND = {
  id: DOK, organization_id: ORG, titel: 'Pflegevertrag', gesperrt: false,
  aktuelle_version: 1, status: 'aktiv', deleted_at: null,
}

interface Welt {
  dokumente?: FakeAntwort
  update?: FakeAntwort
  versionen?: FakeAntwort
  log?: FakeAntwort
}

function fake(w: Welt = {}) {
  return erstelleFakeSupabase((a: FakeAufruf): FakeAntwort => {
    if (a.tabelle === 'akten_zugriff_log') return w.log ?? { data: null, error: null }
    if (a.tabelle === 'akten_dokument_versionen') return w.versionen ?? { data: [], error: null }
    if (a.tabelle === 'akten_dokumente') {
      if (a.operation === 'update' || a.operation === 'insert') return w.update ?? { data: BESTAND, error: null }
      return w.dokumente ?? { data: BESTAND, error: null }
    }
    return { data: null, error: null }
  })
}

const DATEI = {
  bucket: 'kunden-dokumente', dateipfad: `${ORG}/${CLIENT}/1-vertrag.pdf`,
  dateiname: 'vertrag.pdf', dateigroesseBytes: 1024, mimeType: 'application/pdf',
  sha256Hash: 'abc123',
}

// ═══════════════════════════════════════════════════════════════════════
// 1 — Datei: Hash und Pfadbildung
// ═══════════════════════════════════════════════════════════════════════

describe('computeSha256Hex', () => {
  it('liefert den bekannten SHA-256 des leeren Inhalts', async () => {
    const hash = await computeSha256Hex(new ArrayBuffer(0))
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('ist stabil und unterscheidet unterschiedliche Inhalte', async () => {
    const a = new TextEncoder().encode('Pflegevertrag').buffer as ArrayBuffer
    const b = new TextEncoder().encode('Pflegevertrag ').buffer as ArrayBuffer
    expect(await computeSha256Hex(a)).toBe(await computeSha256Hex(a))
    expect(await computeSha256Hex(a)).not.toBe(await computeSha256Hex(b))
    expect(await computeSha256Hex(a)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('uploadDokumentDatei', () => {
  function speicherFake(fehler: { message: string } | null = null) {
    const aufrufe: { bucket: string; pfad: string; optionen: Record<string, unknown> }[] = []
    const client = {
      storage: {
        from: (bucket: string) => ({
          upload: async (pfad: string, _d: unknown, optionen: Record<string, unknown>) => {
            aufrufe.push({ bucket, pfad, optionen })
            return { error: fehler }
          },
          createSignedUrl: async (pfad: string, sek: number) => ({
            data: { signedUrl: `https://example.invalid/${pfad}?exp=${sek}` }, error: null,
          }),
        }),
      },
    } as never
    return { client, aufrufe }
  }

  const datei = { name: 'Vertrag.pdf', type: 'application/pdf', arrayBuffer: new ArrayBuffer(8) }

  it('legt Kundendokumente in den Kunden-Bucket, Mitarbeiterdokumente in den Mitarbeiter-Bucket', async () => {
    const k = speicherFake()
    await uploadDokumentDatei(k.client, { organizationId: ORG, clientId: CLIENT, datei })
    expect(k.aufrufe[0].bucket).toBe('kunden-dokumente')

    const m = speicherFake()
    await uploadDokumentDatei(m.client, { organizationId: ORG, caregiverId: CAREGIVER, datei })
    expect(m.aufrufe[0].bucket).toBe('mitarbeiter-dokumente')
  })

  it('stellt dem Pfad Mandant und Zuordnung voran — Mandantentrennung auch im Speicher', async () => {
    const k = speicherFake()
    await uploadDokumentDatei(k.client, { organizationId: ORG, clientId: CLIENT, datei })
    expect(k.aufrufe[0].pfad.startsWith(`${ORG}/${CLIENT}/`)).toBe(true)
  })

  it('entschaerft Pfadanteile im Dateinamen — kein Ausbruch aus dem Mandantenordner', async () => {
    const k = speicherFake()
    await uploadDokumentDatei(k.client, {
      organizationId: ORG, clientId: CLIENT,
      datei: { ...datei, name: '../../../etc/passwd' },
    })
    const pfad = k.aufrufe[0].pfad
    // Genau drei Segmente: org / scope / dateiname.
    expect(pfad.split('/')).toHaveLength(3)
    expect(pfad.startsWith(`${ORG}/${CLIENT}/`)).toBe(true)
    expect(pfad).not.toContain('/etc/')
  })

  it('loest Umlaute auf und wirft alles Uebrige aus dem Dateinamen', async () => {
    const k = speicherFake()
    await uploadDokumentDatei(k.client, {
      organizationId: ORG, clientId: CLIENT,
      datei: { ...datei, name: 'Pflegevertrag Müller & Söhne.pdf' },
    })
    const name = k.aufrufe[0].pfad.split('/')[2]
    expect(name).toMatch(/^\d+-[a-zA-Z0-9._-]+$/)
    expect(name).toContain('Mueller')
  })

  it('ueberschreibt nie eine vorhandene Datei (upsert aus)', async () => {
    const k = speicherFake()
    await uploadDokumentDatei(k.client, { organizationId: ORG, clientId: CLIENT, datei })
    expect(k.aufrufe[0].optionen.upsert).toBe(false)
  })

  it('setzt einen MIME-Typ, auch wenn der Browser keinen mitschickt', async () => {
    const k = speicherFake()
    const erg = await uploadDokumentDatei(k.client, {
      organizationId: ORG, clientId: CLIENT, datei: { ...datei, type: '' },
    })
    expect(erg.mimeType).toBe('application/octet-stream')
    expect(k.aufrufe[0].optionen.contentType).toBe('application/octet-stream')
  })

  it('wirft bei fehlgeschlagenem Upload, statt einen Datenbankeintrag ohne Datei zu ermoeglichen', async () => {
    const k = speicherFake({ message: 'bucket not found' })
    await expect(uploadDokumentDatei(k.client, { organizationId: ORG, clientId: CLIENT, datei }))
      .rejects.toThrow(/Upload fehlgeschlagen/)
  })

  it('signierte URLs sind kurzlebig (Standard 5 Minuten)', async () => {
    const k = speicherFake()
    const url = await getSignedDokumentUrl(k.client, 'kunden-dokumente', 'a/b/c.pdf')
    expect(url).toContain('exp=300')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2 — Anlegen
// ═══════════════════════════════════════════════════════════════════════

describe('createDokument', () => {
  const basis = {
    organizationId: ORG, titel: 'Pflegevertrag', dokumentTyp: 'vertrag' as never,
    datei: DATEI, erstelltVon: ACTOR,
  }

  it('schreibt Mandant, Datei-Metadaten und Hash', async () => {
    const f = fake()
    await createDokument(f.client, { ...basis, clientId: CLIENT })
    const z = f.ersterAuf('akten_dokumente', 'insert')!.payload as Record<string, unknown>
    expect(z.organization_id).toBe(ORG)
    expect(z.client_id).toBe(CLIENT)
    expect(z.caregiver_id).toBeNull()
    expect(z.sha256_hash).toBe(DATEI.sha256Hash)
    expect(z.dateipfad).toBe(DATEI.dateipfad)
  })

  it('verweigert die Doppelzuordnung Kunde UND Mitarbeiter', async () => {
    const f = fake()
    await expect(createDokument(f.client, { ...basis, clientId: CLIENT, caregiverId: CAREGIVER }))
      .rejects.toBeInstanceOf(UserFacingError)
    expect(f.aufrufe).toHaveLength(0)
  })

  it('legt intern und als Entwurfskategorie an, wenn nichts angegeben ist', async () => {
    const f = fake()
    await createDokument(f.client, basis)
    const z = f.ersterAuf('akten_dokumente', 'insert')!.payload as Record<string, unknown>
    // Sichtbarkeit ist eine Datenschutzentscheidung — der Standard muss
    // die engere sein, nicht die weitere.
    expect(z.sichtbarkeit).toBe('intern')
    expect(z.kategorie).toBe('allgemein')
    expect(z.tags).toEqual([])
  })

  it('protokolliert das Hochladen im Zugriffslog', async () => {
    const f = fake()
    await createDokument(f.client, basis)
    const log = f.ersterAuf('akten_zugriff_log', 'insert')!.payload as Record<string, unknown>
    expect(log.aktion).toBe('hochgeladen')
    expect(log.organization_id).toBe(ORG)
    expect(log.benutzer_id).toBe(ACTOR)
  })

  it('wirft, wenn das Zugriffslog nicht schreibbar ist — kein unprotokollierter Zugriff', async () => {
    const f = fake({ log: { data: null, error: { message: 'permission denied' } } })
    await expect(createDokument(f.client, basis)).rejects.toThrow(/Zugriffs-Log/)
  })

  it('wirft bei Schreibfehler, statt ein Dokument ohne Zeile zu melden', async () => {
    const f = fake({ update: { data: null, error: { message: 'violates foreign key' } } })
    await expect(createDokument(f.client, basis)).rejects.toThrow(/konnte nicht angelegt werden/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3 — Lesen, Suche und die Filterinjektion
// ═══════════════════════════════════════════════════════════════════════

describe('listDokumente', () => {
  it('zaeunt auf den Mandanten ein und blendet Geloeschtes aus', async () => {
    const f = fake({ dokumente: { data: [BESTAND] } })
    await listDokumente(f.client, { organizationId: ORG })
    const a = f.ersterAuf('akten_dokumente')!
    expect(hatOrgFence(a, ORG)).toBe(true)
    expect(hatFilter(a, 'is', 'deleted_at', null)).toBe(true)
  })

  it('reicht jeden gesetzten Filter als eigene Bedingung durch', async () => {
    const f = fake({ dokumente: { data: [] } })
    await listDokumente(f.client, {
      organizationId: ORG, clientId: CLIENT, dokumentTyp: 'vertrag' as never,
      kategorie: 'allgemein' as never, status: 'aktiv' as never,
      sichtbarkeit: 'intern' as never, tag: 'wichtig', ablaufBis: '2026-12-31',
    })
    const a = f.ersterAuf('akten_dokumente')!
    expect(hatFilter(a, 'eq', 'client_id', CLIENT)).toBe(true)
    expect(hatFilter(a, 'eq', 'dokument_typ', 'vertrag')).toBe(true)
    expect(hatFilter(a, 'eq', 'status', 'aktiv')).toBe(true)
    expect(hatFilter(a, 'eq', 'sichtbarkeit', 'intern')).toBe(true)
    expect(hatFilter(a, 'contains', 'tags', ['wichtig'])).toBe(true)
    expect(hatFilter(a, 'lte', 'ablaufdatum', '2026-12-31')).toBe(true)
  })

  it('sucht in Titel UND Dateiname', async () => {
    const f = fake({ dokumente: { data: [] } })
    await listDokumente(f.client, { organizationId: ORG, suche: 'Vertrag' })
    const oder = f.ersterAuf('akten_dokumente')!.filter.find(x => x.methode === 'or')!
    expect(String(oder.spalte)).toContain('titel.ilike')
    expect(String(oder.spalte)).toContain('dateiname.ilike')
    expect(String(oder.spalte)).toContain('Vertrag')
  })

  /**
   * Zerlegt eine PostgREST-`or()`-Zeichenkette so, wie PostgREST es tut:
   * Komma trennt nur AUSSERHALB von Anfuehrungszeichen, und ein Backslash
   * maskiert das folgende Zeichen. Ein naives split() auf Komma wuerde die
   * Pruefung genau dort blind machen, wo sie greifen soll.
   */
  function bedingungen(oder: string): string[] {
    const teile: string[] = []
    let aktuell = ''
    let inAnfuehrung = false
    for (let i = 0; i < oder.length; i++) {
      const c = oder[i]
      if (c === '\\' && inAnfuehrung) { aktuell += c + (oder[++i] ?? ''); continue }
      if (c === '"') { inAnfuehrung = !inAnfuehrung; aktuell += c; continue }
      if (c === ',' && !inAnfuehrung) { teile.push(aktuell); aktuell = ''; continue }
      aktuell += c
    }
    teile.push(aktuell)
    return teile
  }

  it('BEFUND: ein Suchbegriff mit Komma erzeugt keine zusaetzliche ODER-Bedingung', async () => {
    // Der Begriff kommt aus ?suche= in der URL. Komma und Punkt sind in
    // der or()-Zeichenkette PostgREST-Syntax: unmaskiert schrieb der
    // Aufrufer damit eigene Bedingungen in die Abfrage.
    const f = fake({ dokumente: { data: [] } })
    await listDokumente(f.client, { organizationId: ORG, suche: 'x,sichtbarkeit.eq.oeffentlich' })
    const oder = String(f.ersterAuf('akten_dokumente')!.filter.find(x => x.methode === 'or')!.spalte)

    // Genau zwei Bedingungen — Titel und Dateiname, sonst nichts.
    const teile = bedingungen(oder)
    expect(teile).toHaveLength(2)
    expect(teile[0].startsWith('titel.ilike."')).toBe(true)
    expect(teile[1].startsWith('dateiname.ilike."')).toBe(true)
  })

  it('BEFUND: Anfuehrungszeichen und Backslash im Suchbegriff werden maskiert', async () => {
    const f = fake({ dokumente: { data: [] } })
    await listDokumente(f.client, { organizationId: ORG, suche: 'a"b\\c' })
    const oder = String(f.ersterAuf('akten_dokumente')!.filter.find(x => x.methode === 'or')!.spalte)
    // Ein unmaskiertes " haette die Anfuehrung beendet und den Rest wieder
    // zu Syntax gemacht.
    expect(oder).toContain('\\"')
    expect(oder).toContain('\\\\')
    expect(bedingungen(oder)).toHaveLength(2)
  })

  it('BEFUND: auch Klammern und Punkte bleiben Text, keine Syntax', async () => {
    const f = fake({ dokumente: { data: [] } })
    await listDokumente(f.client, { organizationId: ORG, suche: 'Vertrag (2026).pdf' })
    const oder = String(f.ersterAuf('akten_dokumente')!.filter.find(x => x.methode === 'or')!.spalte)
    const teile = bedingungen(oder)
    expect(teile).toHaveLength(2)
    expect(teile[0]).toBe('titel.ilike."%Vertrag (2026).pdf%"')
  })

  it('blaettert ueber range, ohne Ueberlappung', async () => {
    const f = fake({ dokumente: { data: [] } })
    await listDokumente(f.client, { organizationId: ORG, limit: 20, offset: 40 })
    expect(hatFilter(f.ersterAuf('akten_dokumente'), 'range', '40', 59)).toBe(true)
  })

  it('wirft bei Lesefehler, statt eine leere Akte zu melden', async () => {
    const f = fake({ dokumente: { data: null, error: { message: 'timeout' } } })
    await expect(listDokumente(f.client, { organizationId: ORG }))
      .rejects.toThrow(/konnten nicht geladen/)
  })
})

describe('getDokument', () => {
  it('sucht ueber ID UND Mandant — ein fremdes Dokument ist nicht auffindbar', async () => {
    const f = fake()
    await getDokument(f.client, DOK, FREMDE_ORG)
    const a = f.ersterAuf('akten_dokumente')!
    expect(hatFilter(a, 'eq', 'id', DOK)).toBe(true)
    expect(hatOrgFence(a, FREMDE_ORG)).toBe(true)
    expect(hatFilter(a, 'is', 'deleted_at', null)).toBe(true)
  })

  it('liefert null ohne Treffer und wirft bei Lesefehler', async () => {
    const leer = fake({ dokumente: { data: null, error: null } })
    expect(await getDokument(leer.client, DOK, ORG)).toBeNull()

    const kaputt = fake({ dokumente: { data: null, error: { message: 'boom' } } })
    await expect(getDokument(kaputt.client, DOK, ORG)).rejects.toThrow(/konnte nicht geladen/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4 — Sperre (Aufbewahrungsschutz)
// ═══════════════════════════════════════════════════════════════════════

describe('Sperre', () => {
  const gesperrt = { ...BESTAND, gesperrt: true }

  it('gesperrt: keine Bearbeitung, keine Loeschung, keine neue Version', async () => {
    for (const aktion of [
      (f: ReturnType<typeof fake>) => updateDokument(f.client, DOK, ORG, { titel: 'neu' }, ACTOR),
      (f: ReturnType<typeof fake>) => softDeleteDokument(f.client, DOK, ORG, ACTOR),
      (f: ReturnType<typeof fake>) => addDokumentVersion(f.client, {
        dokumentId: DOK, organizationId: ORG, datei: DATEI, actorId: ACTOR,
      }),
    ]) {
      const f = fake({ dokumente: { data: gesperrt } })
      await expect(aktion(f)).rejects.toBeInstanceOf(UserFacingError)
      // Und wirklich nichts geschrieben.
      expect(f.aufrufe.some(a => a.operation === 'update' || a.operation === 'insert')).toBe(false)
    }
  })

  it('sperrt mit Grund, Zeitpunkt und Urheber', async () => {
    const f = fake()
    await lockDokument(f.client, DOK, ORG, 'Löschmoratorium Prüfung', ACTOR)
    const upd = f.auf('akten_dokumente').find(a => a.operation === 'update')!
    const z = upd.payload as Record<string, unknown>
    expect(z.gesperrt).toBe(true)
    expect(z.gesperrt_grund).toBe('Löschmoratorium Prüfung')
    expect(z.gesperrt_von).toBe(ACTOR)
    expect(typeof z.gesperrt_am).toBe('string')
    expect(hatOrgFence(upd, ORG)).toBe(true)
  })

  it('entsperren raeumt Grund, Zeitpunkt und Urheber wieder ab', async () => {
    const f = fake()
    await unlockDokument(f.client, DOK, ORG, ACTOR)
    const z = f.auf('akten_dokumente').find(a => a.operation === 'update')!.payload as Record<string, unknown>
    expect(z).toEqual({ gesperrt: false, gesperrt_grund: null, gesperrt_am: null, gesperrt_von: null })
  })

  it('BEFUND: ein geloeschtes Dokument laesst sich nicht mehr sperren oder entsperren', async () => {
    // Sperre und Entsperre laufen als einzige Operationen nicht ueber
    // getDokument() — der deleted_at-Filter fehlte dort deshalb.
    for (const fn of [
      (f: ReturnType<typeof fake>) => lockDokument(f.client, DOK, ORG, 'x', ACTOR),
      (f: ReturnType<typeof fake>) => unlockDokument(f.client, DOK, ORG, ACTOR),
    ]) {
      const f = fake()
      await fn(f).catch(() => {})
      const upd = f.auf('akten_dokumente').find(a => a.operation === 'update')!
      expect(hatFilter(upd, 'is', 'deleted_at', null)).toBe(true)
    }
  })

  it('protokolliert Sperren und Entsperren', async () => {
    const f = fake()
    await lockDokument(f.client, DOK, ORG, 'Grund', ACTOR)
    expect((f.ersterAuf('akten_zugriff_log', 'insert')!.payload as Record<string, unknown>).aktion).toBe('gesperrt')

    const g = fake()
    await unlockDokument(g.client, DOK, ORG, ACTOR)
    expect((g.ersterAuf('akten_zugriff_log', 'insert')!.payload as Record<string, unknown>).aktion).toBe('entsperrt')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5 — Ändern und Löschen
// ═══════════════════════════════════════════════════════════════════════

describe('updateDokument / softDeleteDokument', () => {
  it('schreibt nur die tatsaechlich uebergebenen Felder', async () => {
    const f = fake()
    await updateDokument(f.client, DOK, ORG, { titel: 'Neu' }, ACTOR)
    const z = f.auf('akten_dokumente').find(a => a.operation === 'update')!.payload as Record<string, unknown>
    expect(z).toEqual({ titel: 'Neu' })
  })

  it('setzt ein Feld auch auf null, wenn null ausdruecklich uebergeben wird', async () => {
    const f = fake()
    await updateDokument(f.client, DOK, ORG, { ablaufdatum: null }, ACTOR)
    const z = f.auf('akten_dokumente').find(a => a.operation === 'update')!.payload as Record<string, unknown>
    expect(z).toEqual({ ablaufdatum: null })
  })

  it('wirft bei unbekanntem Dokument, bevor irgendetwas geschrieben wird', async () => {
    const f = fake({ dokumente: { data: null, error: null } })
    await expect(updateDokument(f.client, DOK, ORG, { titel: 'x' }, ACTOR))
      .rejects.toBeInstanceOf(UserFacingError)
    expect(f.aufrufe.some(a => a.operation === 'update')).toBe(false)
  })

  it('protokolliert Archivieren getrennt von gewoehnlichem Bearbeiten', async () => {
    const f = fake()
    await updateDokument(f.client, DOK, ORG, { status: 'archiviert' as never }, ACTOR)
    expect((f.ersterAuf('akten_zugriff_log', 'insert')!.payload as Record<string, unknown>).aktion).toBe('archiviert')

    const g = fake()
    await updateDokument(g.client, DOK, ORG, { titel: 'x' }, ACTOR)
    expect((g.ersterAuf('akten_zugriff_log', 'insert')!.payload as Record<string, unknown>).aktion).toBe('bearbeitet')
  })

  it('loescht weich, mit Zeitpunkt und Urheber — die Datei bleibt', async () => {
    const f = fake()
    await softDeleteDokument(f.client, DOK, ORG, ACTOR)
    const upd = f.auf('akten_dokumente').find(a => a.operation === 'update')!
    const z = upd.payload as Record<string, unknown>
    expect(typeof z.deleted_at).toBe('string')
    expect(z.deleted_by).toBe(ACTOR)
    expect(hatOrgFence(upd, ORG)).toBe(true)
    expect(f.aufrufe.some(a => a.operation === 'delete')).toBe(false)
  })

  it('protokolliert die Loeschung', async () => {
    const f = fake()
    await softDeleteDokument(f.client, DOK, ORG, ACTOR)
    expect((f.ersterAuf('akten_zugriff_log', 'insert')!.payload as Record<string, unknown>).aktion).toBe('geloescht')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6 — Versionierung
// ═══════════════════════════════════════════════════════════════════════

describe('addDokumentVersion', () => {
  it('zaehlt von der aktuellen Version hoch und schreibt die neue Datei in beide Tabellen', async () => {
    const f = fake({ dokumente: { data: { ...BESTAND, aktuelle_version: 3 } } })
    await addDokumentVersion(f.client, {
      dokumentId: DOK, organizationId: ORG, datei: DATEI,
      aenderungsgrund: 'Nachtrag unterschrieben', actorId: ACTOR,
    })

    const v = f.ersterAuf('akten_dokument_versionen', 'insert')!.payload as Record<string, unknown>
    expect(v.version).toBe(4)
    expect(v.organization_id).toBe(ORG)
    expect(v.dokument_id).toBe(DOK)
    expect(v.sha256_hash).toBe(DATEI.sha256Hash)
    expect(v.aenderungsgrund).toBe('Nachtrag unterschrieben')

    const d = f.auf('akten_dokumente').find(a => a.operation === 'update')!.payload as Record<string, unknown>
    expect(d.aktuelle_version).toBe(4)
    expect(d.dateipfad).toBe(DATEI.dateipfad)
  })

  it('schreibt die Versionszeile ZUERST — bei Konflikt bleibt das Dokument unveraendert', async () => {
    // UNIQUE(dokument_id, version) faengt zwei gleichzeitige Versionen ab.
    // Der Zaehler wird in TypeScript gebildet, die Eindeutigkeit steht in
    // der Datenbank: der Verlierer darf das Dokument nicht anfassen.
    const f = fake({
      versionen: { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } },
    })
    await expect(addDokumentVersion(f.client, {
      dokumentId: DOK, organizationId: ORG, datei: DATEI, actorId: ACTOR,
    })).rejects.toThrow(/Version konnte nicht gespeichert werden/)

    expect(f.auf('akten_dokumente').some(a => a.operation === 'update')).toBe(false)
    expect(f.auf('akten_zugriff_log')).toHaveLength(0)
  })

  it('wirft bei unbekanntem oder fremdem Dokument', async () => {
    const f = fake({ dokumente: { data: null, error: null } })
    await expect(addDokumentVersion(f.client, {
      dokumentId: DOK, organizationId: FREMDE_ORG, datei: DATEI, actorId: ACTOR,
    })).rejects.toBeInstanceOf(UserFacingError)
    expect(f.auf('akten_dokument_versionen')).toHaveLength(0)
  })

  it('protokolliert die neue Version mit Nummer und Grund', async () => {
    const f = fake({ dokumente: { data: { ...BESTAND, aktuelle_version: 1 } } })
    await addDokumentVersion(f.client, {
      dokumentId: DOK, organizationId: ORG, datei: DATEI, aenderungsgrund: 'Korrektur', actorId: ACTOR,
    })
    const log = f.ersterAuf('akten_zugriff_log', 'insert')!.payload as Record<string, unknown>
    expect(log.aktion).toBe('version_erstellt')
    expect(log.details).toEqual({ version: 2, aenderungsgrund: 'Korrektur' })
  })
})

describe('listDokumentVersionen', () => {
  it('zaeunt auf Dokument und Mandant ein und sortiert absteigend', async () => {
    const f = fake({ versionen: { data: [] } })
    await listDokumentVersionen(f.client, DOK, ORG)
    const a = f.ersterAuf('akten_dokument_versionen')!
    expect(hatFilter(a, 'eq', 'dokument_id', DOK)).toBe(true)
    expect(hatOrgFence(a, ORG)).toBe(true)
    expect(hatFilter(a, 'order', 'version', { ascending: false })).toBe(true)
  })

  it('wirft bei Lesefehler, statt eine leere Versionshistorie zu liefern', async () => {
    const f = fake({ versionen: { data: null, error: { message: 'boom' } } })
    await expect(listDokumentVersionen(f.client, DOK, ORG)).rejects.toThrow(/Versionen konnten nicht geladen/)
  })
})
