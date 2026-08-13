// ═══════════════════════════════════════════════════════════════════
// Fix 1: service_records.status ↔ proof_status Synchronisation
// ═══════════════════════════════════════════════════════════════════
// Der Signatur-Flow schrieb nur proof_status='UNTERSCHRIEBEN'. status blieb
// auf 'draft' — der Einsatz galt als offen, ging nie in eine Rechnung ein
// (create_invoice_draft_atomic filtert auf status IN ('signed','complete'))
// und belastete kein Budget (Trigger zählt nur status <> 'draft').
//
// Getestet wird:
//   1. die Abbildungslogik (monoton vorwärts, nie zurück)
//   2. dass der API-Signatur-Pfad status im SELBEN UPDATE mitschickt
//   3. dass DB-Trigger und TypeScript-Abbildung dieselben Paare kennen
// ═══════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  statusFuerProofStatus,
  mitStatusSync,
  PROOF_STATUS_ZU_RECORD_STATUS,
  RECORD_STATUS_WERTE,
} from '@/lib/leistungsnachweis/status-sync'

describe('statusFuerProofStatus — Abbildung Nachweis → status', () => {
  it('UNTERSCHRIEBEN auf einem Entwurf ergibt signed (der eigentliche Bug)', () => {
    expect(statusFuerProofStatus('UNTERSCHRIEBEN', 'draft')).toBe('signed')
  })

  it('ABGESCHLOSSEN ergibt complete', () => {
    expect(statusFuerProofStatus('ABGESCHLOSSEN', 'draft')).toBe('complete')
    expect(statusFuerProofStatus('ABGESCHLOSSEN', 'incomplete')).toBe('complete')
  })

  it('ABGERECHNET ergibt invoiced', () => {
    expect(statusFuerProofStatus('ABGERECHNET', 'signed')).toBe('invoiced')
  })

  it('ENTWURF auf einem leeren status ergibt draft', () => {
    expect(statusFuerProofStatus('ENTWURF', null)).toBe('draft')
  })
})

describe('statusFuerProofStatus — monoton vorwärts, nie zurück', () => {
  it('schreibt nichts, wenn der status bereits weiter ist', () => {
    // Live gefunden: status='invoiced' bei proof_status='ENTWURF' (die RPC
    // setzt status='invoiced', ohne proof_status anzufassen). Der Sync darf
    // eine abgerechnete Leistung nicht auf 'draft' zurückwerfen.
    expect(statusFuerProofStatus('ENTWURF', 'invoiced')).toBeNull()
    expect(statusFuerProofStatus('UNTERSCHRIEBEN', 'invoiced')).toBeNull()
    expect(statusFuerProofStatus('ABGESCHLOSSEN', 'signed')).toBeNull()
  })

  it('überschreibt einen manuell gesetzten Zwischenstatus nicht nach unten', () => {
    expect(statusFuerProofStatus('ENTWURF', 'incomplete')).toBeNull()
    expect(statusFuerProofStatus('ENTWURF', 'complete')).toBeNull()
  })

  it('schreibt nichts bei identischem Stand', () => {
    expect(statusFuerProofStatus('UNTERSCHRIEBEN', 'signed')).toBeNull()
    expect(statusFuerProofStatus('ENTWURF', 'draft')).toBeNull()
  })

  it('STORNIERT hat kein status-Gegenstück (läuft über billing_status)', () => {
    expect(statusFuerProofStatus('STORNIERT', 'draft')).toBeNull()
    expect(statusFuerProofStatus('STORNIERT', 'signed')).toBeNull()
  })

  it('ignoriert leere und unbekannte proof_status-Werte', () => {
    expect(statusFuerProofStatus(null, 'draft')).toBeNull()
    expect(statusFuerProofStatus(undefined, 'draft')).toBeNull()
    expect(statusFuerProofStatus('', 'draft')).toBeNull()
    expect(statusFuerProofStatus('IRGENDWAS', 'draft')).toBeNull()
  })

  it('setzt bei unbekanntem Ist-Status vor, statt ihn stehen zu lassen', () => {
    expect(statusFuerProofStatus('UNTERSCHRIEBEN', 'paid')).toBe('signed')
    expect(statusFuerProofStatus('ENTWURF', 'paid')).toBe('draft')
  })
})

describe('mitStatusSync — Update-Objekt', () => {
  it('ergänzt status im selben Update-Objekt', () => {
    const update = mitStatusSync(
      { proof_status: 'UNTERSCHRIEBEN', client_signed_at: '2026-08-13T10:00:00Z' },
      'UNTERSCHRIEBEN',
      'draft',
    )
    expect(update.status).toBe('signed')
    expect(update.proof_status).toBe('UNTERSCHRIEBEN')
    expect(update.client_signed_at).toBe('2026-08-13T10:00:00Z')
  })

  it('lässt das Update unverändert, wenn kein Sync nötig ist', () => {
    const eingabe = { proof_status: 'UNTERSCHRIEBEN' }
    const update = mitStatusSync(eingabe, 'UNTERSCHRIEBEN', 'invoiced')
    expect(update).toBe(eingabe)
    expect('status' in update).toBe(false)
  })

  it('mutiert das Eingabe-Objekt nicht', () => {
    const eingabe: Record<string, unknown> = { proof_status: 'ABGESCHLOSSEN' }
    mitStatusSync(eingabe, 'ABGESCHLOSSEN', 'draft')
    expect('status' in eingabe).toBe(false)
  })
})

describe('API-Route: Signatur schreibt status mit', () => {
  const route = readFileSync(
    join(process.cwd(), 'app/api/leistungsnachweis/crud/route.ts'),
    'utf8',
  )

  it('lädt den aktuellen status für den Sync mit', () => {
    // Ohne 'status' im SELECT kann der Sync die Rangfolge nicht prüfen.
    expect(route).toContain("select('proof_status, status')")
    expect(route).not.toContain("select('proof_status')")
  })

  it('nutzt mitStatusSync in sign- und confirm-Pfad', () => {
    expect(route).toContain("from '@/lib/leistungsnachweis/status-sync'")
    expect(route).toContain("mitStatusSync(signData, 'UNTERSCHRIEBEN'")
    expect(route).toContain("'ABGESCHLOSSEN',")
  })

  it('schickt den Sync im selben UPDATE wie proof_status', () => {
    // Ein zweites, nachgelagertes UPDATE würde scheitern: der Signatur-Trigger
    // setzt is_locked=true, danach blockt prevent_locked_record_change().
    expect(route).toContain('.update(signUpdate)')
    expect(route).toContain('.update(confirmUpdate)')
  })
})

describe('DB-Trigger deckt sich mit der TypeScript-Abbildung', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260901010000_service_record_status_sync.sql'),
    'utf8',
  )

  it('bildet dieselben proof_status → status Paare ab', () => {
    for (const [proof, status] of Object.entries(PROOF_STATUS_ZU_RECORD_STATUS)) {
      expect(migration).toMatch(
        new RegExp(`WHEN\\s+'${proof}'\\s+THEN\\s+'${status}'`),
      )
    }
  })

  it('kennt STORNIERT bewusst nicht als status-Ziel', () => {
    expect(migration).not.toMatch(/WHEN\s+'STORNIERT'\s+THEN\s+'/)
  })

  it('vergleicht Ränge, statt blind zu überschreiben', () => {
    expect(migration).toContain('v_rang_ziel > v_rang_ist')
  })

  it('nutzt exakt das Werteset des Check-Constraints', () => {
    for (const wert of RECORD_STATUS_WERTE) {
      expect(migration).toContain(`WHEN '${wert}' THEN`)
    }
  })

  it('läuft als BEFORE-Trigger (Folge-UPDATEs wären durch is_locked blockiert)', () => {
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON public.service_records')
  })

  it('hat ein Rollback-Skript', () => {
    const rollback = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260901010001_rollback_service_record_status_sync.sql'),
      'utf8',
    )
    expect(rollback).toContain('DROP TRIGGER IF EXISTS trg_sync_record_status')
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.sync_service_record_status')
  })
})
