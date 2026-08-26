// ═══════════════════════════════════════════════════════════════════════════
// EINMAL-FREIGABE IM VERSANDWEG — Schliessung von Befund T3-1 (Phase 8.3)
//
// WAS HIER GEPRUEFT WIRD UND WARUM
// Bis Phase 8.4 liess sich eine Einmal-Freigabe ausstellen, aber kein
// Versandweg verlangte sie: `pruefeSendeToken()` und `verbraucheSendeToken()`
// hatten ausserhalb ihrer eigenen Testdatei KEINEN Aufrufer. Die staerkste
// Sperre des Systems war damit ausstellbar und wirkungslos — ein Administrator
// konnte `POST /api/billing/invoices/[id]/versenden` aufrufen und echte Post
// ausloesen, ohne Token, ohne dass PILOT_ERSTVERSAND_FREIGEGEBEN gesetzt war.
//
// Diese Suite haelt das geschlossene Verhalten fest. Sie prueft die
// ENTSCHEIDUNG von `versendeRechnungPerEmail()`, nicht die Tokenlogik selbst
// — die steht in __tests__/pilot/send-gate.test.ts.
//
// Die Reihenfolge ist Teil der Aussage: bei fehlendem Token darf KEIN PDF
// entstehen (Nebenwirkung ohne Zweck), und der Verbrauch muss VOR dem
// Absenden liegen (sonst duerfte ein Wiederholungslauf nach einem Abbruch ein
// zweites Mal senden).
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

const paketMock = vi.fn()
const mailMock = vi.fn()

vi.mock('@/lib/pdf/rechnung-paket', () => ({
  erzeugeRechnungsPaket: (...args: unknown[]) => paketMock(...args),
  RechnungsPaketError: class extends Error {},
}))

vi.mock('@/lib/notifications', () => ({
  sendRawEmail: (...args: unknown[]) => mailMock(...args),
}))

import { versendeRechnungPerEmail } from '@/lib/billing/versand/rechnung-versand'
import { pilotGatePflicht, FREIGABE_ENV } from '@/lib/pilot/send-gate'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const ACTOR = '00000000-0000-4000-8000-0000000000bb'
const INV = '00000000-0000-4000-8000-0000000000cc'
const TOKEN = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

const ENV_PILOT_AN: Record<string, string | undefined> = { [FREIGABE_ENV]: '1' }
const ENV_PILOT_AUS: Record<string, string | undefined> = {}

/** 105,00 € — exakt der Betrag, auf den das Token unten lautet. */
const BETRAG_EURO = 105
const BETRAG_CENT = 10500
const EMPFAENGER = 'erika@example.org'

interface StubOptionen {
  /** Die Zeile, die `pilot_send_gate` beim Nachschlagen liefert. */
  gateZeile?: Record<string, unknown> | null
  /** Wie viele Zeilen das bedingte UPDATE beim Verbrauch trifft. */
  verbrauchTrifft?: number
  /** Offene Versandsperren des Mandanten. */
  sperren?: Record<string, unknown>[]
  /** Erfolgreiche Zeilen in invoice_email_log (Nachtraeglich-Pruefung). */
  bereitsProtokolliert?: number
  invoiceSentAt?: string | null
}

function gateZeileOk(ueberschreiben: Record<string, unknown> = {}) {
  return {
    id: TOKEN,
    organization_id: ORG,
    invoice_id: INV,
    empfaenger: EMPFAENGER,
    betrag_cents: BETRAG_CENT,
    preflight_status: 'READY_FOR_SEND',
    erstellt_von: ACTOR,
    erstellt_am: '2026-08-26T12:00:00.000Z',
    gueltig_bis: '2999-01-01T00:00:00.000Z',
    verbraucht_am: null,
    entwertet_am: null,
    ...ueberschreiben,
  }
}

function makeStub(opts: StubOptionen = {}) {
  const {
    gateZeile = gateZeileOk(),
    verbrauchTrifft = 1,
    sperren = [],
    bereitsProtokolliert = 0,
    invoiceSentAt = null,
  } = opts

  const protokoll = {
    invoiceUpdates: [] as Record<string, unknown>[],
    logInserts: [] as Record<string, unknown>[],
    auditInserts: [] as Record<string, unknown>[],
    gateUpdates: [] as Record<string, unknown>[],
    reihenfolge: [] as string[],
  }

  const invoice = {
    id: INV,
    invoice_number: 'RE-2026-00042',
    invoice_number_formatted: 'RE-2026-00042',
    status: 'freigegeben',
    correction_type: null,
    total_amount: BETRAG_EURO,
    period_start: '2026-07-01',
    period_end: '2026-07-31',
    due_date: '2026-08-14',
    sent_at: invoiceSentAt,
    frozen_at: '2026-07-31T10:00:00Z',
    deleted_at: null,
    client: { first_name: 'Erika', last_name: 'Mustermann', email: EMPFAENGER },
  }

  const stub = {
    from(tabelle: string) {
      if (tabelle === 'invoices') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: invoice, error: null }) }) }),
          }),
          update: (werte: Record<string, unknown>) => {
            protokoll.invoiceUpdates.push(werte)
            return { eq: () => ({ eq: async () => ({ error: null }) }) }
          },
        } as never
      }

      if (tabelle === 'organizations') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { name: 'Alltagsengel UG (haftungsbeschränkt)', iban: 'DE02120300000000202051', bic: 'BYLADEM1001', bank_name: 'Sparkasse' },
                error: null,
              }),
            }),
          }),
        } as never
      }

      if (tabelle === 'invoice_email_log') {
        // Wird zweimal anders benutzt: von pruefeSendeToken() als Zaehlung
        // ueber vier .eq(), und von protokolliere() als Zaehlung ueber ein
        // .eq() plus insert. Der Stub bedient beide Ketten.
        const zaehler = { count: bereitsProtokolliert, error: null }
        const kette: Record<string, unknown> = {}
        kette.eq = () => kette
        kette.then = (aufloesen: (w: unknown) => unknown) => Promise.resolve(zaehler).then(aufloesen)
        return {
          select: () => kette,
          insert: async (werte: Record<string, unknown>) => {
            protokoll.logInserts.push(werte)
            protokoll.reihenfolge.push('email_log')
            return { error: null }
          },
        } as never
      }

      if (tabelle === 'pilot_send_gate') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: gateZeile, error: null }) }) }),
          }),
          update: (werte: Record<string, unknown>) => {
            protokoll.gateUpdates.push(werte)
            protokoll.reihenfolge.push('gate_verbraucht')
            const treffer = Array.from({ length: verbrauchTrifft }, () => gateZeileOk({
              verbraucht_am: '2026-08-26T12:30:00.000Z',
            }))
            const kette: Record<string, unknown> = {}
            kette.eq = () => kette
            kette.is = () => kette
            kette.select = async () => ({ data: treffer, error: null })
            return kette as never
          },
        } as never
      }

      if (tabelle === 'pilot_versand_sperre') {
        const kette: Record<string, unknown> = {}
        kette.eq = () => kette
        kette.is = async () => ({ data: sperren, error: null })
        return { select: () => kette } as never
      }

      if (tabelle === 'billing_audit_trail') {
        return {
          insert: async (werte: Record<string, unknown>) => {
            protokoll.auditInserts.push(werte)
            return { error: null }
          },
        } as never
      }

      throw new Error(`Unerwartete Tabelle im Stub: ${tabelle}`)
    },
  }

  return { stub: stub as never, protokoll }
}

function versende(stub: never, extra: Record<string, unknown> = {}) {
  return versendeRechnungPerEmail(stub, {
    invoiceId: INV,
    organizationId: ORG,
    actorId: ACTOR,
    preflight: 'uebersprungen',
    ...extra,
  } as never)
}

beforeEach(() => {
  paketMock.mockReset()
  mailMock.mockReset()
  paketMock.mockImplementation(async () => ({
    pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    pageCount: 3,
    checksum: 'abc123',
    pdfUrl: 'https://storage.example/inv.pdf',
    storagePath: 'invoice-packages/x.pdf',
    invoiceNumber: 'RE-2026-00042',
    belegart: 'Rechnung',
    clientName: 'Erika Mustermann',
  }))
  mailMock.mockResolvedValue({ ok: true, messageId: 'msg-1' })
})

// ═══════════════════════════════════════════════════════════════════════════
// 1. Wann die Pflicht ueberhaupt gilt
// ═══════════════════════════════════════════════════════════════════════════

describe('Gate-Pflicht', () => {
  it('gilt nur bei eingeschaltetem Pilotbetrieb', () => {
    expect(pilotGatePflicht(ENV_PILOT_AUS).pflicht).toBe(false)
    expect(pilotGatePflicht(ENV_PILOT_AN).pflicht).toBe(true)
  })

  it('nennt in beiden Faellen einen Grund statt nur ja/nein', () => {
    expect(pilotGatePflicht(ENV_PILOT_AUS).grund).not.toBe('')
    expect(pilotGatePflicht(ENV_PILOT_AN).grund).not.toBe('')
  })

  it('kennt nur den exakten Wert 1 — jeder andere laesst die Pflicht ruhen', () => {
    for (const wert of ['0', 'true', 'ja', ' 1', '1 ', '']) {
      expect(pilotGatePflicht({ [FREIGABE_ENV]: wert }).pflicht, `Wert "${wert}"`).toBe(false)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. Pilotbetrieb AUS — das heutige Verhalten bleibt unveraendert
// ═══════════════════════════════════════════════════════════════════════════

describe('Pilotbetrieb aus', () => {
  it('versendet ohne Token, wie bisher', async () => {
    const { stub, protokoll } = makeStub()
    const ergebnis = await versende(stub, { quelle: ENV_PILOT_AUS })
    expect(ergebnis.status).toBe('versendet')
    expect(mailMock).toHaveBeenCalledTimes(1)
    // Nichts am Gate angefasst: es gibt keine Freigabe zu verbrauchen.
    expect(protokoll.gateUpdates).toHaveLength(0)
  })

  it('ignoriert ein mitgegebenes Token, statt es stillschweigend zu verbrauchen', async () => {
    // Ein Token, das ohne Pflicht verbraucht wuerde, waere fuer den echten
    // Erstversand danach weg — und der UNIQUE-Teilindex liesse kein zweites zu.
    const { stub, protokoll } = makeStub()
    await versende(stub, { quelle: ENV_PILOT_AUS, pilotToken: TOKEN })
    expect(protokoll.gateUpdates).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. Pilotbetrieb AN — ohne gueltige Freigabe geht nichts raus
// ═══════════════════════════════════════════════════════════════════════════

describe('Pilotbetrieb an', () => {
  it('ohne Token wird nicht versendet', async () => {
    const { stub } = makeStub()
    const ergebnis = await versende(stub, { quelle: ENV_PILOT_AN })
    expect(ergebnis.status).toBe('uebersprungen')
    expect(ergebnis.grund).toContain('kein_token')
    expect(mailMock).not.toHaveBeenCalled()
  })

  it('ohne Token entsteht kein PDF — die Pruefung liegt vor der Belegerzeugung', async () => {
    const { stub } = makeStub()
    await versende(stub, { quelle: ENV_PILOT_AN })
    expect(paketMock).not.toHaveBeenCalled()
  })

  it('ein unbekanntes Token wird abgewiesen', async () => {
    const { stub } = makeStub({ gateZeile: null })
    const ergebnis = await versende(stub, { quelle: ENV_PILOT_AN, pilotToken: TOKEN })
    expect(ergebnis.status).toBe('uebersprungen')
    expect(ergebnis.grund).toContain('token_unbekannt')
    expect(mailMock).not.toHaveBeenCalled()
  })

  it('ein abgelaufenes Token wird abgewiesen', async () => {
    const { stub } = makeStub({ gateZeile: gateZeileOk({ gueltig_bis: '2020-01-01T00:00:00.000Z' }) })
    const ergebnis = await versende(stub, { quelle: ENV_PILOT_AN, pilotToken: TOKEN })
    expect(ergebnis.grund).toContain('token_abgelaufen')
    expect(mailMock).not.toHaveBeenCalled()
  })

  it('ein bereits verbrauchtes Token wird abgewiesen', async () => {
    const { stub } = makeStub({ gateZeile: gateZeileOk({ verbraucht_am: '2026-08-26T12:30:00.000Z' }) })
    const ergebnis = await versende(stub, { quelle: ENV_PILOT_AN, pilotToken: TOKEN })
    expect(ergebnis.grund).toContain('token_verbraucht')
    expect(mailMock).not.toHaveBeenCalled()
  })

  it('ein entwertetes Token wird abgewiesen', async () => {
    const { stub } = makeStub({ gateZeile: gateZeileOk({ entwertet_am: '2026-08-26T12:30:00.000Z' }) })
    const ergebnis = await versende(stub, { quelle: ENV_PILOT_AN, pilotToken: TOKEN })
    expect(ergebnis.grund).toContain('token_entwertet')
    expect(mailMock).not.toHaveBeenCalled()
  })

  it('ein Token auf einen anderen Betrag wird abgewiesen', async () => {
    // Die Bindung ist der Punkt: freigegeben wurde ein bestimmter Betrag,
    // nicht „diese Rechnung, was auch immer sie inzwischen kostet".
    const { stub } = makeStub({ gateZeile: gateZeileOk({ betrag_cents: BETRAG_CENT + 1 }) })
    const ergebnis = await versende(stub, { quelle: ENV_PILOT_AN, pilotToken: TOKEN })
    expect(ergebnis.grund).toContain('betrag_abweichend')
    expect(mailMock).not.toHaveBeenCalled()
  })

  it('ein Token auf einen anderen Empfaenger wird abgewiesen', async () => {
    const { stub } = makeStub({ gateZeile: gateZeileOk({ empfaenger: 'jemand.anders@example.org' }) })
    const ergebnis = await versende(stub, { quelle: ENV_PILOT_AN, pilotToken: TOKEN })
    expect(ergebnis.grund).toContain('empfaenger_abweichend')
    expect(mailMock).not.toHaveBeenCalled()
  })

  it('eine offene Versandsperre haelt auch ein gueltiges Token auf', async () => {
    const { stub } = makeStub({ sperren: [{ id: 's1', grund: 'Nachpruefung abweichend', invoice_id: null }] })
    const ergebnis = await versende(stub, { quelle: ENV_PILOT_AN, pilotToken: TOKEN })
    expect(ergebnis.grund).toContain('versandsperre')
    expect(mailMock).not.toHaveBeenCalled()
  })

  it('ein schon protokollierter Versand haelt das Token auf', async () => {
    const { stub } = makeStub({ bereitsProtokolliert: 1 })
    const ergebnis = await versende(stub, { quelle: ENV_PILOT_AN, pilotToken: TOKEN })
    expect(ergebnis.grund).toContain('bereits_versendet')
    expect(mailMock).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. Der gute Fall — und die Reihenfolge darin
// ═══════════════════════════════════════════════════════════════════════════

describe('Gueltige Freigabe', () => {
  it('versendet und setzt sent_at', async () => {
    const { stub, protokoll } = makeStub()
    const ergebnis = await versende(stub, { quelle: ENV_PILOT_AN, pilotToken: TOKEN })
    expect(ergebnis.status).toBe('versendet')
    expect(protokoll.invoiceUpdates[0]).toMatchObject({ versand_elektronisch: true })
  })

  it('verbraucht das Token VOR dem Absenden', async () => {
    // Andersherum waere ein Abbruch zwischen Mail und Verbrauch genau der
    // Zustand, in dem ein Wiederholungslauf ein zweites Mal senden duerfte.
    //
    // Beide Ereignisse landen in DERSELBEN Liste — nur dann prueft die
    // Zusicherung wirklich die Reihenfolge und nicht bloss, dass beides
    // vorkam.
    const { stub, protokoll } = makeStub()
    mailMock.mockImplementation(async () => {
      protokoll.reihenfolge.push('mail')
      return { ok: true, messageId: 'msg-1' }
    })
    await versende(stub, { quelle: ENV_PILOT_AN, pilotToken: TOKEN })

    const verbrauch = protokoll.reihenfolge.indexOf('gate_verbraucht')
    const mail = protokoll.reihenfolge.indexOf('mail')
    expect(verbrauch, 'Verbrauch wurde nicht protokolliert').toBeGreaterThanOrEqual(0)
    expect(mail, 'Mail wurde nicht gerufen').toBeGreaterThanOrEqual(0)
    expect(verbrauch).toBeLessThan(mail)
    expect(protokoll.gateUpdates).toHaveLength(1)
    expect(protokoll.gateUpdates[0]).toHaveProperty('verbraucht_am')
  })

  it('Gegenprobe: die Reihenfolge-Liste ist bei getauschter Reihenfolge rot', () => {
    // Ohne diese Probe waere der Test oben still gruen, falls
    // `reihenfolge` je leer bliebe (indexOf === -1 auf beiden Seiten).
    expect(['mail', 'gate_verbraucht'].indexOf('gate_verbraucht'))
      .toBeGreaterThan(['mail', 'gate_verbraucht'].indexOf('mail'))
  })

  it('verliert das Rennen zweier gleichzeitiger Laeufe, statt doppelt zu senden', async () => {
    // Das bedingte UPDATE trifft null Zeilen — ein anderer Lauf war schneller.
    const { stub } = makeStub({ verbrauchTrifft: 0 })
    const ergebnis = await versende(stub, { quelle: ENV_PILOT_AN, pilotToken: TOKEN })
    expect(ergebnis.status).toBe('uebersprungen')
    expect(ergebnis.grund).toContain('token_verbraucht')
    expect(mailMock).not.toHaveBeenCalled()
  })

  it('protokolliert den Verbrauch im Audit-Trail', async () => {
    const { stub, protokoll } = makeStub()
    await versende(stub, { quelle: ENV_PILOT_AN, pilotToken: TOKEN })
    const aktionen = protokoll.auditInserts.map(a => a.action)
    expect(aktionen).toContain('pilot_freigabe_verbraucht')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. Nachversand
// ═══════════════════════════════════════════════════════════════════════════

describe('Nachversand', () => {
  it('braucht kein Token — fuer eine versendete Rechnung ist keines ausstellbar', async () => {
    // Sonst waere der bewusste Nachversand waehrend des Piloten eine
    // Sackgasse: der Preflight blockt die Ausstellung, und der
    // UNIQUE-Teilindex `einmal_verbraucht` erst recht.
    const { stub, protokoll } = makeStub({ invoiceSentAt: '2026-08-01T09:00:00Z' })
    const ergebnis = await versende(stub, { quelle: ENV_PILOT_AN, erneutSenden: true })
    expect(ergebnis.status).toBe('versendet')
    expect(protokoll.gateUpdates).toHaveLength(0)
  })

  it('ohne erneutSenden bleibt die Sperre auf sent_at bestehen', async () => {
    const { stub } = makeStub({ invoiceSentAt: '2026-08-01T09:00:00Z' })
    const ergebnis = await versende(stub, { quelle: ENV_PILOT_AN, pilotToken: TOKEN })
    expect(ergebnis.status).toBe('uebersprungen')
    expect(ergebnis.grund).toContain('bereits versendet')
    expect(mailMock).not.toHaveBeenCalled()
  })
})
