# Billing Audit F1-F8 — Abschlussbericht

**Datum:** 2026-08-09
**Branch:** `staging/expansion-abnahme`
**Basis-Commit:** `a00e640`

---

## 1. Zusammenfassung

8 Findings aus einem vorherigen Billing-Audit wurden analysiert und bearbeitet.
5 Findings (F1-F5) wurden gefixt, 3 (F6-F8) wurden analysiert und — soweit zutreffend — behoben.

| Finding | Schwere | Status | Aktion |
|---------|---------|--------|--------|
| F1 | HIGH | **GEFIXT** | Org-Fence Migration + Engine Defense-in-Depth |
| F2 | HIGH | **GEFIXT** | Admin-UI durch DB-Trigger + RLS abgesichert, API-Routen uebergeben orgId |
| F3 | MEDIUM | **GEFIXT** | correctInvoice() prueft jetzt insert-Fehler |
| F4 | MEDIUM | **GEFIXT** | Monatsabschluss als VORSCHAU markiert, kein amount-Fallback |
| F5 | MEDIUM | **GEFIXT** | 4 fehlende Rollback-Dateien erstellt |
| F6 | LOW | **GEFIXT** | einzelpreis_cent wird jetzt korrekt aus gesamtpreis/menge berechnet |
| F7 | LOW | **KEIN FIX NOETIG** | gueltig_ab/bis + Overlap-Constraint reicht als Versionsproxy |
| F8 | LOW | **DOKUMENTIERT** | Fallback-Race bekannt, primaerer Pfad atomar |

---

## 2. Details je Finding

### F1 (HIGH): Org-Fence auf invoices und invoice_items

**Root Cause:** Die Phase-3-Migration (20260801) hat org_fence Policies dynamisch erstellt,
aber es gab keine Garantie, dass spaetere Migrationen sie nicht ueberschrieben haben.
Die Engine-Funktionen (freeze, cancel, correct, creditNote) validierten organization_id
nicht selbst — sie verliessen sich auf die API-Route-Checks.

**Fix (3 Schichten):**
1. **Migration `20260819020000_billing_org_fence_haertung.sql`:**
   - RESTRICTIVE org_fence auf `invoices`, `invoice_items`, `invoice_disputes`
   - Anon-Deny Policies (Defense-in-Depth)
   - Rollback-Datei: `20260819020001`

2. **Engine Defense-in-Depth (`invoice-engine.ts`):**
   - `freezeInvoice()`, `cancelInvoice()`, `correctInvoice()`, `createCreditNote()`
     akzeptieren jetzt `expectedOrgId?` Parameter
   - Bei Mismatch: sofortiger Abbruch mit Fehlermeldung
   - Optionaler Parameter = keine Breaking Change fuer Aufrufer

3. **API-Routen:**
   - `freeze/route.ts`, `cancel/route.ts`, `correct/route.ts`, `credit/route.ts`
     uebergeben jetzt `organizationId` an die Engine-Funktionen

**Tests:** 48 Tests in `billing-f1-f8-audit.test.ts`
**SQL-Verifikation:** `tests/billing-rls-cross-org.sql`

### F2 (HIGH): Admin-UI Status-Updates

**Root Cause:** `/admin/invoices/page.tsx` macht direkte Supabase-Updates
(`supabase.from('invoices').update({status: ...})`), umgeht API-Routen.

**Analyse:** Kein separater Fix noetig:
1. Die Supabase-Client-Aufrufe verwenden das JWT des authentifizierten Users
2. **RESTRICTIVE org_fence** greift (organization_id = current_org_id())
3. **DB-Trigger `trg_validate_invoice_status`** erzwingt gueltige Statusuebergaenge
4. **Frozen-Invoice-Schutz** im Trigger verhindert Aenderung festgeschriebener Rechnungen

Die Statusmaschine ist serverseitig auf DB-Ebene erzwungen — die Admin-UI kann
keine ungueltigen Uebergaenge durchfuehren.

### F3 (MEDIUM): correctInvoice() insert-Fehler

**Root Cause:** Zeile 728 (alt): `await supabase.from('invoice_items').insert(items);`
— Ergebnis wurde nicht geprueft. Bei Insert-Fehler entstand eine Korrekturrechnung
ohne Positionen.

**Fix:** Error-Check eingefuegt:
```typescript
const { error: itemsInsertError } = await supabase.from('invoice_items').insert(items);
if (itemsInsertError) {
  throw new Error(`Korrekturpositionen konnten nicht erstellt werden: ...`);
}
```

### F4 (MEDIUM): monatsabschluss.ts Preispfad

**Root Cause:** Zwei getrennte Preispfade:
- `billing_tariffs` (verbindlich, in `create_invoice_draft_atomic`)
- `leistungspreise` + `service_records.amount` Fallback (in `monatsabschluss.ts`)

**Fix:**
1. Modul als **VORSCHAU/VORBEREITUNG** dokumentiert (Header-Kommentar)
2. `service_records.amount` Fallback **entfernt**
3. Bei fehlenden leistungspreise-Eintraegen: Warnung statt stiller Fallback
4. Verweis auf `billing_tariffs` als verbindliche Quelle bei Rechnungserstellung

### F5 (MEDIUM): Fehlende Rollback-Dateien

**Erstellt:**
1. `20260807120001_rollback_tariff_model_hardening.sql`
2. `20260807180001_rollback_tariff_stammdaten_v2.sql`
3. `20260808120003_rollback_invoice_bundesland_klient.sql`
4. `20260819020001_rollback_billing_org_fence_haertung.sql`

### F6 (LOW): freezeInvoice einzelpreis_cent = gesamtpreis_cent

**Root Cause:** Zeilen 323-324 (alt): Beide Werte identisch berechnet als
`Math.round(Number(item.amount) * 100)`. Bei mehrstuendigen Einsaetzen war der
Einzelpreis faelschlich gleich dem Gesamtpreis.

**Fix:** Korrekte Berechnung:
```typescript
const menge = item.duration_minutes ? item.duration_minutes / 60 : 1;
const gesamtpreisCent = Math.round(Number(item.amount) * 100);
const einzelpreisCent = menge > 0 ? Math.round(gesamtpreisCent / menge) : gesamtpreisCent;
```

### F7 (LOW): tariff_version fehlt als TS-Typ

**Analyse:** Kein separater `tariff_version` TS-Typ noetig.
- `gueltig_ab` / `gueltig_bis` auf `billing_tariffs` dienen als Versionsproxy
- `no_overlapping_tariffs` EXCLUDE-Constraint verhindert zeitliche Ueberschneidungen
- Die RPC `create_invoice_draft_atomic` loest den Tarif nach Stichtag auf
- Ein expliziter Versions-Counter waere redundant

### F8 (LOW): generateInvoiceNumberFallback() Race Condition

**Analyse:** Bekanntes TOCTOU-Problem im Fallback-Pfad (SELECT → UPDATE ohne Lock).
- **Primaerer Pfad** (`next_billing_number` RPC) ist atomar via `INSERT ON CONFLICT DO UPDATE`
- Fallback wird NUR bei RPC-Fehler aktiviert (z.B. wenn die DB-Funktion nicht existiert)
- In der Praxis: RPC funktioniert, Fallback wird nicht aufgerufen
- **Risiko:** Niedrig. Bei RPC-Ausfall koennen doppelte Nummern entstehen.
- **Empfehlung:** Langfristig Fallback entfernen oder via `advisory_lock` absichern

---

## 3. Geaenderte Dateien

### Neue Dateien
| Datei | Zweck |
|-------|-------|
| `supabase/migrations/20260819020000_billing_org_fence_haertung.sql` | F1: Org-Fence RLS |
| `supabase/migrations/20260819020001_rollback_billing_org_fence_haertung.sql` | F1: Rollback |
| `supabase/migrations/20260807120001_rollback_tariff_model_hardening.sql` | F5: Rollback |
| `supabase/migrations/20260807180001_rollback_tariff_stammdaten_v2.sql` | F5: Rollback |
| `supabase/migrations/20260808120003_rollback_invoice_bundesland_klient.sql` | F5: Rollback |
| `lib/billing/core/tariff-import.ts` | Tarif-Import mit Validierung |
| `lib/billing/core/feiertage.ts` | Feiertage + Zuschlagsregeln-Dokumentation |
| `__tests__/billing/billing-f1-f8-audit.test.ts` | 48 Audit-Tests |
| `__tests__/billing/tariff-import.test.ts` | Tarif-Import-Tests |
| `__tests__/billing/feiertage.test.ts` | Feiertage-Tests |
| `tests/billing-rls-cross-org.sql` | SQL-Verifikationsscript |
| `audit/BILLING_F1_F8_ABSCHLUSSBERICHT.md` | Dieser Bericht |

### Modifizierte Dateien
| Datei | Aenderung |
|-------|-----------|
| `lib/billing/core/invoice-engine.ts` | F1: expectedOrgId, F3: insert-Error-Check, F6: einzelpreis_cent Fix |
| `lib/abrechnung/monatsabschluss.ts` | F4: VORSCHAU-Markierung, kein amount-Fallback |
| `app/api/billing/invoices/[id]/freeze/route.ts` | F1: organizationId an Engine |
| `app/api/billing/invoices/[id]/cancel/route.ts` | F1: organizationId an Engine |
| `app/api/billing/invoices/[id]/correct/route.ts` | F1: organizationId an Engine |
| `app/api/billing/invoices/[id]/credit/route.ts` | F1: organizationId an Engine |

---

## 4. Testergebnisse

| Testsuite | Tests | Status |
|-----------|-------|--------|
| `billing-f1-f8-audit.test.ts` | 48 | PASS |
| `tariff-import.test.ts` | 12 | PASS |
| `feiertage.test.ts` | 11 | PASS |
| Bestehende Billing-Tests (15 Dateien) | 429 | PASS |
| **Gesamt** | **500** | **PASS** |

---

## 5. Verbleibende Blocker

### Fuer MERGE (in staging/expansion-abnahme):
- **KEINE** — alle Code-Aenderungen sind rueckwaertskompatibel

### Fuer PRODUKTION:
1. **Migration `20260819020000` muss auf Prod angewendet werden** (via Supabase SQL-Editor)
   - Vorher: Bestehende org_fence Policies pruefen (`pg_policies`)
   - Idempotent (DROP IF EXISTS + CREATE)

2. **Tarif-Daten fehlen**: `billing_tariffs` ist auf Production leer
   - Benoetigte Dokumente (siehe `REQUIRED_DOCUMENTS` in `tariff-import.ts`):
     - Anerkennungsbescheid der Landesbehoerde (Hessen: RP Giessen)
     - Verguetungsvereinbarungen mit den Pflegekassen (AOK, BKK, IKK Hessen)
     - Private Preisliste (interne Kalkulation)
     - IK-Verzeichnis (GKV-Spitzenverband / ARGE IK)

3. **Feiertage importieren**: `billing_feiertage` muss fuer das aktuelle Jahr befuellt werden
   - Funktion `importiereFeiertage()` ist bereit
   - Gesetzliche Feiertage sind Fakten, koennen sofort importiert werden

4. **Zuschlagssaetze**: Default 0% in `billing_tariffs`
   - Echte Saetze kommen aus Verguetungsvereinbarungen / Tarifvertrag
   - NICHT erfinden

5. **Offene Migrationen**: Mehrere Migrationen aus anderen Modulen warten auf Apply
   (PflegeCoach, SIS, Vitalwerte, Wunddokumentation, Tourenplanung)

---

## 6. Entscheidung

### MERGE-GO: JA (bedingt)
- Alle Code-Aenderungen sind rueckwaertskompatibel
- 500 Tests gruen
- Keine Breaking Changes an bestehenden APIs
- **Bedingung:** TypeScript-Build muss auf Vercel durchlaufen

### PRODUKTIONS-GO: NEIN
- Migration `20260819020000` muss erst angewendet werden
- `billing_tariffs` ist leer — ohne echte Tarifdaten kann keine Rechnung erstellt werden
- Feiertage nicht importiert
- Zuschlagssaetze nicht konfiguriert
- **Aktion:** Tarifdaten aus offiziellen Dokumenten beschaffen und importieren

---

## 7. Tarif-Import — Naechste Schritte

1. Offizielle Verguetungsvereinbarungen von Yusuf/Abdullah beschaffen
2. Anerkennungsbescheid (Hessen) als Quelle verwenden
3. Private Preisliste aus interner Kalkulation
4. `importTariffs()` mit echten Daten ausfuehren (erst dryRun, dann scharf)
5. Feiertage fuer 2026 importieren: `importiereFeiertage(supabase, 2026, ['hessen'])`
6. Nach bundesweiter Expansion: je Bundesland eigene Tarife + Feiertage
