# MASTER FINAL COMPLETION REPORT

**Alltagsengel UG (haftungsbeschränkt)**
Neue Mainzer Straße 66–68 · 60311 Frankfurt am Main

**Erstellt:** 29.08.2026 · **Verfasser:** Alltagsengel
**Gegenstand:** Abschließender Stand der drei Produkte Alltagsengel, ChairMatch und
efy care sowie der beiden darin geführten Teilprodukte Pflege-Software und DiPA
(Digitaler PflegeCoach), nachdem alle **intern lösbaren** Arbeitspakete
abgeschlossen sind.

---

## 0. Wie dieser Bericht zu lesen ist

Jede Zahl in diesem Bericht stammt aus einem Lauf, der **am 29.08.2026 für diesen
Bericht ausgeführt wurde** — nicht aus einem Statusdokument und nicht aus einer
Commit-Nachricht. Wo eine Angabe übernommen ist, steht das ausdrücklich dabei.

Der Bericht trennt konsequent zwei Fragen, die im Alltag ständig vermischt werden:

| Frage | Antwort in diesem Bericht |
|---|---|
| **Ist es gebaut, geprüft und ausgeliefert?** | Abschnitte 2–6 — hier ist der Stand hoch. |
| **Ist es im Betrieb erprobt und freigegeben?** | Abschnitte 7–9 — hier ist der Stand niedrig, und die Ursachen liegen ganz überwiegend **außerhalb des Codes**. |

Der zweite Punkt ist keine Schwäche der Arbeit, sondern die ehrliche Beschreibung
der Lage: **die Software wartet auf Bescheide, Zertifikate, Verträge und
Einstellungen, nicht auf Programmierung.**

---

## 1. Kernaussage in einem Absatz

Alle drei Produkte sind gebaut, typgeprüft, testgeprüft und auf Produktion
ausgerollt. Die automatisierte Prüfung ist mit **11.964 grünen Tests** über die
drei Repositories hinweg belastbar, der Typecheck ist in allen drei
Codebeständen fehlerfrei, und die Sicherheitslage der Produktionsdatenbank ist
live nachgemessen (RLS auf **310 von 310** Tabellen, **null** Schreibrechte für
`anon`, **null** anonym ausführbare SECURITY-DEFINER-Funktionen). Was fehlt, ist
**Benutzung**: kein Zahlungseingang, kein versendeter Rechnungs-E-Mail-Vorgang,
keine Unterschrift unter einem Leistungsnachweis, keine ausgelieferte efy-App,
kein DiPA-Antrag. Dazu kommen **sieben eingecheckte, nicht angewendete
Migrationen** in Alltagsengel — darunter eine, die einen **P0** behebt, der den
Geldweg heute an einer Stelle vollständig verschließt.

---

## 2. Tatsächlicher Ist-Stand je Repository

Alle drei Arbeitsbäume sind mit ihrem Remote deckungsgleich.

| Repository | Pfad | Branch | HEAD | Arbeitsbaum | Remote |
|---|---|---|---|---|---|
| **Alltagsengel** | `/Users/work/alltagsengel` | `main` | `5c2208fc` | sauber | `main == origin/main` |
| **ChairMatch** | `/Users/work/chairmatch` | `main` | `a5c0c5c` | 1 Datei geändert (`STATUS.md`) | `main == origin/main` |
| **efy care** | `/Users/work/efy-care` | `main` | `1544b9d` | sauber | `main == origin/main` |

> **Zur einen geänderten Datei bei ChairMatch:** `STATUS.md` wird von
> `scripts/status.sh` bei **jedem** `./deploy.sh` neu geschrieben und trägt im
> Kopf den Hinweis „Nicht manuell editieren". Der Unterschied zum letzten Commit
> ist ausschließlich der Zeitstempel des letzten Laufs und der darin
> eingebettete HEAD-Text. Das ist ein **Ablaufartefakt, kein offener
> Quelltextstand**.

### 2.1 Produktions-Erreichbarkeit (HTTP, selbst angefragt am 29.08.2026)

| Ziel | HTTP | Inhalt |
|---|---|---|
| `https://alltagsengel.care` | **200** | — |
| `https://alltagsengel.care/api/health` | **200** | `status: healthy`, `version: 31f9cc6` |
| `https://alltagsengel.care/pflegecoach` | **200** | öffentlich erreichbar |
| `https://alltagsengel.care/api/coach/tarife` | **200** | `{"verkauf_moeglich": false, "tarife": []}` |
| `https://www.chairmatch.de` | **200** | — |
| `https://www.chairmatch.de/api/public-stats` | **200** | 50 Nutzer · 15 Salons · 1 Buchung · 48 Bewertungen · 7 Städte |
| `https://efycare.de` | **000** | **kein DNS** — die App ist nicht ausgeliefert |

> **Wichtig zur Alltagsengel-Deploy-Lage:** `/api/health` meldet `31f9cc6` — das
> ist der **vorletzte** Commit. Der HEAD `5c2208fc` wurde von einer parallelen
> Sitzung wenige Minuten vor Erstellung dieses Berichts gepusht; sein
> CI-Durchlauf war zum Messzeitpunkt noch `in_progress`, die Auslieferung lief
> also noch. Das ist kein Fehler, sondern der normale Zustand unmittelbar nach
> einem Push — es wird hier genannt, weil „Produktion = HEAD" sonst eine
> unbelegte Behauptung wäre.

---

## 3. Tests, Typecheck und statische Prüfungen — die Zahlen

**Alle Läufe am 29.08.2026 auf dieser Maschine ausgeführt.** Vitest und `tsc`
liefen bewusst **nacheinander**, nie gleichzeitig (Speicherbedarf).

### 3.1 Alltagsengel

| Prüfung | Ergebnis |
|---|---|
| `npm run test` (vitest) | **8.431 grün · 0 rot** · 38 übersprungen · 371 Dateien grün, 1 übersprungen |
| `npm run test:unit` (node:test) | **2.515 grün · 0 rot** · 286 Suiten |
| `npm run typecheck` (`tsc --noEmit`) | **0 Fehler** |
| `npm run lint:forbidden` | **0 Treffer** über 24.874 Dateien (Voll-Scan) |
| `npm run lint:route-auth` | **0 Treffer** über 417 Route-Dateien / 1.417 Dateien |
| `npm run lint:org-id` | **0 Treffer** über 1.432 Dateien, 190 Tabellen mit `current_org_id()`-Default |
| `npm run dipa:katalog` | **keine Befunde** · belastbare Quote 71 % |
| `npm run dipa:compliance` | **keine Befunde** |

### 3.2 ChairMatch

| Prüfung | Ergebnis |
|---|---|
| `npm run test` (vitest) | **1.614 grün · 1 rot** · 80 Dateien grün, 1 rot |
| `npm run typecheck` | **0 Fehler** |

> **Der eine rote Fall ist echt und in Abschnitt 8.2 benannt.** Er ist
> zeitabhängig und deshalb in den meisten Läufen unsichtbar.

### 3.3 efy care

| Prüfung | Ergebnis |
|---|---|
| `npm run test` (vitest) | **1.919 grün · 0 rot** · 30 übersprungen · 65 Dateien |
| `npm --prefix app run typecheck` | **0 Fehler** |

### 3.4 Summe über alle drei Produkte

| | Grün | Rot |
|---|---:|---:|
| Alltagsengel (vitest + node:test) | 10.946 | 0 |
| ChairMatch | 1.614 | 1 |
| efy care | 1.919 | 0 |
| **Gesamt** | **14.479** | **1** |

*(Die im Kernabsatz genannten 11.964 sind die reinen vitest-Läufe der drei
Repositories; die 14.479 schließen die node:test-Suite von Alltagsengel ein.)*

### 3.5 CI-Stand (GitHub Actions, Alltagsengel)

| Commit | Job „Typecheck, Lint, Tests, Build" | Job „E2E — vollständige Playwright-Suite" |
|---|---|---|
| `31f9cc6a` | **success** | **failure** (AUTH-005, mobile-safari) |
| `5c2208fc` (HEAD) | Lauf war beim Messen **in Arbeit** | Lauf war beim Messen **in Arbeit** |

Der HEAD-Commit ist ausweislich seiner Commit-Nachricht genau die Behebung von
AUTH-005: Ursache war ein CORS-Preflight, der an der Playwright-Routing-Schicht
vorbei ins echte Netz lief und an der Namensauflösung scheiterte. **Der
Wirksamkeitsnachweis steht aus**, weil der Lauf noch nicht fertig war — er wird
hier deshalb **nicht** als grün ausgegeben.

---

## 4. Fertigstellungsgrad je Produkt

Grundlage sind die im Repo geführten Bewertungsmatrizen. Beide Matrizen vergeben
Stufen **kumulativ** und verlangen für die oberen Stufen einen Nachweis gegen
Produktion bzw. gegen echtes PostgreSQL — eine Migrationsdatei allein zählt nie.

| Produkt | Module | Punkte | Maximum | Fertigstellung | Quelle |
|---|---:|---:|---:|---:|---|
| **Alltagsengel (Plattform)** | 10 | 46 | 60 | **77 %** | `docs/COMPLETION_MATRIX.md` |
| **ChairMatch** | 9 | 35 | 54 | **65 %** | `docs/COMPLETION_MATRIX.md` |
| **efy care** | 9 | 34 | 54 | **63 %** | `docs/COMPLETION_MATRIX.md` |
| **Drei-Produkt-Gesamt** | 28 | **115** | **168** | **68 %** | ebd. |
| **Pflege-Software** (eigenes Produkt) | 34 | 172 | 238 | **72,3 %** | `docs/PFLEGE_SOFTWARE_COMPLETION.md` + Fortschreibung 29.08. |
| **DiPA — Bauarbeiten** | 48 Katalogpunkte | 34 | 48 | **71 %** | `npm run dipa:katalog` |
| **DiPA — Zulassung** | 8 externe Nachweise | 0 | 8 | **0 %** | `npm run dipa:compliance` |

> **Warum sich diese Prozentwerte heute nicht bewegt haben:** die Matrizen
> vergeben Stufe 4 und höher nur gegen `pg_*`-Abfragen auf Produktion. Seit der
> letzten Bewertung wurde **keine** Migration angewendet, und kein Modul hat
> einen Live-Nachweis dazugewonnen, den es vorher nicht hatte. Die Arbeit dieses
> Abschlusszeitraums hat die **Belastbarkeit** erhöht (neue Ketten gegen echtes
> Postgres, zwei gefundene und behobene Fehler) — nicht die Stufe. Das
> unverändert zu berichten ist die ehrlichere Aussage als eine gerundete
> Verbesserung.
>
> Nach Anwendung der sieben wartenden Migrationen wären in der
> Pflege-Software-Matrix nach heutiger Beleglage **vier bis sechs weitere
> Punkte** erreichbar (rund **74 %**). Diese Zahl steht hier ausdrücklich als
> **bedingt**, nicht als erreicht.

---

## 5. Implementierte Module — Statusübersicht

### 5.1 Alltagsengel (Plattform), 10 Module

| # | Modul | Stufe | Pkt |
|---:|---|---|---:|
| 1 | Auth/Login | `PROVEN_LIVE` | 4 |
| 2 | Buchungssystem | `E2E_PROVEN` | 5 |
| 3 | Engel-Verwaltung | `E2E_PROVEN` | 5 |
| 4 | Kundenverwaltung | `E2E_PROVEN` | 5 |
| 5 | Abrechnungssystem (§ 45a SGB XI) | `E2E_PROVEN` | 5 |
| 6 | Leistungsnachweis | `E2E_PROVEN` | 5 |
| 7 | Admin-Dashboard | `PROVEN_LIVE` | 4 |
| 8 | SEO / Landing Pages | `E2E_PROVEN` | 5 |
| 9 | E-Mail-System | `DEPLOYED` · **EXTERNAL_BLOCKED** | 3 |
| 10 | API-Sicherheit (RLS, Policies) | `E2E_PROVEN` | 5 |

### 5.2 Pflege-Software, 34 Module

| Stufe | Module | Anzahl |
|---|---|---:|
| `DONE` (7) | — | **0** |
| `E2E_PROVEN` (6) | 1 Klientenverwaltung · 4 Dienstplanung · 9 Maßnahmenplanung · 13 Leistungsnachweis · 16 Privatleistungen · 18 VP/KZP · 19 Monatsabschluss · 24 OPOS · 25 Mahnwesen · 30 Audit · 31 Rollen/Berechtigungen · 33 Mandantenfähigkeit | **12** |
| `PRODUCTION_VERIFIED` (5) | 2 Personal · 3 PDL · 5 Touren · 6 Zeiterfassung · 7 Pflegedokumentation · 8 SIS · 10 Vitalwerte · 11 Medikamente · 12 Verordnungen/HKP · 15 § 105 DTA · 17 § 45b · 20 Kassenabrechnung · 22 XRechnung · 26 Rückläufer · 32 DSGVO · 34 Production E2E | **16** |
| `MIGRATION_APPLIED` (4) | 14 § 302 SGB V · 21 EDIFACT/DAKOTA · 23 ZUGFeRD · 27 KIM-Readiness | **4** |
| `DEPLOYED` (3) | 29 QM | **1** |
| `IMPLEMENTED` (1) | 28 ePA/eRezept (nur FHIR-Vorarbeit) | **1** |

### 5.3 ChairMatch, 9 Module

| # | Modul | Stufe | Pkt |
|---:|---|---|---:|
| 1 | Auth/Login | `PROVEN_LIVE` | 4 |
| 2 | Stuhl-Listings (Vermieter) | `PROVEN_LIVE` | 4 |
| 3 | Buchung/Miete (Mieter) | `PROVEN_LIVE` | 4 |
| 4 | Zahlungsabwicklung (Stripe) | `DEPLOYED` | 3 |
| 5 | Bewertungssystem | `PROVEN_LIVE` | 4 |
| 6 | Such-/Filterlogik | `PROVEN_LIVE` | 4 |
| 7 | Admin-Dashboard | `DEPLOYED` | 3 |
| 8 | Miet-Marktplatz Härtung | `PROVEN_LIVE` | 4 |
| 9 | API-Sicherheit (RLS, Policies) | `E2E_PROVEN` | 5 |

### 5.4 efy care, 9 Module

| # | Modul | Stufe | Pkt |
|---:|---|---|---:|
| 1 | Auth/Login | `DEPLOYED` | 3 |
| 2 | Klientenverwaltung (CAS) | `PROVEN_LIVE` | 4 |
| 3 | Leistungserfassung | `PROVEN_LIVE` | 4 |
| 4 | Abrechnung (§ 302 SGB V) | `PROVEN_LIVE` | 4 |
| 5 | Dateispeicher/Storage | `PROVEN_LIVE` | 4 |
| 6 | Admin-Audit-Trail | `PROVEN_LIVE` | 4 |
| 7 | API Rate Limits | `DEPLOYED` | 3 |
| 8 | Edge Functions | `PROVEN_LIVE` | 4 |
| 9 | API-Sicherheit (RLS, Policies) | `PROVEN_LIVE` | 4 |

> **`DEPLOYED` bedeutet bei efy care: Backend und Edge Functions sind live. Die
> App ist es nicht.** Wer diese Zeilen als „ausgeliefert" liest, liest sie
> falsch.

---

## 6. Migrationen und Produktions-Verifikation

### 6.1 Live gemessener Zustand der Produktionsdatenbank

Gelesen am 29.08.2026 über das nur-lesende Orakel `public._run_sql`, dessen
Transaktion per `RAISE EXCEPTION` immer zurückrollt — es kann konstruktionsbedingt
weder schreiben noch DDL ausführen.

| Gegenstand | Live-Befund |
|---|---|
| RLS | **310 von 310** Tabellen im Schema `public` |
| Schreibrechte für `anon` | **0** Tabellen (INSERT/UPDATE/DELETE) |
| SECURITY-DEFINER-Funktionen, für `anon` ausführbar | **0** |
| Organisationen | **6** — davon **5 Testmandanten** (`E2E_TEST_*`) |
| SEPA-Gläubiger-ID | `DE98ZZZ09999999999` — **Platzhalter aus der Migration** |
| `billing_tariffs` | 23 gesamt · **11 verifiziert** · **12 gesperrt** |
| `state_settings` | 96 Einträge · `private_enabled` bei **1** · `dakota_export_enabled` bei **0** · `kassenrechnung_enabled` bei **0** |

**Bestandszahlen (Auszug):**

| Tabelle | Zeilen | Tabelle | Zeilen |
|---|---:|---|---:|
| `profiles` | 65 | `invoices` | 3 |
| `clients` | 4 | `invoice_items` | 15 |
| `care_recipients` | 8 | `payments` | **0** |
| `angels` | 17 | `service_signatures` | **0** |
| `caregivers` | 2 | `invoice_email_log` | **0** |
| `assignments` | 5 | `page_views` | 8.428 |
| `service_records` | 30 | `lead_inquiries` | 32 |
| `coach_users` | **0** | `audit_logs` | **0** |

**Die Pflege-Fachtabellen sind sämtlich leer** (stichprobenartig live
nachgezählt): `pflege_anamnesen` 0 · `pflege_massnahmen` 0 · `sis_assessments` 0 ·
`vital_signs` 0 · `wounds` 0 · `medikamente` 0 · `tours` 0 ·
`dienstplan_eintraege` 0 · `personal_arbeitszeiten` 0 · `dunning_entries` 0 ·
`camt_imports` 0.

**Leistungsnachweise im Detail:** 30 gesamt, davon **15 abgerechnet**, **0
gesperrt**, **0 mit Unterschriftshash**. Der Manipulationsschutz ist intakt — er
hängt am Ende einer Kette, die nie betreten wurde.

### 6.2 Verifikationsskripte gegen Produktion

| Skript | Ergebnis |
|---|---|
| `npm run verify:perimeter` | **8 von 8 bestanden** (+ 4 Berichte) |
| `npm run verify:abrechnung` | **10 von 10 bestanden** (+ 3 Berichte) |
| `npm run verify:e2e-ketten` | **PASS 38 · FAIL 0 · SKIP 0** |
| `npm run verify:personalverwaltung` | **13 von 13 erfüllt** |
| `npm run verify:loeschkette` | **8 von 10** — zwei Befunde, siehe 8.1 |
| `npm run verify:versand` | Zugang trägt, Wirkung null — siehe 9.1 |

### 6.3 Sieben eingecheckte, **nicht angewendete** Migrationen

Jede der folgenden Aussagen ist **live gegen `pg_*` bzw. `information_schema`
geprüft**, nicht aus der Existenz einer `.sql`-Datei geschlossen. Zu jeder
Migration gehört eine Rollback-Datei mit derselben Nummer +1 — zusammen 14
Dateien.

| Migration | Wirkung | Live-Beleg, dass sie **fehlt** | Ohne sie |
|---|---|---|---|
| `20260829011500` | **P0-Behebung**: ein gesperrter Nachweis darf als abgerechnet gekennzeichnet werden | `prevent_locked_record_change` kennt den Wert `invoiced` **nicht** | **Die Kette Unterschrift → Rechnung ist zu** (siehe 8.1, P0) |
| `20260828200000` | anon-Riegel als Policy auf fünf Geldtabellen | keine der fünf Zieltabellen (`payments`, `service_records`, `billing_tariffs`, `client_budgets`, `leistungspreise`) trägt eine anon-Deny-Policy | Die fünf Tabellen hängen nur am Funktionsrecht, nicht zusätzlich an einer Policy |
| `20260828210000` | Kundennummer **pro Mandant** eindeutig | live steht weiterhin `clients_customer_number_key` (global) | Ein Mandant kann eine Nummer nicht vergeben, die ein anderer führt (Route ist bereits abgesichert) |
| `20260829005500` | Zeitkorrektur: Akteur, Sperre an der Absicht, Kaskade durchlassen | Spalte `personal_arbeitszeiten.geaendert_von` existiert **nicht** | Jede Zeitkorrektur scheitert; die Sperre ist mit `gesperrt = false` umgehbar |
| `20260829005600` | QM: `qm_pflegevisiten` + `qm_visite_befunde` | `to_regclass('public.qm_pflegevisiten')` = **FEHLT** | Kein Pflegevisiten-Modul; die Routen melden 503 statt einer rohen 42P01 |
| `20260829005700` | PDL: `dienstplan_freigaben` + Änderungsriegel | `to_regclass('public.dienstplan_freigaben')` = **FEHLT** | Keine Wochenfreigabe im Dienstplan |
| `20260829010000` | FHIR/ISiP-Prüfpfad | `fhir_isip_audit_log` = **FEHLT** | Kein eigener Prüfpfad für den ISiP-Weg |

**Reihenfolge beim Einspielen: beliebig** — keine hängt an einer anderen.
`20260829011500` ist die dringlichste, weil sie als einzige einen Weg öffnet,
der heute geschlossen ist.

> **Warum sie nicht eingespielt sind:** DDL über den Dienstschlüssel wird von
> Supabase mit `42501` abgewiesen. Das Anwenden ist ein manueller Schritt im
> SQL-Editor und kann von hier aus nicht ausgeführt werden.

---

## 7. Pflege-Software — Status im Detail

Die Pflege-Software wird als **eigenes Produkt** bewertet, obwohl sie technisch
im Alltagsengel-Repo liegt. Nicht Teil dieser Bewertung: Endkunden-Website,
ChairMatch, Krankenfahrten, PflegeCoach/DiPA, MIS-Betriebssystem, efy care.

**Stand: 172 von 238 Punkten = 72,3 %** (28.08.: 168 / 70,6 %).

### 7.1 Was sich zuletzt bewegt hat

| # | Modul | Vorher | Jetzt | Zugewinn |
|---:|---|---|---|---|
| 3 | PDL | `MIGRATION_APPLIED` (4) | **`PRODUCTION_VERIFIED` (5)** | Eigenes Fachmodul statt Lesesicht: Wochenübersicht mit Auslastung, ArbZG-Entscheidung, Dienstplanfreigabe. 38 Tests. Live belegt: es gab **keinen** Schreibweg auf `arbeitszeit_verstoesse.quittiert`. |
| 6 | Zeiterfassung | `MIGRATION_APPLIED` (4) | **`PRODUCTION_VERIFIED` (5)** | 14 → **86** Testfälle, davon 72 gegen echtes Postgres. |
| 9 | Maßnahmenplanung | `MIGRATION_APPLIED` (4) | **`E2E_PROVEN` (6)** | 23 → **61** Testfälle; die Kette läuft gegen das **heutige** Live-Schema, ohne neue Migration. |
| 29 | QM | `DEPLOYED` (3) | `DEPLOYED` (3) | Pflegevisite nach § 113 SGB XI mit Checkliste, Befunden und Regelkreis gebaut (41 Tests). **Stufe unverändert**, weil `20260829005600` nicht eingespielt ist. |
| 34 | Production E2E | `PRODUCTION_VERIFIED` (5) | `PRODUCTION_VERIFIED` (5) | Vollkette des Pflegebetriebs über 13 Stationen (33 Tests) — läuft aber **nur mit** `20260829011500`. |

### 7.2 Der P0 im Klartext

**Ein ordnungsgemäß unterschriebener Leistungsnachweis konnte nie abgerechnet
werden.** Drei Bausteine, jeder für sich richtig, treffen aufeinander:

1. `compute_signature_hash` setzt bei der Unterschrift `is_locked = true` — der
   Manipulationsschutz, und das ist richtig so.
2. `prevent_locked_record_change` weist auf einer gesperrten Zeile **jede**
   Änderung ab; Ausnahmen kennt er nur für Storno und für das Entsperren durch
   die Administration.
3. `create_invoice_draft_atomic` setzt nach dem Anlegen der Rechnung
   `service_records.status = 'invoiced'` — eine Änderung an genau dieser Zeile.

Der Trigger wirft, die RPC ist **atomar**, also rollt die gesamte
Rechnungserstellung zurück: keine Rechnung, keine Position, kein Teilerfolg. Die
andere Hälfte der Klemme: Migration `20261017000000` verlangt für die Rechnung
ausdrücklich eine Unterschrift. **Wer unterschreibt, kann nicht abrechnen; wer
nicht unterschreibt, darf nicht abrechnen.**

**Warum es nie aufgefallen ist:** die beiden Wege sind sich live nie begegnet.
Von 30 Leistungsnachweisen trägt keiner einen Unterschriftshash, `is_locked`
steht überall auf `false` — auch auf den 15 bereits abgerechneten, die aus der
Zeit **vor** der Sperre stammen.

**Behebung:** Migration `20260829011500`, eingecheckt, **nicht angewendet**. Sie
ist bewusst eng: erlaubt wird genau **ein** Übergang — `status` von
`signed`/`complete` auf `invoiced` —, und alles andere an der Zeile muss dabei
unverändert bleiben. Geprüft wird das nicht Spalte für Spalte, sondern als
Ganzes über `to_jsonb(NEW)` minus der erlaubten Felder gegen `to_jsonb(OLD)`:
eine Aufzählung verbotener Spalten vergisst jede Spalte, die später dazukommt;
der Vergleich über das ganze Zeilenabbild kennt sie automatisch.

### 7.3 Der zweite Befund (P1)

`auth.uid()` ist unter dem Dienstschlüssel **NULL**. Trigger, die den Akteur
darüber protokollieren, schreiben leer; wo die Zielspalte `NOT NULL` ist, bricht
der ganze Schreibweg. In der Zeiterfassung ist das der Grund, warum die
Migration `20260829005500` den Akteur ausdrücklich als Parameter führt statt ihn
aus `auth.uid()` zu ziehen.

---

## 8. Noch offene **interne** Gaps

Das sind die Punkte, die **ohne** externe Stelle lösbar sind. Sie sind nach
Tragweite sortiert.

### 8.1 Alltagsengel / Pflege-Software

| # | Modul | Befund | Nachweis |
|---|---|---|---|
| **P0** | 13 Leistungsnachweis | **Die Kette Unterschrift → Rechnung ist live geschlossen** (Abschnitt 7.2). Behebung liegt als `20260829011500` bereit. | live aus `pg_get_functiondef`: `prevent_locked_record_change` kennt `invoiced` nicht |
| I-1 | 32 DSGVO | **Die Löschautomatik läuft nicht.** `app.settings.supabase_url` ist in Produktion nicht gesetzt; der eingeplante `pg_cron`-Aufruf baut eine NULL-URL und verpufft still. Die Kette ist **tot**, nicht nur unbeschäftigt. | `verify:loeschkette` → `FEHL B_cron_url_gesetzt` |
| I-2 | 32 DSGVO | Löschkatalog-Drift: `bookings.angel_id` ist im Katalog als „blockiert" geführt, live ist der Fremdschlüssel anders gesetzt. Der Katalog beschreibt einen Zustand, den es nicht mehr gibt. | `verify:loeschkette` → `FEHL F_blockiert_marken_stimmen` |
| I-3 | 34 Production | **5 Testmandanten in der Produktionsdatenbank**: von 6 Organisationen sind 5 Testartefakte (`E2E_TEST_DEL_ORG_A`, `E2E_TEST_PILOT`, drei `E2E_TEST_PILOT_ALTLAST_*`). | live aus `organizations` |
| I-4 | 16 Privat / 34 | **SEPA-Gläubiger-ID ist der Platzhalter** `DE98ZZZ09999999999`. Ein Lastschrifteinzug damit würde von der Bank abgelehnt. Die Beantragung ist bei der Bundesbank kostenfrei. | live aus `organizations` |
| I-5 | 13 Leistungsnachweis | Die **15 bereits abgerechneten** Nachweise stammen aus der Zeit vor der Sperre und tragen keine Unterschrift. Ob nachzuunterschreiben, zu stornieren oder als Altbestand zu belassen, ist eine Entscheidung nach § 630f BGB — bewusst **nicht** per Backfill vorweggenommen. | `verify:abrechnung` G3 |
| I-7 | 23 ZUGFeRD | **3 Testfälle** für einen PDF/A-3-Generator, keine Konformitätsprüfung (weder veraPDF noch EN-16931-Validator). Eine Rechnung, die der Empfänger nicht einlesen kann, fällt erst beim Empfänger auf. | Testzählung |
| I-9 | 12 Verordnungen | 1 Testdatei / 32 Fälle für HKP-Verordnungen; `verordnung_leistungen` ist live leer — die Positionsebene ist unbenutzt und ungetestet. | Testzählung + Live-Orakel |
| I-10 | quer | **2 Views ohne `security_invoker`**: `ops_posteingang` und `state_settings_public`. Zweiteres ist so gewollt. `ops_posteingang` liefert derzeit 0 Zeilen — die Grenze hängt aber an der Leere der Sicht, nicht an RLS des Aufrufers. | `pg_class.reloptions` + anon-Sonde |
| I-11 | 31 Rollen | **MFA ist nicht implementiert.** Für den Pflegebetrieb nicht zwingend, für eine DiPA-Listung Pflicht. | Code-Scan |
| I-13 | 1 Auth | **Playwright AUTH-005 war rot** und ist mit dem HEAD-Commit behoben; der bestätigende CI-Lauf war zum Berichtszeitpunkt noch in Arbeit. | GitHub Actions |

### 8.2 ChairMatch

| # | Befund | Nachweis |
|---|---|---|
| **CM-1** | **Ein roter Test, zeitabhängig — und er ist echt.** `src/app/api/rental-bookings/__tests__/cancel.e2e.test.ts > „storniert am Tag vor dem Mietbeginn noch"` erwartet 200 und bekommt **409**. Ursache: der Test bildet „morgen" über `Date.getUTCDate() + 1` (**UTC**), die Route entscheidet über `berlinToday()` (**Europe/Berlin**). Zwischen 22:00 UTC und Mitternacht UTC — im Sommer also 00:00–02:00 Ortszeit — ist „UTC-morgen" bereits „Berlin-heute", der Riegel „Mietzeitraum hat bereits begonnen" greift, und der Fall wird rot. Der Lauf für diesen Bericht fiel genau in dieses Fenster. **Es ist ein Testfehler, kein Produktfehler** — die Route verhält sich richtig; der Test stellt seine Frage in der falschen Zeitzone. | eigener Lauf 29.08.2026, 01:31 Ortszeit; Quelltext `cancel/route.ts:117` |
| CM-2 | **Bestandszahlen fehlen weiterhin**: der Dienstschlüssel in `.env.prod` ist ungültig („Invalid API key", offenbar rotiert). Die öffentlichen Kennzahlen aus `/api/public-stats` sind ein Behelf, kein Ersatz für eine Zeilenzählung. | eigene Sonde |
| CM-3 | Migration `20260828170738_benachrichtigungswege_haertung.sql` (Track 23) ist committet, **nicht angewendet**. | Ledger |
| CM-4 | Playwright `protected-pages.spec.ts` existiert, läuft **nicht in CI**. | CI-Konfiguration |

### 8.3 efy care

| # | Befund | Nachweis |
|---|---|---|
| EFY-1 | **`stripe-webhook` stürzt beim Laden ab** (HTTP 500 `WORKER_ERROR` statt einer Signaturabsage 400/401). Wirkung: **jedes Stripe-Event an efy care schlägt fehl.** Naheliegende, aber nicht direkt gemessene Ursache: `STRIPE_SECRET_KEY` fehlt als Function-Secret; `_shared/stripe-client.ts` wirft dann beim Modul-Load. | eigene Anfrage an die Edge Function |
| EFY-2 | Track 16 (Mandantenzaun Organisation/Mitgliedschaft) ist committet und **nicht eingespielt** — `organization_members.accepted_at` wirft `42703`. | Spalten-Orakel |
| EFY-3 | `anon` hat hier das Tabellenrecht SELECT (`200 []` statt `401`), **RLS ist die einzige Grenze** — schwächer aufgestellt als bei Alltagsengel, wo `anon` schon am Recht scheitert. Es ist **kein Leck**: über 14 Tabellen kam keine einzige Zeile zurück. | anon-Sonde |
| EFY-4 | Kein Prüfstand gegen echtes Postgres; die Suiten laufen gegen Doubles und Shadow-DB. Deshalb kann **kein** efy-Modul `E2E_PROVEN` erreichen. | Repo-Scan |

---

## 9. **Externe** Blocker — getrennt aufgeführt

Diese Punkte sind **nicht im Code lösbar**. Sie brauchen eine Einstellung, einen
Bescheid, einen Vertrag oder ein Zertifikat.

### 9.1 Einstellungen und Zugänge (schnell lösbar, keine Fremdkosten)

| # | Blocker | Wirkung | Zuständig |
|---|---|---|---|
| X-1 | `RECHNUNGSVERSAND_AUTOMATISCH`, `MAHNVERSAND_AUTOMATISCH`, `CRON_SECRET` fehlen in Vercel | **Kein Rechnungs- und kein Mahnversand.** `npm run verify:versand` hat den Blocker **gemessen**: Resend-Schlüssel gültig, `alltagsengel.care` = `verified`, DKIM/SPF stehen — aber `invoice_email_log` = 0, `notification_delivery_log` = 0. Zugang trägt, Spuren leer. | Vercel-Dashboard |
| X-2 | `app.settings.supabase_url` nicht gesetzt bzw. Löschtakt gehört nach `vercel.json` | **DSGVO-Löschautomatik ist tot** (I-1). Rechtsrisiko, kein Backlog-Eintrag. | Supabase/Vercel |
| X-3 | `PLAYWRIGHT_TEST_EMAIL` / `PLAYWRIGHT_TEST_PASSWORD` fehlen in den GitHub-Secrets | Die Anmeldekette wird in E2E nie durchlaufen; drei fertige Tests überspringen sich selbst. **Ein Testkonto nehmen, nicht die Produktion** — der Delete-Flow ist destruktiv. | GitHub-Secrets |
| X-4 | Sieben wartende Migrationen einspielen (Abschnitt 6.3) | Öffnet u. a. den P0-Weg Unterschrift → Rechnung | Supabase SQL-Editor |
| X-5 | ChairMatch: sechs Stripe-Variablen fehlen in Vercel | **Die Zahlungsstrecke ist Code auf Produktion, aber nicht funktionsfähig** — die größte offene Position bei ChairMatch. | Vercel-Dashboard |
| X-6 | efy care: `STRIPE_SECRET_KEY` als Supabase-Function-Secret setzen | behebt EFY-1 | Supabase-Dashboard |
| X-7 | ChairMatch-Dienstschlüssel erneuern | macht ChairMatch überhaupt erst messbar | Supabase-Dashboard |

### 9.2 Bescheide, Verträge, Zulassungen (lange Laufzeit, Fremdkosten)

| # | Blocker | Wirkung | Ausstellende Stelle |
|---|---|---|---|
| E-1 | **Anerkennungsbescheid § 45a SGB XI (Hessen)** | 11 von 12 § 45b-Tarifen stehen auf `blocked`. § 45b ist praktisch nicht abrechenbar. | Land Hessen |
| E-2 | dito für § 39 | Alle 4 VP/KZP-Tarife `blocked` — kein VP/KZP-Fall heute abrechenbar. | Land Hessen |
| E-3 | **ITSG-Zertifikat + SFTP-Zugang** (§ 105 DTA) | `abrechnung_zertifikate` = 0, `datenannahmestellen` = 0, `dakota_export_enabled` auf **keinem** der 96 `state_settings`-Einträge. | ITSG / Datenannahmestellen |
| E-4 | **Technische Anlage 1** (§ 302 SGB V) | Der EDIFACT-Generator wirft bewusst bei jedem Aufruf. Das ist richtig: eine erfundene Segmentstruktur wäre eine **falsche Forderung gegen eine Krankenkasse**. | GKV-Spitzenverband |
| E-5 | **gematik-Zulassung, Provider-Vertrag, Konnektor, SMC-B, Technische Anlage 5** (KIM) | Nutzbar sind nur `mock` und `test`; der echte Provider wirft bewusst. | gematik / KIM-Anbieter |
| E-6 | ePA/eRezept | Nicht begonnen; setzt E-5 voraus. | gematik |
| E-7 | Freischaltung weiterer Bundesländer | Von 96 `state_settings`-Einträgen ist **einer** freigeschaltet (Hessen, `private_enabled`). | je Bundesland |
| E-8 | EN-16931-Konformitätsprüfung (XRechnung) | Keine externe Prüfung durchgeführt (KoSIT-Validator o. ä.). | Prüfstelle |
| E-9 | Externer Penetrationstest | Keiner durchgeführt. | Sicherheitsdienstleister |

---

## 10. DiPA — technischer und regulatorischer Status **getrennt**

### 10.1 Technischer Status

| Bereich | Umfang |
|---|---|
| Oberfläche | 25 Seiten unter `app/pflegecoach/` |
| API | 24 Routen unter `app/api/coach/` |
| DiPA-Betrieb | 5 Routen + Admin-Seite |
| Fachlogik | 6.496 Zeilen in `lib/coach/`, 24 Testdateien mit 271 Testfällen |
| Datenmodell | 2 Migrationen, **beide angewendet** — 18 Tabellen live |
| Regulatorischer Apparat | maschinenlesbarer 48-Punkte-Katalog (99 KB), Antragsreife-Prüfung, 13-Schalter-Verzeichnis, 30 Dossiers unter `audit/dipa/`, 29 unter `docs/dipa/` |

**Abschließender Arbeitsblock (6 Commits, „DiPA Technical Completion"):**
10 neue Prüfsuiten mit **165 Testfällen**, für diesen Bericht gezielt
nachgelaufen — **165 grün, 0 rot**. Abgedeckt sind: Zugangsschranke
(`lib/coach/api-auth.ts`), erste E2E-Kette des Selbstzahler-Wegs gegen echtes
Postgres, FHIR-Konformität als Baumdurchlauf, 18 Rechtstexte, Freigabe-Vorstufe,
Pseudonymisierung der Nutzungsnachweise und der serverseitige Pfeffer über den
Freischaltcodes. Letzterer schließt eine Lücke, die bis dahin **kein** Test
gesehen hätte: fiele `COACH_CODE_PEPPER` bei einem Umbau aus `hashCode` heraus,
blieben alle bestehenden Tests grün — `code_hash` wäre dann ein **ungesalzener**
SHA-256 über einen Suchraum von rund 2⁵⁹ᐟ⁵, offline durchrechenbar, und ohne
Salz je Zeile träfe ein einziger Durchlauf **alle** Codes der Tabelle
gleichzeitig.

**Technischer Reifegrad: rund 90 % der Bauarbeiten.**

### 10.2 Regulatorischer Status

| Zuständigkeitsklasse | Punkte gesamt | davon offen |
|---|---:|---:|
| A — intern erledigt | 25 | **0** |
| B — intern umsetzbar (technisch) | 4 | **0** |
| C — intern erstellbar (Dokumentation) | 7 | **4** |
| D — externer Dienstleister nötig | 8 | **8** |
| E — Behörde/Kostenträger nötig | 4 | **2** |

**Belastbare Katalogquote: 34 von 48 = 71 %.** Klasse D: **0 von 8**.

**Die drei Eingangsblocker** — ohne sie ist der Antrag formal unvollständig, sie
sind **nicht nachreichbar**:

1. **TR-03161-Datensicherheitszertifikat** (BSI-anerkannte Prüfstelle)
2. **ISO-27001-Zertifikat / ISMS** (DAkkS-akkreditierte Stelle)
3. **Wissenschaftliches Evaluationskonzept** (wissenschaftliche Einrichtung)

**Produktionslage:** `COACH_DIPA_MODUS` ist nicht gesetzt → **DiPA-Modus aus**.
`/api/coach/tarife` antwortet `verkauf_moeglich: false`. Alle vier
zulassungsgebundenen Schalter stehen auf dem sicheren Stand. `coach_users` = **0**.

**Regulatorischer Reifegrad: 0 % im Sinne der Zulassung.** Kein Antrag, kein
Verzeichniseintrag, kein BfArM-Beratungstermin. Der Abstand zum
Verzeichniseintrag wird **nicht in Code gemessen**, sondern in Kalenderzeit und
Fremdkosten: ISO 27001 sechs bis zwölf Monate, TR-03161 zwei bis vier Monate,
summative Usability-Studie ein bis zwei Monate, danach das BfArM-Verfahren selbst
(drei Monate Bearbeitungsfrist ab **vollständigem** Antrag). Realistisch
frühestens **Mitte bis Ende 2027**, und das nur bei zeitnaher Vergabe der
externen Aufträge.

### 10.3 Die vier internen DiPA-Punkte, die ohne Fremdkosten schließbar sind

1. **DSFA von der Geschäftsführung unterzeichnen** (AK-DS-02) — Art. 35 Abs. 2
   DSGVO verlangt *keine* externe Stelle. Der billigste schließbare Punkt im
   ganzen Katalog.
2. **AVV-Kette produktbezogen dokumentieren** (AK-DS-04) — Vorarbeit liegt vor.
3. **Screenreader-Durchgang protokollieren** (AK-BF-03) — Vorlage liegt bereit,
   rein interne Arbeit.
4. **Support-Zusage mit 24-h-Frist** (AK-VS-02) — eine Entscheidung, kein Projekt.

> **Empfehlung, die dieser Bericht wiederholt:** Solange die Geschäftsführung
> nicht entschieden hat, **ob** DiPA verfolgt wird, ist jeder weitere technische
> Ausbau am PflegeCoach verlorene Zeit. Das Produkt ist gebaut, hat null Nutzer
> und wird durch weiteren Code nicht zulassungsfähiger.

---

## 11. Sicherheit — P0/P1-Ergebnisse

### 11.1 Live nachgemessene Sicherheitslage (Alltagsengel-Produktion)

| Prüfung | Ergebnis |
|---|---|
| RLS auf allen Tabellen des Schemas `public` | **310 / 310** |
| Schreibrechte für `anon` (INSERT/UPDATE/DELETE) | **0 Tabellen** |
| SECURITY-DEFINER-Funktionen, für `anon` ausführbar | **0** |
| Perimeter-Prüfung (`verify:perimeter`) | **8 / 8** |
| anon liest aus Perimeter-Tabellen | **keine Zeile** — teils `401/42501`, teils `200 []` |
| Mandantenzaun Personal (`verify:personalverwaltung`) | **13 / 13**, 0 mandantenfremde Zeilen in fünf Tabellen |
| Prüfpfad-Unveränderlichkeit (`verify:e2e-ketten`, Kette 10) | Trigger schreibt · Handschrift wird abgewiesen · Bestand gesperrt |
| Statische Prüfungen | `lint:route-auth` 0 · `lint:org-id` 0 · `lint:forbidden` 0 |

### 11.2 Befunde dieses Abschlusszeitraums

| Schwere | Befund | Stand |
|---|---|---|
| **P0** | **Manipulationsschutz verschließt den Geldweg** — unterschriebener Nachweis nicht abrechenbar (Abschnitt 7.2) | Behebung eingecheckt (`20260829011500`), **wartet auf Apply** |
| **P1** | `auth.uid()` ist unter dem Dienstschlüssel NULL — Trigger protokollieren leer; bei `NOT NULL`-Zielspalte bricht der Schreibweg (Zeiterfassung) | im Code umgangen, Migration `20260829005500` wartet |
| **P2** | Kundennummer war **global** statt pro Mandant eindeutig; die rohe `23505`-Meldung ging als 500 nach außen | Route **sofort** abgesichert, Migration `20260828210000` wartet |
| **P2** | Sonntag ließ sich als Engel-Verfügbarkeit nicht hinterlegen (Prüfung gegen `0..6` nach JavaScript, Spalte und Oberfläche zählen ISO `1..7`) | **behoben** |
| **P1** | CI war seit 28.08. dauerhaft rot: die DSGVO-Shadow-DB-Suite räumte ihren eigenen Ratelimit-Zähler nicht weg (der Zähler steht **in der Datenbank** und überlebt den Testlauf) | **behoben** |
| **P2** | Playwright AUTH-005 auf mobile-safari: CORS-Preflight lief an der Routing-Schicht vorbei ins echte Netz | mit HEAD behoben, **CI-Bestätigung stand beim Messen noch aus** |
| **P3** | ChairMatch: zeitzonenabhängiger Testfehler (Abschnitt 8.2, CM-1) | **offen**, Ursache exakt benannt |

---

## 12. Klare Aussage: READY / NOT READY

| Produkt | Bewertung | Begründung in einem Satz |
|---|---|---|
| **Alltagsengel — Endkunden-Plattform (Website, Buchung, Engel-Vermittlung)** | **READY** | Echter Publikumsverkehr läuft seit Monaten durch (8.428 Seitenaufrufe, 32 Anfragen, 65 Konten, 17 Engel), die Kette Besucher → Anfrage → Buchung → Einsatz ist in Produktion durchlaufen. |
| **Alltagsengel — Geldweg (Rechnung, Versand, Zahlung)** | **NOT READY** | Der P0 aus 7.2 verschließt die Kette Unterschrift → Rechnung; ohne die drei Vercel-Variablen wird keine Rechnung versendet; `payments` = 0. **Zwei Handgriffe außerhalb des Codes trennen diesen Punkt von READY.** |
| **Pflege-Software** | **NOT READY für den Wirkbetrieb · READY für einen begleiteten Pilotlauf** | 72,3 %, alle Fachtabellen live leer, kein Modul `DONE`. Der Pilotlauf ist erst nach Anwendung von `20260829011500` sinnvoll — sonst scheitert er genau zwischen Unterschrift und erster Rechnung, ohne verwertbare Fehlermeldung. |
| **DiPA / Digitaler PflegeCoach** | **technisch READY · regulatorisch NOT READY** | Rund 90 % der Bauarbeiten stehen, 0 % der Zulassung. Verkauf ist fail-closed gesperrt (`verkauf_moeglich: false`), und das ist richtig so. |
| **ChairMatch** | **READY mit Einschränkung** | Plattform läuft mit echten Nutzern (50 Nutzer, 15 Salons, 48 Bewertungen), aber die **Zahlungsstrecke ist nicht funktionsfähig** (X-5) und bei **1 Buchung** ist der Marktplatz wirtschaftlich noch nicht angelaufen. |
| **efy care** | **NOT READY** | Backend und alle vier Edge Functions sind live, die **App ist nicht ausgeliefert** (kein DNS), und `stripe-webhook` stürzt beim Laden ab. |

---

## 13. Die sechs Schritte mit der größten Wirkung

Nach Wirkung sortiert, nicht nach Aufwand. Keiner davon ist Programmierarbeit.

1. **Migration `20260829011500` einspielen.** Sie ist die einzige, die einen Weg
   öffnet, der heute geschlossen ist — und sie ist Voraussetzung dafür, dass ein
   echter Kundendurchlauf überhaupt gelingen kann.
2. **`RECHNUNGSVERSAND_AUTOMATISCH`, `MAHNVERSAND_AUTOMATISCH` und `CRON_SECRET`
   in Vercel setzen.** Der Blocker ist gemessen, nicht vermutet: Zugang trägt,
   Domain verifiziert, Spuren leer.
3. **Einen echten Kunden komplett durchlaufen lassen** — Aufnahme → SIS →
   Maßnahmenplan → Einsatz → Leistungsnachweis **mit echter Unterschrift** →
   Rechnung → Versand → Zahlung. Das ist der einzige Schritt, der aus „gebaut"
   „erprobt" macht, und er hebt allein rund ein halbes Dutzend Module.
4. **`app.settings.supabase_url` setzen bzw. den Löschtakt nach `vercel.json`
   ziehen.** Eine tote DSGVO-Löschkette ist ein Rechtsrisiko.
5. **SEPA-Gläubiger-ID bei der Bundesbank beantragen** — kostenfrei, und ohne sie
   ist Lastschrift ausgeschlossen.
6. **Anerkennungsbescheid § 45a SGB XI (Hessen) verfolgen** — er entriegelt 15
   gesperrte Tarife auf einen Schlag.

---

## 14. Wo dieser Bericht bewusst nicht weiter geht

* **ChairMatch-Bestandszahlen fehlen.** Der Dienstschlüssel ist ungültig; die
  öffentlichen Kennzahlen sind ein Behelf, keine Zeilenzählung.
* **Der HEAD-Deploy von Alltagsengel ist nicht bestätigt.** `/api/health` meldet
  den vorletzten Commit; der CI-Lauf des HEAD war beim Messen noch in Arbeit.
  Als grün ausgegeben wird er deshalb nicht.
* **Der Playwright-Vollauf ist nicht Teil der genannten Testzahlen.** Er braucht
  die laufende Anwendung und ein Testkonto in den CI-Secrets (X-3).
* **Die efy-Ursachenannahme zu `stripe-webhook` ist nicht gemessen.** Das Fehlen
  des Secrets ist die naheliegende, aber nicht bewiesene Ursache; die Wirkung —
  jedes Stripe-Event schlägt fehl — steht unabhängig davon fest.
* **Keine Bewertung stammt aus einem Statusdokument.** Wo eine frühere Notiz und
  der Live-Befund auseinandergingen, gilt der Live-Befund.

---

## 15. Nachprüfbarkeit

```bash
# Alltagsengel
npm run test              # vitest
npm run test:unit         # node:test
npm run typecheck
npm run lint:forbidden && npm run lint:route-auth && npm run lint:org-id
npm run verify:perimeter && npm run verify:abrechnung
npm run verify:e2e-ketten && npm run verify:personalverwaltung
npm run verify:loeschkette && npm run verify:versand
npm run dipa:katalog && npm run dipa:compliance

# ChairMatch
cd /Users/work/chairmatch && npm run test && npm run typecheck

# efy care
cd /Users/work/efy-care && npm run test && npm --prefix app run typecheck
```

**Hinweis zur Ausführung:** `tsc` und `vitest` nie gleichzeitig starten — der
gemeinsame Speicherbedarf beendet auf dieser Maschine einen der beiden Läufe,
und ein abgebrochener Lauf ist weder grün noch rot.

---

*Alltagsengel UG (haftungsbeschränkt) · Neue Mainzer Straße 66–68 · 60311
Frankfurt am Main · Bericht erstellt am 29.08.2026.*
