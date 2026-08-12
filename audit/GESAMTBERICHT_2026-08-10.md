# Billing Abschluss-Gesamtbericht — 2026-08-10

Branch: `staging/expansion-abnahme`
Erstellt: autonome Session

---

## A. Konkrete Aenderungen

### Commit 7126f42 — Billing F1-F8

18 Dateien, 1.522 Insertions, 32 Deletions:

**Engine-Fixes:**
- `lib/billing/core/invoice-engine.ts`: correctInvoice() wirft bei insert-Fehler jetzt explizit (vorher stiller Fehler); Tarif-Gegenprüfung bei Korrekturen (>10% Abweichung braucht korrekturgrundPreis); CorrectionLineInput erweitert um korrekturgrundPreis
- `lib/abrechnung/monatsabschluss.ts`: bundesland ist jetzt Pflichtparameter (kein Hessen-Default); kein service_records.amount Fallback fuer Kassenleistungen; Warnung statt falsche Preise
- `app/api/billing/invoices/[id]/cancel/route.ts`: expectedOrgId Defense-in-Depth
- `app/api/billing/invoices/[id]/correct/route.ts`: expectedOrgId Defense-in-Depth
- `app/api/billing/invoices/[id]/credit/route.ts`: expectedOrgId Defense-in-Depth
- `app/api/billing/invoices/[id]/freeze/route.ts`: expectedOrgId Defense-in-Depth

**Neue Module:**
- `lib/billing/core/tariff-import.ts`: Vollstaendige Import-Pipeline mit IK-Validierung, Katalog-Abgleich, Dry-Run, Overlap-Schutz
- `lib/billing/core/feiertage.ts`: Feiertags-Berechnung (Gauss), Landes-Feiertage, DB-Import (idempotent)

**Tests (alle PASS):**
- `__tests__/billing/billing-f1-f8-audit.test.ts`: F1-F8 Regressionstests
- `__tests__/billing/feiertage.test.ts`: 13 Feiertage-Tests
- `__tests__/billing/tariff-import.test.ts`: 10 Tarif-Import-Tests

**Migrationen (ausstehend):**
- `supabase/migrations/20260819020000_billing_org_fence_haertung.sql`: RESTRICTIVE org_fence auf invoices, invoice_items, invoice_disputes + anon-Deny
- `supabase/migrations/20260819020001_rollback_billing_org_fence_haertung.sql`: Rollback
- `supabase/migrations/20260807120001_rollback_tariff_model_hardening.sql`: Rollback
- `supabase/migrations/20260807180001_rollback_tariff_stammdaten_v2.sql`: Rollback
- `supabase/migrations/20260808120003_rollback_invoice_bundesland_klient.sql`: Rollback

**Dokumentation:**
- `audit/BILLING_F1_F8_ABSCHLUSSBERICHT.md`: F1-F8 Audit-Ergebnisse
- `tests/billing-rls-cross-org.sql`: Cross-Org RLS Verifikationsskript

---

## B. Commit-Hashes

| Commit | Beschreibung | Branch |
|--------|-------------|--------|
| `7126f42` | Billing F1-F8 (dieser Commit) | staging/expansion-abnahme |
| `1db6c74` | DiPA PflegeCoach | staging/expansion-abnahme |
| `a00e640` | SIS Abnahme-Report | staging/expansion-abnahme |
| `41db1b8` | Vitalwerte | staging/expansion-abnahme |
| `7755518` | Wunddokumentation Security-Fixes | staging/expansion-abnahme |
| `65074a9` | DiPA PflegeCoach (MVP) | staging/expansion-abnahme |

---

## C. Build-Ergebnis

| Pruefung | Ergebnis |
|----------|----------|
| TypeScript (`tsc --noEmit`) | **0 Fehler** |
| Typecheck-Warnungen | 5 Warnungen (stale .next/types Referenzen auf Touren-API-Routes — diese Dateien sind noch nicht committet) |
| Fazit | **PASS** (warn-only) |

---

## D. Test-Ergebnis

| Test-Suite | Dateien | Tests | Status |
|------------|---------|-------|--------|
| Billing gesamt | 16 | 340 | **ALLE PASS** |
| billing-f1-f8-audit | 1 | variabel | PASS |
| tariff-import | 1 | 10 | PASS |
| feiertage | 1 | 13 | PASS |
| price-resolver | 1 | variabel | PASS |
| invoice-engine | 1 | variabel | PASS |
| status-machine | 2 | variabel | PASS |
| Laufzeit | — | — | 5.69s |

---

## E. Offene technische Blocker

1. **Migrationen nicht applied**: ~10 Billing-Migrationen warten auf Apply (RPCs, Kataloge, Constraints, Org-Fence)
2. **billing_tariffs = 0 Zeilen**: Ohne Tarifdaten kann die atomare RPC keine Rechnungen erstellen (wirft MISSING_VALID_TARIFF)
3. **leistungspreise = 0 Zeilen**: Monatsabschluss-Vorschau ohne Preise (Warnung, kein Absturz)
4. **Zuschlagssaetze = 0%**: Feiertag/WE/Nacht-Zuschlaege sind Default 0% — echte Saetze fehlen
5. **next_billing_number RPC**: Noch nicht auf Production, Fallback (generateInvoiceNumberFallback) hat Race-Condition bei Konkurrenz

---

## F. Fehlende Tarif-/Preisdaten

| Was fehlt | Woher beschaffen | Prioritaet |
|-----------|-----------------|------------|
| Stundensaetze §45b-Leistungen | Anerkennungsbescheid RP Giessen | HOCH |
| Kassentarife (AOK Hessen etc.) | Verguetungsvereinbarung | HOCH |
| IK-Nummern Kostentraeger | GKV-Spitzenverband / ARGE IK | HOCH |
| Eigene IK-Nummer | ARGE IK | HOCH |
| Privattarife | GF-Entscheidung, interne Kalkulation | MITTEL |
| Zeitzuschlaege (Nacht/WE/Feiertag) | Tarifvertrag oder Verguetungsvereinbarung | MITTEL |
| Wegepauschale | Interne Preisliste / Verguetungsvereinbarung | NIEDRIG |

---

## G. Externe Voraussetzungen

| Voraussetzung | Status | Verantwortlich |
|---------------|--------|----------------|
| Anerkennung nach §45a SGB XI (Hessen) | Unklar (vermutlich vorhanden, da operativ) | Yusuf pruefen |
| Verguetungsvereinbarungen mit Pflegekassen | FEHLT (oder nicht digital verfuegbar) | Yusuf |
| Eigene IK-Nummer | FEHLT / Status unklar | Yusuf |
| §72-Versorgungsvertrag (fuer §36-Leistungen) | FEHLT (kein Vertrag → keine §36-Abrechnung moeglich) | Yusuf |
| ITSG-Zertifikat (fuer DTA/EDIFACT) | FEHLT | Yusuf |
| Private Preisliste (intern genehmigt) | FEHLT | Yusuf |

---

## H. Status jedes Hauptmoduls

### Billing (dieses Audit)
- **Code**: FERTIG — Engine, Tarif-Import, Feiertage, Price-Resolver, Status-Machine, Audit-Trail
- **Tests**: 340 Tests PASS
- **Migrationen**: 10 ausstehend (RPCs, Kataloge, Org-Fence)
- **Daten**: LEER (billing_tariffs = 0 Zeilen)
- **Blocker**: Tarifdaten + Migrationen

### Tourenplanung (NICHT in diesem Commit)
- **Dateien**: 13 untracked (app/admin/tourenplanung/, app/api/tours/, lib/touren/, __tests__/touren/)
- **Layout**: 1 modified (admin/layout.tsx — Tourenplanung-Link)
- **Migration**: 20260809120000_tourenplanung.sql + Rollback
- **Status**: In Arbeit, konsistent, bereit fuer separaten Commit

### PflegeCoach DiPA
- **Letzter Commit**: 1db6c74 (DiPAV-Ready-Haertung)
- **Migration**: 20260819010000 ausstehend
- **Status**: Code fertig, Migration wartet

### SIS (Strukturierte Informationssammlung)
- **Letzter Commit**: a00e640
- **Migration**: 20260818010000 ausstehend
- **Status**: Code fertig, Migration wartet

### Vitalwerte
- **Letzter Commit**: 41db1b8
- **Migration**: 20260818010000_vitalwerte.sql (modified, unstaged — Engel-RLS-Fix)
- **Status**: Code fertig, RLS-Fix noch nicht committet

### Wunddokumentation
- **Letzter Commit**: 7755518
- **Migration**: 20260818030000 ausstehend
- **Status**: Code fertig, Migration wartet

### Investor-Seite
- **Aenderung**: MFA-Text-Korrektur (app/investor/en/product-technology/page.tsx)
- **Status**: Unstaged, Minor-Fix

---

## I. MERGE-GO: NEIN (bedingt)

**Begruendung:**
- Code-Qualitaet: PASS
- Tests: PASS
- Aber: Billing-Funktionalitaet ohne Tarifdaten nicht nutzbar
- Migrationen muessen VOR dem Merge auf staging/preview applied und getestet werden

**Bedingung fuer GO:**
1. Billing-Migrationen (20260807*) auf Staging-DB applied
2. Mindestens ein Test-Tarif importiert und Rechnungserstellung E2E getestet
3. Tourenplanung als separater Commit (nicht Billing vermischen)

---

## J. PRODUCTION-GO: NEIN

**Begruendung:**
- Keine Tarifdaten = keine Rechnungserstellung moeglich
- ~55 ausstehende Migrationen (nicht nur Billing)
- Profiles-RLS-Fix (20260815-20260817) ist HOCH-Risiko und muss separat gerollt werden
- Org-Fence Migration 20260819020000 nicht applied

**Bedingung fuer GO:**
1. Alle Billing-Migrationen applied + verifiziert
2. billing_tariffs mit echten Preisen befuellt
3. Org-Fence applied + RLS-Matrix verifiziert
4. E2E Rechnungserstellung mit echtem Tarif auf Staging

---

## K. KASSENABRECHNUNG-GO: NEIN

**Begruendung:**
- billing_tariffs = 0 Zeilen
- Keine Verguetungsvereinbarungen eingepflegt
- IK-Nummern fehlen
- EDIFACT-Generator noch nicht implementiert (nur Interface in monatsabschluss.ts)
- DTA-Stammdatentabellen (aus 20260808220000) nicht applied und 0 Zeilen
- ITSG-Zertifikat fehlt
- Readiness Stand (aus Memory): 2/1/12

**Was fehlt fuer Kassenabrechnung:**
1. Alle Tarifdaten (s. Punkt F)
2. DTA-Migrationen applied
3. EDIFACT-Generator implementiert
4. ITSG-Zertifizierung
5. Technische Anbindung an Dakota/DTA-Clearing
6. Kostentraeger-Stammdaten (IK-Verzeichnis)
7. Test-Einreichung bei Datenannahmestelle

---

## L. Was automatisch weiterbearbeitet werden kann

1. **Tourenplanung committen** — Dateien sind konsistent, separater Commit moeglich
2. **Investor-Seite MFA-Fix committen** — Minor-Fix
3. **Vitalwerte RLS-Fix committen** — Engel-RLS-Fix in Migration
4. **EDIFACT-Generator-Stub** — Interface steht, Implementation als naechster Schritt
5. **Weitere Tests** — E2E Invoice-Path Tests mit Mock-Tarif
6. **Billing-UI** — Admin-Oberfläche fuer Tarif-Import/-Verwaltung

---

## M. Was Yusuf persoenlich beschaffen/eintragen/beantragen muss

| Aufgabe | Dringlichkeit | Geschaetzter Aufwand |
|---------|--------------|---------------------|
| **Anerkennungsbescheid §45a pruefen/digitalisieren** | HOCH | 1h (Akten durchsuchen) |
| **Verguetungsvereinbarungen mit Pflegekassen digitalisieren** | HOCH | 2-4h (Vertragsakte, Scans) |
| **Eigene IK-Nummer pruefen/beantragen** | HOCH | 1h (ARGE IK Antrag) |
| **Private Preisliste festlegen und freigeben** | MITTEL | 1h (GF-Entscheidung) |
| **IK-Nummern der Kostentraeger recherchieren** | MITTEL | 1h (GKV-Spitzenverband) |
| **Zuschlagssaetze aus Vertraegen extrahieren** | MITTEL | 1-2h (Vertragswerk lesen) |
| **§72-Versorgungsvertrag Status klären** | NIEDRIG (wenn keine §36-Leistungen) | 30min |
| **ITSG-Zertifizierung fuer DTA beantragen** | NIEDRIG (spaeter) | Mehrtaegiger Prozess |

**Sobald die Dokumente vorliegen, kann ich die Tarife ueber die Import-Pipeline (tariff-import.ts) automatisch einpflegen. Der Import ist mit Dry-Run, Validierung und Rollback abgesichert.**
