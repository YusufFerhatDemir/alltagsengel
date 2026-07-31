# Testlauf Verordnungs-Workflow — Ergebnis

**Datum:** 31.07.2026, ca. 21:10 Uhr
**Datenbank:** Alltagsengel Supabase (nnwyktkqibdjxgimjyuq)
**Szenario (Eylem):** Klient braucht Hilfe im Haushalt (Entlastungsbetrag) und hat eine Verordnung für 2x/Woche große Körperpflege, täglich Medikamente verabreichen und 1x/Woche Medikamente richten.

**Testdaten wurden NICHT gelöscht** — alles ist in der Datenbank sichtbar (Klient „Erika Testfall", Kundennummer `TEST-2026-001`).

---

## Gesamtergebnis

**Der Kreislauf ist durchgängig:** Verordnung → Genehmigung → Verplanung → Leistungsnachweis → Rechnung → Absage/Ersatz funktioniert Ende-zu-Ende, alle Verknüpfungen (`verordnung_id`) greifen.

**ABER: 6 relevante Schema-Lücken gefunden** (Details unten), davon 2 kritisch für die echte Kassenabrechnung.

---

## Schritt-für-Schritt-Ergebnisse

### Schritt 1: Test-Klient anlegen — SUCCESS
3 Demo-Klienten existierten bereits (Hoffmann, Krause, Bauer). Eigener, klar markierter Test-Klient angelegt:

| Feld | Wert |
|---|---|
| ID | `b601edc7-6978-4f80-b7d2-5841812bafe1` |
| Name | Erika Testfall (`TEST-2026-001`) |
| Pflegegrad | 3 |
| Kasse | AOK Hessen (IK 105313145) |
| Hausarzt | Dr. Testmann, Hausarztpraxis Frankfurt |

### Schritt 2: Verordnung §37 erfassen — SUCCESS (mit Workaround)
**Erst-Versuch FAIL (beabsichtigt):** Eine Verordnung mit zwei Leistungsarten (`grosse_koerperpflege, behandlungspflege`) wird vom CHECK-Constraint `verordnungen_leistungsart_check` blockiert → **eine Verordnung kann nur EINE Leistungsart tragen** (siehe Problem 1).

**Workaround:** Verordnung als 2 Zeilen mit gleicher Verordnungsnummer `VO-2026-TEST-001`:

| ID | Leistungsart | Beschreibung | Gültig |
|---|---|---|---|
| `df1d324f…` | grosse_koerperpflege | 2x/Woche (Mo + Do) | 31.07.–31.10.2026 |
| `5ed3a2e2…` | behandlungspflege | Medikamente verabreichen täglich + richten 1x/Woche | 31.07.–31.10.2026 |

Typ `behandlungspflege_37`, Arzt Dr. Testmann, Kostenträger Krankenkasse „AOK Hessen".

### Schritt 3: Entlastungs-Verordnung 45b — SUCCESS
`ENT-2026-TEST-001` (ID `d822228c…`), Typ `entlastung_45b`, Leistungsart `hauswirtschaft`.
Budget in `client_budgets` angelegt: **131 €/Monat, 1.572 €/Jahr** (Stand Pflegereform 2025), Status active.
Hinweis: `kostentraeger_typ` kennt kein `pflegekasse` (siehe Problem 2) — Workaround `krankenkasse` mit Name „AOK Hessen Pflegekasse".

### Schritt 4: Kassengenehmigung beantragen — SUCCESS
Alle 3 Verordnungszeilen: `genehmigung_status = 'beantragt'`, `kassengenehmigung_beantragt_am = 31.07.2026 19:10 UTC`.

### Schritt 5: Genehmigung simulieren — SUCCESS
Aktenzeichen `GEN-2026-TEST-001`, genehmigt bis 31.10.2026. Bewusst beide Abgleich-Pfade getestet:

| Position | genehmigte_leistungsart | abgleich_ok | Abweichung |
|---|---|---|---|
| grosse_koerperpflege | grosse_koerperpflege | true | — |
| behandlungspflege | behandlungspflege | **false** | Kasse genehmigt Medikamentengabe nur 1x täglich (Testfall Teilgenehmigung) |
| hauswirtschaft (45b) | hauswirtschaft | true | — |

Beide Pfade werden korrekt gespeichert. Der Abgleich selbst ist aber **rein manuell** — keine DB-Logik vergleicht verordnet vs. genehmigt.

### Schritt 6: Verplanung (assignments) — SUCCESS
`assignments` hat die Spalte `verordnung_id` (FK auf verordnungen, ON DELETE SET NULL). 5 Einsätze angelegt:

| Wochentag | Zeit | Leistung | Verordnung |
|---|---|---|---|
| Mo | 09:00–10:00 | Große Körperpflege | VO Pos. 1 |
| Do | 09:00–10:00 | Große Körperpflege | VO Pos. 1 |
| Mo | 08:00–08:15 | Medikamentengabe | VO Pos. 2 |
| Mi | 08:00–08:30 | Medikamente richten | VO Pos. 2 |
| Fr | 10:00–12:00 | Hauswirtschaft | ENT (45b) |

Zwei Auffälligkeiten: „täglich Medikamente" bräuchte 7 Zeilen (kein Frequenz-Feld, Problem 5) und die Nicht-Pflegefachkraft Maria Schmidt (`is_nurse = false`) konnte ohne Warnung für Behandlungspflege verplant werden (Problem 6).

### Schritt 7: Leistungsnachweise (service_records) — SUCCESS (mit Workaround)
**Erst-Versuche FAIL (lehrreich):**
- `duration_minutes` ist eine generierte Spalte → darf nicht mitgegeben werden (wird korrekt aus start/end berechnet: 60/15/120 Min — gut!).
- `budget_type` ist NOT NULL und erlaubt nur `entlastung | verhinderung | carryover | private` → **es gibt keinen Wert für Krankenkassen-/SGB-V-Leistungen** (Problem 3). §37-Nachweise mussten als `private` erfasst werden.

3 Nachweise angelegt (alle `signed`, mit Kürzel „MS", `verordnung_id` gesetzt):

| Datum | Leistung | Dauer | budget_type | Betrag |
|---|---|---|---|---|
| 31.07.2026 | Große Körperpflege | 60 Min | private (Workaround!) | 35,00 € |
| 31.07.2026 | Medikamentengabe | 15 Min | private (Workaround!) | 8,50 € |
| 31.07.2026 | Hauswirtschaft | 120 Min | entlastung | 70,00 € |

### Schritt 8: Rechnungen — SUCCESS (Kürzung nur manuell)
2 Rechnungen + 3 Rechnungspositionen (invoice_items mit service_record-Verknüpfung):

| Rechnung | Kostenträger | Soll | Ist | Kürzung | Status |
|---|---|---|---|---|---|
| RG-2026-TEST-001 (§37) | AOK Hessen | 43,50 € | 40,00 € | 3,50 € | sent |
| RG-2026-TEST-002 (45b) | AOK Hessen Pflegekasse | 70,00 € | 70,00 € | 0,00 € | sent |

**Kürzungs-Befund:** Nach dem INSERT stand `kuerzung_cent = 0`, obwohl Soll−Ist = 350 Cent. **Es gibt keinen Trigger und keine generierte Spalte** — die Kürzung musste per UPDATE nachgerechnet werden (Problem 4). 70 € vom 131-€-Monatsbudget verbraucht → 61 € Rest (kein automatischer Abzug in `client_budgets.used_amount`, ebenfalls manuell zu pflegen).

Abrechnungsstatus der beiden fakturierten Verordnungen auf `teilweise_abgerechnet` gesetzt — Werteliste (`offen/teilweise/vollständig`) funktioniert.

### Schritt 9: Absage (einsatz_absagen) — SUCCESS
Absage für den Montags-Körperpflege-Einsatz: `abgesagt_von = 'mitarbeiterin'`, Grund „krank", **Ersatz gefunden = true** mit Ersatzkraft „Eylem [TESTER]" (`ersatz_mitarbeiterin_id` FK funktioniert).

### Schritt 10: Abschlussprüfung — SUCCESS
Gesamt-Join über alle Tabellen:

| Verordnung | Leistungsart | Status | Abgleich | Ablauf in | Ampel | Einsätze | Nachweise | Rechnungen | Absagen |
|---|---|---|---|---|---|---|---|---|---|
| VO-2026-TEST-001 | grosse_koerperpflege | genehmigt | OK | 92 Tage | GRÜN | 2 | 1 | 0* | 1 |
| VO-2026-TEST-001 | behandlungspflege | genehmigt | ABWEICHUNG | 92 Tage | GRÜN | 2 | 1 | 1 | 0 |
| ENT-2026-TEST-001 | hauswirtschaft | genehmigt | OK | 92 Tage | GRÜN | 1 | 1 | 1 | 0 |

\* Rechnung RG-2026-TEST-001 hängt an Pos. 2, weil eine Rechnung nur EINE `verordnung_id` tragen kann (Problem 1b). Die Körperpflege-Position ist über `invoice_items → service_record` trotzdem sauber nachvollziehbar.

**Ampel-Logik:** Die Daten dafür sind vollständig (`gueltig_bis`, `genehmigung_bis`, Flags `erinnerung_30/14/7_tage`, `neuantrag_erforderlich`) und die Berechnung per SQL funktioniert. Aber: **in der DB existiert keine einzige View, Funktion oder pg_cron-Job für Ampel/Erinnerungen** — die Flags setzt niemand automatisch. Das muss die App bzw. eine Edge Function übernehmen (nicht verifiziert, ob die existiert).

---

## Gefundene Probleme

| # | Schwere | Problem | Beleg |
|---|---|---|---|
| 1 | **KRITISCH** | Eine Verordnung = nur EINE Leistungsart (`verordnungen_leistungsart_check`). Eylems Standardfall (Körperpflege + Medikamente auf einem Rezept) braucht Mehrfach-Zeilen-Workaround. Zusätzlich 1b: Rechnung kann nur eine `verordnung_id` referenzieren → Sammelrechnung pro Verordnungsnummer nicht direkt abbildbar. | INSERT mit kombinierter Leistungsart → Constraint-Fehler 23514 |
| 2 | **KRITISCH** | `service_records.budget_type` (NOT NULL) kennt keinen Wert für Krankenkassen-/SGB-V-Leistungen (§37). Behandlungspflege-Nachweise landen als `private` — für die Kassenabrechnung falsch kategorisiert. | INSERT mit NULL → Fehler 23502; nur entlastung/verhinderung/carryover/private erlaubt |
| 3 | HOCH | `kuerzung_cent` wird nicht automatisch aus Soll−Ist berechnet (kein Trigger, keine generierte Spalte). Ebenso kein automatischer Budget-Abzug in `client_budgets.used_amount`. Fehlerträchtig bei manueller Pflege. | Nach INSERT: soll 4350, ist 4000, kuerzung 0 |
| 4 | HOCH | Keine DB-seitige Ampel-/Erinnerungs-Automatik: keine Views/Funktionen zu Verordnungen, kein pg_cron. `erinnerung_30/14/7_tage` bleiben false, bis irgendwer sie setzt. | Katalog-Abfrage leer; `cron.job` existiert nicht |
| 5 | MITTEL | Kostenträger nicht relational: `verordnungen` speichert Name/IK als Freitext, kein FK auf `kostentraeger_kontakte`; die Stammdaten-Tabelle ist LEER (0 Zeilen). Auch `leistungspreise` ist leer → keine Preisbasis für §37-Vergütung. Außerdem fehlt `pflegekasse` als `kostentraeger_typ` (für §45b der korrekte Träger). | Zählabfrage: kostentraeger_kontakte 0, leistungspreise 0 |
| 6 | MITTEL | Keine Fachkraft-Prüfung: Nicht-Pflegefachkraft (`is_nurse = false`) ließ sich ohne Warnung für Behandlungspflege (Medikamentengabe) verplanen. Fachlich/rechtlich heikel bei §37. Zudem kein Frequenz-Feld in assignments („täglich" = 7 einzelne Zeilen). | Assignment-INSERT lief ohne Fehler durch |

Positiv aufgefallen: `duration_minutes` als generierte Spalte (rechnet korrekt), saubere FK-Kette mit sinnvollem `ON DELETE SET NULL`, Status-Wertelisten (Genehmigung, Abrechnung, Absage) decken den Praxisablauf gut ab, Abgleich-Felder (`genehmigte_leistungsart`, `genehmigung_abgleich_ok`, `genehmigung_abweichung`) speichern beide Pfade korrekt.

---

## Empfehlungen (priorisiert)

1. **Leistungsarten mehrfach pro Verordnung:** Entweder Kind-Tabelle `verordnung_positionen` (empfohlen: eigene Frequenz, genehmigte Menge und Preis je Position) oder das jetzige Muster „mehrere Zeilen pro `verordnung_nummer`" offiziell machen (App-seitig gruppieren, Unique-Index auf nummer+leistungsart).
2. **`budget_type` erweitern:** Wert `behandlungspflege` (oder `krankenkasse_sgb5`) in den CHECK von `service_records` und `invoice_items` aufnehmen. Ohne das ist jede §37-Abrechnung falsch etikettiert.
3. **Kürzung + Budget automatisieren:** `kuerzung_cent` als generierte Spalte (`soll - ist`) oder BEFORE-Trigger; Trigger für `client_budgets.used_amount` bei abgerechneten Entlastungs-Nachweisen.
4. **Ampel produktiv machen:** View `verordnungen_ampel` (GRÜN >30, GELB ≤30, ROT ≤7 Tage bis `gueltig_bis`/`genehmigung_bis`) + täglicher Job (pg_cron oder Edge Function), der die Erinnerungs-Flags setzt und `neuantrag_erforderlich` bei <14 Tagen aktiviert.
5. **Stammdaten füllen + verknüpfen:** `kostentraeger_kontakte` mit den echten Kassen (AOK Hessen etc.) befüllen, `verordnungen.kostentraeger_id` als FK ergänzen; `pflegekasse` als `kostentraeger_typ` zulassen; `leistungspreise` mit Hessen-Vergütungssätzen füllen.
6. **Fachkraft-Guard:** Trigger oder App-Validierung: `service_type`/Leistungsart Behandlungspflege nur mit `caregivers.is_nurse = true` (aktuell gibt es KEINE Pflegefachkraft in der DB — auch personell relevant, falls §37 real angeboten werden soll).

---

## Angelegte Testdaten (zum Wiederfinden / Aufräumen später)

| Tabelle | Datensatz | ID |
|---|---|---|
| clients | Erika Testfall, TEST-2026-001 | `b601edc7-6978-4f80-b7d2-5841812bafe1` |
| verordnungen | VO-2026-TEST-001 Pos. 1 (Körperpflege) | `df1d324f-c202-4d70-970f-f69375dd6d49` |
| verordnungen | VO-2026-TEST-001 Pos. 2 (Behandlungspflege) | `5ed3a2e2-d439-4171-83e1-11db44c3f9c4` |
| verordnungen | ENT-2026-TEST-001 (45b) | `d822228c-4bc4-4f36-9355-186d91d32925` |
| client_budgets | 131 €/Monat 2026 | `09028006-8608-42eb-bbc5-de94dddaf18e` |
| assignments | 5 Einsätze | `0568e83d…`, `6bc0d577…`, `0fe6e971…`, `fb5af8d8…`, `f2a7c1aa…` |
| service_records | 3 Nachweise | `f6ba46ff…`, `1572df0a…`, `6592f15e…` |
| invoices | RG-2026-TEST-001, RG-2026-TEST-002 | `c292fd2d…`, `e16ea245…` |
| invoice_items | 3 Positionen | `263e992d…`, `175abee1…`, `2c45e93b…` |
| einsatz_absagen | Absage Mo-Einsatz mit Ersatz | `316d5e84-2225-4ee3-b531-f19249474ad6` |
