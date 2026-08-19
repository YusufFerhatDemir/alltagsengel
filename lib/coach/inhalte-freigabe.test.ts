// PflegeCoach — pflegefachliche Inhaltsfreigabe (node:test)
// Ausführen: npx tsx --test lib/coach/inhalte-freigabe.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { UEBUNGEN, WISSEN_MODULE, WOHNRAUM_CHECK } from './inhalte'
import {
  INHALTE_FREIGABEN,
  freigabeStand,
  freigabeUebersicht,
  inhaltsStempel,
  pruefeFreigabe,
  pruefstatusUebung,
  pruefstatusWissen,
  type InhaltFreigabe,
} from './inhalte-freigabe'

const ERSTE_UEBUNG = UEBUNGEN[0]

function vermerk(patch: Partial<InhaltFreigabe> = {}): InhaltFreigabe {
  return {
    modulId: ERSTE_UEBUNG.id,
    art: 'uebung',
    inhaltsStempel: inhaltsStempel(ERSTE_UEBUNG),
    prueferRolle: 'Pflegedienstleitung',
    prueferQualifikation: 'Pflegefachfrau/Pflegefachmann (§ 1 PflBG)',
    geprueftAm: '2026-08-19',
    protokoll: 'audit/dipa/inhalte_pruefdossier.md',
    ...patch,
  }
}

// ── Der wahre Ausgangszustand ───────────────────────────────────

test('das Register ist leer — keine pflegefachliche Freigabe liegt vor', () => {
  assert.deepEqual(INHALTE_FREIGABEN, [], 'AK-QI-01 ist offen; ein Eintrag hier wäre eine Falschaussage')
})

test('ohne Register trägt jeder Inhalt den Status Entwurf', () => {
  const stand = freigabeStand()
  assert.equal(stand.freigegeben, 0)
  assert.equal(stand.entwurf, stand.gesamt)
  assert.equal(stand.vollstaendig, false)
  // Gezählt am 19.08.2026: 4 Übungen + 5 Wissensmodule + 1 Checkliste = 10.
  // Der Anforderungskatalog spricht bei AK-QI-01 von "12 Modulen" — das ist
  // eine Zahl aus einem Bericht, nicht aus dem Bestand. Hier steht der Bestand.
  assert.equal(stand.gesamt, UEBUNGEN.length + WISSEN_MODULE.length + 1)
  assert.equal(stand.gesamt, 10, `Inhaltsbestand hat sich geändert: ${stand.gesamt}`)
})

test('jeder Befund nennt einen Grund, solange er offen ist', () => {
  for (const b of freigabeUebersicht()) {
    assert.equal(b.status, 'entwurf')
    assert.match(b.grund ?? '', /Keine pflegefachliche Freigabe/)
    assert.match(b.aktuellerStempel, /^[0-9a-f]{32}$/)
  }
})

// ── Was ein wirksamer Vermerk leisten muss ──────────────────────

test('ein vollständiger Vermerk mit passendem Stempel gibt frei', () => {
  assert.deepEqual(pruefeFreigabe(vermerk()), [])
  assert.equal(pruefstatusUebung(ERSTE_UEBUNG, [vermerk()]), 'fachlich_freigegeben')
})

test('ein Vermerk ohne Qualifikation gibt nicht frei', () => {
  const ohne = vermerk({ prueferQualifikation: '   ' })
  assert.ok(pruefeFreigabe(ohne).some(m => m.includes('Qualifikation')))
  assert.equal(pruefstatusUebung(ERSTE_UEBUNG, [ohne]), 'entwurf')
})

test('ein Vermerk ohne Protokoll oder Datum gibt nicht frei', () => {
  for (const patch of [{ protokoll: '' }, { geprueftAm: '19.08.2026' }] as Partial<InhaltFreigabe>[]) {
    assert.equal(pruefstatusUebung(ERSTE_UEBUNG, [vermerk(patch)]), 'entwurf')
  }
})

test('ein Vermerk für eine andere Fassung gibt nicht frei', () => {
  const geaendert = { ...ERSTE_UEBUNG, sicherheitshinweis: 'Nachträglich umformuliert.' }
  const befund = freigabeUebersicht([vermerk()]).find(b => b.modulId === ERSTE_UEBUNG.id)!
  assert.equal(befund.status, 'fachlich_freigegeben')
  assert.equal(pruefstatusUebung(geaendert, [vermerk()]), 'entwurf')
})

test('der Stempel ignoriert die Reihenfolge der Eigenschaften, nicht den Text', () => {
  const umgestellt = { titel: ERSTE_UEBUNG.titel, ...ERSTE_UEBUNG }
  assert.equal(inhaltsStempel(umgestellt), inhaltsStempel(ERSTE_UEBUNG))

  const anderer = { ...ERSTE_UEBUNG, ziel: `${ERSTE_UEBUNG.ziel}.` }
  assert.notEqual(inhaltsStempel(anderer), inhaltsStempel(ERSTE_UEBUNG))
})

test('der Prüfstatus im Literal macht sich nicht selbst gültig', () => {
  // Ein per Hand auf 'fachlich_freigegeben' gesetztes Literal bleibt ohne
  // Register wirkungslos — genau der Weg, den dieses Modul schließt.
  const behauptet = { ...ERSTE_UEBUNG, pruefstatus: 'fachlich_freigegeben' as const }
  assert.equal(pruefstatusUebung(behauptet, []), 'entwurf')
})

test('der Stempel hängt nicht am Prüfstatus', () => {
  const behauptet = { ...ERSTE_UEBUNG, pruefstatus: 'fachlich_freigegeben' as const }
  assert.equal(inhaltsStempel(behauptet), inhaltsStempel(ERSTE_UEBUNG))
})

test('Wissensmodule und Checkliste sind erfasst', () => {
  const ids = freigabeUebersicht().map(b => b.modulId)
  for (const m of WISSEN_MODULE) assert.ok(ids.includes(m.id), `Wissensmodul ${m.id} fehlt in der Übersicht`)
  assert.ok(ids.includes('wohnraum-check'))
  assert.ok(WOHNRAUM_CHECK.length > 0)
  assert.equal(pruefstatusWissen(WISSEN_MODULE[0], []), 'entwurf')
})

// ── Die Oberfläche darf nicht am Register vorbei freigeben ──────

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

test('keine Coach-Seite liest den Prüfstatus direkt aus dem Literal', () => {
  const treffer: string[] = []
  for (const datei of dateienUnter('app/pflegecoach', ['.tsx'])) {
    const inhalt = readFileSync(datei, 'utf-8')
    // `x.pruefstatus === …` ist der Zugriff auf das Literal. Erlaubt ist der
    // Weg über pruefstatusUebung()/pruefstatusWissen().
    const fund = inhalt.match(/\w+\.pruefstatus\s*===/)
    if (fund) treffer.push(`${datei}: ${fund[0]}`)
  }
  assert.deepEqual(
    treffer, [],
    'Prüfstatus über pruefstatusUebung()/pruefstatusWissen() beziehen:\n' + treffer.join('\n'),
  )
})
