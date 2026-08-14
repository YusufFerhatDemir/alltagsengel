/**
 * M-1: correctInvoice muss die Serialisierung ernst nehmen
 *
 * BEFUND (Abschlussbericht):
 *   validate_correction_atomic ist auf Production nicht vorhanden.
 *   correctInvoice() faengt "not found" ab und laeuft weiter — parallele
 *   Korrektur/Storno auf derselben Rechnung sind damit nicht serialisiert.
 *
 * Die Migration 20260910000000 zieht die RPC nach. Diese Tests halten das
 * Verhalten der Aufruferseite fest, denn genau dort sitzt die Gefahr:
 *
 *   1. Solange die RPC fehlt, darf der Korrekturweg nicht komplett
 *      ausfallen (weiche Landung) — sonst waere die Migration ein
 *      Zwangs-Deployment.
 *   2. JEDER andere RPC-Fehler MUSS durchschlagen. Ein zu breiter
 *      catch-Block waere die eigentliche Luecke: dann verschluckt die
 *      Anwendung auch das "Rechnung im Status storniert — Korrektur nicht
 *      moeglich" der Sperre und korrigiert munter weiter.
 *   3. Die RPC muss ueberhaupt aufgerufen werden, und zwar VOR dem Laden
 *      des Originals — eine Sperre nach dem Lesen sperrt nichts mehr.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { correctInvoice } from '@/lib/billing/core/invoice-engine'

const REPO_ROOT = join(__dirname, '..', '..')

const ORIGINAL = {
  id: 'inv-1',
  total_amount: 100,
  status: 'freigegeben',
  organization_id: 'org-1',
  client_id: 'cl-1',
  version: 1,
  period_start: '2026-06-01',
  period_end: '2026-06-30',
}

const KORREKTUR = [{
  leistungsart: 'alltagsbegleitung_45a',
  leistungsdatum: '2026-06-15',
  menge: 1,
  einheit: 'stunde',
  einzelpreisCent: 2500,
  gesamtpreisCent: 2500,
}]

/** Marker: ab hier ist die Korrektur inhaltlich durch — Test bricht ab. */
const STOP = 'STOP_NACH_RPC'

function mockSupabase(rpcError: { message: string } | null) {
  const reihenfolge: string[] = []

  const tarifQuery: Record<string, unknown> = {}
  const weiter = () => tarifQuery
  tarifQuery.select = weiter
  tarifQuery.eq = weiter
  tarifQuery.lte = weiter
  tarifQuery.is = weiter
  tarifQuery.order = weiter
  tarifQuery.limit = async () => ({
    data: [{
      id: 'tarif-1',
      preis_cent: 2500,
      verguetungsart: 'zeit_stunde',
      tarif_status: 'verified',
      rechtsgrundlage: 'privat',
      verifizierungs_quelle: null,
    }],
    error: null,
  })

  const sb = {
    reihenfolge,
    rpc: vi.fn(async (name: string) => {
      reihenfolge.push(`rpc:${name}`)
      return { data: rpcError ? null : { validated: true }, error: rpcError }
    }),
    from: vi.fn((tabelle: string) => {
      reihenfolge.push(`from:${tabelle}`)
      if (tabelle === 'invoices') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: ORIGINAL, error: null }) }) }),
          insert: () => { throw new Error(STOP) },
        }
      }
      if (tabelle === 'billing_tariffs') return tarifQuery
      throw new Error(STOP)
    }),
  }
  return sb
}

const korrigiere = (sb: unknown) =>
  correctInvoice(sb as never, 'inv-1', KORREKTUR, 'Testkorrektur', 'user-1', 'org-1')

describe('correctInvoice: Serialisierung ueber validate_correction_atomic', () => {
  it('ruft die Sperre auf, BEVOR das Original gelesen wird', async () => {
    const sb = mockSupabase(null)
    await expect(korrigiere(sb)).rejects.toThrow()

    expect(sb.rpc).toHaveBeenCalledWith('validate_correction_atomic', {
      p_invoice_id: 'inv-1',
      p_org_id: 'org-1',
    })

    const rpcIndex = sb.reihenfolge.indexOf('rpc:validate_correction_atomic')
    const ladeIndex = sb.reihenfolge.indexOf('from:invoices')
    expect(rpcIndex).toBeGreaterThanOrEqual(0)
    expect(rpcIndex).toBeLessThan(ladeIndex)
  })

  it('laesst die Ablehnung der Sperre durchschlagen (paralleles Storno)', async () => {
    // Das ist der Fall, den die RPC verhindern soll: waehrend die Korrektur
    // laeuft, wird die Rechnung storniert. Die Meldung MUSS ankommen.
    const sb = mockSupabase({
      message: 'Rechnung im Status storniert — Korrektur nicht moeglich.',
    })
    await expect(korrigiere(sb)).rejects.toThrow('Korrektur nicht moeglich')
  })

  it('laesst auch den Cross-Tenant-Abbruch der Sperre durchschlagen', async () => {
    const sb = mockSupabase({
      message: 'Rechnung nicht gefunden oder falsche Organisation.',
    })
    await expect(korrigiere(sb)).rejects.toThrow('falsche Organisation')
  })

  it('faellt nur bei fehlender Funktion weich zurueck (Migration noch nicht live)', async () => {
    const sb = mockSupabase({
      message: 'Could not find the function public.validate_correction_atomic',
    })
    // Kein Abbruch an der RPC — der Weg laeuft bis zum STOP-Marker weiter.
    await expect(korrigiere(sb)).rejects.toThrow(STOP)
  })

  it('ueberspringt die Sperre, wenn keine Organisation mitgegeben wurde', async () => {
    const sb = mockSupabase(null)
    await expect(
      correctInvoice(sb as never, 'inv-1', KORREKTUR, 'Grund', 'user-1'),
    ).rejects.toThrow()
    expect(sb.reihenfolge).not.toContain('rpc:validate_correction_atomic')
  })
})

describe('Migration 20260910000000 zieht die fehlende RPC nach', () => {
  const sql = readFileSync(
    join(REPO_ROOT, 'supabase/migrations/20260910000000_nachziehen_atomare_billing_rpcs.sql'),
    'utf-8',
  )

  it('legt beide Funktionen an', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.validate_correction_atomic')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_credit_note_atomic')
  })

  it('entzieht anon und authenticated das Ausfuehrungsrecht', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.validate_correction_atomic(UUID, UUID) FROM anon')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.validate_correction_atomic(UUID, UUID) FROM authenticated')
  })

  it('sperrt die Gutschriftzeilen in einer eigenen Anweisung', () => {
    // Die Vorlage 20260831010000 kombinierte SUM() mit FOR UPDATE — das
    // lehnt PostgreSQL mit SQLSTATE 0A000 ab. Dass die korrigierte Fassung
    // laeuft, beweist der PGlite-Test; hier steht nur, dass die Sperre nicht
    // beim Umbau verloren gegangen ist.
    expect(sql).toMatch(/PERFORM 1[\s\S]{0,300}?FOR UPDATE/)
  })

  it('hat einen Rollback', () => {
    const rollback = readFileSync(
      join(REPO_ROOT, 'supabase/migrations/20260910000001_rollback_nachziehen_atomare_billing_rpcs.sql'),
      'utf-8',
    )
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.validate_correction_atomic')
  })
})
