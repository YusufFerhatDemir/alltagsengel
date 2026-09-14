/**
 * Der eigene Vertrag als Dokument — und nur der eigene.
 * @see app/api/kunde/vertraege/[id]/pdf/route.ts
 *
 * ── WORUM ES GEHT ─────────────────────────────────────────────────
 * /kunde/vertraege zeigte Titel, Art, Status und Daten — also die
 * Zeile, nicht das Dokument. Der Generator existiert seit ab451104,
 * hing aber ausschliesslich an `requireAktenAdmin`: die Verwaltung
 * konnte den Vertrag ausdrucken, die Kundin, die ihn unterschreiben
 * soll, nicht lesen.
 *
 * ── DIE GRENZE ────────────────────────────────────────────────────
 * Die Route baut KEINEN eigenen Zaun. Sie holt den Vertrag mit dem
 * RLS-Client der Sitzung; die Policy `kunde_akten_vertraege_select`
 * lässt genau die Zeilen durch, deren `client_id` zu einem
 * `clients`-Eintrag mit `user_id = auth.uid()` gehört. Ein fremder
 * Vertrag kommt damit gar nicht erst zurück — und die Antwort ist
 * dieselbe wie für „gibt es nicht".
 *
 * Genau das prüfen diese Tests: nicht dass es funktioniert, sondern
 * dass es DICHT ist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const halter = vi.hoisted(() => ({
  sitzung: null as { id: string } | null,
  /** Was der RLS-Client auf akten_vertraege liefert. */
  vertrag: null as Record<string, unknown> | null,
  leseFehler: null as { message: string } | null,
  /** Mitschrift: welche Tabellen der RLS-Client angefasst hat. */
  rlsTabellen: [] as string[],
  pdfGebaut: 0,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        halter.sitzung
          ? { data: { user: halter.sitzung }, error: null }
          : { data: { user: null }, error: { message: 'keine Sitzung' } },
    },
    from: (t: string) => {
      halter.rlsTabellen.push(t)
      const kette = {
        select: () => kette,
        eq: () => kette,
        maybeSingle: async () => ({ data: halter.vertrag, error: halter.leseFehler }),
      }
      return kette
    },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const kette = {
        select: () => kette,
        eq: () => kette,
        lte: () => kette,
        maybeSingle: async () => ({
          data: { first_name: 'Erika', last_name: 'Testfall', address: 'Weg 1', zip_code: '60311', city: 'Frankfurt' },
          error: null,
        }),
        then: (f: (w: unknown) => unknown) =>
          Promise.resolve({
            data: [{ hourly_rate: 40, description: 'Alltagsbegleitung privat', valid_from: '2026-01-01', valid_until: null, is_active: true }],
            error: null,
          }).then(f),
      }
      return kette
    },
  }),
}))

vi.mock('@/lib/vertraege/vertrag-pdf', () => ({
  baueVertragPdf: async () => { halter.pdfGebaut++; return new Uint8Array([37, 80, 68, 70]) },
}))

import { GET } from '@/app/api/kunde/vertraege/[id]/pdf/route'

const VERTRAG_ID = '11111111-1111-4111-8111-111111111111'

function ruf(id = VERTRAG_ID) {
  return GET(
    new Request(`http://x/api/kunde/vertraege/${id}/pdf`),
    { params: Promise.resolve({ id }) },
  )
}

beforeEach(() => {
  halter.sitzung = { id: 'user-1' }
  halter.vertrag = {
    id: VERTRAG_ID, client_id: 'client-1', organization_id: 'org-1',
    titel: 'Dienstleistungsvertrag', vertragstyp: 'dienstleistungsvertrag',
    vertragsnummer: 'AE-2026-0001', vertragsbeginn: '2026-10-01',
    vertragsende: null, kuendigungsfrist_tage: 14, auto_verlaengerung: false,
  }
  halter.leseFehler = null
  halter.rlsTabellen = []
  halter.pdfGebaut = 0
})

describe('Der eigene Vertrag', () => {
  it('wird als PDF ausgeliefert', async () => {
    const res = await ruf()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(halter.pdfGebaut).toBe(1)
  })

  it('trägt die Vertragsnummer im Dateinamen', async () => {
    const res = await ruf()
    expect(res.headers.get('Content-Disposition')).toMatch(/AE-2026-0001/)
  })

  it('wird nicht zwischengespeichert', async () => {
    // Ein Vertrag ist personenbezogen; ein Zwischenspeicher gäbe ihn an
    // der Sitzung vorbei weiter.
    expect((await ruf()).headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('Ein fremder Vertrag kommt nicht heraus', () => {
  it('RLS liefert nichts ⇒ 404, und es wird kein PDF gebaut', async () => {
    halter.vertrag = null
    const res = await ruf()
    expect(res.status).toBe(404)
    expect(halter.pdfGebaut, 'PDF trotz fehlendem Anspruch erzeugt').toBe(0)
  })

  it('die Antwort verrät nicht, ob es den Vertrag gibt', async () => {
    halter.vertrag = null
    const body = await (await ruf()).json()
    // „nicht gefunden" — nicht „gehört Ihnen nicht". Ob unter dieser
    // Kennung ein Vertrag existiert, geht die anfragende Person nichts an.
    expect(String(body.error)).toMatch(/nicht gefunden/i)
    expect(String(body.error)).not.toMatch(/gehört|fremd|Berechtigung/i)
  })

  it('der Anspruch wird über den RLS-Client geprüft, nicht über den Dienstschlüssel', async () => {
    // Ein selbstgebauter Zaun neben der vorhandenen Policy wäre eine
    // zweite Wahrheit — und die beiden laufen auseinander.
    await ruf()
    expect(halter.rlsTabellen, 'akten_vertraege nicht über den RLS-Client gelesen')
      .toContain('akten_vertraege')
  })
})

describe('Ohne Sitzung', () => {
  it('gibt es kein Dokument', async () => {
    halter.sitzung = null
    const res = await ruf()
    expect(res.status).toBe(401)
    expect(halter.pdfGebaut).toBe(0)
  })
})

describe('Fehler und Sonderfälle', () => {
  it('ein Lesefehler wird nicht als „nicht gefunden" ausgegeben', async () => {
    // Sonst läse sich eine Störung wie ein fehlender Anspruch, und
    // niemand suchte den Fehler dort, wo er liegt.
    halter.leseFehler = { message: 'Verbindung unterbrochen' }
    const res = await ruf()
    expect(res.status).toBe(503)
    expect(halter.pdfGebaut).toBe(0)
  })

  it('eine Vertragsart ohne Vorlage wird benannt, nicht stillschweigend leer', async () => {
    halter.vertrag = { ...halter.vertrag, vertragstyp: 'arbeitsvertrag' }
    const res = await ruf()
    expect(res.status).toBe(422)
    expect(String((await res.json()).error)).toMatch(/Druckvorlage/)
    expect(halter.pdfGebaut).toBe(0)
  })
})
