// ═══════════════════════════════════════════════════════════════
// Tests: Fotodokumentation — Upload-Validierung, Pfad-Mandantentrennung,
//        Aufräumen bei fehlgeschlagenem Metadaten-Insert, Signed URLs
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { uploadWoundPhoto, listWoundPhotos, MAX_FOTO_BYTES } from '../fotos'

function datei(overrides: Partial<{ name: string; type: string; bytes: number }> = {}) {
  const bytes = overrides.bytes ?? 100
  return {
    name: overrides.name ?? 'foto.jpg',
    type: overrides.type ?? 'image/jpeg',
    arrayBuffer: new ArrayBuffer(bytes),
  }
}

function fakeAdmin(opts: {
  uploadError?: { message: string } | null
  insertError?: { message: string } | null
  insertData?: Record<string, unknown> | null
} = {}) {
  const uploads: Array<{ path: string; bytes: number; contentType: string }> = []
  const removed: string[][] = []
  const inserts: Array<Record<string, unknown>> = []

  const admin = {
    storage: {
      from: () => ({
        upload: async (path: string, buf: ArrayBuffer, options: { contentType: string }) => {
          uploads.push({ path, bytes: buf.byteLength, contentType: options.contentType })
          return { error: opts.uploadError ?? null }
        },
        remove: async (paths: string[]) => {
          removed.push(paths)
          return { error: null }
        },
      }),
    },
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        inserts.push(payload)
        return {
          select: () => ({
            single: async () => ({
              data: opts.insertError ? null : (opts.insertData ?? { id: 'p-1', ...payload }),
              error: opts.insertError ?? null,
            }),
          }),
        }
      },
    }),
  }
  return { admin: admin as never, uploads, removed, inserts }
}

const basis = { organizationId: 'org-1', woundId: 'w-1', aufgenommenVon: 'user-1' } as const

test('uploadWoundPhoto lehnt nicht erlaubte Dateitypen ab', async () => {
  const { admin } = fakeAdmin()
  await assert.rejects(
    () => uploadWoundPhoto(admin, { ...basis, datei: datei({ type: 'application/pdf' }) }),
    /Dateityp "application\/pdf" nicht erlaubt/,
  )
})

test('uploadWoundPhoto lehnt leere Dateien ab', async () => {
  const { admin, uploads } = fakeAdmin()
  await assert.rejects(
    () => uploadWoundPhoto(admin, { ...basis, datei: datei({ bytes: 0 }) }),
    /Die Datei ist leer/,
  )
  assert.equal(uploads.length, 0, 'darf vor dem Upload ablehnen')
})

test('uploadWoundPhoto lehnt Dateien über 10 MB ab', async () => {
  const { admin, uploads } = fakeAdmin()
  await assert.rejects(
    () => uploadWoundPhoto(admin, { ...basis, datei: datei({ bytes: MAX_FOTO_BYTES + 1 }) }),
    /größer als 10 MB/,
  )
  assert.equal(uploads.length, 0)
})

test('uploadWoundPhoto legt den Dateipfad unter organizationId/woundId ab (Mandantentrennung im Storage)', async () => {
  const { admin, uploads, inserts } = fakeAdmin()
  await uploadWoundPhoto(admin, { ...basis, organizationId: 'org-42', woundId: 'w-7', datei: datei() })
  assert.match(uploads[0].path, /^org-42\/w-7\//)
  assert.equal(inserts[0].organization_id, 'org-42')
  assert.equal(inserts[0].wound_id, 'w-7')
})

test('uploadWoundPhoto entfernt die hochgeladene Datei, wenn der Metadaten-Insert fehlschlägt', async () => {
  const { admin, removed, uploads } = fakeAdmin({ insertError: { message: 'db down' } })
  await assert.rejects(
    () => uploadWoundPhoto(admin, { ...basis, datei: datei() }),
    /Foto-Metadaten konnten nicht gespeichert werden/,
  )
  assert.equal(removed.length, 1)
  assert.deepEqual(removed[0], [uploads[0].path])
})

test('uploadWoundPhoto wirft bei fehlgeschlagenem Storage-Upload, ohne einen Insert zu versuchen', async () => {
  const { admin, inserts } = fakeAdmin({ uploadError: { message: 'bucket voll' } })
  await assert.rejects(
    () => uploadWoundPhoto(admin, { ...basis, datei: datei() }),
    /Foto-Upload fehlgeschlagen/,
  )
  assert.equal(inserts.length, 0)
})

function fakeListAdmin(fotos: Array<Record<string, unknown>>, signResult: (path: string) => { url?: string; error?: { message: string } }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: async () => ({ data: fotos, error: null }),
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => {
          const r = signResult(path)
          return { data: r.url ? { signedUrl: r.url } : null, error: r.error ?? null }
        },
      }),
    },
  } as never
}

test('listWoundPhotos hängt signierte URLs an', async () => {
  const admin = fakeListAdmin(
    [{ id: 'p-1', bucket: 'wound-photos', dateipfad: 'org-1/w-1/foto.jpg', dateiname: 'foto.jpg' }],
    () => ({ url: 'https://signed.example/foto.jpg' }),
  )
  const fotos = await listWoundPhotos(admin, 'w-1', 'org-1')
  assert.equal(fotos[0].signed_url, 'https://signed.example/foto.jpg')
})

test('listWoundPhotos wirft, wenn eine signierte URL nicht erstellt werden kann', async () => {
  const admin = fakeListAdmin(
    [{ id: 'p-1', bucket: 'wound-photos', dateipfad: 'org-1/w-1/foto.jpg', dateiname: 'foto.jpg' }],
    () => ({ error: { message: 'not found' } }),
  )
  await assert.rejects(
    () => listWoundPhotos(admin, 'w-1', 'org-1'),
    /Signierte URL für foto\.jpg konnte nicht erstellt werden/,
  )
})
