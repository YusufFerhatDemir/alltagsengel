// ═══════════════════════════════════════════════════════════════
// Kassenabrechnungs-Readiness + Zertifikatsbewertung
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { datumBerlin } from '@/lib/utils/timezone'
import { ermittleReadiness } from '@/lib/abrechnung/readiness'
import { bewerteZertifikat, tageBis, ABLAUF_WARNUNG_TAGE } from '@/lib/abrechnung/zertifikate'

const ORG = '00000000-0000-4000-8000-000460629986'
const JETZT = new Date('2026-08-08T12:00:00.000Z')

function inTagen(tage: number): string {
  const d = new Date(JETZT.getTime() + tage * 86_400_000)
  return datumBerlin(d)
}

// ── Zertifikatsbewertung ────────────────────────────────────────

describe('bewerteZertifikat', () => {
  it('ist gruen weit vor dem Ablauf', () => {
    const r = bewerteZertifikat(inTagen(365), JETZT)
    expect(r.ampel).toBe('gruen')
    expect(r.hinweis).toBeNull()
  })

  it('wird gelb innerhalb der Warnschwelle', () => {
    const r = bewerteZertifikat(inTagen(ABLAUF_WARNUNG_TAGE - 1), JETZT)
    expect(r.ampel).toBe('gelb')
    expect(r.hinweis).toMatch(/Laeuft in/)
  })

  it('ist am Tag der Warnschwelle bereits gelb', () => {
    expect(bewerteZertifikat(inTagen(ABLAUF_WARNUNG_TAGE), JETZT).ampel).toBe('gelb')
  })

  it('ist einen Tag davor noch gruen', () => {
    expect(bewerteZertifikat(inTagen(ABLAUF_WARNUNG_TAGE + 1), JETZT).ampel).toBe('gruen')
  })

  it('ist rot nach dem Ablauf und nennt die Tage seit Ablauf', () => {
    const r = bewerteZertifikat(inTagen(-5), JETZT)
    expect(r.ampel).toBe('rot')
    expect(r.hinweis).toMatch(/Abgelaufen seit 5/)
  })

  it('ist rot ohne Ablaufdatum', () => {
    expect(bewerteZertifikat(null, JETZT).ampel).toBe('rot')
  })

  it('rechnet Tagesdifferenzen ohne Uhrzeit-Drift', () => {
    expect(tageBis(inTagen(30), JETZT)).toBe(30)
    expect(tageBis(inTagen(0), JETZT)).toBe(0)
    expect(tageBis(inTagen(-1), JETZT)).toBe(-1)
  })
})

// ── Readiness ───────────────────────────────────────────────────

interface Fixture {
  organizations?: any
  abrechnung_zertifikate?: any[]
  datenannahmestellen?: any[]
  dta_kostentraeger?: any[]
  state_settings?: any[]
  billing_tariffs?: number
  abrechnungslaeufe?: any[]
  dta_ruecklaeufer?: any[]
  ops_aufgaben?: number
  dta_fehlerprotokoll?: number
  billing_audit_trail?: any[]
}

function readinessMock(f: Fixture) {
  const client = {
    from: vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        is: vi.fn(() => chain),
        or: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(() => Promise.resolve({ data: (f as any)[table] ?? null, error: null })),
        then: (resolve: any) => {
          if (table === 'billing_tariffs') return resolve({ data: null, count: f.billing_tariffs ?? 0, error: null })
          if (table === 'ops_aufgaben') return resolve({ data: null, count: f.ops_aufgaben ?? 0, error: null })
          if (table === 'dta_fehlerprotokoll') return resolve({ data: null, count: f.dta_fehlerprotokoll ?? 0, error: null })
          return resolve({ data: (f as any)[table] ?? [], error: null })
        },
      }
      return chain
    }),
  }
  return client as any
}

/** Vollstaendig eingerichtete Organisation — alle Ampeln gruen. */
function vollstaendig(): Fixture {
  return {
    organizations: { name: 'Alltagsengel UG', ik_nummer: '460629986', bundesland: 'Hessen' },
    abrechnung_zertifikate: [
      { typ: 'absender', ik_nummer: '460629986', gueltig_bis: inTagen(365) },
      { typ: 'empfaenger', ik_nummer: '105810615', gueltig_bis: inTagen(365) },
    ],
    datenannahmestellen: [{
      id: 'das-1', name: 'ITSCare', ik_nummer: '105810615', aktiv: true,
      sftp_host: 'sftp.itscare.de', sftp_user: 'ae', sftp_key_url: 'keys/ae.pub',
      kim_adresse: null, organization_id: ORG,
    }],
    dta_kostentraeger: [{ id: 'k1', ik_nummer: '105313145', name: 'AOK Hessen', ist_aktiv: true, datenannahmestelle_id: 'das-1' }],
    state_settings: [{ bundesland: 'Hessen', status: 'ANERKANNT', kassenrechnung_enabled: true, dakota_export_enabled: true, approval_document: 'bescheid.pdf' }],
    billing_tariffs: 24,
    abrechnungslaeufe: [{ id: 'l1', status: 'uebermittelt', abrechnungsmonat: '2026-07', erstellt_am: '2026-08-01T10:00:00Z', uebermittelt_am: '2026-08-02T10:00:00Z' }],
    dta_ruecklaeufer: [],
    billing_audit_trail: [
      { action: 'preflight_ausgefuehrt', created_at: '2026-08-07T09:00:00Z' },
      { action: 'dry_run_ausgefuehrt', created_at: '2026-08-07T09:30:00Z' },
    ],
  }
}

// `secon_passwort` haengt an einer Env-Variable, nicht an der DB. Ohne sie
// waere jede "vollstaendig eingerichtet"-Fixture unvermeidlich rot, und die
// Tests wuerden nur diese eine Luecke messen statt der Readiness-Logik.
const PASSWORT_VORHER = process.env.SECON_ZERT_PASSWORT

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(JETZT)
  process.env.SECON_ZERT_PASSWORT = 'test-passwort'
})

afterEach(() => {
  vi.useRealTimers()
  if (PASSWORT_VORHER === undefined) delete process.env.SECON_ZERT_PASSWORT
  else process.env.SECON_ZERT_PASSWORT = PASSWORT_VORHER
})

describe('ermittleReadiness — vollstaendig eingerichtet', () => {
  it('meldet gruen und versandbereit', async () => {
    const r = await ermittleReadiness(readinessMock(vollstaendig()), ORG)
    const nichtGruen = r.punkte.filter(p => p.ampel !== 'gruen')
    expect(nichtGruen.map(p => `${p.id}: ${p.hinweis}`)).toEqual([])
    expect(r.gesamt).toBe('gruen')
    expect(r.versandbereit).toBe(true)
    expect(r.modus).toBe('produktion')
  })

  it('liest letzten Preflight, Dry-Run und Versand aus echten Quellen', async () => {
    const r = await ermittleReadiness(readinessMock(vollstaendig()), ORG)
    expect(r.betrieb.letzterPreflight).toBe('2026-08-07T09:00:00Z')
    expect(r.betrieb.letzterDryRun).toBe('2026-08-07T09:30:00Z')
    expect(r.betrieb.letzterVersand?.uebermittelt_am).toBe('2026-08-02T10:00:00Z')
  })
})

describe('ermittleReadiness — leere Organisation', () => {
  it('meldet rot und nicht versandbereit', async () => {
    const r = await ermittleReadiness(readinessMock({}), ORG)
    expect(r.gesamt).toBe('rot')
    expect(r.versandbereit).toBe(false)
    expect(r.modus).toBe('test')
    expect(r.zusammenfassung.rot).toBeGreaterThan(0)
  })

  it('trennt interne von externen Blockern', async () => {
    const r = await ermittleReadiness(readinessMock({}), ORG)
    expect(r.offeneBlocker.extern).toContain('SECON-Absenderzertifikat (ITSG)')
    expect(r.offeneBlocker.intern).toContain('Kostenträger-Stammdaten')
    // Ein Punkt darf nie in beiden Listen stehen.
    const doppelt = r.offeneBlocker.intern.filter(i => r.offeneBlocker.extern.includes(i))
    expect(doppelt).toEqual([])
  })

  it('markiert den fehlenden Erstversand als externen Blocker', async () => {
    const r = await ermittleReadiness(readinessMock({}), ORG)
    const versand = r.punkte.find(p => p.id === 'erstversand')!
    expect(versand.ampel).toBe('rot')
    expect(versand.blocker).toBe('extern')
  })
})

describe('ermittleReadiness — Teilzustaende', () => {
  it('setzt das Zertifikat auf gelb, wenn es bald ablaeuft', async () => {
    const f = vollstaendig()
    f.abrechnung_zertifikate = [
      { typ: 'absender', ik_nummer: '460629986', gueltig_bis: inTagen(10) },
      { typ: 'empfaenger', ik_nummer: '105810615', gueltig_bis: inTagen(365) },
    ]
    const r = await ermittleReadiness(readinessMock(f), ORG)
    expect(r.punkte.find(p => p.id === 'secon_absender')!.ampel).toBe('gelb')
    expect(r.gesamt).toBe('gelb')
    expect(r.versandbereit).toBe(false)
  })

  it('setzt das Zertifikat auf rot, wenn es abgelaufen ist', async () => {
    const f = vollstaendig()
    f.abrechnung_zertifikate = [{ typ: 'absender', ik_nummer: '460629986', gueltig_bis: inTagen(-1) }]
    const r = await ermittleReadiness(readinessMock(f), ORG)
    expect(r.punkte.find(p => p.id === 'secon_absender')!.ampel).toBe('rot')
    expect(r.gesamt).toBe('rot')
  })

  it('setzt den Uebertragungszugang auf gelb ohne SSH-Key', async () => {
    const f = vollstaendig()
    f.datenannahmestellen = [{ ...f.datenannahmestellen![0], sftp_key_url: null }]
    const r = await ermittleReadiness(readinessMock(f), ORG)
    expect(r.punkte.find(p => p.id === 'uebertragungszugang')!.ampel).toBe('gelb')
  })

  it('meldet Routing rot, wenn gar keine Kostentraeger existieren', async () => {
    const f = vollstaendig()
    f.dta_kostentraeger = []
    const r = await ermittleReadiness(readinessMock(f), ORG)
    expect(r.punkte.find(p => p.id === 'routing')!.ampel).toBe('rot')
    expect(r.punkte.find(p => p.id === 'kostentraeger')!.ampel).toBe('rot')
  })

  it('bleibt Test-Modus, solange DAKOTA nicht freigeschaltet ist', async () => {
    const f = vollstaendig()
    f.state_settings = [{ ...f.state_settings![0], dakota_export_enabled: false }]
    const r = await ermittleReadiness(readinessMock(f), ORG)
    expect(r.modus).toBe('test')
  })
})

describe('ermittleReadiness — Secrets', () => {
  it('gibt niemals Zertifikatsinhalte oder Schluesselpfade heraus', async () => {
    const r = await ermittleReadiness(readinessMock(vollstaendig()), ORG)
    const serialisiert = JSON.stringify(r)
    expect(serialisiert).not.toContain('BEGIN CERTIFICATE')
    expect(serialisiert).not.toContain('zertifikat_pem')
    expect(serialisiert).not.toContain('keys/ae.pub')
    expect(serialisiert).not.toContain('sftp.itscare.de')
  })

  it('meldet das SECON-Passwort nur als Existenz, nie als Wert', async () => {
    const alt = process.env.SECON_ZERT_PASSWORT
    process.env.SECON_ZERT_PASSWORT = 'streng-geheim-123'
    try {
      const r = await ermittleReadiness(readinessMock(vollstaendig()), ORG)
      const punkt = r.punkte.find(p => p.id === 'secon_passwort')!
      expect(punkt.ampel).toBe('gruen')
      expect(JSON.stringify(r)).not.toContain('streng-geheim-123')
    } finally {
      if (alt === undefined) delete process.env.SECON_ZERT_PASSWORT
      else process.env.SECON_ZERT_PASSWORT = alt
    }
  })
})
