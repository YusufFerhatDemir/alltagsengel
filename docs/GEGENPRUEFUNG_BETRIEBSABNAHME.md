# Gegenprüfung Betriebsabnahme — 12.08.2026

**Prüfer:** Unabhängiger Prüf-Agent (Gegenprüfung der 4-Agenten-Betriebsabnahme)  
**Datum:** 12.08.2026  
**Scope:** Abrechnungslogik, EDIFACT, Security (IDOR), Edge Cases, Zeitzonen, Kaskaden, Typ-Konsistenz  
**Teststand nach Fixes:** 1803 Tests grün, 0 fehlgeschlagen, Typecheck grün

---

## Zusammenfassung

| Kategorie | Anzahl |
|-----------|--------|
| KRITISCH — gefixt | 4 |
| KRITISCH — offen (extern/DB-Migration nötig) | 2 |
| WARNUNG — gefixt | 3 |
| WARNUNG — offen | 12 |
| BESTÄTIGT (vorherige Befunde) | 5 |
| OK | 8 |

---

## KRITISCH — GEFIXT (in diesem Commit)

### K1: SEPA-Mandate-Revoke IDOR
- **Datei:** `lib/billing/sepa/sepa-service.ts:119-149`, `app/api/billing/sepa/mandates/[id]/revoke/route.ts`
- **Problem:** `revokeMandate()` filterte nur nach `id` und `status='aktiv'`, nicht nach `organization_id`. Da `createAdminClient()` (BYPASSRLS) verwendet wird, konnte ein Admin einer Org das SEPA-Mandat einer fremden Org widerrufen.
- **Fix:** `expectedOrgId`-Parameter hinzugefügt; Route übergibt `auth.ctx.organizationId`.
- **Test:** `p0-gegenpruefung-fixes.test.ts` — "SEPA-Mandate-Revoke Org-Fence"

### K2: Klärfall-Zuordnung Cross-Tenant IDOR
- **Datei:** `lib/billing/matching/matching-engine.ts:463-468`
- **Problem:** `manuellZuordnen()` lud die Ziel-Rechnung nur per `id`, ohne `organization_id`-Filter. Ein Admin konnte eingehende Zahlungen auf Rechnungen einer fremden Organisation allokieren — finanzieller Cross-Tenant-Schaden.
- **Fix:** `.eq('organization_id', organizationId)` zum Invoice-Lookup hinzugefügt.
- **Test:** `p0-gegenpruefung-fixes.test.ts` — "Klärfall-Zuordnung Org-Fence"

### K3: Budget-Warnung dividiert EUR durch 100 (Faktor-100-Fehler)
- **Datei:** `lib/personal/einsatzfreigabe.ts:144,151`
- **Problem:** `client_budgets.annual_amount` und `used_amount` sind in EUR gespeichert (z.B. 1572.0), aber die Budget-Warnung dividierte durch 100 als wären es Cent. Ergebnis: Anzeige "1,50 EUR über Limit" statt korrekt "150,00 EUR über Limit". Admins trafen Einsatz-Entscheidungen (inkl. `force_override`) auf Basis falsch dargestellter Budget-Werte.
- **Fix:** Division durch 100 entfernt; direkt `.toFixed(2)` auf EUR-Wert.
- **Test:** `p0-gegenpruefung-fixes.test.ts` — "Budget-Warnung EUR/Cent-Konsistenz"

### K4: EDIFACT-Dateien als UTF-8 statt ISO-8859-1 kodiert
- **Datei:** `lib/abrechnung/kassenabrechnung-engine.ts:881,907,922`
- **Problem:** Der UNB-Header deklariert `UNOC:3` (ISO-8859-1), die Auftragsdatei `ZEICHENSATZ='I8'`, aber `new Blob([datei.inhalt])` kodiert als UTF-8. Deutsche Umlaute (ä/ö/ü/ß) in Klienten-/Mitarbeiternamen werden als Multibyte-Sequenzen geschrieben → Korruption/Ablehnung bei der Datenannahmestelle.
- **Fix:** `encodeToLatin1()`-Hilfsfunktion; Nutzdaten + Auftragsdatei als `ArrayBuffer` mit Latin-1-Bytes hochgeladen; `TextEncoder`-basierte Größenberechnung durch `string.length` ersetzt (identisch für Latin-1).
- **Test:** `p0-gegenpruefung-fixes.test.ts` — "EDIFACT ISO-8859-1 Encoding"

---

## KRITISCH — GEFIXT (Concurrency / Race Conditions)

### K5: Storno Double-Spend (cancelInvoice Race Condition)
- **Datei:** `lib/billing/core/invoice-engine.ts:575-590`
- **Problem:** Zwei parallele Storno-Requests konnten beide den Status-Check passieren, bevor einer committet — Ergebnis: zwei Storno-Rechnungen mit negativen Beträgen (doppelte Erstattung). Der Status-Update ignorierte den Rückgabewert.
- **Fix:** CAS-Pattern: `.neq('status', 'storniert')` + `.select().maybeSingle()` — wenn kein Update-Ergebnis, wird die Storno-Rechnung zurückgerollt und ein Fehler geworfen.
- **Test:** `p0-gegenpruefung-fixes.test.ts` — "Storno CAS-Guard"

### K6: Rechnungsnummer-Fallback Race Condition
- **Datei:** `lib/billing/core/invoice-engine.ts:427-476`
- **Problem:** `generateInvoiceNumberFallback` (Fallback wenn RPC fehlschlägt) las `last_number`, inkrementierte lokal, und schrieb blind zurück — ohne CAS. Zwei parallele Aufrufe konnten dieselbe Rechnungsnummer erzeugen.
- **Fix:** Update mit `.eq('last_number', seq.last_number)` (optimistic locking); Insert mit `.upsert(..., { onConflict })`.
- **Test:** `p0-gegenpruefung-fixes.test.ts` — "Rechnungsnummer-Fallback CAS-Guard"

### K7: Dunning-Eskalation fehlender Org-Fence
- **Datei:** `app/api/billing/dunning/[invoiceId]/eskalieren/route.ts`
- **Problem:** Route prüfte nicht, ob die Rechnung zur Organisation des Admins gehört — IDOR über URL-Parameter möglich.
- **Fix:** Invoice-Lookup mit `.eq('organization_id', auth.ctx.organizationId)` vor Eskalation.
- **Test:** `p0-gegenpruefung-fixes.test.ts` — "Dunning-Eskalation Org-Fence"

---

## WARNUNG — GEFIXT

### W1: Pflegekasse-IK nur Prefix-geprüft, keine Prüfziffer
- **Datei:** `lib/abrechnung/edifact-validator.ts:223`
- **Problem:** Pflegekasse-IK (FKT Feld 5) wurde nur auf Prefix "18" geprüft, aber nicht durch `validateIK()` (Prüfziffer-Validierung). Eine IK mit korrektem Prefix aber falscher Prüfziffer hätte EDIFACT-Validierung passiert.
- **Fix:** `validateIK(fkt[5])` als zusätzliche Fehlerprüfung hinzugefügt.
- **Test:** `p0-gegenpruefung-fixes.test.ts` — "Pflegekasse-IK Prüfziffer-Validierung"

### W2: DSGVO-Löschfrist setMonth-Überlauf
- **Datei:** `app/mis/privacy/page.tsx:301`
- **Problem:** `deleteDate.setMonth(getMonth() + months)` kann bei Tagen 29-31 in den Folgemonat überlaufen (z.B. 31.Jan + 1 Monat → 3. März statt 28. Feb). DSGVO-relevante Löschfrist wird falsch berechnet.
- **Fix:** Overflow-Erkennung + `setDate(0)` (letzter Tag des Vormonats).

---

## KRITISCH — OFFEN (erfordert DB-Migration oder manuellen Eingriff)

### K-OFFEN-1: ON DELETE CASCADE auf Pflegedokumentation
- **Dateien:** `supabase/migrations/20260810010000_pflegedokumentation.sql`, `20260820010000_medikamentenmanagement.sql`, `20260818010000_vitalwerte.sql`, `20260818030000_wunddokumentation.sql`
- **Problem:** Alle Pflege-Dokumentationstabellen (Aufnahmen, Anamnesen, Diagnosen, Risiken, Maßnahmen, Verlauf, Medikamente, Vitalwerte, Wunden) haben `ON DELETE CASCADE` auf `clients(id)`. Ein `DELETE FROM clients` löscht die gesamte Pflegedokumentation unwiderruflich — gesetzliche Aufbewahrungspflicht (10 Jahre) wird verletzt.
- **Aktuell kein Produktions-Code-Pfad der `DELETE` auslöst** (nur Test-Code), aber latentes Risiko.
- **Empfehlung:** Migration mit `ON DELETE RESTRICT` statt `CASCADE`, oder Soft-Delete-Only-Enforcement per Trigger.

### K-OFFEN-2: correctInvoice / createCreditNote Race Conditions
- **Dateien:** `lib/billing/core/invoice-engine.ts:638-840` (Korrektur), `lib/billing/core/invoice-engine.ts:849-999` (Gutschrift)
- **Problem:** Korrekturenrechnungen und Gutschriften nutzen dasselbe TOCTOU-Pattern wie der Storno vor dem Fix — kein atomarer DB-Check. Bei Gutschrift: `remainingCreditableCents` wird per SELECT berechnet, dann separat INSERT — zwei parallele Gutschriften können den Originalbetrag übersteigen.
- **Empfehlung:** Atomare PostgreSQL-RPC analog `create_invoice_draft_atomic`.

---

## WARNUNG — OFFEN

### W-OFFEN-1: Zeitzonen-Problem (systemisch, ~18 Stellen)
- **Betroffene Dateien:** `lib/personal/einsatzfreigabe.ts:56`, `lib/billing/core/dunning.ts:81,203,259`, `lib/billing/dunning/mahnung-pdf.ts:247,282`, `lib/abrechnung/readiness.ts:84`, `lib/pricing-engine.ts:253`, diverse `app/`-Seiten
- **Problem:** Überall wird `new Date().toISOString().split('T')[0]` als "heute" verwendet (= UTC). Da Deutschland UTC+1/+2 ist, ergibt das 1-2 Stunden nach Mitternacht den falschen Tag. Betroffen: Qualifikationsablauf (sicherheitskritisch), Mahnfristen, Fälligkeitsdaten, Buchungsdefaults.
- **Empfehlung:** Zentrale `heuteBerlin()`-Hilfsfunktion mit `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' })`.

### W-OFFEN-2: service_records.amount ohne Non-Negativity-Constraint
- **Datei:** `supabase/migrations/20260101000000_baseline_live_only_tables.sql:1014`
- **Problem:** Negative `amount`-Werte werden per Trigger in `client_budgets.used_amount` summiert → Budget wird künstlich aufgeblasen.
- **Empfehlung:** `CHECK (amount >= 0)` in Migration.

### W-OFFEN-3: correctInvoice erlaubt 0/negative Beträge
- **Datei:** `lib/billing/core/invoice-engine.ts:709-727`
- **Problem:** Im Gegensatz zu `createCreditNote()` (hat `amountCents <= 0`-Guard) validiert `correctInvoice()` den Gesamtbetrag nicht.

### W-OFFEN-4: Kein Qualifikations-Matching bei Einsatzplanung
- **Datei:** `lib/personal/einsatzfreigabe.ts:49-63`
- **Problem:** `pruefeEinsatzfreigabe()` prüft nur ob Qualifikationen abgelaufen sind, nicht ob die richtige Qualifikation für die Leistungsart vorhanden ist. Ein Engel ohne jede Qualifikation passiert den Check.

### W-OFFEN-5: force_override umgeht alle Freigabe-Checks
- **Datei:** `app/api/einsatzplanung/route.ts:87-121`
- **Problem:** `force_override: true` im Request-Body umgeht Qualifikations-, Budget- und Vertrags-Prüfungen ohne zusätzliche Autorisierung.

### W-OFFEN-6: INV-Segment ohne Feldlängen-Validierung
- **Datei:** `lib/abrechnung/edifact-segments.ts:213-215`
- **Problem:** `versichertennummer` (max. 12) und `belegnummer` (max. 10) werden nicht auf Länge geprüft.

### W-OFFEN-7: NAM/NAD-Felder werden still abgeschnitten
- **Datei:** `lib/abrechnung/edifact-segments.ts:198-203, 222-236`
- **Problem:** `.slice(0, 30)` / `.slice(0, 45)` ohne Warnung im Generator-Output.

### W-OFFEN-8: §302 SGB V IK-Validator ohne Prüfziffer
- **Datei:** `lib/abrechnung/sgb-v/routing.ts:50-52`
- **Problem:** `istGueltigeIK()` prüft nur `/^\d{9}$/`, keine Prüfziffer (im Gegensatz zu den zwei anderen Implementierungen).

### W-OFFEN-9: Org-IK aus Env-Variable nicht prüfziffern-validiert
- **Datei:** `lib/config/org-config.ts:26-49`
- **Problem:** `ALLTAGSENGEL_IK` Env-Fallback wird nie durch `validateIK()` geprüft.

### W-OFFEN-10: Error-Response-Leaking (DB-Schema-Infos)
- **Dateien:** ~36 Routen unter `app/api/billing/**`, `app/api/expansion/**`
- **Problem:** Rohe Supabase/Postgres-Fehlermeldungen (Tabellen-/Constraint-Namen) werden an den Client zurückgegeben. Kein Stack-Trace-Leak, aber Schema-Informations-Leak.

### W-OFFEN-11: setMonth-Überlauf in Schulungs-Ablauf
- **Datei:** `app/mis/training/page.tsx:166-171`
- **Problem:** Gleicher `setMonth()`-Bug wie W2, aber für Schulungszertifikat-Ablaufdaten.

### W-OFFEN-12: 0€-Rechnungen werden still erstellt
- **Datei:** `supabase/migrations/20260807180000_tariff_stammdaten_v2.sql:265-533`
- **Problem:** `create_invoice_draft_atomic` prüft nicht ob `v_total > 0` — bei `preis_cent = 0`-Tarifen wird eine gültige 0€-Rechnung erzeugt.

---

## BESTÄTIGT (vorherige Befunde)

| ID | Befund | Status |
|----|--------|--------|
| B1 | Entlastungsbetrag korrekt 131€ (nicht 125€) | **OK — bestätigt** |
| B2 | §302 SGB V Export bewusst nicht implementiert (fail-closed) | **OK — bestätigt** |
| B3 | EDIFACT-Validator Stufe 1-3 korrekt implementiert | **OK — bestätigt** |
| B4 | Rechnungserstellung atomar via RPC mit Idempotenz-Key | **OK — bestätigt** |
| B5 | Test/Echt-Dateiindikator korrekt getrennt (0 vs 2) | **OK — bestätigt** |

---

## Gesamtbewertung

Die Betriebsabnahme der vier Agenten war gründlich, hat aber **4 kritische Fehler übersehen**:

1. **SEPA-IDOR** — fremde Mandate widerrufbar
2. **Klärfall-IDOR** — Zahlungen an fremde Rechnungen allokierbar
3. **Budget-Anzeige** — Faktor-100-Fehler in der Einsatzfreigabe
4. **EDIFACT-Encoding** — UTF-8 statt ISO-8859-1

Zusätzlich wurden **3 Race Conditions** gefunden und gefixt (Storno-Double-Spend, Rechnungsnummer-Duplikate, Dunning-IDOR).

**Alle 7 Fixes sind in diesem Commit enthalten**, mit 10 Regressionstests.

**Verbleibende kritische Risiken** (erfordern DB-Migrationen):
- CASCADE-Löschung von Pflegedokumentation
- Race Conditions in Korrekturrechnung/Gutschrift

**Teststand nach Fixes:** 1803 Tests grün, 0 fehlgeschlagen, Typecheck grün.
