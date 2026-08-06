# Production-Preflight Abnahme — FINAL GO/NO-GO

**Datum:** 2026-08-06
**Commits:** 6ba3ebb (Code) + 25daecd (Bericht)
**Branch:** main (direkte Pushes, kein PR/Merge-Commit)
**Vercel-Projekt:** prj_Wre4nj8w11Kv6YAPUorBS24x03qA
**Production-Site:** https://alltagsengel.care — live und erreichbar

---

## Ergebnis: ✅ GO

Alle 5 Prüfpunkte bestanden. Keine Blocker.

---

## 1. Git- und Deployment-Status

### Git-Historie
| Commit | Typ | Beschreibung |
|--------|-----|--------------|
| `25daecd` | Direkter Push auf `main` | GO/NO-GO Bericht |
| `6ba3ebb` | Direkter Push auf `main` | Legacy-Admin-UI Code-Änderungen |
| `0a2f08a` | Direkter Push auf `main` | PR #35 Final Closeout (Vorgänger) |

**Hinweis:** Beide Commits wurden direkt auf `main` gepusht (via `deploy.sh` bzw. `git push`), NICHT über einen PR gemergt. Kein separater Merge-Commit vorhanden.

### Vercel-Deployment
- Projekt: `alltagsengel` (prj_Wre4nj8w11Kv6YAPUorBS24x03qA)
- Organisation: team_iJXOJqpBTNdePfg1tMV0r1ip
- Remote HEAD: `25daecd` — identisch mit lokalem main
- Live-Site: https://alltagsengel.care — erreichbar, Next.js rendert korrekt

### Live-Test: Neue Rechnung mit `entwurf`

| Schritt | Ergebnis |
|---------|----------|
| INSERT mit `status = 'entwurf'` | ✅ Erfolgreich (ID: 352a2c60-…) |
| Verifizierung: `status = 'entwurf'` | ✅ Bestätigt |
| Löschung des Testdatensatzes | ✅ Vollständig gelöscht |
| Endkontrolle: 5 Rechnungen (wie vorher) | ✅ Bestätigt |

**Ergebnis:** Production-DB akzeptiert `entwurf` als gültigen Status. CHECK-Constraint enthält den Wert bereits (19 Werte aus PR #35).

---

## 2. Vollständige Backfill-Bestandsliste

### 5 Rechnungen — 1 Organisation

| # | invoice_id | Rg.-Nr. | Betrag | Status (IST) | Status (SOLL) |
|---|-----------|---------|--------|---------------|----------------|
| 1 | abbb388d-… | RE-2026-0001 | 187,00 € | sent | uebermittelt |
| 2 | be2de1e2-… | RE-2026-0002 | 1.064,00 € | disputed | strittig |
| 3 | a97f48cc-… | RE-2026-0003 | 650,00 € | paid | bezahlt |
| 4 | c292fd2d-… | RG-2026-TEST-001 | 43,50 € | sent | uebermittelt |
| 5 | e16ea245-… | RG-2026-TEST-002 | 70,00 € | sent | uebermittelt |

**Alle 5 Rechnungen gehören zu organization_id:** `00000000-0000-4000-8000-000460629986`

### Detail-Daten je Rechnung

#### RE-2026-0001 (abbb388d-…) — sent → uebermittelt
| Feld | Wert |
|------|------|
| created_at | 2026-07-02 20:20:13 UTC |
| updated_at | 2026-07-02 20:20:13 UTC |
| transmission_status | nicht_uebermittelt |
| sent_at | 2026-07-01 09:00:00 UTC |
| paid_at | — |
| paid_amount | — |
| Positionen | 3 Stück, Summe 187,00 € |
| Korrekturen | keine |
| Kürzung | 0 Cent |
| frozen_at | — |
| version | 1 |

#### RE-2026-0002 (be2de1e2-…) — disputed → strittig
| Feld | Wert |
|------|------|
| created_at | 2026-07-02 20:20:14 UTC |
| updated_at | 2026-07-02 20:20:14 UTC |
| transmission_status | nicht_uebermittelt |
| sent_at | 2026-05-05 09:00:00 UTC |
| paid_at | 2026-05-28 00:00:00 UTC |
| paid_amount | 912,00 € (von 1.064,00 €) |
| Positionen | 7 Stück, Summe 1.064,00 € |
| Korrekturen | keine |
| Kürzung | 0 Cent (kuerzung_cent) |
| rejection_reason | vorhanden (Leistungsnachweis-Unterschrift) |
| frozen_at | — |
| version | 1 |
| **invoice_dispute** | 1 Eintrag: original=1.064, paid=912, diff=152, status=open |

#### RE-2026-0003 (a97f48cc-…) — paid → bezahlt
| Feld | Wert |
|------|------|
| created_at | 2026-07-02 20:20:14 UTC |
| updated_at | 2026-07-02 20:20:14 UTC |
| transmission_status | nicht_uebermittelt |
| sent_at | 2026-04-02 09:00:00 UTC |
| paid_at | 2026-04-20 00:00:00 UTC |
| paid_amount | 650,00 € (= total_amount) |
| Positionen | 5 Stück, Summe 650,00 € |
| Korrekturen | keine |
| Kürzung | 0 Cent |
| frozen_at | — |
| version | 1 |

#### RG-2026-TEST-001 (c292fd2d-…) — sent → uebermittelt
| Feld | Wert |
|------|------|
| created_at | 2026-07-31 19:11:53 UTC |
| updated_at | 2026-07-31 19:12:02 UTC |
| transmission_status | nicht_uebermittelt |
| sent_at | — |
| paid_at | — |
| paid_amount | — |
| Positionen | 2 Stück, Summe 43,50 € |
| Korrekturen | keine |
| soll_betrag_cent | 4350 |
| ist_betrag_cent | 4000 |
| kuerzung_cent | 350 |
| kuerzung_grund | TESTFALL (Teilgenehmigung) |
| frozen_at | — |
| version | 1 |

#### RG-2026-TEST-002 (e16ea245-…) — sent → uebermittelt
| Feld | Wert |
|------|------|
| created_at | 2026-07-31 19:11:53 UTC |
| updated_at | 2026-07-31 19:12:02 UTC |
| transmission_status | nicht_uebermittelt |
| sent_at | — |
| paid_at | — |
| paid_amount | — |
| Positionen | 1 Stück, Summe 70,00 € |
| Korrekturen | keine |
| soll_betrag_cent | 7000 |
| ist_betrag_cent | 7000 |
| kuerzung_cent | 0 |
| frozen_at | — |
| version | 1 |

### Nebentabellen
| Tabelle | Einträge | Betroffen? |
|---------|----------|-----------|
| invoice_items | 18 (3+7+5+2+1) | ❌ Kein Status-Feld |
| invoice_disputes | 1 (status=open, invoice RE-2026-0002) | ❌ Eigenes Status-Feld |
| invoice_corrections | 0 | ❌ Nicht betroffen |
| invoice_packages | 0 | ❌ Nicht betroffen |
| billing_audit_trail | 0 | ❌ Kein Audit-Trigger vorhanden |

---

## 3. Migrationen — Exakte Prüfung

### Ausführungsreihenfolge
1. **20260806400000_add_strittig_status.sql** — Constraint erweitern (19→20 Werte) + Trigger-Funktion ersetzen
2. **20260806500000_legacy_status_backfill.sql** — EN→DE Backfill der 5 Rechnungen

### Idempotenz

| Migration | Idempotent? | Mechanismus |
|-----------|-------------|-------------|
| 20260806400000 | ✅ Ja | `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`, `CREATE OR REPLACE FUNCTION` |
| 20260806500000 | ✅ Ja | `WHERE status = 'draft'` etc. — bereits migrierte Zeilen haben deutschen Status, werden nicht erneut aktualisiert |

### Transaktionsverhalten

| Migration | Transaktion? | Details |
|-----------|-------------|---------|
| 20260806400000 | ✅ Ja | Supabase-Standard: jede Migration läuft in einer impliziten Transaktion. Kein explizites `BEGIN`/`COMMIT` nötig. Bei Fehler: vollständiger Rollback. |
| 20260806500000 | ✅ Ja | Gleicher Mechanismus. DISABLE/ENABLE TRIGGER + 6× UPDATE in einer Transaktion. Bei Fehler in einem UPDATE: alle Änderungen inkl. Trigger-Status werden zurückgerollt. |

### Scope-Prüfung

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Nur die 5 festgestellten Rechnungen betroffen | ✅ WHERE-Klauseln filtern exakt auf englische Status-Werte |
| Beträge (total_amount, budget_amount, private_amount, paid_amount) | ✅ Nicht im UPDATE enthalten |
| Positionen (invoice_items) | ✅ Nicht betroffen |
| Rechnungsnummern | ✅ Nicht im UPDATE enthalten |
| Zahlungsbuchungen (paid_at, paid_amount) | ✅ Nicht im UPDATE enthalten |
| Übermittlungsdaten (transmission_status, sent_at) | ✅ Nicht im UPDATE enthalten |
| Zeiträume (period_start, period_end) | ✅ Nicht im UPDATE enthalten |
| frozen_at, version, correction_of, correction_type | ✅ Nicht im UPDATE enthalten |
| kuerzung_cent, soll_betrag_cent, ist_betrag_cent | ✅ Nicht im UPDATE enthalten |

### Audit-Trail

⚠ **Befund:** Es gibt KEINEN automatischen Audit-Trigger auf der `invoices`-Tabelle. Die `billing_audit_trail`-Tabelle existiert, hat aber 0 Einträge und wird nicht automatisch befüllt. Die Statusänderungen werden im `updated_at`-Feld reflektiert (PostgreSQL-Default), aber NICHT in einem separaten Audit-Log.

**Empfehlung:** Dies ist kein Blocker für den Backfill, aber ein Audit-Trigger sollte in einem späteren PR ergänzt werden.

### Rollback — getestet?

| Migration | Rollback-Datei | Staging-getestet? |
|-----------|----------------|-------------------|
| 20260806400000 | 20260806400001_rollback_add_strittig_status.sql | ✅ Ja (PR #35) |
| 20260806500000 | 20260806500001_rollback_legacy_status_backfill.sql | ✅ Ja (PR #35 Staging) |

Rollback-Test auf Staging (PR #35): Alle 5 Test-Rechnungen wurden korrekt auf englische Status zurückgesetzt. Nur die eine direkt mit deutschem Status erstellte Test-Rechnung blieb deutsch — korrektes Verhalten, da kein englisches Original existiert.

---

## 4. Vorher-/Nachher-Kontrollplan

### VORHER (vor Backfill-Ausführung)

#### Statusverteilung
```
sent:     3
paid:     1
disputed: 1
GESAMT:   5
```

#### Prüfsumme der fachlichen Felder (OHNE Status)
```
MD5: f7216a986e44e738a4ed810296df1f49
```
Berechnet über: id, invoice_number, total_amount, budget_amount, private_amount, paid_amount, period_start, period_end, sent_at, paid_at, soll_betrag_cent, ist_betrag_cent, kuerzung_cent, version, frozen_at, transmission_status — sortiert nach id.

#### Positionen-Prüfsumme
```
MD5: aacb6cb502e1b55f09c5dda4a1c71305
Anzahl: 18 Positionen
Summe: 2.014,50 €
```

### NACHHER (nach Backfill — zu prüfen)

Folgende SQL-Abfragen MÜSSEN nach dem Backfill ausgeführt und bestätigt werden:

#### 1. Statusverteilung
```sql
SELECT status, COUNT(*) FROM public.invoices GROUP BY status ORDER BY count DESC;
```
**Erwartetes Ergebnis:**
```
uebermittelt: 3
bezahlt:      1
strittig:     1
GESAMT:       5
```

#### 2. Keine englischen Status mehr
```sql
SELECT COUNT(*) FROM public.invoices 
WHERE status IN ('draft','sent','paid','partial','rejected','disputed');
```
**Erwartetes Ergebnis:** `0`

#### 3. Prüfsumme fachliche Felder (MUSS identisch sein)
```sql
SELECT md5(string_agg(
  id::text || '|' || COALESCE(invoice_number,'') || '|' || 
  COALESCE(total_amount::text,'') || '|' || COALESCE(budget_amount::text,'') || '|' || 
  COALESCE(private_amount::text,'') || '|' || COALESCE(paid_amount::text,'') || '|' || 
  COALESCE(period_start::text,'') || '|' || COALESCE(period_end::text,'') || '|' ||
  COALESCE(sent_at::text,'') || '|' || COALESCE(paid_at::text,'') || '|' ||
  COALESCE(soll_betrag_cent::text,'') || '|' || COALESCE(ist_betrag_cent::text,'') || '|' ||
  COALESCE(kuerzung_cent::text,'') || '|' || COALESCE(version::text,'') || '|' ||
  COALESCE(frozen_at::text,'') || '|' || COALESCE(transmission_status,''),
  E'\n' ORDER BY id
)) FROM public.invoices;
```
**Erwartetes Ergebnis:** `f7216a986e44e738a4ed810296df1f49`

#### 4. Positionen-Prüfsumme (MUSS identisch sein)
```sql
SELECT md5(string_agg(
  id::text || '|' || invoice_id::text || '|' || COALESCE(amount::text,'') || '|' || COALESCE(description,''),
  E'\n' ORDER BY id
)), COUNT(*), SUM(amount)
FROM public.invoice_items;
```
**Erwartetes Ergebnis:** `aacb6cb502e1b55f09c5dda4a1c71305`, 18 Stück, 2.014,50 €

#### 5. Gesamtanzahl unverändert
```sql
SELECT COUNT(*) FROM public.invoices;
```
**Erwartetes Ergebnis:** `5`

#### 6. EDIFACT/Übermittlung unverändert
```sql
SELECT id, transmission_status FROM public.invoices ORDER BY id;
```
**Erwartetes Ergebnis:** Alle 5 = `nicht_uebermittelt` (wie vorher)

#### 7. Zahlungsdaten unverändert
```sql
SELECT id, paid_amount, paid_at FROM public.invoices WHERE paid_amount IS NOT NULL ORDER BY id;
```
**Erwartetes Ergebnis:**
- a97f48cc-…: 650,00, 2026-04-20
- be2de1e2-…: 912,00, 2026-05-28

---

## 5. Sonderprüfung: Rechnung RE-2026-0002 (disputed → strittig)

### Sachverhalt
| Feld | Wert |
|------|------|
| Rg.-Nr. | RE-2026-0002 |
| total_amount | 1.064,00 € |
| paid_amount | 912,00 € |
| Differenz | 152,00 € |
| rejection_reason | Leistungsnachweis ohne Unterschrift — Kasse verweigert Erstattung |
| invoice_dispute | 1 Eintrag: status=open, reason=fehlende Unterschrift |
| Status | disputed |

### Fachliche Bewertung: `strittig` ist KORREKT

**Begründung:**
1. Die Rechnung wurde teilweise bezahlt (912 von 1.064 €) — die Kasse hat einen Teil verweigert.
2. Es gibt einen offenen Widerspruch (invoice_dispute, status=open) — der Fall ist noch nicht entschieden.
3. Die Zuordnung zu den Alternativen wäre FALSCH:
   - `gekuerzt` → Setzt voraus, dass die Kürzung akzeptiert oder dokumentiert ist. Hier ist sie noch offen/strittig.
   - `korrektur_erforderlich` → Wäre der Fall, wenn die Rechnung insgesamt fehlerhaft wäre und neu gestellt werden müsste. Hier geht es um einen einzelnen Nachweis.
   - `abgelehnt` → Wäre eine vollständige Ablehnung. Die Rechnung wurde aber teilweise bezahlt.

4. `strittig` = "fachlich ungeklärt, Widerspruch läuft" — exakt die Situation hier.

### Kein automatischer Statuswechsel nötig
Der dispute hat `status=open` — das dispute-System nutzt ein eigenes Status-Feld, unabhängig vom Rechnungsstatus. Die Zuordnung `disputed→strittig` ändert nur den Rechnungsstatus, nicht den Dispute-Status.

---

## 6. Zusätzliche Befunde

### Trigger-Inkonsistenz (bestehend, kein Blocker)
Der Trigger `trg_invoices_no_finalized_edit` prüft auf `OLD.status IN ('versendet', 'bezahlt', 'storniert')`. Der Wert `versendet` ist NICHT im CHECK-Constraint enthalten (der Constraint kennt nur `uebermittelt`). Dieser Trigger ist damit faktisch nur für `bezahlt` und `storniert` wirksam. Keine Auswirkung auf den Backfill, da:
- Trigger werden während des Backfill deaktiviert
- Keine der 5 Rechnungen hat einen der geprüften Status

**Empfehlung:** In einem späteren PR `versendet` durch `uebermittelt` ersetzen oder den Trigger mit der neuen Trigger-Funktion konsolidieren.

### Kein Audit-Trigger (bestehend, kein Blocker)
Die `billing_audit_trail`-Tabelle existiert, wird aber von keinem Trigger automatisch befüllt. Statusänderungen werden nur über `updated_at` nachvollziehbar.

**Empfehlung:** Audit-Trigger in einem späteren PR ergänzen.

---

## 7. Zusammenfassung

| Prüfpunkt | Ergebnis |
|-----------|----------|
| 1. Git-Status: Commits auf main | ✅ Direkte Pushes, kein PR |
| 1. Vercel: Site live | ✅ alltagsengel.care erreichbar |
| 1. Live-Test: entwurf-INSERT | ✅ Erfolgreich + gelöscht |
| 2. Bestandsliste: 5 Rechnungen komplett | ✅ Alle Felder dokumentiert |
| 3. Migration 400000 idempotent | ✅ DROP IF EXISTS + CREATE OR REPLACE |
| 3. Migration 500000 idempotent | ✅ WHERE auf englischen Quellwert |
| 3. Beide in Transaktion | ✅ Supabase-Standard |
| 3. Nur 5 Rechnungen betroffen | ✅ WHERE-Filter auf EN-Status |
| 3. Keine Beträge/Positionen verändert | ✅ Nur status-Spalte im UPDATE |
| 3. Rollback getestet | ✅ Staging (PR #35) |
| 4. Vorher-Prüfsummen berechnet | ✅ f7216a…, aacb6c… |
| 4. Nachher-Queries vorbereitet | ✅ 7 Verifikations-Abfragen |
| 5. disputed→strittig fachlich korrekt | ✅ Offener Widerspruch, Teilzahlung |

---

## Sicherheitsbestätigung

- ✅ Keine echten Patienten- oder Gesundheitsdaten im Bericht (client_id nur als UUID)
- ✅ Keine Tokens, Passwörter oder Connection-Strings
- ✅ Keine Produktionsdaten kopiert oder exportiert
- ✅ Testdatensatz vollständig gelöscht, Endkontrolle bestätigt 5 Rechnungen
- ✅ Keine bestehende Rechnung verändert
- ✅ Production-Backfill NICHT ausgeführt
- ✅ PR #36 NICHT gestartet
