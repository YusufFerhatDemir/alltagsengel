/**
 * Digitale Signaturen — Haertung (Track 4, 28.08.2026)
 *
 * Alle Befunde sind live gegen Produktion nachgeprueft
 * (scripts/verify-signaturen-live.mjs, 11/11 gruen):
 *
 *   · signatur_audit_log traegt live GENAU EINE permissive Policy
 *     (admin_sig_audit_all, is_admin() = admin|superadmin). Der Nachweis
 *     lief aber mit dem RLS-Client des Signatars — er scheiterte immer,
 *     NACHDEM die Unterschrift schon geschrieben war.
 *   · signaturen.ip_adresse ist `inet`; eine x-forwarded-for-Kette wird
 *     mit 22P02 abgewiesen (live gegengeprueft).
 *   · signatur_dokumente hat keine Policy fuer pdl/qm/buchhaltung — der
 *     Guard liess sie ueber 'einsatz.lesen' herein, die Liste kam LEER
 *     zurueck.
 *
 * Die Tests hier pruefen die Fachschicht mit dem protokollierenden
 * Supabase-Doppelgaenger: WELCHE Filter gesetzt werden, WAS geschrieben
 * wird, und was bei einem Fehlschlag des Nachweises passiert.
 */

import { describe, it, expect } from 'vitest'
import {
  erstelleFakeSupabase,
  hatFilter,
  hatOrgFence,
  type FakeAufruf,
  type FakeAntwort,
} from '../helpers/supabase-fake'
import {
  berechneSHA256,
  ersteIpAdresse,
  kuerzeUserAgent,
  erstelleDokument,
  fordereSignaturAn,
  leisteSignatur,
  lehneSignaturAb,
  verifiziereSignatur,
  listeDokumente,
  listeSignaturen,
  protokolliereSignaturAudit,
} from '@/lib/signaturen/signaturen'
import {
  sichtbareDokumenttypen,
  darfDokumenttyp,
  DOKUMENTTYP_BEREICH,
} from '@/lib/signaturen/berechtigung'
import { SIGNATUR_DOKUMENT_TYPEN } from '@/lib/signaturen/types'
import { UserFacingError } from '@/lib/api/user-facing-error'

const ORG = '00000000-0000-4000-8000-000460629986'
const SIGNATAR = '11111111-1111-4111-8111-111111111111'
const FREMD = '22222222-2222-4222-8222-222222222222'
const SIG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DOK_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const ALLE_TYPEN = [...SIGNATUR_DOKUMENT_TYPEN]

function fake(geber: (a: FakeAufruf) => FakeAntwort | undefined) {
  return erstelleFakeSupabase(geber)
}

// ── Dokumenttyp ↔ Fachbereich ───────────────────────────────────

describe('Dokumenttyp bestimmt die Berechtigung', () => {
  it('Administration sieht alle Arten, einschliesslich „sonstiges"', () => {
    expect(sichtbareDokumenttypen('', 'admin', 'lesen').sort())
      .toEqual([...SIGNATUR_DOKUMENT_TYPEN].sort())
    expect(sichtbareDokumenttypen('', 'superadmin', 'schreiben').sort())
      .toEqual([...SIGNATUR_DOKUMENT_TYPEN].sort())
  })

  it('Buchhaltung sieht KEINE Pflegeberichte — der alte Pauschal-Guard schon', () => {
    // Der alte Guard verlangte 'einsatz.lesen'. Die hat die Buchhaltung —
    // und bekam damit ALLE sechs Dokumentarten, auch Pflegeberichte.
    // Nach der Rollenmatrix darf sie: Leistungsnachweise und Protokolle
    // (einsatz.lesen) sowie Vertraege und Einwilligungen
    // (stammdaten.lesen — sie braucht den Rechnungsempfaenger).
    // Gesundheitsdaten stehen ihr ausdruecklich NICHT zu.
    const sichtbar = sichtbareDokumenttypen('', 'buchhaltung', 'lesen')
    expect(sichtbar).toContain('leistungsnachweis')
    expect(sichtbar).toContain('protokoll')
    expect(sichtbar).toContain('vertrag')
    expect(sichtbar).toContain('einwilligung')
    expect(sichtbar).not.toContain('pflegebericht')
    expect(sichtbar).not.toContain('sonstiges')
    // Gegenprobe: der alte Guard fragte nur 'einsatz.lesen' ab und liess
    // damit alles durch, was in der Tabelle stand.
    expect(sichtbar.length).toBeLessThan(SIGNATUR_DOKUMENT_TYPEN.length)
  })

  it('Buchhaltung darf keine Dokumentart ANLEGEN, die Pflegedaten traegt', () => {
    const schreibbar = sichtbareDokumenttypen('', 'buchhaltung', 'schreiben')
    expect(schreibbar).not.toContain('pflegebericht')
    expect(schreibbar).not.toContain('vertrag')      // nur stammdaten.lesen
    expect(schreibbar).not.toContain('leistungsnachweis') // nur einsatz.lesen
    expect(schreibbar).toEqual([])
  })

  it('„sonstiges" bleibt der Administration vorbehalten', () => {
    expect(DOKUMENTTYP_BEREICH.sonstiges).toBeNull()
    for (const rolle of ['pdl', 'qm', 'buchhaltung']) {
      expect(sichtbareDokumenttypen('', rolle, 'lesen')).not.toContain('sonstiges')
    }
  })

  it('QM darf lesen, aber Pflegeberichte nicht anlegen', () => {
    expect(darfDokumenttyp('', 'qm', 'pflegebericht', 'lesen')).toBe(true)
    expect(darfDokumenttyp('', 'qm', 'pflegebericht', 'schreiben')).toBe(false)
  })

  it('Kundschaft und Engel bekommen gar keine Art', () => {
    for (const rolle of ['kunde', 'engel', 'fahrer', 'angehoerige']) {
      expect(sichtbareDokumenttypen('', rolle, 'lesen')).toEqual([])
    }
  })

  it('veraltetes app_metadata=admin hebt die Beschraenkung nicht auf', () => {
    expect(sichtbareDokumenttypen('admin', 'buchhaltung', 'lesen'))
      .not.toContain('pflegebericht')
  })
})

// ── IP und User-Agent ───────────────────────────────────────────

describe('ersteIpAdresse — inet vertraegt keine Proxy-Kette', () => {
  it('nimmt die erste Adresse der Kette', () => {
    expect(ersteIpAdresse('203.0.113.7, 198.51.100.4')).toBe('203.0.113.7')
    expect(ersteIpAdresse('  203.0.113.7 , 198.51.100.4 ')).toBe('203.0.113.7')
  })

  it('laesst eine einzelne Adresse unveraendert', () => {
    expect(ersteIpAdresse('203.0.113.7')).toBe('203.0.113.7')
    expect(ersteIpAdresse('2001:db8::1')).toBe('2001:db8::1')
  })

  it('schneidet einen angehaengten Port ab', () => {
    expect(ersteIpAdresse('203.0.113.7:41234')).toBe('203.0.113.7')
  })

  it('gibt null statt eines Wertes, den inet ablehnt', () => {
    // Die IP ist Begleitinformation, nicht der Beweis: sie darf die
    // Unterschrift nicht zum Scheitern bringen.
    expect(ersteIpAdresse('unknown')).toBeNull()
    expect(ersteIpAdresse('999.1.1.1')).toBeNull()
    expect(ersteIpAdresse('')).toBeNull()
    expect(ersteIpAdresse(null)).toBeNull()
    expect(ersteIpAdresse(undefined)).toBeNull()
  })

  it('Gegenprobe: der ROHE Header war der Wert, der 22P02 ausloeste', () => {
    const roh = '203.0.113.7, 198.51.100.4'
    expect(roh).toContain(',')                       // so ging er in die inet-Spalte
    expect(ersteIpAdresse(roh)).not.toContain(',')   // so geht er jetzt
  })
})

describe('kuerzeUserAgent', () => {
  it('kuerzt auf 512 Zeichen', () => {
    expect(kuerzeUserAgent('x'.repeat(2000))).toHaveLength(512)
  })
  it('macht aus Leerem null', () => {
    expect(kuerzeUserAgent('   ')).toBeNull()
    expect(kuerzeUserAgent(undefined)).toBeNull()
  })
})

// ── Nachweis fail-closed ────────────────────────────────────────

describe('protokolliereSignaturAudit', () => {
  it('setzt organization_id selbst — der Dienstschluessel umgeht den Fence', () => {
    const f = fake(() => ({ data: null, error: null }))
    return protokolliereSignaturAudit(f.client, ORG, {
      aktion: 'dokument_erstellt',
      akteur_id: SIGNATAR,
    }).then(() => {
      const a = f.ersterAuf('signatur_audit_log', 'insert')
      expect((a?.payload as Record<string, unknown>).organization_id).toBe(ORG)
    })
  })

  it('wirft einen 503 mit Klartext, wenn der Nachweis scheitert', async () => {
    const f = fake(() => ({ error: { message: 'new row violates row-level security policy', code: '42501' } }))
    await expect(
      protokolliereSignaturAudit(f.client, ORG, { aktion: 'dokument_erstellt', akteur_id: SIGNATAR }),
    ).rejects.toMatchObject({ name: 'UserFacingError', status: 503 })
  })
})

// ── Unterschrift leisten ────────────────────────────────────────

const OFFENE_SIGNATUR = {
  id: SIG_ID,
  organization_id: ORG,
  dokument_id: DOK_ID,
  signatar_id: SIGNATAR,
  status: 'offen',
  signatur_dokumente: { dokument_hash_sha256: 'a'.repeat(64) },
}

describe('leisteSignatur', () => {
  it('beansprucht den Status per Compare-and-Swap auf „offen"', async () => {
    const f = fake(a => {
      if (a.tabelle === 'signaturen' && a.operation === 'select') return { data: OFFENE_SIGNATUR }
      if (a.tabelle === 'signaturen' && a.operation === 'update') {
        return { data: { ...OFFENE_SIGNATUR, status: 'signiert' } }
      }
      return { data: null, error: null }
    })

    await leisteSignatur(f.client, ORG, SIG_ID, SIGNATAR, { methode: 'signaturepad' })

    const update = f.auf('signaturen').find(a => a.operation === 'update')
    expect(hatFilter(update, 'eq', 'status', 'offen')).toBe(true)
    expect(hatFilter(update, 'eq', 'signatar_id', SIGNATAR)).toBe(true)
    expect(hatOrgFence(update, ORG)).toBe(true)
  })

  it('meldet 409, wenn der CAS ins Leere greift (paralleler Vorgang)', async () => {
    const f = fake(a => {
      if (a.tabelle === 'signaturen' && a.operation === 'select') return { data: OFFENE_SIGNATUR }
      if (a.tabelle === 'signaturen' && a.operation === 'update') return { data: null }
      return { data: null, error: null }
    })
    await expect(
      leisteSignatur(f.client, ORG, SIG_ID, SIGNATAR, { methode: 'pin' }),
    ).rejects.toMatchObject({ name: 'UserFacingError', status: 409 })
  })

  it('weist einen fremden Signatar mit 403 ab', async () => {
    const f = fake(a =>
      a.tabelle === 'signaturen' && a.operation === 'select' ? { data: OFFENE_SIGNATUR } : { data: null })
    await expect(
      leisteSignatur(f.client, ORG, SIG_ID, FREMD, { methode: 'pin' }),
    ).rejects.toMatchObject({ name: 'UserFacingError', status: 403 })
  })

  it('schreibt die erste IP der Kette, nicht den rohen Header', async () => {
    const f = fake(a => {
      if (a.tabelle === 'signaturen' && a.operation === 'select') return { data: OFFENE_SIGNATUR }
      if (a.tabelle === 'signaturen' && a.operation === 'update') return { data: { ...OFFENE_SIGNATUR } }
      return { data: null, error: null }
    })
    await leisteSignatur(f.client, ORG, SIG_ID, SIGNATAR, {
      methode: 'signaturepad',
      ip_adresse: '203.0.113.7, 198.51.100.4',
      user_agent: 'Mozilla/5.0',
    })
    const update = f.auf('signaturen').find(a => a.operation === 'update')
    expect((update?.payload as Record<string, unknown>).ip_adresse).toBe('203.0.113.7')
  })

  it('NIMMT DIE UNTERSCHRIFT ZURUECK, wenn der Nachweis scheitert', async () => {
    // Der Kern des P0: vorher blieb die Unterschrift stehen und die Route
    // meldete 500. Jetzt wird der beanspruchte Statuswechsel rueckgaengig
    // gemacht und der Fehler ist ein 503 mit Klartext.
    const f = fake(a => {
      if (a.tabelle === 'signaturen' && a.operation === 'select') return { data: OFFENE_SIGNATUR }
      if (a.tabelle === 'signaturen' && a.operation === 'update') return { data: { ...OFFENE_SIGNATUR } }
      if (a.tabelle === 'signatur_audit_log') {
        return { error: { message: 'row-level security', code: '42501' } }
      }
      return { data: null, error: null }
    })

    await expect(
      leisteSignatur(f.client, ORG, SIG_ID, SIGNATAR, { methode: 'checkbox' }),
    ).rejects.toMatchObject({ name: 'UserFacingError', status: 503 })

    const updates = f.auf('signaturen').filter(a => a.operation === 'update')
    expect(updates).toHaveLength(2)
    const rueckname = updates[1].payload as Record<string, unknown>
    expect(rueckname.status).toBe('offen')
    expect(rueckname.signatur_hash_sha256).toBeNull()
    expect(rueckname.signiert_am).toBeNull()
    expect(hatOrgFence(updates[1], ORG)).toBe(true)
  })

  it('weist eine unbekannte Methode mit Klartext ab', async () => {
    const f = fake(() => ({ data: null, error: null }))
    await expect(
      leisteSignatur(f.client, ORG, SIG_ID, SIGNATAR, { methode: 'zuruf' as never }),
    ).rejects.toBeInstanceOf(UserFacingError)
  })

  it('weist ein zu grosses Unterschriftsbild mit 413 ab', async () => {
    const f = fake(() => ({ data: null, error: null }))
    await expect(
      leisteSignatur(f.client, ORG, SIG_ID, SIGNATAR, {
        methode: 'signaturepad',
        signatur_daten: 'x'.repeat(6 * 1024 * 1024),
      }),
    ).rejects.toMatchObject({ status: 413 })
  })
})

describe('lehneSignaturAb', () => {
  it('beansprucht ebenfalls per Compare-and-Swap', async () => {
    const f = fake(a => {
      if (a.tabelle === 'signaturen' && a.operation === 'select') return { data: OFFENE_SIGNATUR }
      if (a.tabelle === 'signaturen' && a.operation === 'update') {
        return { data: { ...OFFENE_SIGNATUR, status: 'abgelehnt' } }
      }
      return { data: null, error: null }
    })
    await lehneSignaturAb(f.client, ORG, SIG_ID, SIGNATAR, 'Inhalt stimmt nicht')
    const update = f.auf('signaturen').find(a => a.operation === 'update')
    expect(hatFilter(update, 'eq', 'status', 'offen')).toBe(true)
  })

  it('verlangt einen Grund', async () => {
    const f = fake(() => ({ data: null, error: null }))
    await expect(lehneSignaturAb(f.client, ORG, SIG_ID, SIGNATAR, '  '))
      .rejects.toMatchObject({ status: 400 })
  })

  it('nimmt die Ablehnung zurueck, wenn der Nachweis scheitert', async () => {
    const f = fake(a => {
      if (a.tabelle === 'signaturen' && a.operation === 'select') return { data: OFFENE_SIGNATUR }
      if (a.tabelle === 'signaturen' && a.operation === 'update') return { data: { ...OFFENE_SIGNATUR } }
      if (a.tabelle === 'signatur_audit_log') return { error: { message: 'rls', code: '42501' } }
      return { data: null, error: null }
    })
    await expect(lehneSignaturAb(f.client, ORG, SIG_ID, SIGNATAR, 'Grund'))
      .rejects.toMatchObject({ status: 503 })
    const updates = f.auf('signaturen').filter(a => a.operation === 'update')
    expect((updates[1].payload as Record<string, unknown>).status).toBe('offen')
    expect((updates[1].payload as Record<string, unknown>).ablehnung_grund).toBeNull()
  })
})

// ── Verifikation ────────────────────────────────────────────────

describe('verifiziereSignatur prueft AUCH den Dokumentinhalt', () => {
  const inhalt = 'Leistungsnachweis Mai 2026, 12 Stunden'
  const dokHash = berechneSHA256(inhalt)
  const zeit = '2026-05-31T10:00:00.000Z'
  const sigHash = berechneSHA256(`${dokHash}:${SIGNATAR}:${zeit}`)

  const signiert = (snapshot: string | null) => ({
    id: SIG_ID,
    organization_id: ORG,
    dokument_id: DOK_ID,
    signatar_id: SIGNATAR,
    signatar_name: 'Frau Muster',
    status: 'signiert',
    methode: 'signaturepad',
    signiert_am: zeit,
    signatur_hash_sha256: sigHash,
    signatur_dokumente: {
      dokument_hash_sha256: dokHash,
      dokument_inhalt_snapshot: snapshot,
    },
  })

  it('bestaetigt eine unveraenderte Unterschrift', async () => {
    const f = fake(a => (a.tabelle === 'signaturen' ? { data: signiert(inhalt) } : { data: null, error: null }))
    const e = await verifiziereSignatur(f.client, ORG, SIG_ID, SIGNATAR)
    expect(e.gueltig).toBe(true)
    expect(e.signaturHashStimmt).toBe(true)
    expect(e.dokumentUnveraendert).toBe(true)
  })

  it('ERKENNT einen nachtraeglich geaenderten Dokumentinhalt', async () => {
    // Der Kern des zweiten Befunds: der Schnappschuss wurde geladen und
    // nie benutzt. Genau dieser Fall galt als „gueltig".
    const veraendert = 'Leistungsnachweis Mai 2026, 20 Stunden'
    const f = fake(a => (a.tabelle === 'signaturen' ? { data: signiert(veraendert) } : { data: null, error: null }))
    const e = await verifiziereSignatur(f.client, ORG, SIG_ID, SIGNATAR)
    expect(e.dokumentUnveraendert).toBe(false)
    expect(e.gueltig).toBe(false)
    // Der Signatur-Hash allein haette weiterhin gepasst — das ist der
    // Grund, warum die alte Pruefung nichts gemerkt hat.
    expect(e.signaturHashStimmt).toBe(true)
  })

  it('behauptet ohne Schnappschuss keine Unversehrtheit des Inhalts', async () => {
    const f = fake(a => (a.tabelle === 'signaturen' ? { data: signiert(null) } : { data: null, error: null }))
    const e = await verifiziereSignatur(f.client, ORG, SIG_ID, SIGNATAR)
    expect(e.dokumentUnveraendert).toBeNull()
    expect(e.gueltig).toBe(true)
    expect(String(e.details.hinweis)).toContain('kein Inhalts-Schnappschuss')
  })

  it('protokolliert hash_ungueltig, wenn der Inhalt nicht mehr passt', async () => {
    const f = fake(a => (a.tabelle === 'signaturen' ? { data: signiert('anderer Text') } : { data: null, error: null }))
    await verifiziereSignatur(f.client, ORG, SIG_ID, SIGNATAR)
    const audit = f.ersterAuf('signatur_audit_log', 'insert')
    expect((audit?.payload as Record<string, unknown>).aktion).toBe('hash_ungueltig')
  })

  it('meldet 404 statt „gueltig: false" fuer eine unbekannte Signatur', async () => {
    const f = fake(() => ({ data: null, error: null }))
    await expect(verifiziereSignatur(f.client, ORG, SIG_ID, SIGNATAR))
      .rejects.toMatchObject({ status: 404 })
  })
})

// ── Dokumente ───────────────────────────────────────────────────

describe('erstelleDokument', () => {
  const inhalt = 'Vertragstext'

  it('berechnet den Hash aus dem Inhalt statt ihn zu glauben', async () => {
    const f = fake(a => {
      if (a.tabelle === 'signatur_dokumente' && a.operation === 'insert') {
        return { data: { id: DOK_ID, dokument_typ: 'vertrag' } }
      }
      return { data: null, error: null }
    })
    await erstelleDokument(f.client, ORG, SIGNATAR, {
      titel: 'Vertrag',
      dokument_typ: 'vertrag',
      dokument_inhalt_snapshot: inhalt,
    }, ALLE_TYPEN)

    const insert = f.ersterAuf('signatur_dokumente', 'insert')
    expect((insert?.payload as Record<string, unknown>).dokument_hash_sha256)
      .toBe(berechneSHA256(inhalt))
  })

  it('weist einen mitgeschickten, abweichenden Hash zurueck', async () => {
    const f = fake(() => ({ data: null, error: null }))
    await expect(erstelleDokument(f.client, ORG, SIGNATAR, {
      titel: 'Vertrag',
      dokument_typ: 'vertrag',
      dokument_inhalt_snapshot: inhalt,
      dokument_hash_sha256: 'b'.repeat(64),
    }, ALLE_TYPEN)).rejects.toMatchObject({ status: 400 })
  })

  it('weist eine Dokumentart ausserhalb der Erlaubnisliste mit 403 ab', async () => {
    const f = fake(() => ({ data: null, error: null }))
    await expect(erstelleDokument(f.client, ORG, SIGNATAR, {
      titel: 'Bericht',
      dokument_typ: 'pflegebericht',
      dokument_hash_sha256: 'c'.repeat(64),
    }, ['leistungsnachweis'])).rejects.toMatchObject({ status: 403 })
  })

  it('loescht das Dokument wieder, wenn der Nachweis scheitert', async () => {
    const f = fake(a => {
      if (a.tabelle === 'signatur_dokumente' && a.operation === 'insert') return { data: { id: DOK_ID } }
      if (a.tabelle === 'signatur_audit_log') return { error: { message: 'rls', code: '42501' } }
      return { data: null, error: null }
    })
    await expect(erstelleDokument(f.client, ORG, SIGNATAR, {
      titel: 'Vertrag', dokument_typ: 'vertrag', dokument_inhalt_snapshot: inhalt,
    }, ALLE_TYPEN)).rejects.toMatchObject({ status: 503 })

    const loeschung = f.auf('signatur_dokumente').find(a => a.operation === 'delete')
    expect(loeschung).toBeDefined()
    expect(hatFilter(loeschung, 'eq', 'id', DOK_ID)).toBe(true)
  })
})

describe('listeDokumente / listeSignaturen — Fence im Code', () => {
  it('filtert auf Mandant UND Dokumentart', async () => {
    const f = fake(() => ({ data: [] }))
    await listeDokumente(f.client, ORG, ['leistungsnachweis', 'protokoll'])
    const a = f.ersterAuf('signatur_dokumente')
    expect(hatOrgFence(a, ORG)).toBe(true)
    expect(hatFilter(a, 'in', 'dokument_typ', ['leistungsnachweis', 'protokoll'])).toBe(true)
  })

  it('fragt bei leerer Erlaubnisliste GAR NICHT erst ab', async () => {
    const f = fake(() => ({ data: [{ id: 'darf-nicht-erscheinen' }] }))
    expect(await listeDokumente(f.client, ORG, [])).toEqual([])
    expect(f.aufrufe).toHaveLength(0)
  })

  it('Signaturen haengen ueber !inner an der Art ihres Dokuments', async () => {
    const f = fake(() => ({ data: [] }))
    await listeSignaturen(f.client, ORG, ['leistungsnachweis'])
    const a = f.ersterAuf('signaturen')
    expect(a?.spalten).toContain('signatur_dokumente!inner')
    expect(hatFilter(a, 'in', 'signatur_dokumente.dokument_typ', ['leistungsnachweis'])).toBe(true)
    expect(hatOrgFence(a, ORG)).toBe(true)
  })
})

describe('fordereSignaturAn', () => {
  it('prueft das Konto des Signatars, statt in einen 23503 zu laufen', async () => {
    const f = fake(a => {
      if (a.tabelle === 'signatur_dokumente') return { data: { id: DOK_ID, dokument_typ: 'vertrag' } }
      if (a.tabelle === 'profiles') return { data: null }
      return { data: null, error: null }
    })
    await expect(fordereSignaturAn(f.client, ORG, SIGNATAR, {
      dokument_id: DOK_ID, signatar_id: FREMD, signatar_name: 'Unbekannt',
    }, ALLE_TYPEN)).rejects.toMatchObject({ status: 404 })

    // Es darf keine Signaturzeile entstanden sein.
    expect(f.auf('signaturen').filter(a => a.operation === 'insert')).toHaveLength(0)
  })

  it('weist ein Dokument einer nicht erlaubten Art mit 403 ab', async () => {
    const f = fake(a =>
      a.tabelle === 'signatur_dokumente' ? { data: { id: DOK_ID, dokument_typ: 'pflegebericht' } } : { data: null })
    await expect(fordereSignaturAn(f.client, ORG, SIGNATAR, {
      dokument_id: DOK_ID, signatar_id: SIGNATAR, signatar_name: 'Frau Muster',
    }, ['leistungsnachweis'])).rejects.toMatchObject({ status: 403 })
  })

  it('meldet 404 fuer ein Dokument aus einem fremden Mandanten', async () => {
    const f = fake(() => ({ data: null }))
    await expect(fordereSignaturAn(f.client, ORG, SIGNATAR, {
      dokument_id: DOK_ID, signatar_id: SIGNATAR, signatar_name: 'Frau Muster',
    }, ALLE_TYPEN)).rejects.toMatchObject({ status: 404 })
    const a = f.ersterAuf('signatur_dokumente')
    expect(hatOrgFence(a, ORG)).toBe(true)
  })
})
