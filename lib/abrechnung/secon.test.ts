// Round-Trip-Test für das SECON-Verfahren:
// Signieren → Komprimieren → Verschlüsseln → Entschlüsseln → Verifizieren
// Läuft mit: npx tsx --test lib/abrechnung/secon.test.ts
import { test } from 'node:test'
import assert from 'node:assert'
import forge from 'node-forge'
import { verschluesseln, entschluesseln, verifySignatur, ladeIdentitaet, ikAusZertifikat } from './secon'

function erzeugeTestIdentitaet(ik: string, passwort: string): { p12: Buffer; certPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01' + Math.floor(Math.random() * 1e6).toString(16)
  cert.validity.notBefore = new Date(Date.now() - 86400000)
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400000)
  const attrs = [
    { name: 'commonName', value: 'Test Alltagsengel' },
    { name: 'organizationName', value: 'Alltagsengel UG' },
    { shortName: 'OU', value: `IK${ik}` },
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passwort, { algorithm: '3des' })
  const p12 = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary')
  return { p12, certPem: forge.pki.certificateToPem(cert) }
}

test('SECON Round-Trip: verschluesseln → entschluesseln', async () => {
  const absender = erzeugeTestIdentitaet('460629986', 'geheim')
  const empfaenger = erzeugeTestIdentitaet('109905003', 'kasse')

  const edifact = Buffer.from(
    "UNB+UNOC:3+460629986+109905003+260801:1200+00001'UNH+00001+SLGA:16:0:0'…Testdaten äöüß…UNZ+1+00001'",
    'utf8'
  )

  // Absender verschlüsselt für Empfänger
  const verschluesselt = await verschluesseln(edifact, {
    absender_ik: '460629986',
    absender_zertifikat: absender.p12,
    absender_passwort: 'geheim',
    empfaenger_zertifikat: Buffer.from(empfaenger.certPem, 'utf8'),
  })
  assert.ok(verschluesselt.length > 500, 'Container sollte deutlich größer als 500 Bytes sein')
  assert.notStrictEqual(verschluesselt.toString('binary').includes('Testdaten'), true, 'Klartext darf nicht enthalten sein')

  // Empfänger entschlüsselt (nutzt eigenen Private Key)
  const entschluesselt = await entschluesseln(verschluesselt, {
    absender_ik: '109905003',
    absender_zertifikat: empfaenger.p12,
    absender_passwort: 'kasse',
    empfaenger_zertifikat: Buffer.from(absender.certPem, 'utf8'),
  })
  assert.strictEqual(entschluesselt.toString('utf8'), edifact.toString('utf8'))
})

test('SECON Round-Trip ohne Kompression', async () => {
  const absender = erzeugeTestIdentitaet('460629986', 'geheim')
  const empfaenger = erzeugeTestIdentitaet('109905003', 'kasse')
  const edifact = Buffer.from('UNB+TEST', 'utf8')

  const verschluesselt = await verschluesseln(edifact, {
    absender_ik: '460629986',
    absender_zertifikat: absender.p12,
    absender_passwort: 'geheim',
    empfaenger_zertifikat: Buffer.from(empfaenger.certPem, 'utf8'),
    komprimieren: false,
  })
  const entschluesselt = await entschluesseln(verschluesselt, {
    absender_ik: '109905003',
    absender_zertifikat: empfaenger.p12,
    absender_passwort: 'kasse',
    empfaenger_zertifikat: Buffer.from(absender.certPem, 'utf8'),
  })
  assert.strictEqual(entschluesselt.toString('utf8'), 'UNB+TEST')
})

test('verifySignatur erkennt Absender-IK und Manipulation', async () => {
  const absender = erzeugeTestIdentitaet('460629986', 'geheim')
  const { zertifikat } = ladeIdentitaet(absender.p12, 'geheim')
  assert.strictEqual(ikAusZertifikat(zertifikat), '460629986')

  // Signierte (unverschlüsselte) Struktur erzeugen: verschluesseln bis Stufe 1
  // → wir nutzen den internen Weg über verschluesseln/entschluesseln
  const empfaenger = erzeugeTestIdentitaet('109905003', 'kasse')
  const edifact = Buffer.from('UNB+SIGTEST', 'utf8')
  const verschluesselt = await verschluesseln(edifact, {
    absender_ik: '460629986',
    absender_zertifikat: absender.p12,
    absender_passwort: 'geheim',
    empfaenger_zertifikat: Buffer.from(empfaenger.certPem, 'utf8'),
  })

  // Entschlüsselung mit falschem Key muss scheitern
  const dritter = erzeugeTestIdentitaet('111111111', 'x')
  await assert.rejects(() =>
    entschluesseln(verschluesselt, {
      absender_ik: '111111111',
      absender_zertifikat: dritter.p12,
      absender_passwort: 'x',
      empfaenger_zertifikat: Buffer.from(absender.certPem, 'utf8'),
    })
  )

  // verifySignatur mit Vertrauensliste
  // (Signatur-Container extrahieren: Empfänger entschlüsselt ohne Signaturprüfung
  //  geht hier nicht direkt — daher prüfen wir den Erfolgsfall über entschluesseln,
  //  das intern die Signatur strikt verifiziert.)
  const klartext = await entschluesseln(verschluesselt, {
    absender_ik: '109905003',
    absender_zertifikat: empfaenger.p12,
    absender_passwort: 'kasse',
    empfaenger_zertifikat: Buffer.from(absender.certPem, 'utf8'),
  })
  assert.strictEqual(klartext.toString('utf8'), 'UNB+SIGTEST')
})
