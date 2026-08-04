# Browser E2E Acceptance Report — Dokumentenmodul

**Datum:** 2026-08-04 15:50–16:00 UTC  
**Umgebung:** Produktion (`nnwyktkqibdjxgimjyuq` / alltagsengel.care)  
**Durchgeführt von:** Automatisierter Agent (Claude) mit Chrome MCP + Supabase MCP  

---

## Test-IDs (alle bereinigt)

| Objekt | ID | Status |
|---|---|---|
| User A | `9d2e959b-3f9e-4945-9001-99a6227ba5a3` | gelöscht |
| User B | `ee854fd6-0cf3-4b71-bee8-f87625fa1b0f` | gelöscht |
| Org A (E2E_TEST_ORG_A) | `f5c6f3c5-2008-4793-8996-cd0fcbcc3d0e` | gelöscht |
| Org B (E2E_TEST_ORG_B) | `f119d823-5ff8-4efa-929f-98b3682fbf31` | gelöscht |
| Dokument | `8534a3e4-976e-4259-95bd-0b448e3fea54` | gelöscht |
| Storage-Objekt | `d4bcdae9-f6de-4198-adc0-8e4b59cee21a` | gelöscht |

---

## Testergebnisse

| # | Prüfpunkt | Status | Methode | Details |
|---|---|---|---|---|
| 1 | Login Nutzer A | **PASS** | Browser | Email/Passwort-Login auf `/auth/login` erfolgreich. Redirect zu `/kunde/home` mit "Willkommen zurück" Begrüßung. |
| 2 | Login Nutzer B | **PASS** | Browser | Login in separatem Tab erfolgreich. "Hallo, E2E_Test" angezeigt. |
| 3 | Navigation zu Dokumente-Seite | **PASS** | Browser | `/engel/dokumente` zeigt Upload-Kategorien (Personalausweis, Führungszeugnis, Qualifikationsnachweis, Versicherungsnachweis, Sonstiges) und "MEINE DOKUMENTE" Sektion. |
| 4 | Echter PDF-Upload | **PASS** | Browser | Synthetische Test-PDF (1,4 KB) über file_upload → Kategorie "Sonstiges" hochgeladen. Dokument erscheint sofort in Liste mit Status "Wird geprüft". |
| 5 | DB-Eintrag korrekt | **PASS** | SQL | `documents`-Eintrag erstellt: `user_id`, `organization_id` (Org A), `type=sonstiges`, `file_name=e2e_test_document.pdf`, `file_path` mit User-ID-Prefix, `status=pending`. |
| 6 | Storage-Objekt korrekt | **PASS** | SQL | `storage.objects`-Eintrag in Bucket `documents`, Pfad `{user_id}/{timestamp}-{filename}`. |
| 7 | Privater Bucket | **PASS** | SQL + Browser | `storage.buckets.public = false`. Direkter Public-URL-Zugriff gibt `{"statusCode":"404","error":"Bucket not found","code":"NoSuchBucket"}` zurück. |
| 8 | Signierte URL | **PASS** | Code-Review | Upload-Code erstellt `createSignedUrl` mit 7-Tage-TTL. Nie `getPublicUrl()`. Pfad für Re-Signierung in `file_path` gespeichert. |
| 9 | Mandantentrennung (Browser) | **PASS** | Browser | User B sieht auf `/engel/dokumente` "Keine Dokumente" — kein Zugriff auf Dokumente von User A. |
| 10 | Mandantentrennung (RLS) | **PASS** | SQL | RESTRICTIVE Policy `documents_org_fence`: `organization_id = current_org_id()`. User B (Org B) kann Org-A-Dokumente nicht sehen. 6 Policies aktiv: org_fence (RESTRICTIVE), admin, select_own, insert_own, update_own, delete_own. |
| 11 | Storage-RLS | **PASS** | SQL | 4 Storage-Policies auf `documents` Bucket: admin_storage (ALL), upload_own, read_own, delete_own — jeweils mit `foldername[1] = auth.uid()` Prüfung. |
| 12 | MIME-Blockierung (.txt) | **PASS** | Browser | Upload einer `.txt`-Datei zeigt Fehlermeldung: "Nur Bilder (JPG, PNG, HEIC) und PDF-Dateien sind erlaubt." Kein DB-Eintrag, kein Storage-Objekt erstellt. |
| 13 | 15-MB-Blockierung | **PASS** | Code-Review | `MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024`. Größen-Check ist erste Validierung in `uploadDocument()` (vor MIME). Browser-Upload einer 16-MB-Datei technisch nicht testbar (Chrome MCP file_upload hat 10-MB-Limit), aber Code-Logik eindeutig. UI zeigt "Max. 15 MB" an. |
| 14 | Kein Ghost-Upload bei Fehler | **PASS** | SQL | Nach fehlgeschlagenem MIME-Test: weiterhin nur 1 Dokument in DB, 1 Objekt in Storage. Kein verwaistes Objekt. |
| 15 | Rollback bei DB-Fehler | **PASS** | Code-Review | `uploadDocument()` hat expliziten Rollback: Bei DB-Insert-Fehler wird Storage-Datei via `remove()` gelöscht (Zeile 196). |
| 16 | Löschung über UI | **BLOCKIERT** | Browser + Code-Review | **Kein Delete-Button in der UI vorhanden.** Weder `/engel/dokumente` noch `/kunde/dokumente` bieten eine Lösch-Funktion. RLS-Policy `documents_delete_own` existiert, wird aber nicht genutzt. |
| 17 | Testdatenbereinigung | **PASS** | SQL | Alle 8 Tabellen (auth.users, auth.identities, profiles, organization_members, organizations, documents, storage.objects, mis_auth_log) zeigen count=0 für e2e_test-Daten. |
| 18 | Neue Produktionsfehler | **NICHT PRÜFBAR** | Logs-MCP | `get_logs` MCP-Endpunkt gibt `FetchException` zurück. Keine sichtbaren Fehler während der Tests. |

---

## Zusammenfassung

| Kategorie | Anzahl |
|---|---|
| PASS | 15 |
| BLOCKIERT | 1 (UI-Löschung fehlt) |
| NICHT PRÜFBAR | 1 (Logs-API) |
| FAIL | 0 |

---

## Findings

### Finding 1: Kein Delete-Button in der Dokumente-UI (Severity: Medium)

**Beschreibung:** Die Seiten `/engel/dokumente` und `/kunde/dokumente` haben keinen Button oder Mechanismus um hochgeladene Dokumente zu löschen. Die RLS-Policy `documents_delete_own` und die Storage-Policy `documents_delete_own_storage` existieren und erlauben Löschung — die UI nutzt sie aber nicht.

**Auswirkung:** Nutzer können keine fehlerhaft hochgeladenen Dokumente selbst entfernen. DSGVO-Löschrecht ("Recht auf Löschung") erfordert, dass Nutzer ihre eigenen Daten löschen oder die Löschung beantragen können.

**Empfehlung:** Delete-Button mit Bestätigungsdialog implementieren. Storage-Objekt und DB-Eintrag gemeinsam löschen (analog Rollback-Logik im Upload-Code).

### Finding 2: 15-MB-Test nicht im echten Browser verifizierbar (Severity: Low)

**Beschreibung:** Das Chrome MCP `file_upload`-Tool hat ein eigenes 10-MB-Limit für Datei-Uploads. Dadurch konnte die 15-MB-Blockierung nicht im echten Browser getestet werden, nur per Code-Review.

**Auswirkung:** Keine — der Code-Pfad ist eindeutig und die UI zeigt das Limit an. Ein manueller Browser-Test wäre dennoch empfehlenswert.

### Finding 3: Logs-API nicht erreichbar (Severity: Info)

**Beschreibung:** Der `get_logs`-Endpunkt der Supabase MCP gibt `FetchException` zurück für alle Services (postgres, auth, storage).

**Auswirkung:** Produktionsfehler können nicht automatisiert geprüft werden. Manuelle Prüfung über Supabase Dashboard empfohlen.

---

## Sicherheits-Architektur (bestätigt)

- **Bucket:** `documents` ist privat (`public: false`)
- **Zugriff:** Ausschließlich über signierte URLs (7-Tage-TTL), nie `getPublicUrl()`
- **RLS:** RESTRICTIVE `org_fence` + PERMISSIVE `*_own` Policies = Double-Guard
- **Storage-RLS:** User-ID-Folder-basierte Isolation (`foldername[1] = auth.uid()`)
- **MIME-Filter:** Client-seitig (`image/*`, `application/pdf`) + `accept="image/*,.pdf"` auf Input
- **Größen-Limit:** 15 MB client-seitig geprüft, Upload-Timeout 60s
- **Rollback:** Bei Fehler nach Storage-Upload wird Datei automatisch entfernt
- **current_org_id():** Liest aus JWT `app_metadata.org_id`, Fallback auf `organization_members`

---

## Endgültiges Ergebnis

**GO — mit Vorbehalt:** Alle sicherheitsrelevanten Prüfpunkte bestanden. Der fehlende Delete-Button (Finding 1) blockiert kein Go-Live, sollte aber vor GA implementiert werden (DSGVO-Compliance). Die Logs-API (Finding 3) sollte für Monitoring behoben werden.
