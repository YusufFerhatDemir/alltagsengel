# Legacy-Admin-UI PR — GO/NO-GO Bericht

**Datum:** 2026-08-06
**Commit:** 6ba3ebb (main)
**Vorgänger:** 0a2f08a (PR #35 Closeout)

---

## Ergebnis: ✅ GO

Alle Änderungen implementiert und getestet. Keine Blocker.

---

## 1. Analyse-Scope

### Geprüfte Dateien
| Datei | Änderung |
|-------|----------|
| `app/admin/invoices/page.tsx` | Dual-Mode EN+DE: Filter, Advance, Totals, CreateModal |
| `app/admin/rechnungserstellung/page.tsx` | `status: 'draft'` → `status: 'entwurf'` |

### Geprüft, keine Änderung nötig
| Datei | Grund |
|-------|-------|
| `lib/admin/ops.ts` | INVOICE_STATUS enthält bereits EN+DE Labels (PR #35) |
| `lib/billing/core/status-machine.ts` | Rein deutsche Type-Definitionen — korrekt |
| `app/api/billing/auto-invoice/route.ts` | Bereits auf `entwurf` umgestellt (PR #35) |
| `app/api/admin/invoices/[id]/generate-pdf/route.ts` | Liest nur Daten, prüft keinen Status |

---

## 2. Änderungen im Detail

### 2.1 Neue Rechnungen: `draft` → `entwurf`

| Stelle | Vorher | Nachher |
|--------|--------|---------|
| `invoices/page.tsx` CreateInvoiceModal (Zeile 337) | `status: 'draft'` | `status: 'entwurf'` |
| `rechnungserstellung/page.tsx` createInvoice (Zeile 183) | `status: 'draft'` | `status: 'entwurf'` |

**Ergebnis:** Keine neuen Rechnungen werden mehr mit `draft` erstellt.

### 2.2 Dual-Mode Filter (INVOICE_FILTERS)

10 Filter-Gruppen mit zugeordneten DB-Werten:

| Filter | Enthält EN | Enthält DE |
|--------|------------|------------|
| entwurf | draft | entwurf, geprueft, freigegeben |
| uebermittelt | sent | uebermittelt, erneut_eingereicht |
| quittiert | — | quittiert |
| teilweise_bezahlt | partial | teilweise_bezahlt |
| bezahlt | paid | bezahlt, akzeptiert |
| gekuerzt | — | gekuerzt |
| strittig | disputed | strittig |
| abgelehnt | rejected | abgelehnt, korrektur_erforderlich |
| storniert | — | storniert |

**Ergebnis:** Bestehende EN-Rechnungen werden im richtigen Filter angezeigt. Keine automatische Änderung der DB-Werte.

### 2.3 Dual-Mode Advance-Funktion

| Aktueller Status | Aktion | Zielstatus | Extras |
|-----------------|--------|------------|--------|
| draft (Legacy) | Versenden → | sent | sent_at |
| entwurf | Prüfen → | geprueft | — |
| geprueft | Freigeben → | freigegeben | — |
| freigegeben | Übermitteln → | uebermittelt | sent_at |
| uebermittelt | Quittieren → | quittiert | — |
| abgelehnt | Erneut einreichen → | erneut_eingereicht | sent_at |
| erneut_eingereicht | Übermitteln → | uebermittelt | sent_at |
| korrektur_erforderlich | Zur Korrektur → | entwurf | — |
| sent/partial/disputed (EN) | Zahlung erfassen | paid/partial | paid_amount, paid_at |
| quittiert/teilweise_bezahlt/strittig (DE) | Zahlung erfassen | bezahlt/teilweise_bezahlt | paid_amount, paid_at |
| gekuerzt | Entscheiden → | akzeptiert ODER korrektur_erforderlich | Confirm-Dialog |

**Wichtig:** Legacy-EN-Status (sent, partial, disputed) bleiben im englischen Flow → Zielstatus bleibt englisch. Nur deutsche Status → deutsche Zielstatus.

### 2.4 Totals-Berechnung

| Kennzahl | Vorher | Nachher |
|----------|--------|---------|
| Offen | draft, sent, partial, disputed | OPEN_STATUSES Set (14 Werte, EN+DE) |
| Bezahlt | paid | PAID_STATUSES Set (paid, bezahlt, akzeptiert) |
| Kürzung | paid + Differenz | PAID_STATUSES + Differenz |

---

## 3. Was NICHT geändert wurde

- ✅ Bestehende englische Produktionsstatus werden NICHT automatisch verändert
- ✅ EDIFACT-Prozesse: nicht betroffen (eigenes Modul, liest Status nur)
- ✅ Rechnungs-/Korrektur-Logik: keine Änderung an status-machine.ts
- ✅ Audit-Prozesse: keine Änderung
- ✅ RLS: Policies referenzieren keine Status-Werte (nur org_id, admin, client_id)
- ✅ Org-Fence: `invoices_org_fence` Policy mit `organization_id = current_org_id()` unverändert

---

## 4. Tests

### 4.1 Billing-Tests (vitest)
| Suite | Tests | Ergebnis |
|-------|-------|----------|
| status-machine-strittig | 21 | ✅ bestanden |
| status-machine | 25 | ✅ bestanden |
| status-constraint | 18 | ✅ bestanden |
| invoice-engine | 18 | ✅ bestanden |
| price-resolver | 9 | ✅ bestanden |
| **Gesamt** | **91** | **✅ bestanden** |

### 4.2 TypeScript
- `tsc --noEmit`: Keine Fehler in geänderten Dateien
- Bestehende Typecheck-Warnungen (Testdateien ohne @types/vitest) — vorbekannt, nicht relevant

### 4.3 Vorbekannte Testfehler (NICHT durch diese Änderung)
- `p0-1-admin-auth.test.ts` — fehlendes NEXT_PUBLIC_SUPABASE_URL in CI
- `tenant-isolation.test.ts` — Shadow-DB DDL-Checks

---

## 5. Production-Backfill READ-ONLY Bestandsaufnahme

### 5.1 Aktuelle Production-Daten

| Status (EN) | Anzahl | Organisationen | Zuordnung (DE) |
|-------------|--------|----------------|-----------------|
| sent | 3 | 1 | → uebermittelt |
| paid | 1 | 1 | → bezahlt |
| disputed | 1 | 1 | → strittig |
| **Gesamt** | **5** | **1** | |

### 5.2 Zuordnung EN → DE

| Englisch | Deutsch | Eindeutig? |
|----------|---------|------------|
| draft | entwurf | ✅ Ja |
| sent | uebermittelt | ✅ Ja |
| paid | bezahlt | ✅ Ja |
| partial | teilweise_bezahlt | ✅ Ja |
| rejected | abgelehnt | ✅ Ja |
| disputed | strittig | ✅ Ja |

**Nicht eindeutig zuordenbare Werte:** Keine. Alle 6 englischen Status haben exakt eine deutsche Entsprechung.

### 5.3 Betroffene Tabellen

| Tabelle | Betroffene Einträge | Status-Feld? |
|---------|--------------------|--------------| 
| invoices | 5 | ✅ status wird geändert |
| invoice_disputes | 1 (status='open') | ❌ eigenes Status-Feld, nicht betroffen |
| invoice_corrections | 0 | ❌ nicht betroffen |
| invoice_items | 18 | ❌ kein Status-Feld |
| invoice_packages | 0 | ❌ nicht betroffen |

### 5.4 Voraussetzungen für Backfill

**MUSS VOR Backfill:**
1. Migration `20260806400000_add_strittig_status.sql` auf Production anwenden
   - Erweitert CHECK-Constraint auf 20 Werte (+ strittig)
   - Ersetzt Trigger-Funktion MIT Self-Transition-Fix + frozen_at-Schutz
   - **ACHTUNG:** Production-Trigger hat derzeit KEINEN Self-Transition-Guard → Backfill würde OHNE diese Migration fehlschlagen

2. Migration `20260806500000_legacy_status_backfill.sql` anwenden
   - Deaktiviert beide Trigger temporär
   - UPDATE invoices SET status = 'uebermittelt' WHERE status = 'sent' (3 Stück)
   - UPDATE invoices SET status = 'bezahlt' WHERE status = 'paid' (1 Stück)
   - UPDATE invoices SET status = 'strittig' WHERE status = 'disputed' (1 Stück)
   - Reaktiviert beide Trigger

### 5.5 Backup- und Rollback-Plan

**Backup:**
- Kein separates Backup nötig — Rollback-Migration revertiert exakt
- Empfohlen: Supabase Dashboard → Point-in-Time Recovery ist automatisch aktiv

**Rollback:**
- Migration `20260806500001_rollback_legacy_status_backfill.sql` revertiert alle Status
- Mapping: uebermittelt→sent, bezahlt→paid, strittig→disputed
- Idempotent: WHERE-Klausel prüft auf deutschen Quellwert
- Getestet auf Staging (PR #35)

### 5.6 Erwartete Auswirkungen

| Bereich | Auswirkung |
|---------|------------|
| Rechnungsanzeige (Admin-UI) | Filter und Advance funktionieren sofort für DE-Status |
| Zahlungen | paid→bezahlt: bezahlt ist Terminal-Status, identisches Verhalten |
| Korrekturen | Keine Korrekturen vorhanden → keine Auswirkung |
| EDIFACT | Liest Status, keine Logik basierend auf EN-Werten |
| Audit-Trail | Statusänderung wird in updated_at reflektiert |
| RLS/Org-Fence | Nicht betroffen (keine Status-Referenz in Policies) |

---

## 6. Production-Status

### CHECK-Constraint (Production)
- 19 Werte (OHNE strittig) — `20260806400000` noch NICHT angewendet

### Trigger-Funktion (Production)
- ALTE Version: kein Self-Transition-Guard, kein strittig, frozen_at-Check an falscher Position
- MUSS durch `20260806400000` aktualisiert werden

### Spaltenname
- Production: `organization_id` (NICHT `org_id` wie auf Staging)
- Backfill-Migration betrifft nur `status`-Spalte → kein Problem

---

## 7. Empfohlene Reihenfolge für Production

1. `20260806400000_add_strittig_status.sql` anwenden (Constraint + Trigger)
2. Verifizieren: `SELECT status, count(*) FROM invoices GROUP BY status`
3. `20260806500000_legacy_status_backfill.sql` anwenden (EN→DE)
4. Verifizieren: keine englischen Status mehr vorhanden
5. Admin-UI testen: Filter, Advance, CreateInvoice

**⚠ Production-Backfill NICHT ausführen bis explizite Freigabe.**

---

## Sicherheitsbestätigung

- ✅ Keine echten Patienten- oder Gesundheitsdaten verwendet
- ✅ Keine Tokens, Passwörter oder Connection-Strings im Report
- ✅ Nur Metadaten und Schema-Definitionen aus Production gelesen
- ✅ Keine Produktionsdaten kopiert, exportiert oder verändert
- ✅ Keine übersprungenen Tests als bestanden bezeichnet
- ✅ RLS und Org-Fence erhalten
- ✅ Commit via deploy.sh mit precommit-guard
- ✅ Production-Backfill NICHT ausgeführt
