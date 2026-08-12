# DEEP END-TO-END PRUEFUNG — Track A

**Datum:** 2026-08-10
**Branch:** `staging/expansion-abnahme`
**Basis:** 1462 Tests gruen, Build gruen, 0 TS-Fehler
**Audit-Scope:** 233 API-Routen, 27 Module, 8 Pruefkategorien

---

## Zusammenfassung

| Severity | Gefunden | Gefixt (App-Layer) | Offen (DB-Migration noetig) |
|----------|----------|--------------------|-----------------------------|
| P0       | 11       | 8                  | 3                           |
| P1       | 18       | 7                  | 11                          |
| P2       | 9        | 0                  | 9 (nur dokumentiert)        |

---

## KATEGORIE 1: Cross-Tenant Access (org_fence)

### P0 — GEFIXT

**1. Einsatzplanung GET — Cross-Tenant-Read via unscoped RPC**
- `app/api/einsatzplanung/route.ts` GET
- `get_calendar_assignments` RPC hat keinen `organization_id`-Parameter; RLS-Policies auf `assignments`/`clients`/`caregivers` pruefen nur Rolle, nicht Org
- **Fix:** RPC-Aufruf durch direkte Query mit `createAdminClient()` + explizitem `.eq('organization_id', organizationId)` ersetzt

**2. Admin-Pricing — Org-Admin kann plattformweite Preise aendern**
- `app/api/admin/pricing/route.ts`
- `checkAdmin()` erlaubte `admin` UND `superadmin`; `kf_pricing_*`-Tabellen haben kein `organization_id`
- **Fix:** Gate auf `profile.role !== 'superadmin'` eingeschraenkt

**3. SFTP-Key — Shared-DAS-Schreibzugriff**
- `app/api/admin/abrechnung/sftp-key/route.ts`
- `.or(organization_id.is.null)` erlaubte Schreiben auf globale Datenannahmestellen
- **Fix:** Reject wenn `das.organization_id` NULL

### P0 — GEFIXT

**4. Leistungsnachweis/CRUD POST — Unvalidiertes client_id/caregiver_id**
- `app/api/leistungsnachweis/crud/route.ts` POST
- client_id und caregiver_id aus Body ohne Org-Validierung akzeptiert
- **Fix:** Validierungs-Queries gegen `clients`/`caregivers` mit `.eq('organization_id', organizationId)` hinzugefuegt

**5. Workflow-Processing — Jeder Tenant-Admin triggert globale Verarbeitung**
- `app/api/ops/workflow/processing/route.ts`
- `requireOpsAdmin()` erlaubte jedem Org-Admin cross-org Workflow-Trigger
- **Fix:** Eingeschraenkt auf CRON_SECRET oder `superadmin`-Rolle

---

## KATEGORIE 2: RLS-Bypass (unscoped service_role)

### P0 — GEFIXT

**6. mis_audit_log — Alle Events landen in Stamm-Org**
- `lib/audit-log.ts`
- `createAdminClient()` (kein JWT) → `current_org_id()` Default = Stamm-Org UUID
- **Fix:** `organizationId` zu `AuditLogInput` hinzugefuegt; alle 4 Call-Sites (manage-role, reset-password, user/delete, user/delete/undo) uebergeben jetzt die richtige Org

### P1 — NUR DOKUMENTIERT (DB-Migration noetig)

**7. Billing-Referenztabellen ohne RLS**
- `billing_feiertage`, `billing_leistungsarten`, `billing_rechtsgrundlagen`, `billing_tarifquellen`
- Kein `ENABLE ROW LEVEL SECURITY`, potentiell anon-schreibbar
- **Fix noetig:** `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + read-only Policy fuer `authenticated`

**8. Rollback-Archiv-Tabellen ohne RLS**
- `billing_landesregeln_archiv`, `billing_obergrenzen_archiv`, `billing_wegepauschalen_archiv`, `state_settings_audit_archiv`, `state_waitlist_archiv`
- `CREATE TABLE AS` traegt kein RLS ueber
- **Fix noetig:** RLS enablen falls Rollback-Migrationen je auf Prod liefen

---

## KATEGORIE 3: API-Autorisierung

### P1 — GEFIXT

**9. Referral-Complete — Bonus ohne Buchung**
- `app/api/referral/complete/route.ts`
- Kein Check ob der referred User tatsaechlich eine Buchung abgeschlossen hat
- **Fix:** Booking-Existenz-Pruefung (`bookings.status = 'completed'`) vor Bonus-Vergabe

**10. Ops-Nachrichten — Jeder Org-Member liest fremde Nachrichten**
- `lib/ops/nachrichten.ts` `getNachricht()`
- Nur Org-Scope, kein Sender/Empfaenger-Check
- **Fix:** `userId`-Parameter hinzugefuegt; prueft ob Caller `absender_id` oder `empfaenger_id` ist

**11. Ops-Nachrichten-Antwort — Eltern-Nachricht nicht validiert**
- `lib/ops/nachrichten.ts` `createAntwort()`
- `elternId` wurde ohne Existenz-/Org-Pruefung als FK verwendet
- **Fix:** Parent-Lookup mit `.eq('organization_id', ...)` vor Insert

**12. SFTP-Test — Shared-DAS-Zugriff**
- `app/api/admin/abrechnung/sftp-test/route.ts`
- Selbes `.or(organization_id.is.null)` Pattern wie sftp-key
- **Fix:** Reject wenn `organization_id` NULL

### P1 — NUR DOKUMENTIERT

**13. 7 Admin-Routen ohne Audit-Trail**
- `admin/abrechnung/sftp-key`, `admin/abrechnung/zertifikat`, `admin/clients` POST, `admin/angehoerige` POST/PATCH, `admin/signaturen/[id]` PATCH, `admin/krankenfahrten` PUT, `admin/invoices/[id]/generate-pdf`
- Zustandsaendernde Operationen ohne `logAuditEvent()` / eigenes Audit

**14. admin_login/data_export/rate_limit_reset — Nie gefeuert**
- AuditAction-Typen deklariert aber nie aufgerufen; kein Login-Audit moeglich (Auth laeuft client-seitig)

---

## KATEGORIE 4: Race Conditions & Idempotenz

### P0 — NUR DOKUMENTIERT (DB-Migration/RPC noetig)

**15. allocatePayment — Lost-Update-Race**
- `lib/billing/core/payments.ts`
- Read-then-write ohne SELECT FOR UPDATE; parallele Zuordnungen koennen Rechnungs-Status inkonsistent setzen
- **Fix noetig:** Transaktionale RPC mit SELECT FOR UPDATE

**16. erstelleAbrechnungslauf — TOCTOU Duplikat-DAKOTA**
- `lib/abrechnung/kassenabrechnung-engine.ts`
- Duplikat-Check + Insert nicht atomar; parallele Requests koennen doppelte Abrechnungslaeufe erzeugen
- **Fix noetig:** Atomare RPC oder UNIQUE Constraint

**17. Workflow-RPCs — Fehlende CAS-Atomitaet**
- `wf_process_event`/`wf_execute_queue_item`
- UPDATE ohne `AND status = 'neu'/'wartend'` (Compare-and-Swap)
- **Fix noetig:** CAS-Bedingung in RPCs

### P1 — NUR DOKUMENTIERT

**18. Tour-Stop-Completion — Doppelte service_records**
- `service_records` hat keinen UNIQUE-Constraint auf `assignment_id` oder `(caregiver_id, client_id, date, start_time)`
- Double-Tap/Retry erzeugt doppelte Abrechnungszeilen

**19. Einsatzplanung Overlap-Trigger — Cross-Type-Luecke**
- `check_assignment_overlap` vergleicht nur dated-vs-dated und recurring-vs-recurring, nicht cross-type

---

## KATEGORIE 5: Billing-Logik-Korrektheit

### P0 — GEFIXT

**20. EDIFACT einzelpreis_cent — Doppelte Berechnung**
- `lib/abrechnung/kassenabrechnung-engine.ts` + `app/api/billing/dta/dry-run/route.ts`
- `euroZuCent(r.amount)` ist Gesamtbetrag, nicht Stueckpreis; EDIFACT multipliziert erneut mit `menge`
- **Fix:** `einzelpreisCent = gesamtCent / menge`

**21. allocatePayment — Terminal-Status-Bypass**
- `lib/billing/core/payments.ts`
- Keine Pruefung ob Rechnung in `bezahlt`/`storniert`/`akzeptiert`
- **Fix:** `isTerminalStatus()` Guard vor Zuordnung

**22. allocatePayment — Ueberzahlung clobbered**
- `lib/billing/core/payments.ts`
- Sequentielle If-Kette: `ueberzahlung` wurde von `sammelzahlung_anteil` ueberschrieben
- **Fix:** If-Reihenfolge korrigiert, `ueberzahlung` hat Vorrang

**23. Gutschrift-Aggregat — Unbegrenzte Credits**
- `lib/billing/core/invoice-engine.ts` `createCreditNote()`
- Keine Summe bestehender Gutschriften; Gesamtbetrag konnte Original uebersteigen
- **Fix:** Aggregat-Query auf `invoice_corrections` + Restbetrag-Cap

**24. correctInvoice/createCreditNote — Storniert-Status nicht geprueft**
- `lib/billing/core/invoice-engine.ts`
- Korrekturen/Gutschriften auf stornierte Rechnungen moeglich
- **Fix:** Status-Guard `storniert`/`bezahlt` vor Aktion

---

## KATEGORIE 6: Offline-Sync & Verschluesselung

### P0 — GEFIXT

**25. Encryption-Facade — Klartext neben Ciphertext**
- `lib/offline/offline-store.ts` `encryptItem()`
- `{ ...item, _encrypted }` speicherte alle Felder im Klartext plus verschluesselten Blob
- **Fix:** Nur Index-Felder (`id`, `status`, `idempotency_key`, `entity_typ`) + `_encrypted`

### P0 — NUR DOKUMENTIERT

**26. Native Offline-Queue — Keine Verschluesselung**
- `native/src/lib/offline-queue.ts`
- AsyncStorage speichert PHI-Daten im Klartext; kein AES/SecureStorage
- **Fix noetig:** Expo SecureStore oder Encrypted AsyncStorage-Wrapper

---

## KATEGORIE 7: Modul-spezifische Pruefung

### P0 — GEFIXT

**27. Signatur-Ablehnung — Kein Status-Guard**
- `lib/signaturen/signaturen.ts` `lehneSignaturAb()`
- Bereits signierte Signaturen konnten auf `abgelehnt` gesetzt werden
- **Fix:** Status-Check `status !== 'offen'` vor Update

**28. Native Signatures — Stille Ueberschreibung**
- `app/api/native/signatures/route.ts`
- `upsert` ueberschrieb bestehende Unterschriften ohne Warnung
- **Fix:** Existenz-Check + 409 Conflict statt upsert

### P1 — NUR DOKUMENTIERT

**29. Signatur-Dokument-Hash — Nie serverseitig verifiziert**
- `lib/signaturen/signaturen.ts` `erstelleDokument()`
- `verifiziereDokumentHash()` ist definiert aber nie aufgerufen; Client kann falschen Hash einreichen

**30. Tourenplanung — Orphaned Assignments**
- `lib/touren/server.ts` + `app/api/tours/route.ts`
- Assignments werden vor Verfuegbarkeits-Check erstellt; bei 422-Abbruch bleiben sie als Waisen

**31. Medikamente — medikament_id/client_id Mismatch**
- `lib/medikamente/medikamente.ts` `erfasseEingabe()`
- Kein Check ob Medikament zum selben Client gehoert

**32. Vitalwerte — Admin-Korrektur ohne Audit-Trail**
- `lib/vitals/vitals.ts` `updateVital()`
- Ueberschreiben von Messwerten ohne History-Tabelle

**33. Leistungsnachweis-PDF — Falsche Firma/IK fuer Nicht-Stamm-Orgs**
- `lib/abrechnung/leistungsnachweis-pdf.ts` `loadLeistungsnachweis()`
- `organizationId` nicht uebergeben, Default = Stamm-Org

**34. Personal — Selbst-Genehmigung moeglich**
- `lib/personal/abwesenheiten.ts` `genehmigenAbwesenheit()`
- Kein Check `genehmigenVon !== caregiver.user_id`

**35. Personal — Urlaubskonto nicht synchronisiert**
- `personal_urlaubskonto.genommen_tage` wird nur manuell aktualisiert, nicht durch Absenz-Genehmigung

---

## KATEGORIE 8: Audit-Log-Vollstaendigkeit

### GEFIXT
- mis_audit_log organization_id (P0, siehe #6)

### NUR DOKUMENTIERT
- 7 Admin-Routen ohne Audit (P1, siehe #13)
- admin_login/data_export nie gefeuert (P1, siehe #14)
- Billing-Checksum nie automatisch verifiziert (P2)

---

## P2 — Nur dokumentiert (Hardening)

| # | Beschreibung | Datei |
|---|-------------|-------|
| P2-1 | coach_shares Schema-only, kein Code | lib/coach/, 20260819010000 |
| P2-2 | Angehoerigenzugang family-facing nicht implementiert | lib/angehoerige/ |
| P2-3 | PZN-Validierung nur Format, keine Checksum | lib/medikamente/ |
| P2-4 | push/send Vergleich nicht constant-time | app/api/push/send |
| P2-5 | Cron review-request + drip ohne Org-Scope | app/api/cron/, app/api/drip/ |
| P2-6 | Expansion/status — org-UUID Enumeration | app/api/expansion/status |
| P2-7 | Billing-Checksum computed nie verified | lib/billing/core/audit.ts |
| P2-8 | OCR — RLS/Cookie org_id Divergenz bei Multi-Org-User | app/api/admin/ocr/ |
| P2-9 | Leistungsnachweis lock detection via Error-String | app/api/leistungsnachweis/crud |

---

## Test-Ergebnis nach Fixes

```
Test Files  66 passed | 1 skipped (67)
Tests       1462 passed | 29 skipped (1491)
Duration    6.30s
```

Keine Regressionen.

---

## Geaenderte Dateien

### P0-Fixes
1. `lib/abrechnung/kassenabrechnung-engine.ts` — EDIFACT einzelpreis_cent
2. `app/api/billing/dta/dry-run/route.ts` — EDIFACT einzelpreis_cent (Duplikat)
3. `lib/offline/offline-store.ts` — Encryption-Facade
4. `lib/billing/core/payments.ts` — Terminal-Status + Ueberzahlungs-Klassifikation
5. `lib/billing/core/invoice-engine.ts` — Storniert-Guard + Gutschrift-Aggregat
6. `app/api/ops/workflow/processing/route.ts` — Superadmin/CRON Gate
7. `app/api/leistungsnachweis/crud/route.ts` — client_id/caregiver_id Org-Validierung
8. `lib/audit-log.ts` — organizationId-Feld + Insert
9. `app/api/admin/manage-role/route.ts` — organizationId an Audit
10. `app/api/admin/reset-password/route.ts` — organizationId an Audit
11. `app/api/user/delete/route.ts` — organizationId an Audit
12. `app/api/user/delete/undo/route.ts` — organizationId an Audit
13. `lib/signaturen/signaturen.ts` — lehneSignaturAb Status-Guard
14. `app/api/native/signatures/route.ts` — Ueberschreibungs-Schutz
15. `app/api/admin/pricing/route.ts` — Superadmin-Only
16. `app/api/admin/abrechnung/sftp-key/route.ts` — Shared-DAS Reject
17. `app/api/einsatzplanung/route.ts` — GET Org-Filter

### P1-Fixes
18. `lib/ops/nachrichten.ts` — Sender/Empfaenger-Check + Parent-Validierung
19. `app/api/ops/nachrichten/[id]/route.ts` — userId durchreichen
20. `app/api/referral/complete/route.ts` — Booking-Verifikation
21. `app/api/admin/abrechnung/sftp-test/route.ts` — Shared-DAS Reject
22. `__tests__/ops/nachrichten.test.ts` — Test-Erwartung angepasst
