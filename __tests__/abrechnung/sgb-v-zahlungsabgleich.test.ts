/**
 * § 302 SGB V — Zahlungsabgleich (lib/abrechnung/sgb-v/zahlungsabgleich.ts)
 *
 * Hier wird Geld einer Forderung zugeordnet. Der teuerste Fehler ist nicht
 * eine fehlende Zuordnung — die faellt beim naechsten Blick in die OPOS-
 * Liste auf — sondern eine FALSCHE: ein Lauf gilt als bezahlt, obwohl die
 * Kasse auf einen anderen ueberwiesen hat. Ab da mahnt niemand mehr.
 *
 * Drei Fehlerbilder sind dabei besonders tueckisch, weil sie nach einem
 * sauberen Lauf aussehen:
 *
 *   1. Ein Lesefehler auf die Kandidatenliste liefert `zugeordnet: 0` —
 *      nicht zu unterscheiden von "es gab wirklich keinen Treffer".
 *   2. Ein fehlgeschlagenes UPDATE zaehlt trotzdem hoch und schreibt einen
 *      Audit-Eintrag ueber eine Zuordnung, die es in der Datenbank nicht
 *      gibt.
 *   3. Zwei Kassen ueberweisen denselben Betrag: der Abgleich trifft ueber
 *      den EXAKTEN Gesamtbetrag, also passen beide Zahlungen auf denselben
 *      Lauf — er waere doppelt beglichen und der zweite Lauf bliebe offen.
 *
 * Alle drei waren im Modul vorhanden und sind mit dieser Runde geschlossen;
 * die Tests unten halten sie fest.
 */

import { describe, it, expect } from 'vitest'
import {
  sgbVOffenePostenListe,
  ordneZahlungSgbVLaufZu,
  automatischeZahlungszuordnungSgbV,
} from '@/lib/abrechnung/sgb-v/zahlungsabgleich'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf, type FakeAntwort } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const FREMDE_ORG = '99999999-9999-4999-8999-999999999999'
const ACTOR = '22222222-2222-4222-8222-222222222222'

const LAUF_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const LAUF_B = 'bbbbbbbb-2222-4222-8222-222222222222'
const ZAHLUNG_1 = 'cccccccc-3333-4333-8333-333333333333'
const ZAHLUNG_2 = 'dddddddd-4444-4444-8444-444444444444'

/** IK-Nummern sind hier frei erfunden — sie dienen nur als Zeichenkette. */
const IK_A = '260326822'
const IK_B = '109519005'

// ---------------------------------------------------------------------------
// Antwortlogik: `zahlungseingaenge` wird in EINEM Lauf dreimal
// unterschiedlich benutzt (offene Klaerfaelle lesen, bestehende Zuordnungen
// lesen, zuordnen). Ein Stub mit einer Antwort je Tabelle koennte diese
// Faelle nicht auseinanderhalten.
// ---------------------------------------------------------------------------

interface Welt {
  laeufe?: FakeAntwort
  offeneZahlungen?: FakeAntwort
  bestehendeZuordnungen?: FakeAntwort
  update?: FakeAntwort
  audit?: FakeAntwort
}

function fake(welt: Welt) {
  return erstelleFakeSupabase((a: FakeAufruf): FakeAntwort => {
    if (a.tabelle === 'sgb_v_laeufe') return welt.laeufe ?? { data: [] }
    if (a.tabelle === 'billing_audit_trail') return welt.audit ?? { data: null, error: null }
    if (a.tabelle === 'zahlungseingaenge') {
      if (a.operation === 'update') return welt.update ?? { data: { id: ZAHLUNG_1, betrag_cent: 0 }, error: null }
      if (hatFilter(a, 'eq', 'zuordnungs_status', 'klaerfall')) return welt.offeneZahlungen ?? { data: [] }
      return welt.bestehendeZuordnungen ?? { data: [] }
    }
    return { data: null, error: null }
  })
}

// ═══════════════════════════════════════════════════════════════════════
// 1 — Offene-Posten-Liste
// ═══════════════════════════════════════════════════════════════════════

describe('sgbVOffenePostenListe', () => {
  const laeufe = [
    { id: LAUF_A, abrechnungsmonat: '2026-07', kostentraeger_ik: IK_A, gesamtbetrag_cent: 120_00, status: 'uebermittelt' },
    { id: LAUF_B, abrechnungsmonat: '2026-07', kostentraeger_ik: IK_B, gesamtbetrag_cent: 340_50, status: 'angenommen' },
  ]

  it('zieht den Mandantenzaun auf BEIDEN Abfragen', async () => {
    const f = fake({ laeufe: { data: laeufe } })
    await sgbVOffenePostenListe(f.client, ORG)

    expect(hatOrgFence(f.ersterAuf('sgb_v_laeufe'), ORG)).toBe(true)
    expect(hatOrgFence(f.ersterAuf('zahlungseingaenge'), ORG)).toBe(true)
  })

  it('liest nur eingereichte Laeufe und ueberspringt geloeschte', async () => {
    const f = fake({ laeufe: { data: laeufe } })
    await sgbVOffenePostenListe(f.client, ORG)

    const a = f.ersterAuf('sgb_v_laeufe')!
    expect(hatFilter(a, 'is', 'deleted_at', null)).toBe(true)
    const statusFilter = a.filter.find(x => x.methode === 'in' && x.spalte === 'status')
    expect(statusFilter?.wert).toEqual(['uebermittelt', 'quittiert', 'angenommen', 'teilweise_abgelehnt'])
    // Ein Entwurf ist der Kasse nie in Rechnung gestellt worden — er darf
    // in keiner offenen Position auftauchen.
    expect(statusFilter?.wert as string[]).not.toContain('entwurf')
  })

  it('summiert mehrere Zahlungen auf denselben Lauf', async () => {
    const f = fake({
      laeufe: { data: laeufe },
      bestehendeZuordnungen: {
        data: [
          { sgb_v_lauf_id: LAUF_A, betrag_cent: 50_00 },
          { sgb_v_lauf_id: LAUF_A, betrag_cent: 30_00 },
        ],
      },
    })
    const posten = await sgbVOffenePostenListe(f.client, ORG)
    const a = posten.find(p => p.laufId === LAUF_A)!
    expect(a.zugeordnetCent).toBe(80_00)
    expect(a.offenCent).toBe(40_00)
  })

  it('ignoriert Zahlungszeilen ohne Lauf-Bezug, statt sie irgendwo anzurechnen', async () => {
    const f = fake({
      laeufe: { data: laeufe },
      bestehendeZuordnungen: { data: [{ sgb_v_lauf_id: null, betrag_cent: 999_00 }] },
    })
    const posten = await sgbVOffenePostenListe(f.client, ORG)
    expect(posten.every(p => p.zugeordnetCent === 0)).toBe(true)
  })

  it('weist eine Ueberzahlung negativ aus, statt sie auf 0 zu kappen', async () => {
    const f = fake({
      laeufe: { data: [laeufe[0]] },
      bestehendeZuordnungen: { data: [{ sgb_v_lauf_id: LAUF_A, betrag_cent: 200_00 }] },
    })
    const [posten] = await sgbVOffenePostenListe(f.client, ORG)
    expect(posten.offenCent).toBe(-80_00)
  })

  it('fragt ohne Laeufe gar nicht erst nach Zahlungen (leeres IN waere eine Volltabellenabfrage)', async () => {
    const f = fake({ laeufe: { data: [] } })
    const posten = await sgbVOffenePostenListe(f.client, ORG)
    expect(posten).toEqual([])
    expect(f.auf('zahlungseingaenge')).toHaveLength(0)
  })

  it('wirft bei Lesefehler auf sgb_v_laeufe, statt eine leere OPOS-Liste zu liefern', async () => {
    const f = fake({ laeufe: { data: null, error: { message: 'permission denied' } } })
    await expect(sgbVOffenePostenListe(f.client, ORG)).rejects.toThrow(/§ 302-Läufe konnten nicht geladen/)
  })

  it('wirft bei Lesefehler auf zahlungseingaenge — sonst gilt alles als unbezahlt', async () => {
    const f = fake({
      laeufe: { data: laeufe },
      bestehendeZuordnungen: { data: null, error: { message: 'timeout' } },
    })
    await expect(sgbVOffenePostenListe(f.client, ORG)).rejects.toThrow(/Zahlungseingänge konnten nicht geladen/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2 — Manuelle Zuordnung
// ═══════════════════════════════════════════════════════════════════════

describe('ordneZahlungSgbVLaufZu', () => {
  it('ordnet zu und schreibt den Audit-Eintrag mit Betrag und Mandant', async () => {
    const f = fake({
      laeufe: { data: { id: LAUF_A } },
      update: { data: { id: ZAHLUNG_1, betrag_cent: 120_00 }, error: null },
    })
    await ordneZahlungSgbVLaufZu(f.client, ORG, ZAHLUNG_1, LAUF_A, ACTOR)

    const upd = f.auf('zahlungseingaenge').find(a => a.operation === 'update')!
    expect(upd.payload).toEqual({ sgb_v_lauf_id: LAUF_A, zuordnungs_status: 'manuell' })
    expect(hatFilter(upd, 'eq', 'id', ZAHLUNG_1)).toBe(true)
    expect(hatOrgFence(upd, ORG)).toBe(true)

    const audit = f.ersterAuf('billing_audit_trail', 'insert')!
    const zeile = audit.payload as Record<string, unknown>
    expect(zeile.entity_type).toBe('zahlungseingang')
    expect(zeile.organization_id).toBe(ORG)
    expect(zeile.action).toBe('sgb_v_zahlung_zugeordnet')
    expect(zeile.new_state).toEqual({ sgb_v_lauf_id: LAUF_A, betrag_cent: 120_00 })
  })

  it('lehnt einen Lauf aus einer fremden Organisation ab, BEVOR geschrieben wird', async () => {
    // Der Zaun steht in der Abfrage: fremder Mandant => kein Treffer.
    const f = fake({ laeufe: { data: null, error: null } })
    await expect(
      ordneZahlungSgbVLaufZu(f.client, FREMDE_ORG, ZAHLUNG_1, LAUF_A, ACTOR),
    ).rejects.toThrow(/anderen Organisation/)

    expect(f.auf('zahlungseingaenge').filter(a => a.operation === 'update')).toHaveLength(0)
    expect(f.auf('billing_audit_trail')).toHaveLength(0)
  })

  it('prueft den Lauf mit Mandantenzaun — nicht nur ueber die ID', async () => {
    const f = fake({ laeufe: { data: { id: LAUF_A } } })
    await ordneZahlungSgbVLaufZu(f.client, ORG, ZAHLUNG_1, LAUF_A, ACTOR)
    const pruefung = f.ersterAuf('sgb_v_laeufe')!
    expect(hatFilter(pruefung, 'eq', 'id', LAUF_A)).toBe(true)
    expect(hatOrgFence(pruefung, ORG)).toBe(true)
  })

  it('wirft, wenn der Zahlungseingang zu einem anderen Mandanten gehoert (Update trifft nichts)', async () => {
    const f = fake({
      laeufe: { data: { id: LAUF_A } },
      update: { data: null, error: null },
    })
    await expect(
      ordneZahlungSgbVLaufZu(f.client, ORG, ZAHLUNG_1, LAUF_A, ACTOR),
    ).rejects.toThrow(/Zahlungseingang nicht gefunden/)
    expect(f.auf('billing_audit_trail')).toHaveLength(0)
  })

  it('wirft bei Schreibfehler und protokolliert nichts', async () => {
    const f = fake({
      laeufe: { data: { id: LAUF_A } },
      update: { data: null, error: { message: 'deadlock detected' } },
    })
    await expect(ordneZahlungSgbVLaufZu(f.client, ORG, ZAHLUNG_1, LAUF_A, ACTOR)).rejects.toThrow()
    expect(f.auf('billing_audit_trail')).toHaveLength(0)
  })

  it('wirft, wenn der Audit-Eintrag scheitert — eine unprotokollierte Geldzuordnung gilt nicht als erfolgt', async () => {
    const f = fake({
      laeufe: { data: { id: LAUF_A } },
      update: { data: { id: ZAHLUNG_1, betrag_cent: 120_00 }, error: null },
      audit: { data: null, error: { message: 'violates check constraint' } },
    })
    await expect(
      ordneZahlungSgbVLaufZu(f.client, ORG, ZAHLUNG_1, LAUF_A, ACTOR),
    ).rejects.toThrow(/Audit-Trail konnte nicht geschrieben werden/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3 — Automatische Zuordnung
// ═══════════════════════════════════════════════════════════════════════

describe('automatischeZahlungszuordnungSgbV — Treffer nur bei Betrag UND IK', () => {
  const kandidat = { id: LAUF_A, kostentraeger_ik: IK_A, gesamtbetrag_cent: 120_00 }

  function lauf(welt: Welt) {
    return fake({ laeufe: { data: [kandidat] }, ...welt })
  }

  it('ordnet bei exaktem Betrag und IK im Verwendungszweck zu', async () => {
    const f = lauf({
      offeneZahlungen: { data: [{ id: ZAHLUNG_1, betrag_cent: 120_00, verwendungszweck: `Sammelueberweisung IK ${IK_A} 07/2026` }] },
    })
    const erg = await automatischeZahlungszuordnungSgbV(f.client, ORG, ACTOR)
    expect(erg).toEqual({ geprueft: 1, zugeordnet: 1, klaerfaelleUnveraendert: 0 })

    const upd = f.auf('zahlungseingaenge').find(a => a.operation === 'update')!
    expect(upd.payload).toEqual({ sgb_v_lauf_id: LAUF_A, zuordnungs_status: 'automatisch' })
    expect(hatOrgFence(upd, ORG)).toBe(true)
  })

  it('findet die IK auch, wenn sie im Verwendungszweck zerrissen ist', async () => {
    const f = lauf({
      offeneZahlungen: { data: [{ id: ZAHLUNG_1, betrag_cent: 120_00, verwendungszweck: `IK ${IK_A.slice(0, 4)} ${IK_A.slice(4)}` }] },
    })
    const erg = await automatischeZahlungszuordnungSgbV(f.client, ORG, ACTOR)
    expect(erg.zugeordnet).toBe(1)
  })

  it('laesst einen Cent Abweichung im Klaerfall — Teilzahlung wird nicht als Vollzahlung gebucht', async () => {
    const f = lauf({
      offeneZahlungen: { data: [{ id: ZAHLUNG_1, betrag_cent: 119_99, verwendungszweck: IK_A }] },
    })
    const erg = await automatischeZahlungszuordnungSgbV(f.client, ORG, ACTOR)
    expect(erg).toEqual({ geprueft: 1, zugeordnet: 0, klaerfaelleUnveraendert: 1 })
    expect(f.auf('zahlungseingaenge').some(a => a.operation === 'update')).toBe(false)
  })

  it('laesst passenden Betrag ohne IK im Klaerfall', async () => {
    const f = lauf({
      offeneZahlungen: { data: [{ id: ZAHLUNG_1, betrag_cent: 120_00, verwendungszweck: 'Zahlung Juli' }] },
    })
    expect((await automatischeZahlungszuordnungSgbV(f.client, ORG, ACTOR)).zugeordnet).toBe(0)
  })

  it('trifft nie einen Lauf ohne hinterlegte IK', async () => {
    const f = fake({
      laeufe: { data: [{ id: LAUF_A, kostentraeger_ik: null, gesamtbetrag_cent: 120_00 }] },
      offeneZahlungen: { data: [{ id: ZAHLUNG_1, betrag_cent: 120_00, verwendungszweck: '' }] },
    })
    expect((await automatischeZahlungszuordnungSgbV(f.client, ORG, ACTOR)).zugeordnet).toBe(0)
  })

  it('greift nur auf unbearbeitete Klaerfaelle des eigenen Mandanten zu', async () => {
    const f = lauf({ offeneZahlungen: { data: [] } })
    await automatischeZahlungszuordnungSgbV(f.client, ORG, ACTOR)
    const lese = f.ersterAuf('zahlungseingaenge')!
    expect(hatOrgFence(lese, ORG)).toBe(true)
    expect(hatFilter(lese, 'is', 'sgb_v_lauf_id', null)).toBe(true)
    expect(hatFilter(lese, 'eq', 'zuordnungs_status', 'klaerfall')).toBe(true)
  })

  it('bricht ohne Klaerfaelle sofort ab, ohne Laeufe zu laden', async () => {
    const f = lauf({ offeneZahlungen: { data: [] } })
    const erg = await automatischeZahlungszuordnungSgbV(f.client, ORG, ACTOR)
    expect(erg).toEqual({ geprueft: 0, zugeordnet: 0, klaerfaelleUnveraendert: 0 })
    expect(f.auf('sgb_v_laeufe')).toHaveLength(0)
  })
})

describe('automatischeZahlungszuordnungSgbV — die drei stillen Fehler', () => {
  const kandidat = { id: LAUF_A, kostentraeger_ik: IK_A, gesamtbetrag_cent: 120_00 }

  it('BEFUND 1: Lesefehler auf die Kandidatenliste wirft, statt "0 Treffer" zu melden', async () => {
    const f = fake({
      offeneZahlungen: { data: [{ id: ZAHLUNG_1, betrag_cent: 120_00, verwendungszweck: IK_A }] },
      laeufe: { data: null, error: { message: 'permission denied for table sgb_v_laeufe' } },
    })
    await expect(automatischeZahlungszuordnungSgbV(f.client, ORG, ACTOR))
      .rejects.toThrow(/§ 302-Läufe konnten nicht geladen/)
  })

  it('BEFUND 1b: auch ein Lesefehler auf die bestehenden Zuordnungen bricht ab', async () => {
    const f = fake({
      offeneZahlungen: { data: [{ id: ZAHLUNG_1, betrag_cent: 120_00, verwendungszweck: IK_A }] },
      laeufe: { data: [kandidat] },
      bestehendeZuordnungen: { data: null, error: { message: 'timeout' } },
    })
    await expect(automatischeZahlungszuordnungSgbV(f.client, ORG, ACTOR))
      .rejects.toThrow(/Bestehende Zuordnungen konnten nicht geladen/)
  })

  it('BEFUND 2: fehlgeschlagenes UPDATE wirft, statt hochzuzaehlen und zu protokollieren', async () => {
    const f = fake({
      offeneZahlungen: { data: [{ id: ZAHLUNG_1, betrag_cent: 120_00, verwendungszweck: IK_A }] },
      laeufe: { data: [kandidat] },
      update: { data: null, error: { message: 'could not serialize access' } },
    })
    await expect(automatischeZahlungszuordnungSgbV(f.client, ORG, ACTOR))
      .rejects.toThrow(/konnte nicht zugeordnet werden/)
    // Kein Audit-Eintrag ueber eine Zuordnung, die nie stattfand.
    expect(f.auf('billing_audit_trail')).toHaveLength(0)
  })

  it('BEFUND 3: zwei gleich hohe Zahlungen belegen nicht denselben Lauf zweimal', async () => {
    const f = fake({
      offeneZahlungen: {
        data: [
          { id: ZAHLUNG_1, betrag_cent: 120_00, verwendungszweck: IK_A },
          { id: ZAHLUNG_2, betrag_cent: 120_00, verwendungszweck: IK_A },
        ],
      },
      laeufe: { data: [kandidat] },
    })
    const erg = await automatischeZahlungszuordnungSgbV(f.client, ORG, ACTOR)
    expect(erg).toEqual({ geprueft: 2, zugeordnet: 1, klaerfaelleUnveraendert: 1 })

    const updates = f.auf('zahlungseingaenge').filter(a => a.operation === 'update')
    expect(updates).toHaveLength(1)
  })

  it('BEFUND 3b: ein bereits bezahlter Lauf ist kein Kandidat mehr', async () => {
    const f = fake({
      offeneZahlungen: { data: [{ id: ZAHLUNG_2, betrag_cent: 120_00, verwendungszweck: IK_A }] },
      laeufe: { data: [kandidat] },
      bestehendeZuordnungen: { data: [{ sgb_v_lauf_id: LAUF_A }] },
    })
    const erg = await automatischeZahlungszuordnungSgbV(f.client, ORG, ACTOR)
    expect(erg.zugeordnet).toBe(0)
    expect(erg.klaerfaelleUnveraendert).toBe(1)
  })

  it('BEFUND 3c: zwei gleich hohe Laeufe derselben Kasse sind mehrdeutig — nichts wird geraten', async () => {
    const f = fake({
      offeneZahlungen: { data: [{ id: ZAHLUNG_1, betrag_cent: 120_00, verwendungszweck: IK_A }] },
      laeufe: {
        data: [
          { id: LAUF_A, kostentraeger_ik: IK_A, gesamtbetrag_cent: 120_00 },
          { id: LAUF_B, kostentraeger_ik: IK_A, gesamtbetrag_cent: 120_00 },
        ],
      },
    })
    const erg = await automatischeZahlungszuordnungSgbV(f.client, ORG, ACTOR)
    expect(erg.zugeordnet).toBe(0)
    expect(f.auf('zahlungseingaenge').some(a => a.operation === 'update')).toBe(false)
  })

  it('zwei unterschiedliche Betraege werden beide korrekt zugeordnet', async () => {
    const f = fake({
      offeneZahlungen: {
        data: [
          { id: ZAHLUNG_1, betrag_cent: 120_00, verwendungszweck: IK_A },
          { id: ZAHLUNG_2, betrag_cent: 340_50, verwendungszweck: IK_B },
        ],
      },
      laeufe: {
        data: [
          { id: LAUF_A, kostentraeger_ik: IK_A, gesamtbetrag_cent: 120_00 },
          { id: LAUF_B, kostentraeger_ik: IK_B, gesamtbetrag_cent: 340_50 },
        ],
      },
    })
    const erg = await automatischeZahlungszuordnungSgbV(f.client, ORG, ACTOR)
    expect(erg).toEqual({ geprueft: 2, zugeordnet: 2, klaerfaelleUnveraendert: 0 })
    expect(f.auf('billing_audit_trail')).toHaveLength(2)
  })

  it('wirft bei Lesefehler auf die Klaerfaelle', async () => {
    const f = fake({ offeneZahlungen: { data: null, error: { message: 'boom' } } })
    await expect(automatischeZahlungszuordnungSgbV(f.client, ORG, ACTOR))
      .rejects.toThrow(/Zahlungseingänge konnten nicht geladen/)
  })
})
