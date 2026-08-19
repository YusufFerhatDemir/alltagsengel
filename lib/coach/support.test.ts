// PflegeCoach — Anwenderbetreuung / Antwortzusage (node:test)
// Ausführen: npx tsx --test lib/coach/support.test.ts  (oder npm run test:unit)
//
// ═══════════════════════════════════════════════════════════════
// Der wichtigste Test hier ist der QUELLTEXT-TEST am Ende: er sucht in der
// gesamten Coach-Oberfläche nach Fristzusagen, die am Register vorbeigehen.
// Genau so war die "zwei Werktage"-Zusage entstanden — nicht böswillig,
// sondern weil ein hilfreicher Satz keinen Ort hatte, an dem er hätte
// auffallen können.
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  OFFENE_ENTSCHEIDUNGEN,
  SUPPORT_FRIST_STUNDEN,
  SUPPORT_OHNE_ZUSAGE_TEXT,
  SUPPORT_ZUSAGE,
  pruefeSupportZusage,
  supportAntwortHinweis,
  supportStatus,
  zusageVeroeffentlichungsfaehig,
  type SupportZusage,
} from './support'

const VOLLSTAENDIG: SupportZusage = {
  fristStunden: 24,
  kanaele: ['email', 'formular'],
  abdeckungOhneAusnahme: true,
  vertretungGeregelt: true,
  kostenlos: true,
  deutschsprachig: true,
  entschiedenVon: 'Geschäftsführung',
  entschiedenAm: '2026-08-19',
  fundstelle: 'docs/DIPA_14_PUNKTE_ANALYSE_2026-08-19.md, AK-VS-02',
}

// ── Der sichere Ausgangszustand ─────────────────────────────────

test('ohne Beschluss ist keine Zusage hinterlegt', () => {
  assert.equal(SUPPORT_ZUSAGE, null, 'Der Default muss "nicht entschieden" sein')
  assert.equal(zusageVeroeffentlichungsfaehig(), false)
})

test('ohne Beschluss enthält der angezeigte Text keine Frist', () => {
  const text = supportAntwortHinweis()
  assert.equal(text, SUPPORT_OHNE_ZUSAGE_TEXT)
  assert.ok(!/\d+\s*(Stunden|Werktag|Tag)/i.test(text), `Fristangabe im Text: ${text}`)
  assert.ok(!/in der Regel|zeitnah|schnellstmöglich/i.test(text), 'keine weiche Fristandeutung')
})

test('der Status benennt, was zu entscheiden ist', () => {
  const s = supportStatus()
  assert.equal(s.hinterlegt, false)
  assert.equal(s.veroeffentlichungsfaehig, false)
  assert.equal(s.anforderungStunden, 24)
  assert.deepEqual(s.offeneEntscheidungen, OFFENE_ENTSCHEIDUNGEN)
  assert.ok(s.offeneEntscheidungen.length > 0)
})

// ── Was ein Beschluss enthalten muss ────────────────────────────

test('ein vollständiger Beschluss ist veröffentlichungsfähig', () => {
  assert.deepEqual(pruefeSupportZusage(VOLLSTAENDIG), [])
  const text = supportAntwortHinweis(VOLLSTAENDIG)
  assert.match(text, /innerhalb von 24 Stunden/)
  assert.match(text, /Wochenenden und Feiertagen/)
})

test('eine Werktags-Zusage erfüllt die Frist nicht', () => {
  const maengel = pruefeSupportZusage({ ...VOLLSTAENDIG, abdeckungOhneAusnahme: false })
  assert.equal(maengel.length, 1)
  assert.match(maengel[0], /Wochenenden oder Feiertage/)
})

test('eine längere Frist als 24 Stunden wird abgewiesen', () => {
  const maengel = pruefeSupportZusage({ ...VOLLSTAENDIG, fristStunden: 48 })
  assert.ok(maengel.some(m => m.includes('überschreitet')), maengel.join(' | '))
})

test('eine kürzere Frist ist zulässig', () => {
  assert.deepEqual(pruefeSupportZusage({ ...VOLLSTAENDIG, fristStunden: 4 }), [])
})

test('fehlender Urheber, Datum oder Fundstelle blockiert die Veröffentlichung', () => {
  for (const patch of [
    { entschiedenVon: '  ' },
    { entschiedenAm: '19.08.2026' },
    { fundstelle: '' },
  ] as Partial<SupportZusage>[]) {
    const zusage = { ...VOLLSTAENDIG, ...patch }
    assert.ok(
      pruefeSupportZusage(zusage).length > 0,
      `Beschluss ohne ${Object.keys(patch)[0]} darf nicht durchgehen`,
    )
    assert.equal(supportAntwortHinweis(zusage), SUPPORT_OHNE_ZUSAGE_TEXT)
  }
})

test('kostenpflichtig oder nicht deutschsprachig wird abgewiesen', () => {
  assert.ok(pruefeSupportZusage({ ...VOLLSTAENDIG, kostenlos: false }).length > 0)
  assert.ok(pruefeSupportZusage({ ...VOLLSTAENDIG, deutschsprachig: false }).length > 0)
})

test('kein Kanal benannt = keine Veröffentlichung', () => {
  assert.ok(pruefeSupportZusage({ ...VOLLSTAENDIG, kanaele: [] }).length > 0)
})

// ── Niemand veröffentlicht am Register vorbei ───────────────────

function dateienUnter(wurzel: string, endungen: string[]): string[] {
  const treffer: string[] = []
  const lauf = (verzeichnis: string) => {
    for (const eintrag of readdirSync(verzeichnis)) {
      const pfad = join(verzeichnis, eintrag)
      if (statSync(pfad).isDirectory()) lauf(pfad)
      else if (endungen.some(e => pfad.endsWith(e))) treffer.push(pfad)
    }
  }
  lauf(wurzel)
  return treffer
}

test('keine Fristzusage in der Coach-Oberfläche am Register vorbei', () => {
  // Antwort-/Reaktionszusagen. Bewusst eng gefasst: Fristen zu Widerruf
  // (14 Tage, § 355 BGB) oder Erstattungsdauer sind etwas anderes und dürfen
  // dort stehen, wo sie hingehören.
  const muster = [
    /melden uns[^.]{0,80}innerhalb von/i,
    /Antwort[^.]{0,40}innerhalb von \d/i,
    /(Anfrage|Anfragen)[^.]{0,60}innerhalb von \d+\s*(Stunden|Werktag)/i,
    /innerhalb von (zwei|drei|vier|\d+)\s*Werktagen/i,
  ]

  const treffer: string[] = []
  for (const datei of dateienUnter('app/pflegecoach', ['.tsx', '.ts'])) {
    const inhalt = readFileSync(datei, 'utf-8')
    for (const m of muster) {
      const fund = inhalt.match(m)
      if (fund) treffer.push(`${datei}: ${fund[0]}`)
    }
  }

  assert.deepEqual(
    treffer, [],
    'Antwortzusagen gehören in lib/coach/support.ts (SUPPORT_ZUSAGE) und nicht in eine Seite:\n'
      + treffer.join('\n'),
  )
})

test('die Anfrageseite liest den Hinweis aus dem Register', () => {
  const seite = readFileSync('app/pflegecoach/anfrage/page.tsx', 'utf-8')
  assert.match(seite, /supportAntwortHinweis/, 'Die Anfrageseite muss den Hinweis aus dem Register beziehen')
})

test('die 24-Stunden-Anforderung steht als Konstante, nicht als Literal in Seiten', () => {
  assert.equal(SUPPORT_FRIST_STUNDEN, 24)
})
