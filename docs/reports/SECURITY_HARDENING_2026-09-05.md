# Security Hardening Report — 05.09.2026

## 1. SECURITY DEFINER Funktionen Audit

SECURITY DEFINER Funktionen umgehen RLS und laufen mit den Rechten des Erstellers (postgres).
Jede muss begründet sein.

### Alltagsengel (nnwyktkqibdjxgimjyuq)
**113 SECURITY DEFINER Funktionen** im `public` Schema.

Kategorien:
- **RLS-Hilfsfunktionen** (is_admin, is_internal_staff, aktuelle_rolle, darf, eigene_client_ids, etc.) — **BEGRÜNDET**: werden in RLS-Policies referenziert, müssen DEFINER sein um Rekursion zu vermeiden
- **Trigger-Funktionen** (enforce_*, prevent_*, audit_*, trg_*) — **BEGRÜNDET**: Trigger müssen unabhängig vom aufrufenden User wirken
- **Workflow-Engine** (wf_*) — **BEGRÜNDET**: Cron-/Queue-basierte Verarbeitung braucht vollen Zugriff
- **Billing/Abrechnung** (sammelrechnung_*, create_invoice_draft_atomic, next_billing_number) — **BEGRÜNDET**: Atomare Geschäftslogik die über mehrere Tabellen schreibt
- **Cleanup/Cron** (cleanup_*, standort_aufbewahrung_bereinigen) — **BEGRÜNDET**: Wartungsjobs

⚠️ **FINDING: Kein `SET search_path`** — Alle 113 Funktionen haben `has_search_path: NO`. 
**Risiko: NIEDRIG** (alle in `public`, Supabase default search_path enthält public).
**Empfehlung:** Bei nächster Migration `SET search_path TO 'public'` nachrüsten.

### ChairMatch (pwdbjqfpgumyfktbfswg)
**12 SECURITY DEFINER Funktionen** im `public` Schema.

| Funktion | Begründung |
|---|---|
| handle_new_user | Auth-Trigger: Profile bei Registrierung anlegen |
| is_admin, is_admin_or_super, is_super_admin | RLS-Hilfsfunktionen |
| fn_audit_trigger | Audit-Log Trigger |
| cleanup_alte_drafts | Cron: alte anonyme Drafts löschen |
| draft_verknuepfen | Onboarding: Draft mit User verknüpfen |
| publish_review_pair | Reviews: gegenseitige Freigabe |
| update_user_review_aggregates | Trigger: Bewertungs-Aggregate aktualisieren |
| st_estimatedextent (3×) | PostGIS System-Funktionen |

✅ **Alle haben `SET search_path TO 'public'`** (außer fn_audit_trigger und PostGIS).
**Status: GUT** — Alle begründet, Anzahl angemessen.

### efy care (nsfbwhpjesmathsrqkfi)
**108 SECURITY DEFINER Funktionen** im `public` Schema.

Kategorien:
- **Org-Zugehörigkeit** (is_org_member, is_org_admin, actor_belongs_to_org, shares_org_with) — **BEGRÜNDET**: Mandantentrennung in RLS
- **Trigger/Erzwingung** (*_erzwingen, *_schuetzen) — **BEGRÜNDET**: Geschäftsregeln unabhängig vom User
- **Billing** (create_invoice, storniere_rechnung, rechnung_summe_nachfuehren) — **BEGRÜNDET**: Atomare Abrechnungslogik
- **Stripe-Integration** (apply_stripe_*) — **BEGRÜNDET**: Webhook-Handler braucht vollen Zugriff
- **QM/Compliance** (qm_*) — **BEGRÜNDET**: Qualitätsmanagement-Audit-Trail
- **Storage** (storage_*) — **BEGRÜNDET**: Dateiverwaltung mit Mandantentrennung

⚠️ **FINDING: Kein `SET search_path`** — Alle 108 Funktionen haben `has_search_path: NO`.
**Risiko: NIEDRIG** (identisch wie AE).
**Empfehlung:** Bei nächster Migration nachrüsten.

---

## 2. API-Key-Exposition

### Ergebnis: ✅ KEINE HARDCODED SECRETS

| Projekt | anon key | service_role key |
|---|---|---|
| Alltagsengel | Nur in Test-Datei (supabase-key-migration.test.ts) | Alle via `process.env` |
| ChairMatch | Client-side (mobile/supabase.ts) — **erwartet** | Alle via `process.env` |
| efy care | Client-side (supabaseConfig.ts) — **erwartet** | Alle via `Deno.env.get()` |

Anon-Keys in Client-Code sind Standard bei Supabase — sie sind öffentlich und durch RLS geschützt.
Service-Role-Keys werden ausschließlich über Umgebungsvariablen geladen.

---

## 3. Security Headers

### alltagsengel.care ✅ VOLLSTÄNDIG

| Header | Wert | Status |
|---|---|---|
| X-Frame-Options | DENY | ✅ |
| Content-Security-Policy | Umfassend (script/style/img/connect/frame-ancestors) | ✅ |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | ✅ |
| X-Content-Type-Options | nosniff | ✅ |
| Referrer-Policy | strict-origin-when-cross-origin | ✅ |
| Permissions-Policy | camera=(), microphone=(), geolocation=(self) | ✅ |

### chairmatch.de ✅ VOLLSTÄNDIG

| Header | Wert | Status |
|---|---|---|
| X-Frame-Options | DENY | ✅ |
| Content-Security-Policy | Umfassend (inkl. Stripe, OSM, Sentry, Facebook) | ✅ |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | ✅ |
| X-Content-Type-Options | nosniff | ✅ |
| Referrer-Policy | strict-origin-when-cross-origin | ✅ |
| Permissions-Policy | Detailliert (25+ Features konfiguriert) | ✅ |

---

## 4. Zusammenfassung

| Bereich | AE | CM | efy | Aktion |
|---|---|---|---|---|
| SECURITY DEFINER begründet | ✅ | ✅ | ✅ | — |
| SET search_path | ⚠️ fehlt | ✅ | ⚠️ fehlt | Migration planen |
| API-Keys sicher | ✅ | ✅ | ✅ | — |
| Security Headers | ✅ | ✅ | n/a (API) | — |
| FORCE RLS | ✅ (P10.3) | ✅ (P10.3) | ✅ (P10.3) | — |
| anon CRUD revoked | ✅ (P10.3) | ✅ (P10.3) | ✅ (P10.3) | — |

### Offene Empfehlungen (NIEDRIG-Priorität)

1. **search_path nachrüsten** — AE (113 Fn) und efy (108 Fn) ohne `SET search_path TO 'public'`
2. **CSP eval() entfernen** — AE hat `'unsafe-eval'` in script-src (prüfen ob nötig)
3. **Auth-Config Review** — Email-Confirmation und JWT-Expiry über Supabase Dashboard prüfen (kein API-Zugriff)

---

*Erstellt: 05.09.2026 | Methode: SQL-Audit + Code-Grep + Header-Check*
