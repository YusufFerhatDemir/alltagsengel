# E2E-Nutzerworkflow — vollständiger Durchlauf, 14.08.2026

**Auftrag:** Agent 2 — realer E2E-Nutzerworkflow, 15 Kettenschritte, drei Rollen.
**Methode:** Code- und Datenflussanalyse durch alle Schichten (API-Route →
Bibliothek → PostgREST/RPC → RLS), abgeglichen mit dem **Live-Schema und den
Live-Daten** (lesend, über `service_role`). Es wurden **keine Daten auf
Production geschrieben** und keine echten Kundendaten verwendet.

**Gesamtergebnis: FAIL** — die Kette läuft nicht durch. Zwei Schritte waren
strukturell defekt (Zahlungseingang, Tarifzuordnung), beide sind gefixt und
deployed. Drei Schritte bleiben von außen blockiert.

| # | Schritt | Ergebnis | Kern |
|---|---------|----------|------|
| 1 | Kunde anlegen | **PASS** | Fallback für `clients_status_check` greift |
| 2 | Pflegegrad zuweisen | **PASS** | `care_level` + `pflegegrad` synchron |
| 3 | Budget berechnen | **PARTIAL** | 131 €/3.539 € korrekt, aber §42a fehlt bei 2 von 4 Kunden |
| 4 | Mitarbeiter anlegen/zuweisen | **PASS** | Anlage ohne Einsatzfreigabe |
| 5 | Buchung/Termin | **PASS** | — |
| 6 | Einsatz dokumentieren | **PASS** | `duration_minutes` GENERATED, korrekt ausgelassen |
| 7 | Leistungsnachweis (PDF) | **PASS** | Kassenkonforme Felder vollständig |
| 8 | Unterschrift/Freigabe | **PASS (nie gelaufen)** | `service_signatures` live 0 Zeilen |
| 9 | Tarif zuordnen | **FAIL → gefixt** | Vokabularbruch: 5 von 8 Leistungsarten nicht abrechenbar |
| 10 | Rechnung erstellen | **PARTIAL** | Technisch ok; scheitert an 9 bzw. fail-closed an §45b |
| 11 | Rechnungs-PDF | **PASS (nie gelaufen)** | `invoice_packages` live 0 Zeilen |
| 12 | Zahlung erfassen | **FAIL → gefixt** | Doppelzuordnung: HTTP 500 bei **jeder** Vollzahlung |
| 13 | OPOS prüfen | **PASS** | `due_date` gesetzt, Altersklassen rechnen |
| 14 | Mahnwesen 5 Stufen | **PASS** | 14/28/42/56/70 korrekt; Wiedervorlage-Bug gefixt |
| 15 | DATEV/CSV-Export | **PASS (nie gelaufen)** | `datev_exports` live 0 Zeilen |

| Rolle | Ergebnis |
|-------|----------|
| ADMIN | **PASS** |
| MITARBEITER | **PASS** (sieht nur eigene Einsätze/Kunden) |
| KUNDE | **PASS** (sieht nur eigene Daten) |

---

## Gefixt und deployed

### P0 — Schritt 12: jede Vollzahlung endete mit HTTP 500
`52aaead`, `lib/billing/core/payments.ts`, `app/api/billing/invoices/[id]/zahlung/route.ts`

`POST /api/billing/invoices/[id]/zahlung` rief zwei Dinge hintereinander:

1. `createPayment(…)` — und darin lief `autoMatchPayment()`
2. `allocatePayment(…)` — explizit auf diese Rechnung

Das Auto-Matching vergibt Punkte: Rechnungsnummer im Verwendungszweck = 50,
Betrag gleich dem offenen Betrag = 30. Die Route setzt den Verwendungszweck
**selbst** auf `Rechnung <Nummer>` und rechnet standardmäßig den vollen offenen
Betrag ab → **80 Punkte bei einer Schwelle von 70**. `createPayment` ordnete die
Zahlung also schon zu. Die anschließende explizite Zuordnung lief dann gegen
`allocated_cents = amountCents` und scheiterte an der Überzahlungsprüfung:

```
Zuordnung (14000 Cent) übersteigt Zahlungsbetrag (7000 Cent)
```

Ergebnis für den Admin: HTTP 500, obwohl die Zahlung **korrekt verbucht** war.
Beim zweiten Versuch HTTP 409 „bereits vollständig bezahlt". Der Normalfall
Vollzahlung sah damit immer wie ein Fehler aus. Nur Teilzahlungen unter 68
Punkten liefen sauber durch.

**Fix:** `createPayment` akzeptiert `autoMatch: false`. Wer selbst zuordnet,
schaltet das Matching ab. Der Kassen-/Sammelzahlungsweg über
`POST /api/billing/payments` behält das Auto-Matching unverändert.

**Test:** `__tests__/billing/zahlung-doppelzuordnung.test.ts` stellt beide Wege
nach — mit Auto-Matching schlägt die zweite Zuordnung nachweislich fehl, ohne
läuft sie mit genau **einer** Allocation durch.

### P1 — Schritt 9: 5 von 8 Leistungsarten waren nicht abrechenbar
`52aaead`, `lib/billing/leistungsarten.ts`, `app/api/leistungsnachweis/crud/route.ts`,
`supabase/migrations/20260908000000_leistungsart_tarif_mapping.sql`

Erfassung und Abrechnung benutzen **zwei verschiedene Vokabulare**:

| Erfassungsmaske (`service_records.service_type`) | Tarifwerk (`billing_tariffs.leistungsart`) |
|---|---|
| `Haushaltshilfe` | `hauswirtschaft` |
| `Einkaufshilfe` | `einkaufsservice` |
| `Arztbegleitung` | `begleitservice` |
| `Betreuung / Gesellschaft` | `betreuung_45a` |
| `Spaziergang / Mobilität` | — |

`create_invoice_draft_atomic()` verband beide mit
`LOWER(bt.leistungsart) = LOWER(sr.service_type)`. Das trifft nur, wo die Wörter
zufällig gleich sind (`Alltagsbegleitung`, `Demenzbetreuung`, `Sonstige`).
**Live-Messung: 12 von 30 Leistungsnachweisen** (alle `Haushaltshilfe`) sind
dadurch nicht abrechenbar — obwohl der passende Tarif existiert
(`hauswirtschaft`, 38,00 €/h, `verified`). Der Fehler `MISSING_VALID_TARIFF`
fällt erst beim Rechnungslauf auf, da ist die Leistung längst erbracht und der
Nachweis unterschrieben.

Verschärfend: es gibt **drei divergierende Kopien** der Auswahlliste
(`lib/admin/ops.ts`, `app/admin/kalender/page.tsx`,
`app/admin/tourenplanung/page.tsx`, `app/engel/einsaetze/page.tsx`), die sich in
den Leerzeichen unterscheiden (`Betreuung / Gesellschaft` vs.
`Betreuung/Gesellschaft`) — schon die Gruppierung in Auswertungen lief auseinander.

**Fix, zweiteilig:**

- **Sofort wirksam (deployed):** `lib/billing/leistungsarten.ts` als einziges
  Vokabular, plus Prüfung bei der Erfassung. `POST`/`PATCH` auf
  `/api/leistungsnachweis/crud` lehnen eine Leistungsart ohne Tarifzuordnung
  jetzt mit **422** und klarer Ansage ab. Es entstehen keine neuen, nicht
  abrechenbaren Nachweise mehr.
- **Wartet auf Apply:** Migration `20260908000000` bringt
  `public.tarif_leistungsart()` und lässt die RPC damit auflösen. Erst danach
  sind die **12 Altbestands-Nachweise** abrechenbar.

Fail-closed bleibt erhalten: `Grosse Koerperpflege` und `Medikamentengabe`
(SGB-V-Leistungen aus `leistungspreise`) haben bewusst **keine** Zuordnung. Ein
Ausweichen auf `sonstige` hätte sie still zum Begleitungssatz von 40,00 €/h
abgerechnet.

**Test:** `__tests__/billing/leistungsart-mapping.test.ts` prüft jede angebotene
Leistungsart gegen die live vorhandenen Tarifarten und hält TypeScript- und
SQL-Zuordnung deckungsgleich (liest die Migration).

### P3 — Schritt 14: Mahn-Wiedervorlage in der Vergangenheit
`52aaead`, `lib/billing/core/dunning.ts`

`advanceDunning()` errechnete `next_dunning_at` aus dem Blick „zwei Stufen
weiter". Bei `letzte_mahnung` → `inkasso_vorbereitung` traf das auf `bezahlt`
(`DUNNING_DAYS = 0`) und ergab `0 − 70 = −70` Tage: die Wiedervorlage lag 70
Tage in der **Vergangenheit**. Fachlich harmlos (`inkasso_vorbereitung` ist die
höchste automatische Stufe), in der Mahnliste aber eine falsche Fälligkeit.
Jetzt wird `bezahlt` als Nicht-Eskalationsstufe abgegrenzt und der Abstand nie
negativ.

**Test:** `__tests__/billing/mahnlauf.test.ts` — Leiter Stufe für Stufe
(14/28/42/56/70), Gebührenstaffel 0/250/500/750/1000 Cent, Wiedervorlage nie in
der Vergangenheit.

---

## Offen — nicht durch Code lösbar

### 1. Schritt 12 hängt an einer Migration, die nicht angewendet ist
`payments` und `payment_allocations` haben **live 0 Zeilen**. Ursache ist
`wf_trigger_zahlung()`: der AFTER-INSERT-Trigger liest `NEW.invoice_id`, eine
Spalte, die `payments` nicht hat und nie hatte (die Verknüpfung liegt in
`payment_allocations`, n:m). Der Trigger scheitert, der INSERT rollt zurück —
**jeder** Zahlungseingang ist blockiert.

Die Fix-Migration `20260905000000_fix_wf_trigger_zahlung.sql` liegt korrekt im
Repo. Ob sie angewendet ist, lässt sich **lesend nicht feststellen** — und die
0 Zeilen sprechen dagegen. Solange sie nicht live ist, ist mein Fix an der
Zahlungs-Route wirkungslos, weil der INSERT schon vorher stirbt.

**→ Manuell im Supabase-SQL-Editor anwenden.** Danach ist Schritt 12 zum ersten
Mal produktiv durchführbar.

### 2. Schritt 10 ist für §45b fail-closed gesperrt (so gewollt)
Von 23 Tarifen sind 8 der §45b-Tarife `blocked`, nur `wegepauschale` ist
`verified`. Alle 30 Leistungsnachweise tragen `budget_type = 'entlastung'` →
Rechtsgrundlage `§45b SGB XI` → gesperrt. Das ist die korrekte Sperre bis zum
§45a-Anerkennungsbescheid Hessen und **kein Defekt**.

Der Privatweg ist frei: alle 10 `privat`-Tarife sind `verified` (40,00 €/h,
Hauswirtschaft 38,00 €/h). Die Vorgabe „nur verified Privattarife" ist damit
faktisch erfüllt.

**Hinweis zur Regel selbst:** `resolvePrice()` und die RPC lassen bei
Privattarifen alles außer `blocked` zu — ein `unverified` Privattarif wäre also
abrechenbar. Heute existiert kein solcher Tarif, die Lücke ist latent. Ich habe
sie **nicht** zugezogen: alle Privattarife auf `verified`-Pflicht umzustellen
würde bei einem einzigen neu angelegten Tarif den einzigen heute
umsatztragenden Weg sperren. Das ist eine fachliche Entscheidung, keine
Code-Entscheidung.

### 3. Migration `20260908000000` (Leistungsart-Zuordnung)
Ohne Apply bleiben die 12 Altbestands-Nachweise nicht abrechenbar. Neue
Nachweise sind ab sofort geschützt.

---

## Schritt 3 im Detail — PARTIAL

Die gesetzlichen Werte sind überall korrekt: **131 €/Monat**, 1.572 €/Jahr
(§45b), **3.539 €** kombiniert VP/KZP (§42a) ab PG 2, versioniert in
`lib/config/budget-constants.ts` und fail-closed für unbekannte Jahre.

Live fehlt der §42a-Anspruch aber bei **2 von 4 Kunden**:

```
AE-TEST-0001  PG2   §45b 1.572 €   §42a     0 €   ← fehlt
AE-TEST-0002  PG3   §45b 1.572 €   §42a 3.539 €
AE-TEST-0003  PG2   §45b 1.572 €   §42a     0 €   ← fehlt
TEST-2026-001 PG3   §45b 1.572 €   §42a 3.539 €
```

`erstelleInitialBudgets()` legt den Anspruch korrekt an, wird aber nur bei der
Kundenanlage und bei einer Pflegegrad-Änderung gerufen. Für Bestandskunden gibt
es keinen Pfad, der bestehende Budgets nachbewertet. Sichtbar wird das erst,
wenn eine Verhinderungspflege abgerechnet werden soll: die Budgetprüfung findet
0 € Anspruch und lehnt ab.

**Behebung bereitgestellt:** `npm run budget:nachziehen` berichtet (schreibt
nichts), `npx tsx scripts/budget-nachziehen.ts --anwenden` schließt die Lücken.
Idempotent, überschreibt vorhandene Werte nicht. Der Bericht ist gelaufen und
zeigt genau die zwei Lücken oben; **angewendet habe ich ihn nicht** — das ist
eine Datenänderung auf Production.

---

## Rollentrennung — geprüft gegen die Live-Policies

Grundlage: `audit_rls_all_policies` (Live-Dump) plus die Prädikatfunktionen
`is_admin()`, `is_internal_staff()`, `eigene_caregiver_ids()`,
`eigene_client_ids()`, `current_org_id()`.

Entscheidend ist, dass die 181 `*_org_fence`-Policies **RESTRICTIVE** sind: sie
UND-verknüpfen mit den Rollen-Policies und wirken damit als Mandantenzaun, nicht
als Zugriffsrecht. (Nur 6 Policies mit `current_org_id()` sind permissiv, alle
im `state_*`-Expansionsbereich.)

**MITARBEITER (`engel`) — PASS.** Sieht Kunden ausschließlich über
`clients_caregiver_read`, also nur bei **aktivem** eigenem Einsatz, und nur
lesend. Leistungsnachweise nur eigene (`sr_engel_own`), Neuanlage nur als
`draft`, Änderung nur in `draft`/`incomplete`. Auf `invoices`,
`invoice_items`, `payments`, `payment_allocations`, `dunning_entries` und
`client_budgets` gibt es **keine** Engel-Policy → verweigert.

**KUNDE — PASS.** Eigene Budgets, Leistungsnachweise, Rechnungen und
Rechnungspositionen (über Join auf `clients.user_id = auth.uid()`), eigene
Buchungen. Kein Zugriff auf Zahlungen, Mahnungen, Tarife, fremde Daten.

**ADMIN — PASS.** `*_admin_all` über `is_admin()`, plus Mandantenzaun.

### Zwei Nebenbefunde (beide fail-closed, kein Leck)

- **`caregivers` hat keine Engel-Lesepolicy.** Ein Engel kann seinen **eigenen**
  Stammdatensatz nicht lesen. Jede Engel-Ansicht, die `caregivers` mit dem
  User-Client abfragt oder joint, bekommt still 0 Zeilen. Deckt sich mit der
  bekannten „caregivers-Join-Falle".
- **`clients` hat keine Kunden-Selbstlesepolicy.** Ein Kunde kann seine eigenen
  Stammdaten nicht über RLS lesen; das Kundenportal ist dafür auf
  Server-Routen mit `service_role` angewiesen.

- **`current_org_id()` ist fail-open:** ohne `organization_members`-Eintrag und
  ohne `app_metadata.org_id` liefert es die hartkodierte Stamm-Org.
  **56 von 59 Usern** (33 Kunden, 17 Engel, 5 Fahrer, 1 Admin) haben keinen
  Membership-Eintrag. Weil der Zaun restrictive ist, entsteht daraus **kein
  Zugriffsrecht** — der Zaun zeigt nur auf die Stamm-Org, und dort liegen heute
  ohnehin 100 % der Daten. Der Punkt bleibt trotzdem offen: sobald ein zweiter
  echter Mandant Daten führt, zeigt der Zaun für diese 56 User auf die falsche
  Organisation. Das ist eine Migration und eine fachliche Entscheidung über
  Membership-Pflege, kein Bugfix — und deshalb hier nur benannt.

---

## Live-Zahlen (lesend, 14.08.2026)

```
clients                4    service_records       30    invoices            5
client_budgets         4    service_signatures     0    invoice_items      18
caregivers             2    assignments            5    invoice_packages    0
billing_tariffs       23    payments               0    payment_allocations 0
leistungspreise       24    dunning_entries        0    datev_exports       0
service_pricing       10    bookings              10    organizations       6
```

Die Nullen sind der eigentliche Befund: **Schritte 8, 11, 12, 14 und 15 sind
live noch nie gelaufen.** Der Code dafür existiert und ist plausibel, aber jede
Aussage über sie ist eine Aussage über Code, nicht über Betrieb.

## Kontrollen

- `npm run check:schema-drift` — grün, 972 Dateien gegen 300 Live-Tabellen.
- `npx vitest run` — **2642 grün**, 38 übersprungen, 0 rot.
- `npm run typecheck` — 21 Fehler, **alle** in `lib/coach/rechtstexte.ts`, einer
  halbfertigen Datei einer parallel laufenden Session. Keiner in meinen
  Dateien (mit ausgeschlossener Datei gegengeprüft).

## Anmerkung zum Deploy

Im Working Tree lief parallel eine zweite Session (PflegeCoach-Selbstzahler).
Ich habe deshalb mit `DEPLOY_PATHS` scoped committet. `deploy.sh` liest die
Dateien beim Staging neu — dadurch ist eine gleichzeitig entstandene Änderung
derselben Datei (`payments.ts`, Org-Fence in `allocatePayment`) in `52aaead`
mitgewandert und hat zwei Tests rot gemacht. Mit `e1c526d` ist der Stub
angeglichen, die Suite ist wieder vollständig grün. **`DEPLOY_PATHS` schützt
zwischen Dateien, nicht innerhalb einer Datei, die gleichzeitig bearbeitet wird.**
