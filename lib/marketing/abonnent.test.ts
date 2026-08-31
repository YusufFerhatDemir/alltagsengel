// Verteilereintrag nach bestätigtem Doppel-Opt-in — node:test
// Ausführen: npx tsx --test lib/marketing/abonnent.test.ts  (oder npm run test:unit)
//
// ── DER BEFUND, DEN DIESE SUITE FESTHÄLT ──────────────────────────────────
// Die Doppel-Opt-in-Kette war am 31.08.2026 vollständig gebaut und hätte
// trotzdem nie eine Mail zugestellt: die Bestätigung schrieb NUR
// `marketing_consents`. `ladeMarketingKontakte()` baut die Auswahl aber aus
// profiles, caregivers, newsletter_subscribers und mis_applicants — nicht
// aus den Einwilligungen. Eine Person ohne Konto hätte danach eine gültige
// Einwilligung gehabt und in KEINEM Segment gestanden: dauerhaft
// „0 versandfähig", ohne Fehlermeldung.
//
// Geprüft wird mit dem filter-protokollierenden Doppelgänger, weil die
// tragenden Aussagen Aussagen über Filter sind — der Mandanten-Fence und
// die Adressbindung beim Lesen des Bestands.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '@/__tests__/helpers/supabase-fake'
import { registriereAbonnent } from './abonnent'

const ORG = '00000000-0000-4000-8000-000460629986'

function fake(antwort: (a: FakeAufruf) => { data?: unknown; error?: { message: string } } | undefined) {
  return erstelleFakeSupabase(antwort)
}

/** Kein Bestand, Schreiben gelingt. */
const frisch = () => fake((a) => (a.operation === 'select' ? { data: null } : { data: { id: 'neu-1' } }))

test('eine unbekannte Adresse wird angelegt — mit Mandant und aktiv', async () => {
  const f = frisch()
  const ergebnis = await registriereAbonnent(f.client, ORG, 'Neu@Example.com')

  assert.deepEqual(ergebnis, { ok: true, angelegt: true })
  const insert = f.ersterAuf('newsletter_subscribers', 'insert')
  assert.deepEqual(insert?.payload, {
    organization_id: ORG, email: 'neu@example.com', source: 'doppel_opt_in', active: true,
  })
})

test('der Bestand wird mit Mandanten-Fence UND Adresse gelesen', async () => {
  // Ohne den Fence träfe die Prüfung die Zeile eines fremden Mandanten —
  // und legte dann fälschlich nichts an.
  const f = frisch()
  await registriereAbonnent(f.client, ORG, 'neu@example.com')
  const lesen = f.ersterAuf('newsletter_subscribers', 'select')
  assert.ok(hatOrgFence(lesen, ORG))
  assert.ok(hatFilter(lesen, 'eq', 'email', 'neu@example.com'))
})

test('eine bereits aktive Adresse wird NICHT erneut geschrieben', async () => {
  // Sonst stempelte jede weitere Bestätigung subscribed_at zurück —
  // dieselbe Klasse Fehler wie bei den Monatsabschlüssen, wo ein Upsert
  // Endzustände überschrieb.
  const f = fake((a) => (a.operation === 'select' ? { data: { id: 'a1', active: true } } : { data: { id: 'a1' } }))
  const ergebnis = await registriereAbonnent(f.client, ORG, 'da@example.com')

  assert.deepEqual(ergebnis, { ok: true, angelegt: false })
  assert.equal(f.auf('newsletter_subscribers').filter(a => a.operation !== 'select').length, 0)
})

test('eine früher abgemeldete Adresse wird wieder aktiviert', async () => {
  const f = fake((a) => (a.operation === 'select'
    ? { data: { id: 'a1', active: false } }
    : { data: [{ id: 'a1' }] }))
  const ergebnis = await registriereAbonnent(f.client, ORG, 'zurueck@example.com')

  assert.deepEqual(ergebnis, { ok: true, angelegt: true })
  const update = f.ersterAuf('newsletter_subscribers', 'update')
  const payload = update?.payload as Record<string, unknown>
  assert.equal(payload.active, true)
  // Der Abmeldezeitpunkt MUSS mit weg: sonst stünde an einer aktiven Zeile
  // ein unsubscribed_at, und niemand wüsste, welche Angabe gilt.
  assert.equal(payload.unsubscribed_at, null)
  assert.ok(typeof payload.subscribed_at === 'string')
  assert.ok(hatFilter(update, 'eq', 'id', 'a1'))
})

test('ein Update ohne getroffene Zeile gilt als Fehlschlag, nicht als Erfolg', async () => {
  // PostgREST meldet keinen Fehler, wenn NULL Zeilen getroffen wurden.
  // Ohne diesen Wirkungsnachweis meldete die Funktion „aktiviert", während
  // die Zeile abgemeldet stehen bliebe.
  const f = fake((a) => (a.operation === 'select' ? { data: { id: 'a1', active: false } } : { data: [] }))
  const ergebnis = await registriereAbonnent(f.client, ORG, 'leer@example.com')
  assert.equal(ergebnis.ok, false)
})

test('ein Insert ohne Rückgabe gilt als Fehlschlag', async () => {
  const f = fake((a) => (a.operation === 'select' ? { data: null } : { data: null }))
  const ergebnis = await registriereAbonnent(f.client, ORG, 'leer@example.com')
  assert.equal(ergebnis.ok, false)
})

test('ein Lesefehler wird gemeldet statt verschluckt', async () => {
  const f = fake((a) => (a.operation === 'select' ? { error: { message: 'RLS' } } : { data: { id: 'x' } }))
  const ergebnis = await registriereAbonnent(f.client, ORG, 'a@example.com')
  assert.equal(ergebnis.ok, false)
  assert.match((ergebnis as { grund: string }).grund, /nicht lesbar/)
})

test('ein Schreibfehler kommt als Ergebnis zurück, nicht als Ausnahme', async () => {
  // Der Aufrufer ist der Bestätigungsweg, und dort ist die Einwilligung zu
  // diesem Zeitpunkt bereits eingetragen — die rechtlich tragende Aussage.
  // Ein Fehler beim Verteilereintrag darf die Bestätigungsseite nicht
  // kippen, er ist nachholbar. Deshalb ein Ergebnis statt eines Wurfs.
  const f = fake((a) => (a.operation === 'select' ? { data: null } : { error: { message: 'RLS' } }))
  const ergebnis = await registriereAbonnent(f.client, ORG, 'a@example.com')
  assert.equal(ergebnis.ok, false)
  assert.match((ergebnis as { grund: string }).grund, /nicht schreibbar/)
})

test('eine leere Adresse wird abgewiesen, ohne die Datenbank anzufassen', async () => {
  const f = frisch()
  const ergebnis = await registriereAbonnent(f.client, ORG, '   ')
  assert.equal(ergebnis.ok, false)
  assert.equal(f.aufrufe.length, 0)
})
