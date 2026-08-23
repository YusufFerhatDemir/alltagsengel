import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  normalizeMisAudit,
  normalizeWfAudit,
  filterAuditEntries,
  csvZelle,
  alsCsv,
  OPS_AUDIT_QUELLEN,
  QUELLE_LABELS,
  type UnifiedAuditEntry,
} from '../../lib/analytics/opsAudit'

// ═══════════════════════════════════════════════════════════
// Bereich 14 der Lückenanalyse (P2, zwei Befunde)
// ═══════════════════════════════════════════════════════════
// 1. „Vier getrennte Audit-Spuren ohne gemeinsame Sicht." Die gemeinsame
//    Sicht las bisher nur ops_aktivitaetslog + billing_audit_trail.
// 2. „Kein Export der Audit-Spur für eine Prüfung."
//
// Die Aufbewahrungsfrist selbst ist NICHT hier definiert — sie steht seit
// 5e8ff5a im Löschkonzept (10 Jahre, § 257 HGB / DSGVO Art. 30).
// ═══════════════════════════════════════════════════════════

describe('Audit-Gesamtsicht — Quellen', () => {
  it('kennt alle vier Spuren', () => {
    expect([...OPS_AUDIT_QUELLEN].sort()).toEqual(
      ['abrechnung', 'administration', 'aufgaben', 'workflow'],
    )
  })

  it('hat für jede Quelle ein deutsches Label', () => {
    for (const q of OPS_AUDIT_QUELLEN) {
      expect(QUELLE_LABELS[q], q).toBeTruthy()
    }
  })
})

describe('Audit-Gesamtsicht — Normalisierung', () => {
  it('normalisiert mis_audit_log', () => {
    const e = normalizeMisAudit(
      {
        id: 'm1', entity_type: 'client', entity_id: 'c1', action: 'update',
        actor_id: 'u1', actor_name: 'Aus der Zeile', created_at: '2026-08-20T09:00:00Z',
        details: { geaenderte_felder: ['address'] },
      },
      'Aus profiles',
    )
    expect(e.quelle).toBe('administration')
    expect(e.aktion).toBe('update')
    expect(e.nachher).toEqual({ geaenderte_felder: ['address'] })
    // Das Administrations-Audit kennt kein Vorher — hier wird nichts erfunden.
    expect(e.vorher).toBeNull()
  })

  it('zieht den Akteursnamen aus profiles dem gespeicherten vor', () => {
    // actor_name ist ein Schnappschuss von damals; profiles ist die
    // aktuelle Wahrheit und in beiden anderen Quellen die einzige Quelle.
    const e = normalizeMisAudit(
      {
        id: 'm1', entity_type: 'client', entity_id: 'c1', action: 'update',
        actor_id: 'u1', actor_name: 'Alter Name', created_at: '2026-08-20T09:00:00Z', details: null,
      },
      'Neuer Name',
    )
    expect(e.akteurName).toBe('Neuer Name')
  })

  it('fällt auf actor_name zurück, wenn das Profil fehlt', () => {
    const e = normalizeMisAudit(
      {
        id: 'm1', entity_type: 'client', entity_id: null, action: 'delete',
        actor_id: null, actor_name: 'Geloeschter Nutzer', created_at: '2026-08-20T09:00:00Z', details: {},
      },
      null,
    )
    expect(e.akteurName).toBe('Geloeschter Nutzer')
    expect(e.entitaetId).toBe('')
    expect(e.nachher).toBeNull()
  })

  it('normalisiert wf_audit_log und behält die Ereignisklasse', () => {
    const e = normalizeWfAudit(
      {
        id: 'w1', entitaet_typ: 'invoice', entitaet_id: 'i1', typ: 'aktion_ausgefuehrt',
        aktion: 'mahnung_erzeugt', akteur_id: 'u2', created_at: '2026-08-21T09:00:00Z',
        details: { stufe: 2 },
      },
      'Erika Musterfrau',
    )
    expect(e.quelle).toBe('workflow')
    expect(e.aktion).toBe('mahnung_erzeugt')
    expect(e.nachher).toEqual({ typ: 'aktion_ausgefuehrt', stufe: 2 })
  })
})

function eintrag(over: Partial<UnifiedAuditEntry>): UnifiedAuditEntry {
  return {
    id: '1', quelle: 'administration', entitaetTyp: 'client', entitaetId: 'c1',
    aktion: 'update', akteurId: 'u1', akteurName: 'Max Mustermann',
    zeitpunkt: '2026-08-05T10:00:00Z', vorher: null, nachher: null,
    ...over,
  }
}

describe('Audit-Gesamtsicht — Filter über alle Quellen', () => {
  const alle = [
    eintrag({ id: '1', quelle: 'aufgaben' }),
    eintrag({ id: '2', quelle: 'abrechnung' }),
    eintrag({ id: '3', quelle: 'administration' }),
    eintrag({ id: '4', quelle: 'workflow' }),
  ]

  it('filtert auf jede der vier Quellen', () => {
    for (const q of OPS_AUDIT_QUELLEN) {
      expect(filterAuditEntries(alle, { quelle: q }).map(e => e.quelle)).toEqual([q])
    }
  })

  it('gibt ohne Quellenfilter alle vier zurück', () => {
    expect(filterAuditEntries(alle, {})).toHaveLength(4)
  })
})

describe('Audit-Export als CSV', () => {
  it('schreibt Kopfzeile und eine Zeile je Eintrag', () => {
    const csv = alsCsv([eintrag({ id: '1' }), eintrag({ id: '2' })])
    const zeilen = csv.trimEnd().split('\r\n')
    expect(zeilen).toHaveLength(3)
    expect(zeilen[0]).toContain('Zeitpunkt')
    expect(zeilen[0]).toContain('Quelle')
  })

  it('beginnt mit einem BOM, damit Excel Umlaute nicht zerlegt', () => {
    expect(alsCsv([])).toMatch(/^﻿/)
  })

  it('trennt mit Semikolon (deutsche Excel-Locale)', () => {
    const kopf = alsCsv([]).replace(/^﻿/, '').split('\r\n')[0]
    expect(kopf.split(';').length).toBe(9)
  })

  it('schreibt das deutsche Quellen-Label statt des Schlüssels', () => {
    const csv = alsCsv([eintrag({ quelle: 'workflow' })])
    expect(csv).toContain('Workflow')
  })

  it('maskiert Anführungszeichen statt die Spalte zu zerreißen', () => {
    const csv = alsCsv([eintrag({ akteurName: 'Anna "Anni" Berg' })])
    expect(csv).toContain('"Anna ""Anni"" Berg"')
  })

  it('entschärft Formel-Einleitungen (CSV-Injection)', () => {
    // Audit-Details stammen teils aus Freitext; ohne Apostroph würde Excel
    // den Inhalt als Formel ausführen.
    expect(csvZelle('=1+1')).toBe(`"'=1+1"`)
    expect(csvZelle('+49 170')).toBe(`"'+49 170"`)
    expect(csvZelle('-5')).toBe(`"'-5"`)
    expect(csvZelle('@user')).toBe(`"'@user"`)
    expect(csvZelle('normal')).toBe('"normal"')
  })

  it('schreibt leere Zellen für null und undefined', () => {
    expect(csvZelle(null)).toBe('')
    expect(csvZelle(undefined)).toBe('')
  })

  it('serialisiert Objekte als JSON', () => {
    expect(csvZelle({ a: 1 })).toBe('"{""a"":1}"')
  })
})

// ── Verdrahtung ───────────────────────────────────────────────────

describe('Verdrahtung: Lader und Route', () => {
  const lader = readFileSync(join(process.cwd(), 'lib/analytics/opsAudit.ts'), 'utf-8')
  const route = readFileSync(join(process.cwd(), 'app/api/admin/analytics/ops-audit/route.ts'), 'utf-8')
  const seite = readFileSync(join(process.cwd(), 'app/admin/ops-audit/page.tsx'), 'utf-8')

  it('liest alle vier Tabellen', () => {
    for (const tabelle of ['ops_aktivitaetslog', 'billing_audit_trail', 'mis_audit_log', 'wf_audit_log']) {
      expect(lader, tabelle).toContain(`.from('${tabelle}')`)
    }
  })

  it('fenced jede Quelle einzeln auf die Organisation', () => {
    // Ohne den Fence je Quelle wäre die gemeinsame Sicht ein Mandantenleck.
    const treffer = lader.match(/\.eq\('organization_id', params\.organizationId\)/g) || []
    expect(treffer.length).toBe(4)
  })

  it('liefert CSV nur bei format=csv', () => {
    expect(route).toContain("url.searchParams.get('format') === 'csv'")
    expect(route).toContain('text/csv')
  })

  it('protokolliert den Export selbst', () => {
    // Sonst wäre der Export die einzige Aktion im System, die keine Spur
    // hinterlässt — ausgerechnet die, die Daten aus dem System trägt.
    expect(route).toContain('logAuditEventOrWarn')
    expect(route).toContain("action: 'data_export'")
  })

  it('exportiert den Zeitraum vollständig, nicht nur die Bildschirmseite', () => {
    expect(route).toContain('limit: alsExport ? undefined : limit')
  })

  it('bietet die vier Quellen und den Export in der Oberfläche an', () => {
    for (const q of OPS_AUDIT_QUELLEN) {
      expect(seite, q).toContain(`value="${q}"`)
    }
    expect(seite).toContain('Als CSV exportieren')
  })
})
