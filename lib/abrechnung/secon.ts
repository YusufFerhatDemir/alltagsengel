// ═══════════════════════════════════════════════════════════════
// SECON — Security Container nach Anlage 16 der Technischen
// Anlagen zum GKV-Datenaustausch (Security Schnittstelle SECON).
//
// Reine TypeScript-Implementierung (node-forge), ohne Java.
// Verfahren (wie DieTechniker/secon-tool, BITMARCK fs2-secon):
//   Versand:   Signieren (CMS SignedData, RSASSA-PSS/SHA-256)
//              → optional Komprimieren (CMS CompressedData, zlib)
//              → Verschlüsseln (CMS EnvelopedData, AES-256-CBC,
//                Schlüsseltransport RSAES-OAEP/SHA-256)
//   Empfang:   Entschlüsseln → Dekomprimieren → Signatur prüfen
//
// Zertifikate: ITSG-Trust-Center X.509, IK-Nummer im Subject
// (OU=IK123456789). Nur serverseitig verwenden (Node runtime)!
// ═══════════════════════════════════════════════════════════════

import forge from 'node-forge'
import zlib from 'zlib'
import { logger } from '@/lib/logger'
const log = logger.child('abrechnung')

// ---------------------------------------------------------------
// OIDs (CMS / RFC 5652, RFC 3274, RFC 4056, RFC 3560)
// ---------------------------------------------------------------
const OID = {
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  envelopedData: '1.2.840.113549.1.7.3',
  compressedData: '1.2.840.113549.1.9.16.1.9',
  algZlib: '1.2.840.113549.1.9.16.3.8',
  sha256: '2.16.840.1.101.3.4.2.1',
  sha1: '1.3.14.3.2.26',
  rsaEncryption: '1.2.840.113549.1.1.1',
  sha256WithRsa: '1.2.840.113549.1.1.11',
  rsassaPss: '1.2.840.113549.1.1.10',
  rsaesOaep: '1.2.840.113549.1.1.7',
  mgf1: '1.2.840.113549.1.1.8',
  pSpecified: '1.2.840.113549.1.1.9',
  aes256Cbc: '2.16.840.1.101.3.4.1.42',
  attrContentType: '1.2.840.113549.1.9.3',
  attrMessageDigest: '1.2.840.113549.1.9.4',
  attrSigningTime: '1.2.840.113549.1.9.5',
}

const asn1 = forge.asn1
const { Class, Type } = asn1

export interface SECONConfig {
  absender_ik: string
  /** PKCS#12 (.p12) oder PEM-Bundle (Zertifikat + Private Key) */
  absender_zertifikat: Buffer
  absender_passwort: string
  /** X.509-Zertifikat des Empfängers (PEM oder DER) */
  empfaenger_zertifikat: Buffer
  /** CMS CompressedData-Schicht einfügen (Standard: true) */
  komprimieren?: boolean
}

export interface SignaturErgebnis {
  gueltig: boolean
  absender_ik: string
  fehler?: string
}

// ---------------------------------------------------------------
// ASN.1-Hilfen
// ---------------------------------------------------------------
function seq(value: forge.asn1.Asn1[]): forge.asn1.Asn1 {
  return asn1.create(Class.UNIVERSAL, Type.SEQUENCE, true, value)
}
function set(value: forge.asn1.Asn1[]): forge.asn1.Asn1 {
  return asn1.create(Class.UNIVERSAL, Type.SET, true, value)
}
function oid(o: string): forge.asn1.Asn1 {
  return asn1.create(Class.UNIVERSAL, Type.OID, false, asn1.oidToDer(o).getBytes())
}
function int(n: number): forge.asn1.Asn1 {
  return asn1.create(Class.UNIVERSAL, Type.INTEGER, false, asn1.integerToDer(n).getBytes())
}
function octet(bytes: string): forge.asn1.Asn1 {
  return asn1.create(Class.UNIVERSAL, Type.OCTETSTRING, false, bytes)
}
function nullVal(): forge.asn1.Asn1 {
  return asn1.create(Class.UNIVERSAL, Type.NULL, false, '')
}
function ctx(tag: number, constructed: boolean, value: forge.asn1.Asn1[] | string): forge.asn1.Asn1 {
  return asn1.create(Class.CONTEXT_SPECIFIC, tag, constructed, value as any)
}
/** AlgorithmIdentifier SHA-256 (Parameter weggelassen, RFC 5754) */
function algSha256(): forge.asn1.Asn1 {
  return seq([oid(OID.sha256)])
}
/** RSASSA-PSS-Parameter: SHA-256, MGF1/SHA-256, Salt 32 */
function algRsassaPss(): forge.asn1.Asn1 {
  return seq([
    oid(OID.rsassaPss),
    seq([
      ctx(0, true, [algSha256()]),
      ctx(1, true, [seq([oid(OID.mgf1), algSha256()])]),
      ctx(2, true, [int(32)]),
    ]),
  ])
}
/** RSAES-OAEP-Parameter: SHA-256, MGF1/SHA-256 */
function algRsaesOaep(): forge.asn1.Asn1 {
  return seq([
    oid(OID.rsaesOaep),
    seq([
      ctx(0, true, [algSha256()]),
      ctx(1, true, [seq([oid(OID.mgf1), algSha256()])]),
    ]),
  ])
}

function bufToForgeBytes(buf: Buffer): string {
  return forge.util.createBuffer(buf.toString('binary')).getBytes()
}
function forgeBytesToBuf(bytes: string): Buffer {
  return Buffer.from(bytes, 'binary')
}

// ---------------------------------------------------------------
// Zertifikat / Schlüssel laden
// ---------------------------------------------------------------
export interface Identitaet {
  zertifikat: forge.pki.Certificate
  privateKey: forge.pki.rsa.PrivateKey
}

/** Lädt Zertifikat + Private Key aus PKCS#12 oder PEM-Bundle. */
export function ladeIdentitaet(daten: Buffer, passwort: string): Identitaet {
  const text = daten.toString('utf8')
  if (text.includes('-----BEGIN')) {
    // PEM-Bundle
    const certMatch = text.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)
    if (!certMatch) throw new Error('PEM enthält kein Zertifikat')
    const zertifikat = forge.pki.certificateFromPem(certMatch[0])
    let privateKey: forge.pki.rsa.PrivateKey
    if (text.includes('ENCRYPTED PRIVATE KEY')) {
      const m = text.match(/-----BEGIN ENCRYPTED PRIVATE KEY-----[\s\S]+?-----END ENCRYPTED PRIVATE KEY-----/)!
      privateKey = forge.pki.decryptRsaPrivateKey(m[0], passwort) as forge.pki.rsa.PrivateKey
    } else {
      const m = text.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/)
      if (!m) throw new Error('PEM enthält keinen Private Key')
      privateKey = forge.pki.privateKeyFromPem(m[0]) as forge.pki.rsa.PrivateKey
    }
    if (!privateKey) throw new Error('Private Key konnte nicht entschlüsselt werden (Passwort falsch?)')
    return { zertifikat, privateKey }
  }
  // PKCS#12
  const p12Asn1 = asn1.fromDer(bufToForgeBytes(daten))
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, passwort)
  let zertifikat: forge.pki.Certificate | null = null
  let privateKey: forge.pki.rsa.PrivateKey | null = null
  for (const safeContents of p12.safeContents) {
    for (const safeBag of safeContents.safeBags) {
      if (safeBag.type === forge.pki.oids.certBag && safeBag.cert) {
        // Erstes Cert mit passendem Key bevorzugen; sonst erstes
        if (!zertifikat) zertifikat = safeBag.cert
      } else if (
        (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag || safeBag.type === forge.pki.oids.keyBag) &&
        safeBag.key
      ) {
        privateKey = safeBag.key as forge.pki.rsa.PrivateKey
      }
    }
  }
  if (!zertifikat || !privateKey) {
    throw new Error('PKCS#12 unvollständig: Zertifikat oder Private Key fehlt')
  }
  return { zertifikat, privateKey }
}

/** Lädt ein X.509-Zertifikat (PEM oder DER). */
export function ladeZertifikat(daten: Buffer): forge.pki.Certificate {
  const text = daten.toString('utf8')
  if (text.includes('-----BEGIN CERTIFICATE-----')) {
    return forge.pki.certificateFromPem(text)
  }
  return forge.pki.certificateFromAsn1(asn1.fromDer(bufToForgeBytes(daten)))
}

/** Extrahiert die IK-Nummer aus dem Subject (OU=IK123456789 o. ä.). */
export function ikAusZertifikat(cert: forge.pki.Certificate): string {
  for (const attr of cert.subject.attributes) {
    const v = String(attr.value || '')
    const m = v.match(/IK\s*:?\s*(\d{9})/i) || v.match(/^(\d{9})$/)
    if (m) return m[1]
  }
  // Fallback: gesamter Subject-String
  const full = cert.subject.attributes.map(a => String(a.value || '')).join(' ')
  const m = full.match(/(\d{9})/)
  return m ? m[1] : ''
}

// ---------------------------------------------------------------
// 1) CMS SignedData (RSASSA-PSS, SHA-256)
// ---------------------------------------------------------------
function issuerAndSerial(cert: forge.pki.Certificate): forge.asn1.Asn1 {
  const certAsn1 = forge.pki.certificateToAsn1(cert)
  // TBSCertificate = certAsn1.value[0]; Issuer-Position hängt von version-Tag ab
  const tbs = certAsn1.value[0] as forge.asn1.Asn1
  const tbsParts = tbs.value as forge.asn1.Asn1[]
  // [0] version (optional), serialNumber, signature, issuer, ...
  let idx = 0
  const first = tbsParts[0]
  if (first.tagClass === Class.CONTEXT_SPECIFIC) idx = 1
  const issuer = tbsParts[idx + 2]
  const serialHex = forge.util.bytesToHex((tbsParts[idx] as any).value)
  return seq([
    issuer,
    asn1.create(Class.UNIVERSAL, Type.INTEGER, false, forge.util.hexToBytes(serialHex)),
  ])
}

function signiereCms(klartext: Buffer, ident: Identitaet): Buffer {
  const contentBytes = bufToForgeBytes(klartext)

  // messageDigest über den Inhalt
  const md = forge.md.sha256.create()
  md.update(contentBytes)
  const contentDigest = md.digest().getBytes()

  // Signed Attributes
  const now = new Date()
  const signedAttrs = [
    seq([oid(OID.attrContentType), set([oid(OID.data)])]),
    seq([
      oid(OID.attrSigningTime),
      set([asn1.create(Class.UNIVERSAL, Type.UTCTIME, false, asn1.dateToUtcTime(now))]),
    ]),
    seq([oid(OID.attrMessageDigest), set([octet(contentDigest)])]),
  ]

  // Signatur wird über die DER-Kodierung als SET OF (Tag 0x31) berechnet
  const attrsSet = set(signedAttrs)
  const attrsDer = asn1.toDer(attrsSet).getBytes()
  const attrsMd = forge.md.sha256.create()
  attrsMd.update(attrsDer)

  const pss = forge.pss.create({
    md: forge.md.sha256.create(),
    mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
    saltLength: 32,
  })
  const signature = ident.privateKey.sign(attrsMd, pss)

  const signerInfo = seq([
    int(1), // version (issuerAndSerialNumber)
    issuerAndSerial(ident.zertifikat),
    algSha256(),
    // signedAttrs [0] IMPLICIT
    asn1.create(Class.CONTEXT_SPECIFIC, 0, true, signedAttrs),
    algRsassaPss(),
    octet(signature),
  ])

  const signedData = seq([
    int(1), // CMSVersion
    set([algSha256()]),
    // encapContentInfo mit eingebettetem Inhalt
    seq([oid(OID.data), ctx(0, true, [octet(contentBytes)])]),
    // certificates [0] IMPLICIT
    asn1.create(Class.CONTEXT_SPECIFIC, 0, true, [forge.pki.certificateToAsn1(ident.zertifikat)]),
    set([signerInfo]),
  ])

  const contentInfo = seq([oid(OID.signedData), ctx(0, true, [signedData])])
  return forgeBytesToBuf(asn1.toDer(contentInfo).getBytes())
}

// ---------------------------------------------------------------
// 2) CMS CompressedData (zlib)
// ---------------------------------------------------------------
function komprimiereCms(daten: Buffer): Buffer {
  const deflated = zlib.deflateSync(daten)
  const compressedData = seq([
    int(0),
    seq([oid(OID.algZlib)]),
    seq([oid(OID.data), ctx(0, true, [octet(bufToForgeBytes(deflated))])]),
  ])
  const contentInfo = seq([oid(OID.compressedData), ctx(0, true, [compressedData])])
  return forgeBytesToBuf(asn1.toDer(contentInfo).getBytes())
}

// ---------------------------------------------------------------
// 3) CMS EnvelopedData (AES-256-CBC + RSAES-OAEP)
// ---------------------------------------------------------------
function verschluesseleCms(daten: Buffer, empfaengerCert: forge.pki.Certificate): Buffer {
  // Content Encryption Key + IV
  const cek = forge.random.getBytesSync(32) // AES-256
  const iv = forge.random.getBytesSync(16)

  const cipher = forge.cipher.createCipher('AES-CBC', cek)
  cipher.start({ iv })
  cipher.update(forge.util.createBuffer(bufToForgeBytes(daten)))
  cipher.finish()
  const encrypted = cipher.output.getBytes()

  // CEK per RSAES-OAEP an den Empfänger
  const pubKey = empfaengerCert.publicKey as forge.pki.rsa.PublicKey
  const encryptedKey = pubKey.encrypt(cek, 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: { md: forge.md.sha256.create() },
  })

  const recipientInfo = seq([
    int(0), // version (issuerAndSerialNumber)
    issuerAndSerial(empfaengerCert),
    algRsaesOaep(),
    octet(encryptedKey),
  ])

  const envelopedData = seq([
    int(0),
    set([recipientInfo]),
    seq([
      oid(OID.data),
      seq([oid(OID.aes256Cbc), octet(iv)]),
      // encryptedContent [0] IMPLICIT
      asn1.create(Class.CONTEXT_SPECIFIC, 0, false, encrypted),
    ]),
  ])

  const contentInfo = seq([oid(OID.envelopedData), ctx(0, true, [envelopedData])])
  return forgeBytesToBuf(asn1.toDer(contentInfo).getBytes())
}

// ---------------------------------------------------------------
// Öffentliche API: Verschlüsseln
// ---------------------------------------------------------------

/**
 * Verschlüsselt eine EDIFACT-Datei nach dem SECON-Verfahren:
 * Signieren → Komprimieren → Verschlüsseln.
 */
export async function verschluesseln(klartext: Buffer, config: SECONConfig): Promise<Buffer> {
  const ident = ladeIdentitaet(config.absender_zertifikat, config.absender_passwort)
  const empfaengerCert = ladeZertifikat(config.empfaenger_zertifikat)

  // Plausibilität: eigene IK muss zum Zertifikat passen (Warnfall, kein Abbruch)
  const zertIk = ikAusZertifikat(ident.zertifikat)
  if (zertIk && config.absender_ik && zertIk !== config.absender_ik) {
    log.warn(`SECON: IK im Zertifikat (${zertIk}) ≠ konfigurierte Absender-IK (${config.absender_ik})`)
  }

  const signiert = signiereCms(klartext, ident)
  const komprimiert = config.komprimieren === false ? signiert : komprimiereCms(signiert)
  return verschluesseleCms(komprimiert, empfaengerCert)
}

// ---------------------------------------------------------------
// Öffentliche API: Entschlüsseln
// ---------------------------------------------------------------

interface ParsedContentInfo {
  contentType: string
  content: forge.asn1.Asn1
}

function parseContentInfo(der: Buffer): ParsedContentInfo {
  const obj = asn1.fromDer(bufToForgeBytes(der))
  const parts = obj.value as forge.asn1.Asn1[]
  const contentType = asn1.derToOid(forge.util.createBuffer((parts[0] as any).value))
  const explicitContent = parts[1] as forge.asn1.Asn1
  return { contentType, content: (explicitContent.value as forge.asn1.Asn1[])[0] }
}

function entschluesseleCms(envelopedData: forge.asn1.Asn1, ident: Identitaet): Buffer {
  const parts = envelopedData.value as forge.asn1.Asn1[]
  // parts: version, [originatorInfo], recipientInfos (SET), encryptedContentInfo, ...
  let idx = 1
  while (idx < parts.length && (parts[idx] as forge.asn1.Asn1).tagClass === Class.CONTEXT_SPECIFIC) idx++
  const recipientInfos = (parts[idx] as forge.asn1.Asn1).value as forge.asn1.Asn1[]
  const encContentInfo = parts[idx + 1] as forge.asn1.Asn1

  // Ersten KeyTransRecipientInfo nehmen und mit eigenem Key entschlüsseln
  let cek: string | null = null
  let letzterFehler = ''
  for (const ri of recipientInfos) {
    const riParts = ri.value as forge.asn1.Asn1[]
    if (riParts.length < 4) continue
    const keyEncAlg = riParts[2] as forge.asn1.Asn1
    const algOid = asn1.derToOid(forge.util.createBuffer(((keyEncAlg.value as forge.asn1.Asn1[])[0] as any).value))
    const encryptedKey = String((riParts[3] as any).value)
    try {
      if (algOid === OID.rsaesOaep) {
        cek = ident.privateKey.decrypt(encryptedKey, 'RSA-OAEP', {
          md: forge.md.sha256.create(),
          mgf1: { md: forge.md.sha256.create() },
        })
      } else {
        // Fallback: RSAES-PKCS1-v1_5 (ältere Gegenstellen)
        cek = ident.privateKey.decrypt(encryptedKey, 'RSAES-PKCS1-V1_5')
      }
      if (cek) break
    } catch (e: any) {
      letzterFehler = e?.message || String(e)
    }
  }
  if (!cek) throw new Error(`Kein RecipientInfo entschlüsselbar (falscher Schlüssel?): ${letzterFehler}`)

  const eciParts = encContentInfo.value as forge.asn1.Asn1[]
  const contentEncAlg = eciParts[1] as forge.asn1.Asn1
  const ceaParts = contentEncAlg.value as forge.asn1.Asn1[]
  const ceaOid = asn1.derToOid(forge.util.createBuffer((ceaParts[0] as any).value))
  if (ceaOid !== OID.aes256Cbc) {
    throw new Error(`Nicht unterstützter Content-Encryption-Algorithmus: ${ceaOid}`)
  }
  const iv = String((ceaParts[1] as any).value)
  const encryptedContentNode = eciParts[2] as forge.asn1.Asn1
  // encryptedContent kann primitiv oder constructed (mehrere OCTET STRINGs) sein
  let encryptedContent = ''
  if (encryptedContentNode.constructed) {
    for (const chunk of encryptedContentNode.value as forge.asn1.Asn1[]) {
      encryptedContent += String((chunk as any).value)
    }
  } else {
    encryptedContent = String((encryptedContentNode as any).value)
  }

  const decipher = forge.cipher.createDecipher('AES-CBC', cek)
  decipher.start({ iv })
  decipher.update(forge.util.createBuffer(encryptedContent))
  if (!decipher.finish()) throw new Error('AES-Entschlüsselung fehlgeschlagen (Padding ungültig)')
  return forgeBytesToBuf(decipher.output.getBytes())
}

function dekomprimiereCms(compressedData: forge.asn1.Asn1): Buffer {
  const parts = compressedData.value as forge.asn1.Asn1[]
  // version, compressionAlgorithm, encapContentInfo
  const encap = parts[2] as forge.asn1.Asn1
  const encapParts = encap.value as forge.asn1.Asn1[]
  const explicit = encapParts[1] as forge.asn1.Asn1
  const octetNode = (explicit.value as forge.asn1.Asn1[])[0] as forge.asn1.Asn1
  let deflated = ''
  if (octetNode.constructed) {
    for (const chunk of octetNode.value as forge.asn1.Asn1[]) deflated += String((chunk as any).value)
  } else {
    deflated = String((octetNode as any).value)
  }
  return zlib.inflateSync(forgeBytesToBuf(deflated))
}

interface SignedDataInhalt {
  inhalt: Buffer
  zertifikate: forge.pki.Certificate[]
  signerInfos: forge.asn1.Asn1[]
}

function parseSignedData(signedData: forge.asn1.Asn1): SignedDataInhalt {
  const parts = signedData.value as forge.asn1.Asn1[]
  // version, digestAlgorithms, encapContentInfo, [0] certs, [1] crls, signerInfos
  const encap = parts[2] as forge.asn1.Asn1
  const encapParts = encap.value as forge.asn1.Asn1[]
  let inhalt: Buffer = Buffer.alloc(0)
  if (encapParts.length > 1) {
    const explicit = encapParts[1] as forge.asn1.Asn1
    const octetNode = (explicit.value as forge.asn1.Asn1[])[0] as forge.asn1.Asn1
    if (octetNode.constructed) {
      let s = ''
      for (const chunk of octetNode.value as forge.asn1.Asn1[]) s += String((chunk as any).value)
      inhalt = forgeBytesToBuf(s)
    } else {
      inhalt = forgeBytesToBuf(String((octetNode as any).value))
    }
  }

  const zertifikate: forge.pki.Certificate[] = []
  let signerInfos: forge.asn1.Asn1[] = []
  for (let i = 3; i < parts.length; i++) {
    const node = parts[i] as forge.asn1.Asn1
    if (node.tagClass === Class.CONTEXT_SPECIFIC && node.type === 0) {
      for (const certNode of node.value as forge.asn1.Asn1[]) {
        try {
          zertifikate.push(forge.pki.certificateFromAsn1(certNode))
        } catch { /* CRLs / andere Strukturen ignorieren */ }
      }
    } else if (node.tagClass === Class.UNIVERSAL && node.type === Type.SET) {
      signerInfos = node.value as forge.asn1.Asn1[]
    }
  }
  return { inhalt, zertifikate, signerInfos }
}

function verifiziereSignerInfo(
  si: forge.asn1.Asn1,
  inhalt: Buffer,
  zertifikate: forge.pki.Certificate[]
): { gueltig: boolean; cert: forge.pki.Certificate | null; fehler?: string } {
  const parts = si.value as forge.asn1.Asn1[]
  // version, sid, digestAlgorithm, [0] signedAttrs, signatureAlgorithm, signature
  let signedAttrsNode: forge.asn1.Asn1 | null = null
  let sigAlgNode: forge.asn1.Asn1 | null = null
  let signatur = ''
  for (let i = 3; i < parts.length; i++) {
    const node = parts[i] as forge.asn1.Asn1
    if (node.tagClass === Class.CONTEXT_SPECIFIC && node.type === 0 && !signedAttrsNode) {
      signedAttrsNode = node
    } else if (node.tagClass === Class.UNIVERSAL && node.type === Type.SEQUENCE && !sigAlgNode) {
      sigAlgNode = node
    } else if (node.tagClass === Class.UNIVERSAL && node.type === Type.OCTETSTRING) {
      signatur = String((node as any).value)
      break
    }
  }
  if (!sigAlgNode || !signatur) return { gueltig: false, cert: null, fehler: 'SignerInfo unvollständig' }
  const sigAlgOid = asn1.derToOid(forge.util.createBuffer(((sigAlgNode.value as forge.asn1.Asn1[])[0] as any).value))

  // Was wurde signiert? Bei signedAttrs: deren DER als SET OF, sonst der Inhalt selbst.
  let signierteBytes: string
  if (signedAttrsNode) {
    // messageDigest-Attribut gegen Inhalt prüfen
    const contentMd = forge.md.sha256.create()
    contentMd.update(bufToForgeBytes(inhalt))
    const contentDigest = contentMd.digest().getBytes()
    let mdOk = false
    for (const attr of signedAttrsNode.value as forge.asn1.Asn1[]) {
      const attrParts = attr.value as forge.asn1.Asn1[]
      const attrOid = asn1.derToOid(forge.util.createBuffer((attrParts[0] as any).value))
      if (attrOid === OID.attrMessageDigest) {
        const digestVal = String(((attrParts[1].value as forge.asn1.Asn1[])[0] as any).value)
        mdOk = digestVal === contentDigest
      }
    }
    if (!mdOk) return { gueltig: false, cert: null, fehler: 'messageDigest stimmt nicht mit Inhalt überein' }
    // Implizites [0] wird für die Signaturprüfung als SET (0x31) re-kodiert
    const reEncoded = set(signedAttrsNode.value as forge.asn1.Asn1[])
    signierteBytes = asn1.toDer(reEncoded).getBytes()
  } else {
    signierteBytes = bufToForgeBytes(inhalt)
  }

  const md = forge.md.sha256.create()
  md.update(signierteBytes)

  let fehler = ''
  for (const cert of zertifikate) {
    const pubKey = cert.publicKey as forge.pki.rsa.PublicKey
    try {
      let ok = false
      if (sigAlgOid === OID.rsassaPss) {
        const pss = forge.pss.create({
          md: forge.md.sha256.create(),
          mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
          saltLength: 32,
        })
        ok = pubKey.verify(md.digest().getBytes(), signatur, pss)
      } else {
        // sha256WithRSAEncryption / rsaEncryption (PKCS#1 v1.5)
        ok = pubKey.verify(md.digest().getBytes(), signatur)
      }
      if (ok) return { gueltig: true, cert }
    } catch (e: any) {
      fehler = e?.message || String(e)
    }
  }
  return { gueltig: false, cert: null, fehler: fehler || 'Signatur passt zu keinem Zertifikat' }
}

/**
 * Entschlüsselt eine eingehende SECON-Datei (z. B. Fehlerprotokoll einer
 * Kasse): Entschlüsseln → Dekomprimieren → SignedData auspacken.
 * Gibt den Klartext (EDIFACT) zurück; die Signatur wird geprüft und bei
 * Ungültigkeit wird ein Fehler geworfen (strikt = Standard).
 */
export async function entschluesseln(
  verschluesselt: Buffer,
  config: SECONConfig,
  optionen?: { signaturErzwingen?: boolean }
): Promise<Buffer> {
  const ident = ladeIdentitaet(config.absender_zertifikat, config.absender_passwort)

  let aktuell: Buffer = verschluesselt
  // Bis zu 4 Schichten abtragen: EnvelopedData → CompressedData → SignedData → Data
  for (let schicht = 0; schicht < 4; schicht++) {
    const { contentType, content } = parseContentInfo(aktuell)
    if (contentType === OID.envelopedData) {
      aktuell = entschluesseleCms(content, ident)
    } else if (contentType === OID.compressedData) {
      aktuell = dekomprimiereCms(content)
    } else if (contentType === OID.signedData) {
      const { inhalt, zertifikate, signerInfos } = parseSignedData(content)
      if (signerInfos.length > 0 && optionen?.signaturErzwingen !== false) {
        const ergebnis = verifiziereSignerInfo(signerInfos[0], inhalt, zertifikate)
        if (!ergebnis.gueltig) {
          throw new Error(`SECON: Signatur der eingehenden Datei ungültig: ${ergebnis.fehler}`)
        }
      }
      return inhalt
    } else if (contentType === OID.data) {
      const octetNode = content
      return forgeBytesToBuf(String((octetNode as any).value))
    } else {
      throw new Error(`SECON: Unbekannter ContentType ${contentType}`)
    }
  }
  // Kein SignedData gefunden — Rohinhalt zurückgeben
  return aktuell
}

/**
 * Verifiziert die Signatur einer empfangenen (bereits entschlüsselten
 * oder unverschlüsselten) SignedData-Struktur.
 */
export async function verifySignatur(
  signiert: Buffer,
  vertrauenswuerdige_zertifikate: Buffer[]
): Promise<SignaturErgebnis> {
  try {
    let { contentType, content } = parseContentInfo(signiert)
    // Falls noch eine CompressedData-Schicht darüber liegt
    if (contentType === OID.compressedData) {
      const entpackt = dekomprimiereCms(content)
      const p = parseContentInfo(entpackt)
      contentType = p.contentType
      content = p.content
    }
    if (contentType !== OID.signedData) {
      return { gueltig: false, absender_ik: '', fehler: `Keine SignedData-Struktur (${contentType})` }
    }
    const { inhalt, zertifikate, signerInfos } = parseSignedData(content)
    if (signerInfos.length === 0) {
      return { gueltig: false, absender_ik: '', fehler: 'Keine SignerInfos vorhanden' }
    }

    // Kandidaten: eingebettete + explizit übergebene vertrauenswürdige Zertifikate
    const vertrauens = vertrauenswuerdige_zertifikate.map(b => ladeZertifikat(b))
    const kandidaten = [...zertifikate, ...vertrauens]

    const ergebnis = verifiziereSignerInfo(signerInfos[0], inhalt, kandidaten)
    if (!ergebnis.gueltig || !ergebnis.cert) {
      return { gueltig: false, absender_ik: '', fehler: ergebnis.fehler }
    }

    // Vertrauensprüfung: Signer-Zertifikat muss einem der übergebenen
    // vertrauenswürdigen Zertifikate entsprechen (Fingerprint-Vergleich),
    // sofern welche übergeben wurden.
    if (vertrauens.length > 0) {
      const fp = zertifikatFingerprint(ergebnis.cert)
      const vertraut = vertrauens.some(c => zertifikatFingerprint(c) === fp)
      if (!vertraut) {
        return {
          gueltig: false,
          absender_ik: ikAusZertifikat(ergebnis.cert),
          fehler: 'Signatur mathematisch gültig, aber Zertifikat nicht in der Vertrauensliste',
        }
      }
    }

    return { gueltig: true, absender_ik: ikAusZertifikat(ergebnis.cert) }
  } catch (e: any) {
    return { gueltig: false, absender_ik: '', fehler: e?.message || String(e) }
  }
}

/** SHA-256-Fingerprint eines Zertifikats (hex, kleingeschrieben). */
export function zertifikatFingerprint(cert: forge.pki.Certificate): string {
  const der = asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  const md = forge.md.sha256.create()
  md.update(der)
  return md.digest().toHex()
}
