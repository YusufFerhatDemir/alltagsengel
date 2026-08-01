# Phase 2 — Widersprüche

**Audit-Datum:** 01.08.2026

---

## W-01: SECON „fertig" vs. „deferred"

| Feld | Inhalt |
|------|--------|
| **Behauptung A** | SECON-Verschlüsselung ✅ Fertig (App-Status-Report Alltagsengel) |
| **Behauptung B** | SECON deferred (App-Status-Report efy care) |
| **Tatsächlicher Codezustand** | **Alltagsengel:** Implementiert — `lib/abrechnung/secon.ts` enthält `verschluesseln()`, `entschluesseln()`, `verifySignatur()`, `ladeIdentitaet()`, `ikAusZertifikat()`. Round-Trip-Tests in `secon.test.ts` (3 Tests). Nutzt `node-forge` für PKCS#12, RSA-2048, SHA-256. **efy care:** NICHT implementiert — 30 Dateien referenzieren SECON als UI-Text/Kommentare, aber keine Crypto-Bibliothek importiert, keine Signatur-/Verschlüsselungsfunktionen vorhanden. |
| **Beweis** | `lib/abrechnung/secon.test.ts` Zeile 30-57 (Alltagsengel). `grep -r "secon\|encrypt\|decrypt" efy-care/app/src/` zeigt nur UI-Labels. |
| **Risiko** | **KRITISCH** — efy care kann keine EDIFACT-Dateien elektronisch übermitteln |
| **Erforderliche Korrektur** | SECON-Modul aus Alltagsengel nach efy care portieren, oder beide Apps auf eine gemeinsame Bibliothek umstellen |

---

## W-02: Multi-Mandant „komplett codiert" vs. „nicht auf Prod"

| Feld | Inhalt |
|------|--------|
| **Behauptung A** | Multi-Mandant komplett codiert — organizations, members, subscriptions, org_id auf 63 Tabellen |
| **Behauptung B** | Migration NICHT auf Prod-DB angewendet |
| **Tatsächlicher Codezustand** | **Alltagsengel:** Migration `20260801_phase3_multi_mandant_saas.sql` existiert (375 Zeilen), fügt org_id auf alle Tabellen hinzu, erstellt Seed-Organisation. Aber: Migration ist NICHT auf der Supabase-Prod-DB ausgeführt. Code in `lib/organizations/` nutzt `DEFAULT_ORG_ID`. **efy care:** Migration `20260801150000_multi_mandant_organizations.sql` existiert. Ebenfalls NICHT auf Prod. Zusätzlich: 9 RLS-Policies sind NICHT auf org_id aktualisiert — cross-tenant Datenleaks möglich bei Aktivierung. |
| **Beweis** | `20260801_phase3_multi_mandant_saas.sql` Zeile 63 (Alltagsengel). efy care: `audit_logs`, `action_fingerprints`, `sync_conflicts`, `offline_queue`, `device_sessions`, `caregivers`, `service_visits`, `quality_measures` — INSERT/UPDATE-Policies prüfen kein org_id. |
| **Risiko** | **KRITISCH** — Bei Migration ohne RLS-Fix: Mandantenvermischung |
| **Erforderliche Korrektur** | 1. Alle 9 RLS-Policies in efy care fixen. 2. Automatische Tenant-Escape-Tests erstellen. 3. Migration zuerst auf Staging testen. 4. Erst dann Prod-Migration mit expliziter Freigabe. |

---

## W-03: EDIFACT „implementiert/fertig" aber keine Tests

| Feld | Inhalt |
|------|--------|
| **Behauptung A** | EDIFACT-Abrechnung ✅ Fertig |
| **Behauptung B** | Gleichzeitig: keine Tests vorhanden |
| **Tatsächlicher Codezustand** | **Alltagsengel:** `lib/abrechnung/edifact-generator.ts` generiert echte EDIFACT-Segmente (UNB, UNH, etc.). `edifact-validator.ts` prüft IK-Prüfziffern. Aber: 0 automatisierte Tests für EDIFACT. **efy care:** `app/src/features/abrechnung/edifact.ts` generiert Segment 105. Ebenfalls 0 Tests. |
| **Beweis** | `grep -r "edifact" alltagsengel/lib/abrechnung/` → Generator + Validator existieren. `find . -name "*.test.*" -path "*/edifact*"` → 0 Ergebnisse. |
| **Risiko** | **HOCH** — Fehlerhafte EDIFACT-Dateien führen zu Abrechnungsablehnung durch Datenannahmestelle |
| **Erforderliche Korrektur** | Golden-Master-Tests erstellen (gültige Datei, ungültige Segmentreihenfolge, fehlende Pflichtfelder, falsche IK-Prüfziffer, etc.) |

---

## W-04: „30+ Tabellen" vs. „63 Tabellen"

| Feld | Inhalt |
|------|--------|
| **Behauptung A** | efy care: 30+ Tabellen |
| **Behauptung B** | Alltagsengel: org_id auf 63 Tabellen |
| **Tatsächlicher Codezustand** | **efy care:** 10 Migrationsdateien, ~41 Tabellen (gezählt aus CREATE TABLE Statements). **Alltagsengel:** 37 Migrationsdateien, ~50+ Tabellen. Die „63 Tabellen" bezieht sich auf die Anzahl existierender Tabellen, auf die der Multi-Mandant-Backfill org_id hinzufügen soll — das schließt auch Views, System-Tabellen und ältere Tabellen ein. |
| **Beweis** | `ls supabase/migrations/*.sql | wc -l` → 37 (Alltagsengel), 10 (efy care). Phase3-Migration listet 63 ALTER TABLE Statements. |
| **Risiko** | **MITTEL** — Verwirrung, aber kein direktes Sicherheitsrisiko |
| **Erforderliche Korrektur** | Exakte Tabellenliste dokumentieren. Verifizieren, welche Tabellen tatsächlich auf Prod existieren vs. nur in Migrations-Dateien. |

---

## W-05: „Deployed" ≠ Produktionsbereit

| Feld | Inhalt |
|------|--------|
| **Behauptung A** | Features sind „fertig" oder „deployed" |
| **Behauptung B** | Kein Feature hat: automatisierte Tests, Staging-Tests, externe Annahmetests |
| **Tatsächlicher Codezustand** | Alltagsengel hat 6 Testdateien (3 Unit + 3 E2E). efy care hat 0. Kein CI/CD-Pipeline für Alltagsengel (nur ChairMatch-Workflow). Keine Staging-Umgebung dokumentiert. Kein Feature wurde extern validiert. |
| **Beweis** | `.github/workflows/` enthält nur `deploy-chairmatch.yml`. Keine `jest.config.*` oder `vitest.config.*` in Root (Alltagsengel). |
| **Risiko** | **HOCH** — Jede Änderung kann unbemerkt bestehende Funktionalität brechen |
| **Erforderliche Korrektur** | Status-Stufen einführen: im Code → kompiliert → lokal getestet → automatisiert getestet → staging → extern → produktionsbereit |

---

## W-06: Kalender, Nachrichten, Suche „möglicherweise unvollständig"

| Feld | Inhalt |
|------|--------|
| **Behauptung A** | 28 Screens gebaut, 5 Tabs |
| **Behauptung B** | 3 Tabs „möglicherweise unvollständig" |
| **Tatsächlicher Codezustand** | **Definitiv Platzhalter.** `kalender.tsx` und `nachrichten.tsx` enthalten hardcodierte Arrays mit Fake-Daten. `suche.tsx` zeigt statischen Platzhalter. Keine Supabase-Queries, keine echte Funktionalität. |
| **Beweis** | `app/src/app/(tabs)/kalender.tsx` — hardcodierte Termine. `app/src/app/(tabs)/nachrichten.tsx` — hardcodierte Nachrichten. |
| **Risiko** | **NIEDRIG** (kein Sicherheitsrisiko) aber **MITTEL** für Produktionsreife |
| **Erforderliche Korrektur** | Status korrekt als „Platzhalter" kennzeichnen. Echte Implementierung planen. |

---

## W-07: database.types.ts und config.toml fehlen

| Feld | Inhalt |
|------|--------|
| **Behauptung A** | Beides fehlt |
| **Tatsächlicher Codezustand** | **database.types.ts:** Fehlt in Alltagsengel. Supabase-Queries haben keine Typ-Sicherheit. **config.toml:** Fehlt in beiden Projekten. Supabase CLI kann ohne config.toml nicht lokal entwickeln/testen. |
| **Beweis** | `find alltagsengel -name "database.types.ts"` → 0. `find efy-care -name "config.toml"` → 0. |
| **Risiko** | **MITTEL** — Keine Typ-Sicherheit bei DB-Queries, kein lokales Supabase-Testing möglich |
| **Erforderliche Korrektur** | `supabase gen types typescript` ausführen, config.toml für beide Projekte erstellen |

---

## W-08: WhatsApp-Webhook „ohne Signaturverifizierung"

| Feld | Inhalt |
|------|--------|
| **Behauptung A** | WhatsApp-Webhook hat keine Signaturverifizierung |
| **Tatsächlicher Codezustand** | **FALSCH — Signatur IST implementiert.** `app/api/whatsapp/webhook/route.ts` Zeile 45-65: `verifyMetaSignature()` nutzt HMAC-SHA256 mit `WHATSAPP_APP_SECRET`, `timingSafeEqual()` und **Fail-Closed** (lehnt ab wenn Secret fehlt). |
| **Beweis** | `route.ts:45` → `function verifyMetaSignature(rawBody, signatureHeader)`, `route.ts:57` → `createHmac('sha256', appSecret)`, `route.ts:53` → Fail-Closed Kommentar |
| **Risiko** | **NIEDRIG** — Implementierung ist korrekt |
| **Erforderliche Korrektur** | Keine — aber automatisierte Tests hinzufügen (gültige Signatur, ungültige Signatur, fehlendes Secret) |

---

## W-09: „Keine vollständige CI/CD-Pipeline"

| Feld | Inhalt |
|------|--------|
| **Behauptung A** | Möglicherweise keine CI/CD |
| **Tatsächlicher Codezustand** | **Bestätigt.** `.github/workflows/` enthält nur `deploy-chairmatch.yml` — einen Workflow für ein anderes Projekt. Alltagsengel nutzt nur `deploy.sh` (Precommit-Guards, Typecheck warn-only, Push). efy care hat kein CI/CD. |
| **Beweis** | `ls .github/workflows/` → nur `deploy-chairmatch.yml`. `deploy.sh` hat Typecheck (warn-only), Secret-Scanner, aber keine Tests. |
| **Risiko** | **HOCH** — Kein automatischer Quality-Gate vor Deployment |
| **Erforderliche Korrektur** | GitHub Actions Workflow für beide Projekte erstellen mit: Typecheck, Lint, Tests, Security-Scan, Build |

---

## NEU ENTDECKTE WIDERSPRÜCHE

### W-10: Admin-Routen ohne serverseitigen Schutz

| Feld | Inhalt |
|------|--------|
| **Behauptung A** | Admin-Dashboard mit rollenbasierter Auth |
| **Tatsächlicher Codezustand** | **Kein middleware.ts vorhanden.** Admin-Seiten sind nur durch einen Client-seitigen React-Hook geschützt. Jeder mit der URL kann die Admin-Seite laden — der Schutz greift erst nach dem Client-Rendering. |
| **Beweis** | `find alltagsengel -name "middleware.ts"` → 0 Ergebnisse |
| **Risiko** | **KRITISCH** — Direkter Zugriff auf Admin-Seiten möglich |
| **Erforderliche Korrektur** | Next.js middleware.ts erstellen, Server-seitige Auth-Prüfung für /admin/* |

### W-11: Auth-Tokens in AsyncStorage (efy care)

| Feld | Inhalt |
|------|--------|
| **Behauptung A** | Sichere Auth-Implementierung |
| **Tatsächlicher Codezustand** | Auth-Tokens werden in unverschlüsseltem `AsyncStorage` gespeichert statt in `expo-secure-store`. Bei gerooteten/jailbroken Geräten sind Tokens auslesbar. |
| **Risiko** | **KRITISCH** — Gesundheitsdaten-Zugang über gestohlene Tokens |
| **Erforderliche Korrektur** | Auf `expo-secure-store` umstellen |

### W-12: CORS erlaubt * auf allen Edge Functions (efy care)

| Feld | Inhalt |
|------|--------|
| **Behauptung A** | Edge Functions sind sicher |
| **Tatsächlicher Codezustand** | `supabase/functions/_shared/cors.ts` setzt `Access-Control-Allow-Origin: *` |
| **Risiko** | **HOCH** — Jede Website kann die Edge Functions aufrufen |
| **Erforderliche Korrektur** | CORS auf erlaubte Origins einschränken |

### W-13: QM-Storage-Bucket nicht mandantengetrennt (efy care)

| Feld | Inhalt |
|------|--------|
| **Behauptung A** | Multi-Mandant-Architektur |
| **Tatsächlicher Codezustand** | Storage-Bucket `qualitaetsmanagement` hat keine org-basierte Pfadstruktur oder RLS-Policies |
| **Risiko** | **KRITISCH** — Dokumente sind mandantenübergreifend lesbar |
| **Erforderliche Korrektur** | Bucket-Policies mit org_id-Prüfung implementieren |
