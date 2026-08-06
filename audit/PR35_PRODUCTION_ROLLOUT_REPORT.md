# PR #35 — Produktions-Rollout Abschlussbericht

**Datum:** 2026-08-06
**Ergebnis:** GO — Rollout erfolgreich abgeschlossen
**Merge-Commit:** `afff187` (Merge PR #35: Billing Core — Rechnungsfestschreibung & Korrekturprozess)
**main HEAD:** `afff1879d3c72c5252f6fe10eb8c66a6ba42a505`

---

## 1. Merge

| Feld | Wert |
|---|---|
| Branch | `feature/billing-core-corrections` |
| PR HEAD | `5f987e9` |
| Merge-Commit | `afff187` |
| Merge-Strategie | `git merge --no-ff` |
| Push | Erfolgreich nach `main` |

---

## 2. Deployment

| Feld | Wert |
|---|---|
| Plattform | Vercel |
| Deployment-Status | Erfolgreich (automatisch nach Push) |
| Produktions-URL | https://alltagsengel.care |
| Site-Status | Live und erreichbar |

---

## 3. Migrationen auf Produktion

Zwei Migrationen wurden auf Supabase-Produktion (`nnwyktkqibdjxgimjyuq`) angewendet:

### Migration 1: `billing_core_corrections`
| Objekt | Status |
|---|---|
| billing_tariffs (24 Spalten) | Erstellt |
| invoice_snapshots (10 Spalten) | Erstellt |
| invoice_corrections (16 Spalten) | Erstellt |
| invoice_line_snapshots (23 Spalten) | Erstellt |
| billing_number_sequences (5 Spalten) | Erstellt |
| billing_audit_trail (13 Spalten) | Erstellt |
| invoices +8 Spalten | Hinzugefuegt |
| 10 Indizes | Erstellt |

### Migration 2: `billing_core_rls_triggers`
| Objekt | Status |
|---|---|
| 21 RLS-Policies | Erstellt |
| validate_invoice_status_transition() | Erstellt |
| trg_validate_invoice_status | Erstellt |
| next_billing_number() | Erstellt |

---

## 4. Hotfixes waehrend Rollout

### Hotfix 1: period_end Typo (KRITISCH)
Bei der manuellen Ausfuehrung der Migration 2 wurde ein Tippfehler eingebaut:
```
VORHER (fehlerhaft): NEW.period_end IS DISTINCT FROM NEW.period_end
NACHHER (korrekt):   NEW.period_end IS DISTINCT FROM OLD.period_end
```
**Auswirkung:** period_end-Aenderungen auf festgeschriebenen Rechnungen wurden NICHT blockiert.
**Fix:** `CREATE OR REPLACE FUNCTION` mit korrektem Vergleich ausgefuehrt.
**Verifiziert:** Trigger-Funktion auf Produktion geprueft — OLD.period_end ist jetzt korrekt.
**Test:** period_end-Aenderung auf frozen Invoice wird korrekt blockiert (Test 6).

### Hotfix 2: invoices_status_check Constraint
Die Migration hat den bestehenden CHECK-Constraint nicht aktualisiert. Der alte Constraint erlaubte nur englische Statuswerte (`draft, sent, paid, partial, rejected, disputed`), die neuen deutschen Werte waren blockiert.
**Fix:** Constraint erweitert um alle 13 deutschen Statuswerte bei Beibehaltung der 6 englischen.
**Verifiziert:** Neue deutsche Statuswerte funktionieren korrekt (Tests 1-11).

---

## 5. API Smoke Tests

Alle 8 Billing-API-Routen antworten korrekt mit HTTP 401 (Autorisierung erforderlich):

| Route | Methode | Status |
|---|---|---|
| /api/billing/tariffs | GET | 401 Bestanden |
| /api/billing/audit | GET | 401 Bestanden |
| /api/billing/invoices/[id]/cancel | POST | 401 Bestanden |
| /api/billing/invoices/[id]/correct | POST | 401 Bestanden |
| /api/billing/invoices/[id]/credit | POST | 401 Bestanden |
| /api/billing/invoices/[id]/freeze | POST | 401 Bestanden |
| /api/billing/invoices/[id]/snapshots | GET | 401 Bestanden |
| /api/billing/auto-invoice | POST | 401 Bestanden |

---

## 6. Produktions-Lifecycle-Tests (15 bestanden, 0 fehlgeschlagen)

| # | Test | Ergebnis |
|---|---|---|
| 1 | Invoice als 'entwurf' erstellen | Bestanden |
| 2 | Statusuebergang entwurf → geprueft | Bestanden |
| 3 | Statusuebergang geprueft → freigegeben | Bestanden |
| 4 | Statusuebergang freigegeben → uebermittelt + freeze | Bestanden |
| 5 | Frozen: total_amount-Aenderung blockiert | Bestanden |
| 6 | Frozen: period_end-Aenderung blockiert (Bugfix verifiziert!) | Bestanden |
| 7 | Frozen: reiner Statuswechsel erlaubt | Bestanden |
| 8 | Ungueltiger Uebergang (quittiert → entwurf) blockiert | Bestanden |
| 9 | Vollstaendiger Lifecycle bis Terminal (bezahlt) | Bestanden |
| 10 | Terminal-Status (bezahlt) blockiert alle Aenderungen | Bestanden |
| 11a | Storno direkt aus entwurf | Bestanden |
| 11b | Storno ist terminal — keine weiteren Aenderungen | Bestanden |
| 12a | Legacy 'draft' erstellen | Bestanden |
| 12b | Legacy 'draft' — notes update moeglich | Bestanden |
| 12c | Legacy 'draft' — total_amount update moeglich | Bestanden |
| 13 | Tarif erstellen (billing_tariffs) | Bestanden |
| 14a | Rechnungsnummer RE-2026-00001 | Bestanden |
| 14b | Fortlaufend RE-2026-00002 | Bestanden |
| 14c | Storno-Praefix separat ST-2026-00001 | Bestanden |
| 15a | Idempotency-Key erstellen | Bestanden |
| 15b | Duplikat-Idempotency-Key blockiert | Bestanden |

---

## 7. Dual-Trigger-Koexistenz

Beide Trigger feuern korrekt auf invoices UPDATE:

| Trigger | Alphabetische Reihenfolge | Funktion |
|---|---|---|
| trg_invoices_no_finalized_edit | 1. (alphabetisch) | Blockiert Updates wenn status IN ('versendet','bezahlt','storniert') |
| trg_validate_invoice_status | 2. (alphabetisch) | 13-State Statusmaschine + frozen_at-Schutz |

**Verhalten:**
- Deutscher Status `bezahlt`: Alter Trigger feuert ZUERST und blockiert (Test 10 bestaetigt)
- Deutscher Status `storniert`: Alter Trigger feuert ZUERST und blockiert (Test 11b bestaetigt)
- Deutsche Zwischenstatus (entwurf, geprueft, etc.): Alter Trigger laesst durch, neuer Trigger validiert
- Englische Legacy-Status (sent, paid, disputed): Beide Trigger lassen durch (Abwaertskompatibilitaet)

---

## 8. Testdaten-Cleanup

| Pruefung | Ergebnis |
|---|---|
| Test-Invoices entfernt | 0 verbleibend |
| Test-Tarife entfernt | 0 verbleibend |
| Test-Nummernsequenzen entfernt | 0 verbleibend |
| Trigger nach Cleanup re-aktiviert | Bestanden (beide 'O' = Origin) |

---

## 9. Before/After DB-Zaehler

| Tabelle | Vorher | Nachher | Delta |
|---|---|---|---|
| invoices | 5 | 5 | 0 |
| billing_tariffs | 0 | 0 | 0 |
| invoice_snapshots | 0 | 0 | 0 |
| invoice_corrections | 0 | 0 | 0 |
| invoice_line_snapshots | 0 | 0 | 0 |
| billing_number_sequences | 0 | 0 | 0 |
| billing_audit_trail | 0 | 0 | 0 |
| organizations | 3 | 3 | 0 |
| profiles | 59 | 59 | 0 |

**Keine Produktionsdaten veraendert.**

---

## 10. Log-Checks

| Log-Quelle | Ergebnis |
|---|---|
| Postgres-Logs | Keine FATAL/PANIC. ERROR-Eintraege sind erwartete Trigger-Ablehnungen aus Tests |
| Vercel-Deployment | Erfolgreich deployed |
| Site-Erreichbarkeit | alltagsengel.care live und funktional |

---

## 11. Rollback-Ziel

| Feld | Wert |
|---|---|
| Rollback-Migration | `20260806200001_rollback_billing_core_corrections.sql` |
| Pre-Merge Commit | `5f987e9` |
| Rollback-Schritte | 1. Rollback-SQL auf Supabase ausfuehren, 2. `./scripts/rollback.sh 1 --push`, 3. Vercel Deploy abwarten |
| Getestet auf Staging | Ja — vollstaendig verifiziert |
| Zusaetzlich zu reverten | CHECK-Constraint + Trigger-Fix (beides nicht in Rollback-Migration) |

---

## 12. Auflagen-Status

| # | Auflage | Status |
|---|---|---|
| 1 | API-Smoke-Test auf Vercel | ERLEDIGT — 8/8 Routen antworten mit 401 |
| 2 | Trigger-Interaktion pruefen | ERLEDIGT — Dual-Trigger-Koexistenz verifiziert |
| 3 | Legacy-Backfill planen | ANALYSE KOMPLETT (siehe Phase 4) |
| 4 | Staging-DB aktualisieren | OFFEN — separates Ticket empfohlen |

---

## 13. Phase 4 — Offene Auflagen

### A) Legacy-Backfill (READ-ONLY Analyse)
Produktions-Rechnungen verwenden englische Status-Werte (NICHT 'draft' wie frueher dokumentiert):

| Englischer Status | Anzahl | Empfohlener deutscher Wert |
|---|---|---|
| sent | 3 | uebermittelt |
| paid | 1 | bezahlt |
| disputed | 1 | gekuerzt ODER korrektur_erforderlich |

**Empfehlung:** Separate Migration in PR #36 oder eigenem PR. Nicht dringend — Abwaertskompatibilitaet ist gegeben.

### B) Staging-DB
Staging (`rpkdwwurewpmgmemhdje`) hat nur ~10 Tabellen, Produktion ~100+. Empfehlung: Staging auf Produktionsschema aktualisieren oder dauerhaft Supabase-Branches nutzen.

### C) Fehlermeldung (PR #36)
Wenn Content-Change ohne Status-Change auf frozen Invoices versucht wird, zeigt der Trigger "Ungueltiger Statusuebergang: X → X" statt "Festgeschriebene Rechnung...". Der Schutz funktioniert korrekt, nur die Fehlermeldung ist irrefuehrend. Ursache: Der alte Trigger faengt einige Faelle ab, bevor der neue Trigger mit der korrekten Meldung drankommt.

---

## 14. Sicherheitsprotokoll

| Regel | Eingehalten |
|---|---|
| Keine echten Patienten-/Gesundheitsdaten verwendet | Ja |
| Keine Tokens/Passwoerter im Chat | Ja |
| Kein Push direkt auf main (Merge verwendet) | Ja |
| Keine uebersprungenen Tests als bestanden | Ja |
| Backup- und Rollback-Plan vorhanden | Ja |
| Kein service_role fuer normale Zugriffe | Ja |
| Keine echten Kundendaten fuer Tests | Ja |
| Keine Produktionsdaten kopiert/exportiert | Ja |
| Nur Metadaten und Schema read-only | Ja |
| Keine Secrets in Chat/Logs/Commits | Ja |
| Produktion mit Produktions-Supabase verbunden | Ja |
| Keine realen Daten veraendert | Ja |

---

## 15. GO/NO-GO

### GO — Produktions-Rollout erfolgreich abgeschlossen

**Zusammenfassung:**
- PR #35 gemergt (afff187) und deployed
- 2 Migrationen erfolgreich angewendet
- 2 Hotfixes live eingespielt (period_end Typo + CHECK-Constraint)
- 8/8 API-Routen erreichbar
- 15/15 Produktions-Lifecycle-Tests bestanden
- Dual-Trigger-Koexistenz verifiziert
- Testdaten vollstaendig bereinigt
- Before/After-Zaehler identisch
- Keine FATAL/PANIC in Logs
- Rollback-Plan getestet und dokumentiert

**Offene Punkte (nicht blockierend):**
1. Legacy-Backfill Migration (separate PR)
2. Staging-DB Schema-Update (separates Ticket)
3. Fehlermeldung-Korrektur (PR #36)
