# Abschlussbericht: Tarif-basierte Rechnungserstellung

**Datum:** 2026-08-07
**Branch:** `feature/unified-invoice-creation`
**Letzter Commit:** `b4e3f20` — fix: atomic-rpc-comprehensive Tests aktualisiert
**Status:** BEREIT ZUR REVIEW — wartet auf Yusufs Freigabe

---

## 1. Branch und letzter Commit

| Feld | Wert |
|------|------|
| Branch | `feature/unified-invoice-creation` |
| Letzter Commit | `b4e3f20847e886ab80eaa5159cc69069bcdd85b1` |
| Commits auf Branch | 7 (seit `main`) |
| Geaenderte Dateien | 24 |
| Insertions/Deletions | +6.002 / -285 |
| Tests | 491 bestanden, 29 uebersprungen, 0 fehlgeschlagen |
| Typecheck | 0 Fehler |

---

## 2. Alle geaenderten Dateien

### Neue Dateien

| Datei | Zweck |
|-------|-------|
| `supabase/migrations/20260807100000_create_invoice_draft_atomic.sql` | Original-RPC (SECURITY DEFINER) |
| `supabase/migrations/20260807100001_rollback_create_invoice_draft_atomic.sql` | Rollback fuer Original-RPC |
| `supabase/migrations/20260807110000_tariff_based_invoice_creation.sql` | **Tarif-basierte RPC** (ersetzt Original) |
| `supabase/migrations/20260807110001_rollback_tariff_based_invoice_creation.sql` | Rollback fuer Tarif-RPC |
| `app/api/billing/invoices/create/route.ts` | API-Route (Auth, Org-Fence, RPC-Aufruf) |
| `__tests__/billing/unified-invoice-creation.test.ts` | Tests fuer unified creation |
| `__tests__/billing/tariff-based-invoice.test.ts` | 31 Tests fuer Tarif-Logik |
| `audit/SECURITY_DEFINER_REVIEW.md` | Sicherheitspruefung der RPC |
| `audit/BILLING_TARIFFS_IMPORT_KONZEPT.md` | Import-/Pflegekonzept fuer Tarife |
| `audit/MIGRATIONS_TEST_ERGEBNIS.md` | Migrationspruefung |
| `audit/MERGE_GATE_ERGEBNISBERICHT.md` | Merge-Gate-Bericht |
| `audit/PREISTABELLEN_DIAGNOSE.md` | Diagnose der 3 Preistabellen |
| `audit/UNIFIED_INVOICE_CREATION_REPORT.md` | Erstbericht unified creation |

### Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `lib/billing/core/invoice-engine.ts` | resolvePrice-Fallback entfernt, Tarif-Fehler-Codes, priceSource='billing_tariffs' |
| `lib/billing/core/index.ts` | Neue Exports: TariffErrorCode, TARIFF_ERROR_CODES, parseTariffError |
| `__tests__/billing/atomic-rpc-comprehensive.test.ts` | mockResolvePrice entfernt, Tests 5+6 auf Tarif-Fehler umgestellt |
| `__tests__/billing/transaction-safety.test.ts` | resolvePrice-Mock entfernt, Tarif-Fehler-Tests |
| `__tests__/security/p0-auto-invoice-cross-client.test.ts` | Anpassung an neue Engine |
| `app/admin/invoices/page.tsx` | Engine statt Direkt-Inserts |
| `app/admin/rechnungserstellung/page.tsx` | Engine statt Direkt-Inserts |
| `app/api/billing/auto-invoice/route.ts` | Engine statt Direkt-Inserts |
| `proxy.ts` | Lazy STORAGE_KEY |

---

## 3. Bestehende und neue Tariflogik

### VORHER (alt)

```
Client → service_records.amount → direkt als Rechnungsbetrag
```

- Preis kam aus `service_records.amount` (vom Browser/UI gesetzt)
- Kein Tarif-Check, kein Audit, kein Rollback
- Browser konnte beliebige Betraege vorgeben
- Kein Schutz vor fehlenden oder mehrdeutigen Preisen

### NACHHER (neu)

```
Client → billing_tariffs (serverseitig, innerhalb PG-Transaktion) → invoice_items mit Tarif-Snapshot
```

- Preis wird ausschliesslich aus `billing_tariffs` aufgeloest
- `service_records.amount` = NUR Dokumentation, KEIN Fallback
- Tarifaufloesung innerhalb der atomaren PostgreSQL-Transaktion
- Spezifitaets-Scoring: Kostentraeger (+10) > Bundesland (+5) > Qualifikation (+3) > Vertrag (+2)
- Kein Tarif → `MISSING_VALID_TARIFF` + vollstaendiger Rollback
- Mehrere gleichrangige → `AMBIGUOUS_TARIFF` + vollstaendiger Rollback
- Unveraenderlicher Tarif-Snapshot in jeder Rechnungsposition

---

## 4. Datenbankschema und Migrationen

### Migration 20260807110000 (Tarif-Umbau)

**Neue Spalten in `invoice_items`:**

| Spalte | Typ | Zweck |
|--------|-----|-------|
| tariff_id | UUID | Referenz zum verwendeten Tarif |
| price_source | TEXT | Immer 'billing_tariffs' |
| tariff_gueltig_ab | DATE | Tarif-Gueltigkeit Beginn |
| tariff_gueltig_bis | DATE | Tarif-Gueltigkeit Ende |
| tariff_preis_cent | INTEGER | Tarifpreis zum Rechnungszeitpunkt |
| tariff_einheit | TEXT | Abrechnungseinheit |
| tariff_verguetungsart | TEXT | Art der Verguetung |
| abweichung_cent | INTEGER | Differenz zu service_records.amount |
| abweichung_grund | TEXT | Erklaerung der Abweichung |

**Neue Objekte:**

- `CREATE EXTENSION IF NOT EXISTS btree_gist` — fuer Exclusion Constraint
- `tariff_validity_range(DATE, DATE)` → `daterange` — Hilfsfunktion
- `EXCLUDE USING gist (no_overlapping_tariffs)` — verhindert zeitlich ueberlappende Tarife

**RPC `create_invoice_draft_atomic`:**

- SECURITY DEFINER, `SET search_path = public`
- Parameter: `p_client_id`, `p_period_month`, `p_budget_type`, `p_org_id`, `p_actor_id`
- Returntyp: `jsonb` mit invoice_id, invoice_number, total_amount, line_count, already_exists

### Rollback-Migration 20260807110001

- DROP FUNCTION create_invoice_draft_atomic
- DROP alle 9 neuen Spalten
- DROP CONSTRAINT no_overlapping_tariffs
- DROP FUNCTION tariff_validity_range
- Bestehende Rechnungen: UNVERAENDERT

---

## 5. Vollstaendiger Datenpfad: Client → Kostentraeger → Leistung → Tarif → Rechnung

```
1. API-Route empfaengt Request
   ├── Auth: Supabase-Session validiert
   ├── Rolle: profile.role IN ('admin', 'superadmin')
   └── org_id: aus profile.organization_id (NICHT aus Request)

2. createInvoiceDraft(supabase, params)
   ├── Client laden: supabase.from('clients').select('*, pflegekasse_ik')
   ├── Org-Fence: client.organization_id === org_id
   ├── Budget→Rechtsgrundlage: entlastung→'§45b SGB XI', verhinderung→'§39 SGB XI' etc.
   └── Idempotency-Key: inv_{clientId}_{period}_{budget}_v2

3. RPC create_invoice_draft_atomic (PostgreSQL-Transaktion)
   ├── Client-Pruefung: organization_id Match
   ├── Idempotenz: VORHANDENE Rechnung zurueckgeben wenn Key existiert
   ├── service_records laden: client_id + budget + period + status='approved'
   │
   ├── FÜR JEDE service_record:
   │   ├── Tarif-Suche in billing_tariffs:
   │   │   WHERE organization_id = p_org_id
   │   │     AND LOWER(leistungsart) = LOWER(service_type)
   │   │     AND rechtsgrundlage = v_rechtsgrundlage
   │   │     AND gueltig_ab <= record.date
   │   │     AND (gueltig_bis IS NULL OR gueltig_bis >= record.date)
   │   │     AND deleted_at IS NULL
   │   │
   │   ├── Spezifitaets-Scoring:
   │   │   ├── kostentraeger_ik Match: +10
   │   │   ├── kostentraeger_ik Mismatch: -100 (ausgeschlossen)
   │   │   ├── bundesland Match: +5
   │   │   ├── bundesland Mismatch: -100 (ausgeschlossen)
   │   │   ├── qualifikation Match: +3
   │   │   └── vertrag_referenz Match: +2
   │   │
   │   ├── Fehler wenn 0 Tarife: RAISE 'MISSING_VALID_TARIFF: ...'
   │   ├── Fehler wenn >1 gleichrangig: RAISE 'AMBIGUOUS_TARIFF: ...'
   │   │
   │   ├── Preisberechnung nach verguetungsart:
   │   │   ├── zeit_stunde: preis_cent/100 * duration/60
   │   │   ├── zeit_minute: preis_cent/100 * duration
   │   │   ├── leistungskomplex: preis_cent/100 (pauschal)
   │   │   ├── pauschale: preis_cent/100 (pauschal)
   │   │   ├── wegepauschale: preis_cent/100 (pauschal)
   │   │   └── zuschlag: preis_cent/100 * zuschlag_prozent/100
   │   │
   │   └── INSERT invoice_items mit Tarif-Snapshot:
   │       tariff_id, price_source='billing_tariffs',
   │       tariff_gueltig_ab/bis, tariff_preis_cent,
   │       tariff_einheit, tariff_verguetungsart,
   │       abweichung_cent, abweichung_grund
   │
   ├── Rechnungsnummer: next_billing_number()
   ├── Invoice INSERT mit Gesamtbetrag
   ├── service_records UPDATE: status→'billed', invoice_id
   ├── Audit-Trail: billing_audit_trail INSERT mit Checksum
   └── RETURN jsonb {...}

4. TypeScript-Ebene:
   ├── Tarif-Fehler → parseTariffError() → tariffErrorCode auf Error-Objekt
   ├── Erfolg → CreateDraftResult mit priceSource='billing_tariffs'
   └── API-Route → JSON-Response an Client
```

---

## 6. Verhalten bei fehlendem, mehrdeutigem, abgelaufenem und zukuenftigem Tarif

| Szenario | Verhalten | Fehlercode | Rollback |
|----------|-----------|------------|----------|
| Kein gueltiger Tarif | RPC bricht ab | MISSING_VALID_TARIFF | Vollstaendig |
| Mehrere gleichrangige Tarife | RPC bricht ab | AMBIGUOUS_TARIFF | Vollstaendig |
| Abgelaufener Tarif (gueltig_bis < Leistungsdatum) | Nicht gefunden | MISSING_VALID_TARIFF | Vollstaendig |
| Zukuenftiger Tarif (gueltig_ab > Leistungsdatum) | Nicht gefunden | MISSING_VALID_TARIFF | Vollstaendig |
| Genau ein gueltiger Tarif | Erfolg | — | — |
| Tarif mit hoeherem Score | Spezifischster wird gewaehlt | — | — |
| Tarif mit kostentraeger_ik Mismatch | Ausgeschlossen (-100) | — | — |

**Audit bei Fehlern:** Jeder Tarif-Fehler erzeugt einen Eintrag in `billing_audit_trail` mit:
- `action = 'missing_tariff'` oder `'ambiguous_tariff'`
- `new_state` enthält service_record_id, leistungsart, datum, gesuchte Kriterien

---

## 7. Nachweis der atomaren Transaktion und des Rollbacks

### PostgreSQL-Transaktion

Die gesamte RPC `create_invoice_draft_atomic` laeuft in EINER PostgreSQL-Transaktion:

1. **Client-Pruefung** — SELECT
2. **Idempotenz-Check** — SELECT
3. **Service-Records laden** — SELECT
4. **Tarif-Aufloesung** — SELECT (pro Record)
5. **Invoice INSERT** — INSERT
6. **Invoice-Items INSERT** — INSERT (pro Record, mit Tarif-Snapshot)
7. **Service-Records UPDATE** — UPDATE (status='billed')
8. **Audit-Trail INSERT** — INSERT

Jeder `RAISE EXCEPTION` an jeder Stelle → PostgreSQL rollt ALLE vorherigen Schritte zurueck.

### Getestete Rollback-Szenarien (Unit-Tests)

| Test | Datei | Ergebnis |
|------|-------|----------|
| MISSING_VALID_TARIFF → Rollback | tariff-based-invoice.test.ts | BESTANDEN |
| AMBIGUOUS_TARIFF → Rollback | tariff-based-invoice.test.ts | BESTANDEN |
| Items-Fehler → Rollback | atomic-rpc-comprehensive.test.ts | BESTANDEN |
| Audit-Fehler → Rollback | atomic-rpc-comprehensive.test.ts | BESTANDEN |
| RPC-Fehler → Keine Residualdaten | atomic-rpc-comprehensive.test.ts | BESTANDEN |
| Abgelaufener Tarif → Rollback | tariff-based-invoice.test.ts | BESTANDEN |
| Zukuenftiger Tarif → Rollback | tariff-based-invoice.test.ts | BESTANDEN |

---

## 8. SECURITY-DEFINER- und search_path-Pruefung

Vollstaendige Pruefung in `audit/SECURITY_DEFINER_REVIEW.md`.

### Zusammenfassung

| Checkpoint | Ergebnis |
|------------|----------|
| SET search_path = public | BESTANDEN |
| Fully qualified Tabellennamen | BESTANDEN |
| Minimale EXECUTE-Rechte | BESTANDEN |
| REVOKE ALL FROM PUBLIC, anon, authenticated | BESTANDEN |
| Server-seitige Auth (p_org_id, p_actor_id) | BESTANDEN |
| Server-seitige Org-Ermittlung | BESTANDEN (Hinweis: org_id aus profile, nicht aus Request) |
| Cross-Tenant-Schutz | BESTANDEN |
| Parallele Requests | WARNUNG (UNIQUE auf idempotency_key empfohlen) |
| Idempotenz-Logik | BESTANDEN |
| Kein Dynamic SQL | BESTANDEN |
| Browser-Manipulation blockiert | BESTANDEN |

**Gesamtergebnis: BEDINGT BESTANDEN** (9 BESTANDEN, 2 WARNUNG)

---

## 9. Testergebnisse und Testzahlen

### Gesamtergebnis

```
Test Files  26 passed | 1 skipped (27)
     Tests  491 passed | 29 skipped (520)
  Duration  6.79s
  Typecheck 0 Fehler
```

### Billing-Tests im Detail

| Testdatei | Tests | Status |
|-----------|-------|--------|
| tariff-based-invoice.test.ts | 31 | BESTANDEN |
| atomic-rpc-comprehensive.test.ts | 29 | BESTANDEN |
| transaction-safety.test.ts | 19 | BESTANDEN |
| unified-invoice-creation.test.ts | ~40 | BESTANDEN |
| price-resolver.test.ts | 9 | BESTANDEN |
| status-machine-strittig.test.ts | 21 | BESTANDEN |
| status-constraint.test.ts | 18 | BESTANDEN |

### Abgedeckte Szenarien

- Erfolgreiche Rechnungserstellung mit Tarif
- MISSING_VALID_TARIFF (kein Tarif, abgelaufen, zukuenftig)
- AMBIGUOUS_TARIFF (mehrere gleichrangige)
- Tarif-Snapshot in invoice_items
- Kein service_records.amount-Fallback
- Browser-Manipulation blockiert
- Atomarer Rollback bei jedem Fehler
- Idempotenz (doppelter Aufruf = bestehende Rechnung)
- Alle 6 Verguetungsarten (zeit_stunde, zeit_minute, leistungskomplex, pauschale, wegepauschale, zuschlag)
- Private Budget-Abrechnung
- Kaufmaennische Rundung
- Mandantentrennung
- parseTariffError-Funktion

---

## 10. Nachweis: Keine Browserpreise und kein service_records.amount-Fallback

### Code-Nachweis

**invoice-engine.ts:**
```typescript
// resolvePrice wird nicht mehr als Fallback verwendet — die Tarifaufloesung
// erfolgt vollstaendig innerhalb der atomaren RPC (billing_tariffs = fuehrend).
// import { resolvePrice } from './price-resolver';  // ENTFERNT: kein Fallback

// ...
priceSource: 'billing_tariffs',  // IMMER, kein Optional mehr
```

**RPC (SQL):**
```sql
-- service_records.amount wird NUR als Dokumentation gelesen:
v_abweichung_cent := v_line_total_cent - COALESCE(ROUND(v_rec.amount * 100)::integer, 0);
-- Der Rechnungsbetrag kommt IMMER aus billing_tariffs.preis_cent
```

**API-Route (route.ts):**
```typescript
// org_id kommt aus dem Server-Profil, NICHT aus dem Request-Body
const { data: profile } = await supabase.from('profiles').select('organization_id, role')
```

### Test-Nachweis

| Test | Assertion |
|------|-----------|
| "priceSource ist immer billing_tariffs" | `expect(result.priceSource).toBe('billing_tariffs')` |
| "Kein Fallback auf service_records.amount" | Kein resolvePrice-Mock, RPC-Fehler = Error |
| "Browser-Manipulation blockiert" | UI-Preis wird ignoriert |
| "Private Budget verwendet Tarif" | Auch 'privat' geht ueber billing_tariffs |

### Grep-Nachweis

```
$ grep -r "resolvePrice" lib/billing/core/invoice-engine.ts
→ NUR im Kommentar: "// import { resolvePrice } from './price-resolver';  // ENTFERNT"

$ grep -r "priceSource.*service_records" lib/billing/core/
→ 0 Treffer

$ grep -r "amount.*fallback\|fallback.*amount" lib/billing/core/
→ 0 Treffer
```

---

## 11. Noch benoetigte echte Stammdaten und fachliche Entscheidungen

### Stammdaten (MUESSEN vor Produktion angelegt werden)

| # | Was | Wer entscheidet | Status |
|---|-----|-----------------|--------|
| 1 | Leistungsarten und Stundensaetze fuer Alltagsbegleitung | Yusuf | OFFEN |
| 2 | Kostentraeger-IKs fuer Hessen (AOK, BKK, etc.) | Yusuf | OFFEN |
| 3 | Rechtsgrundlage pro Budget-Typ bestaetigen | Yusuf | Mapping vorhanden, Review noetig |
| 4 | Private Tarife (eigene Saetze?) | Yusuf | OFFEN |
| 5 | Zuschlagsregeln (Wochenende/Feiertag/Nacht) | Yusuf | Schema vorhanden, Aktivierung offen |
| 6 | `clients.pflegekasse_ik` auf Produktion verifizieren | Yusuf/Admin | ZU PRUEFEN |

### Fachliche Entscheidungen

| # | Frage | Empfehlung |
|---|-------|------------|
| 1 | Vier-Augen-Freigabe: Status-Feld oder deleted_at? | Status-Feld empfohlen |
| 2 | Mindest-Leistungsarten fuer Go-Live? | alltagsbegleitung, demenzbetreuung, haushaltshilfe, hauswirtschaft |
| 3 | Entlastungsbetrag 131 EUR/Monat — als Budget-Limit pruefen? | Empfohlen, separater PR |
| 4 | UNIQUE-Constraint auf idempotency_key (Security-Review Warnung) | Empfohlen, separater PR |

---

## 12. MERGE-GO und PRODUKTIONS-GO

### ⬜ MERGE-GO

**Voraussetzungen:**

| # | Kriterium | Status |
|---|-----------|--------|
| 1 | Alle Tests bestanden (491/491) | ✅ |
| 2 | Typecheck fehlerfrei | ✅ |
| 3 | Security-Review durchgefuehrt | ✅ (bedingt, 2 Warnungen) |
| 4 | Migrations-Test bestanden | ✅ |
| 5 | Kein service_records.amount-Fallback | ✅ |
| 6 | Kein Browser-Preis-Override | ✅ |
| 7 | Rollback-Migration vorhanden | ✅ |
| 8 | Code-Review durch Yusuf | ⬜ AUSSTEHEND |

**Empfehlung:** Merge-bereit nach Yusufs Code-Review.

### ⬜ PRODUKTIONS-GO

**Zusaetzliche Voraussetzungen VOR Produktionseinsatz:**

| # | Kriterium | Status |
|---|-----------|--------|
| 1 | billing_tariffs mit echten Tarifen befuellt | ⬜ OFFEN |
| 2 | clients.pflegekasse_ik auf Produktion verifiziert | ⬜ OFFEN |
| 3 | Staging-E2E-Test mit echten Tarifen | ⬜ OFFEN |
| 4 | UNIQUE auf idempotency_key (Warnung) | ⬜ EMPFOHLEN |
| 5 | Vier-Augen-Freigabe fuer Tarife geklaert | ⬜ OFFEN |
| 6 | Backup-Plan dokumentiert | ✅ (Rollback-Migration) |
| 7 | Yusufs ausdrueckliche Freigabe | ⬜ AUSSTEHEND |

**Empfehlung:** NICHT produktionsbereit — Tarif-Stammdaten fehlen.

---

## Punkt 5: Staging-E2E-Test

**Status: NICHT DURCHFUEHRBAR ohne Migration auf Staging.**

Die RPC `create_invoice_draft_atomic` existiert noch nicht auf dem Produktions-/Staging-Server. Ein echter E2E-Test erfordert:
1. Migration auf Staging anwenden
2. Test-Tarife in `billing_tariffs` anlegen
3. Test-Client mit `pflegekasse_ik` anlegen
4. Test-Service-Records mit `status='approved'` anlegen
5. API-Route aufrufen
6. Ergebnis pruefen (Rechnung, Items, Tarif-Snapshot)
7. Alle Test-Daten wieder entfernen

Dies wird als erster Schritt nach MERGE-GO empfohlen (Staging-Branch, nicht Production).

---

**NICHT gemergt. NICHT deployed. Keine Migration auf Produktion angewendet.**
**Warte auf Yusufs ausdrueckliche Freigabe.**
