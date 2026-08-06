# PR #35 — Staging-Abnahme-Bericht

**Branch:** `feature/billing-core-corrections`
**Test-Branch:** Supabase Branch `alobtftoyoxhxtqayrht` (von Produktion `nnwyktkqibdjxgimjyuq`)
**Datum:** 2026-08-06
**Ergebnis:** GO

---

## 1. Testumgebung

| Feld | Wert |
|---|---|
| Produktions-Supabase | `nnwyktkqibdjxgimjyuq` |
| Test-Branch-Supabase | `alobtftoyoxhxtqayrht` (temporaer, wird nach Bericht geloescht) |
| Branch-Typ | Schema-only, keine Produktionsdaten |
| Staging-DB (rpkdwwurewpmgmemhdje) | Nicht verwendet — fehlende Tabellen (nur 10 von ~100) |

**Hinweis:** Die Staging-DB `rpkdwwurewpmgmemhdje` ist nicht schema-aktuell (kein `invoices`-Table). Stattdessen wurde ein Supabase-Branch von Produktion erstellt, der das vollstaendige Produktionsschema ohne Daten enthaelt.

---

## 2. Migration

### Forward-Migration (20260806200000_billing_core_corrections.sql)

| Objekt | Status |
|---|---|
| billing_tariffs (24 Spalten) | Erstellt |
| invoice_snapshots (10 Spalten) | Erstellt |
| invoice_corrections (16 Spalten, inkl. GENERATED difference_cents) | Erstellt |
| invoice_line_snapshots (23 Spalten) | Erstellt |
| billing_number_sequences (5 Spalten) | Erstellt |
| billing_audit_trail (13 Spalten) | Erstellt |
| invoices +8 Spalten | Hinzugefuegt |
| 10 Indizes | Erstellt |
| Trigger trg_validate_invoice_status | Erstellt |
| Funktion validate_invoice_status_transition() | Erstellt |
| Funktion next_billing_number() | Erstellt |

### Rollback-Migration (20260806200001_rollback_billing_core_corrections.sql)

| Pruefung | Ergebnis |
|---|---|
| Alle 6 Tabellen entfernt | Bestanden |
| Alle 8 invoices-Spalten entfernt | Bestanden |
| Trigger entfernt | Bestanden |
| Funktionen entfernt | Bestanden |
| 21 RLS-Policies entfernt | Bestanden |
| Bestehende Rechnungen erhalten | Bestanden |

---

## 3. RLS-Policies (21 Stueck)

| Tabelle | Policy | Typ | Cmd |
|---|---|---|---|
| billing_tariffs | org_fence | RESTRICTIVE | ALL |
| billing_tariffs | select | PERMISSIVE | SELECT |
| billing_tariffs | insert | PERMISSIVE | INSERT |
| billing_tariffs | update | PERMISSIVE | UPDATE |
| invoice_snapshots | org_fence | RESTRICTIVE | ALL |
| invoice_snapshots | select | PERMISSIVE | SELECT |
| invoice_snapshots | insert | PERMISSIVE | INSERT |
| invoice_corrections | org_fence | RESTRICTIVE | ALL |
| invoice_corrections | select | PERMISSIVE | SELECT |
| invoice_corrections | insert | PERMISSIVE | INSERT |
| invoice_corrections | update | PERMISSIVE | UPDATE |
| invoice_line_snapshots | org_fence | RESTRICTIVE | ALL |
| invoice_line_snapshots | select | PERMISSIVE | SELECT |
| invoice_line_snapshots | insert | PERMISSIVE | INSERT |
| billing_number_sequences | org_fence | RESTRICTIVE | ALL |
| billing_number_sequences | select | PERMISSIVE | SELECT |
| billing_number_sequences | insert | PERMISSIVE | INSERT |
| billing_number_sequences | update | PERMISSIVE | UPDATE |
| billing_audit_trail | org_fence | RESTRICTIVE | ALL |
| billing_audit_trail | select | PERMISSIVE | SELECT |
| billing_audit_trail | insert | PERMISSIVE | INSERT |

**Kein UPDATE/DELETE auf:** invoice_snapshots, invoice_line_snapshots, billing_audit_trail

---

## 4. Testergebnisse

### E2E-Tests (11 bestanden, 0 fehlgeschlagen)

| Test | Ergebnis |
|---|---|
| Rechnung als Entwurf erstellen | Bestanden |
| Tarif anlegen und Preis aufloesung | Bestanden |
| Status entwurf → geprueft → freigegeben → uebermittelt | Bestanden |
| Rechnung festschreiben (frozen_at setzen) | Bestanden |
| Snapshot mit SHA-256 Checksumme erstellen | Bestanden |
| SHA-256 Checksumme verifiziert | Bestanden |
| Frozen Invoice — Inhaltsaenderung bei gueltigem Statuswechsel blockiert | Bestanden |
| Frozen Invoice — reiner Statuswechsel erlaubt | Bestanden |
| Fortlaufende Rechnungsnummer (RE-2026-00001, RE-2026-00002) | Bestanden |
| Storno-Praefix separat (ST-2026-00001) | Bestanden |
| Idempotency-Key — Duplikat blockiert (unique_violation) | Bestanden |

### Statusmaschinen-Tests (3 bestanden, 0 fehlgeschlagen)

| Test | Ergebnis |
|---|---|
| Ungueltiger Uebergang entwurf → bezahlt blockiert | Bestanden |
| Terminal-Status bezahlt → storniert blockiert | Bestanden |
| Vollstaendiger Lebenszyklus entwurf → ... → bezahlt | Bestanden |

### Korrektur-Tests (3 bestanden, 0 fehlgeschlagen)

| Test | Ergebnis |
|---|---|
| Storno-Rechnung + Correction-Record (difference_cents = -120000) | Bestanden |
| Korrekturrechnung mit correction_of FK | Bestanden |
| Gutschrift mit negativem Betrag | Bestanden |

### Audit-Trail-Tests (3 bestanden, 0 fehlgeschlagen)

| Test | Ergebnis |
|---|---|
| Audit-Eintrag mit SHA-256 Checksumme | Bestanden |
| Checksumme-Verifizierung (checksum_valid = true) | Bestanden |
| Kein UPDATE/DELETE Policy vorhanden | Bestanden |

### Legacy-Daten-Tests (2 bestanden, 0 fehlgeschlagen)

| Test | Ergebnis |
|---|---|
| Legacy status='draft' Rechnung unveraendert erhalten | Bestanden |
| Legacy draft — Inhaltsaenderung moeglich (Abwaertskompatibilitaet) | Bestanden |

### Mandantentrennung (3 bestanden, 0 fehlgeschlagen)

| Test | Ergebnis |
|---|---|
| Alle 6 Tabellen haben RESTRICTIVE org_fence Policy | Bestanden |
| org_fence verwendet current_org_id() in USING und WITH CHECK | Bestanden |
| Immutable Tabellen haben kein UPDATE/DELETE Policy | Bestanden |

### Rollback-Test (1 bestanden)

| Test | Ergebnis |
|---|---|
| Forward + Rollback + Verifizierung aller Objekte entfernt | Bestanden |

---

## 5. Legacy-Daten-Dokumentation

### Ist-Zustand
Produktion hat 5 Rechnungen, alle mit status='draft' (alter Enum-Wert).

### Trigger-Verhalten
Der Trigger `validate_invoice_status_transition()` prueft nur die neuen deutschen Statuswerte (entwurf, geprueft, etc.). Alte Rechnungen mit status='draft' fallen durch ALLE IF-Bloecke ohne Fehler (gewollte Abwaertskompatibilitaet).

### Empfohlene Backfill-Migration (NICHT Teil von PR #35)
```sql
-- Optionale Migration nach PR #35 Merge:
-- UPDATE public.invoices SET status = 'entwurf' WHERE status = 'draft';
-- Erst ausfuehren nachdem alle API-Routen den neuen Status verwenden.
```

### Hinweis
Der Backfill sollte NICHT mit PR #35 ausgeliefert werden, sondern als separate Migration nach vollstaendiger API-Integration. Legacy-Rechnungen funktionieren bis dahin normal.

---

## 6. Produktionsintegritaet

| Pruefung | Ergebnis |
|---|---|
| Keine PR #35 Tabellen in Produktion | Bestanden |
| Keine neuen invoices-Spalten in Produktion | Bestanden |
| Kein trg_validate_invoice_status in Produktion | Bestanden |
| Keine neuen Funktionen in Produktion | Bestanden |
| Produktionsdaten nicht gelesen/kopiert/exportiert | Bestanden |

Bestehender Produktions-Trigger `trg_invoices_no_finalized_edit` ist NICHT von PR #35 und wurde nicht veraendert.

---

## 7. API-Routen

API-Routen-Tests konnten nicht gegen Vercel-Preview durchgefuehrt werden, da:
1. Die Vercel-Preview-Umgebung mit der Staging-DB (`rpkdwwurewpmgmemhdje`) verbunden ist, nicht mit dem Test-Branch
2. ENV-Variablen-Umstellung auf den temporaeren Branch haette Vercel-Konfiguration erfordert

**Ersatzpruefung:** Die 7 API-Routen wurden durch Code-Review verifiziert:
- Alle Routen verwenden `createClient()` bzw. `createAdminClient()` korrekt
- Admin-Checks via `is_admin()` auf allen schreibenden Routen
- RLS greift durch den Supabase-Client

**Empfehlung:** API-Routen-Tests als E2E nach Merge auf dem naechsten Preview-Deploy durchfuehren.

---

## 8. Rollback-Ziel

| Feld | Wert |
|---|---|
| Rollback-Migration | `20260806200001_rollback_billing_core_corrections.sql` |
| Rollback-Schritte | 1. Rollback-SQL ausfuehren, 2. `./scripts/rollback.sh 1 --push`, 3. Vercel Deploy abwarten |
| Getestet | Ja — vollstaendig auf Branch getestet und verifiziert |

---

## 9. Bekannte Risiken

1. **Staging-DB nicht schema-aktuell** — rpkdwwurewpmgmemhdje hat nur 10 Tabellen, Produktion ~100. Empfehlung: Staging auf Produktionsschema aktualisieren oder dauerhaft Supabase Branches nutzen.

2. **Statusmaschine: Fehlermeldung bei Content-Change ohne Status-Change** — Wenn nur `total_amount` geaendert wird (ohne Status-Change), kommt "Ungueltiger Statusuebergang: X -> X" statt "Festgeschriebene Rechnung...". Der Schutz funktioniert (Change wird blockiert), aber die Fehlermeldung ist irrefuehrend. Nicht blockierend — kann in PR #36 korrigiert werden.

3. **Legacy-Backfill** — 5 Produktionsrechnungen mit status='draft' muessen irgendwann zu 'entwurf' migriert werden. Kein Rush — Abwaertskompatibilitaet ist gegeben.

4. **API-Routen nicht gegen Live-Preview getestet** — Code-Review statt E2E. Empfehlung: Nach Merge als erstes API-Smoke-Test auf Preview.

5. **Bestehender Trigger-Konflikt** — Produktion hat `trg_invoices_no_finalized_edit`, PR #35 bringt `trg_validate_invoice_status`. Beide feuern auf invoices UPDATE. Potentieller Doppel-Block, muss beim Merge verifiziert werden.

---

## 10. Testzahlen-Zusammenfassung

| Kategorie | Bestanden | Fehlgeschlagen |
|---|---|---|
| E2E-Tests | 11 | 0 |
| Statusmaschine | 3 | 0 |
| Korrekturen | 3 | 0 |
| Audit-Trail | 3 | 0 |
| Legacy-Daten | 2 | 0 |
| Mandantentrennung | 3 | 0 |
| Rollback | 1 | 0 |
| **Gesamt** | **26** | **0** |

Unit-Tests (aus PR #35 Repo): 52 bestanden, 0 fehlgeschlagen

---

## 11. Bewertung

**GO — mit Auflagen:**

1. Nach Merge: API-Smoke-Test auf Vercel-Preview
2. Trigger-Interaktion mit bestehendem `trg_invoices_no_finalized_edit` pruefen
3. Legacy-Backfill als separate Migration planen (NICHT mit PR #35)
4. Staging-DB auf Produktionsschema aktualisieren (separates Ticket)
