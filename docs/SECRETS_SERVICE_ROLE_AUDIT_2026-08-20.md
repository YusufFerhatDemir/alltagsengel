# Secrets & Service-Role Audit

**Datum:** 2026-08-20
**Prüfer:** Automatisiertes Audit (Claude)
**Scope:** Alltagsengel (`nnwyktkqibdjxgimjyuq`) + ChairMatch (`pwdbjqfpgumyfktbfswg`)

---

## Zusammenfassung

| Kategorie | HIGH | MEDIUM | LOW |
|-----------|------|--------|-----|
| Alltagsengel | 0 | 1 | 2 |
| ChairMatch | 1 | 1 | 1 |
| **Gesamt** | **1** | **2** | **3** |

---

## 1. Service-Role Verwendung im Quellcode

### Ergebnis: SICHER

Die `service_role`-Nutzung ist zentralisiert in `lib/supabase/admin.ts` mit doppeltem Schutz:

- **Build-time Guard:** `import 'server-only'` (Next.js blockt Client-Bundle-Import)
- **Runtime Guard:** `typeof window !== 'undefined'` → throw

Alle Aufrufe von `createAdminClient()` befinden sich ausschließlich in Server-Kontexten:

| Datei | Kontext | Bewertung |
|-------|---------|-----------|
| `app/api/cron/mahnlauf/route.ts` | API Route (Server) | OK |
| `app/api/cron/review-request/route.ts` | API Route (Server) | OK |
| `app/api/cron/automatisierung/route.ts` | API Route (Server) | OK |
| `app/api/newsletter/route.ts` | API Route (Server) | OK |
| `app/api/newsletter/unsubscribe/route.ts` | API Route (Server) | OK |
| `app/api/lead-inquiry/route.ts` | API Route (Server) | OK |
| `app/api/drip/route.ts` | API Route (Server) | OK |
| `app/api/referral/route.ts` | API Route (Server) | OK |
| `app/api/referral/complete/route.ts` | API Route (Server) | OK |
| `app/admin/go-live/page.tsx` | Server Component (`dynamic='force-dynamic'`, kein `'use client'`) | OK |
| `supabase/functions/account-hard-delete/index.ts` | Edge Function (Deno, Server) | OK |
| `scripts/audit-rls.ts` | Dev-Script (lokal) | OK |

**Kein einziger `service_role`-Import in `/components/` oder Client-Dateien.**

---

## 2. SECURITY DEFINER Funktionen

### Alltagsengel (`nnwyktkqibdjxgimjyuq`): 93 Funktionen

Alle 93 SECURITY DEFINER Funktionen haben `SET search_path TO 'public'` gesetzt. Keine C-Language-Funktionen in public.

Kategorien der Funktionen (alle begründet):

| Kategorie | Anzahl | Beispiele |
|-----------|--------|-----------|
| Auth/Rollen-Checks | 8 | `is_admin`, `is_org_member`, `has_org_role`, `is_internal_staff` |
| Trigger-Funktionen | 20 | `handle_new_user`, `enforce_booking_status_transition`, `prevent_role_escalation` |
| Audit/Logging | 12 | `audit_invoice_status_change`, `coach_audit_trigger`, `log_state_settings_change` |
| Billing/Rechnungen | 8 | `create_invoice_draft_atomic`, `next_billing_number`, `check_billing_gate` |
| Workflow-Engine | 9 | `wf_process_event`, `wf_emit_event`, `wf_check_fristen` |
| Org-Kontext | 6 | `current_org_id`, `eigene_caregiver_ids`, `eigene_client_ids` |
| Prevent-Guards | 10 | `prevent_locked_record_change`, `prevent_messages_field_tampering` |
| Sonstige Business-Logic | 20 | `get_emergency_info_with_pin`, `generate_referral_code`, `claim_waitlist_batch` |

**Bewertung:** Alle haben `search_path` gesetzt. Funktionen sind berechtigt als SECURITY DEFINER, da sie cross-table Operationen durchführen oder Rollen-Checks in RLS-Policies ermöglichen.

### ChairMatch (`pwdbjqfpgumyfktbfswg`): 11 Funktionen

| Funktion | search_path | Bewertung |
|----------|-------------|-----------|
| `cleanup_alte_drafts` | ✅ | OK — Cron-Cleanup |
| `draft_verknuepfen` | ✅ | OK — Onboarding-Draft mit User verknüpfen |
| `handle_new_user` | ✅ | OK — Auth-Trigger für Profil-Erstellung |
| `is_admin` | ✅ | OK — RLS-Helfer |
| `is_admin_or_super` | ✅ | OK — RLS-Helfer |
| `is_super_admin` | ✅ | OK — RLS-Helfer |
| `publish_review_pair` | ✅ | OK — Double-Blind Review Logic |
| `update_user_review_aggregates` | ✅ | OK — Trigger für Aggregat-Update |
| `st_estimatedextent` (3×) | ❌ | PostGIS-Systemfunktion (C-Sprache, nicht änderbar) |

---

## 3. Exponierte Secrets

### .env-Dateien auf Disk

| Datei | Enthält | Gitignored | Risiko |
|-------|---------|------------|--------|
| `.env` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Keins (public Keys) |
| `.env.local` | SERVICE_ROLE_KEY, RESEND_API_KEY, VAPID_PRIVATE_KEY | ✅ | Maschinenebene |
| `.env.example` | Nur Platzhalter | ✅ (explizit un-ignored) | Keins |
| `.env.staging.local` | Staging Anon-Key | ✅ | Keins |
| `native/.env` | Anon-Key (Expo) | ✅ | Keins |

### Git-History

Die `.env`-Datei war historisch in 6 Commits committed (2026-02-25 bis 2026-04-07, entfernt in `351a459`). **Nur der öffentliche Anon-Key war betroffen — kein Service-Role-Key.**

### Hardcoded Keys in chairmatch-landing/

30+ statische HTML-Dateien in `chairmatch-landing/` enthalten den Alltagsengel **Anon-Key** hardcoded im JavaScript (für `lead_inquiries`-INSERT via PostgREST). Der Anon-Key ist public by design, aber das Pattern umgeht die App-Logik und verlässt sich ausschließlich auf RLS.

---

## 4. RLS-Status

### Alltagsengel: VOLLSTÄNDIG

**Alle** public-Tabellen haben RLS aktiviert. Einzige Ausnahme: `spatial_ref_sys` (PostGIS-Systemtabelle, enthält keine Nutzerdaten).

### ChairMatch: VOLLSTÄNDIG

**Alle** public-Tabellen haben RLS aktiviert. Einzige Ausnahme: `spatial_ref_sys` (PostGIS).

Stichprobe ChairMatch-Policies zeigt korrekte Muster: `{authenticated}` für eigene Daten, `is_admin()` für Admin-Zugriff, `{service_role}` für System-Operationen.

---

## 5. RLS Bypass im Code

Alle `auth.admin.*`-Aufrufe befinden sich in Server-Kontexten:

| Datei | Aufruf | Begründet |
|-------|--------|-----------|
| `supabase/functions/account-hard-delete/index.ts` | `auth.admin.getUserById`, `auth.admin.deleteUser` | ✅ DSGVO Hard-Delete |
| `app/api/admin/reset-password/route.ts` | `auth.admin.updateUserById`, `auth.admin.generateLink` | ✅ Admin-Passwort-Reset |
| `app/api/admin/manage-role/route.ts` | `auth.admin.updateUserById` | ✅ Rollenverwaltung |
| `app/api/auth/send-reset/route.ts` | `auth.admin.generateLink` | ✅ Passwort-Reset-Link |

Alle `.rpc()`-Aufrufe mit Admin-Client sind ebenfalls server-seitig (`increment_referral_credit` in `app/api/referral/complete/route.ts`).

**Ein Browser-seitiger `.rpc()`-Aufruf:** `get_emergency_info_with_pin` in `app/notfall/[id]/page.tsx` — absichtlich anon-aufrufbar, PIN-geschützt, für Notfall-Zugriff konzipiert.

---

## 6. API Keys im Client-Bundle

`next.config.ts` enthält **keine** `env`, `publicRuntimeConfig` oder `serverRuntimeConfig`-Blöcke die Server-Secrets exponieren würden. Einziger Env-Zugriff: `process.env.NEXT_PUBLIC_SUPABASE_URL` für CSP-Header-Generierung zur Build-Zeit.

**Im Client-Bundle sind ausschließlich verfügbar:**
- `NEXT_PUBLIC_SUPABASE_URL` (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public)
- `NEXT_PUBLIC_GA4_MEASUREMENT_ID` (public)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public)

---

## 7. Edge Functions

### Alltagsengel

| Funktion | verify_jwt | Auth-Methode | Bewertung |
|----------|-----------|--------------|-----------|
| `account-hard-delete` | — (nicht deployt via Dashboard-Liste) | Service-Role Bearer Token + Secret-Check | ✅ |
| `velora-mockup` | ❌ `false` | Unbekannt (kein Quellcode im Repo) | ⚠️ MEDIUM |

### ChairMatch

| Funktion | verify_jwt | Bewertung |
|----------|-----------|-----------|
| `create-checkout` | ❌ `false` | ⚠️ HIGH — Checkout ohne JWT-Verifizierung |
| `send-whatsapp` | ✅ `true` | OK |
| `whatsapp-webhook` | ❌ `false` | Akzeptabel — Webhooks müssen extern erreichbar sein |

---

## 8. Vercel Environment Variables

Vercel-Umgebungsvariablen können nicht programmatisch geprüft werden (kein Vercel-MCP verbunden). **Manuelle Prüfung empfohlen:**

- `SUPABASE_SERVICE_ROLE_KEY` muss als **"Sensitive"** markiert sein (nicht "Plain")
- `RESEND_API_KEY` muss als **"Sensitive"** markiert sein
- `VAPID_PRIVATE_KEY` muss als **"Sensitive"** markiert sein

---

## Risikobewertung

### HIGH (1)

| # | Projekt | Finding | Empfehlung |
|---|---------|---------|------------|
| H1 | ChairMatch | Edge Function `create-checkout` hat `verify_jwt: false` — Checkout-Logik ohne JWT-Auth exponiert | `verify_jwt: true` setzen oder internen Auth-Mechanismus verifizieren. Checkout-Endpoints ohne Auth sind ein Einfallstor für Missbrauch. |

### MEDIUM (2)

| # | Projekt | Finding | Empfehlung |
|---|---------|---------|------------|
| M1 | Alltagsengel | Edge Function `velora-mockup` hat `verify_jwt: false` und keinen Quellcode im Repo | Quellcode prüfen; wenn nicht mehr benötigt, Function deaktivieren. Deployed Functions ohne Repo-Source sind ein Wartungsrisiko. |
| M2 | ChairMatch | `st_estimatedextent` (PostGIS, 3×) als SECURITY DEFINER ohne `search_path` | Geringes Risiko (C-Sprache, PostGIS-intern), aber `ALTER FUNCTION ... SET search_path TO 'public'` als Hardening empfohlen. |

### LOW (3)

| # | Projekt | Finding | Empfehlung |
|---|---------|---------|------------|
| L1 | Cross | 30+ chairmatch-landing HTML-Dateien mit hardcoded Anon-Key und direktem PostgREST-INSERT | Anon-Key ist public, aber Direct-PostgREST umgeht App-Validierung. RLS-Policies für `lead_inquiries` prüfen (Rate-Limiting, Input-Validierung). |
| L2 | Alltagsengel | `.env` war historisch in Git (6 Commits, nur Anon-Key) | Bereits behoben. Für Zukunft: `git-secrets` oder Pre-Commit-Hook mit Pattern-Check installieren (existiert bereits: `precommit-guard`). |
| L3 | Cross | Vercel Environment Variables nicht automatisiert prüfbar | Manuelle Prüfung durchführen, dass alle Secrets als "Sensitive" markiert sind. |

---

## Gesamtbewertung

**Die Sicherheitslage ist grundsätzlich solide.** Die Hauptprojekt-Architektur (Alltagsengel) folgt Best Practices: service_role ist isoliert, alle Tabellen haben RLS, SECURITY DEFINER Funktionen haben search_path gesetzt, und keine Secrets sind im Client-Bundle exponiert.

**Handlungsbedarf besteht primär bei ChairMatch:** Die `create-checkout` Edge Function ohne JWT-Verifizierung ist das einzige HIGH-Finding und sollte zeitnah adressiert werden.
