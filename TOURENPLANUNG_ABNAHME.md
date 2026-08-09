# Tourenplanung — Abnahme-Report (Stand 09.08.2026)

**Status: Code fertig, lokal verifiziert. NICHT deployed, Migration NICHT auf Production** (auf Anweisung).

## Architektur-Entscheidung: Erweiterung, kein Neubau

Die Tabellen `einsatzplanung`/`calendar_assignments` existieren **nicht** — das bestehende
Modul heißt live `assignments` (+ RPC `get_calendar_assignments`, Doppelbelegungs-Trigger
`check_assignment_overlap`, UI `/admin/schedule` + `/admin/kalender`). Tourenplanung ist
eine **Schicht darüber**:

- `tours` — Tagesroute eines Mitarbeiters (Status GEPLANT→FREIGEGEBEN→UNTERWEGS→ABGESCHLOSSEN/STORNIERT)
- `tour_stops` — geordnete Halte, `assignment_id` → `assignments` (Doppelbelegungs-Wahrheit bleibt der bestehende Trigger)
- `tour_templates` — Wochen-Vorlagen (Stops als jsonb), materialisierbar per API

Wiederverwendet statt neu gebaut: `absences` (Vertretungsanlass), `client_preferred_substitutes`
(Kandidaten-Ranking), `angel_availability` (Zeitfenster-Warnung), `caregivers.wochenstunden_soll`
(Kapazität), `lib/plz-coords` + `lib/geo` (Fahrtzeit), `saveServiceRecord` (Leistungsnachweis),
`requireOpsAdmin` (Auth), Doppelbelegungs-Trigger (Konflikte).

## Gebaut

| Ebene | Artefakt |
|---|---|
| DB | `supabase/migrations/20260809120000_tourenplanung.sql` (+ Rollback `…120001`) |
| Logik | `lib/touren/fahrtzeit.ts` (PLZ-Haversine × 1,3 Umweg; 22/35/55 km/h-Stufen), `lib/touren/planung.ts` (Zeitplan-, Überlappungs-, Kapazitätsprüfung), `lib/touren/server.ts`, `lib/touren/select.ts` |
| API | `/api/tours` (GET/POST), `/api/tours/[id]` (GET/PATCH/DELETE=Storno), `/api/tours/[id]/stops` (POST/PATCH inkl. Reihenfolge+Status+Leistungsnachweis/DELETE), `/api/tours/[id]/vertretung` (GET Kandidaten/POST Übertragung), `/api/tours/templates` (+ `[id]/anwenden`) — alle admin-only, alle org-gescoped |
| UI | `/admin/tourenplanung` (Tages-Zeitslot-Raster 6–20 Uhr + Wochenansicht, Tour-Detail mit Stop-Status-Kette, Vertretungs-Dialog, Druckansicht via Print-CSS), Nav-Eintrag unter „Einsatzplanung" |
| Tests | `__tests__/touren/*` (22 Vitest), `scripts/verify-touren-rls.sql` (13 RLS-/E2E-Checks) |

Status-Kette pro Stop: `GEPLANT → UNTERWEGS → BEIM_KLIENTEN → ABGESCHLOSSEN` (bzw. `AUSGEFALLEN`);
Sync-Trigger spiegelt auf `assignments` (GESTARTET/BEENDET + Ist-Zeiten). Bei Stop-Abschluss
optional Leistungsnachweis-Entwurf (`saveServiceRecord`, mit `assignment_id` + `organization_id`).

## Testresultate (lokal)

- **Vitest**: 22 neue Tests grün; Gesamtsuite grün (exit 0).
- **tsc**: 0 Fehler in Touren-Dateien (voller Projektlauf, zweimal).
- **lint:forbidden**: 0 Treffer (23.191 Dateien, FULL).
- **`next build --webpack` lokal**: nach 87 Min ohne Fortschritt (keine `.next`-Artefakte) abgebrochen — bekannte lokale Schwäche, im Arbeitsverzeichnis liegen zudem uncommittete Fremd-Dateien der Parallel-Session. Der maßgebliche Build-Check ist der Vercel-Build beim (noch ausstehenden) Deploy; Typen sind über tsc abgedeckt.
- **Shadow-DB** (aus Repo gebaut, `scripts/shadow-db.sh`):
  - Migration angewendet, **idempotent** (Mehrfach-Apply ok), **Rollback-Roundtrip** getestet.
  - Trigger-Smoke-Test: Summenbildung, AUSGEFALLEN-Ausschluss, DELETE-Pfad, Status-Sync — alle grün.
  - **13/13 RLS-/Rollen-Checks PASS** (`scripts/verify-touren-rls.sql`): Engel nur eigene Tour/Stops (SELECT+UPDATE), kein INSERT, keine Vorlagen; Kunde nichts; anon nichts; Admin org-gescoped; Mandantenwechsel (JWT org_id) respektiert org_fence; Engel-E2E Stop→Assignment-Sync; Missbrauchsfall (Stop auf fremdes Assignment zeigen) wirkungslos dank INVOKER-Trigger.
- **Security-Review**: alle Routen `requireOpsAdmin`; jede Query org-gefiltert; Feld-Whitelists in allen PATCHes; Status-Whitelists; neue Funktionen `REVOKE anon` + explizite Grants (Default-Privileges-Falle); keine SECDEF-RPC mit org-Parameter; kein Roh-SQL.

## Zwei vorbestehende Bugs gefunden (Fix in der Migration enthalten)

1. **Leere Policy-Subquery**: `caregivers` hat keine Self-Read-Policy → `caregiver_id IN (SELECT … FROM caregivers WHERE user_id=auth.uid())` läuft für Engel leer (Engel sähe keine eigenen Einsätze). Fix: SECDEF-Helper `eigene_caregiver_ids()`/`eigene_client_ids()` (Muster wie `is_admin()`).
2. **Policy-Zyklus 42P17**: `assignments_engel_read` → clients ↔ `clients_caregiver_read` → assignments = „infinite recursion" bei jedem Engel-Read auf assignments. Die Migration ersetzt die beiden `assignments_engel_*`-Policies helper-basiert (gleiche Semantik, Zyklus gebrochen).

**Restbefund** (nicht angefasst, gleiche Falle): `sr_engel_own` (service_records) und `budget_res_own`
(budget_reservations) nutzen noch die alten Subquery-Muster.

## Offen (bewusst NICHT ausgeführt)

1. **Migration auf Production anwenden** — DDL ist aus dieser Umgebung ohnehin nicht möglich (`_run_sql` = INVOKER ohne CREATE auf public, 42501 live nachgewiesen; kein Supabase-MCP in der Session). Apply-Weg: Supabase-MCP-Session (`execute_sql`, Projekt `nnwyktkqibdjxgimjyuq`) oder SQL-Editor, Datei unverändert einspielen (kein BEGIN/COMMIT nötig, siehe Kopfkommentar). Danach: `scripts/verify-touren-rls.sql`-Logik greift live via RLS; API liefert bis dahin sauber „Tabellen fehlen" (42P01 übersetzt).
2. **Deploy** (`./deploy.sh`) — gestoppt auf Anweisung. Achtung beim späteren Deploy: im Arbeitsverzeichnis liegen fremde In-Flight-Änderungen einer Parallel-Session (Pflegecoach/Wunddoku, `components/ClientSideProviders.tsx` u. a.) — `git add -A` würde sie mitnehmen; vorher stashen oder auf Commit der Parallel-Session warten.
3. **Production-Verifikation** — folgt zwingend nach Apply+Deploy: Smoke (Tour anlegen/Vertretung/Druck), RLS-Stichprobe per Impersonation, `has_function_privilege`-Check der beiden neuen Helper.
