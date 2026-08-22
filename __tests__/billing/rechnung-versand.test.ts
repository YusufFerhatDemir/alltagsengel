// ═══════════════════════════════════════════════════════════════
// Track A2 — Rechnungsversand per E-Mail
// ═══════════════════════════════════════════════════════════════
// Bereich 5 der Lueckenanalyse: „Die Rechnung erreicht den Kunden nicht.
// Es gibt keinen einzigen E-Mail-Versand im gesamten Abrechnungspfad."
//
// Geprueft wird die Entscheidungslogik von versendeRechnungPerEmail:
// wann versendet wird, wann NICHT, und was danach in der Datenbank steht.
// PDF-Erzeugung und Resend sind gemockt — beide sind Aussenschnittstellen
// und nicht Gegenstand dieser Suite.
// ═══════════════════════════════════════════════════════════════

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
import { baueRechnungEmail, anhangDateiname } from '@/lib/emails/rechnung-email'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const ACTOR = '00000000-0000-4000-8000-0000000000bb'
const INV = '00000000-0000-4000-8000-0000000000cc'

interface StubOptionen {
  invoice?: Record<string, unknown> | null
  clientEmail?: string | null
}

/**
 * Minimaler Supabase-Stub. `updates` protokolliert alles, was auf
 * invoices geschrieben wurde — daran haengt der Zustellstatus.
 */
function makeStub(opts: StubOptionen = {}) {
  const protokoll = {
    invoiceUpdates: [] as Record<string, unknown>[],
    logInserts: [] as Record<string, unknown>[],
    auditInserts: [] as Record<string, unknown>[],
  }

  const invoice = opts.invoice === undefined ? {
    id: INV,
    invoice_number: 'RE-2026-00042',
    invoice_number_formatted: 'RE-2026-00042',
    status: 'freigegeben',
    correction_type: null,
    total_amount: 105,
    period_start: '2026-07-01',
    period_end: '2026-07-31',
    due_date: '2026-08-14',
    sent_at: null,
    frozen_at: '2026-07-31T10:00:00Z',
    deleted_at: null,
    client: {
      first_name: 'Erika',
      last_name: 'Mustermann',
      email: opts.clientEmail === undefined ? 'erika@example.org' : opts.clientEmail,
    },
  } : opts.invoice

  const stub = {
    from(tabelle: string) {
      if (tabelle === 'invoices') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: invoice, error: null }) }),
            }),
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
        return {
          select: () => ({
            eq: async () => ({ count: protokoll.logInserts.length, error: null }),
          }),
          insert: async (werte: Record<string, unknown>) => {
            protokoll.logInserts.push(werte)
            return { error: null }
          },
        } as never
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

beforeEach(() => {
  paketMock.mockReset()
  mailMock.mockReset()
  paketMock.mockResolvedValue({
    pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    pageCount: 3,
    checksum: 'abc123',
    pdfUrl: 'https://storage.example/inv.pdf',
    storagePath: 'invoice-packages/x.pdf',
    invoiceNumber: 'RE-2026-00042',
    belegart: 'Rechnung',
    clientName: 'Erika Mustermann',
  })
  mailMock.mockResolvedValue({ ok: true, messageId: 'msg-1' })
})

describe('E-Mail-Vorlage', () => {
  const basis = {
    empfaengerName: 'Erika Mustermann',
    belegart: 'Rechnung',
    rechnungsnummer: 'RE-2026-00042',
    zeitraumVon: '2026-07-01',
    zeitraumBis: '2026-07-31',
    betragEuro: 105,
    faelligAm: '2026-08-14',
    zahlbar: true,
    organisationsName: 'Alltagsengel UG (haftungsbeschränkt)',
    iban: 'DE02120300000000202051',
    bic: 'BYLADEM1001',
    bank: 'Sparkasse',
  }

  it('unterschreibt als Alltagsengel und nennt keinen persoenlichen Namen', () => {
    const mail = baueRechnungEmail(basis)
    expect(mail.html).toContain('Ihr Team von Alltagsengel')
    expect(mail.text).toContain('Ihr Team von Alltagsengel')
    // Namens-Policy: persoenliche Namen erscheinen nur in Impressum/Datenschutz.
    for (const name of ['Yusuf', 'Cilcioglu', 'Abdullah']) {
      expect(mail.html).not.toContain(name)
      expect(mail.text).not.toContain(name)
    }
  })

  it('nennt Nummer, Betrag und Faelligkeit', () => {
    const mail = baueRechnungEmail(basis)
    expect(mail.subject).toBe('Rechnung RE-2026-00042 von Alltagsengel')
    expect(mail.text).toContain('RE-2026-00042')
    expect(mail.text).toContain('105,00')
    expect(mail.text).toContain('14.08.2026')
  })

  it('laesst Bankdaten und Zahlungsfrist bei Gutschriften weg', () => {
    const mail = baueRechnungEmail({ ...basis, belegart: 'Gutschrift', zahlbar: false })
    expect(mail.text).not.toContain('IBAN')
    expect(mail.text).not.toContain('Zahlbar bis')
    expect(mail.text).toContain('Eine Zahlung ist dafür nicht erforderlich')
  })

  it('escaped HTML aus Stammdaten', () => {
    const mail = baueRechnungEmail({ ...basis, organisationsName: '<script>alert(1)</script>' })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
  })

  it('erzeugt einen dateisystemtauglichen Anhangnamen', () => {
    expect(anhangDateiname('Rechnung', 'RE-2026-00042')).toBe('Rechnung_RE-2026-00042.pdf')
    expect(anhangDateiname('Korrekturrechnung', 'RE 2026/1')).toBe('Korrekturrechnung_RE_2026_1.pdf')
  })
})

describe('versendeRechnungPerEmail', () => {
  it('versendet mit PDF-Anhang und setzt sent_at', async () => {
    const { stub, protokoll } = makeStub()
    const ergebnis = await versendeRechnungPerEmail(stub, {
      invoiceId: INV, organizationId: ORG, actorId: ACTOR,
    })

    expect(ergebnis.status).toBe('versendet')
    expect(ergebnis.empfaenger).toBe('erika@example.org')

    const mail = mailMock.mock.calls[0][0]
    expect(mail.to).toBe('erika@example.org')
    expect(mail.attachments).toHaveLength(1)
    expect(mail.attachments[0].contentType).toBe('application/pdf')
    expect(mail.attachments[0].filename).toBe('Rechnung_RE-2026-00042.pdf')

    expect(protokoll.invoiceUpdates).toEqual([
      { sent_at: expect.any(String), versand_elektronisch: true },
    ])
    expect(protokoll.logInserts[0]).toMatchObject({ status: 'versendet', versuch: 1 })
  })

  it('versendet eine bereits versendete Rechnung NICHT erneut', async () => {
    const { stub, protokoll } = makeStub()
    // Erster Aufruf setzt sent_at nicht im Stub-Objekt — deshalb explizit.
    const gesendet = makeStub({
      invoice: {
        id: INV, invoice_number: 'RE-1', invoice_number_formatted: 'RE-1',
        status: 'freigegeben', correction_type: null, total_amount: 10,
        period_start: null, period_end: null, due_date: null,
        sent_at: '2026-08-01T09:00:00Z', frozen_at: '2026-07-31T10:00:00Z',
        deleted_at: null,
        client: { first_name: 'A', last_name: 'B', email: 'a@example.org' },
      },
    })

    const ergebnis = await versendeRechnungPerEmail(gesendet.stub, {
      invoiceId: INV, organizationId: ORG, actorId: ACTOR,
    })

    expect(ergebnis.status).toBe('uebersprungen')
    expect(ergebnis.grund).toMatch(/bereits versendet/i)
    expect(mailMock).not.toHaveBeenCalled()
    expect(gesendet.protokoll.invoiceUpdates).toHaveLength(0)
    void stub
    void protokoll
  })

  it('versendet mit erneutSenden trotz gesetztem sent_at', async () => {
    const { stub } = makeStub({
      invoice: {
        id: INV, invoice_number: 'RE-1', invoice_number_formatted: 'RE-1',
        status: 'freigegeben', correction_type: null, total_amount: 10,
        period_start: null, period_end: null, due_date: null,
        sent_at: '2026-08-01T09:00:00Z', frozen_at: '2026-07-31T10:00:00Z',
        deleted_at: null,
        client: { first_name: 'A', last_name: 'B', email: 'a@example.org' },
      },
    })

    const ergebnis = await versendeRechnungPerEmail(stub, {
      invoiceId: INV, organizationId: ORG, actorId: ACTOR, erneutSenden: true,
    })
    expect(ergebnis.status).toBe('versendet')
    expect(mailMock).toHaveBeenCalledTimes(1)
  })

  it('versendet keinen nicht festgeschriebenen Entwurf', async () => {
    const { stub, protokoll } = makeStub({
      invoice: {
        id: INV, invoice_number: null, invoice_number_formatted: null,
        status: 'entwurf', correction_type: null, total_amount: 10,
        period_start: null, period_end: null, due_date: null,
        sent_at: null, frozen_at: null, deleted_at: null,
        client: { first_name: 'A', last_name: 'B', email: 'a@example.org' },
      },
    })

    const ergebnis = await versendeRechnungPerEmail(stub, {
      invoiceId: INV, organizationId: ORG, actorId: ACTOR,
    })

    expect(ergebnis.status).toBe('uebersprungen')
    expect(mailMock).not.toHaveBeenCalled()
    expect(paketMock).not.toHaveBeenCalled()
    expect(protokoll.invoiceUpdates).toHaveLength(0)
  })

  it('ueberspringt ohne E-Mail-Adresse des Klienten', async () => {
    const { stub } = makeStub({ clientEmail: null })
    const ergebnis = await versendeRechnungPerEmail(stub, {
      invoiceId: INV, organizationId: ORG, actorId: ACTOR,
    })
    expect(ergebnis.status).toBe('uebersprungen')
    expect(ergebnis.grund).toMatch(/E-Mail-Adresse/i)
  })

  it('setzt sent_at NICHT, wenn RESEND_API_KEY fehlt', async () => {
    mailMock.mockResolvedValue({
      ok: false, uebersprungen: true, grund: 'RESEND_API_KEY nicht konfiguriert',
    })
    const { stub, protokoll } = makeStub()

    const ergebnis = await versendeRechnungPerEmail(stub, {
      invoiceId: INV, organizationId: ORG, actorId: ACTOR,
    })

    expect(ergebnis.status).toBe('uebersprungen')
    expect(ergebnis.grund).toMatch(/RESEND_API_KEY/)
    // Entscheidend: die Rechnung gilt weiterhin als NICHT zugestellt und
    // geht beim naechsten Lauf mit gesetztem Key wieder mit.
    expect(protokoll.invoiceUpdates).toHaveLength(0)
    expect(protokoll.logInserts[0]).toMatchObject({ status: 'uebersprungen' })
  })

  it('meldet einen Provider-Fehler als fehlgeschlagen ohne sent_at', async () => {
    mailMock.mockResolvedValue({ ok: false, uebersprungen: false, grund: 'Domain not verified' })
    const { stub, protokoll } = makeStub()

    const ergebnis = await versendeRechnungPerEmail(stub, {
      invoiceId: INV, organizationId: ORG, actorId: ACTOR,
    })

    expect(ergebnis.status).toBe('fehlgeschlagen')
    expect(ergebnis.grund).toBe('Domain not verified')
    expect(protokoll.invoiceUpdates).toHaveLength(0)
    expect(protokoll.logInserts[0]).toMatchObject({
      status: 'fehlgeschlagen', grund: 'Domain not verified',
    })
  })

  it('schreibt einen Audit-Eintrag mit der Empfaengeradresse', async () => {
    const { stub, protokoll } = makeStub()
    await versendeRechnungPerEmail(stub, { invoiceId: INV, organizationId: ORG, actorId: ACTOR })

    expect(protokoll.auditInserts).toHaveLength(1)
    expect(protokoll.auditInserts[0]).toMatchObject({
      entity_type: 'invoice',
      entity_id: INV,
      action: 'email_versendet',
      organization_id: ORG,
    })
  })
})
