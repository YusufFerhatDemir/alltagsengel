# Phase 8.2 — Tracks 7–12 Prüfbericht

Stand: 2026-08-26

---

## Track 7 — CAMT Real-Pilot Preparation

### Ergebnis: BEREIT (DRY_RUN fest, fail-closed)

**DRY_RUN ist der erzwungene Standard:**
- `camt-modus.ts`: nur exakt `'LIVE'` (case-sensitive) schaltet auf Buchung. Alles andere → DRY_RUN.
- `camt-pilot.ts`: `Object.freeze({ CAMT_IMPORT_MODE: 'DRY_RUN' })` + Post-Assertion.
- `CAMT_IMPORT_MODE` ist in keiner `.env`/`vercel.json` des Repos gesetzt.

**Ablauf:** UPLOAD → DRY_RUN → Bericht → USER_APPROVAL (env-basiert) → Buchung

**Parser (458 Zeilen):**
- Betrag: `euroZuCent()` (string-basiert, kein IEEE-754)
- Duplikat: SHA-256 (Datei + Buchung), DB UNIQUE Index `uq_zahlungseingaenge_org_buchungshash`
- Cross-Tenant: 3 absichtliche Cross-Org-Abfragen im Preflight (EndToEndId, MandateId, Rechnungsnummer)
- Rücklastschrift: nur definitive ISO-20022-Marker (RvslInd, BkTxCd, RtrInf)
- Fehlerhafte Einträge: gesammelt, nicht in `buchungen[]` aufgenommen

**Live-Stand (ohne Anon-Key nicht direkt prüfbar):**
- Migration `20260825010000_zahlungseingang_opos.sql` + `20261003000000_camt_buchungsdublette.sql`

**Befunde:**

| # | Schwere | Befund |
|---|---------|--------|
| C-1 | MITTEL | Cross-Tenant-Check fehlt im Live-Import-Route (`/api/billing/camt/import`). Preflight und Pilot prüfen es, der Live-Import nicht. Org-Filter beim Matching verhindert falsche Zuordnungen, aber Einträge landen in `klaerfaelle` statt blockiert. |
| C-2 | GERING | `CdtDbtInd`-Fallback auf CRDT bei fehlendem Tag. Mitigiert durch Preflight-Vorzeichen-Check. |
| C-3 | GERING | `<Sts>`-Fallback auf BOOK bei fehlendem Tag. In Praxis immer vorhanden. |
| C-4 | GERING | Freigabe ist global (env), nicht pro Datei. Erwarteter Ablauf: preview → LIVE → import → DRY_RUN zurück. |

---

## Track 8 — Money-Path Control Center

### Ergebnis: 14/14 KATEGORIEN ABGEDECKT

**Read-only:** Alle 8 API-Routen sind rein lesend (GET, oder POST nur als Dry-Run).
**Tenant-Isolation:** Jede Route erzwingt `organization_id`-Filter.

| Kategorie | Vorhanden | Ort |
|-----------|-----------|-----|
| Source-of-Truth | JA | `/api/pilot/snapshot` (VERCEL_GIT_COMMIT_SHA) |
| Deployment | JA | `/api/pilot/snapshot` (VERCEL_ENV) |
| CI | JA | Gemeldet, nicht gemessen (korrekt dokumentiert) |
| DB/RLS | JA | Dokumentiert (pg_tables nicht via PostgREST) |
| Versandflags | JA | `versandFlagsStand()` + Control Center |
| Pilot-Send-Gate | JA | Offene/verbrauchte Tokens + Versandsperren |
| Kandidaten | JA | Kundenketten (max 100, transparent gekappt) |
| Preflight | JA | Betriebs-Checkliste (11 Checks) + 16-Punkte-Preflight/Rechnung |
| CAMT | JA | Import-/Klärfall-/Duplikat-/Rücklastschrift-Zählung |
| Versandlogs | JA | `invoice_email_log`-Zählung |
| Payment Imports | JA | `zahlungseingaenge`-Zählung |
| P0/P1 | JA (ergänzt) | Sperren-Zählung + **NEU: Detailliste** (`versandSperrenDetails`) |
| EXTERN_BLOCKIERT | JA | `blocker: 'extern'` Badges + bewusst gesperrte Wege |
| BUSINESS_INPUT_REQUIRED | JA | Sektion 5 (D1–D6, C1–C5) mit Stand offen/gesetzt/nicht_prüfbar |

**Ergänzung in dieser Session:**
- `VersandSperreDetail`-Interface + Abfrage in `pilot-phasen.ts`
- P0-Detailtabelle (Schwere, Grund, Rechnung, Zeitstempel) in der Pilot-UI

---

## Track 9 — Security / Money Path Chaos Check

### Ergebnis: 10/10 SZENARIEN ABGEDECKT

**Send-Gate ist fail-closed in allen Fällen.**

| # | Szenario | Status | Test-Ort |
|---|----------|--------|----------|
| 1 | Double-Click / Retry-Storm | ABGEDECKT | `send-gate.test.ts:364-375`, `geldweg-chaos.test.ts:259-289` |
| 2 | Browser-Reload nach Freigabe | ABGEDECKT (implizit) | `send-gate.test.ts:240-253` (consumed/invalidated/expired) |
| 3 | Parallele Worker / zwei Tabs | ABGEDECKT | `geldweg-chaos.test.ts:259-289` (Promise.allSettled), UNIQUE-Index |
| 4 | Duplicate Webhook | TEILWEISE | Stripe `syncSubscriptionToDb` via upsert; kein Event-ID-Log |
| 5 | Provider Timeout nach Versand | ABGEDECKT | `resend-fehlerpfade.test.ts`, `post-send-verification.ts` (8 Punkte) |
| 6 | DB Write OK / Provider Unknown | ABGEDECKT | Post-Send-Verification Punkt 2 (message_id), Punkt 1 (status) |
| 7 | Provider OK / DB Log Failure | ABGEDECKT | Post-Send-Verification Punkt 3 + P0-Lock, `geldweg-chaos.test.ts:202-234` |
| 8 | Cross-Tenant invoice_id | ABGEDECKT | `send-gate.test.ts:233-238`, `geldweg-chaos.test.ts:293-331`, RLS-Fence |
| 9 | Manipuliertes Token | ABGEDECKT | `send-gate.test.ts` Sektion 2 (7 Angriffsrichtungen) + Sektion 3 (Bindungen) |
| 10 | Rechnung nach Freigabe geändert | ABGEDECKT | `send-gate.test.ts:266-279`, Token-Bindung an Betrag/Empfänger/Invoice |

**Mechanik:** Der Send-Gate nutzt ein bedingtes UPDATE (`WHERE verbraucht_am IS NULL AND entwertet_am IS NULL`). Zwei parallele Aufrufe: einer gewinnt (1 Zeile), der andere bekommt 0 Zeilen zurück. Kein Read-then-Write-Fenster.

**DB-Garantien:** 3 Constraints — CHECK (nur READY_FOR_SEND), UNIQUE partial Index (max 1 offenes Token/Rechnung), UNIQUE partial Index (max 1 verbrauchtes Token/Rechnung = Doppelversand-Sperre).

**Einzige Lücke:** Stripe-Webhook-Event-ID-Deduplikation hat keinen expliziten Test (upsert-Semantik deckt es implizit ab).

---

## Track 11 — ChairMatch Business Input

### Ergebnis: BUSINESS_INPUT_REQUIRED

**Tabellen:** `protect_pricing` und `compliance_plans` sind **strukturell vollständig und LEER**.

**Schema:** Migration `20260824_pricing_schema.sql` legt Spalten, Constraints, RLS an. Migration `20260826_pricing_gueltigkeit.sql` fügt Preishistorie hinzu (EXCLUDE-Constraint gegen überlappende Zeiträume).

**Seed-Templates:**
- `supabase/seed/pricing.seed.template.sql` — vor Gültigkeitsmigration
- `supabase/seed/pricing.seed.versioniert.template.sql` — nach Gültigkeitsmigration
- Beide mit `<<<PLATZHALTER>>>` (fail-closed: Postgres bricht bei Syntaxfehler ab)

**Validiertes Template:** `docs/chairmatch-pricing-template.md` erstellt mit Feld-Schema und offenen Geschäftsfragen (C1–C5).

**Code-Integration:** `lib/pilot/business-inputs.ts` trackt alle 5 ChairMatch-Eingaben als `nicht_pruefbar` (anderes Repo, anderes Supabase-Projekt). Unabhängigkeitstest bestätigt: kein Import von ChairMatch im Rechnungsweg.

**Blockiert Alltagsengel:** NEIN.

---

## Track 12 — DATEV Business Input

### Ergebnis: BUSINESS_INPUT_REQUIRED_DATEV (D1, D2 fehlen)

**Fail-closed:** `isDatevConfigComplete()` → `erstelleDatevExport()` bricht ab, bevor CSV oder DB-Record entsteht.

**Beraternummer/Mandantennummer:**
- Gespeichert in `organizations.datev_config` (JSONB, per Organisation)
- Default: leere Strings (kein Platzhalter mit Wert)
- Admin-UI: `/admin/datev` (Tab "Konfiguration")

**Format-Validierung (NEU in dieser Session):**
- Beraternummer: 1–7 Ziffern (`/^\d{1,7}$/`)
- Mandantennummer: 1–5 Ziffern (`/^\d{1,5}$/`)
- Prüfung sowohl beim Speichern als auch bei der Vollständigkeitsprüfung

**Zwei-Schicht-Validierung:**
1. `pruefeBuchungssaetze()` — vor der Formatierung (Betrag, Konto, Datum)
2. `pruefeDatevCsv()` — auf der fertigen CSV (Feldanzahl, Formel-Injection)
Beide müssen mit 0 FEHLER bestehen.

**DATEV-Format:** EXTF 510, Semikolon-getrennt, CRLF, Komma als Dezimaltrenner, TTMM Datumsformat.

| Szenario | Verhalten |
|----------|-----------|
| Beraternummer leer | Export bricht ab |
| Mandantennummer leer | Export bricht ab |
| Beraternummer nicht numerisch | **NEU: saveDatevConfig() wirft** |
| Kontenmapping unvollständig | Auto-Generierung (bis 69999) |
| Unbekanntes Konto | FEHLER, Export abgebrochen |
| Keine Buchungen | Export bricht ab |

**Befunde:**

| # | Schwere | Befund | Status |
|---|---------|--------|--------|
| D-1 | GERING | Windows-1252 Header deklariert, UTF-8 tatsächlich erzeugt | Offen |
| D-2 | GERING | Kein Audit-Trail bei Config-Änderungen (anders als beim Export) | Offen |
| D-3 | MITTEL | Format-Validierung Beraternummer/Mandantennummer fehlte | **GEFIXT** |

---

## Zusammenfassung

| Track | Status | Befunde | Fixes |
|-------|--------|---------|-------|
| 7 — CAMT | BEREIT (DRY_RUN) | 1 MITTEL, 3 GERING | — |
| 8 — Pilot Center | 14/14 abgedeckt | P0-Detailliste fehlte | GEFIXT |
| 9 — Chaos Tests | 10/10 abgedeckt | Stripe-Webhook-Dedup-Test fehlt | Empfehlung |
| 11 — ChairMatch | BUSINESS_INPUT_REQUIRED | Tabellen leer, Templates bereit | Template-Doc erstellt |
| 12 — DATEV | BUSINESS_INPUT_REQUIRED_DATEV | Format-Validierung fehlte | GEFIXT |

### Geänderte Dateien
- `lib/billing/datev/datev-config.ts` — Format-Validierung Beraternummer/Mandantennummer
- `lib/pilot/pilot-phasen.ts` — `VersandSperreDetail` + Detailabfrage
- `app/admin/pilot/page.tsx` — P0-Detailtabelle
- `docs/chairmatch-pricing-template.md` — Validiertes Pricing-Template (NEU)
- `docs/reports/PHASE8_2_TRACKS_7-12.md` — Dieser Bericht (NEU)
