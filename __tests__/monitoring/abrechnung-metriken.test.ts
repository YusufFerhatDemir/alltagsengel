// ═══════════════════════════════════════════════════════════════════════
// Abrechnungs-Monitoring: Zaehler, Audit-Zusammenfassung, Anomalien
// ═══════════════════════════════════════════════════════════════════════
//
// Die Leitregel, an der sich jeder Test hier misst: eine Null muss von
// einem Messausfall unterscheidbar bleiben. „0 Fehlschlaege" und „konnte
// nicht gezaehlt werden" sehen in jedem Dashboard gleich aus und bedeuten
// das Gegenteil voneinander. Die Faelle unter „Messausfall" sind deshalb
// nicht Randfaelle, sondern der Kern.
//
// Zweite Regel: zu jeder Anomalie gehoert ein Fall, in dem sie NICHT feuern
// darf. Ein Monitoring, das immer meldet, meldet nichts.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  erkenneAnomalien,
  fasseAuditTrailZusammen,
  sammleAbrechnungsMetriken,
  STANDARD_SCHWELLEN,
  type AbrechnungsMetriken,
  type Zaehler,
} from '@/lib/monitoring/abrechnung-metriken'
import { erstelleFakeSupabase, hatFilter, hatOrgFence } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'

function z(aktuell: number, vorher = 0, messbar = true): Zaehler {
  return { aktuell, vorher, messbar }
}

function basis(ueber: Partial<Omit<AbrechnungsMetriken, 'anomalien'>> = {})
  : Omit<AbrechnungsMetriken, 'anomalien'> {
  return {
    organizationId: ORG,
    fensterStunden: 24,
    fensterVon: '2026-08-26T12:00:00.000Z',
    fensterBis: '2026-08-27T12:00:00.000Z',
    rechnungen: z(4, 5),
    mahnungen: z(1, 1),
    camtImporte: z(1, 1),
    zahlungen: z(3, 3),
    rechnungsversand: {
      versendet: z(10, 10),
      fehlgeschlagen: z(0, 0),
      uebersprungen: z(0, 0),
    },
    audit: {
      messbar: true, gesamt: 12,
      jeEntityTyp: [{ entityType: 'invoice', anzahl: 8 }],
      jeAktion: [{ aktion: 'create', anzahl: 8 }],
      handelnde: 2, letzterEintragAm: '2026-08-27T11:00:00.000Z',
    },
    ...ueber,
  }
}

const schluessel = (m: Omit<AbrechnungsMetriken, 'anomalien'>) =>
  erkenneAnomalien(m).map(a => a.schluessel)

// ═══════════════════════════════════════════════════════════════════════
describe('Ruhiger Normalbetrieb meldet nichts', () => {
  it('keine Anomalie bei unauffaelligen Zahlen', () => {
    expect(erkenneAnomalien(basis())).toEqual([])
  })

  it('auch ein voellig leeres, aber messbares Fenster meldet nichts', () => {
    // Nachts passiert nichts. Das ist kein Befund.
    const m = basis({
      rechnungen: z(0, 0), mahnungen: z(0, 0), camtImporte: z(0, 0), zahlungen: z(0, 0),
      rechnungsversand: { versendet: z(0, 0), fehlgeschlagen: z(0, 0), uebersprungen: z(0, 0) },
      audit: { messbar: true, gesamt: 0, jeEntityTyp: [], jeAktion: [], handelnde: 0, letzterEintragAm: null },
    })
    expect(erkenneAnomalien(m)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Messausfall wird NICHT als 0 verkauft', () => {
  it('ein unmessbarer Zaehler erzeugt eine Anomalie der Schwere hoch', () => {
    const m = basis({ rechnungen: z(0, 0, false) })
    const a = erkenneAnomalien(m)
    expect(a[0].schluessel).toBe('nicht_messbar')
    expect(a[0].schwere).toBe('hoch')
    expect(a[0].meldung).toContain('Rechnungen')
  })

  it('die Meldung sagt ausdruecklich, dass 0 hier nicht "nichts passiert" heisst', () => {
    const a = erkenneAnomalien(basis({ zahlungen: z(0, 0, false) }))
    expect(a[0].meldung).toMatch(/nicht gezaehlt/)
  })

  it('mehrere Ausfaelle stehen in EINER Meldung, nicht in fuenf', () => {
    const m = basis({
      rechnungen: z(0, 0, false),
      mahnungen: z(0, 0, false),
      audit: { ...basis().audit, messbar: false },
    })
    const a = erkenneAnomalien(m).filter(x => x.schluessel === 'nicht_messbar')
    expect(a).toHaveLength(1)
    expect(a[0].meldung).toContain('Rechnungen')
    expect(a[0].meldung).toContain('Mahnungen')
    expect(a[0].meldung).toContain('Audit-Trail')
  })

  it('GEGENPROBE: alles messbar → keine nicht_messbar-Anomalie', () => {
    expect(schluessel(basis())).not.toContain('nicht_messbar')
  })

  it('unmessbarer Versand unterdrueckt die Quotenpruefung, statt 0 % zu melden', () => {
    const m = basis({
      rechnungsversand: {
        versendet: z(0, 0, false), fehlgeschlagen: z(0, 0, false), uebersprungen: z(0, 0),
      },
    })
    expect(schluessel(m)).not.toContain('versand_fehlerquote')
    expect(schluessel(m)).not.toContain('versand_einzelfehler')
  })

  it('unmessbare Zaehler loesen keine Luecken-Anomalie aus', () => {
    // Sonst waere jeder Messausfall zugleich ein falscher Audit-Alarm.
    const m = basis({
      rechnungen: z(0, 0, false),
      audit: { ...basis().audit, gesamt: 0 },
    })
    expect(schluessel(m)).not.toContain('audit_luecke')
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Fehlerquote im Rechnungsversand', () => {
  it('4 von 10 Fehlschlaegen reissen die 20-%-Schwelle', () => {
    const m = basis({
      rechnungsversand: { versendet: z(6, 10), fehlgeschlagen: z(4, 0), uebersprungen: z(0) },
    })
    const a = erkenneAnomalien(m).find(x => x.schluessel === 'versand_fehlerquote')
    expect(a?.schwere).toBe('hoch')
    expect(a?.meldung).toContain('40 %')
  })

  it('GEGENPROBE: 1 von 20 bleibt unter der Schwelle — Hinweis statt Alarm', () => {
    const m = basis({
      rechnungsversand: { versendet: z(19, 20), fehlgeschlagen: z(1, 1), uebersprungen: z(0) },
    })
    const s = schluessel(m)
    expect(s).not.toContain('versand_fehlerquote')
    expect(s).toContain('versand_einzelfehler')
    expect(erkenneAnomalien(m).find(x => x.schluessel === 'versand_einzelfehler')?.schwere)
      .toBe('niedrig')
  })

  it('GEGENPROBE: 1 von 2 meldet nicht — zwei Versuche sind keine Quote', () => {
    // Ohne Mindestmenge wuerde die erste Bounce-Mail des Tages sofort
    // 50 % Fehlerquote melden.
    const m = basis({
      rechnungsversand: { versendet: z(1, 10), fehlgeschlagen: z(1, 0), uebersprungen: z(0) },
    })
    expect(schluessel(m)).not.toContain('versand_fehlerquote')
  })

  it('GEGENPROBE: kein Fehlschlag → gar keine Versand-Anomalie', () => {
    const s = schluessel(basis())
    expect(s.filter(x => x.startsWith('versand_'))).toEqual([])
  })

  it('neu auftretende Fehlschlaege werden gemeldet, auch unter der Quote', () => {
    const m = basis({
      rechnungsversand: { versendet: z(50, 50), fehlgeschlagen: z(3, 0), uebersprungen: z(0) },
    })
    const s = schluessel(m)
    expect(s).toContain('versand_fehler_neu')
    expect(s).not.toContain('versand_fehlerquote')
  })

  it('GEGENPROBE: gleich viele Fehlschlaege wie im Vorfenster sind nicht "neu"', () => {
    const m = basis({
      rechnungsversand: { versendet: z(50, 50), fehlgeschlagen: z(3, 3), uebersprungen: z(0) },
    })
    expect(schluessel(m)).not.toContain('versand_fehler_neu')
  })

  it('uebersprungene Zustellungen allein loesen keinen Alarm aus', () => {
    // 'uebersprungen' ist eine Entscheidung (kein Empfaenger hinterlegt),
    // kein Fehlschlag.
    const m = basis({
      rechnungsversand: { versendet: z(5, 5), fehlgeschlagen: z(0, 0), uebersprungen: z(40, 0) },
    })
    expect(erkenneAnomalien(m)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Mengenausschlag und Stillstand', () => {
  it('Faktor 3 gegenueber dem Vorfenster faellt auf', () => {
    const a = erkenneAnomalien(basis({ rechnungen: z(30, 10) }))
      .find(x => x.schluessel === 'ausschlag_Rechnungen')
    expect(a?.schwere).toBe('mittel')
    expect(a?.meldung).toContain('Faktor 3.0')
  })

  it('GEGENPROBE: eine Verdopplung ist Normalbetrieb (Sammelrechnungslauf)', () => {
    expect(schluessel(basis({ rechnungen: z(20, 10) }))).not.toContain('ausschlag_Rechnungen')
  })

  it('GEGENPROBE: 3 statt 1 meldet nicht — zu kleine Grundmenge', () => {
    // Ohne Mindestmenge waere jede ruhige Nacht gefolgt von einem normalen
    // Tag ein Alarm.
    expect(schluessel(basis({ rechnungen: z(3, 1) }))).not.toContain('ausschlag_Rechnungen')
  })

  it('Stillstand nach Betrieb wird gemeldet', () => {
    const a = erkenneAnomalien(basis({ mahnungen: z(0, 12) }))
      .find(x => x.schluessel === 'stillstand_Mahnungen')
    expect(a?.schwere).toBe('mittel')
    expect(a?.meldung).toMatch(/beides sieht von aussen gleich aus/)
  })

  it('GEGENPROBE: 0 nach 0 ist kein Stillstand', () => {
    expect(schluessel(basis({ mahnungen: z(0, 0) }))).not.toContain('stillstand_Mahnungen')
  })

  it('CAMT-Importe werden gleich behandelt', () => {
    expect(schluessel(basis({ camtImporte: z(0, 7) }))).toContain('stillstand_CAMT-Importe')
  })

  it('Zahlungen werden bewusst NICHT auf Ausschlag geprueft', () => {
    // Ein Kassen-Sammeleingang bringt planmaessig ein Vielfaches. Dieser
    // Ausschlag ist eine gute Nachricht, keine Anomalie.
    expect(schluessel(basis({ zahlungen: z(90, 3) }))).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Geldbewegung ohne Audit-Spur', () => {
  it('Rechnungen und Zahlungen bei leerem Audit-Trail sind ein Befund der Schwere hoch', () => {
    const m = basis({
      rechnungen: z(4, 4), zahlungen: z(2, 2),
      audit: { messbar: true, gesamt: 0, jeEntityTyp: [], jeAktion: [], handelnde: 0, letzterEintragAm: null },
    })
    const a = erkenneAnomalien(m).find(x => x.schluessel === 'audit_luecke')
    expect(a?.schwere).toBe('hoch')
    expect(a?.meldung).toMatch(/Protokollierung greift nicht/)
  })

  it('GEGENPROBE: kein Geldvorgang, leerer Trail → kein Befund', () => {
    const m = basis({
      rechnungen: z(0, 0), zahlungen: z(0, 0),
      audit: { messbar: true, gesamt: 0, jeEntityTyp: [], jeAktion: [], handelnde: 0, letzterEintragAm: null },
    })
    expect(schluessel(m)).not.toContain('audit_luecke')
  })

  it('GEGENPROBE: Geldvorgang MIT Trail-Eintraegen → kein Befund', () => {
    expect(schluessel(basis({ rechnungen: z(4, 4) }))).not.toContain('audit_luecke')
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Audit-Zusammenfassung (Datenbankweg)', () => {
  const zeilen = [
    { entity_type: 'invoice', action: 'create', actor_id: 'u1', created_at: '2026-08-27T11:00:00Z' },
    { entity_type: 'invoice', action: 'create', actor_id: 'u1', created_at: '2026-08-27T10:00:00Z' },
    { entity_type: 'payment', action: 'create', actor_id: 'u2', created_at: '2026-08-27T09:00:00Z' },
    { entity_type: 'invoice', action: 'send',   actor_id: null, created_at: '2026-08-27T08:00:00Z' },
  ]

  it('zaehlt je Entity-Typ und Aktion, absteigend', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: zeilen }))
    const z = await fasseAuditTrailZusammen(fake.client, ORG, 'a', 'b')

    expect(z.messbar).toBe(true)
    expect(z.gesamt).toBe(4)
    expect(z.jeEntityTyp[0]).toEqual({ entityType: 'invoice', anzahl: 3 })
    expect(z.jeAktion[0]).toEqual({ aktion: 'create', anzahl: 3 })
    expect(z.letzterEintragAm).toBe('2026-08-27T11:00:00Z')
  })

  it('zaehlt Handelnde ohne den Automatik-Eintrag doppelt zu werten', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: zeilen }))
    expect((await fasseAuditTrailZusammen(fake.client, ORG, 'a', 'b')).handelnde).toBe(2)
  })

  it('setzt den Mandanten-Fence', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: zeilen }))
    await fasseAuditTrailZusammen(fake.client, ORG, 'a', 'b')
    expect(hatOrgFence(fake.ersterAuf('billing_audit_trail'), ORG)).toBe(true)
  })

  it('Lesefehler ergibt messbar=false, nicht eine leere Statistik', async () => {
    const fake = erstelleFakeSupabase(() => ({ error: { message: 'weg', code: '42P01' } }))
    const z = await fasseAuditTrailZusammen(fake.client, ORG, 'a', 'b')
    expect(z.messbar).toBe(false)
    expect(z.gesamt).toBe(0)
  })

  it('weist eine gekappte Statistik aus, statt sie still zu kuerzen', async () => {
    const viele = Array.from({ length: 5 }, (_, i) => ({
      entity_type: 'invoice', action: 'create', actor_id: 'u1',
      created_at: `2026-08-27T0${i}:00:00Z`,
    }))
    const fake = erstelleFakeSupabase(() => ({ data: viele }))
    const z = await fasseAuditTrailZusammen(fake.client, ORG, 'a', 'b', 5)
    expect(z.gekappt).toBe(true)
  })

  it('unterhalb der Obergrenze ist nichts gekappt', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: zeilen }))
    expect((await fasseAuditTrailZusammen(fake.client, ORG, 'a', 'b', 100)).gekappt).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Vollstaendige Sammlung', () => {
  const JETZT = new Date('2026-08-27T12:00:00.000Z')

  it('legt Fenster und Vorfenster gleich lang aneinander', async () => {
    const fake = erstelleFakeSupabase(() => ({ count: 0, data: [] }))
    const m = await sammleAbrechnungsMetriken(fake.client, {
      organizationId: ORG, fensterStunden: 24, jetzt: JETZT,
    })
    expect(m.fensterBis).toBe('2026-08-27T12:00:00.000Z')
    expect(m.fensterVon).toBe('2026-08-26T12:00:00.000Z')

    // Das Vorfenster endet exakt dort, wo das aktuelle beginnt — sonst
    // zaehlte ein Vorgang doppelt oder fiele durch.
    const rechnung = fake.auf('invoices')
    expect(hatFilter(rechnung[0], 'gte', 'created_at', '2026-08-26T12:00:00.000Z')).toBe(true)
    expect(hatFilter(rechnung[1], 'gte', 'created_at', '2026-08-25T12:00:00.000Z')).toBe(true)
    expect(hatFilter(rechnung[1], 'lt', 'created_at', '2026-08-26T12:00:00.000Z')).toBe(true)
  })

  it('fenced jede einzelne Zaehlung auf den Mandanten', async () => {
    const fake = erstelleFakeSupabase(() => ({ count: 1, data: [] }))
    await sammleAbrechnungsMetriken(fake.client, { organizationId: ORG, jetzt: JETZT })
    expect(fake.aufrufe.length).toBeGreaterThan(0)
    for (const a of fake.aufrufe) {
      expect(hatOrgFence(a, ORG)).toBe(true)
    }
  })

  it('zaehlt nur echte Mahnstufen, nicht den Ausgangszustand "offen"', async () => {
    const fake = erstelleFakeSupabase(() => ({ count: 0, data: [] }))
    await sammleAbrechnungsMetriken(fake.client, { organizationId: ORG, jetzt: JETZT })
    expect(hatFilter(fake.ersterAuf('dunning_entries'), 'neq', 'dunning_level', 'offen')).toBe(true)
  })

  it('liest CAMT-Importe als entity_type aus dem Audit-Trail', async () => {
    const fake = erstelleFakeSupabase(() => ({ count: 0, data: [] }))
    await sammleAbrechnungsMetriken(fake.client, { organizationId: ORG, jetzt: JETZT })
    const camt = fake.auf('billing_audit_trail')
      .find(a => hatFilter(a, 'eq', 'entity_type', 'camt_import'))
    expect(camt).toBeDefined()
  })

  it('trennt die drei Versandzustaende sauber', async () => {
    const fake = erstelleFakeSupabase(a => {
      if (a.tabelle !== 'invoice_email_log') return { count: 0, data: [] }
      const f = a.filter.find(x => x.spalte === 'status')?.wert
      // Nur das aktuelle Fenster fuellen: jeder zweite Aufruf ist das Vorfenster.
      const aktuell = a.nr % 2 === 0
      if (f === 'versendet') return { count: aktuell ? 8 : 9 }
      if (f === 'fehlgeschlagen') return { count: aktuell ? 4 : 0 }
      return { count: 0 }
    })
    const m = await sammleAbrechnungsMetriken(fake.client, { organizationId: ORG, jetzt: JETZT })
    expect(m.rechnungsversand.versendet.aktuell).toBe(8)
    expect(m.rechnungsversand.fehlgeschlagen.aktuell).toBe(4)
    expect(m.anomalien.map(a => a.schluessel)).toContain('versand_fehlerquote')
  })

  it('stuerzt bei einem Datenbankausfall nicht ab, sondern meldet ihn', async () => {
    // Ein Monitoring, das beim Messen abstuerzt, meldet keinen Ausfall — es ist einer.
    const fake = erstelleFakeSupabase(() => ({ error: { message: 'alles weg', code: '08006' } }))
    const m = await sammleAbrechnungsMetriken(fake.client, { organizationId: ORG, jetzt: JETZT })
    expect(m.rechnungen.messbar).toBe(false)
    expect(m.anomalien.find(a => a.schluessel === 'nicht_messbar')?.schwere).toBe('hoch')
  })

  it('eine geworfene Ausnahme im Client reisst die Sammlung nicht mit', async () => {
    const fake = erstelleFakeSupabase(() => { throw new Error('kaputt') })
    await expect(
      sammleAbrechnungsMetriken(fake.client, { organizationId: ORG, jetzt: JETZT }),
    ).resolves.toBeDefined()
  })

  it('Standardfenster sind 24 Stunden', async () => {
    const fake = erstelleFakeSupabase(() => ({ count: 0, data: [] }))
    const m = await sammleAbrechnungsMetriken(fake.client, { organizationId: ORG, jetzt: JETZT })
    expect(m.fensterStunden).toBe(24)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Schwellen', () => {
  it('sind ueberschreibbar, ohne den Standard zu veraendern', () => {
    const m = basis({
      rechnungsversand: { versendet: z(19, 20), fehlgeschlagen: z(1, 1), uebersprungen: z(0) },
    })
    const streng = erkenneAnomalien(m, { ...STANDARD_SCHWELLEN, versandFehlerquote: 0.01 })
    expect(streng.map(a => a.schluessel)).toContain('versand_fehlerquote')
    expect(STANDARD_SCHWELLEN.versandFehlerquote).toBe(0.2)
  })
})
