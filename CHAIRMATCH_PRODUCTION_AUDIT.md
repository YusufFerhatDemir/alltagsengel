# ChairMatch — Production-Readiness Audit

**Datum:** 20.08.2026  
**Projekt:** pwdbjqfpgumyfktbfswg  
**Auditor:** Automatisiertes Security-Audit  

---

## Zusammenfassung

| Schweregrad | Anzahl |
|---|---|
| **CRITICAL** | 3 |
| **HIGH** | 2 |
| **MEDIUM** | 3 |
| **LOW** | 4 |

**Gesamtbewertung: NICHT PRODUKTIONSREIF** — 3 kritische Schwachstellen müssen vor Go-Live behoben werden.

---

## 1. RLS-Status (Row Level Security)

**Ergebnis:** 69 von 70 public Tables haben RLS aktiviert.

| Status | Tabellen |
|---|---|
| RLS aktiv | 69 (alle Geschäftstabellen) |
| RLS inaktiv | 1: `spatial_ref_sys` (PostGIS-Systemtabelle) |

Alle 69 RLS-aktiven Tabellen besitzen mindestens eine Policy — keine Tabelle ist versehentlich komplett gesperrt.

**Risiko: LOW** — `spatial_ref_sys` ist eine PostGIS-Referenztabelle ohne Geschäftsdaten.

---

## 2. RLS Policies — Kritische Findings

### FINDING #1: Privilege Escalation via Profil-Update
**Risiko: CRITICAL**

Die Policy `Users can update own profile` erlaubt jedem authentifizierten User, ALLE Spalten seines Profils zu ändern — inklusive `role`:

```sql
-- Policy:
USING (auth.uid() = id)   -- keine WITH CHECK Klausel
```

Bestätigte Column-Level Grants für `authenticated`:
- `UPDATE` auf `role` ✓
- `UPDATE` auf `totp_secret` ✓  
- `UPDATE` auf `stripe_customer_id` ✓

**Exploit:** Ein User kann per Supabase JS Client direkt ausführen:
```js
supabase.from('profiles').update({ role: 'super_admin' }).eq('id', myUserId)
```

Kein Trigger, kein CHECK-Constraint verhindert dies. Die Funktionen `is_admin_or_super()` und `is_super_admin()` (beide `SECURITY DEFINER`) lesen die Rolle aus `profiles` — nach Änderung hat der Angreifer vollen Admin-Zugriff auf das gesamte System.

**Sofortmaßnahme:** 
1. `REVOKE UPDATE (role, totp_secret, stripe_customer_id) ON profiles FROM authenticated;`
2. Oder: `WITH CHECK`-Klausel hinzufügen, die Rollenänderung verhindert.

---

### FINDING #2: TOTP-Secrets für alle User lesbar
**Risiko: CRITICAL**

Die Policy `profiles_authenticated_read` gewährt JEDEM authentifizierten User SELECT auf ALLE Profile:

```sql
-- Policy: profiles_authenticated_read
FOR SELECT TO authenticated
USING (true)
```

Exponierte Spalten pro User-Profil:
- `totp_secret` — bricht 2FA komplett
- `stripe_customer_id` — Zahlungsreferenz
- `email`, `phone`, `full_name` — PII aller 50 User

**Sofortmaßnahme:** Column-Level Security oder eine View einsetzen, die `totp_secret` und `stripe_customer_id` nur für `auth.uid() = id` exponiert.

---

### FINDING #3: Secrets in Git-History
**Risiko: CRITICAL**

Folgende Secrets wurden in früheren Commits (`68c14a7`, `bf273e7`) eingecheckt und sind aus der Git-History extrahierbar:

| Secret | Datei |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` (JWT) | `.env.local`, Zeile 4 |
| `RESEND_API_KEY` | `.env.local`, Zeile 6 |
| `VAPID_PRIVATE_KEY` | `.env.local`, Zeile 11 |

Der **Service-Role-Key umgeht sämtliche RLS-Policies**. Jeder mit Repo-Zugang hat vollen Datenbankzugriff.

**Sofortmaßnahme:** Alle drei Keys in Supabase Dashboard / Resend Dashboard sofort rotieren. Git-History mit `git filter-repo` oder BFG Repo-Cleaner bereinigen.

---

### FINDING #4: Storage — Jeder Auth-User kann Salon-Bilder löschen
**Risiko: HIGH**

```sql
-- Policy: "Auth delete salon images"
FOR DELETE USING (bucket_id = 'salon-images' AND auth.role() = 'authenticated')
```

Kein Ownership-Check — jeder angemeldete User kann Bilder jedes Salons löschen.

**Sofortmaßnahme:** Policy um Ownership-Prüfung ergänzen (z.B. `EXISTS (SELECT 1 FROM salons WHERE owner_id = auth.uid())`).

---

### FINDING #5: Onboarding-Images Bucket ohne Limits
**Risiko: HIGH**

| Bucket | Public | Size Limit | MIME Filter |
|---|---|---|---|
| `salon-images` | Ja | 5 MB | image/jpeg, png, webp, gif |
| `onboarding-images` | Ja | **Kein Limit** | **Kein Filter** |

Admins können beliebig große Dateien jedes Typs hochladen. Ein kompromittiertes Admin-Konto (→ Finding #1) ermöglicht Missbrauch als File-Hosting.

**Sofortmaßnahme:** `file_size_limit` und `allowed_mime_types` auf `onboarding-images` setzen.

---

## 3. Mandantentrennung (Multi-Tenancy)

**Architektur:** Kein klassisches Multi-Tenancy (kein `org_id`/`tenant_id`). ChairMatch ist ein B2C-Marktplatz mit User-Level-Isolation:

- Salons haben `owner_id` → Foreign Key auf `profiles.id`
- RLS-Policies verwenden `auth.uid()` für Ownership
- Rollen: `kunde` (45), `super_admin` (3), `anbieter` (1), `admin` (1)

**Bewertung:** Für ein Marktplatz-Modell ist User-Level-Isolation korrekt. Eine echte Mandantentrennung (z.B. Salon-Kette mit mehreren Filialen) existiert nicht und ist bei dem Geschäftsmodell auch nicht erforderlich.

**Risiko: LOW** — Architektur passt zum Geschäftsmodell, aber die Ownership-Checks in den RLS-Policies sollten konsequenter sein (siehe Finding #4).

---

## 4. Auth-Konfiguration

| Eigenschaft | Status |
|---|---|
| Auth-Provider | Nur `email` (kein OAuth/Social Login) |
| Email-Bestätigung | Aktiv (9/10 letzte User haben `confirmed_at`) |
| Unbestätigte Accounts | 1: `info@chairmatch.de` (System-Account?) |
| 2FA / TOTP | Implementiert (`user_2fa`, `totp_secret` in profiles) |
| Login-Attempts Tracking | Ja (`login_attempts` Tabelle) |
| Phone Verification | Tabelle existiert, kein aktiver Provider |

**Risiko: MEDIUM** — Email-Bestätigung scheint aktiv, aber ein unbestätigter Account existiert. 2FA ist implementiert, aber durch Finding #2 kompromittiert.

---

## 5. Storage Buckets

| Bucket | Public | RLS Objects | Upload-Policies | Delete-Policies |
|---|---|---|---|---|
| `salon-images` | Ja | Ja (8 Policies) | Admin/Anbieter + Auth | Admin + **Auth (OFFEN!)** |
| `onboarding-images` | Ja | Ja (3 Policies) | Nur Admin | Nur Admin |

Lese-Zugriff (SELECT auf `storage.objects`) fehlt als explizite Policy — bei `public: true` Buckets werden Dateien über die Public-URL ohne Auth ausgeliefert. Das ist für ein Marktplatz-Bildersystem akzeptabel.

**Risiko: HIGH** — Siehe Findings #4 und #5.

---

## 6. Edge Functions

| Function | JWT-Verifizierung | Status |
|---|---|---|
| `create-checkout` | **Nein** (`verify_jwt: false`) | AKTIV |
| `send-whatsapp` | Ja | AKTIV |
| `whatsapp-webhook` | **Nein** (`verify_jwt: false`) | AKTIV |

**Risiko: MEDIUM**

- `create-checkout` ohne JWT = Zahlungs-Endpoint ohne Authentifizierung. Die Funktion muss intern prüfen, ob der Aufrufer berechtigt ist (z.B. via Stripe-Signatur). Ohne Code-Einsicht kann dies nicht abschließend bewertet werden.
- `whatsapp-webhook` ohne JWT ist typisch für eingehende Webhooks (Meta/WhatsApp signiert Requests). Akzeptabel, wenn HMAC-Validierung implementiert ist.

---

## 7. Migrations

34 Migrations vorhanden, chronologisch sortiert (2026-03-03 bis 2026-07-18):

| Phase | Migrations | Inhalt |
|---|---|---|
| Initial (März) | 01–18 | Schema, RLS, Seeds, Categories, Onboarding, Payments, Chat |
| Onboarding (Mai) | 19 | Onboarding Drafts |
| RLS-Fixes (Juni) | 20–31 | 12 gezielte RLS-Reparaturen |
| Marketplace (Juli) | 32–34 | Marketplace, Rental, Constraints, Missing RLS |

**Bewertung:** Keine Lücken in der Versionierung. Die 12 RLS-Fix-Migrations im Juni deuten auf ein vorheriges Security-Audit hin. Die letzte Migration (`fix_missing_rls_policies`) vom 18.07.2026 zeigt, dass noch kürzlich Policies nachgerüstet wurden.

**Risiko: LOW** — Migrationskette ist konsistent.

---

## 8. Sensitive Daten (PII)

### Tabellen mit personenbezogenen Daten:

| Tabelle | PII-Spalten | RLS | Bewertung |
|---|---|---|---|
| `profiles` | email, full_name, phone, totp_secret, stripe_customer_id | Ja, aber zu offen | **CRITICAL** |
| `login_attempts` | email | Ja | OK |
| `phone_verifications` | phone | Ja | OK |
| `newsletter_subscribers` | email | Ja | OK |
| `onboarding_drafts` | email, draft_token | Ja | OK |
| `orders` | shipping_name, shipping_street | Ja | OK |
| `salons` | email, phone, street | Ja | OK (öffentliche Geschäftsdaten) |
| `user_2fa` | secret | Ja | Prüfen ob SELECT auf eigene Rows beschränkt |
| `whatsapp_messages` | phone | Ja | OK |
| `wait_list` | email | Ja | OK |

**Risiko: CRITICAL** — `profiles`-Tabelle exponiert hochsensible Daten an alle authentifizierten User (Finding #2). DSGVO-Verstoß.

---

## 9. Business-Modell-Konformität

**Soll:** ChairMatch = Stuhlvermietung in der Beauty-Branche  
**Ist (Datenbank-Evidenz):**

- `salons` Tabelle mit `chair_rental` (boolean), `chair_price_day` (numeric) ✓
- `rental_equipment` und `rental_bookings` Tabellen ✓
- Rollen: `anbieter` (Salonbetreiber), `kunde` (Mieter) ✓
- `services` / `service_templates` für Beauty-Dienstleistungen ✓
- Kategorien-System vorhanden ✓
- `gewerbe_check` auf Salons (Gewerbeschein-Prüfung) ✓

**Bewertung:** Das Datenmodell reflektiert korrekt ein Marktplatz-Modell für Stuhlvermietung in der Beauty-Branche. Es ist KEIN Möbelhandel-System.

**Risiko: KEINE** — Business-Modell korrekt abgebildet.

---

## 10. Quellcode-Sicherheit

| Finding | Risiko | Details |
|---|---|---|
| Service-Role-Key in Git-History | **CRITICAL** | Siehe Finding #3 |
| `.env.local` auf Disk (gitignored) | LOW | Korrekt von `.gitignore` ausgeschlossen |
| `server-only` Guard für Admin-Client | OK | `lib/supabase/admin.ts` korrekt geschützt |
| Client-side INSERT Remnant | MEDIUM | `hooks/useTrackVisit.ts` — toter Code |
| Native App Audit-Bypass | MEDIUM | `native/src/app/einsatz/notizen.tsx` umgeht Server-Audit |
| Hardcoded Test-Passwords | LOW | Nur in Test-Dateien |
| SQL-Injection | OK | Alle RPC-Calls parameterisiert |
| Rate-Limiting | OK | Öffentliche Routes haben Rate-Limits |
| Cron-Auth | LOW | Inkonsistenter Header (`x-cron-secret` vs `Authorization`) |

---

## Priorisierte Maßnahmenliste

### Sofort (vor Go-Live):

1. **🔴 CRITICAL — Role-Escalation schließen:**
   ```sql
   REVOKE UPDATE (role) ON public.profiles FROM authenticated;
   REVOKE UPDATE (totp_secret) ON public.profiles FROM authenticated;
   REVOKE UPDATE (stripe_customer_id) ON public.profiles FROM authenticated;
   ```

2. **🔴 CRITICAL — TOTP-Secret schützen:**
   ```sql
   REVOKE SELECT (totp_secret) ON public.profiles FROM authenticated;
   ```
   Oder: View `profiles_public` erstellen, die nur nicht-sensitive Spalten exponiert, und SELECT-Policy auf die View umleiten.

3. **🔴 CRITICAL — Secrets rotieren:**
   - Supabase Service-Role-Key rotieren (Dashboard → Settings → API)
   - Resend API Key rotieren
   - VAPID Private Key rotieren
   - Git-History bereinigen

### Kurzfristig (erste Woche):

4. **🟠 HIGH — Storage Delete-Policy einschränken:**
   `Auth delete salon images` um Ownership-Check ergänzen.

5. **🟠 HIGH — Onboarding-Bucket absichern:**
   `file_size_limit` und `allowed_mime_types` setzen.

6. **🟡 MEDIUM — `create-checkout` Edge Function prüfen:**
   Sicherstellen, dass interne Auth/Signatur-Prüfung existiert.

### Mittelfristig:

7. **🟡 MEDIUM — Client-Side-Write bereinigen:** `useTrackVisit.ts` auf Server-Route umstellen.
8. **🟡 MEDIUM — Native App Audit:** `notizen.tsx` auf Server Action migrieren.
9. **⚪ LOW — Cron-Auth vereinheitlichen.**

---

*Ende des Audit-Reports*
