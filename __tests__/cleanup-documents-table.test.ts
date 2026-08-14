/**
 * Tests für Cleanup A2: documents-Tabelle Absicherung
 * Stellt sicher, dass die Feature-Guards korrekt implementiert sind.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

function readFile(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

describe('A2: upload-document.ts hat Feature-Guard', () => {
  it('exportiert checkDocumentsTableExists', () => {
    const src = readFile('lib/upload-document.ts')
    expect(src).toContain('export async function checkDocumentsTableExists')
  })

  it('uploadDocument prüft Tabellen-Existenz vor Upload', () => {
    const src = readFile('lib/upload-document.ts')
    // Der Guard muss VOR dem Dateigrößen-Check kommen
    const guardIdx = src.indexOf('checkDocumentsTableExists')
    const sizeCheckIdx = src.indexOf('MAX_FILE_SIZE_BYTES')
    // Beide müssen existieren
    expect(guardIdx).toBeGreaterThan(-1)
    expect(sizeCheckIdx).toBeGreaterThan(-1)
    // Guard muss in der uploadDocument-Funktion vor dem Size-Check stehen
    const funcStart = src.indexOf('export async function uploadDocument')
    const guardInFunc = src.indexOf('checkDocumentsTableExists', funcStart)
    const sizeInFunc = src.indexOf('MAX_FILE_SIZE_BYTES', funcStart)
    expect(guardInFunc).toBeLessThan(sizeInFunc)
  })
})

describe('A2: Engel/Kunde Dokumente-Seiten haben Feature-Guard', () => {
  it('engel/dokumente importiert und nutzt checkDocumentsTableExists', () => {
    const src = readFile('app/engel/dokumente/page.tsx')
    expect(src).toContain('checkDocumentsTableExists')
    expect(src).toContain('featureAvailable')
    expect(src).toContain('wird derzeit eingerichtet')
  })

  it('kunde/dokumente importiert und nutzt checkDocumentsTableExists', () => {
    const src = readFile('app/kunde/dokumente/page.tsx')
    expect(src).toContain('checkDocumentsTableExists')
    expect(src).toContain('featureAvailable')
    expect(src).toContain('wird derzeit eingerichtet')
  })
})

describe('A2: Migration soft_delete hat Guard für documents-Policy', () => {
  it('soft_delete Migration hat IF EXISTS Guard', () => {
    const src = readFile('supabase/migrations/20260419000100_soft_delete.sql')
    // Darf kein direktes CREATE POLICY ... ON public.documents mehr haben
    // (nur innerhalb eines DO $$ ... $$ Blocks)
    const lines = src.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      // Überspringe Kommentare und Zeilen innerhalb von DO-Blöcken
      if (trimmed.startsWith('--')) continue
      // Direkte CREATE POLICY auf documents darf nicht mehr existieren
      if (trimmed.match(/^CREATE POLICY.*ON\s+public\.documents/)) {
        throw new Error(`Unguarded CREATE POLICY auf documents gefunden: ${trimmed}`)
      }
    }
    // Stattdessen muss ein DO $$ Block mit pg_tables-Check vorhanden sein
    expect(src).toContain("tablename = 'documents'")
  })
})

describe('A2: account-hard-delete hat Error-Handling für documents', () => {
  it('hard-delete edge function fängt documents-Fehler ab', () => {
    const src = readFile('supabase/functions/account-hard-delete/index.ts')
    // Muss .catch() oder try/catch für documents-Delete haben
    const docDeleteLine = src.match(/from\(['"]documents['"]\).*\.delete\(\).*/)
    expect(docDeleteLine).toBeTruthy()
    // Muss catch haben
    expect(src).toMatch(/from\(['"]documents['"]\).*\.catch/)
  })
})
