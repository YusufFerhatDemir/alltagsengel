// ═══════════════════════════════════════════════════════════════
// Welle 4 — safe-query.ts Tests
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { isValidUUID, safeSingleQuery } from '../safe-query'

// ---------------------------------------------------------------------------
// Supabase-Mock
// ---------------------------------------------------------------------------

function mockSupabase(response: { data: any; error: any }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => response,
        }),
      }),
    }),
  } as any
}

// ---------------------------------------------------------------------------
// isValidUUID
// ---------------------------------------------------------------------------

describe('isValidUUID', () => {
  test('akzeptiert gueltige v4 UUID', () => {
    assert.equal(isValidUUID('550e8400-e29b-41d4-a716-446655440000'), true)
  })

  test('akzeptiert Grossbuchstaben-UUID', () => {
    assert.equal(isValidUUID('550E8400-E29B-41D4-A716-446655440000'), true)
  })

  test('lehnt leeren String ab', () => {
    assert.equal(isValidUUID(''), false)
  })

  test('lehnt beliebigen String ab', () => {
    assert.equal(isValidUUID('nicht-eine-uuid'), false)
  })

  test('lehnt UUID ohne Bindestriche ab', () => {
    assert.equal(isValidUUID('550e8400e29b41d4a716446655440000'), false)
  })

  test('lehnt partielle UUID ab', () => {
    assert.equal(isValidUUID('550e8400-e29b-41d4'), false)
  })

  test('lehnt UUID mit Sonderzeichen ab', () => {
    assert.equal(isValidUUID('550e8400-e29b-41d4-a716-44665544000g'), false)
  })
})

// ---------------------------------------------------------------------------
// safeSingleQuery
// ---------------------------------------------------------------------------

describe('safeSingleQuery', () => {
  test('gibt invalid_id fuer ungueltige UUID zurueck', async () => {
    const sb = mockSupabase({ data: null, error: null })
    const result = await safeSingleQuery(sb, 'organizations', 'bad-id')
    assert.equal(result.status, 'invalid_id')
    assert.equal(result.data, null)
  })

  test('gibt ok mit Daten fuer gueltige Abfrage zurueck', async () => {
    const payload = { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Test' }
    const sb = mockSupabase({ data: payload, error: null })
    const result = await safeSingleQuery(sb, 'organizations', '550e8400-e29b-41d4-a716-446655440000')
    assert.equal(result.status, 'ok')
    assert.deepEqual(result.data, payload)
  })

  test('gibt not_found fuer PGRST116-Fehler zurueck', async () => {
    const sb = mockSupabase({
      data: null,
      error: { code: 'PGRST116', message: 'Row not found' },
    })
    const result = await safeSingleQuery(sb, 'organizations', '550e8400-e29b-41d4-a716-446655440000')
    assert.equal(result.status, 'not_found')
    assert.equal(result.data, null)
  })

  test('gibt error fuer andere Fehler zurueck', async () => {
    const sb = mockSupabase({
      data: null,
      error: { code: 'PGRST301', message: 'Permission denied' },
    })
    const result = await safeSingleQuery(sb, 'organizations', '550e8400-e29b-41d4-a716-446655440000')
    assert.equal(result.status, 'error')
    assert.equal(result.data, null)
  })

  test('gibt error zurueck wenn from() eine Exception wirft', async () => {
    const sb = {
      from: () => {
        throw new Error('Connection refused')
      },
    } as any
    const result = await safeSingleQuery(sb, 'organizations', '550e8400-e29b-41d4-a716-446655440000')
    assert.equal(result.status, 'error')
    assert.equal(result.data, null)
  })
})
