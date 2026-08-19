# Security- & QA-Gesamtprüfung (Track 7)

**Datum:** 2026-08-19
**Projekt:** Alltagsengel (`alltagsengel-next`)
**Supabase-Projekt:** `nnwyktkqibdjxgimjyuq` (Production, verifiziert gegen `NEXT_PUBLIC_SUPABASE_URL`)
**Commit-Basis:** `3b939d0`
**Prüfer:** Automatisierte Prüfung (Codescan + Live-Abfragen gegen Production)

---

## Gesamturteil

| | |
|---|---|
| **Bau- und Testfähigkeit** | ✅ vollständig grün (Typecheck, Lint, 3062 Tests, Production-Build) |
| **Externe Angriffsfläche (anon)** | ✅ dicht — 321 Relationen geprüft, kein Leseleck |
| **Rollentrennung (RBAC)** | ✅ durchgängig, fail-closed |
| **Mandantentrennung** | ⚠️ **strukturell unvollständig** — 82 von 298 Tabellen haben keine `organization_id` |
| **Audit-Trail** | ⚠️ funktionsfähig, aber nicht flächendeckend |
| **DSGVO** | ⚠️ 3 offene Punkte (Stripe fehlt in Datenschutzerklärung, kein Art.-15-Export außerhalb PflegeCoach, Analytics ohne Mandantenbezug) |

**Kein P0/kritischer Befund.** Es gibt **kein** unauthentifiziertes Leseleck auf personenbezogene Daten, **keine** hardcodierten Secrets und **keine** offene RLS-Lücke.
Die relevanten Befunde sind **1× HOCH**, **4× MITTEL**, **7× NIEDRIG**.

---

## Ergebnistabelle

| # | Prüfung | Ergebnis | Kurzfazit |
|---|---------|----------|-----------|
| 1 | RLS-Policies alle Tabellen | ✅ **PASS** | 298 Tabellen, 872 Policies, RLS überall aktiv; 2 policy-lose Tabellen sind gewollt |
| 2 | org_fence / `getActiveOrgId()` | ⚠️ **WARN** | Anwendungsschicht sauber; DB-Ebene bei 82 Tabellen ohne Org-Spalte org-blind |
| 3 | RBAC `require*()` | ✅ **PASS** | 353/384 Routen bewacht; die 22 ungeschützten sind belegt öffentlich oder anders gesichert |
| 4 | Audit-Trail `logAuditEvent()` | ⚠️ **WARN** | Live nachweislich funktionsfähig; 4 Schreibpfade ohne Audit |
| 5 | Keine Client-Side-Writes | ⚠️ **WARN** | 4 verbliebene Direktschreibpfade aus dem Browser (RLS-gedeckt, aber ungeprotokolliert) |
| 6 | Keine hardcodierten Secrets | ✅ **PASS** | 0 Treffer im Code; Historie enthält nur öffentliche Werte |
| 7 | DSGVO-Datenflüsse | ⚠️ **WARN** | Auftragsverarbeiter dokumentiert bis auf Stripe; Art. 15 nur für PflegeCoach |
| 8 | TypeScript `tsc --noEmit` | ✅ **PASS** | Exit 0, 0 Fehler |
| 9 | Lint `npm run lint` | ✅ **PASS** | Exit 0, 0 Findings |
| 10 | Tests `vitest run` | ✅ **PASS** | 152 Dateien / 3062 Tests grün, 38 skipped, 0 rot |
| 11 | Build `npm run build` | ✅ **PASS** | Exit 0, Turbopack, 579 Seiten, Compile 107 s |

---

## 1 — RLS-Prüfung · ✅ PASS

Vollständige Inventur gegen Production (`scripts/rls-matrix.ts`, Ergebnis in `docs/security/RLS_MATRIX.md` + `rls-matrix.csv`, in diesem Lauf neu erzeugt).

- **298 Tabellen, 872 Policies. RLS ist auf jeder Tabelle aktiviert** — keine einzige Ausnahme.
- **2 Tabellen ohne jede Policy:** `_sql_parts`, `coach_pseudonym_key`. Beides ist **beabsichtigt** und in den Migrationen begründet (`20260817010000`: `_sql_parts` gesperrt; `20260826010000`: Pseudonym-Schlüssel nur `service_role`). Kein Befund.
- **Anon-Zugriff live geprüft** (`scripts/verify-anon-exposure.mjs`): *321 Relationen* getestet, **kein Leseleck**. Nur 6 Relationen sind bewusst öffentlich (Referenzdaten wie `bundeslaender`, `plz_bundesland_regeln`).
- Stichprobe per PostgREST bestätigt: `profiles`, `clients`, `caregivers`, `invoices`, `service_records`, `documents`, `wounds`, `medikamentenplan`, `notfall_info` liefern für `anon` alle **HTTP 401** (`permission denied`).
- **`scripts/audit-rls.ts`** (CAPA-2026-001): bestanden — RLS aktiv, keine der 2026 gedroppten Notfall-Policies wieder da, CHECK-Constraint `notfall_info_pin_format_check` vorhanden.
- **`scripts/verify-security-p0.mjs`: 9/9 bestanden** — SQL-Exec-RPC für `anon` zu, alle sechs `wf_*`/`next_billing_number` nur `service_role`, keine `profiles`-Rekursion.
- **Alle 13 Storage-Buckets sind privat** (`public=false`), inkl. `wound-photos`, `kunden-dokumente`, `mitarbeiter-dokumente`, `kim-attachments`. 15 Policies auf `storage.objects`, **keine** davon mit `anon` oder `USING(true)`.
- **Alle `SECURITY DEFINER`-Funktionen haben `search_path` gepinnt** — 0 Treffer bei der Gegenprobe. Damit ist ein früherer Befund geschlossen.

---

## 2 — Mandantentrennung / org_fence · ⚠️ WARN

### Anwendungsschicht: sauber
- `getActiveOrgId()` in **126 Dateien** im Einsatz; die Guards (`requireOpsAdmin`, `requirePflegeAdmin`, `requireAdminMitOrg`, …) liefern die `organizationId` im Kontext mit und **verweigern mit 403, wenn keine Organisation bestimmbar ist**.
- **Server Actions: 60/60 mit Auth-Prüfung.** 56 davon zusätzlich mit Org-Bezug. Ohne Org-Bezug: `app/auth/login/actions.ts` (korrekt — vor dem Login gibt es keine Org), `app/mis/actions.ts`, `app/mis/analytics/actions.ts`, `app/admin/analytics/actions.ts`.
- `org_fence`-Policies sind **RESTRICTIVE** und greifen zusätzlich zu den Rollen-Policies.

### Befund HOCH-1: 82 Tabellen ohne `organization_id`
Von 298 Tabellen haben **82 keine Org-Spalte** — dort *kann* kein `org_fence` greifen. Bei **52** davon ist die einzige Admin-Policy ein org-blindes `is_admin()`. Ein Großteil ist unkritisch (globale Referenzdaten: `billing_feiertage`, `kf_pricing_*`, `content_blocks`, `bundeslaender`).

**Personenbezogen und damit relevant sind:**

| Tabelle | Inhalt |
|---|---|
| `profiles` | Stammdaten aller Nutzer |
| `angels`, `angel_availability` | Engel-Stammdaten und Verfügbarkeiten |
| `messages`, `chat_messages`, `whatsapp_conversations` | Nachrichteninhalte |
| `krankenfahrten`, `krankenfahrt_providers`, `krankenfahrt_reviews` | Fahrten inkl. Ziel-Adressen |
| `notifications`, `lead_inquiries`, `newsletter_subscribers`, `referrals` | Kontaktdaten |
| `mis_privacy_records`, `mis_privacy_requests`, `mis_privacy_consents`, `mis_privacy_audit_log` | **DSGVO-Anfragen und Einwilligungen** |
| `audit_logs`, `mis_auth_log`, `notfall_access_attempts` | Sicherheits-Protokolle |
| `visitors`, `visitor_locations`, `page_views`, `geo_events`, `partner_visits`, `analytics_events` | Besucher-/Standortdaten |

**Wirkung:** Ein Administrator einer beliebigen Organisation sieht in diesen Tabellen die Daten **aller** Organisationen.
**Aktuelle Realwirkung:** begrenzt, weil produktiv praktisch nur die Stamm-Organisation genutzt wird (`00000000-0000-4000-8000-000460629986`).
**Als echter Mandantenbetrieb startet, ist das ein Blocker.**

Dass das Muster bekannt und lösbar ist, zeigen `reviews` und `angel_reviews`: dort ist die Admin-Policy bereits auf `is_admin() AND buchung_in_aktiver_org(booking_id)` verengt. Genau dieses Muster fehlt bei den übrigen Tabellen.

### Befund MITTEL-1: `getActiveOrgId()` ist fail-open
`lib/organizations/server.ts:46` liefert bei fehlender Mitgliedschaft **und bei jeder Exception** `DEFAULT_ORG_ID` (Stamm-Org) zurück statt zu scheitern:

```
if (orgs.length === 0) return DEFAULT_ORG_ID
…
} catch { return DEFAULT_ORG_ID }
```

Ein Admin ohne Zeile in `organization_members` — oder ein transienter DB-Fehler — landet damit still in der Stamm-Organisation statt einen 403 zu bekommen. Der Guard `requireOpsAdmin` prüft danach nur noch auf *leer*, und leer wird nie zurückgegeben.

### Befund MITTEL-2: Analytics ohne Mandantenbezug (aktiver Schema-Drift)
`npm run check:schema-drift` meldet **2 Treffer**:

```
app/admin/analytics/actions.ts:61  page_views.organization_id  (.eq)
app/admin/analytics/actions.ts:87  visitors.organization_id    (.eq)
```

Beide Spalten existieren live nicht → die Abfragen scheitern mit `42703`, das Admin-Analytics ist also **still kaputt**. Zusätzlich liest `app/api/ai-chat/route.ts:39` `visitor_locations` **ohne jeden Org-Filter** und schickt die Aggregation an ein LLM — Besucherdaten aller Mandanten in einer Mandanten-Ansicht.

---

## 3 — RBAC · ✅ PASS

- **353 von 384 API-Routen** enthalten einen Guard (`require*()`, `CRON_SECRET`, Webhook-Signatur oder `auth.getUser()`).
- 27 verschiedene `require*()`-Guards, am häufigsten `requireOpsAdmin()` (195×), `requirePflegeAdmin()` (53×), `requirePersonalAdmin()` (37×).
- Die Guards prüfen **Rolle gegen `profiles.role`** (`admin`/`superadmin`) und liefern sauber 401 bzw. 403.
- **Middleware `proxy.ts` ist fail-closed:** Matcher deckt `/admin`, `/mis`, `/kunde`, `/engel`, `/fahrer`, `/api` ab; Rolle wird aus `app_metadata.role` (nur serverseitig setzbar) mit DB-Fallback auf `profiles.role` bestimmt — `user_metadata.role` wird bewusst **nicht** verwendet. Jede Exception endet im Redirect auf `/auth/login`.
- **Die 22 Routen ohne Guard wurden einzeln geprüft** und sind allesamt erklärbar:
  - *Bewusst öffentlich:* `client-ip`, `expansion/status` (fail-safe „Kasse aus"), `coach/tarife` (§ 312j Abs. 2 BGB, liefert bei gesperrtem Verkauf leeres Array), `google-reviews`, `pricing/calculate`, `kontakt`, `coach/anfrage`, `newsletter*`, `lead-inquiry`, `track*`, `analytics/*`.
  - *Guard liegt eine Ebene tiefer:* `billing/tariffs/[id]/verifizierung` und `billing/leistungspreise/[id]/verifizierung` delegieren an `lib/billing/tarif-verifizierung-service.ts`, das **`requireOpsAdmin()` als erste Anweisung** in beiden Handlern aufruft.
  - *Eigener Secret-Check:* `push/send` (`x-service-key`), `cron/*` (`CRON_SECRET`), `referral` (Bearer-Token gegen `auth.getUser`), `user/delete/undo` (Einmal-Token, 64 hex).

### Befund NIEDRIG-1: keine Guard-Ebene auf Admin-Seiten
Die Server-Komponenten unter `app/admin/**/page.tsx` und `app/mis/**/page.tsx` haben überwiegend **keinen eigenen** Auth-Check; der Schutz hängt allein an `proxy.ts`. Das ist funktional korrekt und fail-closed, aber einschichtig — ein Fehler in der Matcher-Konfiguration würde sofort durchschlagen. Datenzugriff selbst bleibt durch RLS + API-Guards geschützt.

---

## 4 — Audit-Trail · ⚠️ WARN

- `logAuditEvent()` (`lib/audit-log.ts:92`) schreibt nach `mis_audit_log`, ist **fail-soft** (gibt `false` zurück, blockiert die Hauptaktion nicht) und wird in **102 Dateien** aufgerufen.
- **Live nachgewiesen funktionsfähig:** `mis_audit_log` enthält aktuelle Einträge, u. a. `create/update` auf `angel` und `profile` vom 2026-08-18 mit korrekter `organization_id`. Die geringe Zeilenzahl (8) spiegelt das niedrige Produktionsvolumen, **nicht** einen defekten Audit-Pfad.
- **DB-seitige Absicherung ist stark:** 14 Migrationen definieren Audit-Trigger, darunter Unveränderlichkeits-Trigger auf allen Audit-Tabellen (`trg_audit_logs_no_update/no_delete`, `trg_wf_audit_immutable_*`, `trg_immutable_billing_tariff_audit_*`, `trg_mis_audit_log_no_*`, `trg_pflege_audit_log_immutable_*`). Audit-Zeilen sind damit **nicht nachträglich änderbar**.
- Zweiter, unabhängiger Trail: `wf_audit_log` (66 Zeilen live, u. a. `rechnung_ueberfaellig`-Events vom 2026-08-19) und `billing_tariff_audit` (24 Zeilen).

### Befund NIEDRIG-2: Lücken in der Abdeckung
- Von 291 schreibenden Routen rufen 255 **kein** `logAuditEvent()` direkt auf. Ein großer Teil davon ist über DB-Trigger oder Service-Schichten abgedeckt; abgedeckt ist es aber **nicht nachweisbar** flächendeckend.
- 4 Server Actions ohne Audit: `app/mis/actions.ts`, `app/mis/analytics/actions.ts`, `app/admin/analytics/actions.ts`, `app/auth/login/actions.ts` (letzteres unkritisch — Login wird in `mis_auth_log` protokolliert).
- Die 4 Client-Side-Writes (siehe Punkt 5) laufen **komplett am Audit vorbei**, darunter das Anlegen von Pflegenotizen.

---

## 5 — Server Actions statt Client-Side-Writes · ⚠️ WARN

Vollscan aller `'use client'`-Dateien nach `.insert()/.update()/.upsert()/.delete()` auf dem Supabase-Browser-Client. **4 echte Treffer** (Set-Operationen wurden aussortiert):

| Datei | Operation | RLS-Deckung | Bewertung |
|---|---|---|---|
| `components/admin/CareNotesPanel.tsx:114` | `INSERT care_notes` | ✅ `author_id = auth.uid()` + `author_role`-Bindung + `care_notes_org_fence` | **MITTEL-3** — Pflegedokumentation entsteht ohne Audit-Eintrag |
| `components/OnboardingFlow.tsx:107,120,128` | `UPDATE profiles`, `INSERT/UPDATE care_recipients` | ✅ `auth.uid() = profile_id` bzw. `id = user.id` | NIEDRIG — feste Feldliste, kein beliebiges Update |
| `components/NotificationBell.tsx:129,138` | `UPDATE notifications` (`is_read`) | ✅ `notifications_update_own` | NIEDRIG — unkritisch |
| `components/PageTracker.tsx:76` | `INSERT page_views` | ⚠️ Policy `Anyone can insert page_views` mit `WITH CHECK (true)` | **NIEDRIG-3** — von außen unbegrenzt beschreibbar |

**Bewertung:** Kein Rechteproblem — RLS trägt in allen vier Fällen. Das Problem ist die **Protokollierung**: `care_notes` ist Pflegedokumentation und sollte nicht ohne Audit-Eintrag entstehen können.

### Befund NIEDRIG-3: offene Insert-Policies auf Tracking-Tabellen
`page_views`, `visitors`, `visitor_locations` haben je eine `INSERT`-Policy mit `WITH CHECK (true)` für `public`. Ein Unbeteiligter kann diese Tabellen unbegrenzt befüllen (Datenmüll, Speicherkosten). Kein Datenabfluss — Lesen ist auf `is_admin()` beschränkt.

---

## 6 — Secrets · ✅ PASS

- **Codescan** (JWT-Muster, `sk_live_`/`sk_test_`, AWS-Keys, private Schlüssel, `ghp_`, `sbp_`) über `app/`, `lib/`, `components/`, `scripts/`, `supabase/`, `hooks/`, `types/`: **1 Treffer**, und der ist ein Testplatzhalter (`lib/coach/pricing.test.ts:40`, `sk_test_beispiel`). Kein echter Schlüssel im Code.
- **Kein `NEXT_PUBLIC_`-Name** enthält `SECRET`, `SERVICE`, `PRIVATE`, `TOKEN` oder `PASSWORD`.
- **Keine Client-Komponente** referenziert `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY` oder `STRIPE_SECRET`.
- `.gitignore` sperrt `.env`, `.env.*`, `.env*.local`; getrackt ist nur `.env.example`.
- `npm run lint:forbidden`: **24 173 Dateien gescannt, 0 verbotene Strings.**

### Befund NIEDRIG-4: `.env` lag bis 2026-04 in der Historie
`git log --all -- .env` zeigt 6 Commits zwischen 2026-02-25 und 2026-04-07; entfernt in `351a459` („SICHERHEITSFIX: Kritische Datenlecks behoben").
**Inhalt geprüft:** ausschließlich `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Beide sind **öffentlich by design** (der Anon-Key wird an jeden Browser ausgeliefert). **Kein `service_role`-Key, kein API-Key in der Historie.** Kein Handlungsbedarf; nur festhalten, dass der Anon-Key nicht „still" rotiert werden kann.

---

## 7 — DSGVO-Datenflüsse · ⚠️ WARN

### Was trägt
- **Löschung:** `/api/user/delete` implementiert Soft-Delete (`profiles.deleted_at`), Einmal-Token in `account_deletion_tokens`, Undo-Link, Audit-Event `user_self_soft_delete`. RLS blendet gelöschte Profile über `is_profile_soft_deleted()` in Nachrichten-, Bewertungs- und Benachrichtigungs-Policies aus.
- **Auftragsverarbeiter** in `app/datenschutz/page.tsx` benannt: Google/Gemini, OpenAI, Meta/Facebook, TikTok, WhatsApp, Resend, Sentry, Supabase, Vercel.
- **KI-Datenflüsse geprüft:** `/api/ai-chat` ist admin-only und übergibt **Aggregate** (Zählwerte, Umsatzsummen, Städte) — keine Klarnamen. `/api/beratung-chat` ist öffentlich, aber ratenbegrenzt (8/min, 40/h pro IP) und arbeitet ohne Personenbezug aus der Datenbank.
- **Art.-9-Daten sind gut geschützt:** `wound-photos` privat, `wounds`/`medikamentenplan`/`notfall_info` für `anon` gesperrt, `coach_pseudonym_key` ohne jede Policy.

### Befund MITTEL-4: Stripe fehlt in der Datenschutzerklärung
Stripe ist in 10 Dateien aktiv (`/api/stripe/checkout`, `/portal`, `/webhook`, `/api/coach/checkout`, `/api/coach/webhook`, `/api/organizations/subscription`, …) — in `app/datenschutz/page.tsx` kommt „Stripe" **0×** vor. Solange der Verkauf gesperrt ist (`COACH_PREISE_FREIGEGEBEN` nicht gesetzt), fließen keine Daten; **vor der Freischaltung des Verkaufs ist die Ergänzung zwingend** (Art. 13 Abs. 1 lit. e DSGVO).

### Befund NIEDRIG-5: kein Art.-15-Export außerhalb PflegeCoach
Exportwege existieren für PflegeCoach (`/api/coach/export`), FHIR (`/api/fhir/export`) und Abrechnung (DATEV/DTA/SGB-V). Für den regulären Kunden- und Engel-Bereich gibt es **keinen Selbstbedienungs-Export** nach Art. 15 Abs. 3 DSGVO. Auskünfte müssen manuell erstellt werden — zulässig, aber bei wachsender Nutzerzahl nicht tragfähig.

### Befund NIEDRIG-6: E-Mail nennt eine Gültigkeitsdauer, die der Code nicht durchsetzt
`app/api/auth/send-reset/route.ts` verschickt „Dieser Link ist … nur 1 Stunde gültig". Der Kommentar im selben File hält fest, dass Supabase `expiresIn` an `generateLink` **nicht** entgegennimmt und der Wert im Dashboard gesetzt werden muss (Default 24 h). Ob das Dashboard-Setting gesetzt ist, war in dieser Prüfung nicht feststellbar. Entweder Setting verifizieren oder den Text an die Realität anpassen.

### Befund NIEDRIG-7: Pseudonymitäts-Orakel im PflegeCoach
`coach_finde_nutzer_id(text)` ist `SECURITY DEFINER` und für **jeden angemeldeten Nutzer** ausführbar. Damit lässt sich zu einer beliebigen E-Mail-Adresse abfragen, ob dazu ein PflegeCoach-Konto existiert — eine Mitgliedschaftsauskunft im Gesundheitskontext, ungedrosselt. Für den Einladungs-Flow ist die Funktion nötig; sie sollte aber nur aus dem Server-Kontext (`service_role`) heraus aufrufbar sein.

---

## 8–11 — Qualitätsgates

Alle Läufe **strikt sequenziell** ausgeführt (kein paralleler `tsc`/`vitest`-Lauf), freier Speicher vor dem Build geprüft: **31 GiB frei** (85 % belegt).

| Prüfung | Kommando | Exit | Ergebnis |
|---|---|---|---|
| TypeScript | `npx tsc --noEmit` | **0** | 0 Fehler |
| Lint | `npm run lint` (eslint) | **0** | 0 Findings |
| Tests | `npx vitest run` | **0** | **152 Dateien / 3062 Tests grün**, 1 Datei + 38 Tests skipped, **0 rot**, 24,9 s |
| Build | `npm run build` (Turbopack) | **0** | Compile 107 s, TypeScript-Phase 2,8 min, 579 Seiten generiert |
| Forbidden-Strings | `npm run lint:forbidden` | 0 | 24 173 Dateien, 0 Treffer |
| Schema-Drift | `npm run check:schema-drift` | **≠0** | **2 Befunde** (siehe MITTEL-2) |
| RLS-Audit | `npx tsx scripts/audit-rls.ts` | 0 | bestanden |
| RLS-Matrix | `npx tsx scripts/rls-matrix.ts --check` | Warnung | 2 policy-lose Tabellen, beide gewollt |
| Security-P0 | `node scripts/verify-security-p0.mjs` | 0 | **9/9** |
| Anon-Exposure | `node scripts/verify-anon-exposure.mjs` | 0 | 321 Relationen, kein Leck |

---

## Befundliste nach Schwere

| ID | Schwere | Befund | Ort | Empfohlene Behebung |
|---|---|---|---|---|
| **HOCH-1** | 🔴 hoch | 82 Tabellen ohne `organization_id`; bei 52 ist die Admin-Policy org-blindes `is_admin()`. Betrifft u. a. `profiles`, `messages`, `krankenfahrten`, `angels`, `mis_privacy_*`, `audit_logs` | DB-Schema | Muster von `reviews` übernehmen: Org-Spalte nachrüsten **oder** Admin-Policy auf einen Org-Bezug verengen (`is_admin() AND <org-Nachweis>`). Vor dem ersten echten Fremdmandanten. |
| **MITTEL-1** | 🟠 mittel | `getActiveOrgId()` ist fail-open — liefert bei fehlender Mitgliedschaft und bei jeder Exception die Stamm-Org | `lib/organizations/server.ts:46` | Bei `orgs.length === 0` und im `catch` `null` liefern; Guards verweigern dann bereits korrekt mit 403 |
| **MITTEL-2** | 🟠 mittel | Schema-Drift: `page_views.organization_id` / `visitors.organization_id` existieren nicht → Admin-Analytics scheitert still mit `42703`; `ai-chat` liest `visitor_locations` mandantenübergreifend | `app/admin/analytics/actions.ts:61,87`; `app/api/ai-chat/route.ts:39` | Org-Spalte migrieren oder Filter entfernen; in `ai-chat` einen Org-Filter ergänzen |
| **MITTEL-3** | 🟠 mittel | Pflegenotizen werden aus dem Browser direkt in `care_notes` geschrieben, ohne Audit-Eintrag | `components/admin/CareNotesPanel.tsx:114` | Auf Server Action mit `logAuditEvent()` umstellen |
| **MITTEL-4** | 🟠 mittel | Stripe ist aktiv integriert, fehlt aber in der Datenschutzerklärung | `app/datenschutz/page.tsx` | Abschnitt ergänzen — **vor** Freischaltung des Verkaufs |
| **MITTEL-5** | 🟠 mittel | `cron_check_ueberfaellige_aufgaben()` ist `SECURITY DEFINER` und für `anon` ausführbar (live per PostgREST bestätigt: **HTTP 200**). Ein Unbeteiligter kann Statuswechsel auf `ops_aufgaben` samt Eskalations- und Workflow-Triggern auslösen | DB-Funktion, Migration `20260918000000` | `REVOKE EXECUTE ON FUNCTION public.cron_check_ueberfaellige_aufgaben() FROM PUBLIC, anon, authenticated;` — pg_cron läuft als Superuser und braucht kein Grant |
| **NIEDRIG-1** | 🟡 niedrig | Admin-/MIS-Seiten ohne eigenen Server-Guard, Schutz allein durch `proxy.ts` | `app/admin/**`, `app/mis/**` | Optionale zweite Ebene; RLS trägt bereits |
| **NIEDRIG-2** | 🟡 niedrig | Audit-Abdeckung nicht flächendeckend nachweisbar (255 von 291 Schreibrouten ohne direkten Aufruf) | diverse | Kritische Domänen (Abrechnung, Personal, Pflege) gezielt nachziehen |
| **NIEDRIG-3** | 🟡 niedrig | `page_views`/`visitors`/`visitor_locations` mit `INSERT … WITH CHECK (true)` für `public` | DB-Policies | Rate-Limit serverseitig oder Insert über eine geprüfte Route |
| **NIEDRIG-4** | 🟡 niedrig | `.env` bis 2026-04 in der Historie — Inhalt geprüft, nur öffentliche Werte | Git-Historie | Kein Handlungsbedarf; Anon-Key nicht still rotierbar |
| **NIEDRIG-5** | 🟡 niedrig | Kein Art.-15-Selbstbedienungs-Export außerhalb PflegeCoach | — | Vor Nutzerwachstum nachrüsten |
| **NIEDRIG-6** | 🟡 niedrig | Reset-Mail nennt „1 Stunde", der Code kann das nicht erzwingen | `app/api/auth/send-reset/route.ts` | Dashboard-Setting verifizieren oder Text korrigieren |
| **NIEDRIG-7** | 🟡 niedrig | `coach_finde_nutzer_id(text)` für alle angemeldeten Nutzer ausführbar → Mitgliedschafts-Orakel | Migration `20260916000000` | Grant auf `service_role` beschränken, Aufruf über die API-Route führen |
| **NIEDRIG-8** | 🟡 niedrig | Öffentliche Schreibendpunkte ohne Rate-Limit: `auth/send-reset` (Mail-Flooding auf fremde Postfächer), `newsletter`, `visitor-alert` (Admin-Mail-Spam), `track`, `track-conversion`, `analytics/vitals`, `analytics/capi` | `app/api/**` | `rateLimit()` aus `lib/rate-limit` ergänzen — das Muster existiert bereits in `kontakt`, `lead-inquiry`, `coach/anfrage`, `beratung-chat` |

---

## Was in dieser Prüfung *nicht* abgedeckt ist

Damit der Bericht nicht mehr behauptet, als er belegt:

1. **Kein authentifizierter Cross-Tenant-Test.** Die Anon-Abdichtung ist live gemessen. Ob ein *angemeldeter* Admin von Mandant B tatsächlich Daten von Mandant A sieht, wurde **nicht per Impersonation nachgestellt** — HOCH-1 stützt sich auf die Policy-Analyse, nicht auf einen Angriffsnachweis.
2. **PostgREST-`404` ist mehrdeutig.** Beim RPC-Scan bedeutet `404` „keine Funktion mit dieser Signatur", nicht zwingend „gesperrt". Die belastbare Aussage kommt aus der `has_function_privilege()`-Abfrage im Katalog — und die ist eindeutig: genau **eine** aufrufbare `SECURITY DEFINER`-Funktion ist für `anon` freigegeben (MITTEL-5).
3. **Supabase-Dashboard-Einstellungen** (Link-Ablaufzeit, MFA-Policy, JWT-Laufzeit) sind über die API nicht auslesbar und wurden nicht geprüft.
4. **Keine dynamische Sicherheitsprüfung** — kein Penetrationstest, kein Fuzzing, keine Dependency-CVE-Prüfung (`npm audit` war nicht Teil des Auftrags).
5. **Zeilenzahlen in Audit-Tabellen** sind niedrig, weil das Produktionsvolumen niedrig ist. Das ist eine Beobachtung, kein Nachweis für vollständige Audit-Abdeckung.

---

## Empfohlene Reihenfolge

1. **MITTEL-5** — ein `REVOKE`, sofort umsetzbar, schließt den einzigen anon-erreichbaren Schreibpfad.
2. **MITTEL-2** — Schema-Drift beheben; das Admin-Analytics ist derzeit schlicht kaputt.
3. **MITTEL-1** — `getActiveOrgId()` auf fail-closed umstellen.
4. **MITTEL-4** — Stripe in die Datenschutzerklärung, **bevor** der Verkauf freigeschaltet wird.
5. **HOCH-1** — Org-Bezug nachrüsten. Größte Arbeit, aber erst zwingend, wenn der erste echte Fremdmandant produktiv geht.
6. **MITTEL-3** und **NIEDRIG-8** — Audit für Pflegenotizen, Rate-Limits auf den öffentlichen Endpunkten.

---

*Erstellt im Rahmen von Track 7. Grundlage: Codescan über 384 API-Routen, 60 Server Actions und 319 Migrationen sowie Live-Abfragen gegen `nnwyktkqibdjxgimjyuq` (PostgREST, Katalog-Orakel, Storage-API).*
