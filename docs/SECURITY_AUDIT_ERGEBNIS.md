# Unabhaengiges Security-Audit & E2E-Gegenpruefung

**Datum:** 2026-08-12
**Auditor:** Claude Opus 4.6 (unabhaengige Gegenpruefung)
**Scope:** Gesamtprojekt alltagsengel — 1777 Dateien, 199 Migrationen, 40+ API-Domains

---

## Zusammenfassung

| Kategorie | Anzahl |
|-----------|--------|
| KRITISCH (gefixt) | 3 |
| HOCH (gefixt) | 4 |
| HOCH (offen) | 4 |
| MITTEL (offen) | 8 |
| NIEDRIG (offen) | 6 |
| Typecheck | Gruen |
| Tests | 2029 bestanden, 29 uebersprungen |

---

## 1. BEHOBENE SCHWACHSTELLEN (in diesem Audit gefixt)

### FIX-1: Rechnungs-PDF ohne Org-Fence (KRITISCH → BEHOBEN)
- **Datei:** `app/api/rechnungen/[id]/pdf/route.ts`
- **Problem:** Admin-Pfad nutzte `createAdminClient()` mit `.eq('id', invoiceId)` OHNE `organization_id`-Filter. Jeder Admin konnte Rechnungs-PDFs fremder Organisationen herunterladen.
- **Fix:** `getActiveOrgId()` importiert, Org-Zugehoerigkeitspruefung vor PDF-Signierung eingefuegt.

### FIX-2: DiPA-Nachweise cross-tenant Leak (KRITISCH → BEHOBEN)
- **Datei:** `app/api/dipa/nachweise/route.ts`
- **Problem:** `createAdminClient()` (service_role, RLS-Bypass) las `coach_nutzungsereignisse` ALLER Organisationen. Org-ID aus `requireOpsAdmin()` wurde nicht verwendet.
- **Fix:** `.eq('organization_id', auth.ctx.organizationId)` zur Query hinzugefuegt.

### FIX-3: DiPA-Abrechnungswege fehlende Org-Fence (HOCH → BEHOBEN)
- **Datei:** `app/api/dipa/abrechnungswege/route.ts`
- **Problem:** GET und PATCH hatten keinen `organization_id`-Filter.
- **Fix:** `.eq('organization_id', auth.ctx.organizationId)` fuer beide Operationen hinzugefuegt.

### FIX-4: DiPA-Codes fehlende Org-Fence (HOCH → BEHOBEN)
- **Dateien:** `app/api/dipa/codes/route.ts` (GET), `app/api/dipa/codes/[id]/route.ts` (PATCH)
- **Problem:** Codes-Abfrage und -Aenderung ohne Org-Filter.
- **Fix:** `.eq('organization_id', auth.ctx.organizationId)` hinzugefuegt.

### FIX-5: eUL-Erbringungen fehlende Org-Fence (HOCH → BEHOBEN)
- **Dateien:** `app/api/eul/erbringungen/route.ts` (GET), `app/api/eul/erbringungen/[id]/route.ts` (PATCH, DELETE)
- **Problem:** SELECT, UPDATE, DELETE ohne `organization_id`-Filter. Cross-Tenant IDOR.
- **Fix:** `.eq('organization_id', auth.ctx.organizationId)` fuer alle Operationen.

### FIX-6: eUL-Qualifikationen fehlende Org-Fence (HOCH → BEHOBEN)
- **Datei:** `app/api/eul/qualifikationen/route.ts` (GET)
- **Problem:** Alle Qualifikationen aller Organisationen sichtbar.
- **Fix:** `.eq('organization_id', auth.ctx.organizationId)` hinzugefuegt.

### FIX-7: PostgREST Filter-Injection in FHIR Patient (KRITISCH → BEHOBEN)
- **Datei:** `app/api/fhir/Patient/route.ts`
- **Problem:** `name`-Parameter aus URL direkt in `.or()` interpoliert. Komma im Namen injiziert zusaetzliche PostgREST-Filterklauseln. Route nutzt `createAdminClient()` (RLS-Bypass).
- **Fix:** Sonderzeichen (`,.()"'\`) aus dem Suchbegriff entfernt vor Interpolation.

---

## 2. OFFENE SCHWACHSTELLEN

### HOCH

#### H-1: Tour-Erstellung ohne Einsatzfreigabe-Pruefung
- **Datei:** `app/api/tours/route.ts`
- **Problem:** `pruefeEinsatzfreigabe()` wird NICHT aufgerufen. Mitarbeiter mit abgelaufenen Qualifikationen oder ohne Einsatzfreigabe koennen Touren zugewiesen werden.
- **Einsatzplanung** prueft korrekt, aber Touren umgehen den Check.
- **Empfehlung:** `pruefeEinsatzfreigabe()` in Tour-POST integrieren.

#### H-2: Budget-Check nicht atomar (Race Condition)
- **Dateien:** `lib/personal/einsatzfreigabe.ts`, `app/api/einsatzplanung/route.ts`
- **Problem:** Budget-Check (SELECT) und Einsatz-Erstellung (INSERT) sind getrennt. Zwei gleichzeitige Einsaetze koennen beide den Check passieren und Budget ueberschreiten. Der Trigger (`update_budget_used_amount`) rechnet korrekt nach, aber post-hoc.
- **Empfehlung:** Budget-Reservation via `SELECT FOR UPDATE` oder atomaren RPC.

#### H-3: Zahlungszuordnung nicht transaktional
- **Datei:** `lib/billing/core/payments.ts`
- **Problem:** `allocatePayment()` verarbeitet mehrere Zuordnungen sequentiell. Scheitert die dritte, sind die ersten zwei bereits committed. Kein Rollback.
- **Empfehlung:** Multi-Allocation in einen atomaren RPC verlagern.

#### H-4: Reviews angelId-Manipulation
- **Datei:** `app/api/reviews/route.ts`
- **Problem:** POST nimmt `angelId` aus dem Request-Body statt aus dem verifizierten Booking. Rating-Manipulation moeglich.
- **Empfehlung:** `angelId` aus dem Booking-Record ableiten, nicht vom Client vertrauen.

### MITTEL

#### M-1: visitor-alert IP-Spoofing
- **Datei:** `app/api/visitor-alert/route.ts`
- **Problem:** Oeffentlich, IP kommt aus dem Body (nicht Request-Header). Cooldown umgehbar.
- **Empfehlung:** IP aus Request-Header (`x-forwarded-for`) ableiten.

#### M-2: native/geo-events und leistungsnachweis-upload ohne Org-Fence
- **Dateien:** `app/api/native/geo-events/route.ts`, `app/api/native/leistungsnachweis-upload/route.ts`
- **Problem:** Caregiver-Ownership wird geprueft, aber kein expliziter `organization_id`-Check (anders als `signatures/route.ts`, das es korrekt macht).
- **Empfehlung:** `record.organization_id !== auth.organizationId`-Check wie in signatures uebernehmen.

#### M-3: Einsatzplanung PATCH ohne Null-Guard
- **Datei:** `app/api/einsatzplanung/route.ts`
- **Problem:** PATCH prueft `if (organizationId)` statt zu blocken. Wenn `getActiveOrgId()` null liefert, wird ohne Org-Fence aktualisiert.
- **Empfehlung:** `if (!organizationId) return 403` hinzufuegen.

#### M-4: cron/review-request cross-tenant
- **Datei:** `app/api/cron/review-request/route.ts`
- **Problem:** Liest alle Bookings aller Organisationen (service_role, kein Org-Filter). HTML-Interpolation ohne Escaping in E-Mail-Template.
- **Empfehlung:** Org-Filter hinzufuegen, Nutzernamen escapen.

#### M-5: DTA-Lauf-Storno ohne CAS
- **Datei:** `lib/abrechnung/kassenabrechnung-engine.ts`
- **Problem:** `storniereLauf()` hat keinen CAS-Guard. Doppelte Stornierung schreibt doppelten Audit-Trail.
- **Empfehlung:** `.eq('status', lauf.status)` zum Update hinzufuegen.

#### M-6: Error-Messages leaken DB-Details
- **40+ API-Routen** geben `error.message` direkt an den Client zurueck.
- `lib/utils/api-error.ts` (safeErrorResponse/safeDbError) existiert, wird aber nur in wenigen Routen verwendet.
- **Empfehlung:** `safeErrorResponse` flaechendeckend einsetzen.

#### M-7: billing/tariffs GET ohne Null-Guard
- **Datei:** `app/api/billing/tariffs/route.ts`
- **Problem:** GET prueft nicht auf `null` von `getActiveOrgId()`. Koennte Zeilen mit `organization_id IS NULL` liefern.

#### M-8: billing/invoices/[id]/snapshots ohne Null-Guard
- **Datei:** `app/api/billing/invoices/[id]/snapshots/route.ts`
- **Problem:** Gleicher Null-Guard fehlt fuer `orgId`.

### NIEDRIG

#### L-1: IP-Tracking ohne DSGVO-Dokumentation
- **Dateien:** `app/api/track/route.ts`, `app/api/track-conversion/route.ts`
- IP-Adressen werden gespeichert, ip-api.com (US-Dienst) wird mit Besucher-IPs angefragt.

#### L-2: archive/ enthaelt alte Build-Artefakte mit Demo-Passwoertern
- `archive/` hat minifiziertes JS mit hardcodierten Passwort-Strings (Admin2026!, Anna2026!, Maria2026!). Nicht im aktiven Code, aber im Git-Verlauf.

#### L-3: 3 POST-Routen in ops/ ohne Body-Sanitierung
- `ops/aufgaben`, `ops/ereignis-regeln`, `ops/eskalationsregeln` (POST) streifen `organization_id` nicht aus dem Body.

#### L-4: WhatsApp-Webhook ohne Org-Fence
- `app/api/whatsapp/webhook/route.ts` -- Alle Konversationen ohne `organization_id`. Akzeptabel fuer Single-Tenant, Multi-Tenant-Luecke.

#### L-5: SEPA Creditor-ID Placeholder
- `DE98ZZZ09999999999` steht als Default in `organizations` (Migration 20260812120000). Wird nirgends als echte ID behandelt. Vor Produktivbetrieb ersetzen.

#### L-6: Storno-Nummern-Verschwendung
- `cancelInvoice()` generiert Rechnungsnummern vor dem CAS-Check. Bei Konflikt bleibt die Nummer verwaist.

---

## 3. RLS-AUDIT

| Metrik | Wert |
|--------|------|
| Migrationen | 199 (131 + 68 Rollback) |
| CREATE TABLE | 275 (262 einzigartige Tabellen) |
| CREATE POLICY | 896 |
| Tabellen mit Policies | 267 |
| Tabellen OHNE Policy | 7 |

**Bewusst gesperrt (OK):**
- `login_rate_limits`, `conversions`, `notfall_access_attempts` — nur service_role
- `coach_pseudonym_key` — REVOKE ALL, nur via SECURITY DEFINER

**Potenziell problematisch (3):**
- `fahrzeuge` — RLS aktiv, keine Policy, Client-Code greift per User-Session zu → leere Ergebnisse
- `hygienebox_orders` — RLS aktiv, keine Policy, Inserts schlagen still fehl
- `abrechnung_zertifikate` — Zugriff nur via Admin-Client, in der Praxis sicher

---

## 4. AUTH-AUDIT

| Aspekt | Ergebnis |
|--------|----------|
| Admin-Routen mit Auth | 100% (requireOpsAdmin, requirePersonalAdmin, etc.) |
| Org-ID aus Session (nicht Request) | 99% (Stripe nimmt orgId aus Body, validiert via requireOrgRole) |
| IDOR-Risiko | GERING (org_id wird fast ueberall server-seitig abgeleitet) |
| Oeffentliche Routen | 8 (kontakt, pricing/calculate, google-reviews, track*, expansion/status, auth/send-reset, auth/check-rate-limit) |
| Webhook-Routen | 2 (Stripe mit Signaturpruefung, WhatsApp mit HMAC) |
| Cron-Routen | 3 (alle CRON_SECRET-geschuetzt) |

---

## 5. E2E-FLOW-BEWERTUNG

### Kunde → Vertrag → Budget → Einsatz → Rechnung → Zahlung
- **Budget-Konstanten:** VP=1685, KZP=1854, Kombi=3539 — KORREKT (PUEG +4,5%)
- **Budget-Check:** Warnung ab 95%, Block ab 100%, Override mit Audit-Log
- **Rechnungserstellung:** Atomarer RPC (`create_invoice_draft_atomic`) — SICHER
- **Schwachstelle:** Budget-Check nicht atomar (s. H-2)

### Mitarbeiter → Qualifikation → Einsatzfreigabe → Tour
- **pruefeEinsatzfreigabe():** Alle Checks korrekt (Status, Vertrag, Qualifikationen)
- **Schwachstelle:** Tour-Erstellung umgeht Freigabe (s. H-1)

### Rechnung stornieren → Gutschrift → neue Rechnung
- **CAS-Guards:** Vorhanden fuer Storno und Gutschrift
- **Atomare RPCs:** `create_credit_note_atomic`, `validate_correction_atomic` — SICHER (wenn live)
- **Doppelte Stornierung:** Zweischichtig verhindert (CAS + DB-Trigger)

### Rechnungsnummern
- **next_billing_number():** Atomares UPSERT — SICHER
- **Keine Duplikate moeglich** bei korrekter DB-Konfiguration

---

## 6. TEST-QUALITAET

| Metrik | Wert |
|--------|------|
| Test-Dateien | 95 (94 bestanden, 1 uebersprungen) |
| Tests gesamt | 2058 (2029 bestanden, 29 uebersprungen) |
| Typecheck | Gruen |
| Always-Pass-Tests | 46 (`expect(true).toBe(true)` in b2c-rls-hardening) |
| Source-Scanning-Tests | ~447 String-Match-Assertions in 36 Dateien |
| SEPA-Service Testabdeckung | NULL (362 Zeilen ohne Tests) |
| Budget-Integration-Tests | Nur Konstanten, Funktionen nie aufgerufen |
| Rate-Limiting-Tests | Ausgezeichnet |
| Billing-Status-Machine | Gut |

### 42a-Budget-Tests (`__tests__/security/d2-vp-budget.test.ts`)
- **Budget-Konstanten-Tests:** Echt — importieren Modul, pruefen Werte mit `toBe()`. KORREKT.
- **Source-Scanning-Tests:** ~60% der Tests lesen Quellcode als String und pruefen mit `toContain()`. Testen TEXT, nicht VERHALTEN. Refactoring bricht diese Tests auch bei korrekter Logik.
- **Fehlende Integration:** `pruefeBudget()` und `pruefeVPBudget()` werden NIE mit Testdaten aufgerufen.

### Kritische Luecke: b2c-rls-hardening.test.ts
- 44 Tests mit `expect(true).toBe(true)` — ALLE bestehen immer.
- Geben falsche Sicherheit ueber RLS-Policies.

---

## 7. SECRETS

| Check | Ergebnis |
|-------|----------|
| .env in .gitignore | JA |
| Hardcoded Keys im Code | KEINE |
| Hardcoded Keys in Migrationen | KEINE |
| Stripe-Keys im Code | KEINE |
| JWT-Muster im aktiven Code | KEINE |
| Demo-Passwoerter in archive/ | JA (nicht aktiv) |

---

## 8. RATE-LIMITING

| Route | Rate-Limit |
|-------|-----------|
| /api/kontakt | 5 req/10 min/IP |
| /api/track | 10 req/min/IP |
| /api/track-conversion | 30 req/min/IP |
| /api/beratung-chat | Tages-Cap (fail-open) |
| /api/auth/send-reset | Via check-rate-limit |
| proxy.ts (global) | Konfiguriert |
| Sensible Admin-Routen | Ueber proxy.ts |

---

## 9. EMPFOHLENE PRIORITAETEN

1. **SOFORT:** H-1 (Tour-Freigabepruefung), H-4 (Reviews angelId)
2. **KURZFRISTIG:** H-2 (atomarer Budget-Check), H-3 (transaktionale Zahlungszuordnung)
3. **MITTELFRISTIG:** M-1 bis M-8 (Null-Guards, Error-Sanitizer, native Org-Fence)
4. **LANGFRISTIG:** Test-Qualitaet verbessern (b2c-rls durch echte Tests ersetzen, SEPA-Tests schreiben)
