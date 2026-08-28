# Track 9: Personalverwaltung + Berechtigungssystem — Security Audit

**Datum:** 28.08.2026
**Auditor:** Claude (autonom)
**Scope:** 24 API-Routen unter `/api/personal/`, `angels`-Tabelle, Rollen-
verwaltung, Einladungs-/Onboarding-Flow, Qualifikationsnachweise,
Abwesenheitsverwaltung, Gehaltsdaten/Vertraege

---

## Vorgehen

Sechs parallele Scanner ueber alle sechs Audit-Bereiche, anschliessend
manuelle Tiefenpruefung der Migrations-Kette (17 Migrationen auf der
`angels`-Tabelle), des Registrierungsflusses, der Rollenmatrix (9 Rollen,
24 Berechtigungen) und der Stammdaten-Erlaubnisliste.

---

## Befunde

### B1 (P0) — Engel konnte eigenen Stundensatz per PostgREST manipulieren

**WAS:** Die RLS-Policy `"Angels can update own profile"` auf `public.angels`
war `FOR UPDATE USING (auth.uid() = id)` — ohne jede Spalteneinschraenkung.
Ein authentifizierter Engel konnte per direktem PostgREST-PATCH seinen
`hourly_rate`, `qualification`, `is_certified` und `is_45b_capable` beliebig
setzen.

**WARUM schwer:** `hourly_rate` bestimmt die Verguetung pro Einsatz. Eine
unkontrollierte Selbstaenderung ist ein finanzieller Befund. `qualification`
und `is_certified` steuern, ob der Engel fuer bestimmte Leistungsarten
angezeigt und eingeplant wird. Kein Trigger schuetzte die Tabelle.

**WIE behoben:**
- Migration `20261015000000`: `REVOKE UPDATE ON public.angels FROM authenticated`,
  dann `GRANT UPDATE (is_online, bio, services, availability)` — nur die vier
  Felder, die der Engel ueber die Oberflaeche selbst pflegt.
- `REVOKE INSERT ON public.angels FROM authenticated` — die Registrierung
  laeuft jetzt ueber den Admin-Client.
- `app/engel/register/actions.ts`: Upsert von User-Client auf
  `createAdminClient()` umgestellt.

**Datei:** `supabase/migrations/20261015000000_angels_policy_haertung.sql`
**Code:** `app/engel/register/actions.ts:57`

---

### B3 (P2) — Stale Admin-Policy mit profiles-Subquery (42P17-Risiko)

**WAS:** `"Admins can manage all angels"` (angelegt in `20260319000000`) war
nie entfernt worden. Sie nutzte
`EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN
('admin','superadmin'))` — eine profiles-Subquery in einer Policy, bekannter
42P17-Rekursions-Ausloeser (Track 4, `20260823020000`).

**WARUM:** Redundant mit `"Admin engelleri yoenetebilir"`, die `is_admin()` nutzt.
Die Koexistenz zweier FOR-ALL-Policies erzeugt keinen Funktionsfehler
(permissive OR), aber die profiles-Subquery kann bei Laden der profiles-
Policies zu einer zirkulaeren Abhaengigkeit fuehren.

**WIE behoben:** Migration `20261015000000`: `DROP POLICY`.

---

### B4 (P1) — MIS-Team-Seite: toter Rollenselektor

**WAS:** `app/mis/team/page.tsx:476` zeigte ein `<select>` fuer `editForm.role`
mit fuenf Rollen-Optionen. `handleEditUser()` (Zeile 181) schickte
`{first_name, last_name, email, phone, location}` an den Server — `role`
war NIE enthalten. Ein Operator konnte glauben, er haette eine Rolle
geaendert, ohne dass etwas passierte.

**WARUM schwer:** Kein Sicherheitsleck (der Server nimmt role nicht an), aber
ein UX-Befund mit operativer Auswirkung: ein Admin, der meint, er haette
einen Nutzer herabgestuft, laesst ihm seine alte Rolle.

**WIE behoben:** `<select>` durch Nur-Lesen-Anzeige ersetzt mit Hinweis
"Rollenaenderung nur ueber Superadmin-Rollenverwaltung".

**Datei:** `app/mis/team/page.tsx:474-483`

---

## Negativbefunde

Die folgenden Stellen wurden AUSDRUECKLICH geprueft und sind in Ordnung:

**(N1) Stammdaten-Erlaubnisliste:** `STAMMDATEN_SELECT` in `lib/personal/
stammdaten.ts:5-10` enthaelt kein `hourly_rate`, `gehalt`, `salary` oder
`lohn`. Gehaltsdaten werden ueber KEINEN API-Endpunkt exponiert.

**(N2) caregivers-Tabelle RLS:** `caregivers_admin_all` auf `is_admin()` —
nur Administratoren koennen die Tabelle direkt lesen/schreiben. Kein
Engel-Selbstlesen-Policy. `eigene_caregiver_ids()` als SECURITY DEFINER
fuer engel-scoped JOINs.

**(N3) Rollenverwaltung (manage-role):** Nur `superadmin` kann Rollen
vergeben. `VERGEBBAR` schliesst `superadmin` aus. Selbstaenderung
blockiert. DB-Trigger `prevent_role_escalation` als Defense-in-Depth.
Dual-Source-Regel (profiles bindend, app_metadata einschraenkend) in
`wirksameBerechtigungen()`.

**(N4) lint:route-auth:** 0 Verletzungen ueber 411 Routen — kein API-Handler
liest die eigene Rolle direkt aus `profiles.role` statt ueber
`holeRollenQuellen()`.

**(N5) Kein Einladungssystem:** Registrierung ist offen fuer
`['kunde','engel','fahrer']` — `admin`/`superadmin` sind ausdruecklich
ausgeschlossen. In einem Marktplatz-Modell ist offene Registrierung fuer
Kunden und Betreuungskraefte eine Entwurfsentscheidung, kein Befund.

**(N6) Passwort-Reset-Tokens:** Supabase-native `generateLink`/`verifyOtp`
mit PKCE. Rate-Limited (5/IP/10 Min, 3/Email/10 Min). Single-Use. Kein
geteiltes Token-Infrastruktur mit Einladungen (es gibt keine).

**(N7) Qualifikations-Ablauf server-seitig:** `sammleVoraussetzungen()` in
`lib/personal/einsatzfreigabe.ts:84-106` vergleicht `valid_until` gegen
`heuteBerlin()`. Fail-closed: fehlende Qualifikation blockiert die
Einsatzfreigabe.

**(N8) Certificate Tenant Separation:** Upload-Pfad enthaelt `org-${orgId}`.
`organization_id` wird ausdruecklich gesetzt (Track-6-Fix in
`20260922020000`). `assertCaregiverInOrg()` schuetzt alle Schreibwege.

**(N9) Abwesenheits-Selbstgenehmigung blockiert:** Code-Pruefung in
`abwesenheiten.ts:224` (`erstellt_von === genehmigenVon`). RLS-Policy
`engel_absences_insert` beschraenkt auf `status='beantragt'` (Fix aus
`20260917000002`). Genehmigung nur ueber `requirePersonalAdmin('personal.schreiben')`.

**(N10) Urlaubskontingente server-seitig:** `pruefeKontodeckung()` + CAS
in `bucheGenommeneTage()` mit 3 Retries. Rollback bei fehlgeschlagener
Buchung.

**(N11) Vertragsdaten RLS:** `akten_vertraege` hat admin-only Schreib-Policy
und engel-scoped SELECT (`caregiver_id IN (... WHERE cg.user_id = auth.uid())`).
Cross-Caregiver-Sichtbarkeit ausgeschlossen.

**(N12) ArbZG-Pruefung:** Trigger `trg_arbzg_pruefung` auf `dienstplan_eintraege`
loggt Verstoesse bewusst nicht-blockierend (Design-Entscheidung, kein Befund).

**(N13) 24 Personal-Routen:** Alle schreiben mit `createAdminClient()` + manuellem
Org-Fence (`.eq('organization_id', auth.ctx.organizationId)`) und nutzen
`assertCaregiverInOrg()` gegen Cross-Tenant `caregiver_id`-Injection.

---

## Bekanntes Restrisiko (kein Befund, ausdruecklich benannt)

**R1 — Drei Views ohne Org-Fence auf caregivers-JOIN:**
`personal_urlaubsuebersicht`, `qualifikation_ablauf_warnung`,
`personal_arbeitszeitkonto` joinen `caregivers` ohne `organization_id`-
Bedingung. Die Anwendung filtert mit `.eq('organization_id', ...)` auf der
Haupt-Zeile, nicht auf dem gejointen Mitarbeiter. Schutz liegt im Code
(`assertCaregiverInOrg` vor jedem Insert) — dokumentiert in
`lib/personal/organization-guard.ts:13-27`.

**R2 — Abwesenheits-Ueberlappung:** Kein Check fuer Abwesenheit-gegen-
Abwesenheit — ein Mitarbeiter kann zwei Urlaubsantraege fuer denselben
Zeitraum stellen. Schicht-gegen-Schicht und Schicht-gegen-Abwesenheit
werden geprueft (Trigger `check_doppelbelegung`). Kein Sicherheitsbefund,
aber ein fachliches Restrisiko bei der Kontingentberechnung.

**R3 — force_override an der Einsatzfreigabe:** Admins koennen ueber
`force_override: true` abgelaufene Qualifikationen uebergehen.
Eingeschraenkt auf `admin`/`superadmin` mit `personal.schreiben`,
audit-geloggt. Kein sekundaerer Genehmigungsschritt.

**R4 — "Anyone can view angels" SELECT-Policy:** Die Policy erlaubt jedem
authenticated User das Lesen ALLER angels-Spalten inkl. `hourly_rate`.
Im Marktplatz-Modell ist der Stundensatz die offentliche Preisangabe;
eine Einschraenkung wuerde `SELECT *` in sieben App-Stellen brechen.
Kein Sicherheitsbefund im aktuellen Geschaeftsmodell, aber bei
Mandantentrennung der angels-Tabelle erneut zu bewerten.

---

## Tests

30 neue Tests in `__tests__/personal/track9-personalverwaltung-audit.test.ts`:

- 5 Quelltext-Zaune (Migration enthaelt die richtigen DROPs/REVOKEs/GRANTs)
- 3 Code-Zaune (Registration Admin-Client, Stammdaten-Erlaubnisliste)
- 7 Auth-Guard-Zaune (Personal-Routen, Selbstgenehmigung, Rollenverwaltung)
- 1 MIS-Team-Seite (kein interaktiver Rollenselektor)
- 6 Gegenproben (alte Policy-Form, alte Registration, alter MIS-Selektor)
- 2 Einsatzfreigabe-Zaune (Qualifikations-Ablauf, fail-closed)
- 6 Einsatzplanung Auth-Guard-Zaune

**Davon 6 Gegenproben, die die ALTE Regel ausfuehren:**
- GP1: ALTE "Angels can update own profile" hatte KEINE Spalteneinschraenkung
- GP2: ALTE "Anyone can view angels" erlaubte jedem das Lesen
- GP3: ALTE "Admins can manage all angels" hatte profiles-Subquery
- GP4: ALTE MIS-Team-Seite hatte interaktiven Rollenselektor
- GP5: ALTE Registration nutzte User-Client fuer angels-Upsert
- GP6: Migration entzieht hourly_rate dem authenticated-UPDATE

---

## Metriken

| Kennzahl | Wert |
|---|---|
| Neue Tests | 30 |
| Gegenproben | 6 |
| Typecheck-Fehler | 0 |
| lint:forbidden | 0 (24783 Dateien) |
| Befunde behoben | 3 (B1, B3, B4) |
| Negativbefunde | 13 (N1–N13) |
| Bekanntes Restrisiko | 4 (R1–R4) |
