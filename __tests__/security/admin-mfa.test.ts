/**
 * P1: Admin-MFA (TOTP) — Unit-Tests
 *
 * Testet die reinen Prüffunktionen aus lib/admin/mfa.ts.
 * Kein IO, keine Netzwerkaufrufe — nur Logik.
 */

import { describe, it, expect } from 'vitest'
import { adminMfaStand, adminMfaWeiterleitung, MFA_AUSNAHME_PFADE } from '@/lib/admin/mfa'
import type { MfaFaktor } from '@/lib/coach/mfa'

// ═══ Testdaten ═══

const verifiedFaktor: MfaFaktor = {
  id: 'f-1',
  factor_type: 'totp',
  status: 'verified',
  friendly_name: 'Admin-Handy',
  created_at: '2026-01-01T00:00:00Z',
}

const unverifiedFaktor: MfaFaktor = {
  id: 'f-2',
  factor_type: 'totp',
  status: 'unverified',
  friendly_name: null,
  created_at: '2026-01-01T00:00:00Z',
}

// ═══ adminMfaStand ═══

describe('adminMfaStand', () => {
  it('erkennt: kein Faktor, AAL1', () => {
    const stand = adminMfaStand([], 'aal1')
    expect(stand.eingerichtet).toBe(false)
    expect(stand.verifiziert).toBe(false)
    expect(stand.niveau).toBe('aal1')
  })

  it('erkennt: kein Faktor, null-Niveau', () => {
    const stand = adminMfaStand(null, null)
    expect(stand.eingerichtet).toBe(false)
    expect(stand.verifiziert).toBe(false)
  })

  it('erkennt: verifizierter Faktor, AAL2', () => {
    const stand = adminMfaStand([verifiedFaktor], 'aal2')
    expect(stand.eingerichtet).toBe(true)
    expect(stand.verifiziert).toBe(true)
  })

  it('erkennt: verifizierter Faktor, aber nur AAL1', () => {
    const stand = adminMfaStand([verifiedFaktor], 'aal1')
    expect(stand.eingerichtet).toBe(true)
    expect(stand.verifiziert).toBe(false)
  })

  it('ignoriert unbestätigte Faktoren', () => {
    const stand = adminMfaStand([unverifiedFaktor], 'aal1')
    expect(stand.eingerichtet).toBe(false)
  })

  it('erkennt verifiziert neben unbestätigtem', () => {
    const stand = adminMfaStand([unverifiedFaktor, verifiedFaktor], 'aal2')
    expect(stand.eingerichtet).toBe(true)
    expect(stand.verifiziert).toBe(true)
  })
})

// ═══ adminMfaWeiterleitung ═══

describe('adminMfaWeiterleitung', () => {
  it('kein Faktor → Einrichtung', () => {
    const stand = adminMfaStand([], 'aal1')
    expect(adminMfaWeiterleitung(stand, '/admin/dashboard')).toBe('/admin/mfa-einrichtung')
  })

  it('Faktor da, aber AAL1 → Prüfung', () => {
    const stand = adminMfaStand([verifiedFaktor], 'aal1')
    expect(adminMfaWeiterleitung(stand, '/admin/dashboard')).toBe('/admin/mfa-pruefen')
  })

  it('Faktor da, AAL2 → null (alles ok)', () => {
    const stand = adminMfaStand([verifiedFaktor], 'aal2')
    expect(adminMfaWeiterleitung(stand, '/admin/dashboard')).toBeNull()
  })

  it('Einrichtungsseite ist Ausnahme (kein Redirect)', () => {
    const stand = adminMfaStand([], 'aal1')
    expect(adminMfaWeiterleitung(stand, '/admin/mfa-einrichtung')).toBeNull()
  })

  it('Prüfseite ist Ausnahme (kein Redirect)', () => {
    const stand = adminMfaStand([verifiedFaktor], 'aal1')
    expect(adminMfaWeiterleitung(stand, '/admin/mfa-pruefen')).toBeNull()
  })

  it('Unterseiten der Ausnahme-Pfade sind auch Ausnahmen', () => {
    const stand = adminMfaStand([], 'aal1')
    expect(adminMfaWeiterleitung(stand, '/admin/mfa-einrichtung/step2')).toBeNull()
  })

  it('andere Admin-Pfade werden umgeleitet', () => {
    const stand = adminMfaStand([], 'aal1')
    expect(adminMfaWeiterleitung(stand, '/admin/settings')).toBe('/admin/mfa-einrichtung')
    expect(adminMfaWeiterleitung(stand, '/admin/clients')).toBe('/admin/mfa-einrichtung')
    expect(adminMfaWeiterleitung(stand, '/admin/home')).toBe('/admin/mfa-einrichtung')
  })
})

// ═══ MFA_AUSNAHME_PFADE ═══

describe('MFA_AUSNAHME_PFADE', () => {
  it('enthält die Einrichtungs- und Prüfseite', () => {
    expect(MFA_AUSNAHME_PFADE).toContain('/admin/mfa-einrichtung')
    expect(MFA_AUSNAHME_PFADE).toContain('/admin/mfa-pruefen')
  })

  it('enthält keine regulären Admin-Pfade', () => {
    expect(MFA_AUSNAHME_PFADE).not.toContain('/admin/dashboard')
    expect(MFA_AUSNAHME_PFADE).not.toContain('/admin/settings')
  })
})
