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
import { datumBerlin, heuteBerlin } from '@/lib/utils/timezone';

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
  optionen?: { cacheIgnorieren?: boolean; organizationId?: string }
): Promise<Zertifikat> {
  const ik = empfaenger_ik.replace(/\D/g, '')
  if (!/^\d{9}$/.test(ik)) throw new Error(`Ungültige IK-Nummer: ${empfaenger_ik}`)

  const supabase = createAdminClient()
  const orgId = optionen?.organizationId ?? null

  // 1. Cache — mandantengetrennt.
  if (!optionen?.cacheIgnorieren) {
    let cacheQuery = supabase
      .from('abrechnung_zertifikate')
      .select('ik_nummer, typ, zertifikat_pem, gueltig_ab, gueltig_bis, fingerprint')
      .eq('ik_nummer', ik)
      .eq('typ', 'empfaenger')
    cacheQuery = orgId
      ? cacheQuery.eq('organization_id', orgId)
      : cacheQuery.is('organization_id', null)
    const { data: cached } = await cacheQuery
      .order('gueltig_bis', { ascending: false })
      .limit(1)
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
  await schreibeZertifikatZeile(supabase, orgId, {
    ik_nummer: ik,
    typ: 'empfaenger',
    zertifikat_pem: zert.zertifikat_pem,
    gueltig_ab: datumBerlin(zert.gueltig_ab),
    gueltig_bis: datumBerlin(zert.gueltig_bis),
    fingerprint: zert.fingerprint,
  })

  return zert
}

/**
 * Schreibt eine Zertifikatszeile ohne `upsert`.
 *
 * Bewusst select-then-write statt `upsert(..., { onConflict: 'ik_nummer,typ' })`:
 * auf der Produktionsdatenbank existiert kein Unique-Constraint über
 * `(ik_nummer, typ)` — ein `onConflict` darauf schlaegt zur Laufzeit fehl
 * (42P10). Zusaetzlich waere ein solcher Constraint mandantenblind: zwei
 * Organisationen mit derselben Empfaenger-IK wuerden sich gegenseitig den
 * Cache-Eintrag ueberschreiben.
 *
 * Der Schluessel ist deshalb `(organization_id, ik_nummer, typ, fingerprint)`.
 * Ein neuer Fingerprint erzeugt eine NEUE Zeile — das ist die Grundlage der
 * Zertifikatsrotation: das alte Zertifikat bleibt bis zu seinem Ablauf
 * lesbar, waehrend das neue bereits hinterlegt ist.
 */
async function schreibeZertifikatZeile(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string | null,
  zeile: {
    ik_nummer: string
    typ: 'absender' | 'empfaenger'
    zertifikat_pem: string
    gueltig_ab: string
    gueltig_bis: string
    fingerprint: string
    zertifikat_url?: string
  }
): Promise<void> {
  let vorhandenQuery = supabase
    .from('abrechnung_zertifikate')
    .select('id')
    .eq('ik_nummer', zeile.ik_nummer)
    .eq('typ', zeile.typ)
    .eq('fingerprint', zeile.fingerprint)
  vorhandenQuery = organizationId
    ? vorhandenQuery.eq('organization_id', organizationId)
    : vorhandenQuery.is('organization_id', null)

  const { data: vorhanden } = await vorhandenQuery.limit(1).maybeSingle()

  if (vorhanden) {
    const { error } = await supabase
      .from('abrechnung_zertifikate')
      .update({ ...zeile, updated_at: new Date().toISOString() })
      .eq('id', vorhanden.id)
    if (error) throw new Error(`Zertifikat konnte nicht aktualisiert werden: ${error.message}`)
    return
  }

  const { error } = await supabase
    .from('abrechnung_zertifikate')
    .insert({ ...zeile, organization_id: organizationId })
  if (error) throw new Error(`Zertifikat konnte nicht gespeichert werden: ${error.message}`)
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
  passwort: string,
  organizationId: string
): Promise<Zertifikat> {
  if (!organizationId) {
    throw new Error('organizationId ist Pflicht — ein Zertifikat ohne Mandantenzuordnung waere fuer alle Organisationen sichtbar')
  }

  const pruefung = await pruefeZertifikat(p12, passwort)
  if (!pruefung.fingerprint) {
    throw new Error(`Zertifikat konnte nicht gelesen werden: ${pruefung.fehler}`)
  }

  const supabase = createAdminClient()
  const ident = ladeIdentitaet(p12, passwort)
  const zert = zuZertifikat(ident.zertifikat, 'absender')

  // Pfad enthaelt Organisation UND Fingerprint: pro Mandant getrennt, und
  // eine Rotation ueberschreibt das noch gueltige Vorgaengerzertifikat nicht.
  const pfad = `zertifikate/${organizationId}/absender-${zert.ik_nummer || 'unbekannt'}-${zert.fingerprint.slice(0, 16)}.p12`

  const { error: upErr } = await supabase.storage
    .from(ZERTIFIKAT_BUCKET)
    .upload(pfad, p12, { contentType: 'application/x-pkcs12', upsert: true })
  if (upErr) throw new Error(`Storage-Upload fehlgeschlagen: ${upErr.message}`)

  await schreibeZertifikatZeile(supabase, organizationId, {
    ik_nummer: zert.ik_nummer,
    typ: 'absender',
    zertifikat_url: pfad,
    zertifikat_pem: zert.zertifikat_pem,
    gueltig_ab: datumBerlin(zert.gueltig_ab),
    gueltig_bis: datumBerlin(zert.gueltig_bis),
    fingerprint: zert.fingerprint,
  })

  return zert
}

/**
 * Lädt das eigene Zertifikat (PKCS#12) aus dem privaten Bucket.
 * Passwort kommt aus process.env.SECON_ZERT_PASSWORT.
 */
export async function ladeAbsenderZertifikat(
  absender_ik: string,
  organizationId: string
): Promise<{ p12: Buffer; passwort: string }> {
  const passwort = process.env.SECON_ZERT_PASSWORT
  if (!passwort) {
    throw new Error('SECON_ZERT_PASSWORT ist nicht als Env-Variable gesetzt')
  }
  if (!organizationId) {
    throw new Error('organizationId ist Pflicht — sonst koennte das Zertifikat einer fremden Organisation geladen werden')
  }
  const supabase = createAdminClient()

  // Rotation: es kann mehrere Zeilen geben (altes + neues Zertifikat).
  // Genommen wird das aktuell gueltige mit dem spaetesten Ablaufdatum.
  const heute = heuteBerlin()
  const { data: meta, error } = await supabase
    .from('abrechnung_zertifikate')
    .select('zertifikat_url')
    .eq('organization_id', organizationId)
    .eq('ik_nummer', absender_ik)
    .eq('typ', 'absender')
    .gte('gueltig_bis', heute)
    .order('gueltig_bis', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !meta?.zertifikat_url) {
    throw new Error(`Kein gueltiges Absender-Zertifikat für IK ${absender_ik} hinterlegt`)
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
export async function zertifikatAblaufTage(
  absender_ik: string,
  organizationId: string
): Promise<number | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('abrechnung_zertifikate')
    .select('gueltig_bis')
    .eq('organization_id', organizationId)
    .eq('ik_nummer', absender_ik)
    .eq('typ', 'absender')
    .order('gueltig_bis', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.gueltig_bis) return null
  return tageBis(data.gueltig_bis)
}

// ---------------------------------------------------------------
// Zertifikatsstatus (Ampel, Ablaufwarnung, Rotation)
// ---------------------------------------------------------------

/** Warnschwelle: ab hier gilt ein Zertifikat als "laeuft demnaechst ab". */
export const ABLAUF_WARNUNG_TAGE = 60

export type ZertifikatAmpel = 'gruen' | 'gelb' | 'rot'

export interface ZertifikatStatus {
  id: string
  ik_nummer: string
  typ: 'absender' | 'empfaenger'
  fingerprint: string
  gueltig_ab: string | null
  gueltig_bis: string | null
  tage_bis_ablauf: number | null
  /** Genau eine Zeile je (ik, typ) ist aktiv: die gueltige mit spaetestem Ablauf. */
  aktiv: boolean
  ampel: ZertifikatAmpel
  hinweis: string | null
}

export function tageBis(datum: string, jetzt: Date = new Date()): number {
  const ziel = new Date(`${datum.slice(0, 10)}T00:00:00.000Z`).getTime()
  const heute = new Date(`${datumBerlin(jetzt)}T00:00:00.000Z`).getTime()
  return Math.round((ziel - heute) / 86_400_000)
}

export function bewerteZertifikat(
  gueltigBis: string | null,
  jetzt: Date = new Date()
): { ampel: ZertifikatAmpel; tage: number | null; hinweis: string | null } {
  if (!gueltigBis) {
    return { ampel: 'rot', tage: null, hinweis: 'Kein Ablaufdatum hinterlegt' }
  }
  const tage = tageBis(gueltigBis, jetzt)
  if (tage < 0) {
    return { ampel: 'rot', tage, hinweis: `Abgelaufen seit ${Math.abs(tage)} Tag(en) — beim ITSG Trust Center erneuern` }
  }
  if (tage <= ABLAUF_WARNUNG_TAGE) {
    return { ampel: 'gelb', tage, hinweis: `Laeuft in ${tage} Tag(en) ab — Erneuerung beim ITSG Trust Center anstossen` }
  }
  return { ampel: 'gruen', tage, hinweis: null }
}

/**
 * Alle Zertifikate einer Organisation mit Ampel, Ablauffrist und
 * Aktiv-Kennzeichnung. Liefert bewusst KEIN `zertifikat_pem` und keinen
 * Storage-Pfad — die Ansicht braucht beides nicht, und beides gehoert
 * nicht in eine API-Antwort.
 */
export async function ladeZertifikatsStatus(
  organizationId: string,
  jetzt: Date = new Date()
): Promise<ZertifikatStatus[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('abrechnung_zertifikate')
    .select('id, ik_nummer, typ, fingerprint, gueltig_ab, gueltig_bis')
    .eq('organization_id', organizationId)
    .order('gueltig_bis', { ascending: false })

  if (error) throw new Error(`Zertifikatsstatus konnte nicht geladen werden: ${error.message}`)

  const heuteIso = datumBerlin(jetzt)
  const aktivGesehen = new Set<string>()

  return (data ?? []).map((z) => {
    const bewertung = bewerteZertifikat(z.gueltig_bis, jetzt)
    const schluessel = `${z.ik_nummer}|${z.typ}`
    // Sortiert nach gueltig_bis DESC: die erste noch gueltige Zeile je
    // (ik, typ) ist die aktive, alle weiteren sind Rotationshistorie.
    const nochGueltig = !!z.gueltig_bis && z.gueltig_bis >= heuteIso
    const aktiv = nochGueltig && !aktivGesehen.has(schluessel)
    if (aktiv) aktivGesehen.add(schluessel)

    return {
      id: z.id,
      ik_nummer: z.ik_nummer,
      typ: z.typ,
      fingerprint: z.fingerprint,
      gueltig_ab: z.gueltig_ab,
      gueltig_bis: z.gueltig_bis,
      tage_bis_ablauf: bewertung.tage,
      aktiv,
      ampel: aktiv ? bewertung.ampel : nochGueltig ? 'gruen' : 'rot',
      hinweis: aktiv ? bewertung.hinweis : nochGueltig ? 'Ersatzzertifikat (Rotation)' : 'Historisch — abgelaufen',
    }
  })
}
