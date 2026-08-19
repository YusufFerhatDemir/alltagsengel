// PflegeCoach Schalterverzeichnis — node:test
// Ausführen: npx tsx --test lib/coach/schalter.test.ts  (oder npm run test:unit)
//
// ═══════════════════════════════════════════════════════════════
// Der wichtigste Test hier ist der VOLLSTÄNDIGKEITSTEST: Ein Verzeichnis,
// das man vergessen kann zu pflegen, ist schlechter als keines — es
// suggeriert Übersicht, die es nicht mehr gibt. Deshalb wird der
// Quelltext nach `*_ENV`-Konstanten durchsucht und gegen das Verzeichnis
// gehalten. Wer einen neuen Schalter einführt, kommt hier nicht vorbei.
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COACH_SCHALTER, formatiereSchalter, schalterStand, zulassungsgebundeneAbweichungen,
} from './schalter'
import { COACH_DIPA_MODUS_ENV, COACH_FREISCHALTUNG_ENV, COACH_NUTZUNGSNACHWEIS_ENV } from './config'
import { COACH_PREISE_FREIGEGEBEN_ENV } from './pricing'
import { COACH_MFA_PFLICHT_ENV } from './mfa'

const WURZEL = fileURLToPath(new URL('../../', import.meta.url))

// ── 1. Vollständigkeit ─────────────────────────────────────────

/**
 * Sammelt alle Umgebungsvariablen-Namen, die in lib/coach als Konstante
 * deklariert sind — das ist die Hausregel: kein `process.env.X` direkt im
 * Code, sondern eine benannte Konstante. Diese Regel prüft Abschnitt 4.
 */
function deklarierteEnvNamen(): Map<string, string> {
  const treffer = new Map<string, string>()
  const muster = /export const [A-Z_0-9]+(?:_ENV|_PEPPER) = '([A-Z_0-9]+)'/g
  const verzeichnis = join(WURZEL, 'lib/coach')
  for (const datei of readdirSync(verzeichnis)) {
    if (!datei.endsWith('.ts') || datei.endsWith('.test.ts')) continue
    const text = readFileSync(join(verzeichnis, datei), 'utf8')
    for (const m of text.matchAll(muster)) treffer.set(m[1], `lib/coach/${datei}`)
  }
  return treffer
}

test('jede in lib/coach deklarierte Umgebungsvariable steht im Verzeichnis', () => {
  const bekannt = new Set(COACH_SCHALTER.map(s => s.env))
  const fehlend: string[] = []
  for (const [name, datei] of deklarierteEnvNamen()) {
    if (!bekannt.has(name)) fehlend.push(`${name} (${datei})`)
  }
  assert.deepEqual(
    fehlend, [],
    'Nicht verzeichnete Schalter — ein Schalter ohne Eintrag ist ein Schalter, den beim ' +
    `Deployment niemand bewertet hat:\n${fehlend.join('\n')}`
  )
})

test('das Verzeichnis führt keine Schalter, die es im Code nicht gibt', () => {
  // Gegenprobe: Ein Eintrag für eine gelöschte Variable täuscht eine
  // Schutzwirkung vor, die nicht mehr existiert.
  const quellen = [
    ...readdirSync(join(WURZEL, 'lib/coach'))
      .filter(d => d.endsWith('.ts'))
      .map(d => readFileSync(join(WURZEL, 'lib/coach', d), 'utf8')),
    readFileSync(join(WURZEL, 'app/api/coach/webhook/route.ts'), 'utf8'),
  ].join('\n')

  const verwaist = COACH_SCHALTER.filter(s => !quellen.includes(`'${s.env}'`))
  assert.deepEqual(
    verwaist.map(s => s.env), [],
    'Verzeichnete Schalter, die im Code nicht mehr vorkommen'
  )
})

test('jeder Eintrag ist vollständig ausgefüllt', () => {
  const namen = new Set<string>()
  for (const s of COACH_SCHALTER) {
    assert.ok(!namen.has(s.env), `Doppelter Eintrag: ${s.env}`)
    namen.add(s.env)
    assert.match(s.env, /^COACH_[A-Z_0-9]+$/, `${s.env}: unerwartete Namensform`)
    assert.ok(s.titel.trim().length >= 5, `${s.env}: titel fehlt`)
    assert.match(s.modul, /^(lib|app)\/[\w/[\]-]+\.tsx?/, `${s.env}: modul nennt keinen Pfad`)
    // Die Begründungsfelder tragen die eigentliche Arbeit — ein Einzeiler
    // dort ist ein nicht bewerteter Schalter mit Alibi-Eintrag.
    for (const feld of ['wirkung', 'voraussetzung', 'risiko'] as const) {
      assert.ok(s[feld].trim().length > 20, `${s.env}: Feld ${feld} ist leer oder zu knapp`)
    }
  }
})

// ── 2. Sichere Voreinstellungen ────────────────────────────────

test('alle zulassungsgebundenen Schalter sind aus-sicher und aus-default', () => {
  // Die Kernzusage des Produkts: Ohne BfArM-Listung darf keine
  // Erstattungs- oder Zulassungsaussage erreichbar sein. Ein
  // zulassungsgebundener Schalter, dessen Default nicht der sichere Stand
  // ist, hebelte das aus — ein vergessenes Setzen wäre dann der Fehler
  // statt der Normalfall.
  for (const s of COACH_SCHALTER.filter(x => x.zulassungsgebunden)) {
    assert.equal(s.sicherer_stand, 'aus', `${s.env}: sicherer Stand muss 'aus' sein`)
    assert.equal(s.default_ist_sicher, true, `${s.env}: Default muss der sichere Stand sein`)
  }
})

test('die vier zulassungsgebundenen Schalter sind namentlich verzeichnet', () => {
  assert.deepEqual(
    COACH_SCHALTER.filter(s => s.zulassungsgebunden).map(s => s.env).sort(),
    [
      COACH_DIPA_MODUS_ENV, COACH_FREISCHALTUNG_ENV,
      COACH_NUTZUNGSNACHWEIS_ENV, COACH_PREISE_FREIGEGEBEN_ENV,
    ].sort()
  )
})

test('MFA-Pflicht ist der einzige Schalter, dessen sicherer Stand nicht der Default ist', () => {
  // Wenn ein zweiter solcher Schalter entsteht, ist das eine bewusste
  // Entscheidung — und soll hier auffallen, nicht in der Produktion.
  const unsicherePerDefault = COACH_SCHALTER
    .filter(s => s.sicherer_stand !== 'wert_noetig' && !s.default_ist_sicher)
    .map(s => s.env)
  assert.deepEqual(unsicherePerDefault, [COACH_MFA_PFLICHT_ENV])
})

// ── 3. Auswertung ──────────────────────────────────────────────

test('leere Umgebung: nur die MFA-Pflicht weicht ab', () => {
  const abweichend = schalterStand({}).filter(b => b.abweichung).map(b => b.schalter.env)
  assert.deepEqual(abweichend, [COACH_MFA_PFLICHT_ENV])
})

test('leere Umgebung: keine zulassungsgebundene Abweichung', () => {
  assert.deepEqual(zulassungsgebundeneAbweichungen({}), [])
})

test('eingeschalteter DiPA-Modus wird als zulassungsgebundene Abweichung gemeldet', () => {
  const befunde = zulassungsgebundeneAbweichungen({ [COACH_DIPA_MODUS_ENV]: 'true' })
  assert.deepEqual(befunde.map(b => b.schalter.env), [COACH_DIPA_MODUS_ENV])
  assert.equal(befunde[0].aktiv, true)
})

test('freigegebene Preise werden als zulassungsgebundene Abweichung gemeldet', () => {
  // Der Kostenlos-Zusage-Bruch: Er soll denselben Rang haben wie eine
  // unbelegte Erstattungsaussage, nicht einen niedrigeren.
  const befunde = zulassungsgebundeneAbweichungen({ [COACH_PREISE_FREIGEGEBEN_ENV]: 'true' })
  assert.deepEqual(befunde.map(b => b.schalter.env), [COACH_PREISE_FREIGEGEBEN_ENV])
})

test('nur der exakte Wert true schaltet scharf', () => {
  for (const wert of ['TRUE', 'True', '1', 'ja', 'yes', 'on', ' true']) {
    const befunde = zulassungsgebundeneAbweichungen({ [COACH_DIPA_MODUS_ENV]: wert })
    assert.deepEqual(befunde, [], `„${wert}" darf nicht scharf schalten`)
  }
})

test('Wert-Schalter erzeugen nie eine Abweichung', () => {
  const wertSchalter = COACH_SCHALTER.filter(s => s.sicherer_stand === 'wert_noetig')
  assert.ok(wertSchalter.length > 0)
  const env = Object.fromEntries(wertSchalter.map(s => [s.env, 'irgendein-wert']))
  for (const b of schalterStand(env)) {
    if (b.schalter.sicherer_stand === 'wert_noetig') {
      assert.equal(b.abweichung, false, `${b.schalter.env}: Wert-Schalter darf nicht abweichen`)
      assert.equal(b.gesetzt, true)
    }
  }
})

test('leerer String gilt als nicht gesetzt', () => {
  const b = schalterStand({ [COACH_DIPA_MODUS_ENV]: '' })
    .find(x => x.schalter.env === COACH_DIPA_MODUS_ENV)
  assert.ok(b)
  assert.equal(b.gesetzt, false)
  assert.equal(b.aktiv, false)
})

test('formatiereSchalter markiert die Abweichung sichtbar', () => {
  const [befund] = zulassungsgebundeneAbweichungen({ [COACH_DIPA_MODUS_ENV]: 'true' })
  const zeile = formatiereSchalter(befund)
  assert.match(zeile, /COACH_DIPA_MODUS/)
  assert.match(zeile, /weicht vom sicheren Stand ab/)
})

// ── 4. Hausregel: keine rohen process.env-Zugriffe ─────────────

test('lib/coach greift nie direkt auf process.env.COACH_… zu', () => {
  // Ein direkter Zugriff umgeht die Konstante und damit den
  // Vollständigkeitstest oben — der Schalter wäre unsichtbar.
  const verzeichnis = join(WURZEL, 'lib/coach')
  const funde: string[] = []
  for (const datei of readdirSync(verzeichnis)) {
    if (!datei.endsWith('.ts') || datei.endsWith('.test.ts')) continue
    const text = readFileSync(join(verzeichnis, datei), 'utf8')
    for (const m of text.matchAll(/process\.env\.(COACH_[A-Z_0-9]+)/g)) {
      funde.push(`lib/coach/${datei}: process.env.${m[1]}`)
    }
  }
  assert.deepEqual(
    funde, [],
    `Direkter Zugriff statt benannter Konstante:\n${funde.join('\n')}`
  )
})
