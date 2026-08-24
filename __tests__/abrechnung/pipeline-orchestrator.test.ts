/**
 * Pipeline-Orchestrator (lib/abrechnung/pipeline-orchestrator.ts)
 *
 * Die Uebersicht, an der abgelesen wird, was in der Kassenabrechnung
 * gerade offen ist — und die einzige Stelle, die Laeufe OHNE menschlichen
 * Klick freigeben kann. Zwei Risiken:
 *
 *   1. Eine leere Uebersicht sieht aus wie "nichts zu tun". Bleibt ein
 *      Lesefehler unbemerkt, faellt die ganze Kassenabrechnung aus dem
 *      Blick — ohne Fehlermeldung, ohne leere Liste als Verdachtsmoment.
 *   2. Die Auto-Freigabe schreibt Status auf Laeufen, die anschliessend an
 *      die Kasse gehen. Sie muss genau die Laeufe treffen, die sie geprueft
 *      hat, und keinen zweimal.
 */

import { describe, it, expect } from 'vitest'
import {
  holePipelineStatus,
  pruefeUndVerarbeitePipeline,
} from '@/lib/abrechnung/pipeline-orchestrator'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const ACTOR = '22222222-2222-4222-8222-222222222222'

function lauf(id: string, status: string, ueberschreibung: Record<string, unknown> = {}) {
  return {
    id,
    abrechnungsmonat: '2026-05',
    kostentraeger_name: 'AOK Hessen',
    kostentraeger_ik: '109519005',
    status,
    updated_at: '2026-06-01T08:00:00Z',
    ...ueberschreibung,
  }
}

// ---------------------------------------------------------------------------
// 1 — Uebersicht
// ---------------------------------------------------------------------------

describe('holePipelineStatus — Abfrage', () => {
  function fake(antworten: Partial<Record<string, { data?: unknown; error?: { message: string } | null; count?: number }>> = {}) {
    return erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'abrechnungslaeufe') return antworten.abrechnungslaeufe ?? { data: [] }
      if (a.tabelle === 'dta_ruecklaeufer') {
        return a.head
          ? (antworten.unzugeordnet ?? { data: null, count: 0 })
          : (antworten.dta_ruecklaeufer ?? { data: [] })
      }
      return { data: null }
    })
  }

  /**
   * Regressionsschutz: abrechnungslaeufe hat KEIN created_at, der
   * Anlagezeitpunkt heisst erstellt_am. Mit dem falschen Namen scheiterte
   * die Abfrage mit 42703 und die Pipeline-Uebersicht war dauerhaft leer —
   * ohne sichtbaren Fehler.
   */
  it('sortiert nach erstellt_am, nicht nach created_at', async () => {
    const f = fake()
    await holePipelineStatus(f.client, ORG)
    const a = f.ersterAuf('abrechnungslaeufe')
    expect(hatFilter(a, 'order', 'erstellt_am')).toBe(true)
    expect(hatFilter(a, 'order', 'created_at')).toBe(false)
    expect(a?.spalten).not.toContain('created_at')
  })

  it('setzt den Mandanten-Fence auf alle drei Abfragen', async () => {
    const f = fake({ abrechnungslaeufe: { data: [lauf('l-1', 'geprueft')] } })
    await holePipelineStatus(f.client, ORG)
    for (const a of f.aufrufe) {
      expect(hatOrgFence(a, ORG), `${a.tabelle} ohne Mandanten-Fence`).toBe(true)
    }
  })

  it('blendet stornierte und abgeschlossene Laeufe aus', async () => {
    const f = fake()
    await holePipelineStatus(f.client, ORG)
    const a = f.ersterAuf('abrechnungslaeufe')
    expect(a?.filter.some(x => x.methode === 'not' && x.spalte === 'status')).toBe(true)
  })

  /**
   * BEFUND — Fail-Open auf dem Lesepfad.
   *
   * Die Laufabfrage wurde nie auf `error` geprueft. Ein Lesefehler (RLS,
   * Schema-Drift, Netzwerk) lieferte damit `laeufe: []` und die
   * Zusammenfassung lauter Nullen — nicht unterscheidbar von "es ist
   * gerade nichts offen". Genau so war die Uebersicht schon einmal
   * wochenlang leer (siehe der 42703-Kommentar im Modul); der
   * Spaltenname wurde repariert, das stille Verschlucken nicht.
   */
  it('wirft bei einem Lesefehler, statt eine leere Pipeline zu melden', async () => {
    const f = fake({ abrechnungslaeufe: { data: null, error: { message: 'permission denied' } } })
    await expect(holePipelineStatus(f.client, ORG)).rejects.toThrow(/nicht lesbar|permission denied/)
  })

  it('wirft auch, wenn nur die Ruecklaeufer nicht lesbar sind', async () => {
    const f = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'abrechnungslaeufe') return { data: [lauf('l-1', 'uebermittelt')] }
      return { data: null, error: { message: 'permission denied' } }
    })
    await expect(holePipelineStatus(f.client, ORG)).rejects.toThrow(/nicht lesbar|permission denied/)
  })

  it('fragt die Ruecklaeufer nur ab, wenn es ueberhaupt Laeufe gibt', async () => {
    const f = fake({ abrechnungslaeufe: { data: [] } })
    await holePipelineStatus(f.client, ORG)
    // Nur die Zaehlabfrage der unzugeordneten Ruecklaeufer, keine Count-Abfrage je Lauf.
    expect(f.auf('dta_ruecklaeufer').filter(a => !a.head)).toHaveLength(0)
  })
})

describe('holePipelineStatus — Auswertung', () => {
  function fake(laeufe: unknown[], ruecklaeufer: unknown[] = [], unzugeordnet = 0) {
    return erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'abrechnungslaeufe') return { data: laeufe }
      if (a.tabelle === 'dta_ruecklaeufer') {
        return a.head ? { data: null, count: unzugeordnet } : { data: ruecklaeufer }
      }
      return { data: null }
    })
  }

  const schrittAbbildung: Array<[string, string, string | null]> = [
    ['erstellt', 'erstellt', 'Validierung starten'],
    ['validierung_laeuft', 'erstellt', null],
    ['validierung_fehlgeschlagen', 'erstellt', 'Fehler korrigieren und erneut validieren'],
    ['geprueft', 'geprueft', 'Freigabe erteilen'],
    ['bereit_zum_export', 'geprueft', 'Freigabe erteilen'],
    ['freigegeben', 'freigegeben', 'EDIFACT exportieren'],
    ['exportiert', 'exportiert', 'Über DAKOTA versenden'],
    ['uebermittelt', 'uebermittelt', 'Auf Quittung warten'],
    ['quittiert', 'quittiert', 'Auf Rückmeldung der Kasse warten'],
    ['angenommen', 'antwort_eingegangen', 'Zahlungseingang prüfen'],
    ['teilweise_abgelehnt', 'antwort_eingegangen', 'Korrekturlauf erstellen'],
    ['abgelehnt', 'antwort_eingegangen', 'Korrekturlauf erstellen'],
    ['korrektur_erforderlich', 'korrektur_noetig', 'Korrektur durchführen'],
    ['korrigiert', 'korrektur_noetig', null],
  ]

  for (const [status, schritt, naechster] of schrittAbbildung) {
    it(`Status "${status}" wird zu Schritt "${schritt}"`, async () => {
      const s = await holePipelineStatus(fake([lauf('l-1', status)]).client, ORG)
      expect(s.laeufe[0].aktuellerSchritt).toBe(schritt)
      expect(s.laeufe[0].naechsterSchritt).toBe(naechster)
    })
  }

  it('nur geprueft und bereit_zum_export sind auto-freigabefaehig', async () => {
    for (const [status] of schrittAbbildung) {
      const s = await holePipelineStatus(fake([lauf('l-1', status)]).client, ORG)
      expect(s.laeufe[0].autoFreigabeMoeglich, status)
        .toBe(status === 'geprueft' || status === 'bereit_zum_export')
    }
  })

  it('zaehlt Ruecklaeufer je Lauf und laesst unzugeordnete aussen vor', async () => {
    const f = fake(
      [lauf('l-1', 'uebermittelt'), lauf('l-2', 'quittiert')],
      [{ lauf_id: 'l-1' }, { lauf_id: 'l-1' }, { lauf_id: 'l-2' }, { lauf_id: null }],
      4,
    )
    const s = await holePipelineStatus(f.client, ORG)
    expect(s.laeufe.find(l => l.id === 'l-1')?.ruecklaeuferAnzahl).toBe(2)
    expect(s.laeufe.find(l => l.id === 'l-2')?.ruecklaeuferAnzahl).toBe(1)
    expect(s.unzugeordneteRuecklaeufer).toBe(4)
  })

  it('fasst die Lage nach Wartegrund zusammen', async () => {
    const f = fake([
      lauf('l-1', 'geprueft'),
      lauf('l-2', 'bereit_zum_export'),
      lauf('l-3', 'uebermittelt'),
      lauf('l-4', 'quittiert'),
      lauf('l-5', 'abgelehnt'),
      lauf('l-6', 'validierung_fehlgeschlagen'),
      lauf('l-7', 'angenommen'),
    ])
    const s = await holePipelineStatus(f.client, ORG)
    expect(s.zusammenfassung).toMatchObject({
      gesamt: 7,
      wartendAufFreigabe: 2,
      wartendAufAntwort: 2,
      fehlerhaft: 2,
    })
  })

  /**
   * Bewusst festgehalten: `abgeschlossen` zaehlt Laeufe im Status
   * `angenommen`, nicht solche im Status `abgeschlossen`. Das ist kein
   * Versehen, sondern folgt aus der Abfrage — echte `abgeschlossen`-Laeufe
   * werden oben ausgefiltert und koennten hier gar nicht auftauchen.
   * Fachlich gemeint ist: "von der Kasse angenommen, Geld erwartet".
   */
  it('zaehlt unter abgeschlossen die von der Kasse angenommenen Laeufe', async () => {
    const f = fake([lauf('l-1', 'angenommen'), lauf('l-2', 'uebermittelt')])
    const s = await holePipelineStatus(f.client, ORG)
    expect(s.zusammenfassung.abgeschlossen).toBe(1)
  })

  it('faellt bei fehlendem Kostentraegernamen auf einen Strich zurueck, nicht auf "null"', async () => {
    const f = fake([lauf('l-1', 'erstellt', { kostentraeger_name: null, kostentraeger_ik: null })])
    const s = await holePipelineStatus(f.client, ORG)
    expect(s.laeufe[0].kostentraegerName).toBe('—')
    expect(s.laeufe[0].kostentraegerIk).toBe('')
  })
})

// ---------------------------------------------------------------------------
// 2 — Verarbeitung
// ---------------------------------------------------------------------------

describe('pruefeUndVerarbeitePipeline — Auto-Freigabe', () => {
  function fake(optionen: {
    freigabeKandidaten?: unknown[]
    offeneRuecklaeufer?: unknown[]
    abgelehnteRl?: unknown[]
    passenderLauf?: unknown
    bestehendeKorrektur?: unknown
    freigabeFehler?: boolean
  } = {}) {
    return erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'abrechnungslaeufe' && a.operation === 'select') {
        // Zuordnungs-Abfrage sucht nach kostentraeger_ik, Freigabe-Abfrage nicht.
        if (hatFilter(a, 'eq', 'kostentraeger_ik')) return { data: optionen.passenderLauf ?? null }
        return { data: optionen.freigabeKandidaten ?? [] }
      }
      if (a.tabelle === 'abrechnungslaeufe' && a.operation === 'update') {
        if (optionen.freigabeFehler) return { data: null, error: { message: 'row level security' } }
        // Ein erfolgreiches Update liefert die getroffene Zeile zurueck —
        // daran erkennt der Orchestrator, dass er das Rennen gewonnen hat.
        const id = a.filter.find(x => x.methode === 'eq' && x.spalte === 'id')?.wert
        return { data: [{ id }] }
      }
      if (a.tabelle === 'dta_ruecklaeufer' && a.operation === 'select') {
        if (hatFilter(a, 'is', 'lauf_id', null)) return { data: optionen.offeneRuecklaeufer ?? [] }
        return { data: optionen.abgelehnteRl ?? [] }
      }
      if (a.tabelle === 'dta_korrekturlaeufe') return { data: optionen.bestehendeKorrektur ?? null }
      return { data: null }
    })
  }

  it('gibt ohne die Option gar nichts frei', async () => {
    const f = fake({ freigabeKandidaten: [{ id: 'l-1' }] })
    const r = await pruefeUndVerarbeitePipeline(f.client, ORG, ACTOR)
    expect(r.autoFreigegeben).toBe(0)
    expect(f.auf('abrechnungslaeufe').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('gibt mit der Option frei und vermerkt Freigeber und Zeitpunkt', async () => {
    const f = fake({ freigabeKandidaten: [{ id: 'l-1' }, { id: 'l-2' }] })
    const r = await pruefeUndVerarbeitePipeline(f.client, ORG, ACTOR, { autoFreigabe: true })
    expect(r.autoFreigegeben).toBe(2)
    const p = f.auf('abrechnungslaeufe').find(a => a.operation === 'update')?.payload as Record<string, unknown>
    expect(p.status).toBe('freigegeben')
    expect(p.freigegeben_von).toBe(ACTOR)
    expect(p.freigegeben_am).toBeTruthy()
  })

  it('holt nur geprueft/bereit_zum_export als Freigabe-Kandidaten', async () => {
    const f = fake()
    await pruefeUndVerarbeitePipeline(f.client, ORG, ACTOR, { autoFreigabe: true })
    const a = f.auf('abrechnungslaeufe').find(x => x.operation === 'select' && hatFilter(x, 'in', 'status'))
    expect(hatFilter(a, 'in', 'status', ['geprueft', 'bereit_zum_export'])).toBe(true)
    expect(hatOrgFence(a, ORG)).toBe(true)
  })

  /**
   * BEFUND — Freigabe ohne Status-Guard im WHERE.
   *
   * Zwischen "Kandidaten lesen" und "Status schreiben" liegt ein Zeitfenster.
   * Das Update traf den Lauf allein ueber seine ID. Zwei parallele
   * Pipeline-Laeufe (Cron plus Klick, oder zwei Mandanten-Tabs) lasen damit
   * beide denselben `geprueft`-Lauf und schrieben beide `freigegeben` —
   * doppelte Freigabe, doppelter Audit-Eintrag, und ein Lauf, der
   * inzwischen von Hand auf `storniert` gesetzt wurde, wurde ueberschrieben
   * und ging an die Kasse.
   *
   * Der Status gehoert deshalb in die WHERE-Bedingung: nur wer den Lauf
   * noch im erwarteten Zustand antrifft, darf ihn freigeben.
   */
  it('schreibt die Freigabe nur auf Laeufe, die noch im erwarteten Status stehen', async () => {
    const f = fake({ freigabeKandidaten: [{ id: 'l-1' }] })
    await pruefeUndVerarbeitePipeline(f.client, ORG, ACTOR, { autoFreigabe: true })
    const update = f.auf('abrechnungslaeufe').find(a => a.operation === 'update')
    expect(hatOrgFence(update, ORG)).toBe(true)
    expect(
      hatFilter(update, 'in', 'status', ['geprueft', 'bereit_zum_export']),
      'Auto-Freigabe ohne Status-Guard im WHERE — ein zwischenzeitlich stornierter Lauf wird ueberschrieben',
    ).toBe(true)
  })

  /**
   * BEFUND — dieselbe Rueckmeldung-ohne-Deckung wie im Fristen-Manager:
   * das Freigabe-Update wurde nicht auf `error` geprueft, der Zaehler lief
   * trotzdem hoch. Die Oberflaeche meldete Freigaben, die es nicht gab.
   */
  it('zaehlt keine Freigabe, wenn der Lauf den Status zwischenzeitlich gewechselt hat', async () => {
    // Update ohne Treffer: der Status-Guard im WHERE hat nicht gegriffen,
    // weil jemand anders den Lauf inzwischen angefasst hat.
    const f = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'abrechnungslaeufe' && a.operation === 'select') return { data: [{ id: 'l-1' }] }
      if (a.tabelle === 'abrechnungslaeufe' && a.operation === 'update') return { data: [] }
      if (a.tabelle === 'dta_ruecklaeufer') return { data: [] }
      return { data: null }
    })
    const r = await pruefeUndVerarbeitePipeline(f.client, ORG, ACTOR, { autoFreigabe: true })
    expect(r.autoFreigegeben).toBe(0)
    expect(r.fehler[0]).toMatch(/Status inzwischen geaendert/)
  })

  it('zaehlt eine Freigabe nicht, wenn das Update fehlschlaegt', async () => {
    const f = fake({ freigabeKandidaten: [{ id: 'l-1' }], freigabeFehler: true })
    const r = await pruefeUndVerarbeitePipeline(f.client, ORG, ACTOR, { autoFreigabe: true })
    expect(r.autoFreigegeben).toBe(0)
    expect(r.fehler).toHaveLength(1)
    expect(r.fehler[0]).toContain('l-1')
  })
})

describe('pruefeUndVerarbeitePipeline — Ruecklaeufer-Zuordnung', () => {
  function fake(optionen: {
    offeneRuecklaeufer?: unknown[]
    passenderLauf?: unknown
    abgelehnteRl?: unknown[]
    bestehendeKorrektur?: unknown
  } = {}) {
    return erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'abrechnungslaeufe' && a.operation === 'select') {
        if (hatFilter(a, 'eq', 'kostentraeger_ik')) return { data: optionen.passenderLauf ?? null }
        return { data: [] }
      }
      if (a.tabelle === 'dta_ruecklaeufer' && a.operation === 'select') {
        if (hatFilter(a, 'is', 'lauf_id', null)) return { data: optionen.offeneRuecklaeufer ?? [] }
        return { data: optionen.abgelehnteRl ?? [] }
      }
      if (a.tabelle === 'dta_korrekturlaeufe') return { data: optionen.bestehendeKorrektur ?? null }
      return { data: null }
    })
  }

  it('ordnet einen unzugeordneten Ruecklaeufer dem passenden Lauf zu', async () => {
    const f = fake({
      offeneRuecklaeufer: [{ id: 'rl-1', kostentraeger_ik: '109519005', created_at: '2026-06-02T08:00:00Z' }],
      passenderLauf: { id: 'l-9' },
    })
    const r = await pruefeUndVerarbeitePipeline(f.client, ORG, ACTOR)
    expect(r.ruecklaeuferZugeordnet).toBe(1)
    const p = f.auf('dta_ruecklaeufer').find(a => a.operation === 'update')?.payload as Record<string, unknown>
    expect(p.lauf_id).toBe('l-9')
    expect(p.status).toBe('zugeordnet')
    expect(p.bearbeitet_von).toBe(ACTOR)
  })

  it('laesst einen Ruecklaeufer unzugeordnet, wenn kein Lauf passt', async () => {
    const f = fake({
      offeneRuecklaeufer: [{ id: 'rl-1', kostentraeger_ik: '999999999', created_at: '2026-06-02T08:00:00Z' }],
      passenderLauf: null,
    })
    const r = await pruefeUndVerarbeitePipeline(f.client, ORG, ACTOR)
    expect(r.ruecklaeuferZugeordnet).toBe(0)
    expect(f.auf('dta_ruecklaeufer').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('sucht den Lauf nur unter versendeten Zustaenden — ein Entwurf bekommt keinen Ruecklaeufer', async () => {
    const f = fake({
      offeneRuecklaeufer: [{ id: 'rl-1', kostentraeger_ik: '109519005', created_at: '2026-06-02T08:00:00Z' }],
      passenderLauf: { id: 'l-9' },
    })
    await pruefeUndVerarbeitePipeline(f.client, ORG, ACTOR)
    const a = f.auf('abrechnungslaeufe').find(x => hatFilter(x, 'eq', 'kostentraeger_ik'))
    const statusFilter = a?.filter.find(x => x.methode === 'in' && x.spalte === 'status')?.wert as string[]
    expect(statusFilter).toContain('uebermittelt')
    expect(statusFilter).not.toContain('erstellt')
    expect(statusFilter).not.toContain('geprueft')
    expect(hatOrgFence(a, ORG)).toBe(true)
  })

  it('ueberspringt Ruecklaeufer ohne Kostentraeger-IK, statt sie irgendwo anzuhaengen', async () => {
    const f = fake({
      offeneRuecklaeufer: [{ id: 'rl-1', kostentraeger_ik: null, created_at: '2026-06-02T08:00:00Z' }],
      passenderLauf: { id: 'l-9' },
    })
    const r = await pruefeUndVerarbeitePipeline(f.client, ORG, ACTOR)
    expect(r.ruecklaeuferZugeordnet).toBe(0)
  })
})

describe('pruefeUndVerarbeitePipeline — Korrekturvorschlaege', () => {
  function fake(abgelehnteRl: unknown[], bestehendeKorrektur: unknown = null) {
    return erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'abrechnungslaeufe') return { data: a.operation === 'select' && !hatFilter(a, 'eq', 'kostentraeger_ik') ? [] : null }
      if (a.tabelle === 'dta_ruecklaeufer' && a.operation === 'select') {
        if (hatFilter(a, 'is', 'lauf_id', null)) return { data: [] }
        return { data: abgelehnteRl }
      }
      if (a.tabelle === 'dta_korrekturlaeufe') return { data: bestehendeKorrektur }
      return { data: null }
    })
  }

  it('markiert einen abgelehnten Ruecklaeufer als korrektur_erforderlich', async () => {
    const f = fake([{ id: 'rl-1', lauf_id: 'l-1' }])
    const r = await pruefeUndVerarbeitePipeline(f.client, ORG, ACTOR)
    expect(r.korrekturVorschlaegeErstellt).toBe(1)
    const p = f.auf('dta_ruecklaeufer').find(a => a.operation === 'update')?.payload as Record<string, unknown>
    expect(p.status).toBe('korrektur_erforderlich')
  })

  it('schlaegt keine zweite Korrektur vor, wenn schon eine existiert', async () => {
    const f = fake([{ id: 'rl-1', lauf_id: 'l-1' }], { id: 'k-1' })
    const r = await pruefeUndVerarbeitePipeline(f.client, ORG, ACTOR)
    expect(r.korrekturVorschlaegeErstellt).toBe(0)
    expect(f.auf('dta_ruecklaeufer').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('prueft die bestehende Korrektur mandantenscharf und am Original-Lauf', async () => {
    const f = fake([{ id: 'rl-1', lauf_id: 'l-1' }])
    await pruefeUndVerarbeitePipeline(f.client, ORG, ACTOR)
    const a = f.ersterAuf('dta_korrekturlaeufe')
    expect(hatOrgFence(a, ORG)).toBe(true)
    expect(hatFilter(a, 'eq', 'original_lauf_id', 'l-1')).toBe(true)
  })

  it('ueberspringt Ruecklaeufer ohne Lauf-Bezug', async () => {
    const f = fake([{ id: 'rl-1', lauf_id: null }])
    const r = await pruefeUndVerarbeitePipeline(f.client, ORG, ACTOR)
    expect(r.korrekturVorschlaegeErstellt).toBe(0)
  })
})
