/**
 * KIM-Anhänge (Telematikinfrastruktur, Block 18)
 *
 * Zwei Wege führen Dateien in diesen Bucket, und beide bringen den MIME-Typ
 * als BEHAUPTUNG mit, nicht als Messung:
 *   - der Upload aus dem Formular (`File.type` setzt der Browser),
 *   - der Empfang aus dem KIM-Postfach (den Typ setzt das absendende
 *     Fremdsystem — also niemand, dem wir vertrauen).
 *
 * Daraus folgen die Fälle hier: der Inhalt muss zum behaupteten Typ passen,
 * ein Anhang darf nicht an der Nachricht eines fremden Mandanten landen, und
 * ein einzelner unzulässiger Anhang darf nicht das ganze Postfach lahmlegen.
 */

import { describe, it, expect } from 'vitest'
import {
  uploadKimAttachment,
  listKimAttachments,
  downloadKimAttachmentBytes,
  pruefeKimAnhang,
  inhaltPasstZuTyp,
  virusScanPlaceholder,
  KIM_ATTACHMENTS_BUCKET,
  MAX_ATTACHMENT_BYTES,
  ERLAUBTE_ANHANG_MIME_TYPES,
} from '@/lib/kim/attachment-service'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000000000001'
const FREMDE_ORG = '00000000-0000-4000-8000-0000000000ff'
const MSG = '88888888-8888-4888-8888-888888888888'
const ACTOR = '44444444-4444-4444-8444-444444444444'

function puffer(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer
}

/** Gültige Kopfbytes je Format, danach beliebiger Inhalt. */
const PDF = puffer([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const PNG = puffer([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const JPEG = puffer([0xff, 0xd8, 0xff, 0xe0, 0x00])
const TIFF_LE = puffer([0x49, 0x49, 0x2a, 0x00, 0x08])
const TIFF_BE = puffer([0x4d, 0x4d, 0x00, 0x2a, 0x08])
/** '<html>' — genau der Fall, der als PDF deklariert im Bucket landete. */
const HTML = puffer([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e])

function datei(over: Partial<{ name: string; type: string; arrayBuffer: ArrayBuffer }> = {}) {
  return { name: 'befund.pdf', type: 'application/pdf', arrayBuffer: PDF, ...over }
}

const uploadGeber = (a: FakeAufruf) => {
  if (a.tabelle === 'kim_messages') return { data: { id: MSG } }
  if (a.tabelle === 'kim_attachments' && a.operation === 'insert') {
    return { data: { id: 'anh-1', message_id: MSG, storage_path: 'p', filename: 'befund.pdf' } }
  }
  return { data: null }
}

// ═══════════════════════════════════════════════════════════════════
// Inhalt vs. behaupteter Typ
// ═══════════════════════════════════════════════════════════════════

describe('inhaltPasstZuTyp', () => {
  it.each([
    ['application/pdf', PDF],
    ['image/png', PNG],
    ['image/jpeg', JPEG],
    ['image/tiff', TIFF_LE],
    ['image/tiff', TIFF_BE],
  ])('erkennt %s an den Kennbytes', (mime, daten) => {
    expect(inhaltPasstZuTyp(mime as string, daten as ArrayBuffer)).toBe(true)
  })

  it('erkennt HTML, das sich als PDF ausgibt', () => {
    expect(inhaltPasstZuTyp('application/pdf', HTML)).toBe(false)
  })

  it('lässt sich nicht durch einen anderen erlaubten Typ täuschen', () => {
    expect(inhaltPasstZuTyp('image/png', JPEG)).toBe(false)
    expect(inhaltPasstZuTyp('application/pdf', PNG)).toBe(false)
  })

  it('lässt signaturlose Textformate durch — dort trägt der Content-Type', () => {
    expect(inhaltPasstZuTyp('text/plain', HTML)).toBe(true)
    expect(inhaltPasstZuTyp('application/xml', HTML)).toBe(true)
  })

  it('wertet eine zu kurze Datei nicht als Treffer', () => {
    expect(inhaltPasstZuTyp('application/pdf', puffer([0x25, 0x50]))).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════
// pruefeKimAnhang
// ═══════════════════════════════════════════════════════════════════

describe('pruefeKimAnhang', () => {
  it('lässt eine zulässige Datei durch', () => {
    expect(() => pruefeKimAnhang(datei())).not.toThrow()
  })

  it('weist einen nicht erlaubten Dateityp ab', () => {
    expect(() => pruefeKimAnhang(datei({ type: 'application/x-msdownload' }))).toThrow(UserFacingError)
    expect(() => pruefeKimAnhang(datei({ type: '' }))).toThrow(UserFacingError)
  })

  it('weist eine leere Datei ab', () => {
    expect(() => pruefeKimAnhang(datei({ arrayBuffer: new ArrayBuffer(0) }))).toThrow(/leer/)
  })

  it('weist eine Datei über 25 MB ab', () => {
    const zuGross = new Uint8Array(MAX_ATTACHMENT_BYTES + 1)
    zuGross.set([0x25, 0x50, 0x44, 0x46])
    expect(() => pruefeKimAnhang(datei({ arrayBuffer: zuGross.buffer }))).toThrow(/25 MB/)
  })

  it('erlaubt genau 25 MB', () => {
    const genau = new Uint8Array(MAX_ATTACHMENT_BYTES)
    genau.set([0x25, 0x50, 0x44, 0x46])
    expect(() => pruefeKimAnhang(datei({ arrayBuffer: genau.buffer }))).not.toThrow()
  })

  it('weist eine Datei ab, deren Inhalt nicht zum Typ passt', () => {
    expect(() => pruefeKimAnhang(datei({ type: 'application/pdf', arrayBuffer: HTML })))
      .toThrow(/passt nicht zum angegebenen Typ/)
  })

  it('deckt die dokumentierte Allowlist ab', () => {
    expect([...ERLAUBTE_ANHANG_MIME_TYPES]).toEqual([
      'application/pdf', 'image/jpeg', 'image/png', 'image/tiff',
      'text/plain', 'application/xml', 'text/xml',
    ])
  })
})

describe('virusScanPlaceholder', () => {
  it('behauptet NICHT, die Datei sei sauber', () => {
    const r = virusScanPlaceholder()
    expect(r.scanned).toBe(false)
    expect(r.reason).toMatch(/NICHT auf Schadsoftware geprüft/)
  })
})

// ═══════════════════════════════════════════════════════════════════
// uploadKimAttachment
// ═══════════════════════════════════════════════════════════════════

describe('uploadKimAttachment', () => {
  it('legt Datei und Metadaten an und protokolliert den Upload', async () => {
    const fake = erstelleFakeSupabase(uploadGeber, () => ({ data: { path: 'p' } }))
    await uploadKimAttachment(fake.client, {
      organizationId: ORG, messageId: MSG, actorId: ACTOR, datei: datei(),
    })

    const upload = fake.speicherAuf('upload')[0]
    expect(upload.bucket).toBe(KIM_ATTACHMENTS_BUCKET)
    expect(upload.pfad.startsWith(`${ORG}/${MSG}/`),
      'der Pfad trägt Mandant und Nachricht').toBe(true)
    expect((upload.optionen as Record<string, unknown>).upsert,
      'upsert würde eine fremde Datei überschreiben').toBe(false)

    const insert = fake.ersterAuf('kim_attachments', 'insert')?.payload as Record<string, unknown>
    expect(insert.organization_id).toBe(ORG)
    expect(insert.message_id).toBe(MSG)
    expect(insert.size_bytes).toBe(PDF.byteLength)
    expect(insert.checksum_sha256).toMatch(/^[0-9a-f]{64}$/)

    const audit = fake.ersterAuf('kim_audit_log', 'insert')?.payload as Record<string, unknown>
    expect(audit.aktion).toBe('anhang_hochgeladen')
  })

  it('prüft, dass die Nachricht zur Organisation gehört — vor jedem Schreibzugriff', async () => {
    const fake = erstelleFakeSupabase(uploadGeber, () => ({ data: { path: 'p' } }))
    await uploadKimAttachment(fake.client, { organizationId: ORG, messageId: MSG, datei: datei() })
    const pruefung = fake.ersterAuf('kim_messages')
    expect(hatOrgFence(pruefung, ORG)).toBe(true)
    expect(hatFilter(pruefung, 'eq', 'id', MSG)).toBe(true)
    expect(pruefung!.gesamtNr).toBe(0)
  })

  it('hängt NICHTS an die Nachricht eines fremden Mandanten', async () => {
    // admin ist der service_role-Client und umgeht RLS — ohne die Prüfung
    // ginge der Anhang mit der fremden Nachricht hinaus.
    const fake = erstelleFakeSupabase(() => ({ data: null }), () => ({ data: { path: 'p' } }))
    await expect(uploadKimAttachment(fake.client, {
      organizationId: FREMDE_ORG, messageId: MSG, datei: datei(),
    })).rejects.toMatchObject({ name: 'UserFacingError', status: 404 })

    expect(fake.speicherAuf('upload'), 'es darf nichts im Bucket landen').toHaveLength(0)
    expect(fake.ersterAuf('kim_attachments', 'insert')).toBeUndefined()
  })

  it('lädt eine als PDF deklarierte HTML-Datei gar nicht erst hoch', async () => {
    const fake = erstelleFakeSupabase(uploadGeber, () => ({ data: { path: 'p' } }))
    await expect(uploadKimAttachment(fake.client, {
      organizationId: ORG, messageId: MSG, datei: datei({ arrayBuffer: HTML }),
    })).rejects.toThrow(UserFacingError)
    expect(fake.speicherAuf('upload')).toHaveLength(0)
    expect(fake.aufrufe, 'die Prüfung läuft vor jeder Abfrage').toHaveLength(0)
  })

  it('räumt die hochgeladene Datei weg, wenn die Metadaten nicht gespeichert werden können', async () => {
    // Sonst bleibt eine verwaiste Datei im Bucket, die niemand mehr findet.
    const fake = erstelleFakeSupabase(
      (a: FakeAufruf) => {
        if (a.tabelle === 'kim_messages') return { data: { id: MSG } }
        if (a.tabelle === 'kim_attachments') return { data: null, error: { message: 'insert kaputt' } }
        return { data: null }
      },
      () => ({ data: { path: 'p' } }),
    )
    await expect(uploadKimAttachment(fake.client, {
      organizationId: ORG, messageId: MSG, datei: datei(),
    })).rejects.toThrow()
    expect(fake.speicherAuf('remove')).toHaveLength(1)
  })

  it('reicht eine Storage-Fehlermeldung nicht als UserFacingError durch', async () => {
    const fake = erstelleFakeSupabase(uploadGeber, () => ({ error: { message: 'bucket policy denied for role xyz' } }))
    const fehler = await uploadKimAttachment(fake.client, {
      organizationId: ORG, messageId: MSG, datei: datei(),
    }).catch(e => e)
    expect(fehler).toBeInstanceOf(Error)
    expect(fehler).not.toBeInstanceOf(UserFacingError)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Lesen
// ═══════════════════════════════════════════════════════════════════

describe('listKimAttachments', () => {
  const zeilen = [
    { id: 'a1', filename: 'a.pdf', storage_path: 'p/a.pdf', size_bytes: 10 },
    { id: 'a2', filename: 'b.pdf', storage_path: 'p/b.pdf', size_bytes: 20 },
  ]

  it('liest org-gefenced und liefert je Anhang eine signierte URL', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: zeilen }), () => ({ data: { signedUrl: 'https://x/sig' } }))
    const ergebnis = await listKimAttachments(fake.client, MSG, ORG)

    expect(ergebnis.map(a => a.signed_url)).toEqual(['https://x/sig', 'https://x/sig'])
    const a = fake.ersterAuf('kim_attachments')
    expect(hatOrgFence(a, ORG)).toBe(true)
    expect(hatFilter(a, 'eq', 'message_id', MSG)).toBe(true)
  })

  it('reicht die Ablauffrist an die signierte URL weiter', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [zeilen[0]] }), () => ({ data: { signedUrl: 'u' } }))
    await listKimAttachments(fake.client, MSG, ORG, 60)
    expect(fake.speicherAuf('createSignedUrl')[0].optionen).toBe(60)
  })

  it('macht aus einer fehlenden Datei keinen Totalausfall der Liste', async () => {
    // Vorher riss ein einziger fehlgeschlagener Signaturvorgang die ganze
    // Liste — auch die intakten Anhänge waren dann unerreichbar.
    let n = 0
    const fake = erstelleFakeSupabase(
      () => ({ data: zeilen }),
      () => (n++ === 0 ? { error: { message: 'Object not found' } } : { data: { signedUrl: 'https://x/sig' } }),
    )
    const ergebnis = await listKimAttachments(fake.client, MSG, ORG)
    expect(ergebnis).toHaveLength(2)
    expect(ergebnis[0].signed_url).toBeNull()
    expect(ergebnis[1].signed_url).toBe('https://x/sig')
  })

  it('liefert eine leere Liste, wenn es keine Anhänge gibt', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: null }))
    await expect(listKimAttachments(fake.client, MSG, ORG)).resolves.toEqual([])
  })
})

describe('downloadKimAttachmentBytes', () => {
  it('lädt aus dem KIM-Bucket über den gespeicherten Pfad', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: null }), () => ({ data: new Blob(['x']) }))
    await downloadKimAttachmentBytes(fake.client, { storage_path: 'p/a.pdf' } as never)
    const d = fake.speicherAuf('download')[0]
    expect(d.bucket).toBe(KIM_ATTACHMENTS_BUCKET)
    expect(d.pfad).toBe('p/a.pdf')
  })

  it('wirft, wenn die Datei fehlt — ein leerer Anhang darf nicht versendet werden', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: null }), () => ({ error: { message: 'not found' } }))
    await expect(downloadKimAttachmentBytes(fake.client, { storage_path: 'weg' } as never)).rejects.toThrow()
  })
})
