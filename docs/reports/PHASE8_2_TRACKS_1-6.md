# Phase 8.2 — Tracks 1–6: Reconciliation & Versand-Preflight

**Erstellt:** 2026-08-26  
**Commit-Basis:** 5019ac4  
**Session:** Phase 8.2 (Tracks 1–6 von 12)

---

## Track 1 — SOURCE OF TRUTH FINAL RECONCILIATION

| Quelle | SHA / Status |
|---|---|
| LOCAL HEAD | `5019ac4` |
| ORIGIN/MAIN | `5019ac4` |
| GitHub API (main) | `5019ac4` |
| Vercel Production | `5019ac4` (deployed 2026-08-26T02:59:35Z) |
| CI Status | `completed / success` (3/3 Workflows) |

**Ergebnis: SYNCHRON.** Kein Commit-Widerspruch. Alle fünf Quellen zeigen denselben HEAD.

### Supabase Migration History

Live-Abfrage per PostgREST (service_role). Die letzten 15 Migrationsdateien im Repo:

```
20261001000001  rollback_mahnqueue_retry_dead_letter
20261001010000  vpkzp_mandantenpaarung
20261002000000  least_privilege_delta_phase4
20261002000002  billing_landesregeln_mandantenzaun
20261003000000  camt_buchungsdublette
20261003000002  dta_dateien_org_scoped_policies
20261003000003  org_fence_fehlende_tabellen
20261004000000  payment_allocation_rueckzahlung
20261005000000  pilot_send_gate
```

**SUPABASE_SCHEMA_STATUS:** `pilot_send_gate` und `pilot_versand_sperre` existieren live (bestätigt per SELECT). Beide Tabellen sind leer (0 Zeilen) — erwarteter Zustand vor dem ersten Pilotversand.

---

## Track 2 — PILOT_SEND_GATE MIGRATION

### Live-Status

| Tabelle | Existiert | Zeilen | RLS |
|---|---|---|---|
| `pilot_send_gate` | JA | 0 | ENABLED |
| `pilot_versand_sperre` | JA | 0 | ENABLED |

### Migration 20261005000000 — Code-Review

**Constraints (korrekt):**
- `betrag_cents > 0` — verhindert Null-/Negativbeträge
- `preflight_status = 'READY_FOR_SEND'` — nur verifizierte Rechnungen bekommen ein Token
- `pilot_send_gate_nicht_beides` — Token ist entweder verbraucht ODER entwertet, nie beides
- `pilot_send_gate_gueltigkeit` — `gueltig_bis > erstellt_am`

**UNIQUE-Teilindizes (Kernriegel):**
- `pilot_send_gate_offen_je_rechnung` — max. 1 offenes Token je Rechnung (`WHERE verbraucht_am IS NULL AND entwertet_am IS NULL`)
- `pilot_send_gate_einmal_verbraucht` — max. 1 verbrauchtes Token je Rechnung (`WHERE verbraucht_am IS NOT NULL`)

**Cross-Tenant-Schutz:**
- `org_fence_pilot_send_gate` — RESTRICTIVE Policy mit `organization_id = current_org_id()`
- `pilot_send_gate_admin` — Admin-only Zugriff
- Gleiche Policies auf `pilot_versand_sperre`
- FK auf `organizations(id)` und `invoices(id)`

**Ergebnis: VERIFIZIERT.** Migration ist live, Constraints korrekt, Doppelversand auf DB-Ebene unmöglich.

---

## Track 3 — INVOICE LOG / SENT STATUS RECONCILIATION

### Live-Daten (3 Rechnungen)

| Rechnung | Status | sent_at | frozen_at | versand_elektronisch | total |
|---|---|---|---|---|---|
| RE-2026-0001 | `sent` | 2026-07-01 | NULL | false | 187 € |
| RE-2026-0002 | `disputed` | 2026-05-05 | NULL | false | 1064 € |
| RE-2026-0003 | `paid` | 2026-04-02 | NULL | false | 650 € |

### Protokollquellen

| Quelle | Zeilen mit Rechnung-Versand |
|---|---|
| `invoice_email_log` | **0** |
| `notification_delivery_log` (rechnung-versand) | **0** |
| `billing_audit_trail` (email_*) | **0** |

### Diagnose

**Die 3 Rechnungen sind Seed-/Testdaten.** Indizien:

1. `sent_at` ist gesetzt, aber `versand_elektronisch = false` — kein E-Mail-Versand hat stattgefunden
2. Kein einziger Protokolleintrag in 3 unabhängigen Quellen
3. `frozen_at = NULL` — Rechnungen wurden nie festgeschrieben (der Versandweg verlangt `frozen_at`)
4. Alle gehören zur Stamm-Organisation `00000000-0000-4000-8000-000460629986`
5. `created_at` aller drei = 2026-07-02 (Masseneinfügung)

**Ergebnis: KEIN WIDERSPRUCH.** Die `sent_at`-Werte stammen aus dem Seed-Script, nicht aus echtem Versand. Es wurde noch nie eine echte Rechnung per E-Mail versendet. Die Null-Zähler in allen Protokolltabellen bestätigen das.

---

## Track 4 — SAFE PILOT CANDIDATE WORKFLOW

### Unversendete Rechnungen

```sql
SELECT ... FROM invoices WHERE sent_at IS NULL AND deleted_at IS NULL
```

**Ergebnis: 0 Zeilen.**

Alle 3 existierenden Rechnungen haben (Seed-)`sent_at`-Werte. Es gibt keine Rechnung, die als Pilot-Kandidat taugt.

### Pilot-Workflow Bereitschaft

`lib/pilot/rechnung-pilot.ts` — **BEREIT.** Der Code ist vollständig:
- 16-Punkte-Preflight mit 3 zusätzlichen Pilot-Sperren (Protokoll-Dublette, Zustellspur-Dublette, Versandsperre)
- Drei Urteile: READY_FOR_SEND / NEEDS_REVIEW / BLOCKED
- Menschenlesbare Textausgabe mit verdeckter E-Mail-Adresse

`lib/pilot/send-gate.ts` — **BEREIT.** Token-System vollständig:
- `erzeugeSendeToken()` führt den Piloten selbst aus (kein UI-Bypass möglich)
- `pruefeSendeToken()` gleicht alle 4 Bindungen ab (Rechnung, Empfänger, Betrag, Mandant)
- `verbraucheSendeToken()` mit atomarem UPDATE (Race-Condition-sicher)
- Standard-Gültigkeit 60 Minuten

`lib/pilot/post-send-verification.ts` — **BEREIT.** 8-Punkte-Nachprüfung:
- Resend-Annahme, Provider-ID, Protokoll, Retry-Dublette, Empfänger/Betreff/Betrag, Audit, sent_at, Cross-Tenant
- Abweichung → automatische P0-Sperre + Entwertung aller offenen Token

### BUSINESS_INPUT_REQUIRED_PILOT_INVOICE

Der User muss eine NEUE Rechnung erzeugen, um den Pilot durchzuführen:

1. **Klient anlegen** mit echter E-Mail-Adresse (an die die Pilot-Rechnung gehen soll)
2. **Leistungsnachweis** erfassen (Datum, Leistungsart, Dauer)
3. **Rechnung erzeugen** und festschreiben (`frozen_at` muss gesetzt werden)
4. Status muss in `['freigegeben', 'offen', 'erstellt', 'festgeschrieben']` sein
5. Dann: Pilot-Preflight über API → Token ausstellen → begleiteter Versand

---

## Track 5 — RESEND / FIRST INVOICE DELIVERY PREFLIGHT

### Versandkette Code-Review

| Prüfpunkt | Status | Detail |
|---|---|---|
| `RESEND_API_KEY` | **GESETZT** (lokal .env.local) | Wert nicht ausgegeben |
| Domain | `alltagsengel.care` | Absender: `Alltagsengel <info@alltagsengel.care>` |
| from/reply-to | `ALLTAGSENGEL_ABSENDER` (Konstante) | Nie ein persönlicher Name |
| PDF-Generierung | `erzeugeRechnungsPaket()` | Lädt in Storage, pflegt invoice_packages |
| Duplikat-Schutz | **4 EBENEN** | sent_at, invoice_email_log, notification_delivery_log, pilot_send_gate UNIQUE-Index |
| Idempotenz-Key | `rechnung:{invoiceId}` an Resend | Bei erneutSenden bewusst ohne Key |
| Timeout | 20s (`RESEND_ZEITLIMIT_MS`) | Zeitüberschreitung → statusCode 408 → wiederholbar |
| Provider-ID-Pflicht | Ja | Ohne `data.id` → `unbestaetigt` Fehler |
| Zustellspur | `notification_delivery_log` | PFLICHT (vorgangArt + vorgangRef) |
| Audit Trail | `logBillingAction` → `billing_audit_trail` | fail-soft nach Versand |
| Post-Send Verification | 8-Punkte-Nachprüfung | Automatische P0-Sperre bei Abweichung |
| One-Time-Gate | `pilot_send_gate` Token | Erst verbrauchen, dann senden |
| Fehlerklassifizierung | `lib/notifications/fehlerklassen.ts` | Dauerhaft vs. vorübergehend |

### Fail-Closed Kette

```
RESEND_API_KEY fehlt?           → uebersprungen (sent_at NICHT gesetzt)
Rechnung nicht festgeschrieben? → uebersprungen
Status nicht versandfähig?      → uebersprungen
Keine E-Mail beim Klienten?     → uebersprungen
Preflight BLOCKED?              → uebersprungen
Resend wirft Fehler?            → fehlgeschlagen (sent_at NICHT gesetzt)
Resend ohne Message-ID?         → fehlgeschlagen
Timeout?                        → fehlgeschlagen (408, wiederholbar)
```

**Ergebnis: VERSANDKETTE VOLLSTÄNDIG UND FAIL-CLOSED.**

### Vercel Production ENV

Über Code-Defaults geprüft (kein Dashboard-Zugang):
- `RESEND_API_KEY` ist in `.env.local` gesetzt. Ob in Vercel Production gesetzt: nicht direkt prüfbar, aber `scripts/verify-resend.mjs` existiert und wurde in Phase 4 erfolgreich ausgeführt (Memory: `resend-domain-dns-verifiziert.md`)
- Domain `alltagsengel.care` DKIM/SPF/DMARC verifiziert (Memory bestätigt)

---

## Track 6 — AUTOMATISCHE VERSAND-FLAGS

### Code-Review: `lib/config/versand-flags.ts`

| Aspekt | Status |
|---|---|
| Default-Werte | **AUS** (fail-closed) — AN ist ausschließlich exakter Wert `'1'` |
| Umgebungstrennung | **JA** — Flag wirkt NUR im Produktionslauf; Preview/Dev brauchen zusätzlich `VERSAND_NICHT_PRODUKTION_ERLAUBT=1` |
| Ungültige Werte | Eigener Befund `aus_ungueltig` mit lautem Protokolleintrag |
| Audit | `versand-flags-audit.ts` hält Schalteränderungen in `billing_audit_trail` fest |

### Lokale ENV-Werte

```
RECHNUNGSVERSAND_AUTOMATISCH:    NOT_SET  → aus_fehlt (korrekt)
MAHNVERSAND_AUTOMATISCH:         NOT_SET  → aus_fehlt (korrekt)
PILOT_ERSTVERSAND_FREIGEGEBEN:   NOT_SET  → keine Freigabe (korrekt)
FIRST_REAL_INVOICE_APPROVED:     false    (einkompiliert, Quelltext)
```

### Pilot-Bypass-Mechanismus

Der Pilot-Pfad (`lib/pilot/send-gate.ts`) umgeht die automatischen Flags **nicht**:
- `erzeugeSendeToken()` prüft `erstversandFreigabe()` → braucht `PILOT_ERSTVERSAND_FREIGEGEBEN=1` ODER `FIRST_REAL_INVOICE_APPROVED=true`
- Das Token gilt für genau EINE Rechnung (UNIQUE-Index)
- Der manuelle Versand (`POST /api/billing/invoices/[id]/versenden`) hängt NICHT an den Auto-Flags — dort steht ein Mensch davor
- Der automatische Versand (Sammelrechnungslauf, Cron) braucht `RECHNUNGSVERSAND_AUTOMATISCH=1` UND Produktionsumgebung

**Ergebnis: FAIL-CLOSED VERIFIZIERT.** Kein Flag ist gesetzt, kein automatischer Versand möglich, Pilot nur nach expliziter ENV-Freigabe.

---

## Zusammenfassung

| Track | Status | Kernbefund |
|---|---|---|
| 1 — Source of Truth | **SYNCHRON** | HEAD=Origin=GitHub=Vercel=5019ac4, CI grün |
| 2 — Pilot Send Gate | **LIVE + VERIFIZIERT** | Tabellen existieren, Constraints korrekt, 0 Zeilen |
| 3 — Invoice Log | **KEIN WIDERSPRUCH** | 3 Seed-Rechnungen, nie echt versendet, alle Protokolle = 0 |
| 4 — Pilot Candidate | **BUSINESS_INPUT_REQUIRED** | 0 unversendete Rechnungen, neuer Klient + Rechnung nötig |
| 5 — Resend Preflight | **VERSANDKETTE KOMPLETT** | 4 Duplikat-Sperren, Timeout, Idempotenz, 8-Punkte-Nachprüfung |
| 6 — Versand-Flags | **FAIL-CLOSED** | Alle Flags AUS, Code-Default AUS, kein automatischer Versand |

### Offene Punkte (kein Codedefekt)

1. **Pilot-Rechnung fehlt:** Der User muss einen echten Klienten mit E-Mail anlegen, eine Rechnung erzeugen und festschreiben, bevor der Pilot laufen kann.
2. **Vercel RESEND_API_KEY:** Nicht direkt prüfbar ob in Production gesetzt. Laut Memory-Eintrag und verify-resend.mjs war es in Phase 4 aktiv.
3. **PILOT_ERSTVERSAND_FREIGEGEBEN:** Muss in Vercel Production auf `1` gesetzt werden, bevor der Pilot starten kann.
