/**
 * § 302 SGB V — Storno & Korrekturläufe
 *
 * Geldweg: ein ausgeführter Storno setzt einen übermittelten Abrechnungslauf
 * auf "storniert" und legt einen neuen Lauf an. Die Fehler, die hier wehtun,
 * sind deshalb nicht Abstürze, sondern stille Doppelungen und falsche
 * Beträge — genau darauf zielen die Fälle unten:
 *
 *   - zwei gleichzeitige Freigaben erzeugen ZWEI Korrekturläufe (kein CAS),
 *   - ein Teilstorno ohne Betrag wird unbemerkt zum Vollstorno,
 *   - ein negativer Differenzbetrag dreht eine Rückforderung in eine
 *     Nachzahlung,
 *   - eine Lauf-ID aus dem URL-Pfad landet ungeprüft in einem PostgREST-
 *     `or=(...)`-Ausdruck,
 *   - Postgres-Fehlertexte werden an den Client durchgereicht.
 */

import { describe, it, expect } from 'vitest'
import {
  erstelleSgbVKorrektur,
  fuehreSgbVKorrekturAus,
  ladeSgbVKorrekturHistorie,
} from '@/lib/abrechnung/sgb-v/storno-korrektur'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000000000001'
const FREMDE_ORG = '00000000-0000-4000-8000-0000000000ff'
const LAUF = '11111111-1111-4111-8111-111111111111'
const KORREKTUR = '22222222-2222-4222-8222-222222222222'
const NEUER_LAUF = '33333333-3333-4333-8333-333333333333'
const ACTOR = '44444444-4444-4444-8444-444444444444'

/** Lauf im Zustand „übermittelt", 500,00 € — der stornierbare Normalfall. */
function lauf(overrides: Record<string, unknown> = {}) {
  return {
    id: LAUF,
    status: 'uebermittelt',
    gesamtbetrag_cent: 50_000,
    abrechnungsmonat: '2026-07',
    bundesland: 'HE',
    kostentraeger_ik: '104593971',
    kostentraeger_name: 'AOK Hessen',
    ...overrides,
  }
}

function korrekturvorgang(overrides: Record<string, unknown> = {}) {
  return {
    id: KORREKTUR,
    status: 'angelegt',
    korrektur_typ: 'storno',
    korrektur_grund: 'Kasse hat Positionen abgelehnt',
    original_lauf_id: LAUF,
    ...overrides,
  }
}

/**
 * Antwortgeber für den glücklichen Pfad der Ausführung. `casTreffer` bildet
 * ab, was Postgres bei einem UPDATE mit Statusbedingung liefert: eine Zeile,
 * wenn der Vorgang noch frei war — eine leere Liste, wenn ihn jemand anderes
 * bereits beansprucht hat.
 */
function ausfuehrungsGeber(opts: {
  vorgang?: Record<string, unknown>
  original?: Record<string, unknown>
  casTreffer?: boolean
  laufInsertFehler?: { message: string; code?: string }
} = {}) {
  const casTreffer = opts.casTreffer ?? true
  return (a: FakeAufruf) => {
    if (a.tabelle === 'sgb_v_korrekturlaeufe' && a.operation === 'select') {
      return { data: opts.vorgang ?? korrekturvorgang() }
    }
    if (a.tabelle === 'sgb_v_korrekturlaeufe' && a.operation === 'update') {
      const istCas = hatFilter(a, 'in', 'status')
      if (!istCas) return { data: null }
      return { data: casTreffer ? [{ id: KORREKTUR }] : [] }
    }
    if (a.tabelle === 'sgb_v_laeufe' && a.operation === 'select') {
      return { data: opts.original ?? lauf() }
    }
    if (a.tabelle === 'sgb_v_laeufe' && a.operation === 'insert') {
      if (opts.laufInsertFehler) return { data: null, error: opts.laufInsertFehler }
      return { data: { id: NEUER_LAUF } }
    }
    return { data: null }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Anlage
// ═══════════════════════════════════════════════════════════════════

describe('erstelleSgbVKorrektur — Anlage', () => {
  const anlageGeber = (original = lauf()) => (a: FakeAufruf) => {
    if (a.tabelle === 'sgb_v_laeufe') return { data: original }
    if (a.tabelle === 'sgb_v_korrekturlaeufe' && a.operation === 'insert') {
      return { data: { id: KORREKTUR, status: 'angelegt' } }
    }
    return { data: null }
  }

  it('legt den Vorgang an und fenced die Lauf-Abfrage auf die Organisation', async () => {
    const fake = erstelleFakeSupabase(anlageGeber())
    const ergebnis = await erstelleSgbVKorrektur(fake.client, {
      organizationId: ORG,
      originalLaufId: LAUF,
      korrekturTyp: 'storno',
      korrekturGrund: 'Kasse hat abgelehnt',
      actorId: ACTOR,
    })

    expect(ergebnis).toEqual({ korrekturId: KORREKTUR, status: 'angelegt' })
    const leseAufruf = fake.ersterAuf('sgb_v_laeufe', 'select')
    expect(hatOrgFence(leseAufruf, ORG)).toBe(true)
    expect(hatFilter(leseAufruf, 'eq', 'id', LAUF)).toBe(true)
  })

  it('schreibt die organization_id in den Vorgang, statt sie dem Spalten-Default zu überlassen', async () => {
    const fake = erstelleFakeSupabase(anlageGeber())
    await erstelleSgbVKorrektur(fake.client, {
      organizationId: ORG, originalLaufId: LAUF, korrekturTyp: 'storno',
      korrekturGrund: 'Grund', actorId: ACTOR,
    })
    const insert = fake.ersterAuf('sgb_v_korrekturlaeufe', 'insert')
    expect((insert?.payload as Record<string, unknown>).organization_id).toBe(ORG)
  })

  it('weist einen Lauf einer fremden Organisation als "nicht gefunden" ab', async () => {
    // Der org-Fence liefert live keine Zeile; das ist der Zustand, den der
    // Fake nachbildet. Geprüft wird, dass daraus KEIN Storno wird.
    const fake = erstelleFakeSupabase(() => ({ data: null }))
    await expect(erstelleSgbVKorrektur(fake.client, {
      organizationId: FREMDE_ORG, originalLaufId: LAUF, korrekturTyp: 'storno',
      korrekturGrund: 'Grund', actorId: ACTOR,
    })).rejects.toThrow(/nicht gefunden|andere Organisation/i)
    expect(fake.ersterAuf('sgb_v_korrekturlaeufe', 'insert')).toBeUndefined()
  })

  it('verlangt eine Begründung', async () => {
    const fake = erstelleFakeSupabase(anlageGeber())
    await expect(erstelleSgbVKorrektur(fake.client, {
      organizationId: ORG, originalLaufId: LAUF, korrekturTyp: 'storno',
      korrekturGrund: '   ', actorId: ACTOR,
    })).rejects.toThrow(UserFacingError)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('lässt einen noch nicht übermittelten Lauf nicht stornieren', async () => {
    const fake = erstelleFakeSupabase(anlageGeber(lauf({ status: 'erstellt' })))
    await expect(erstelleSgbVKorrektur(fake.client, {
      organizationId: ORG, originalLaufId: LAUF, korrekturTyp: 'storno',
      korrekturGrund: 'Grund', actorId: ACTOR,
    })).rejects.toThrow(/erstellt/)
    expect(fake.ersterAuf('sgb_v_korrekturlaeufe', 'insert')).toBeUndefined()
  })

  it('erlaubt eine Korrekturabrechnung nur nach Ablehnung, nicht nach Annahme', async () => {
    const angenommen = erstelleFakeSupabase(anlageGeber(lauf({ status: 'angenommen' })))
    await expect(erstelleSgbVKorrektur(angenommen.client, {
      organizationId: ORG, originalLaufId: LAUF, korrekturTyp: 'korrekturabrechnung',
      korrekturGrund: 'Grund', actorId: ACTOR,
    })).rejects.toThrow(/angenommen/)

    const abgelehnt = erstelleFakeSupabase(anlageGeber(lauf({ status: 'abgelehnt' })))
    await expect(erstelleSgbVKorrektur(abgelehnt.client, {
      organizationId: ORG, originalLaufId: LAUF, korrekturTyp: 'korrekturabrechnung',
      korrekturGrund: 'Grund', actorId: ACTOR,
    })).resolves.toBeTruthy()
  })

  it('meldet einen bereits offenen Vorgang als Konflikt statt als Serverfehler', async () => {
    const fake = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'sgb_v_laeufe') return { data: lauf() }
      return { data: null, error: { message: 'duplicate key value violates unique constraint "uq_sgb_v_korrektur_offen"', code: '23505' } }
    })
    await expect(erstelleSgbVKorrektur(fake.client, {
      organizationId: ORG, originalLaufId: LAUF, korrekturTyp: 'storno',
      korrekturGrund: 'Grund', actorId: ACTOR,
    })).rejects.toMatchObject({ name: 'UserFacingError', status: 409 })
  })

  it('reicht einen Postgres-Fehlertext NICHT als UserFacingError durch', async () => {
    // Fail-closed: alles, was kein UserFacingError ist, sanitisiert die
    // Route. Ein durchgereichter Constraint-Name waere sonst clientseitig
    // sichtbar gewesen.
    const fake = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'sgb_v_laeufe') return { data: lauf() }
      return { data: null, error: { message: 'column "geheim" does not exist', code: '42703' } }
    })
    const fehler = await erstelleSgbVKorrektur(fake.client, {
      organizationId: ORG, originalLaufId: LAUF, korrekturTyp: 'storno',
      korrekturGrund: 'Grund', actorId: ACTOR,
    }).catch(e => e)
    expect(fehler).toBeInstanceOf(Error)
    expect(fehler).not.toBeInstanceOf(UserFacingError)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Differenzbetrag — der eigentliche Geldwert
// ═══════════════════════════════════════════════════════════════════

describe('erstelleSgbVKorrektur — Differenzbetrag', () => {
  const geber = (a: FakeAufruf) => {
    if (a.tabelle === 'sgb_v_laeufe') return { data: lauf() }
    if (a.operation === 'insert') return { data: { id: KORREKTUR, status: 'angelegt' } }
    return { data: null }
  }

  async function anlegen(differenzCent: number | undefined, typ: 'storno' | 'teilstorno' = 'teilstorno') {
    const fake = erstelleFakeSupabase(geber)
    await erstelleSgbVKorrektur(fake.client, {
      organizationId: ORG, originalLaufId: LAUF, korrekturTyp: typ,
      korrekturGrund: 'Grund', differenzCent, actorId: ACTOR,
    })
    return (fake.ersterAuf('sgb_v_korrekturlaeufe', 'insert')?.payload as Record<string, unknown>).differenz_cent
  }

  it('übernimmt beim Vollstorno den gesamten Laufbetrag', async () => {
    expect(await anlegen(undefined, 'storno')).toBe(50_000)
  })

  it('weist ein Teilstorno ohne Betrag ab, statt still den ganzen Lauf zu stornieren', async () => {
    const fake = erstelleFakeSupabase(geber)
    await expect(erstelleSgbVKorrektur(fake.client, {
      organizationId: ORG, originalLaufId: LAUF, korrekturTyp: 'teilstorno',
      korrekturGrund: 'Grund', actorId: ACTOR,
    })).rejects.toThrow(/Teilstorno braucht einen Differenzbetrag/)
    expect(fake.ersterAuf('sgb_v_korrekturlaeufe', 'insert')).toBeUndefined()
  })

  it('übernimmt einen gültigen Teilbetrag unverändert', async () => {
    expect(await anlegen(12_345)).toBe(12_345)
  })

  it('erlaubt den vollen Laufbetrag als Grenzwert', async () => {
    expect(await anlegen(50_000)).toBe(50_000)
  })

  it('weist einen negativen Differenzbetrag ab', async () => {
    // Ohne diese Schranke wird aus einer Rueckforderung eine Nachzahlung.
    const fake = erstelleFakeSupabase(geber)
    await expect(erstelleSgbVKorrektur(fake.client, {
      organizationId: ORG, originalLaufId: LAUF, korrekturTyp: 'teilstorno',
      korrekturGrund: 'Grund', differenzCent: -1, actorId: ACTOR,
    })).rejects.toThrow(/nicht negativ/)
    expect(fake.ersterAuf('sgb_v_korrekturlaeufe', 'insert')).toBeUndefined()
  })

  it('weist einen Differenzbetrag über dem Laufbetrag ab', async () => {
    const fake = erstelleFakeSupabase(geber)
    await expect(erstelleSgbVKorrektur(fake.client, {
      organizationId: ORG, originalLaufId: LAUF, korrekturTyp: 'teilstorno',
      korrekturGrund: 'Grund', differenzCent: 50_001, actorId: ACTOR,
    })).rejects.toThrow(/übersteigt den Laufbetrag/)
  })

  it('weist Nachkommastellen ab — differenz_cent ist integer', async () => {
    const fake = erstelleFakeSupabase(geber)
    await expect(erstelleSgbVKorrektur(fake.client, {
      organizationId: ORG, originalLaufId: LAUF, korrekturTyp: 'teilstorno',
      korrekturGrund: 'Grund', differenzCent: 100.5, actorId: ACTOR,
    })).rejects.toThrow(/ganzzahlig/)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Ausführung
// ═══════════════════════════════════════════════════════════════════

describe('fuehreSgbVKorrekturAus — Ausführung', () => {
  it('legt den Korrekturlauf an und setzt den Original-Lauf auf storniert', async () => {
    const fake = erstelleFakeSupabase(ausfuehrungsGeber())
    const ergebnis = await fuehreSgbVKorrekturAus(fake.client, ORG, KORREKTUR, ACTOR)
    expect(ergebnis).toEqual({ korrekturLaufId: NEUER_LAUF })

    const laufUpdate = fake.auf('sgb_v_laeufe').find(a => a.operation === 'update')
    expect((laufUpdate?.payload as Record<string, unknown>).status).toBe('storniert')
    expect(hatOrgFence(laufUpdate, ORG)).toBe(true)
  })

  it('setzt bei einer Korrekturabrechnung "korrigiert" statt "storniert"', async () => {
    const fake = erstelleFakeSupabase(ausfuehrungsGeber({
      vorgang: korrekturvorgang({ korrektur_typ: 'korrekturabrechnung' }),
      original: lauf({ status: 'abgelehnt' }),
    }))
    await fuehreSgbVKorrekturAus(fake.client, ORG, KORREKTUR, ACTOR)
    const laufUpdate = fake.auf('sgb_v_laeufe').find(a => a.operation === 'update')
    expect((laufUpdate?.payload as Record<string, unknown>).status).toBe('korrigiert')
  })

  it('verknüpft den neuen Lauf über korrektur_von mit dem Original', async () => {
    const fake = erstelleFakeSupabase(ausfuehrungsGeber())
    await fuehreSgbVKorrekturAus(fake.client, ORG, KORREKTUR, ACTOR)
    const insert = fake.auf('sgb_v_laeufe').find(a => a.operation === 'insert')
    expect((insert?.payload as Record<string, unknown>).korrektur_von).toBe(LAUF)
    expect((insert?.payload as Record<string, unknown>).organization_id).toBe(ORG)
  })

  // ── Der Kern: Compare-and-Swap ───────────────────────────────────
  it('beansprucht den Vorgang per Statusbedingung, BEVOR der Korrekturlauf entsteht', async () => {
    const fake = erstelleFakeSupabase(ausfuehrungsGeber())
    await fuehreSgbVKorrekturAus(fake.client, ORG, KORREKTUR, ACTOR)

    const cas = fake.auf('sgb_v_korrekturlaeufe').find(a => a.operation === 'update' && hatFilter(a, 'in', 'status'))
    const laufInsert = fake.auf('sgb_v_laeufe').find(a => a.operation === 'insert')
    expect(cas, 'Ausführung muss ein UPDATE mit Statusbedingung absetzen').toBeDefined()
    expect(hatOrgFence(cas, ORG)).toBe(true)
    expect((cas!.payload as Record<string, unknown>).status).toBe('ausgefuehrt')
    // Reihenfolge ist die eigentliche Aussage: erst beanspruchen, dann anlegen.
    expect(cas!.gesamtNr).toBeLessThan(laufInsert!.gesamtNr)
  })

  it('legt KEINEN zweiten Korrekturlauf an, wenn der Vorgang inzwischen beansprucht ist', async () => {
    // Genau der Doppelklick-/Doppelfreigabe-Fall: der CAS trifft null Zeilen.
    const fake = erstelleFakeSupabase(ausfuehrungsGeber({ casTreffer: false }))
    await expect(fuehreSgbVKorrekturAus(fake.client, ORG, KORREKTUR, ACTOR))
      .rejects.toMatchObject({ name: 'UserFacingError', status: 409 })

    expect(fake.auf('sgb_v_laeufe').filter(a => a.operation === 'insert')).toHaveLength(0)
    expect(fake.auf('sgb_v_laeufe').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('gibt den Anspruch zurück, wenn das Anlegen des Korrekturlaufs scheitert', async () => {
    // Sonst bliebe der Vorgang auf "ausgefuehrt" stehen, ohne dass je ein
    // Lauf entstand — und uq_sgb_v_korrektur_offen liesse keinen neuen
    // Versuch mehr zu: der Lauf waere dauerhaft unkorrigierbar.
    const fake = erstelleFakeSupabase(ausfuehrungsGeber({
      laufInsertFehler: { message: 'insert schlug fehl', code: 'XX000' },
    }))
    await expect(fuehreSgbVKorrekturAus(fake.client, ORG, KORREKTUR, ACTOR)).rejects.toThrow()

    const updates = fake.auf('sgb_v_korrekturlaeufe').filter(a => a.operation === 'update')
    const ruecknahme = updates.find(a => (a.payload as Record<string, unknown>).status === 'angelegt')
    expect(ruecknahme, 'Der Vorgang muss wieder freigegeben werden').toBeDefined()
    expect(hatOrgFence(ruecknahme, ORG)).toBe(true)
    // Der Original-Lauf darf dabei NICHT auf storniert gelaufen sein.
    expect(fake.auf('sgb_v_laeufe').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  // ── Zweite Statusprüfung ─────────────────────────────────────────
  it('prüft den Original-Status erneut — ein inzwischen abgeschlossener Lauf wird nicht storniert', async () => {
    const fake = erstelleFakeSupabase(ausfuehrungsGeber({ original: lauf({ status: 'abgeschlossen' }) }))
    await expect(fuehreSgbVKorrekturAus(fake.client, ORG, KORREKTUR, ACTOR))
      .rejects.toThrow(/inzwischen im Status "abgeschlossen"/)
    expect(fake.auf('sgb_v_laeufe').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('storniert einen bereits stornierten Lauf nicht ein zweites Mal', async () => {
    const fake = erstelleFakeSupabase(ausfuehrungsGeber({ original: lauf({ status: 'storniert' }) }))
    await expect(fuehreSgbVKorrekturAus(fake.client, ORG, KORREKTUR, ACTOR)).rejects.toThrow(/storniert/)
    expect(fake.auf('sgb_v_laeufe').filter(a => a.operation === 'insert')).toHaveLength(0)
  })

  it('lehnt einen bereits ausgeführten Vorgang ab', async () => {
    const fake = erstelleFakeSupabase(ausfuehrungsGeber({ vorgang: korrekturvorgang({ status: 'ausgefuehrt' }) }))
    await expect(fuehreSgbVKorrekturAus(fake.client, ORG, KORREKTUR, ACTOR))
      .rejects.toMatchObject({ name: 'UserFacingError', status: 409 })
    expect(fake.auf('sgb_v_korrekturlaeufe').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('lehnt einen abgebrochenen Vorgang ab', async () => {
    const fake = erstelleFakeSupabase(ausfuehrungsGeber({ vorgang: korrekturvorgang({ status: 'abgebrochen' }) }))
    await expect(fuehreSgbVKorrekturAus(fake.client, ORG, KORREKTUR, ACTOR)).rejects.toThrow(/abgebrochen/)
  })

  it('fenced Vorgangs- und Lauf-Abfrage auf die Organisation', async () => {
    const fake = erstelleFakeSupabase(ausfuehrungsGeber())
    await fuehreSgbVKorrekturAus(fake.client, ORG, KORREKTUR, ACTOR)
    for (const a of fake.aufrufe) {
      expect(hatOrgFence(a, ORG) || a.operation === 'insert', `${a.tabelle}/${a.operation} ohne org-Fence`).toBe(true)
    }
  })

  it('führt keinen Vorgang einer fremden Organisation aus', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: null }))
    await expect(fuehreSgbVKorrekturAus(fake.client, FREMDE_ORG, KORREKTUR, ACTOR))
      .rejects.toMatchObject({ name: 'UserFacingError', status: 404 })
    expect(fake.auf('sgb_v_laeufe')).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Historie — Filter-Injection
// ═══════════════════════════════════════════════════════════════════

describe('ladeSgbVKorrekturHistorie', () => {
  it('liest mit org-Fence und beiden Richtungen der Korrekturkette', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [{ id: KORREKTUR }] }))
    const zeilen = await ladeSgbVKorrekturHistorie(fake.client, ORG, LAUF)
    expect(zeilen).toHaveLength(1)

    const a = fake.ersterAuf('sgb_v_korrekturlaeufe')
    expect(hatOrgFence(a, ORG)).toBe(true)
    const oder = a!.filter.find(f => f.methode === 'or')
    expect(oder?.spalte).toContain(`original_lauf_id.eq.${LAUF}`)
    expect(oder?.spalte).toContain(`korrektur_lauf_id.eq.${LAUF}`)
  })

  it('weist eine Lauf-ID ab, die eigene Filterglieder in den or()-Ausdruck einschleust', async () => {
    // Der Wert kommt live aus dem URL-Pfad. Komma und Punkt sind in
    // PostgREST-Filtern Syntax, keine Daten.
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    await expect(ladeSgbVKorrekturHistorie(
      fake.client, ORG, `${LAUF},status.neq.ausgefuehrt`,
    )).rejects.toThrow(UserFacingError)
    expect(fake.aufrufe, 'bei ungültiger ID darf gar nicht erst abgefragt werden').toHaveLength(0)
  })

  it('weist beliebigen Text als Lauf-ID ab', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    await expect(ladeSgbVKorrekturHistorie(fake.client, ORG, 'nicht-uuid')).rejects.toThrow(UserFacingError)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('gibt eine leere Liste zurück, wenn es keine Korrekturen gibt', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: null }))
    await expect(ladeSgbVKorrekturHistorie(fake.client, ORG, LAUF)).resolves.toEqual([])
  })
})
