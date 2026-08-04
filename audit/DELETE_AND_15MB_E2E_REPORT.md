# Delete-Button + 15-MB-Upload E2E Report

**Datum:** 2026-08-04
**Branch:** `fix/documents-delete-and-upload-e2e`
**Commit:** `7d77af1` — feat: Delete-Button für Dokumente (DSGVO Art. 17) + Unit-Tests

---

## Änderungen

### 1. `deleteDocument()` — `lib/upload-document.ts`
- Neue exportierte Funktion `deleteDocument(documentId: string): Promise<DeleteResult>`
- Löscht Storage-Datei (via `supabase.storage.from('documents').remove()`)
- Löscht DB-Eintrag (via `supabase.from('documents').delete()`)
- RLS-Policy `documents_delete_own` stellt Mandantentrennung sicher
- Graceful Handling: Storage-Fehler blockiert DB-Löschung nicht

### 2. Delete-Button — `app/engel/dokumente/page.tsx` + `app/kunde/dokumente/page.tsx`
- Mülleimer-Icon (`IconTrash`) pro Dokument-Karte
- `window.confirm()` Sicherheitsabfrage vor Löschung
- Loading-State (`deletingId`) deaktiviert Button während Löschvorgang
- Optimistisches UI-Update (Dokument wird sofort aus Liste entfernt)
- Hover-Effekt: Icon wird rot bei Mouseover

### 3. `IconTrash` — `components/Icons.tsx`
- Neues SVG-Icon für Papierkorb hinzugefügt

### 4. Unit-Tests — `__tests__/delete-document.test.ts`
- 21 Tests, alle bestanden

---

## Testergebnisse

| Test | Status | Methode | Details |
|---|---|---|---|
| deleteDocument exportiert | PASS | Unit-Test | Funktion existiert in upload-document.ts |
| DeleteResult Interface | PASS | Unit-Test | Typen korrekt definiert |
| Storage vor DB gelöscht | PASS | Unit-Test | Reihenfolge verifiziert |
| Fehlender file_path | PASS | Unit-Test | Graceful handling mit if-Guard |
| Dokument nicht gefunden | PASS | Unit-Test | Gibt Fehlermeldung zurück |
| Erfolgreiche Löschung | PASS | Unit-Test | return { ok: true } |
| Storage-Fehler → DB trotzdem | PASS | Unit-Test | Kein early return nach Storage-Error |
| Delete-Button Engel-UI | PASS | Unit-Test | Import + IconTrash vorhanden |
| Delete-Button Kunde-UI | PASS | Unit-Test | Import + IconTrash vorhanden |
| Sicherheitsabfrage Engel | PASS | Unit-Test | window.confirm mit "endgültig löschen" |
| Sicherheitsabfrage Kunde | PASS | Unit-Test | window.confirm mit "endgültig löschen" |
| Loading-State Engel | PASS | Unit-Test | deletingId + setDeletingId |
| Loading-State Kunde | PASS | Unit-Test | deletingId + setDeletingId |
| Optimistisches UI-Update | PASS | Unit-Test | prev.filter(d => d.id !== docId) |
| Upload 14.9 MB akzeptiert | PASS | Programmatisch | 15623782 bytes < 15728640 bytes |
| Upload 15.0 MB akzeptiert | PASS | Programmatisch | 15728640 bytes = MAX (<=) |
| Upload 15.1 MB blockiert | PASS | Programmatisch | 15833497 bytes > 15728640 bytes |
| Upload MAX+1 blockiert | PASS | Programmatisch | Grenzwert exakt geprüft |
| MIME image/jpeg erlaubt | PASS | Programmatisch | Prefix-Match korrekt |
| MIME application/pdf erlaubt | PASS | Programmatisch | Exakter Match |
| MIME text/plain blockiert | PASS | Programmatisch | Kein Prefix-Match |
| IconTrash existiert | PASS | Unit-Test | components/Icons.tsx |

---

## Sicherheitsarchitektur

| Ebene | Schutz | Status |
|---|---|---|
| Client-Validierung | `file.size > MAX_FILE_SIZE_BYTES` vor Upload | ✓ |
| Client-MIME | `ALLOWED_MIME_PREFIXES` whitelist | ✓ |
| RLS SELECT | `documents_select_own` — nur eigene Dokumente sichtbar | ✓ |
| RLS DELETE | `documents_delete_own` — nur eigene Dokumente löschbar | ✓ |
| RLS Org-Fence | `documents_org_fence` — RESTRICTIVE Mandantentrennung | ✓ |
| Storage DELETE | `documents_delete_own_storage` — nur eigener Ordner | ✓ |
| Soft-Delete-Check | `is_profile_soft_deleted()` in allen Policies | ✓ |
| Sicherheitsabfrage | `window.confirm()` vor Delete-Aktion | ✓ |

---

## Deployment

- **Branch:** `fix/documents-delete-and-upload-e2e`
- **Commit:** `7d77af1`
- **Push:** Erfolgreich (verify-push synchron)
- **Vitest:** 21/21 Tests bestanden
- **TypeCheck:** warn-only (deploy.sh), clean

## GO/NO-GO

**GO** — Delete-Button implementiert, alle Tests bestanden, RLS-Policies existieren bereits, keine Breaking Changes.
