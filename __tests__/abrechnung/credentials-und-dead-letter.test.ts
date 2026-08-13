// ═══════════════════════════════════════════════════════════════
// Zugangsmittel-Guard und Fehlerqueue
// ═══════════════════════════════════════════════════════════════
// Zwei Regeln, die sich nicht von selbst durchsetzen:
//
//   1. Schlüsselmaterial gehört nie in eine Datenbankspalte. Was einmal in
//      einer Tabelle steht, steht in jedem Backup und jedem Support-Dump.
//   2. Eine nicht zugestellte Abrechnung verlässt die Fehlerqueue nur über
//      eine erneute Einreichung oder über eine begründete Aufgabe.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  pruefeKeinSchluesselmaterial, SchluesselmaterialError, CREDENTIAL_KATALOG,
} from '@/lib/abrechnung/credentials'
import {
  pruefeDeadLetterUebergang, DEAD_LETTER_UEBERGAENGE, DEAD_LETTER_GRUND_TEXT,
  type DeadLetterStatus, type DeadLetterGrund,
} from '@/lib/abrechnung/dead-letter'

describe('Guard gegen Schlüsselmaterial in der Datenbank', () => {
  it('weist einen PEM-Private-Key ab', () => {
    const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----'
    expect(() => pruefeKeinSchluesselmaterial(key, 'notiz')).toThrow(SchluesselmaterialError)
  })

  it('weist ein PEM-Zertifikat ab', () => {
    expect(() => pruefeKeinSchluesselmaterial('-----BEGIN CERTIFICATE-----', 'notiz'))
      .toThrow(SchluesselmaterialError)
  })

  it('weist einen OpenSSH-Public-Key ab', () => {
    const key = `ssh-rsa ${'A'.repeat(200)} abrechnung@alltagsengel`
    expect(() => pruefeKeinSchluesselmaterial(key, 'ablage_ort')).toThrow(SchluesselmaterialError)
  })

  it('weist einen base64-kodierten DER/PKCS#12-Blob ab', () => {
    expect(() => pruefeKeinSchluesselmaterial(`MII${'a'.repeat(120)}`, 'fingerprint_neu'))
      .toThrow(SchluesselmaterialError)
  })

  it('nennt im Fehlertext das betroffene Feld und den sicheren Ablageort', () => {
    try {
      pruefeKeinSchluesselmaterial('-----BEGIN PRIVATE KEY-----', 'notiz')
      expect.unreachable('hätte werfen müssen')
    } catch (err) {
      expect((err as Error).message).toContain('notiz')
      expect((err as Error).message).toContain('Storage-Bucket')
    }
  })

  it('lässt Fingerprints, Pfade und leere Werte durch', () => {
    expect(() => pruefeKeinSchluesselmaterial('a1b2c3d4e5f6', 'fingerprint_neu')).not.toThrow()
    expect(() => pruefeKeinSchluesselmaterial('abrechnung:sftp-keys/abc.key', 'ablage_ort')).not.toThrow()
    expect(() => pruefeKeinSchluesselmaterial('Rotation nach Ablauf', 'notiz')).not.toThrow()
    expect(() => pruefeKeinSchluesselmaterial(null, 'notiz')).not.toThrow()
    expect(() => pruefeKeinSchluesselmaterial('', 'notiz')).not.toThrow()
  })
})

describe('Zugangsmittel-Katalog', () => {
  it('legt für jedes Zugangsmittel einen Ablageort fest — ausser bei extern Blockiertem', () => {
    for (const def of CREDENTIAL_KATALOG) {
      if (def.externOffen) {
        // Der Ablageort steht erst mit dem Vertrag fest; ein erfundener wäre
        // schlimmer als keiner.
        expect(def.ort, `${def.id} sollte ohne Ablageort sein`).toBeNull()
      } else {
        expect(def.ort, `${def.id} ohne Ablageort`).toBeTruthy()
      }
    }
  })

  it('legt Geheimnisse nur in Bucket oder Env ab — nie in eine Tabelle', () => {
    for (const def of CREDENTIAL_KATALOG.filter(d => d.geheim)) {
      expect(['bucket', 'env'], `${def.id}`).toContain(def.art)
    }
  })

  it('nennt für jedes Zugangsmittel, woher es kommt', () => {
    for (const def of CREDENTIAL_KATALOG) {
      expect(def.beschaffung.length, `${def.id} ohne Beschaffungsweg`).toBeGreaterThan(20)
    }
  })
})

describe('Fehlerqueue — Statusmaschine', () => {
  const ALLE: DeadLetterStatus[] = ['offen', 'in_analyse', 'wiedervorgelegt', 'erledigt', 'verworfen']

  it('kennt jeden Status als Ausgangspunkt', () => {
    for (const s of ALLE) {
      expect(DEAD_LETTER_UEBERGAENGE[s], `${s} fehlt`).toBeDefined()
    }
  })

  it('erlaubt "erledigt" ausschliesslich nach einer Wiedervorlage', () => {
    for (const s of ALLE) {
      expect(DEAD_LETTER_UEBERGAENGE[s].includes('erledigt'), `${s} → erledigt`)
        .toBe(s === 'wiedervorgelegt')
    }
  })

  it('lässt einen offenen Eintrag nicht direkt auf erledigt springen', () => {
    expect(pruefeDeadLetterUebergang('offen', 'erledigt')).toContain('nicht vorgesehen')
    expect(pruefeDeadLetterUebergang('in_analyse', 'erledigt')).toContain('nicht vorgesehen')
  })

  it('verlangt für "verworfen" eine Begründung', () => {
    expect(pruefeDeadLetterUebergang('offen', 'verworfen')).toContain('Begründung')
    expect(pruefeDeadLetterUebergang('offen', 'verworfen', '   ')).toContain('Begründung')
    expect(pruefeDeadLetterUebergang('offen', 'verworfen', 'Leistung storniert')).toBeNull()
  })

  it('behandelt erledigt und verworfen als Endzustände', () => {
    expect(DEAD_LETTER_UEBERGAENGE.erledigt).toHaveLength(0)
    expect(DEAD_LETTER_UEBERGAENGE.verworfen).toHaveLength(0)
    expect(pruefeDeadLetterUebergang('erledigt', 'offen')).toContain('nicht vorgesehen')
  })

  it('erlaubt den Rückweg von "wiedervorgelegt" nach "offen" (erneut gescheitert)', () => {
    expect(pruefeDeadLetterUebergang('wiedervorgelegt', 'offen')).toBeNull()
  })

  it('beschreibt jeden Einstellgrund im Klartext', () => {
    const gruende: DeadLetterGrund[] = [
      'versuche_erschoepft', 'nicht_wiederholbar', 'dauerhafter_fehler', 'manuell_eingestellt',
    ]
    for (const g of gruende) {
      expect(DEAD_LETTER_GRUND_TEXT[g], `${g} ohne Text`).toBeTruthy()
    }
  })
})
