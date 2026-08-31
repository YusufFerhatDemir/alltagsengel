// Befristung der Kontoüberwachung — node:test
// Ausführen: npx tsx --test lib/security/befristung.test.ts  (oder npm run test:unit)
//
// ── DER BEFUND, DEN DIESE SUITE FESTHÄLT ──────────────────────────────────
// `security_watchlist` kannte am 31.08.2026 nur `aktiv` und kein Ende. Ein
// einmal gesetzter Eintrag zeichnete Anmeldungen, Geräte und IP-Adressen
// einer namentlich bekannten Person auf, bis jemand daran dachte, ihn
// abzuschalten. Live stand genau ein solcher Eintrag.
//
// Die Regeln hier sind reine Funktionen mit ausdrücklichem Bezugsdatum —
// „läuft in drei Tagen ab" wäre gegen die Systemuhr nicht prüfbar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  befristungFuer, istAbgelaufen, pruefeAngaben, neuesFristende,
  HOECHSTDAUER_TAGE, WARNUNG_AB_TAGEN, PFLICHTANGABEN, BEGRUENDUNG_VORLAGE,
} from './befristung'

const HEUTE = new Date('2026-08-31T12:00:00Z')
const vorTagen = (n: number) => new Date(HEUTE.getTime() - n * 86_400_000).toISOString()

// ── Frist ────────────────────────────────────────────────────────────────

test('ein frischer Eintrag läuft und nennt sein Ende', () => {
  const b = befristungFuer(vorTagen(0), HEUTE)
  assert.equal(b.abgelaufen, false)
  assert.equal(b.laeuftBaldAb, false)
  assert.equal(b.restTage, HOECHSTDAUER_TAGE)
  assert.match(b.hinweis, /Befristet bis/)
})

test('nach der Höchstdauer ist der Eintrag abgelaufen', () => {
  assert.equal(istAbgelaufen(vorTagen(HOECHSTDAUER_TAGE + 1), HEUTE), true)
  assert.equal(istAbgelaufen(vorTagen(HOECHSTDAUER_TAGE - 1), HEUTE), false)
})

test('die Frist greift am Tag des Ablaufs, nicht erst danach', () => {
  // Genau auf der Grenze. Ohne diese Prüfung hinge es an einem >= gegen >,
  // und die Überwachung liefe einen Tag länger als angeordnet.
  const b = befristungFuer(vorTagen(HOECHSTDAUER_TAGE), HEUTE)
  assert.equal(b.abgelaufen, true)
})

test('kurz vor Ablauf wird gewarnt', () => {
  const b = befristungFuer(vorTagen(HOECHSTDAUER_TAGE - WARNUNG_AB_TAGEN), HEUTE)
  assert.equal(b.abgelaufen, false)
  assert.equal(b.laeuftBaldAb, true)
  assert.match(b.hinweis, /Läuft am .* ab/)
})

test('ohne belegtes Anlagedatum gilt der Eintrag als abgelaufen', () => {
  // Die Richtung des fail-closed ist hier eine andere als sonst im Modul:
  // das Risiko ist nicht die verpasste Meldung, sondern die unbemerkt
  // weiterlaufende Beobachtung eines Menschen.
  for (const wert of [null, undefined, '', 'kein datum']) {
    const b = befristungFuer(wert, HEUTE)
    assert.equal(b.abgelaufen, true, `${wert} wurde als laufend gewertet`)
    assert.match(b.hinweis, /keine Frist bestimmen/)
  }
})

test('der Hinweis beschönigt einen abgelaufenen Eintrag nicht', () => {
  const b = befristungFuer(vorTagen(HOECHSTDAUER_TAGE + 30), HEUTE)
  assert.match(b.hinweis, /abgelaufen/)
  assert.match(b.hinweis, /wirkt nicht mehr/)
  assert.ok(b.restTage < 0)
})

// ── Das angeordnete Fristende (Migration 20261024000000) ─────────────────
//
// Die Spalte `befristet_bis` darf das Ende nur VORZIEHEN. Koennte sie es
// hinausschieben, waere die 90-Tage-Regel des Anwendungscodes durch einen
// Wert in der Datenbank aushebelbar — und damit keine Regel mehr.

test('ein früheres angeordnetes Ende gilt', () => {
  const b = befristungFuer(vorTagen(0), HEUTE, new Date(HEUTE.getTime() + 10 * 86_400_000).toISOString())
  assert.equal(b.restTage, 10)
  assert.equal(b.abgelaufen, false)
  assert.equal(b.quelle, 'angeordnet')
})

test('ein späteres angeordnetes Ende verlängert NICHT', () => {
  const b = befristungFuer(vorTagen(0), HEUTE, new Date(HEUTE.getTime() + 900 * 86_400_000).toISOString())
  assert.equal(b.restTage, HOECHSTDAUER_TAGE)
  assert.equal(b.quelle, 'hoechstdauer')
})

test('ein bereits verstrichenes angeordnetes Ende lässt den Eintrag ablaufen', () => {
  // Der Fall, für den die Spalte da ist: kürzer angeordnet als die
  // Höchstdauer, und diese kürzere Frist ist vorbei.
  const b = befristungFuer(vorTagen(20), HEUTE, vorTagen(3))
  assert.equal(b.abgelaufen, true)
  assert.equal(istAbgelaufen(vorTagen(20), HEUTE, vorTagen(3)), true)
  // Ohne die Spalte liefe derselbe Eintrag weiter — das ist der
  // Unterschied, den die Migration macht.
  assert.equal(istAbgelaufen(vorTagen(20), HEUTE), false)
})

test('ein gesetztes, aber unlesbares Ende lässt den Eintrag ablaufen', () => {
  // Dieselbe Richtung des fail-closed wie beim fehlenden Anlagedatum:
  // im Zweifel endet die Beobachtung, sie läuft nicht weiter.
  const b = befristungFuer(vorTagen(0), HEUTE, 'kein datum')
  assert.equal(b.abgelaufen, true)
  assert.equal(b.quelle, 'unbestimmbar')
  assert.match(b.hinweis, /nicht lesbar/)
})

test('kein angeordnetes Ende ändert nichts am bisherigen Verhalten', () => {
  for (const wert of [null, undefined, '']) {
    const b = befristungFuer(vorTagen(10), HEUTE, wert)
    assert.equal(b.restTage, HOECHSTDAUER_TAGE - 10, String(wert))
    assert.equal(b.quelle, 'hoechstdauer')
  }
})

// ── Die neue Anordnung ───────────────────────────────────────────────────

test('neuesFristende liegt genau eine Höchstdauer in der Zukunft', () => {
  const ende = neuesFristende(HEUTE)
  assert.equal(Date.parse(ende) - HEUTE.getTime(), HOECHSTDAUER_TAGE * 86_400_000)
})

test('eine neue Anordnung ist danach nicht abgelaufen — sonst gäbe es keinen Rückweg', () => {
  // Der Befund vom 01.09.2026: ein abgelaufener Eintrag ließ sich nicht
  // wieder anordnen, weil die Frist an einem `created_at` hing, das beim
  // Einschalten nie mitwanderte.
  const b = befristungFuer(HEUTE.toISOString(), HEUTE, neuesFristende(HEUTE))
  assert.equal(b.abgelaufen, false)
  assert.equal(b.restTage, HOECHSTDAUER_TAGE)
})

// ── Die vier Pflichtangaben ──────────────────────────────────────────────

const VOLLSTAENDIG = [
  'Zweck: Klärung wiederholter Anmeldungen aus unbekannten Netzen.',
  'Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO, § 26 Abs. 1 BDSG.',
  'Zeitraum: bis 30.11.2026, danach Neubewertung.',
  'Transparenz: Person am 30.08.2026 schriftlich informiert.',
].join('\n')

test('eine vollständige Begründung wird angenommen', () => {
  const b = pruefeAngaben(VOLLSTAENDIG)
  assert.equal(b.ok, true)
  assert.deepEqual(b.fehlend, [])
})

test('jede einzelne fehlende Angabe wird benannt', () => {
  for (const p of PFLICHTANGABEN) {
    const ohne = VOLLSTAENDIG
      .split('\n')
      .filter(z => !z.startsWith(p.marke))
      .join('\n')
    const b = pruefeAngaben(ohne)
    assert.equal(b.ok, false, `${p.name} fehlte und wurde trotzdem angenommen`)
    assert.deepEqual(b.fehlend, [p.name])
  }
})

test('eine leere Marke zählt als fehlend', () => {
  // Sonst ließe sich die Pflicht erfüllen, indem man die Vorlage einfügt
  // und nichts hineinschreibt — das sähe aus wie eine Dokumentation und
  // wäre keine.
  const b = pruefeAngaben(BEGRUENDUNG_VORLAGE)
  assert.equal(b.ok, false)
  assert.equal(b.fehlend.length, PFLICHTANGABEN.length)
})

test('die Reihenfolge der Angaben ist egal', () => {
  const gedreht = VOLLSTAENDIG.split('\n').reverse().join('\n')
  assert.equal(pruefeAngaben(gedreht).ok, true)
})

test('Groß- und Kleinschreibung der Marken ist egal', () => {
  assert.equal(pruefeAngaben(VOLLSTAENDIG.toLowerCase()).ok, true)
})

test('ein langer Fließtext ohne Marken reicht NICHT', () => {
  // Genau das war der Stand vorher: 40 Zeichen genügten, und was drinstand,
  // prüfte niemand.
  const fliesstext = 'Wir beobachten dieses Konto, weil es in der letzten Woche '
    + 'mehrfach auffällig war und wir das genauer verstehen möchten.'
  assert.ok(fliesstext.length > 40)
  const b = pruefeAngaben(fliesstext)
  assert.equal(b.ok, false)
  assert.equal(b.fehlend.length, 4)
  assert.match(b.meldung, /Zweck, Rechtsgrundlage, Zeitraum/)
})

test('die Vorlage enthält genau die vier Marken', () => {
  for (const p of PFLICHTANGABEN) assert.ok(BEGRUENDUNG_VORLAGE.includes(p.marke), p.name)
  assert.equal(BEGRUENDUNG_VORLAGE.split('\n').length, PFLICHTANGABEN.length)
})
