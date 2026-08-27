// ═══════════════════════════════════════════════════════════════════
// Unterschriftsbild für PDFs laden — eine Stelle, eine Regel
// ═══════════════════════════════════════════════════════════════════
//
// BEFUND
// Leistungsnachweis-PDF und Rechnungspaket hatten je eine eigene Kopie von
// `loadSignatureImageBytes`, und beide lauteten sinngemaess:
//
//     if (signatureImage.startsWith('http')) {
//       const res = await fetch(signatureImage)   // beliebige URL, kein Limit
//
// `service_signatures.signature_image` wird von der Native-App und vom
// OCR-Weg befuellt, also aus Daten, die von aussen kommen. Damit stand in
// zwei PDF-Erzeugern ein serverseitiger Abruf einer FREI WAEHLBAREN URL:
//
//   · `http://169.254.169.254/…` (Cloud-Metadaten), `http://localhost:…`
//     oder eine interne Adresse waeren vom Server aus erreichbar gewesen —
//     der Inhalt landet zwar nur als Bild im PDF, der Abruf selbst findet
//     aber statt (SSRF).
//   · Ohne Zeitlimit haengt die PDF-Erzeugung an einer nicht antwortenden
//     Adresse, bis die Serverless-Funktion abbricht. Ein einziger solcher
//     Datensatz legt den Monatsnachweis still.
//   · Ohne Groessengrenze zieht ein grosses Ziel den ganzen Speicher.
//
// REGEL
//  · `data:`-URLs: nur PNG/JPEG, hart begrenzt.
//  · `https:`-URLs: NUR der Supabase-Storage-Host dieses Projekts — dort und
//    nur dort liegen die Unterschriftsbilder.
//  · Zeitlimit und Groessengrenze in beiden Faellen.
//  · Nie werfen: ein fehlendes Bild darf das PDF nicht verhindern, es faellt
//    auf die Textzeile „Unterschrift liegt nicht digital vor" zurueck.
// ═══════════════════════════════════════════════════════════════════

import { logger } from '@/lib/logger'

const log = logger.child('unterschrift-bild')

/** 5 MB — eine Unterschrift ist ein paar Kilobyte gross. */
export const MAX_BILD_BYTES = 5 * 1024 * 1024

/** Abbruch nach 8 Sekunden; die PDF-Erzeugung darf nicht daran haengen. */
export const ABRUF_TIMEOUT_MS = 8000

const ERLAUBTE_DATA_TYPEN = ['image/png', 'image/jpeg', 'image/jpg']

/**
 * Host, von dem Unterschriftsbilder geladen werden duerfen — der
 * Supabase-Storage dieses Projekts. Ohne konfigurierte URL bleibt der
 * Netzabruf komplett gesperrt (fail-closed).
 */
export function erlaubterBildHost(): string | null {
  const roh = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!roh) return null
  try {
    return new URL(roh).host
  } catch {
    return null
  }
}

export interface HerkunftsBefund {
  erlaubt: boolean
  grund: string | null
}

/** Darf diese URL serverseitig abgerufen werden? */
export function pruefeBildHerkunft(url: string, erlaubterHost: string | null): HerkunftsBefund {
  let ziel: URL
  try {
    ziel = new URL(url)
  } catch {
    return { erlaubt: false, grund: 'keine gültige URL' }
  }
  if (ziel.protocol !== 'https:') {
    return { erlaubt: false, grund: `Protokoll ${ziel.protocol} ist nicht zugelassen (nur https)` }
  }
  if (!erlaubterHost) {
    return { erlaubt: false, grund: 'kein zugelassener Speicher-Host konfiguriert' }
  }
  if (ziel.host !== erlaubterHost) {
    return { erlaubt: false, grund: `Host ${ziel.host} ist nicht der Speicher dieses Projekts` }
  }
  return { erlaubt: true, grund: null }
}

/** Bytes aus einer `data:`-URL — nur PNG/JPEG, begrenzt. */
export function bytesAusDataUrl(dataUrl: string): Uint8Array | null {
  const kopfEnde = dataUrl.indexOf(',')
  if (kopfEnde === -1) return null
  const kopf = dataUrl.slice(5, kopfEnde).toLowerCase()
  const typ = kopf.split(';')[0]
  if (!ERLAUBTE_DATA_TYPEN.includes(typ)) {
    log.warn('Unterschriftsbild mit nicht zugelassenem Typ verworfen', { typ })
    return null
  }
  if (!kopf.includes('base64')) return null
  const base64 = dataUrl.slice(kopfEnde + 1)
  if (base64.trim() === '') return null
  // 4 Base64-Zeichen ≙ 3 Byte — vor dem Dekodieren pruefen, damit ein
  // riesiger String nicht erst allokiert wird.
  if ((base64.length * 3) / 4 > MAX_BILD_BYTES) {
    log.warn('Unterschriftsbild überschreitet die Größengrenze', { zeichen: base64.length })
    return null
  }
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'))
  return bytes.length > 0 ? bytes : null
}

/**
 * Unterschriftsbild laden — Data-URL oder Storage-URL dieses Projekts.
 * Gibt null zurueck, statt zu werfen.
 */
export async function ladeUnterschriftsBild(signatureImage: string | null | undefined): Promise<Uint8Array | null> {
  if (!signatureImage || typeof signatureImage !== 'string') return null
  const wert = signatureImage.trim()
  if (wert === '') return null

  if (wert.startsWith('data:')) return bytesAusDataUrl(wert)

  if (!/^https?:/i.test(wert)) return null

  const befund = pruefeBildHerkunft(wert, erlaubterBildHost())
  if (!befund.erlaubt) {
    log.warn('Unterschriftsbild von fremder Herkunft nicht geladen', { grund: befund.grund })
    return null
  }

  try {
    const res = await fetch(wert, { signal: AbortSignal.timeout(ABRUF_TIMEOUT_MS) })
    if (!res.ok) return null
    const laenge = Number(res.headers.get('content-length') ?? '0')
    if (laenge > MAX_BILD_BYTES) {
      log.warn('Unterschriftsbild überschreitet die Größengrenze', { laenge })
      return null
    }
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BILD_BYTES) {
      log.warn('Unterschriftsbild überschreitet die Größengrenze', { laenge: buf.byteLength })
      return null
    }
    return new Uint8Array(buf)
  } catch (err) {
    log.errorWithException('Unterschriftsbild konnte nicht geladen werden', err)
    return null
  }
}
