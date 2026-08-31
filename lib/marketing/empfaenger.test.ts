// Der Verteiler-Lader — node:test
// Ausführen: npx tsx --test lib/marketing/empfaenger.test.ts  (oder npm run test:unit)
//
// ── WARUM DIESE SUITE ÜBERHAUPT ENTSTEHT ───────────────────────────────────
// `ladeMarketingKontakte` war bis zum 31.08.2026 mit 344 Zeilen das größte
// Modul des Marketings OHNE einen einzigen Test. Es ist zugleich das
// einzige, das das Schema kennt: es entscheidet, WER in einer Kampagne
// steht. Die Segmentregeln darunter waren getestet — aber sie arbeiten auf
// dem, was dieses Modul liefert. Ein Fehler hier ist von unten nicht
// sichtbar.
//
// Geprüft wird deshalb mit dem filter-protokollierenden Doppelgänger und
// nicht mit einem Stub, der je Tabelle eine feste Antwort gibt: mehrere der
// tragenden Aussagen SIND Aussagen über Filter — der Mandanten-Fence auf
// `caregivers`, `.eq('active', true)` auf dem Newsletter, die
// Rollenbeschränkung auf `profiles`. Ein Stub, der Filter verschluckt, kann
// genau diese Fehler prinzipiell nicht finden.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '@/__tests__/helpers/supabase-fake'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import { ladeBereitsErhalten, ladeMarketingKontakte } from './empfaenger'

const FREMDE_ORG = 'e439a567-0000-4000-8000-000000000001'

/** Was jede Tabelle liefert, wenn der Test nichts anderes sagt: nichts. */
type Bestand = Record<string, unknown[]>

interface Aufbau {
  bestand?: Bestand
  /** Tabellen, die einen Lesefehler melden sollen. */
  fehler?: Record<string, string>
}

function fake({ bestand = {}, fehler = {} }: Aufbau = {}) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (fehler[a.tabelle]) return { error: { message: fehler[a.tabelle] } }
    return { data: bestand[a.tabelle] ?? [] }
  })
}

const profil = (ueber: Record<string, unknown> = {}) => ({
  id: 'u1', role: 'kunde', first_name: 'Anna', last_name: 'Muster',
  email: 'anna@example.com', postal_code: '60311', created_at: '2026-08-01T00:00:00Z',
  deleted_at: null, is_test: false, onboarding_completed: true, ...ueber,
})

const akte = (ueber: Record<string, unknown> = {}) => ({
  user_id: null, email: 'engel@example.com', first_name: 'Eva', last_name: 'Engel',
  zip_code: '60311', bundesland: 'Hessen', einsatzfreigabe: true,
  fuehrungszeugnis_gueltig_bis: '2027-01-01', status: 'active',
  vertragsstatus: 'aktiv', austrittsdatum: null, created_at: '2026-08-01T00:00:00Z', ...ueber,
})

// ── Mandantenzaun ─────────────────────────────────────────────────────────

test('ein fremder Mandant bekommt aus profiles NICHTS', async () => {
  // Fail-closed statt fail-open: `profiles` trägt keine organization_id.
  // Würde man sie trotzdem für jeden Mandanten ausliefern, wäre das genau
  // der Cross-Tenant-Leak, der in der Pflege-Schicht schon einmal behoben
  // werden musste.
  const f = fake({ bestand: { profiles: [profil()] } })
  const kontakte = await ladeMarketingKontakte(f.client, FREMDE_ORG)

  assert.equal(f.auf('profiles').length, 0, 'profiles wurde für einen fremden Mandanten gelesen')
  assert.equal(f.auf('bookings').length, 0)
  assert.equal(kontakte.length, 0)
})

test('die Stamm-Organisation liest profiles, und nur die Rollen kunde und engel', async () => {
  const f = fake({ bestand: { profiles: [profil()] } })
  const kontakte = await ladeMarketingKontakte(f.client, DEFAULT_ORG_ID)

  const p = f.ersterAuf('profiles')
  assert.ok(hatFilter(p, 'in', 'role', ['kunde', 'engel']), 'Rollenbeschränkung fehlt')
  assert.equal(kontakte.length, 1)
  assert.equal(kontakte[0].rolle, 'kunde')
  assert.equal(kontakte[0].anzeigename, 'Anna Muster')
})

test('jede Quelle mit organization_id trägt den Mandanten-Fence', async () => {
  const f = fake()
  await ladeMarketingKontakte(f.client, FREMDE_ORG)

  for (const tabelle of ['caregivers', 'newsletter_subscribers', 'mis_applicants']) {
    assert.ok(
      hatOrgFence(f.ersterAuf(tabelle), FREMDE_ORG),
      `${tabelle} ohne Mandanten-Fence gelesen`,
    )
  }
})

test('der Newsletter-Verteiler liest nur aktive Anmeldungen', async () => {
  // Abgemeldete stehen weiter in der Tabelle — nur `active` trennt sie.
  const f = fake()
  await ladeMarketingKontakte(f.client, FREMDE_ORG)
  assert.ok(hatFilter(f.ersterAuf('newsletter_subscribers'), 'eq', 'active', true))
})

// ── Fail-closed: jeder Lesefehler bricht ab ───────────────────────────────

test('jede unlesbare Quelle bricht den Lauf ab — keine halbe Liste', async () => {
  // Eine halb geladene Empfängerliste ist gefährlicher als gar keine: der
  // Trockenlauf zeigte dann eine zu kleine Zahl, und der Versand ginge
  // trotzdem an alle, die beim Versand geladen werden.
  const quellen = ['caregivers', 'newsletter_subscribers', 'mis_applicants', 'coach_users']
  for (const tabelle of quellen) {
    const f = fake({ fehler: { [tabelle]: 'kaputt' } })
    await assert.rejects(
      () => ladeMarketingKontakte(f.client, FREMDE_ORG),
      (err: Error) => err.message.includes('kaputt'),
      `${tabelle}: Lesefehler wurde verschluckt`,
    )
  }
})

test('ein Fehler auf profiles bricht die Stamm-Organisation ab', async () => {
  const f = fake({ fehler: { profiles: 'kaputt' } })
  await assert.rejects(() => ladeMarketingKontakte(f.client, DEFAULT_ORG_ID), /Konten nicht lesbar/)
})

test('unlesbare coach_users bricht ab und nennt die DiPA als Grund', async () => {
  // Eine leere Menge hieße „niemand nutzt den PflegeCoach" — und genau dann
  // ginge Werbung an die Gruppe, die keine bekommen darf (DiPAV §6 Abs. 4).
  const f = fake({ fehler: { coach_users: 'RLS' } })
  await assert.rejects(
    () => ladeMarketingKontakte(f.client, FREMDE_ORG),
    /DiPAV/,
  )
})

// ── DiPA-Riegel ───────────────────────────────────────────────────────────

test('PflegeCoach-Nutzung wird über die Kontokennung markiert', async () => {
  const f = fake({
    bestand: {
      profiles: [profil({ id: 'coach-1' })],
      coach_users: [{ user_id: 'coach-1' }],
    },
  })
  const [k] = await ladeMarketingKontakte(f.client, DEFAULT_ORG_ID)
  assert.equal(k.istDipaNutzer, true)
})

test('PflegeCoach-Nutzung greift auch über die Adresse ohne Kontokennung', async () => {
  // Der eigentliche Fall: dieselbe Person ist Coach-Nutzerin MIT Konto und
  // steht zusätzlich als Newsletter-Anmeldung in der Liste — die trägt
  // keine Kontokennung. Ein Riegel nur auf der Kennung ließe diesen Weg auf.
  const f = fake({
    bestand: {
      profiles: [profil({ id: 'coach-1', email: 'doppel@example.com' })],
      newsletter_subscribers: [{ email: 'DOPPEL@example.com', subscribed_at: '2026-08-02T00:00:00Z', active: true }],
      coach_users: [{ user_id: 'coach-1' }],
    },
  })
  const kontakte = await ladeMarketingKontakte(f.client, DEFAULT_ORG_ID)
  assert.equal(kontakte.length, 1, 'Groß-/Kleinschreibung hat einen zweiten Kontakt erzeugt')
  assert.equal(kontakte[0].istDipaNutzer, true)
})

// ── Zusammenführung ───────────────────────────────────────────────────────

test('dieselbe Adresse aus zwei Quellen ergibt EINEN Kontakt', async () => {
  const f = fake({
    bestand: {
      profiles: [profil({ email: '  Anna@Example.com ' })],
      newsletter_subscribers: [{ email: 'anna@example.com', subscribed_at: '2026-08-02T00:00:00Z', active: true }],
    },
  })
  const kontakte = await ladeMarketingKontakte(f.client, DEFAULT_ORG_ID)
  assert.equal(kontakte.length, 1)
  assert.equal(kontakte[0].email, 'anna@example.com')
  assert.equal(kontakte[0].rolle, 'kunde', '„abonnent" hat die spezifischere Rolle verdrängt')
})

test('eine Anmeldung ohne Konto bleibt Abonnent', async () => {
  const f = fake({
    bestand: {
      newsletter_subscribers: [{ email: 'nur-abo@example.com', subscribed_at: '2026-08-02T00:00:00Z', active: true }],
    },
  })
  const [k] = await ladeMarketingKontakte(f.client, FREMDE_ORG)
  assert.equal(k.rolle, 'abonnent')
  assert.equal(k.userId, null)
})

test('Kontakte ohne Adresse fallen heraus statt als leere Zeile zu stehen', async () => {
  const f = fake({
    bestand: {
      profiles: [profil({ email: null }), profil({ id: 'u2', email: '   ' })],
      mis_applicants: [{ email: null, first_name: 'X', last_name: 'Y', status: null, applied_at: null, created_at: null }],
    },
  })
  assert.deepEqual(await ladeMarketingKontakte(f.client, DEFAULT_ORG_ID), [])
})

test('die Mitarbeiterakte ergänzt das Konto, sie ersetzt es nicht', async () => {
  const f = fake({
    bestand: {
      profiles: [profil({ id: 'u9', role: 'engel', email: 'eva@example.com' })],
      caregivers: [akte({ user_id: 'u9', email: 'eva@example.com', einsatzfreigabe: true })],
    },
  })
  const kontakte = await ladeMarketingKontakte(f.client, DEFAULT_ORG_ID)
  assert.equal(kontakte.length, 1)
  assert.equal(kontakte[0].anzeigename, 'Anna Muster', 'die Akte hat den Namen des Kontos überschrieben')
  assert.equal(kontakte[0].einsatzfreigabe, true)
  assert.equal(kontakte[0].vertragsstatus, 'aktiv')
})

// ── Beschäftigungsstand (Befund vom 31.08.2026) ───────────────────────────

test('Vertragsstatus und Austrittsdatum kommen am Kontakt an — mit Konto', async () => {
  // Der tragende Fall: die Person HAT ein Konto, der Beschäftigungsstand
  // steht aber nur in der Akte. Landet er beim Zusammenführen nicht auf dem
  // Kontakt, fällt genau die ausgeschiedene Mitarbeiterin mit Konto durch.
  const f = fake({
    bestand: {
      profiles: [profil({ id: 'u9', role: 'engel', email: 'eva@example.com' })],
      caregivers: [akte({
        user_id: 'u9', email: 'eva@example.com',
        vertragsstatus: 'ausgeschieden', austrittsdatum: '2026-07-31',
      })],
    },
  })
  const [k] = await ladeMarketingKontakte(f.client, DEFAULT_ORG_ID)
  assert.equal(k.vertragsstatus, 'ausgeschieden')
  assert.equal(k.ausgetretenAm, '2026-07-31')
})

test('Vertragsstatus und Austrittsdatum kommen am Kontakt an — ohne Konto', async () => {
  const f = fake({
    bestand: {
      caregivers: [akte({ vertragsstatus: 'gekuendigt', austrittsdatum: '2026-09-30' })],
    },
  })
  const [k] = await ladeMarketingKontakte(f.client, FREMDE_ORG)
  assert.equal(k.rolle, 'engel')
  assert.equal(k.vertragsstatus, 'gekuendigt')
  assert.equal(k.ausgetretenAm, '2026-09-30')
})

test('die Akte wird mit den Spalten gelesen, die der Beschäftigungsstand braucht', async () => {
  // Ohne diese beiden Spalten im select() käme der Wert nie an, und die
  // Segmentregel liefe dauerhaft auf null — sie wäre still wirkungslos.
  const f = fake()
  await ladeMarketingKontakte(f.client, FREMDE_ORG)
  const spalten = f.ersterAuf('caregivers')?.spalten ?? ''
  assert.ok(spalten.includes('vertragsstatus'), 'vertragsstatus fehlt im select()')
  assert.ok(spalten.includes('austrittsdatum'), 'austrittsdatum fehlt im select()')
})

// ── Aktivitätsspur ────────────────────────────────────────────────────────

test('Buchungen zählen für beide Seiten und führen zum jüngsten Zeitpunkt', async () => {
  const f = fake({
    bestand: {
      profiles: [
        profil({ id: 'kunde-1', email: 'k@example.com' }),
        profil({ id: 'engel-1', role: 'engel', email: 'e@example.com' }),
      ],
      bookings: [
        { customer_id: 'kunde-1', angel_id: 'engel-1', date: '2026-08-10', created_at: '2026-08-09' },
        { customer_id: 'kunde-1', angel_id: 'engel-1', date: '2026-08-20', created_at: '2026-08-19' },
      ],
    },
  })
  const kontakte = await ladeMarketingKontakte(f.client, DEFAULT_ORG_ID)
  for (const k of kontakte) {
    assert.equal(k.anzahlBuchungen, 2, `${k.email} hat die falsche Buchungszahl`)
    assert.equal(k.letzteBuchung, '2026-08-20')
  }
})

test('Buchungen werden nur für den eigenen Mandanten gezählt', async () => {
  const f = fake()
  await ladeMarketingKontakte(f.client, DEFAULT_ORG_ID)
  assert.ok(hatOrgFence(f.ersterAuf('bookings'), DEFAULT_ORG_ID))
})

test('qualifiziert ist auch ohne Zertifizierung wahr, wenn eine Qualifikation hinterlegt ist', async () => {
  // Live steht `is_certified` durchweg auf false, während `qualification`
  // belegt ist — nur auf is_certified zu prüfen ergäbe ein leeres Segment.
  const f = fake({
    bestand: {
      profiles: [profil({ id: 'engel-1', role: 'engel', email: 'e@example.com' })],
      angels: [{ id: 'engel-1', is_certified: false, qualification: 'Betreuungskraft §43b' }],
      angel_availability: [{ angel_id: 'engel-1' }, { angel_id: 'engel-1' }],
    },
  })
  const [k] = await ladeMarketingKontakte(f.client, DEFAULT_ORG_ID)
  assert.equal(k.qualifiziert, true)
  assert.equal(k.verfuegbarkeitsFenster, 2)
})

test('eine leere Qualifikation zählt nicht als qualifiziert', async () => {
  const f = fake({
    bestand: {
      profiles: [profil({ id: 'engel-1', role: 'engel', email: 'e@example.com' })],
      angels: [{ id: 'engel-1', is_certified: false, qualification: '   ' }],
    },
  })
  const [k] = await ladeMarketingKontakte(f.client, DEFAULT_ORG_ID)
  assert.equal(k.qualifiziert, false)
})

test('gelöschte und Testkonten werden geladen, aber als solche markiert', async () => {
  // Sie fallen erst in der Segmentregel heraus (`echterKontakt`). Hier
  // stehen sie noch — sonst ließe sich im Trockenlauf nicht aufschlüsseln,
  // WARUM jemand nicht angeschrieben wird.
  const f = fake({
    bestand: {
      profiles: [
        profil({ id: 'a', email: 'weg@example.com', deleted_at: '2026-08-01T00:00:00Z' }),
        profil({ id: 'b', email: 'test@example.com', is_test: true }),
      ],
    },
  })
  const kontakte = await ladeMarketingKontakte(f.client, DEFAULT_ORG_ID)
  assert.equal(kontakte.find((k) => k.email === 'weg@example.com')?.istGeloescht, true)
  assert.equal(kontakte.find((k) => k.email === 'test@example.com')?.istTestkonto, true)
})

// ── Doppelversand-Sperre ──────────────────────────────────────────────────

test('bereits erhaltene Adressen kommen normalisiert zurück', async () => {
  const f = fake({
    bestand: { email_campaign_logs: [{ empfaenger: ' Anna@Example.com ' }, { empfaenger: 'b@example.com' }] },
  })
  const menge = await ladeBereitsErhalten(f.client, 'kampagne-1')
  assert.ok(menge.has('anna@example.com'))
  assert.equal(menge.size, 2)
  assert.ok(hatFilter(f.ersterAuf('email_campaign_logs'), 'eq', 'campaign_id', 'kampagne-1'))
})

test('eine unlesbare Zustellspur wirft statt „hat noch niemand bekommen" zu melden', async () => {
  const f = fake({ fehler: { email_campaign_logs: 'kaputt' } })
  await assert.rejects(() => ladeBereitsErhalten(f.client, 'kampagne-1'), /Zustellspur nicht lesbar/)
})
