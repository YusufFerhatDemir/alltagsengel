/**
 * Track 12 — Abrechnung und Finanzfluesse
 *
 * Die Tests sind aus der Angreiferperspektive geschrieben: nicht "tut die
 * Funktion, was sie soll", sondern "kommt jemand mit manipulierten Daten
 * durch". Zu jedem Befund gehoert deshalb ein Paar:
 *
 *   * eine GEGENPROBE, die den ALTEN Zustand nachstellt und verlangt, dass
 *     er jetzt scheitert, und
 *   * ein Nachweis, dass derselbe Vorgang OHNE die Manipulation weiterhin
 *     durchlaeuft.
 *
 * Ohne das zweite waere "alles gesperrt" ebenfalls gruen, und die Sperre
 * kein Beweis.
 */

import { describe, it, expect } from 'vitest'

import {
  minutenSeitMitternacht,
  dauerMinuten,
  pruefeZeitraum,
  istZeitraumGueltig,
  assertZeitraumGueltig,
} from '@/lib/leistungsnachweis/zeitraum'

import {
  unterschriftBelegt,
  belegLuecke,
  ohneBeleg,
  assertNachweiseBelegt,
  assertBelegteNachweise,
  BELEG_SPALTEN,
} from '@/lib/billing/nachweis-beleg'

import {
  pruefeGegenRegeln,
  datenbankAuswahl,
  abweichungZurDatenbank,
  angebotstypVon,
  type ObergrenzenRegel,
} from '@/lib/billing/obergrenzen'

import {
  budgetVersionFuerJahr,
  ENTLASTUNG_MONATLICH_EUR,
  ENTLASTUNG_JAEHRLICH_EUR,
  VP_KZP_KOMBINIERT_EUR,
} from '@/lib/config/budget-constants'

import { erstelleFakeSupabase, hatFilter } from './helpers/supabase-fake'
import { UserFacingError } from '@/lib/api/user-facing-error'

// ═══════════════════════════════════════════════════════════════════════
// B5 — Einsatzdauer und negative Rechnungspositionen
// ═══════════════════════════════════════════════════════════════════════

describe('B5: Einsatzzeitraum — duration_minutes ist generiert und bestimmt den Betrag', () => {
  it('rechnet die Dauer genauso wie die GENERATED-Spalte', () => {
    // (EXTRACT(epoch FROM (end_time - start_time)))::integer / 60
    expect(dauerMinuten('09:00', '10:30')).toBe(90)
    expect(dauerMinuten('09:00:00', '10:00:00')).toBe(60)
    expect(dauerMinuten('00:00', '23:59')).toBe(1439)
  })

  it('liest HH:MM und HH:MM:SS, verwirft Unsinn', () => {
    expect(minutenSeitMitternacht('07:15')).toBe(435)
    expect(minutenSeitMitternacht('07:15:30')).toBe(435)
    expect(minutenSeitMitternacht('25:00')).toBeNull()
    expect(minutenSeitMitternacht('07:99')).toBeNull()
    expect(minutenSeitMitternacht('halb acht')).toBeNull()
    expect(minutenSeitMitternacht(null)).toBeNull()
    expect(minutenSeitMitternacht(915)).toBeNull()
  })

  // ── GEGENPROBE: der alte Zustand ──────────────────────────────────
  it('GEGENPROBE: Nachtdienst 22:00–06:00 ergaebe eine NEGATIVE Dauer und wird abgewiesen', () => {
    // Das ist der Befund, unverstellt: die generierte Spalte rechnet
    // 6*60 - 22*60 = -960 und der Rechnungslauf macht daraus
    // ROUND(preis/100 * (-960/60), 2) — eine Position, die Geld ABZIEHT.
    expect(dauerMinuten('22:00', '06:00')).toBe(-960)

    const befund = pruefeZeitraum('22:00', '06:00')
    expect(befund.befund).toBe('ende_vor_beginn')
    expect(befund.dauerMinuten).toBe(-960)
    expect(befund.meldung).toMatch(/negativ/i)

    expect(istZeitraumGueltig('22:00', '06:00')).toBe(false)
    expect(() => assertZeitraumGueltig('22:00', '06:00')).toThrow(UserFacingError)
    expect(() => assertZeitraumGueltig('22:00', '06:00')).toThrow(/über Mitternacht/i)
  })

  it('GEGENPROBE: derselbe Einsatz als Tageseinsatz laeuft unveraendert durch', () => {
    // Ohne diese Probe waere "alles gesperrt" ebenfalls gruen.
    expect(istZeitraumGueltig('06:00', '22:00')).toBe(true)
    expect(() => assertZeitraumGueltig('06:00', '22:00')).not.toThrow()
    expect(pruefeZeitraum('06:00', '22:00').dauerMinuten).toBe(960)
  })

  it('weist Beginn gleich Ende ab — eine Position ueber 0,00 EUR', () => {
    const befund = pruefeZeitraum('09:00', '09:00')
    expect(befund.befund).toBe('ohne_dauer')
    expect(() => assertZeitraumGueltig('09:00', '09:00')).toThrow(UserFacingError)
  })

  it('ist fail-closed bei unlesbaren Zeiten', () => {
    // Ein stillschweigendes "dann eben ohne Pruefung" waere hier der
    // gefaehrlichere Ausgang: die generierte Spalte rechnet trotzdem.
    for (const [a, b] of [[null, '10:00'], ['09:00', undefined], ['', ''], ['x', 'y']] as const) {
      expect(pruefeZeitraum(a, b).befund).toBe('unlesbar')
      expect(() => assertZeitraumGueltig(a, b)).toThrow(UserFacingError)
    }
  })

  it('meldet 422 — der Aufrufer soll nicht raten muessen', () => {
    try {
      assertZeitraumGueltig('23:00', '01:00')
      throw new Error('haette werfen muessen')
    } catch (err) {
      expect(err).toBeInstanceOf(UserFacingError)
      expect((err as UserFacingError).status).toBe(422)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// B2 — "unterschrieben" ohne Unterschrift
// ═══════════════════════════════════════════════════════════════════════

const BELEGT_MIT_HASH = {
  id: 'a1', date: '2026-08-01',
  proof_status: 'UNTERSCHRIEBEN',
  signature_hash: 'deadbeef', client_signed_at: '2026-08-01T10:00:00Z',
  client_signature: null,
}

const BELEGT_MIT_BILD = {
  id: 'a2', date: '2026-08-02',
  proof_status: 'UNTERSCHRIEBEN',
  signature_hash: null, client_signed_at: null,
  client_signature: 'data:image/png;base64,iVBORw0KGgo=',
}

/** Genau der Zustand, den ein PATCH auf proof_status erzeugt. */
const ANGRIFF_NUR_STATUS = {
  id: 'x1', date: '2026-08-03',
  proof_status: 'UNTERSCHRIEBEN',
  signature_hash: null, client_signed_at: null,
  client_signature: null,
}

describe('B2: Unterschriftsbeleg statt Statuswert', () => {
  it('GEGENPROBE: proof_status=UNTERSCHRIEBEN ALLEIN ist kein Beleg', () => {
    // Genau diese Gleichsetzung macht create_invoice_draft_atomic:
    //   proof_status IS DISTINCT FROM 'UNTERSCHRIEBEN' AND signature_hash IS NULL
    // Eine Pflegekraft kann den Statuswert live per PostgREST auf ihrer
    // eigenen Zeile selbst setzen (Policy sr_engel_own ist FOR ALL).
    expect(unterschriftBelegt(ANGRIFF_NUR_STATUS)).toBe(false)
    expect(belegLuecke(ANGRIFF_NUR_STATUS)).toBe(true)
    expect(() => assertNachweiseBelegt([ANGRIFF_NUR_STATUS])).toThrow(UserFacingError)
    expect(() => assertNachweiseBelegt([ANGRIFF_NUR_STATUS])).toThrow(/Unterschriftsbeleg/)
  })

  it('GEGENPROBE: echte Unterschriften kommen unveraendert durch', () => {
    // Ohne diese Probe waere die Sperre kein Beweis, nur eine Blockade.
    expect(unterschriftBelegt(BELEGT_MIT_HASH)).toBe(true)
    expect(unterschriftBelegt(BELEGT_MIT_BILD)).toBe(true)
    expect(belegLuecke(BELEGT_MIT_HASH)).toBe(false)
    expect(belegLuecke(BELEGT_MIT_BILD)).toBe(false)
    expect(() => assertNachweiseBelegt([BELEGT_MIT_HASH, BELEGT_MIT_BILD])).not.toThrow()
  })

  it('ein Hash OHNE client_signed_at zaehlt nicht — so einen Hash bildet der Trigger nie', () => {
    expect(unterschriftBelegt({
      id: 'x2', proof_status: 'UNTERSCHRIEBEN',
      signature_hash: 'deadbeef', client_signed_at: null, client_signature: null,
    })).toBe(false)
  })

  it('erkennt die digitale Unterschrift der Native-App', () => {
    expect(unterschriftBelegt({
      id: 'a3', proof_status: 'UNTERSCHRIEBEN',
      signature_hash: null, client_signed_at: null, client_signature: null,
      digitale_signaturen: 1,
    })).toBe(true)
  })

  it('behandelt die Nicht-Unterschriften der text-Spalte als leer', () => {
    // client_signature ist live `text`; ein serialisiertes false oder null
    // ist keine Unterschrift, sieht aber wie ein gesetzter Wert aus.
    for (const wert of ['', '   ', 'false', 'FALSE', 'null']) {
      expect(unterschriftBelegt({ id: 'x', proof_status: 'UNTERSCHRIEBEN', client_signature: wert })).toBe(false)
    }
  })

  it('ein Entwurf ohne Unterschrift ist KEINE Beleg-Luecke', () => {
    // Wichtige Abgrenzung: unbelegt ist der Normalfall, solange niemand
    // behauptet, es liege eine Unterschrift vor. Wer beides vermischt,
    // meldet jeden offenen Nachweis als Befund — und dann glaubt niemand
    // mehr der Meldung.
    const entwurf = { id: 'e1', proof_status: 'ENTWURF', signature_hash: null, client_signed_at: null, client_signature: null }
    expect(unterschriftBelegt(entwurf)).toBe(false)
    expect(belegLuecke(entwurf)).toBe(false)
    expect(() => assertNachweiseBelegt([entwurf])).not.toThrow()
    expect(ohneBeleg([entwurf])).toHaveLength(1)
  })

  it('ABGERECHNET ohne Beleg ist ebenfalls eine Luecke', () => {
    expect(belegLuecke({ id: 'x3', proof_status: 'ABGERECHNET' })).toBe(true)
  })

  it('nennt die betroffenen Nachweise in der Meldung', () => {
    try {
      assertNachweiseBelegt([ANGRIFF_NUR_STATUS, BELEGT_MIT_HASH])
      throw new Error('haette werfen muessen')
    } catch (err) {
      expect((err as UserFacingError).status).toBe(422)
      expect((err as Error).message).toContain('x1')
      expect((err as Error).message).toContain('2026-08-03')
      // Der belegte Nachweis darf NICHT als Befund auftauchen.
      expect((err as Error).message).not.toContain('a1')
    }
  })
})

describe('B2: assertBelegteNachweise liest genau die Menge, die abgerechnet wird', () => {
  const PARAMS = {
    clientId: 'c-1',
    organizationId: 'org-1',
    periodMonth: '2026-02',
    budgetType: 'entlastung',
  }

  it('bildet die WHERE-Klausel der RPC nach — sonst prueft der Guard die falsche Menge', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    await assertBelegteNachweise(fake.client as never, PARAMS)

    const aufruf = fake.aufrufe.find(a => a.tabelle === 'service_records')
    expect(aufruf).toBeDefined()
    expect(aufruf!.operation).toBe('select')

    // Org-Fence: ohne ihn liesse sich ein fremder Mandant pruefen.
    expect(hatFilter(aufruf, 'eq', 'organization_id', 'org-1')).toBe(true)
    expect(hatFilter(aufruf, 'eq', 'client_id', 'c-1')).toBe(true)
    expect(hatFilter(aufruf, 'eq', 'budget_type', 'entlastung')).toBe(true)

    // Zeitraum: Februar 2026 hat 28 Tage — ein fest verdrahteter 31.
    // wuerde hier auffallen.
    expect(hatFilter(aufruf, 'gte', 'date', '2026-02-01')).toBe(true)
    expect(hatFilter(aufruf, 'lte', 'date', '2026-02-28')).toBe(true)

    // status-Menge wie in der RPC
    const inFilter = aufruf!.filter.find(f => f.methode === 'in' && f.spalte === 'status')
    expect(inFilter?.wert).toEqual(['signed', 'complete'])

    // Ohne diese Spalten laesst sich der Beleg nicht beurteilen.
    for (const spalte of ['signature_hash', 'client_signed_at', 'client_signature', 'proof_status']) {
      expect(BELEG_SPALTEN).toContain(spalte)
      expect(aufruf!.spalten).toContain(spalte)
    }
  })

  it('erkennt das Schaltjahr — der 29.02.2028 darf nicht aus dem Zeitraum fallen', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    await assertBelegteNachweise(fake.client as never, { ...PARAMS, periodMonth: '2028-02' })
    const aufruf = fake.aufrufe.find(a => a.tabelle === 'service_records')
    expect(hatFilter(aufruf, 'lte', 'date', '2028-02-29')).toBe(true)
  })

  it('GEGENPROBE: ein unbelegter Nachweis verhindert die Rechnung', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [ANGRIFF_NUR_STATUS] }))
    await expect(assertBelegteNachweise(fake.client as never, PARAMS))
      .rejects.toThrow(/Unterschriftsbeleg/)
  })

  it('GEGENPROBE: belegte Nachweise laufen durch', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [BELEGT_MIT_HASH, BELEGT_MIT_BILD] }))
    await expect(assertBelegteNachweise(fake.client as never, PARAMS)).resolves.toBeUndefined()
  })

  it('ist fail-closed bei einem Lesefehler — keine Rechnung auf ungeprueften Nachweisen', async () => {
    const fake = erstelleFakeSupabase(() => ({ error: { message: 'timeout', code: '57014' } }))
    await expect(assertBelegteNachweise(fake.client as never, PARAMS)).rejects.toThrow(UserFacingError)
    await expect(assertBelegteNachweise(fake.client as never, PARAMS)).rejects.toThrow(/nicht gelesen/i)
  })

  it('schreibt nichts — ein Guard, der schreibt, ist kein Guard', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [ANGRIFF_NUR_STATUS] }))
    await assertBelegteNachweise(fake.client as never, PARAMS).catch(() => {})
    expect(fake.aufrufe.filter(a => a.operation !== 'select')).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// B3 — PfluV-Obergrenze: Anwendung und Datenbank waehlen unterschiedlich
// ═══════════════════════════════════════════════════════════════════════

/** Die beiden Zeilen, wie sie live am 28.08.2026 stehen. */
const LIVE_REGELN: ObergrenzenRegel[] = [
  {
    bundesland: 'hessen', rechtsgrundlage: '§45b SGB XI', leistungsart: null,
    angebotstyp: 'betreuungsangebot', verguetungsart: 'zeit_stunde',
    obergrenze_cent: 3000, quelle: 'PfluV Hessen', quelle_paragraf: '§ 6',
    bestaetigt: true, gueltig_ab: '2025-01-01', gueltig_bis: null, ist_aktiv: true,
  },
  {
    bundesland: 'hessen', rechtsgrundlage: '§45b SGB XI', leistungsart: null,
    angebotstyp: 'entlastungsangebot', verguetungsart: 'zeit_stunde',
    obergrenze_cent: 2500, quelle: 'PfluV Hessen', quelle_paragraf: '§ 6',
    bestaetigt: true, gueltig_ab: '2025-01-01', gueltig_bis: null, ist_aktiv: true,
  },
]

function eingabe(leistungsart: string | null, preisCent: number) {
  return {
    preisCent,
    rechtsgrundlage: '§45b SGB XI',
    verguetungsart: 'zeit_stunde',
    leistungsart,
    bundesland: 'hessen',
    gueltigAb: '2026-08-28',
  }
}

describe('B3: Obergrenze nach Angebotstyp (§45a Abs. 1 S. 2 SGB XI)', () => {
  it('die Anwendung trennt Betreuung (30 EUR) von Entlastung (25 EUR)', () => {
    expect(angebotstypVon('betreuung_45a')).toBe('betreuungsangebot')
    expect(angebotstypVon('hauswirtschaft')).toBe('entlastungsangebot')

    expect(pruefeGegenRegeln(LIVE_REGELN, eingabe('betreuung_45a', 3000)).obergrenzeCent).toBe(3000)
    expect(pruefeGegenRegeln(LIVE_REGELN, eingabe('hauswirtschaft', 2500)).obergrenzeCent).toBe(2500)
  })

  it('GEGENPROBE: der DB-Trigger kann die beiden Zeilen NICHT auseinanderhalten', () => {
    // Live nachgestellt: fuer hauswirtschaft (Soll 2500) liefert die
    // Auswahl des Triggers 3000 — er kennt den Angebotstyp nicht, und
    // beide Zeilen sind fuer seinen Filter gleichwertig.
    const db = datenbankAuswahl(LIVE_REGELN, eingabe('hauswirtschaft', 2800))
    expect(db.gleichwertig).toBe(2)
    expect([2500, 3000]).toContain(db.regel?.obergrenze_cent)
  })

  it('GEGENPROBE: ein 28-EUR-Hauswirtschaftstarif — Anwendung sperrt, Datenbank kann durchlassen', () => {
    // 2800 Cent liegt UEBER der Entlastungsgrenze (2500) und UNTER der
    // Betreuungsgrenze (3000). Genau in dieser Luecke wirkt der Befund.
    const anwendung = pruefeGegenRegeln(LIVE_REGELN, eingabe('hauswirtschaft', 2800))
    expect(anwendung.status).toBe('verstoss')   // bestaetigt=true → nicht nur Warnung
    expect(anwendung.obergrenzeCent).toBe(2500)

    const abw = abweichungZurDatenbank(LIVE_REGELN, eingabe('hauswirtschaft', 2800))
    expect(abw.anwendungCent).toBe(2500)
    expect(abw.gleichwertigeZeilen).toBe(2)
    expect(abw.unbestimmt).toBe(true)
    expect(abw.meldung).toMatch(/Angebotstyp/)
    expect(abw.meldung).toMatch(/20261017000002/)
  })

  it('GEGENPROBE: ein rechtmaessiger 30-EUR-Betreuungstarif bleibt eingehalten', () => {
    // Ohne diese Probe koennte die Regel schlicht alles sperren.
    const anwendung = pruefeGegenRegeln(LIVE_REGELN, eingabe('betreuung_45a', 3000))
    expect(anwendung.status).toBe('eingehalten')
    expect(anwendung.meldung).toBeNull()
  })

  it('bei unbestimmtem Angebotstyp gilt die MILDESTE Grenze, und die Unschaerfe wird genannt', () => {
    // 'alltagsbegleitung' passt auf Nr. 1 wie auf Nr. 3 — 5 EUR auf eine
    // Wortaehnlichkeit zu stuetzen waere geraten, nicht belegt.
    expect(angebotstypVon('alltagsbegleitung')).toBeNull()
    const befund = pruefeGegenRegeln(LIVE_REGELN, eingabe('alltagsbegleitung', 3200))
    expect(befund.angebotstypUnbestimmt).toBe(true)
    expect(befund.obergrenzeCent).toBe(3000)
    expect(befund.meldung).toMatch(/nicht eindeutig/)
  })

  it('Privattarife bleiben ausgenommen — die PfluV deckelt sie nicht', () => {
    const befund = pruefeGegenRegeln(LIVE_REGELN, { ...eingabe('hauswirtschaft', 4000), rechtsgrundlage: 'privat' })
    expect(befund.status).toBe('privat_ausgenommen')
    expect(abweichungZurDatenbank(LIVE_REGELN, { ...eingabe('hauswirtschaft', 4000), rechtsgrundlage: 'privat' }).meldung).toBeNull()
  })

  it('unbestaetigte Regeln zieht der Trigger gar nicht — die Nachstellung bildet das ab', () => {
    const unbestaetigt = LIVE_REGELN.map(r => ({ ...r, bestaetigt: false }))
    expect(datenbankAuswahl(unbestaetigt, eingabe('hauswirtschaft', 2800)).regel).toBeNull()
    // Die Anwendung prueft weiter und warnt statt zu sperren.
    expect(pruefeGegenRegeln(unbestaetigt, eingabe('hauswirtschaft', 2800)).status).toBe('warnung')
  })

  it('eine leistungsart-genaue Regel schlaegt die typ-weite — in beiden Auswahlen', () => {
    const mitGenauer: ObergrenzenRegel[] = [
      ...LIVE_REGELN,
      { ...LIVE_REGELN[1], leistungsart: 'hauswirtschaft', obergrenze_cent: 2200 },
    ]
    expect(pruefeGegenRegeln(mitGenauer, eingabe('hauswirtschaft', 2300)).obergrenzeCent).toBe(2200)
    expect(datenbankAuswahl(mitGenauer, eingabe('hauswirtschaft', 2300)).regel?.obergrenze_cent).toBe(2200)
    expect(datenbankAuswahl(mitGenauer, eingabe('hauswirtschaft', 2300)).gleichwertig).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// B4/Q4 — Entlastungsbetrag: 131 EUR, nicht 125 EUR
// ═══════════════════════════════════════════════════════════════════════

describe('Entlastungsbetrag und Jahresbudgets', () => {
  it('gilt seit 2025 mit 131 EUR monatlich und 1.572 EUR jaehrlich', () => {
    expect(ENTLASTUNG_MONATLICH_EUR).toBe(131)
    expect(ENTLASTUNG_JAEHRLICH_EUR).toBe(1572)
    expect(ENTLASTUNG_JAEHRLICH_EUR).toBe(ENTLASTUNG_MONATLICH_EUR * 12)
  })

  it('§42a VP/KZP ist ein gemeinsamer Jahresbetrag von 3.539 EUR', () => {
    expect(VP_KZP_KOMBINIERT_EUR).toBe(3539)
  })

  it('2026 und 2027 werden nach demselben Satz gerechnet', () => {
    for (const jahr of [2025, 2026, 2027]) {
      expect(budgetVersionFuerJahr(jahr).entlastungMonatlich).toBe(131)
    }
  })

  it('GEGENPROBE: 125 EUR gelten NUR fuer 2024 und duerfen nicht in die Gegenwart lecken', () => {
    // Die alten Werte bleiben stehen, damit Rechnungen von 2024
    // reproduzierbar sind — sie duerfen aber nie Standard werden.
    expect(budgetVersionFuerJahr(2024).entlastungMonatlich).toBe(125)
    expect(budgetVersionFuerJahr(2024).entlastungJaehrlich).toBe(1500)
    expect(budgetVersionFuerJahr(2025).entlastungMonatlich).not.toBe(125)
  })

  it('ist fail-closed vor dem fruehesten hinterlegten Jahr — kein geratener Ersatzwert', () => {
    // Ein stiller Fallback auf den naechstgelegenen Satz erzeugte
    // entweder unzulaessige Abrechnungen oder blockierte berechtigte.
    expect(() => budgetVersionFuerJahr(2023)).toThrow(/Keine gesetzlichen Budgetwerte/)
    expect(() => budgetVersionFuerJahr(2026.5)).toThrow()
  })

  it('RESTPOSTEN, festgehalten: nach VORNE ist der Eintrag offen, nicht fail-closed', () => {
    // Der 2025er-Eintrag traegt gueltigBis '9999-12-31'. Ab dem
    // 01.01.2028 — der naechsten Dynamisierung nach § 30 SGB XI — rechnet
    // das Modul deshalb still mit den Saetzen von 2025 weiter, statt zu
    // werfen. Das ist eine bewusste Entscheidung und kein Versehen: die
    // Alternative waere, an einem Stichtag die gesamte Abrechnung
    // anzuhalten. Ein Satz fuer 2028 wird hier NICHT erfunden — er muss
    // aus dem Verordnungstext kommen. Dieser Test haelt die Tatsache fest,
    // damit sie nicht fuer eine Zusicherung gehalten wird.
    expect(budgetVersionFuerJahr(2028).entlastungMonatlich).toBe(131)
    expect(budgetVersionFuerJahr(2030).gueltigBis).toBe('9999-12-31')
  })
})
