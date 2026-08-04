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

## Browser-E2E-Tests (Live Preview)

| # | Test | Ergebnis | Details |
|---|------|----------|---------|
| a | Login Nutzer A | PASS | e2e_test_del_a@alltagsengel.care |
| b | Navigation /kunde/dokumente | PASS | Seite lädt korrekt |
| c | PDF-Upload (Personalausweis) | PASS | Test-PDF hochgeladen |
| d | Delete-Button sichtbar | PASS | Trash-Icon per Zoom verifiziert |
| e | Löschung mit confirm() | PASS | window.confirm überschrieben → auto-accept |
| f | DB + Storage leer | PASS | 0 Dokumente, 0 Storage-Objekte |
| g | Re-Upload für Isolation | PASS | Neues Dokument hochgeladen |
| h | Login Nutzer B (2. Tab) | PASS | Separater Browser-Tab |
| i | **RLS-Isolation** | PASS | Nutzer B sieht „Keine Dokumente" |
| j | **16MB → Fehler** | PASS | „Datei zu groß (16.0 MB). Maximal 15 MB erlaubt." |
| k | **MIME .txt → Fehler** | PASS | „Nur Bilder (JPG, PNG, HEIC) und PDF-Dateien sind erlaubt." |

---

## Smoke-Tests (Production nach Merge)

| Route | Status |
|-------|--------|
| `alltagsengel.care/` | PASS (200) |
| `alltagsengel.care/auth/login` | PASS (200) |
| `alltagsengel.care/kunde/dokumente` | PASS (Redirect → Login) |
| `alltagsengel.care/engel/dokumente` | PASS (Redirect → Login) |

---

## Deployment

- **Branch:** `fix/documents-delete-and-upload-e2e`
- **PR:** #28 — merged → main (2026-08-04)
- **CI:** 4/4 Checks passed (Typecheck, Lint, Tests, Build)
- **Vercel:** Production-Deploy erfolgreich
- **Branch gelöscht:** Ja (via GitHub nach Merge)

---

## Cleanup

| Aktion | Status |
|--------|--------|
| Test-Dokumente (DB + Storage) | Gelöscht |
| Test-Profile | Gelöscht |
| Test-Organisationen | Gelöscht |
| Test-Auth-Users (auth.users) | Gelöscht |
| Branch auf GitHub | Gelöscht |

---

## GO/NO-GO

**GO** — Alle 11 Browser-E2E-Tests + 21 Unit-Tests bestanden. RLS-Isolation verifiziert. 15MB-Limit + MIME-Validierung funktionieren. Production-Deploy erfolgreich. Testdaten bereinigt.
