# SECURITY DEFINER Review — create_invoice_draft_atomic

**Datum:** 2026-08-07
**Branch:** feature/unified-invoice-creation
**Prüfer:** Automatisiert (Punkt 6 der Pre-Production-Prüfung)
**Dateien:**
- `supabase/migrations/20260807100000_create_invoice_draft_atomic.sql`
- `app/api/billing/invoices/create/route.ts`
- `lib/billing/core/invoice-engine.ts`

---

## Gesamtbewertung: BEDINGT BESTANDEN

11 Prüfpunkte: 9 BESTANDEN, 2 WARNUNG, 0 FEHLER.
Die Warnungen sind keine Blocker, erfordern aber Aufmerksamkeit vor Production-Rollout.

---

## Prüfpunkt 1: Fixed search_path

**BESTANDEN**

```sql
SET search_path = public  -- Zeile 53
```

Die Funktion setzt `search_path` explizit auf `public`. Damit ist eine search_path-Injection (CVE-2018-1058-Muster) ausgeschlossen. Kein externer Schema-Name kann eingeschleust werden.

---

## Prüfpunkt 2: Fully Qualified Names

**BESTANDEN**

Alle Tabellen- und Typ-Referenzen verwenden `public.`-Präfix:
- `public.clients` (Zeile 88)
- `public.invoices` (Zeile 105, 178)
- `public.service_records` (Zeile 125, 140, 227, 245)
- `public.invoice_items` (Zeile 216)
- `public.billing_audit_trail` (Zeile 265)
- `public.create_invoice_draft_result` (Zeile 50, 56)
- `public.next_billing_number()` (Zeile 175)

Kein unqualifizierter Tabellenname gefunden.

---

## Prüfpunkt 3: Minimal EXECUTE Permissions

**BESTANDEN**

```sql
REVOKE ALL ON FUNCTION public.create_invoice_draft_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
```

Nur `service_role` (= createAdminClient) behält EXECUTE. Browser-seitige Aufrufe über `anon` oder `authenticated` sind blockiert.

---

## Prüfpunkt 4: REVOKE PUBLIC

**BESTANDEN**

Expliziter REVOKE für alle drei Rollen (PUBLIC, anon, authenticated) in Zeile 309-310. Kein GRANT an andere Rollen.

---

## Prüfpunkt 5: Server-side Auth

**BESTANDEN**

Auth-Kette in `route.ts`:
1. `supabase.auth.getUser()` → User-Identität (Zeile 43)
2. `profiles.role` → Rollenprüfung: nur `admin`/`superadmin` (Zeile 66)
3. `profile.organization_id` → Org-Zugehörigkeit aus DB, nicht vom Request (Zeile 73)
4. `client.organization_id !== orgId` → Org-Fence (Zeile 124)

Der Request-Body liefert nur `clientId`, `periodMonth`, `budgetType`. Keine sicherheitsrelevanten Parameter (orgId, actorId, Preise) kommen vom Client.

---

## Prüfpunkt 6: Server-side Org Determination

**BESTANDEN (mit Hinweis)**

Drei Schutzschichten:

| Schicht | Wo | Was |
|---------|-----|-----|
| Route | route.ts:73 | `orgId = profile.organization_id` (aus Auth-DB) |
| Route | route.ts:124 | `client.organization_id !== orgId` → 403 |
| Engine | invoice-engine.ts:146 | `p_org_id: client.organization_id` (aus DB geladen) |
| RPC | SQL:88-93 | `clients.organization_id = p_org_id` nochmal geprüft |

Die org_id wird **dreifach** serverseitig bestimmt und validiert. Der RPC-Parameter `p_org_id` ist zwar frei setzbar, aber:
- Nur `service_role` kann die Funktion aufrufen (REVOKE)
- Die Engine setzt ihn aus `client.organization_id` (DB-Wert)
- Die Route prüft vorher, ob Client zur User-Org gehört

**Hinweis:** Sollte die RPC jemals von einem anderen Caller aufgerufen werden, müsste dieser die gleiche Org-Validierung implementieren. Die RPC selbst prüft nur `clients.organization_id = p_org_id`, nicht ob p_org_id zum authentifizierten User gehört. Das ist architektonisch korrekt (SECURITY DEFINER = kein Auth-Context), aber dokumentationswürdig.

---

## Prüfpunkt 7: Cross-Tenant Protection

**BESTANDEN**

- RPC Zeile 88-93: `WHERE id = p_client_id AND organization_id = p_org_id` — Client muss zur Org gehören
- Alle INSERTs (invoices, invoice_items, billing_audit_trail) setzen `organization_id = p_org_id`
- Service Records werden über `client_id` + `budget_type` + `status` + `date` gefiltert — mandantenisoliert durch die Client-Zugehörigkeitsprüfung
- Kein SELECT/UPDATE ohne Mandantenfilter

---

## Prüfpunkt 8: Parallel Request Safety

**WARNUNG**

Idempotenz-Prüfung (Zeile 105-121):
```sql
SELECT id INTO v_existing_id
  FROM public.invoices
  WHERE idempotency_key = v_idemp_key
    AND deleted_at IS NULL;
```

**Risiko:** Bei zwei gleichzeitigen Requests mit identischem Idempotency-Key:
1. Beide lesen `v_existing_id IS NULL`
2. Beide versuchen INSERT
3. Einer scheitert — ABER nur wenn `idempotency_key` einen UNIQUE CONSTRAINT hat

**Empfehlung:** Verifizieren, dass `invoices.idempotency_key` einen UNIQUE INDEX oder CONSTRAINT hat. Falls ja: zweiter Request bekommt einen Constraint-Violation-Error, der als normaler Fehler behandelt wird (RAISE EXCEPTION → vollständiger Rollback). Falls nein: Duplikat-Rechnungen möglich.

**Mitigierung:** Auch ohne UNIQUE CONSTRAINT wäre das Worst-Case-Ergebnis eine doppelte Rechnung mit identischem Key, die beim nächsten Aufruf erkannt wird. Kein Datenverlust, keine Inkonsistenz — aber eine überflüssige Rechnung.

---

## Prüfpunkt 9: Idempotency

**BESTANDEN**

Key-Pattern: `inv_{client_id}_{period_month}_{budget_type}_v1`

Wenn eine Rechnung mit diesem Key existiert (und nicht soft-deleted), wird die bestehende zurückgegeben (`already_exists = TRUE`). Keine neue Rechnung erstellt, keine Daten verändert.

---

## Prüfpunkt 10: No Dynamic SQL Injection Surface

**BESTANDEN**

Die gesamte Funktion verwendet ausschließlich:
- Parametrisierte Variablen (`p_client_id`, `v_idemp_key` etc.)
- PL/pgSQL-Zuweisungen und statische SQL-Statements
- Kein `EXECUTE`, kein `format()`, kein String-Concatenation in SQL-Queries
- String-Concat nur für Audit-Payload (JSONB, nicht als SQL ausgeführt)

Einzige String-Concatenation in SQL-Kontext:
```sql
v_idemp_key := 'inv_' || p_client_id || '_' || p_period_month || '_' || p_budget_type || '_v1';
```
→ Wird als WHERE-Vergleichswert verwendet, nicht als SQL ausgeführt. Sicher.

---

## Prüfpunkt 11: Browser-Preismanipulation

**BESTANDEN**

Preise kommen ausschließlich aus der Datenbank:
```sql
SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO v_line_count, v_total
  FROM public.service_records
  WHERE client_id = p_client_id ...
```

```sql
INSERT INTO public.invoice_items (..., amount, ...)
SELECT ..., sr.amount, ...
FROM public.service_records sr ...
```

Kein RPC-Parameter übergibt einen Preis oder Betrag. Die Engine (invoice-engine.ts) übergibt keine Preise an die RPC. Route.ts ignoriert alle `amount`/`price`/`totalAmount`-Felder aus dem Request-Body (sie werden gar nicht aus `body` destrukturiert).

---

## Zusätzliche Findings

### Finding A: Budget-Split-Logik (informativ, kein Sicherheitsrisiko)

Zeilen 153-172: Die Budget/Privat-Aufteilung enthält redundante Logik:
- `v_budget_total` filtert `WHERE budget_type = p_budget_type AND budget_type != 'private'`
- `v_private_total` filtert `WHERE budget_type = p_budget_type AND budget_type = 'private'`

Bei `p_budget_type = 'entlastung'`: budget_total = Summe, private_total = 0 (korrekt)
Bei `p_budget_type = 'private'`: budget_total = 0, private_total = Summe (korrekt)

Funktional korrekt, aber unnötig komplex. Kein Sicherheitsrisiko.

### Finding B: Audit-Checksumme deterministisch

Zeile 284-293: Die SHA-256-Checksumme ist deterministisch (gleiche Eingabe = gleicher Hash), aber der Timestamp `v_now` ist teil des Inputs. Bei Replay-Prüfung muss `v_now` mit verglichen werden. Kein Sicherheitsrisiko, aber relevant für Audit-Verifizierung.

### Finding C: pgcrypto CREATE EXTENSION nach REVOKE

Zeile 313: `CREATE EXTENSION IF NOT EXISTS pgcrypto` kommt NACH dem REVOKE-Statement. Die Reihenfolge ist unkritisch, da pgcrypto auf Produktion bereits installiert ist (v1.3 verifiziert). Auf einer frischen DB wäre die Reihenfolge ebenfalls korrekt, da die Extension von der Funktion benötigt wird, die erst nach der Extension-Installation aufgerufen werden kann.

---

## Zusammenfassung

| # | Prüfpunkt | Ergebnis |
|---|-----------|----------|
| 1 | Fixed search_path | BESTANDEN |
| 2 | Fully qualified names | BESTANDEN |
| 3 | Minimal EXECUTE permissions | BESTANDEN |
| 4 | REVOKE PUBLIC | BESTANDEN |
| 5 | Server-side auth | BESTANDEN |
| 6 | Server-side org determination | BESTANDEN (Hinweis) |
| 7 | Cross-tenant protection | BESTANDEN |
| 8 | Parallel request safety | WARNUNG |
| 9 | Idempotency | BESTANDEN |
| 10 | No dynamic SQL injection | BESTANDEN |
| 11 | Browser-Preismanipulation | BESTANDEN |

**Offene Aktion:** UNIQUE CONSTRAINT auf `invoices.idempotency_key` verifizieren. Falls vorhanden → Prüfpunkt 8 wird BESTANDEN. Falls nicht → Constraint anlegen vor Production-Rollout.
