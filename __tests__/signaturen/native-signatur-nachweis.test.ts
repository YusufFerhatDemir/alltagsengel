/**
 * /api/native/signatures — die Unterschrift muss den Nachweis erreichen
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ── BEFUND (14.09.2026) ───────────────────────────────────────────────
 * Das ist der Weg, den die App tatsächlich benutzt: die Kundin
 * unterschreibt auf dem Gerät, die Route legt eine Zeile in
 * `service_signatures` an — und war damit fertig. `service_records` blieb
 * auf `proof_status='ENTWURF'` ohne Hash.
 *
 * Der Sammelrechnungslauf prüft aber den BELEG am Nachweis, nicht die
 * Existenz einer Signaturzeile (`istUnterschrieben` in
 * lib/billing/core/sammelrechnung.ts). Die Kundin hatte unterschrieben,
 * und die Rechnung entstand trotzdem nie — genau die dreizehn Fälle, die
 * `npm run verify:sammelrechnung` (S13c) live meldet.
 *
 * ── DIE UNTERSCHEIDUNG, DIE HIER ZÄHLT ────────────────────────────────
 * Nur die KUNDEN-Unterschrift stempelt. `client_signed_at` und
 * `client_signature` sind die Felder des Kunden; die Unterschrift der
 * Pflegekraft belegt, dass der Einsatz stattgefunden hat — nicht, dass der
 * Kunde ihn bestätigt hat. Beides gleichzusetzen wäre genau die Abkürzung,
 * gegen die `enforce_unterschrift_beleg` steht.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const ENGEL = 'engel-1'
const ORG = 'org-1'
const NACHWEIS = 'sr-1'

const { mockRequireCaregiverSession, mockCreateAdminClient, mockUebernahme } = vi.hoisted(() => ({
  mockRequireCaregiverSession: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockUebernahme: vi.fn(),
}))

vi.mock('@/lib/native-auth', () => ({ requireCaregiverSession: mockRequireCaregiverSession }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdminClient }))
vi.mock('@/lib/signaturen/nachweis-uebernahme', () => ({
  NACHWEIS_TABELLE: 'service_records',
  uebernimmOderMelde: (...a: unknown[]) => mockUebernahme(...a),
}))

const { POST } = await import('@/app/api/native/signatures/route')

/** Admin-Doppelgänger: Nachweis vorhanden, noch keine Unterschrift. */
function adminDoppel() {
  const client: any = {
    from(table: string) {
      const b: any = {
        select: () => b,
        insert: () => b,
        eq: () => b,
        single: async () => table === 'service_records'
          ? { data: { id: NACHWEIS, caregiver_id: ENGEL, organization_id: ORG }, error: null }
          : { data: { id: 'sig-1' }, error: null },
        maybeSingle: async () => ({ data: null, error: null }),
      }
      return b
    },
  }
  return client
}

function anfrage(signer_role: 'client' | 'caregiver') {
  return new Request('https://example.org/api/native/signatures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_record_id: NACHWEIS,
      signer_role,
      signer_name: 'Erika Testfall',
      signature_image: 'data:image/png;base64,AAAA',
    }),
  })
}

beforeEach(() => {
  mockUebernahme.mockReset().mockResolvedValue({ art: 'uebernommen', nachweisId: NACHWEIS })
  mockCreateAdminClient.mockReset().mockReturnValue(adminDoppel())
  mockRequireCaregiverSession.mockReset().mockResolvedValue({
    ok: true, caregiverId: ENGEL, organizationId: ORG,
  })
})

describe('Kundenunterschrift', () => {
  it('stempelt den Leistungsnachweis', async () => {
    const res = await POST(anfrage('client') as never)
    expect(res.status).toBe(200)

    expect(mockUebernahme).toHaveBeenCalledTimes(1)
    const [, eingabe] = mockUebernahme.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(eingabe.referenzTabelle).toBe('service_records')
    expect(eingabe.referenzId).toBe(NACHWEIS)
    expect(eingabe.signatarName).toBe('Erika Testfall')
    // Der Mandant kommt aus dem GEPRUEFTEN Nachweis, nicht aus dem Rumpf.
    expect(eingabe.organizationId).toBe(ORG)
  })

  it('antwortet auch dann mit Erfolg, wenn die Übernahme scheitert', async () => {
    // Die Unterschrift IST gespeichert. Sie zurückzunehmen, weil ein
    // Folgeschritt scheitert, wäre falsch — der Fehlschlag wird
    // protokolliert (uebernimmOderMelde), nicht durchgereicht.
    mockUebernahme.mockResolvedValue({ art: 'fehlgeschlagen', grund: 'Datenbank weg' })
    const res = await POST(anfrage('client') as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true })
  })
})

describe('Unterschrift der Pflegekraft', () => {
  it('stempelt den Leistungsnachweis NICHT', async () => {
    // Sie belegt, dass der Einsatz stattgefunden hat — nicht, dass der
    // Kunde ihn bestätigt hat.
    const res = await POST(anfrage('caregiver') as never)
    expect(res.status).toBe(200)
    expect(mockUebernahme).not.toHaveBeenCalled()
  })
})
