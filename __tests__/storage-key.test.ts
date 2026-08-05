import { describe, it, expect } from 'vitest'
import { extractProjectRef, getSupabaseStorageKey } from '@/lib/supabase/storage-key'

describe('extractProjectRef', () => {
  it('extrahiert Produktions-Ref korrekt', () => {
    expect(extractProjectRef('https://nnwyktkqibdjxgimjyuq.supabase.co'))
      .toBe('nnwyktkqibdjxgimjyuq')
  })

  it('extrahiert Staging-Ref korrekt', () => {
    expect(extractProjectRef('https://uwmjqckhjkgukhzeidyw.supabase.co'))
      .toBe('uwmjqckhjkgukhzeidyw')
  })

  it('gibt null bei undefined zurück', () => {
    expect(extractProjectRef(undefined)).toBeNull()
  })

  it('gibt null bei null zurück', () => {
    expect(extractProjectRef(null)).toBeNull()
  })

  it('gibt null bei leerem String zurück', () => {
    expect(extractProjectRef('')).toBeNull()
  })

  it('gibt null bei Whitespace-only zurück', () => {
    expect(extractProjectRef('   ')).toBeNull()
  })

  it('gibt null bei ungültiger URL zurück', () => {
    expect(extractProjectRef('not-a-url')).toBeNull()
  })

  it('gibt null bei Nicht-Supabase-URL zurück', () => {
    expect(extractProjectRef('https://example.com')).toBeNull()
  })

  it('gibt null bei URL ohne Subdomain zurück', () => {
    expect(extractProjectRef('https://supabase.co')).toBeNull()
  })

  it('toleriert Whitespace um die URL', () => {
    expect(extractProjectRef('  https://abc123.supabase.co  '))
      .toBe('abc123')
  })
})

describe('getSupabaseStorageKey', () => {
  it('gibt korrekten Key für Produktions-URL zurück', () => {
    expect(getSupabaseStorageKey('https://nnwyktkqibdjxgimjyuq.supabase.co'))
      .toBe('sb-nnwyktkqibdjxgimjyuq-auth-token')
  })

  it('gibt korrekten Key für Staging-URL zurück', () => {
    expect(getSupabaseStorageKey('https://uwmjqckhjkgukhzeidyw.supabase.co'))
      .toBe('sb-uwmjqckhjkgukhzeidyw-auth-token')
  })

  it('FAIL-CLOSED: null bei ungültiger URL', () => {
    expect(getSupabaseStorageKey('not-a-url')).toBeNull()
  })

  it('FAIL-CLOSED: null bei fehlender URL (undefined)', () => {
    expect(getSupabaseStorageKey(undefined)).toBeNull()
  })

  it('FAIL-CLOSED: null bei fehlender URL (null)', () => {
    expect(getSupabaseStorageKey(null)).toBeNull()
  })

  it('FAIL-CLOSED: null bei leerem String', () => {
    expect(getSupabaseStorageKey('')).toBeNull()
  })

  it('FAIL-CLOSED: null bei Nicht-Supabase-Domain', () => {
    expect(getSupabaseStorageKey('https://malicious.example.com')).toBeNull()
  })
})
