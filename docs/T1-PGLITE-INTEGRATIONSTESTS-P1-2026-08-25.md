# T1 — PGlite-Integrationstests, P1-Batch (Geld / Abrechnung)

**Datum:** 25.08.2026
**Umfang:** 6 neue Testdateien, 149 neue Tests, 5 Produktionsbefunde gefixt,
2 Migrationen geschrieben (1 wartet auf Live-Apply), 1 systematische Lücke in
der Test-Infrastruktur geschlossen.

---

## 1. Inventar — wie die Module ausgewählt wurden

237 Module unter `lib/` haben einen Supabase-Bezug. Abgeglichen wurde, welche
davon von **keiner** Testdatei direkt importiert werden (nicht: „kommen im
Text irgendwo vor" — das liefert massenhaft Falschtreffer). Übrig blieben 36
Module, davon in den P1-Kategorien Geld/Abrechnung/CAMT/Mandantentrennung:

| Modul | Zustand vorher | Ergebnis |
|---|---|---|
| `lib/billing/sepa/sepa-service.ts` | **kein Test** | getestet, 3 Befunde |
| `lib/billing/sepa/ruecklastschrift.ts` | **kein Test** | getestet, 1 Befund |
| `lib/billing/opos/opos-manager.ts` | **kein Test** | getestet, 0 Befunde |
| `lib/billing/xrechnung/invoice-to-xrechnung.ts` | **kein Test** | getestet, 1 Befund |
| `lib/abrechnung/monatsabschluss.ts` | **kein Test** | getestet, 1 Befund |
| `lib/billing/core/tariff-import.ts` | **kein Test** | getestet, 0 Befunde |

Nicht in diesem Batch (mit Grund):

- `lib/billing/datev/export-service.ts` + `buchungssatz-generator.ts` — der
  Generator nutzt `.or(...)` und **zweistufig verschachtelte** eingebettete
  Ressourcen (`invoice:invoices(… client:clients(…))`). Beides kann der
  PGlite-Shim nicht. Ein Test dafür heißt: erst den Shim erweitern. Gehört in
  einen eigenen Batch, nicht als Nebenprodukt hier hinein.
- `lib/billing/tarif-verifizierung-service.ts` — nutzt ebenfalls `.or(...)`.
- `lib/leistungsnachweis/status-sync.ts` — reine Funktionen, bereits abgedeckt.

---

## 2. Befunde

### B-1 — SEPA-Mandatsliste war live komplett tot (P1)

`listMandates()` wählte `clients(… client_number)`. Diese Spalte existiert
nicht; sie heißt seit der Baseline `customer_number`. PostgREST beantwortet
das mit **42703**, die Funktion wirft — `GET /api/billing/sepa/mandates`
lieferte ausnahmslos einen Fehler statt der Mandatsliste.

Bitter: `createMandate()` nennt zwei Funktionen weiter oben den *richtigen*
Namen, samt Kommentar zu genau diesem Fehlerbild.

*Gefixt* in `lib/billing/sepa/sepa-service.ts` (+ Typ in
`app/admin/sepa/page.tsx`).

### B-2 — Lastschriftmandat über die Mandantengrenze hinweg (P1, Sicherheit)

`createMandate()` las den Klienten **ohne** `organization_id`-Filter. Der
Service läuft mit dem service-role-Client (BYPASSRLS) — die Mandantentrennung
steht dort ausschließlich im Filter. Ein Admin von Mandant A konnte damit ein
SEPA-Mandat auf einen Klienten von Mandant B anlegen: Mandatszeile in A,
IBAN aus B. Beim nächsten Einzug wird von einem fremden Konto abgebucht.

*Gefixt*: Filter ergänzt; fehlender Klient bricht jetzt ab, statt auf einen
UUID-Ausschnitt als Mandatsreferenz zurückzufallen.

### B-3 — Entwürfe und stornierte Rechnungen wurden eingezogen (P1, Geld)

`createSepaBatch()` las `invoices.status` mit, wertete ihn aber **nie** aus.
Entwürfe (nicht festgeschrieben, nicht versandt), stornierte und
abgeschriebene Rechnungen landeten im Lastschrift-Sammelauftrag — also
Beträge, die dem Unternehmen nicht zustehen.

*Gefixt*: `NICHT_EINZIEHBAR`-Liste, die Position wird mit Grund übersprungen.

### B-4 — Doppelter Lastschrifteinzug derselben Rechnung (P1, Geld)

Nichts hinderte daran, dieselbe Rechnung in einen zweiten Sammelauftrag zu
legen. Beim Kunden wird zweimal abgebucht; die zweite Abbuchung ist eine
unberechtigte Lastschrift, die er bis zu 13 Monate zurückholen kann.

*Gefixt*: Rechnungen mit einem Posten in Status `offen`/`eingezogen` werden
übersprungen. `ruecklastschrift`/`fehlerhaft` zählen bewusst **nicht** — dort
ist der Posten erledigt und die Forderung darf erneut eingezogen werden.

Mitgenommen: die Mandatsauswahl je Klient ist jetzt deterministisch (neuestes
aktives Mandat). Vorher entschied die Reihenfolge der Datenbank, **wessen
IBAN** belastet wird, sobald zwei aktive Mandate existierten (Kontowechsel).

### R-1 — Zurückgenommene Zahlung blieb als „bezahlt" stehen (P1, Geld)

`verarbeiteRuecklastschrift()` markierte die zurückgenommene Zuordnung mit
`allocation_type = 'rueckzahlung'`. Der Wert stand **nicht** im
CHECK-Constraint (20260808210000): das UPDATE scheiterte mit 23514, und der
Rückgabewert wurde nicht gelesen.

Folge: `payment_allocations` behauptete weiter, die Rechnung sei bezahlt,
während `payments.allocated_cents` zwei Zeilen weiter bereits reduziert wurde.
Die beiden Tabellen widersprachen sich nach **jeder** Rücklastschrift.
Zusätzlich blockierte `UNIQUE(payment_id, invoice_id)` danach jede erneute
Zuordnung derselben Zahlung auf dieselbe Rechnung.

*Gefixt* zweistufig:

1. **Migration `20261004000000_payment_allocation_rueckzahlung.sql`** nimmt
   den Wert in den Constraint auf (+ Rollback-Datei).
   → **Wartet auf Live-Apply im Supabase SQL-Editor.**
2. Der Code liest den Fehler jetzt. Solange die Migration fehlt, wird die
   Zuordnungszeile **entfernt** (Bücher bleiben konsistent, Historie fehlt) und
   der Rückfall steht im Ergebnis, statt unsichtbar zu bleiben.

### X-1 — Fremde Rechnungsnummer in der ausgehenden XRechnung (P1, Sicherheit)

Der Nachschlag auf den Ursprungsbeleg (`correction_of`) in
`loadInvoiceXRechnungData()` hatte keinen Mandantenfilter. Zeigte das Feld auf
eine Rechnung eines anderen Mandanten, wanderte **dessen Rechnungsnummer** als
BT-25 in die CII-Datei — also in ein Dokument, das an einen Kostenträger geht.

*Gefixt*: `.eq('organization_id', orgId)` ergänzt.

### M-1 — Jeder Monatsabschluss landete in der Stamm-Organisation (P1, Mandanten)

Der Upsert auf `monthly_closings` schrieb **kein** `organization_id`. Damit
griff der Spalten-Default `current_org_id()` (Phase 3, 20260801) — und der
fällt bei einem service-role-Client ohne JWT auf die Stamm-Org zurück.

Der Monatsabschluss **jedes** Mandanten landete in der Stamm-Organisation; der
Mandant selbst sah ihn wegen der RESTRICTIVE `org_fence`-Policy nie. Exakt
dieser Fehler ist in `lib/billing/core/audit.ts` bereits beschrieben — er war
hier nur noch nicht behoben.

*Gefixt*. Der Befund ist im Test **beweisbar reproduziert**: ohne die
Codezeile schreibt der Lauf `00000000-0000-4000-8000-000460629986` statt der
Mandanten-ID.

---

## 3. Systematische Lücke in der Test-Infrastruktur (geschlossen)

Der PGlite-Shim (`__tests__/e2e/helpers/pglite-supabase.ts`) baut immer
`SELECT *` und schneidet die gewünschten Spalten hinterher in JavaScript zu.
Eine Spalte, die es **gar nicht gibt**, kam damit als `undefined` zurück — der
Test blieb grün. PostgREST antwortet dagegen mit 42703 und die Abfrage ist
live tot.

Genau diese Lücke hat B-1 gedeckt. Der Shim prüft jetzt sowohl flache als auch
eingebettete Spaltenlisten gegen `information_schema.columns` und wirft den
Postgres-Fehler nach.

**Nebenwirkung, die dabei auffiel:** `baueKettenSchema()` legte
`organizations` ohne `iban`/`bic`/`bank_name`/`sepa_creditor_id` an (die
Spalten kommen aus 20260812120000). `mahnung-pdf.ts` liest `iban, bic` — nach
der Härtung fielen dort 12 Tests des Mahnketten-Tests um. Die Spalten sind
jetzt im NACHZUG des Schemaaufbaus, wortgleich aus der Migration.

---

## 4. Neue Bausteine im Schemaaufbau

In `__tests__/e2e/helpers/kette-schema.ts`:

- `baueMonatsabschlussTabellen(db)` — `verordnungen`, `leistungspreise`,
  `monthly_closings` inkl. Mandantenspalte **mit** Default `current_org_id()`.
  Der Default ist hier Prüfgegenstand, nicht Beiwerk.
- `baueTarifStammdaten(db)` — die drei kontrollierten Kataloge und ihre
  Fremdschlüssel.

### Benannte Grenze: `no_overlapping_tariffs`

Der Überschneidungs-Constraint auf `billing_tariffs` ist live ein
`EXCLUDE USING gist (… WITH &&)` und braucht `btree_gist`. **PGlite liefert
die Erweiterung nicht** („extension btree_gist is not available").

Statt ihn stillschweigend wegzulassen — dann liefe der Überschneidungsfall im
Test grün durch — steht dort ein **Stellvertreter-Trigger** mit demselben
Namen im Fehlertext. Geprüft wird damit ausschließlich die *Reaktion der
Anwendung* auf eine abgewiesene Überschneidung. Ob der echte Constraint
richtig greift, beweist das **nicht**.

---

## 5. Bewusst festgehalten statt geändert

`getOposListe()` schließt nur die Endstatus aus. Ein **Entwurf** ist damit Teil
der Offene-Posten-Liste und der Altersstruktur, obwohl er weder
festgeschrieben noch versandt ist. Wer die Altersstruktur als
Forderungsbestand liest, überschätzt ihn um die Summe aller Entwürfe.

Der Mahnlauf ist **nicht** betroffen — er wählt selbst
(`lib/billing/core/dunning.ts`) und fährt nicht über diese Liste.

Ob Entwürfe hier sichtbar bleiben sollen, ist eine fachliche Entscheidung.
Der Test hält den Ist-Zustand fest, damit eine Änderung auffällt; geändert
wurde nichts.

---

## 6. Prüflauf

| Lauf | Ergebnis |
|---|---|
| `npx vitest run` | 246 Dateien, **5232 Tests grün**, 38 übersprungen |
| `npm run test:unit` (node:test) | **2175 Tests grün**, 0 rot |
| `npx tsc --noEmit` | **0 Fehler** |
| PGlite-Suiten einzeln (29 Dateien) | **735 Tests grün** |

Neu: 149 Tests in 6 Dateien.

---

## 7. Offen

- **Migration `20261004000000_payment_allocation_rueckzahlung.sql` wartet auf
  Live-Apply** (Supabase SQL-Editor). Bis dahin greift der dokumentierte
  Rückfall im Code; er ist in den Testergebnissen sichtbar.
- DATEV-Export und `tarif-verifizierung-service` brauchen zuerst `.or(...)`
  und verschachtelte Einbettungen im Shim.
- `no_overlapping_tariffs` bleibt unter PGlite unbeweisbar.
