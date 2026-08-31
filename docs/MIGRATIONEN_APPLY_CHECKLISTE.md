# Migrationen anwenden — Checkliste für den Supabase-SQL-Editor

**Erzeugt:** 2026-08-31 · **Generiert von** `npm run gen:migrationen-checkliste`
· **Gemessen mit** `npm run check:migrationen`

> Diese Datei wird GENERIERT. Der SQL-Text stammt aus `supabase/migrations/*.sql`,
> die Verifikationsabfrage aus `scripts/lib/migrationen-katalog.mjs`. Nicht von Hand
> ändern — sonst driftet sie von den echten Migrationen ab, und genau das ist mit
> `docs/MIGRATION_LEDGER.md` schon passiert (an fünf Stellen, in beide Richtungen).

---

## Vorab — drei Dinge, die den Ablauf bestimmen

**1. Es muss der SQL-Editor sein, angemeldet als `postgres`.**
Über den Dienstschlüssel scheitert jedes DDL am Eigentümer (`42501`,
`must be owner of table …`). Bei Schritt 8 ist das besonders tückisch: ein `REVOKE`
ohne Eigentümerrecht meldet **HTTP 204, also Erfolg — ohne jede Wirkung**.

**2. Die Reihenfolge ist nach RISIKO geordnet, nicht nach Technik.**
Geprüft: keine der acht Migrationen setzt eine andere der acht voraus. Sie sind
technisch unabhängig. Die Ordnung folgt dem Schaden, den ein Abbruch in der Mitte
hinterließe — zuerst die drei Unveränderlichkeits-Riegel der Pflegeakte.

**3. Jeder Block ist in `BEGIN; … COMMIT;` geklammert.**
Nur `20261008000000` bringt eine eigene Transaktion mit; die anderen sieben nicht.
Ohne Klammer wäre ein Abbruch in der Mitte ein halb angewendeter Schritt. Kein
`CREATE INDEX CONCURRENTLY` in den acht Dateien — die Klammer ist also überall
zulässig (geprüft).

---

## Übersicht

| # | Migration | Risiko, solange sie fehlt | Was sie hinterlässt |
|---|---|---|---|
| 1 | `20261010000000_medikamente_abgesetzt_sperre_db` **[MEDIKAMENTE]** | HOCH | Funktion prevent_locked_medikament_edit() + Trigger trg_locked_medikament auf medikamente |
| 2 | `20261010000002_wund_kindtabellen_sperre_db` **[WUNDDOKUMENTATION]** | HOCH | Funktion prevent_wound_child_edit_when_healed() + die drei Trigger trg_locked_wound_assessment, trg_locked_wound_treatment, trg_locked_wound_photo |
| 3 | `20261010000004_pflege_verlauf_backdating_sperre_db` **[RUECKDATIERUNGS-SCHUTZ]** | HOCH | Funktion prevent_backdated_verlauf_insert() + Trigger trg_verlauf_periode_offen |
| 4 | `20261022000000_rk_lesepolicies_verwaltungsrollen` | MITTEL (Funktion, nicht Sicherheit) | die 24 Policies rk_<tabelle>_lesen |
| 5 | `20261008000000_vitalwerte_plausibilitaet_db_check` | MITTEL | die vier Funktionen vitals_plausibel_* |
| 6 | `20261009000000_pflege_massnahmenplaene_ein_aktiver_plan` | MITTEL | eindeutiger Index uq_pflege_massnahmenplaene_ein_aktiver_plan |
| 7 | `20261021000004_is_internal_staff_ohne_buero` | NIEDRIG heute — HOCH bei der naechsten CHECK-Erweiterung | is_internal_staff() nennt 'buero' nicht mehr |
| 8 | `20261021000002_secdef_trigger_revoke` | NIEDRIG | keine SECURITY-DEFINER-Triggerfunktion mehr fuer anon ausfuehrbar (erwartet: 0) |

Drei davon sind die Unveränderlichkeits- und Rückdatierungs-Riegel der Pflegeakte
und stehen deshalb ganz vorn: **Medikamente** (Schritt 1), **Wunddokumentation**
(Schritt 2), **Rückdatierungs-Schutz** (Schritt 3).

### Bestandslage — gemessen 2026-08-31, live

| Tabelle | Zeilen live | Betrifft |
|---|---|---|
| `medikamente` | **0** (davon 0 abgesetzt) | Schritt 1 |
| `wounds` | **0** (davon 0 abgeheilt) | Schritt 2 |
| `vital_signs` | **0** | Schritt 5 |
| `pflege_massnahmenplaene`, Klienten mit >1 aktivem Plan | **0** | Schritt 6 (Vorprüfung) |

Das ändert die Dringlichkeit nicht, aber es ändert das Anwendungsrisiko, und beides
gehört gesagt. **Kein bestehender Datensatz ist heute betroffen** — die drei
HOCH-Risiken sind vorausschauend, nicht akut: es gibt derzeit keine abgesetzte
Medikation und keine abgeheilte Wunde, die jemand nachträglich ändern könnte.

Umgekehrt heißt das: **jetzt ist der günstigste Zeitpunkt.** Alle vier Schritte
laufen gegen leere Tabellen — kein Bestandsverstoß, kein Backfill, keine fachliche
Klärung. Die Vorprüfung in Schritt 6 ist bereits gefahren und liefert 0 Zeilen.
Sobald der erste echte Pflegefall dokumentiert ist, ist beides nicht mehr wahr.

---

## Schritt 1 · `20261010000000_medikamente_abgesetzt_sperre_db`

> **MEDIKAMENTE** — einer der drei Riegel, die die Pflegeakte
> unveränderlich machen.

**Zweck.** Sperrt ein Medikament mit status='abgesetzt' auch DATENBANKSEITIG gegen inhaltliche Aenderung. Bisher verweigerte das nur lib/medikamente/medikamente.ts — wer an dem Modul vorbeischreibt (PostgREST, Dienstschluessel, Import), konnte Name, Wirkstoff, Dosierung und Einnahmezeiten eines abgesetzten Medikaments unveraendert durchschreiben.

**Risiko, solange sie fehlt: HOCH.** Solange sie fehlt, ist die Medikation eines abgesetzten Praeparats nachtraeglich aenderbar, ohne dass irgendetwas dagegenhaelt. Das ist der sicherheitskritischste der acht Punkte.

**Abhängigkeit.** Tabelle public.medikamente (20260806…). Keine der anderen sieben.

**Erwartet danach.** Funktion prevent_locked_medikament_edit() + Trigger trg_locked_medikament auf medikamente

**Rollback-Risiko.** GERING. Der Trigger schreibt nichts und aendert keine Zeile; ein DROP TRIGGER stellt den Zustand von vorher exakt wieder her. Die Migration ist idempotent (CREATE OR REPLACE).

Rollback-Datei: `supabase/migrations/20261010000001_rollback_medikamente_abgesetzt_sperre_db.sql`

### 1a · Anwenden

```sql
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Abgesetzte Medikamente auch DB-seitig gegen Bearbeitung sperren
-- Datum:     2026-10-10
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND: lib/medikamente/medikamente.ts:aktualisiereMedikament() verweigert
-- seit Commit df0d24e jede Bearbeitung eines Medikaments mit
-- status = 'abgesetzt' — aber nur, wenn der Schreibzugriff durch dieses
-- Modul laeuft. Die Tabelle medikamente hatte bislang GAR KEINEN Trigger.
-- Ein direkter PostgREST-/service_role-Zugriff unter Umgehung von
-- lib/medikamente/medikamente.ts konnte Name, Dosierung, Einnahmezeiten etc.
-- eines bereits abgesetzten Medikaments bislang unveraendert durchschreiben —
-- bei einem sicherheitskritischen Datensatz (Medikation) besonders riskant.
--
-- ABGRENZUNG ZU DEN ANDEREN SPERR-HAERTUNGEN (SIS/Anamnese):
-- setzeMedikamentStatus() darf ausdruecklich AUCH ein bereits abgesetztes
-- Medikament erneut auf 'abgesetzt' setzen (Korrektur von abgesetzt_grund/
-- -datum) — anders als bei SIS/Anamnese gibt es hier also einen legitimen
-- Schreibpfad, der NEW.status = OLD.status = 'abgesetzt' erzeugt. Der
-- Trigger blockt deshalb nicht jede Zeilenaenderung bei unveraendertem
-- Status, sondern gezielt nur die Aenderung der klinischen/administrativen
-- Felder (alles ausser status/abgesetzt_am/abgesetzt_grund/updated_at).
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION, keine Datenaenderung.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_locked_medikament_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'abgesetzt' AND NEW.status = 'abgesetzt' THEN
    IF NEW.medikament_name    IS DISTINCT FROM OLD.medikament_name
       OR NEW.wirkstoff       IS DISTINCT FROM OLD.wirkstoff
       OR NEW.pzn             IS DISTINCT FROM OLD.pzn
       OR NEW.kategorie       IS DISTINCT FROM OLD.kategorie
       OR NEW.darreichungsform IS DISTINCT FROM OLD.darreichungsform
       OR NEW.dosierung       IS DISTINCT FROM OLD.dosierung
       OR NEW.einheit         IS DISTINCT FROM OLD.einheit
       OR NEW.einnahme_morgens IS DISTINCT FROM OLD.einnahme_morgens
       OR NEW.einnahme_mittags IS DISTINCT FROM OLD.einnahme_mittags
       OR NEW.einnahme_abends  IS DISTINCT FROM OLD.einnahme_abends
       OR NEW.einnahme_nachts  IS DISTINCT FROM OLD.einnahme_nachts
       OR NEW.einnahme_hinweis IS DISTINCT FROM OLD.einnahme_hinweis
       OR NEW.verordnet_von   IS DISTINCT FROM OLD.verordnet_von
       OR NEW.beginn_datum    IS DISTINCT FROM OLD.beginn_datum
       OR NEW.end_datum       IS DISTINCT FROM OLD.end_datum
       OR NEW.dauermedikation IS DISTINCT FROM OLD.dauermedikation
       OR NEW.notizen         IS DISTINCT FROM OLD.notizen
    THEN
      RAISE EXCEPTION 'Abgesetztes Medikament kann nicht mehr bearbeitet werden.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_locked_medikament ON public.medikamente;
CREATE TRIGGER trg_locked_medikament BEFORE UPDATE ON public.medikamente
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_medikament_edit();

COMMENT ON FUNCTION prevent_locked_medikament_edit() IS
  'Blockt Aenderungen an klinischen/administrativen Feldern eines abgesetzten Medikaments. '
  'Erlaubt bleibt: Reaktivierung/Pausierung (status aendert sich) sowie die Korrektur von '
  'abgesetzt_am/abgesetzt_grund bei unveraendertem Status (setzeMedikamentStatus).';

COMMIT;
```

### 1b · Verifikation — beweist, dass es live steht

Erwartet: **1** genau — geprüft wird 
Trigger trg_locked_medikament auf medikamente.

```sql
SELECT count(*) FROM pg_trigger WHERE tgname='trg_locked_medikament';
```

---

## Schritt 2 · `20261010000002_wund_kindtabellen_sperre_db`

> **WUNDDOKUMENTATION** — einer der drei Riegel, die die Pflegeakte
> unveränderlich machen.

**Zweck.** Verhindert neue Verlaufsdaten (Assessment, Verbandwechsel, Foto) zu einer Wunde, die bereits als 'abgeheilt' markiert ist — datenbankseitig. Die drei Kindtabellen hatten bisher gar keinen Trigger; die Pruefung lag allein in lib/wunden/*.ts, und der Aufrufer musste den Wundstatus selbst mitgeben.

**Risiko, solange sie fehlt: HOCH.** Eine abgeschlossene Wunddokumentation ist nachtraeglich erweiterbar. Bei einer Pflegeakte ist genau das der Punkt, an dem Dokumentation ihren Beweiswert verliert.

**Abhängigkeit.** Tabellen wounds, wound_assessments, wound_treatments, wound_photos. Keine der anderen sieben.

**Erwartet danach.** Funktion prevent_wound_child_edit_when_healed() + die drei Trigger trg_locked_wound_assessment, trg_locked_wound_treatment, trg_locked_wound_photo

**Rollback-Risiko.** GERING. Reine Trigger, keine Datenaenderung. DROP TRIGGER stellt den Vorzustand her.

Rollback-Datei: `supabase/migrations/20261010000003_rollback_wund_kindtabellen_sperre_db.sql`

### 2a · Anwenden

```sql
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Neue Wund-Verlaufsdaten bei abgeheilter Wunde auch DB-seitig sperren
-- Datum:     2026-10-10
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND: lib/wunden/{assessments,behandlungen,fotos}.ts verweigern seit
-- Commit 2a3ebb2 das Anlegen eines neuen Assessments/Verbandwechsels/Fotos
-- für eine bereits als 'abgeheilt' markierte Wunde — aber nur, wenn der
-- Schreibzugriff durch diese Module läuft (der Aufrufer übergibt den
-- Wund-Status als Parameter, den die Route vorher selbst nachschlägt).
-- Die Tabellen wound_assessments/wound_treatments/wound_photos hatten
-- bislang KEINEN Trigger, der das auf DB-Ebene erzwingt. Ein direkter
-- PostgREST-/service_role-Zugriff unter Umgehung dieser Module konnte
-- bislang unveraendert neue Verlaufsdaten fuer eine abgeheilte Wunde anlegen.
-- Analog zu prevent_locked_sis_child_edit() (20260818010000).
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION, keine Datenaenderung.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_wound_child_edit_when_healed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_wound_id uuid;
  v_status   text;
BEGIN
  v_wound_id := COALESCE(NEW.wound_id, OLD.wound_id);
  SELECT status INTO v_status FROM wounds WHERE id = v_wound_id;

  IF v_status = 'abgeheilt' THEN
    RAISE EXCEPTION 'Wunde ist als abgeheilt markiert — keine neuen Verlaufsdaten mehr möglich.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_locked_wound_assessment ON public.wound_assessments;
CREATE TRIGGER trg_locked_wound_assessment
  BEFORE INSERT OR UPDATE OR DELETE ON public.wound_assessments
  FOR EACH ROW EXECUTE FUNCTION prevent_wound_child_edit_when_healed();

DROP TRIGGER IF EXISTS trg_locked_wound_treatment ON public.wound_treatments;
CREATE TRIGGER trg_locked_wound_treatment
  BEFORE INSERT OR UPDATE OR DELETE ON public.wound_treatments
  FOR EACH ROW EXECUTE FUNCTION prevent_wound_child_edit_when_healed();

DROP TRIGGER IF EXISTS trg_locked_wound_photo ON public.wound_photos;
CREATE TRIGGER trg_locked_wound_photo
  BEFORE INSERT OR UPDATE OR DELETE ON public.wound_photos
  FOR EACH ROW EXECUTE FUNCTION prevent_wound_child_edit_when_healed();

COMMENT ON FUNCTION prevent_wound_child_edit_when_healed() IS
  'Blockt INSERT/UPDATE/DELETE auf wound_assessments/wound_treatments/wound_photos, '
  'sobald die zugehörige Wunde status=abgeheilt hat. Reaktivierung der Wunde '
  '(status zurück auf aktiv/in_abheilung/...) macht die Kindzeilen wieder beschreibbar.';

COMMIT;
```

### 2b · Verifikation — beweist, dass es live steht

Erwartet: **3** genau — geprüft wird 
die drei Trigger trg_locked_wound_*.

```sql
SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_locked_wound_assessment','trg_locked_wound_treatment','trg_locked_wound_photo');
```

---

## Schritt 3 · `20261010000004_pflege_verlauf_backdating_sperre_db`

> **RUECKDATIERUNGS-SCHUTZ** — einer der drei Riegel, die die Pflegeakte
> unveränderlich machen.

**Zweck.** Weist einen neuen Verlaufseintrag ab, dessen Eintragsdatum in eine bereits ABGESCHLOSSENE Dokumentationsperiode faellt. Der bestehende Trigger trg_locked_verlauf blockt nur UPDATEs auf gesperrten Zeilen — das rueckwirkende INSERT eines neuen, unversperrten Eintrags war offen.

**Risiko, solange sie fehlt: HOCH.** Rueckdatierung in einen abgeschlossenen Monat. Betrifft unmittelbar die Beweiskraft der Pflegedokumentation gegenueber Kostentraeger und Pruefinstanz.

**Abhängigkeit.** Tabellen pflege_verlauf und pflege_doku_perioden. Keine der anderen sieben.

**Erwartet danach.** Funktion prevent_backdated_verlauf_insert() + Trigger trg_verlauf_periode_offen

**Rollback-Risiko.** GERING, mit einer Einschraenkung im WIRKUNGSUMFANG (nicht im Rollback): der Trigger laeuft als SECURITY INVOKER, und pflege_doku_perioden ist per RLS nur fuer admin/superadmin lesbar. Fuer einen RLS-gebundenen Engel-Insert liefert die interne Abfrage daher leer und die Pruefung greift nicht. Fuer den Dienstschluessel-Insert — den eigentlichen Befund — greift sie. Das ist in der Migration dokumentiert und kein Fehler des Rollbacks.

Rollback-Datei: `supabase/migrations/20261010000005_rollback_pflege_verlauf_backdating_sperre_db.sql`

### 3a · Anwenden

```sql
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Rückwirkendes Anlegen von Verlaufseinträgen auch DB-seitig sperren
-- Datum:     2026-10-10
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND: trg_locked_verlauf (20260810010000) blockt nur UPDATEs auf bereits
-- gesperrt=true-Zeilen. lib/pflege/verlauf.ts:createVerlauf() prüft seit
-- Commit c9d403e zusätzlich beim INSERT, ob für den Monat des
-- Eintragsdatums bereits eine abgeschlossene pflege_doku_periode existiert —
-- aber nur, wenn der Schreibzugriff durch dieses Modul läuft. Ein direkter
-- PostgREST-/service_role-Zugriff unter Umgehung von lib/pflege/verlauf.ts
-- konnte bislang rückwirkend einen neuen, unversperrten Eintrag in eine
-- bereits abgeschlossene Dokumentationsperiode einfügen.
--
-- HINWEIS ZUR REICHWEITE: pflege_doku_perioden ist per RLS nur für
-- admin/superadmin lesbar (org_fence_pflege_doku_perioden +
-- admin_pflege_doku_perioden). Der Trigger läuft als SECURITY INVOKER —
-- für einen RLS-gebundenen Engel-Insert (current_org_id()-Default) liefert
-- die interne Abfrage daher leer und die Prüfung greift nicht (dieselbe
-- Einschränkung wie in lib/pflege/verlauf.ts dokumentiert). Für einen
-- service_role-Insert (BYPASSRLS) — der eigentliche Befund — greift sie.
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION, keine Datenaenderung.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_backdated_verlauf_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_utc    timestamp;
BEGIN
  v_utc := NEW.eintrag_datum AT TIME ZONE 'UTC';

  SELECT status INTO v_status
    FROM pflege_doku_perioden
   WHERE client_id = NEW.client_id
     AND organization_id = NEW.organization_id
     AND jahr  = EXTRACT(YEAR  FROM v_utc)::int
     AND monat = EXTRACT(MONTH FROM v_utc)::int;

  IF v_status = 'abgeschlossen' THEN
    RAISE EXCEPTION 'Die Dokumentationsperiode für diesen Zeitpunkt ist abgeschlossen — bitte zuerst wiedereröffnen.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verlauf_periode_offen ON public.pflege_verlauf;
CREATE TRIGGER trg_verlauf_periode_offen
  BEFORE INSERT ON public.pflege_verlauf
  FOR EACH ROW EXECUTE FUNCTION prevent_backdated_verlauf_insert();

COMMENT ON FUNCTION prevent_backdated_verlauf_insert() IS
  'Blockt INSERT auf pflege_verlauf, wenn für Klient+Monat des Eintragsdatums '
  'bereits eine abgeschlossene pflege_doku_periode existiert. Ergänzt '
  'trg_locked_verlauf (blockt nur UPDATE auf gesperrte Zeilen).';

COMMIT;
```

### 3b · Verifikation — beweist, dass es live steht

Erwartet: **1** genau — geprüft wird 
Trigger trg_verlauf_periode_offen.

```sql
SELECT count(*) FROM pg_trigger WHERE tgname='trg_verlauf_periode_offen';
```

---

## Schritt 4 · `20261022000000_rk_lesepolicies_verwaltungsrollen`

**Zweck.** 24 Lesepolicies rk_<tabelle>_lesen, je FOR SELECT TO authenticated mit darf('<recht>') AND organization_id = current_org_id(). Ohne sie liefern 48 Seite/Rolle-Paare den Rollen pdl, qm und buchhaltung null Zeilen — nicht wegen einer Sperre, sondern weil keine Policy dort eine Berechtigung auswertet.

**Risiko, solange sie fehlt: MITTEL (Funktion, nicht Sicherheit).** Kein Sicherheitsrisiko — die Wirkung ist zu STRENG, nicht zu locker. Aber drei Rollen sehen live leere Seiten, wo sie arbeiten sollen. Das ist der groesste Funktionsblocker der acht.

**Abhängigkeit.** rollen_matrix() muss die verwendeten Rechte kennen (bonus.verwalten, sicherheit.lesen, marketing.verwalten — alle drei stehen live) sowie darf() und current_org_id(). Keine der anderen sieben.

**Erwartet danach.** die 24 Policies rk_<tabelle>_lesen

**Rollback-Risiko.** GERING. Nur Policies, keine Datenaenderung. Ein DROP POLICY nimmt Sicht weg, gibt aber nie welche dazu — ein Rollback kann hier also nichts oeffnen.

Rollback-Datei: `supabase/migrations/20261022000001_rollback_rk_lesepolicies_verwaltungsrollen.sql`

### 4a · Anwenden

```sql
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Lesepolicies fuer die Verwaltungsrollen (pdl, qm, buchhaltung)
--
-- BEFUND (npm run lint:rls-sicht, 31.08.2026)
--
-- 48 Seite/Rolle-Paare ueber 25 Tabellen sehen unter RLS NICHTS. Nicht,
-- weil eine Sperre greift, sondern weil auf diesen Tabellen ueberhaupt
-- keine Policy steht, die eine BERECHTIGUNG auswertet. Live gibt es dort
-- genau zwei Wege:
--
--   is_admin()           → admin, superadmin
--   is_internal_staff()  → admin, superadmin, pdl
--
-- Wer nicht Administration ist, faellt durch — und zwar lautlos. Die Seite
-- ist ueber BEREICHE freigegeben, der Guard laesst die Rolle durch, die
-- Abfrage laeuft ohne Fehler und liefert null Zeilen. /admin/nachweise
-- sagte der Pflegedienstleitung damit 'keine Nachweise vorhanden',
-- waehrend Fuehrungszeugnisse abliefen.
--
-- Das ist kein Datenleck — es wird zu WENIG gezeigt, nicht zu viel. Es ist
-- eine stille Falschaussage, und sie ist gefaehrlicher als eine Fehler-
-- meldung, weil niemand sie bemerkt.
--
-- ── WAS DIESE MIGRATION TUT ───────────────────────────────────────────────
--
-- Sie legt je Tabelle EINE permissive SELECT-Policy `rk_<tabelle>_lesen`
-- an, nach immer demselben Muster:
--
--   FOR SELECT TO authenticated
--   USING (public.darf('<bereich>.lesen')
--          AND organization_id = public.current_org_id())
--
-- Vier Eigenschaften, jede mit Absicht:
--
--   1. FOR SELECT — nicht FOR ALL. Eine FOR-ALL-Policy waere permissiv mit
--      den bestehenden ODER-verknuepft und haette nebenbei Schreibrechte
--      eroeffnet (Befund 'FOR-ALL-Policy hebt engere auf': sr_engel_own
--      machte so eine Statussperre wirkungslos).
--   2. TO authenticated — anon wertet den Ausdruck gar nicht erst aus.
--   3. organization_id = current_org_id() — obwohl auf jeder dieser
--      Tabellen bereits ein RESTRICTIVE org_fence steht. Doppelt, weil
--      current_org_id() fail-open ist (wer in keiner organization_members
--      -Zeile steht, landet in der Stamm-Org) und weil eine Policy
--      lesbar bleiben soll, ohne dass man die zweite kennen muss.
--   4. darf('…') statt einer Rollenliste — die Matrix steht in
--      lib/auth/rollen.ts und in public.rollen_matrix(); eine dritte
--      Liste hier waere die naechste Quelle, die auseinanderlaeuft
--      (siehe Befund F1 zu is_internal_staff()).
--
-- ── WAS SIE NICHT TUT ─────────────────────────────────────────────────────
--
-- Keine Tabelle wird pauschal geoeffnet. Fuer jede steht unten, WELCHES
-- Recht sie traegt und warum. Drei Entscheidungen fallen bewusst
-- restriktiv aus und lassen damit Seiten weiter leer:
--
--   verordnungen / verordnung_leistungen → pflege.lesen
--       `verordnungen.diagnose` ist ein Gesundheitsdatum. Die Buchhaltung
--       bekommt es nicht, obwohl /admin/abrechnung die Tabelle liest.
--   care_notes → pflege.lesen
--       haengt ueber verlauf_id/massnahme_id am Pflegeprozess.
--   absences → personal.lesen
--       `grund` traegt Krankheit — Gesundheitsdatum der Mitarbeitenden.
--   caregiver_bonuses → bonus.verwalten
--       Verguetung ist Vorbehalt der Administration.
--
-- Diese vier bleiben fuer die jeweils betroffene Rolle blind — das ist
-- die richtige Antwort. Damit die Seite es SAGT statt es zu verschweigen,
-- traegt derselbe Stand die passenden `zusatzRechte` in lib/auth/bereiche.ts
-- nach.
--
-- `documents` steht bewusst NICHT in dieser Liste: der einzige Befund dort
-- (/admin/sepa) war ein Fehlbefund des Linters — die Seite spricht
-- `supabase.storage.from('documents')` an, den Speicher-Eimer, nicht die
-- Tabelle. Die Tabelle fuehrt live Fuehrungszeugnisse und Ausweise; sie
-- bleibt bei is_admin() plus Eigene-Zeilen-Pfad.
--
-- ── ANWENDEN ──────────────────────────────────────────────────────────────
-- Im Supabase-SQL-Editor als `postgres`. Ueber den Dienstschluessel
-- scheitert CREATE POLICY am Eigentuemer:
--   ERROR: must be owner of table absences (42501)  ← am 31.08.2026 geprueft
-- Danach:  npm run lint:rls-sicht     → Abschnitt A muss auf 0 stehen
--          npm run audit:rls-rollen   → A-pdl / A-qm / A-buchhaltung weg
-- ═══════════════════════════════════════════════════════════════════════════

-- ── absences → personal.lesen ─────────────────────────────
--   Abwesenheiten der Pflegekraefte. `grund` traegt Krankheit — ein
--   Gesundheitsdatum der MITARBEITENDEN. Deshalb personal.lesen und nicht
--   einsatz.lesen: die Buchhaltung plant keine Ausfaelle und braucht den
--   Krankheitsgrund einer Kollegin nie.
DROP POLICY IF EXISTS rk_absences_lesen ON public.absences;
CREATE POLICY rk_absences_lesen ON public.absences
  FOR SELECT TO authenticated
  USING (public.darf('personal.lesen') AND organization_id = public.current_org_id());

-- ── applications → personal.lesen ─────────────────────────────
--   Bewerbungen. Personalgewinnung — dieselbe Akte wie das spaetere
--   Arbeitsverhaeltnis, nur frueher.
DROP POLICY IF EXISTS rk_applications_lesen ON public.applications;
CREATE POLICY rk_applications_lesen ON public.applications
  FOR SELECT TO authenticated
  USING (public.darf('personal.lesen') AND organization_id = public.current_org_id());

-- ── bookings → einsatz.lesen ─────────────────────────────
--   Termine der Kundschaft. Das Einsatzgeschehen selbst; pdl, qm und
--   buchhaltung tragen einsatz.lesen alle drei.
DROP POLICY IF EXISTS rk_bookings_lesen ON public.bookings;
CREATE POLICY rk_bookings_lesen ON public.bookings
  FOR SELECT TO authenticated
  USING (public.darf('einsatz.lesen') AND organization_id = public.current_org_id());

-- ── care_notes → pflege.lesen ─────────────────────────────
--   Pflegenotizen. Die Tabelle traegt verlauf_id und massnahme_id — sie
--   haengt am Pflegeprozess und kann Gesundheitsangaben zum Klienten
--   enthalten. NICHT stammdaten.lesen (das haette die Buchhaltung
--   eingeschlossen, der lib/auth/rollen.ts ausdruecklich keine
--   Gesundheitsdaten zugesteht).
DROP POLICY IF EXISTS rk_care_notes_lesen ON public.care_notes;
CREATE POLICY rk_care_notes_lesen ON public.care_notes
  FOR SELECT TO authenticated
  USING (public.darf('pflege.lesen') AND organization_id = public.current_org_id());

-- ── caregiver_bonuses → bonus.verwalten ─────────────────────────────
--   Verguetung, nicht Personalstammdatum. Der Vorbehalt steht schon in
--   BEREICHE ('/admin/bonuses' → bonus.verwalten) und in
--   NUR_ADMINISTRATION. Die Policy AENDERT NICHTS an der Sichtbarkeit
--   (bonus.verwalten haben nur admin und superadmin, genau wie
--   is_admin()); sie schreibt die Entscheidung nur dorthin, wo sie
--   gelesen wird — in die Datenbank. Vorher stand dort keine, und
--   'niemand hat es entschieden' sah aus wie 'niemand darf'.
DROP POLICY IF EXISTS rk_caregiver_bonuses_lesen ON public.caregiver_bonuses;
CREATE POLICY rk_caregiver_bonuses_lesen ON public.caregiver_bonuses
  FOR SELECT TO authenticated
  USING (public.darf('bonus.verwalten') AND organization_id = public.current_org_id());

-- ── caregiver_documents → personal.lesen ─────────────────────────────
--   Personalakte: Fuehrungszeugnis, Vertraege, Nachweise — genau das, was
--   lib/auth/rollen.ts der Buchhaltung ausdruecklich verwehrt.
DROP POLICY IF EXISTS rk_caregiver_documents_lesen ON public.caregiver_documents;
CREATE POLICY rk_caregiver_documents_lesen ON public.caregiver_documents
  FOR SELECT TO authenticated
  USING (public.darf('personal.lesen') AND organization_id = public.current_org_id());

-- ── caregiver_initials_history → personal.lesen ─────────────────────────────
--   Handzeichen-Historie der Mitarbeitenden; Teil der Personalakte und
--   Grundlage jeder Unterschriftszuordnung.
DROP POLICY IF EXISTS rk_caregiver_initials_history_lesen ON public.caregiver_initials_history;
CREATE POLICY rk_caregiver_initials_history_lesen ON public.caregiver_initials_history
  FOR SELECT TO authenticated
  USING (public.darf('personal.lesen') AND organization_id = public.current_org_id());

-- ── caregiver_qualifications → personal.lesen ─────────────────────────────
--   Qualifikationsnachweise. Der Ursprungsbefund vom 29.08.2026:
--   /admin/nachweise zeigte der Pflegedienstleitung 'keine Nachweise
--   vorhanden', obwohl Fuehrungszeugnisse abliefen.
DROP POLICY IF EXISTS rk_caregiver_qualifications_lesen ON public.caregiver_qualifications;
CREATE POLICY rk_caregiver_qualifications_lesen ON public.caregiver_qualifications
  FOR SELECT TO authenticated
  USING (public.darf('personal.lesen') AND organization_id = public.current_org_id());

-- ── client_preferred_substitutes → einsatz.lesen ─────────────────────────────
--   Wunsch-Vertretungen je Klient. Reine Einsatzplanung — weder
--   Gesundheits- noch Personalakte.
DROP POLICY IF EXISTS rk_client_preferred_substitutes_lesen ON public.client_preferred_substitutes;
CREATE POLICY rk_client_preferred_substitutes_lesen ON public.client_preferred_substitutes
  FOR SELECT TO authenticated
  USING (public.darf('einsatz.lesen') AND organization_id = public.current_org_id());

-- ── cooperation_partners → stammdaten.lesen ─────────────────────────────
--   Kooperationspartner — Stammdaten des Umfelds, keine Gesundheits-
--   und keine Personaldaten.
DROP POLICY IF EXISTS rk_cooperation_partners_lesen ON public.cooperation_partners;
CREATE POLICY rk_cooperation_partners_lesen ON public.cooperation_partners
  FOR SELECT TO authenticated
  USING (public.darf('stammdaten.lesen') AND organization_id = public.current_org_id());

-- ── datenannahmestellen → abrechnung.lesen ─────────────────────────────
--   DTA-Datenannahmestellen. Abrechnungsstammdaten; die Zeilen ohne
--   organization_id sind bundesweite Vorgaben und werden vom Fence
--   ausdruecklich durchgelassen — die Policy bildet das nach.
DROP POLICY IF EXISTS rk_datenannahmestellen_lesen ON public.datenannahmestellen;
CREATE POLICY rk_datenannahmestellen_lesen ON public.datenannahmestellen
  FOR SELECT TO authenticated
  USING (public.darf('abrechnung.lesen') AND (organization_id IS NULL OR organization_id = public.current_org_id()));

-- ── dta_dakota_auftraege → abrechnung.lesen ─────────────────────────────
--   DTA-Auftraege an die Kostentraeger — der Versandvorgang der
--   Kassenabrechnung. Gehoert zur Abrechnung und zu nichts sonst.
DROP POLICY IF EXISTS rk_dta_dakota_auftraege_lesen ON public.dta_dakota_auftraege;
CREATE POLICY rk_dta_dakota_auftraege_lesen ON public.dta_dakota_auftraege
  FOR SELECT TO authenticated
  USING (public.darf('abrechnung.lesen') AND organization_id = public.current_org_id());

-- ── einsatz_absagen → einsatz.lesen ─────────────────────────────
--   Abgesagte Einsaetze samt Ersatzsuche. Einsatzgeschehen; die
--   Buchhaltung braucht es fuer nicht erbrachte Leistungen.
DROP POLICY IF EXISTS rk_einsatz_absagen_lesen ON public.einsatz_absagen;
CREATE POLICY rk_einsatz_absagen_lesen ON public.einsatz_absagen
  FOR SELECT TO authenticated
  USING (public.darf('einsatz.lesen') AND organization_id = public.current_org_id());

-- ── kostentraeger_kontakte → stammdaten.lesen ─────────────────────────────
--   Ansprechpersonen bei Kassen und Kostentraegern — Kontaktstammdaten des
--   Umfelds, keine Gesundheits- und keine Personaldaten.
DROP POLICY IF EXISTS rk_kostentraeger_kontakte_lesen ON public.kostentraeger_kontakte;
CREATE POLICY rk_kostentraeger_kontakte_lesen ON public.kostentraeger_kontakte
  FOR SELECT TO authenticated
  USING (public.darf('stammdaten.lesen') AND organization_id = public.current_org_id());

-- ── monthly_closings → abrechnung.lesen ─────────────────────────────
--   Monatsabschluesse je Klient — die Rechnungsgrundlage und damit
--   Gegenstand der Abrechnung.
DROP POLICY IF EXISTS rk_monthly_closings_lesen ON public.monthly_closings;
CREATE POLICY rk_monthly_closings_lesen ON public.monthly_closings
  FOR SELECT TO authenticated
  USING (public.darf('abrechnung.lesen') AND organization_id = public.current_org_id());

-- ── ocr_results → einsatz.lesen ─────────────────────────────
--   Texterkennung eingescannter Leistungsnachweise. Der Nachweis ist
--   Einsatzgeschehen; qm prueft ihn, die Buchhaltung rechnet ihn ab.
DROP POLICY IF EXISTS rk_ocr_results_lesen ON public.ocr_results;
CREATE POLICY rk_ocr_results_lesen ON public.ocr_results
  FOR SELECT TO authenticated
  USING (public.darf('einsatz.lesen') AND organization_id = public.current_org_id());

-- ── partner_visits → stammdaten.lesen ─────────────────────────────
--   Besuche bei Kooperationspartnern. Gehoert sachlich zu
--   cooperation_partners und traegt deshalb dasselbe Recht.
DROP POLICY IF EXISTS rk_partner_visits_lesen ON public.partner_visits;
CREATE POLICY rk_partner_visits_lesen ON public.partner_visits
  FOR SELECT TO authenticated
  USING (public.darf('stammdaten.lesen') AND organization_id = public.current_org_id());

-- ── payment_allocations → abrechnung.lesen ─────────────────────────────
--   Zuordnung von Zahlungen zu Rechnungen; ohne sie ist kein offener Posten
--   nachvollziehbar.
DROP POLICY IF EXISTS rk_payment_allocations_lesen ON public.payment_allocations;
CREATE POLICY rk_payment_allocations_lesen ON public.payment_allocations
  FOR SELECT TO authenticated
  USING (public.darf('abrechnung.lesen') AND organization_id = public.current_org_id());

-- ── payment_status → abrechnung.lesen ─────────────────────────────
--   Zahlungsstand je Rechnung — die Sicht der Buchhaltung auf offene Posten.
DROP POLICY IF EXISTS rk_payment_status_lesen ON public.payment_status;
CREATE POLICY rk_payment_status_lesen ON public.payment_status
  FOR SELECT TO authenticated
  USING (public.darf('abrechnung.lesen') AND organization_id = public.current_org_id());

-- ── review_errors → einsatz.lesen ─────────────────────────────
--   Prueffehler am Leistungsnachweis (haengen an service_record_id und
--   ocr_result_id). Drei Seiten lesen sie aus drei Bereichen — QM-
--   Pruefprotokoll, Monatsabschluss, Nachweis-Upload. einsatz.lesen ist
--   das Recht, das alle drei Rollen tragen, und zugleich das, dem der
--   Gegenstand gehoert: der Nachweis.
DROP POLICY IF EXISTS rk_review_errors_lesen ON public.review_errors;
CREATE POLICY rk_review_errors_lesen ON public.review_errors
  FOR SELECT TO authenticated
  USING (public.darf('einsatz.lesen') AND organization_id = public.current_org_id());

-- ── state_settings → einsatz.lesen ─────────────────────────────
--   Bundeslandfreischaltung. /admin/kalender liest daraus die
--   Bundeslaender fuer die Feiertage. Schreiben bleibt bei is_admin();
--   diese Policy gilt ausschliesslich fuer SELECT.
DROP POLICY IF EXISTS rk_state_settings_lesen ON public.state_settings;
CREATE POLICY rk_state_settings_lesen ON public.state_settings
  FOR SELECT TO authenticated
  USING (public.darf('einsatz.lesen') AND organization_id = public.current_org_id());

-- ── substitution_requests → einsatz.lesen ─────────────────────────────
--   Vertretungsanfragen im Dienstplan — Teil der laufenden Einsatzplanung.
DROP POLICY IF EXISTS rk_substitution_requests_lesen ON public.substitution_requests;
CREATE POLICY rk_substitution_requests_lesen ON public.substitution_requests
  FOR SELECT TO authenticated
  USING (public.darf('einsatz.lesen') AND organization_id = public.current_org_id());

-- ── verordnung_leistungen → pflege.lesen ─────────────────────────────
--   Positionen einer aerztlichen Verordnung. Teilt das Schicksal der
--   Verordnung selbst und damit deren Recht.
DROP POLICY IF EXISTS rk_verordnung_leistungen_lesen ON public.verordnung_leistungen;
CREATE POLICY rk_verordnung_leistungen_lesen ON public.verordnung_leistungen
  FOR SELECT TO authenticated
  USING (public.darf('pflege.lesen') AND organization_id = public.current_org_id());

-- ── verordnungen → pflege.lesen ─────────────────────────────
--   Aerztliche Verordnungen. Die Tabelle fuehrt eine Spalte `diagnose` —
--   ein Gesundheitsdatum. Deshalb pflege.lesen, obwohl /admin/abrechnung
--   sie ebenfalls liest: die Buchhaltung bekommt hier bewusst NICHTS.
--   Braucht die Abrechnung die Genehmigungsdaten, gehoert dafuer eine
--   Route her, die nur die abrechnungsrelevanten Spalten herausgibt —
--   RLS kann keine Spalten ausblenden.
DROP POLICY IF EXISTS rk_verordnungen_lesen ON public.verordnungen;
CREATE POLICY rk_verordnungen_lesen ON public.verordnungen
  FOR SELECT TO authenticated
  USING (public.darf('pflege.lesen') AND organization_id = public.current_org_id());

COMMIT;
```

### 4b · Verifikation — beweist, dass es live steht

Erwartet: **24** genau — geprüft wird 
die 24 Lesepolicies rk_<tabelle>_lesen.

```sql
SELECT count(*) FROM pg_policies WHERE schemaname='public'
            AND policyname LIKE 'rk\_%\_lesen' AND cmd='SELECT'
            AND qual LIKE '%current_org_id()%'
            AND tablename IN ('absences','applications','bookings','care_notes','caregiver_bonuses',
              'caregiver_documents','caregiver_initials_history','caregiver_qualifications',
              'client_preferred_substitutes','cooperation_partners','datenannahmestellen',
              'dta_dakota_auftraege','einsatz_absagen','kostentraeger_kontakte','monthly_closings',
              'ocr_results','partner_visits','payment_allocations','payment_status','review_errors',
              'state_settings','substitution_requests','verordnung_leistungen','verordnungen');
```

---

## Schritt 5 · `20261008000000_vitalwerte_plausibilitaet_db_check`

**Zweck.** Legt vier Funktionen vitals_plausibel_min/max/_sekundaer an und setzt die CHECKs auf vital_signs typabhaengig neu. Bisher steht dort nur value >= 0 — ein Blutdruck von 4000 oder ein Puls von 0,5 wird von der Datenbank angenommen, sobald ein Schreibweg an validierePlausibilitaet() vorbeikommt.

**Risiko, solange sie fehlt: MITTEL.** Datenqualitaet, nicht Sicherheit. Die Plausibilitaetsgrenzen leben sonst nur in TypeScript.

**Abhängigkeit.** 20260818010100_vitalwerte.sql (steht live). Keine der anderen sieben.

**Erwartet danach.** die vier Funktionen vitals_plausibel_*

**Rollback-Risiko.** GERING, aber die EINZIGE der acht mit einem Bestandsvorbehalt: die CHECKs werden NOT VALID angelegt und danach validiert. Ein Bestandsverstoss bricht die Migration NICHT ab, sondern meldet sich als WARNING — kein stiller Durchlauf, aber auch kein Abbruch. Wenn eine WARNING erscheint, bitte den Text mitschicken: dann stehen unplausible Werte im Bestand, und die sind fachlich zu klaeren.

Rollback-Datei: `supabase/migrations/20261008000001_rollback_vitalwerte_plausibilitaet_db_check.sql`

### 5a · Anwenden

```sql
-- Diese Datei bringt BEGIN/COMMIT selbst mit — nicht zusätzlich klammern.
-- ═══════════════════════════════════════════════════════════════════════
-- Vitalwerte — Plausibilitätsbereiche als DB-CHECK (zweite Verteidigungslinie)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Sicherheitsdurchsicht Vitalwerte-Modul (analog Medikamente/Akten). Zwei
-- Lücken, beide an derselben Stelle: der bisherige CHECK auf vital_signs
-- prüfte nur value >= 0 — ein Puls von 5000 bpm oder eine Sauerstoff-
-- sättigung von 300 % wären in der Datenbank durchgekommen, sobald ein
-- Schreibpfad an der API-seitigen Prüfung (lib/vitals/vitals.ts,
-- validierePlausibilitaet) vorbeikommt — etwa ein künftiger Batch-Import,
-- ein Backfill-Skript mit service_role, oder ein Bug in einem neuen
-- Aufrufer. Die App-Validierung ist die erste Linie; ohne einen
-- gleichwertigen DB-Constraint ist sie die EINZIGE Linie.
--
-- ── BEFUND (mittel): Grenzwerte konnten sich selbst wirkungslos machen ──
-- vital_sign_thresholds prüfte bislang nur die INNERE Konsistenz eines
-- Grenzwert-Satzes (min < max, kritisch außerhalb warn), nicht aber, ob
-- die Werte überhaupt im messbaren Bereich liegen. validierePlausibilitaet()
-- kappt jede Messung auf [plausibelMin, plausibelMax] je Typ (z. B. Puls
-- 20–250). Ein max_critical von 1000 für Puls ist intern konsistent
-- (1000 > jeder plausible min_warn), aber NIE erreichbar — der kritische
-- Alarm für diese Richtung wäre dauerhaft und unbemerkt abgeschaltet
-- (fail-open durch Fehlkonfiguration). lib/vitals/vitals.ts prüft das seit
-- dieser Migration ebenfalls (validiereGrenzwerte); dieser CHECK ist die
-- zweite Linie für Schreibpfade außerhalb der API.
--
-- Die Bereichsgrenzen je Typ sind in vitals_plausibel_min()/_max() als
-- SQL-Funktionen hinterlegt — sie spiegeln VITAL_TYPEN.plausibelMin/Max aus
-- lib/vitals/types.ts (Stand: Blutdruck diastolisch 20–200, Blutzucker bis
-- 600 — siehe VITAL_TYPEN.plausibelMinSekundaer/plausibelMaxSekundaer für
-- den Blutdruck-Sonderfall). Bei einer Änderung dort MUSS diese Migration
-- (per Folge-Migration) nachgezogen werden, sonst laufen App und DB
-- auseinander.
--
-- NOT VALID + VALIDATE: die CHECKs greifen sofort für neue/geänderte
-- Zeilen; ein Bestandsverstoß bricht die Migration nicht ab, sondern
-- meldet sich als WARNING (kein stiller Durchlauf).
--
-- Voraussetzung: 20260818010100_vitalwerte.sql
-- Rollback: 20261008000001_rollback_vitalwerte_plausibilitaet_db_check.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vital_signs'
  ) THEN
    RAISE EXCEPTION 'VITALWERTE_BASIS_FEHLT: 20260818010100_vitalwerte.sql muss zuerst laufen.';
  END IF;
END $$;

-- ── 1) Bereichsgrenzen je Typ (Spiegel von VITAL_TYPEN, s. o.) ─────────
-- Zwei Funktionspaare: der Primärwert (value / min_*, max_*) und der
-- Sekundärwert (value_secondary / *_secondary — nur beim Blutdruck belegt,
-- dort diastolisch mit eigenen, engeren Grenzen). Für alle anderen Typen
-- liefern die Sekundär-Funktionen dieselben Grenzen wie die Primär-
-- Funktionen (value_secondary ist dort ohnehin per Constraint NULL).
CREATE OR REPLACE FUNCTION public.vitals_plausibel_min(p_type text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_type
    WHEN 'blutdruck'     THEN 40
    WHEN 'puls'          THEN 20
    WHEN 'temperatur'    THEN 30
    WHEN 'blutzucker'    THEN 20
    WHEN 'spo2'          THEN 50
    WHEN 'gewicht'       THEN 20
    WHEN 'atemfrequenz'  THEN 4
    WHEN 'schmerz'       THEN 0
    WHEN 'trinkmenge'    THEN 0
    WHEN 'ausscheidung'  THEN 0
  END
$$;

CREATE OR REPLACE FUNCTION public.vitals_plausibel_max(p_type text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_type
    WHEN 'blutdruck'     THEN 300
    WHEN 'puls'          THEN 250
    WHEN 'temperatur'    THEN 45
    WHEN 'blutzucker'    THEN 600
    WHEN 'spo2'          THEN 100
    WHEN 'gewicht'       THEN 350
    WHEN 'atemfrequenz'  THEN 80
    WHEN 'schmerz'       THEN 10
    WHEN 'trinkmenge'    THEN 10000
    WHEN 'ausscheidung'  THEN 10000
  END
$$;

-- Nur Blutdruck (diastolisch) weicht ab; alle anderen Typen fallen auf
-- vitals_plausibel_min/_max zurück (Blutdruck-Sonderfall aus
-- VITAL_TYPEN.blutdruck.plausibelMinSekundaer/-MaxSekundaer).
CREATE OR REPLACE FUNCTION public.vitals_plausibel_min_sekundaer(p_type text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_type
    WHEN 'blutdruck' THEN 20
    ELSE public.vitals_plausibel_min(p_type)
  END
$$;

CREATE OR REPLACE FUNCTION public.vitals_plausibel_max_sekundaer(p_type text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_type
    WHEN 'blutdruck' THEN 200
    ELSE public.vitals_plausibel_max(p_type)
  END
$$;

COMMENT ON FUNCTION public.vitals_plausibel_min(text) IS
  'Spiegelt VITAL_TYPEN[typ].plausibelMin aus lib/vitals/types.ts. Bei Änderung dort nachziehen.';
COMMENT ON FUNCTION public.vitals_plausibel_max(text) IS
  'Spiegelt VITAL_TYPEN[typ].plausibelMax aus lib/vitals/types.ts. Bei Änderung dort nachziehen.';
COMMENT ON FUNCTION public.vitals_plausibel_min_sekundaer(text) IS
  'Spiegelt VITAL_TYPEN[typ].plausibelMinSekundaer (Fallback: plausibelMin) aus lib/vitals/types.ts.';
COMMENT ON FUNCTION public.vitals_plausibel_max_sekundaer(text) IS
  'Spiegelt VITAL_TYPEN[typ].plausibelMaxSekundaer (Fallback: plausibelMax) aus lib/vitals/types.ts.';

-- ── 2) vital_signs: Messwert je Typ im plausiblen Bereich ──────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('vital_signs_wert_plausibel_check',
        'value >= public.vitals_plausibel_min(type) AND value <= public.vitals_plausibel_max(type)'),
      ('vital_signs_sekundaer_plausibel_check',
        'value_secondary IS NULL OR (value_secondary >= public.vitals_plausibel_min_sekundaer(type) AND value_secondary <= public.vitals_plausibel_max_sekundaer(type))'),
      -- Diastolisch < systolisch — Spiegel der API-Prüfung in validierePlausibilitaet().
      ('vital_signs_sekundaer_kleiner_check',
        'value_secondary IS NULL OR value_secondary < value')
    ) AS v(name, ausdruck)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.name) THEN
      EXECUTE format('ALTER TABLE public.vital_signs ADD CONSTRAINT %I CHECK (%s) NOT VALID', r.name, r.ausdruck);
      BEGIN
        EXECUTE format('ALTER TABLE public.vital_signs VALIDATE CONSTRAINT %I', r.name);
      EXCEPTION WHEN check_violation THEN
        RAISE WARNING
          'VITALWERTE_BESTAND_UNPLAUSIBEL: % konnte nicht validiert werden — es gibt Messungen, die % verletzen. Der CHECK greift für neue/geänderte Zeilen; der Bestand muss von Hand geprüft werden.',
          r.name, r.ausdruck;
      END;
    END IF;
  END LOOP;
END;
$$;

-- ── 3) vital_sign_thresholds: Grenzwerte je Typ im plausiblen Bereich ──
-- Verhindert die fail-open-Fehlkonfiguration aus dem Befund oben: ein
-- Grenzwert außerhalb [plausibelMin, plausibelMax] kann nie ausgelöst
-- werden, weil keine gültige Messung ihn je erreicht.
DO $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vital_sign_thresholds'
  ) THEN
    RAISE EXCEPTION 'VITALWERTE_BASIS_FEHLT: 20260818010100_vitalwerte.sql muss zuerst laufen.';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('vital_sign_thresholds_plausibel_check',
        '(min_warn IS NULL OR (min_warn BETWEEN public.vitals_plausibel_min(type) AND public.vitals_plausibel_max(type)))' ||
        ' AND (max_warn IS NULL OR (max_warn BETWEEN public.vitals_plausibel_min(type) AND public.vitals_plausibel_max(type)))' ||
        ' AND (min_critical IS NULL OR (min_critical BETWEEN public.vitals_plausibel_min(type) AND public.vitals_plausibel_max(type)))' ||
        ' AND (max_critical IS NULL OR (max_critical BETWEEN public.vitals_plausibel_min(type) AND public.vitals_plausibel_max(type)))'),
      ('vital_sign_thresholds_sekundaer_plausibel_check',
        '(min_warn_secondary IS NULL OR (min_warn_secondary BETWEEN public.vitals_plausibel_min_sekundaer(type) AND public.vitals_plausibel_max_sekundaer(type)))' ||
        ' AND (max_warn_secondary IS NULL OR (max_warn_secondary BETWEEN public.vitals_plausibel_min_sekundaer(type) AND public.vitals_plausibel_max_sekundaer(type)))' ||
        ' AND (min_critical_secondary IS NULL OR (min_critical_secondary BETWEEN public.vitals_plausibel_min_sekundaer(type) AND public.vitals_plausibel_max_sekundaer(type)))' ||
        ' AND (max_critical_secondary IS NULL OR (max_critical_secondary BETWEEN public.vitals_plausibel_min_sekundaer(type) AND public.vitals_plausibel_max_sekundaer(type)))')
    ) AS v(name, ausdruck)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.name) THEN
      EXECUTE format('ALTER TABLE public.vital_sign_thresholds ADD CONSTRAINT %I CHECK (%s) NOT VALID', r.name, r.ausdruck);
      BEGIN
        EXECUTE format('ALTER TABLE public.vital_sign_thresholds VALIDATE CONSTRAINT %I', r.name);
      EXCEPTION WHEN check_violation THEN
        RAISE WARNING
          'VITALWERTE_GRENZWERT_UNPLAUSIBEL: % konnte nicht validiert werden — es gibt Grenzwert-Sätze, die % verletzen. Der CHECK greift für neue/geänderte Zeilen; der Bestand muss von Hand geprüft werden (fail-open-Risiko: Alarm löst evtl. nie aus).',
          r.name, r.ausdruck;
      END;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
```

### 5b · Verifikation — beweist, dass es live steht

Erwartet: **4** genau — geprüft wird 
die vier Funktionen vitals_plausibel_*.

```sql
SELECT count(*) FROM pg_proc WHERE proname LIKE 'vitals_plausibel%';
```

---

## Schritt 6 · `20261009000000_pflege_massnahmenplaene_ein_aktiver_plan`

**Zweck.** Eindeutiger Teilindex: je Klient hoechstens EIN Massnahmenplan im Status 'aktiv'. freigebenPlan() loest den alten und aktiviert den neuen in zwei getrennten UPDATEs ohne Sperrschutz — bei zwei gleichzeitigen Freigaben koennen zwei Plaene aktiv werden. Live steht nur ein GEWOEHNLICHER Teilindex, der nichts erzwingt.

**Risiko, solange sie fehlt: MITTEL.** Welcher Plan der gueltige Versorgungsplan ist, wird uneindeutig.

**Abhängigkeit.** Tabelle pflege_massnahmenplaene. Keine der anderen sieben.

**Erwartet danach.** eindeutiger Index uq_pflege_massnahmenplaene_ein_aktiver_plan

**Rollback-Risiko.** GERING. DROP INDEX. Der Index aendert keine Zeile — er verhindert nur kuenftige Doppelungen.

Rollback-Datei: `supabase/migrations/20261009000001_rollback_pflege_massnahmenplaene_ein_aktiver_plan.sql`

### 6a · Vorprüfung — ZUERST ausführen

DIESE EINE braucht eine Vorpruefung. Legt der Index sich nicht an, gibt es bereits mehrere aktive Plaene je Klient. Die sind fachlich zu klaeren (welcher gilt?) — NICHT blind einen davon umschalten. Vorher ausfuehren; kommt eine Zeile zurueck, hier abbrechen und melden:

```sql
SELECT organization_id, client_id, count(*)
  FROM public.pflege_massnahmenplaene
 WHERE status = 'aktiv'
 GROUP BY organization_id, client_id
HAVING count(*) > 1;
```

### 6b · Anwenden

```sql
BEGIN;

-- ============================================================================
-- pflege_massnahmenplaene: hoechstens ein aktiver Plan je Klient
-- ============================================================================
--
-- BEFUND
--   freigebenPlan() (lib/pflege/massnahmenplaene.ts) loest den bisher aktiven
--   Plan und aktiviert den neuen in ZWEI getrennten UPDATE-Statements ohne
--   Transaktions-/Sperrschutz. Bei zwei gleichzeitigen Freigaben fuer
--   denselben Klienten (zwei Browser-Tabs, Doppelklick) kann die Ablöse
--   beider Aufrufe laufen, BEVOR einer der beiden Aktivierungs-Schritte
--   greift — Ergebnis: zwei gleichzeitig aktive Plaene fuer denselben
--   Klienten. Welcher Plan "der" gueltige Versorgungsplan ist, wird damit
--   uneindeutig.
--
-- REGEL
--   Je Klient darf hoechstens EIN Plan im Status 'aktiv' stehen.
--
-- WIRKUNG
--   Der Verlierer eines Wettlaufs bekommt eine Verletzung des Eindeutigkeits-
--   Index statt eines zweiten, parallel aktiven Plans. lib/pflege/
--   massnahmenplaene.ts:freigebenPlan() bildet den Fehlercode 23505 bereits
--   auf eine deutschsprachige Meldung ab ("Für diesen Kunden wurde in der
--   Zwischenzeit bereits ein anderer Plan freigegeben.").
--
-- VORPRUEFUNG
--   Legt der Index sich nicht an, gibt es bereits mehrere aktive Plaene:
--
--     SELECT client_id, count(*)
--       FROM public.pflege_massnahmenplaene
--      WHERE status = 'aktiv'
--      GROUP BY client_id HAVING count(*) > 1;
--
--   Solche Faelle sind fachlich zu klaeren (welcher Plan gilt?), nicht blind
--   einen davon umzuschalten.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_pflege_massnahmenplaene_ein_aktiver_plan
  ON public.pflege_massnahmenplaene (organization_id, client_id)
  WHERE status = 'aktiv';

COMMENT ON INDEX public.uq_pflege_massnahmenplaene_ein_aktiver_plan IS
  'Je Klient hoechstens ein aktiver Massnahmenplan. Verhindert die Race '
  'Condition in freigebenPlan() (zwei getrennte UPDATE-Statements ohne '
  'Transaktionsschutz).';

COMMIT;
```

### 6c · Verifikation — beweist, dass es live steht

Erwartet: **1** genau — geprüft wird 
eindeutiger Index uq_pflege_massnahmenplaene_ein_aktiver_plan.

```sql
SELECT count(*) FROM pg_indexes WHERE indexname='uq_pflege_massnahmenplaene_ein_aktiver_plan';
```

---

## Schritt 7 · `20261021000004_is_internal_staff_ohne_buero`

**Zweck.** Entfernt die Rolle 'buero' aus is_internal_staff(). Der CHECK auf profiles.role laesst den Wert nicht zu, ROLLEN_MATRIX kennt ihn nicht, live traegt ihn kein Konto — der Eintrag ist heute wirkungslos.

**Risiko, solange sie fehlt: NIEDRIG heute — HOCH bei der naechsten CHECK-Erweiterung.** Eine gestellte Falle: wer den CHECK eines Tages um eine Bueroverwaltung erweitert, gibt dieser Rolle in DERSELBEN Minute Zugriff auf alles hinter is_internal_staff() — unter anderem die Verordnungen — und zwar ohne einen einzigen Eintrag in ROLLEN_MATRIX. Der Fehler entstuende an einer Stelle und wirkte an einer ganz anderen, Monate spaeter.

**Abhängigkeit.** Funktion is_internal_staff(). Keine der anderen sieben.

**Erwartet danach.** is_internal_staff() nennt 'buero' nicht mehr

**Rollback-Risiko.** GERING. CREATE OR REPLACE FUNCTION auf eine Funktion ohne Zustand. Der Rollback setzt den alten Rumpf zurueck — und damit die Falle wieder ein.

Rollback-Datei: `supabase/migrations/20261021000005_rollback_is_internal_staff_ohne_buero.sql`

### 7a · Anwenden

```sql
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- is_internal_staff(): die Rolle `buero` entfernen
--
-- BEFUND (npm run audit:rls-rollen, Pruefung F1, 31.08.2026)
--
-- Drei Stellen fuehren unabhaengig voneinander eine Rollenliste:
--
--   1. der CHECK auf profiles.role
--        kunde, engel, fahrer, angehoerige, pdl, qm, buchhaltung,
--        admin, superadmin
--   2. public.is_internal_staff()
--        admin, superadmin, pdl, buero          ← buero
--   3. ROLLEN_MATRIX in lib/auth/rollen.ts
--        superadmin, admin, pdl, qm, buchhaltung, engel, fahrer, kunde,
--        angehoerige
--
-- `buero` steht NUR in (2). Der CHECK laesst den Wert nicht zu, die
-- Anwendung kennt ihn nicht, und live traegt kein Konto ihn (geprueft:
-- 0 Zeilen). Heute ist der Eintrag also wirkungslos.
--
-- ── WARUM ER TROTZDEM WEG MUSS ────────────────────────────────────────────
--
-- Er ist eine gestellte Falle. Wer den CHECK eines Tages um eine
-- Bueroverwaltung erweitert — ein voellig naheliegender Schritt —, gibt
-- dieser Rolle in DERSELBEN Minute Zugriff auf alles, was hinter
-- is_internal_staff() liegt: unter anderem die Verordnungen
-- (verordnungen_staff_read). Und zwar ohne einen einzigen Eintrag in
-- ROLLEN_MATRIX, also vorbei an dem Ort, an dem Berechtigungen sonst
-- entschieden werden. Der Fehler entstuende an einer Stelle (CHECK) und
-- wirkte an einer ganz anderen (RLS), Monate spaeter, ohne Zusammenhang
-- im Diff.
--
-- Eine Rolle, die es nicht geben kann, gehoert nicht in eine
-- Vertrauensliste. Soll `buero` spaeter wirklich kommen, ist der richtige
-- Weg: in den CHECK, in ROLLEN_MATRIX, und DANN — als bewusste
-- Entscheidung — hierher.
--
-- ── WAS SICH DADURCH AENDERT ──────────────────────────────────────────────
--
-- Fuer den laufenden Betrieb: nichts. Kein Konto traegt `buero`, also
-- aendert sich keine einzige Zeilensichtbarkeit. Die Migration nimmt
-- ausschliesslich zukuenftiges Risiko heraus.
--
-- ── ANWENDEN ──────────────────────────────────────────────────────────────
-- Im Supabase-SQL-Editor als `postgres`. Ueber den Dienstschluessel
-- scheitert CREATE OR REPLACE FUNCTION am Eigentuemer (42501).
-- Danach `npm run audit:rls-rollen` — F1 muss verschwinden.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_internal_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      -- Die Liste deckt sich mit dem CHECK auf profiles.role UND mit
      -- ROLLEN_MATRIX. Wer sie erweitert, erweitert damit den Zugriff auf
      -- jede Tabelle mit einer is_internal_staff()-Policy — das ist eine
      -- Berechtigungsentscheidung und gehoert zuerst in ROLLEN_MATRIX.
      AND role = ANY (ARRAY['admin', 'superadmin', 'pdl'])
  );
$function$;

COMMENT ON FUNCTION public.is_internal_staff() IS
  'Interne Leitungsrollen (admin, superadmin, pdl). Die Liste muss sich mit dem CHECK '
  'auf profiles.role und mit ROLLEN_MATRIX in lib/auth/rollen.ts decken; '
  'npm run audit:rls-rollen (Pruefung F) haelt das fest. `buero` stand hier bis zum '
  '31.08.2026 und war vom CHECK nie zugelassen.';

-- Die Grants der Funktion bleiben, wie sie waren: CREATE OR REPLACE aendert
-- sie nicht. `authenticated` braucht EXECUTE, weil die Policies sie
-- auswerten; `anon` hat es nicht und soll es nicht bekommen.
REVOKE ALL ON FUNCTION public.is_internal_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_internal_staff() TO authenticated, service_role;

-- Gegenprobe im selben Lauf.
DO $$
DECLARE
  quelle text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO quelle
    FROM pg_proc
   WHERE proname = 'is_internal_staff' AND pronamespace = 'public'::regnamespace;

  IF quelle ILIKE '%buero%' THEN
    RAISE EXCEPTION 'is_internal_staff() nennt weiterhin buero — die Ersetzung hat nicht gegriffen.';
  END IF;
  IF quelle NOT ILIKE '%pdl%' THEN
    RAISE EXCEPTION 'is_internal_staff() kennt pdl nicht mehr — das waere ein Rueckschritt.';
  END IF;
END $$;

COMMIT;
```

### 7b · Verifikation — beweist, dass es live steht

Erwartet: **1** genau — geprüft wird 
is_internal_staff() nennt 'buero' nicht mehr.

```sql
SELECT count(*) FROM pg_proc WHERE proname='is_internal_staff'
            AND pg_get_functiondef(oid) NOT LIKE '%buero%';
```

---

## Schritt 8 · `20261021000002_secdef_trigger_revoke`

**Zweck.** Zieht EXECUTE von PUBLIC/anon/authenticated fuer sechs SECURITY-DEFINER-Triggerfunktionen zurueck. Sie sind nicht durch einen Fehler entstanden, sondern durch die Vorgabe von Postgres: jede neue Funktion in public bekommt EXECUTE fuer PUBLIC.

**Risiko, solange sie fehlt: NIEDRIG.** Ehrlich: nicht schlimm. Alle sechs geben trigger zurueck und nehmen keine Argumente. PostgREST stellt solche Funktionen gar nicht als RPC bereit, und Postgres verweigert den Direktaufruf ohnehin. Ueber die oeffentliche Schnittstelle war hier nichts aufrufbar. Der Wert liegt in der Tiefenstaffelung — der Schutz haengt sonst allein an einer Eigenschaft von PostgREST, die niemand uns zugesagt hat.

**Abhängigkeit.** Die sechs genannten Funktionen muessen existieren. Keine der anderen sieben.

**Erwartet danach.** keine SECURITY-DEFINER-Triggerfunktion mehr fuer anon ausfuehrbar (erwartet: 0)

**Rollback-Risiko.** GERING. Reine Rechteaenderung, keine Datenaenderung. ACHTUNG: ein REVOKE wirkt nur, wenn er als Eigentuemer laeuft — ueber den Dienstschluessel meldet Supabase HTTP 204 OHNE Wirkung. Genau deshalb muss dieser Schritt im SQL-Editor als postgres laufen.

Rollback-Datei: `supabase/migrations/20261021000003_rollback_secdef_trigger_revoke.sql`

### 8a · Anwenden

```sql
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY-DEFINER-Triggerfunktionen: EXECUTE von PUBLIC/anon/authenticated
-- zurueckziehen
--
-- BEFUND (verify:perimeter, Pruefung N2, 31.08.2026)
--
--   funktionen=381  anon_ausfuehrbar=249  secdef_und_anon=6
--
-- Sechs SECURITY-DEFINER-Funktionen waren fuer `anon` ausfuehrbar. Sie sind
-- nicht durch einen Fehler entstanden, sondern durch die Vorgabe von
-- Postgres: JEDE neue Funktion in `public` bekommt EXECUTE fuer PUBLIC,
-- und PUBLIC schliesst anon ein. Wer eine Funktion anlegt und nichts
-- weiter tut, hat sie veroeffentlicht (siehe Befund „SECDEF-RPCs &
-- Default-Privileges"). Genau deshalb macht die Standortfreigabe-Migration
-- 20261020000000 fuer ihre drei Triggerfunktionen ein ausdrueckliches
-- REVOKE — die aelteren Migrationen taten das nicht.
--
-- ── WIE SCHLIMM IST ES? EHRLICH: NICHT SEHR ───────────────────────────────
--
-- Alle sechs geben `trigger` zurueck und nehmen keine Argumente:
--
--   arbzg_pruefung_ist()                  Arbeitszeit
--   pflege_evaluation_plan_in_kraft()     Pflegeprozess / Evaluation
--   pflege_evaluation_unveraenderlich()   dito
--   pflege_evaluation_wiedervorlage()     dito
--   security_audit_auth_anmeldung()       Sicherheitsspur
--   security_audit_log_unveraenderlich()  dito
--
-- PostgREST stellt Funktionen mit Rueckgabetyp `trigger` gar nicht als RPC
-- bereit, und Postgres verweigert den Direktaufruf ohnehin
-- („trigger functions can only be called as triggers"). Ueber die
-- oeffentliche Schnittstelle war hier also nichts aufrufbar.
--
-- ── WARUM DANN UEBERHAUPT ─────────────────────────────────────────────────
--
-- Zwei Gruende, und der zweite ist der wichtigere:
--
--  1. Tiefenstaffelung. Der Schutz haengt sonst allein daran, dass
--     PostgREST diesen Rueckgabetyp heute nicht bedient. Das ist die
--     Eigenschaft eines fremden Werkzeugs, keine Zusage unseres Schemas.
--
--  2. Die Pruefung soll scharf bleiben. N2 zaehlt SECDEF-Funktionen, die
--     anon ausfuehren darf. Solange dort dauerhaft „6" steht, verschwindet
--     die siebte — eine mit echten Argumenten und echtem Schaden — im
--     Rauschen. Eine Pruefung, die immer rot ist, wird nicht mehr gelesen.
--     Nach dieser Migration steht dort 0, und jede Abweichung ist ein
--     Befund.
--
-- ── ANWENDEN ──────────────────────────────────────────────────────────────
-- NUR im Supabase-SQL-Editor als `postgres`. Ueber den Dienstschluessel
-- meldet ein REVOKE HTTP 204 OHNE Wirkung (Befund „REVOKE braucht
-- Owner-Rechte") — der Lauf saehe erfolgreich aus und haette nichts getan.
-- Nach dem Anwenden `npm run verify:perimeter` starten; N2 muss auf
-- secdef_und_anon=0 stehen.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  f record;
  anzahl integer := 0;
BEGIN
  -- Bewusst ueber den Katalog statt sechs fest verdrahteter Namen: kommt
  -- eine siebte SECDEF-Triggerfunktion dazu, faengt diese Migration beim
  -- erneuten Anwenden auch sie ein. Fest verdrahtete Namen waeren beim
  -- naechsten Mal schon wieder unvollstaendig.
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype = 'pg_catalog.trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f.sig);
    anzahl := anzahl + 1;
  END LOOP;

  RAISE NOTICE 'SECDEF-Triggerfunktionen bereinigt: %', anzahl;
END $$;

-- Gegenprobe im selben Lauf. Bleibt etwas uebrig, ist das Ergebnis nicht
-- das, was der Kopf verspricht — dann soll die Migration scheitern statt
-- still einen Teilzustand zu hinterlassen.
DO $$
DECLARE
  rest integer;
BEGIN
  SELECT count(*) INTO rest
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF rest > 0 THEN
    RAISE EXCEPTION
      'Nach dem REVOKE sind noch % SECURITY-DEFINER-Funktionen fuer anon ausfuehrbar. '
      'Diese Migration deckt nur Triggerfunktionen ab — die uebrigen sind aufrufbare '
      'RPCs und muessen einzeln geprueft werden (welche: siehe verify:perimeter N2).', rest;
  END IF;
END $$;

COMMIT;
```

### 8b · Verifikation — beweist, dass es live steht

Erwartet: **0** genau — geprüft wird 
keine SECURITY-DEFINER-Triggerfunktion mehr fuer anon ausfuehrbar.

```sql
SELECT count(*) FROM pg_proc p WHERE p.prosecdef
            AND p.pronamespace='public'::regnamespace AND p.prorettype='trigger'::regtype
            AND has_function_privilege('anon', p.oid, 'EXECUTE');
```

---

## Zum Schluss

Nach dem letzten Schritt beweist **ein** Lauf, dass alle acht stehen:

```
npm run check:migrationen     → erwartet: 32 von 32 live, kein ❌
npm run verify:rls-matrix     → erwartet: 0 harte Befunde UND 0 mittlere
```

Der zweite Lauf ist die eigentliche Gegenprobe für Schritt 4: vor dem Anwenden
meldet er **13 mittlere Befunde** (drei Verwaltungsrollen sehen `bookings`,
`einsatz_absagen`, `kostentraeger_kontakte`, `state_settings` und `verordnungen`
nicht). Bleiben die nach dem Anwenden stehen, ist die Migration zwar durchgelaufen,
greift aber nicht — und das wäre ein neuer Befund.

Beide Läufe kann ein Agent ausführen; dafür ist kein Terminal nötig.
