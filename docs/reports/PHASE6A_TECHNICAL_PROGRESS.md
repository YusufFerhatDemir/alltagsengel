# Phase 6A — Technischer Fortschrittsbericht

**Zeitraum:** 25.08.2026
**Repository:** Alltagsengel (`main`)
**Code-Stand am Ende:** `5ed3ae9` — `test: T1 PGlite-Integrationstests P1-Batch (Geld/Abrechnung)`
**Vorher-Stand:** `0e8418f` — `test: P1-4 Testabdeckung kritische Module Welle 6`

Phase 6A hat die fünf offenen technischen Punkte T1–T5 aus dem Handoff vom
25.08.2026, 22:00 abgearbeitet. Alle fünf sind erledigt. Der eigentliche Ertrag
liegt nicht in den Punkten selbst, sondern in dem, was T1 dabei gefunden hat:
**sieben echte Produktionsfehler in Geld- und Mandantenpfaden**, die niemand
gemeldet hatte, weil die betroffenen Module keinen einzigen Test hatten.

---

## 0. Überblick

| Punkt | Thema | Ergebnis | Commit |
|---|---|---|---|
| T0 | Bestandsaufnahme / Priorisierung | Modul-Inventar erstellt, P1-Batch abgegrenzt | — (in T1-Bericht dokumentiert) |
| T1 | PGlite-Integrationstests für DB-abhängige Module | **erledigt** — 6 Dateien, 149 Tests, **7 Befunde** | `ebb95ee`, `5ed3ae9` |
| T2 | `euroZuCent` IEEE-754-Rundung | **erledigt** — `lib/geld.ts`, 36 Tests | `3cbae72` |
| T3 | `MahnungData.debtorName` nie gerendert | **erledigt** — `mahnungAnrede()`, 12 Tests | `3cbae72` |
| T4 | Signierte URLs 30 Tage für Rechnungs-PDFs | **erledigt** — 10 Minuten + Audit | `3cbae72` |
| T5 | efy care ohne Tests/Linting/generierte Typen | **erledigt** — Baseline erhoben, 3 kritische Befunde | nicht committed (Fremdrepo) |

---

## 1. T0 — Bestandsaufnahme

Ausgangspunkt war die Aussage aus dem Vorgänger-Handoff, „~120 Module mit
DB-Abhängigkeit" seien ungetestet. Diese Zahl hielt der Prüfung nicht stand und
wurde durch eine belastbare ersetzt.

Vorgehen: Nicht „kommt der Modulname irgendwo im Testtext vor" (das liefert
massenhaft Falschtreffer), sondern **wird das Modul von einer Testdatei direkt
importiert**.

| Messgröße | Wert |
|---|---|
| Module unter `lib/` mit Supabase-Bezug | 237 |
| davon von keiner Testdatei direkt importiert | **36** |
| davon in den P1-Kategorien Geld / Abrechnung / CAMT / Mandantentrennung | **6** |

Diese 6 wurden zum P1-Batch für T1. Die Abgrenzung ist im Detail in
`docs/T1-PGLITE-INTEGRATIONSTESTS-P1-2026-08-25.md` §1 dokumentiert.

> **Einordnung:** T0 hat kein eigenes Dokument. Die Zahlen oben stammen aus dem
> T1-Bericht, der die Auswahl mitführt. Wer die Inventur wiederholen will,
> findet dort das Kriterium — nicht das Skript.

---

## 2. T1 — PGlite-Integrationstests (P1-Batch)

Der aufwendigste und mit Abstand ertragreichste Punkt.

### 2.1 Was gebaut wurde

| Neue Testdatei | Modul unter Test | Befunde |
|---|---|---:|
| `__tests__/billing/sepa-service-pglite.test.ts` | `lib/billing/sepa/sepa-service.ts` | 3 |
| `__tests__/billing/ruecklastschrift-pglite.test.ts` | `lib/billing/sepa/ruecklastschrift.ts` | 1 |
| `__tests__/billing/opos-manager-pglite.test.ts` | `lib/billing/opos/opos-manager.ts` | 0 |
| `__tests__/billing/xrechnung-laden-pglite.test.ts` | `lib/billing/xrechnung/invoice-to-xrechnung.ts` | 1 |
| `__tests__/abrechnung/monatsabschluss-pglite.test.ts` | `lib/abrechnung/monatsabschluss.ts` | 1 |
| `__tests__/billing/tarif-import-pglite.test.ts` | `lib/billing/core/tariff-import.ts` | 0 |

**149 neue Tests**, alle gegen echtes Postgres (PGlite/WASM) — nicht gegen eine
Attrappe.

### 2.2 Systematische Lücke in der Test-Infrastruktur — geschlossen

Der PGlite-Shim (`__tests__/e2e/helpers/pglite-supabase.ts`) baute immer
`SELECT *` und schnitt die gewünschten Spalten hinterher in JavaScript zu. Eine
Spalte, die es **gar nicht gibt**, kam damit als `undefined` zurück — der Test
blieb grün. PostgREST antwortet dagegen mit `42703` und die Abfrage ist live
tot.

Genau diese Lücke hat Befund B-1 gedeckt: eine Funktion, die live seit Monaten
ausnahmslos einen Fehler warf, wäre unter dem alten Shim beliebig oft grün
durchgelaufen.

Der Shim prüft jetzt flache **und** eingebettete Spaltenlisten gegen
`information_schema.columns` und wirft den Postgres-Fehler nach.

Nebenwirkung, die dabei auffiel: `baueKettenSchema()` legte `organizations`
ohne `iban`/`bic`/`bank_name`/`sepa_creditor_id` an. `mahnung-pdf.ts` liest
`iban, bic` — nach der Härtung fielen dort 12 Tests des Mahnketten-Tests um.
Die Spalten sind jetzt wortgleich aus der Migration im Schemaaufbau.

### 2.3 Benannte Grenze: `no_overlapping_tariffs`

Der Überschneidungs-Constraint auf `billing_tariffs` ist live ein
`EXCLUDE USING gist (… WITH &&)` und braucht `btree_gist`. **PGlite liefert die
Erweiterung nicht.**

Statt ihn stillschweigend wegzulassen — dann liefe der Überschneidungsfall im
Test grün durch — steht dort ein Stellvertreter-Trigger mit demselben Namen im
Fehlertext. Geprüft wird damit ausschließlich die *Reaktion der Anwendung* auf
eine abgewiesene Überschneidung. **Ob der echte Constraint richtig greift,
beweist das nicht.**

### 2.4 Bewusst festgehalten statt geändert

`getOposListe()` schließt nur die Endstatus aus. Ein **Entwurf** ist damit Teil
der Offene-Posten-Liste und der Altersstruktur, obwohl er weder festgeschrieben
noch versandt ist. Wer die Altersstruktur als Forderungsbestand liest,
überschätzt ihn um die Summe aller Entwürfe.

Der Mahnlauf ist nicht betroffen — er wählt selbst (`lib/billing/core/dunning.ts`)
und fährt nicht über diese Liste.

Ob Entwürfe hier sichtbar bleiben sollen, ist eine **fachliche** Entscheidung.
Der Test hält den Ist-Zustand fest, damit eine Änderung auffällt; geändert wurde
nichts.

---

## 3. Gefundene und behobene Produktionsbefunde

Sieben Befunde, alle in produktiv erreichbarem Code, alle gefixt. Schweregrad
nach Wirkung, nicht nach Aufwand.

### B-1 — SEPA-Mandatsliste war live komplett tot 🔴 P1 (Funktion)

`listMandates()` wählte `clients(… client_number)`. Diese Spalte existiert
nicht; sie heißt seit der Baseline `customer_number`. PostgREST beantwortet das
mit `42703`, die Funktion wirft — `GET /api/billing/sepa/mandates` lieferte
**ausnahmslos** einen Fehler statt der Mandatsliste.

Bitter: `createMandate()` nennt zwei Funktionen weiter oben den *richtigen*
Namen, samt Kommentar zu genau diesem Fehlerbild.

**Fix:** `lib/billing/sepa/sepa-service.ts` + Typ in `app/admin/sepa/page.tsx`.

### B-2 — Lastschriftmandat über die Mandantengrenze hinweg 🔴 P1 (Sicherheit)

`createMandate()` las den Klienten **ohne** `organization_id`-Filter. Der
Service läuft mit dem service-role-Client (BYPASSRLS) — die Mandantentrennung
steht dort ausschließlich im Filter.

Ein Admin von Mandant A konnte damit ein SEPA-Mandat auf einen Klienten von
Mandant B anlegen: Mandatszeile in A, **IBAN aus B**. Beim nächsten Einzug wird
von einem fremden Konto abgebucht.

**Fix:** Filter ergänzt; fehlender Klient bricht jetzt ab, statt auf einen
UUID-Ausschnitt als Mandatsreferenz zurückzufallen.

### B-3 — Entwürfe und stornierte Rechnungen wurden eingezogen 🔴 P1 (Geld)

`createSepaBatch()` las `invoices.status` mit, wertete ihn aber **nie** aus.
Entwürfe (nicht festgeschrieben, nicht versandt), stornierte und abgeschriebene
Rechnungen landeten im Lastschrift-Sammelauftrag — also Beträge, die dem
Unternehmen nicht zustehen.

**Fix:** `NICHT_EINZIEHBAR`-Liste, die Position wird mit Grund übersprungen.

### B-4 — Doppelter Lastschrifteinzug derselben Rechnung 🔴 P1 (Geld)

Nichts hinderte daran, dieselbe Rechnung in einen zweiten Sammelauftrag zu
legen. Beim Kunden wird zweimal abgebucht; die zweite Abbuchung ist eine
unberechtigte Lastschrift, die er bis zu **13 Monate** zurückholen kann.

**Fix:** Rechnungen mit einem Posten in Status `offen`/`eingezogen` werden
übersprungen. `ruecklastschrift`/`fehlerhaft` zählen bewusst **nicht** — dort
ist der Posten erledigt und die Forderung darf erneut eingezogen werden.

**Mitgenommen:** Die Mandatsauswahl je Klient ist jetzt deterministisch
(neuestes aktives Mandat). Vorher entschied die Reihenfolge der Datenbank,
**wessen IBAN** belastet wird, sobald zwei aktive Mandate existierten
(Kontowechsel).

### R-1 — Zurückgenommene Zahlung blieb als „bezahlt" stehen 🔴 P1 (Geld)

`verarbeiteRuecklastschrift()` markierte die zurückgenommene Zuordnung mit
`allocation_type = 'rueckzahlung'`. Der Wert stand **nicht** im CHECK-Constraint
(`20260808210000`): das UPDATE scheiterte mit `23514`, und der Rückgabewert
wurde nicht gelesen.

Folge: `payment_allocations` behauptete weiter, die Rechnung sei bezahlt,
während `payments.allocated_cents` zwei Zeilen weiter bereits reduziert wurde.
Die beiden Tabellen **widersprachen sich nach jeder Rücklastschrift**.
Zusätzlich blockierte `UNIQUE(payment_id, invoice_id)` danach jede erneute
Zuordnung derselben Zahlung auf dieselbe Rechnung.

**Fix zweistufig:**

1. Migration `20261004000000_payment_allocation_rueckzahlung.sql` nimmt den Wert
   in den Constraint auf (+ Rollback-Datei `…000001_rollback_…`).
   → **wartet auf Live-Apply im Supabase SQL-Editor**
2. Der Code liest den Fehler jetzt. Solange die Migration fehlt, wird die
   Zuordnungszeile **entfernt** (Bücher bleiben konsistent, Historie fehlt) und
   der Rückfall steht im Ergebnis, statt unsichtbar zu bleiben.

### X-1 — Fremde Rechnungsnummer in der ausgehenden XRechnung 🔴 P1 (Sicherheit)

Der Nachschlag auf den Ursprungsbeleg (`correction_of`) in
`loadInvoiceXRechnungData()` hatte keinen Mandantenfilter. Zeigte das Feld auf
eine Rechnung eines anderen Mandanten, wanderte **dessen Rechnungsnummer** als
BT-25 in die CII-Datei — also in ein Dokument, das an einen Kostenträger geht.

**Fix:** `.eq('organization_id', orgId)` ergänzt.

### M-1 — Jeder Monatsabschluss landete in der Stamm-Organisation 🔴 P1 (Mandanten)

Der Upsert auf `monthly_closings` schrieb **kein** `organization_id`. Damit
griff der Spalten-Default `current_org_id()` (Phase 3, `20260801`) — und der
fällt bei einem service-role-Client ohne JWT auf die Stamm-Org zurück.

Der Monatsabschluss **jedes** Mandanten landete in der Stamm-Organisation; der
Mandant selbst sah ihn wegen der RESTRICTIVE `org_fence`-Policy nie. Exakt
dieser Fehler ist in `lib/billing/core/audit.ts` bereits beschrieben — er war
hier nur noch nicht behoben.

**Fix** ergänzt. Der Befund ist im Test **beweisbar reproduziert**: ohne die
Codezeile schreibt der Lauf `00000000-0000-4000-8000-000460629986` statt der
Mandanten-ID.

### Zusammenfassung nach Wirkungsbereich

| Bereich | Befunde |
|---|---|
| Geld (falsche/doppelte Abbuchung, falscher Zahlungsstand) | B-3, B-4, R-1 |
| Mandantentrennung / Sicherheit | B-2, X-1, M-1 |
| Funktion komplett tot | B-1 |

**Alle sieben lagen in Modulen ohne einen einzigen Test.** Das ist der
eigentliche Befund hinter den Befunden.

---

## 4. T2 — `euroZuCent`: IEEE-754-Rundung

**Problem:** Überall im Projekt stand `Math.round(betrag * 100)`. Diese Zeile
ist am exakten Halb-Cent falsch:

```
1.005 * 100  ist in IEEE-754  100.49999999999999  → Math.round → 100   (erwartet 101)
2.675 * 100  ist in IEEE-754  267.49999999999994  → Math.round → 267   (erwartet 268)
```

Betroffen ist jede Kette, die EURO-Spalten (`invoices.total_amount`,
`service_records.amount`) in `*_cent`-Spalten, EDIFACT, XRechnung oder DATEV
überführt.

**Verworfene Variante — ausdrücklich dokumentiert:** `+ Number.EPSILON` ist
2.22e-16, der Abstand zweier Doubles *bei 1.0*. Bei 100.5 beträgt der Abstand
bereits ~1.42e-14, also das 64-fache. `Math.round(1.005 * 100 + Number.EPSILON)`
ergibt weiterhin 100. Der Trick sieht richtig aus und ist es nicht.

**Lösung:** String-basierte Dezimalverschiebung in `lib/geld.ts`. `String(x)`
liefert per Spezifikation die kürzeste Dezimaldarstellung, die wieder exakt auf
denselben Double zurückfällt. Verschiebt man das Komma auf der *Zeichenkette*
(`"1.005" + "e2"`), parst die Laufzeit 100.5 und trifft den exakt darstellbaren
Double. Erst darauf wird gerundet.

**Keine neue Abhängigkeit** — kein `decimal.js`, kein `big.js`, reine
Standardbibliothek.

**API (`lib/geld.ts`):** `dezimalVerschieben`, `euroZuCent`, `centZuEuro`,
`aufCent`, `rundeAufStellen`, `formatCentDe`.

| Messgröße | Wert |
|---|---|
| ersetzte `Math.round(… * 100)`-Stellen | 48 Zeilen im Diff, davon **37 geldrelevant** |
| Dateien mit `euroZuCent()`-Aufrufen (ohne Tests) | 22 |
| Aufrufstellen gesamt | 51 |
| Tests | **36** (`lib/__tests__/geld-rundung.test.ts`) |

### 4.1 ⚠️ T2 ist nicht restlos — drei Stellen blieben stehen

Beim Verfassen dieses Berichts nachgeprüft (`grep -rnE "Math\.round\([^)]*\* *100\b"`):
Drei **geldrelevante** Euro→Cent-Umrechnungen laufen weiterhin an `lib/geld.ts`
vorbei.

| Stelle | Was |
|---|---|
| `lib/billing/camt/camt-parser.ts:172` | CAMT-Buchungsbetrag → Cent (**Bankdaten**) |
| `app/admin/gutschriften/page.tsx:86` | `parseEuroToCents()` für die Gutschrift-Eingabe |
| `app/admin/abrechnung/page.tsx:258` | `gesamtCent` aus `r.amount` |

Die übrigen Treffer sind Prozentwerte oder reine Anzeige-Rundungen auf zwei
Nachkommastellen (`lib/analytics/pdl-cockpit.ts`, OCR-Fortschritt, DiPA-Quoten)
und **kein** Befund.

Der CAMT-Parser ist der ernsteste der drei: er wandelt echte Kontoauszugsbeträge
um. Der Fall ist selten (er braucht einen Betrag, dessen Double unterhalb des
Halb-Cent liegt), aber er sitzt im Zahlungseingang.

→ **als offener Punkt T2-Rest im Handoff geführt.**

---

## 5. T3 — `MahnungData.debtorName` wurde nie gerendert

Das Feld wurde befüllt und mitgeschleppt, aber in keinem Mahnungstext
ausgegeben. Jede Mahnung ging mit „Sehr geehrte Damen und Herren" hinaus,
obwohl der Name des Schuldners im Datensatz stand.

**Lösung:** `mahnungAnrede()` in `lib/billing/dunning/mahnung-pdf.ts`, benutzt
von `mahnung-pdf.ts` und `mahnung-pdf-datei.ts`.

Verhalten:

| Eingabe | Ausgabe |
|---|---|
| `'Erika Mustermann'` | `Sehr geehrte/r Erika Mustermann,` |
| `''`, `'   '`, `null`, `undefined` | `Sehr geehrte Damen und Herren,` |

Bewusst geschlechtsneutral („Sehr geehrte/r"): der Datensatz führt keine Anrede,
und aus einem Vornamen ein Geschlecht zu raten geht bei genau den Namen schief,
bei denen es am meisten stört.

**12 Tests** in `lib/__tests__/welle-6-mahnung-pdf.test.ts` (Datei jetzt 38 Tests
gesamt).

---

## 6. T4 — Signierte Storage-URLs

**Problem:** Rechnungs-PDFs wurden mit 30 Tagen Laufzeit signiert.

Eine signierte Supabase-Storage-URL ist ein **Inhabertoken**: sie trägt ihre
Berechtigung selbst, wird am Storage-Dienst geprüft und läuft dabei an RLS
vorbei. Sie kennt weder die **Rolle** des Nutzers (Rollenwechsel wirkt nicht),
noch den **Kontostatus** (Deaktivierung wirkt nicht), noch die **Organisation**
(`org_fence` greift nicht). Es gibt keinen Widerruf. Wo die URL in der Datenbank
liegt, steht sie zusätzlich in jedem Backup und jedem Export.

**Vollbestand erhoben:** 12 Signierstellen, dokumentiert in
`docs/security/signierte-urls-audit.md`. Positiv: nirgends wird `getPublicUrl()`
benutzt — alle Buckets sind privat.

### 6.1 Geändert (technisch ableitbar)

**Rechnungs-PDF: 30 Tage → 10 Minuten**, an beiden Stellen
(`lib/pdf/rechnung-paket.ts`, `app/api/rechnungen/[id]/pdf/route.ts`).

Die 30 Tage brachten keinen Nutzen: Der einzige dauerhafte Zugriffsweg ist
`GET /api/rechnungen/[id]/pdf`, und diese Route signiert bei **jedem** Aufruf
frisch — nachdem sie Eigentümerschaft bzw. Organisationszugehörigkeit geprüft
hat. Der bei der Erzeugung entstehende Link geht nur unmittelbar an den Browser
des Admins. Danach dient der gespeicherte Wert nur noch als
„PDF existiert"-Marke — dafür genügt die Anwesenheit eines Wertes.

Beide Stellen ziehen jetzt dieselbe Konstante `RECHNUNGS_PDF_URL_TTL_SEKUNDEN`.
Vorher standen zwei verschiedene Zahlen an zwei Stellen, und genau die eine war
30 Tage.

Regressionsschranke: `lib/__tests__/signierte-urls.test.ts` (8 Tests, prüft u. a.
dass **7 Tage die Obergrenze** sind und 30 Tage nirgends zurückkommen).

### 6.2 Offen — BUSINESS_INPUT_REQUIRED

Drei Stellen mit 7 Tagen Laufzeit sind **im Quelltext an Ort und Stelle** als
`BUSINESS_INPUT_REQUIRED` markiert:

| Stelle | Inhalt | wandert in |
|---|---|---|
| `lib/upload-document.ts` | Ausweis, Führungszeugnis, Versicherung | `documents.file_url` |
| `lib/upload-service-proof.ts` | Leistungsnachweis-Foto | DB (durch Aufrufer) |
| `app/api/native/leistungsnachweis-upload/route.ts` | OCR-Vorlage | `ocr_results.image_url` |

Kürzen ist hier **nicht** technisch ableitbar: Bei allen drei wandert die URL in
eine Datenbankspalte und wird von der Oberfläche direkt geöffnet. Eine kürzere
Frist macht die abgelegten Nachweise unerreichbar, solange es keine
Re-Signier-Route nach dem Muster von `GET /api/rechnungen/[id]/pdf` gibt.

Zu entscheiden, je Stelle dieselbe Alternative:

1. **Re-Signier-Route bauen** und die Leser umstellen, dann Laufzeit auf Minuten.
   Für `documents` existiert `getSignedDocumentUrl()` bereits — es benutzt sie
   nur keine Oberfläche.
2. **7 Tage bewusst als Restrisiko tragen** — mit dem Wissen, dass ein Link auf
   einen Personalausweis einen Rollenwechsel und eine Konto-Deaktivierung um bis
   zu sieben Tage überdauert.

**Empfehlung:** Für `documents` Variante 1 — der Bucket führt die sensibelsten
Daten im ganzen System, und der Umbau ist klein, weil die Signier-Funktion schon
da ist.

---

## 7. T5 — efy care Baseline

Fremdrepository (`/Users/work/efy-care`, Commit `a6904c1`). Der Bericht liegt
dort unter `docs/EFY_CARE_BASELINE_2026-08-25.md` und ist **nicht** in
Alltagsengel committed.

Erhoben ausschließlich durch **Ausführen** der Checks — keine Aussage aus
bestehenden Audit-Dokumenten übernommen. Insbesondere wurde die Freigabe-Aussage
aus `audit/GO_NO_GO_REPORT_v2.md` („Prod-Deploy bestätigt") bewusst **nicht**
übernommen und nicht nachvollzogen.

### 7.1 Ausgeführte Checks

| Check | Ergebnis |
|---|---|
| `tsc --noEmit` | **0 Fehler** |
| `expo lint` | **0 Findings** |
| `npx vitest run` | **177 grün / 30 übersprungen** (9 Dateien) |
| `npx expo export --platform web` | Exit 0 (Bundle 3,4 MB) |
| RLS auf Migrationsebene | **41/41 Tabellen**, 185 Policies |
| Service-Role im Client | **kein Vorkommen** in `app/src` (nur Deno Edge Functions) |
| Secrets im Code | keine; `.env` nie committed; einziger JWT-Treffer ist der öffentliche anon-Key |
| `console.*` in `app/src` | **0** (kein PII-Logging) |

**Die 30 Skips** sind `describe.skipIf(!hasLiveDb)` und laufen nur mit gesetzten
`SHADOW_SUPABASE_*`-Variablen gegen eine gehostete Shadow-Instanz. Sie sind auf
SQL-Ebene durch 80 PGlite-Tests kompensiert. **Verbleibende echte Lücke:** die
HTTP-Schicht (PostgREST-Query-Parsing, GoTrue-JWT-Claims, Storage-API) ist
ungetestet.

### 7.2 Die drei kritischen Befunde

| # | Befund | Bereich |
|---|---|---|
| 1 | **Buchung schreibt nicht in die DB** — `buchung/[id].tsx:157` trägt `// TODO: Supabase booking insert`. Der Nutzer kann eine Buchung annehmen, die nicht existiert. | Funktional |
| 2 | **Konto-Löschung ist ein TODO** — `einstellungen.tsx:162` (`{/* TODO: confirm dialog */}`). Der Menüpunkt wird angeboten und tut nichts. **DSGVO Art. 17.** | Recht |
| 3 | **Migrationsstand der Prod-DB unverifiziert** — lokale Migrationen ≠ nachweislich angewandt. Kein DB-Zugriff in der Session. | Betrieb |

Dazu weitere: Endkunden-Tabs (Suche, Kalender, Nachrichten, Profil,
Engel-Profil) ohne Backend; DB-Typen nach Aktenlage nie generiert;
Edge-Function-Deploy und Secrets unverifiziert.

### 7.3 Reifegrad-Einschätzung

> Belastbar ist die **Datenschicht** — RLS, Mandantentrennung, Session- und
> Offline-Verschlüsselung sind gebaut *und* getestet.
>
> Nicht belastbar ist die **Anwendungsreife**: Mit Befund 1 und 2 existieren zwei
> Funktionen, die dem Nutzer etwas zusagen, was nicht passiert.
>
> **Produktionsreif kann ich die App als Ganzes nicht nennen.**

---

## 8. Teststatistik — vorher / nachher

| Runner | `0e8418f` (vorher) | `5ed3ae9` (nachher) | Delta |
|---|---:|---:|---:|
| vitest | 5.083 | **5.232** | +149 |
| node:test (`npm run test:unit`) | 2.123 | **2.175** | +52 |
| **Gesamt** | **7.206** | **7.407** | **+201** |

Ergänzend am Endstand gemessen:

| Lauf | Ergebnis |
|---|---|
| `npx vitest run` | 246 Dateien, 5.232 grün, 38 übersprungen |
| `npm run test:unit` | 2.175 grün, 0 rot |
| `npx tsc --noEmit` | **0 Fehler** |
| PGlite-Suiten einzeln (29 Dateien) | 735 grün |

**Zur Abweichung:** Die +52 bei node:test sind ein **Netto**-Wert. Neu kamen 36
(`geld-rundung`), 8 (`signierte-urls`) und 12 (`mahnungAnrede`) = 56; im selben
Commit wurden bestehende Tests in `welle-6-kassenabrechnung-pure.test.ts` und
`billing-f1-f8-audit.test.ts` an die neue Rundung angepasst statt ergänzt. Die
Zahlen sind gemessen, nicht gerechnet — deshalb gehen sie nicht glatt auf.

---

## 9. Offene Punkte am Ende von Phase 6A

| # | Punkt | Art | Wer |
|---|---|---|---|
| 1 | Migration `20261004000000_payment_allocation_rueckzahlung.sql` | **wartet auf Live-Apply** (Supabase SQL-Editor) | Yusuf |
| 2 | T2-Rest: 3 geldrelevante `Math.round(… * 100)` außerhalb `lib/geld.ts` (CAMT-Parser, Gutschriften, Abrechnung) | technisch | Agent |
| 3 | DATEV-Export (`export-service.ts`, `buchungssatz-generator.ts`) ungetestet — braucht `.or(…)` + zweistufig verschachtelte Einbettungen im PGlite-Shim | technisch | Agent |
| 4 | `tarif-verifizierung-service.ts` ungetestet — braucht ebenfalls `.or(…)` im Shim | technisch | Agent |
| 5 | `no_overlapping_tariffs` unter PGlite unbeweisbar (kein `btree_gist`) | benannte Grenze | — |
| 6 | 3× 7-Tage-Signaturlaufzeit (`documents`, `service-proofs`, OCR) | **BUSINESS_INPUT_REQUIRED** | Yusuf |
| 7 | `getOposListe()` zeigt Entwürfe im Forderungsbestand | **fachliche Entscheidung** | Yusuf |
| 8 | efy care: Buchung ohne Persistenz, Konto-Löschung TODO (DSGVO Art. 17) | funktional / rechtlich | Fremdrepo |
| 9 | efy care: Prod-Migrationsstand + Edge-Function-Secrets unverifiziert | Betrieb | Fremdrepo |
| 10 | Verbleibende 30 der 36 ungetesteten `lib/`-Module (P2/P3-Kategorien) | technisch | Agent |

---

## 10. Relevante Dateien

| Zweck | Pfad |
|---|---|
| T1-Detailbericht | `docs/T1-PGLITE-INTEGRATIONSTESTS-P1-2026-08-25.md` |
| Signierte-URL-Audit | `docs/security/signierte-urls-audit.md` |
| efy-care-Baseline | `/Users/work/efy-care/docs/EFY_CARE_BASELINE_2026-08-25.md` (Fremdrepo) |
| Geldrundung | `lib/geld.ts` |
| Wartende Migration | `supabase/migrations/20261004000000_payment_allocation_rueckzahlung.sql` |
| Rollback dazu | `supabase/migrations/20261004000001_rollback_payment_allocation_rueckzahlung.sql` |
| PGlite-Shim | `__tests__/e2e/helpers/pglite-supabase.ts` |
| Schemaaufbau für Kettentests | `__tests__/e2e/helpers/kette-schema.ts` |

---

*Phase 6A abgeschlossen 25.08.2026 — Alltagsengel*
