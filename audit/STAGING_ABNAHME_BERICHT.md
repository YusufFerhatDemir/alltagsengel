# Staging-Abnahme-Bericht: Tarif-basierte Rechnungserstellung

**Datum:** 2026-08-07  
**Branch:** `feature/unified-invoice-creation`  
**Commit:** `81cc23b` (nach Bug-Fixes)  
**Staging-Projekt:** `orpqolybsjdlyrmryvhx` (gelöscht nach Tests)  
**Production-Projekt:** `nnwyktkqibdjxgimjyuq` (NICHT verändert)

---

## 1. Staging-E2E Ergebnis

**10/10 PASS — alle E2E-Tests bestanden.**

| Nr | Test | Ergebnis | Details |
|----|------|----------|---------|
| E2E-1 | Fehlender Tarif (MISSING_VALID_TARIFF) | PASS | ergotherapie ohne Tarif → Fehler + vollständiger Rollback |
| E2E-2 | Erfolgreiche Rechnungserstellung | PASS | 3 Positionen, 150.00€, korrekte Tarif-Auswahl |
| E2E-3 | Richtiger Tarif anhand IK + Datum | PASS | T10 (IK 109034001, Score 15) korrekt vor T2 (Score 5) gewählt |
| E2E-4 | Keine Tarifüberschneidung | PASS | Exclusion Constraint blockiert überlappende Tarife |
| E2E-5 | Zeitraumgrenzen | PASS | T1 (bis 30.06) für Juni, T2 (ab 01.07) für Juli |
| E2E-6 | unit_price × quantity serverseitig | PASS | zeit_stunde, zeit_minute, pauschale, wegepauschale alle korrekt |
| E2E-7 | Rundung | PASS | 3800ct × 47/60 = 29.7666... → 29.77 (ROUND 2 Dezimalen) |
| E2E-8 | Fehlende pflegekasse_ik | PASS | Client ohne IK → nur generische Tarife, IK-spezifische ausgeschlossen |
| E2E-9 | Idempotenz | PASS | Wiederholter Request → already_exists=true, gleiche invoice_id + Betrag |
| E2E-10 | Bestehende Rechnungen unverändert | PASS | Alle 4 Rechnungen nach allen Tests identisch |

**Zusätzliche Tests:**

| Test | Ergebnis | Details |
|------|----------|---------|
| Org-Isolation | PASS | Foreign-Org Client → "gehoert nicht zu Organisation" |
| Rollback-Test (explizit) | PASS | Vorher: 4 Rechnungen, 11 Items, 4 Audit → Nachher: identisch |
| Audit-Trail Checksums | PASS | Alle 4 Einträge mit 64-Zeichen SHA-256 Hex |

---

## 2. Getestete Tarife

**10 Tarife** in 4 Vergütungsarten, 3 Rechtsgrundlagen, mit IK-Spezifität und Zeitraum-Begrenzung:

| ID | Leistungsart | Rechtsgrundlage | Cent | Vergütungsart | Gültig ab | Gültig bis | IK | BL |
|----|-------------|-----------------|------|---------------|-----------|------------|----|----|
| T1 | alltagsbegleitung | §45b SGB XI | 3500 | zeit_stunde | 2026-01-01 | 2026-06-30 | — | hessen |
| T2 | alltagsbegleitung | §45b SGB XI | 3800 | zeit_stunde | 2026-07-01 | — | — | hessen |
| T3 | alltagsbegleitung | §45b SGB XI | 4200 | zeit_stunde | 2026-07-01 | — | 109519005 | hessen |
| T4 | demenzbetreuung | §45b SGB XI | 4500 | pauschale | 2026-01-01 | — | — | hessen |
| T5 | haushaltshilfe | §45b SGB XI | 58 | zeit_minute | 2026-01-01 | — | — | hessen |
| T6 | wegepauschale | §45b SGB XI | 750 | wegepauschale | 2026-01-01 | — | — | hessen |
| T7 | alltagsbegleitung | §39 SGB XI | 4000 | zeit_stunde | 2026-01-01 | — | — | hessen |
| T8 | alltagsbegleitung | privat | 5000 | zeit_stunde | 2026-01-01 | — | — | hessen |
| T9 | nachtbetreuung | §45b SGB XI | 4500 | zeit_stunde | 2026-01-01 | — | — | hessen |
| T10 | alltagsbegleitung | §45b SGB XI | 3900 | zeit_stunde | 2026-07-01 | — | 109034001 | hessen |

---

## 3. Geprüfte pflegekasse_ik-Fälle

| Client | pflegekasse_ik | Erwartung | Ergebnis |
|--------|---------------|-----------|----------|
| TEST-001 | 109519005 | T3 (IK-spezifisch, Score 15) | PASS — T3 gewählt |
| TEST-002 | NULL (kein IK) | T2 (generisch, Score 5) | PASS — IK-Tarife ausgeschlossen |
| TEST-003 | 109034001 | T10 (IK-spezifisch, Score 15) | PASS — T10 gewählt |
| TEST-004 | — (fremde Org) | Zugriff blockiert | PASS — Org-Isolation |

---

## 4. Security-Warnungen

| Warnung | Status | Maßnahme |
|---------|--------|----------|
| UNIQUE auf idempotency_key | **BEHOBEN** | Partial UNIQUE Index: `idx_invoices_idempotency_key_unique` (NULL-safe, nur nicht-gelöschte) |
| Exclusion Constraint idempotent | **BEHOBEN** | `DO $$ IF NOT EXISTS ... END $$` Wrapper |

**Zusätzlich gefundene und behobene Bugs:**

| Bug | Schwere | Fix |
|-----|---------|-----|
| `digest()` ohne Schema-Qualifizierung | KRITISCH | `extensions.digest()` — pgcrypto liegt im `extensions`-Schema, NICHT `public` |
| checksum NOT NULL bei Fehler-Audit | KRITISCH | Fehler-Pfade (missing_tariff, ambiguous_tariff) schreiben jetzt Checksums |
| `CREATE EXTENSION pgcrypto` ohne Schema | MITTEL | `WITH SCHEMA extensions` hinzugefügt |

**Hinweis zum digest()-Bug:** Dieser Bug hätte auch auf Production die RPC blockiert. Er wurde durch den Staging-Test entdeckt und behoben.

---

## 5. Migrationstest

Die Migration `20260807110000_tariff_based_invoice_creation.sql` wurde auf dem Staging-Branch getestet.

**Enthaltene Änderungen:**
1. 9 neue NULLable Spalten auf `invoice_items` (Tarif-Tracking)
2. `create_invoice_draft_atomic()` RPC — komplett neu mit Tarif-Auflösung
3. UNIQUE Index auf `invoices.idempotency_key`
4. `tariff_validity_range()` Hilfsfunktion
5. `no_overlapping_tariffs` Exclusion Constraint (idempotent)
6. `pgcrypto` Extension sichergestellt (im `extensions`-Schema)

**Bestehende Daten:** Nicht verändert. Neue Spalten sind NULLable. Alte Rechnungen bleiben intakt.

---

## 6. Rollback-Test

| Prüfpunkt | Vorher | Nachher | Ergebnis |
|-----------|--------|---------|----------|
| Anzahl Rechnungen | 4 | 4 | PASS |
| Anzahl Positionen | 11 | 11 | PASS |
| Anzahl Audit-Einträge | 4 | 4 | PASS |
| SR-Status (August) | signed | signed | PASS |

**Methode:** RPC-Aufruf mit Leistung ohne Tarif (ergotherapie) → MISSING_VALID_TARIFF Fehler → vollständiger Rollback geprüft.

**Hinweis:** Fehler-Audit-Einträge (missing_tariff, ambiguous_tariff) werden ebenfalls zurückgerollt, da sie Teil der gleichen Transaktion sind. Für Debugging-Zwecke wäre ein `autonomous transaction` denkbar, aber das erhöht die Komplexität und ist aktuell nicht erforderlich.

---

## 7. Rechnungs-Checksums vorher/nachher

**Vor Staging-Tests:** 0 Rechnungen, 0 Items (sauberer Branch)

**Nach allen E2E-Tests:** 4 Rechnungen, 11 Items

| Rechnung | Client | Betrag | Status | Idempotency-Key |
|----------|--------|--------|--------|-----------------|
| RE-2026-00001 | TEST-001 | 150.00€ | entwurf | inv_..._2026-07_entlastung_v2 |
| RE-2026-00002 | TEST-003 | 85.50€ | entwurf | inv_..._2026-07_entlastung_v2 |
| RE-2026-00003 | TEST-003 | 35.00€ | entwurf | inv_..._2026-06_entlastung_v2 |
| RE-2026-00004 | TEST-002 | 127.47€ | entwurf | inv_..._2026-07_entlastung_v2 |

**Alle 4 Audit-Trail-Einträge** haben SHA-256 Checksums (64 Hex-Zeichen).

**Production-Rechnungen:** NICHT geprüft, NICHT verändert, NICHT gelesen (wie gefordert).

---

## 8. MERGE-GO

**MERGE-GO: JA** — unter folgenden Bedingungen:

1. Alle 10 E2E-Tests bestanden
2. Beide Security-Warnungen behoben
3. Drei kritische Bugs gefunden und gefixt (digest-Schema, checksum NOT NULL, CREATE EXTENSION Schema)
4. Rollback vollständig verifiziert
5. Org-Isolation verifiziert
6. Idempotenz verifiziert
7. Staging-Branch gelöscht, keine laufenden Kosten

**Commit für Merge:** `81cc23b` auf `feature/unified-invoice-creation`

**Voraussetzung:** Yusufs explizite Freigabe.

---

## 9. PRODUKTIONS-GO

**PRODUKTIONS-GO: SEPARAT — noch NEIN.**

**Vor Production-Deployment müssen folgende Schritte erfolgen:**

1. **Merge nach main** (nach Yusufs Freigabe)
2. **billing_tariffs Stammdaten** — echte Tarife müssen VOR der ersten Rechnungserstellung in Production angelegt werden. Ohne Tarife wird jede Rechnungserstellung mit MISSING_VALID_TARIFF fehlschlagen.
3. **Zuschlagsberechnung** — Die RPC enthält einen `TODO`-Kommentar für Wochenend-/Feiertag-/Nachtzuschläge. Diese werden aktuell ignoriert. Fachliche Entscheidung erforderlich.
4. **Bundesland-Logik** — Aktuell ist 'hessen' hardcoded im Spezifitäts-Scoring. Muss auf `organizations.bundesland` oder `clients.bundesland` umgestellt werden, sobald andere Bundesländer relevant sind.
5. **Production-Smoke-Test** — Nach Deployment einen Testlauf mit echten Tarifen (ohne echte Rechnungserstellung) empfohlen.

---

## Staging-Cleanup

| Ressource | Status |
|-----------|--------|
| Staging-Branch `orpqolybsjdlyrmryvhx` | **GELÖSCHT** |
| Testdaten (10 Tarife, 4 Clients, 13 SRs, 4 Rechnungen) | **MIT BRANCH GELÖSCHT** |
| Laufende Kosten ($0.01344/h) | **BEENDET** |
| Production-Daten | **UNVERÄNDERT** |

---

*Erstellt durch automatisierte Staging-Abnahme, 2026-08-07*
