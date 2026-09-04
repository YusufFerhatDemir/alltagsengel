/**
 * Zugangsschranke des Bonusmoduls
 *
 * Die Datei ist eine Zeile lang — und genau deshalb ist der Test
 * wertvoll: er hält die BERECHTIGUNG fest, die dort steht.
 *
 * Vorgeschichte (27.08.2026): Oberfläche, Schnittstelle und Datenbank
 * gaben drei verschiedene Antworten darauf, wer Boni verwalten darf. Die
 * PDL bekam über den RLS-Weg leere Listen ohne Hinweis, Schreibwege
 * endeten in einem als 'Interner Serverfehler' verkürzten 42501. Die
 * Auflösung war eine eigene Berechtigung, die dasselbe sagt wie
 * is_admin() in den bonus_*-Policies.
 *
 * Würde jemand hier auf 'berichte.lesen' oder 'personal.lesen'
 * zurückgehen, wäre genau dieser Zustand wieder da — ohne dass ein Test
 * anschlägt. Deshalb dieser.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NUR_ADMINISTRATION, BERECHTIGUNGEN, rolleDarf } from '@/lib/auth/rollen'

const requireOpsAdmin = vi.fn(async () => ({ ok: true as const, ctx: {} as never }))
vi.mock('@/lib/ops/api-auth', () => ({ requireOpsAdmin: (b: string) => requireOpsAdmin(b as never) }))

const { requireBonusVerwaltung } = await import('@/lib/analytics/bonus-auth')

beforeEach(() => requireOpsAdmin.mockClear())

describe('requireBonusVerwaltung', () => {
  it('verlangt genau die Berechtigung bonus.verwalten', async () => {
    await requireBonusVerwaltung()
    expect(requireOpsAdmin).toHaveBeenCalledTimes(1)
    expect(requireOpsAdmin).toHaveBeenCalledWith('bonus.verwalten')
  })

  it('reicht das Ergebnis unverändert durch', async () => {
    const abgewiesen = { ok: false as const, response: {} as never }
    requireOpsAdmin.mockResolvedValueOnce(abgewiesen as never)
    expect(await requireBonusVerwaltung()).toBe(abgewiesen)
  })
})

describe('Die Berechtigung selbst', () => {
  it('ist im Katalog verzeichnet', () => {
    expect(BERECHTIGUNGEN).toContain('bonus.verwalten')
  })

  it('steht unter dem Vorbehalt der Administration', () => {
    // Deckungsgleich mit is_admin() in den bonus_*-Policies. Ohne diesen
    // Vorbehalt bekämen weitere Rollen ein OK von der Schnittstelle und
    // ein 42501 von der Datenbank — also einen erfundenen Serverfehler.
    expect(NUR_ADMINISTRATION).toContain('bonus.verwalten')
  })

  it('gilt für admin und superadmin — und für sonst niemanden', () => {
    expect(rolleDarf('admin', 'bonus.verwalten')).toBe(true)
    expect(rolleDarf('superadmin', 'bonus.verwalten')).toBe(true)
    for (const rolle of ['pdl', 'qm', 'buchhaltung', 'engel', 'fahrer', 'kunde', 'angehoerige'] as const) {
      expect(rolleDarf(rolle, 'bonus.verwalten'), rolle).toBe(false)
    }
  })
})
