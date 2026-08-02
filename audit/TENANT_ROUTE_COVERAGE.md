# Tenant-Route-Coverage-Audit (Phase 3 Multi-Mandant)

**Datum:** 2026-08-02
**Branch:** `audit/phase3-production-readiness`
**Scope:** Alle serverseitigen Datenzugriffe — 58 API-Routen (`app/api/**/route.ts`), Server Components, Edge Functions, RPCs, Storage, Cron-Jobs, Export-/PDF-Generierung.
**Referenz:** `supabase/migrations/20260801_phase3_multi_mandant_saas.sql` (Stamm-Org `00000000-0000-4000-8000-000460629986`, `current_org_id()`, RESTRICTIVE `*_org_fence`-Policies).

---

## Management Summary

**Gesamtbild: 58 API-Routen auditiert → 1× P0, 9× P1, 24× P2, 24× OK.**

Die Org-Infrastruktur selbst (`/api/organizations/*`, `/api/stripe/*`) ist vorbildlich gebaut: client-gelieferte `orgId`s werden konsequent per `requireOrgRole()` gegen die Mitgliedschaft validiert. Das Problem liegt im **Bestandscode**, der vor Phase 3 entstand und drei systemische Lücken hat:

### Top-Risiken

1. **P0 — `/api/billing/auto-invoice`: Jede Betreuungskraft kann für JEDEN Klienten Rechnungen erzeugen.**
   Der Caregiver-Pfad (`requireCaregiverSession`) prüft nur, DASS der Aufrufer eine Betreuungskraft ist — nicht, ob der per Body gelieferte `client_id`/`service_record_id` ihr zugeordnet ist. Danach läuft alles über `service_role` (RLS umgangen): Einsatz-Daten, Versicherungsdaten des Klienten und Rechnungs-Insert. Cross-Client heute, Cross-Tenant sobald Mandanten-Betreuungskräfte existieren.

2. **P1 systemisch — Service-Role-INSERTs ohne `organization_id` landen in der Stamm-Org.**
   Der Spalten-Default `current_org_id()` evaluiert unter `service_role` (kein `auth.uid()`, kein JWT-`org_id`) immer zur Stamm-Org. Jede Route, die per Admin-Client in `tenant_tables` schreibt, ohne `organization_id` explizit zu setzen (`/api/native/*`, `/api/billing/auto-invoice`, …), schreibt Mandanten-Daten in die Stamm-Org → Datenvermischung + die Fence blendet die Zeile für den Mandanten aus. Genau davor warnt der Kontrakt-Kommentar in `lib/organizations/server.ts` — er wird bisher fast nirgends befolgt (`getActiveOrgId()` wird nur von `/api/organizations/*` genutzt).

3. **P1 konzeptionell — `profiles.role in ('admin','superadmin')` ist eine PLATTFORM-Rolle, kein Org-Kontext.**
   Alle `/api/admin/*`-Routen und Admin-Fallbacks prüfen die globale Rolle. Wo sie den Anon-Key-Client nutzen, greift nach Migration-Apply die Org-Fence (gut). Wo sie `service_role` nutzen (`/api/admin/abrechnung/zertifikat` GET, `/api/leistungsnachweis` Admin-Pfad, `/api/admin/reset-password`, `/api/admin/manage-role`), sehen/ändern sie **mandantenübergreifend** — inkl. Passwort-Reset für Mandanten-User.

4. **Vorbedingung erfüllt: Die Migration `20260801` IST auf der Live-DB angewendet** (verifiziert 2026-08-02 per read-only Introspektion `audit_rls_all_policies()`: alle 65 `*_org_fence`-Policies live vorhanden, alle RESTRICTIVE; `organizations`/`organization_members`/`current_org_id()` existieren live — siehe `audit/DATABASE_SCHEMA_GAP_REPORT.md`). Die „per RLS `current_org_id()`"-Einstufungen unten gelten damit ab sofort; die Service-Role-Befunde (P0/P1) bleiben davon unberührt, weil `service_role` die Fence umgeht.

### Empfohlene Reihenfolge

| Prio | Maßnahme |
|---|---|
| 1 | `auto-invoice`: im Caregiver-Pfad `service_records.caregiver_id === auth.caregiverId` (bzw. Zuordnung caregiver↔client) erzwingen |
| 2 | Helfer `insertWithOrg(admin, table, row)` bzw. Konvention: JEDER Admin-Client-Write in `tenant_tables` setzt `organization_id` explizit (Quelle: Org des geladenen Parent-Records, nicht `getActiveOrgId()` bei Native-Routen) |
| 3 | Admin-Service-Role-Reads auf `tenant_tables` mit `.eq('organization_id', await getActiveOrgId())` fencen |
| 4 | ~~Migration 20260801 auf Live-DB anwenden~~ (erledigt, live verifiziert 2026-08-02); dynamische Tenant-Isolation-Tests sind seit 2026-08-02 lokal scharf (siehe `audit/SHADOW_DB_LIVE_TEST_REPORT.md`) |

---

## Legende

- **Auth**: wie wird der Aufrufer authentifiziert? (`getUser` = Cookie-Session via `lib/supabase/server`; `Bearer` = Token via `admin.auth.getUser(token)`; `CRON` = `Authorization: Bearer CRON_SECRET`; `Sig` = kryptografische Webhook-Signatur)
- **Rolle**: Rollenprüfung (`admin` = `profiles.role in ('admin','superadmin')`; `superadmin`; `orgRole` = `requireOrgRole()` gegen `organization_members`; `owner` = Objekt-Eigentümerschaft)
- **Client**: `anon` = Anon-Key mit User-Session → **RLS greift** (inkl. org_fence nach Apply); `SR` = SERVICE_ROLE → **RLS umgangen**; `—` = kein DB-Zugriff
- **org_id**: `RLS` = per `current_org_id()`-Fence (nach Apply); `explizit` = im Code gefiltert/gesetzt; `KEIN` = weder noch (bei SR-Zugriff auf tenant_tables kritisch); `n/a` = keine tenant_tables berührt
- **Client-Input**: nimmt die Route eine org-bezogene ID vom Client entgegen — und wird sie validiert?
- **Test**: Tenant-Test in `__tests__/` vorhanden? (`statisch` = `__tests__/shadow-db/tenant-isolation.test.ts` Struktur-/Mock-Ebene; dynamische Shadow-DB-Tests sind derzeit skipped)

---

## 1) API-Routen `/api/admin/*` (10)

| Pfad | Auth | Rolle | Client | org_id | Client-Input ungeprüft? | Test | Risiko | Fix |
|---|---|---|---|---|---|---|---|---|
| `admin/abrechnung/itsg` | getUser | admin | SR (Zertifikat-Cache in lib) | n/a (Empfänger-Zertifikate = öffentl. ITSG-Daten, global) | `ik` (validiert, 9 Ziffern) | nein | **P2** | Empfänger-Cache explizit als globale Stammdaten dokumentieren |
| `admin/abrechnung/sftp-key` | getUser | admin | SR | KEIN — `datenannahmestellen` sind aber globale Kassen-Stammdaten (nicht in tenant_tables) | `das_id` (Existenz geprüft, kein Org-Bezug) | nein | **P2** | Beim Org-Rollout klären, ob DAS-Keys je Org getrennt werden müssen |
| `admin/abrechnung/sftp-test` | getUser | admin | SR | KEIN (globale Stammdaten) | `id` (DAS, Existenz geprüft) | nein | **P2** | wie sftp-key |
| `admin/abrechnung/zertifikat` | getUser | admin | SR | **KEIN — `abrechnung_zertifikate` IST tenant_table; GET listet ALLE Orgs inkl. `zertifikat_url`** | nein | nein | **P1** | GET/POST auf `.eq('organization_id', await getActiveOrgId())` einschränken |
| `admin/invoices/[id]/generate-pdf` | getUser | admin | anon (Daten) + SR (nur Storage) | RLS (invoice/items/records über anon-Client geladen) | `id` aus URL — durch RLS-Read validiert | nein | **P2** | Nach Apply verifizieren, dass Fence den anon-Read schneidet; `invoice_packages`-Write org-prüfen |
| `admin/krankenfahrten` | getUser | admin | anon | n/a (`krankenfahrten` nicht in tenant_tables) | PUT: `entity`,`id`,`...updates` = Mass-Assignment beliebiger Spalten | nein | **P2** | Update-Felder whitelisten; Tabelle ggf. in tenant_tables aufnehmen |
| `admin/manage-role` | getUser | **superadmin** | SR | KEIN (profiles global) | `userId` (Existenz geprüft, kein Org-Bezug) | statisch (p0-1) | **P1** | Vergibt PLATTFORM-Admin (öffnet alle Admin-Routen mandantenübergreifend) — auf org-scoped Rollen (`organization_members`) migrieren |
| `admin/ocr` | getUser | admin | anon | RLS (`ocr_results`, `review_errors`, `service_records` gefenced) | `service_record_id` — per RLS-Read validiert | nein | **OK** | — |
| `admin/pricing` | getUser | admin | anon | n/a (`kf_pricing_*` = globale Plattform-Preise) | `entity` (Whitelist) | nein | **OK** | — |
| `admin/reset-password` | getUser | admin (Ziel-Admin nur superadmin) | SR | **KEIN — kann Passwörter BELIEBIGER User inkl. Mandanten-User setzen** | `userId`/`email` (kein Org-Bezug) | nein | **P1** | Ziel-User gegen aktive Org prüfen (`organization_members` bzw. Stamm-Org-Zugehörigkeit) |

## 2) API-Routen Abrechnung / Betrieb (Kern-Risiken)

| Pfad | Auth | Rolle | Client | org_id | Client-Input ungeprüft? | Test | Risiko | Fix |
|---|---|---|---|---|---|---|---|---|
| `billing/auto-invoice` | getUser ODER Bearer (Native) | admin ODER **irgendeine** Betreuungskraft | SR | **KEIN** — liest `service_records`, `clients` (Versicherungsdaten!), schreibt `invoices`/`invoice_items` ohne org_id (→ Stamm-Org-Default) | **JA, KRITISCH: `client_id`/`service_record_id` aus Body — Caregiver-Pfad prüft NICHT die Zuordnung Betreuungskraft↔Klient** | nein | **P0** | `record.caregiver_id === auth.caregiverId` erzwingen (bzw. bei `client_id`+`month`: Assignment-Check); `organization_id` des Klienten auf die Rechnung übernehmen |
| `leistungsnachweis` (GET, §45b-Nachweis inkl. Unterschriften) | getUser | admin ODER `clients.user_id === user.id` | SR | **KEIN im Admin-Pfad** (Kunde-Pfad durch Ownership abgesichert) | `client_id`/`verordnung_id` aus Query — Ownership geprüft, Org nicht | nein | **P1** | Admin-Pfad: `.eq('organization_id', await getActiveOrgId())` auf `clients`/`service_records` |
| `native/geo-events` | Bearer (`requireCaregiverSession`) | Betreuungskraft + `record.caregiver_id`-Check | SR | **KEIN — Insert `geo_events`/`review_errors` ohne org_id → Stamm-Org-Default** | `service_record_id` — Ownership geprüft ✓ | nein | **P1** | `organization_id` vom geladenen `service_records`-Datensatz übernehmen |
| `native/leistungsnachweis-upload` | Bearer | Betreuungskraft + Ownership-Check ✓ | SR (DB + Storage `service-proofs`) | **KEIN — `ocr_results`-Insert ohne org_id** | `service_record_id` — Ownership geprüft ✓ | nein | **P1** | wie geo-events |
| `native/signatures` | Bearer | Betreuungskraft + Ownership-Check ✓ | SR | **KEIN — `service_signatures`-Upsert ohne org_id** | `service_record_id` — Ownership geprüft ✓ | nein | **P1** | wie geo-events |
| `pricing` (GET) | getUser ODER Bearer | eingeloggt | SR | **KEIN — `service_pricing` IST tenant_table; liefert nach SaaS-Start Preise ALLER Orgs gemischt** | Query-Filter unkritisch | nein | **P1** | org-Filter setzen oder auf anon-Client (RLS) umstellen |
| `bookings/notify` | getUser | Teilnehmer der Buchung ODER admin | anon (Read, RLS) + SR (notifications-Write) | RLS (bookings gefenced); notifications nicht in tenant_tables | `bookingId` — per RLS-Read + Teilnehmer-Check validiert ✓ | nein | **OK** | — |
| `bookings/respond` | getUser | `booking.angel_id === user.id` ODER admin | anon (Read) + SR (Status-Update mit optimistic lock) | RLS beim Read; Update ändert org_id nicht | `bookingId` — validiert ✓ | nein | **OK** | — |
| `engel/match` | getUser | eingeloggt | anon (RPC `get_engel_cards`, safe columns) + SR (`profiles`, `angel_availability` — beide nicht tenant_tables) | n/a (Engel-Pool ist Plattform-/Stamm-Org-Konzept) | Query-Parameter unkritisch (Radius gedeckelt) | nein | **P2** | Dokumentieren, dass Engel-Discovery bewusst plattformweit ist |
| `reviews` | getUser | `booking.customer_id === user.id` (POST) | anon | RLS | `bookingId`/`angelId` — Ownership geprüft ✓ | nein | **OK** | — |
| `notify` | getUser | self ODER admin | anon | RLS/n. a. (`notifications` user-scoped) | `userId` — gegen `user.id` geprüft ✓ | nein | **OK** | — |

## 3) API-Routen Organisationen / Billing (Vorbild-Muster)

| Pfad | Auth | Rolle | Client | org_id | Client-Input ungeprüft? | Test | Risiko | Fix |
|---|---|---|---|---|---|---|---|---|
| `organizations` (GET/POST) | getUser | Mitglied / Ersteller wird Owner | SR (user-scoped Filter) | explizit | `ik_nummer` etc. validiert (IK-Prüfziffer, Unique-Check) | statisch | **OK** | — |
| `organizations/subscription` | getUser | Mitglied | SR | explizit (`getActiveOrgId()` — Cookie gegen Mitgliedschaft validiert) | nein | statisch | **OK** | — |
| `organizations/switch` | getUser | Mitgliedschaft validiert | SR | explizit | `organization_id` aus Body — **gegen `organization_members` geprüft ✓** | statisch | **OK** | — |
| `organizations/zertifikat` | getUser (via requireOrgRole) | orgRole (owner/admin) | SR (Storage org-partitioniert: `zertifikate/org-{id}`) | explizit (+ IK-Abgleich Zertifikat↔Org) | `organization_id` aus Form — **per `requireOrgRole` validiert ✓** | statisch | **OK** | — |
| `stripe/checkout` | getUser (via requireOrgRole) | orgRole | — (Stripe) | explizit | `orgId` aus Body — validiert ✓ | nein | **OK** | — |
| `stripe/portal` | getUser (via requireOrgRole) | orgRole | SR | explizit | `orgId` — validiert ✓ | nein | **OK** | — |
| `stripe/webhook` | Sig (`stripe-signature` + Webhook-Secret) | — | SR | explizit (`orgId` aus Stripe-Metadata = serverseitig gesetzt, vertrauenswürdig) | nein | nein | **OK** | — |

## 4) API-Routen Cron / Hintergrundjobs

`vercel.json` crons: `/api/cron/drip` (tägl. 9:00), `/api/cron/review-request` (tägl. 10:00), `/api/cron/indexnow` (wö. Mo 6:00). Zusätzlich pg_cron → Edge Function (s. Abschnitt 8).

| Pfad | Auth | Client | org_id | Test | Risiko | Fix |
|---|---|---|---|---|---|---|
| `cron/drip` | CRON_SECRET (fail-closed) | — (Proxy auf `/api/drip`) | n/a | nein | **OK** | — |
| `cron/indexnow` | CRON_SECRET | — | n/a | nein | **OK** | — |
| `cron/review-request` | CRON_SECRET | SR | **KEIN — `bookings` (tenant_table) ALLER Orgs; verschickt Alltagsengel-Review-Mails auch an Mandanten-Kunden** | nein | **P1** | `.eq('organization_id', STAMM_ORG)` |
| `drip` | CRON_SECRET (fail-closed) | SR | KEIN — `profiles`/`bookings` plattformweit; profiles hat keine org-Spalte (B2C-Kunden = Plattform), bookings-Zugriff aber org-blind | nein | **P2** | Drip-Zielgruppe auf Stamm-Org-Kunden dokumentieren/einschränken |

## 5) API-Routen Auth / Self-Service / Public

| Pfad | Auth | Rolle | Client | org_id | Client-Input ungeprüft? | Test | Risiko | Fix |
|---|---|---|---|---|---|---|---|---|
| `auth/check-rate-limit` | keine (public, by design) | — | SR | n/a (`login_rate_limits` global) | `email` — beliebige Fremd-E-Mail sperrbar (Lockout-DoS) | nein | **P2** | Sperren nur nach echtem Fehlversuch serverseitig zählen |
| `auth/send-reset` | keine (public) | — | SR | n/a | `email` (Enumeration abgefangen: immer success) | nein | **P2** | Rate-Limit ergänzen |
| `auth/send-welcome` | getUser | self (`user.email === email` ✓) | — (nur Resend) | n/a | nein | nein | **OK** | — |
| `user/delete` | getUser | self | SR (Soft-Delete eigener Daten) | n/a | nein | nein | **OK** | — |
| `user/delete/undo` | Undo-Token (DB-validiert, zeitbegrenzt) | — | SR | n/a | `token` — validiert ✓ | nein | **OK** | — |
| `push/fcm-register` | getUser | self | anon | n/a | `token` an `user.id` gebunden ✓ | nein | **OK** | — |
| `push/subscribe` | getUser | self | anon | n/a | ✓ | nein | **OK** | — |
| `push/send` | interner Header `x-service-key === SUPABASE_SERVICE_ROLE_KEY` | — | SR | n/a | `userId` (nur intern erreichbar) | nein | **P2** | Eigenes internes Secret statt Service-Role-Key als Header-Wert |
| `notify-admin-registration` | getUser | self (`userId === user.id` ✓) | SR | n/a (`notifications` an Plattform-Admins) | ✓ | nein | **OK** | — |
| `referral` (GET/POST) | Bearer | self (referred = `user.id`) | SR | n/a (`referrals` nicht tenant_table, self-scoped) | `referral_code` (Lookup, ok) | nein | **P2** | Defense-in-depth: auf anon-Client + RLS umstellen |
| `referral/complete` | getUser | self (`user.id === user_id` ✓) | SR (+ RPC `increment_referral_credit`) | n/a | ✓ | nein | **P2** | Credits idempotent machen (Doppel-Aufruf) |
| `newsletter` | keine (public) | — | SR | n/a | `email` (Fremdanmeldung ohne Double-Opt-In-Check hier) | nein | **P2** | Double-Opt-In erzwingen |
| `newsletter/unsubscribe` | keine (public) | — | SR | n/a | `email` aus Query — **jeder kann Fremd-E-Mails austragen** | nein | **P2** | Signierten Unsubscribe-Token verwenden |
| `ai-chat` | getUser | admin | anon | RLS teilweise — `profiles`, `mis_auth_log`, `visitor_locations` sind NICHT gefenced → nach SaaS-Start Fremd-User-Daten im LLM-Kontext möglich | nein | nein | **P2** | LLM-Kontext-Queries auf org-gefencte Tabellen beschränken |
| `beratung-chat` | keine (public, by design) | — | SR (nur `login_rate_limits` als LLM-Budget-Zähler) | n/a | Nachrichten (gekappt) | nein | **OK** | — |

## 6) API-Routen Tracking / Marketing / Extern

| Pfad | Auth | Client | org_id | Risiko | Fix |
|---|---|---|---|---|---|
| `analytics/capi` | keine | — (Stub, kein Persist) | n/a | **OK** | — |
| `analytics/vitals` | keine (Rate-Limit/IP) | SR (`analytics_events`, global) | n/a | **P2** | Payload weiter validieren; unkritisch |
| `track` | keine | SR (`visitors`, `visitor_locations`) | n/a | **P2** | Rate-Limit/Bot-Filter |
| `track-conversion` | keine | SR (`conversions`) | n/a | **P2** | dito |
| `visitor-alert` | keine | SR (`visitor_locations` + `notifications` an alle Admins) | n/a | **P2** | Fälschbare Admin-Notifications — internes Secret oder Server-seitig auslösen |
| `lead-inquiry` | keine (public Formular) | SR (`lead_inquiries`, nicht tenant_table) | n/a | **P2** | Rate-Limit |
| `kontakt` | keine | — (nur Resend) | n/a | **OK** | — |
| `google-reviews` | keine | — (Google Places API, gecacht) | n/a | **OK** | — |
| `client-ip` | keine | — | n/a | **OK** | — |
| `whatsapp/webhook` | Sig (Meta `x-hub-signature-256`, fail-closed) | SR (`whatsapp_conversations`, global) | n/a | **OK** | — |
| `pricing/calculate` | keine | — (reine Berechnung, kein DB) | n/a | **OK** | — |

## 7) Server Components & Client-Pages

| Stelle | Typ | Client | org_id | Risiko | Anmerkung |
|---|---|---|---|---|---|
| `app/kunde/engel/[id]/page.tsx` | **einzige RSC mit DB-Zugriff** | anon (Session) | RLS/n. a. (`angel_reviews`, `angel_availability` nicht in tenant_tables — Engel-Pool = Plattform) | **OK** | `id` aus URL, nur öffentliche Engel-Profildaten |
| ~100 Seiten unter `app/admin/**`, `app/mis/**`, `app/kunde/**`, `app/engel/**`, `app/fahrer/**`, `app/onboarding`, `app/auth/**`, `app/notfall/[id]` | **alle `'use client'`** | Browser-anon-Key | **RLS + org_fence (nach Apply)** | **OK*** | *Bedingt: Isolation hängt zu 100 % an der noch NICHT applizierten Migration + dem bestehenden RLS-Lockdown. Vor dem Apply keine Org-Trennung. |
| `app/auth/callback/route.ts`, `app/blog/feed.xml/route.ts`, `app/sentry-example/api/route.ts` | Route-Handler außerhalb `/api` | anon/— | n/a | **OK** | Auth-Flow / RSS / Sentry-Test, keine Tenant-Daten |

## 8) Supabase Edge Functions

| Function | Auth | Client | org_id | Risiko | Anmerkung |
|---|---|---|---|---|---|
| `supabase/functions/account-hard-delete` | CRON_SECRET + verify_jwt | SR | KEIN — löscht mandantenübergreifend | **OK (begründet)** | Löscht nur Accounts mit `deleted_at < now()-60d` (self-initiiert via `/api/user/delete`) — Org-übergreifend ist hier korrekt (DSGVO-Löschpflicht gilt unabhängig vom Mandanten) |

## 9) RPC-Aufrufe (`.rpc(...)`)

| Aufruf | Stelle | Client | Risiko | Anmerkung |
|---|---|---|---|---|
| `get_engel_cards` | `api/engel/match` (anon) | anon | **P2** | SECURITY-DEFINER-RPC mit Safe-Columns (20260705); kein Org-Konzept — Engel = Plattform-Pool |
| `get_emergency_info` (PIN-geschützt) | `app/notfall/[id]/page.tsx` (Browser) | anon | **OK** | PIN-Gate serverseitig, `notfall_pin` verlässt DB nie |
| `increment_referral_credit` | `api/referral/complete` (2×) | SR | **P2** | IDs stammen aus validierter `referrals`-Zeile; nicht idempotent |

DB-seitig genutzte Funktionen: `current_org_id()`, `is_org_member()`, `has_org_role()` — Grants korrekt (kein `public`), `SECURITY DEFINER` + `search_path` gesetzt.

## 10) Storage-Zugriffe (`storage.from(...)`)

| Bucket / Stelle | Zugriff | Risiko | Anmerkung |
|---|---|---|---|
| `service-proofs` — `api/native/leistungsnachweis-upload`, `api/admin/invoices/[id]/generate-pdf` | SR, Pfade `{record_id}/…` bzw. `invoice-packages/{invoice_id}` | **P2** | Zugriff nur via Signed URLs (7 Tage); Pfade nicht org-partitioniert — Objekt-Zugriff hängt an Erraten der UUID + es gibt keine Storage-RLS auf org-Ebene |
| `ZERTIFIKAT_BUCKET` — `api/admin/abrechnung/sftp-key|sftp-test`, `api/organizations/zertifikat` | SR, `sftp-keys/{das_id}.key`, `zertifikate/org-{orgId}.p12` | **P2** | Org-Zertifikate sind org-partitioniert (gut); SFTP-Keys global (Kassen-Stammdaten) |
| `lib/upload-document.ts` → Bucket `documents` (Client-seitig, `app/engel|kunde/dokumente`) | anon | **P2** | Laut Security-Memo existieren Bucket + Tabelle nicht (Dead-Code-Pfad) — vor Aktivierung org-Pfad-Konzept festlegen |
| `app/mis/documents/page.tsx` (Client-seitig) | anon | **OK*** | `'use client'` → Storage-RLS/Policies greifen; `mis_documents`-Tabelle ist gefenced |

## 11) Export- / Dokument-Generierung

| Stelle | Format | Auth | Risiko | Anmerkung |
|---|---|---|---|---|
| `api/admin/invoices/[id]/generate-pdf` | PDF (pdf-lib, Rechnungspaket + Unterschriften) | admin | **P2** | Daten via anon-Client (RLS); nur Storage via SR |
| `api/leistungsnachweis` | JSON-Basis für §45b-Nachweis (inkl. Unterschrift-Bildern) | admin ODER Klient-Owner | **P1** | s. Abschnitt 2 — Admin-Pfad SR ohne Org-Filter |
| CSV-Exporte | — | — | **OK** | Keine serverseitigen CSV-Routen gefunden (Exporte laufen client-seitig aus RLS-gefilterten Daten) |

---

## Zusammenfassung

| Kategorie | Anzahl |
|---|---|
| **API-Routen gesamt (`app/api/**/route.ts`)** | **58** |
| davon **P0** (Cross-Tenant-/Cross-Client-Leak möglich) | **1** |
| davon **P1** (Defense-in-depth fehlt / Org-Blindheit bei service_role) | **9** |
| davon **P2** (Härtung empfohlen, kein direkter Tenant-Leak) | **24** |
| davon **OK** | **24** |
| Edge Functions | 1 (OK, begründet) |
| Server Components mit DB-Zugriff | 1 (OK) + ~100 Client-Pages (RLS-abhängig) |

**P0:**
- `app/api/billing/auto-invoice/route.ts` — Caregiver-Pfad ohne Zuordnungsprüfung; `client_id` aus Body → Rechnungserstellung + Versicherungsdaten-Zugriff für beliebige Klienten via service_role.

**P1:**
1. `app/api/admin/abrechnung/zertifikat/route.ts` — GET listet Zertifikate ALLER Orgs (service_role, kein Org-Filter auf tenant_table)
2. `app/api/admin/manage-role/route.ts` — globale Plattform-Rolle statt org-scoped Rollen
3. `app/api/admin/reset-password/route.ts` — Passwort-Reset mandantenübergreifend möglich
4. `app/api/leistungsnachweis/route.ts` — Admin-Pfad service_role ohne Org-Filter
5. `app/api/native/geo-events/route.ts` — SR-Insert ohne `organization_id` (Stamm-Org-Default)
6. `app/api/native/leistungsnachweis-upload/route.ts` — dito (`ocr_results`)
7. `app/api/native/signatures/route.ts` — dito (`service_signatures`)
8. `app/api/pricing/route.ts` — `service_pricing` (tenant_table) via SR ohne Org-Filter
9. `app/api/cron/review-request/route.ts` — `bookings` aller Orgs, Mails an Mandanten-Kunden

**Testabdeckung:** `__tests__/shadow-db/tenant-isolation.test.ts` (statisch: Migrations-Struktur + `requireOrgRole`-Mocks für `/api/organizations/*`) und `__tests__/security/p0-1-admin-auth.test.ts` (Middleware-Admin-Gate). Die dynamischen RLS-Tests der Shadow-DB-Suite (SELECT/INSERT/UPDATE/DELETE Cross-Tenant + service_role-Bypass) laufen seit 2026-08-02 real gegen die lokale Shadow-DB (`scripts/shadow-db.sh` + `scripts/shadow-db-http.sh`, siehe `audit/SHADOW_DB_LIVE_TEST_REPORT.md`) — sie testen aber die **DB-Schicht**, nicht die Routen: **keine einzige der 58 Routen hat einen eigenen dynamischen Cross-Tenant-Test** (Route-Handler mit zwei Org-Sessions aufrufen). Das bleibt offen, v. a. für die P0/P1-Service-Role-Routen, bei denen RLS als Netz fehlt.
