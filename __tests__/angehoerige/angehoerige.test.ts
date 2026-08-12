import { describe, it, expect } from 'vitest'
import {
  validiereRolle,
  validiereBereich,
  validiereBereiche,
  validiereZugangInput,
  ANGEHOERIGEN_ROLLEN,
  FREIGABE_BEREICHE,
  ROLLEN_LABEL,
  BEREICH_LABEL,
} from '@/lib/angehoerige/types'
import {
  istZugangGueltig,
  hatBereichZugriff,
} from '@/lib/angehoerige/angehoerige'
import type { AngehoerigenZugang, FreigabeBereich } from '@/lib/angehoerige/types'

// ── Rollen-Validierung ──────────────────────────────────────────

describe('validiereRolle', () => {
  it('akzeptiert alle gültigen Rollen', () => {
    for (const r of ANGEHOERIGEN_ROLLEN) {
      expect(() => validiereRolle(r)).not.toThrow()
    }
  })

  it('wirft bei ungültiger Rolle', () => {
    expect(() => validiereRolle('admin')).toThrow('Ungültige Rolle')
    expect(() => validiereRolle('')).toThrow('Ungültige Rolle')
  })
})

// ── Bereich-Validierung ──────────────────────────────────────────

describe('validiereBereich', () => {
  it('akzeptiert alle gültigen Bereiche', () => {
    for (const b of FREIGABE_BEREICHE) {
      expect(() => validiereBereich(b)).not.toThrow()
    }
  })

  it('wirft bei ungültigem Bereich', () => {
    expect(() => validiereBereich('admin')).toThrow('Ungültiger Bereich')
  })
})

describe('validiereBereiche', () => {
  it('akzeptiert gültige Bereiche-Array', () => {
    expect(() => validiereBereiche(['termine', 'leistungen'])).not.toThrow()
  })

  it('wirft bei leerem Array', () => {
    expect(() => validiereBereiche([])).toThrow('Mindestens ein Freigabebereich')
  })

  it('wirft bei ungültigem Bereich im Array', () => {
    expect(() => validiereBereiche(['termine', 'invalid' as any])).toThrow('Ungültiger Bereich')
  })

  it('wirft bei nicht-Array', () => {
    expect(() => validiereBereiche(null as any)).toThrow('Mindestens ein Freigabebereich')
  })
})

// ── Zugang-Input-Validierung ─────────────────────────────────────

describe('validiereZugangInput', () => {
  const basis = {
    client_id: '00000000-0000-0000-0000-000000000001',
    user_id: '00000000-0000-0000-0000-000000000002',
    rolle: 'angehoeriger',
    freigegebene_bereiche: ['termine', 'leistungen'],
  }

  it('akzeptiert vollständige Eingabe', () => {
    expect(() => validiereZugangInput(basis)).not.toThrow()
  })

  it('wirft bei fehlender client_id', () => {
    expect(() => validiereZugangInput({ ...basis, client_id: '' })).toThrow('Klient')
  })

  it('wirft bei fehlender user_id', () => {
    expect(() => validiereZugangInput({ ...basis, user_id: '' })).toThrow('Benutzer')
  })

  it('wirft bei ungültiger Rolle', () => {
    expect(() => validiereZugangInput({ ...basis, rolle: 'invalid' })).toThrow('Ungültige Rolle')
  })

  it('wirft bei leeren Bereichen', () => {
    expect(() => validiereZugangInput({ ...basis, freigegebene_bereiche: [] })).toThrow('Freigabebereich')
  })
})

// ── Labels ──────────────────────────────────────────────────────

describe('Labels', () => {
  it('hat Labels für alle Rollen', () => {
    for (const r of ANGEHOERIGEN_ROLLEN) {
      expect(ROLLEN_LABEL[r]).toBeTruthy()
    }
  })

  it('hat Labels für alle Bereiche', () => {
    for (const b of FREIGABE_BEREICHE) {
      expect(BEREICH_LABEL[b]).toBeTruthy()
    }
  })
})

// ── Zugangs-Logik ───────────────────────────────────────────────

describe('istZugangGueltig', () => {
  const basisZugang: AngehoerigenZugang = {
    id: 'z1',
    organization_id: 'org1',
    user_id: 'u1',
    client_id: 'c1',
    rolle: 'angehoeriger',
    status: 'aktiv',
    freigegebene_bereiche: ['termine', 'leistungen'],
    pflegeberichte_freigegeben: false,
    erteilt_von: 'admin1',
    erteilt_am: '2026-01-01T00:00:00Z',
    widerrufen_von: null,
    widerrufen_am: null,
    widerruf_grund: null,
    gueltig_bis: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  it('gibt true für aktiven Zugang ohne Ablauf', () => {
    expect(istZugangGueltig(basisZugang)).toBe(true)
  })

  it('gibt false für widerrufenen Zugang', () => {
    expect(istZugangGueltig({ ...basisZugang, status: 'widerrufen' })).toBe(false)
  })

  it('gibt false für abgelaufenen Zugang', () => {
    expect(istZugangGueltig({ ...basisZugang, status: 'abgelaufen' })).toBe(false)
  })

  it('gibt false wenn gueltig_bis in der Vergangenheit', () => {
    expect(istZugangGueltig({
      ...basisZugang,
      gueltig_bis: '2020-01-01T00:00:00Z',
    })).toBe(false)
  })

  it('gibt true wenn gueltig_bis in der Zukunft', () => {
    expect(istZugangGueltig({
      ...basisZugang,
      gueltig_bis: '2030-12-31T00:00:00Z',
    })).toBe(true)
  })
})

describe('hatBereichZugriff', () => {
  const zugang: AngehoerigenZugang = {
    id: 'z1',
    organization_id: 'org1',
    user_id: 'u1',
    client_id: 'c1',
    rolle: 'angehoeriger',
    status: 'aktiv',
    freigegebene_bereiche: ['termine', 'leistungen', 'pflegeberichte'],
    pflegeberichte_freigegeben: false,
    erteilt_von: 'admin1',
    erteilt_am: '2026-01-01T00:00:00Z',
    widerrufen_von: null,
    widerrufen_am: null,
    widerruf_grund: null,
    gueltig_bis: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  it('gibt true für freigegebenen Bereich', () => {
    expect(hatBereichZugriff(zugang, 'termine')).toBe(true)
    expect(hatBereichZugriff(zugang, 'leistungen')).toBe(true)
  })

  it('gibt false für nicht freigegebenen Bereich', () => {
    expect(hatBereichZugriff(zugang, 'dokumente')).toBe(false)
    expect(hatBereichZugriff(zugang, 'nachrichten')).toBe(false)
  })

  it('gibt false für Pflegeberichte ohne Freigabe', () => {
    expect(hatBereichZugriff(zugang, 'pflegeberichte')).toBe(false)
  })

  it('gibt true für Pflegeberichte mit Freigabe', () => {
    const mitFreigabe = { ...zugang, pflegeberichte_freigegeben: true }
    expect(hatBereichZugriff(mitFreigabe, 'pflegeberichte')).toBe(true)
  })

  it('gibt false bei widerrufenem Zugang', () => {
    const widerrufen = { ...zugang, status: 'widerrufen' as const }
    expect(hatBereichZugriff(widerrufen, 'termine')).toBe(false)
  })
})
