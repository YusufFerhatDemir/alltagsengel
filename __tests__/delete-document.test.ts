/**
 * Tests für deleteDocument — DSGVO Art. 17 Lösch-Funktion
 * Prüft Code-Struktur und Logik der delete-Implementierung.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

function readFile(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

describe('deleteDocument Funktion', () => {
  const src = readFile('lib/upload-document.ts')

  it('exportiert deleteDocument', () => {
    expect(src).toContain('export async function deleteDocument')
  })

  it('exportiert DeleteResult Interface', () => {
    expect(src).toContain('export interface DeleteResult')
  })

  it('löscht Storage-Datei vor DB-Eintrag', () => {
    const funcStart = src.indexOf('export async function deleteDocument')
    const storageRemove = src.indexOf('.remove([doc.file_path])', funcStart)
    const dbDelete = src.indexOf(".delete()\n    .eq('id', documentId)", funcStart)
    expect(storageRemove).toBeGreaterThan(funcStart)
    expect(dbDelete).toBeGreaterThan(storageRemove)
  })

  it('behandelt fehlenden file_path graceful', () => {
    const funcStart = src.indexOf('export async function deleteDocument')
    const funcBody = src.slice(funcStart, src.indexOf('\nexport', funcStart + 1))
    expect(funcBody).toContain('if (doc.file_path)')
  })

  it('gibt Fehler bei nicht gefundenem Dokument zurück', () => {
    const funcStart = src.indexOf('export async function deleteDocument')
    const funcBody = src.slice(funcStart, src.indexOf('\nexport', funcStart + 1))
    expect(funcBody).toContain('Dokument nicht gefunden')
  })

  it('gibt ok: true bei erfolgreichem Löschen zurück', () => {
    const funcStart = src.indexOf('export async function deleteDocument')
    const funcBody = src.slice(funcStart, src.indexOf('\nexport', funcStart + 1))
    expect(funcBody).toContain('return { ok: true }')
  })

  it('fährt mit DB-Löschung fort auch wenn Storage-Löschung fehlschlägt', () => {
    const funcStart = src.indexOf('export async function deleteDocument')
    const funcBody = src.slice(funcStart, src.indexOf('\nexport', funcStart + 1))
    // Nach Storage-Error wird der DB-Delete trotzdem aufgerufen (kein early return)
    expect(funcBody).toContain('Storage-Löschfehler')
    const storageErrorLog = funcBody.indexOf('Storage-Löschfehler')
    const dbDeleteAfter = funcBody.indexOf('.delete()', storageErrorLog)
    expect(dbDeleteAfter).toBeGreaterThan(storageErrorLog)
  })
})

describe('Delete-Button in UI', () => {
  it('Engel-Dokumente importiert deleteDocument und IconTrash', () => {
    const src = readFile('app/engel/dokumente/page.tsx')
    expect(src).toContain('deleteDocument')
    expect(src).toContain('IconTrash')
  })

  it('Kunde-Dokumente importiert deleteDocument und IconTrash', () => {
    const src = readFile('app/kunde/dokumente/page.tsx')
    expect(src).toContain('deleteDocument')
    expect(src).toContain('IconTrash')
  })

  it('Engel-Seite hat Sicherheitsabfrage vor Löschung', () => {
    const src = readFile('app/engel/dokumente/page.tsx')
    expect(src).toContain('window.confirm')
    expect(src).toContain('endgültig löschen')
  })

  it('Kunde-Seite hat Sicherheitsabfrage vor Löschung', () => {
    const src = readFile('app/kunde/dokumente/page.tsx')
    expect(src).toContain('window.confirm')
    expect(src).toContain('endgültig löschen')
  })

  it('Engel-Seite hat deletingId State für Loading-Zustand', () => {
    const src = readFile('app/engel/dokumente/page.tsx')
    expect(src).toContain('deletingId')
    expect(src).toContain('setDeletingId')
  })

  it('Kunde-Seite hat deletingId State für Loading-Zustand', () => {
    const src = readFile('app/kunde/dokumente/page.tsx')
    expect(src).toContain('deletingId')
    expect(src).toContain('setDeletingId')
  })

  it('Löschen aktualisiert die Dokumentenliste optimistisch', () => {
    const engelSrc = readFile('app/engel/dokumente/page.tsx')
    const kundeSrc = readFile('app/kunde/dokumente/page.tsx')
    // Beide Seiten filtern das gelöschte Dokument aus dem State
    expect(engelSrc).toContain('prev.filter(d => d.id !== docId)')
    expect(kundeSrc).toContain('prev.filter(d => d.id !== docId)')
  })
})

describe('Upload-Validierung (15 MB Limit)', () => {
  const src = readFile('lib/upload-document.ts')

  it('MAX_FILE_SIZE_MB ist 15', () => {
    expect(src).toContain('export const MAX_FILE_SIZE_MB = 15')
  })

  it('berechnet Byte-Limit korrekt aus MB', () => {
    expect(src).toContain('MAX_FILE_SIZE_MB * 1024 * 1024')
  })

  it('prüft Dateigröße vor Upload', () => {
    const funcStart = src.indexOf('export async function uploadDocument')
    const sizeCheck = src.indexOf('file.size > MAX_FILE_SIZE_BYTES', funcStart)
    const uploadCall = src.indexOf('.upload(filePath, file', funcStart)
    expect(sizeCheck).toBeGreaterThan(funcStart)
    expect(sizeCheck).toBeLessThan(uploadCall)
  })

  it('gibt file_too_large ErrorCode zurück', () => {
    expect(src).toContain("errorCode: 'file_too_large'")
  })

  it('erlaubt nur explizit gelistete Bild-Typen und application/pdf', () => {
    expect(src).toContain("'application/pdf'")
    expect(src).toContain("'image/jpeg'")
    expect(src).toContain("'image/png'")
    expect(src).toContain("'image/heic'")
  })

  // SVG traegt ausfuehrbares Script und liefe ueber die signierte URL auf
  // der Storage-Origin — darf weder hier noch in der Bucket-Allowlist stehen
  // (Migration 20260825_security_org_fence_storage_hardening).
  it('erlaubt kein SVG und keine Praefix-Pruefung', () => {
    expect(src).not.toContain("'image/svg+xml'")
    expect(src).not.toContain('startsWith(prefix)')
  })

  it('gibt invalid_type ErrorCode für falsche MIME-Typen zurück', () => {
    expect(src).toContain("errorCode: 'invalid_type'")
  })
})

describe('IconTrash existiert in Icons', () => {
  it('Icons.tsx exportiert IconTrash', () => {
    const src = readFile('components/Icons.tsx')
    expect(src).toContain('export function IconTrash')
  })
})
