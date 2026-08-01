# Phase 1 — Vollständige Bestandsaufnahme

**Audit-Datum:** 01.08.2026  
**Geprüfte Commits:** HEAD beider Repositories  
**Prüfer:** Automated Code Audit (Claude)

---

## A. ALLTAGSENGEL (Next.js)

### Zusammenfassung
- **37 Migrationsdateien** in supabase/migrations/
- **3 eigene Testdateien** + 3 E2E-Specs (6 gesamt, davon 0 in app/)
- **0 middleware.ts** — keine serverseitige Route-Protection
- **1 CI/CD-Workflow** — nur für ChairMatch, NICHT für Alltagsengel
- **database.types.ts** — FEHLT

| # | Modul | Status | Dateien | DB-Tabellen | Tatsächlich implementiert | Nur UI/Platzhalter | Auto-Tests | Sicherheitsrisiko | Produktionsrisiko | Offene Aufgaben |
|---|-------|--------|---------|-------------|--------------------------|-------------------|------------|-------------------|-------------------|-----------------|
| 1 | Web (Public Pages) | ✅ Implementiert | app/(public)/, 17+ Seiten | page_views, visitor_locations, analytics_events | Ja — SSR, SEO, Schema.org | Nein | Nein | Niedrig | Niedrig | — |
| 2 | Blog | ✅ Implementiert | app/blog/, 36 Artikel | content_blocks | Ja — MDX/statisch | Nein | Nein | Niedrig | Niedrig | — |
| 3 | Admin Dashboard | ✅ Implementiert | app/admin/, 27+ Seiten | Diverse (clients, records, budgets…) | Ja — echte Supabase-Queries | Nein | Nein | **HOCH** | **HOCH** | Kein serverseitiger Routenschutz |
| 4 | Auth & Rollen | ⚠️ Teilweise | lib/auth/, app/api/auth/ | profiles (role-Spalte) | Ja — Supabase Auth + 5 Rollen | Nein | Nein | **HOCH** | **HOCH** | Kein middleware.ts, nur Client-Hook |
| 5 | Stripe | ✅ Implementiert | lib/stripe/, app/api/stripe/ | organization_subscriptions | Ja — Lazy Proxy, Webhook verifiziert | Nein | Nein | Mittel | Mittel | Stripe Dashboard Products fehlen |
| 6 | Multi-Mandant | ⚠️ Codiert, nicht aktiviert | supabase/migrations/20260801_phase3_multi_mandant_saas.sql, lib/organizations/ | organizations, organization_members, organization_subscriptions | Ja — Migration existiert, org_id auf 63 Tabellen | Nein | Nein | **HOCH** | **HOCH** | Migration NICHT auf Prod-DB |
| 7 | PostgreSQL/Migrationen | ✅ Vorhanden | 37 SQL-Dateien | ~50+ Tabellen über Migrationen | Ja | Nein | Nein | Mittel | **HOCH** | Keine Migrations-Tests |
| 8 | RLS | ⚠️ Teilweise | Diverse Migrations (rls_*.sql) | Viele Tabellen | Ja — aber 6 Tabellen mit dormanten Policies | Nein | Nein | **HOCH** | **HOCH** | Lücken bei neuen Tabellen |
| 9 | Edge Functions | ❌ Nicht vorhanden | — | — | Nein — Alltagsengel nutzt Next.js API-Routes | — | — | — | — | — |
| 10 | WhatsApp | ✅ Implementiert | app/api/whatsapp/webhook/route.ts, lib/whatsapp/ | conversations (vermutlich) | Ja — HMAC-SHA256 Signatur, Fail-Closed, Rate-Limit | Nein | Nein | Mittel | Mittel | — |
| 11 | OCR | ⚠️ Unklar | Muss geprüft werden | — | Unklar | Unklar | Nein | Mittel | Mittel | Evidenz prüfen |
| 12 | EDIFACT | ✅ Implementiert | lib/abrechnung/edifact-generator.ts, edifact-validator.ts | abrechnungen (vermutlich) | Ja — Segment-Erzeugung, IK-Validierung | Nein | Nein | **HOCH** | **HOCH** | IK hardcodiert, keine Golden-Master-Tests |
| 13 | SECON | ✅ Implementiert | lib/abrechnung/secon.ts, secon.test.ts, zertifikate.ts | — | Ja — Signieren, Verschlüsseln, Entschlüsseln, Round-Trip | Nein | **Ja (3 Tests)** | **HOCH** | **HOCH** | Nur lokal getestet, kein ext. Test |
| 14 | Abrechnung/Rechnungen | ✅ Implementiert | lib/abrechnung/leistungsnachweis-pdf.ts, app/api/leistungsnachweis/ | service_records, budgets | Ja — PDF-Generierung, Budget-Tracking | Nein | Nein | **HOCH** | **HOCH** | IK hardcodiert in PDF |
| 15 | Offline-Sync | ❌ Nicht vorhanden | — | — | Nein (nur in efy care) | — | — | — | — | — |
| 16 | Logging/Monitoring | ⚠️ Minimal | supabase/migrations/20260417_admin_audit_log.sql | admin_audit_log | Nur Audit-Log-Tabelle, kein Sentry/Monitoring | Nein | Nein | Mittel | Mittel | Kein Error-Tracking |
| 17 | Backup/Restore | ❌ Nicht implementiert | — | — | Nur Supabase-Standard | — | — | **HOCH** | **HOCH** | Nie getestet |
| 18 | CI/CD | ❌ Nicht vorhanden | .github/workflows/deploy-chairmatch.yml | — | NUR ChairMatch-Workflow, kein Alltagsengel | — | — | **HOCH** | **HOCH** | Komplett fehlend |
| 19 | Tests | ⚠️ Minimal | lib/password-validation.test.ts, lib/hessen-plz.test.ts, lib/abrechnung/secon.test.ts, e2e/*.spec.ts | — | 3 Unit-Tests + 3 E2E-Specs | — | Ja (6 Dateien) | — | **HOCH** | Keine App-Tests, keine API-Tests |
| 20 | Secrets/Config | ⚠️ Problematisch | .env* (existiert), kein config.toml | — | Env-Vars vorhanden | — | — | **HOCH** | Mittel | IK in Business-Logic hardcodiert |
| 21 | Deployment | ✅ Funktional | vercel.json, deploy.sh | — | Ja — Vercel + deploy.sh mit Guards | — | — | Niedrig | Niedrig | — |

### Evidenz Testdateien (Alltagsengel, ohne node_modules)
```
lib/password-validation.test.ts
lib/hessen-plz.test.ts
lib/abrechnung/secon.test.ts
e2e/register.spec.ts
e2e/booking.spec.ts
e2e/auth-delete.spec.ts
```

### Evidenz IK-Hardcoding (Alltagsengel)
```
lib/abrechnung/edifact-generator.ts:42    → ALLTAGSENGEL_IK = '460629986'
lib/abrechnung/leistungsnachweis-pdf.ts:35 → ik: '460629986'
app/admin/abrechnung/einstellungen/page.tsx:14 → EIGENE_IK = '460629986'
app/api/leistungsnachweis/route.ts:42 → Fallback '460629986'
lib/organizations/types.ts:6 → DEFAULT_ORG_ID mit IK kodiert
```

---

## B. EFY CARE (Expo / React Native)

### Zusammenfassung
- **10 Migrationsdateien**, ~41 Tabellen
- **0 eigene Testdateien**
- **4 Edge Functions** (OCR + 3× Stripe)
- **SECON nicht implementiert**
- **3 Tabs sind Platzhalter** (Kalender, Nachrichten, Suche)

| # | Modul | Status | Dateien | DB-Tabellen | Tatsächlich implementiert | Nur UI/Platzhalter | Auto-Tests | Sicherheitsrisiko | Produktionsrisiko | Offene Aufgaben |
|---|-------|--------|---------|-------------|--------------------------|-------------------|------------|-------------------|-------------------|-----------------|
| 1 | Mobile Screens | ⚠️ Teilweise | app/src/app/, 28 Screens | — | 25 funktional, 3 Platzhalter | Kalender, Nachrichten, Suche | Nein | Niedrig | Mittel | 3 Tabs fertigstellen |
| 2 | Auth & Rollen | ✅ Implementiert | app/src/app/(auth)/ | profiles | Ja — Supabase Auth | Nein | Nein | Mittel | Mittel | Kein Passwort-Reset |
| 3 | Stripe | ✅ Implementiert | supabase/functions/stripe-*, app/src/features/ | organization_subscriptions | Ja — 4 Edge Functions, Webhook verifiziert | Nein | Nein | Mittel | Mittel | — |
| 4 | Multi-Mandant | ⚠️ Codiert, RLS-Lücken | supabase/migrations/20260801150000_*, app/src/org/ | organizations, organization_members | Ja — OrgProvider, OrgSwitcher | Nein | Nein | **KRITISCH** | **KRITISCH** | 9 RLS-Policies nicht aktualisiert |
| 5 | Supabase/Migrationen | ✅ Vorhanden | 10 SQL-Dateien | ~41 Tabellen | Ja | Nein | Nein | Mittel | Mittel | Kein config.toml |
| 6 | RLS | ⚠️ Lücken | In Migrationen | Diverse | Ja — aber 9 Policies nicht org-scoped | Nein | Nein | **KRITISCH** | **KRITISCH** | audit_logs, caregivers, quality_measures u.a. |
| 7 | Edge Functions | ✅ Implementiert | supabase/functions/ (4 Funktionen) | — | Ja — OCR, Stripe checkout/portal/webhook | Nein | Nein | Mittel | Mittel | CORS erlaubt * |
| 8 | OCR | ✅ Implementiert | supabase/functions/ocr/ | — | Ja — Claude Sonnet 5 | Nein | Nein | Mittel | Niedrig | — |
| 9 | EDIFACT | ✅ Implementiert | app/src/features/abrechnung/edifact.ts | abrechnungen | Ja — Segment 105 Erzeugung | Nein | Nein | **HOCH** | **HOCH** | Keine Validierungstests |
| 10 | SECON | ❌ NICHT implementiert | Referenzen in UI-Code, keine Crypto-Lib | — | Nein — nur UI-Text, keine Crypto-Operationen | Ja (nur Labels) | Nein | **KRITISCH** | **KRITISCH** | Blockiert elektronische Übermittlung |
| 11 | Abrechnung | ✅ Implementiert | app/src/features/abrechnung/ | abrechnungen, leistungsnachweise | Ja — Lifecycle, Prüfzentrale | Nein | Nein | **HOCH** | **HOCH** | IK hardcodiert |
| 12 | Offline-First | ✅ Implementiert | app/src/features/pruefzentrale/offline/ | — | Ja — AES-256, Queue, Sync | Nein | Nein | **HOCH** | **HOCH** | Keine Konflikt-Tests |
| 13 | Push Notifications | ❌ Nicht implementiert | — | — | Nein | — | — | Niedrig | Mittel | Komplett fehlend |
| 14 | Kalender | ❌ Platzhalter | app/src/app/(tabs)/kalender.tsx | — | Nein — hardcodierte Fake-Daten | Ja | — | Niedrig | Mittel | Komplett implementieren |
| 15 | Nachrichten | ❌ Platzhalter | app/src/app/(tabs)/nachrichten.tsx | — | Nein — hardcodierte Fake-Daten | Ja | — | Niedrig | Mittel | Komplett implementieren |
| 16 | Suche | ❌ Platzhalter | app/src/app/(tabs)/suche.tsx | — | Nein — Platzhalter | Ja | — | Niedrig | Niedrig | Implementieren |
| 17 | Logging/Monitoring | ❌ Nicht vorhanden | — | — | Nein — kein Sentry, kein Error-Tracking | — | — | **HOCH** | **HOCH** | Komplett fehlend |
| 18 | Tests | ❌ Nicht vorhanden | — | — | Nein — 0 Testdateien | — | — | — | **KRITISCH** | Komplett aufbauen |
| 19 | Secrets/Config | ⚠️ Problematisch | app.json existiert, kein config.toml | — | Teilweise | — | — | **HOCH** | Mittel | IK hardcodiert |
| 20 | Token-Speicherung | ⚠️ Unsicher | AsyncStorage statt expo-secure-store | — | Auth-Tokens in AsyncStorage | Nein | Nein | **KRITISCH** | **HOCH** | Auf SecureStore umstellen |
| 21 | Storage Buckets | ⚠️ Nicht org-scoped | qualitaetsmanagement Bucket | — | Bucket existiert, kein org-Scoping | Nein | Nein | **KRITISCH** | **HOCH** | Mandantentrennung fehlt |

### Evidenz IK-Hardcoding (efy care)
```
app/src/features/abrechnung/leistungsnachweis.ts:36 → IK_NUMMER = '460629986'
```

### Evidenz SECON nicht implementiert (efy care)
```
30 Dateien referenzieren "SECON/encrypt/decrypt" — aber nur als UI-Labels,
Kommentare und Platzhalter-Text. Keine Crypto-Bibliothek importiert,
keine Signatur/Verschlüsselungs-Funktionen, kein node-forge/openssl.
```

### Evidenz Platzhalter-Tabs (efy care)
```
app/src/app/(tabs)/kalender.tsx → hardcodierte Termine-Array
app/src/app/(tabs)/nachrichten.tsx → hardcodierte Nachrichten-Array
app/src/app/(tabs)/suche.tsx → statischer Platzhalter
```
