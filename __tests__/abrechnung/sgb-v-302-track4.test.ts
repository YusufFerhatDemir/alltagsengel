/**
 * Track 4 (19.08.2026) — § 302 SGB V: Tarif-Fail-Closed, Absender-IK,
 * Mandantenfilter, Verfahrenstrennung der Fehlercodes.
 *
 * Diese Tests decken genau die Lücken ab, die Track 4 geschlossen hat. Sie
 * sind bewusst so geschrieben, dass sie WIEDER ROT werden, wenn jemand die
 * Prüfungen entfernt — nicht nur, dass "irgendetwas" zurückkommt.
 */
import { describe, it, expect, vi } from 'vitest'
import { pruefeAufbereitungTarife } from '@/lib/abrechnung/sgb-v/validierung'
import { klassifiziereFehlercode, verfahrenAusQuelle } from '@/lib/abrechnung/ruecklaeufer-fehlercodes'
import type { HkpFall, HkpPosition } from '@/lib/abrechnung/sgb-v/positionen'

vi.mock('@/lib/billing/core/price-resolver', () => ({
  resolvePrice: vi.fn(),
}))
import { resolvePrice } from '@/lib/billing/core/price-resolver'

function position(over: Partial<HkpPosition> = {}): HkpPosition {
  return {
    leistung_id: 'l-1', client_id: 'c-1', klient_name: 'Max Mustermann',
    versichertennummer: 'A123456789', verordnung_id: 'v-1', verordnung_nummer: 'M12-1',
    aktenzeichen: null, kostentraeger_ik: '109519005', kostentraeger_name: 'Testkasse',
    datum: '2026-08-05', dauer_minuten: 30, leistungsart: 'behandlungspflege',
    betrag_cent: 5000, ...over,
  }
}

function fall(positionen: HkpPosition[]): HkpFall {
  return {
    kostentraeger_ik: positionen[0]?.kostentraeger_ik ?? '109519005',
    kostentraeger_name: 'Testkasse',
    client_id: positionen[0]?.client_id ?? 'c-1',
    klient_name: 'Max Mustermann',
    versichertennummer: 'A123456789',
    positionen,
    betrag_cent: positionen.reduce((s, p) => s + p.betrag_cent, 0),
  }
}

const sb = {} as never

describe('pruefeAufbereitungTarife — Fail-Closed gegen nicht verifizierte Tarife', () => {
  it('lehnt jede Position ab, deren Tarif nicht auflösbar ist', async () => {
    vi.mocked(resolvePrice).mockRejectedValue(new Error('Kein verifizierter Tarif hinterlegt'))

    const ergebnis = await pruefeAufbereitungTarife(sb, 'org-1', { faelle: [fall([position()])] })

    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.faelle).toHaveLength(0)
    expect(ergebnis.ohneTarif).toHaveLength(1)
    expect(ergebnis.ohneTarif[0].hinweis).toContain('Kein verifizierter § 37-Tarif')
  })

  it('lässt Positionen mit auflösbarem Tarif durch und rechnet den Fallbetrag neu', async () => {
    vi.mocked(resolvePrice).mockResolvedValue({} as never)

    const ergebnis = await pruefeAufbereitungTarife(sb, 'org-1', {
      faelle: [fall([position({ leistung_id: 'l-1', betrag_cent: 3000 }), position({ leistung_id: 'l-2', betrag_cent: 2000 })])],
    })

    expect(ergebnis.ok).toBe(true)
    expect(ergebnis.faelle).toHaveLength(1)
    expect(ergebnis.faelle[0].betrag_cent).toBe(5000)
    expect(ergebnis.geprueftePositionen).toBe(2)
  })

  it('entfernt einen Fall vollständig, wenn alle seine Positionen durchfallen — keine leere Forderung', async () => {
    vi.mocked(resolvePrice).mockImplementation(async (_sb: unknown, params: { leistungsart: string }) => {
      if (params.leistungsart === 'unbekannt') throw new Error('kein Tarif')
      return {} as never
    })

    const ergebnis = await pruefeAufbereitungTarife(sb, 'org-1', {
      faelle: [
        fall([position({ leistung_id: 'l-ok', leistungsart: 'behandlungspflege' })]),
        fall([position({ leistung_id: 'l-bad', client_id: 'c-2', leistungsart: 'unbekannt' })]),
      ],
    })

    expect(ergebnis.faelle).toHaveLength(1)
    expect(ergebnis.faelle[0].positionen[0].leistung_id).toBe('l-ok')
    expect(ergebnis.ohneTarif.map(o => o.leistung_id)).toEqual(['l-bad'])
  })

  it('behandelt eine Position ohne Leistungsart als nicht abrechenbar', async () => {
    vi.mocked(resolvePrice).mockResolvedValue({} as never)

    const ergebnis = await pruefeAufbereitungTarife(sb, 'org-1', {
      faelle: [fall([position({ leistungsart: null })])],
    })

    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.ohneTarif[0].hinweis).toContain('keine Leistungsart')
  })

  it('löst identische (Leistungsart, Datum, IK) nur einmal auf', async () => {
    vi.mocked(resolvePrice).mockReset()
    vi.mocked(resolvePrice).mockResolvedValue({} as never)

    await pruefeAufbereitungTarife(sb, 'org-1', {
      faelle: [fall([
        position({ leistung_id: 'l-1' }),
        position({ leistung_id: 'l-2' }),
        position({ leistung_id: 'l-3' }),
      ])],
    })

    expect(vi.mocked(resolvePrice)).toHaveBeenCalledTimes(1)
  })
})

describe('verfahrenAusQuelle — § 105-Fehlercodes dürfen nicht auf § 302 durchschlagen', () => {
  it('ordnet das heute gepflegte Verzeichnis KEINEM Verfahren zu — "TA1" allein ist mehrdeutig', () => {
    // Live-Stand 19.08.2026: alle 20 Einträge in dta_fehlercode_katalog tragen
    // genau diese Quellenangabe. Sie nennt keine Vorschrift, also greift sie
    // bei gesetztem Verfahrensfilter nicht — auch nicht für § 105.
    expect(verfahrenAusQuelle('TA1 6.5.1 Anlage 4 Fehlerverzeichnis')).toBeNull()
  })

  it('erkennt eine ausdrücklich benannte § 302-Quelle', () => {
    expect(verfahrenAusQuelle('Anlage 4 zur Vereinbarung nach § 302 Abs. 2 SGB V, Stand 01/2026')).toBe('sgb_v_302')
  })

  it('erkennt eine ausdrücklich benannte § 105-Quelle', () => {
    expect(verfahrenAusQuelle('TA1 zur Vereinbarung nach § 105 Abs. 2 SGB XI, Version 21')).toBe('sgb_xi_105')
  })

  it('ordnet einen Eintrag ohne Quellenangabe KEINEM Verfahren zu', () => {
    expect(verfahrenAusQuelle(null)).toBeNull()
    expect(verfahrenAusQuelle('   ')).toBeNull()
  })

  it('ordnet eine unbekannte Quelle keinem Verfahren zu, statt zu raten', () => {
    expect(verfahrenAusQuelle('Interne Notiz vom Telefonat')).toBeNull()
  })
})

describe('klassifiziereFehlercode — Verfahrensfilter', () => {
  /** Katalogzeile im Live-Format: § 105-Fehlerverzeichnis, keine Vorschrift genannt. */
  const katalogZeile = {
    id: 'kat-1', kategorie: 'verarbeitungsfehler',
    beschreibung: 'Nutzdatendatei fehlerhaft — EDIFACT-Struktur ungueltig',
    massnahme: 'EDIFACT-Validator ausfuehren.', korrigierbar: true,
    spec_quelle: 'TA1 6.5.1 Anlage 4 Fehlerverzeichnis',
    organization_id: null, quelle_ik: null,
  }

  /** Kette endet erst beim await — `.is()` ist der letzte Aufruf in der Abfrage. */
  function fakeSupabase(treffer: Array<typeof katalogZeile>) {
    const api: Record<string, unknown> = {}
    const chain = () => api
    Object.assign(api, {
      select: chain, eq: chain, or: chain, is: chain,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: treffer, error: null }).then(resolve),
    })
    return { from: () => api } as never
  }

  it('übernimmt ohne Verfahrensangabe den Katalogeintrag (bisheriges § 105-Verhalten)', async () => {
    const k = await klassifiziereFehlercode(fakeSupabase([katalogZeile]), 'org-1', '02', null, null)
    expect(k.herkunft).toBe('katalog')
    expect(k.beschreibung).toContain('EDIFACT-Struktur')
  })

  it('übernimmt denselben Eintrag NICHT für § 302 — fremdes Verfahren, gleicher Code', async () => {
    const k = await klassifiziereFehlercode(
      fakeSupabase([katalogZeile]), 'org-1', '02', null, null, { verfahren: 'sgb_v_302' },
    )
    expect(k.herkunft).not.toBe('katalog')
    expect(k.beschreibung).not.toContain('EDIFACT-Struktur')
  })

  it('nutzt für § 302 einen Eintrag mit passender Quellenangabe', async () => {
    const k = await klassifiziereFehlercode(
      fakeSupabase([{
        ...katalogZeile,
        beschreibung: 'Verordnung fehlt',
        spec_quelle: 'Anlage 4 zur Vereinbarung nach § 302 Abs. 2 SGB V',
      }]),
      'org-1', '02', null, null, { verfahren: 'sgb_v_302' },
    )
    expect(k.herkunft).toBe('katalog')
    expect(k.beschreibung).toBe('Verordnung fehlt')
  })
})
