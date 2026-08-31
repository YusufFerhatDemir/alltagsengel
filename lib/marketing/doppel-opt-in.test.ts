// Doppel-Opt-in-Token — node:test
// Ausführen: npx tsx --test lib/marketing/doppel-opt-in.test.ts
//
// Das Token ist der GANZE Schwebezustand zwischen Anfrage und Bestätigung —
// es gibt keine Tabelle daneben. Fällt hier etwas durch, entsteht entweder
// eine Einwilligung ohne Bestätigung (das Verfahren wäre wertlos) oder gar
// keine (der Weg wäre kaputt). Die Tests prüfen deshalb beide Richtungen.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bestaetigungsLink, erzeugeOptInToken, istConsentTyp, pruefeOptInToken,
  GUELTIGKEIT_TAGE,
} from './doppel-opt-in'
import { erzeugeAbmeldeToken } from '../newsletter/abmelde-token'

const ENV = { MARKETING_OPTIN_SECRET: 'x'.repeat(32) } as unknown as NodeJS.ProcessEnv
const ORG = '00000000-0000-4000-8000-000460629986'
const T0 = 1_756_000_000_000

// ── Der Normalfall ────────────────────────────────────────────────────────

test('ein frisch erzeugtes Token ist gültig', () => {
  const t = erzeugeOptInToken('a@example.com', 'newsletter', ORG, ENV, T0)
  const p = pruefeOptInToken('a@example.com', 'newsletter', ORG, t.wert, ENV, T0 + 1000)
  assert.equal(p.gueltig, true)
})

test('Adressen werden vor dem Signieren normalisiert', () => {
  // Sonst erzeugten 'Max@Example.COM' und 'max@example.com' verschiedene
  // Token für dieselbe Zeile — die Tabelle speichert kleingeschrieben.
  const t = erzeugeOptInToken('  Max@Example.COM ', 'newsletter', ORG, ENV, T0)
  const p = pruefeOptInToken('max@example.com', 'newsletter', ORG, t.wert, ENV, T0)
  assert.equal(p.gueltig, true)
})

// ── Bindung: was das Token alles festhält ─────────────────────────────────

test('ein Token für eine andere Adresse gilt nicht', () => {
  const t = erzeugeOptInToken('a@example.com', 'newsletter', ORG, ENV, T0)
  const p = pruefeOptInToken('b@example.com', 'newsletter', ORG, t.wert, ENV, T0)
  assert.deepEqual(p, { gueltig: false, grund: 'signatur' })
})

test('ein Token für eine andere Einwilligungsart gilt nicht', () => {
  // Sonst ließe sich ein Link für „Umfragen" zu einer
  // Newsletter-Einwilligung umbiegen.
  const t = erzeugeOptInToken('a@example.com', 'umfragen', ORG, ENV, T0)
  const p = pruefeOptInToken('a@example.com', 'newsletter', ORG, t.wert, ENV, T0)
  assert.deepEqual(p, { gueltig: false, grund: 'signatur' })
})

test('ein Token für einen anderen Mandanten gilt nicht', () => {
  const t = erzeugeOptInToken('a@example.com', 'newsletter', ORG, ENV, T0)
  const p = pruefeOptInToken(
    'a@example.com', 'newsletter', '11111111-1111-4111-8111-111111111111', t.wert, ENV, T0,
  )
  assert.deepEqual(p, { gueltig: false, grund: 'signatur' })
})

// ── Ablauf ────────────────────────────────────────────────────────────────

test('nach der Gültigkeitsdauer ist das Token abgelaufen', () => {
  const t = erzeugeOptInToken('a@example.com', 'newsletter', ORG, ENV, T0)
  const spaeter = T0 + (GUELTIGKEIT_TAGE * 86_400_000) + 1000
  const p = pruefeOptInToken('a@example.com', 'newsletter', ORG, t.wert, ENV, spaeter)
  assert.deepEqual(p, { gueltig: false, grund: 'abgelaufen' })
})

test('kurz vor Ablauf gilt es noch', () => {
  const t = erzeugeOptInToken('a@example.com', 'newsletter', ORG, ENV, T0)
  const p = pruefeOptInToken('a@example.com', 'newsletter', ORG, t.wert, ENV, t.ablauf - 1)
  assert.equal(p.gueltig, true)
})

test('ein verlängerter Ablauf fällt durch die Signatur', () => {
  // Der Ablauf steht im Klartext IM Token — er ist aber Teil des
  // signierten Inhalts. Wer ihn hochsetzt, zerstört die Signatur.
  const t = erzeugeOptInToken('a@example.com', 'newsletter', ORG, ENV, T0)
  const [, signatur] = t.wert.split('.')
  const weit = (T0 + 10 * 365 * 86_400_000).toString(36)
  const p = pruefeOptInToken('a@example.com', 'newsletter', ORG, `${weit}.${signatur}`, ENV, T0)
  assert.deepEqual(p, { gueltig: false, grund: 'signatur' })
})

// ── Fail-closed ───────────────────────────────────────────────────────────

test('unbrauchbare Eingaben ergeben nie „gültig"', () => {
  for (const wert of [null, undefined, '', 'kein-punkt', '.', 'zzz.', 42, {}]) {
    const p = pruefeOptInToken('a@example.com', 'newsletter', ORG, wert, ENV, T0)
    assert.equal(p.gueltig, false, `unerwartet gültig: ${JSON.stringify(wert)}`)
  }
})

test('eine unbekannte Einwilligungsart gilt nie', () => {
  const t = erzeugeOptInToken('a@example.com', 'newsletter', ORG, ENV, T0)
  const p = pruefeOptInToken('a@example.com', 'erfunden', ORG, t.wert, ENV, T0)
  assert.deepEqual(p, { gueltig: false, grund: 'form' })
})

test('ohne Schlüsselquelle wird nichts gültig', () => {
  const leer = {} as unknown as NodeJS.ProcessEnv
  const p = pruefeOptInToken('a@example.com', 'newsletter', ORG, 'aa.bb', leer, T0)
  assert.equal(p.gueltig, false)
})

test('ein anderer Schlüssel ergibt eine andere Signatur', () => {
  const t = erzeugeOptInToken('a@example.com', 'newsletter', ORG, ENV, T0)
  const anders = { MARKETING_OPTIN_SECRET: 'y'.repeat(32) } as unknown as NodeJS.ProcessEnv
  const p = pruefeOptInToken('a@example.com', 'newsletter', ORG, t.wert, anders, T0)
  assert.deepEqual(p, { gueltig: false, grund: 'signatur' })
})

test('das Abmelde-Token taugt nicht als Bestätigung', () => {
  // Die Ableitungskennung ist bewusst eine andere. Ein Abmeldelink steht
  // in jeder Werbemail — wäre er als Bestätigung verwendbar, könnte sich
  // jeder mit einem alten Link selbst wieder anmelden lassen.
  const fremd = erzeugeAbmeldeToken('a@example.com', {
    NEWSLETTER_ABMELDE_SECRET: 'x'.repeat(32),
  } as unknown as NodeJS.ProcessEnv)
  const p = pruefeOptInToken(
    'a@example.com', 'newsletter', ORG, `${T0.toString(36)}.${fremd}`, ENV, T0 - 1,
  )
  assert.equal(p.gueltig, false)
})

// ── Der Link ──────────────────────────────────────────────────────────────

test('der Bestätigungslink trägt Adresse, Art und Token', () => {
  const { link } = bestaetigungsLink(
    'a@example.com', 'produktinfo', ORG, 'https://alltagsengel.care/', ENV, T0,
  )
  const url = new URL(link)
  assert.equal(url.pathname, '/api/marketing/bestaetigung')
  assert.equal(url.searchParams.get('email'), 'a@example.com')
  assert.equal(url.searchParams.get('typ'), 'produktinfo')

  const p = pruefeOptInToken(
    'a@example.com', 'produktinfo', ORG, url.searchParams.get('token'), ENV, T0,
  )
  assert.equal(p.gueltig, true)
})

test('istConsentTyp kennt nur die vier Arten', () => {
  assert.equal(istConsentTyp('newsletter'), true)
  assert.equal(istConsentTyp('umfragen'), true)
  assert.equal(istConsentTyp('werbung'), false)
  assert.equal(istConsentTyp(null), false)
})
