# Production-Migrationsplan — Expansion Deutschland

**Erstellt:** 08.08.2026
**Zuletzt erweitert:** 08.08.2026 — Phasen H–L aus der Produktionsreife-Abnahme
**Branch:** `staging/expansion-abnahme`
**Ziel-Projekt:** Supabase `nnwyktkqibdjxgimjyuq`
**Stamm-Org:** `00000000-0000-4000-8000-000460629986` (IK 460629986)

> **Dieser Plan wurde NICHT ausgeführt.** Kein Production-Objekt wurde angelegt,
> geändert oder gelöscht. Die Ausführung erfordert eine ausdrückliche Freigabe.

---

## 0. Was diese Migration fachlich bewirkt

| Vorher | Nachher |
|---|---|
| Kassenleistung = „PLZ liegt in Hessen" (Code) | Kassenleistung = „Bundesland freigeschaltet" (Stammdaten) |
| Freischaltung eines Landes = Code-Change + Deployment | Freischaltung = ein Klick im Admin |
| Keine Nachweispflicht in der DB | `insurance_enabled` ohne Bescheid **und** Tarife technisch unmöglich |
| Keine Historie der Freischaltungen | Jede Änderung revisionssicher mit SHA-256 |

**Wirtschaftlich unverändert:** Auf Production existieren derzeit **0 Kassentarife**
und **0 Kassenrechnungen**. Die Migration ändert damit an laufenden Abrechnungen nichts —
sie legt die Steuerungsebene an und sperrt einen Weg, der heute ohnehin nicht beschritten wird.

---

## 1. Reihenfolge

Strikt in dieser Reihenfolge. Jede Datei ist idempotent (`IF NOT EXISTS` /
`CREATE OR REPLACE`) und darf bei Abbruch erneut laufen.

| Phase | Datei | Dauer | DDL-Sperren |
|---|---|---|---|
| **A** | `20260808100000_expansion_deutschland.sql` | < 5 s | nur neue Objekte + `organizations` (AFTER-INSERT-Trigger) |
| **B** | `20260808110000_tarifschichten_bundesland.sql` | < 10 s | `ACCESS EXCLUSIVE` auf `organizations`, `billing_tariffs`, `invoices`, `bookings` (FK + Trigger) |
| **C** | `20260808120000_expansion_review_fixes.sql` | < 5 s | `state_settings`, `billing_landesregeln` |
| **D** | `20260808120001_plz_bundesland_seed.sql` | < 1 s | nur `plz_bundesland_regeln` |
| **E** | `20260808120002_invoice_bundesland_klient.sql` | < 1 s | nur `CREATE OR REPLACE FUNCTION` |
| **F** | `20260808130000_expansion_phase2.sql` | < 2 s | nur Funktionen, Typ und View |
| **G** | `20260808140000_katalog_rls.sql` | < 1 s | RLS auf 4 Katalogtabellen |
| **H** | `20260808150000_view_invoker_und_haertung.sql` | < 5 s | 2 Views, 1 Funktion, 3 Indizes auf `invoice_items` / `service_records` |
| **I** | `20260808160000_profiles_agb_spalten.sql` | < 2 s | `ACCESS EXCLUSIVE` auf `profiles` (2 × `ADD COLUMN`, ohne Default → nur Katalogeintrag) |
| **J** | `20260808170000_role_guard_insert_fix.sql` | < 1 s | Trigger-Tausch auf `profiles` |
| **K** | `20260808180000_fk_indizes_operativer_kern.sql` | 10 s – mehrere Min. | **20 Indizes**, siehe Warnung unten |
| **L** | `20260808190000_fehlende_policies.sql` | < 1 s | Policies auf 5 Tabellen |

**Phase H schließt ein nachgewiesenes Kreuz-Mandanten-Leck** (beide Views liefen
mit Definer-Rechten und umgingen die RLS). Sie ist der wichtigste Teil der
Kette und darf nicht ausgelassen werden.

**Phase K: `CREATE INDEX` sperrt die Tabelle gegen Schreibzugriffe.** Auf einer
Datenbank unter Last die 20 Anweisungen NICHT als Skript fahren, sondern
einzeln mit `CREATE INDEX CONCURRENTLY` (dann ohne Transaktionsblock, und
`lock_timeout` vorher auf `0` — `CONCURRENTLY` verträgt kein Timeout).
Bei den heutigen Zeilenzahlen (< 10 000 je Tabelle) ist der Skriptlauf
unkritisch; die Regel gilt ab dem Zeitpunkt, an dem das nicht mehr stimmt.

**Phase L legt Policies nur dort an, wo noch gar keine Policy existiert.**
Trägt die Produktionsdatenbank bereits von Hand erstellte Regeln, passiert
nichts — die Migration kann eine bestehende Absicherung nicht aufweichen.
Vorher prüfen, was tatsächlich da ist:

```sql
SELECT tablename, count(*) AS policies
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('app_settings','datenannahmestellen','fcm_tokens',
                     'push_subscriptions','referrals')
 GROUP BY 1 ORDER BY 1;
```

Phase B nimmt kurzzeitig exklusive Sperren auf `invoices` und `bookings`.
Deshalb: **außerhalb der Geschäftszeiten**, mit `SET lock_timeout = '5s'`,
damit ein hängender Lock die Anwendung nicht blockiert, sondern die Migration
sauber abbricht.

```sql
SET lock_timeout = '5s';
SET statement_timeout = '120s';
```

---

## 2. Preflight-Checks

**Alle müssen grün sein, bevor Phase A startet.** Read-only, jederzeit ausführbar.

### P1 — Vorbedingungen vorhanden

```sql
SELECT
  to_regclass('public.organizations')        IS NOT NULL AS organizations,
  to_regclass('public.billing_tariffs')      IS NOT NULL AS billing_tariffs,
  to_regclass('public.billing_rechtsgrundlagen') IS NOT NULL AS rechtsgrundlagen,
  to_regclass('public.billing_leistungsarten')   IS NOT NULL AS leistungsarten,
  to_regproc('public.set_updated_at')        IS NOT NULL AS set_updated_at,
  to_regproc('public.is_admin')              IS NOT NULL AS is_admin,
  to_regproc('public.current_org_id')        IS NOT NULL AS current_org_id,
  to_regproc('public.validate_ik_nummer')    IS NOT NULL AS validate_ik;
```
**Erwartet:** alle `true`.
Fehlt `billing_rechtsgrundlagen`/`validate_ik_nummer`, ist
`20260807120000_tariff_model_hardening.sql` noch nicht angewendet → zuerst nachziehen.

### P2 — `extensions.digest` verfügbar (Audit-Checksummen)

```sql
SELECT encode(extensions.digest('test'::bytea, 'sha256'), 'hex');
```
**Erwartet:** ein Hex-String. Fehler ⇒ `pgcrypto` im Schema `extensions` fehlt → **STOPP**.

### P3 — Bundesland-Werte normalisierbar (Phase B setzt Fremdschlüssel)

```sql
-- Nach Phase A ausführbar, weil normalize_bundesland erst dort entsteht.
-- Vorab-Variante ohne die Funktion:
SELECT id, name, bundesland
  FROM public.organizations
 WHERE bundesland IS NOT NULL
   AND lower(regexp_replace(
         replace(replace(replace(replace(lower(bundesland),'ä','ae'),'ö','oe'),'ü','ue'),'ß','ss'),
         '[^a-z0-9]+','_','g'))
       NOT IN ('baden_wuerttemberg','bayern','berlin','brandenburg','bremen','hamburg',
               'hessen','mecklenburg_vorpommern','niedersachsen','nordrhein_westfalen',
               'rheinland_pfalz','saarland','sachsen','sachsen_anhalt',
               'schleswig_holstein','thueringen');

SELECT id, bundesland FROM public.billing_tariffs
 WHERE bundesland IS NOT NULL AND deleted_at IS NULL;
```
**Erwartet:** erste Abfrage **0 Zeilen**. Zweite Abfrage darf Zeilen liefern —
jeder Wert muss aber normalisierbar sein.
Bei Treffern: Werte **vor** Phase B korrigieren, sonst schlägt der FK fehl.

### P4 — Klienten-PLZ vollständig (kritisch für die Rechnungsfreigabe)

```sql
SELECT COUNT(*) FILTER (WHERE zip_code IS NULL OR zip_code !~ '^[0-9]{5}$') AS ohne_plz,
       COUNT(*)                                                             AS gesamt
  FROM public.clients
 WHERE COALESCE(status, 'active') <> 'inactive';
```
**Erwartet:** `ohne_plz = 0`.
Ab Phase C leitet `trg_kassenrechnung_freigeschaltet` das Bundesland aus
`clients.zip_code` ab. Fehlt die PLZ, blockiert die **Freigabe** von
Kassenrechnungen (Entwürfe bleiben möglich).
→ **Kein STOPP**, aber die Liste muss vor der ersten Kassen-Freischaltung
abgearbeitet sein. Betroffene Klienten auflisten und nachpflegen.

### P5 — Keine offenen Kassenrechnungen, die hängenbleiben würden

```sql
SELECT i.id, i.invoice_number, i.status, c.zip_code
  FROM public.invoices i
  JOIN public.clients c ON c.id = i.client_id
 WHERE i.deleted_at IS NULL
   AND i.status NOT IN ('entwurf','storniert','bezahlt','akzeptiert')
   AND EXISTS (SELECT 1 FROM public.invoice_items x
                WHERE x.invoice_id = i.id AND x.budget_type <> 'private');
```
**Erwartet:** 0 Zeilen (Production hat aktuell keine Kassenrechnungen).
Bei Treffern: Der Guard greift nur bei **künftigen** Statuswechseln — bestehende
Rechnungen bleiben unangetastet. Liste dennoch dokumentieren, weil ein weiterer
Statuswechsel dieser Rechnungen bis zur Freischaltung scheitert.

### P6 — Aktuelle Tarif- und Buchungslage festhalten (Referenz für Phase-Smoke-Tests)

```sql
SELECT
  (SELECT COUNT(*) FROM public.billing_tariffs WHERE deleted_at IS NULL)            AS tarife,
  (SELECT COUNT(*) FROM public.billing_tariffs WHERE deleted_at IS NULL
                                                 AND rechtsgrundlage <> 'privat')    AS kassentarife,
  (SELECT COUNT(*) FROM public.invoices  WHERE deleted_at IS NULL)                   AS rechnungen,
  (SELECT COUNT(*) FROM public.bookings)                                             AS buchungen,
  (SELECT COUNT(*) FROM public.organizations)                                        AS orgs;
```
Werte notieren — die Smoke-Tests vergleichen dagegen.

### P7 — Migrationsdateien unverändert

```
npm run generate:plz-sql && git diff --exit-code supabase/migrations/20260808120001_plz_bundesland_seed.sql
npx vitest run __tests__/expansion
```
**Erwartet:** kein Diff, alle Tests grün.

### P8 — Staging-Durchlauf bestanden

**Bereits durchgeführt** — vollständige Abnahme am 08.08.2026 gegen eine lokale
Postgres-16-Instanz, die aus genau diesen Migrationen aufgebaut wurde
(`./scripts/shadow-db.sh test`, kein Supabase-Projekt berührt). Ergebnisse:

```
Migrationsaufbau      76 von 76 Dateien OK
Idempotenz            2 Wiederholungsläufe, 0 Fehler
Tenant-Isolation      28 / 28
E2E Expansion         28 / 28
E2E 16 Bundesländer   162 / 162
Sicherheit            30 / 30  (+1 INFO, siehe Restrisiko R1)
Regression Abrechnung 10 / 10
```

**Nachlauf 08.08.2026 (Produktionsreife-Abnahme, Phasen H–L).** Erneut
komplett von null aufgebaut, jetzt mit 81 Migrationsdateien, dazu eine
Browser-Abnahme gegen die laufende Anwendung (Next.js `next start` auf
`127.0.0.1:8080`, Supabase-Ersatz aus PostgREST + Auth-Shim auf derselben
Shadow-DB). Ergebnisse unverändert grün, zusätzlich:

```
Idempotenz            81 / 81 Dateien, 2. Lauf ohne Fehler
RLS-Audit A1          0 public-Tabellen ohne RLS
RLS-Audit A2          4 Tabellen mit RLS ohne Policy — alle bewusst gesperrt
                      (login_rate_limits, conversions, notfall_access_attempts,
                       whatsapp_conversations; nur über service_role angefasst)
RLS-Audit A5          0 SECURITY DEFINER-Funktionen ohne search_path
RLS-Audit A7          state_expansion_dashboard + billing_preisschichten_uebersicht
                      auf invoker; state_settings_public bewusst definer
API-Audit             71 Routen, 89 unauthentifizierte Aufrufe,
                      0 × 5xx, 0 ungeschützte Endpunkte
```

Wiederholung auf einem Supabase-Branch (optional, empfohlen vor Phase A):

```
psql "$STAGING_URL" -f tests/e2e-expansion-deutschland.sql
psql "$STAGING_URL" -f tests/e2e-alle-bundeslaender.sql
psql "$STAGING_URL" -f tests/security-expansion.sql
psql "$STAGING_URL" -f tests/regression-abrechnung.sql
```

---

## 3. Backup

**Vor Phase A**, nicht später:

1. **Supabase-PITR-Marke setzen** (Dashboard → Database → Backups) und den
   Zeitstempel im Protokoll festhalten. Das ist der Wiederherstellungspunkt.
2. **Logischer Dump der betroffenen Tabellen** als schneller Vergleichspunkt:

```bash
pg_dump "$PROD_URL" \
  --schema=public --data-only --no-owner \
  --table=public.organizations \
  --table=public.billing_tariffs \
  --table=public.invoices \
  --table=public.invoice_items \
  --table=public.bookings \
  --table=public.clients \
  > backup_pre_expansion_$(date +%Y%m%d_%H%M).sql
```

3. **Schema-Dump** zum Diffen nach der Migration:

```bash
pg_dump "$PROD_URL" --schema-only --no-owner > schema_pre_expansion.sql
```

Ohne bestätigtes Backup startet Phase A nicht.

---

## 4. Erwartete DB-Änderungen

### Neue Objekte

| Typ | Name |
|---|---|
| Tabelle | `bundeslaender` (16 Zeilen), `state_settings` (16 × Anzahl Orgs), `state_settings_audit`, `state_waitlist`, `plz_bundesland_regeln` (192 Zeilen) |
| Tabelle | `billing_gesetzliche_obergrenzen` (2 Zeilen, beide `bestaetigt = false`), `billing_wegepauschalen` (leer), `billing_landesregeln` (1 Zeile), `billing_landesregel_keys` (16 Zeilen) |
| View | `state_settings_public`, `billing_preisschichten_uebersicht` |
| Typ | `state_activation_result` |
| Funktion | `activate_insurance_billing`, `deactivate_insurance_billing`, `update_state_settings`, `log_state_settings_change`, `state_flag`, `seed_state_settings_for_org`, `normalize_bundesland`, `landesregel`, `bundesland_fuer_plz`, `eindeutiges_bundesland_fuer_plz`, `kassenabrechnung_erlaubt`, `zaehle_kassentarife`, `claim_waitlist_batch`, `expansion_rpc_marker_gesetzt` + 6 Trigger-Funktionen |

### Änderungen an bestehenden Tabellen

| Tabelle | Änderung | Risiko |
|---|---|---|
| `organizations` | `bundesland` normalisiert (`'Hessen'` → `'hessen'`), neuer FK `fk_org_bundesland`, neuer AFTER-INSERT-Trigger | niedrig — 1 Zeile betroffen |
| `billing_tariffs` | `bundesland` normalisiert, FK `fk_tariff_bundesland`, 2 neue Trigger | niedrig — Tabelle ist leer |
| `invoices` | neuer BEFORE-UPDATE-Trigger auf `status` | **mittel** — betrifft jeden Statuswechsel |
| `invoice_items` | keine (Trigger wurde in Phase C auf `invoices` verlegt) | — |
| `bookings` | neuer BEFORE-INSERT/UPDATE-Trigger auf `payment_method` | **mittel** — betrifft jede Buchung |
| `clients` | keine | — |

### Was NICHT passiert

- Keine Zeile wird gelöscht.
- Keine Preise werden geschrieben (die zwei Obergrenzen sind unbestätigt und wirken nicht).
- Kein Bundesland wird freigeschaltet — auch Hessen bleibt auf `ANTRAG_EINGEREICHT`.
- Keine E-Mail wird versendet.

---

## 5. Smoke-Tests nach jeder Phase

### Nach A

```sql
SELECT COUNT(*) FROM public.bundeslaender;                          -- 16
SELECT COUNT(*) FROM public.state_settings;                         -- 16 × Anzahl Orgs
SELECT bundesland, status, marketing_enabled, registration_enabled,
       waitinglist_enabled, private_enabled, insurance_enabled
  FROM public.state_settings
 WHERE organization_id = '00000000-0000-4000-8000-000460629986'
 ORDER BY bundesland;
-- Hessen: ANTRAG_EINGEREICHT, t, t, t, t, f     — alle anderen: VORBEREITUNG, t, t, t, f, f
SELECT COUNT(*) FROM public.state_settings WHERE insurance_enabled;  -- 0
SELECT COUNT(*) FROM public.state_settings_audit;                    -- = Anzahl state_settings
```

**Anwendung:** `/admin/expansion` öffnen — 16 Zeilen, kein Fehler.
`GET /api/expansion/status?plz=60311` → `kassenabrechnung: false`, `privatleistungen: true`.

**Abbruchkriterium:** weniger als 16 Zeilen je Org, oder `insurance_enabled` irgendwo `true`.

### Nach B

```sql
SELECT bundesland FROM public.organizations;                         -- 'hessen'
SELECT COUNT(*) FROM public.billing_gesetzliche_obergrenzen
 WHERE bestaetigt;                                                   -- 0
SELECT conname FROM pg_constraint
 WHERE conname IN ('fk_org_bundesland','fk_tariff_bundesland');      -- 2 Zeilen
SELECT tgname FROM pg_trigger
 WHERE tgname IN ('trg_tariff_obergrenze','trg_kassentarif_freigeschaltet',
                  'trg_kassenrechnung_freigeschaltet','trg_booking_zahlungsart');
```

**Anwendung:** eine Testbuchung über die Kundenapp anlegen → landet als `privat`.
Eine bestehende Rechnung im Entwurf öffnen → weiterhin bearbeitbar.

**Abbruchkriterium:** `organizations.bundesland` nicht `'hessen'`, oder ein FK fehlt.

### Nach C

```sql
-- Bypass muss scheitern:
UPDATE public.state_settings SET insurance_enabled = TRUE, status = 'ANERKANNT',
       approval_document = 'x' WHERE bundesland = 'hessen';
-- erwartet: FREISCHALTUNG_NUR_UEBER_RPC

-- Freischaltung ohne Tarife muss scheitern:
SELECT public.activate_insurance_billing(
  '00000000-0000-4000-8000-000460629986','hessen',
  (SELECT id FROM auth.users LIMIT 1),'preflight-test.pdf');
-- erwartet: FREISCHALTUNG_OHNE_TARIFE
```

Beide Anweisungen **müssen mit Fehler enden**. Danach:

```sql
SELECT COUNT(*) FROM public.state_settings WHERE insurance_enabled;  -- weiterhin 0
```

### Nach D

```sql
SELECT COUNT(*) FROM public.plz_bundesland_regeln;                   -- 192
SELECT * FROM public.bundesland_fuer_plz('60311');                   -- hessen | t
SELECT * FROM public.bundesland_fuer_plz('80331');                   -- bayern | t
SELECT public.eindeutiges_bundesland_fuer_plz('21444');              -- NULL (Grenzregion)
SELECT public.eindeutiges_bundesland_fuer_plz('55246');              -- hessen (Ausnahme)
SELECT public.kassenabrechnung_erlaubt(
  '00000000-0000-4000-8000-000460629986','60311');                   -- false
```

### Nach E

```sql
SELECT obj_description('public.create_invoice_draft_atomic'::regproc);
-- muss "v5" enthalten
```

### Nach F

```sql
SELECT COUNT(*) FROM public.state_expansion_dashboard
 WHERE organization_id = '00000000-0000-4000-8000-000460629986';   -- 16

SELECT bundesland, status, insurance_enabled,
       kassentarife_gesamt, kassentarife_aktiv, freischaltbar
  FROM public.state_expansion_dashboard
 WHERE organization_id = '00000000-0000-4000-8000-000460629986'
 ORDER BY sort_order;
-- erwartet: ueberall insurance_enabled = false, freischaltbar = false
-- (kein Bescheid, keine Tarife)

-- Freischaltung ohne Tarife muss weiterhin scheitern:
SELECT public.activate_insurance_billing(
  '00000000-0000-4000-8000-000460629986','hessen',
  (SELECT id FROM auth.users LIMIT 1),'smoke-test.pdf');
-- erwartet: FREISCHALTUNG_OHNE_TARIFE
```

**Anwendung:** `/admin/expansion` öffnen — Kachelansicht zeigt 16 Länderkarten,
jede mit „es fehlt: Anerkennungsbescheid und Kassentarife". Bundesland-Umschalter
in der Seitenleiste auf ein Land stellen; `/admin/clients` muss den Hinweis
„Gefiltert auf …" zeigen.

**Anwendung (Kernprobe):** für einen echten Klienten mit Leistungen des
Vormonats einen Rechnungsentwurf über `/admin/rechnungserstellung` erzeugen.

```sql
SELECT new_state->>'bundesland', new_state->>'bundesland_quelle',
       new_state->>'rpc_version'
  FROM public.billing_audit_trail
 WHERE entity_type = 'invoice' ORDER BY created_at DESC LIMIT 1;
-- erwartet: hessen | klient_plz | v5_klient_bundesland
```

**Abbruchkriterium:** `bundesland_quelle = organisation_fallback` bei einem
Klienten mit gepflegter PLZ ⇒ die PLZ-Auflösung greift nicht → Phase D prüfen.

### Nach H — Kreuz-Mandanten-Leck geschlossen

```sql
-- 1) Views laufen mit Aufruferrechten
SELECT c.relname,
       CASE WHEN 'security_invoker=true' = ANY(COALESCE(c.reloptions, '{}'))
            THEN 'invoker' ELSE 'DEFINER — LECK' END AS modus
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('state_expansion_dashboard','billing_preisschichten_uebersicht');

-- 2) Gegenprobe als gewöhnlicher Kunde: muss 0 liefern
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claims" = '{"sub":"<UUID eines Nicht-Admins>","role":"authenticated"}';
  SELECT count(*) FROM public.state_expansion_dashboard;   -- erwartet: 0
ROLLBACK;

-- 3) keine SECURITY DEFINER-Funktion mehr ohne search_path
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef
   AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}')) c
                    WHERE c LIKE 'search_path=%');        -- erwartet: 0
```

**Abbruchkriterium:** Punkt 2 liefert mehr als 0 Zeilen ⇒ das Leck ist offen,
sofort Rollback H **nicht** fahren, sondern die Ursache klären.

### Nach I und J — Registrierung schreibt wieder vollständig

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'profiles' AND column_name LIKE 'agb%';   -- 2 Zeilen

SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal;
-- erwartet: trg_prevent_privileged_role_insert vorhanden,
--           trg_prevent_role_escalation_insert NICHT mehr
```

Danach eine echte Registrierung durchspielen (Testadresse, PLZ ausfüllen) und
prüfen, dass `postal_code` im Profil ankommt:

```sql
SELECT first_name, postal_code, location, agb_version
  FROM public.profiles WHERE email = '<Testadresse>';
```

**Abbruchkriterium:** `postal_code` leer ⇒ die Bundesland-Erkennung fällt für
diesen Kunden dauerhaft auf „unbekannt" zurück. Ursache klären, bevor
weitergemacht wird.

### Nach K — Indizes gültig

```sql
SELECT c.relname FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
 WHERE c.relname LIKE 'idx_%' AND NOT i.indisvalid;          -- 0 Zeilen

SELECT count(*) FROM pg_constraint c
  JOIN pg_class cl ON cl.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
 WHERE c.contype = 'f' AND n.nspname = 'public'
   AND array_length(c.conkey,1) = 1
   AND cl.relname IN ('invoices','invoice_items','invoice_disputes',
                      'service_records','client_budgets','budget_transactions',
                      'clients','assignments','caregivers','caregiver_documents',
                      'caregiver_qualifications','caregiver_bonuses','absences',
                      'client_preferred_substitutes')
   AND NOT EXISTS (SELECT 1 FROM pg_index i
                    WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]);
-- erwartet: 0
```

### Nach L — gesperrte Tabellen wieder benutzbar

```sql
SELECT tablename, policyname, cmd FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('app_settings','datenannahmestellen','fcm_tokens',
                     'push_subscriptions','referrals')
 ORDER BY 1;
```

Dazu in der Oberfläche: `/admin/settings` öffnen (Werte müssen erscheinen, nicht
leer bleiben) und `/admin/abrechnung/einstellungen` (Datenannahmestellen sichtbar).

### Gesamt-Abnahme

```
curl -s "https://alltagsengel.care/api/expansion/status?plz=60311" | jq
curl -s "https://alltagsengel.care/api/expansion/status?plz=80331" | jq
```
Beide: `"kassenabrechnung": false`. Für 60311 zusätzlich `"privatleistungen": true`.

Buchungsstrecke `/kunde/buchen-service` mit hessischer Profil-PLZ öffnen:
Zahlungsart **privat**, darunter der Hinweis
„Die Anerkennung für die Pflegekassenabrechnung befindet sich derzeit im
Genehmigungsverfahren." plus Wartelisten-Button.

---

## 6. GO / NO-GO-Gates

| Gate | Zeitpunkt | GO wenn … | NO-GO-Reaktion |
|---|---|---|---|
| **G0** Freigabe | vor allem | Geschäftsführung hat diesen Plan freigegeben | nichts tun |
| **G1** Preflight | vor A | P1, P2, P7, P8 grün; P3 = 0 Zeilen; P5 dokumentiert | Ursache beheben, erneut prüfen |
| **G2** Backup | vor A | PITR-Marke gesetzt **und** Dumps geschrieben | nicht starten |
| **G3** Phase A | nach A | 16 Zeilen je Org, `insurance_enabled` überall `false` | Rollback A |
| **G4** Phase B | nach B | `organizations.bundesland = 'hessen'`, beide FK vorhanden, 4 Trigger da, Testbuchung wird `privat` | Rollback B (dann A entscheiden) |
| **G5** Phase C | nach C | Bypass-UPDATE scheitert, Freischaltung ohne Tarife scheitert | Rollback C |
| **G6** Phase D | nach D | 192 Regeln, alle fünf PLZ-Proben korrekt | Rollback D (Tabelle leeren) |
| **G7** Phase E | nach E | Entwurf erzeugbar, Audit zeigt `klient_plz` / `v5` | 20260807180000 erneut einspielen (v4) |
| **G7b** Phase F | nach F | `state_expansion_dashboard` liefert 16 Zeilen, `/admin/expansion` zeigt Kacheln und Kennzahlen | Rollback F |
| **G7c** Phase G | nach G | `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity` = 0 | Rollback G |
| **G7d** Phase H | nach H | beide Views auf `invoker` (Abfrage unten), ein Nicht-Admin liest 0 Zeilen aus `state_expansion_dashboard` | Rollback H |
| **G7e** Phase I | nach I | `agb_accepted_at` und `agb_version` auf `profiles` vorhanden | Rollback I |
| **G7f** Phase J | nach J | Selbstanlage mit `role='kunde'` geht, mit `role='admin'` scheitert | Rollback J |
| **G7g** Phase K | nach K | alle 20 Indizes `valid`, keine `INVALID`-Reste aus abgebrochenem `CONCURRENTLY` | betroffene Indizes droppen und einzeln neu |
| **G7h** Phase L | nach L | Admin-Einstellungen laden, Push-Registrierung schreibt | Rollback L |
| **G8** Abnahme | 24 h nach E | keine neuen Fehler in Sentry, keine Buchung fälschlich `privat`, keine Nutzerbeschwerde | Rollback gemäß §7 |

**G7d — Prüfabfrage:**

```sql
SELECT c.relname,
       CASE WHEN 'security_invoker=true' = ANY(COALESCE(c.reloptions, '{}'))
            THEN 'invoker' ELSE 'DEFINER — LECK' END
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('state_expansion_dashboard','billing_preisschichten_uebersicht');
-- erwartet: beide 'invoker'
-- state_settings_public bleibt bewusst DEFINER (öffentlicher Kundenendpunkt).
```

**G7g — Prüfabfrage:**

```sql
SELECT c.relname FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
 WHERE c.relname LIKE 'idx_%' AND NOT i.indisvalid;
-- erwartet: 0 Zeilen
```

**Ein einziges NO-GO stoppt die Kette.** Phasen werden nicht übersprungen.

---

## 7. Rollback

Rückwärts, in umgekehrter Reihenfolge:

| Phase | Rollback |
|---|---|
| L | `psql -f supabase/migrations/20260808190001_rollback_fehlende_policies.sql` |
| K | `psql -f supabase/migrations/20260808180001_rollback_fk_indizes_operativer_kern.sql` |
| J | `psql -f supabase/migrations/20260808170001_rollback_role_guard_insert_fix.sql` |
| I | `psql -f supabase/migrations/20260808160001_rollback_profiles_agb_spalten.sql` — **vorher sichern**, der AGB-Nachweis ist dokumentationspflichtig (Befehl steht im Skriptkopf) |
| H | `psql -f supabase/migrations/20260808150001_rollback_view_invoker_und_haertung.sql` — **setzt das Kreuz-Mandanten-Leck wieder ein**, nur mit sofortiger Ersatzabsicherung |
| G | `psql -f supabase/migrations/20260808140001_rollback_katalog_rls.sql` |
| F | `psql -f supabase/migrations/20260808130001_rollback_expansion_phase2.sql` |
| E | `psql -f supabase/migrations/20260807180000_tariff_stammdaten_v2.sql` (stellt v4 wieder her) |
| C + D | `psql -f supabase/migrations/20260808120003_rollback_expansion_review_fixes.sql` |
| B | `psql -f supabase/migrations/20260808110001_rollback_tarifschichten_bundesland.sql` |
| A | `psql -f supabase/migrations/20260808100001_rollback_expansion_deutschland.sql` |

**Datensicherung im Rollback:** Die Rollback-Skripte kopieren fachliche Daten
(Warteliste, Audit-Trail, Wegepauschalen, Obergrenzen) vorher in `*_archiv`-Tabellen.
Diese bleiben stehen und müssen manuell entfernt werden.

**Was das Rollback NICHT rückgängig macht:** die Normalisierung
`'Hessen'` → `'hessen'`. Das ist Absicht — die alte Tarifauflösung vergleicht
mit `LOWER()` und ist damit abwärtskompatibel.

**PITR** ist die letzte Stufe, wenn ein Rollback-Skript selbst fehlschlägt.
Datenverlust = alle Schreibvorgänge seit der Marke. Nur mit Freigabe.

---

## 8. Nach erfolgreicher Migration — bevor Hessen freigeschaltet wird

Die Migration schaltet **nichts** frei. Für die spätere Freischaltung Hessens
sind diese Punkte offen und blockierend:

| # | Punkt | Warum blockierend |
|---|---|---|
| 1 | Anerkennungsbescheid §45a liegt vor und ist abgelegt | `activate_insurance_billing` verlangt ihn |
| 2 | Mindestens ein gültiger Kassentarif in `billing_tariffs` | `FREISCHALTUNG_OHNE_TARIFE` sonst |
| 3 | `clients.zip_code` bei allen aktiven Klienten gepflegt (P4) | sonst blockiert die Rechnungsfreigabe |
| 4 | PfluV-Obergrenzen gegen den Verordnungstext geprüft, `bestaetigt = true` | sonst greift die Preisdeckelung nicht |
| 5 | Stand der PfluV-Novelle geklärt | die Obergrenzen könnten entfallen sein |
| 6 | Storage-Bucket für Bescheide angelegt (aktuell nur Textpfad) | Nachweisführung |
| 7 | Wegepauschalen und Landesregeln Hessen erfasst | sonst rechnen wir ohne Wegekosten ab |

Erst wenn 1–4 erledigt sind, ist der Klick „Kassenabrechnung aktivieren" fachlich
zulässig.
