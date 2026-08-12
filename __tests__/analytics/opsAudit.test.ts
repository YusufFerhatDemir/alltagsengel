import { describe, it, expect } from 'vitest'
import {
  normalizeAktivitaet,
  normalizeBillingAudit,
  filterAuditEntries,
  sortAuditEntriesDesc,
  type UnifiedAuditEntry,
} from '../../lib/analytics/opsAudit'

describe('Ops-Audit — Normalisierung', () => {
  it('normalisiert einen ops_aktivitaetslog-Eintrag', () => {
    const e = normalizeAktivitaet(
      { id: '1', entitaet_typ: 'aufgabe', entitaet_id: 'a1', aktion: 'erstellt', akteur_id: 'u1', erstellt_am: '2026-08-01T10:00:00Z', vorher: null, nachher: { titel: 'X' } },
      'Max Mustermann',
    )
    expect(e.quelle).toBe('aufgaben')
    expect(e.akteurName).toBe('Max Mustermann')
    expect(e.entitaetTyp).toBe('aufgabe')
  })

  it('normalisiert einen billing_audit_trail-Eintrag', () => {
    const e = normalizeBillingAudit(
      { id: '2', entity_type: 'invoice', entity_id: 'i1', action: 'korrigiert', actor_id: 'u2', created_at: '2026-08-02T10:00:00Z', previous_state: { status: 'entwurf' }, new_state: { status: 'freigegeben' } },
      'Erika Musterfrau',
    )
    expect(e.quelle).toBe('abrechnung')
    expect(e.aktion).toBe('korrigiert')
    expect(e.akteurName).toBe('Erika Musterfrau')
  })
})

function makeEntry(overrides: Partial<UnifiedAuditEntry>): UnifiedAuditEntry {
  return {
    id: '1', quelle: 'aufgaben', entitaetTyp: 'aufgabe', entitaetId: 'a1', aktion: 'erstellt',
    akteurId: 'u1', akteurName: 'Max Mustermann', zeitpunkt: '2026-08-05T10:00:00Z', vorher: null, nachher: null,
    ...overrides,
  }
}

describe('Ops-Audit — filterAuditEntries', () => {
  const entries: UnifiedAuditEntry[] = [
    makeEntry({ id: '1', zeitpunkt: '2026-08-01T10:00:00Z', aktion: 'erstellt', akteurName: 'Max Mustermann', quelle: 'aufgaben' }),
    makeEntry({ id: '2', zeitpunkt: '2026-08-15T10:00:00Z', aktion: 'aktualisiert', akteurName: 'Erika Musterfrau', quelle: 'abrechnung' }),
    makeEntry({ id: '3', zeitpunkt: '2026-08-30T10:00:00Z', aktion: 'erstellt', akteurName: 'Max Mustermann', quelle: 'aufgaben' }),
  ]

  it('filtert nach Zeitraum (von/bis)', () => {
    const r = filterAuditEntries(entries, { von: '2026-08-10', bis: '2026-08-20' })
    expect(r.map(e => e.id)).toEqual(['2'])
  })

  it('filtert nach Aktion', () => {
    const r = filterAuditEntries(entries, { aktion: 'erstellt' })
    expect(r.map(e => e.id).sort()).toEqual(['1', '3'])
  })

  it('filtert nach Akteur (Teilstring, case-insensitive)', () => {
    const r = filterAuditEntries(entries, { akteur: 'erika' })
    expect(r.map(e => e.id)).toEqual(['2'])
  })

  it('filtert nach Quelle', () => {
    const r = filterAuditEntries(entries, { quelle: 'abrechnung' })
    expect(r.map(e => e.id)).toEqual(['2'])
  })

  it('kombiniert mehrere Filter (AND-Verknüpfung)', () => {
    const r = filterAuditEntries(entries, { aktion: 'erstellt', akteur: 'max' })
    expect(r.map(e => e.id).sort()).toEqual(['1', '3'])
  })
})

describe('Ops-Audit — sortAuditEntriesDesc', () => {
  it('sortiert absteigend nach Zeitpunkt', () => {
    const entries = [
      makeEntry({ id: 'alt', zeitpunkt: '2026-08-01T10:00:00Z' }),
      makeEntry({ id: 'neu', zeitpunkt: '2026-08-30T10:00:00Z' }),
    ]
    const sorted = sortAuditEntriesDesc(entries)
    expect(sorted.map(e => e.id)).toEqual(['neu', 'alt'])
  })
})
