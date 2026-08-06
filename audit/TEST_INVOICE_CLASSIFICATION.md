# TEST-Rechnungen Klassifikationsbericht

**Datum:** 2026-08-06
**Branch:** fix/pre-backfill-security
**Quelle:** Production Preflight Report (audit/PRODUCTION_PREFLIGHT_FINAL_REPORT.md)

---

## Identifizierte Test-Rechnungen

### RG-2026-TEST-001

| Feld | Wert |
|------|------|
| invoice_id | c292fd2d-… |
| invoice_number | RG-2026-TEST-001 |
| Status (IST) | sent |
| Status (SOLL) | uebermittelt |
| total_amount | 43,50 € |
| created_at | 2026-07-31 19:11:53 UTC |
| organization_id | 00000000-0000-4000-8000-000460629986 |
| invoice_items | 2 Positionen |
| service_records | 2 verknüpft |
| soll_betrag_cent | 4350 |
| ist_betrag_cent | 4000 |
| kuerzung_cent | 350 |
| kuerzung_grund | TESTFALL (Teilgenehmigung) |

### RG-2026-TEST-002

| Feld | Wert |
|------|------|
| invoice_id | e16ea245-… |
| invoice_number | RG-2026-TEST-002 |
| Status (IST) | sent |
| Status (SOLL) | uebermittelt |
| total_amount | 70,00 € |
| created_at | 2026-07-31 19:11:53 UTC |
| organization_id | 00000000-0000-4000-8000-000460629986 |
| invoice_items | 1 Position |
| service_records | 1 verknüpft |
| soll_betrag_cent | 7000 |
| ist_betrag_cent | 7000 |
| kuerzung_cent | 0 |

---

## Klassifikation

**Kategorie A — Testdaten, später löschbar**

### Begründung

1. **TEST-Prefix:** Beide Rechnungsnummern tragen das Prefix „RG-2026-TEST-", das sie eindeutig als Testdaten kennzeichnet. Produktions-Rechnungen verwenden „RE-2026-NNNN".

2. **Erstellungsdatum:** Beide am 2026-07-31 erstellt — zeitlich nach den 3 echten Produktions-Rechnungen (2026-07-02), im Rahmen einer Test-Session.

3. **Keine FK-Abhängigkeiten zu kritischen Tabellen:** Die einzigen Fremdschlüssel-Beziehungen bestehen zu:
   - `invoice_items` (2 + 1 = 3 Positionen) — werden mit der Rechnung gelöscht (CASCADE oder manuell)
   - `service_records` (2 + 1 = 3 verknüpft) — Verknüpfung über invoice_id, kein CASCADE
   - Keine Einträge in `invoice_disputes`, `invoice_corrections`, `invoice_packages`
   - Keine Einträge in `billing_audit_trail` (Tabelle ist leer)

4. **Keine Zahlungsdaten:** Kein `paid_amount`, kein `paid_at`, kein `sent_at` — die Rechnungen wurden nie real verarbeitet.

5. **Kürzungs-Testfall:** RG-2026-TEST-001 hat explizit `kuerzung_grund = 'TESTFALL (Teilgenehmigung)'`, was den Testzweck dokumentiert.

---

## Empfehlung

Die beiden TEST-Rechnungen können nach erfolgreichem Backfill und Staging-Abnahme in einem separaten Cleanup-PR gelöscht werden.

**Löschreihenfolge:**
1. `service_records` mit Bezug zu den Test-Rechnungen (FK auf invoice_id lösen)
2. `invoice_items` für die beiden invoice_ids
3. `invoices` mit den beiden invoice_ids

**Nicht im Scope dieses PRs.** Löschung erst nach vollständiger Migration und Produktionsfreigabe.

---

## Sicherheitsbestätigung

- Keine echten Kundendaten in diesem Bericht
- Invoice-IDs nur als UUID-Prefix dargestellt
- Keine Secrets, Tokens oder Connection-Strings
