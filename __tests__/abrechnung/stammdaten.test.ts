// ═══════════════════════════════════════════════════════════════
// Stammdaten-Validierung und -Pflege (Kostenträger, Datenannahmestellen)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest'
import {
  validiereKostentraeger,
  validiereDatenannahmestelle,
  importiereKostentraeger,
  importiereDatenannahmestellen,
  pruefeRouting,
  KASSENARTEN,
} from '@/lib/abrechnung/stammdaten'

// IK 460629986 (Alltagsengel) hat eine korrekte Pruefziffer — als
// Positivbeispiel geeignet. 460629980 ist dieselbe Nummer mit falscher
// Pruefziffer.
const IK_GUELTIG = '460629986'
const IK_FALSCHE_PRUEFZIFFER = '460629980'
const ORG = '00000000-0000-4000-8000-000460629986'

// ── Kostenträger ────────────────────────────────────────────────

describe('validiereKostentraeger', () => {
  const basis = { ik_nummer: IK_GUELTIG, name: 'AOK Hessen', kassenart: 'AO' }

  it('akzeptiert einen vollstaendigen Satz', () => {
    const r = validiereKostentraeger({ ...basis, datenannahmestelle_id: 'das-1' })
    expect(r.ok).toBe(true)
    expect(r.fehler).toEqual([])
  })

  it('weist eine IK mit falscher Pruefziffer ab', () => {
    const r = validiereKostentraeger({ ...basis, ik_nummer: IK_FALSCHE_PRUEFZIFFER })
    expect(r.ok).toBe(false)
    expect(r.fehler.map(f => f.feld)).toContain('ik_nummer')
    expect(r.fehler[0].meldung).toMatch(/Pruefziffer/)
  })

  it.each(['', '12345', '1234567890', 'abcdefghi'])('weist die ungueltige IK "%s" ab', (ik) => {
    expect(validiereKostentraeger({ ...basis, ik_nummer: ik }).ok).toBe(false)
  })

  it('verlangt einen Namen', () => {
    expect(validiereKostentraeger({ ...basis, name: '   ' }).ok).toBe(false)
  })

  it('weist eine unbekannte Kassenart ab und nennt die zulaessigen', () => {
    const r = validiereKostentraeger({ ...basis, kassenart: 'XX' })
    expect(r.ok).toBe(false)
    const meldung = r.fehler.find(f => f.feld === 'kassenart')!.meldung
    for (const art of KASSENARTEN) expect(meldung).toContain(art)
  })

  it('akzeptiert jede dokumentierte Kassenart', () => {
    for (const art of KASSENARTEN) {
      expect(validiereKostentraeger({ ...basis, kassenart: art }).ok).toBe(true)
    }
  })

  it('weist einen Gueltigkeitszeitraum ab, der rueckwaerts laeuft', () => {
    const r = validiereKostentraeger({ ...basis, gueltig_ab: '2026-06-01', gueltig_bis: '2026-01-01' })
    expect(r.ok).toBe(false)
    expect(r.fehler.map(f => f.feld)).toContain('gueltig_bis')
  })

  it('warnt — blockiert aber nicht — ohne zugeordnete Datenannahmestelle', () => {
    const r = validiereKostentraeger(basis)
    expect(r.ok).toBe(true)
    expect(r.warnungen.map(w => w.feld)).toContain('datenannahmestelle_id')
  })

  it('weist eine unplausible E-Mail ab', () => {
    expect(validiereKostentraeger({ ...basis, email: 'keine-adresse' }).ok).toBe(false)
  })
})

// ── Datenannahmestellen ─────────────────────────────────────────

describe('validiereDatenannahmestelle', () => {
  const basis = { ik_nummer: IK_GUELTIG, name: 'ITSCare', kassenart: 'AO' }

  it('akzeptiert einen vollstaendigen SFTP-Zugang', () => {
    const r = validiereDatenannahmestelle({ ...basis, sftp_host: 'sftp.example.de', sftp_user: 'ae' })
    expect(r.ok).toBe(true)
  })

  it('weist einen halb konfigurierten SFTP-Zugang ab (Host ohne User)', () => {
    // Halbe Transportkonfiguration ist der haeufigste Grund fuer stille
    // Versandfehler — sie darf gar nicht erst gespeichert werden.
    const r = validiereDatenannahmestelle({ ...basis, sftp_host: 'sftp.example.de' })
    expect(r.ok).toBe(false)
    expect(r.fehler.map(f => f.feld)).toContain('sftp_host')
  })

  it('weist einen halb konfigurierten SFTP-Zugang ab (User ohne Host)', () => {
    expect(validiereDatenannahmestelle({ ...basis, sftp_user: 'ae' }).ok).toBe(false)
  })

  it.each([0, 70000, 1.5])('weist den unzulaessigen Port %s ab', (port) => {
    expect(validiereDatenannahmestelle({ ...basis, sftp_port: port as number }).ok).toBe(false)
  })

  it('weist Zustaendigkeits-IKs mit falscher Pruefziffer ab', () => {
    const r = validiereDatenannahmestelle({ ...basis, zustaendig_fuer: [IK_FALSCHE_PRUEFZIFFER] })
    expect(r.ok).toBe(false)
    expect(r.fehler.map(f => f.feld)).toContain('zustaendig_fuer')
  })

  it('warnt, wenn weder SFTP noch KIM hinterlegt ist', () => {
    const r = validiereDatenannahmestelle(basis)
    expect(r.ok).toBe(true)
    expect(r.warnungen.length).toBeGreaterThan(0)
  })

  it('weist einen Host mit Sonderzeichen ab', () => {
    expect(validiereDatenannahmestelle({ ...basis, sftp_host: 'sftp.example.de; rm -rf /', sftp_user: 'x' }).ok).toBe(false)
  })
})

// ── Massenimport ────────────────────────────────────────────────

function schreibMock() {
  const schreibvorgaenge: string[] = []
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    order: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    single: vi.fn(() => Promise.resolve({ data: { id: 'neu' }, error: null })),
    then: (resolve: any) => resolve({ data: [], error: null }),
  }
  chain.insert = vi.fn(() => { schreibvorgaenge.push('insert'); return chain })
  chain.update = vi.fn(() => { schreibvorgaenge.push('update'); return chain })
  const client = { from: vi.fn(() => chain) }
  return { client: client as any, schreibvorgaenge }
}

describe('Massenimport', () => {
  const gueltig = { ik_nummer: IK_GUELTIG, name: 'AOK', kassenart: 'AO' }
  const ungueltig = { ik_nummer: IK_FALSCHE_PRUEFZIFFER, name: '', kassenart: 'XX' }

  it('schreibt im dryRun nichts, validiert aber jede Zeile', async () => {
    const { client, schreibvorgaenge } = schreibMock()
    const r = await importiereKostentraeger(client, ORG, [gueltig, ungueltig], { dryRun: true })
    expect(schreibvorgaenge).toEqual([])
    expect(r.dryRun).toBe(true)
    expect(r.gesamt).toBe(2)
    expect(r.erfolgreich).toBe(1)
    expect(r.fehlerhaft).toBe(1)
  })

  it('meldet die fehlerhafte Zeile mit ihrer Zeilennummer', async () => {
    const { client } = schreibMock()
    const r = await importiereKostentraeger(client, ORG, [gueltig, ungueltig], { dryRun: true })
    const schlecht = r.zeilen.find(z => !z.ok)!
    expect(schlecht.zeile).toBe(2)
    expect(schlecht.fehler.length).toBeGreaterThan(0)
  })

  it('bricht bei einer fehlerhaften Zeile nicht ab, sondern verarbeitet weiter', async () => {
    const { client } = schreibMock()
    const r = await importiereKostentraeger(client, ORG, [ungueltig, gueltig, ungueltig], { dryRun: true })
    expect(r.gesamt).toBe(3)
    expect(r.zeilen).toHaveLength(3)
    expect(r.erfolgreich).toBe(1)
  })

  it('schreibt ausserhalb des dryRun tatsaechlich', async () => {
    const { client, schreibvorgaenge } = schreibMock()
    await importiereKostentraeger(client, ORG, [gueltig], { dryRun: false })
    expect(schreibvorgaenge).toContain('insert')
  })

  it('gilt genauso fuer Datenannahmestellen', async () => {
    const { client, schreibvorgaenge } = schreibMock()
    const r = await importiereDatenannahmestellen(
      client, ORG,
      [{ ik_nummer: IK_GUELTIG, name: 'ITSCare', kassenart: 'AO' }, { ik_nummer: 'kaputt', name: '', kassenart: '' }],
      { dryRun: true },
    )
    expect(schreibvorgaenge).toEqual([])
    expect(r.erfolgreich).toBe(1)
    expect(r.fehlerhaft).toBe(1)
  })
})

// ── Routing-Prüfung ─────────────────────────────────────────────

function routingMock(kostentraeger: any[], annahmestellen: any[]) {
  const client = {
    from: vi.fn((table: string) => {
      const daten = table === 'dta_kostentraeger' ? kostentraeger : annahmestellen
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        or: vi.fn(() => chain),
        then: (resolve: any) => resolve({ data: daten, error: null }),
      }
      return chain
    }),
  }
  return client as any
}

const DAS_OK = {
  id: 'das-1', ik_nummer: '105810615', name: 'ITSCare', aktiv: true,
  sftp_host: 'sftp.itscare.de', sftp_user: 'ae', kim_adresse: null, zustaendig_fuer: [],
}

describe('pruefeRouting', () => {
  it('meldet ok, wenn jeder Kostentraeger eine erreichbare Annahmestelle hat', async () => {
    const client = routingMock(
      [{ id: 'k1', ik_nummer: IK_GUELTIG, name: 'AOK', abrechnungsweg: 'dta', datenannahmestelle_id: 'das-1', ist_aktiv: true }],
      [DAS_OK],
    )
    const r = await pruefeRouting(client, ORG)
    expect(r.ok).toBe(true)
    expect(r.kostentraegerMitRouting).toBe(1)
    expect(r.luecken).toEqual([])
  })

  it('meldet eine Luecke ohne zugeordnete Annahmestelle', async () => {
    const client = routingMock(
      [{ id: 'k1', ik_nummer: IK_GUELTIG, name: 'AOK', abrechnungsweg: 'dta', datenannahmestelle_id: null, ist_aktiv: true }],
      [DAS_OK],
    )
    const r = await pruefeRouting(client, ORG)
    expect(r.ok).toBe(false)
    expect(r.luecken[0].grund).toMatch(/Keine Datenannahmestelle/)
  })

  it('meldet eine Luecke, wenn die Annahmestelle inaktiv ist', async () => {
    const client = routingMock(
      [{ id: 'k1', ik_nummer: IK_GUELTIG, name: 'AOK', abrechnungsweg: 'dta', datenannahmestelle_id: 'das-1', ist_aktiv: true }],
      [{ ...DAS_OK, aktiv: false }],
    )
    const r = await pruefeRouting(client, ORG)
    expect(r.ok).toBe(false)
    expect(r.luecken[0].grund).toMatch(/inaktiv/)
  })

  it('meldet eine Luecke ohne vollstaendigen Transportweg', async () => {
    const client = routingMock(
      [{ id: 'k1', ik_nummer: IK_GUELTIG, name: 'AOK', abrechnungsweg: 'dta', datenannahmestelle_id: 'das-1', ist_aktiv: true }],
      [{ ...DAS_OK, sftp_host: null, sftp_user: null, kim_adresse: null }],
    )
    const r = await pruefeRouting(client, ORG)
    expect(r.ok).toBe(false)
    expect(r.luecken[0].grund).toMatch(/Transportweg/)
  })

  it('loest ueber zustaendig_fuer auf, wenn keine direkte Zuordnung besteht', async () => {
    const client = routingMock(
      [{ id: 'k1', ik_nummer: IK_GUELTIG, name: 'AOK', abrechnungsweg: 'dta', datenannahmestelle_id: null, ist_aktiv: true }],
      [{ ...DAS_OK, zustaendig_fuer: [IK_GUELTIG] }],
    )
    const r = await pruefeRouting(client, ORG)
    expect(r.ok).toBe(true)
  })

  it('meldet Mehrdeutigkeit, wenn zwei Annahmestellen dieselbe IK beanspruchen', async () => {
    const client = routingMock(
      [{ id: 'k1', ik_nummer: IK_GUELTIG, name: 'AOK', abrechnungsweg: 'dta', datenannahmestelle_id: null, ist_aktiv: true }],
      [
        { ...DAS_OK, id: 'das-1', zustaendig_fuer: [IK_GUELTIG] },
        { ...DAS_OK, id: 'das-2', name: 'Zweite', zustaendig_fuer: [IK_GUELTIG] },
      ],
    )
    const r = await pruefeRouting(client, ORG)
    expect(r.ok).toBe(false)
    expect(r.luecken[0].grund).toMatch(/Mehrdeutig/)
  })

  it('ignoriert Kostentraeger, die nicht per DTA abrechnen', async () => {
    const client = routingMock(
      [{ id: 'k1', ik_nummer: IK_GUELTIG, name: 'Privat', abrechnungsweg: 'papier', datenannahmestelle_id: null, ist_aktiv: true }],
      [DAS_OK],
    )
    const r = await pruefeRouting(client, ORG)
    expect(r.ok).toBe(true)
    expect(r.luecken).toEqual([])
  })
})
