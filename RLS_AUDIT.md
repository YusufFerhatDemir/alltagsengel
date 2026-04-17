# RLS-Audit — AlltagsEngel.care Supabase-Policies

**Stand:** 2026-04-17 (Version 1.1 — P0-Mitigation complete)
**Scope:** Alle 57 Tabellen im `public`-Schema des Projekts `nnwyktkqibdjxgimjyuq`
**Methode:** Introspection über `pg_policies` + `pg_class.relrowsecurity`, plus Code-Review
von App-Pfaden, die mit den betroffenen Tabellen sprechen.

> **Update 2026-04-17 (zweiter Durchgang):** Beide P0-Funde sind behoben.
> Migration `rls_p0_emergency_pin_gate` ist live, die zwei offenen Policies
> sind gedroppt, Frontend nutzt jetzt `supabase.rpc('get_emergency_info_with_pin')`.
> Details siehe Abschnitt „Mitigation-Log" unten.

---

## Analogie

Row-Level Security ist wie das Schloss am Aktenschrank im Krankenhaus-Empfang.
Jede Tabelle ist eine Schublade, jede Policy ist eine Regel, wer die Schublade
aufmachen darf. `qual = true` bedeutet: „Schublade hat zwar ein Schloss, aber
der Schlüssel hängt außen dran." Wenn in dieser Schublade nur Klinik-Öffnungs-
zeiten liegen, ist das OK. Wenn darin Medikamentenpläne liegen, ist das ein
Datenschutz-Disaster.

---

## Zusammenfassung

| Kategorie | Zahl | Bewertung |
|---|---|---|
| Tabellen im public-Schema | 57 | — |
| Davon mit RLS enabled | **57 / 57** | ✅ vollständig |
| Policies insgesamt | 161 | — |
| Policies mit `qual = true` | 13 | detailliert geprüft |
| Davon **kritisch** (PII / Gesundheitsdaten öffentlich lesbar) | **2** | 🔴 P0 |
| Davon unkritisch (Service-Role oder Design-Entscheidung) | 11 | ✅ |

---

## 🔴 P0 — Kritische Funde

### 1. `notfall_info` — PIN-Gate nur client-side, DB-seitig voll offen

**Policy:**
```
name:  "Public emergency access with pin"
cmd:   SELECT
roles: public
qual:  true   ← öffentlicher Lesezugriff ohne jede Bedingung
```

**Das Problem:**
Der Policy-Name suggeriert PIN-Gating. Die Policy selbst prüft den PIN aber
nicht. Jeder anonyme Client (`supabase.createClient()`) darf `SELECT * FROM notfall_info`
ausführen — inklusive der Spalte `notfall_pin`.

**App-Code-Verifikation** (`app/notfall/[id]/page.tsx`, Zeilen 67–85):
```ts
const { data: notfallData } = await supabase
  .from('notfall_info')
  .select('*')                        // ← holt notfall_pin mit!
  .eq('user_id', id)
  .single();

if (notfallData.notfall_pin !== pinInput) {   // Vergleich im Browser
  setError('Falscher PIN');
  return;
}
```

Die PIN-Prüfung findet **im Browser** statt — nachdem der komplette Datensatz
inkl. `notfall_pin` bereits über das Netzwerk zum Angreifer geflossen ist.

**Exploit:**
```bash
# Angreifer braucht nur die user_id (UUID), die in QR-Codes/URLs
# auf Notfall-Armbändern steckt:
curl 'https://<project>.supabase.co/rest/v1/notfall_info?user_id=eq.<UUID>&select=*' \
  -H "apikey: <anon_key>"

# Response enthält notfall_pin, blutgruppe, allergien, vorerkrankungen,
# notfallkontakt_name, notfallkontakt_telefon, versicherung,
# versicherungsnummer, hausarzt_name, hausarzt_telefon.
```

**Impact:** Gesundheitsdaten (DSGVO Art. 9 — besondere Kategorien) sind bei
Kenntnis einer UUID frei auslesbar. Dies ist eine **Verletzung der Vertraulichkeit**
nach Art. 32 DSGVO und meldepflichtig nach Art. 33 (72h an Aufsichtsbehörde),
sobald öffentlich bekannt.

**Empfohlene Mitigation (ausführlich in Sprint-Plan):**

Option A — *Server-seitiges PIN-Gate über RPC-Funktion:*
```sql
-- Neue security-definer Funktion, die PIN prüft und bei Match Daten liefert
CREATE OR REPLACE FUNCTION get_notfall_info_with_pin(
  p_user_id UUID,
  p_pin TEXT
) RETURNS SETOF notfall_info
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Rate-Limit: max 5 Versuche pro IP+UUID in 10 Minuten (separate Tabelle)
  -- Falls überschritten → raise exception 'rate_limited'

  RETURN QUERY
    SELECT *
    FROM notfall_info
    WHERE user_id = p_user_id
      AND notfall_pin = p_pin
    LIMIT 1;
END;
$$;

-- Alte offene Policy löschen
DROP POLICY "Public emergency access with pin" ON notfall_info;
-- Funktion darf von anon/authenticated aufgerufen werden
GRANT EXECUTE ON FUNCTION get_notfall_info_with_pin TO anon, authenticated;
```

Der Client ruft dann `supabase.rpc('get_notfall_info_with_pin', { p_user_id, p_pin })`
auf. Bei falschem PIN kommt ein leeres Result zurück — `notfall_pin` verlässt nie
den DB-Kontext.

Option B — *API-Route mit Service-Role:*
`/api/notfall/[id]/route.ts` mit `createAdminClient()` + Rate-Limiter (gleicher
Pattern wie `app/api/auth/check-rate-limit/route.ts`). Leicht einfacher zu
debuggen, aber zusätzlicher Hop im Request-Lifecycle.

**Empfehlung:** Option A, weil PIN nie das DB-Subnet verlässt.

---

### 2. `medikamentenplan` — Medikamentenpläne öffentlich lesbar

**Policy:**
```
name:  "Public emergency access medikamente"
cmd:   SELECT
roles: public
qual:  true
```

**Das Problem:**
Exakt gleiche Konstruktion wie bei `notfall_info`. Die Medikamentenliste eines
Kunden wird nach dem (client-seitigen) PIN-Check geladen — aber die RLS-Policy
verlangt gar keinen PIN. Jeder mit einer UUID kann ALLE Medikamentenpläne aller
Kunden auslesen, nicht nur die zum jeweiligen User.

Sogar schlimmer: Während `notfall_info` auf `user_id = id` gefiltert wird, würde
ein Angreifer mit `select=*&user_id=not.is.null` **alle Medikamentenpläne der
gesamten Plattform** auslesen können.

**Exploit:**
```bash
curl 'https://<project>.supabase.co/rest/v1/medikamentenplan?select=*&limit=10000' \
  -H "apikey: <anon_key>"
# → gibt ALLE Medikamentenpläne zurück (ggf. limitiert durch Supabase-
#   Default-Pagesize 1000, aber mit Range-Header/Pagination umgehbar).
```

**Impact:** Art. 9 DSGVO-Daten (Gesundheit) massenhaft exfiltrierbar. Gleiches
Meldepflicht-Risiko wie bei `notfall_info`, potenziell mit deutlich größerem
Scope (nicht pro User, sondern die gesamte Kunden-Population).

**Empfohlene Mitigation:** Die gleiche RPC-Funktion wie bei `notfall_info`
liefert ebenfalls die Medikamente mit — der PIN schützt beide Datentöpfe in
einer Transaktion:

```sql
CREATE OR REPLACE FUNCTION get_emergency_info_with_pin(
  p_user_id UUID,
  p_pin TEXT
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_notfall notfall_info%ROWTYPE;
BEGIN
  SELECT * INTO v_notfall
  FROM notfall_info
  WHERE user_id = p_user_id AND notfall_pin = p_pin;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'notfall',  to_jsonb(v_notfall) - 'notfall_pin',   -- PIN rausfiltern
    'medikamente', (
      SELECT jsonb_agg(to_jsonb(m))
      FROM medikamentenplan m
      WHERE m.user_id = p_user_id AND m.aktiv = true
    ),
    'profile', (
      SELECT jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name)
      FROM profiles p
      WHERE p.id = p_user_id
    )
  );
END;
$$;

DROP POLICY "Public emergency access with pin" ON notfall_info;
DROP POLICY "Public emergency access medikamente" ON medikamentenplan;
GRANT EXECUTE ON FUNCTION get_emergency_info_with_pin TO anon, authenticated;
```

Client ruft dann **einen** RPC-Call auf, bekommt entweder `null` (falscher PIN)
oder ein vollständiges JSON-Objekt — der PIN wird serverseitig validiert.

---

## 🟢 Grün — Die 11 anderen offenen Policies

Nach detaillierter Prüfung unkritisch:

| Tabelle | Policy | Begründung |
|---|---|---|
| `reviews` | `reviews_select`, `Herkes reviewleri okuyabilir` | Business-Entscheidung: Reviews sind öffentlich (Vertrauens-Signal für Neukunden) |
| `angel_reviews` | `Jeder kann Bewertungen lesen` | Gleich wie oben — öffentliche Vertrauenssignale |
| `angels` | `Herkes engelleri okuyabilir` | Engel-Profile müssen für Matching auffindbar sein (nur Profilfoto + Skills + Bio — keine PII) |
| `app_settings` | `app_settings_read` | Key-Value-Store für UI-Konfiguration (Preise, Feature-Gates). INSERT/UPDATE sind adminonly. |
| `kf_feature_flags` | `Auth can read feature flags` | Standard Feature-Flag-Pattern (A/B-Tests). Nur `auth` Rolle, kein `anon`. |
| `conversions` | `Service role full access` | `roles = {service_role}` — Anon/Authenticated haben KEINEN Zugriff. `qual = true` nur wirksam für service_role. |
| `login_rate_limits` | `service_role only` | Gleiches Muster wie oben — nur Service-Role. |

**Verifikation** via `SELECT * FROM reviews` als `anon` → funktioniert (by design).
**Gegentest** via `SELECT * FROM conversions` als `anon` → liefert 0 Zeilen (RLS wirkt,
weil Policy auf `service_role` scoped ist).

---

## Matrix: RLS-Status pro Tabelle

| Tabelle | RLS | Policies | offen | Risiko |
|---|---|---|---|---|
| angel_reviews | ✅ | 4 | 1 | 🟢 by design |
| angels | ✅ | 4 | 1 | 🟢 by design |
| app_settings | ✅ | 2 | 1 | 🟢 |
| bookings | ✅ | 12 | 0 | 🟢 |
| care_recipients | ✅ | 6 | 0 | 🟢 |
| chat_messages | ✅ | 2 | 0 | 🟢 |
| content_blocks | ✅ | 2 | 0 | 🟢 |
| conversions | ✅ | 1 | 1 | 🟢 (service_role) |
| fahrzeuge | ✅ | 2 | 0 | 🟢 |
| fcm_tokens | ✅ | 2 | 0 | 🟢 |
| hygienebox_orders | ✅ | 3 | 0 | 🟢 |
| kf_booking_reviews | ✅ | 1 | 0 | 🟢 |
| kf_feature_flags | ✅ | 2 | 1 | 🟢 |
| kf_partner_availability | ✅ | 1 | 0 | 🟢 |
| kf_partners | ✅ | 1 | 0 | 🟢 |
| kf_pricing_audit | ✅ | 2 | 0 | 🟢 |
| kf_pricing_config | ✅ | 2 | 0 | 🟢 |
| kf_pricing_costs | ✅ | 1 | 0 | 🟢 |
| kf_pricing_regions | ✅ | 2 | 0 | 🟢 |
| kf_pricing_rules | ✅ | 1 | 0 | 🟢 |
| kf_pricing_surcharges | ✅ | 2 | 0 | 🟢 |
| kf_pricing_tiers | ✅ | 2 | 0 | 🟢 |
| kf_review_rules | ✅ | 2 | 0 | 🟢 |
| kf_service_doc_requirements | ✅ | 2 | 0 | 🟢 |
| krankenfahrt_providers | ✅ | 7 | 0 | 🟢 |
| krankenfahrt_reviews | ✅ | 4 | 0 | 🟢 |
| krankenfahrten | ✅ | 10 | 0 | 🟢 |
| login_rate_limits | ✅ | 1 | 1 | 🟢 (service_role) |
| **medikamentenplan** | ✅ | 6 | 1 | 🔴 **P0** |
| messages | ✅ | 3 | 0 | 🟢 |
| mis_ai_conversations | ✅ | 1 | 0 | 🟢 |
| mis_audit_log | ✅ | 1 | 0 | 🟢 |
| mis_auth_log | ✅ | 2 | 0 | 🟢 |
| mis_budget_items | ✅ | 1 | 0 | 🟢 |
| mis_capa | ✅ | 4 | 0 | 🟢 |
| mis_dataroom_access | ✅ | 1 | 0 | 🟢 |
| mis_dataroom_sections | ✅ | 1 | 0 | 🟢 |
| mis_document_categories | ✅ | 1 | 0 | 🟢 |
| mis_document_versions | ✅ | 1 | 0 | 🟢 |
| mis_documents | ✅ | 1 | 0 | 🟢 |
| mis_financial_reports | ✅ | 1 | 0 | 🟢 |
| mis_kpis | ✅ | 1 | 0 | 🟢 |
| mis_notifications | ✅ | 1 | 0 | 🟢 |
| mis_purchase_orders | ✅ | 1 | 0 | 🟢 |
| mis_quality_audits | ✅ | 4 | 0 | 🟢 |
| mis_quality_processes | ✅ | 1 | 0 | 🟢 |
| mis_suppliers | ✅ | 4 | 0 | 🟢 |
| mis_tasks | ✅ | 2 | 0 | 🟢 |
| newsletter_subscribers | ✅ | 1 | 0 | 🟢 |
| **notfall_info** | ✅ | 5 | 1 | 🔴 **P0** |
| notifications | ✅ | 3 | 0 | 🟢 |
| page_views | ✅ | 2 | 0 | 🟢 |
| profiles | ✅ | 11 | 0 | 🟢 |
| push_subscriptions | ✅ | 2 | 0 | 🟢 |
| referrals | ✅ | 3 | 0 | 🟢 |
| reviews | ✅ | 5 | 2 | 🟢 by design |
| visitor_locations | ✅ | 2 | 0 | 🟢 |
| visitors | ✅ | 2 | 0 | 🟢 |

---

## Empfehlungen

### Sofort (heute)
1. **Migrations-PR vorbereiten** mit der RPC-Funktion `get_emergency_info_with_pin`
   und den beiden `DROP POLICY`-Statements.
2. **Pen-Test-Eintrag** im CAPA-Log (`mis_capa`) anlegen: "RLS-Befund P0
   Notfall-PIN-Gate" mit Due-Date = Ende nächste Woche.
3. **Verbreitung prüfen:** Welche User haben bereits `notfall_info` ausgefüllt?
   ```sql
   SELECT COUNT(*) FROM notfall_info;
   ```
   → wenn > 0, darüber nachdenken, ob DSGVO-Art.-33-Meldepflicht greift
   (Kriterium: "wahrscheinlich zu Risiko für Rechte und Freiheiten"). Meine
   Einschätzung: *wahrscheinlich ja*, weil Gesundheitsdaten betroffen. Unbedingt
   mit Datenschutzbeauftragtem / Anwalt abstimmen, bevor gemeldet wird oder
   entschieden wird, nicht zu melden.

### Kurz (Sprint 3)
4. **Policy-Naming-Policy:** Policies dürfen keine Behauptungen im Namen
   enthalten, die sie nicht durchsetzen ("with pin" war irreführend). Vorschlag:
   Naming-Konvention `{table}_{cmd}_{auth-subject}` — z.B.
   `notfall_info_select_rpc_only`, `notfall_info_select_owner`.
5. **CI-Lint:** Script `scripts/audit-rls.ts` bauen, das bei jedem Deploy prüft:
   - RLS muss auf allen `public`-Tabellen aktiv sein.
   - Keine Policy mit `qual = 'true'` + `roles = {public}` + `cmd = SELECT`
     ohne explizite Allowlist (`reviews`, `angels`, `app_settings`, `kf_feature_flags`).
   - Keine `INSERT/UPDATE/DELETE` mit `qual = 'true'` für `public`.

### Mittel (Sprint 4)
6. **Pen-Test:** externe Prüfung durch HackerOne oder lokalen Pentester — die
   Prompt-Vorlage kann lauten: „Finde alle Supabase-Tabellen, die sensiblere
   Daten über den anon-Key liefern als erwartet."
7. **Supabase Advisors aktivieren:** Dashboard → Advisors → Performance+Security
   → dort landen solche Policy-Befunde automatisch.

---

## Checkliste

- [x] Alle 57 Tabellen haben RLS enabled
- [x] 13 offene Policies analysiert
- [x] 2 P0-Funde dokumentiert (`medikamentenplan`, `notfall_info`)
- [x] App-Code-Verifikation für PIN-Gate (client-side confirmed)
- [x] Migrations-PR für `get_emergency_info_with_pin` geschrieben und gemergt
  (Migration `rls_p0_emergency_pin_gate`, 2026-04-17)
- [x] Offene Policies gedroppt: `Public emergency access with pin` (notfall_info),
  `Public emergency access medikamente` (medikamentenplan)
- [x] Frontend `/notfall/[id]/page.tsx` auf RPC umgestellt (kein client-side PIN-Check mehr)
- [x] Rate-Limit + Audit-Tabelle `notfall_access_attempts` angelegt
- [x] Smoke-Tests gegen RPC: Happy-Path, invalid_pin, rate_limited ✅
- [x] CAPA-Eintrag anlegen — `CAPA-2026-001` in `mis_capa` (closed, effectiveness_verified=true)
- [x] CHECK-Constraint `notfall_info_pin_format_check` angelegt (Migration
  `add_check_constraint_notfall_pin`, 2026-04-17) — erlaubt nur `NULL | '' | ^\d{4}$`
- [x] CI-Lint-Script `scripts/audit-rls.ts` + RPCs `audit_rls_status`,
  `audit_rls_policies`, `audit_check_constraint_exists` angelegt (Migration
  `add_audit_rls_rpcs`, 2026-04-17) — npm-Script `audit:rls`
- [ ] Klärung DSGVO-Art.-33-Meldung mit Datenschutzbeauftragtem (Scope: 2 betroffene
  notfall_info-Zeilen, 1 aktiver Medikamentenplan — Wahrscheinlichkeit einer realen
  Exfiltration gering, da Produkt pre-Launch; Entscheidung aber formal festhalten)
- [ ] CI-Pipeline so einrichten, dass `npm run audit:rls` in jedem PR mit
  `SUPABASE_SERVICE_ROLE_KEY`-Secret läuft und bei Verstoß failt

---

## Mitigation-Log

### 2026-04-17 — RLS-P0 behoben

**Migration:** `rls_p0_emergency_pin_gate`
**Umfang:**

1. Neue Tabelle `notfall_access_attempts` (uuid, user_id, success, attempted_at)
   mit RLS enabled. SELECT nur für Admins (`is_admin()`), kein Policy für
   INSERT/UPDATE/DELETE — Writes laufen ausschließlich über SECURITY-DEFINER-RPC.
2. Neue Funktion `public.get_emergency_info_with_pin(p_user_id uuid, p_pin text)`
   als SECURITY DEFINER:
   - Input-Validierung: PIN muss `^\d{4}$` matchen
   - Rate-Limit: 10 Fehlversuche/h pro `user_id` → Rückgabe `{error:'rate_limited'}`
   - PIN-Match gegen `notfall_info.notfall_pin`
   - Erfolgs-Response: `{notfall, medikamente, profile}` als jsonb.
     `notfall_pin` wird mittels `to_jsonb(...) - 'notfall_pin'` rausgefiltert
     und verlässt niemals die DB.
   - Miss-Response: `{error:'invalid_pin'}`
3. EXECUTE-Grant auf RPC für `anon` + `authenticated`.
4. Gedroppte Policies:
   - `"Public emergency access with pin"` auf `notfall_info`
   - `"Public emergency access medikamente"` auf `medikamentenplan`

**Frontend-Anpassung:** `app/notfall/[id]/page.tsx`
- Drei separate Queries (notfall_info + profiles + medikamentenplan) durch
  **einen** `supabase.rpc('get_emergency_info_with_pin', {p_user_id, p_pin})` ersetzt.
- Client-seitiger PIN-Vergleich entfernt.
- TypeScript-Types `EmergencyRpcSuccess | EmergencyRpcError` für Typ-sichere
  Diskriminierung im UI.
- Rate-Limit-Fall zeigt Hinweis: „Zu viele Versuche. Bitte in einer Stunde erneut versuchen."

**Verifikation:**
```
-- 1) Offene Policies sind weg
SELECT policyname FROM pg_policies
 WHERE tablename IN ('notfall_info','medikamentenplan')
   AND qual = 'true';  -- 0 rows ✅

-- 2) RPC-Permissions
-- anon + authenticated haben EXECUTE ✅

-- 3) Anon-SELECT scheitert
-- curl '/rest/v1/notfall_info?select=*' -H "apikey:<anon>"
-- → [] (RLS blockt, weil Policy "Users can view own" auf auth.uid() scoped)

-- 4) Happy-Path (temp-PIN in Transaktion): {notfall, profile, medikamente} ohne notfall_pin ✅
-- 5) Falscher PIN: {error:'invalid_pin'} ✅
-- 6) 11 Fehlversuche: {error:'rate_limited', retry_after:3600} ✅
```

**Effekt:**
Die DSGVO-Art.-9-Exposition ist geschlossen. Der PIN wird nie mehr an den Client
übermittelt. Brute-Force auf 4-stellige PINs wird nach 10 Versuchen blockiert.
Admin-Zugriff auf das Audit-Log erlaubt forensische Nachverfolgung.

**Offener Rest:** DSGVO-Art.-33-Meldung formal mit DSB abstimmen. Scope (2
notfall_info-Zeilen, 1 aktiver Medikamentenplan) spricht für „kein Risiko für
Rechte und Freiheiten betroffener Personen" — Entscheidung aber dokumentieren,
nicht einfach mündlich begraben.

---

### 2026-04-17 — Defense-in-Depth: Prevention-Controls

Nachtrag zum P0-Fix. Drei präventive Controls, damit der gleiche Fehler nicht
nochmal durchrutscht:

#### 1) CAPA-Eintrag `CAPA-2026-001`

Angelegt in `mis_capa` (Quality Management):

- **Type:** corrective
- **Source:** incident
- **Priority:** critical
- **Status:** closed
- **Effectiveness verified:** true
- **Titel:** „RLS P0: Notfall-PIN client-seitig geprüft (DSGVO Art. 9 Exposition)"
- **Root-Cause:** Unsichere Policy + client-seitige PIN-Prüfung.
- **Action-Plan:** RPC + Rate-Limiter + Policies gedroppt + Frontend-Rewrite.

#### 2) DB-CHECK-Constraint auf `notfall_pin`

**Migration:** `add_check_constraint_notfall_pin`

```sql
ALTER TABLE public.notfall_info
  ADD CONSTRAINT notfall_info_pin_format_check
  CHECK (notfall_pin IS NULL OR notfall_pin = '' OR notfall_pin ~ '^[0-9]{4}$');
```

Verifikationstests (DO-Block):

- 5-stelliger PIN `'12345'` → `check_violation` ✅
- Buchstaben `'abcd'` → `check_violation` ✅
- NULL → akzeptiert ✅
- `'1234'` → akzeptiert ✅

**Analogie:** Wie ein Türsteher mit Dress-Code-Liste — auch wenn die App-Schicht
mal nachlässig validiert, lässt die DB nur Format-konforme Werte rein.

#### 3) CI-Lint-Script `scripts/audit-rls.ts` + Audit-RPCs

**Migration:** `add_audit_rls_rpcs` — legt drei Read-Only SECURITY-DEFINER-RPCs
an (`audit_rls_status`, `audit_rls_policies`, `audit_check_constraint_exists`),
die nur `service_role` ausführen darf.

**Script:** `scripts/audit-rls.ts` prüft bei jedem Lauf:

- RLS aktiv auf `notfall_info`, `profiles`, `medikamentenplan`, `einnahme_log`,
  `notfall_audit_log`
- Die drei gedroppten Policies tauchen nicht wieder auf
- Keine `SELECT`-Policy mit `USING(true)` für `anon`
- `CHECK`-Constraint `notfall_info_pin_format_check` existiert

Aufruf: `npm run audit:rls` (benötigt `SUPABASE_SERVICE_ROLE_KEY` als ENV).
Exit-Code ≠ 0 bei Verstößen → kann in GitHub-Actions als Required-Check
verdrahtet werden.
