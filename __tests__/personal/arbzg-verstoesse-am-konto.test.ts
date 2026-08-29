/**
 * ArbZG-Verstöße am Arbeitszeitkonto — Zählung und Zuordnung.
 *
 * HINTERGRUND: Seit Migration `20260829184500` legt der Trigger
 * `arbzg_pruefung_ist()` beim Speichern einer ERFASSTEN Arbeitszeit
 * Verstöße an (§ 3, § 4, § 5 ArbZG, gemessen an der geleisteten Zeit — der,
 * an die § 2 Abs. 1 ArbZG bindet). Gesehen hat sie danach nur das
 * Fristen-Dashboard. Das Arbeitszeitkonto — die Ansicht, in der eine PDL
 * über Arbeitszeit entscheidet — zeigte Ist- und Sollstunden nebeneinander,
 * aber nicht, ob die Zahl unter Bruch einer Schutzvorschrift zustande kam.
 *
 * Geprüft wird hier beides getrennt:
 *   • die ABFRAGE — sitzt der Mandanten-Fence, wird nur Unquittiertes
 *     gezählt, greifen die Monatsgrenzen, und was passiert, wenn das Schema
 *     die Spalte `basis` noch nicht kennt;
 *   • die ZUORDNUNG — landet die Zahl neben dem richtigen Namen. Das ist
 *     der Fehler, den ein Lauf gegen echte Daten erst zeigt, wenn ihn
 *     jemand nachrechnet.
 */
import { describe, it, expect } from 'vitest'
import {
  verbindeKontoMitVerstoessen,
  zaehleOffeneArbzgVerstoesse,
  type VerstossZaehlung,
} from '@/lib/personal/arbeitszeiten'
import type { ArbeitszeitKonto } from '@/lib/personal/types'
import {
  erstelleFakeSupabase, hatFilter, hatOrgFence,
  type FakeAufruf,
} from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const CG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

/** Fake, der auf `arbeitszeit_verstoesse` die übergebenen Zeilen liefert. */
function fakeMitZeilen(zeilen: Array<Record<string, unknown>>) {
  return erstelleFakeSupabase((a: FakeAufruf) =>
    a.tabelle === 'arbeitszeit_verstoesse' ? { data: zeilen } : { data: [] })
}

/**
 * Fake, der beim Lesen von `basis` mit 42703 antwortet — so verhält sich
 * PostgREST gegen ein Schema, das die Spalte noch nicht kennt. Genau das
 * ist die Lage in den PGlite-Suiten, deren Kettenschema
 * `arbeitszeit_verstoesse` aus der ALTEN Migration `20260920060000` baut.
 */
function fakeOhneBasisSpalte(zeilen: Array<Record<string, unknown>>) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle !== 'arbeitszeit_verstoesse') return { data: [] }
    if ((a.spalten ?? '').includes('basis')) {
      return { data: null, error: { message: 'column "basis" does not exist', code: '42703' } }
    }
    return { data: zeilen }
  })
}

const konto = (caregiverId: string, name: string): ArbeitszeitKonto => ({
  organization_id: ORG,
  caregiver_id: caregiverId,
  caregiver_name: name,
  jahr: 2026, monat: 8,
  anzahl_eintraege: 20,
  ist_minuten_gesamt: 9600,
  soll_minuten_gesamt: 9600,
  ueberstunden_gesamt: 0,
  pausen_gesamt: 600,
  korrigierte_eintraege: 0,
})

// ───────────────────────────────────────────────────────────────
describe('zaehleOffeneArbzgVerstoesse — die Abfrage', () => {
  it('zählt je Mitarbeiter und trennt nach Herkunft', async () => {
    const fake = fakeMitZeilen([
      { caregiver_id: CG_A, basis: 'ist' },
      { caregiver_id: CG_A, basis: 'ist' },
      { caregiver_id: CG_A, basis: 'plan' },
      { caregiver_id: CG_B, basis: 'plan' },
    ])
    const zaehlung = await zaehleOffeneArbzgVerstoesse(fake.client, ORG, 2026, 8)

    const a = zaehlung.find(z => z.caregiverId === CG_A)!
    expect(a.gesamt).toBe(3)
    expect(a.ausErfassung).toBe(2)
    expect(a.ausDienstplan).toBe(1)

    const b = zaehlung.find(z => z.caregiverId === CG_B)!
    expect(b).toEqual({ caregiverId: CG_B, gesamt: 1, ausErfassung: 0, ausDienstplan: 1 })
  })

  it('setzt den Mandanten-Fence und zählt nur Unquittiertes', async () => {
    const fake = fakeMitZeilen([])
    await zaehleOffeneArbzgVerstoesse(fake.client, ORG, 2026, 8)
    const aufruf = fake.ersterAuf('arbeitszeit_verstoesse')

    expect(hatOrgFence(aufruf, ORG)).toBe(true)
    // Ohne diesen Filter stünde neben jedem Monat die Summe ALLER je
    // erkannten Verstöße — auch der längst entschiedenen. Die Zahl ginge
    // nie zurück, und niemand könnte sie abarbeiten.
    expect(hatFilter(aufruf, 'eq', 'quittiert', false)).toBe(true)
  })

  it('grenzt den Monat auf seinen letzten Tag ab, nicht auf den 30.', async () => {
    const fake = fakeMitZeilen([])
    await zaehleOffeneArbzgVerstoesse(fake.client, ORG, 2026, 8)
    const aufruf = fake.ersterAuf('arbeitszeit_verstoesse')

    expect(hatFilter(aufruf, 'gte', 'datum', '2026-08-01')).toBe(true)
    // Ein fester 30. verlöre in jedem langen Monat den letzten Tag — und
    // genau am Monatsende häufen sich Dienste.
    expect(hatFilter(aufruf, 'lte', 'datum', '2026-08-31')).toBe(true)
  })

  it('kennt den Februar eines Schaltjahres', async () => {
    const fake = fakeMitZeilen([])
    await zaehleOffeneArbzgVerstoesse(fake.client, ORG, 2028, 2)
    expect(hatFilter(fake.ersterAuf('arbeitszeit_verstoesse'), 'lte', 'datum', '2028-02-29')).toBe(true)
  })

  it('grenzt gar nicht ab, wenn nur das Jahr angegeben ist', async () => {
    // Ein Jahr ohne Monat würde einen Zeitraum abgrenzen, den die
    // aufrufende Ansicht nicht zeigt — die Zahl stünde neben einer
    // Monatszeile, ohne zu ihr zu gehören.
    const fake = fakeMitZeilen([])
    await zaehleOffeneArbzgVerstoesse(fake.client, ORG, 2026)
    const aufruf = fake.ersterAuf('arbeitszeit_verstoesse')
    expect(hatFilter(aufruf, 'gte', 'datum')).toBe(false)
    expect(hatFilter(aufruf, 'lte', 'datum')).toBe(false)
  })

  it('filtert auf einen Mitarbeiter, wenn einer genannt ist', async () => {
    const fake = fakeMitZeilen([])
    await zaehleOffeneArbzgVerstoesse(fake.client, ORG, 2026, 8, CG_A)
    expect(hatFilter(fake.ersterAuf('arbeitszeit_verstoesse'), 'eq', 'caregiver_id', CG_A)).toBe(true)
  })

  it('liest ohne die Spalte weiter, wenn das Schema sie nicht kennt', async () => {
    const fake = fakeOhneBasisSpalte([
      { caregiver_id: CG_A },
      { caregiver_id: CG_A },
    ])
    const zaehlung = await zaehleOffeneArbzgVerstoesse(fake.client, ORG, 2026, 8)

    // Gezählt wird trotzdem — und alles gilt als Plan-Verstoß, was solche
    // Zeilen auch waren: vor der Migration gab es keine andere Herkunft.
    expect(zaehlung).toEqual([{ caregiverId: CG_A, gesamt: 2, ausErfassung: 0, ausDienstplan: 2 }])
    // Zwei Anläufe: erst mit `basis`, dann ohne.
    expect(fake.auf('arbeitszeit_verstoesse')).toHaveLength(2)
  })

  it('behandelt eine fehlende Herkunft als Plan, nicht als Erfassung', async () => {
    // Zurückhaltung mit Grund: „aus der Erfassung" schickt die PDL in den
    // Zeiteintrag. Diese Ansage nur machen, wenn sie in der Zeile steht.
    const fake = fakeMitZeilen([
      { caregiver_id: CG_A, basis: null },
      { caregiver_id: CG_A },
      { caregiver_id: CG_A, basis: 'unbekannt' },
    ])
    const zaehlung = await zaehleOffeneArbzgVerstoesse(fake.client, ORG, 2026, 8)
    expect(zaehlung[0].ausErfassung).toBe(0)
    expect(zaehlung[0].ausDienstplan).toBe(3)
  })

  it('meldet einen echten Datenbankfehler, statt still 0 zu zählen', async () => {
    // Ein verschluckter Fehler wäre hier besonders teuer: „0 Verstöße"
    // sieht aus wie „alles in Ordnung".
    const fake = erstelleFakeSupabase(() => ({
      data: null, error: { message: 'Verbindung weg', code: '08006' },
    }))
    await expect(zaehleOffeneArbzgVerstoesse(fake.client, ORG, 2026, 8))
      .rejects.toThrow(/Verbindung weg/)
  })
})

// ───────────────────────────────────────────────────────────────
describe('verbindeKontoMitVerstoessen — die Zuordnung', () => {
  const zaehlungen: VerstossZaehlung[] = [
    { caregiverId: CG_B, gesamt: 3, ausErfassung: 2, ausDienstplan: 1 },
  ]

  it('hängt die Zahl an den richtigen Mitarbeiter', () => {
    const verbunden = verbindeKontoMitVerstoessen(
      [konto(CG_A, 'Anna A.'), konto(CG_B, 'Bea B.')],
      zaehlungen,
    )
    expect(verbunden.find(k => k.caregiver_name === 'Bea B.')!.verstoesse_offen).toBe(3)
    expect(verbunden.find(k => k.caregiver_name === 'Bea B.')!.verstoesse_aus_erfassung).toBe(2)
  })

  it('gibt einem Mitarbeiter ohne Verstöße ausdrücklich 0, nicht undefined', () => {
    // Die Ansicht soll „keine" zeigen können, ohne „unbekannt" mit „keine"
    // zu verwechseln.
    const verbunden = verbindeKontoMitVerstoessen([konto(CG_A, 'Anna A.')], zaehlungen)
    expect(verbunden[0].verstoesse_offen).toBe(0)
    expect(verbunden[0].verstoesse_aus_erfassung).toBe(0)
  })

  it('lässt alle übrigen Felder der Kontozeile unberührt', () => {
    const eingang = konto(CG_A, 'Anna A.')
    const [ausgang] = verbindeKontoMitVerstoessen([eingang], [])
    for (const feld of Object.keys(eingang) as Array<keyof ArbeitszeitKonto>) {
      expect(ausgang[feld]).toEqual(eingang[feld])
    }
  })

  it('erfindet keine Zeile für eine Zählung ohne Konto', () => {
    // Ein Verstoß in einem Monat ohne Kontozeile darf keine Zeile
    // hervorbringen: sie hätte weder Ist- noch Sollstunden und sähe aus
    // wie ein Mitarbeiter, der nichts gearbeitet und trotzdem gegen das
    // ArbZG verstoßen hat.
    expect(verbindeKontoMitVerstoessen([], zaehlungen)).toEqual([])
  })

  it('kommt mit einer leeren Zählung aus', () => {
    expect(verbindeKontoMitVerstoessen([konto(CG_A, 'Anna A.')], [])).toHaveLength(1)
  })
})
