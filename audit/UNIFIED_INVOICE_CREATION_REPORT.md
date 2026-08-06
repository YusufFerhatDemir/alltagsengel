# Unified Invoice Creation — PR-Report

**Branch:** feature/unified-invoice-creation
**Datum:** 2026-08-07
**Status:** Bereit fuer Review (NICHT mergen, NICHT deployen)

---

## Zusammenfassung

Diese PR schliesst den kritischen Gap bei der Rechnungserstellung: Bisher wurden Rechnungen durch direkte Supabase-Inserts aus dem Browser erstellt (ohne Engine, ohne Idempotenz, ohne Audit-Trail). Jetzt laufen alle neuen Rechnungen ueber die bestehende Billing-Engine.

---

## Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `app/api/billing/invoices/create/route.ts` | **NEU** — API-Endpoint |
| `app/admin/rechnungserstellung/page.tsx` | **GEAENDERT** — createInvoice nutzt API statt direkter Inserts |
| `__tests__/billing/unified-invoice-creation.test.ts` | **NEU** — 12 Testszenarien |
| `audit/PREISTABELLEN_DIAGNOSE.md` | **NEU** — Read-only-Analyse der 3 Preissysteme |
| `audit/UNIFIED_INVOICE_CREATION_REPORT.md` | **NEU** — Dieser Bericht |

---

## 1. Architektur

### Vorher (direkte Inserts)
```
Browser → supabase.from('invoices').insert({...})
       → supabase.from('invoice_items').insert([...])
       → supabase.from('service_records').update({status:'invoiced'})
```
Drei separate, nicht-atomare Operationen. Keine Idempotenz. Keine Audit-Spur. Rechnungsnummer = `RE-YYYYMM-RANDOM`. Betraege kommen direkt vom Browser.

### Nachher (Engine-basiert)
```
Browser → POST /api/billing/invoices/create
       → Auth + Org-Fence (Server)
       → createInvoiceDraft() (Billing Engine)
            → Idempotenz-Check
            → Service Records aus DB laden (nicht vom Browser)
            → Fortlaufende Rechnungsnummer (Sequenz)
            → Atomares Insert (Rechnung + Positionen)
            → Service Records → 'invoiced'
            → Audit-Trail
```

---

## 2. API-Endpoint

### `POST /api/billing/invoices/create`

**Request:**
```json
{
  "clientId": "uuid",
  "periodMonth": "YYYY-MM",
  "budgetType": "entlastung"  // optional; ohne = alle Typen
}
```

**Response (Erfolg):**
```json
{
  "invoices": [{
    "invoiceId": "uuid",
    "invoiceNumber": "RE-2026-00001",
    "totalAmountCents": 3500,
    "lineCount": 2,
    "alreadyExists": false,
    "budgetType": "entlastung"
  }],
  "count": 1,
  "warnings": []
}
```

**Sicherheitsgarantien:**

| Pruefung | Implementierung |
|----------|-----------------|
| Auth | `supabase.auth.getUser()` — kein Token = 401 |
| Rolle | `profiles.role` muss `admin` oder `superadmin` sein |
| Org-Fence | `client.organization_id === profile.organization_id` |
| Idempotenz | `generateIdempotencyKey()` + `checkIdempotency()` (via Engine) |
| Keine Browser-Betraege | Engine liest `amount` aus `service_records` (DB) |
| Rechnungsnummer | Engine: `generateInvoiceNumber()` (Sequenz, nicht Random) |
| Audit-Trail | Engine: `logBillingAction()` mit SHA-256-Checksum |
| Status-Maschine | Engine: Status `entwurf` mit validiertem Uebergangsmodell |

---

## 3. Datenmodell

Keine Schema-Aenderungen. Die PR nutzt ausschliesslich bestehende Tabellen:
- `invoices` (36 Spalten)
- `invoice_items` (10 Spalten)
- `service_records` (21 Spalten)
- `billing_number_sequences` (fuer fortlaufende Nummern)
- `billing_audit_trail` (fuer Audit-Eintraege)

---

## 4. UI-Aenderungen

`app/admin/rechnungserstellung/page.tsx`:

| Vorher | Nachher |
|--------|---------|
| `supabase.from('invoices').insert(...)` | `fetch('/api/billing/invoices/create', ...)` |
| `supabase.from('invoice_items').insert(...)` | Entfernt (Engine macht das) |
| `supabase.from('service_records').update(...)` | Entfernt (Engine macht das) |
| `Math.random()` fuer Rechnungsnummer | Entfernt (Engine-Sequenz) |
| Browser-Betraege (`group.sum`) | Entfernt (Engine liest aus DB) |

Die lesenden Funktionen (`loadBillable`, `loadInvoices`) bleiben unveraendert — sie lesen weiterhin ueber den Client-Supabase.

---

## 5. Datenbankänderungen

Keine. Keine neuen Migrationen, keine Tabellen-Aenderungen.

---

## 6. Tests

12 Vitest-Szenarien — alle bestanden:

| # | Szenario | Status |
|---|----------|--------|
| 1 | Unautorisierter Zugriff → 401 | ✅ |
| 2 | Nicht-Admin → 403 | ✅ |
| 3 | Fehlende clientId → 400 | ✅ |
| 4 | Ungueltiges periodMonth → 400 | ✅ |
| 5 | Fremder Klient (Org-Fence) → 403 | ✅ |
| 6 | Keine abrechenbaren Leistungen → 404 | ✅ |
| 7 | Erfolgreiche Erstellung → 200 | ✅ |
| 8 | Idempotenz (doppelter Aufruf) | ✅ |
| 9 | Mehrere Budget-Typen → mehrere Rechnungen | ✅ |
| 10 | Engine-Fehler → strukturierte Antwort | ✅ |
| 11 | actorId korrekt uebergeben | ✅ |
| 12 | Rechnungsnummer von Engine | ✅ |

---

## 7. Preistabellen-Diagnose

Vollstaendiger Bericht: `audit/PREISTABELLEN_DIAGNOSE.md`

Kurzfassung: Drei unabhaengige Preissysteme (`service_pricing`, `leistungspreise`, `billing_tariffs`). Die Engine verwendet aktuell `service_records.amount` (= aus `service_pricing` bei Erfassung). `billing_tariffs` + `resolvePrice()` sind implementiert aber noch nicht in den Rechnungserstellungs-Pfad integriert. Konsolidierung in separater PR empfohlen.

---

## 8. Risiken

| Risiko | Massnahme |
|--------|-----------|
| `createInvoiceDraft` ist getestet, aber nicht in Production verifiziert | Diese PR deployed NICHT. Erst nach Review + separater Freigabe |
| `billing_number_sequences` Tabelle muss existieren | Ist vorhanden (PR35 erstellt) |
| `next_billing_number` RPC | Fallback-Implementierung in Engine vorhanden |
| Preis-Inkonsistenz (3 Systeme) | Diagnose erstellt, Konsolidierung in separater PR |

---

## 9. Was NICHT geaendert wurde

- Keine bestehenden Rechnungen veraendert
- Keine Preistabellen geloescht oder migriert
- Keine Production-Migrationen
- Kein Merge auf main
- Kein Deployment
- Kein AP4-Backfill
- `app/admin/invoices/page.tsx` (CreateInvoiceModal) → NICHT geaendert (separater Scope)
- `app/api/billing/auto-invoice/route.ts` → NICHT geaendert (separater Scope)

---

## 10. Naechste Schritte (nach Freigabe)

1. Review dieser PR
2. Merge nach expliziter Freigabe
3. `app/admin/invoices/page.tsx` (CreateInvoiceModal) ebenfalls auf Engine umstellen
4. `app/api/billing/auto-invoice/route.ts` auf Engine umstellen
5. `resolvePrice()` in `createInvoiceDraft()` integrieren (Soll/Ist-Abgleich)
6. Preistabellen konsolidieren (separate PR)

---

## Sicherheitsbestaetigung

| Regel | Status |
|-------|--------|
| Keine echten Kundendaten verwendet | ✅ |
| Keine Secrets in Chat/Logs/Commits | ✅ |
| Kein direkter Push auf main | ✅ (Branch) |
| Kein Merge ohne Freigabe | ✅ |
| Kein Deployment | ✅ |
| Keine Production-Migration | ✅ |
| Keine Preistabellen geloescht | ✅ |
| Typecheck fehlerfrei | ✅ |
| 12/12 Tests bestanden | ✅ |
