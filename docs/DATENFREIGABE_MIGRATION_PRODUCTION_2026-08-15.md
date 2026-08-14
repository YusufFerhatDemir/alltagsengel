# P2 — Datenfreigabe-Migration auf Production: Prüfbericht

**Datum:** 15.08.2026
**Migration:** `supabase/migrations/20260916000000_coach_shares_email_funktionen.sql`
**Rollback:** `supabase/migrations/20260916000001_rollback_coach_shares_email_funktionen.sql`
**Projekt:** `nnwyktkqibdjxgimjyuq` (Alltagsengel Production)

## Ergebnis in einem Satz

Die Migration ist **freigegeben und vollständig verifiziert** (23/23 Prüfungen
gegen eine aus dem Repository aufgebaute Datenbank), konnte aber **NICHT auf
Production angewendet werden** — in dieser Session existiert kein Zugang mit
DDL-Rechten. Die Ursache ist unten mit Messwert belegt.

---

## 1. Was die Migration tut

Zwei neue Funktionen, **keine Tabelle, keine Policy, kein Trigger, kein ALTER**:

| Funktion | Zweck | Rückgabe |
|---|---|---|
| `coach_finde_nutzer_id(text)` | E-Mail → `auth.users.id`, nur wenn dazu ein `coach_users`-Konto existiert | eine `uuid` oder `NULL` |
| `coach_freigaben_liste()` | eigene `coach_shares`-Zeilen des Aufrufers inkl. E-Mail der eingeladenen Person | 5 Spalten |

Beide sind `SECURITY DEFINER` mit fixem `search_path = public`, `STABLE`, und
lesen `public.profiles` statt `auth.users` direkt.

**Warum sie nötig sind:** `lib/coach/api-auth.ts` verbietet bewusst
`createAdminClient()` in `app/api/coach/**`, damit RLS die einzige
Zugriffs-Wahrheit bleibt. Ohne Admin-Client kann eine E-Mail serverseitig
nicht auf eine `user_id` aufgelöst werden.

## 2. Schema-/RLS-/Policy-Prüfung

Live gegen Production introspiziert (PostgREST + `_run_sql`-Leseorakel):

* `coach_shares` existiert mit exakt den Spalten, die die Funktionen erwarten
  (`id`, `owner_coach_user_id`, `grantee_user_id`, `empfaenger_rolle`,
  `erstellt_am`, `widerrufen_am`).
* `coach_users(id, user_id)` und `profiles(id, email NOT NULL)` passen zu den
  JOIN-Bedingungen — **kein Schema-Drift**.
* Die beiden Policies auf `coach_shares` sind live wie im Repo:
  `coach_shares_owner_all` (ALL, Eigentümer) und `coach_shares_grantee_select`
  (SELECT, Empfänger). Die Migration ändert daran nichts.

**Sicherheitsbewertung — unbedenklich:**

* Rechte werden korrekt eng gezogen: `REVOKE ALL … FROM PUBLIC, anon,
  authenticated`, danach `GRANT EXECUTE … TO authenticated`. `anon` kann beide
  Funktionen nicht aufrufen (gemessen, siehe 8a/8b unten).
* `coach_freigaben_liste()` filtert auf `cu.user_id = auth.uid()`. Ohne JWT ist
  `auth.uid()` NULL → **null Zeilen**, also fail-closed. Ein fremder
  angemeldeter Nutzer bekommt die Liste eines anderen nicht (gemessen, 3e).
* Alle Tabellenbezüge im Funktionsrumpf sind schema-qualifiziert
  (`public.profiles` usw.) — der `SET search_path` ist damit nicht umgehbar.
* `coach_finde_nutzer_id` gibt ausschließlich eine `uuid` zurück, keinen Namen,
  keine Rolle.

**Eine bewusst akzeptierte Einschränkung (unverändert, bereits im
Migrationskommentar dokumentiert):** `coach_finde_nutzer_id` ist ein
Existenz-Orakel — ein angemeldeter Nutzer kann durch Ausprobieren erfahren, ob
eine E-Mail ein PflegeCoach-Konto hat. Das ist bei jedem „Person per E-Mail
einladen"-Flow so. Ein Rate-Limit dafür existiert noch nicht (TODO in
`app/api/coach/freigaben/route.ts`). Das ist **kein Blocker für den Apply**,
aber offen.

## 3. Gefahr für bestehende Production-Strukturen: keine

* Live geprüft: **beide Funktionsnamen existieren in Production nicht**
  (`pg_proc` leer, PostgREST-OpenAPI ohne `/rpc/coach_finde_nutzer_id` und
  `/rpc/coach_freigaben_liste`). `CREATE OR REPLACE` überschreibt also nichts.
* Die Migration enthält kein `DROP`, kein `ALTER TABLE`, kein `UPDATE`, kein
  `DELETE` — sie kann keine Daten verändern.
* Betroffener Datenbestand aktuell: `coach_users` **0 Zeilen**, `coach_shares`
  **0 Zeilen**, `coach_consents` **0 Zeilen**. Das PflegeCoach-Modul hat live
  noch keinen einzigen Nutzer — das Risikofenster ist damit auch fachlich null.

## 4. Backward Compatibility

**Ja, die App funktioniert ohne die Migration** — mit einer klar abgegrenzten
Ausnahme: Die Seite `/pflegecoach/einstellungen/freigaben` schlägt fehl, weil
`GET` und `POST` in `app/api/coach/freigaben/route.ts` die beiden RPCs
aufrufen (PostgREST antwortet `PGRST202`, Funktion nicht gefunden). Die Route
fängt den Fehler ab und liefert 500 bzw. 503 — kein Absturz, aber die Funktion
ist unbenutzbar. Jeder andere Teil der Anwendung ist unberührt.

## 5. Rollback

`supabase/migrations/20260916000001_rollback_coach_shares_email_funktionen.sql`:

```
DROP FUNCTION IF EXISTS coach_freigaben_liste();
DROP FUNCTION IF EXISTS coach_finde_nutzer_id(text);
```

Zu entfernen sind also **ausschließlich diese zwei Funktionen** — keine
Tabelle, keine Policy, kein Trigger, keine Daten. Da beide vor dem Apply nicht
existieren, stellt der Rollback exakt den Ausgangszustand her.

Real durchgespielt (Shadow-DB, in dieser Reihenfolge):

| Schritt | Ergebnis |
|---|---|
| Zweiter Apply derselben Migration (Idempotenz) | fehlerfrei |
| Rollback anwenden | fehlerfrei |
| Funktionen danach vorhanden? | 0 — sauber entfernt |
| Coach-Modul danach intakt? | 32 Policies / 11 Audit-Trigger / 19 Tabellen unverändert |
| Erneuter Apply nach Rollback | fehlerfrei |

## 6. Apply auf Production — nicht durchführbar

Alle drei möglichen Wege wurden geprüft, keiner steht zur Verfügung:

| Weg | Status | Beleg |
|---|---|---|
| Supabase-MCP (`apply_migration`/`execute_sql`) | **nicht verbunden** | `ToolSearch` findet keine Supabase-Tools; `list_connectors` liefert für „supabase/postgres/database" eine leere Liste |
| `scripts/apply-migration.mjs` (service_role über `_run_sql`) | **abgelehnt** | `HTTP 403 {"code":"42501","message":"permission denied for schema public"}`; gemessen: `current_user=service_role`, `has_schema_privilege('public','CREATE') = false` |
| Supabase-CLI (`supabase db push`) | **kein Login** | `LegacyPlatformAuthRequiredError — Access token not provided`; `~/.supabase/access-token` ist leer, kein `SUPABASE_ACCESS_TOKEN`, kein `DATABASE_URL` in `.env.local` |

Der fehlgeschlagene Apply-Versuch lief **transaktional** — an Production wurde
dabei nichts verändert (Nachkontrolle: `pg_proc` weiterhin ohne die beiden
Funktionen).

**Was konkret fehlt**, damit ein Agent das autonom einspielen kann — eines von
beiden genügt, beides ist eine Einmalsache:

1. **Ein Supabase Personal Access Token** in der Umgebung
   (`SUPABASE_ACCESS_TOKEN`) — danach läuft `supabase db push` und damit jede
   künftige Migration ohne Handarbeit.
2. **Ein `DATABASE_URL`** (Connection-String der Production-DB) in `.env.local`
   — `psql` ist lokal vorhanden, damit wäre der Apply-Weg sofort offen.

Beides erfordert ein Geheimnis aus dem Supabase-Dashboard, das ein Agent weder
erzeugen noch einsehen darf. Ohne eines von beiden bleibt der Apply der
Migration im Supabase-SQL-Editor der einzige Weg — der Dateiinhalt kann dort
unverändert eingefügt werden, er ist idempotent und ohne Datenrisiko.

## 7. Smoke-Tests

Die geforderten Smoke-Tests konnten mangels Live-Funktionen **nicht gegen
Production** laufen. Sie wurden stattdessen vollständig gegen eine aus dem
Repository aufgebaute Datenbank gefahren (`./scripts/shadow-db.sh reset`, 162
Migrationsdateien, darunter die zu prüfende) und liegen jetzt als dauerhafter
Regressionsschutz im Repo: **`supabase/shadow/70_coach_freigaben_tests.sql`**.

**23 von 23 Prüfungen bestanden:**

| # | Prüfung | Ergebnis |
|---|---|---|
| 1a | E-Mail-Lookup findet Empfänger, Groß-/Kleinschreibung egal | PASS |
| 1b | E-Mail ohne PflegeCoach-Konto → `NULL` | PASS |
| 2 | **Freigabe erstellen** — Zeile angelegt | PASS |
| 3a–3d | **Freigabe anzeigen** — genau 1 Zeile, korrekte E-Mail, korrekte Rolle, nicht widerrufen | PASS |
| 3e | Empfänger sieht die Freigabenliste des Eigentümers **nicht** | PASS |
| 4 | Vor Widerruf: Empfänger sieht die freigegebenen Assessments | PASS |
| 5a–5b | **Widerruf** — Zeitpunkt gesetzt, Zeile bleibt als Historie sichtbar | PASS |
| 6a–6c | **Nach Widerruf Zugriff wirklich blockiert** — Assessments, Ziele, Messwerte je 0 Zeilen | PASS |
| 7a–7c | **Audit-Log** — INSERT protokolliert, UPDATE protokolliert, `widerrufen_am` als geändertes Feld erfasst | PASS |
| 8a–8b | `anon` darf beide Funktionen **nicht** ausführen | PASS |
| 8c–8d | `authenticated` darf beide ausführen | PASS |
| 8e | Beide Funktionen sind `SECURITY DEFINER` mit fixem `search_path` | PASS |
| 9 | Reaktivierung einer widerrufenen Freigabe stellt den Zugriff wieder her | PASS |

Punkt 6 ist der fachlich wichtigste: Der Widerruf ist **nicht nur ein Flag** —
die RLS-Policies der Coach-Tabellen filtern auf `widerrufen_am IS NULL`, der
Datenzugriff des Empfängers endet damit sofort und messbar.

## 8. Offene Punkte

1. **Apply auf Production** — wartet auf Zugang (Abschnitt 6). Bis dahin ist
   `/pflegecoach/einstellungen/freigaben` live nicht benutzbar.
2. **Smoke-Test gegen Production** — nach dem Apply nachzuholen; das Skript aus
   Abschnitt 7 beschreibt die Kette Schritt für Schritt.
3. **Rate-Limit für `coach_finde_nutzer_id`** (Existenz-Orakel) — bekannt,
   dokumentiert, nicht Teil dieser Migration.
