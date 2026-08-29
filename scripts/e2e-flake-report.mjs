#!/usr/bin/env node
/**
 * Macht flackernde Playwright-Tests im CI-Protokoll SICHTBAR.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM ES DIESES SKRIPT GIBT
 * ────────────────────────────────────────────────────────────────────────────
 * `playwright.config.ts` setzt in CI `retries: 2`. Das ist richtig — ein zaeher
 * Mirror oder eine haengende Nebenressource soll keinen Merge blockieren. Es
 * hat aber eine Kehrseite: ein Test, der im ersten Versuch an einem ECHTEN
 * Fehler scheitert und im zweiten zufaellig durchkommt, faerbt den Job GRUEN.
 *
 * Genau das ist am 28.08.2026 passiert (Lauf 33221611581): „133 passed,
 * 6 skipped, 1 flaky". Das eine `flaky` war kein Rauschen, sondern der
 * Cookie-Banner, der auf `mobile-safari` den Absende-Knopf der Registrierung
 * vollstaendig verdeckte — reproduzierbar, jedes Mal, sobald sein 800-ms-Timer
 * abgelaufen war. Der Befund stand im Protokoll und ist niemandem aufgefallen,
 * weil daneben ein gruener Haken stand.
 *
 * Dieses Skript schreibt die Flackerer deshalb in die GitHub-Job-Zusammenfassung
 * — dorthin, wo man hinsieht, ohne 2.500 Protokollzeilen zu oeffnen.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM ES NICHT ROT MACHT
 * ────────────────────────────────────────────────────────────────────────────
 * `--fail-on-flaky-tests` waere die harte Fassung. Sie ist hier bewusst NICHT
 * gewaehlt: die Installationsschritte dieses Jobs haengen an apt-Mirrors und
 * Browser-Downloads, und deren Aussetzer haben mit dem Code nichts zu tun.
 * Ein Flackerer soll auffallen, nicht blockieren. Das Skript endet immer mit 0
 * und sagt ausdruecklich, wenn es nichts auswerten konnte — es tut NICHT so,
 * als haette es geprueft.
 */
import { readFileSync, appendFileSync, existsSync } from 'node:fs'

const BERICHT = process.argv[2] ?? 'playwright-report/results.json'

/** ANSI-Steuersequenzen aus einem Fehlertext entfernen. */
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')

function ausgeben(zeilen) {
  const text = zeilen.join('\n')
  console.log(text)
  const ziel = process.env.GITHUB_STEP_SUMMARY
  if (ziel) {
    try {
      appendFileSync(ziel, text + '\n')
    } catch (fehler) {
      console.log(`(Job-Zusammenfassung nicht beschreibbar: ${fehler.message})`)
    }
  }
}

if (!existsSync(BERICHT)) {
  ausgeben([
    '### E2E-Flackerbericht: UEBERSPRUNGEN',
    '',
    `Kein JSON-Bericht unter \`${BERICHT}\`. Der Lauf ist womoeglich vor dem`,
    'Schreiben des Berichts abgebrochen — hier wurde NICHTS geprueft.',
  ])
  process.exit(0)
}

let bericht
try {
  bericht = JSON.parse(readFileSync(BERICHT, 'utf8'))
} catch (fehler) {
  ausgeben([
    '### E2E-Flackerbericht: UEBERSPRUNGEN',
    '',
    `\`${BERICHT}\` ist nicht lesbar: ${fehler.message}`,
  ])
  process.exit(0)
}

/** Laeuft den verschachtelten suites-Baum ab und sammelt jeden Testfall ein. */
function* faelle(knoten) {
  for (const suite of knoten.suites ?? []) yield* faelle(suite)
  for (const spec of knoten.specs ?? []) {
    for (const test of spec.tests ?? []) {
      yield { titel: spec.title, datei: spec.file, projekt: test.projectName, test }
    }
  }
}

const alle = [...faelle(bericht)]
const flackernd = alle.filter((f) => f.test.status === 'flaky')

const zeilen = ['### E2E-Flackerbericht', '']

if (alle.length === 0) {
  zeilen.push('Der Bericht enthaelt keine Testfaelle — hier wurde NICHTS geprueft.')
} else if (flackernd.length === 0) {
  zeilen.push(`Kein Flackern: ${alle.length} Testfaelle, alle im ERSTEN Versuch entschieden.`)
} else {
  zeilen.push(
    `**${flackernd.length} von ${alle.length} Testfaellen sind erst im Wiederholungsversuch durchgekommen.**`,
    '',
    'Ein Flackerer ist ein Befund, kein Rauschen: derselbe Lauf ohne',
    '`retries` waere ROT gewesen. Ursache klaeren, nicht wegdrehen.',
    '',
  )
  for (const f of flackernd) {
    const erster = f.test.results?.[0]
    const grund = (erster?.error?.message ?? '(kein Fehlertext im Bericht)')
      .replace(ANSI, '')
      .split('\n')[0]
      .slice(0, 220)
    zeilen.push(`- \`${f.projekt}\` — ${f.datei} › ${f.titel}`, `  - erster Versuch: ${grund}`)
  }
}

ausgeben(zeilen)
process.exit(0)
