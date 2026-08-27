// ═══════════════════════════════════════════════════════════════════════
// Tarif-Verifizierungs-Service (lib/billing/tarif-verifizierung-service.ts)
//
// Der Freigabeprozess für BEIDE Preistabellen läuft durch dieses eine
// Modul. Was es entscheidet, entscheidet darüber, welcher Preis abgerechnet
// werden darf — und der Weg dorthin läuft über den Admin-Client, der RLS
// umgeht. Die Mandantentrennung steht hier also im Filter, nicht in der
// Datenbank.
//
// Der Testbestand kannte das Modul bisher nur als Quelltext: drei Suiten
// lesen die Datei und greppen darin (rollenkonzept-zugriffe,
// tarif-belegpflicht, fail-closed-invoice). Kein einziger Aufruf.
//
// Diese Suite prüft das Verhalten — vor allem die Fälle, die still
// danebengehen könnten:
//
//   · Freigabe mit einem Beleg, der einem ANDEREN Mandanten gehört
//   · Freigabe mit einem Beleg, der zu einer anderen Zeile gehört
//   · Rücknahme einer Freigabe, bei der die Belegzuordnung stehen bliebe
//   · Org-Fence in beiden Ausprägungen (billing_tariffs mit deleted_at,
//     leistungspreise mit NULL-Organisation aus dem Altbestand)
//   · die Meldung des DB-Triggers, die den Admin erreichen muss
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf, type FakeSupabase } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const FREMDE_ORG = '00000000-0000-4000-8000-000000000999'
const USER = '00000000-0000-4000-8000-00000000a001'
const TARIF_ID = '11111111-1111-4111-8111-111111111111'
const BELEG_ID = '22222222-2222-4222-8222-222222222222'
const QUELLE = 'Vergütungsvereinbarung AOK Hessen vom 01.03.2026'

const requireOpsAdmin = vi.fn()
const createAdminClient = vi.fn()
const ladeBelege = vi.fn()
const signiereBeleg = vi.fn()

vi.mock('@/lib/ops/api-auth', () => ({
  requireOpsAdmin: (...a: unknown[]) => requireOpsAdmin(...a),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClient(),
}))
vi.mock('@/lib/billing/core/tarif-belege', async (importOriginal) => ({
  // istMigrationFehlt / MIGRATION_FEHLT_TEXT bleiben echt.
  ...(await importOriginal<typeof import('@/lib/billing/core/tarif-belege')>()),
  ladeBelege: (...a: unknown[]) => ladeBelege(...a),
  signiereBeleg: (...a: unknown[]) => signiereBeleg(...a),
}))

const { handleVerifizierungPatch, handleDetailGet, PROFIL } =
  await import('@/lib/billing/tarif-verifizierung-service')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ZEILE_KASSE = {
  id: TARIF_ID,
  organization_id: ORG,
  leistungsart: 'entlastung',
  rechtsgrundlage: '45b',
  tarif_status: 'unverified',
  preis_cent: 3500,
  beleg_id: null,
  deleted_at: null,
}

const BELEG_ZEILE = {
  id: BELEG_ID,
  organization_id: ORG,
  quell_tabelle: 'billing_tariffs',
  tariff_id: TARIF_ID,
  leistungspreis_id: null,
}

function anfrage(body: unknown): Request {
  return new Request('https://alltagsengel.care/api/billing/tariffs/x/verifizierung', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Baut den Doppelgänger und hängt ihn an createAdminClient.
 * `ueberschreibung` beantwortet einzelne Tabellen abweichend.
 */
function mitDb(ueberschreibung: (a: FakeAufruf) => ReturnType<typeof Object> | undefined = () => undefined): FakeSupabase {
  const fake = erstelleFakeSupabase(a => {
    const eigen = ueberschreibung(a) as { data?: unknown; error?: unknown } | undefined
    if (eigen !== undefined) return eigen as never
    if (a.tabelle === 'billing_tariffs' || a.tabelle === 'leistungspreise') {
      if (a.operation === 'update') return { data: { ...ZEILE_KASSE, tarif_status: 'verified' } }
      return { data: ZEILE_KASSE }
    }
    if (a.tabelle === 'billing_tarif_belege') return { data: BELEG_ZEILE }
    if (a.tabelle === 'billing_tariff_audit') return { data: [] }
    return { data: null }
  })
  createAdminClient.mockReturnValue(fake.client)
  return fake
}

const koerper = (antwort: Response) => antwort.json()

beforeEach(() => {
  requireOpsAdmin.mockReset().mockResolvedValue({
    ok: true,
    ctx: { userId: USER, organizationId: ORG, role: 'admin', name: 'Testadmin' },
  })
  createAdminClient.mockReset()
  ladeBelege.mockReset().mockResolvedValue([])
  signiereBeleg.mockReset().mockResolvedValue('https://signiert.example/beleg')
})

// ═══════════════════════════════════════════════════════════════════════
// Berechtigung
// ═══════════════════════════════════════════════════════════════════════

describe('handleVerifizierungPatch — Berechtigung', () => {
  it('verlangt tarife.schreiben und reicht die Abweisung unverändert durch', async () => {
    const { NextResponse } = await import('next/server')
    requireOpsAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 }),
    })
    const fake = mitDb()

    const antwort = await handleVerifizierungPatch(
      anfrage({ status: 'verified', quelle: QUELLE, belegId: BELEG_ID }), 'billing_tariffs', TARIF_ID)

    expect(antwort.status).toBe(403)
    expect(requireOpsAdmin).toHaveBeenCalledWith('tarife.schreiben')
    // Kein DB-Zugriff nach der Abweisung.
    expect(fake.aufrufe).toEqual([])
  })

  it('handleDetailGet verlangt nur tarife.lesen', async () => {
    mitDb()
    await handleDetailGet('billing_tariffs', TARIF_ID)
    expect(requireOpsAdmin).toHaveBeenCalledWith('tarife.lesen')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Mandanten-Fence beim Laden
// ═══════════════════════════════════════════════════════════════════════

describe('Org-Fence — der Admin-Client umgeht RLS, der Filter muss ihn ersetzen', () => {
  it('billing_tariffs: harter eq-Fence auf die eigene Organisation', async () => {
    const fake = mitDb()
    await handleVerifizierungPatch(anfrage({ status: 'verified', quelle: QUELLE, belegId: BELEG_ID }), 'billing_tariffs', TARIF_ID)

    const laden = fake.ersterAuf('billing_tariffs', 'select')
    expect(hatFilter(laden, 'eq', 'id', TARIF_ID)).toBe(true)
    expect(hatFilter(laden, 'eq', 'organization_id', ORG)).toBe(true)
  })

  it('leistungspreise: eigene Organisation ODER NULL (Altbestand vor Multi-Mandant)', async () => {
    const fake = mitDb()
    await handleVerifizierungPatch(anfrage({ status: 'verified', quelle: QUELLE }), 'leistungspreise', TARIF_ID)

    const laden = fake.ersterAuf('leistungspreise', 'select')
    const orFilter = laden?.filter.find(f => f.methode === 'or')
    // Der Filter darf NICHT auf "alle" aufweichen — die eigene Org muss drinstehen.
    expect(orFilter?.spalte).toBe(`organization_id.eq.${ORG},organization_id.is.null`)
  })

  it('holt für leistungspreise keine Spalten, die es dort nicht gibt', async () => {
    // deleted_at und rechtsgrundlage fehlen dieser Tabelle — eine Abfrage
    // damit würde live mit 42703 komplett scheitern und wie "nicht
    // gefunden" aussehen.
    const fake = mitDb()
    await handleVerifizierungPatch(anfrage({ status: 'unverified', quelle: QUELLE }), 'leistungspreise', TARIF_ID)

    const spalten = fake.ersterAuf('leistungspreise', 'select')?.spalten ?? ''
    expect(spalten).not.toContain('deleted_at')
    expect(spalten).not.toContain('rechtsgrundlage')
    expect(spalten).toContain('tarif_status')
  })

  it('meldet 404, wenn der Fence nichts durchlässt', async () => {
    const fake = mitDb(a => (a.tabelle === 'billing_tariffs' && a.operation === 'select' ? { data: null } : undefined))
    const antwort = await handleVerifizierungPatch(anfrage({ status: 'verified', quelle: QUELLE, belegId: BELEG_ID }), 'billing_tariffs', TARIF_ID)

    expect(antwort.status).toBe(404)
    expect(fake.auf('billing_tariffs').some(a => a.operation === 'update')).toBe(false)
  })

  it('lehnt eine gelöschte Zeile ab, statt sie freizugeben', async () => {
    mitDb(a => (a.tabelle === 'billing_tariffs' && a.operation === 'select'
      ? { data: { ...ZEILE_KASSE, deleted_at: '2026-08-01T00:00:00Z' } }
      : undefined))

    const antwort = await handleVerifizierungPatch(anfrage({ status: 'verified', quelle: QUELLE, belegId: BELEG_ID }), 'billing_tariffs', TARIF_ID)
    expect(antwort.status).toBe(400)
    expect((await koerper(antwort)).error).toMatch(/gelöscht/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Belegprüfung — hier sitzt der Cross-Tenant-Fall
// ═══════════════════════════════════════════════════════════════════════

describe('Belegprüfung bei der Freigabe', () => {
  it('lehnt einen Beleg ab, der zu einer ANDEREN Organisation gehört (403)', async () => {
    const fake = mitDb(a => (a.tabelle === 'billing_tarif_belege'
      ? { data: { ...BELEG_ZEILE, organization_id: FREMDE_ORG } }
      : undefined))

    const antwort = await handleVerifizierungPatch(
      anfrage({ status: 'verified', quelle: QUELLE, belegId: BELEG_ID }), 'billing_tariffs', TARIF_ID)

    expect(antwort.status).toBe(403)
    expect((await koerper(antwort)).error).toMatch(/andere.? Organisation/i)
    // Entscheidend: der Tarif bleibt unverändert.
    expect(fake.auf('billing_tariffs').some(a => a.operation === 'update')).toBe(false)
  })

  it('sucht den Beleg mit Zeilen-, Tabellen- und ID-Bezug', async () => {
    const fake = mitDb()
    await handleVerifizierungPatch(anfrage({ status: 'verified', quelle: QUELLE, belegId: BELEG_ID }), 'billing_tariffs', TARIF_ID)

    const belegAbfrage = fake.ersterAuf('billing_tarif_belege', 'select')
    expect(hatFilter(belegAbfrage, 'eq', 'id', BELEG_ID)).toBe(true)
    expect(hatFilter(belegAbfrage, 'eq', 'quell_tabelle', 'billing_tariffs')).toBe(true)
    expect(hatFilter(belegAbfrage, 'eq', 'tariff_id', TARIF_ID)).toBe(true)
  })

  it('nutzt für leistungspreise die andere Belegspalte', async () => {
    const fake = mitDb(a => (a.tabelle === 'leistungspreise' && a.operation === 'select'
      ? { data: { ...ZEILE_KASSE, rechtsgrundlage: undefined } }
      : undefined))
    await handleVerifizierungPatch(anfrage({ status: 'verified', quelle: QUELLE, belegId: BELEG_ID }), 'leistungspreise', TARIF_ID)

    const belegAbfrage = fake.ersterAuf('billing_tarif_belege', 'select')
    expect(hatFilter(belegAbfrage, 'eq', 'leistungspreis_id', TARIF_ID)).toBe(true)
    expect(hatFilter(belegAbfrage, 'eq', 'tariff_id', TARIF_ID)).toBe(false)
  })

  it('lehnt einen Beleg ab, der zu diesem Tarif gar nicht existiert (400)', async () => {
    const fake = mitDb(a => (a.tabelle === 'billing_tarif_belege' ? { data: null } : undefined))

    const antwort = await handleVerifizierungPatch(
      anfrage({ status: 'verified', quelle: QUELLE, belegId: BELEG_ID }), 'billing_tariffs', TARIF_ID)

    expect(antwort.status).toBe(400)
    expect((await koerper(antwort)).error).toMatch(/gehört nicht zu diesem/)
    expect(fake.auf('billing_tariffs').some(a => a.operation === 'update')).toBe(false)
  })

  it('verlangt für einen Kassentarif überhaupt einen Beleg', async () => {
    const fake = mitDb()
    const antwort = await handleVerifizierungPatch(
      anfrage({ status: 'verified', quelle: QUELLE }), 'billing_tariffs', TARIF_ID)

    expect(antwort.status).toBe(400)
    expect((await koerper(antwort)).error).toMatch(/Primärbeleg/)
    expect(fake.auf('billing_tariffs').some(a => a.operation === 'update')).toBe(false)
  })

  it('lässt einen Privattarif ohne Beleg zu (Preise sind dort frei wählbar)', async () => {
    const fake = mitDb(a => (a.tabelle === 'billing_tariffs' && a.operation === 'select'
      ? { data: { ...ZEILE_KASSE, rechtsgrundlage: 'privat' } }
      : undefined))

    const antwort = await handleVerifizierungPatch(
      anfrage({ status: 'verified', quelle: QUELLE }), 'billing_tariffs', TARIF_ID)

    expect(antwort.status).toBe(200)
    expect(fake.auf('billing_tariffs').some(a => a.operation === 'update')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Was tatsächlich geschrieben wird
// ═══════════════════════════════════════════════════════════════════════

describe('Statusänderung — der geschriebene Datensatz', () => {
  it('setzt Status, Quelle, Zeitpunkt und den handelnden Menschen', async () => {
    const fake = mitDb()
    await handleVerifizierungPatch(anfrage({ status: 'verified', quelle: QUELLE, belegId: BELEG_ID }), 'billing_tariffs', TARIF_ID)

    const nutzlast = fake.auf('billing_tariffs').find(a => a.operation === 'update')!.payload as Record<string, unknown>
    expect(nutzlast.tarif_status).toBe('verified')
    expect(nutzlast.verifizierungs_quelle).toBe(QUELLE)
    expect(nutzlast.beleg_id).toBe(BELEG_ID)
    expect(String(nutzlast.verifiziert_von)).toContain(USER)
    expect(String(nutzlast.verifiziert_am)).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('löst die Belegzuordnung, wenn die Freigabe zurückgenommen wird', async () => {
    // Sonst sähe ein zurückgenommener Tarif so aus, als trage ihn noch ein
    // gültiger Nachweis.
    const fake = mitDb()
    await handleVerifizierungPatch(anfrage({ status: 'unverified', quelle: QUELLE }), 'billing_tariffs', TARIF_ID)

    const nutzlast = fake.auf('billing_tariffs').find(a => a.operation === 'update')!.payload as Record<string, unknown>
    expect(nutzlast.tarif_status).toBe('unverified')
    expect(nutzlast.beleg_id).toBeNull()
  })

  it('löst die Belegzuordnung auch beim Sperren', async () => {
    const fake = mitDb()
    await handleVerifizierungPatch(anfrage({ status: 'blocked', quelle: 'Vertrag gekündigt zum 30.06.2026' }), 'billing_tariffs', TARIF_ID)

    const nutzlast = fake.auf('billing_tariffs').find(a => a.operation === 'update')!.payload as Record<string, unknown>
    expect(nutzlast.beleg_id).toBeNull()
  })

  it('schreibt mit demselben Org-Fence wie beim Lesen', async () => {
    const fake = mitDb()
    await handleVerifizierungPatch(anfrage({ status: 'verified', quelle: QUELLE, belegId: BELEG_ID }), 'billing_tariffs', TARIF_ID)

    const update = fake.auf('billing_tariffs').find(a => a.operation === 'update')
    expect(hatFilter(update, 'eq', 'id', TARIF_ID)).toBe(true)
    expect(hatFilter(update, 'eq', 'organization_id', ORG)).toBe(true)
  })

  it('meldet den vorherigen Status und die Abrechenbarkeit zurück', async () => {
    mitDb()
    const antwort = await handleVerifizierungPatch(anfrage({ status: 'verified', quelle: QUELLE, belegId: BELEG_ID }), 'billing_tariffs', TARIF_ID)
    const inhalt = await koerper(antwort)

    expect(antwort.status).toBe(200)
    expect(inhalt.vorherigerStatus).toBe('unverified')
    expect(inhalt.quellTabelle).toBe('billing_tariffs')
    expect(inhalt.abrechenbar).toBeDefined()
  })
})

describe('Statusänderung — abgelehnte Eingaben', () => {
  const faelle: Array<[string, Record<string, unknown>]> = [
    ['unbekannter Status', { status: 'freigegeben', quelle: QUELLE }],
    ['Status fehlt', { quelle: QUELLE }],
    ['Quelle zu kurz', { status: 'verified', quelle: 'ok', belegId: BELEG_ID }],
    ['Beleg an einem Nicht-verified-Status', { status: 'blocked', quelle: 'Vertrag gekündigt zum 30.06.2026', belegId: BELEG_ID }],
  ]

  for (const [bezeichnung, body] of faelle) {
    it(`weist ab und schreibt nichts: ${bezeichnung}`, async () => {
      const fake = mitDb()
      const antwort = await handleVerifizierungPatch(anfrage(body), 'billing_tariffs', TARIF_ID)

      expect(antwort.status, bezeichnung).toBe(400)
      expect(fake.auf('billing_tariffs').some(a => a.operation === 'update')).toBe(false)
    })
  }

  it('verträgt einen kaputten Body ohne 500er', async () => {
    mitDb()
    const kaputt = new Request('https://alltagsengel.care/x', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: 'kein json',
    })
    const antwort = await handleVerifizierungPatch(kaputt, 'billing_tariffs', TARIF_ID)
    expect(antwort.status).toBe(400)
  })
})

describe('Statusänderung — Fehler aus der Datenbank', () => {
  it('reicht die Meldung des Belegpflicht-Triggers an den Admin durch', async () => {
    // Der Trigger (20260904000000) ist die zweite, nicht umgehbare Ebene.
    // Sein Satz muss ankommen, sonst steht der Admin vor einem 500er ohne
    // Hinweis, was fehlt.
    mitDb(a => (a.tabelle === 'billing_tariffs' && a.operation === 'update'
      ? { error: { message: 'Freigabe abgelehnt: kein Primärbeleg verknüpft.' } }
      : undefined))

    const antwort = await handleVerifizierungPatch(anfrage({ status: 'verified', quelle: QUELLE, belegId: BELEG_ID }), 'billing_tariffs', TARIF_ID)
    expect(antwort.status).toBe(400)
    expect((await koerper(antwort)).error).toMatch(/Freigabe abgelehnt/)
  })

  it('meldet eine fehlende Migration als 503, nicht als 500', async () => {
    mitDb(a => (a.tabelle === 'billing_tariffs' && a.operation === 'select'
      ? { error: { message: 'column billing_tariffs.beleg_id does not exist', code: '42703' } }
      : undefined))

    const antwort = await handleVerifizierungPatch(anfrage({ status: 'verified', quelle: QUELLE, belegId: BELEG_ID }), 'billing_tariffs', TARIF_ID)
    expect(antwort.status).toBe(503)
  })

  it('gibt bei einem sonstigen DB-Fehler keine Interna preis', async () => {
    mitDb(a => (a.tabelle === 'billing_tariffs' && a.operation === 'update'
      ? { error: { message: 'permission denied for relation billing_tariffs' } }
      : undefined))

    const antwort = await handleVerifizierungPatch(anfrage({ status: 'verified', quelle: QUELLE, belegId: BELEG_ID }), 'billing_tariffs', TARIF_ID)
    expect(antwort.status).toBe(500)
    expect(JSON.stringify(await koerper(antwort))).not.toContain('permission denied')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Detailansicht
// ═══════════════════════════════════════════════════════════════════════

describe('handleDetailGet', () => {
  it('liest die Historie über die tabellenrichtige Audit-Spalte', async () => {
    const fake = mitDb()
    await handleDetailGet('leistungspreise', TARIF_ID)

    const audit = fake.ersterAuf('billing_tariff_audit', 'select')
    expect(hatFilter(audit, 'eq', 'leistungspreis_id', TARIF_ID)).toBe(true)
    expect(PROFIL.leistungspreise.audit_spalte).toBe('leistungspreis_id')
  })

  it('liefert die Historie ohne Belegbezug, wenn die Migration fehlt', async () => {
    // Reduzierte Ansicht ist mehr wert als gar keine — aber sie darf nicht
    // still leer aussehen.
    let ersterVersuch = true
    const fake = mitDb(a => {
      if (a.tabelle !== 'billing_tariff_audit') return undefined
      if (ersterVersuch) { ersterVersuch = false; return { error: { message: 'column beleg_id does not exist' } } }
      return { data: [{ id: 'a1', aktion: 'status_geaendert', alter_status: 'unverified', neuer_status: 'verified', alter_betrag_cent: null, neuer_betrag_cent: null, benutzer: 'Testadmin', quelle: QUELLE, created_at: '2026-08-01T10:00:00Z' }] }
    })

    const antwort = await handleDetailGet('billing_tariffs', TARIF_ID)
    const inhalt = await koerper(antwort)

    expect(antwort.status).toBe(200)
    expect(inhalt.historie).toHaveLength(1)
    expect(inhalt.historie[0].beleg_id).toBeNull()
    expect(fake.auf('billing_tariff_audit')).toHaveLength(2)
  })

  it('meldet ein Belegproblem als Hinweis, statt die ganze Ansicht scheitern zu lassen', async () => {
    mitDb()
    ladeBelege.mockRejectedValue(new Error('Beleg-Tabelle fehlt'))

    const antwort = await handleDetailGet('billing_tariffs', TARIF_ID)
    const inhalt = await koerper(antwort)

    expect(antwort.status).toBe(200)
    expect(inhalt.belege).toEqual([])
    expect(inhalt.belegHinweis).toBe('Beleg-Tabelle fehlt')
  })

  it('signiert jeden Beleg einzeln und gibt keine rohen Speicherpfade heraus', async () => {
    mitDb()
    ladeBelege.mockResolvedValue([
      { id: BELEG_ID, dateiname: 'verguetungsvereinbarung.pdf', mime_type: 'application/pdf', groesse_bytes: 1234, sha256: 'abc', quelle: QUELLE, hochgeladen_von: 'Testadmin', hochgeladen_am: '2026-08-01T10:00:00Z', pfad: `tarif-belege/${ORG}/geheim.pdf` },
    ])

    const inhalt = await koerper(await handleDetailGet('billing_tariffs', TARIF_ID))

    expect(signiereBeleg).toHaveBeenCalledTimes(1)
    expect(inhalt.belege[0].url).toBe('https://signiert.example/beleg')
    expect(JSON.stringify(inhalt.belege)).not.toContain('geheim.pdf')
  })

  it('lädt die Belege mit Mandantenbezug', async () => {
    mitDb()
    await handleDetailGet('billing_tariffs', TARIF_ID)
    expect(ladeBelege.mock.calls[0][1]).toMatchObject({
      organizationId: ORG, quellTabelle: 'billing_tariffs', zeilenId: TARIF_ID,
    })
  })
})
