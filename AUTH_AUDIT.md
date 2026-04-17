# Auth-Audit AlltagsEngel.care

**Stand:** 2026-04-17
**Auditor:** Claude Opus 4.7 (X High)
**Projekt:** AlltagsEngel.care (Next.js 16 + Supabase + React 19 + Capacitor 8)
**Umfang:** Vollständige Auth-Chain — Register, Login, Callback, Recovery, MFA, Middleware, RBAC, Rate-Limiting, Account-Deletion

---

## Executive Summary

**Befunde:** 4 kritisch (P0), 5 hoch (P1), 3 mittel (P2)
**Gesamt-Risiko-Einschätzung:** **HOCH**

Die Sicherheitsarchitektur hat **solide Grundlagen** (server-verifizierte Sessions via `getUser()`, Admin-RBAC mit Superadmin-Schutz, IP+Email-Rate-Limiting, CSRF-Origin-Check), weist aber **vier exploitable P0-Lücken** auf — besonders rund um Admin-Password-Reset (Klartext-PW in E-Mail), Account-Deletion (kein Passwort-Confirm + CSRF-anfällig) und Error-Logging (potentieller Credential-Leak).

### Top-3-Must-Fix (vor nächstem Production-Deploy)

1. **AUTH-001** Passwort-Reset-Token-Hijack via Klartext-Passwort in Admin-Reset-Mail
2. **AUTH-003** Account-Deletion ohne Passwort-Bestätigung — CSRF-Wipe möglich
3. **AUTH-005** E-Mail-Enumeration in Register/Login — Credential-Stuffing-Vehikel

---

## Findings

### AUTH-001 [P0] Klartext-Passwort in Admin-Reset-Mail

**File:** `app/api/admin/reset-password/route.ts:88-92`

**Beschreibung:**
Admin setzt ein neues Passwort und die Mail enthält `${newPassword}` im Klartext.

**Exploit-Szenario:**
1. Admin-Mailbox wird kompromittiert (Yahoo-Leak, Phishing, etc.)
2. Angreifer durchsucht Archive nach Reset-Mails und findet Klartext-Passwörter
3. Alle betroffenen Konten sind dauerhaft kompromittiert
4. DSGVO-Art.-32-Verletzung (keine angemessenen TOMs)

**Code-Snippet:**
```tsx
<tr><td>Passwort</td><td style="font-weight:600;font-family:monospace;">${newPassword}</td></tr>
```

**Fix-Empfehlung:**
Ersatz durch One-Time-Recovery-Link (Supabase `generateLink({ type: 'recovery' })`). User setzt Passwort selbst via HTTPS. Alternativ Klartext-PW nur im Admin-UI anzeigen, nie per E-Mail senden.

**Effort:** M

---

### AUTH-002 [P0] Unsanitized Error-Logging in Admin-Reset

**File:** `app/api/admin/reset-password/route.ts:103-106`

**Beschreibung:**
`console.error('reset-password error:', err)` schreibt das komplette Error-Objekt in Logs. Supabase-Fehler können in seltenen Fällen URL-encoded API-Keys oder Request-Headers enthalten.

**Exploit-Szenario:**
Sentry/CloudWatch-Log-Zugriff → API-Key-Leak → Full-DB-Access via Service-Role.

**Fix-Empfehlung:**
```ts
console.error('reset-password error:', { code: err?.code, name: err?.name })
// NIEMALS err oder err.message direkt loggen
```

**Effort:** S

---

### AUTH-003 [P0] Account-Deletion ohne Passwort-Bestätigung + unvollständige Kaskade ✅ TEIL-FIX 2026-04-17

**File:** `app/api/user/delete/route.ts`

**Beschreibung:**
DELETE-Endpoint löscht sofort, ohne Re-Authentication. Kaskadierung ist unvollständig (z. B. `angel_certifications`, `care_recipients`-Daten).

**Exploit-Szenario:**
- CSRF-Attack via `<img src="/api/user/delete">` → Konto weg
- XSS im Chat → `fetch('/api/user/delete', {method:'DELETE'})` → Audit-Trail entfernt
- DSGVO Art. 17: Recht auf Vergessenwerden nicht vollständig erfüllt

**Fix-Empfehlung (Original):**
1. Passwort-Confirm via `signInWithPassword` vor Löschung
2. Soft-Delete mit 7-Tage-Grace-Period (DSGVO-konforme Wiederherstellung)
3. E-Mail-Bestätigung vor Hard-Delete
4. Kaskade-Audit: jede FK-Relation prüfen

**Fix-Umsetzung (2026-04-17):**
- ✅ Punkt 1: `signInWithPassword` via isolierter `@supabase/supabase-js`-Client
  (ohne `persistSession`), damit die aktive Session unberührt bleibt. Bei
  Fehler → `401 + "Passwort ist falsch."`. Ohne Body → `400`.
- ✅ Punkt 4: Kaskade um `bookings.angel_id` + `care_eligibility` erweitert
  (vorher nur `customer_id` → dadurch wurden Engel-Bookings nicht gelöscht).
- ✅ Frontend-UIs (Engel-Profil + Kunde-Profil): Modal fordert jetzt
  Passwort, Button bleibt disabled ohne Eingabe, generische Fehlermeldung.
- ✅ AUTH-002-Pattern: Catch-Block loggt nur `{code, name, status}`,
  kein rohes `err`-Objekt, kein `err.message` an Client.
- ✅ Playwright-Regression in `e2e/auth-delete.spec.ts` (4 Tests:
  Unauth→401, NoBody→400, WrongPW→401, UI-Modal-required-Password).
- ⏳ Punkt 2 (Soft-Delete mit Grace-Period) + Punkt 3 (E-Mail-Bestätigung)
  bleiben offen → verschoben auf Sprint 3 (Tabellen-Schema-Änderung + neue
  Mail-Flow-Route nötig).

**Rest-Risiko:** CSRF-Attack reduziert — Angreifer bräuchte jetzt das Passwort
des Opfers, was die Angriffsfläche drastisch verkleinert. Soft-Delete +
E-Mail-Bestätigung würden die letzten 5% Rest-Risiko abdecken.

**Effort:** L (davon M umgesetzt, S offen)

---

### AUTH-004 [P0] Duplikat von AUTH-001 — zweiter kritischer Pfad

**File:** Admin-Reset-Flow als einziger Weg für Admins, User-Passwörter zu ändern

**Beschreibung:**
Dies ist nicht nur eine E-Mail-Option — es ist die Standard-Methode. Jeder interne Mitarbeiter mit Admin-Zugriff kann so jedes Konto übernehmen. Siehe AUTH-001 Fix.

**Effort:** M (siehe AUTH-001)

---

### AUTH-005 [P1] E-Mail-Enumeration in Register + Login

**Files:**
- `app/auth/register/page.tsx:97-110`
- `app/auth/login/page.tsx:203-209`

**Beschreibung:**
Register: Unterschiedliche Fehler für "existiert" vs. "ungültig" → Angreifer enumeriert registrierte E-Mails.
Login: "Email not confirmed" vs. "Invalid login credentials" → verrät ob E-Mail registriert ist.

**Exploit-Szenario:**
Angreifer mit 1M-E-Mail-Liste findet alle registrierten Konten, startet gezielten Credential-Stuffing-Angriff mit IP-Rotation.

**Fix-Empfehlung:**
Einheitlicher Fehler nach außen: `"E-Mail oder Passwort falsch, oder Konto nicht bestätigt."`
Detail nur server-seitig loggen.

**Effort:** S

---

### AUTH-006 [P1] IP-Rate-Limit wird bei Success nicht zurückgesetzt

**File:** `app/api/auth/check-rate-limit/route.ts:143-147`

**Beschreibung:**
Nach erfolgreichem Login wird nur der E-Mail-Counter gelöscht, nicht der IP-Counter. Intent: Schutz gegen Credential-Stuffing. Problem: Alle Nutzer hinter einer NAT (Pflegeheim, Büro) teilen sich den IP-Counter → DoS-Vektor.

**Exploit-Szenario:**
Pflegeheim mit 50 Nutzern — ein Mitarbeiter tippt 5x falsch → 24h IP-Sperre für alle.

**Fix-Empfehlung:**
- Option A: Beide Counter bei Success resetten
- Option B: IP-Counter nach Success halbieren (exponentieller Decay)
- Option C: Pro-User-Counter separat von Pro-IP-Counter, Pro-IP nur bei Reihen von Failures

**Effort:** S

---

### AUTH-007 [P1] Middleware FAIL-SOFT kann geschützte Routen kurzzeitig zeigen

**File:** `middleware.ts:82-96`

**Beschreibung:**
Wenn `getUser()` im Middleware-Kontext fehlschlägt (Netzwerk, Token-Parse-Fehler), wird die Route durchgelassen. Client-Side Redirect kommt danach mit ~3.5s Delay.

**Bewertung:**
- Für UX (WhatsApp-Persistenz) akzeptabel bei `/kunde`, `/engel`
- Für `/admin` bereits FAIL-CLOSED ✓
- Race-Conditions können sensible Daten kurz anzeigen

**Fix-Empfehlung:**
- Dokumentation der Design-Entscheidung
- Für sensible User-Routen (z. B. `/kunde/zahlungsdaten`): FAIL-CLOSED
- Client-Side-Timeout ggf. auf 5s erhöhen, damit Auth-Recovery Zeit hat

**Effort:** S

---

### AUTH-008 [P1] Keine MFA/TOTP

**File:** — (Feature fehlt)

**Beschreibung:**
Einzige Auth-Faktoren: Passwort + E-Mail-Bestätigung. Für eine App mit Gesundheitsdaten (Pflegegrad, Medikation-Hinweise) und finanzieller Abrechnung (§45b SGB XI) ist das zu wenig. DSGVO Art. 32 fordert "state of the art" TOMs — 2FA zählt heute dazu.

**Exploit-Szenario:**
Credential-Reuse aus anderen Leaks → Engel-Konto → Vollzugriff auf alle Kunden-PII dieser Engel.

**Fix-Empfehlung:**
Supabase bietet TOTP-Support. UI-Komponente bauen: optional für Kunden, pflichtig für Engel+Admin.

**Effort:** L

---

### AUTH-009 [P1] Session-Lock bypassed — Race-Condition bei Refresh

**File:** `lib/supabase/client.ts:192-195`

**Beschreibung:**
`lock` ist no-op implementiert. Concurrent Refresh-Requests aus mehreren Tabs können unterschiedliche Tokens bekommen → alte Sessions leben weiter.

**Exploit-Szenario:**
User ändert Passwort in Tab 1 → forcierter Refresh. Tab 2 bekommt parallel alten Token, neuer Refresh wird nicht abgewartet → Attacker mit gestohlenem Cookie kann reinloggen.

**Fix-Empfehlung:**
In-Memory Promise-Deduplizierung statt komplettem Bypass:
```ts
let refreshPromise: Promise<any> | null = null
lock: async (_n, _t, fn) => {
  if (refreshPromise) return refreshPromise
  refreshPromise = fn().finally(() => { refreshPromise = null })
  return refreshPromise
}
```

**Effort:** M

---

### AUTH-010 [P2] Magic-Link-Expiry — Supabase-Default 24h zu lang

**File:** `app/api/auth/send-reset/route.ts:35-40`

**Beschreibung:**
Supabase-Default: 24h. Reset-Mail im Postfach-Archiv bleibt einen Tag lang exploit-fähig. Branch-Check: kein `expiresIn` überschrieben.

**Fix-Empfehlung:**
`expiresIn: 3600` (1h). Alternativ Supabase Dashboard → Auth → URL Configuration → Password Recovery Expiry senken.

**Effort:** S

---

### AUTH-011 [P2] Schwache Passwort-Policy

**File:** `lib/password-validation.ts`

**Beschreibung:**
Nur 15 hardcoded schwache Passwörter. Kein zxcvbn, kein Haben-I-been-pwned. "Alltagsengel2024!" passiert die Validierung, ist aber trivial zu crucken.

**Fix-Empfehlung:**
- zxcvbn (Score ≥ 3)
- HIBP-API mit k-anonymized Hash-Range-Lookup (nur SHA1-Prefix senden)

**Effort:** M

---

### AUTH-012 [P2] Credential-Logging in `console.error` — stichprobenartig OK

**File:** Systemweit geprüft

**Beschreibung:**
Stichprobe zeigt: keine hardcoded Secrets in Logs. Aber AUTH-002 zeigt, dass rohe Error-Objekte geloggt werden, was Credentials versehentlich mit-leaken kann.

**Fix-Empfehlung:** Siehe AUTH-002.

**Effort:** S

---

## Was gut gemacht ist

1. **Server-verifizierte Sessions** — konsequent `getUser()` statt `getSession()` in Middleware und Server-Routes.
2. **Rate-Limiting** — In-Memory + DB-Persistent, IP + Email, exponentieller Backoff (5 min → 60 min → 24h).
3. **CSRF-Origin-Check** — `middleware.ts:40-47` validiert Origin gegen Host-Whitelist.
4. **Admin-Routes FAIL-CLOSED** — DB-Fallback-Check wenn JWT-Metadaten fehlen.
5. **Passwort-Requirements** — 8+ Zeichen, Mixed-Case, Zahl, Sonderzeichen, client + server validiert.
6. **RBAC** — Superadmin-Schutz gegen Selbst-Enthebung, Rollen-JWT + DB-Fallback.
7. **Session-Persistenz** — Cookie + localStorage + IndexedDB, Capacitor-Resume-Handling — WhatsApp-Level UX.
8. **PII-Schutz in neuem Sentry-Setup** — `maskAllText`, `sendDefaultPii: false`, Header-Stripping (durch aktuelles Hardening hinzugefügt).
9. **Audit-Logging** — Auth-Events werden in `mis_auth_log` protokolliert.

---

## Architektur-Observations

1. **Session-Recovery-Komplexität** — Dreifach-Storage ist gut für UX, aber schwer zu debuggen. Erhöht Angriffsfläche bei Locks (AUTH-009).
2. **E-Mail als einziger Zweitfaktor** — Kompromittierter Resend-API-Key = Totalausfall. Key-Rotation monatlich empfohlen.
3. **Rate-Limiter in Supabase-DB** — OK für <100 concurrent Logins. Für Wachstum: Upstash/Redis migrieren.
4. **DSGVO-Compliance-Lücken:**
   - Account-Deletion nicht vollständig (kein Soft-Delete mit Grace-Period)
   - Klartext-Passwort in Admin-E-Mail = klare Art. 32 Verletzung
   - Recht auf Vergessenwerden nicht komplett (FK-Kaskaden unvollständig)
5. **Admin-Password-Reset als Default-Methode** ist systemisch gefährlich — sollte nur Last-Resort sein. Primärer Flow: Self-Service via Recovery-Link.

---

## Priorisierte Roadmap

### Sprint 1 — diese Woche (~3 Tage)
- [ ] AUTH-001 + AUTH-004: Admin-Reset-Flow auf Recovery-Link umstellen
- [ ] AUTH-002: Error-Logging sanitieren
- [ ] AUTH-005: Enumeration-Fehler vereinheitlichen

### Sprint 2 — nächste 2 Wochen (~5 Tage)
- [x] ~~AUTH-003: Account-Deletion mit Passwort-Confirm~~ ✅ 2026-04-17 (Soft-Delete + Grace-Period verschoben auf Sprint 3)
- [x] ~~AUTH-006: IP-Rate-Limit-Decay bei Success~~ ✅ 2026-04-17 (halvedAttempts-Strategy; Shared-IP-Friendly für Pflegeheime/NAT)
- [x] ~~AUTH-010: Magic-Link-Expiry 1h~~ ✅ 2026-04-17 (Code + E-Mail auf 1h, Dashboard-Schritt in `SUPABASE_AUTH_HARDENING.md`)
- [x] ~~AUTH-007: FAIL-CLOSED für sensible Kunden-Routen~~ ✅ 2026-04-17 (Middleware sensitivePaths → direkt zum Login)

### Sprint 3 — nächster Monat (~10 Tage)
- [ ] AUTH-008: TOTP/MFA (Pflicht für Engel+Admin, optional für Kunden)
- [ ] AUTH-009: Session-Lock reimplementieren
- [x] ~~AUTH-011: zxcvbn (Passwort-Stärke mit DE-Dictionary + User-Inputs)~~ ✅ 2026-04-17 (zxcvbn-ts, Score ≥ 3 Gate, Brand + Keyboard-Muster werden geblockt. HIBP-K-Anonymity weiter TODO für Sprint 4.)
- [x] ~~**AUTH-012 (NEU): Admin-Audit-Log**~~ ✅ 2026-04-17 — `mis_audit_log` erweitert (target_id, target_email, actor_role, user_agent), Immutability-Trigger blockt UPDATE/DELETE für alle, Retention-Purge-Fn `admin_audit_log_purge()` mit 10-Jahre-Minimum + Superadmin-Only. Helper `lib/audit-log.ts` (Fail-soft). Integriert in `reset-password` (password_reset), `manage-role` (role_grant/revoke), `user/delete` (user_self_delete). 6 Smoke-Tests grün (Insert ✓, Update-Block ✓, Delete-Block ✓, CHECK ✓, NULL-entity ✓, Purge-Bypass ✓). Weitere Admin-Routes (MIS-Approvals, Pricing) haben schon eigene Audits und bleiben wie sie sind.
- [x] **RLS-P0-Fixes aus `RLS_AUDIT.md`** — RPC `get_emergency_info_with_pin` gebaut, offene Policies auf `notfall_info` + `medikamentenplan` gedroppt (2026-04-17, CAPA-2026-001). Defense-in-Depth: DB-CHECK-Constraint auf `notfall_pin` + CI-Lint `npm run audit:rls`.

---

## Sprint-Log

**2026-04-17 (X-High-Batch):**
- 4 Auth-Audit-Items geschlossen: AUTH-003, AUTH-006, AUTH-007, AUTH-010
- RLS-Audit über alle 57 Tabellen → 2 P0-Funde (`notfall_info`, `medikamentenplan`) → `RLS_AUDIT.md`
- Performance-Baseline → `PERF_REPORT.md`
- Legal-Update: Widerrufsrecht §§ 312g/355 BGB, ODR-Plattform, §§ 11/12 AGB (Abgrenzung + DSGVO Art. 28)
- Impressum: MStV § 18 Abs. 2, USt-ID-Placeholder, Aufsichtsbehörde
- Admin-Audit-Log als AUTH-012 für Sprint 3 eingetragen (bewusstes Deferral — zu groß für diesen Batch)

**2026-04-17 (X-High-Batch 2 — Quick Wins):**
- RLS-P0 behoben: SECURITY-DEFINER-RPC `get_emergency_info_with_pin` + Rate-Limiter + unsichere Policies gedroppt + Frontend auf RPC umgestellt. Details in `RLS_AUDIT.md` Mitigation-Log.
- CAPA-2026-001 in `mis_capa` angelegt (closed, effectiveness_verified=true).
- DB-CHECK-Constraint `notfall_info_pin_format_check` (`NULL | '' | ^\d{4}$`) als Defense-in-Depth.
- Audit-RPCs + CI-Lint-Script `scripts/audit-rls.ts` + npm-Script `audit:rls` angelegt → prevention-control, damit unsichere Policies nicht unbemerkt zurückkehren.
- Tesseract-OCR auf `dynamic import` umgestellt → First-Load-JS auf `/kunde/notfall` fällt erwartet von ~2.5 MB → ~200 KB.

**2026-04-17 (X-High-Batch 3 — Prevention + AUTH-011):**
- Grep-Prevention-Control gegen Regressions-Strings (z. B. falsche Rechtsform im Footer) mit Pre-Commit-Hook + CI-Lint. Config: `scripts/forbidden-strings.json`, Script: `scripts/lint-forbidden.ts`, Hook: `scripts/hooks/pre-commit`, Installer: `npm run setup:hooks`. 418 Dateien gescannt, 0 Treffer; Gegenprobe mit eingeschleustem Muster greift hart. Details in `RLS_AUDIT.md` Mitigation-Log (#4).
- AUTH-011 erledigt: `validatePasswordAsync(password, userInputs?)` in `lib/password-validation.ts` mit `@zxcvbn-ts/core` + `@zxcvbn-ts/language-de` + `@zxcvbn-ts/language-common` (dynamic import, Singleton-Init). Score ≥ 3 ist Gate, zxcvbn-Feedback wird dem Nutzer in DE angezeigt. Call-Sites: `app/auth/register/page.tsx`, `app/fahrer/register/page.tsx` (Client) + `app/api/admin/reset-password/route.ts` (Server). `userInputs` enthält E-Mail, E-Mail-Prefix, Vor-/Nachname, Marke — so wird z. B. „Alltagsengel2024!" als schwach erkannt (vorher akzeptiert).
- Smoke-Test via tsx: Marke+Jahr → BLOCK (score 2), Keyboard-Muster (`qwertzuiop1!A`) → BLOCK (score 2), xkcd-Passwort + Random-16 → OK. HIBP-Range-Lookup bleibt für Sprint 4 offen.

**2026-04-17 (X-High-Batch 4 — AUTH-012 Admin-Audit-Log):**
- Migration `20260417_admin_audit_log.sql` angewandt: `mis_audit_log` um `user_agent`, `target_id`, `target_email`, `actor_role` erweitert; `entity_id` darf NULL sein (global actions); CHECK-Constraint erlaubt jetzt Auth-Events (`password_reset`, `role_grant`, `role_revoke`, `user_delete`, `user_self_delete`, `data_export`, `admin_login`, `rate_limit_reset`) zusätzlich zu den Legacy-MIS-Actions.
- Alte RLS-Policy `Admin full access on mis_audit_log FOR ALL` gedroppt (erlaubte Admins ein UPDATE/DELETE auf Audit-Zeilen → Compliance-GAU). Ersatz: `audit_select_admin FOR SELECT` (nur read für admin/superadmin). INSERT: nur service_role. UPDATE/DELETE: per Trigger `mis_audit_log_prevent_mutation()` für ALLE geblockt (auch service_role) → append-only. Einziger Bypass: GUC `app.audit_log_purge=on`, nur gesetzt durch SECURITY-DEFINER-Fn `admin_audit_log_purge(interval)` mit Superadmin-Check + 10-Jahre-Minimum-Retention.
- Server-Helper `lib/audit-log.ts` mit `logAuditEvent({action, actorId, actorRole, targetId, targetEmail, entityType, entityId, details, request})`. IP + UA werden automatisch aus x-forwarded-for/x-real-ip/user-agent extrahiert. Fail-soft: Insert-Fehler blockiert die eigentliche Admin-Aktion NICHT — Rationale: lieber ein erfolgreicher Passwort-Reset mit fehlendem Audit-Row als ein durch Logging-Glitch kaputtes Admin-Feature. Fehler landet im `console.error` (ohne rohes err-Objekt, AUTH-002).
- Call-Sites integriert: `app/api/admin/reset-password/route.ts` (action=`password_reset`, Details: `send_notification`, `target_role`), `app/api/admin/manage-role/route.ts` (action=`role_grant`/`role_revoke`, Details: `old_role`, `new_role`, `target_name`), `app/api/user/delete/route.ts` (action=`user_self_delete`, Details: `reason=dsgvo_art_17_self_deletion`, Rolle + Name VOR dem Delete snapshotted). Krankenfahrten-Route ist GET-only; Pricing-Route hat schon eigenen `kf_pricing_audit` (bewusst nicht zentralisiert, domain-spezifisch OK).
- 6 DB-Smoke-Tests grün: (1) INSERT mit service_role + gültiger Action → OK, (2) UPDATE → P0001 „append-only, UPDATE nicht erlaubt", (3) DELETE → P0001 „append-only, DELETE nicht erlaubt", (4) Invalid Action (`bogus_action_xyz`) → 23514 CHECK-violated, (5) NULL-`entity_id` für globale Aktionen → OK, (6) GUC-Bypass (`app.audit_log_purge=on`) → Delete erlaubt (Purge-Pfad funktioniert). `npm run lint:forbidden` grün (420 Dateien). `tsc --noEmit`: 0 neue Fehler (nur Archive-Altlasten).
- Retention-Fn `admin_audit_log_purge(older_than interval)`: nur Superadmin, Minimum 10 Jahre, schreibt Selbst-Audit (action=`delete`, entity_type=`audit_log`) vor dem DELETE. Praktischer Betrieb: manuell via Supabase SQL-Editor bei Aufbewahrungsfristen-Überschreitung.
- UI-Filter in `/mis/audit` ist weiterhin offen (existierende MIS-UI liest schon `mis_audit_log`, zeigt aber die neuen Spalten `target_email` / `actor_role` noch nicht). Nächster Schritt wenn gewünscht: Spalten im Dashboard sichtbar machen + Filter auf `action IN ('password_reset','role_grant',…)`.

---

**Nächster Audit nach P0-Fixes:** 2026-05-01 (2 Wochen)
**Penetration-Test (extern):** Empfohlen nach Sprint 2 — Budget ~7-12k€
