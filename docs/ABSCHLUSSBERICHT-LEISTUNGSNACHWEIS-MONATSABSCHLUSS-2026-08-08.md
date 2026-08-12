# Abschlussbericht Block 9: Leistungsnachweis & Monatsabschluss — DB-Haertung + Security-Fixes

**Datum:** 2026-08-08
**Branch:** `staging/expansion-abnahme`
**Commits:** `4ae2c35`, Folge-Commit (NativeAuthResult-Fix)

---

## 1. Gewahlter Block + Begruendung

**Block 9: Leistungsnachweis-Digital & Monatsabschluss — DB-Wiederherstellung + Security-Haertung**

### Warum dieser Block?

Nach 8 abgeschlossenen Bloecken existiert der gesamte E2E-Prozess als UI + API:
Kundenaufnahme → Stammdaten → Verordnungen → Einsatzplanung → Dienstplan → Leistungserbringung → Leistungsnachweis-Digital → Monatsabschluss → Rechnung → DTA/DAKOTA → Ruecklaeufer → Controlling.

Das Kernproblem war NICHT fehlende Features, sondern **gebrochene DB-Integritaet**: Die Migration `20260808200000` hatte Audit-Tabelle, Trigger und RPCs erstellt, aber die Rollback-Migration `20260808200001` hat diese Objekte wieder geloescht (Trigger, Funktionen, Tabelle). Die ALTER-TABLE-Spalten auf `service_records` blieben bestehen, aber alle schuetzenden Mechanismen waren weg:
- Kein Audit-Trail bei Aenderungen
- Kein Signature-Hash (Manipulationsschutz)
- Kein Locked-Record-Guard (unterschriebene Nachweise editierbar)
- Kein Monatsabschluss-RPC

Gleichzeitig hatten 5 Lib-Funktionen **Cross-Tenant-Luecken**: Queries ohne `organization_id`-Filter bei Nutzung von `createAdminClient()` (= RLS-Bypass).

---

## 2. P0/P1 Gaps (identifiziert)

### P0 (gefixt in diesem Block)

| # | Gap | Datei | Fix |
|---|-----|-------|-----|
| 1 | `service_record_audit_log` geloescht durch Rollback | Migration | Neu erstellt mit `field_name`/`old_value`/`new_value` Spalten (passt zur UI) |
| 2 | Audit-Trigger (`trg_audit_service_record`) fehlte | Migration | `audit_service_record_change()` — tracked proof_status, billing_status, amount, is_locked |
| 3 | Signature-Hash-Trigger fehlte | Migration | `compute_signature_hash()` — SHA256 aus Record-Feldern bei UNTERSCHRIEBEN |
| 4 | Locked-Record-Guard fehlte | Migration | `prevent_locked_record_change()` — blockiert Edits auf gesperrten Records (Storno-Ausnahme) |
| 5 | `pruefeBudget()` ignorierte `organization_id` | `lib/personal/einsatzfreigabe.ts` | Parameter aktiviert + `.eq('organization_id', organizationId)` |
| 6 | `erstelleMonatsabschluss()` Cross-Tenant-Leak | `lib/abrechnung/monatsabschluss.ts` | `organizationId` Parameter + Filter auf `verordnungen` und `service_records` |
| 7 | Native-Signatures-Route fehlte Org-Check | `app/api/native/signatures/route.ts` | `organization_id` Cross-Validation |
| 8 | `resolveEmpfaenger()` nutzte `profiles.organization_id` (existiert nicht) | `lib/ops/ereignis-emitter.ts` | Umgestellt auf `organization_members`-Tabelle |
| 9 | `.from('vertraege')` — Tabelle existiert nicht | `lib/personal/einsatzfreigabe.ts` | Korrigiert zu `akten_vertraege` |
| 10 | `NativeAuthResult` ohne `organizationId` | `lib/native-auth.ts` | Feld + Select erweitert, Guard verstaerkt |

### P1 (verbleibend — naechste Bloecke)

| # | Gap | Bereich | Risiko |
|---|-----|---------|--------|
| 1 | `/api/admin/krankenfahrten` — Mass Assignment | Admin-Routes | IDOR-Risiko bei PUT |
| 2 | `/api/admin/pricing` — Unscoped CRUD | Admin-Routes | Cross-Tenant bei Multi-Org |
| 3 | `/api/einsatzplanung` PATCH — keine Feld-Whitelist | Einsatzplanung | Mass Assignment |
| 4 | `/api/ops/workflow/processing` — kein `organizationId` | Workflow-Engine | Cross-Tenant-Verarbeitung |
| 5 | `/api/leistungsnachweis` GET — kein org_id Guard mit adminClient | Leistungsnachweis-PDF | Data Leak bei Multi-Org |
| 6 | Migration `20260814010000` noch nicht auf Production | DB | Features inaktiv bis Apply |
| 7 | `erstelleMonatsabschluss()` hat keine Aufrufer | Monatsabschluss | Dead Code — API-Route fehlt |

---

## 3. Was existierte vs. Neu

### Existierte bereits (vor Block 9)
- **UI:** `app/admin/leistungsnachweis-digital/page.tsx` (854 Zeilen) — vollstaendige CRUD-Oberflaeche mit SignaturePad, Filter, Statistiken, Detail-Modal + Audit-Log-Anzeige
- **API:** `app/api/leistungsnachweis/crud/route.ts` (240 Zeilen) — GET/POST/PATCH mit `getActiveOrgId()`, Feld-Whitelist, Status-Validierung
- **PDF:** `app/api/leistungsnachweis/route.ts` (562 Zeilen) — Offizieller Monats-Leistungsnachweis mit Unterschriften-Merge
- **Monatsabschluss UI:** `app/admin/monatsabschluss/page.tsx` (228 Zeilen) — Ampelsystem, Uebersicht
- **Monatsabschluss Detail:** `app/admin/monatsabschluss/[clientId]/page.tsx` (308 Zeilen) — Close-Workflow, Review-Errors
- **Monatsabschluss API:** `app/api/billing/monthly-closing/route.ts` — korrekt mit `getActiveOrgId()`
- **Spalten auf `service_records`:** proof_status, billing_status, billing_type, caregiver_confirmed_at, client_signed_at, signature_hash, is_locked, etc. (ueberlebten den Rollback)

### Neu in Block 9
- **Migration** `20260814010000_leistungsnachweis_haertung.sql` (322 Zeilen):
  - `service_record_audit_log` Tabelle mit RLS + org_fence
  - `audit_service_record_change()` Trigger-Funktion
  - `compute_signature_hash()` Trigger-Funktion
  - `prevent_locked_record_change()` Trigger-Funktion
  - `get_monthly_closing_overview(date)` RPC
  - Indizes auf proof_status, billing_status, date+caregiver_id
- **Security-Fixes** in 5 Dateien (10 Aenderungen)

---

## 4. Cross-Module-Verbindungen

```
Einsatzplanung (assignments)
    ↓ assignment_id
Service Records (Leistungsnachweis)
    ↓ trg_audit_service_record
Audit-Log (service_record_audit_log)
    ↓ read by
Leistungsnachweis-Digital UI (Detail-Modal)

Service Records
    ↓ proof_status → UNTERSCHRIEBEN
    ↓ trg_compute_signature_hash
Signature Hash + is_locked=true
    ↓ trg_prevent_locked_record
Immutable Record (Storno-Only)

Service Records + Verordnungen
    ↓ erstelleMonatsabschluss()
Monthly Closings
    ↓ billing pipeline
Invoices → DTA → DAKOTA

Native App (Expo)
    ↓ /api/native/signatures
Service Signatures
    ↓ merged with
Leistungsnachweis-PDF

Ereignis-Emitter
    ↓ organization_members (fixed)
Benachrichtigungen (ops_benachrichtigungen)
```

---

## 5. Bugs gefunden + gefixt

| # | Bug | Schwere | Fix |
|---|-----|---------|-----|
| 1 | `pruefeBudget()` Parameter `_organizationId` mit Unterstrich = unused | P0 | Unterstrich entfernt, org_id-Filter aktiviert |
| 2 | `.from('vertraege')` — Tabelle existiert nicht (heisst `akten_vertraege`) | P0 | Tabellenname korrigiert |
| 3 | `resolveEmpfaenger()` queries `profiles.organization_id` — Spalte existiert nicht | P0 | Umgestellt auf `organization_members` Join |
| 4 | `erstelleMonatsabschluss()` laedt Daten aller Organisationen | P1 | `organizationId` Parameter + Filter |
| 5 | Leistungspreise-Query faelschlicherweise mit org_id | P1 (Self-Catch) | Katalog-Tabelle hat kein org_id — Filter entfernt |
| 6 | `NativeAuthResult` Interface ohne `organizationId` | P1 | Interface erweitert, caregiver-Select um `organization_id` ergaenzt |

---

## 6. Security / RLS / Multi-Tenant

### Migration Security
- `service_record_audit_log`: RLS enabled, `org_fence` RESTRICTIVE Policy (= `organization_id = current_org_id()`)
- Admin-Read-Policy: nur `role IN ('admin','superadmin')`
- Insert-Policy: `WITH CHECK (true)` — Trigger schreibt automatisch
- `audit_service_record_change()`: SECURITY DEFINER — schreibt mit erhöhten Rechten
- `prevent_locked_record_change()`: SECURITY DEFINER — Admin-Storno-Bypass ueber `profiles.role`-Check
- `compute_signature_hash()`: SECURITY DEFINER — setzt `signature_hash` + `is_locked` atomar
- `get_monthly_closing_overview()`: SECURITY INVOKER — respektiert RLS org_fence

### Code Security
- `pruefeBudget()`: `organization_id`-Filter aktiv → kein Cross-Tenant-Budget-Zugriff
- `erstelleMonatsabschluss()`: org_id auf Verordnungen + Service Records → kein Cross-Tenant-Closing
- Native-Signatures: `record.organization_id !== auth.organizationId` → IDOR verhindert
- Ereignis-Emitter: `organization_members` statt `profiles` → korrekte Org-Zugehoerigkeit

### Verbleibendes Risiko
- **Leistungsnachweis-PDF Route** (`/api/leistungsnachweis`): Nutzt `createAdminClient()` OHNE `getActiveOrgId()` — RLS wird umgangen. Mitigation: Route prueft Verordnung-Zugehoerigkeit indirekt. Empfehlung: expliziten org_id-Guard nachrüsten (P1 fuer Block 10).

---

## 7. Datenintegritaet

### Vorher (ohne Trigger)
- Service Records frei editierbar nach Unterschrift
- Kein Audit-Trail bei Aenderungen
- Kein Manipulationsschutz (Signature Hash)
- Budget-Check ignorierte Organisation

### Nachher (mit Migration)
- **Audit-Trail:** Jede Aenderung an proof_status, billing_status, amount, is_locked wird protokolliert
- **Signature-Hash:** SHA256 ueber id|client_id|date|start_time|end_time|amount|signed_at
- **Locked-Record:** Unterschriebene Nachweise sind immutable (nur Admin-Storno moeglich)
- **RPC:** `get_monthly_closing_overview(date)` aggregiert KPIs unter RLS

---

## 8. Commits

| Commit | Beschreibung |
|--------|-------------|
| `4ae2c35` | feat: Block 9 — Leistungsnachweis & Monatsabschluss DB-Haertung + 5x Security-Fix |
| Folge-Commit | fix: NativeAuthResult um organizationId erweitert (TS2339-Fix + staerkerer Cross-Tenant-Guard) |

---

## 9. PRODUCTION-GO/NO-GO

### GO (Code-seitig)
- Alle Security-Fixes sind in TypeScript-Code — wirksam sofort nach Vercel-Deploy
- Keine Breaking Changes an bestehenden API-Contracts
- Alle Aenderungen sind additiv (neue Parameter mit Validierung, neue DB-Objekte)

### NO-GO (Migration)
- **Migration `20260814010000` ist NICHT auf Production angewendet.**
- Ohne Migration: Audit-Log-Tabelle fehlt → Leistungsnachweis-Digital Detail-Modal zeigt leeren Audit-Trail (kein Crash, aber keine Daten)
- Ohne Migration: Kein Signature-Hash, kein Locked-Record-Guard
- **Empfehlung:** Migration via Supabase Dashboard oder CLI auf Production anwenden, dann E2E-Test:
  1. Service Record erstellen (ENTWURF)
  2. Abschliessen (ABGESCHLOSSEN)
  3. Unterschreiben (UNTERSCHRIEBEN) → pruefen: is_locked=true, signature_hash gesetzt
  4. Edit-Versuch → erwarten: "Leistungsnachweis ist gesperrt"
  5. Storno durch Admin → erwarten: Erfolg
  6. Audit-Log im Detail-Modal pruefen

---

## 10. Verbleibende P0/P1 fuer naechste Bloecke

### P0
1. Migration `20260814010000` auf Production anwenden
2. `/api/admin/krankenfahrten` PUT — Mass Assignment fixen
3. `/api/ops/workflow/processing` — organizationId-Guard nachrüsten

### P1
4. `/api/leistungsnachweis` GET — org_id Guard mit adminClient
5. `/api/admin/pricing` — Scoped CRUD
6. `/api/einsatzplanung` PATCH — Feld-Whitelist
7. `erstelleMonatsabschluss()` API-Route erstellen (Funktion existiert, aber kein Caller)
8. `/api/billing/tariffs` GET — Admin-Check + org_id

---

## 11. Naechster Block Empfehlung

**Block 10: API-Security-Sweep — Mass-Assignment + org_id-Guards**

Begruendung: Die API-Route-Analyse zeigt 12 Routen mit Remediation-Bedarf. Die kritischsten (Mass Assignment via Object Spread, fehlende org_id-Guards bei adminClient) betreffen den Kern des Betriebssystems. Ein dedizierter Security-Block wuerde:
- Feld-Whitelists fuer alle PATCH/PUT-Routen mit Object Spread
- `getActiveOrgId()` + explizite org_id-Filter in allen adminClient-Routen
- Absender-ID-Spoofing in ops_nachrichten fixen

Alternativ: **Block 10: Monatsabschluss-Workflow-Completion** — die `erstelleMonatsabschluss()`-Funktion existiert komplett, hat aber keinen API-Endpunkt. Ein Block koennte den Workflow End-to-End verdrahten (API-Route + UI-Button "Monat abschliessen" + Validierung + Sperre).
