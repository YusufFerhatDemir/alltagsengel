/**
 * Das Aktenmodul gibt keine Personalakten an jemanden heraus, der sie nicht
 * sehen darf.
 *
 * ── DER BEFUND (29.08.2026) ──────────────────────────────────────────
 * Fünf lesende Routen des Aktenmoduls verlangen `stammdaten.lesen` und
 * liefern dabei Klienten- UND Mitarbeiterunterlagen in derselben Antwort:
 *
 *   GET /api/akten/dokumente          Dokumentenliste
 *   GET /api/akten/dokumente/[id]     einzelnes Dokument
 *   GET /api/akten/suche              Volltextsuche
 *   GET /api/akten/vertraege          Vertragsliste
 *   GET /api/akten/ablauf             Ablaufwarnungen
 *
 * Die Rolle `buchhaltung` hat genau `stammdaten.lesen` und ausdrücklich
 * NICHT `personal.lesen`. `lib/auth/rollen.ts` hält den Grund wörtlich
 * fest: sie „braucht die Klienten-Stammdaten als Rechnungsempfaenger …
 * aber KEINE Gesundheitsdaten und keine Personalakten."
 *
 * Dieselbe Rolle bekommt `/admin/mitarbeiterakte` verwehrt — die Seite
 * steht in `BEREICHE` auf `personal.lesen`. Es gab also zwei Wege zum
 * selben Bestand mit zwei verschiedenen Antworten, und der offenere war
 * der bequemere: `/admin/dokumente` steht in der Navigation unter
 * „Klienten & Pflege". Führungszeugnis, Arbeitsvertrag und
 * Qualifikationsnachweise waren einen Klick entfernt.
 *
 * Die Routen fahren mit `createAdminClient()` — RLS sieht sie nie. Der
 * Riegel ist die Route, sonst nichts.
 *
 * ── WIE ABGEGRENZT WIRD ──────────────────────────────────────────────
 * Am `caregiver_id` der Zeile, NICHT am Dokumenttyp. Welcher Typ
 * personenbezogen ist, ist Auslegung — an welcher Akte ein Dokument hängt,
 * steht in der Zeile. Auf den Listen wirkt das als Filter, beim Zugriff
 * über die Id als Prüfung an der geladenen Zeile: eine Id kennt man auch
 * ohne Liste.
 *
 * Geprüft wird jeder Handler im LAUF. Dass eine Einschränkung im Code
 * steht, sagt nichts darüber, ob sie an der Abfrage ankommt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ORG = '11111111-1111-4111-8111-111111111111'
const CG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

/** Steuert, ob der Aufrufer `personal.lesen` hat. */
let darfPersonal = false
/** Was die jeweilige Lesefunktion tatsächlich übergeben bekam. */
let zuletzt: Record<string, unknown> | null = null
/** Das Dokument, das `getDokument` liefert. */
let dokumentZeile: Record<string, unknown> | null = null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({}) as never),
}))

vi.mock('@/lib/akten/api-auth', () => ({
  requireAktenAdmin: vi.fn(async () => ({
    ok: true as const,
    ctx: {
      userId: 'u-1',
      organizationId: ORG,
      role: darfPersonal ? 'pdl' : 'buchhaltung',
      darf: (b: string) => (b === 'personal.lesen' ? darfPersonal : true),
    },
  })),
  requireAktenUser: vi.fn(async () => ({ ok: true as const, userId: 'u-1' })),
}))

vi.mock('@/lib/akten/dokumente', () => ({
  listDokumente: vi.fn(async (_s: unknown, f: Record<string, unknown>) => { zuletzt = f; return [] }),
  getDokument: vi.fn(async () => dokumentZeile),
  createDokument: vi.fn(),
  updateDokument: vi.fn(),
  softDeleteDokument: vi.fn(),
  uploadDokumentDatei: vi.fn(),
}))

vi.mock('@/lib/akten/suche', () => ({
  sucheDokumente: vi.fn(async (_s: unknown, f: Record<string, unknown>) => { zuletzt = f; return [] }),
}))

vi.mock('@/lib/akten/vertraege', () => ({
  listVertraege: vi.fn(async (_s: unknown, f: Record<string, unknown>) => { zuletzt = f; return [] }),
  createVertrag: vi.fn(),
}))

vi.mock('@/lib/akten/ablauf-warnungen', () => ({
  getAblaufDashboard: vi.fn(async (_s: unknown, f: Record<string, unknown>) => { zuletzt = f; return [] }),
  getKundenakteUebersicht: vi.fn(async () => []),
  getMitarbeiterakteUebersicht: vi.fn(async () => [{ abgelaufene_dokumente: 3 }]),
}))

vi.mock('@/lib/akten/zugriff-log', () => ({
  logAktenZugriff: vi.fn(async () => {}),
}))

vi.mock('@/lib/akten/zuordnung-guard', () => ({
  assertZuordnungInOrg: vi.fn(async () => {}),
}))

const { GET: dokumenteGET } = await import('@/app/api/akten/dokumente/route')
const { GET: sucheGET } = await import('@/app/api/akten/suche/route')
const { GET: vertraegeGET } = await import('@/app/api/akten/vertraege/route')
const { GET: ablaufGET } = await import('@/app/api/akten/ablauf/route')
const { GET: einzelGET } = await import('@/app/api/akten/dokumente/[id]/route')

const anfrage = (pfad: string, query = '') =>
  new Request(`http://localhost${pfad}${query}`)

beforeEach(() => {
  zuletzt = null
  darfPersonal = false
  dokumentZeile = null
})

/**
 * Die vier Listen-Routen verhalten sich gleich und werden gleich geprüft.
 * Jede trägt ihren eigenen Handler und ihren eigenen Fehlertext.
 */
const LISTEN = [
  { name: 'dokumente', pfad: '/api/akten/dokumente', handler: dokumenteGET },
  { name: 'suche', pfad: '/api/akten/suche', handler: sucheGET },
  { name: 'vertraege', pfad: '/api/akten/vertraege', handler: vertraegeGET },
  { name: 'ablauf', pfad: '/api/akten/ablauf', handler: ablaufGET },
] as const

describe.each(LISTEN)('GET $pfad — ohne personal.lesen', (fall) => {
  it('klammert Mitarbeiterunterlagen aus', async () => {
    const res = await fall.handler(anfrage(fall.pfad) as never)
    expect(res.status).toBe(200)
    expect(zuletzt!.ohnePersonaldokumente).toBe(true)
  })

  it('weist einen ausdrücklichen Mitarbeiter-Filter ab, statt leer zu antworten', async () => {
    // Eine leere Liste wäre eine Aussage über den Bestand („zu diesem
    // Mitarbeiter gibt es nichts") — und die wäre falsch. Wer nicht darf,
    // soll das erfahren.
    const res = await fall.handler(anfrage(fall.pfad, `?caregiverId=${CG}`) as never)
    expect(res.status).toBe(403)
    expect(zuletzt, 'Es darf gar nicht erst abgefragt worden sein').toBeNull()
  })

  it('lässt den Mandanten nicht aus der Adresszeile bestimmen', async () => {
    await fall.handler(anfrage(fall.pfad, '?organizationId=fremde-org') as never)
    expect(zuletzt!.organizationId).toBe(ORG)
  })
})

describe.each(LISTEN)('GET $pfad — mit personal.lesen', (fall) => {
  beforeEach(() => { darfPersonal = true })

  it('klammert nichts aus', async () => {
    const res = await fall.handler(anfrage(fall.pfad) as never)
    expect(res.status).toBe(200)
    // Ausdrücklich `false`, nicht `undefined`: an der Aufrufstelle soll
    // sichtbar bleiben, dass die Frage gestellt wurde.
    expect(zuletzt!.ohnePersonaldokumente).toBe(false)
  })

  it('nimmt den Mitarbeiter-Filter an', async () => {
    const res = await fall.handler(anfrage(fall.pfad, `?caregiverId=${CG}`) as never)
    expect(res.status).toBe(200)
    expect(zuletzt!.caregiverId).toBe(CG)
  })
})

describe('GET /api/akten/dokumente/[id] — die Prüfung hängt an der Zeile', () => {
  const params = Promise.resolve({ id: 'dok-1' })

  it('gibt ein Mitarbeiterdokument nicht heraus', async () => {
    // Der Grund für die Prüfung an der Zeile statt am Filter: eine Id
    // kennt man auch ohne Liste, etwa aus einem Verweis.
    dokumentZeile = { id: 'dok-1', caregiver_id: CG, client_id: null, titel: 'Führungszeugnis' }
    const res = await einzelGET(anfrage('/api/akten/dokumente/dok-1') as never, { params } as never)
    expect(res.status).toBe(403)
  })

  it('meldet 403 und nicht 404 — es existiert ja', async () => {
    // Ein 404 würde behaupten, das Dokument gebe es nicht. Dass es das
    // gibt, verrät die Id ohnehin; eine Falschaussage löst später niemand
    // mehr auf.
    dokumentZeile = { id: 'dok-1', caregiver_id: CG, client_id: null }
    const res = await einzelGET(anfrage('/api/akten/dokumente/dok-1') as never, { params } as never)
    expect(res.status).not.toBe(404)
    expect(await res.json()).toHaveProperty('error')
  })

  it('gibt ein Klientendokument heraus', async () => {
    dokumentZeile = { id: 'dok-1', caregiver_id: null, client_id: 'kl-1', titel: 'Pflegevertrag' }
    const res = await einzelGET(anfrage('/api/akten/dokumente/dok-1') as never, { params } as never)
    expect(res.status).toBe(200)
  })

  it('gibt mit personal.lesen auch das Mitarbeiterdokument heraus', async () => {
    darfPersonal = true
    dokumentZeile = { id: 'dok-1', caregiver_id: CG, client_id: null }
    const res = await einzelGET(anfrage('/api/akten/dokumente/dok-1') as never, { params } as never)
    expect(res.status).toBe(200)
  })

  it('bleibt bei einem unbekannten Dokument bei 404', async () => {
    dokumentZeile = null
    const res = await einzelGET(anfrage('/api/akten/dokumente/dok-1') as never, { params } as never)
    expect(res.status).toBe(404)
  })
})

describe('GET /api/akten/ablauf — die Mitarbeiterübersicht', () => {
  it('wird ohne personal.lesen gar nicht erst geladen', async () => {
    const res = await ablaufGET(anfrage('/api/akten/ablauf') as never)
    const body = await res.json()
    // `null`, NICHT `[]`: eine leere Liste hieße „keine Mitarbeiterakte mit
    // abgelaufenen Dokumenten" — eine Entwarnung, die hier niemand geben kann.
    expect(body.mitarbeiterakten).toBeNull()
    expect(body.zusammenfassung.mitarbeiterakten_mit_abgelaufenen).toBeNull()
  })

  it('wird mit personal.lesen geladen und gezählt', async () => {
    darfPersonal = true
    const res = await ablaufGET(anfrage('/api/akten/ablauf') as never)
    const body = await res.json()
    expect(body.mitarbeiterakten).toHaveLength(1)
    expect(body.zusammenfassung.mitarbeiterakten_mit_abgelaufenen).toBe(1)
  })

  it('zählt die Klientenseite unverändert weiter', async () => {
    // Der Riegel darf die Buchhaltung nicht aus ihrem eigenen Bestand
    // aussperren.
    const res = await ablaufGET(anfrage('/api/akten/ablauf') as never)
    const body = await res.json()
    expect(body.zusammenfassung.kundenakten_mit_abgelaufenen).toBe(0)
    expect(body.kundenakten).toEqual([])
  })
})
