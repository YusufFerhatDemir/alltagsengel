// ═══════════════════════════════════════════════════════════════
// Zertifikatsverwaltung für das SECON-Abrechnungsverfahren.
//
// - Eigenes ITSG-Zertifikat (Absender, IK 460629986) aus PKCS#12
// - Empfänger-Zertifikate (Datenannahmestellen / Kassen) aus dem
//   öffentlichen ITSG-Trust-Center-Verzeichnis
//   (https://trustcenter-data.itsg.de — annahme-*.key Dateien,
//   konkatenierte DER-Zertifikate; Kap. 4.6 Anlage 16)
// - Cache in Supabase (Tabelle abrechnung_zertifikate, Dateien im
//   privaten Storage-Bucket "abrechnung")
//
// Nur serverseitig verwenden (API-Routen / Edge Functions).
// ═══════════════════════════════════════════════════════════════

import forge from 'node-forge'
import { createAdminClient } from '@/lib/supabase/admin'
import { ladeIdentitaet, ladeZertifikat, ikAusZertifikat, zertifikatFingerprint } from './secon'

export const ZERTIFIKAT_BUCKET = 'abrechnung'

/** Öffentliche Schlüsselverzeichnisse des ITSG Trust Centers.
 *  Reihenfolge = Priorität (aktuellste Schlüsselgeneration zuerst). */
const ITSG_VERZEICHNIS_URLS = [
  'https://trustcenter-data.itsg.de/dale/annahme-rsa4096.key',
  'https://trustcenter-data.itsg.de/dale/annahme-sha256.key',
]

export interface Zertifikat {
  ik_nummer: string
  typ: 'absender' | 'empfaenger'
  zertifikat_pem: string
  gueltig_ab: Date
  gueltig_bis: Date
  fingerprint: string
}

// ---------------------------------------------------------------
// Parsen / Prüfen
// ---------------------------------------------------------------

/** Wandelt ein forge-Zertifikat in unser Zertifikat-Objekt um. */
function zuZertifikat(cert: forge.pki.Certificate, typ: Zertifikat['typ']): Zertifikat {
  return {
    ik_nummer: ikAusZertifikat(cert),
    typ,
    zertifikat_pem: forge.pki.certificateToPem(cert),
    gueltig_ab: cert.validity.notBefore,
    gueltig_bis: cert.validity.notAfter,
    fingerprint: zertifikatFingerprint(cert),
  }
}

/**
 * Prüft ein eigenes Zertifikat (PKCS#12 mit Passwort oder X.509 PEM/DER).
 * Bei PKCS#12 wird zusätzlich verifiziert, dass der Private Key lesbar ist.
 */
export async function pruefeZertifikat(
  zertifikat: Buffer,
  passwort?: string
): Promise<{ gueltig: boolean; ablauf: Date; ik_nummer: string; fingerprint: string; fehler?: string }> {
  try {
    let cert: forge.pki.Certificate
    const text = zertifikat.toString('utf8')
    if (passwort !== undefined && !text.includes('-----BEGIN CERTIFICATE-----')) {
      cert = ladeIdentitaet(zertifikat, passwort).zertifikat
    } else {
      cert = ladeZertifikat(zertifikat)
    }
    const jetzt = new Date()
    const gueltig = jetzt >= cert.validity.notBefore && jetzt <= cert.validity.notAfter
    return {
      gueltig,
      ablauf: cert.validity.notAfter,
      ik_nummer: ikAusZertifikat(cert),
      fingerprint: zertifikatFingerprint(cert),
      ...(gueltig ? {} : { fehler: 'Zertifikat ist abgelaufen oder noch nicht gültig' }),
    }
  } catch (e: any) {
    return {
      gueltig: false,
      ablauf: new Date(0),
      ik_nummer: '',
      fingerprint: '',
      fehler: e?.message || String(e),
    }
  }
}

// ---------------------------------------------------------------
// ITSG-Verzeichnis: Empfänger-Zertifikate
// ---------------------------------------------------------------

/**
 * Zerlegt eine annahme-*.key Datei des ITSG Trust Centers in einzelne
 * X.509-Zertifikate. Die Dateien enthalten konkatenierte DER-Zertifikate
 * (teilweise auch Base64-Blöcke) — beides wird unterstützt.
 */
export function parseItsgVerzeichnis(daten: Buffer): forge.pki.Certificate[] {
  const zertifikate: forge.pki.Certificate[] = []

  // Variante 1: PEM-Blöcke
  const text = daten.toString('latin1')
  if (text.includes('-----BEGIN CERTIFICATE-----')) {
    const matches = text.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []
    for (const m of matches) {
      try { zertifikate.push(forge.pki.certificateFromPem(m)) } catch { /* skip */ }
    }
    if (zertifikate.length > 0) return zertifikate
  }

  // Variante 2: reines Base64 ohne PEM-Header (zeilenweise) → dekodieren
  let der = daten
  if (/^[A-Za-z0-9+/=\r\n\s]+$/.test(text) && !text.startsWith('0') && daten[0] !== 0x30) {
    try { der = Buffer.from(text.replace(/\s+/g, ''), 'base64') } catch { der = daten }
  }

  // Variante 3: konkatenierte DER-SEQUENCEs — Längen selbst parsen
  let offset = 0
  while (offset < der.length - 4) {
    if (der[offset] !== 0x30) { offset++; continue }
    let len = 0
    let headerLen = 2
    const lenByte = der[offset + 1]
    if (lenByte < 0x80) {
      len = lenByte
    } else {
      const numBytes = lenByte & 0x7f
      if (numBytes > 4 || offset + 2 + numBytes > der.length) { offset++; continue }
      len = 0
      for (let i = 0; i < numBytes; i++) len = (len << 8) | der[offset + 2 + i]
      headerLen = 2 + numBytes
    }
    const total = headerLen + len
    if (offset + total > der.length || len < 200) { offset++; continue }
    const slice = der.subarray(offset, offset + total)
    try {
      const cert = forge.pki.certificateFromAsn1(
        forge.asn1.fromDer(forge.util.createBuffer(slice.toString('binary')).getBytes())
      )
      zertifikate.push(cert)
      offset += total
    } catch {
      offset++
    }
  }
  return zertifikate
}

/**
 * Lädt das Empfänger-Zertifikat einer IK aus dem öffentlichen
 * ITSG-Verzeichnis. Ergebnis wird in Supabase gecacht
 * (Tabelle abrechnung_zertifikate).
 */
export async function ladeEmpfaengerZertifikat(
  empfaenger_ik: string,
  optionen?: { cacheIgnorieren?: boolean }
): Promise<Zertifikat> {
  const ik = empfaenger_ik.replace(/\D/g, '')
  if (!/^\d{9}$/.test(ik)) throw new Error(`Ungültige IK-Nummer: ${empfaenger_ik}`)

  const supabase = createAdminClient()

  // 1. Cache
  if (!optionen?.cacheIgnorieren) {
    const { data: cached } = await supabase
      .from('abrechnung_zertifikate')
      .select('ik_nummer, typ, zertifikat_pem, gueltig_ab, gueltig_bis, fingerprint')
      .eq('ik_nummer', ik)
      .eq('typ', 'empfaenger')
      .maybeSingle()
    if (cached?.zertifikat_pem && cached.gueltig_bis && new Date(cached.gueltig_bis) > new Date()) {
      return {
        ik_nummer: cached.ik_nummer,
        typ: 'empfaenger',
        zertifikat_pem: cached.zertifikat_pem,
        gueltig_ab: new Date(cached.gueltig_ab),
        gueltig_bis: new Date(cached.gueltig_bis),
        fingerprint: cached.fingerprint,
      }
    }
  }

  // 2. ITSG-Verzeichnis laden
  let kandidaten: forge.pki.Certificate[] = []
  let letzterFehler = ''
  for (const url of ITSG_VERZEICHNIS_URLS) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Alltagsengel-Abrechnung/1.0' } })
      if (!res.ok) { letzterFehler = `${url}: HTTP ${res.status}`; continue }
      const buf = Buffer.from(await res.arrayBuffer())
      const alle = parseItsgVerzeichnis(buf)
      kandidaten = alle.filter(c => ikAusZertifikat(c) === ik)
      if (kandidaten.length > 0) break
    } catch (e: any) {
      letzterFehler = `${url}: ${e?.message || e}`
    }
  }
  if (kandidaten.length === 0) {
    throw new Error(
      `Kein Zertifikat für IK ${ik} im ITSG-Verzeichnis gefunden` +
      (letzterFehler ? ` (${letzterFehler})` : '')
    )
  }

  // Neuestes gültiges Zertifikat wählen
  const jetzt = new Date()
  const gueltige = kandidaten.filter(c => c.validity.notAfter > jetzt)
  const beste = (gueltige.length > 0 ? gueltige : kandidaten)
    .sort((a, b) => b.validity.notAfter.getTime() - a.validity.notAfter.getTime())[0]

  const zert = zuZertifikat(beste, 'empfaenger')
  zert.ik_nummer = ik // ITSG-Subject kann Zusätze enthalten — IK normieren

  // 3. Cache aktualisieren
  await supabase.from('abrechnung_zertifikate').upsert(
    {
      ik_nummer: ik,
      typ: 'empfaenger',
      zertifikat_pem: zert.zertifikat_pem,
      gueltig_ab: zert.gueltig_ab.toISOString().slice(0, 10),
      gueltig_bis: zert.gueltig_bis.toISOString().slice(0, 10),
      fingerprint: zert.fingerprint,
    },
    { onConflict: 'ik_nummer,typ' }
  )

  return zert
}

// ---------------------------------------------------------------
// Eigenes Absender-Zertifikat (Storage + DB)
// ---------------------------------------------------------------

/**
 * Speichert das eigene ITSG-Zertifikat (PKCS#12) im privaten Bucket und
 * registriert die Metadaten. Das Passwort wird NICHT gespeichert —
 * es muss als Env-Variable SECON_ZERT_PASSWORT hinterlegt werden.
 */
export async function speichereAbsenderZertifikat(
  p12: Buffer,
  passwort: string
): Promise<Zertifikat> {
  const pruefung = await pruefeZertifikat(p12, passwort)
  if (!pruefung.fingerprint) {
    throw new Error(`Zertifikat konnte nicht gelesen werden: ${pruefung.fehler}`)
  }

  const supabase = createAdminClient()
  const pfad = `zertifikate/absender-${pruefung.ik_nummer || 'unbekannt'}.p12`

  const { error: upErr } = await supabase.storage
    .from(ZERTIFIKAT_BUCKET)
    .upload(pfad, p12, { contentType: 'application/x-pkcs12', upsert: true })
  if (upErr) throw new Error(`Storage-Upload fehlgeschlagen: ${upErr.message}`)

  const ident = ladeIdentitaet(p12, passwort)
  const zert = zuZertifikat(ident.zertifikat, 'absender')

  const { error: dbErr } = await supabase.from('abrechnung_zertifikate').upsert(
    {
      ik_nummer: zert.ik_nummer,
      typ: 'absender',
      zertifikat_url: pfad,
      zertifikat_pem: zert.zertifikat_pem,
      gueltig_ab: zert.gueltig_ab.toISOString().slice(0, 10),
      gueltig_bis: zert.gueltig_bis.toISOString().slice(0, 10),
      fingerprint: zert.fingerprint,
    },
    { onConflict: 'ik_nummer,typ' }
  )
  if (dbErr) throw new Error(`DB-Update fehlgeschlagen: ${dbErr.message}`)

  return zert
}

/**
 * Lädt das eigene Zertifikat (PKCS#12) aus dem privaten Bucket.
 * Passwort kommt aus process.env.SECON_ZERT_PASSWORT.
 */
export async function ladeAbsenderZertifikat(
  absender_ik: string
): Promise<{ p12: Buffer; passwort: string }> {
  const passwort = process.env.SECON_ZERT_PASSWORT
  if (!passwort) {
    throw new Error('SECON_ZERT_PASSWORT ist nicht als Env-Variable gesetzt')
  }
  const supabase = createAdminClient()
  const { data: meta, error } = await supabase
    .from('abrechnung_zertifikate')
    .select('zertifikat_url')
    .eq('ik_nummer', absender_ik)
    .eq('typ', 'absender')
    .maybeSingle()
  if (error || !meta?.zertifikat_url) {
    throw new Error(`Kein Absender-Zertifikat für IK ${absender_ik} hinterlegt`)
  }
  const { data: datei, error: dlErr } = await supabase.storage
    .from(ZERTIFIKAT_BUCKET)
    .download(meta.zertifikat_url)
  if (dlErr || !datei) {
    throw new Error(`Zertifikat-Download fehlgeschlagen: ${dlErr?.message}`)
  }
  return { p12: Buffer.from(await datei.arrayBuffer()), passwort }
}

/** Ablauf-Warnung: Tage bis zum Ablauf des eigenen Zertifikats. */
export async function zertifikatAblaufTage(absender_ik: string): Promise<number | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('abrechnung_zertifikate')
    .select('gueltig_bis')
    .eq('ik_nummer', absender_ik)
    .eq('typ', 'absender')
    .maybeSingle()
  if (!data?.gueltig_bis) return null
  return Math.floor((new Date(data.gueltig_bis).getTime() - Date.now()) / 86_400_000)
}
