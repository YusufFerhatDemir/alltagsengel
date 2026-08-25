// ═══════════════════════════════════════════════════════════════
// Track A3 — Mahn-Consumer (dunning_email_queue)
// ═══════════════════════════════════════════════════════════════
// Bereich 9 der Lueckenanalyse: „runDunningRun() schreibt bei jeder
// Eskalation einen Eintrag in dunning_email_queue — und kein einziger
// Codepfad liest diese Tabelle wieder aus."
//
// Geprueft wird die Kette offene Rechnung → faellig → Mahnung in der
// Queue → Versand → Status, und die beiden Faelle, in denen NICHT
// versendet werden darf: zwischenzeitliche Zahlung und paralleler Lauf.
//
// PDF-Erzeugung und Resend sind gemockt; checkDunningBlocks laeuft echt
// gegen den Stub, damit die Blockade-Pruefung mitgetestet wird.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mailMock = vi.fn()
const pdfMock = vi.fn()

vi.mock('@/lib/notifications', () => ({
  sendRawEmail: (...args: unknown[]) => mailMock(...args),
}))

vi.mock('@/lib/billing/dunning/mahnung-pdf-datei', async (original) => {
  const echt = await original<typeof import('@/lib/billing/dunning/mahnung-pdf-datei')>()
  return {
    ...echt,
    erzeugeMahnungPdf: (...args: unknown[]) => pdfMock(...args),
  }
})

vi.mock('@/lib/billing/dunning/mahnung-pdf', async (original) => {
  const echt = await original<typeof import('@/lib/billing/dunning/mahnung-pdf')>()
  return {
    ...echt,
    baueMahnungData: async () => ({
      mahnungData: {
        creditorName: 'Alltagsengel UG (haftungsbeschränkt)',
        creditorAddress: ['Neue Mainzer Straße 66-68', '60311 Frankfurt am Main'],
        debtorName: 'Erika Mustermann',
        debtorAddress: ['Erika Mustermann', 'Musterweg 1', '60311 Frankfurt am Main'],
        invoiceNumber: 'RE-2026-00042',
        invoiceDate: '2026-07-01',
        invoiceAmount: '105,00 €',
        paidAmount: '0,00 €',
        openAmount: '105,00 €',
        dueDate: '2026-07-15',
        dunningLevel: 'mahnung_1',
        dunningFee: '2,50 €',
        totalDue: '107,50 €',
        paymentDeadline: '2026-09-04',
        date: '2026-08-21',
        referenceNumber: 'M-RE-2026-00042-MAHNUNG_1',
      },
      paymentDeadline: '2026-09-04',
      totalDueCents: 10750,
    }),
  }
})

import { verarbeiteMahnQueue } from '@/lib/billing/dunning/mahn-versand'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const ACTOR = '00000000-0000-4000-8000-0000000000bb'
const INV = '00000000-0000-4000-8000-0000000000cc'
const QUEUE_ID = '00000000-0000-4000-8000-0000000000dd'
const ENTRY_ID = '00000000-0000-4000-8000-0000000000ee'

interface StubOptionen {
  /** Rechnungszustand zum Zeitpunkt des Versands */
  invoice?: Record<string, unknown>
  /** Wenn true, greift kein Statuswechsel mehr (paralleler Lauf war schneller) */
  queueSchonWeg?: boolean
  offeneBeanstandungen?: number
}

/**
 * Supabase-Stub mit einer wartenden Queue-Zeile.
 * `queue.status` wandert echt mit, damit die Anspruchslogik
 * (`.eq('status', 'wartend')`) sich ueberhaupt nachstellen laesst.
 */
function makeStub(opts: StubOptionen = {}) {
  const queue = {
    id: QUEUE_ID,
    organization_id: ORG,
    invoice_id: INV,
    dunning_entry_id: ENTRY_ID,
    dunning_document_id: null,
    empfaenger_email: 'erika@example.org',
    empfaenger_name: 'Erika Mustermann',
    betreff: '1. Mahnung — Rechnung Nr. RE-2026-00042',
    inhalt: 'Sehr geehrte Damen und Herren, …',
    status: 'wartend',
    fehler_details: null as string | null,
    versendet_am: null as string | null,
    // Versuchsspur aus 20261001000000_mahnqueue_retry_dead_letter.sql
    versuche: 0,
    letzter_versuch_am: null as string | null,
    naechster_versuch_ab: null as string | null,
    created_at: '2026-08-20T07:00:00Z',
  }

  const invoice = opts.invoice ?? {
    id: INV,
    status: 'freigegeben',
    total_amount: 105,
    paid_amount: 0,
    deleted_at: null,
  }

  const protokoll = { queueUpdates: [] as Record<string, unknown>[], audit: [] as Record<string, unknown>[] }

  /** Wendet ein Update auf die Queue-Zeile an, wenn alle Filter passen. */
  function updateQueue(werte: Record<string, unknown>, filter: Record<string, unknown>) {
    protokoll.queueUpdates.push({ ...werte, __filter: filter })
    if (opts.queueSchonWeg) return []
    for (const [k, v] of Object.entries(filter)) {
      if ((queue as Record<string, unknown>)[k] !== v) return []
    }
    Object.assign(queue, werte)
    return [{ id: queue.id }]
  }

  /**
   * Kettbarer Lesezugriff mit fester Antwort.
   *
   * Der Stub bildete jede Abfrage in ihrer damaligen Form nach — ein
   * `.eq().eq()` mehr im Pruefling, und er warf „is not a function". Genau
   * das passierte, als die Stopp-Pruefung und checkDunningBlocks einen
   * Mandantenfilter bekamen. Ein Testhilfsmittel, das an der FORM der
   * Abfrage haengt statt an ihrem Inhalt, meldet solche Aenderungen als
   * Fehler, obwohl keiner vorliegt.
   */
  function lesekette(antwort: { data: unknown; error?: unknown }) {
    const kette: Record<string, unknown> = {}
    for (const m of ['eq', 'neq', 'in', 'is', 'not', 'or', 'order', 'limit', 'gte', 'lte']) {
      kette[m] = () => kette
    }
    kette.maybeSingle = async () => ({ ...antwort, error: antwort.error ?? null })
    kette.single = async () => ({ ...antwort, error: antwort.error ?? null })
    kette.then = (aufloesen: (v: unknown) => unknown, ablehnen?: (e: unknown) => unknown) =>
      Promise.resolve({ ...antwort, error: antwort.error ?? null }).then(aufloesen, ablehnen)
    return kette as never
  }

  const stub = {
    from(tabelle: string) {
      if (tabelle === 'dunning_email_queue') {
        return {
          select: (_s?: string) => {
            const treffer = () => (queue.status === 'wartend' ? [queue] : [])
            const kette = {
              eq: () => kette,
              in: () => kette,
              order: () => kette,
              limit: async () => ({ data: treffer(), error: null }),
              then: undefined,
            }
            return kette as never
          },
          update: (werte: Record<string, unknown>) => {
            const filter: Record<string, unknown> = {}
            const kette = {
              eq: (spalte: string, wert: unknown) => { filter[spalte] = wert; return kette },
              select: async () => ({ data: updateQueue(werte, filter), error: null }),
            }
            return kette as never
          },
        } as never
      }

      if (tabelle === 'invoices') {
        // Zwei Aufrufer: ermittleStoppgrund (maybeSingle) und
        // checkDunningBlocks (single) — beide inzwischen mit
        // Mandantenfilter, also mit zwei .eq().
        return { select: () => lesekette({ data: invoice }) } as never
      }

      if (tabelle === 'invoice_disputes') {
        const anzahl = opts.offeneBeanstandungen ?? 0
        return {
          select: () => lesekette({
            data: Array.from({ length: anzahl }, (_, i) => ({ id: `d${i}`, status: 'open' })),
          }),
        } as never
      }

      if (tabelle === 'payment_differences' || tabelle === 'invoice_corrections') {
        return { select: () => lesekette({ data: [] }) } as never
      }

      if (tabelle === 'dunning_entries') {
        return {
          select: () => lesekette({ data: { id: ENTRY_ID, dunning_level: 'mahnung_1' } }),
        } as never
      }

      if (tabelle === 'billing_audit_trail') {
        return {
          insert: async (werte: Record<string, unknown>) => {
            protokoll.audit.push(werte)
            return { error: null }
          },
        } as never
      }

      throw new Error(`Unerwartete Tabelle im Stub: ${tabelle}`)
    },
  }

  return { stub: stub as never, queue, protokoll }
}

beforeEach(() => {
  mailMock.mockReset()
  pdfMock.mockReset()
  mailMock.mockResolvedValue({ ok: true, messageId: 'msg-1' })
  pdfMock.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]))
})

describe('verarbeiteMahnQueue', () => {
  it('versendet eine wartende Mahnung mit PDF-Anhang und setzt sie auf versendet', async () => {
    const { stub, queue, protokoll } = makeStub()

    const ergebnis = await verarbeiteMahnQueue(stub, { organizationId: ORG, actorId: ACTOR })

    expect(ergebnis.geprueft).toBe(1)
    expect(ergebnis.versendet).toBe(1)
    expect(ergebnis.storniert).toBe(0)
    expect(queue.status).toBe('versendet')
    expect(queue.versendet_am).toBeTruthy()

    const mail = mailMock.mock.calls[0][0]
    expect(mail.to).toBe('erika@example.org')
    expect(mail.subject).toBe('1. Mahnung — Rechnung Nr. RE-2026-00042')
    expect(mail.attachments).toHaveLength(1)
    expect(mail.attachments[0].filename).toBe('1._Mahnung_RE-2026-00042.pdf')

    expect(protokoll.audit[0]).toMatchObject({ action: 'email_versendet', entity_id: ENTRY_ID })
  })

  it('stoppt die Mahnung, wenn die Rechnung inzwischen bezahlt ist', async () => {
    const { stub, queue } = makeStub({
      invoice: { id: INV, status: 'freigegeben', total_amount: 105, paid_amount: 105, deleted_at: null },
    })

    const ergebnis = await verarbeiteMahnQueue(stub, { organizationId: ORG, actorId: ACTOR })

    expect(ergebnis.versendet).toBe(0)
    expect(ergebnis.storniert).toBe(1)
    expect(ergebnis.details[0].grund).toMatch(/Zahlung eingegangen/)
    expect(queue.status).toBe('storniert')
    expect(mailMock).not.toHaveBeenCalled()
  })

  it('stoppt die Mahnung bei Rechnungsstatus bezahlt', async () => {
    const { stub, queue } = makeStub({
      invoice: { id: INV, status: 'bezahlt', total_amount: 105, paid_amount: 0, deleted_at: null },
    })

    const ergebnis = await verarbeiteMahnQueue(stub, { organizationId: ORG, actorId: ACTOR })

    expect(ergebnis.storniert).toBe(1)
    expect(queue.status).toBe('storniert')
    expect(mailMock).not.toHaveBeenCalled()
  })

  it('stoppt die Mahnung bei offener Beanstandung', async () => {
    const { stub, queue } = makeStub({ offeneBeanstandungen: 1 })

    const ergebnis = await verarbeiteMahnQueue(stub, { organizationId: ORG, actorId: ACTOR })

    expect(ergebnis.storniert).toBe(1)
    expect(ergebnis.details[0].grund).toMatch(/Beanstandung/)
    expect(queue.status).toBe('storniert')
    expect(mailMock).not.toHaveBeenCalled()
  })

  it('versendet nicht doppelt, wenn ein paralleler Lauf schneller war', async () => {
    const { stub, queue } = makeStub({ queueSchonWeg: true })

    const ergebnis = await verarbeiteMahnQueue(stub, { organizationId: ORG, actorId: ACTOR })

    expect(ergebnis.versendet).toBe(0)
    expect(ergebnis.uebersprungen).toBe(1)
    expect(ergebnis.details[0].grund).toMatch(/Parallel/)
    expect(mailMock).not.toHaveBeenCalled()
    expect(queue.status).toBe('wartend')
  })

  it('legt den Eintrag ohne RESEND_API_KEY zurueck auf wartend', async () => {
    mailMock.mockResolvedValue({ ok: false, uebersprungen: true, grund: 'RESEND_API_KEY nicht konfiguriert' })
    const { stub, queue } = makeStub()

    const ergebnis = await verarbeiteMahnQueue(stub, { organizationId: ORG, actorId: ACTOR })

    expect(ergebnis.uebersprungen).toBe(1)
    expect(ergebnis.versendet).toBe(0)
    // Entscheidend: der Eintrag ist NICHT verbrannt.
    expect(queue.status).toBe('wartend')
    expect(queue.versendet_am).toBeNull()
    expect(queue.fehler_details).toMatch(/RESEND_API_KEY/)
  })

  it('setzt den Eintrag bei Provider-Ablehnung auf fehlgeschlagen', async () => {
    mailMock.mockResolvedValue({ ok: false, uebersprungen: false, grund: 'Domain not verified' })
    const { stub, queue } = makeStub()

    const ergebnis = await verarbeiteMahnQueue(stub, { organizationId: ORG, actorId: ACTOR })

    expect(ergebnis.fehlgeschlagen).toBe(1)
    expect(queue.status).toBe('fehlgeschlagen')
    expect(queue.versendet_am).toBeNull()
    // Seit 20261001000000 haengt der Versuchsstand am Fehlertext — der
    // Grund selbst bleibt darin unveraendert stehen.
    expect(queue.fehler_details).toContain('Domain not verified')
    expect(queue.fehler_details).toContain('Versuch 1 von')
    expect(queue.versuche).toBe(1)
    expect(queue.naechster_versuch_ab).toBeTruthy()
  })

  it('setzt den Eintrag zurueck, wenn die PDF-Erzeugung wirft', async () => {
    pdfMock.mockRejectedValue(new Error('Font nicht ladbar'))
    const { stub, queue } = makeStub()

    const ergebnis = await verarbeiteMahnQueue(stub, { organizationId: ORG, actorId: ACTOR })

    expect(ergebnis.fehlgeschlagen).toBe(1)
    expect(queue.status).toBe('fehlgeschlagen')
    expect(queue.fehler_details).toContain('Font nicht ladbar')
    expect(queue.versuche).toBe(1)
    expect(mailMock).not.toHaveBeenCalled()
  })
})
