// Schritt 1 des Doppel-Opt-in — node:test
// Ausführen: npx tsx --test lib/marketing/anmeldung.test.ts  (oder npm run test:unit)
//
// ── DER BEFUND, DEN DIESE SUITE FESTHÄLT ──────────────────────────────────
// Es gab bis zum 31.08.2026 zwei öffentliche Anmeldewege mit
// unterschiedlicher Rechtsfolge: `/api/newsletter` trug sofort ein
// (einfaches Opt-in), `/api/marketing/anmeldung` fragte nach (doppeltes).
// Das Formular rief den ersten; der zweite hatte keinen Aufrufer. Seitdem
// laufen beide über den hier geprüften Kern.
//
// Die tragenden Aussagen sind Aussagen über das, was NICHT passiert: keine
// Mail an eine gesperrte Adresse, keine an eine bereits eingewilligte,
// keine bei unlesbarer Sperrliste. Ohne einen Versand-Doppelgänger ließe
// sich das nicht belegen — ein Test könnte dann nur das Ergebnis sehen,
// nicht die ausgebliebene Mail.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '@/__tests__/helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const SITE = 'https://alltagsengel.care'

// Der Versandweg wird hereingereicht, nicht per Modul-Attrappe ersetzt:
// `mock.module` verlangt ein Top-Level-await, und diese Suite läuft als
// CommonJS. Die Einreichung ist ohnehin das klarere Mittel — sie ist im
// Modul als Parameter sichtbar statt als unsichtbarer Seiteneffekt.
interface Versandt { to: string; subject: string; text?: string; idempotenzSchluessel?: string }
const versendet: Versandt[] = []
const versandDoppel = (async (m: Versandt) => {
  versendet.push(m)
  return { ok: true as const, messageId: 'test-1' }
}) as unknown as Versandweg

// Der Signaturschlüssel für den Bestätigungslink. Ohne ihn wirft
// `bestaetigungsLink()`, und der Kern meldete 'kein_link'.
process.env.MARKETING_OPTIN_SECRET ??= 'pruefschluessel-nur-fuer-tests-0123456789'

import { sendeBestaetigungsmail, type Versandweg } from './anmeldung'

function fake(bestand: { sperre?: unknown; consent?: unknown; fehler?: Record<string, string> } = {}) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (bestand.fehler?.[a.tabelle]) return { error: { message: bestand.fehler[a.tabelle] } }
    if (a.tabelle === 'email_suppression_list') return { data: bestand.sperre ?? null }
    if (a.tabelle === 'marketing_consents') return { data: bestand.consent ?? null }
    return { data: null }
  })
}

const anmelden = (f: ReturnType<typeof fake>, email = 'neu@example.com') =>
  sendeBestaetigungsmail(f.client, { email, typ: 'newsletter', organizationId: ORG, site: SITE }, versandDoppel)

test('eine unbekannte Adresse bekommt eine Bestätigungsmail', async () => {
  versendet.length = 0
  const ergebnis = await anmelden(fake())

  assert.deepEqual(ergebnis, { gesendet: true, grund: 'gesendet', eingabefehler: false })
  assert.equal(versendet.length, 1)
  assert.match(versendet[0].subject, /Bitte bestätigen Sie Ihre Anmeldung/)
})

test('die Mail enthält den Bestätigungslink und KEINEN Abmeldelink', async () => {
  // Diese Mail ist selbst keine Werbung, sondern die Rückfrage zu einer
  // Anfrage — ohne Bestätigung entsteht nichts, wovon man sich abmelden
  // könnte. Ein Abmeldelink hier wäre irreführend.
  versendet.length = 0
  await anmelden(fake())
  const text = versendet[0].text ?? ''
  assert.match(text, /\/api\/marketing\/bestaetigung\?/)
  assert.doesNotMatch(text, /abmeldung/)
})

test('die Absenderregel des Projekts gilt auch hier', async () => {
  // Kundenkommunikation zeichnet „Alltagsengel", nie ein persönlicher Name.
  versendet.length = 0
  await anmelden(fake())
  assert.match(versendet[0].text ?? '', /Ihr Team von Alltagsengel/)
})

test('an eine gesperrte Adresse geht KEINE Mail', async () => {
  // Wer widersprochen hat (Art. 21 DSGVO), bekommt auch keine Einladung,
  // doch wieder einzuwilligen — sonst wäre die Sperrliste über dieses
  // Formular als Mailversand nutzbar.
  versendet.length = 0
  const ergebnis = await anmelden(fake({ sperre: { id: 's1' } }))

  assert.equal(ergebnis.gesendet, false)
  assert.equal(ergebnis.grund, 'gesperrt')
  assert.equal(versendet.length, 0)
})

test('an eine bereits eingewilligte Adresse geht KEINE Mail', async () => {
  versendet.length = 0
  const ergebnis = await anmelden(fake({ consent: { id: 'c1' } }))

  assert.equal(ergebnis.gesendet, false)
  assert.equal(ergebnis.grund, 'bereits_eingewilligt')
  assert.equal(versendet.length, 0)
})

test('eine unlesbare Sperrliste ist kein Freibrief — fail-closed', async () => {
  versendet.length = 0
  const ergebnis = await anmelden(fake({ fehler: { email_suppression_list: 'RLS' } }))

  assert.equal(ergebnis.gesendet, false)
  assert.equal(ergebnis.grund, 'sperrliste_unlesbar')
  assert.equal(versendet.length, 0)
})

test('ein unlesbarer Einwilligungsstand hält den Versand ebenfalls auf', async () => {
  versendet.length = 0
  const ergebnis = await anmelden(fake({ fehler: { marketing_consents: 'RLS' } }))

  assert.equal(ergebnis.gesendet, false)
  assert.equal(ergebnis.grund, 'bestand_unlesbar')
  assert.equal(versendet.length, 0)
})

test('beide Bestandsabfragen tragen den Mandanten-Fence', async () => {
  const f = fake()
  await anmelden(f)
  assert.ok(hatOrgFence(f.ersterAuf('email_suppression_list'), ORG))
  assert.ok(hatOrgFence(f.ersterAuf('marketing_consents'), ORG))
})

test('der Einwilligungsstand wird je Art geprüft und nur offen gezählt', async () => {
  // Ohne `consent_type` blockierte eine Produktinfo-Einwilligung die
  // Newsletter-Anmeldung; ohne `revoked_at IS NULL` bliebe ein Widerruf
  // für immer als „schon dabei" stehen.
  const f = fake()
  await anmelden(f)
  const abfrage = f.ersterAuf('marketing_consents')
  assert.ok(hatFilter(abfrage, 'eq', 'consent_type', 'newsletter'))
  assert.ok(hatFilter(abfrage, 'is', 'revoked_at', null))
})

test('die Adresse wird normalisiert, bevor sie irgendwo hingeht', async () => {
  versendet.length = 0
  const f = fake()
  await sendeBestaetigungsmail(f.client, {
    email: '  Gross@Example.COM ', typ: 'newsletter', organizationId: ORG, site: SITE,
  }, versandDoppel)
  assert.ok(hatFilter(f.ersterAuf('email_suppression_list'), 'eq', 'email', 'gross@example.com'))
  assert.equal(versendet[0].to, 'gross@example.com')
})

test('eine unbrauchbare Adresse ist ein Eingabefehler und fasst die Datenbank nicht an', async () => {
  versendet.length = 0
  const f = fake()
  const ergebnis = await sendeBestaetigungsmail(f.client, {
    email: 'kein-at-zeichen', typ: 'newsletter', organizationId: ORG, site: SITE,
  }, versandDoppel)

  assert.equal(ergebnis.grund, 'adresse_unbrauchbar')
  assert.equal(ergebnis.eingabefehler, true)
  assert.equal(f.aufrufe.length, 0)
  assert.equal(versendet.length, 0)
})

test('dieselbe Adresse und Art ergeben denselben Idempotenzschlüssel', async () => {
  // Eine Wiederholung nach einer Zeitüberschreitung darf keine zweite Mail
  // erzeugen. Der Schlüssel muss deshalb aus der NORMALISIERTEN Adresse
  // gebaut sein — sonst wären „a@…" und „A@…" zwei Vorgänge.
  versendet.length = 0
  const f = fake()
  await sendeBestaetigungsmail(f.client, { email: 'a@example.com', typ: 'newsletter', organizationId: ORG, site: SITE }, versandDoppel)
  await sendeBestaetigungsmail(fake().client, { email: '  A@Example.COM ', typ: 'newsletter', organizationId: ORG, site: SITE }, versandDoppel)

  assert.equal(versendet.length, 2)
  assert.equal(versendet[0].idempotenzSchluessel, 'marketing-optin:newsletter:a@example.com')
  assert.equal(versendet[0].idempotenzSchluessel, versendet[1].idempotenzSchluessel)
})

test('eine andere Einwilligungsart ist ein eigener Vorgang', async () => {
  // Sonst verhinderte die Newsletter-Bestätigungsmail die für Produktinfos.
  versendet.length = 0
  await sendeBestaetigungsmail(fake().client, { email: 'a@example.com', typ: 'produktinfo', organizationId: ORG, site: SITE }, versandDoppel)
  assert.equal(versendet[0].idempotenzSchluessel, 'marketing-optin:produktinfo:a@example.com')
})

test('ein gescheiterter Versand wird als solcher gemeldet', async () => {
  // Das Resend-SDK wirft bei einer Ablehnung nicht. Ein ungeprüftes
  // Ergebnis sähe wie ein Erfolg aus — und die Route MUSS den Fall
  // protokollieren: ohne Mail ist die Anmeldung verloren, seit dem
  // 31.08.2026 gibt es keine Zeile mehr, die sie belegen würde.
  const abgelehnt = (async () => ({ ok: false as const, grund: 'Domain nicht verifiziert' })) as unknown as Versandweg
  const ergebnis = await sendeBestaetigungsmail(
    fake().client,
    { email: 'a@example.com', typ: 'newsletter', organizationId: ORG, site: SITE },
    abgelehnt,
  )

  assert.equal(ergebnis.gesendet, false)
  assert.equal(ergebnis.grund, 'versand_fehlgeschlagen')
  assert.equal(ergebnis.hinweis, 'Domain nicht verifiziert')
})
