/**
 * Unterschriftsbild für PDFs (lib/signaturen/unterschrift-bild.ts)
 *
 * `service_signatures.signature_image` wird von der Native-App und vom
 * OCR-Weg befüllt. Leistungsnachweis-PDF und Rechnungspaket riefen darauf
 * ungeprüft `fetch(signatureImage)` auf — ein serverseitiger Abruf einer frei
 * wählbaren Adresse, ohne Zeit- und Größengrenze.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  bytesAusDataUrl,
  pruefeBildHerkunft,
  ladeUnterschriftsBild,
  MAX_BILD_BYTES,
} from '../../lib/signaturen/unterschrift-bild'

const STORAGE_HOST = 'projekt.supabase.co'

describe('pruefeBildHerkunft', () => {
  it('lässt den Speicher-Host dieses Projekts zu', () => {
    expect(pruefeBildHerkunft(`https://${STORAGE_HOST}/storage/v1/object/sign/x.png`, STORAGE_HOST).erlaubt).toBe(true)
  })

  it('sperrt jeden fremden Host', () => {
    expect(pruefeBildHerkunft('https://beispiel.test/bild.png', STORAGE_HOST).erlaubt).toBe(false)
    expect(pruefeBildHerkunft(`https://${STORAGE_HOST}.angreifer.test/x.png`, STORAGE_HOST).erlaubt).toBe(false)
  })

  it('sperrt interne Adressen', () => {
    // Der klassische SSRF-Fall: Cloud-Metadaten und localhost sind vom
    // Server aus erreichbar, vom Browser des Angreifers nicht.
    expect(pruefeBildHerkunft('http://169.254.169.254/latest/meta-data/', STORAGE_HOST).erlaubt).toBe(false)
    expect(pruefeBildHerkunft('http://localhost:3000/api/admin', STORAGE_HOST).erlaubt).toBe(false)
    expect(pruefeBildHerkunft('http://127.0.0.1/', STORAGE_HOST).erlaubt).toBe(false)
  })

  it('sperrt http, auch beim richtigen Host', () => {
    expect(pruefeBildHerkunft(`http://${STORAGE_HOST}/x.png`, STORAGE_HOST).erlaubt).toBe(false)
  })

  it('sperrt alles, wenn kein Speicher-Host konfiguriert ist (fail-closed)', () => {
    expect(pruefeBildHerkunft(`https://${STORAGE_HOST}/x.png`, null).erlaubt).toBe(false)
  })

  it('sperrt kaputte URLs', () => {
    expect(pruefeBildHerkunft('nicht mal eine url', STORAGE_HOST).erlaubt).toBe(false)
  })
})

describe('bytesAusDataUrl', () => {
  const png = 'data:image/png;base64,' + Buffer.from('PNG-Bytes').toString('base64')

  it('liest PNG und JPEG', () => {
    expect(bytesAusDataUrl(png)).toBeInstanceOf(Uint8Array)
    expect(bytesAusDataUrl('data:image/jpeg;base64,' + Buffer.from('x').toString('base64'))).not.toBeNull()
  })

  it('verwirft andere Typen', () => {
    expect(bytesAusDataUrl('data:text/html;base64,' + Buffer.from('<script>').toString('base64'))).toBeNull()
    expect(bytesAusDataUrl('data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64'))).toBeNull()
  })

  it('verwirft Nicht-Base64 und Leeres', () => {
    expect(bytesAusDataUrl('data:image/png,rohtext')).toBeNull()
    expect(bytesAusDataUrl('data:image/png;base64,')).toBeNull()
    expect(bytesAusDataUrl('data:image/png;base64')).toBeNull()
  })

  it('verwirft ein Bild über der Größengrenze', () => {
    const zuGross = 'data:image/png;base64,' + 'A'.repeat(Math.ceil((MAX_BILD_BYTES * 4) / 3) + 8)
    expect(bytesAusDataUrl(zuGross)).toBeNull()
  })
})

describe('ladeUnterschriftsBild', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('ruft für eine fremde URL gar nicht erst ab', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `https://${STORAGE_HOST}`)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await ladeUnterschriftsBild('https://beispiel.test/bild.png')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ruft die Storage-URL des Projekts mit Zeitlimit ab', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `https://${STORAGE_HOST}`)
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-length': '9' }),
      arrayBuffer: async () => new TextEncoder().encode('PNG-Bytes').buffer,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const bytes = await ladeUnterschriftsBild(`https://${STORAGE_HOST}/storage/v1/object/sign/x.png`)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const optionen = fetchMock.mock.calls[0][1] as { signal?: AbortSignal } | undefined
    expect(optionen?.signal).toBeInstanceOf(AbortSignal)
  })

  it('verwirft eine zu große Antwort', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `https://${STORAGE_HOST}`)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-length': String(MAX_BILD_BYTES + 1) }),
      arrayBuffer: async () => new ArrayBuffer(1),
    })))
    expect(await ladeUnterschriftsBild(`https://${STORAGE_HOST}/x.png`)).toBeNull()
  })

  it('gibt bei einem Netzfehler null zurück, statt zu werfen', async () => {
    // Ein fehlendes Unterschriftsbild darf das PDF nicht verhindern — es
    // fällt auf den Hinweis „Unterschrift liegt nicht digital vor" zurück.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `https://${STORAGE_HOST}`)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout') }))
    await expect(ladeUnterschriftsBild(`https://${STORAGE_HOST}/x.png`)).resolves.toBeNull()
  })

  it('kommt ohne Netz aus, wenn die Unterschrift als Data-URL vorliegt', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const bytes = await ladeUnterschriftsBild('data:image/png;base64,' + Buffer.from('x').toString('base64'))
    expect(bytes).not.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('verträgt leere Eingaben', async () => {
    expect(await ladeUnterschriftsBild(null)).toBeNull()
    expect(await ladeUnterschriftsBild('')).toBeNull()
    expect(await ladeUnterschriftsBild('   ')).toBeNull()
    expect(await ladeUnterschriftsBild('M. Meier')).toBeNull()
  })
})
