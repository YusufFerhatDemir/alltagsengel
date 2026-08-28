// ═══════════════════════════════════════════════════════════════════════
// T-9 — Gesetzliche Obergrenze (PfluV) wird durchgesetzt
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (Phase 8.6, Track 2): `billing_gesetzliche_obergrenzen` traegt die
// hessischen PfluV-Saetze (30,00 EUR/Std. Betreuung, 25,00 EUR/Std.
// Entlastung im Alltag), wurde aber von keinem Anwendungscode gelesen. Der
// DB-Trigger `enforce_tariff_obergrenze` greift nur bei
// `bestaetigt = TRUE` — der Seed steht bewusst auf FALSE. Ein 35-EUR-Tarif
// konnte damit angelegt werden, ohne dass irgendwo ein Hinweis entstand.
//
// Zweite Haelfte des Befunds: der Trigger matcht auf `verguetungsart`, NICHT
// auf `angebotstyp`. Die beiden Seed-Zeilen unterscheiden sich aber
// ausschliesslich im angebotstyp. Selbst bei bestaetigt = TRUE koennte der
// Trigger 30 und 25 EUR nicht auseinanderhalten. Der Anwendungs-Guard kann
// es — die Tests unten halten genau das fest.
//
// GEGENPROBE ist hier Pflicht: ein Guard, der immer warnt, ist so nutzlos
// wie einer, der nie warnt. Zu jedem Warnfall steht deshalb ein Fall, in
// dem NICHT gewarnt werden darf.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  pruefeGegenRegeln,
  pruefeObergrenze,
  pruefeObergrenzenStapel,
  waehleRegeln,
  angebotstypVon,
  meldungenAus,
  ANGEBOTSTYP_VON_LEISTUNGSART,
  type ObergrenzenRegel,
  type ObergrenzenEingabe,
  OHNE_PFLUV_GRUNDLAGE,
} from '@/lib/billing/obergrenzen'
import { erstelleFakeSupabase, hatFilter } from '../helpers/supabase-fake'
import { TARIF_LEISTUNGSARTEN } from '@/lib/billing/leistungsarten'

// ── Die beiden Seed-Zeilen aus Migration 20260808110000, 1:1 ────────────
const BETREUUNG_30: ObergrenzenRegel = {
  bundesland: 'hessen',
  rechtsgrundlage: '§45b SGB XI',
  leistungsart: null,
  angebotstyp: 'betreuungsangebot',
  verguetungsart: 'zeit_stunde',
  obergrenze_cent: 3000,
  quelle: 'PfluV Hessen',
  quelle_paragraf: '§3 PfluV Hessen — Nr. 1 und Nr. 2',
  bestaetigt: false,
  gueltig_ab: '2026-01-01',
  gueltig_bis: null,
  ist_aktiv: true,
}

const ENTLASTUNG_25: ObergrenzenRegel = {
  ...BETREUUNG_30,
  angebotstyp: 'entlastungsangebot',
  obergrenze_cent: 2500,
  quelle_paragraf: '§3 PfluV Hessen — Nr. 3',
}

const SEED = [BETREUUNG_30, ENTLASTUNG_25]

function eingabe(ueber: Partial<ObergrenzenEingabe> = {}): ObergrenzenEingabe {
  return {
    preisCent: 3000,
    rechtsgrundlage: '§45b SGB XI',
    verguetungsart: 'zeit_stunde',
    leistungsart: 'betreuung_45a',
    bundesland: 'hessen',
    gueltigAb: '2026-03-01',
    ...ueber,
  }
}

// ═══════════════════════════════════════════════════════════════════════
describe('T-9: Obergrenze wird ueberschritten → Warnung', () => {
  it('35 EUR Betreuung gegen 30 EUR Grenze warnt', () => {
    const b = pruefeGegenRegeln(SEED, eingabe({ preisCent: 3500 }))
    expect(b.status).toBe('warnung')
    expect(b.obergrenzeCent).toBe(3000)
    expect(b.meldung).toContain('35,00 EUR')
    expect(b.meldung).toContain('30,00 EUR')
    expect(b.meldung).toContain('PfluV Hessen')
  })

  it('30 EUR Hauswirtschaft faellt gegen die 25-EUR-Grenze — der Punkt, den der DB-Trigger nicht sieht', () => {
    // Der Trigger matcht nur auf verguetungsart und wuerde hier eine der
    // beiden Zeilen willkuerlich ziehen. Der Guard waehlt ueber den
    // Angebotstyp die richtige.
    const b = pruefeGegenRegeln(SEED, eingabe({ leistungsart: 'hauswirtschaft', preisCent: 3000 }))
    expect(b.status).toBe('warnung')
    expect(b.obergrenzeCent).toBe(2500)
    expect(b.angebotstypUnbestimmt).toBe(false)
  })

  it('ein Cent ueber der Grenze warnt bereits', () => {
    expect(pruefeGegenRegeln(SEED, eingabe({ preisCent: 3001 })).status).toBe('warnung')
  })

  it('die Meldung sagt ausdruecklich, dass NICHT blockiert wird', () => {
    const b = pruefeGegenRegeln(SEED, eingabe({ preisCent: 3500 }))
    expect(b.meldung).toMatch(/nicht blockiert/)
    expect(b.meldung).toMatch(/nicht bestaetigt/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('GEGENPROBE: wo NICHT gewarnt werden darf', () => {
  it('Preis unter der Grenze → keine Meldung', () => {
    const b = pruefeGegenRegeln(SEED, eingabe({ preisCent: 2800 }))
    expect(b.status).toBe('eingehalten')
    expect(b.meldung).toBeNull()
  })

  it('Preis GENAU auf der Grenze ist zulaessig — 30,00 EUR sind erlaubt, nicht verboten', () => {
    const b = pruefeGegenRegeln(SEED, eingabe({ preisCent: 3000 }))
    expect(b.status).toBe('eingehalten')
    expect(b.meldung).toBeNull()
  })

  it('Privattarif ist ausgenommen, auch bei 99 EUR', () => {
    const b = pruefeGegenRegeln(SEED, eingabe({ rechtsgrundlage: 'privat', preisCent: 9900 }))
    expect(b.status).toBe('privat_ausgenommen')
    expect(b.meldung).toBeNull()
  })

  it('anderes Bundesland → die hessische Regel greift nicht', () => {
    const b = pruefeGegenRegeln(SEED, eingabe({ bundesland: 'bayern', preisCent: 9900 }))
    expect(b.status).toBe('keine_regel')
    expect(b.meldung).toBeNull()
  })

  it('andere Rechtsgrundlage (§39 statt §45b) → keine Regel', () => {
    const b = pruefeGegenRegeln(SEED, eingabe({ rechtsgrundlage: '§39 SGB XI', preisCent: 9900 }))
    expect(b.status).toBe('keine_regel')
  })

  it('andere Verguetungsart (Pauschale statt Stundensatz) → keine Regel', () => {
    const b = pruefeGegenRegeln(SEED, eingabe({ verguetungsart: 'pauschale', preisCent: 9900 }))
    expect(b.status).toBe('keine_regel')
  })

  it('deaktivierte Regel wirkt nicht', () => {
    const aus = SEED.map(r => ({ ...r, ist_aktiv: false }))
    expect(pruefeGegenRegeln(aus, eingabe({ preisCent: 9900 })).status).toBe('keine_regel')
  })

  it('Tarif beginnt VOR dem Geltungsbeginn der Regel → Regel greift nicht', () => {
    const b = pruefeGegenRegeln(SEED, eingabe({ gueltigAb: '2025-06-01', preisCent: 9900 }))
    expect(b.status).toBe('keine_regel')
  })

  it('abgelaufene Regel (gueltig_bis in der Vergangenheit) greift nicht', () => {
    const abgelaufen = SEED.map(r => ({ ...r, gueltig_bis: '2026-02-01' }))
    const b = pruefeGegenRegeln(abgelaufen, eingabe({ gueltigAb: '2026-03-01', preisCent: 9900 }))
    expect(b.status).toBe('keine_regel')
  })

  it('leere Regelmenge warnt nie', () => {
    expect(pruefeGegenRegeln([], eingabe({ preisCent: 99900 })).status).toBe('keine_regel')
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('bestaetigte Obergrenze: der Guard meldet die DB-Sperre mit', () => {
  it('Ueberschreitung bei bestaetigt = TRUE ist ein Verstoss, kein blosser Hinweis', () => {
    const bestaetigt = SEED.map(r => ({ ...r, bestaetigt: true }))
    const b = pruefeGegenRegeln(bestaetigt, eingabe({ preisCent: 3500 }))
    expect(b.status).toBe('verstoss')
    expect(b.meldung).toMatch(/Datenbank weist das Speichern zurueck/)
    expect(b.meldung).not.toMatch(/nicht blockiert/)
  })

  it('bestaetigt = TRUE aendert nichts, solange der Preis passt', () => {
    const bestaetigt = SEED.map(r => ({ ...r, bestaetigt: true }))
    expect(pruefeGegenRegeln(bestaetigt, eingabe({ preisCent: 2900 })).status).toBe('eingehalten')
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Angebotstyp nicht eindeutig: milde pruefen, Unschaerfe nennen', () => {
  it('alltagsbegleitung wird gegen die HOECHSTE Grenze geprueft', () => {
    // Der Name passt auf Nr. 1 wie auf Nr. 3. 28 EUR liegen ueber 25, aber
    // unter 30 — hier darf NICHT gewarnt werden, sonst bekaeme jeder
    // zulaessige Betreuungstarif eine falsche Warnung.
    const b = pruefeGegenRegeln(SEED, eingabe({ leistungsart: 'alltagsbegleitung', preisCent: 2800 }))
    expect(b.status).toBe('eingehalten')
    expect(b.obergrenzeCent).toBe(3000)
    expect(b.angebotstypUnbestimmt).toBe(true)
  })

  it('ueber der hoechsten Grenze wird auch bei Unschaerfe gewarnt — mit Hinweis darauf', () => {
    const b = pruefeGegenRegeln(SEED, eingabe({ leistungsart: 'alltagsbegleitung', preisCent: 3500 }))
    expect(b.status).toBe('warnung')
    expect(b.angebotstypUnbestimmt).toBe(true)
    expect(b.meldung).toMatch(/nicht eindeutig/)
    expect(b.meldung).toMatch(/strengere Grenze kann zutreffen/)
  })

  it('bei eindeutigem Angebotstyp taucht der Unschaerfe-Hinweis NICHT auf', () => {
    const b = pruefeGegenRegeln(SEED, eingabe({ leistungsart: 'hauswirtschaft', preisCent: 3500 }))
    expect(b.angebotstypUnbestimmt).toBe(false)
    expect(b.meldung).not.toMatch(/nicht eindeutig/)
  })

  it('nur EINE Typ-Regel im Rennen → keine Unschaerfe, obwohl der Typ unbekannt ist', () => {
    // Es gibt nichts zu verwechseln, wenn es nur eine Kandidatin gibt.
    const b = pruefeGegenRegeln([ENTLASTUNG_25], eingabe({ leistungsart: 'sonstige', preisCent: 2600 }))
    expect(b.angebotstypUnbestimmt).toBe(false)
    expect(b.status).toBe('warnung')
    expect(b.obergrenzeCent).toBe(2500)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Rangfolge der Regeln — spiegelt den DB-Trigger', () => {
  const BUNDESWEIT: ObergrenzenRegel = {
    ...BETREUUNG_30, bundesland: null, obergrenze_cent: 4000, quelle: 'Bundesrecht',
  }

  it('exaktes Bundesland schlaegt bundesweit', () => {
    const b = pruefeGegenRegeln([BUNDESWEIT, BETREUUNG_30], eingabe({ preisCent: 3500 }))
    expect(b.obergrenzeCent).toBe(3000)
    expect(b.regel?.bundesland).toBe('hessen')
  })

  it('exakte Leistungsart schlaegt "gilt fuer alle"', () => {
    const EXAKT: ObergrenzenRegel = {
      ...BETREUUNG_30, leistungsart: 'betreuung_45a', obergrenze_cent: 2000,
    }
    const b = pruefeGegenRegeln([BETREUUNG_30, EXAKT], eingabe({ preisCent: 2500 }))
    expect(b.obergrenzeCent).toBe(2000)
    expect(b.status).toBe('warnung')
  })

  it('bei sonst gleichem Rang gewinnt der juengere Geltungsbeginn', () => {
    const NEUER: ObergrenzenRegel = { ...BETREUUNG_30, gueltig_ab: '2026-02-01', obergrenze_cent: 3200 }
    const b = pruefeGegenRegeln([BETREUUNG_30, NEUER], eingabe({ preisCent: 3100 }))
    expect(b.obergrenzeCent).toBe(3200)
    expect(b.status).toBe('eingehalten')
  })

  it('waehleRegeln liefert die Kandidatinnen in genau dieser Rangfolge', () => {
    const sortiert = waehleRegeln([BUNDESWEIT, BETREUUNG_30], eingabe())
    expect(sortiert[0].bundesland).toBe('hessen')
    expect(sortiert).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Leistungsart → Angebotstyp', () => {
  it('Betreuungsleistungen zaehlen zu Nr. 1/2 (30 EUR)', () => {
    for (const la of ['betreuung_45a', 'demenzbetreuung', 'nachtbetreuung', 'wochenendbetreuung']) {
      expect(angebotstypVon(la)).toBe('betreuungsangebot')
    }
  })

  it('Hauswirtschaft und Einkauf zaehlen zu Nr. 3 (25 EUR)', () => {
    expect(angebotstypVon('hauswirtschaft')).toBe('entlastungsangebot')
    expect(angebotstypVon('einkaufsservice')).toBe('entlastungsangebot')
  })

  it('mehrdeutige Leistungsarten bleiben bewusst ohne Zuordnung', () => {
    for (const la of ['alltagsbegleitung', 'begleitservice', 'wegepauschale', 'sonstige']) {
      expect(angebotstypVon(la)).toBeNull()
    }
  })

  it('unbekannte Leistungsart und null ergeben null statt eines Fehlers', () => {
    expect(angebotstypVon('gibt_es_nicht')).toBeNull()
    expect(angebotstypVon(null)).toBeNull()
  })

  it('jeder zugeordnete Schluessel existiert im Tarif-Vokabular', () => {
    // Sonst zeigt die Zuordnung auf eine Leistungsart, die es nicht gibt —
    // die Warnung feuerte dann nie und niemandem fiele es auf.
    for (const key of Object.keys(ANGEBOTSTYP_VON_LEISTUNGSART)) {
      expect(TARIF_LEISTUNGSARTEN as readonly string[]).toContain(key)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Datenbankweg', () => {
  it('liest aktiv + Rechtsgrundlage und setzt KEINEN Org-Fence (Tabelle ist mandantenuebergreifend)', async () => {
    const fake = erstelleFakeSupabase(a => {
      if (a.tabelle === 'billing_gesetzliche_obergrenzen') return { data: SEED }
      return { data: [] }
    })
    const b = await pruefeObergrenze(fake.client, eingabe({ preisCent: 3500 }))
    expect(b.status).toBe('warnung')

    const a = fake.ersterAuf('billing_gesetzliche_obergrenzen', 'select')
    expect(hatFilter(a, 'eq', 'rechtsgrundlage', '§45b SGB XI')).toBe(true)
    expect(hatFilter(a, 'eq', 'ist_aktiv', true)).toBe(true)
    expect(a?.filter.some(f => f.spalte === 'organization_id')).toBe(false)
  })

  it('Privattarif fragt die Datenbank gar nicht erst', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: SEED }))
    const b = await pruefeObergrenze(fake.client, eingabe({ rechtsgrundlage: 'privat', preisCent: 9900 }))
    expect(b.status).toBe('privat_ausgenommen')
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('Ladefehler wird gemeldet, nicht als "alles in Ordnung" verkauft', async () => {
    // Der gefaehrliche Fall: ohne Meldung saehe der Ausfall genauso aus wie
    // ein tatsaechlich eingehaltener Preis.
    const fake = erstelleFakeSupabase(() => ({ error: { message: 'timeout' } }))
    const b = await pruefeObergrenze(fake.client, eingabe({ preisCent: 9900 }))
    expect(b.status).toBe('keine_regel')
    expect(b.meldung).toMatch(/NICHT gegen die PfluV-Saetze geprueft/)
  })

  it('Ladefehler laesst die Pruefung nicht werfen — der Tarif bleibt anlegbar', async () => {
    const fake = erstelleFakeSupabase(() => ({ error: { message: 'boom' } }))
    await expect(pruefeObergrenze(fake.client, eingabe())).resolves.toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Stapelpruefung (Tarifliste, Import)', () => {
  it('laedt je Rechtsgrundlage EINMAL, nicht je Tarif', async () => {
    const fake = erstelleFakeSupabase(a =>
      a.tabelle === 'billing_gesetzliche_obergrenzen' ? { data: SEED } : { data: [] })

    const befunde = await pruefeObergrenzenStapel(fake.client, [
      eingabe({ preisCent: 3500 }),
      eingabe({ preisCent: 2900 }),
      eingabe({ leistungsart: 'hauswirtschaft', preisCent: 2600 }),
      eingabe({ rechtsgrundlage: 'privat', preisCent: 9900 }),
    ])

    expect(fake.auf('billing_gesetzliche_obergrenzen')).toHaveLength(1)
    expect(befunde.map(b => b.status)).toEqual([
      'warnung', 'eingehalten', 'warnung', 'privat_ausgenommen',
    ])
  })

  it('meldungenAus liefert genau die Warntexte, sonst nichts', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: SEED }))
    const befunde = await pruefeObergrenzenStapel(fake.client, [
      eingabe({ preisCent: 3500 }),
      eingabe({ preisCent: 2000 }),
    ])
    expect(meldungenAus(befunde)).toHaveLength(1)
  })

  it('Ladefehler schlaegt auf jede Zeile der betroffenen Rechtsgrundlage durch', async () => {
    const fake = erstelleFakeSupabase(() => ({ error: { message: 'weg' } }))
    const befunde = await pruefeObergrenzenStapel(fake.client, [
      eingabe({ preisCent: 3500 }),
      eingabe({ preisCent: 2000 }),
    ])
    expect(befunde.every(b => b.meldung?.includes('NICHT gegen die PfluV-Saetze geprueft'))).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Restposten R1 — der Widerspruch bleibt sichtbar
// ═══════════════════════════════════════════════════════════════════════
//
// OHNE_PFLUV_GRUNDLAGE steht an ZWEI Stellen: hier im Modul und als
// SQL-Liste in scripts/verify-abrechnung-live.mjs (Pruefung R1). Das
// Skript ist ein .mjs und kann kein TypeScript importieren — die
// Doppelung ist deshalb unvermeidbar, das stille Auseinanderlaufen aber
// nicht. Dieser Test haelt beide gegeneinander.
//
// Waechst die Liste und zieht jemand das Skript nicht nach, prueft R1
// weiterhin nur die alte Leistungsart und meldet gruen fuer etwas, das
// es gar nicht mehr abdeckt — genau die Sorte Drift, die bei E1 dazu
// gefuehrt hat, dass eine laengst angewendete Migration monatelang als
// offen gemeldet wurde.
describe('R1 — Liste ohne PfluV-Grundlage', () => {
  it('enthaelt die Wegepauschale', () => {
    expect(OHNE_PFLUV_GRUNDLAGE).toContain('wegepauschale')
  })

  it('keine dieser Leistungsarten hat einen Angebotstyp', () => {
    // Waere eine davon eindeutig zuordenbar, gaebe es fuer sie sehr wohl
    // eine PfluV-Grenze — die Liste widerspraeche sich selbst.
    for (const la of OHNE_PFLUV_GRUNDLAGE) {
      expect(angebotstypVon(la)).toBeNull()
    }
  })

  it('deckt sich mit der Liste in verify-abrechnung-live.mjs', () => {
    const skript = readFileSync(
      join(process.cwd(), 'scripts', 'verify-abrechnung-live.mjs'), 'utf8')
    const stelle = skript.indexOf("where leistungsart in (")
    expect(stelle).toBeGreaterThan(-1)
    const liste = skript.slice(stelle, skript.indexOf(')', stelle))
    for (const la of OHNE_PFLUV_GRUNDLAGE) {
      expect(liste).toContain(`'${la}'`)
    }
  })
})
