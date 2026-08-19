// PflegeCoach Kostenfreiheit — node:test
// Ausführen: npx tsx --test lib/coach/kostenfreiheit.test.ts  (oder npm run test:unit)
//
// ═══════════════════════════════════════════════════════════════
// „PflegeCoach ist dauerhaft kostenlos für Endnutzer" (Entscheidung vom
// 14.08.2026) stand bis 19.08.2026 ausschließlich in Prosa — in
// docs/PFLEGECOACH_VERKAUFSSTATUS.md, in Kopfkommentaren und in den
// Texten der Oberfläche. Der komplette Selbstzahler-Verkaufsweg liegt
// dabei weiterhin im Code, nur fail-closed gesperrt. Das ist eine
// vertretbare Entscheidung, aber sie lässt genau einen Fehler zu, der
// niemandem auffiele: Ein einziger Schalter, versehentlich in einer
// Deployment-Konfiguration gesetzt, macht aus einem kostenlosen Angebot
// ein zahlungspflichtiges — mit Platzhalterbeträgen, die ausdrücklich
// niemandem in Rechnung gestellt werden dürfen.
//
// Dieser Test macht die Zusage prüfbar. Er prüft dabei bewusst BEIDE
// Richtungen: dass ohne Freigabe nichts verkauft werden kann (Abschnitt 1),
// und dass die Zusage auch tatsächlich dort steht, wo Nutzer sie lesen
// (Abschnitt 3). Nur die erste Hälfte zu prüfen hieße, einen stummen
// Schutz für eine Zusage zu halten.
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  alleTarife, COACH_PREISE_FREIGEGEBEN_ENV, istVerkaufBereit, preiseFreigegeben, verkaufMoeglich,
} from './pricing'
import { COACH_SCHALTER } from './schalter'

const WURZEL = fileURLToPath(new URL('../../', import.meta.url))
const lies = (datei: string) => readFileSync(join(WURZEL, datei), 'utf8')

/** Env-Schlüssel, die den Verkaufsweg betreffen — für saubere Testläufe. */
const VERKAUFS_ENVS = [
  COACH_PREISE_FREIGEGEBEN_ENV, 'STRIPE_SECRET_KEY',
  'COACH_STRIPE_PRICE_MONATLICH', 'COACH_STRIPE_PRICE_JAEHRLICH',
]

function mitEnv<T>(werte: Record<string, string | undefined>, fn: () => T): T {
  const vorher = new Map(VERKAUFS_ENVS.map(k => [k, process.env[k]]))
  try {
    for (const k of VERKAUFS_ENVS) delete process.env[k]
    for (const [k, v] of Object.entries(werte)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    return fn()
  } finally {
    for (const [k, v] of vorher) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

// ── 1. Ohne Freigabe ist kein Verkauf möglich ──────────────────

test('Default: Preise sind nicht freigegeben', () => {
  assert.equal(mitEnv({}, preiseFreigegeben), false)
  assert.equal(mitEnv({}, verkaufMoeglich), false)
})

test('vollständig konfiguriertes Stripe verkauft trotzdem nichts', () => {
  // Der eigentliche Schutz. Wäre die Preisfreigabe nur eine von mehreren
  // gleichrangigen Bedingungen, würde ein vollständig eingerichtetes
  // Stripe-Konto genügen — und genau das wäre der Weg, auf dem der
  // Verkauf versehentlich anspringt.
  const alles = {
    STRIPE_SECRET_KEY: 'sk_test_beispiel',
    COACH_STRIPE_PRICE_MONATLICH: 'price_beispiel_m',
    COACH_STRIPE_PRICE_JAEHRLICH: 'price_beispiel_j',
  }
  mitEnv(alles, () => {
    assert.equal(verkaufMoeglich(), false, 'Stripe allein darf den Verkauf nicht öffnen')
    for (const t of alleTarife()) {
      const bereit = istVerkaufBereit(t)
      assert.equal(bereit.bereit, false, `${t.key}: darf nicht bestellbar sein`)
      assert.equal(
        bereit.code, 'PREISE_NICHT_FREIGEGEBEN',
        `${t.key}: die Preisfreigabe muss die ERSTE Sperre sein — steht sie hinter der ` +
        'Stripe-Prüfung, entscheidet die Konfiguration und nicht die kaufmännische Freigabe'
      )
    }
  })
})

test('die Preisfreigabe allein genügt ebenfalls nicht', () => {
  // Gegenprobe: Auch der umgekehrte Halbzustand darf nicht verkaufen.
  mitEnv({ [COACH_PREISE_FREIGEGEBEN_ENV]: 'true' }, () => {
    assert.equal(verkaufMoeglich(), false)
    for (const t of alleTarife()) {
      assert.equal(istVerkaufBereit(t).bereit, false, `${t.key}: ohne Stripe nicht bestellbar`)
    }
  })
})

test('nur der exakte Wert true gibt die Preise frei', () => {
  for (const wert of ['TRUE', 'True', '1', 'ja', 'yes', 'on']) {
    assert.equal(
      mitEnv({ [COACH_PREISE_FREIGEGEBEN_ENV]: wert }, preiseFreigegeben), false,
      `„${wert}" darf die Preise nicht freigeben`
    )
  }
})

// ── 2. Die Sperre sitzt an jeder Stelle, die Geld bewegt ───────

test('die öffentliche Tarif-Route gibt ohne Freigabe keine Beträge heraus', () => {
  // Sonst wären die Platzhalterbeträge über einen direkten Aufruf
  // abrufbar, obwohl sie niemandem in Rechnung gestellt werden dürfen.
  const text = lies('app/api/coach/tarife/route.ts')
  assert.match(text, /verkaufMoeglich\(\)/, 'Tarif-Route prüft die Verkaufsfreigabe nicht')
  assert.match(
    text, /tarife:\s*\[\]/,
    'Ohne Freigabe muss die Route ein leeres tarife-Array liefern, keine Beträge'
  )
})

test('die Checkout-Route prüft die Verkaufsbereitschaft', () => {
  const text = lies('app/api/coach/checkout/route.ts')
  assert.match(text, /istVerkaufBereit\(/, 'Checkout-Route ohne Bereitschaftsprüfung')
})

test('die Preisfreigabe ist als zulassungsgebundener Schalter verzeichnet', () => {
  const eintrag = COACH_SCHALTER.find(s => s.env === COACH_PREISE_FREIGEGEBEN_ENV)
  assert.ok(eintrag, 'Preisfreigabe fehlt im Schalterverzeichnis')
  assert.equal(eintrag.zulassungsgebunden, true)
  assert.equal(eintrag.sicherer_stand, 'aus')
  assert.equal(
    eintrag.freigabeweg, 'entfaellt',
    'Es gibt keinen Weg, auf dem dieser Schalter freigegeben würde — der PflegeCoach ist ' +
    'dauerhaft kostenlos. „entfaellt" ist die Aussage, nicht „noch offen".'
  )
})

// ── 3. Die Zusage steht dort, wo Nutzer sie lesen ──────────────

/**
 * Seiten, auf denen ein Nutzer die Frage „was kostet das?" stellt. Die
 * Zusage muss auf JEDER davon stehen — nicht nur einmal irgendwo, denn
 * niemand liest ein Produkt von vorn bis hinten durch.
 */
const SEITEN_MIT_ZUSAGE = [
  'app/pflegecoach/start/page.tsx',
  'app/pflegecoach/checkout/page.tsx',
  'app/pflegecoach/einstellungen/konto/page.tsx',
  'app/pflegecoach/anfrage/page.tsx',
  'app/pflegecoach/agb/page.tsx',
]

test('jede Preis-relevante Seite sagt ausdrücklich, dass der PflegeCoach kostenlos ist', () => {
  const fehlend = SEITEN_MIT_ZUSAGE.filter(d => !/kostenlos|kostenfrei/i.test(lies(d)))
  assert.deepEqual(fehlend, [], `Kostenlos-Zusage fehlt auf:\n${fehlend.join('\n')}`)
})

test('die Produktseite sagt die Dauerhaftigkeit zu, nicht nur den Ist-Zustand', () => {
  // „derzeit kostenlos" und „dauerhaft kostenfrei" sind verschiedene
  // Zusagen. Die Entscheidung vom 14.08.2026 ist die zweite; die
  // Produktseite ist die Stelle, an der sie stehen muss.
  const text = lies('app/pflegecoach/start/page.tsx')
  assert.match(
    text, /dauerhaft kostenfrei|dauerhaft kostenlos/i,
    'Die Produktseite muss die dauerhafte Kostenfreiheit zusagen'
  )
  assert.match(
    text, /keine Testphase, die abläuft|kein Abonnement|keine Kreditkarte/i,
    'Die Zusage braucht die konkrete Auflösung der üblichen Erwartungen (Abo, Testphase, Karte)'
  )
})

test('kein Preis wird angezeigt, ohne an die Verkaufsfreigabe gebunden zu sein', () => {
  // Der Betrag darf nur im freigegebenen Zweig gerendert werden. Prüfbar
  // ist das an der Bedingung: Wo `betrag_cent` gerendert wird, muss auf
  // derselben Seite `verkauf_moeglich` abgefragt werden.
  for (const datei of ['app/pflegecoach/start/page.tsx', 'app/pflegecoach/checkout/page.tsx']) {
    const text = lies(datei)
    if (!/betrag_cent/.test(text)) continue
    assert.match(
      text, /verkauf_moeglich/,
      `${datei} zeigt Beträge, ohne die Verkaufsfreigabe abzufragen`
    )
  }
})

test('die Testphasen-Formulierung erscheint nur im freigegebenen Zweig', () => {
  // „Die ersten N Tage sind kostenlos" impliziert Kosten danach — auf
  // einem dauerhaft kostenlosen Produkt wäre das die irreführendste
  // Zeile der ganzen Oberfläche. Sie ist an `testphase_tage > 0`
  // gebunden, und das Feld kommt nur aus dem freigegebenen Zweig der
  // Tarif-Route.
  const text = lies('app/pflegecoach/start/page.tsx')
  const stelle = text.indexOf('Tage sind kostenlos')
  if (stelle === -1) return // Formulierung entfernt — dann ist nichts zu sichern
  const umfeld = text.slice(Math.max(0, stelle - 400), stelle)
  assert.match(
    umfeld, /testphase_tage > 0/,
    'Die Testphasen-Zeile muss an testphase_tage > 0 gebunden bleiben'
  )
})

// ── 4. Die Platzhalterbeträge bleiben als solche gekennzeichnet ─

test('pricing.ts weist die Beträge ausdrücklich als Platzhalter aus', () => {
  const text = lies('lib/coach/pricing.ts')
  assert.match(text, /PLATZHALTER/i, 'Der Platzhalter-Hinweis darf nicht entfernt werden')
  assert.match(
    text, /dauerhaft KOSTENLOS|dauerhaft kostenlos/,
    'Die Geschäftsmodell-Entscheidung gehört in den Kopf der Preisdatei'
  )
})

test('kein Coach-Modul nennt einen Betrag als vereinbarte Vergütung', () => {
  // Der PflegeCoach hat keinen Vergütungsbetrag — weder gegenüber
  // Nutzern noch gegenüber Kassen (§ 78a Abs. 1 SGB XI: keine
  // Vereinbarung geschlossen). Ein „verguetung"-Feld mit einer Zahl wäre
  // eine erfundene Zusage.
  const muster = /verg(ü|ue)tung[a-z_]*\s*[:=]\s*\d/i
  for (const datei of ['lib/coach/pricing.ts', 'lib/coach/abrechnung.ts', 'lib/coach/regulatorik.ts']) {
    const treffer = lies(datei).match(muster)
    assert.equal(treffer, null, `${datei}: Vergütungsbetrag hinterlegt („${treffer?.[0]}")`)
  }
})
