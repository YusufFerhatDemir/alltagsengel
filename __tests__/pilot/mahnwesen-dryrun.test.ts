// ═══════════════════════════════════════════════════════════════════════════
// MAHNWESEN-TROCKENLAUF
//
// Der Trockenlauf hat genau einen Zweck: vor dem Umlegen von
// MAHNVERSAND_AUTOMATISCH zu zeigen, was mit dem ECHTEN Bestand geschähe.
// Er ist wertlos, wenn er
//
//   1. etwas verschickt — geprüft wird deshalb: kein insert/update/delete
//      über den ganzen Lauf,
//   2. anders urteilt als der scharfe Lauf — geprüft wird deshalb, dass er
//      `pruefeMahnbarkeit()` benutzt und nicht selbst rechnet,
//   3. „bezahlt" und „blockiert" gleich benennt — das ist der Kern der vier
//      Urteile, und jeder Zustand hat hier seinen eigenen Test,
//   4. die Rücklastschrift übersieht — der Fall, den das Gate nicht sieht,
//      weil sie nichts verbietet.
//
// Sämtliche Beträge sind Testwerte innerhalb des Doppelgängers.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  mahnwesenDryRun,
  mahnDryRunBerichtText,
  ermittleBeobachtungen,
  ermittleZustaende,
  ernsteresUrteil,
  urteileUeberGate,
  URTEIL_RANG,
  KLEINBETRAG_CENT,
} from '@/lib/pilot/mahnwesen-dryrun'
import { pruefeMahnbarkeit, type MahnGateErgebnis } from '@/lib/billing/dunning/mahn-safety-gate'
import { heuteBerlin } from '@/lib/utils/timezone'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const RECHNUNG = '44444444-4444-4444-8444-444444444444'

/** Ein Datum N Tage vor heute — die Mahnfristen rechnen in Tagen Verzug. */
function tageVorHeute(n: number): string {
  const heute = new Date(`${heuteBerlin()}T12:00:00Z`)
  heute.setUTCDate(heute.getUTCDate() - n)
  return heute.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Doppelgänger
// ---------------------------------------------------------------------------

interface Lage {
  status?: string
  total?: number
  bezahlt?: number
  /** frozen_at der Rechnung. undefined = festgeschrieben, null = synthetisch. */
  frozenAt?: string | null
  /** Tage Verzug. Negativ = noch nicht fällig. */
  verzugstage?: number | null
  dunningLevel?: string
  blockDunning?: boolean
  blockReason?: string
  nextDunningAt?: string | null
  offeneKorrekturen?: number
  offeneBeanstandungen?: number
  /** payment_differences im Widerspruch (Punkt 7 des Gates). */
  widersprueche?: number
  /** Unverschickte Mahnung in der Warteschlange. */
  queueOffen?: number
  /** Rücklastschrift über sepa_batch_items. */
  ruecklastschriftPosten?: boolean
  /** Rücklastschriftgebühr in payment_differences. */
  ruecklastschriftGebuehr?: boolean
}

function db(lage: Lage) {
  const faellig = lage.verzugstage === null
    ? null
    : tageVorHeute(lage.verzugstage ?? 30)

  return (a: FakeAufruf) => {
    switch (a.tabelle) {
      case 'invoices': {
        // Drei verschiedene Leser: die Listenabfrage des Trockenlaufs, die
        // Statusabfrage und die Einzelabfrage des Gates.
        if (a.terminal === 'maybeSingle') {
          return {
            data: {
              id: RECHNUNG,
              invoice_number: 'RE-2026-0001',
              invoice_number_formatted: 'RE-2026-0001',
              status: lage.status ?? 'versendet',
              total_amount: lage.total ?? 150,
              paid_amount: lage.bezahlt ?? 0,
              due_date: faellig,
              deleted_at: null,
              // Festgeschrieben (Gate-Punkt 11): eine reale, versendete
              // Rechnung hat frozen_at. Per lage.frozenAt=null testbar.
              frozen_at: lage.frozenAt === undefined ? '2026-01-01T00:00:00Z' : lage.frozenAt,
              organization_id: ORG,
            },
          }
        }
        if (a.spalten?.includes('status')) {
          return { data: [{ id: RECHNUNG, status: lage.status ?? 'versendet' }] }
        }
        return { data: [{ id: RECHNUNG }] }
      }

      case 'invoice_corrections':
        return { data: Array.from({ length: lage.offeneKorrekturen ?? 0 }, (_, i) => ({ id: `k${i}`, status: 'entwurf' })) }

      case 'invoice_disputes':
        return { data: Array.from({ length: lage.offeneBeanstandungen ?? 0 }, (_, i) => ({ id: `d${i}` })) }

      case 'payment_differences': {
        // ZWEI Leser mit verschiedenen Filtern. Der Doppelgänger muss sie
        // auseinanderhalten — sonst zählt eine Rücklastschriftgebühr als
        // Widerspruch und blockiert die Mahnung fälschlich.
        const istWiderspruch = a.filter.some(f => f.methode === 'in' && f.spalte === 'widerspruch_status')
        if (istWiderspruch) {
          return { data: Array.from({ length: lage.widersprueche ?? 0 }, (_, i) => ({ id: `w${i}` })) }
        }
        return { data: lage.ruecklastschriftGebuehr ? [{ invoice_id: RECHNUNG }] : [] }
      }

      case 'dunning_entries':
        return {
          data: {
            id: 'de-1',
            dunning_level: lage.dunningLevel ?? 'offen',
            block_dunning: lage.blockDunning ?? false,
            block_reason: lage.blockReason ?? null,
            next_dunning_at: lage.nextDunningAt ?? null,
          },
        }

      case 'dunning_email_queue':
        return { data: Array.from({ length: lage.queueOffen ?? 0 }, (_, i) => ({ id: `q${i}`, status: 'wartend' })) }

      case 'sepa_batch_items':
        return { data: lage.ruecklastschriftPosten ? [{ invoice_id: RECHNUNG }] : [] }

      default:
        return { data: [] }
    }
  }
}

async function lauf(lage: Lage = {}) {
  const f = erstelleFakeSupabase(db(lage))
  const bericht = await mahnwesenDryRun(f.client as unknown as SupabaseClient, {
    organizationId: ORG,
  })
  return { bericht, f, posten: bericht.posten[0] }
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Es verschickt nichts
// ═══════════════════════════════════════════════════════════════════════

describe('Kein Versand', () => {
  it('kein insert, update oder delete über den ganzen Lauf', async () => {
    const { f } = await lauf({ verzugstage: 30 })
    expect(f.aufrufe.filter(a => a.operation !== 'select')).toEqual([])
  })

  it('der Bericht trägt versendet=false im Datenmodell, nicht nur im Text', async () => {
    const { bericht } = await lauf({ verzugstage: 30 })
    expect(bericht.versendet).toBe(false)
  })

  it('das Modul exportiert keine Funktion, die versendet oder eskaliert', async () => {
    const modul = await import('@/lib/pilot/mahnwesen-dryrun')
    const verdaechtig = Object.keys(modul).filter(n =>
      /^(versende|mahne|eskaliere|advance|buche)/i.test(n))
    expect(verdaechtig).toEqual([])
  })

  it('die erste Zeile des Berichts sagt, dass nichts verschickt wurde', async () => {
    const { bericht } = await lauf({ verzugstage: 30 })
    expect(mahnDryRunBerichtText(bericht).split('\n').slice(0, 3).join(' '))
      .toContain('KEINE MAHNUNG VERSCHICKT')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Mandantenzaun
// ═══════════════════════════════════════════════════════════════════════

describe('Mandantentrennung', () => {
  // Der Dienst laeuft mit service_role (BYPASSRLS). Die Grenze ist deshalb
  // ausschliesslich der Filter im Code.
  //
  // Sie kann auf ZWEI Wegen sitzen, und beide sind zulaessig:
  //   · direkt, per `organization_id`,
  //   · mittelbar, per `invoice_id` — die Rechnung wurde vorher
  //     mandantengezaeunt gelesen (Punkt 1 des Gates), eine Zeile zu ihrer
  //     id kann also keiner fremden Organisation gehoeren.
  // Was es NICHT geben darf, ist eine Abfrage ohne beides.
  it('jede Abfrage traegt entweder den org-Fence oder die geprüfte Rechnung', async () => {
    const { f } = await lauf({ verzugstage: 30, ruecklastschriftPosten: true })
    const ohneGrenze = f.aufrufe.filter(a =>
      !hatFilter(a, 'eq', 'organization_id', ORG)
      && !hatFilter(a, 'eq', 'invoice_id', RECHNUNG)
      && !hatFilter(a, 'eq', 'original_invoice_id', RECHNUNG))
    expect(ohneGrenze.map(a => `${a.tabelle} [${a.filter.map(x => x.spalte).join(',')}]`)).toEqual([])
  })

  it('die Abfragen DIESES Moduls tragen den org-Fence direkt', async () => {
    const { f } = await lauf({ verzugstage: 30, ruecklastschriftPosten: true })
    // sepa_batch_items und die Listen-/Statusabfrage auf invoices stammen aus
    // mahnwesen-dryrun.ts selbst — dort ist der direkte Fence Pflicht, weil
    // sie ueber MEHRERE Rechnungen gehen.
    const eigene = f.aufrufe.filter(a =>
      a.tabelle === 'sepa_batch_items'
      || (a.tabelle === 'invoices' && a.terminal !== 'maybeSingle'))
    expect(eigene.length).toBeGreaterThan(0)
    for (const a of eigene) {
      expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(true)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Die vier Urteile — je Zustand ein Test
// ═══════════════════════════════════════════════════════════════════════

describe('Zustand: offen und überfällig', () => {
  it('ELIGIBLE bei klarem Verzug ohne Auffälligkeit', async () => {
    const { posten } = await lauf({ verzugstage: 30 })
    expect(posten.urteil).toBe('ELIGIBLE')
    expect(posten.zustaende).toContain('offen')
    expect(posten.zustaende).toContain('ueberfaellig')
    expect(posten.naechsteStufe).not.toBeNull()
    expect(posten.naechsteGebuehrCent).toBeGreaterThanOrEqual(0)
  })
})

describe('Zustand: noch nicht fällig', () => {
  it('NOT_ELIGIBLE, wenn die Frist nicht erreicht ist', async () => {
    const { posten } = await lauf({ verzugstage: -5 })
    expect(posten.urteil).toBe('NOT_ELIGIBLE')
    expect(posten.tageUeberfaellig).toBe(0)
  })

  it('NOT_ELIGIBLE, wenn die Mahnstufe noch nicht erreicht ist', async () => {
    const { posten } = await lauf({ verzugstage: 3 })
    expect(posten.urteil).toBe('NOT_ELIGIBLE')
    expect(posten.begruendung).toMatch(/Tagen Verzug|erreicht/)
  })
})

describe('Zustand: bezahlt', () => {
  it('NOT_ELIGIBLE — eine bezahlte Rechnung ist kein Vorgang, sondern der Normalfall', async () => {
    const { posten } = await lauf({ verzugstage: 30, status: 'bezahlt', bezahlt: 150 })
    expect(posten.urteil).toBe('NOT_ELIGIBLE')
    expect(posten.zustaende).toContain('bezahlt')
    expect(posten.offenCent).toBe(0)
  })
})

describe('Zustand: teilweise bezahlt', () => {
  it('NEEDS_REVIEW — mahnbar, aber nur über den Rest', async () => {
    const { posten } = await lauf({ verzugstage: 30, total: 150, bezahlt: 100 })
    expect(posten.urteil).toBe('NEEDS_REVIEW')
    expect(posten.zustaende).toContain('teilweise_bezahlt')
    expect(posten.offenCent).toBe(5000)
    expect(posten.beobachtungen.map(b => b.code)).toContain('teilzahlung')
    expect(posten.beobachtungen.find(b => b.code === 'teilzahlung')!.meldung).toContain('50,00')
  })
})

describe('Zustand: storniert', () => {
  it('NOT_ELIGIBLE — es gibt keine Forderung mehr', async () => {
    const { posten } = await lauf({ verzugstage: 30, status: 'storniert' })
    expect(posten.urteil).toBe('NOT_ELIGIBLE')
    expect(posten.zustaende).toContain('storniert')
  })
})

describe('Zustand: abgeschrieben', () => {
  it('NOT_ELIGIBLE', async () => {
    const { posten } = await lauf({ verzugstage: 30, status: 'abgeschrieben' })
    expect(posten.urteil).toBe('NOT_ELIGIBLE')
    expect(posten.zustaende).toContain('abgeschrieben')
  })
})

describe('Zustand: offene Gutschrift', () => {
  it('BLOCKED — solange der Betrag nicht feststeht, wird nicht gemahnt', async () => {
    const { posten } = await lauf({ verzugstage: 30, offeneKorrekturen: 1 })
    expect(posten.urteil).toBe('BLOCKED')
    expect(posten.zustaende).toContain('gutschrift_offen')
    expect(posten.sperren.join(' ')).toContain('Gutschrift')
  })
})

describe('Zustand: bestritten', () => {
  it('BLOCKED bei offener Beanstandung', async () => {
    const { posten } = await lauf({ verzugstage: 30, offeneBeanstandungen: 1 })
    expect(posten.urteil).toBe('BLOCKED')
    expect(posten.zustaende).toContain('bestritten')
  })

  it('BLOCKED bei offenem Widerspruch gegen eine Kürzung', async () => {
    const { posten } = await lauf({ verzugstage: 30, widersprueche: 1 })
    expect(posten.urteil).toBe('BLOCKED')
    expect(posten.zustaende).toContain('bestritten')
  })
})

describe('Zustand: manuell gesperrt', () => {
  it('BLOCKED mit dem hinterlegten Grund', async () => {
    const { posten } = await lauf({
      verzugstage: 30, blockDunning: true, blockReason: 'Ratenzahlung vereinbart',
    })
    expect(posten.urteil).toBe('BLOCKED')
    expect(posten.zustaende).toContain('manuell_gesperrt')
    expect(posten.sperren.join(' ')).toContain('Ratenzahlung vereinbart')
  })
})

describe('Zustand: Doppelmahnung in der Warteschlange', () => {
  it('BLOCKED — zwei Mahnungen in einer Zustellung wären der Schaden', async () => {
    const { posten } = await lauf({ verzugstage: 30, queueOffen: 1 })
    expect(posten.urteil).toBe('BLOCKED')
    expect(posten.sperren.join(' ')).toContain('warten bereits auf den Versand')
  })
})

describe('Zustand: Rücklastschrift — der Fall, den das Gate nicht sieht', () => {
  it('NEEDS_REVIEW über den SEPA-Posten', async () => {
    const { posten } = await lauf({ verzugstage: 30, ruecklastschriftPosten: true })
    expect(posten.urteil).toBe('NEEDS_REVIEW')
    expect(posten.zustaende).toContain('ruecklastschrift')
    expect(posten.beobachtungen.map(b => b.code)).toContain('ruecklastschrift')
  })

  it('NEEDS_REVIEW auch nur über die Gebührenzeile', async () => {
    const { posten } = await lauf({ verzugstage: 30, ruecklastschriftGebuehr: true })
    expect(posten.urteil).toBe('NEEDS_REVIEW')
    expect(posten.zustaende).toContain('ruecklastschrift')
  })

  it('nennt ausdrücklich, dass die Stufe ohne Mahnlauf hochgesetzt wurde', async () => {
    const { posten } = await lauf({ verzugstage: 30, ruecklastschriftPosten: true })
    const b = posten.beobachtungen.find(x => x.code === 'ruecklastschrift')!
    expect(b.meldung).toContain('ohne Mahnlauf')
  })

  it('die Rücklastschriftgebühr allein blockiert die Mahnung NICHT', async () => {
    // payment_differences mit widerspruch_status 'offen' steht nicht in der
    // Sperrliste des Gates — sonst bliebe jede Rücklastschrift für immer
    // ungemahnt.
    const { posten } = await lauf({ verzugstage: 30, ruecklastschriftGebuehr: true })
    expect(posten.urteil).not.toBe('BLOCKED')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Beobachtungen
// ═══════════════════════════════════════════════════════════════════════

function gate(zusatz: Partial<MahnGateErgebnis> = {}): MahnGateErgebnis {
  return {
    invoiceId: RECHNUNG, invoiceNumber: 'RE-1', organizationId: ORG,
    status: 'MAHNBAR', darfMahnen: true, punkte: [], sperren: [],
    aktuelleStufe: 'offen', naechsteStufe: 'erinnerung',
    gesamtCent: 15000, bezahltCent: 0, offenCent: 15000, tageUeberfaellig: 30,
    ...zusatz,
  }
}

describe('ermittleBeobachtungen', () => {
  it('meldet, wenn die Mahngebühr die Forderung erreicht', async () => {
    const b = ermittleBeobachtungen(
      gate({ gesamtCent: 200, offenCent: 200, naechsteStufe: 'mahnung_2' }),
      { status: 'versendet', ruecklastschrift: false },
    )
    expect(b.map(x => x.code)).toContain('gebuehr_ueber_forderung')
  })

  it('meldet einen Kleinbetrag unter der Bagatellgrenze', async () => {
    const b = ermittleBeobachtungen(
      gate({ gesamtCent: 300, offenCent: 300, naechsteStufe: 'erinnerung' }),
      { status: 'versendet', ruecklastschrift: false },
    )
    // Bei 'erinnerung' ist die Gebühr 0 — deshalb greift die Bagatellgrenze.
    expect(KLEINBETRAG_CENT).toBe(500)
    expect(b.map(x => x.code)).toContain('kleinbetrag')
  })

  it('meldet das Ende der Mahnleiter', async () => {
    const b = ermittleBeobachtungen(
      gate({ naechsteStufe: null, aktuelleStufe: 'inkasso_vorbereitung' }),
      { status: 'versendet', ruecklastschrift: false },
    )
    expect(b.map(x => x.code)).toContain('hoechste_stufe')
  })

  it('meldet nichts bei einer unauffälligen Forderung', async () => {
    const b = ermittleBeobachtungen(gate(), { status: 'versendet', ruecklastschrift: false })
    expect(b).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Reine Logik
// ═══════════════════════════════════════════════════════════════════════

describe('Rangfolge', () => {
  it('BLOCKED schlägt alles', () => {
    for (const u of URTEIL_RANG) expect(ernsteresUrteil('BLOCKED', u)).toBe('BLOCKED')
  })

  it('NOT_ELIGIBLE schlägt NEEDS_REVIEW — eine bezahlte Rechnung braucht keine Sichtung', () => {
    expect(ernsteresUrteil('NOT_ELIGIBLE', 'NEEDS_REVIEW')).toBe('NOT_ELIGIBLE')
  })

  it('ELIGIBLE ist das schwächste Urteil', () => {
    expect(ernsteresUrteil('ELIGIBLE', 'NEEDS_REVIEW')).toBe('NEEDS_REVIEW')
  })
})

describe('urteileUeberGate', () => {
  it('eine Sperre wegen "nichts offen" ist NOT_ELIGIBLE, nicht BLOCKED', () => {
    const g = gate({
      status: 'GESPERRT', darfMahnen: false, offenCent: 0, bezahltCent: 15000,
      punkte: [{ nummer: 4, sperre: 'offener_betrag', titel: 'x', stand: 'gesperrt', befund: 'ausgeglichen' }],
    })
    const u = urteileUeberGate(g, { status: 'bezahlt', ruecklastschrift: false }, [])
    expect(u.urteil).toBe('NOT_ELIGIBLE')
  })

  it('eine Sperre wegen offener Gutschrift ist BLOCKED', () => {
    const g = gate({
      status: 'GESPERRT', darfMahnen: false,
      punkte: [{ nummer: 6, sperre: 'gutschrift', titel: 'x', stand: 'gesperrt', befund: 'offene Gutschrift' }],
    })
    const u = urteileUeberGate(g, { status: 'versendet', ruecklastschrift: false }, [])
    expect(u.urteil).toBe('BLOCKED')
  })

  it('das Ende der Mahnleiter ist keine Blockade', () => {
    const g = gate({
      status: 'GESPERRT', darfMahnen: false, naechsteStufe: null,
      punkte: [{ nummer: 9, sperre: 'stufenabstand', titel: 'x', stand: 'gesperrt', befund: 'höchste Stufe' }],
    })
    const u = urteileUeberGate(g, { status: 'versendet', ruecklastschrift: false }, [])
    expect(u.urteil).toBe('NOT_ELIGIBLE')
  })
})

describe('ermittleZustaende', () => {
  it('mehrere Zustände treffen gleichzeitig zu', () => {
    const z = ermittleZustaende(
      gate({ bezahltCent: 5000, offenCent: 10000, tageUeberfaellig: 40 }),
      { status: 'versendet', ruecklastschrift: true },
    )
    expect(z).toContain('teilweise_bezahlt')
    expect(z).toContain('ueberfaellig')
    expect(z).toContain('ruecklastschrift')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. Es benutzt das Gate — es rechnet nicht selbst
// ═══════════════════════════════════════════════════════════════════════

describe('Gleiche Bewertung wie der scharfe Lauf', () => {
  it('das vollständige Gate-Ergebnis liegt dem Posten bei', async () => {
    const { posten } = await lauf({ verzugstage: 30 })
    expect(posten.gate.punkte).toHaveLength(11)
    expect(posten.gate.invoiceId).toBe(RECHNUNG)
  })

  it('das Urteil stimmt mit dem Gate überein, das advanceDunning fährt', async () => {
    const f = erstelleFakeSupabase(db({ verzugstage: 30, offeneKorrekturen: 1 }))
    const direkt = await pruefeMahnbarkeit(f.client as unknown as SupabaseClient, {
      invoiceId: RECHNUNG, organizationId: ORG,
    })
    const { posten } = await lauf({ verzugstage: 30, offeneKorrekturen: 1 })
    expect(direkt.status).toBe('GESPERRT')
    expect(posten.urteil).toBe('BLOCKED')
    expect(posten.gate.status).toBe(direkt.status)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7. Zusammenfassung und Bericht
// ═══════════════════════════════════════════════════════════════════════

describe('Zusammenfassung', () => {
  it('zählt Gebühren und offene Forderung NUR der ELIGIBLE-Posten', async () => {
    const mahnbar = await lauf({ verzugstage: 30 })
    expect(mahnbar.bericht.nachUrteil.ELIGIBLE).toBe(1)
    expect(mahnbar.bericht.summeMahnbarCent).toBe(15000)

    const blockiert = await lauf({ verzugstage: 30, offeneKorrekturen: 1 })
    expect(blockiert.bericht.nachUrteil.BLOCKED).toBe(1)
    expect(blockiert.bericht.summeMahnbarCent).toBe(0)
    expect(blockiert.bericht.summeGebuehrenCent).toBe(0)
  })

  it('führt nicht prüfbare Rechnungen getrennt auf, statt sie stillschweigend zu überspringen', async () => {
    const f = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'invoices' && a.terminal === 'maybeSingle') {
        return { error: { message: 'timeout' } }
      }
      if (a.tabelle === 'invoices') return { data: [{ id: RECHNUNG, status: 'versendet' }] }
      return { data: [] }
    })
    const bericht = await mahnwesenDryRun(f.client as unknown as SupabaseClient, { organizationId: ORG })
    // Das Gate meldet einen Lesefehler als GESPERRT — der Posten erscheint
    // also, aber als BLOCKED, nicht als „nichts zu tun".
    expect(bericht.posten[0].urteil).toBe('BLOCKED')
    expect(bericht.posten[0].sperren.join(' ')).toContain('timeout')
  })
})

describe('Bericht', () => {
  it('gruppiert nach Urteil in der Rangfolge', async () => {
    const { bericht } = await lauf({ verzugstage: 30, offeneKorrekturen: 1 })
    const text = mahnDryRunBerichtText(bericht)
    expect(text).toContain('BLOCKED — 1 Rechnung(en)')
    expect(text).toContain('Gutschrift')
  })

  it('nennt die Summe der Gebühren, die heute gebucht würden', async () => {
    const { bericht } = await lauf({ verzugstage: 30 })
    expect(mahnDryRunBerichtText(bericht)).toContain('Mahngebühren, die heute gebucht würden')
  })
})
