// ═══════════════════════════════════════════════════════════════════════
// Rollenmodell — Angriffsvektoren an echten API-Routen
// ═══════════════════════════════════════════════════════════════════════
//
// Bestehende Abdeckung (nicht hier nochmal):
//   • rollenkonzept.test.ts          — Matrix und Bereichskatalog, rein
//   • rollenkonzept-zugriffe.test.ts — requireBerechtigung() isoliert
//   • rollenkonzept-pglite.test.ts   — darf() und Policies in Postgres
//
// Was dort NICHT geprueft ist und hier geprueft wird: was passiert, wenn
// jemand die echte Route aufruft und dabei zu schummeln versucht. Vier
// Wege werden durchgespielt:
//
//   1. ROLLENMATRIX AN DER ROUTE — jede der neun Rollen gegen sieben
//      echte Handler. Erwartung kommt aus ROLLEN_MATRIX, nicht aus einer
//      abgeschriebenen Liste: waechst die Matrix, waechst der Test mit.
//   2. URL-MANIPULATION — ?organization_id=<fremd> im Query-String.
//   3. KOERPER-MANIPULATION — organization_id/actorId/role im POST-Body.
//   4. OBJEKT-ID-MANIPULATION — die ID eines fremden Mandanten abfragen.
//
// Der Mandant kommt in allen Guards aus getActiveOrgId() (Mitgliedschaft
// bzw. Org-Switcher-Cookie). Die Angriffe muessen also nicht nur „403"
// ergeben, sondern duerfen den Mandanten der Abfrage ueberhaupt nicht
// bewegen — deshalb zeichnet der Ersatz-Client jeden Filter mit.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ROLLEN, ROLLEN_MATRIX, type Berechtigung, type Rolle } from '@/lib/auth/rollen'
import { erstelleAufzeichnendenClient, type Aufzeichnung } from './helpers/aufzeichnender-client'

const ORG_EIGEN = '00000000-0000-4000-8000-00000000aaaa'
const ORG_FREMD = '00000000-0000-4000-8000-00000000bbbb'

const RECHNUNG_EIGEN = '11111111-1111-4111-8111-111111111111'
const RECHNUNG_FREMD = '22222222-2222-4222-8222-222222222222'

// ── Gemockte Sitzung ──────────────────────────────────────────────────
let aktuelleRolle: string | null = 'admin'

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: aktuelleRolle ? { id: 'nutzer-1', app_metadata: {} } : null },
        error: null,
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal1', nextLevel: 'aal1' },
        }),
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: aktuelleRolle ? { role: aktuelleRolle, first_name: 'Test', last_name: 'Person' } : null,
            error: null,
          }),
          maybeSingle: async () => ({
            data: aktuelleRolle ? { role: aktuelleRolle, first_name: 'Test', last_name: 'Person' } : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}))

// Der aktive Mandant haengt an der Mitgliedschaft — NIE an der Anfrage.
// Genau das ist die Behauptung, die die URL-/Body-Angriffe pruefen.
vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: async () => ORG_EIGEN,
  resolveUserOrgId: async () => ORG_EIGEN,
}))

// ── Ersatz fuer createAdminClient ─────────────────────────────────────
let aufzeichnung: Aufzeichnung

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => aktuellerClient,
}))

let aktuellerClient: unknown

function neuerClient(): void {
  const bestand = {
    invoices: [
      { id: RECHNUNG_EIGEN, organization_id: ORG_EIGEN, invoice_number: 1, status: 'entwurf', total_amount: 100, deleted_at: null, correction_type: null },
      { id: RECHNUNG_FREMD, organization_id: ORG_FREMD, invoice_number: 2, status: 'entwurf', total_amount: 999, deleted_at: null, correction_type: null },
    ],
    sepa_mandates: [
      { id: 'm-eigen', organization_id: ORG_EIGEN, client_id: 'k1', status: 'aktiv' },
      { id: 'm-fremd', organization_id: ORG_FREMD, client_id: 'k2', status: 'aktiv' },
    ],
    lagerungsprotokolle: [
      { id: 'l-eigen', organization_id: ORG_EIGEN, client_id: 'k1', archiviert_am: null },
      { id: 'l-fremd', organization_id: ORG_FREMD, client_id: 'k2', archiviert_am: null },
    ],
    mitarbeitergespraeche: [
      { id: 'g-eigen', organization_id: ORG_EIGEN, caregiver_id: 'c1', status: 'offen' },
      { id: 'g-fremd', organization_id: ORG_FREMD, caregiver_id: 'c2', status: 'offen' },
    ],
    service_records: [
      { id: 's-fremd', organization_id: ORG_FREMD, client_id: 'k2', status: 'signed', date: '2026-07-05', budget_type: 'entlastungsbetrag', service_type: 'Betreuung', amount: 50, proof_status: 'UNTERSCHRIEBEN', signature_hash: 'x' },
    ],
    billing_tariffs: [],
  }
  const erzeugt = erstelleAufzeichnendenClient(bestand)
  aktuellerClient = erzeugt.client
  aufzeichnung = erzeugt.aufzeichnung
}

beforeEach(() => {
  aktuelleRolle = 'admin'
  neuerClient()
})

// ── Die geprueften Routen ─────────────────────────────────────────────
interface Pruefling {
  name: string
  /** Berechtigung, die der Handler laut Quelltext verlangt. */
  berechtigung: Berechtigung
  /** Ruft den echten Handler auf und liefert den HTTP-Status. */
  aufruf: (suchparameter?: string) => Promise<Response>
}

function anfrage(pfad: string, suchparameter = ''): Request {
  return new Request(`https://alltagsengel.care${pfad}${suchparameter}`)
}

const ROUTEN: Pruefling[] = [
  {
    name: 'GET /api/billing/invoices',
    berechtigung: 'abrechnung.lesen',
    aufruf: async (sp = '') =>
      (await import('@/app/api/billing/invoices/route')).GET(anfrage('/api/billing/invoices', sp)),
  },
  {
    name: 'GET /api/billing/sammelrechnung',
    berechtigung: 'abrechnung.lesen',
    aufruf: async (sp = '?month=2026-07') =>
      (await import('@/app/api/billing/sammelrechnung/route')).GET(anfrage('/api/billing/sammelrechnung', sp)),
  },
  {
    name: 'GET /api/billing/sepa/mandates',
    berechtigung: 'bankdaten.lesen',
    aufruf: async (sp = '') => {
      const { NextRequest } = await import('next/server')
      return (await import('@/app/api/billing/sepa/mandates/route')).GET(
        new NextRequest(`https://alltagsengel.care/api/billing/sepa/mandates${sp}`),
      )
    },
  },
  {
    name: 'GET /api/admin/lagerungsprotokoll',
    berechtigung: 'pflege.lesen',
    aufruf: async (sp = '') => {
      const { NextRequest } = await import('next/server')
      return (await import('@/app/api/admin/lagerungsprotokoll/route')).GET(
        new NextRequest(`https://alltagsengel.care/api/admin/lagerungsprotokoll${sp}`),
      )
    },
  },
  {
    name: 'GET /api/admin/mitarbeitergespraeche',
    berechtigung: 'personal.lesen',
    aufruf: async (sp = '') => {
      const { NextRequest } = await import('next/server')
      return (await import('@/app/api/admin/mitarbeitergespraeche/route')).GET(
        new NextRequest(`https://alltagsengel.care/api/admin/mitarbeitergespraeche${sp}`),
      )
    },
  },
  {
    name: 'GET /api/admin/monitoring',
    berechtigung: 'system.verwalten',
    aufruf: async () => (await import('@/app/api/admin/monitoring/route')).GET(),
  },
]

// ═══════════════════════════════════════════════════════════════════════
// 1. Rollenmatrix an der echten Route
// ═══════════════════════════════════════════════════════════════════════

describe('Rollenmatrix an echten Routen', () => {
  for (const route of ROUTEN) {
    for (const rolle of ROLLEN) {
      const erlaubt = (ROLLEN_MATRIX[rolle] as readonly Berechtigung[]).includes(route.berechtigung)

      it(`${route.name}: ${rolle} ${erlaubt ? 'kommt durch' : 'wird abgewiesen'}`, async () => {
        aktuelleRolle = rolle
        const antwort = await route.aufruf()
        if (erlaubt) {
          expect(antwort.status).toBeLessThan(400)
        } else {
          expect(antwort.status).toBe(403)
        }
      })
    }
  }

  it('weist ohne Anmeldung ueberall mit 401 ab', async () => {
    for (const route of ROUTEN) {
      aktuelleRolle = null
      const antwort = await route.aufruf()
      expect(antwort.status, route.name).toBe(401)
    }
  })

  it('weist eine erfundene Rolle ab, statt sie durchzuwinken', async () => {
    for (const route of ROUTEN) {
      aktuelleRolle = 'geschaeftsfuehrung'
      const antwort = await route.aufruf()
      expect(antwort.status, route.name).toBe(403)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Die vier Fachrollen im Kreuzvergleich
// ═══════════════════════════════════════════════════════════════════════
//
// Die Trennlinien, die das Rollenkonzept begruendet haben, an der Route
// statt an der Matrix. Buchhaltung ohne Gesundheitsdaten, PDL ohne
// Bankdaten, QM ohne Geld, niemand ausser der Administration an den
// Systemeinstellungen.

const KREUZVERGLEICH: Array<{ rolle: Rolle; darf: string[]; darfNicht: string[] }> = [
  {
    rolle: 'buchhaltung',
    darf: ['GET /api/billing/invoices', 'GET /api/billing/sepa/mandates', 'GET /api/billing/sammelrechnung'],
    darfNicht: ['GET /api/admin/lagerungsprotokoll', 'GET /api/admin/mitarbeitergespraeche', 'GET /api/admin/monitoring'],
  },
  {
    rolle: 'pdl',
    darf: ['GET /api/admin/lagerungsprotokoll', 'GET /api/admin/mitarbeitergespraeche', 'GET /api/billing/invoices'],
    darfNicht: ['GET /api/billing/sepa/mandates', 'GET /api/admin/monitoring'],
  },
  {
    rolle: 'qm',
    darf: ['GET /api/admin/lagerungsprotokoll', 'GET /api/admin/mitarbeitergespraeche'],
    darfNicht: ['GET /api/billing/invoices', 'GET /api/billing/sepa/mandates', 'GET /api/admin/monitoring'],
  },
  {
    rolle: 'engel',
    darf: [],
    darfNicht: ROUTEN.map(r => r.name),
  },
  {
    rolle: 'kunde',
    darf: [],
    darfNicht: ROUTEN.map(r => r.name),
  },
  {
    rolle: 'angehoerige',
    darf: [],
    darfNicht: ROUTEN.map(r => r.name),
  },
  {
    rolle: 'admin',
    darf: ROUTEN.map(r => r.name),
    darfNicht: [],
  },
]

describe('Fachrollen im Kreuzvergleich', () => {
  for (const { rolle, darf, darfNicht } of KREUZVERGLEICH) {
    it(`${rolle}: ${darf.length} erlaubt, ${darfNicht.length} gesperrt`, async () => {
      for (const name of darf) {
        aktuelleRolle = rolle
        neuerClient()
        const route = ROUTEN.find(r => r.name === name)!
        expect((await route.aufruf()).status, `${rolle} → ${name}`).toBeLessThan(400)
      }
      for (const name of darfNicht) {
        aktuelleRolle = rolle
        neuerClient()
        const route = ROUTEN.find(r => r.name === name)!
        expect((await route.aufruf()).status, `${rolle} → ${name}`).toBe(403)
      }
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════
// 3. URL-Manipulation
// ═══════════════════════════════════════════════════════════════════════

describe('Angriff: fremde Organisation im Query-String', () => {
  const VERSUCHE = [
    `?organization_id=${ORG_FREMD}`,
    `?organizationId=${ORG_FREMD}`,
    `?org_id=${ORG_FREMD}`,
    `?orgId=${ORG_FREMD}&organization_id=${ORG_FREMD}`,
  ]

  for (const route of ROUTEN) {
    if (route.name === 'GET /api/admin/monitoring') continue // fragt keine Tabelle ab

    it(`${route.name}: fragt nie mit fremder organization_id ab`, async () => {
      for (const versuch of VERSUCHE) {
        aktuelleRolle = 'admin'
        neuerClient()
        const suchparameter = route.name.includes('sammelrechnung')
          ? `?month=2026-07&${versuch.slice(1)}`
          : versuch
        const antwort = await route.aufruf(suchparameter)
        expect(antwort.status, `${route.name} ${versuch}`).toBeLessThan(400)

        const gefragt = aufzeichnung.organisationsFilter()
        expect(gefragt, `${route.name} ${versuch}`).not.toContain(ORG_FREMD)
        // Positivprobe: es wurde ueberhaupt nach dem Mandanten gefiltert.
        expect(gefragt.length, `${route.name} ${versuch}: kein Mandantenfilter`).toBeGreaterThan(0)
        expect(gefragt.every(w => w === ORG_EIGEN)).toBe(true)
      }
    })
  }

  it('Rechnungsliste liefert keine Zeile des fremden Mandanten', async () => {
    aktuelleRolle = 'buchhaltung'
    neuerClient()
    const antwort = await ROUTEN[0].aufruf(`?organization_id=${ORG_FREMD}`)
    const koerper = await antwort.json()
    const ids = JSON.stringify(koerper)
    expect(ids).not.toContain(RECHNUNG_FREMD)
    expect(ids).not.toContain(ORG_FREMD)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Objekt-ID-Manipulation
// ═══════════════════════════════════════════════════════════════════════

describe('Angriff: fremde Objekt-ID', () => {
  it('Rechnungsstatus einer fremden Rechnung wird nicht geaendert', async () => {
    aktuelleRolle = 'buchhaltung'
    neuerClient()
    const modul = await import('@/app/api/billing/invoices/[id]/status/route')
    const antwort = await modul.POST(
      new Request(`https://alltagsengel.care/api/billing/invoices/${RECHNUNG_FREMD}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'geprueft' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: RECHNUNG_FREMD }) },
    )

    // Entweder abgewiesen — oder die Abfrage traegt den eigenen Mandanten
    // und findet die fremde Rechnung deshalb gar nicht.
    expect(antwort.status).toBeGreaterThanOrEqual(400)
    expect(aufzeichnung.organisationsFilter()).not.toContain(ORG_FREMD)
  })

  it('Sammelrechnungslauf nimmt keine Leistungsnachweise eines fremden Mandanten mit', async () => {
    aktuelleRolle = 'buchhaltung'
    neuerClient()
    const antwort = await ROUTEN[1].aufruf('?month=2026-07')
    expect(antwort.status).toBe(200)
    const ergebnis = await antwort.json()
    expect(ergebnis.organizationId).toBe(ORG_EIGEN)
    // ORG_FREMD hat einen signierten Nachweis im Juli — er darf nicht
    // in der Vorschau auftauchen.
    expect(ergebnis.gruppen).toBe(0)
    expect(JSON.stringify(ergebnis)).not.toContain(ORG_FREMD)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Rechteausweitung ueber den Anfragekoerper
// ═══════════════════════════════════════════════════════════════════════

describe('Angriff: Rechteausweitung ueber den Anfragekoerper', () => {
  async function sammellauf(koerper: Record<string, unknown>): Promise<Response> {
    const modul = await import('@/app/api/billing/sammelrechnung/route')
    return modul.POST(
      new Request('https://alltagsengel.care/api/billing/sammelrechnung', {
        method: 'POST',
        body: JSON.stringify(koerper),
        headers: { 'content-type': 'application/json' },
      }),
    )
  }

  it('ignoriert organization_id, organizationId und actorId aus dem Koerper', async () => {
    aktuelleRolle = 'buchhaltung'
    neuerClient()
    const antwort = await sammellauf({
      month: '2026-07',
      dryRun: true,
      organization_id: ORG_FREMD,
      organizationId: ORG_FREMD,
      actorId: 'fremder-nutzer',
      role: 'superadmin',
    })
    expect(antwort.status).toBe(200)
    const ergebnis = await antwort.json()
    expect(ergebnis.organizationId).toBe(ORG_EIGEN)
    expect(aufzeichnung.organisationsFilter()).not.toContain(ORG_FREMD)
  })

  it('laesst die Rolle aus dem Koerper unbeachtet — Engel bleibt gesperrt', async () => {
    aktuelleRolle = 'engel'
    neuerClient()
    const antwort = await sammellauf({ month: '2026-07', role: 'admin', rolle: 'superadmin' })
    expect(antwort.status).toBe(403)
  })

  it('laesst autoVersand nicht ueber den Koerper einschalten', async () => {
    const quelle = await import('node:fs').then(fs =>
      fs.readFileSync('app/api/billing/sammelrechnung/route.ts', 'utf-8'),
    )
    // Der automatische Versand darf allein am ENV-Flag und an
    // `festschreiben` haengen, nie an einem Feld aus dem Browser.
    expect(quelle).not.toMatch(/autoVersand\s*=\s*\(?\s*body/)
    expect(quelle).toContain("process.env.RECHNUNGSVERSAND_AUTOMATISCH === '1'")
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. Bestandsschutz: service_role
// ═══════════════════════════════════════════════════════════════════════
//
// createAdminClient() umgeht RLS vollstaendig. Jede Route, die ihn
// benutzt, MUSS den Mandanten selbst in die Abfrage schreiben — die
// Datenbank tut es dort nicht mehr fuer sie.

describe('Bestandsschutz: service_role ohne Mandantenfilter', () => {
  it('jede gepruefte Route filtert jede Tabellenabfrage nach organization_id', async () => {
    const ausnahmen = new Set<string>([
      // sammleFristen() liest Stammdatenkataloge ohne Mandantenbezug.
    ])
    for (const route of ROUTEN) {
      if (route.name === 'GET /api/admin/monitoring') continue
      aktuelleRolle = 'admin'
      neuerClient()
      await route.aufruf()
      const offen = aufzeichnung.tabellenOhneOrgFilter().filter(t => !ausnahmen.has(t))
      expect(offen, `${route.name}: Abfrage ohne Mandantenfilter`).toEqual([])
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7. Gegenprobe — greift die Pruefung ueberhaupt?
// ═══════════════════════════════════════════════════════════════════════
//
// Ein Sicherheitstest, der immer gruen ist, ist schlimmer als keiner. Die
// beiden Werkzeuge dieses Files werden deshalb an einem absichtlich
// kaputten Fall vorgefuehrt: der aufzeichnende Client muss eine
// mandantenblinde Abfrage melden, und der Sammelrechnungslauf muss eine
// Gruppe des EIGENEN Mandanten finden — sonst waere „0 Gruppen" beim
// fremden Mandanten kein Nachweis, sondern nur ein leerer Bestand.

describe('Gegenprobe', () => {
  it('meldet eine Abfrage ohne Mandantenfilter', async () => {
    const { client, aufzeichnung: probe } = erstelleAufzeichnendenClient({
      invoices: [{ id: 'x', organization_id: ORG_FREMD }],
    })
    const c = client as { from: (t: string) => { select: (s: string) => { eq: (a: string, b: unknown) => unknown } } }
    await (c.from('invoices').select('*').eq('status', 'entwurf') as Promise<unknown>)
    expect(probe.tabellenOhneOrgFilter()).toContain('invoices')
    expect(probe.organisationsFilter()).toEqual([])
  })

  it('liefert fremde Zeilen aus, wenn die Route den Mandanten weglaesst', async () => {
    const { client } = erstelleAufzeichnendenClient({
      invoices: [
        { id: RECHNUNG_EIGEN, organization_id: ORG_EIGEN },
        { id: RECHNUNG_FREMD, organization_id: ORG_FREMD },
      ],
    })
    const c = client as { from: (t: string) => { select: (s: string) => Promise<{ data: unknown[] }> } }
    const { data } = await c.from('invoices').select('*')
    expect(data).toHaveLength(2) // ohne Filter kommt alles — genau das faellt oben auf
  })

  it('findet im Sammelrechnungslauf eine Gruppe des eigenen Mandanten', async () => {
    aktuelleRolle = 'buchhaltung'
    const erzeugt = erstelleAufzeichnendenClient({
      service_records: [
        {
          id: 's-eigen', organization_id: ORG_EIGEN, client_id: 'k1', status: 'signed',
          date: '2026-07-05', budget_type: 'entlastungsbetrag', service_type: 'Betreuung',
          amount: 50, proof_status: 'UNTERSCHRIEBEN', signature_hash: 'x',
        },
      ],
      billing_tariffs: [],
    })
    aktuellerClient = erzeugt.client
    aufzeichnung = erzeugt.aufzeichnung

    const antwort = await ROUTEN[1].aufruf('?month=2026-07')
    expect(antwort.status).toBe(200)
    const ergebnis = await antwort.json()
    expect(ergebnis.gruppen).toBe(1)
  })
})
