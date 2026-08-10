import { describe, it, expect } from 'vitest'
import {
  validiereDokumentTyp,
  validiereSignaturStatus,
  validiereMethode,
  validiereSHA256,
  validiereISO8601,
  validiereDokumentInput,
  validiereSignaturInput,
  SIGNATUR_DOKUMENT_TYPEN,
  SIGNATUR_STATUS_WERTE,
  SIGNATUR_METHODEN,
  AUDIT_AKTION_TYPEN,
} from '@/lib/signaturen/types'
import {
  berechneSHA256,
  verifiziereDokumentHash,
  berechneSignaturHash,
} from '@/lib/signaturen/signaturen'

// ── Typ-Validierung ──────────────────────────────────────────────

describe('validiereDokumentTyp', () => {
  it('akzeptiert alle gültigen Typen', () => {
    for (const t of SIGNATUR_DOKUMENT_TYPEN) {
      expect(() => validiereDokumentTyp(t)).not.toThrow()
    }
  })

  it('wirft bei ungültigem Typ', () => {
    expect(() => validiereDokumentTyp('foo')).toThrow('Ungültiger Dokumenttyp')
  })
})

describe('validiereSignaturStatus', () => {
  it('akzeptiert alle gültigen Status', () => {
    for (const s of SIGNATUR_STATUS_WERTE) {
      expect(() => validiereSignaturStatus(s)).not.toThrow()
    }
  })

  it('wirft bei ungültigem Status', () => {
    expect(() => validiereSignaturStatus('xyz')).toThrow('Ungültiger Status')
  })
})

describe('validiereMethode', () => {
  it('akzeptiert alle gültigen Methoden', () => {
    for (const m of SIGNATUR_METHODEN) {
      expect(() => validiereMethode(m)).not.toThrow()
    }
  })

  it('wirft bei ungültiger Methode', () => {
    expect(() => validiereMethode('handschriftlich')).toThrow('Ungültige Signaturmethode')
  })
})

// ── SHA-256 Validierung ──────────────────────────────────────────

describe('validiereSHA256', () => {
  it('akzeptiert gültigen Hash', () => {
    const hash = 'a'.repeat(64)
    expect(() => validiereSHA256(hash)).not.toThrow()
  })

  it('akzeptiert gemischten Hex-Hash', () => {
    const hash = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'
    expect(() => validiereSHA256(hash)).not.toThrow()
  })

  it('wirft bei zu kurzem Hash', () => {
    expect(() => validiereSHA256('abc123')).toThrow('Ungültiger SHA-256')
  })

  it('wirft bei Großbuchstaben', () => {
    expect(() => validiereSHA256('A'.repeat(64))).toThrow('Ungültiger SHA-256')
  })

  it('wirft bei nicht-Hex-Zeichen', () => {
    expect(() => validiereSHA256('g'.repeat(64))).toThrow('Ungültiger SHA-256')
  })
})

// ── ISO-8601 Validierung ─────────────────────────────────────────

describe('validiereISO8601', () => {
  it('akzeptiert gültigen Zeitstempel', () => {
    expect(() => validiereISO8601('2026-08-10T12:00:00Z')).not.toThrow()
    expect(() => validiereISO8601('2026-08-10T12:00:00.000Z')).not.toThrow()
  })

  it('wirft bei ungültigem Zeitstempel', () => {
    expect(() => validiereISO8601('not-a-date')).toThrow('Ungültiger Zeitstempel')
  })
})

// ── Dokument-Input-Validierung ───────────────────────────────────

describe('validiereDokumentInput', () => {
  const basis = {
    titel: 'Leistungsnachweis August',
    dokument_typ: 'leistungsnachweis',
    dokument_hash_sha256: 'a'.repeat(64),
  }

  it('akzeptiert vollständige Eingabe', () => {
    expect(() => validiereDokumentInput(basis)).not.toThrow()
  })

  it('wirft bei fehlendem Titel', () => {
    expect(() => validiereDokumentInput({ ...basis, titel: '' })).toThrow('Pflichtfeld')
  })

  it('wirft bei fehlendem Hash', () => {
    expect(() => validiereDokumentInput({ ...basis, dokument_hash_sha256: '' })).toThrow('Pflichtfeld')
  })

  it('wirft bei ungültigem Hash', () => {
    expect(() => validiereDokumentInput({ ...basis, dokument_hash_sha256: 'short' })).toThrow('SHA-256')
  })

  it('wirft bei ungültigem Dokumenttyp', () => {
    expect(() => validiereDokumentInput({ ...basis, dokument_typ: 'invalid' })).toThrow('Ungültiger Dokumenttyp')
  })
})

// ── Signatur-Input-Validierung ───────────────────────────────────

describe('validiereSignaturInput', () => {
  const basis = {
    dokument_id: '00000000-0000-0000-0000-000000000001',
    signatar_id: '00000000-0000-0000-0000-000000000002',
    signatar_name: 'Max Mustermann',
  }

  it('akzeptiert vollständige Eingabe', () => {
    expect(() => validiereSignaturInput(basis)).not.toThrow()
  })

  it('wirft bei fehlender dokument_id', () => {
    expect(() => validiereSignaturInput({ ...basis, dokument_id: '' })).toThrow('Dokument')
  })

  it('wirft bei fehlender signatar_id', () => {
    expect(() => validiereSignaturInput({ ...basis, signatar_id: '' })).toThrow('Signatar')
  })

  it('wirft bei fehlendem Namen', () => {
    expect(() => validiereSignaturInput({ ...basis, signatar_name: '' })).toThrow('Signatarname')
  })
})

// ── Hash-Berechnung ──────────────────────────────────────────────

describe('berechneSHA256', () => {
  it('berechnet konsistenten Hash', () => {
    const hash1 = berechneSHA256('test')
    const hash2 = berechneSHA256('test')
    expect(hash1).toBe(hash2)
  })

  it('gibt 64-Zeichen-Hex zurück', () => {
    const hash = berechneSHA256('hello world')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('unterschiedliche Eingaben ergeben unterschiedliche Hashes', () => {
    const hash1 = berechneSHA256('foo')
    const hash2 = berechneSHA256('bar')
    expect(hash1).not.toBe(hash2)
  })

  it('leerer String hat bekannten Hash', () => {
    const hash = berechneSHA256('')
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

describe('verifiziereDokumentHash', () => {
  it('verifiziert korrekten Hash', () => {
    const inhalt = 'Leistungsnachweis Daten'
    const hash = berechneSHA256(inhalt)
    expect(verifiziereDokumentHash(inhalt, hash)).toBe(true)
  })

  it('erkennt manipulierten Inhalt', () => {
    const hash = berechneSHA256('Original')
    expect(verifiziereDokumentHash('Manipuliert', hash)).toBe(false)
  })
})

describe('berechneSignaturHash', () => {
  it('berechnet deterministischen Hash', () => {
    const dokHash = 'a'.repeat(64)
    const signatarId = 'user-123'
    const ts = '2026-08-10T12:00:00Z'
    const h1 = berechneSignaturHash(dokHash, signatarId, ts)
    const h2 = berechneSignaturHash(dokHash, signatarId, ts)
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[a-f0-9]{64}$/)
  })

  it('unterschiedliche Inputs ergeben unterschiedliche Hashes', () => {
    const dokHash = 'a'.repeat(64)
    const h1 = berechneSignaturHash(dokHash, 'user-1', '2026-08-10T12:00:00Z')
    const h2 = berechneSignaturHash(dokHash, 'user-2', '2026-08-10T12:00:00Z')
    expect(h1).not.toBe(h2)
  })

  it('Zeitstempel-Änderung ändert Hash', () => {
    const dokHash = 'b'.repeat(64)
    const h1 = berechneSignaturHash(dokHash, 'user-1', '2026-08-10T12:00:00Z')
    const h2 = berechneSignaturHash(dokHash, 'user-1', '2026-08-10T12:00:01Z')
    expect(h1).not.toBe(h2)
  })
})

// ── Enums vollständig ────────────────────────────────────────────

describe('Enum-Vollständigkeit', () => {
  it('hat alle Dokumenttypen', () => {
    expect(SIGNATUR_DOKUMENT_TYPEN).toHaveLength(6)
  })

  it('hat alle Status', () => {
    expect(SIGNATUR_STATUS_WERTE).toHaveLength(3)
  })

  it('hat alle Methoden', () => {
    expect(SIGNATUR_METHODEN).toHaveLength(4)
  })

  it('hat alle Audit-Aktionen', () => {
    expect(AUDIT_AKTION_TYPEN).toHaveLength(7)
  })
})
