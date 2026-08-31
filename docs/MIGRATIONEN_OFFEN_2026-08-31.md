# Welche Migrationen stehen NICHT live — live gemessen, nicht aus der Liste gelesen

**Stand:** 31.08.2026 · **Messung:** `npm run check:migrationen` ·
**HEAD zum Zeitpunkt der Messung:** `4e541a78`

## Wie gemessen wurde — und warum nicht aus dem Ledger

`docs/MIGRATION_LEDGER.md` ist eine von Hand gepflegte Liste. Sie stimmte
an **fünf** Stellen nicht, und zwar in **beide** Richtungen:

| Der Ledger sagte | Live ist |
|---|---|
| `20261019000000_marketing_crm` — OFFEN | **steht** (6 Tabellen) |
| `20261019000002_rollenmatrix_marketing_verwalten` — OFFEN | **steht** |
| `20261019000004_audit_action_marketing` — OFFEN | **steht** |
| (nicht als offen geführt) `20261008000000` | **fehlt** |
| (nicht als offen geführt) `20261009000000` | **fehlt** |

„Fälschlich offen" kostet Zeit. „Fälschlich live" ist gefährlich: es lässt
eine Sperre als vorhanden gelten, die es nicht gibt.

`npm run check:migrationen` (`scripts/check-migrationen-live.mjs`) fragt
stattdessen den Katalog nach dem **Objekt**, das jede Migration
hinterlässt — Funktion, Trigger, eindeutiger Index, CHECK, Policy, Recht.
32 Migrationen ab `20261006000000`; alles davor gilt seit dem 27.08.2026
als angewendet (227+ Dateien, damals live geprüft).

Zwei Fallen sind darin eingearbeitet, weil sie beim ersten Anlauf
zugeschlagen haben:

- **Rechte nie über `information_schema`** — dort fehlen PUBLIC-Grants.
  `angels` erschien dadurch als ungeschützt, obwohl die Härtung steht.
  Geprüft wird ausschließlich mit `has_table_privilege()` /
  `has_column_privilege()`.
- **Namen nicht raten** — der Constraint auf `kim_audit_log` heißt
  `…_aktion_check`, nicht `…_action_check`. Eine LIKE-Probe meldete
  „fehlt", wo nichts fehlte.

## Ergebnis: 8 offen, 24 stehen

**Nicht 4.** Die Annahme „4 offene Migrationen" trifft nicht zu; die
Messung findet acht, davon sieben aus dem Bestand und eine neue aus dem
heutigen P0-Block.

---

### 1 · `20261008000000_vitalwerte_plausibilitaet_db_check`

| | |
|---|---|
| **GRUND** | Die vier Funktionen `vitals_plausibel_min/max/_sekundaer` existieren live nicht. Auf `vital_signs` stehen noch die alten Prüfungen `value >= 0` und `value_secondary IS NULL OR >= 0`. |
| **RISIKO** | **MITTEL, fachlich.** Ein Blutdruck von 4000 oder ein Puls von 0,5 wird von der Datenbank angenommen. Die Plausibilitätsgrenzen leben damit nur in TypeScript — jeder Schreibweg, der daran vorbeigeht (Dienstschlüssel-Route, Import, künftiger Cron), schreibt unplausible Vitalwerte in eine Pflegeakte. Kein Sicherheits-, ein Datenqualitätsrisiko. |
| **EXAKTER SQL** | `supabase/migrations/20261008000000_vitalwerte_plausibilitaet_db_check.sql` (193 Zeilen — die Datei ist der SQL; sie legt vier Funktionen an, löst die alten CHECKs und setzt sie typabhängig neu) |
| **VERIFIKATION** | `SELECT count(*) FROM pg_proc WHERE proname LIKE 'vitals_plausibel%';` → muss **4** sein (live: 0) |

### 2 · `20261009000000_pflege_massnahmenplaene_ein_aktiver_plan`

| | |
|---|---|
| **GRUND** | Der eindeutige Index fehlt. Live steht nur `idx_pflege_massnahmenplaene_aktiv` — ein **gewöhnlicher** Teilindex `(client_id, status) WHERE status='aktiv'`, der nichts erzwingt. |
| **RISIKO** | **MITTEL, fachlich.** Zwei gleichzeitig aktive Maßnahmenpläne je Klient bleiben möglich. Welcher gilt, entscheidet dann die Sortierung der Abfrage — in der Pflegedokumentation heißt das: zwei widersprechende Pläne, und die Durchführung hängt am Zufall. |
| **EXAKTER SQL** | `supabase/migrations/20261009000000_pflege_massnahmenplaene_ein_aktiver_plan.sql` (44 Zeilen). Kern: <br>`CREATE UNIQUE INDEX IF NOT EXISTS uq_pflege_massnahmenplaene_ein_aktiver_plan ON public.pflege_massnahmenplaene (client_id) WHERE status = 'aktiv';` <br>**Vorher prüfen** — auf einem Bestand mit Dubletten schlägt der Index fehl (die Datei enthält die Bereinigung). |
| **VERIFIKATION** | `SELECT count(*) FROM pg_indexes WHERE indexname='uq_pflege_massnahmenplaene_ein_aktiver_plan';` → **1** (live: 0) |

### 3 · `20261010000000_medikamente_abgesetzt_sperre_db`

| | |
|---|---|
| **GRUND** | Funktion `prevent_locked_medikament_edit()` **und** Trigger `trg_locked_medikament` fehlen beide. |
| **RISIKO** | **HOCH, fachlich.** Ein abgesetztes Medikament bleibt in der Datenbank änderbar. Die Sperre steht damit nur in der Anwendung — genau das Muster, das bei der Arbeitszeit-Sperre schon einmal umgangen wurde („entsperren und ändern"). In einer Medikamentenakte ist eine nachträgliche Änderung ein Dokumentationsmangel mit Haftungsfolge. |
| **EXAKTER SQL** | `supabase/migrations/20261010000000_medikamente_abgesetzt_sperre_db.sql` (65 Zeilen) |
| **VERIFIKATION** | `SELECT count(*) FROM pg_trigger WHERE tgname='trg_locked_medikament';` → **1** (live: 0) |

### 4 · `20261010000002_wund_kindtabellen_sperre_db`

| | |
|---|---|
| **GRUND** | `prevent_wound_child_edit_when_healed()` und die drei Trigger `trg_locked_wound_assessment` / `_treatment` / `_photo` fehlen. |
| **RISIKO** | **HOCH, fachlich.** Nach Abheilung sind Verlaufseinträge, Behandlungen und Fotos einer Wunde weiter änderbar. Die Wunddokumentation ist genau der Teil der Akte, den eine MDK-Prüfung liest. |
| **EXAKTER SQL** | `supabase/migrations/20261010000002_wund_kindtabellen_sperre_db.sql` (60 Zeilen) |
| **VERIFIKATION** | `SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_locked_wound_assessment','trg_locked_wound_treatment','trg_locked_wound_photo');` → **3** (live: 0) |

### 5 · `20261010000004_pflege_verlauf_backdating_sperre_db`

| | |
|---|---|
| **GRUND** | `prevent_backdated_verlauf_insert()` und `trg_verlauf_periode_offen` fehlen. |
| **RISIKO** | **HOCH, fachlich.** Ein Pflegeverlaufseintrag lässt sich in eine bereits abgeschlossene Periode zurückdatieren. Das ist der klassische Weg, eine Lücke nachträglich zu füllen — und er ist heute offen. |
| **EXAKTER SQL** | `supabase/migrations/20261010000004_pflege_verlauf_backdating_sperre_db.sql` (58 Zeilen) |
| **VERIFIKATION** | `SELECT count(*) FROM pg_trigger WHERE tgname='trg_verlauf_periode_offen';` → **1** (live: 0) |

### 6 · `20261021000002_secdef_trigger_revoke`

| | |
|---|---|
| **GRUND** | Sechs `SECURITY DEFINER`-Triggerfunktionen sind weiterhin für `anon` ausführbar: `arbzg_pruefung_ist`, `pflege_evaluation_unveraenderlich`, `pflege_evaluation_plan_in_kraft`, `pflege_evaluation_wiedervorlage`, `security_audit_log_unveraenderlich`, `security_audit_auth_anmeldung`. |
| **RISIKO** | **NIEDRIG, aber echt.** Eine Triggerfunktion ist über PostgREST nicht sinnvoll aufrufbar (Rückgabetyp `trigger`, kein Triggerkontext) — der frühere Befund „0 von 362 SECDEF+anon" hat Triggerfunktionen deshalb ausgeklammert. Das Restrisiko ist der Grundsatz: jede neue `public`-Funktion ist per Default für `anon` ausführbar, und eine Liste, die Ausnahmen kennt, wird irgendwann für eine Nicht-Ausnahme benutzt. |
| **EXAKTER SQL** | `supabase/migrations/20261021000002_secdef_trigger_revoke.sql` (103 Zeilen; schleift über alle SECDEF-Triggerfunktionen und führt je `REVOKE ALL … FROM PUBLIC, anon, authenticated` aus, mit Selbstprüfung am Ende) |
| **VERIFIKATION** | `SELECT count(*) FROM pg_proc p WHERE p.prosecdef AND p.pronamespace='public'::regnamespace AND p.prorettype='trigger'::regtype AND has_function_privilege('anon', p.oid, 'EXECUTE');` → **0** (live: 6) |

### 7 · `20261021000004_is_internal_staff_ohne_buero`

| | |
|---|---|
| **GRUND** | `is_internal_staff()` führt live weiterhin `ARRAY['admin','superadmin','pdl','buero']`. |
| **RISIKO** | **NIEDRIG heute, HOCH bei der nächsten Erweiterung.** Der CHECK auf `profiles.role` lässt `buero` nicht zu, kein Konto trägt den Wert — die Zeile ist heute wirkungslos. Sie ist eine gestellte Falle: wer den CHECK eines Tages um eine Büroverwaltung erweitert (ein naheliegender Schritt), gibt dieser Rolle in derselben Minute Zugriff auf alles hinter `is_internal_staff()` — u. a. `verordnungen_staff_read`, also Gesundheitsdaten. Ohne einen einzigen Eintrag in `ROLLEN_MATRIX`. |
| **EXAKTER SQL** | `supabase/migrations/20261021000004_is_internal_staff_ohne_buero.sql` (95 Zeilen; `CREATE OR REPLACE FUNCTION` mit der Liste ohne `buero`, dann `REVOKE ALL … FROM PUBLIC, anon` und `GRANT EXECUTE … TO authenticated, service_role`) |
| **VERIFIKATION** | `SELECT pg_get_functiondef(oid) NOT LIKE '%buero%' FROM pg_proc WHERE proname='is_internal_staff';` → **true** (live: false) · danach `npm run audit:rls-rollen` → Befund **F1** muss verschwinden |

### 8 · `20261022000000_rk_lesepolicies_verwaltungsrollen` *(neu, 31.08.2026)*

| | |
|---|---|
| **GRUND** | Neu angelegt. 0 von 24 Policies stehen. |
| **RISIKO** | **Kein Sicherheitsrisiko — Funktionsrisiko.** Solange sie fehlt, sehen `pdl`, `qm` und `buchhaltung` auf 24 Tabellen weiter **nichts**, ohne dass die Oberfläche sagt warum. Es wird zu wenig gezeigt, nicht zu viel. Die Migration **öffnet** Zugriff und ist deshalb die einzige der acht, bei der ein Anwendungsfehler zu **mehr** Sichtbarkeit führen könnte — dagegen stehen: `FOR SELECT` (kein Schreibrecht), `TO authenticated` (kein `anon`), `organization_id = current_org_id()` (Mandantenbindung zusätzlich zum RESTRICTIVE `org_fence`), und `darf('…')` statt einer eigenen Rollenliste. |
| **EXAKTER SQL** | `supabase/migrations/20261022000000_rk_lesepolicies_verwaltungsrollen.sql` · Rollback: `…20261022000001_rollback_…sql` · Entscheidung und Begründung je Tabelle: `docs/security/RLS_LESEPOLICIES_ENTSCHEIDUNG_2026-08-31.md` |
| **VERIFIKATION** | `npm run verify:rls-lesepolicies` → muss `24/24` melden. Danach `npm run lint:rls-sicht` → Abschnitt A auf 0, und die Obergrenze in `.github/workflows/ci.yml` entsprechend senken. |

---

## Warum ich sie nicht selbst anwenden kann

Nicht aus Vorsicht, sondern weil die Rechte fehlen. Geprüft am 31.08.2026:

```
current_user = service_role   session_user = authenticator
Eigentümer public.absences = postgres

CREATE POLICY zz_ddl_probe ON public.absences …
→ ERROR: must be owner of table absences        (42501)
```

Und es gibt keinen zweiten Weg in dieser Umgebung:

| Weg | Stand |
|---|---|
| Supabase-MCP | nicht verbunden |
| `SUPABASE_ACCESS_TOKEN` | nicht gesetzt (`supabase projects list` → `LegacyPlatformAuthRequiredError`) |
| `DATABASE_URL` / Postgres-Passwort | nicht vorhanden |
| `supabase db push` | im Projekt ausdrücklich verboten (Zukunfts-Zeitstempel) |
| `public._run_sql` | Lese-Orakel, rollt immer zurück, kein DDL |

**Die acht Dateien brauchen den Supabase-SQL-Editor als `postgres`.**

Reihenfolge ist unkritisch — keine der acht hängt von einer anderen ab.
Empfehlung: 3, 4, 5 zuerst (die drei Unveränderlichkeits-Trigger der
Pflegeakte, höchstes fachliches Risiko), dann 8 (schaltet drei Rollen
funktionsfähig), dann 1, 2, 7, 6.

Nach jeder Anwendung: `npm run check:migrationen` — der Lauf sagt
selbst, welche noch offen sind.
