/**
 * SECON — Fehler- und Grenzfaelle
 *
 * `lib/abrechnung/secon.test.ts` deckt den Gutfall ab: signieren →
 * komprimieren → verschluesseln → entschluesseln → verifizieren laeuft
 * durch. Was dort fehlt, ist genau die Haelfte, die im Betrieb weh tut:
 * ein falsches Passwort, ein Zertifikat der falschen Gegenstelle, eine
 * unterwegs veraenderte Datei, eine Signatur von jemandem, dem wir nicht
 * vertrauen.
 *
 * Diese Suite prueft deshalb die Ablehnungsseite und haelt zugleich fest,
 * WO die Vertrauensentscheidung wirklich faellt — das ist bei SECON nicht
 * dort, wo man es vermutet (siehe Test „entschluesseln beweist keine
 * Herkunft").
 *
 * Laeuft mit: npm run test:unit
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import forge from 'node-forge'
import {
  verschluesseln,
  entschluesseln,
  verifySignatur,
  ladeIdentitaet,
  ladeZertifikat,
  ikAusZertifikat,
  zertifikatFingerprint,
} from '../secon'

// ───────────────────────────────────────────────────────────────
// Testidentitaeten
//
// RSA-2048 mit node-forge kostet je Schluesselpaar rund eine Sekunde.
// Die Paare werden deshalb EINMAL erzeugt und ueber alle Tests geteilt;
// wo ein zweites Zertifikat zum selben Schluessel reicht (abgelaufen),
// wird das Paar wiederverwendet statt neu gerechnet.
// ───────────────────────────────────────────────────────────────

interface Identitaet {
  keys: forge.pki.rsa.KeyPair
  cert: forge.pki.Certificate
  p12: Buffer
  certPem: string
  passwort: string
}

function baueZertifikat(
  keys: forge.pki.rsa.KeyPair,
  ik: string,
  gueltigVon: Date,
  gueltigBis: Date,
): forge.pki.Certificate {
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  // Feste, aber je IK unterschiedliche Seriennummer: der Fingerprint-
  // Vergleich in verifySignatur haengt daran, dass zwei Identitaeten
  // sich unterscheiden.
  cert.serialNumber = '01' + Buffer.from(ik).toString('hex')
  cert.validity.notBefore = gueltigVon
  cert.validity.notAfter = gueltigBis
  const attrs = [
    { name: 'commonName', value: `Testkasse ${ik}` },
    { name: 'organizationName', value: 'Alltagsengel Testumgebung' },
    { shortName: 'OU', value: `IK${ik}` },
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  return cert
}

function alsP12(keys: forge.pki.rsa.KeyPair, cert: forge.pki.Certificate, passwort: string): Buffer {
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passwort, { algorithm: '3des' })
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary')
}

function erzeugeIdentitaet(ik: string, passwort: string): Identitaet {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = baueZertifikat(keys, ik, new Date(Date.now() - 86_400_000), new Date(Date.now() + 365 * 86_400_000))
  return { keys, cert, p12: alsP12(keys, cert, passwort), certPem: forge.pki.certificateToPem(cert), passwort }
}

const ABSENDER = erzeugeIdentitaet('460629986', 'absender-geheim')
const EMPFAENGER = erzeugeIdentitaet('109905003', 'empfaenger-geheim')
const FREMD = erzeugeIdentitaet('101575519', 'fremd-geheim')

/** Zweites Zertifikat auf dem Schluessel von FREMD — Gueltigkeit 2020 abgelaufen. */
const ABGELAUFEN_CERT = baueZertifikat(
  FREMD.keys,
  '999999999',
  new Date('2019-01-01T00:00:00Z'),
  new Date('2020-01-01T00:00:00Z'),
)
const ABGELAUFEN_PEM = forge.pki.certificateToPem(ABGELAUFEN_CERT)

const NUTZDATEN = Buffer.from(
  "UNB+UNOC:3+460629986+109905003+260801:1200+00001'UNH+00001+SLGA:16:0:0'"
  + "FKT+10++460629986'INV+Grün, Müller & Söhne — Zuschläge 25 %'UNZ+1+00001'",
  'utf8',
)

function absenderConfig(empfaengerPem: string) {
  return {
    absender_ik: '460629986',
    absender_zertifikat: ABSENDER.p12,
    absender_passwort: ABSENDER.passwort,
    empfaenger_zertifikat: Buffer.from(empfaengerPem, 'utf8'),
  }
}

async function containerFuerEmpfaenger(): Promise<Buffer> {
  return verschluesseln(NUTZDATEN, absenderConfig(EMPFAENGER.certPem))
}

// ───────────────────────────────────────────────────────────────
// 1) Schluessel-/Zertifikatsmaterial laden
// ───────────────────────────────────────────────────────────────

test('falsches PKCS#12-Passwort wird abgelehnt, statt einen leeren Schluessel zu liefern', () => {
  assert.throws(
    () => ladeIdentitaet(ABSENDER.p12, 'falsch'),
    // node-forge meldet den MAC-Abgleich; entscheidend ist nur, DASS es wirft.
    (err: unknown) => err instanceof Error && err.message.length > 0,
    'Ein falsches Passwort muss werfen — ein stiller Fehlschlag wuerde spaeter '
    + 'als unlesbare Datei bei der Kasse auftauchen.',
  )
})

test('PKCS#12 ohne Private Key gilt als unvollstaendig', () => {
  // Nur das Zertifikat verpacken, keinen Schluessel: forge erlaubt das,
  // SECON darf es nicht als Absenderidentitaet akzeptieren.
  const asn1 = forge.pkcs12.toPkcs12Asn1(null as never, [ABSENDER.cert], 'x', { algorithm: '3des' })
  const nurCert = Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary')
  assert.throws(
    () => ladeIdentitaet(nurCert, 'x'),
    /PKCS#12 unvollständig/,
  )
})

test('PEM-Bundle ohne Zertifikat wird abgelehnt', () => {
  const nurKey = forge.pki.privateKeyToPem(ABSENDER.keys.privateKey)
  assert.throws(() => ladeIdentitaet(Buffer.from(nurKey, 'utf8'), ''), /kein Zertifikat/)
})

test('PEM-Bundle ohne Private Key wird abgelehnt', () => {
  assert.throws(
    () => ladeIdentitaet(Buffer.from(ABSENDER.certPem, 'utf8'), ''),
    /keinen Private Key/,
  )
})

test('PEM-Bundle aus Zertifikat + Schluessel wird geladen', () => {
  const bundle = ABSENDER.certPem + '\n' + forge.pki.privateKeyToPem(ABSENDER.keys.privateKey)
  const ident = ladeIdentitaet(Buffer.from(bundle, 'utf8'), '')
  assert.equal(ikAusZertifikat(ident.zertifikat), '460629986')
})

test('ladeZertifikat versteht PEM und DER gleichermassen', () => {
  const ausPem = ladeZertifikat(Buffer.from(EMPFAENGER.certPem, 'utf8'))
  const der = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(EMPFAENGER.cert)).getBytes(), 'binary')
  const ausDer = ladeZertifikat(der)
  assert.equal(
    zertifikatFingerprint(ausPem),
    zertifikatFingerprint(ausDer),
    'Dasselbe Zertifikat muss in beiden Kodierungen denselben Fingerprint ergeben — '
    + 'sonst schlaegt die Vertrauensliste je nach Speicherformat fehl.',
  )
})

test('Datenmuell als Zertifikat wirft, statt ein leeres Zertifikat zu liefern', () => {
  assert.throws(() => ladeZertifikat(Buffer.from('kein zertifikat', 'utf8')))
})

// ───────────────────────────────────────────────────────────────
// 2) IK-Extraktion
// ───────────────────────────────────────────────────────────────

test('ikAusZertifikat liest die IK aus dem OU-Attribut', () => {
  assert.equal(ikAusZertifikat(ABSENDER.cert), '460629986')
  assert.equal(ikAusZertifikat(EMPFAENGER.cert), '109905003')
})

test('ikAusZertifikat akzeptiert eine blanke neunstellige Nummer als Attributwert', () => {
  const keys = ABSENDER.keys
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '02'
  cert.validity.notBefore = new Date(Date.now() - 1000)
  cert.validity.notAfter = new Date(Date.now() + 1000)
  const attrs = [{ name: 'commonName', value: '660500345' }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  assert.equal(ikAusZertifikat(cert), '660500345')
})

test('Zertifikat ganz ohne IK ergibt den leeren String, nicht eine erratene Nummer', () => {
  const keys = ABSENDER.keys
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '03'
  cert.validity.notBefore = new Date(Date.now() - 1000)
  cert.validity.notAfter = new Date(Date.now() + 1000)
  const attrs = [{ name: 'commonName', value: 'Pflegedienst ohne Kennung' }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  assert.equal(
    ikAusZertifikat(cert), '',
    'Ohne IK muss der Rueckgabewert leer sein. Eine geratene IK wuerde in der '
    + 'Auftragsdatei landen und die Sendung bei der falschen Kasse einliefern.',
  )
})

// ───────────────────────────────────────────────────────────────
// 3) Verschluesseln — Grenzfaelle
// ───────────────────────────────────────────────────────────────

test('Klartext taucht im Container nicht auf, auch nicht die Umlaute', async () => {
  const container = await containerFuerEmpfaenger()
  const roh = container.toString('binary')
  assert.equal(roh.includes('Zuschläge'), false)
  assert.equal(roh.includes('Söhne'), false)
  assert.equal(roh.includes('460629986'), false, 'Auch die IK aus den Nutzdaten darf nicht im Klartext stehen.')
})

test('zwei Verschluesselungen derselben Datei ergeben verschiedene Container', async () => {
  const a = await containerFuerEmpfaenger()
  const b = await containerFuerEmpfaenger()
  assert.notEqual(
    a.toString('base64'), b.toString('base64'),
    'Gleiche Ausgabe bei gleicher Eingabe hiesse: fester Sitzungsschluessel oder fester IV. '
    + 'Zwei Monatslaeufe mit gleichem Anfang waeren dann vergleichbar.',
  )
})

test('leere Nutzdaten laufen durch und kommen leer wieder heraus', async () => {
  const container = await verschluesseln(Buffer.alloc(0), absenderConfig(EMPFAENGER.certPem))
  const zurueck = await entschluesseln(container, {
    absender_ik: '109905003',
    absender_zertifikat: EMPFAENGER.p12,
    absender_passwort: EMPFAENGER.passwort,
    empfaenger_zertifikat: Buffer.from(ABSENDER.certPem, 'utf8'),
  })
  assert.equal(zurueck.length, 0)
})

test('abweichende Absender-IK bricht nicht ab — sie ist bewusst nur ein Warnfall', async () => {
  // Belegt die Schichtung: die IK-Pruefung sitzt im Versandweg
  // (lib/abrechnung/versand.ts), nicht in der Krypto-Schicht. Wer das
  // hier zu einem Fehler macht, legt den Versand still lahm.
  const container = await verschluesseln(NUTZDATEN, {
    ...absenderConfig(EMPFAENGER.certPem),
    absender_ik: '000000000',
  })
  assert.ok(container.length > 500)
})

test('abgelaufenes Empfaengerzertifikat wird von der Krypto-Schicht NICHT abgelehnt', async () => {
  // Festgehalten, weil es leicht falsch erinnert wird: `verschluesseln`
  // prueft keine Gueltigkeitsdauer. Die Ablauffilterung sitzt eine Ebene
  // hoeher — `ladeEmpfaengerZertifikat` in lib/abrechnung/zertifikate.ts
  // sortiert abgelaufene Kandidaten aus, `pruefeZertifikat` meldet sie.
  // Wer diese Filterung dort entfernt, bekommt hier keinen Schutz mehr.
  const container = await verschluesseln(NUTZDATEN, absenderConfig(ABGELAUFEN_PEM))
  assert.ok(
    container.length > 500,
    'Aktuelles Verhalten: der Container wird gebaut. Wenn dieser Test kippt, '
    + 'wurde eine Gueltigkeitspruefung in secon.ts ergaenzt — dann hier den '
    + 'erwarteten Fehler pruefen statt den Erfolg.',
  )
})

// ───────────────────────────────────────────────────────────────
// 4) Entschluesseln — Fehlerpfade
// ───────────────────────────────────────────────────────────────

test('mit dem falschen Schluessel ist der Container nicht zu oeffnen', async () => {
  const container = await containerFuerEmpfaenger()
  await assert.rejects(
    () => entschluesseln(container, {
      absender_ik: '101575519',
      absender_zertifikat: FREMD.p12,
      absender_passwort: FREMD.passwort,
      empfaenger_zertifikat: Buffer.from(ABSENDER.certPem, 'utf8'),
    }),
    /Kein RecipientInfo entschlüsselbar/,
  )
})

test('veraenderter Chiffretext wird erkannt, nicht als Klartext durchgereicht', async () => {
  const container = await containerFuerEmpfaenger()
  const manipuliert = Buffer.from(container)
  // Ein Byte weit hinten treffen: dort liegt der verschluesselte Inhalt,
  // nicht die ASN.1-Huelle oder der Schluesseltransport.
  const pos = manipuliert.length - 20
  manipuliert[pos] = manipuliert[pos] ^ 0xff

  await assert.rejects(
    () => entschluesseln(manipuliert, {
      absender_ik: '109905003',
      absender_zertifikat: EMPFAENGER.p12,
      absender_passwort: EMPFAENGER.passwort,
      empfaenger_zertifikat: Buffer.from(ABSENDER.certPem, 'utf8'),
    }),
    (err: unknown) => err instanceof Error,
    'Eine unterwegs veraenderte Datei muss werfen. Stillschweigend Muell '
    + 'zurueckzugeben hiesse: der Ruecklaeufer-Import verarbeitet Zufallsbytes.',
  )
})

test('Datenmuell statt Container wirft beim Parsen', async () => {
  await assert.rejects(
    () => entschluesseln(Buffer.from('das ist keine CMS-Struktur', 'utf8'), {
      absender_ik: '109905003',
      absender_zertifikat: EMPFAENGER.p12,
      absender_passwort: EMPFAENGER.passwort,
      empfaenger_zertifikat: Buffer.from(ABSENDER.certPem, 'utf8'),
    }),
    (err: unknown) => err instanceof Error,
  )
})

test('Umlaute ueberstehen den Weg durch Signatur, zlib und AES unveraendert', async () => {
  const container = await containerFuerEmpfaenger()
  const zurueck = await entschluesseln(container, {
    absender_ik: '109905003',
    absender_zertifikat: EMPFAENGER.p12,
    absender_passwort: EMPFAENGER.passwort,
    empfaenger_zertifikat: Buffer.from(ABSENDER.certPem, 'utf8'),
  })
  assert.equal(zurueck.toString('utf8'), NUTZDATEN.toString('utf8'))
  assert.ok(zurueck.toString('utf8').includes('Grün, Müller & Söhne'))
})

test('entschluesseln beweist keine Herkunft — die Signatur wird nur gegen die MITGELIEFERTEN Zertifikate geprueft', async () => {
  // Sicherheitsrelevante Eigenschaft, die man leicht ueberschaetzt:
  // `entschluesseln` verifiziert die Signatur nur in sich stimmig (passt sie
  // zum eingebetteten Zertifikat?). Ein Dritter, der unseren oeffentlichen
  // Schluessel kennt, kann eine Datei mit SEINEM Zertifikat signieren und an
  // uns verschluesseln — hier laeuft sie durch.
  //
  // Wer Herkunft braucht, MUSS zusaetzlich verifySignatur() mit einer
  // Vertrauensliste aufrufen (siehe naechster Block). Dieser Test ist die
  // Warnschwelle: kippt er, hat jemand die Vertrauenspruefung hierher
  // gezogen — dann ist das gut, aber der Aufrufer muss angepasst werden.
  const vonFremd = await verschluesseln(NUTZDATEN, {
    absender_ik: '101575519',
    absender_zertifikat: FREMD.p12,
    absender_passwort: FREMD.passwort,
    empfaenger_zertifikat: Buffer.from(EMPFAENGER.certPem, 'utf8'),
  })

  const zurueck = await entschluesseln(vonFremd, {
    absender_ik: '109905003',
    absender_zertifikat: EMPFAENGER.p12,
    absender_passwort: EMPFAENGER.passwort,
    // Absichtlich das Zertifikat des ECHTEN Partners — es wird nicht benutzt.
    empfaenger_zertifikat: Buffer.from(ABSENDER.certPem, 'utf8'),
  })
  assert.equal(zurueck.toString('utf8'), NUTZDATEN.toString('utf8'))
})

// ───────────────────────────────────────────────────────────────
// 5) verifySignatur — hier faellt die Vertrauensentscheidung
// ───────────────────────────────────────────────────────────────

/**
 * Baut eine echte CMS-SignedData-Struktur, wie sie in einer SECON-Datei unter
 * der Verschluesselungsschicht liegt.
 *
 * Bewusst ueber `forge.pkcs7` statt ueber unseren eigenen Signierer: die
 * Gegenstellen im GKV-Datenaustausch signieren nicht alle mit RSASSA-PSS.
 * Diese Struktur nutzt sha256WithRSAEncryption (PKCS#1 v1.5) und trifft damit
 * genau den Fallback-Zweig in `verifiziereSignerInfo`, der von unserem eigenen
 * Round-Trip nie beruehrt wird.
 */
function baueSignedData(ident: Identitaet, inhalt: string): Buffer {
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(inhalt, 'utf8')
  p7.addCertificate(ident.cert)
  p7.addSigner({
    key: ident.keys.privateKey as never,
    certificate: ident.cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime },
    ],
  })
  p7.sign({ detached: false })
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary')
}

test('ohne Vertrauensliste prueft verifySignatur nur die Rechnung, nicht die Herkunft', async () => {
  // Das ist die Stelle, an der ein Aufrufer die Sicherheit verlieren kann:
  // `[]` heisst „mathematisch korrekt signiert" — von IRGENDWEM. Der
  // zurueckgegebene absender_ik stammt aus dem mitgelieferten Zertifikat und
  // ist damit eine Behauptung des Absenders, kein Nachweis.
  const der = baueSignedData(ABSENDER, 'SLGA-Ruecklaeufer')
  const ergebnis = await verifySignatur(der, [])
  assert.equal(ergebnis.gueltig, true)
  assert.equal(ergebnis.absender_ik, '460629986')
})

test('mit passender Vertrauensliste ist die Signatur gueltig', async () => {
  const der = baueSignedData(ABSENDER, 'SLGA-Ruecklaeufer')
  const ergebnis = await verifySignatur(der, [Buffer.from(ABSENDER.certPem, 'utf8')])
  assert.equal(ergebnis.gueltig, true)
  assert.equal(ergebnis.absender_ik, '460629986')
  assert.equal(ergebnis.fehler, undefined)
})

test('eine Vertrauensliste ohne den Unterzeichner lehnt ab, obwohl die Signatur rechnerisch stimmt', async () => {
  const der = baueSignedData(ABSENDER, 'SLGA-Ruecklaeufer')
  const ergebnis = await verifySignatur(der, [Buffer.from(FREMD.certPem, 'utf8')])
  assert.equal(ergebnis.gueltig, false)
  assert.match(ergebnis.fehler ?? '', /nicht in der Vertrauensliste/)
  assert.equal(
    ergebnis.absender_ik, '460629986',
    'Die IK wird trotzdem gemeldet — sonst stuende im Fehlerprotokoll nicht, '
    + 'WER da vergeblich angeklopft hat.',
  )
})

test('nachtraeglich veraenderter Inhalt bricht die Signatur', async () => {
  const der = baueSignedData(ABSENDER, 'BETRAG 1000,00')
  const gueltig = await verifySignatur(der, [Buffer.from(ABSENDER.certPem, 'utf8')])
  assert.equal(gueltig.gueltig, true, 'Vorbedingung: die unveraenderte Datei muss gueltig sein.')

  // Den eingebetteten Klartext manipulieren: aus 1000,00 wird 9000,00.
  const manipuliert = Buffer.from(der)
  const pos = manipuliert.indexOf(Buffer.from('BETRAG 1000,00', 'utf8'))
  assert.notEqual(pos, -1, 'Vorbedingung: der Inhalt liegt im Klartext in der SignedData.')
  manipuliert[pos + 7] = '9'.charCodeAt(0)

  const ergebnis = await verifySignatur(manipuliert, [Buffer.from(ABSENDER.certPem, 'utf8')])
  assert.equal(
    ergebnis.gueltig, false,
    'Ein geaenderter Betrag muss die Signatur brechen. Genau dafuer wird signiert.',
  )
  assert.match(ergebnis.fehler ?? '', /messageDigest/)
})

test('SignedData ohne jeden Unterzeichner gilt nicht als gueltig', async () => {
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer('ohne Signer', 'utf8')
  p7.sign({ detached: false })
  const der = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary')
  const ergebnis = await verifySignatur(der, [])
  assert.equal(ergebnis.gueltig, false)
  assert.match(ergebnis.fehler ?? '', /Keine SignerInfos/)
})

test('verifySignatur meldet eine EnvelopedData-Datei als „keine SignedData" statt zu werfen', async () => {
  const container = await containerFuerEmpfaenger()
  const ergebnis = await verifySignatur(container, [])
  assert.equal(ergebnis.gueltig, false)
  assert.match(ergebnis.fehler ?? '', /Keine SignedData/)
})

test('verifySignatur faengt Datenmuell ab und liefert ein Ergebnis, keinen Absturz', async () => {
  const ergebnis = await verifySignatur(Buffer.from('kaputt', 'utf8'), [])
  assert.equal(ergebnis.gueltig, false)
  assert.equal(ergebnis.absender_ik, '')
  assert.ok((ergebnis.fehler ?? '').length > 0, 'Der Grund muss benannt sein — sonst ist der Fehler im Protokoll nicht auffindbar.')
})

test('zertifikatFingerprint unterscheidet Identitaeten und ist stabil', () => {
  const a = zertifikatFingerprint(ABSENDER.cert)
  const b = zertifikatFingerprint(EMPFAENGER.cert)
  assert.notEqual(a, b)
  assert.equal(a, zertifikatFingerprint(ladeZertifikat(Buffer.from(ABSENDER.certPem, 'utf8'))))
  assert.match(a, /^[0-9a-f]{64}$/, 'SHA-256 hex, kleingeschrieben — die Vertrauensliste vergleicht Zeichenketten.')
})
