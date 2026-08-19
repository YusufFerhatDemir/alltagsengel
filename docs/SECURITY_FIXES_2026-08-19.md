# Behebung der HOCH- und MITTEL-Befunde aus dem Security-/QA-Audit

**Datum:** 2026-08-19
**Grundlage:** `docs/SECURITY_QA_AUDIT_2026-08-19.md` + `docs/security/RLS_MATRIX.md` (Commit `5d1f217`)
**Bearbeitet:** 1× HOCH, 5× MITTEL, 4× NIEDRIG (NIEDRIG-3, -5, -6, -7, -8), alle 3 DSGVO-Punkte
**Testlauf nach den Änderungen:** `vitest run` → **162 Dateien / 3235 Tests grün**, 1 Datei + 38 Tests skipped, **0 rot**
**Typecheck:** `npx tsc --noEmit` → **Exit 0**

---

## Gesamtbild

| | Stand vorher | Stand jetzt |
|---|---|---|
| **Code** | 6 Befunde offen | alle bearbeitet, 91 neue Tests |
| **Datenbank** | 3 Änderungen nötig | 3 Migrationen geschrieben, auf echtem Postgres bewiesen, **Live-Apply steht aus** |
| **DSGVO** | 3 offene Punkte | 3 geschlossen (Stripe, Art.-15-Export, Analytics-Mandantenbezug) |

**Wichtigste Einschränkung, gleich vorweg:** Die drei Migrationen sind geschrieben, gegen eine echte PostgreSQL-Instanz getestet und mit Rollback versehen — aber **noch nicht auf Production angewendet**. Bis dahin gelten HOCH-1, MITTEL-2 und MITTEL-5 in Production unverändert weiter. Details unter [Live-Apply](#live-apply--der-verbleibende-schritt).

---

## HOCH-1 — 82 Tabellen ohne `organization_id`

| | |
|---|---|
| **Datei** | DB-Schema; `supabase/migrations/20260922020000_hoch1_mandantentrennung.sql` |
| **Ursache** | 82 von 298 Tabellen haben keine `organization_id`; bei 52 ist die einzige Admin-Policy ein org-blindes `is_admin()`. Betroffen u. a. `profiles`, `messages`, `krankenfahrten`, `angels`, `mis_privacy_*`, `audit_logs`. |
| **Severity** | 🔴 hoch |
| **Risiko** | Ein Administrator einer beliebigen Organisation sieht in diesen Tabellen die Daten **aller** Organisationen — einschließlich der DSGVO-Anfragen und Einwilligungen fremder Mandanten (`mis_privacy_*`) und der Sicherheitsprotokolle (`audit_logs`, `mis_auth_log`). Heute begrenzt, weil produktiv praktisch nur die Stamm-Organisation genutzt wird; mit dem ersten echten Fremdmandanten ein Blocker. |

### Fix

**Schritt 1 — Klassifizierung aller 82 Tabellen.** Eine Spalte auf Vorrat ist kein Gewinn: bei Feiertagen, Bundesländern und Preisstufen wäre sie Ballast mit dem realen Risiko, dass ein vergessener Filter Referenzdaten unsichtbar macht. Jede Tabelle ist deshalb einzeln eingeordnet — maschinenlesbar in `scripts/org-id-klassifizierung.json`, begründet in `docs/security/ORG_ID_KLASSIFIZIERUNG.md`:

| Klasse | Anzahl | Handlung |
|---|---:|---|
| `referenz` — systemweite Regelwerksdaten | 24 | keine — `organization_id` wäre Ballast |
| `technisch` — an `auth.uid()`/Gerät gebunden | 8 | keine — Zugriff über die Nutzer-Bindung |
| `analytics` — Tracking | 7 | Spalte + Fence (MITTEL-2) |
| `coach` — PflegeCoach, pseudonymisiert | 16 | bewusst keine — eine Org-Spalte wäre Re-Identifizierungshilfe |
| `org_fence` — personenbezogen, servergeschrieben | 18 | Spalte + RESTRICTIVE Fence |
| `admin_policy_verengt` — personenbezogen, nutzergeschrieben | 9 | Admin-Policy auf Org-Nachweis verengt |

**Schritt 2 — `current_org_id()` korrigiert.** Die Funktion kannte nur `organization_members`. Diese Tabelle wurde 2026-08-01 aber ausschließlich mit den damaligen Plattform-Admins befüllt — Engel und Kundschaft haben dort **keine** Zeile und landeten ausnahmslos im Stamm-Org-Fallback. Jeder Fence wäre für sie wirkungslos gewesen. Sie löst jetzt auf wie `resolveUserOrgId()` in der Anwendung: JWT → `organization_members` → `caregivers` → `clients` → Stamm-Org.

**Schritt 3 — 18 Tabellen bekommen Spalte + RESTRICTIVE Fence** nach dem etablierten Muster aus `20260801_phase3_multi_mandant_saas.sql` (Spalte → Backfill Stamm-Org → `DEFAULT current_org_id()` → `NOT NULL` → Index → Fence).

**Schritt 4 — 9 nutzergeschriebene Tabellen bekommen einen verengten Admin-Zugriff** statt eines Fences:

```sql
USING (is_admin() AND public.nutzer_in_aktiver_org(<nutzerspalte>))
```

Das ist genau das Muster, das der Audit selbst als Vorlage nennt (`reviews`/`angel_reviews` mit `buchung_in_aktiver_org`). **Ein Fence wäre hier falsch:** Diese Zeilen entstehen durch die Endnutzer selbst, und ein Profil entsteht regelmäßig *vor* der zugehörigen `clients`-/`caregivers`-Zeile. Ein RESTRICTIVE Fence auf `profiles` hätte Nutzer aus dem eigenen Profil ausgesperrt — ein vollständiger Aussperr-Fehler.

### Test

`__tests__/security/hoch1-mandantentrennung-pglite.test.ts` — **27 Fälle, alle grün.** Die Migration läuft dabei gegen eine echte PostgreSQL-Instanz (PGlite/WASM); die Policies wertet Postgres selbst aus. Eine Fake-DB würde genau diese Fehlerklasse übersehen.

Die Suite misst zuerst den **Vorher-Zustand** (Admin aus Org B sieht Profile und Krankenfahrten aus Org A — der Befund reproduziert), wendet dann die Migration an und prüft:

* `current_org_id()` liefert für den Engel die Org aus `caregivers`, für den Kunden die aus `clients`, für den bindungslosen Nutzer die Stamm-Org
* fremder Admin sieht Profil, Engel-Profil, Nachrichten, Benachrichtigungen und Referrals **nicht mehr**; der eigene Admin sehr wohl
* **Selbstzugriff bleibt unberührt** — Nutzer lesen ihr Profil, ihre Nachrichten, ihre Benachrichtigungen weiterhin
* kein `42P17` (Policy-Rekursion) auf `profiles`
* der Fence ist tatsächlich `RESTRICTIVE`, neue Zeilen erben die Org des Schreibenden, ein Schreibversuch in eine fremde Org wird abgewiesen
* Idempotenz: zweiter Lauf fehlerfrei

`__tests__/security/org-id-klassifizierung.test.ts` — 12 Fälle: die Einordnung ist vollständig (82/82), überschneidungsfrei, ohne unbekannte Tabellen, nichts bleibt „offen", jede Klasse ist begründet, und jede handlungsbedürftige Tabelle steht tatsächlich in der zugehörigen Migration.

### Ergebnis

✅ **Intern gelöst, auf echtem Postgres bewiesen** — ⏳ **Live-Apply steht aus.**

**Dokumentierter Restpunkt:** `nutzer_in_aktiver_org()` gibt `true` zurück, wenn ein Nutzer *überhaupt keine* Org-Bindung hat. Ohne diesen Zweig wären frisch registrierte Nutzer für jeden Admin unsichtbar und die Nutzerverwaltung direkt nach der Registrierung blind. Folge: bindungslose Nutzer sind bis zur ersten Zuordnung für Admins aller Mandanten sichtbar. Der Test hält das ausdrücklich fest, damit es nicht unbemerkt zur Annahme wird.

---

## MITTEL-1 — `getActiveOrgId()` war fail-open

| | |
|---|---|
| **Datei** | `lib/organizations/server.ts:46` (+ 34 Aufrufstellen) |
| **Ursache** | Bei fehlender Mitgliedschaft **und bei jeder Exception** wurde `DEFAULT_ORG_ID` geliefert statt zu scheitern. |
| **Severity** | 🟠 mittel |
| **Risiko** | Ein Admin ohne Zeile in `organization_members` — oder ein transienter DB-Fehler — landete still in der Stamm-Organisation. Die Guards prüfen auf `!organizationId`, und leer wurde nie zurückgegeben: der Guard war wirkungslos. |

### Fix

Drei Funktionen mit klar getrennten Aufgaben statt einer, die alles halb macht:

| Funktion | Verhalten | Einsatz |
|---|---|---|
| `getActiveOrgId()` | **fail-closed** → `null` ohne Mitgliedschaft, ohne User, bei jeder Exception | Admin-/Ops-Guards |
| `resolveUserOrgId()` | fail-closed, löst zusätzlich über `caregivers` und `clients` auf | Rollen-Guards (`require*User`), Kunden-/Engel-/Fahrer-Server-Actions |
| `getActiveOrgIdOrDefault()` | bewusster Stamm-Org-Fallback, an jeder Stelle einzeln begründet | öffentliche/Endkunden-Pfade ohne verlässliche Org-Bindung |

`resolveUserOrgId()` ist der Schlüssel: Ein reines Membership-Lookup hätte Engel und Kundschaft fälschlich als „ohne Organisation" eingestuft und **die gesamte Kunden-, Engel- und Fahrer-Oberfläche mit 403 abgeschaltet** — deren Mandant steht aber sauber an `caregivers.organization_id` bzw. `clients.organization_id`. Die neue Auflösung ist damit fail-closed *und* korrekter als vorher.

**Dabei fielen sechs echte Fail-open-Stellen auf,** die der Audit nicht gelistet hatte: In `bookings/notify`, `bookings/respond` (3×), `pricing`, `einsatzplanung`, `engel/match` und `notify-admin-registration` hing der Org-Filter an einem `if (orgId)`. Sobald die Org fehlte, wurde der Fence **übersprungen** statt zu greifen — in `einsatzplanung` hätte das die komplette Einsatzfreigabe-Prüfung ausgehebelt. Alle Bedingungen sind entfernt, der Filter greift jetzt unbedingt.

Weitere 8 Admin-Routen antworten jetzt mit explizitem 403 statt einer implizit leeren Ergebnismenge (`organizations/subscription`, `admin/ocr`, `admin/krankenfahrten` 2×, `leistungsnachweis`, `billing/tariffs`, `billing/invoices/[id]/snapshots`, `billing/auto-invoice`).

### Test

`__tests__/security/org-fail-closed.test.ts` — **30 Fälle:**

* `getActiveOrgId()` liefert `null` ohne User, ohne Mitgliedschaft und bei DB-Fehler
* Org-Switcher-Cookie wird gegen die Mitgliedschaft validiert; ein Cookie auf eine fremde Org wird ignoriert (kein Mandantensprung)
* `resolveUserOrgId()` löst über `caregivers`/`clients` auf, Mitgliedschaft hat Vorrang, ohne jede Bindung → `null`
* **statische Gegenprobe:** keine der fünf umgestellten Routen enthält noch einen `if (orgId)`-Fence
* **Gegenprobe:** alle 12 Admin-Guards werten das `null` aus und antworten mit 403

Drei bestehende Testdateien mussten mitgezogen werden (`reviews-get-auth`, `auto-invoice-compat`, `p0-auto-invoice-cross-client`): Sie mockten `getActiveOrgId` gar nicht oder nur teilweise und verließen sich damit auf das alte Fail-open-Verhalten. Die Mocks stellen jetzt eine gültige Organisation.

### Ergebnis

✅ **Geschlossen.** Reiner Code-Fix, mit dem Deploy wirksam.

---

## MITTEL-2 — Analytics ohne Mandantenbezug (aktiver Schema-Drift)

| | |
|---|---|
| **Datei** | `app/admin/analytics/actions.ts:61,87`; `app/api/ai-chat/route.ts:39`; `supabase/migrations/20260922010000_analytics_org_scope.sql` |
| **Ursache** | `page_views.organization_id` und `visitors.organization_id` existieren live nicht → die Abfragen scheitern mit `42703`. `ai-chat` las `visitor_locations` ganz ohne Org-Filter. |
| **Severity** | 🟠 mittel |
| **Risiko** | Admin-Analytics ist **still kaputt** (leere Liste statt Fehler). Und: Besucherdaten aller Mandanten flossen in eine Aggregation, die anschließend an ein LLM geht — ein DSGVO-Punkt, kein reiner Anzeigefehler. |

**Live nachgestellt.** OpenAPI-Introspektion gegen Production bestätigt: `page_views`, `visitors` und `visitor_locations` haben keine `organization_id`.

### Fix

**Migration `20260922010000`:** `organization_id` auf allen sieben Analytics-Tabellen (`page_views`, `visitors`, `visitor_locations`, `analytics_events`, `partner_visits`, `conversions`, `geo_events`) — Spalte, Backfill Stamm-Org, `DEFAULT current_org_id()`, `NOT NULL`, Index, RESTRICTIVE Fence.

**Code:** `ai-chat` liest `visitor_locations` jetzt mit `.eq('organization_id', orgId)`; `/api/track` und `/api/visitor-alert` setzen bzw. filtern die Organisation serverseitig. Die MIS-Analytics-Seite liest über den Browser-Client — dort greift der RESTRICTIVE Fence automatisch, kein Code nötig.

### Test

`__tests__/security/dsgvo-befunde.test.ts` (Abschnitt MITTEL-2): `visitor_locations` wird org-gefenced gelesen, die Route ist ohne Organisation fail-closed.
`__tests__/security/org-id-klassifizierung.test.ts`: jede der sieben Tabellen steht tatsächlich in der Migration.

### Ergebnis

✅ **Code gelöst** — ⏳ **Live-Apply steht aus.**

**Bis zum Apply meldet `npm run check:schema-drift` weiterhin 4 Treffer** (die zwei bekannten plus die zwei neuen Org-Filter in `ai-chat` und `visitor-alert`). Das ist gewollt: Der rote Check ist das ehrliche Signal, dass eine Migration aussteht — er wurde bewusst **nicht** über die Ausnahmeliste stummgeschaltet. Das Verhalten in der Zwischenzeit ist fail-closed und nicht schlechter als vorher: Die Aggregation bleibt leer, statt mandantenfremde Daten zu liefern.

---

## MITTEL-3 — Pflegenotizen ohne Audit-Eintrag

| | |
|---|---|
| **Datei** | `components/admin/CareNotesPanel.tsx:114` → neu: `app/admin/notizen/actions.ts` |
| **Ursache** | Pflegenotizen wurden direkt aus dem Browser nach `care_notes` geschrieben. |
| **Severity** | 🟠 mittel |
| **Risiko** | RLS trug den Fall (`author_id = auth.uid()`, `author_role`-Bindung, `care_notes_org_fence`) — es war **kein Rechteproblem**. Das Problem war die Protokollierung: Pflegedokumentation entstand vollständig ohne Audit-Eintrag. Zusätzlich kamen `author_role` und `author_name` ungeprüft aus dem Browser. |

### Fix

Neue Server Action `createCareNoteAction`:

* prüft die Admin-Rolle serverseitig gegen `profiles.role`
* `author_id` und `author_name` kommen aus der **Session**, nicht aus dem Formular
* `author_role` und `category` werden gegen `NOTE_AUTHOR_ROLE`/`NOTE_CATEGORY` gefiltert — **abgeleitet, nicht abgeschrieben**, damit sie mit dem CHECK-Constraint aus `20260719000200` synchron bleiben und ein ungültiger Wert nicht erst als `23514` aus der DB zurückkommt
* Längenbegrenzung auf 5000 Zeichen
* fail-closed ohne Organisation
* **jeder Insert erzeugt `logAuditEvent('create', 'care_notes')`** mit Klient, Kategorie, Rolle und Dringlichkeit

### Test

`__tests__/security/client-side-writes.test.ts` — **15 Fälle**, darunter ein **Vollscan aller `'use client'`-Dateien** in `app/` und `components/` nach Direktschreibpfaden. Übrig bleiben genau die zwei im Audit als NIEDRIG eingestuften Fälle (`OnboardingFlow`, `NotificationBell`), beide namentlich freigegeben. Jeder neue Direktschreibpfad lässt den Test fallen.

### Ergebnis

✅ **Geschlossen.** Reiner Code-Fix.

---

## MITTEL-4 — Stripe fehlte in der Datenschutzerklärung

| | |
|---|---|
| **Datei** | `app/datenschutz/page.tsx` |
| **Ursache** | Stripe ist in 10 Dateien aktiv integriert, kam in der Datenschutzerklärung aber **0×** vor. |
| **Severity** | 🟠 mittel |
| **Risiko** | Verstoß gegen Art. 13 Abs. 1 lit. e DSGVO, sobald der Verkauf freigeschaltet wird. Solange `COACH_PREISE_FREIGEGEBEN` nicht gesetzt ist, fließen keine Daten — die Ergänzung ist aber **vor** der Freischaltung zwingend. |

### Fix

Vollständiger Abschnitt „Stripe (Zahlungsabwicklung)": Verantwortliche Stelle (Stripe Payments Europe Ltd., Dublin; für Kartenzahlungen zusätzlich Stripe Inc., USA), verarbeitete Datenkategorien, ausdrücklicher Hinweis, dass Zahlungsdaten die eigenen Systeme nicht erreichen, Rechtsgrundlage (Art. 6 Abs. 1 lit. b und lit. c DSGVO), Drittlandtransfer über EU-Standardvertragsklauseln, Link auf die Stripe-Datenschutzerklärung.

### Test

`__tests__/security/dsgvo-befunde.test.ts` (Abschnitt MITTEL-4) — 4 Fälle: Stripe ist benannt, Zweck/Rechtsgrundlage/Drittlandtransfer stehen drin, der Verweis existiert, **und Stripe ist tatsächlich integriert** (der Abschnitt steht also nicht auf Vorrat).

### Ergebnis

✅ **Geschlossen.**

---

## MITTEL-5 — Cron-Funktion für `anon` ausführbar

| | |
|---|---|
| **Datei** | DB-Funktion aus `20260918000000`; Fix: `supabase/migrations/20260922000000_revoke_anon_cron_funktionen.sql` |
| **Ursache** | In Postgres ist `EXECUTE` auf neuen Funktionen per Default an `PUBLIC` vergeben. `20260918000000` legte `cron_check_ueberfaellige_aufgaben()` an, ohne das REVOKE nachzuziehen. |
| **Severity** | 🟠 mittel |
| **Risiko** | Ein Unbeteiligter kann **ohne Anmeldung** Statuswechsel auf `ops_aufgaben` auslösen — samt `check_aufgabe_eskalation` (Eskalationsstufe + Historie) und `wf_trigger_aufgabe_ueberfaellig` (Workflow-Event). Kein Datenabfluss, aber ein schreibender Pfad von außen. |

**Live nachgestellt, nicht nur aus dem Katalog geschlossen:**

```
POST /rest/v1/rpc/cron_check_ueberfaellige_aufgaben   (anon-Key)
→ HTTP 200  {"checked_at": "2026-08-19T12:14:24.187597+00:00", "marked_overdue": 0}
```

### Fix

`REVOKE ALL` für `PUBLIC`, `anon` und `authenticated`; nur `service_role` behält `EXECUTE`. pg_cron läuft als Superuser und braucht kein Grant.

### Test

`__tests__/security/anon-schreibpfade.test.ts` (Abschnitt MITTEL-5) — 4 Fälle: REVOKE für alle drei Rollen, `service_role` behält `EXECUTE`, Funktion namentlich erfasst, Rollback vorhanden.

### Ergebnis

✅ **Migration fertig** — ⏳ **Live-Apply steht aus.** Bis dahin ist der Pfad in Production offen.

---

## NIEDRIG-3 — offene Insert-Policies auf Tracking-Tabellen

| | |
|---|---|
| **Datei** | `components/PageTracker.tsx:76` → neu: `app/api/track/page-view/route.ts`; Migration `20260922010000` |
| **Ursache** | `page_views`, `visitors`, `visitor_locations` hatten je eine `INSERT`-Policy mit `WITH CHECK (true)` für `public`. |
| **Severity** | 🟡 niedrig |
| **Risiko** | Unbegrenztes Befüllen von außen (Datenmüll, Speicherkosten). Kein Datenabfluss — Lesen war auf `is_admin()` beschränkt. |

### Fix

Neue Route `POST /api/track/page-view`: Rate-Limit 60/min pro IP, feste validierte Feldliste (kein durchgereichtes Objekt), IP und User-Agent aus den Request-Headern statt aus dem Body, `user_id` aus der Session, `organization_id` serverseitig, Service-Role-Client. Jeder Fehlerpfad endet in `{ ok: true }` — Tracking darf die App nie stören.

`PageTracker` schreibt nicht mehr direkt und lädt dadurch **gar kein Supabase-JS mehr** — bisher waren das ~46 KB gzip im First-Load-JS jeder Seite, auch der Marketing-Seiten.

Die Migration entfernt die drei offenen Policies. `visitors` und `visitor_locations` wurden ohnehin nur von `/api/track` mit Service-Role-Key geschrieben.

### Test

`__tests__/security/client-side-writes.test.ts` (Abschnitt NIEDRIG-3) — 6 Fälle: kein Direktschreibpfad mehr, kein Supabase-Import im Tracker, Route ratenbegrenzt, `user_id` aus der Session statt aus dem Body, `organization_id` serverseitig, Migration entfernt alle drei Policies.

### Ergebnis

✅ **Code gelöst** — ⏳ **Policy-Drop mit dem Live-Apply.**

**Reihenfolge beachten:** erst Code deployen, dann Migration anwenden. Umgekehrt würden Browser mit dem alten Bundle beim Insert scheitern (fail-soft, aber unnötig).

---

## NIEDRIG-5 (DSGVO) — kein Art.-15-Export außerhalb PflegeCoach

| | |
|---|---|
| **Datei** | neu: `app/api/user/export/route.ts`, `lib/dsgvo/auskunft.ts` |
| **Ursache** | Exportwege gab es nur für PflegeCoach, FHIR und die Abrechnung. |
| **Severity** | 🟡 niedrig |
| **Risiko** | Auskünfte nach Art. 15 Abs. 3 DSGVO mussten von Hand erstellt werden — zulässig, aber bei wachsender Nutzerzahl nicht tragfähig (Art. 12 Abs. 3 DSGVO: ein Monat). |

### Fix

`GET /api/user/export` liefert eine strukturierte, maschinenlesbare Kopie der eigenen Daten als Download.

**Konstruktionsprinzip:** Gelesen wird **ausschließlich mit dem Nutzer-Client**, nie mit dem Service-Role-Key. RLS entscheidet also, welche Zeilen zur Person gehören — der Export kann konstruktionsbedingt nichts ausliefern, was die Person nicht ohnehin sehen darf. Ein Fehler in der Quellenliste kann so kein Datenleck werden.

13 Quellen (Stammdaten, Kundenakte, Mitarbeiterakte, Engel-Profil, Zeitfenster, betreute Person, Benachrichtigungen, Geräte, Krankenfahrten, Nachrichten, Buchungen, Bewertungen, Empfehlungen). Zweiseitige Quellen (Absender *oder* Empfänger) werden zusammengeführt und dedupliziert. Eine nicht lesbare Quelle lässt die Auskunft nicht scheitern, wird aber im jeweiligen Abschnitt transparent vermerkt. Die Datei nennt Rechtsgrundlage und listet ausdrücklich, was **nicht** enthalten ist (Art. 15 Abs. 4 DSGVO).

Ratenbegrenzt auf 5/Stunde je Konto (Art. 12 Abs. 5 DSGVO), protokolliert als `data_export`. Verlinkt im Kunden- und Engel-Profil als „Meine Daten herunterladen" und in der Datenschutzerklärung beschrieben.

### Test

`__tests__/security/dsgvo-befunde.test.ts` (Abschnitt NIEDRIG-5) — 10 Fälle, darunter:

* die Route liest **nicht** mit `createAdminClient` (weder Route noch Bibliothek)
* jede Quelle filtert auf die eigene Nutzer-ID — über einen Spion-Client verifiziert, nicht nur per Textsuche
* eine nicht lesbare Quelle lässt die Auskunft nicht scheitern, wird aber vermerkt
* zweiseitige Quellen liefern jede Zeile nur einmal
* beide Profilseiten verlinken den Export, die Datenschutzerklärung beschreibt ihn

### Ergebnis

✅ **Geschlossen.**

---

## NIEDRIG-6 (DSGVO-nah) — Reset-Mail versprach eine Dauer, die der Code nicht hält

| | |
|---|---|
| **Datei** | `app/api/auth/send-reset/route.ts` |
| **Ursache** | Die Mail nannte „nur 1 Stunde gültig". Supabase nimmt `expiresIn` bei `generateLink` nicht entgegen; der Wert steht im Dashboard (Default 24 h). |
| **Severity** | 🟡 niedrig |
| **Risiko** | Eine Zusage an Nutzende, die technisch nicht durchgesetzt wird. |

### Fix

Der Audit ließ zwei Wege: Dashboard-Setting verifizieren oder Text anpassen. **Das Dashboard-Setting ist aus der Anwendung heraus nicht auslesbar** (der Audit führt es selbst unter „nicht abgedeckt"). Also der belegbare Weg: Der Text nennt keine konkrete Dauer mehr, sondern die Eigenschaften, die der Code tatsächlich garantiert — begrenzt gültig und **einmal** verwendbar (das Token wird von `verifyOtp` verbraucht) — plus den Hinweis, einfach einen neuen anzufordern. Der Kommentar im Code hält fest, unter welcher Bedingung wieder eine konkrete Dauer stehen darf.

### Test

`__tests__/security/dsgvo-befunde.test.ts` (Abschnitt NIEDRIG-6) — 2 Fälle: keine Stundenangabe im Mailtext, die belegbaren Eigenschaften stehen drin.

### Ergebnis

✅ **Geschlossen.** Verbleibender externer Punkt: Ob die Link-Ablaufzeit im Supabase-Dashboard auf 1 h steht, kann nur dort geprüft werden.

---

## NIEDRIG-7 — Pseudonymitäts-Orakel im PflegeCoach

| | |
|---|---|
| **Datei** | `app/api/coach/freigaben/route.ts:53`; Migration `20260922000000` |
| **Ursache** | `coach_finde_nutzer_id(text)` ist `SECURITY DEFINER` und war laut `20260916000000` ausdrücklich für `authenticated` freigegeben. |
| **Severity** | 🟡 niedrig |
| **Risiko** | Jeder angemeldete Nutzer konnte zu einer beliebigen E-Mail-Adresse abfragen, ob dazu ein PflegeCoach-Konto existiert — eine ungedrosselte Mitgliedschaftsauskunft im Gesundheitskontext (Art. 9 DSGVO). |

### Fix

`EXECUTE` auf `service_role` beschränkt. Der einzige Aufrufer (`/api/coach/freigaben`) nutzt jetzt den Service-Role-Client. Der Lookup steht unverändert hinter `requireCoachUser()` **und** der Prüfung der eigenen Einwilligung — die Reihenfolge war schon vorher richtig gewählt (erst der eigene Fehler, dann fremde Daten).

### Test

`__tests__/security/anon-schreibpfade.test.ts` (Abschnitt NIEDRIG-7) — 4 Fälle: Migration erfasst die Funktion, Route nutzt den Service-Role-Client, Auth- und Einwilligungsprüfung stehen weiterhin **vor** dem Lookup, kein Aufruf mehr über den Nutzer-Client.

### Ergebnis

✅ **Code gelöst** — ⏳ **REVOKE mit dem Live-Apply.**

**Reihenfolge beachten:** erst Code deployen, dann Migration. Umgekehrt bräche der Freigabe-Flow bis zum Deploy.

---

## NIEDRIG-8 — öffentliche Schreibendpunkte ohne Rate-Limit

| | |
|---|---|
| **Datei** | `app/api/auth/send-reset`, `app/api/newsletter`, `app/api/visitor-alert`, `app/api/analytics/capi` |
| **Ursache** | Kein Limit; das Muster existierte bereits in `kontakt`, `lead-inquiry`, `coach/anfrage`, `beratung-chat`. |
| **Severity** | 🟡 niedrig |
| **Risiko** | Mail-Flooding auf fremde Postfächer (`send-reset`, `newsletter`), Admin-Mail-Spam (`visitor-alert`), unbegrenzte Schreiblast. |

**Korrektur zum Audit:** `track`, `track-conversion` und `analytics/vitals` waren bereits ratenbegrenzt — jede dieser Routen bringt einen eigenen Limiter mit. Der Befund traf auf vier statt sieben Endpunkte zu.

### Fix

| Route | Limit |
|---|---|
| `auth/send-reset` | 5/10 min pro IP **und 3/10 min pro Ziel-Adresse** |
| `newsletter` | 5/10 min pro IP |
| `visitor-alert` | 20/min pro IP |
| `analytics/capi` | 60/min pro IP |

Bei `send-reset` ist das Limit pro Ziel-Adresse der eigentliche Schutz — ein Angreifer mit wechselnden IPs kann sonst weiter ein fremdes Postfach fluten. Der bestehende Cooldown in `visitor-alert` half nicht: Er greift erst nach dem DB-Lesezugriff und nur pro *gemeldeter*, also frei wählbarer IP aus dem Body.

`send-reset` antwortet beim Limit weiterhin mit `success: true` statt 429 — ein 429 nur für existierende Adressen wäre selbst ein Existenz-Orakel.

### Test

`__tests__/security/anon-schreibpfade.test.ts` (Abschnitt NIEDRIG-8) — 11 Fälle: alle acht öffentlichen Schreibendpunkte begrenzen die Rate, `send-reset` limitiert zusätzlich pro Ziel-Adresse und verrät auch beim Limit nicht, ob die Adresse existiert.

Dazu eine **Gegenprobe über alle API-Routen**: Jede Route mit `POST`/`PUT`/`PATCH`/`DELETE` muss einen Guard, ein Secret, eine Signaturprüfung oder ein Rate-Limit haben. Die Prüfung folgt dabei lokalen Imports und sieht in der Zieldatei nach — sonst hätte sie die vier Routen falsch gemeldet, bei denen der Guard bewusst in der Service-Schicht sitzt (`billing/*/verifizierung` → `requireOpsAdmin()`). Fünf bewusst offene Endpunkte sind namentlich freigegeben.

### Ergebnis

✅ **Geschlossen.**

---

## Die drei DSGVO-Punkte

| Punkt | Befund | Stand |
|---|---|---|
| Stripe fehlt in der Datenschutzerklärung | MITTEL-4 | ✅ geschlossen |
| Kein Art.-15-Export außerhalb PflegeCoach | NIEDRIG-5 | ✅ geschlossen — Selbstbedienungs-Export live mit dem Deploy |
| Analytics ohne Mandantenbezug | MITTEL-2 | ✅ Code geschlossen — ⏳ Fence mit dem Live-Apply |

Zusätzlich: NIEDRIG-6 (irreführende Gültigkeitsangabe) und NIEDRIG-7 (Mitgliedschafts-Orakel im Gesundheitskontext, Art. 9 DSGVO).

---

## Live-Apply — der verbleibende Schritt

Drei Migrationen sind geschrieben, jeweils mit Rollback, und warten auf die Anwendung gegen Production. **In dieser Reihenfolge, und erst nach dem Code-Deploy:**

| # | Migration | Inhalt | Rollback |
|---|---|---|---|
| 1 | `20260922000000_revoke_anon_cron_funktionen.sql` | MITTEL-5 + NIEDRIG-7 — reine Rechte-Entziehung | `…000001` |
| 2 | `20260922010000_analytics_org_scope.sql` | MITTEL-2 + NIEDRIG-3 — Spalte, Fence, Policy-Drop | `…010001` |
| 3 | `20260922020000_hoch1_mandantentrennung.sql` | HOCH-1 — `current_org_id()`, 18 Fences, 9 verengte Policies | `…020001` |

```
node scripts/apply-migration.mjs 20260922000000_revoke_anon_cron_funktionen.sql
node scripts/apply-migration.mjs 20260922010000_analytics_org_scope.sql
node scripts/apply-migration.mjs 20260922020000_hoch1_mandantentrennung.sql
```

**Warum der Deploy zuerst kommt:** Migration 1 entzieht `coach_finde_nutzer_id` das Recht für `authenticated` — bis der neue Code (Service-Role-Client) live ist, bräche der Freigabe-Flow. Migration 2 entfernt die offene `INSERT`-Policy auf `page_views` — bis der neue `PageTracker` ausgeliefert ist, würden alte Bundles beim Insert scheitern (fail-soft, aber unnötig).

**Am Apply-Werkzeug war eine Reparatur nötig.** `scripts/apply-migration.mjs` schickt den Dateiinhalt an `public._run_sql`, das ihn per `EXECUTE` in einer plpgsql-Funktion ausführt. Postgres lehnt dort Transaktionsbefehle ab:

```
0A000  EXECUTE of transaction commands is not implemented
```

Das Skript entfernt jetzt ein führendes `BEGIN;` und ein abschließendes `COMMIT;`. **Die Atomarität geht dabei nicht verloren** — der Funktionsaufruf läuft selbst in einer Transaktion, der ganze Rumpf fällt also gemeinsam durch. Die Migrationsdateien behalten `BEGIN`/`COMMIT`, damit sie unverändert im Supabase-SQL-Editor und per `psql` anwendbar bleiben.

### Verifikation nach dem Apply

```sql
select public.current_org_id();
select count(*) from page_views      where organization_id is null;  -- 0
select count(*) from krankenfahrten  where organization_id is null;  -- 0
select policyname from pg_policies
 where tablename in ('page_views','visitors','visitor_locations') and cmd = 'INSERT';  -- leer
select qual from pg_policies where tablename='profiles' and policyname='profiles_select_admin';
 -- muss nutzer_in_aktiver_org enthalten
```

```bash
npm run check:schema-drift        # danach 0 Treffer
npx tsx scripts/rls-matrix.ts     # Matrix neu erzeugen
node scripts/verify-anon-exposure.mjs
```

Und die Live-Gegenprobe zu MITTEL-5 — muss nach dem Apply **nicht** mehr `200` liefern:

```
POST /rest/v1/rpc/cron_check_ueberfaellige_aufgaben   (anon-Key)
```

---

## Was hier *nicht* erledigt ist

Damit der Bericht nicht mehr behauptet, als er belegt:

1. **Die Migrationen sind nicht live.** HOCH-1, MITTEL-2, MITTEL-5 und NIEDRIG-3/-7 gelten in Production bis zum Apply unverändert. Der Nachweis ist auf einer echten PostgreSQL-Instanz erbracht (PGlite), **nicht** per Impersonation gegen Production.

2. **`npm run lint` ist rot — und war es schon vorher.** Der Audit meldete für Commit `3b939d0` „Exit 0, 0 Findings". Auf `fa9b37b` meldet derselbe Befehl **9717 Fehler in 66126 Problemen**, verteilt über den gesamten Bestand (`@typescript-eslint/no-explicit-any`, `react-hooks/set-state-in-effect`). Gegenprobe an unberührten Dateien: `lib/audit-log.ts` allein hat 2 Fehler, `app/kunde/buchungen/page.tsx` 7. Das ist **kein** Ergebnis dieser Arbeit — offenbar hat eine ESLint-/Config-Aktualisierung seit dem Audit bestehende Warnungen zu Fehlern hochgestuft. Die hier neu angelegten Dateien sind lint-sauber. Der Bestand aufzuräumen ist eine eigene Aufgabe.

3. **Kein authentifizierter Cross-Tenant-Test gegen Production.** Gleiche Einschränkung wie im Ausgangs-Audit.

4. **Supabase-Dashboard-Einstellungen** (Link-Ablaufzeit, MFA, JWT-Laufzeit) sind über die API nicht auslesbar und weiterhin ungeprüft — siehe NIEDRIG-6.

5. **Schreibrechte auf Referenzdaten** (`billing_*`, `kf_pricing_*`, `bundeslaender`) sind mandantenübergreifend wirksam. Heute unkritisch, weil nur `is_admin()`/`service_role` schreiben und produktiv nur die Stamm-Organisation existiert. Vor dem ersten Fremdmandanten ist zu entscheiden, ob diese Tabellen für Mandanten-Admins schreibgeschützt werden (Empfehlung: ja, nur `superadmin`).

6. **PflegeCoach-Belegkontext ungeklärt.** `coach_bestellungen`, `coach_zahlungen`, `coach_rechnungen`, `coach_freischaltungen` brauchen eine Mandantenzuordnung, sobald mehr als ein Mandant PflegeCoach verkauft — als eigener Beleg-Kontext, nicht als Spalte an den Gesundheitsdaten. Produktentscheidung, keine Migration.

7. **NIEDRIG-1, -2, -4 sind bewusst offen geblieben.** NIEDRIG-1 (zweite Guard-Ebene auf Admin-Seiten) ist laut Audit funktional korrekt und durch RLS + API-Guards getragen; NIEDRIG-2 (flächendeckender Audit-Nachweis) ist eine Daueraufgabe über 255 Routen; NIEDRIG-4 (`.env` in der Historie) ist geprüft und ohne Handlungsbedarf.

---

## Geänderte und neue Dateien

**Neu — Migrationen (6):**
`20260922000000_revoke_anon_cron_funktionen.sql` + Rollback · `20260922010000_analytics_org_scope.sql` + Rollback · `20260922020000_hoch1_mandantentrennung.sql` + Rollback

**Neu — Code (4):**
`lib/dsgvo/auskunft.ts` · `app/api/user/export/route.ts` · `app/api/track/page-view/route.ts` · `app/admin/notizen/actions.ts`

**Neu — Tests (5, 91 Fälle):**
`__tests__/security/org-fail-closed.test.ts` (30) · `__tests__/security/hoch1-mandantentrennung-pglite.test.ts` (27) · `__tests__/security/dsgvo-befunde.test.ts` (19) · `__tests__/security/anon-schreibpfade.test.ts` (19) · `__tests__/security/client-side-writes.test.ts` (15) · `__tests__/security/org-id-klassifizierung.test.ts` (12)

**Neu — Dokumentation:**
`docs/SECURITY_FIXES_2026-08-19.md` · `docs/security/ORG_ID_KLASSIFIZIERUNG.md` · `scripts/org-id-klassifizierung.json`

**Geändert (Auswahl):**
`lib/organizations/server.ts` (Kern des MITTEL-1-Fixes) · 7 Guards in `lib/*/api-auth.ts` · 21 Rollen-Server-Actions · 14 API-Routen · `app/datenschutz/page.tsx` · `components/PageTracker.tsx` · `components/admin/CareNotesPanel.tsx` · `scripts/apply-migration.mjs` · 3 bestehende Testdateien (Mocks an den neuen Fail-closed-Kontrakt gezogen)
