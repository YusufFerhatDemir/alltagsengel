# Readiness Dashboard — 2026-08-10

Stand: Branch `staging/expansion-abnahme` @ Commit `7126f42`

---

## Gesamtuebersicht

| Bereich | Status | Details |
|---------|--------|---------|
| **CODE READY** | PASS (mit Einschraenkungen) | TypeScript 0 Fehler, Vitest 340/340 Tests gruen, Build warn-only (stale .next/types Referenzen auf nicht-committete Touren-Routes) |
| **DATABASE READY** | FAIL | ~10 Billing-Migrationen ausstehend (RPCs, Kataloge, Constraints), ~20 weitere Module-Migrationen ausstehend |
| **TARIFF DATA READY** | **FAIL** | billing_tariffs hat 0 Zeilen. Kein einziger Preis hinterlegt. Ohne Tarifdaten kann keine Rechnung erstellt werden. |
| **SECURITY READY** | PASS (Code) / FAIL (DB) | Org-Fence Migration 20260819020000 vorhanden und getestet, aber noch NICHT auf Production applied. Engine hat Defense-in-Depth (expectedOrgId). |
| **BILLING READY** | PASS (Code) / FAIL (Daten) | F1-F8 Audit bestanden, Engine komplett, Tarif-Import Pipeline vorhanden. Blockiert durch fehlende Tarifdaten und ausstehende Migrationen. |
| **FEIERTAGE** | PASS | Gauss-Algorithmus korrekt, 2026 Hessen verifiziert (10 Feiertage). Import-Funktion idempotent. Zuschlagssaetze = 0% (muessen aus Vertraegen kommen). |
| **EXTERNAL REQUIREMENTS** | **FAIL** | Anerkennungsbescheid, Verguetungsvereinbarungen, IK-Nummern, Private Preisliste — alles fehlt |
| **PRODUCTION READY** | **NEIN** | Blockiert durch: (1) Tarifdaten, (2) Migrationen, (3) Externe Dokumente |

---

## Detail: CODE READY

| Pruefung | Ergebnis |
|----------|----------|
| TypeScript (`tsc --noEmit`) | 0 Fehler (warn-only Touren-Referenzen in .next/types) |
| Vitest Billing | 340 Tests, 16 Dateien, alle PASS |
| Tariff-Import Tests | 10/10 PASS |
| Feiertage Tests | 13/13 PASS |
| Billing F1-F8 Audit Tests | alle PASS |
| Price-Resolver Tests | alle PASS |
| Invoice-Engine Tests | alle PASS |

## Detail: BILLING F1-F8

| Finding | Status | Details |
|---------|--------|---------|
| F1: Org-Fence invoices/invoice_items | FIX COMMITTED | Migration 20260819020000 + Engine Defense-in-Depth |
| F2: Admin-UI Status-Updates | OK | Statusmaschine serverseitig, validateTransition() |
| F3: correctInvoice insert-Fehler | FIX COMMITTED | Error-Throw statt silent fail bei items-Insert |
| F4: monatsabschluss Fallback | FIX COMMITTED | Kein service_records.amount Fallback mehr fuer Kassenleistungen |
| F5: Rollback-Dateien | VORHANDEN | 4 Rollback-Migrationen committet |
| F6: freezeInvoice einzelpreis_cent | FIX COMMITTED | einzelpreis_cent aus gesamtpreis_cent/menge berechnet |
| F7: tariff_version | DOKUMENTIERT | Analyse im Abschlussbericht |
| F8: generateInvoiceNumber Race-Condition | MITIGIERT | RPC next_billing_number als primaere Methode, Fallback dokumentiert |

## Detail: TARIFF DATA

| Pruefung | Ergebnis |
|----------|----------|
| billing_tariffs Tabelle existiert (Migration) | JA (20260807110000) |
| billing_leistungsarten Katalog | JA (12 Eintraege, Seed in 20260807120000) |
| billing_rechtsgrundlagen Katalog | JA (4 Eintraege) |
| Tarif-Eintraege vorhanden | **NEIN — 0 Zeilen** |
| Tarif-Import-Pipeline funktional | JA (validated by tests) |
| Zuschlagssaetze hinterlegt | NEIN (Default 0%) |

## Detail: SECURITY

| Pruefung | Ergebnis |
|----------|----------|
| Org-Fence invoices (RESTRICTIVE) | Migration vorhanden, NICHT applied |
| Org-Fence invoice_items (RESTRICTIVE) | Migration vorhanden, NICHT applied |
| Org-Fence invoice_disputes (RESTRICTIVE) | Migration vorhanden, NICHT applied |
| Anon-Deny invoices | Migration vorhanden, NICHT applied |
| Engine expectedOrgId Check | JA (freeze, cancel, correct, credit) |
| Tarif-Gegenprüfung bei Korrekturen | JA (>10% Abweichung = Pflicht korrekturgrundPreis) |
| Audit-Trail | JA (billing_audit_trail, logBillingAction) |

## Detail: EXTERNE VORAUSSETZUNGEN

| Dokument | Status | Wer |
|----------|--------|-----|
| Anerkennung §45a SGB XI (RP Giessen) | **FEHLT** | Yusuf |
| Verguetungsvereinbarung AOK Hessen | **FEHLT** | Yusuf |
| Verguetungsvereinbarung BKK/IKK | **FEHLT** | Yusuf |
| Eigene IK-Nummer (ARGE IK) | **Status unklar** | Yusuf |
| Pflegekasse-IK-Nummern | **FEHLEN** | Yusuf / GKV-Verzeichnis |
| Private Preisliste | **FEHLT** | Yusuf / GF-Entscheidung |
| Tarifvertrag (Zeitzuschlaege) | **FEHLT** | Yusuf |
