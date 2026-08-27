// ═══════════════════════════════════════════════════════════════
// Tests: Fotodokumentation — MIME-Whitelist + Magic-Bytes,
//        Größenlimit, Sperr-Logik, mandantensicherer Storage-Pfad,
//        Aufräumen bei fehlgeschlagenem Metadaten-Insert, Signed URLs
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { erstelleFakeSupabase } from '@/__tests__/helpers/supabase-fake'
import { uploadWoundPhoto, listWoundPhotos, ERLAUBTE_FOTO_MIME_TYPES, MAX_FOTO_BYTES, type UploadWoundPhotoParams } from '../fotos'

const GUELTIGE_BEISPIELE: Record<(typeof ERLAUBTE_FOTO_MIME_TYPES)[number], ArrayBuffer> = {
  'image/jpeg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).buffer,
  'image/png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer,
  'image/webp': new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]).buffer,
  'image/heic': new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]).buffer,
}

function basisParams(overrides: Partial<UploadWoundPhotoParams> = {}): UploadWoundPhotoParams {
  return {
    organizationId: 'org-1',
    woundId: 'w-1',
    wundStatus: 'aktiv',
    aufgenommenVon: 'user-1',
    datei: { name: 'foto.jpg', type: 'image/jpeg', arrayBuffer: GUELTIGE_BEISPIELE['image/jpeg'] },
    ...overrides,
  }
}

function fakeMitErfolg(opts: {
  uploadError?: { message: string } | null
  insertError?: { message: string } | null
} = {}) {
  return erstelleFakeSupabase(
    aufruf => {
      if (aufruf.tabelle === 'wound_photos' && aufruf.operation === 'insert') {
        return opts.insertError
          ? { data: null, error: opts.insertError }
          : { data: { id: 'p-1', ...(aufruf.payload as object) } }
      }
      return undefined
    },
    speicherAufruf => {
      if (speicherAufruf.operation === 'upload') return { data: { path: 'irrelevant' }, error: opts.uploadError ?? null }
      return undefined
    },
  )
}

test('uploadWoundPhoto akzeptiert alle erlaubten Bild-Typen mit passenden Magic-Bytes', async () => {
  for (const mime of ERLAUBTE_FOTO_MIME_TYPES) {
    const fake = fakeMitErfolg()
    const foto = await uploadWoundPhoto(fake.client, basisParams({
      datei: { name: 'foto', type: mime, arrayBuffer: GUELTIGE_BEISPIELE[mime] },
    }))
    assert.equal(foto.mime_type, mime)
  }
})

test('uploadWoundPhoto blockt einen nicht erlaubten MIME-Type', async () => {
  const fake = fakeMitErfolg()
  await assert.rejects(
    () => uploadWoundPhoto(fake.client, basisParams({
      datei: { name: 'x.gif', type: 'image/gif', arrayBuffer: GUELTIGE_BEISPIELE['image/jpeg'] },
    })),
    /nicht erlaubt/,
  )
  assert.equal(fake.speicherAuf('upload').length, 0)
})

test('uploadWoundPhoto blockt Dateiinhalt, der nicht zum behaupteten MIME-Type passt', async () => {
  const fake = fakeMitErfolg()
  await assert.rejects(
    () => uploadWoundPhoto(fake.client, basisParams({
      datei: { name: 'x.jpg', type: 'image/jpeg', arrayBuffer: GUELTIGE_BEISPIELE['image/png'] },
    })),
    /Dateiinhalt/,
  )
  assert.equal(fake.speicherAuf('upload').length, 0, 'darf bei Signatur-Mismatch nicht in den Bucket hochladen')
})

test('uploadWoundPhoto blockt leere Dateien und Überschreitung der Maximalgröße', async () => {
  const fake = fakeMitErfolg()
  await assert.rejects(
    () => uploadWoundPhoto(fake.client, basisParams({
      datei: { name: 'x.jpg', type: 'image/jpeg', arrayBuffer: new ArrayBuffer(0) },
    })),
    /leer/,
  )

  const zuGross = new Uint8Array(MAX_FOTO_BYTES + 1)
  zuGross.set(new Uint8Array(GUELTIGE_BEISPIELE['image/jpeg']))
  await assert.rejects(
    () => uploadWoundPhoto(fake.client, basisParams({
      datei: { name: 'x.jpg', type: 'image/jpeg', arrayBuffer: zuGross.buffer },
    })),
    /10 MB/,
  )
})

test('uploadWoundPhoto blockt neue Fotos bei abgeheilter Wunde', async () => {
  const fake = fakeMitErfolg()
  await assert.rejects(
    () => uploadWoundPhoto(fake.client, basisParams({ wundStatus: 'abgeheilt' })),
    /abgeheilt/,
  )
  assert.equal(fake.speicherAuf('upload').length, 0)
})

test('uploadWoundPhoto blockt einen Aufnahmezeitpunkt in der Zukunft', async () => {
  const fake = fakeMitErfolg()
  const inZukunft = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  await assert.rejects(
    () => uploadWoundPhoto(fake.client, basisParams({ aufgenommenAm: inZukunft })),
    /Zukunft/,
  )
})

test('uploadWoundPhoto legt den Storage-Pfad mandantensicher aus organizationId/woundId an — kein Path-Traversal über den Dateinamen', async () => {
  const fake = fakeMitErfolg()
  await uploadWoundPhoto(fake.client, basisParams({
    organizationId: 'org-42', woundId: 'w-7',
    datei: { name: '../../../etc/passwd.jpg', type: 'image/jpeg', arrayBuffer: GUELTIGE_BEISPIELE['image/jpeg'] },
  }))
  const upload = fake.speicherAuf('upload')[0]
  // Entscheidend ist nicht die Textform ".." (harmlos ohne "/"), sondern dass
  // der sanitizierte Dateiname KEINEN zusätzlichen Pfadseparator einschleust —
  // sonst könnte ein präparierter Name aus dem org/wound-Präfix ausbrechen.
  const segmente = upload.pfad.split('/')
  assert.equal(segmente.length, 3, `Pfad darf nur org/wound/dateiname enthalten, war: ${upload.pfad}`)
  assert.equal(segmente[0], 'org-42')
  assert.equal(segmente[1], 'w-7')

  const insert = fake.ersterAuf('wound_photos', 'insert')
  assert.equal((insert?.payload as { organization_id: string }).organization_id, 'org-42')
  assert.equal((insert?.payload as { wound_id: string }).wound_id, 'w-7')
})

test('uploadWoundPhoto entfernt die hochgeladene Datei, wenn der Metadaten-Insert fehlschlägt', async () => {
  const fake = fakeMitErfolg({ insertError: { message: 'db down' } })
  await assert.rejects(
    () => uploadWoundPhoto(fake.client, basisParams()),
    /Foto-Metadaten konnten nicht gespeichert werden/,
  )
  const entfernt = fake.speicherAuf('remove')
  assert.equal(entfernt.length, 1)
  assert.equal(entfernt[0].pfad, fake.speicherAuf('upload')[0].pfad)
})

test('uploadWoundPhoto wirft bei fehlgeschlagenem Storage-Upload, ohne einen Insert zu versuchen', async () => {
  const fake = fakeMitErfolg({ uploadError: { message: 'bucket voll' } })
  await assert.rejects(
    () => uploadWoundPhoto(fake.client, basisParams()),
    /Foto-Upload fehlgeschlagen/,
  )
  assert.equal(fake.auf('wound_photos').length, 0)
})

function fakeListMitFotos(fotos: Array<Record<string, unknown>>, signResult: (pfad: string) => { url?: string; error?: { message: string } }) {
  return erstelleFakeSupabase(
    aufruf => (aufruf.tabelle === 'wound_photos' ? { data: fotos } : undefined),
    speicherAufruf => {
      if (speicherAufruf.operation !== 'createSignedUrl') return undefined
      const r = signResult(speicherAufruf.pfad)
      return r.url ? { data: { signedUrl: r.url } } : { data: null, error: r.error ?? null }
    },
  )
}

test('listWoundPhotos hängt signierte URLs an', async () => {
  const fake = fakeListMitFotos(
    [{ id: 'p-1', bucket: 'wound-photos', dateipfad: 'org-1/w-1/foto.jpg', dateiname: 'foto.jpg' }],
    () => ({ url: 'https://signed.example/foto.jpg' }),
  )
  const fotos = await listWoundPhotos(fake.client, 'w-1', 'org-1')
  assert.equal(fotos[0].signed_url, 'https://signed.example/foto.jpg')
})

test('listWoundPhotos wirft, wenn eine signierte URL nicht erstellt werden kann', async () => {
  const fake = fakeListMitFotos(
    [{ id: 'p-1', bucket: 'wound-photos', dateipfad: 'org-1/w-1/foto.jpg', dateiname: 'foto.jpg' }],
    () => ({ error: { message: 'not found' } }),
  )
  await assert.rejects(
    () => listWoundPhotos(fake.client, 'w-1', 'org-1'),
    /Signierte URL für foto\.jpg konnte nicht erstellt werden/,
  )
})
